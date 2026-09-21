import { describe, expect, it } from "vitest";
import { createMigratedD1 } from "../../test/sqlite-d1";
import { routeClient } from "../../test/route-harness";
import { tagsRouter } from "./tags";

function world() {
  const { db, raw } = createMigratedD1();
  raw.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws-A', 'A'), ('ws-B', 'B');
    INSERT INTO tags (id, workspace_id, name, color) VALUES ('tg-b', 'ws-A', 'bravo', '#111111'), ('tg-a', 'ws-A', 'alpha', '#222222'), ('tg-B', 'ws-B', 'alpha', '#333333');
  `);
  const as = (workspaceId: string) => routeClient(tagsRouter, db, { workspaceId, userId: "u-1" });
  const tag = (id: string) => raw.prepare(`SELECT * FROM tags WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return { as, tag };
}

describe("the tag routes", () => {
  it("lists only this workspace's tags, by name", async () => {
    const { as } = world();
    const list = (await (await as("ws-A").get("/")).json()) as { name: string }[];
    expect(list.map((t) => t.name)).toEqual(["alpha", "bravo"]);
  });

  it("creates a tag with a colour picked for it", async () => {
    const { as, tag } = world();
    const res = await as("ws-A").post("/", { name: "  charlie " });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; name: string; color: string };
    expect(body.name).toBe("charlie");
    expect(tag(body.id)).toMatchObject({ workspace_id: "ws-A", name: "charlie" });
    expect(body.color).toMatch(/^#/);
  });

  it("answers with the existing tag instead of creating a duplicate", async () => {
    const { as } = world();
    const res = await as("ws-A").post("/", { name: "alpha" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { id: string }).id).toBe("tg-a");
  });

  it("lets two workspaces use the same tag name", async () => {
    const { as } = world();
    expect((await as("ws-B").post("/", { name: "bravo" })).status).toBe(201);
  });

  it("recolours a tag of its own workspace but not another workspace's", async () => {
    const { as, tag } = world();
    await as("ws-A").patch("/tg-a", { color: "#abcdef" });
    await as("ws-A").patch("/tg-B", { color: "#abcdef" });
    expect([tag("tg-a")?.color, tag("tg-B")?.color]).toEqual(["#abcdef", "#333333"]);
  });

  it("deletes a tag of its own workspace but leaves another workspace's alone", async () => {
    const { as, tag } = world();
    await as("ws-A").del("/tg-B");
    expect(tag("tg-B")).toBeDefined();
    await as("ws-A").del("/tg-a");
    expect(tag("tg-a")).toBeUndefined();
  });
});
