import { describe, expect, it } from "vitest";
import { createMigratedD1 } from "../../test/sqlite-d1";
import { DEACTIVATED_REASON, deactivateAccount, reactivateIfDeactivated, soleOwnedWorkspaces } from "./account-deactivation";

const NOW = "2026-01-01T00:00:00.000Z";

function world() {
  const { db, raw } = createMigratedD1();
  raw.exec(`
    INSERT INTO "user" (id, name, email, createdAt, updatedAt, emailVerified, digest_daily) VALUES
      ('u-leaver','Leaver','leaver@x.test','${NOW}','${NOW}',1,1),
      ('u-owner','Owner','owner@x.test','${NOW}','${NOW}',1,0);
    INSERT INTO workspaces (id, name, slug, userId) VALUES ('ws','Acme','acme','u-leaver');
    INSERT INTO member (id, organizationId, userId, role, createdAt) VALUES
      ('m1','ws','u-leaver','member','${NOW}'), ('m2','ws','u-owner','owner','${NOW}');
    INSERT INTO session (id, userId, token, expiresAt, createdAt, updatedAt) VALUES ('s1','u-leaver','tok','2099-01-01','${NOW}','${NOW}');
    INSERT INTO clients (id, workspace_id, name) VALUES ('c','ws','Client');
    INSERT INTO projects (id, workspace_id, name, client_id) VALUES ('p','ws','Project','c');
    INSERT INTO tasks (id, workspace_id, project_id, name, created_by) VALUES ('t','ws','p','Task','u-leaver');
    INSERT INTO task_assignees (workspace_id, task_id, user_id) VALUES ('ws','t','u-leaver');
    INSERT INTO task_comments (workspace_id, task_id, user_id, body) VALUES ('ws','t','u-leaver','hello');
    INSERT INTO time_entries (id, workspace_id, project_id, description, start, stop, duration, user_id) VALUES
      ('e1','ws','p','by leaver','${NOW}','${NOW}',3600,'u-leaver');
    INSERT INTO recurring_entries (workspace_id, description, project_id, duration_seconds, days_of_week, time_utc, user_id)
      VALUES ('ws','daily','p',900,'1,2,3',540,'u-leaver');
    INSERT INTO integrations (id, workspace_id, type, name, base_url, credentials, user_id, auto_track) VALUES ('i','ws','google_calendar','Calendar','','{}','u-leaver',1);
  `);
  const one = <T>(sql: string) => raw.prepare(sql).get() as T;
  return { db, raw, one };
}

describe("deactivateAccount", () => {
  it("keeps every record the workspace owns, with its author", async () => {
    const { db, one } = world();
    await deactivateAccount(db, "u-leaver");

    expect(one<{ n: number }>(`SELECT COUNT(*) n FROM workspaces WHERE id = 'ws'`).n).toBe(1);
    expect(one<{ user_id: string }>(`SELECT user_id FROM time_entries WHERE id = 'e1'`).user_id).toBe("u-leaver");
    expect(one<{ created_by: string }>(`SELECT created_by FROM tasks WHERE id = 't'`).created_by).toBe("u-leaver");
    expect(one<{ n: number }>(`SELECT COUNT(*) n FROM task_assignees`).n).toBe(1);
    expect(one<{ n: number }>(`SELECT COUNT(*) n FROM task_comments`).n).toBe(1);
    expect(one<{ n: number }>(`SELECT COUNT(*) n FROM projects`).n).toBe(1);
    expect(one<{ n: number }>(`SELECT COUNT(*) n FROM recurring_entries`).n).toBe(1);
    expect(one<{ n: number }>(`SELECT COUNT(*) n FROM integrations`).n).toBe(1);
  });

  it("locks the account out and stops everything that would act for it", async () => {
    const { db, one } = world();
    await deactivateAccount(db, "u-leaver");

    const user = one<{ banned: number; banReason: string; digest_daily: number }>(
      `SELECT banned, banReason, digest_daily FROM "user" WHERE id = 'u-leaver'`
    );
    expect(user).toEqual({ banned: 1, banReason: DEACTIVATED_REASON, digest_daily: 0 });
    expect(one<{ n: number }>(`SELECT COUNT(*) n FROM session WHERE userId = 'u-leaver'`).n).toBe(0);
    expect(one<{ n: number }>(`SELECT COUNT(*) n FROM member WHERE userId = 'u-leaver'`).n).toBe(0);
    expect(one<{ active: number }>(`SELECT active FROM recurring_entries`).active).toBe(0);
    expect(one<{ auto_track: number }>(`SELECT auto_track FROM integrations`).auto_track).toBe(0);
    // The other person is untouched.
    expect(one<{ n: number }>(`SELECT COUNT(*) n FROM member WHERE userId = 'u-owner'`).n).toBe(1);
  });
});

describe("soleOwnedWorkspaces", () => {
  it("names a workspace only when no other owner remains", async () => {
    const { db, raw } = world();
    expect(await soleOwnedWorkspaces(db, "u-owner")).toEqual(["Acme"]);
    expect(await soleOwnedWorkspaces(db, "u-leaver")).toEqual([]);
    raw.exec(`UPDATE member SET role = 'owner' WHERE id = 'm1'`);
    expect(await soleOwnedWorkspaces(db, "u-owner")).toEqual([]);
  });
});

describe("reactivateIfDeactivated", () => {
  it("lifts a deactivation, whatever the email's case", async () => {
    const { db, one } = world();
    await deactivateAccount(db, "u-leaver");
    expect(await reactivateIfDeactivated(db, "Leaver@X.test")).toBe(true);
    expect(one<{ banned: number }>(`SELECT banned FROM "user" WHERE id = 'u-leaver'`).banned).toBe(0);
  });

  it("never lifts a moderation ban", async () => {
    const { db, raw, one } = world();
    raw.exec(`UPDATE "user" SET banned = 1, banReason = 'Spam' WHERE id = 'u-leaver'`);
    expect(await reactivateIfDeactivated(db, "leaver@x.test")).toBe(false);
    expect(one<{ banned: number }>(`SELECT banned FROM "user" WHERE id = 'u-leaver'`).banned).toBe(1);
  });
});
