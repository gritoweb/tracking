import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./auth";
import { originHeaders, workspaceWithMember } from "./team";
import { createClient, createProject } from "./project-helpers";

// Every entry belongs to a project and every project to a client (D3), on every way in —
// and a member creates clients and projects but never changes them.

const START = "2026-05-04T09:00:00.000Z";
const STOP = "2026-05-04T10:00:00.000Z";
const RANGE = "since=2026-05-01T00:00:00.000Z&until=2026-06-01T00:00:00.000Z";

const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

/** A read_write MCP key for the signed-in person; the caller returns the tool's text output. */
async function mcpTools(page: Page, headers: Record<string, string>) {
  const created = await page.request.post("/api/keys", {
    headers,
    data: { name: "e2e", scope: "read_write" },
  });
  expect(created.status()).toBe(201);
  const { plaintext } = (await created.json()) as { plaintext: string };
  const auth = { ...MCP_HEADERS, Authorization: `Bearer ${plaintext}` };

  let id = 1;
  const rpc = async (method: string, params: Record<string, unknown>) => {
    const res = await page.request.post("/mcp", {
      headers: auth,
      data: { jsonrpc: "2.0", id: id++, method, params },
    });
    expect(res.ok()).toBeTruthy();
    const line = (await res.text())
      .split("\n")
      .map((l) => l.replace(/^data:\s*/, "").trim())
      .find((l) => l.startsWith("{"));
    return JSON.parse(line ?? "{}") as {
      result?: { content?: { text?: string }[] };
      error?: { message: string };
    };
  };

  await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "e2e", version: "1" },
  });
  return async (name: string, args: Record<string, unknown>) => {
    const body = await rpc("tools/call", { name, arguments: args });
    return body.result?.content?.[0]?.text ?? body.error?.message ?? "";
  };
}

test("the API refuses an entry without a project and a project without a client", async ({ page }) => {
  await signUp(page);
  const logEntry = (extra: Record<string, unknown>) =>
    page.request.post("/api/time_entries", {
      data: { description: "Work", start: START, stop: STOP, ...extra },
    });

  expect((await logEntry({})).status()).toBe(400);
  expect(
    (await page.request.post("/api/projects", { data: { name: "Orphan", color: "#2563eb" } })).status()
  ).toBe(400);

  const formerClient = await createClient(page, "Former client");
  expect((await page.request.delete(`/api/clients/${formerClient.id}`)).ok()).toBeTruthy();
  expect(
    (
      await page.request.post("/api/projects", {
        data: { name: "On an archived client", color: "#2563eb", clientId: formerClient.id },
      })
    ).status()
  ).toBe(400);

  const project = await createProject(page);
  const wrapped = await createProject(page, { name: "Wrapped up", clientId: project.clientId });
  expect((await page.request.delete(`/api/projects/${wrapped.id}`)).ok()).toBeTruthy();
  expect((await logEntry({ projectId: wrapped.id })).status()).toBe(400);
  expect((await logEntry({ projectId: "forged-project-id" })).status()).toBe(400);

  const entry = await logEntry({ projectId: project.id });
  expect(entry.status()).toBe(201);
  const { id } = (await entry.json()) as { id: string };
  expect(
    (await page.request.put(`/api/time_entries/${id}`, { data: { projectId: null } })).status()
  ).toBe(400);
  expect(
    (
      await page.request.patch("/api/time_entries/bulk", {
        data: { ids: [id], patch: { projectId: null } },
      })
    ).status()
  ).toBe(400);
  expect((await (await page.request.get(`/api/time_entries/${id}`)).json()).projectId).toBe(project.id);

  expect(
    (
      await page.request.post("/api/recurring", {
        data: { description: "Standup", durationSeconds: 900, daysOfWeek: [1], timeUtcMinutes: 600 },
      })
    ).status()
  ).toBe(400);
});

