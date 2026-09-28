import { test, expect, type Locator } from "@playwright/test";
import { signUp } from "./auth";
import { createProject } from "./project-helpers";
import { makePdf } from "./files";

/** Hands a real File to the editor the way the OS does: a drop at the field's centre, or a paste into it. */
async function giveFile(field: Locator, how: "drop" | "paste", name: string, base64: string, type: string) {
  await field.evaluate(
    (el, { how, name, base64, type }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], name, { type }));
      const box = el.getBoundingClientRect();
      const event =
        how === "drop"
          ? new DragEvent("drop", { bubbles: true, cancelable: true, clientX: box.left + 10, clientY: box.top + 10, dataTransfer: data })
          : new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data });
      el.dispatchEvent(event);
    },
    { how, name, base64, type }
  );
}

async function openTask(page: import("@playwright/test").Page) {
  await signUp(page);
  const project = await createProject(page, { name: "Site Relaunch", color: "#e11d48" });
  const task = await (await page.request.post("/api/tasks", { data: { name: "Brand review", projectId: project.id } })).json();
  await page.goto(`/tasks/${task.id}`);
  return page.getByRole("dialog", { name: "Brand review" });
}

const PDF = makePdf().toString("base64");

const TINY_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("a PDF dropped into the description becomes a clickable file card that opens the viewer", async ({ page }) => {
  const panel = await openTask(page);
  const description = panel.getByRole("textbox", { name: "Description" });
  await description.click();
  await giveFile(description, "drop", "brief.pdf", PDF, "application/pdf");

  const card = description.getByRole("button", { name: "Open brief.pdf" });
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(card).toContainText("PDF");
  await expect(card).toHaveCSS("cursor", "pointer");
  await expect(description.getByRole("link")).toHaveCount(0);

  await card.click();
  const viewer = page.getByRole("dialog", { name: "brief.pdf" });
  await expect(viewer.getByLabel("Page 1")).toBeVisible({ timeout: 15_000 });
});

test("a PDF pasted into a comment is posted as a file card that opens the viewer", async ({ page }) => {
  const panel = await openTask(page);
  const composer = panel.getByRole("textbox", { name: "Write a comment" });
  await composer.click();
  await giveFile(composer, "paste", "minutes.pdf", PDF, "application/pdf");
  await expect(composer.getByRole("button", { name: "Open minutes.pdf" })).toBeVisible({ timeout: 10_000 });

  await panel.getByRole("button", { name: "Comment", exact: true }).click();
  const posted = panel.getByRole("region", { name: "Comments" }).getByRole("textbox", { name: "Comment", exact: true });
  await posted.getByRole("button", { name: "Open minutes.pdf" }).click();
  await expect(page.getByRole("dialog", { name: "minutes.pdf" })).toBeVisible();
});

test("an image in a posted comment shows a pointer and opens the viewer when clicked", async ({ page }) => {
  const panel = await openTask(page);
  const composer = panel.getByRole("textbox", { name: "Write a comment" });
  await composer.click();
  await giveFile(composer, "paste", "shot.png", TINY_PNG, "image/png");
  await expect(composer.locator("img")).toBeVisible({ timeout: 10_000 });
  await panel.getByRole("button", { name: "Comment", exact: true }).click();

  const posted = panel.getByRole("region", { name: "Comments" }).getByRole("textbox", { name: "Comment", exact: true });
  const image = posted.locator("img");
  await expect(image).toHaveCSS("cursor", "pointer");
  await image.click();
  await expect(page.getByRole("dialog", { name: "shot.png" })).toBeVisible();
});

test("a program dropped into the description is refused and nothing is inserted", async ({ page }) => {
  const panel = await openTask(page);
  const description = panel.getByRole("textbox", { name: "Description" });
  await description.click();
  await giveFile(description, "drop", "setup.exe", Buffer.from([0x4d, 0x5a]).toString("base64"), "application/x-msdownload");
  await expect(page.getByText(/^Only images .* can be attached$/)).toBeVisible();
  await expect(description.getByRole("link")).toHaveCount(0);
});
