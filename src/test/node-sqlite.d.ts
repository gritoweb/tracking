// Only the slice of node:sqlite the tests use, so the worker project needs no Node typings.
declare module "node:sqlite" {
  export type SQLInputValue = null | number | bigint | string | Uint8Array;
  export class DatabaseSync {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): {
      run(...params: SQLInputValue[]): { changes: number | bigint };
      all(...params: SQLInputValue[]): unknown[];
      get(...params: SQLInputValue[]): unknown;
    };
  }
}
