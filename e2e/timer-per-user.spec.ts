import { test, expect, type Page } from "@playwright/test";
import { workspaceWithMember } from "./team";
import { createProject } from "./project-helpers";

const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

/** The MCP transport answers over SSE frames; pull the JSON-RPC body out. */
function parseRpc(text: string): Record<string, unknown> {
  const line = text
    .split("\n")
    .map((l) => l.replace(/^data:\s*/, "").trim())
    .find((l) => l.startsWith("{"));
  if (!line) throw new Error(`No JSON-RPC payload in response: ${text.slice(0, 200)}`);
  return JSON.parse(line);
}

async function startTimer(page: Page, description: string, projectId: string) {
  const res = await page.request.post("/api/time_entries", {
    data: { description, projectId, start: new Date().toISOString() },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string };
}

type Current = { id: string; stop: string | null; description: string } | null;

async function currentTimer(page: Page): Promise<Current> {
  return (await (await page.request.get("/api/time_entries/current")).json()) as Current;
}

/** The shared workspace plus one project in it, which every entry needs (D3). */
async function teamWithProject(browser: import("@playwright/test").Browser) {
  const team = await workspaceWithMember(browser);
  const project = await createProject(team.owner);
  return { ...team, projectId: project.id };
}

test.describe("per-user timers", () => {
  test("two members run timers at the same time and each sees only their own", async ({
    browser,
  }) => {
    const { owner, member, projectId } = await teamWithProject(browser);
    const ownerEntry = await startTimer(owner, "Owner focus", projectId);
    const memberEntry = await startTimer(member, "Member focus", projectId);

    const ownerCurrent = await currentTimer(owner);
    expect(ownerCurrent?.id).toBe(ownerEntry.id);
    expect(ownerCurrent?.stop).toBeNull();
    expect((await currentTimer(member))?.id).toBe(memberEntry.id);

    const running = await (await owner.request.get("/api/time_entries?running=true")).json();
    expect(running.map((e: { id: string }) => e.id)).toEqual([ownerEntry.id]);
  });

  test("nobody stops, edits or deletes another person's running timer, the workspace owner included", async ({
    browser,
  }) => {
    const { owner, member, projectId } = await teamWithProject(browser);
    const ownerEntry = await startTimer(owner, "Owner timer", projectId);
    const memberEntry = await startTimer(member, "Member timer", projectId);

    expect((await member.request.patch(`/api/time_entries/${ownerEntry.id}/stop`)).status()).toBe(403);
    expect((await owner.request.patch(`/api/time_entries/${memberEntry.id}/stop`)).status()).toBe(403);
    expect(
      (
        await owner.request.put(`/api/time_entries/${memberEntry.id}`, {
          data: { stop: new Date().toISOString() },
        })
      ).status()
    ).toBe(403);
    expect((await owner.request.delete(`/api/time_entries/${memberEntry.id}`)).status()).toBe(403);
    expect(
      (
        await owner.request.patch("/api/time_entries/bulk", {
          data: { ids: [memberEntry.id], patch: { description: "Hijacked" } },
        })
      ).status()
    ).toBe(403);

    const untouched = await currentTimer(member);
    expect(untouched?.id).toBe(memberEntry.id);
    expect(untouched?.stop).toBeNull();
    expect(untouched?.description).toBe("Member timer");

    // Each person still stops their own.
    const stopped = await member.request.patch(`/api/time_entries/${memberEntry.id}/stop`);
    expect(stopped.ok()).toBeTruthy();
    expect((await stopped.json()).stop).not.toBeNull();
  });

  test("the MCP catalog has no timer-control tools: timers are app-only", async ({ browser }) => {
    const { member, memberHeaders } = await teamWithProject(browser);

    const created = await member.request.post("/api/keys", {
      headers: memberHeaders,
      data: { name: "e2e member", scope: "read_write" },
    });
    expect(created.status()).toBe(201);
    const { plaintext } = (await created.json()) as { plaintext: string };
    const auth = { ...MCP_HEADERS, Authorization: `Bearer ${plaintext}` };

    const init = await member.request.post("/mcp", {
      headers: auth,
      data: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "e2e", version: "1" },
        },
      },
    });
    expect(init.ok()).toBeTruthy();

    const list = await member.request.post("/mcp", {
      headers: auth,
      data: { jsonrpc: "2.0", id: 2, method: "tools/list" },
    });
    expect(list.ok()).toBeTruthy();
    const names = (parseRpc(await list.text()).result as { tools: { name: string }[] }).tools.map(
      (t) => t.name
    );
    // Decision 2026-09-18: timers are app-only; logging/editing entries covers the AI's needs.
    expect(names).not.toContain("start_timer");
    expect(names).not.toContain("stop_timer");
    expect(names).not.toContain("start_favorite");
    // The read-only running-timer lookup stays.
    expect(names).toContain("get_running_timer");
  });

  test("a teammate's timer never shows up on your screen", async ({ browser }) => {
    const { owner, member, projectId } = await teamWithProject(browser);
    const stopButton = owner.getByRole("button", { name: "Stop timer", exact: true });
    await expect(owner.getByRole("button", { name: "Start timer", exact: true })).toBeVisible();

    await startTimer(member, "Member elsewhere", projectId);
    // The socket delivered teammates' timers within a second before; give it that long and more.
    await owner.waitForTimeout(2000);
    await expect(stopButton).toHaveCount(0);

    // Proves the socket is alive: the owner's own timer does arrive.
    await startTimer(owner, "Owner here", projectId);
    await expect(stopButton).toBeVisible();
  });

  test("each attendee tracks their own copy of the same meeting", async ({ browser }) => {
    const { owner, member, projectId } = await teamWithProject(browser);
    const body = {
      calendarEventId: `shared-meeting-${Date.now()}`,
      title: "Weekly sync",
      start: new Date(Date.now() - 2 * 3_600_000).toISOString(),
      stop: new Date(Date.now() - 3_600_000).toISOString(),
      projectId,
    };

    const ownerTrack = await (await owner.request.post("/api/assistant/track-event", { data: body })).json();
    const memberTrack = await (await member.request.post("/api/assistant/track-event", { data: body })).json();
    expect(ownerTrack.created).toBe(true);
    expect(memberTrack.created).toBe(true);

    const again = await (await member.request.post("/api/assistant/track-event", { data: body })).json();
    expect(again.created).toBe(false);
  });

  test("a recurring template belongs to its author alone", async ({ browser }) => {
    const { owner, member, projectId } = await teamWithProject(browser);
    const created = await owner.request.post("/api/recurring", {
      data: {
        description: "Standup",
        projectId,
        durationSeconds: 900,
        daysOfWeek: [1, 2, 3, 4, 5],
        timeUtcMinutes: 720,
      },
    });
    expect(created.status()).toBe(201);
    const template = (await created.json()) as { id: string };

    expect(await (await member.request.get("/api/recurring")).json()).toEqual([]);
    const hijack = await member.request.put(`/api/recurring/${template.id}`, {
      data: { description: "Hijacked" },
    });
    expect(hijack.status()).toBe(404);
    await member.request.delete(`/api/recurring/${template.id}`);

    const ownerTemplates = (await (await owner.request.get("/api/recurring")).json()) as {
      id: string;
      description: string;
    }[];
    expect(ownerTemplates.map((t) => t.id)).toEqual([template.id]);
    expect(ownerTemplates[0].description).toBe("Standup");
  });

  test("teammates learn that entries changed, never what changed", async ({ browser }) => {
    const { owner, member, projectId } = await teamWithProject(browser);
    type SocketEvent = { event: string; data: unknown };

    // A raw observer socket on the owner's session, opened the same way as websocket-close.spec.ts.
    await owner.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const w = window as unknown as { socketEvents: SocketEvent[] };
          w.socketEvents = [];
          const proto = location.protocol === "https:" ? "wss:" : "ws:";
          const ws = new WebSocket(`${proto}//${location.host}/api/ws`);
          ws.onmessage = (e) => w.socketEvents.push(JSON.parse(e.data));
          ws.onopen = () => resolve();
          ws.onerror = () => reject(new Error("observer socket errored"));
        })
    );

    const created = await member.request.post("/api/time_entries", {
      data: {
        description: "Confidential member work",
        projectId,
        start: new Date(Date.now() - 3_600_000).toISOString(),
        stop: new Date(Date.now() - 1_800_000).toISOString(),
      },
    });
    expect(created.status()).toBe(201);

    const readEvents = () =>
      owner.evaluate(() => (window as unknown as { socketEvents: SocketEvent[] }).socketEvents);
    await expect
      .poll(async () => (await readEvents()).filter((m) => m.event === "entries:changed").length)
      .toBeGreaterThan(0);
    const events = await readEvents();
    expect(JSON.stringify(events)).not.toContain("Confidential member work");
    expect(events.filter((m) => m.event === "entries:changed").every((m) => m.data === null)).toBe(true);
  });
});
