/** One prepared-statement call: the raw SQL and whatever `.bind()` received. */
export interface D1StubCall {
  sql: string;
  params: unknown[];
}

export interface D1StubHandlers {
  all?: (call: D1StubCall) => { results: unknown[] } | Promise<{ results: unknown[] }>;
  first?: (call: D1StubCall) => unknown | Promise<unknown>;
  run?: (call: D1StubCall) => unknown | Promise<unknown>;
}

export interface D1Stub {
  db: D1Database;
  calls: D1StubCall[];
}

/** Fakes the D1 prepare/bind/all/first/run chain so callers never need a real database. */
export function createD1Stub(handlers: D1StubHandlers = {}): D1Stub {
  const calls: D1StubCall[] = [];

  const db = {
    prepare(sql: string) {
      const call: D1StubCall = { sql, params: [] };
      const statement = {
        bind(...params: unknown[]) {
          call.params = params;
          return statement;
        },
        async all<T = unknown>() {
          calls.push(call);
          const result = (await handlers.all?.(call)) ?? { results: [] };
          return result as { results: T[] };
        },
        async first<T = unknown>() {
          calls.push(call);
          const result = (await handlers.first?.(call)) ?? null;
          return result as T | null;
        },
        async run<T = unknown>() {
          calls.push(call);
          const result = (await handlers.run?.(call)) ?? { success: true };
          return result as T;
        },
      };
      return statement;
    },
  };

  return { db: db as unknown as D1Database, calls };
}
