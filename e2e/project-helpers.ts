import { expect, type Page } from "@playwright/test";

// Every entry needs a project and every project a client (D3), so most specs seed this pair first.
export const E2E_PROJECT = "E2E Project";

export async function createClient(page: Page, name = "E2E Client") {
  const res = await page.request.post("/api/clients", { data: { name } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as { id: string; name: string };
}

/** A project under a client; pass `clientId` to reuse one, otherwise a fresh client is created. */
export async function createProject(
  page: Page,
  data: { name?: string; color?: string; billable?: boolean; clientId?: string } = {}
) {
  const clientId = data.clientId ?? (await createClient(page)).id;
  const res = await page.request.post("/api/projects", {
    data: {
      name: data.name ?? E2E_PROJECT,
      color: data.color ?? "#2563eb",
      billable: data.billable ?? false,
      clientId,
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as { id: string; name: string; billable: boolean; clientId: string };
}

/** Picks a project in the open picker — the one the timer bar's Start opens when no project is set. */
export async function chooseProject(page: Page, name = E2E_PROJECT) {
  await page.getByRole("option", { name }).click();
}
