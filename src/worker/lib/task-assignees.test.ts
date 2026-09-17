import { describe, expect, it } from "vitest";
import { removeMemberFromTasks } from "./task-assignees";
import { createD1Stub } from "../../test/d1-stub";

describe("removeMemberFromTasks (P0-4: notifications don't outlive membership)", () => {
  it("deletes the user's notifications for this workspace alongside their task assignments", async () => {
    const { db, calls } = createD1Stub({ run: () => ({ meta: { changes: 2 } }) });
    const env = { DB: db } as unknown as Env;

    await removeMemberFromTasks(env, "workspace-1", "user-1");

    const notificationDelete = calls.find((c) => c.sql.includes("DELETE FROM notifications"));
    expect(notificationDelete?.params).toEqual(["workspace-1", "user-1"]);
  });

  it("still deletes notifications for a user who had no task assignments left", async () => {
    // A mention alone can create a notification without ever assigning the task.
    const { db, calls } = createD1Stub({ run: () => ({ meta: { changes: 0 } }) });
    const env = { DB: db } as unknown as Env;

    await removeMemberFromTasks(env, "workspace-1", "user-1");

    expect(calls.some((c) => c.sql.includes("DELETE FROM notifications"))).toBe(true);
  });
});
