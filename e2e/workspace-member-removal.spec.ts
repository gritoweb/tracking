import { test, expect, type Browser, type Page } from "@playwright/test";
import { signUp } from "./auth";
import { workspaceWithMember, originHeaders } from "./team";
import { createProject } from "./project-helpers";
import type { Task, TaskStatus } from "../src/shared/schemas";

// Leaving or being removed from a workspace drops the person as an assignee and keeps their logged hours.

const RANGE = "since=2026-01-01T00:00:00.000Z&until=2026-02-01T00:00:00.000Z";

async function statuses(page: Page): Promise<TaskStatus[]> {
  return (await page.request.get("/api/task-statuses")).json();
}

function byName(list: TaskStatus[], name: string): TaskStatus {
  const found = list.find((s) => s.name === name);
  if (!found) throw new Error(`status "${name}" not found`);
  return found;
}

async function findTask(page: Page, id: string): Promise<Task> {
  const list = (await (await page.request.get("/api/tasks?includeInactive=true")).json()) as Task[];
  const found = list.find((t) => t.id === id);
  if (!found) throw new Error(`task ${id} not found`);
  return found;
}

async function memberOrgRow(owner: Page, workspaceId: string, email: string) {
  const org = (await (
    await owner.request.get(`/api/auth/organization/get-full-organization?organizationId=${workspaceId}`)
  ).json()) as { members: { userId: string; user: { email: string } }[] };
  const row = org.members.find((m) => m.user.email === email);
  if (!row) throw new Error("member row not found");
  return row;
}

interface Snapshot {
  trackedSeconds: number;
  summaryTotal: number;
  groupedTotals: number[];
  entryCount: number;
}

async function snapshot(owner: Page, taskId: string): Promise<Snapshot> {
  const task = await findTask(owner, taskId);
  const summary = (await (await owner.request.get(`/api/reports/summary?${RANGE}`)).json()) as {
    totalSeconds: number;
  };
  const grouped = (await (await owner.request.get(`/api/reports/grouped?${RANGE}&group=user`)).json()) as {
    groups: { totalSeconds: number }[];
  };
  const entries = (await (await owner.request.get(`/api/time_entries?${RANGE}`)).json()) as unknown[];
  return {
    trackedSeconds: task.trackedSeconds,
    summaryTotal: summary.totalSeconds,
    groupedTotals: grouped.groups.map((g) => g.totalSeconds).sort((a, b) => a - b),
    entryCount: entries.length,
  };
}

async function setUpAssignedTaskWithHours(browser: Browser) {
  const team = await workspaceWithMember(browser);
  const { owner, member, workspaceId, email } = team;
  const project = await createProject(owner, { name: "Task Removal Project" });
  const memberRow = await memberOrgRow(owner, workspaceId, email);

  const created = await owner.request.post("/api/tasks", {
    data: { name: "Ship the release", projectId: project.id },
  });
  const task = (await created.json()) as Task;

  const assigned = await owner.request.put(`/api/tasks/${task.id}`, {
    data: { assigneeIds: [memberRow.userId] },
  });
  expect(assigned.ok(), await assigned.text()).toBeTruthy();

  const entry = await member.request.post("/api/time_entries", {
    data: {
      description: "Removal-hours entry",
      projectId: project.id,
      taskId: task.id,
      start: "2026-01-05T09:00:00.000Z",
      stop: "2026-01-05T10:00:00.000Z",
    },
  });
  expect(entry.status(), await entry.text()).toBe(201);

  return { browser, project, task, memberRow, ...team };
}

// GET /api/notifications is scoped by user_id only, so a second workspace keeps M's session usable after removal.
async function parkInSecondWorkspace(browser: Browser, member: Page, memberEmail: string, memberHeaders: Record<string, string>) {
  const parkOwner = await (await browser.newContext()).newPage();
  await signUp(parkOwner);
  const parkHeaders = await originHeaders(parkOwner);
  const orgs = (await (await parkOwner.request.get("/api/auth/organization/list")).json()) as { id: string }[];

  const invite = await parkOwner.request.post("/api/auth/organization/invite-member", {
    data: { email: memberEmail, role: "member", organizationId: orgs[0].id },
    headers: parkHeaders,
  });
  expect(invite.ok(), await invite.text()).toBeTruthy();
  const invitation = (await invite.json()) as { id: string };

  const accepted = await member.request.post("/api/auth/organization/accept-invitation", {
    data: { invitationId: invitation.id },
    headers: memberHeaders,
  });
  expect(accepted.ok(), await accepted.text()).toBeTruthy();
}

