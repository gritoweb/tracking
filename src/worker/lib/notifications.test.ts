import { describe, expect, it } from "vitest";
import { notificationExcerpt, notifyNewAssignees, notifyUser, pruneNotifications } from "./notifications";
import { createD1Stub, type D1StubHandlers } from "../../test/d1-stub";

function fakeNotificationRoom() {
  return {
    idFromName: (name: string) => name,
    get: () => ({ fetch: async () => new Response(JSON.stringify({ sent: 0 })) }),
  };
}

function makeEnv(handlers: D1StubHandlers = {}) {
  const { db, calls } = createD1Stub(handlers);
  const env = {
    DB: db,
    NOTIFICATION_ROOM: fakeNotificationRoom(),
  } as unknown as Env;
  return { env, calls };
}

describe("notificationExcerpt", () => {
  it("leaves a short body untouched", () => {
    expect(notificationExcerpt("Now in Done")).toBe("Now in Done");
  });

  it("truncates anything past 140 characters and marks the cut", () => {
    const long = "x".repeat(200);
    const result = notificationExcerpt(long);
    expect(result).toHaveLength(140);
    expect(result.endsWith("…")).toBe(true);
  });

  it("trims surrounding whitespace before measuring", () => {
    expect(notificationExcerpt("  hi  ")).toBe("hi");
  });
});

describe("notifyUser", () => {
  it("stores only a 140-character excerpt of a long comment, never the full body", () => {
    const { env, calls } = makeEnv({ first: () => ({ id: "n1", type: "task_mention", title: "t", body: "x", link: null, is_read: 0, created_at: "now" }) });
    const fullComment = "Client feedback: ".concat("please rework this section entirely — ".repeat(20));
    return notifyUser(env, "workspace-1", "user-1", {
      type: "task_mention",
      title: "Someone mentioned you",
      body: `Task name: ${fullComment}`,
    }).then(() => {
      const insert = calls.find((c) => c.sql.includes("INSERT INTO notifications"));
      const storedBody = insert?.params[5] as string;
      expect(storedBody.length).toBeLessThanOrEqual(140);
      expect(fullComment.length).toBeGreaterThan(140);
    });
  });
});

describe("notifyNewAssignees — cross-tenant guard (P0-3)", () => {
  it("never writes a notification for an id that isn't currently a member of this workspace", async () => {
    // The membership check returns nobody — simulates a user id from a different workspace.
    const { env, calls } = makeEnv({ all: () => ({ results: [] }) });
    await notifyNewAssignees(env, "workspace-1", "task-1", "Task", "actor-1", "Actor", ["stranger-from-another-workspace"]);
    expect(calls.some((c) => c.sql.includes("INSERT INTO notifications"))).toBe(false);
  });

  it("still notifies a candidate who is a genuine current member", async () => {
    const { env, calls } = makeEnv({
      all: () => ({ results: [{ userId: "member-1" }] }),
      first: () => ({ id: "n1", type: "task_assigned", title: "t", body: "b", link: null, is_read: 0, created_at: "now" }),
    });
    await notifyNewAssignees(env, "workspace-1", "task-1", "Task", "actor-1", "Actor", ["member-1"]);
    expect(calls.some((c) => c.sql.includes("INSERT INTO notifications") && c.params.includes("member-1"))).toBe(true);
  });
});

describe("pruneNotifications", () => {
  it("deletes rows older than the 90-day retention window", async () => {
    const { env, calls } = makeEnv({ run: () => ({ success: true }) });
    await pruneNotifications(env);
    const del = calls.find((c) => c.sql.includes("DELETE FROM notifications"));
    expect(del?.sql).toContain("created_at <");
    expect(del?.params).toEqual(["-90 days"]);
  });

  it("swallows a database failure rather than throwing", async () => {
    const { db } = createD1Stub({
      run: () => { throw new Error("D1 unavailable"); },
    });
    const env = { DB: db } as unknown as Env;
    await expect(pruneNotifications(env)).resolves.toBeUndefined();
  });
});
