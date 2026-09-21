import { DatabaseSync, type SQLInputValue } from "node:sqlite";

const MIGRATIONS = import.meta.glob<string>("../../migrations/*.sql", { query: "?raw", import: "default", eager: true });

/** A real in-memory SQLite with every migration applied, behind the slice of the D1 API the worker uses. */
export function createMigratedD1() {
  const raw = new DatabaseSync(":memory:");
  for (const file of Object.keys(MIGRATIONS).sort()) raw.exec(MIGRATIONS[file]);

  const db = {
    prepare(sql: string) {
      let params: SQLInputValue[] = [];
      const statement = {
        bind(...values: unknown[]) {
          params = values as SQLInputValue[];
          return statement;
        },
        async run() {
          const { changes } = raw.prepare(sql).run(...params);
          return { success: true, meta: { changes: Number(changes) } };
        },
        async all() {
          return { results: raw.prepare(sql).all(...params) };
        },
        async first() {
          return raw.prepare(sql).get(...params) ?? null;
        },
      };
      return statement;
    },
  };

  return { db: db as unknown as D1Database, raw };
}
