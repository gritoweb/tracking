import { beforeEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { createMigratedD1 } from "../../test/sqlite-d1";

const NOW = "2026-01-01T00:00:00.000Z";

function seed(raw: DatabaseSync) {
  raw.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws-1', 'One'), ('ws-2', 'Two'), ('ws-3', 'Three');
    INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES
      ('u-a', 'A', 'a@x.test', '${NOW}', '${NOW}'),
      ('u-b', 'B', 'b@x.test', '${NOW}', '${NOW}'),
      ('u-c', 'C', 'c@x.test', '${NOW}', '${NOW}');
    INSERT INTO member (id, organizationId, userId, role, createdAt) VALUES
      ('m-1a', 'ws-1', 'u-a', 'owner', '${NOW}'),
      ('m-1b', 'ws-1', 'u-b', 'owner', '${NOW}'),
      ('m-1c', 'ws-1', 'u-c', 'member', '${NOW}'),
      ('m-2a', 'ws-2', 'u-a', 'owner', '${NOW}');
  `);
}

const owners = (raw: DatabaseSync, org: string) =>
  Number((raw.prepare(`SELECT COUNT(*) AS n FROM member WHERE organizationId = ? AND role LIKE '%owner%'`).get(org) as { n: number }).n);

describe("last owner guard (member triggers)", () => {
  let raw: DatabaseSync;
  beforeEach(() => {
    raw = createMigratedD1().raw;
    seed(raw);
  });

  it("lets one of two owners step down, then refuses the last one", () => {
    raw.prepare(`UPDATE member SET role = 'admin' WHERE id = 'm-1a'`).run();
    expect(owners(raw, "ws-1")).toBe(1);
    expect(() => raw.prepare(`UPDATE member SET role = 'admin' WHERE id = 'm-1b'`).run()).toThrow(/last owner/i);
    expect(owners(raw, "ws-1")).toBe(1);
  });

  it("refuses removing the last owner row but allows removing one of two", () => {
    raw.prepare(`DELETE FROM member WHERE id = 'm-1a'`).run();
    expect(() => raw.prepare(`DELETE FROM member WHERE id = 'm-1b'`).run()).toThrow(/last owner/i);
    expect(owners(raw, "ws-1")).toBe(1);
  });

  it("refuses moving the last owner row into another organization", () => {
    expect(() => raw.prepare(`UPDATE member SET organizationId = 'ws-3' WHERE id = 'm-2a'`).run()).toThrow(/last owner/i);
  });

  it("refuses demoting a multi-role owner string down to non-owner roles", () => {
    raw.prepare(`UPDATE member SET role = 'owner,admin' WHERE id = 'm-2a'`).run();
    expect(() => raw.prepare(`UPDATE member SET role = 'admin' WHERE id = 'm-2a'`).run()).toThrow(/last owner/i);
  });

  it("allows non-owner changes freely", () => {
    raw.prepare(`UPDATE member SET role = 'admin' WHERE id = 'm-1c'`).run();
    raw.prepare(`DELETE FROM member WHERE id = 'm-1c'`).run();
    expect(owners(raw, "ws-1")).toBe(2);
  });

  it("still lets a sole-owned organization be deleted (cascade removes its members)", () => {
    raw.prepare(`DELETE FROM workspaces WHERE id = 'ws-2'`).run();
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM member WHERE organizationId = 'ws-2'`).get()).toEqual({ n: 0 });
  });

  it("still lets a user who is the sole owner be deleted (cascade removes their membership)", () => {
    raw.prepare(`DELETE FROM "user" WHERE id = 'u-a'`).run();
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM member WHERE userId = 'u-a'`).get()).toEqual({ n: 0 });
    expect(owners(raw, "ws-2")).toBe(0);
  });
});
