import { test, expect } from "@playwright/test";
import { signUp } from "./auth";
import { createProject, pickProjectInBar } from "./project-helpers";

// Every entry is born billable now; only the toggle turns it off, and nothing derives it from the project.
test.describe("billable time survives the timer bar", () => {
  test("a timer started on a project marked non-billable still starts billable", async ({
    page,
  }) => {
    await signUp(page);
    const origin = new URL(page.url()).origin;
    await createProject(page, { name: "Internal", color: "#2563eb", billable: false });

    await page.goto("/");
    await page.waitForSelector('header[aria-label="Timer controls"]');
    await pickProjectInBar(page, "Internal");

    const toggle = page.getByRole("button", { name: "Billable", exact: true });
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    await page.getByPlaceholder("What are you working on?").fill("Support call");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Start timer" }).click();
    await expect(page.getByRole("button", { name: "Stop timer" })).toBeVisible();

    await expect
      .poll(async () => {
        const running = await (
          await page.request.get("/api/time_entries?running=true", { headers: { origin } })
        ).json();
        return running[0]?.billable;
      })
      .toBe(true);
  });

  test("toggling billable off before starting persists as false on the created entry", async ({
    page,
  }) => {
    await signUp(page);
    const origin = new URL(page.url()).origin;
    await createProject(page, { name: "Retainer", color: "#e11d48" });

    await page.goto("/");
    await page.waitForSelector('header[aria-label="Timer controls"]');
    await pickProjectInBar(page, "Retainer");

    const toggle = page.getByRole("button", { name: "Billable", exact: true });
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    await page.getByPlaceholder("What are you working on?").fill("Internal sync");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Start timer" }).click();
    await expect(page.getByRole("button", { name: "Stop timer" })).toBeVisible();

    await expect
      .poll(async () => {
        const running = await (
          await page.request.get("/api/time_entries?running=true", { headers: { origin } })
        ).json();
        return running[0]?.billable;
      })
      .toBe(false);
  });

  test("POST /api/time_entries without a billable field comes back true", async ({ page }) => {
    await signUp(page);
    const origin = new URL(page.url()).origin;
    const project = await createProject(page, { name: "Retainer", color: "#e11d48" });

    const omitted = await (
      await page.request.post("/api/time_entries", {
        data: {
          description: "No flag sent",
          projectId: project.id,
          start: new Date(Date.now() - 3600_000).toISOString(),
          stop: new Date(Date.now() - 1800_000).toISOString(),
        },
        headers: { origin },
      })
    ).json();
    expect(omitted.billable).toBe(true);

    // An explicit false still wins.
    const explicit = await (
      await page.request.post("/api/time_entries", {
        data: {
          description: "Explicit false",
          projectId: project.id,
          billable: false,
          start: new Date(Date.now() - 7200_000).toISOString(),
          stop: new Date(Date.now() - 5400_000).toISOString(),
        },
        headers: { origin },
      })
    ).json();
    expect(explicit.billable).toBe(false);

    // No project: refused outright, since every entry needs one (D3).
    const orphan = await page.request.post("/api/time_entries", {
      data: {
        description: "No project",
        start: new Date(Date.now() - 10800_000).toISOString(),
        stop: new Date(Date.now() - 9000_000).toISOString(),
      },
      headers: { origin },
    });
    expect(orphan.status()).toBe(400);
  });

  test("editing an existing entry's billable flag still works", async ({ page }) => {
    await signUp(page);
    const origin = new URL(page.url()).origin;
    const project = await createProject(page, { name: "Retainer", color: "#e11d48" });

    const created = await (
      await page.request.post("/api/time_entries", {
        data: {
          description: "Billable by default",
          projectId: project.id,
          start: new Date(Date.now() - 3600_000).toISOString(),
          stop: new Date(Date.now() - 1800_000).toISOString(),
        },
        headers: { origin },
      })
    ).json();
    expect(created.billable).toBe(true);

    const updated = await (
      await page.request.put(`/api/time_entries/${created.id}`, {
        data: { billable: false },
        headers: { origin },
      })
    ).json();
    expect(updated.billable).toBe(false);

    const revert = await (
      await page.request.put(`/api/time_entries/${created.id}`, {
        data: { billable: true },
        headers: { origin },
      })
    ).json();
    expect(revert.billable).toBe(true);
  });
});
