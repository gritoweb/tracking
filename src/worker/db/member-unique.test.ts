import { describe, expect, it } from "vitest";
import { createMigratedD1 } from "../../test/sqlite-d1";

const SEED = import.meta.glob<string>("../../../seeds/dev-seed.sql", { query: "?raw", import: "default", eager: true });
const seedSql = Object.values(SEED)[0];

// Migration 0050: a person is a member of a workspace once.
function database() {
  const { raw } = createMigratedD1();
  const now = "2026-01-01 00:00:00";
  raw.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws-A', 'A'), ('ws-B', 'B');
    ${["u-ana", "u-bo"].map((id) => `INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES ('${id}', '${id}', '${id}@x.test', '${now}', '${now}');`).join("\n")}
  `);
  const add = (id: string, org: string, user: string, verb = "INSERT") =>
    raw.exec(`${verb} INTO "member" (id, organizationId, userId, role, createdAt) VALUES ('${id}', '${org}', '${user}', 'member', '${now}')`);
  const count = (where = "1=1") => (raw.prepare(`SELECT COUNT(*) AS n FROM "member" WHERE ${where}`).get() as { n: number }).n;
  return { raw, add, count };
}

describe("member uniqueness (0050)", () => {
  it("refuses a second membership for the same person in the same workspace", () => {
    const { add, count } = database();
    add("m1", "ws-A", "u-ana");
    expect(() => add("m2", "ws-A", "u-ana")).toThrow(/UNIQUE/i);
    expect(count()).toBe(1);
  });

  it("lets the same person join another workspace, and two people share one", () => {
    const { add, count } = database();
    add("m1", "ws-A", "u-ana");
    add("m2", "ws-B", "u-ana");
    add("m3", "ws-A", "u-bo");
    expect(count()).toBe(3);
  });

  it("makes an INSERT OR IGNORE with a different id a no-op, which is what the seed relies on", () => {
    const { add, count } = database();
    add("original", "ws-A", "u-ana");
    add("seed-id", "ws-A", "u-ana", "INSERT OR IGNORE");
    expect(count("id = 'original'")).toBe(1);
    expect(count()).toBe(1);
  });

  it("keeps the demo seed from adding a second membership, however many times it runs", () => {
    const { raw, count } = database();
    raw.exec(seedSql);
    raw.exec(seedSql);
    expect(count("organizationId = 'seeddemowrkspc00000000000000001' AND userId = 'seeddemouser000000000000000001'")).toBe(1);
  });
});
