import { describe, expect, it } from "vitest";
import { createMigratedD1 } from "../../test/sqlite-d1";
import { createApiKey, hashKey, listApiKeys, resolveApiKey, revokeApiKey } from "./api-keys";

/** Two workspaces over one real database; ana and bo are members of ws-A, eve owns ws-B. */
function world() {
  const { db, raw } = createMigratedD1();
  const now = "2026-01-01 00:00:00";
  raw.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws-A', 'A'), ('ws-B', 'B');
    ${["u-ana", "u-bo", "u-eve"].map((id) => `INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES ('${id}', '${id}', '${id}@x.test', '${now}', '${now}');`).join("\n")}
    INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES ('m-ana', 'ws-A', 'u-ana', 'member', '${now}'), ('m-bo', 'ws-A', 'u-bo', 'member', '${now}'), ('m-eve', 'ws-B', 'u-eve', 'owner', '${now}');
  `);
  return { db, raw };
}
const bearer = (token: string) => `Bearer ${token}`;

describe("createApiKey", () => {
  it("returns the plaintext once and stores only its hash", async () => {
    const { db, raw } = world();
    const { record, plaintext } = await createApiKey(db, "ws-A", "u-ana", "laptop", "read");
    expect(plaintext).toMatch(/^tt_live_[A-Za-z0-9_-]{43}$/);
    const rows = raw.prepare(`SELECT * FROM api_keys`).all() as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(rows[0].key_hash).toBe(await hashKey(plaintext));
    expect(String(rows[0].key_hash)).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain(plaintext);
    expect(record.prefix).toBe(plaintext.slice(0, 14));
  });

  it("never gives the same key twice", async () => {
    const { db } = world();
    const a = await createApiKey(db, "ws-A", "u-ana", "a", "read");
    const b = await createApiKey(db, "ws-A", "u-ana", "b", "read");
    expect(a.plaintext).not.toBe(b.plaintext);
  });
});

describe("resolveApiKey", () => {
  it("resolves a key to the workspace, the person who minted it and its scope", async () => {
    const { db } = world();
    const { plaintext } = await createApiKey(db, "ws-A", "u-ana", "laptop", "read_write");
    expect(await resolveApiKey(db, bearer(plaintext))).toMatchObject({ workspaceId: "ws-A", userId: "u-ana", scope: "read_write" });
  });

  it.each([
    ["no header", null],
    ["an empty header", ""],
    ["another scheme", "Basic dGVzdA=="],
    ["a bearer with no token", "Bearer "],
    ["a bearer that is not one of our keys (a session token)", "Bearer 4f1c9d0e-session-token"],
    ["a key that was never issued", "Bearer tt_live_notarealkeynotarealkeynotarealkeynotareal1"],
  ])("refuses %s", async (_name, header) => {
    const { db } = world();
    await createApiKey(db, "ws-A", "u-ana", "laptop", "read");
    expect(await resolveApiKey(db, header)).toBeNull();
  });

  it("accepts the scheme in any case", async () => {
    const { db } = world();
    const { plaintext } = await createApiKey(db, "ws-A", "u-ana", "laptop", "read");
    expect(await resolveApiKey(db, `bearer ${plaintext}`)).not.toBeNull();
  });

  it("stops working when its owner leaves the workspace, and only that person's keys do", async () => {
    const { db, raw } = world();
    const ana = await createApiKey(db, "ws-A", "u-ana", "ana", "read");
    const bo = await createApiKey(db, "ws-A", "u-bo", "bo", "read");
    raw.exec(`DELETE FROM "member" WHERE userId = 'u-ana' AND organizationId = 'ws-A'`);
    expect(await resolveApiKey(db, bearer(ana.plaintext))).toBeNull();
    expect(await resolveApiKey(db, bearer(bo.plaintext))).not.toBeNull();
  });

  it("stops working once it is revoked", async () => {
    const { db } = world();
    const { record, plaintext } = await createApiKey(db, "ws-A", "u-ana", "laptop", "read");
    expect(await revokeApiKey(db, "ws-A", record.id)).toBe(true);
    expect(await resolveApiKey(db, bearer(plaintext))).toBeNull();
  });
});

describe("listApiKeys and revokeApiKey", () => {
  it("lists a workspace's own keys without any secret", async () => {
    const { db } = world();
    const { plaintext } = await createApiKey(db, "ws-A", "u-ana", "ana", "read");
    await createApiKey(db, "ws-B", "u-eve", "eve", "read");
    const list = await listApiKeys(db, "ws-A");
    expect(list.map((k) => k.name)).toEqual(["ana"]);
    expect(JSON.stringify(list)).not.toContain(plaintext);
    expect(Object.keys(list[0])).not.toContain("key_hash");
  });

  it("does not revoke another workspace's key", async () => {
    const { db } = world();
    const eve = await createApiKey(db, "ws-B", "u-eve", "eve", "read");
    expect(await revokeApiKey(db, "ws-A", eve.record.id)).toBe(false);
    expect(await resolveApiKey(db, bearer(eve.plaintext))).not.toBeNull();
  });
});