async function assertAssigneeGoneHoursIntact(
  owner: Page,
  taskId: string,
  taskName: string,
  before: Snapshot
) {
  const taskAfter = await findTask(owner, taskId);
  expect(taskAfter.assignees).toEqual([]);
  expect(await snapshot(owner, taskId)).toEqual(before);

  const consoleErrors: string[] = [];
  owner.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  owner.on("pageerror", (err) => consoleErrors.push(String(err)));

  await owner.goto("/tasks");
  await owner.getByRole("radio", { name: "Board" }).click();
  await owner.getByText(taskName).click();
  const panel = owner.getByRole("dialog", { name: taskName });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Outsider")).toHaveCount(0);
  await owner.keyboard.press("Escape");
  expect(consoleErrors).toEqual([]);
}

test.describe("workspace member removal", () => {
  test("removed by the owner: assignee drops, hours stay, no notification for the removed member", async ({
    browser,
  }) => {
    const setup = await setUpAssignedTaskWithHours(browser);
    const { owner, ownerHeaders, member, memberHeaders, workspaceId, email, task } = setup;

    await parkInSecondWorkspace(browser, member, email, memberHeaders);

    const live = await statuses(owner);
    const inProgress = byName(live, "In progress");
    const movedWhileMember = await owner.request.patch(`/api/tasks/${task.id}/move`, {
      data: { statusId: inProgress.id, boardOrder: 1 },
    });
    expect(movedWhileMember.ok(), await movedWhileMember.text()).toBeTruthy();
    await expect
      .poll(
        async () =>
          (await (await member.request.get("/api/notifications")).json()).unreadCount as number,
        { timeout: 8000 }
      )
      .toBeGreaterThan(0);
    await member.request.patch("/api/notifications/read-all");

    const before = await snapshot(owner, task.id);
    expect(before.trackedSeconds).toBe(3600);

    const removed = await owner.request.post("/api/auth/organization/remove-member", {
      data: { memberIdOrEmail: email, organizationId: workspaceId },
      headers: ownerHeaders,
    });
    expect(removed.ok(), await removed.text()).toBeTruthy();

    await assertAssigneeGoneHoursIntact(owner, task.id, "Ship the release", before);

    const closed = byName(live, "Closed");
    const movedAfterRemoval = await owner.request.patch(`/api/tasks/${task.id}/move`, {
      data: { statusId: closed.id, boardOrder: 1 },
    });
    expect(movedAfterRemoval.ok(), await movedAfterRemoval.text()).toBeTruthy();
    // No poll target here: proving an absence, so give the fire-and-forget notify path the same budget as the positive check above.
    await owner.waitForTimeout(2000);
    const notificationsAfter = (await (await member.request.get("/api/notifications")).json()) as {
      unreadCount: number;
    };
    expect(notificationsAfter.unreadCount).toBe(0);

    await owner.context().close();
    await member.context().close();
  });

  test("leaving voluntarily: assignee drops and hours stay", async ({ browser }) => {
    const setup = await setUpAssignedTaskWithHours(browser);
    const { owner, member, memberHeaders, workspaceId, task } = setup;

    const before = await snapshot(owner, task.id);
    expect(before.trackedSeconds).toBe(3600);

    const left = await member.request.post("/api/auth/organization/leave", {
      data: { organizationId: workspaceId },
      headers: memberHeaders,
    });
    expect(left.ok(), await left.text()).toBeTruthy();

    await assertAssigneeGoneHoursIntact(owner, task.id, "Ship the release", before);

    await owner.context().close();
    await member.context().close();
  });
});