test("a draft can't carry a forged or archived project into the timesheet", async ({ page }) => {
  await signUp(page);
  const base = Math.min(new Date().getHours() - 4, 9);
  test.skip(base < 1, "Too early in the local day to seed a past gap");

  const project = await createProject(page);
  const atLocalHour = (hour: number) => {
    const d = new Date();
    d.setHours(Math.floor(hour), (hour % 1) * 60, 0, 0);
    return d.toISOString();
  };
  // Two entries with a gap between them, so drafting proposes that gap on the same project.
  for (const [startHour, stopHour] of [
    [base, base + 1],
    [base + 2.5, base + 3.5],
  ]) {
    const seeded = await page.request.post("/api/time_entries", {
      data: { description: `seed ${startHour}`, projectId: project.id, start: atLocalHour(startHour), stop: atLocalHour(stopHour) },
    });
    expect(seeded.status()).toBe(201);
  }

  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const generated = await page.request.post("/api/drafts/generate", {
    data: { date, timezoneOffsetMinutes: now.getTimezoneOffset() },
  });
  expect(generated.ok()).toBeTruthy();
  const ids = ((await generated.json()) as { drafts: { id: string }[] }).drafts.map((d) => d.id);
  expect(ids.length).toBeGreaterThan(0);

  expect(
    (await page.request.patch(`/api/drafts/${ids[0]}`, { data: { projectId: "forged-project-id" } })).status()
  ).toBe(400);

  // The project is archived after drafting: confirming must refuse rather than log time onto it.
  expect((await page.request.delete(`/api/projects/${project.id}`)).ok()).toBeTruthy();
  const confirmed = await page.request.post("/api/drafts/confirm", { data: { ids } });
  expect(confirmed.status()).toBe(400);
  expect(await (await page.request.get(`/api/drafts?date=${date}`)).json()).toHaveLength(ids.length);
});

test("MCP: a member's key needs a project to log and reads only their own hours", async ({
  browser,
}) => {
  const { owner, member, memberHeaders } = await workspaceWithMember(browser);
  const project = await createProject(owner);
  const budget = await owner.request.put(`/api/projects/${project.id}`, { data: { estimatedHours: 10 } });
  expect(budget.ok()).toBeTruthy();
  const ownerEntry = await owner.request.post("/api/time_entries", {
    data: { description: "Owner confidential", projectId: project.id, start: START, stop: STOP },
  });
  expect(ownerEntry.status()).toBe(201);

  const call = await mcpTools(member, memberHeaders);

  // Without a real, active project nothing is written.
  await call("start_timer", { description: "No project" });
  const later = { start: "2026-05-04T11:00:00.000Z", stop: "2026-05-04T11:30:00.000Z" };
  await call("log_time", { description: "No project", ...later });
  await call("log_time", { description: "Forged project", ...later, projectId: "forged-project-id" });
  expect(await (await member.request.get("/api/time_entries/current")).json()).toBeNull();
  expect(await (await member.request.get(`/api/time_entries?${RANGE}`)).json()).toEqual([]);

  expect(await call("log_time", { description: "Member via MCP", ...later, projectId: project.id })).toContain(
    "Logged 30 minutes"
  );

  const listed = await call("list_time_entries", { since: "2026-05-01", until: "2026-05-31" });
  expect(listed).toContain("Member via MCP");
  expect(listed).not.toContain("Owner confidential");

  const summary = JSON.parse(
    await call("get_time_summary", { since: "2026-05-01", until: "2026-05-31" })
  ) as { totalHours: number };
  expect(summary.totalHours).toBe(0.5);

  expect(await call("get_project_pacing", {})).toContain("owners and admins only");
  const projects = JSON.parse(await call("list_projects", {})) as { budgetHours: number | null }[];
  expect(projects.every((p) => p.budgetHours === null)).toBe(true);

  // Rates and budgets stay with owners and admins; a client is still required.
  await call("create_project", {
    name: "Member project",
    color: "#2563eb",
    clientId: project.clientId,
    billable: true,
    rate: 250,
    estimatedHours: 99,
  });
  await call("create_project", { name: "Clientless", color: "#2563eb" });
  const all = (await (await owner.request.get("/api/projects")).json()) as {
    name: string;
    rate: number | null;
    estimatedHours: number | null;
  }[];
  const created = all.find((p) => p.name === "Member project");
  expect(created).toBeTruthy();
  expect(created?.rate).toBeNull();
  expect(created?.estimatedHours).toBeNull();
  expect(all.some((p) => p.name === "Clientless")).toBe(false);
});

