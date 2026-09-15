import { readFileSync } from "node:fs";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { signUp } from "./auth";
import { workspaceWithMember } from "./team";
import { E2E_PROJECT, createProject } from "./project-helpers";

// A member's hours are theirs alone; the reads below are forged, because the server is the boundary.

const RANGE = "since=2026-05-01T00:00:00.000Z&until=2026-06-01T00:00:00.000Z";

async function logTime(page: Page, projectId: string, description: string, start: string, minutes: number) {
  const res = await page.request.post("/api/time_entries", {
    data: {
      description,
      projectId,
      start,
      stop: new Date(Date.parse(start) + minutes * 60_000).toISOString(),
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as { id: string };
}

async function whoAmI(page: Page) {
  return (await (await page.request.get("/api/me")).json()) as { userId: string; canManage: boolean };
}

/** The owner logs an hour and the member half an hour, on the same project, in May 2026. */
async function teamWithHours(browser: Browser) {
  const team = await workspaceWithMember(browser);
  const project = await createProject(team.owner, { billable: true });
  const ownerEntry = await logTime(team.owner, project.id, "Owner confidential", "2026-05-04T09:00:00.000Z", 60);
  await logTime(team.member, project.id, "Member work", "2026-05-04T11:00:00.000Z", 30);
  return { ...team, project, ownerEntry };
}

type Named = { id: string; name: string; totalSeconds: number };

test.describe("reports per person", () => {
  test("a member's reads cover only their own hours, whatever they ask for", async ({ browser }) => {
    const { owner, member, project, ownerEntry } = await teamWithHours(browser);
    const ownerId = (await whoAmI(owner)).userId;
    expect((await whoAmI(member)).canManage).toBe(false);

    // Asking for the owner's hours by id still returns only the member's own.
    const summary = await (
      await member.request.get(`/api/reports/summary?${RANGE}&userIds=${ownerId}`)
    ).json();
    expect(summary.totalSeconds).toBe(1800);

    const grouped = await (await member.request.get(`/api/reports/grouped?${RANGE}&group=user`)).json();
    expect(grouped.groups.map((g: Named) => g.totalSeconds)).toEqual([1800]);

    const detailed = await (await member.request.get(`/api/reports/detailed?${RANGE}`)).json();
    expect(JSON.stringify(detailed)).not.toContain("Owner confidential");

    const list = await (await member.request.get(`/api/time_entries?${RANGE}`)).json();
    expect(list.map((e: { description: string }) => e.description)).toEqual(["Member work"]);
    expect((await member.request.get(`/api/time_entries/${ownerEntry.id}`)).status()).toBe(404);

    const stats = await (await member.request.get(`/api/clients/stats?${RANGE}`)).json();
    expect(stats.map((s: { totalSeconds: number }) => s.totalSeconds)).toEqual([1800]);

    // Budgets are team numbers: blanked for a member, intact for the owner.
    const budget = await owner.request.put(`/api/projects/${project.id}`, {
      data: { estimatedHours: 10 },
    });
    expect(budget.ok(), await budget.text()).toBeTruthy();
    const memberView = (await (await member.request.get("/api/projects")).json()).find(
      (p: { id: string }) => p.id === project.id
    );
    expect(memberView.trackedSeconds).toBe(1800);
    expect(memberView.estimatedHours).toBeNull();
    expect(await (await member.request.get("/api/projects/pacing")).json()).toEqual([]);

    const ownerView = (await (await owner.request.get("/api/projects")).json()).find(
      (p: { id: string }) => p.id === project.id
    );
    expect(ownerView.trackedSeconds).toBe(5400);
    expect(ownerView.estimatedHours).toBe(10);
  });

  test("an owner splits the team's hours by person and sees them in the Timer too", async ({
    browser,
  }) => {
    const { owner, member } = await teamWithHours(browser);
    const memberId = (await whoAmI(member)).userId;
    expect((await whoAmI(owner)).canManage).toBe(true);

    const all = await (await owner.request.get(`/api/reports/summary?${RANGE}`)).json();
    expect(all.totalSeconds).toBe(5400);
    const onlyMember = await (
      await owner.request.get(`/api/reports/summary?${RANGE}&userIds=${memberId}`)
    ).json();
    expect(onlyMember.totalSeconds).toBe(1800);

    const grouped = await (await owner.request.get(`/api/reports/grouped?${RANGE}&group=user`)).json();
    const byPerson = Object.fromEntries(grouped.groups.map((g: Named) => [g.name, g.totalSeconds]));
    expect(byPerson).toEqual({ "Test User": 3600, Outsider: 1800 });

    // The Timer list follows the same rule as the reports: the whole workspace
    // for an owner or admin, so a teammate's hours can be reviewed and corrected.
    const list = await (await owner.request.get(`/api/time_entries?${RANGE}`)).json();
    expect(list.map((e: { description: string }) => e.description).sort()).toEqual([
      "Member work",
      "Owner confidential",
    ]);
  });

  test("screens hide what a member can't do", async ({ browser }) => {
    const { owner, member } = await teamWithHours(browser);

    await member.goto("/projects");
    await expect(member.getByText("E2E Project").first()).toBeVisible();
    await expect(member.getByRole("button", { name: "Project actions" })).toHaveCount(0);
    await owner.goto("/projects");
    await expect(owner.getByRole("button", { name: "Project actions" })).toBeVisible();

    await member.goto("/reports");
    await member.getByRole("button", { name: /^Filters/ }).click();
    await expect(member.getByText("Client", { exact: true }).first()).toBeVisible();
    await expect(member.getByText("Person", { exact: true })).toHaveCount(0);
    await owner.goto("/reports");
    await owner.getByRole("button", { name: /^Filters/ }).click();
    await expect(owner.getByText("Person", { exact: true }).first()).toBeVisible();
  });
});

test("Hide amounts keeps money out of the CSV export", async ({ page }) => {
  await signUp(page);
  const project = await createProject(page, { billable: true });
  const created = await page.request.post("/api/time_entries", {
    data: {
      description: "Client-facing work",
      projectId: project.id,
      start: new Date(Date.now() - 2 * 3_600_000).toISOString(),
      stop: new Date(Date.now() - 3_600_000).toISOString(),
    },
  });
  expect(created.status()).toBe(201);

  await page.goto("/reports");
  // The export writes whatever the detailed query holds, so wait for it to load.
  await expect(page.getByRole("tab", { name: /Detailed/ })).toContainText("1");

  const exportCsv = async () => {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export" }).click();
    await page.getByRole("menuitem", { name: "CSV" }).click();
    return readFileSync(await (await download).path(), "utf8");
  };

  expect((await exportCsv()).split("\n")[0]).toContain("Amount");

  await page.getByRole("switch", { name: "Hide amounts" }).click();
  const hidden = await exportCsv();
  expect(hidden.split("\n")[0]).not.toContain("Amount");
  expect(hidden).toContain("Client-facing work");
});

test("demoting yourself takes the manager-only controls off the screen at once", async ({
  browser,
}) => {
  const { owner, ownerHeaders, member, workspaceId } = await workspaceWithMember(browser);
  await createProject(owner);

  // The member has to be an admin first — an owner can't demote themselves.
  const org = await (
    await owner.request.get(
      `/api/auth/organization/get-full-organization?organizationId=${workspaceId}`
    )
  ).json();
  const memberRow = (org.members as { id: string; role: string }[]).find((m) => m.role === "member");
  const promoted = await owner.request.post("/api/auth/organization/update-member-role", {
    data: { memberId: memberRow!.id, role: "admin", organizationId: workspaceId },
    headers: ownerHeaders,
  });
  expect(promoted.ok(), await promoted.text()).toBeTruthy();

  await member.goto("/projects");
  const rowActions = member.getByRole("button", { name: "Project actions" });
  await expect(rowActions.first()).toBeVisible();

  // Demote self under Settings → Workspace, then walk back without reloading.
  await member.goto("/settings");
  await member.getByRole("tab", { name: /workspace/i }).click();
  await member.getByRole("combobox", { name: /^Role for / }).click();
  await member.getByRole("option", { name: "member" }).click();
  await expect(member.getByText("Role updated")).toBeVisible();

  await member.getByRole("link", { name: "Projects" }).click();
  // Wait for the row itself, or "no actions" would pass while the list is still loading.
  await expect(member.getByText(E2E_PROJECT).first()).toBeVisible();
  await expect(rowActions).toHaveCount(0);
});
