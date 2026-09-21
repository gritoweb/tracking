import { describe, expect, it } from "vitest";
import { createMigratedD1 } from "../../test/sqlite-d1";
import { routeClient } from "../../test/route-harness";
import { apiKeysRouter } from "./api-keys";

function world() {
  const { db, raw } = createMigratedD1();
  const now = "2026-01-01 00:00:00";
  raw.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws-A', 'A'), ('ws-B', 'B');
    ${["u-ana", "u-eve"].map((id) => `INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES ('${id}', '${id}', '${id}@x.test', '${now}', '${now}');`).join("\n")}
    INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES ('m-ana', 'ws-A', 'u-ana', 'owner', '${now}'), ('m-eve', 'ws-B', 'u-eve', 'owner', '${now}');
  `);
  const as = (userId: string, workspaceId: string) => routeClient(apiKeysRouter, db, { workspaceId, userId });
  return { as };
}

describe("the API keys routes", () => {
  it("mints a key, shows the secret in that one response and never again", async () => {
    const { as } = world();
    const ana = as("u-ana", "ws-A");
    const created = await ana.post("/", { name: "laptop", scope: "read" });
    expect(created.status).toBe(201);
    const { key, plaintext } = (await created.json()) as { key: { id: string; prefix: string }; plaintext: string };
    expect(plaintext).toMatch(/^tt_live_/);
    const listed = await (await ana.get("/")).json();
    expect(JSON.stringify(listed)).not.toContain(plaintext);
    expect((listed as { id: string }[]).map((k) => k.id)).toEqual([key.id]);
  });

  it("refuses a scope that is neither read nor read_write", async () => {
    const { as } = world();
    expect((await as("u-ana", "ws-A").post("/", { name: "x", scope: "admin" })).status).toBe(400);
  });

  it("keeps each workspace's keys to itself", async () => {
    const { as } = world();
    await as("u-ana", "ws-A").post("/", { name: "ana key", scope: "read" });
    await as("u-eve", "ws-B").post("/", { name: "eve key", scope: "read" });
    const names = async (c: ReturnType<typeof as>) => ((await (await c.get("/")).json()) as { name: string }[]).map((k) => k.name);
    expect(await names(as("u-ana", "ws-A"))).toEqual(["ana key"]);
    expect(await names(as("u-eve", "ws-B"))).toEqual(["eve key"]);
  });

  it("revokes a key of its own workspace, and answers 404 for another workspace's, which survives", async () => {
    const { as } = world();
    const eveKey = ((await (await as("u-eve", "ws-B").post("/", { name: "eve key", scope: "read" })).json()) as { key: { id: string } }).key.id;
    const anaKey = ((await (await as("u-ana", "ws-A").post("/", { name: "ana key", scope: "read" })).json()) as { key: { id: string } }).key.id;
    expect((await as("u-ana", "ws-A").del(`/${eveKey}`)).status).toBe(404);
    expect(((await (await as("u-eve", "ws-B").get("/")).json()) as unknown[]).length).toBe(1);
    expect((await as("u-ana", "ws-A").del(`/${anaKey}`)).status).toBe(200);
    expect(((await (await as("u-ana", "ws-A").get("/")).json()) as unknown[]).length).toBe(0);
  });
});
