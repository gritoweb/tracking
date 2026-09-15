/** Only for `pnpm email:dev`, which renders templates outside a request. */
declare const process: { env: Record<string, string | undefined> } | undefined;

export const PREVIEW_APP_URL =
  (typeof process !== "undefined" ? process.env.APP_URL : undefined) ?? "http://localhost:5173";
