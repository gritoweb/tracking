import { test, expect, type Locator } from "@playwright/test";
import { signUp } from "./auth";
import { createProject } from "./project-helpers";
import { makePdf, makePng } from "./files";

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
  // Locally the description may be co-edited: its editor is rebuilt once the shared doc loads, so let that settle first.
  await page.waitForLoadState("networkidle");
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

test("any file goes in: a Mermaid diagram becomes a card and opens as text in the viewer", async ({ page }) => {
  const panel = await openTask(page);
  const description = panel.getByRole("textbox", { name: "Description" });
  await description.click();
  const diagram = Buffer.from("mindmap\n  root((Cavalus plan))\n    Research").toString("base64");
  await giveFile(description, "drop", "exemplo-mapa-mental.mmd", diagram, "");

  const card = description.getByRole("button", { name: "Open exemplo-mapa-mental.mmd" });
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(card).toContainText("MMD");
  await card.click();
  const viewer = page.getByRole("dialog", { name: "exemplo-mapa-mental.mmd" });
  await expect(viewer.getByText(/root\(\(Cavalus plan\)\)/)).toBeVisible();
});

test("big images in a comment scroll inside the field, so Comment stays on screen and posts", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const panel = await openTask(page);
  const composer = panel.getByRole("textbox", { name: "Write a comment" });
  await composer.click();
  const tall = makePng(600, 1800).toString("base64");
  // One after the other, as a person would: each big image is uploaded and resized before the next one.
  for (const [i, name] of ["map-1.png", "map-2.png"].entries()) {
    await giveFile(composer, "paste", name, tall, "image/png");
    await expect(composer.locator("img")).toHaveCount(i + 1, { timeout: 30_000 });
    await expect(composer.getByText("Uploading…")).toHaveCount(0, { timeout: 30_000 });
  }

  const send = panel.getByRole("button", { name: "Comment", exact: true });
  await expect(send).toBeInViewport();
  await expect(send).toBeEnabled();
  await send.click();
  const posted = panel.getByRole("region", { name: "Comments" }).getByRole("textbox", { name: "Comment", exact: true });
  await expect(posted.locator("img")).toHaveCount(2);
});

test("an image deleted from the description leaves the task's Attachments as soon as the field is left", async ({ page }) => {
  const panel = await openTask(page);
  const description = panel.getByRole("textbox", { name: "Description" });
  await description.click();
  await giveFile(description, "paste", "pasted.png", makePng(400, 240).toString("base64"), "image/png");
  await expect(description.locator("img")).toHaveCount(1, { timeout: 10_000 });
  await expect(description.getByText("Uploading…")).toHaveCount(0);

  // Leaving the field saves; the image is in the gallery too.
  await panel.getByText("Subtasks").click();
  const thumbnail = panel.getByRole("button", { name: "Open pasted.png" });
  await expect(thumbnail).toBeVisible();

  // Take it out with the X that shows on hover (a click on the image itself opens the viewer).
  await description.locator("img").hover();
  await description.getByRole("button", { name: "Remove image from the text" }).click();
  await expect(description.locator("img")).toHaveCount(0);
  await panel.getByText("Subtasks").click();

  await expect(thumbnail).toHaveCount(0, { timeout: 10_000 });
});

