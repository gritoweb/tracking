import { DatabaseSync, type SQLInputValue } from "node:sqlite";

const MIGRATIONS = import.meta.glob<string>("../../migrations/*.sql", { query: "?raw", import: "default", eager: true });

/** A real in-memory SQLite with every migration applied, behind the slice of the D1 API the worker uses. */
export function createMigratedD1() {
  const raw = new DatabaseSync(":memory:");
  for (const file of Object.keys(MIGRATIONS).sort()) raw.exec(MIGRATIONS[file]);

  const returnsRows = (sql: string) => /^\s*(select|with|pragma)\b/i.test(sql);

  const db = {
    prepare(sql: string) {
      let params: SQLInputValue[] = [];
      const statement = {
        // D1's batch runs each statement in one transaction and answers with one result per statement.
        execute() {
          if (returnsRows(sql)) return { success: true, results: raw.prepare(sql).all(...params), meta: { changes: 0 } };
          return { success: true, results: [], meta: { changes: Number(raw.prepare(sql).run(...params).changes) } };
        },
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
    async batch(statements: { execute(): unknown }[]) {
      raw.exec("BEGIN");
      try {
        const results = statements.map((statement) => statement.execute());
        raw.exec("COMMIT");
        return results;
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    },
  };

  return { db: db as unknown as D1Database, raw };
}
