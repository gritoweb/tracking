import { describe, expect, it } from "vitest";
import { createMigratedD1 } from "../../test/sqlite-d1";

// Migration 0049: whichever code path writes an entry, the database itself refuses one with no project.
function database() {
  const { raw } = createMigratedD1();
  raw.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws', 'W');
    INSERT INTO clients (id, workspace_id, name) VALUES ('cl', 'ws', 'Client');
    INSERT INTO projects (id, workspace_id, name, client_id) VALUES ('p1', 'ws', 'One', 'cl');
    INSERT INTO projects (id, workspace_id, name, client_id) VALUES ('p2', 'ws', 'Two', 'cl');
    INSERT INTO time_entries (id, workspace_id, project_id, start) VALUES ('e1', 'ws', 'p1', '2026-01-01T09:00:00Z');
  `);
  const fails = (sql: string) => {
    try {
      raw.exec(sql);
      return null;
    } catch (error) {
      return (error as Error).message;
    }
  };
  const count = (sql: string) => (raw.prepare(sql).get() as { n: number }).n;
  return { raw, fails, count };
}

describe("time_entries require a project (0049)", () => {
  it("accepts an entry that has one", () => {
    const { fails } = database();
    expect(fails(`INSERT INTO time_entries (id, workspace_id, project_id, start) VALUES ('e2', 'ws', 'p2', '2026-01-02T09:00:00Z')`)).toBeNull();
  });

  it("refuses an insert with no project, and stores nothing", () => {
    const { fails, count } = database();
    expect(fails(`INSERT INTO time_entries (id, workspace_id, start) VALUES ('e2', 'ws', '2026-01-02T09:00:00Z')`)).toContain("needs a project");
    expect(fails(`INSERT INTO time_entries (id, workspace_id, project_id, start) VALUES ('e3', 'ws', NULL, '2026-01-02T09:00:00Z')`)).toContain("needs a project");
    expect(count(`SELECT COUNT(*) AS n FROM time_entries`)).toBe(1);
  });

  it("refuses to clear the project of an entry", () => {
    const { fails, count } = database();
    expect(fails(`UPDATE time_entries SET project_id = NULL WHERE id = 'e1'`)).toContain("needs a project");
    expect(count(`SELECT COUNT(*) AS n FROM time_entries WHERE project_id = 'p1'`)).toBe(1);
  });

  it("still lets an entry move to another project and be edited otherwise", () => {
    const { fails, count } = database();
    expect(fails(`UPDATE time_entries SET project_id = 'p2', description = 'moved' WHERE id = 'e1'`)).toBeNull();
    expect(fails(`UPDATE time_entries SET stop = '2026-01-01T10:00:00Z', duration = 3600 WHERE id = 'e1'`)).toBeNull();
    expect(count(`SELECT COUNT(*) AS n FROM time_entries WHERE project_id = 'p2' AND duration = 3600`)).toBe(1);
  });

  it("refuses to delete a project that has hours (it is archived instead), but not an empty one", () => {
    const { fails, count } = database();
    expect(fails(`DELETE FROM projects WHERE id = 'p1'`)).toContain("needs a project");
    expect(count(`SELECT COUNT(*) AS n FROM projects`)).toBe(2);
    expect(fails(`DELETE FROM projects WHERE id = 'p2'`)).toBeNull();
  });

  it("does not get in the way of deleting a whole workspace", () => {
    const { fails, count } = database();
    expect(fails(`DELETE FROM workspaces WHERE id = 'ws'`)).toBeNull();
    expect(count(`SELECT COUNT(*) AS n FROM time_entries`)).toBe(0);
  });
});
