import { describe, expect, it } from "vitest";
import { DEFAULT_STATUSES } from "./task-statuses";
import migrationSql from "../../../migrations/0047_default_task_statuses.sql?raw";

// The migration that brings existing databases to the defaults repeats them as literals; this keeps the two from drifting.
const migration = migrationSql.replace(/\s+/g, " ");

describe("default task statuses", () => {
  it("are the seven a workspace is born with, in board order", () => {
    expect(DEFAULT_STATUSES.map((s) => s.name)).toEqual([
      "Backlog", "On hold", "Pendente", "Em progresso", "QA", "Client review", "Closed",
    ]);
  });

  it("has exactly one default column, and it is a not-started one", () => {
    const defaults = DEFAULT_STATUSES.filter((s) => s.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].category).toBe("not_started");
  });

  it("keeps at least one open and one completed column", () => {
    expect(DEFAULT_STATUSES.some((s) => s.category === "not_started")).toBe(true);
    expect(DEFAULT_STATUSES.some((s) => s.category === "completed")).toBe(true);
  });

  it("match the literals in migration 0047 (name, colour, category and position)", () => {
    DEFAULT_STATUSES.forEach((s, i) => {
      const inserted = `'${s.name}', '${s.color}', '${s.category}', ${i + 1}, 0`;
      expect(migration, `insert for ${s.name}`).toContain(inserted);
      const updated = `color = '${s.color}', category = '${s.category}', sort_order = ${i + 1} WHERE project_id IS NULL AND archived = 0 AND lower(name) = '${s.name.toLowerCase()}'`;
      expect(migration, `normalize for ${s.name}`).toContain(updated);
    });
  });
});
