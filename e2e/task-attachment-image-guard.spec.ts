import { test, expect } from "@playwright/test";
import { OWNER_STATE } from "./auth-state";
import { createProject } from "./project-helpers";

test.use({ storageState: OWNER_STATE });

/** A minimal PNG: real signature + IHDR, with a forged width/height — no pixel data needed to trip the dimension guard. */
function forgedPng(width: number, height: number): Buffer {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([..."IHDR"].map((c) => c.charCodeAt(0)), 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return Buffer.from(bytes);
}

test("a forged image header declaring an absurd size is rejected, and the worker keeps answering", async ({
  page,
}) => {
  const project = await createProject(page, { name: "Image Guard Project" });
  const created = await page.request.post("/api/tasks", {
    data: { name: "Attach a bomb", projectId: project.id },
  });
  const task = (await created.json()) as { id: string };

  const bomb = await page.request.post(`/api/tasks/${task.id}/attachments`, {
    multipart: { file: { name: "bomb.png", mimeType: "image/png", buffer: forgedPng(30000, 30000) } },
  });
  expect(bomb.status()).toBe(400);
  const body = (await bomb.json()) as { error: string };
  expect(body.error).toContain("too large");

  // The Worker isolate must not have crashed decoding it.
  const stillAlive = await page.request.get(`/api/tasks/${task.id}/attachments`);
  expect(stillAlive.status()).toBe(200);
});
