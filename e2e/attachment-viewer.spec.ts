import { test, expect, type Page } from "@playwright/test";
import { signUp } from "./auth";
import { createProject } from "./project-helpers";
import { makePdf } from "./files";

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

async function taskWithFiles(page: Page) {
  await signUp(page);
  const project = await createProject(page, { name: "Site Relaunch", color: "#e11d48" });
  const task = await (await page.request.post("/api/tasks", { data: { name: "Brand review", projectId: project.id } })).json();
  for (const file of [
    { name: "brief.pdf", mimeType: "application/pdf", buffer: makePdf() },
    { name: "shot.png", mimeType: "image/png", buffer: TINY_PNG },
    { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("Kickoff notes\nline two") },
  ]) {
    const res = await page.request.post(`/api/tasks/${task.id}/attachments`, { multipart: { file } });
    expect(res.status(), await res.text()).toBe(201);
  }
  return task as { id: string };
}

/** Any CSP violation means pdf.js (or anything else) was blocked — the test must fail, not pass on a blank viewer. */
function watchCsp(page: Page) {
  const violations: string[] = [];
  page.on("console", (m) => {
    const text = m.text();
    // FullCalendar's inline icon font (fcicons) is blocked by font-src 'self' everywhere in the app — not this feature's.
    if (/Content Security Policy|Refused to/i.test(text) && !text.includes("font-src")) violations.push(text);
    if (text.startsWith("pdf open failed")) violations.push(text);
  });
  return violations;
}

test("a PDF opens in the viewer, renders its pages and zooms, with nothing blocked by CSP", async ({ page }) => {
  const violations = watchCsp(page);
  const task = await taskWithFiles(page);
  await page.goto(`/tasks/${task.id}`);

  await page.getByRole("button", { name: "Open brief.pdf" }).click();
  const viewer = page.getByRole("dialog", { name: "brief.pdf" });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText(/1 of 3/)).toBeVisible();

  // pdf.js drew real pixels into page 1 (a blank canvas would mean the worker never ran).
  const page1 = viewer.getByLabel("Page 1");
  await expect(page1).toBeVisible();
  await expect
    .poll(() =>
      page1.evaluate((c: HTMLCanvasElement) => {
        const data = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
        for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 0 && data[i] < 128) return true;
        return false;
      }),
    { timeout: 15_000 })
    .toBe(true);
  await expect(viewer.getByLabel("Page 2")).toBeAttached();

  const before = (await viewer.getByLabel("Page 1").boundingBox())!.width;
  await viewer.getByRole("button", { name: "Zoom in" }).click();
  await expect(viewer.getByText("125%")).toBeVisible();
  await expect.poll(async () => (await viewer.getByLabel("Page 1").boundingBox())!.width).toBeGreaterThan(before * 1.2);

  await viewer.getByRole("button", { name: "Fit to screen" }).click();
  await expect(viewer.getByText("100%")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(viewer).not.toBeVisible();
  expect(violations).toEqual([]);
});

test("an image zooms with the buttons and the wheel, and arrows move between files", async ({ page }) => {
  const violations = watchCsp(page);
  const task = await taskWithFiles(page);
  await page.goto(`/tasks/${task.id}`);

  await page.getByRole("button", { name: "Open shot.png" }).click();
  let viewer = page.getByRole("dialog", { name: "shot.png" });
  await expect(viewer.getByRole("img", { name: "shot.png" })).toBeVisible();

  await viewer.getByRole("button", { name: "Zoom in" }).click();
  await expect(viewer.getByText("125%")).toBeVisible();

  const img = viewer.getByRole("img", { name: "shot.png" });
  const box = (await img.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -400);
  await expect.poll(async () => Number((await viewer.getByText(/^\d+%$/).textContent())!.replace("%", ""))).toBeGreaterThan(125);

  // → goes to the next file, which opens fitted again.
  await page.keyboard.press("ArrowRight");
  viewer = page.getByRole("dialog", { name: "notes.txt" });
  await expect(viewer.getByText(/Kickoff notes/)).toBeVisible();
  await expect(viewer.getByText("100%")).toBeVisible();

  await viewer.getByRole("button", { name: "Close" }).click();
  await expect(viewer).not.toBeVisible();
  expect(violations).toEqual([]);
});

test("a document downloads with its own name instead of opening as a page", async ({ page }) => {
  const task = await taskWithFiles(page);
  const list = await (await page.request.get(`/api/tasks/${task.id}/attachments`)).json();
  const pdf = list.find((a: { filename: string }) => a.filename === "brief.pdf");
  const res = await page.request.get(pdf.url);
  expect(res.headers()["content-disposition"]).toMatch(/^attachment; filename="brief.pdf"/);
  expect(res.headers()["content-security-policy"]).toMatch(/sandbox/);
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
});