test("a member creates clients and projects, and only owners and admins change them", async ({
  browser,
}) => {
  const { owner, member } = await workspaceWithMember(browser);
  const project = await createProject(owner);

  const memberClient = await member.request.post("/api/clients", { data: { name: "Member client" } });
  expect(memberClient.ok()).toBeTruthy();
  const memberClientId = ((await memberClient.json()) as { id: string }).id;
  const memberProject = await member.request.post("/api/projects", {
    data: {
      name: "Member project",
      color: "#2563eb",
      clientId: project.clientId,
      billable: true,
      rate: 300,
      estimatedHours: 50,
    },
  });
  expect(memberProject.status()).toBe(201);
  const createdByMember = (await memberProject.json()) as {
    rate: number | null;
    estimatedHours: number | null;
  };
  expect(createdByMember.rate).toBeNull();
  expect(createdByMember.estimatedHours).toBeNull();

  const refused = [
    await member.request.put(`/api/projects/${project.id}`, { data: { name: "Renamed" } }),
    // A blank client may be filled by anyone; moving one that is already set may not.
    await member.request.put(`/api/projects/${project.id}`, { data: { clientId: memberClientId } }),
    await member.request.delete(`/api/projects/${project.id}`),
    await member.request.post("/api/projects/recolor"),
    await member.request.put(`/api/clients/${project.clientId}`, { data: { name: "Renamed" } }),
    await member.request.delete(`/api/clients/${project.clientId}`),
    await member.request.post("/api/integrations", {
      data: {
        type: "workfront",
        name: "Acme Workfront",
        baseUrl: "https://acme.my.workfront.com",
        credentials: { apiKey: "k" },
      },
    }),
  ];
  expect(refused.map((r) => r.status())).toEqual([403, 403, 403, 403, 403, 403, 403]);

  const ownerProjects = (await (await owner.request.get("/api/projects")).json()) as {
    id: string;
    name: string;
    active: boolean;
  }[];
  const untouched = ownerProjects.find((p) => p.id === project.id);
  expect(untouched?.name).toBe("E2E Project");
  expect(untouched?.active).toBe(true);

  const renamed = await owner.request.put(`/api/projects/${project.id}`, {
    data: { name: "Renamed by owner" },
    headers: await originHeaders(owner),
  });
  expect(renamed.ok()).toBeTruthy();
});

test("the picker creates the project and its client together, without leaving the entry", async ({
  page,
}) => {
  await signUp(page);
  await page.goto("/");

  await page.getByRole("button", { name: "Select project" }).first().click();
  await page.getByPlaceholder("Name your first project…").fill("Picker Project");
  await page.getByRole("option", { name: /Create Picker Project/ }).click();

  await expect(page.getByLabel("Project name")).toHaveValue("Picker Project");
  await page.getByLabel("New client name").fill("Picker Client");
  await page.getByRole("button", { name: "Create project" }).click();

  await expect(page.getByRole("button", { name: "Project: Picker Project" }).first()).toBeVisible();

  const projects = (await (await page.request.get("/api/projects")).json()) as {
    name: string;
    clientName: string | null;
  }[];
  expect(projects.map((p) => [p.name, p.clientName])).toEqual([["Picker Project", "Picker Client"]]);
});
