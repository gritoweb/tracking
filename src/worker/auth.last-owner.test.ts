import { beforeEach, describe, expect, it } from "vitest";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { createAuth } from "./auth";
import { createMigratedD1 } from "../test/sqlite-d1";

const NOW = "2026-01-01T00:00:00.000Z";
const SECRET = "test-secret-not-a-real-one-0123456789";

// Yields a macrotask per query so two concurrent requests interleave the way two D1 round-trips do.
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function signed(value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  return encodeURIComponent(`${value}.${btoa(String.fromCharCode(...sig))}`);
}

async function setup() {
  const { raw } = createMigratedD1();
  // better-auth's D1 dialect reads `meta` off every `all()`, which the shared harness doesn't return.
  const db = {
    prepare(sql: string) {
      let params: SQLInputValue[] = [];
      const st = {
        bind: (...v: unknown[]) => ((params = v as SQLInputValue[]), st),
        first: async () => (await tick(), raw.prepare(sql).get(...params) ?? null),
        run: async () => (await tick(), { success: true, meta: { changes: Number(raw.prepare(sql).run(...params).changes) } }),
        all: async () => {
          await tick();
          if (/^\s*(select|with|pragma)\b|\breturning\b/i.test(sql)) {
            const results = raw.prepare(sql).all(...params);
            return { results, meta: { changes: /^\s*select/i.test(sql) ? 0 : results.length, last_row_id: null } };
          }
          const r = raw.prepare(sql).run(...params);
          return { results: [], meta: { changes: Number(r.changes), last_row_id: null } };
        },
      };
      return st;
    },
    batch: async () => [],
    exec: async (q: string) => (raw.exec(q), { count: 1, duration: 0 }),
  } as unknown as D1Database;
  raw.exec(`
    INSERT INTO workspaces (id, name, slug) VALUES ('ws-1', 'One', 'one');
    INSERT INTO "user" (id, name, email, createdAt, updatedAt, emailVerified) VALUES
      ('u-a', 'A', 'a@x.test', '${NOW}', '${NOW}', 1),
      ('u-b', 'B', 'b@x.test', '${NOW}', '${NOW}', 1),
      ('u-c', 'C', 'c@x.test', '${NOW}', '${NOW}', 1);
    INSERT INTO member (id, organizationId, userId, role, createdAt) VALUES
      ('m-a', 'ws-1', 'u-a', 'owner', '${NOW}'),
      ('m-b', 'ws-1', 'u-b', 'owner', '${NOW}'),
      ('m-c', 'ws-1', 'u-c', 'member', '${NOW}');
  `);
  const env = { DB: db, BETTER_AUTH_SECRET: SECRET, APP_URL: "http://localhost:5173", ENABLE_PASSWORD_AUTH: "true", ADMIN_EMAILS: "a@x.test" } as unknown as Env;
  const auth = createAuth(env, "http://localhost:5173");
  const ctx = await auth.$context;
  const headersFor = async (userId: string) => {
    const session = await ctx.internalAdapter.createSession(userId);
    return new Headers({ cookie: `timetracker.session_token=${await signed(session.token)}`, origin: "http://localhost:5173" });
  };
  return { auth, raw, headersFor };
}

const ownerCount = (raw: DatabaseSync) => Number((raw.prepare(`SELECT COUNT(*) AS n FROM member WHERE role = 'owner'`).get() as { n: number }).n);

describe("better-auth against the last-owner triggers", () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    s = await setup();
  });

  it("two owners stepping down at the same time never leave the organization ownerless", async () => {
    const [a, b] = [await s.headersFor("u-a"), await s.headersFor("u-b")];
    const demote = (memberId: string, headers: Headers) =>
      s.auth.api.updateMemberRole({ body: { memberId, role: "member", organizationId: "ws-1" }, headers }).then(() => "ok", () => "refused");
    const outcomes = await Promise.all([demote("m-a", a), demote("m-b", b)]);
    expect(outcomes).toContain("refused");
    expect(ownerCount(s.raw)).toBeGreaterThanOrEqual(1);
  });

  it("two owners removing each other at the same time never leave the organization ownerless", async () => {
    const [a, b] = [await s.headersFor("u-a"), await s.headersFor("u-b")];
    const remove = (memberId: string, headers: Headers) =>
      s.auth.api.removeMember({ body: { memberIdOrEmail: memberId, organizationId: "ws-1" }, headers }).then(() => "ok", () => "refused");
    const outcomes = await Promise.all([remove("m-b", a), remove("m-a", b)]);
    expect(outcomes).toContain("refused");
    expect(ownerCount(s.raw)).toBeGreaterThanOrEqual(1);
  });

  it("deleting the organization through better-auth still works", async () => {
    const res = await s.auth.api.deleteOrganization({ body: { organizationId: "ws-1" }, headers: await s.headersFor("u-a") }).then(() => "ok", (e) => `err ${e.message}`);
    expect(res).toBe("ok");
    expect(s.raw.prepare(`SELECT COUNT(*) AS n FROM workspaces WHERE id = 'ws-1'`).get()).toEqual({ n: 0 });
  });

  it("removing a user who is the sole owner of another organization still works", async () => {
    s.raw.exec(`
      INSERT INTO workspaces (id, name, slug) VALUES ('ws-2', 'Two', 'two');
      INSERT INTO member (id, organizationId, userId, role, createdAt) VALUES ('m-c2', 'ws-2', 'u-c', 'owner', '${NOW}');
      UPDATE "user" SET role = 'admin' WHERE id = 'u-a';
    `);
    const res = await s.auth.api.removeUser({ body: { userId: "u-c" }, headers: await s.headersFor("u-a") }).then(() => "ok", (e) => `err ${e.message}`);
    expect(res).toBe("ok");
    expect(s.raw.prepare(`SELECT COUNT(*) AS n FROM member WHERE userId = 'u-c'`).get()).toEqual({ n: 0 });
  });
});
