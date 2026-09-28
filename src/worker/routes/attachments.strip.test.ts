import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { createMigratedD1 } from "../../test/sqlite-d1";
import { attachmentsRouter } from "./attachments";

const img = (id: string) => ({ type: "image", attrs: { src: `/api/attachments/${id}` } });
const card = (id: string) => ({ type: "fileAttachment", attrs: { href: `/api/attachments/${id}`, filename: "brief.pdf" } });
const text = (t: string) => ({ type: "paragraph", content: [{ type: "text", text: t }] });
const doc = (...content: unknown[]) => JSON.stringify({ type: "doc", content });

function world() {
  const { db, raw } = createMigratedD1();
  const now = "2026-01-01 00:00:00";
  raw.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws-A', 'A');
    INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES
      ('u-ana', 'Ana', 'ana@x.test', '${now}', '${now}'), ('u-bo', 'Bo', 'bo@x.test', '${now}', '${now}');
    INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES
      ('m1', 'ws-A', 'u-ana', 'member', '${now}'), ('m2', 'ws-A', 'u-bo', 'member', '${now}');
    INSERT INTO clients (id, workspace_id, name) VALUES ('cl', 'ws-A', 'C');
    INSERT INTO projects (id, workspace_id, name, client_id) VALUES ('p1', 'ws-A', 'P', 'cl');
  `);
  raw.prepare(`INSERT INTO tasks (id, workspace_id, project_id, name, description) VALUES ('t1', 'ws-A', 'p1', 'T', ?)`)
    .run(doc(text("Before"), img("a1"), img("a2"), text("After")));
  raw.exec(`
    INSERT INTO task_attachments (id, workspace_id, task_id, user_id, r2_key, filename, content_type, size) VALUES
      ('a1', 'ws-A', 't1', 'u-ana', 'r2/a1', 'shot.png', 'image/png', 10),
      ('a2', 'ws-A', 't1', 'u-ana', 'r2/a2', 'other.png', 'image/png', 10);
  `);
  raw.prepare(
    `INSERT INTO task_comments (id, workspace_id, task_id, user_id, body) VALUES
       ('c-mixed', 'ws-A', 't1', 'u-bo', ?), ('c-only', 'ws-A', 't1', 'u-bo', ?), ('c-other', 'ws-A', 't1', 'u-bo', ?)`
  ).run(doc(text("See this"), card("a1")), doc(img("a1")), doc(text("Unrelated"), img("a2")));
  const del = vi.fn(async () => {});
  const room = { idFromName: () => "r", get: () => ({ fetch: async () => new Response("ok") }) };
  const env = { DB: db, ATTACHMENTS: { delete: del }, TIMER_ROOM: room } as unknown as Env;
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
  const as = (userId: string) =>
    new Hono<{ Bindings: Env; Variables: { workspaceId: string; userId: string } }>()
      .use("*", async (c, next) => {
        c.set("workspaceId", "ws-A");
        c.set("userId", userId);
        await next();
      })
      .route("/", attachmentsRouter)
      .request("/a1", { method: "DELETE" }, env, ctx);
  const description = () => JSON.parse((raw.prepare(`SELECT description FROM tasks WHERE id = 't1'`).get() as { description: string }).description);
  const comments = () =>
    Object.fromEntries((raw.prepare(`SELECT id, body FROM task_comments`).all() as { id: string; body: string }[]).map((r) => [r.id, JSON.parse(r.body)]));
  return { as, description, comments, del };
}

describe("DELETE /api/attachments/:id takes the file out of every text of its task", () => {
  it("removes it from the description and the comments, keeping everything else", async () => {
    const w = world();
    expect((await w.as("u-ana")).status).toBe(200);
    expect(w.description().content).toEqual([text("Before"), img("a2"), text("After")]);
    const comments = w.comments();
    expect(comments["c-mixed"].content).toEqual([text("See this")]);
    expect(comments["c-other"].content).toEqual([text("Unrelated"), img("a2")]);
    expect(w.del).toHaveBeenCalledWith("r2/a1");
  });

  it("deletes a comment that only carried the file", async () => {
    const w = world();
    await w.as("u-ana");
    expect(w.comments()).not.toHaveProperty("c-only");
  });

  it("changes nothing for someone who may not delete the file", async () => {
    const w = world();
    const before = { description: w.description(), comments: w.comments() };
    expect((await w.as("u-bo")).status).toBe(403);
    expect({ description: w.description(), comments: w.comments() }).toEqual(before);
  });
});
