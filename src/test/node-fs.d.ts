// Only the slice of node:fs the tests use, so the app project needs no Node typings.
declare module "node:fs" {
  export function readFileSync(path: string | URL, encoding: "utf8"): string;
}
