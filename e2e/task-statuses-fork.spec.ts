import { test, expect } from "@playwright/test";
import { signUp } from "./auth";
import { createProject } from "./project-helpers";

// Per-project status override on top of the workspace's global default (D4 follow-up):
// a project reads the global set until it's customized, at which point it forks its own
// copy — the global set, and every other project, stay untouched.

async function statuses(page: import("@playwright/test").Page, projectId?: string) {
  const url = projectId ? `/api/task-statuses?projectId=${projectId}` : "/api/task-statuses";
  return (await page.request.get(url)).json() as Promise<
    { id: string; name: string; color: string; projectId: string | null }[]
  >;
}

test("a project reads the global set until it forks its own, then only that project changes", async ({
  page,
}) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;
  const project = await createProject(page, { name: "ERP Migration", color: "#e11d48" });
  const other = await createProject(page, { name: "Website Redesign", color: "#2563eb" });

  const global = await statuses(page);
  expect(global.every((s) => s.projectId === null)).toBe(true);

  // Unforked, a project's own scoped list is just the global set reflected back.
  const beforeFork = await statuses(page, project.id);
  expect(beforeFork.map((s) => s.name)).toEqual(global.map((s) => s.name));
  expect(beforeFork.every((s) => s.projectId === null)).toBe(true);

  const forked = await (
    await page.request.post("/api/task-statuses/fork", {
      data: { projectId: project.id },
      headers: { origin },
    })
  ).json();
  expect(forked.every((s: { projectId: string }) => s.projectId === project.id)).toBe(true);
  expect(forked.map((s: { name: string }) => s.name)).toEqual(global.map((s) => s.name));

  // Forking again is a no-op — same rows back, not a second copy.
  const refork = await (
    await page.request.post("/api/task-statuses/fork", {
      data: { projectId: project.id },
      headers: { origin },
    })
  ).json();
  expect(refork.map((s: { id: string }) => s.id)).toEqual(forked.map((s: { id: string }) => s.id));

  const backlog = forked.find((s: { name: string }) => s.name === "Backlog");
  const renamed = await page.request.put(`/api/task-statuses/${backlog.id}`, {
    data: { name: "Pendente" },
    headers: { origin },
  });
  expect(renamed.ok()).toBeTruthy();

  // The fork changed; the global set and the other, still-unforked project didn't.
  expect((await statuses(page, project.id)).map((s) => s.name)).toContain("Pendente");
  expect((await statuses(page)).map((s) => s.name)).not.toContain("Pendente");
  expect((await statuses(page, other.id)).map((s) => s.name)).not.toContain("Pendente");
});

test("renaming a column from a project's board forks it there without touching other projects (UI)", async ({
  page,
}) => {
  await signUp(page);
  const project = await createProject(page, { name: "ERP Migration", color: "#e11d48" });
  const other = await createProject(page, { name: "Website Redesign", color: "#2563eb", clientId: project.clientId });

  await page.goto("/tasks");
  await page.getByRole("radio", { name: "Board" }).click();
  // Scope the board to just this project — the rail's own filter.
  await page.getByRole("button", { name: /^ERP Migration \d+$/ }).click();

  await page.getByRole("button", { name: "Configure Backlog" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByLabel("Status name").fill("Pendente");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("region", { name: "Pendente" })).toBeVisible();

  // Global default and the sibling project's own (still unforked) board are untouched.
  const global = await statuses(page);
  expect(global.map((s) => s.name)).toContain("Backlog");
  const otherScoped = await statuses(page, other.id);
  expect(otherScoped.map((s) => s.name)).toContain("Backlog");
  expect(otherScoped.every((s) => s.projectId === null)).toBe(true);
});

test("a new status with no colour gets the next one not already in that set", async ({ page }) => {
  await signUp(page);
  const origin = new URL(page.url()).origin;
  const project = await createProject(page, { name: "ERP Migration", color: "#e11d48" });
  await page.request.post("/api/task-statuses/fork", {
    data: { projectId: project.id },
    headers: { origin },
  });

  const before = await statuses(page, project.id);
  const created = await (
    await page.request.post("/api/task-statuses", {
      data: { name: "QA", category: "active", projectId: project.id },
      headers: { origin },
    })
  ).json();

  expect(created.color).toBeTruthy();
  expect(before.map((s) => s.color)).not.toContain(created.color);
});
