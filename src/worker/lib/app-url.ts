import { normalizeAppUrl } from "@shared/app";

/** Where this deployment answers, from the environment — never a constant in code. */
export function appUrl(env: { APP_URL?: string }): string {
  if (!env.APP_URL) {
    throw new Error("APP_URL is not set (wrangler.jsonc vars for deploys, .dev.vars locally)");
  }
  return normalizeAppUrl(env.APP_URL);
}