test("deleting a file from Attachments takes it out of the description and the comments too", async ({ page }) => {
  const panel = await openTask(page);
  const png = makePng(400, 240).toString("base64");
  const description = panel.getByRole("textbox", { name: "Description" });
  await description.click();
  await giveFile(description, "paste", "diagram.png", png, "image/png");
  await expect(description.locator("img")).toHaveCount(1, { timeout: 10_000 });
  await panel.getByText("Subtasks").click();

  const composer = panel.getByRole("textbox", { name: "Write a comment" });
  await composer.click();
  await page.keyboard.type("Look at this ");
  await giveFile(composer, "paste", "flow.pdf", PDF, "application/pdf");
  await expect(composer.getByRole("button", { name: "Open flow.pdf" })).toBeVisible({ timeout: 10_000 });
  await panel.getByRole("button", { name: "Comment", exact: true }).click();
  const posted = panel.getByRole("region", { name: "Comments" }).getByRole("textbox", { name: "Comment", exact: true });
  await expect(posted.getByRole("button", { name: "Open flow.pdf" })).toBeVisible();

  for (const name of ["diagram.png", "flow.pdf"]) {
    // The first "Open" is the Attachments thumbnail; the comment's card comes later in the page.
    await panel.getByRole("button", { name: `Open ${name}` }).first().hover();
    await panel.getByRole("button", { name: `Delete ${name}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  }

  // Gone from the text itself — not merely broken and replaced by the "removed" note.
  await expect(description.locator("img")).toHaveCount(0);
  await expect(description.getByText("This image was removed from the task")).toHaveCount(0);
  await expect(posted.getByRole("button", { name: "Open flow.pdf" })).toHaveCount(0);
  await expect(posted.getByText("Look at this")).toBeVisible();
});

test("an image already in the description, deleted from Attachments after reopening, leaves the text for good", async ({ page }) => {
  const panel = await openTask(page);
  const description = panel.getByRole("textbox", { name: "Description" });
  await description.click();
  await giveFile(description, "paste", "kept.png", makePng(400, 240).toString("base64"), "image/png");
  await expect(description.locator("img")).toHaveCount(1, { timeout: 10_000 });
  await panel.getByText("Subtasks").click();
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(description.locator("img")).toHaveCount(1);

  await panel.getByRole("button", { name: "Open kept.png" }).first().hover();
  await panel.getByRole("button", { name: "Delete kept.png" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(description.locator("img")).toHaveCount(0);
  await expect(description.getByText("This image was removed from the task")).toHaveCount(0);

  // The shared (co-edited) copy dropped it too: reopening doesn't bring it back.
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(panel.getByText("Subtasks")).toBeVisible();
  await expect(description.locator("img")).toHaveCount(0);
  await expect(description.getByText("This image was removed from the task")).toHaveCount(0);
});

test("the empty comment field fits its whole placeholder, with no scrollbar", async ({ page }) => {
  const panel = await openTask(page);
  const composer = panel.getByRole("textbox", { name: "Write a comment" });
  await expect(composer).toBeVisible();
  const overflow = await composer.evaluate((el) => {
    const box = el.parentElement!;
    return { scroll: box.scrollHeight, client: box.clientHeight };
  });
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
});

test("an image pasted into a comment and taken out before posting leaves Attachments", async ({ page }) => {
  const panel = await openTask(page);
  const composer = panel.getByRole("textbox", { name: "Write a comment" });
  await composer.click();
  await giveFile(composer, "paste", "draft.png", makePng(400, 240).toString("base64"), "image/png");
  await expect(composer.locator("img")).toHaveCount(1, { timeout: 10_000 });
  await expect(panel.getByRole("button", { name: "Open draft.png" })).toBeVisible();

  await composer.locator("img").hover();
  await composer.getByRole("button", { name: "Remove image from the text" }).click();
  await panel.getByText("Subtasks").click();
  await expect(panel.getByRole("button", { name: "Open draft.png" })).toHaveCount(0, { timeout: 10_000 });
});

test("an image in a comment that was never posted leaves Attachments when the task is closed", async ({ page }) => {
  const panel = await openTask(page);
  const url = page.url();
  const composer = panel.getByRole("textbox", { name: "Write a comment" });
  await composer.click();
  await giveFile(composer, "paste", "unsent.png", makePng(400, 240).toString("base64"), "image/png");
  await expect(panel.getByRole("button", { name: "Open unsent.png" })).toBeVisible({ timeout: 10_000 });

  await page.keyboard.press("Escape");
  await expect(panel).not.toBeVisible();
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("dialog", { name: "Brand review" }).getByText("Attachments")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open unsent.png" })).toHaveCount(0);
});

test("an image added while editing a comment goes away when the edit is cancelled", async ({ page }) => {
  const panel = await openTask(page);
  const composer = panel.getByRole("textbox", { name: "Write a comment" });
  await composer.click();
  await page.keyboard.type("First version");
  await panel.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(panel.getByRole("region", { name: "Comments" }).getByText("First version")).toBeVisible();

  await panel.getByRole("region", { name: "Comments" }).getByText("First version").hover();
  await panel.getByRole("button", { name: "Edit comment" }).click();
  const editor = panel.getByRole("textbox", { name: "Edit comment" });
  await editor.click();
  await giveFile(editor, "paste", "edit.png", makePng(400, 240).toString("base64"), "image/png");
  await expect(panel.getByRole("button", { name: "Open edit.png" })).toBeVisible({ timeout: 10_000 });

  await panel.getByRole("button", { name: "Cancel" }).click();
  await expect(panel.getByRole("button", { name: "Open edit.png" })).toHaveCount(0, { timeout: 10_000 });
});

test("a file already deleted leaves no trace: nothing shows, no note, and the description drops it", async ({ page }) => {
  await signUp(page);
  const project = await createProject(page, { name: "Site Relaunch", color: "#e11d48" });
  const stale = (text: string) =>
    JSON.stringify({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text }] },
        { type: "image", attrs: { src: "/api/attachments/deleted-image" } },
        { type: "fileAttachment", attrs: { href: "/api/attachments/deleted-file", filename: "old.pdf" } },
      ],
    });
  const task = await (
    await page.request.post("/api/tasks", { data: { name: "Brand review", projectId: project.id, description: stale("Keep me") } })
  ).json();
  const comment = await page.request.post(`/api/tasks/${task.id}/comments`, { data: { body: stale("Comment text") } });
  expect(comment.status()).toBe(201);

  await page.goto(`/tasks/${task.id}`);
  await page.waitForLoadState("networkidle");
  const panel = page.getByRole("dialog", { name: "Brand review" });
  await expect(panel.getByText("Keep me")).toBeVisible();
  await expect(panel.getByText("Comment text")).toBeVisible();
  await expect(panel.locator(".tt-richtext img")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Open old.pdf" })).toHaveCount(0);
  await expect(panel.getByText("This image was removed from the task")).toHaveCount(0);

  // The description is editable, so the dead references leave it for good once it's saved.
  const description = panel.getByRole("textbox", { name: "Description" });
  await description.click();
  await panel.getByText("Subtasks").click();
  await expect
    .poll(async () => ((await (await page.request.get(`/api/tasks/${task.id}`)).json()).description as string).includes("deleted-"))
    .toBe(false);
});

test("while a file uploads its line shows only Uploading…, not the empty-line hint drawn over it", async ({ page }) => {
  const panel = await openTask(page);
  // Hold each upload so the in-flight state can be looked at.
  let release: () => void = () => {};
  await page.route("**/api/tasks/*/attachments", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await new Promise<void>((resolve) => (release = resolve));
    await route.continue();
  });
  const hintOnUploadLine = (field: Locator) =>
    field.evaluate((el) => {
      const line = el.querySelector(".tt-upload-placeholder")?.closest("p");
      return line ? getComputedStyle(line, "::before").content : "no upload line";
    });

  for (const name of ["Description", "Write a comment"]) {
    const field = panel.getByRole("textbox", { name });
    await field.click();
    await giveFile(field, "paste", "held.png", makePng(400, 240).toString("base64"), "image/png");
    await expect(field.getByText("Uploading…")).toBeVisible();
    expect(await hintOnUploadLine(field)).toBe("none");
    release();
    await expect(field.locator("img")).toHaveCount(1, { timeout: 15_000 });
  }
});
