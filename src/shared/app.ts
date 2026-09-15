/** Where this app lives. One constant, so a domain change is one edit, not a grep. */
export const APP_URL = "https://tracking.gritoweb.com.br";

/** Host only, for copy and allow-lists that shouldn't carry the scheme. */
export const APP_HOST = new URL(APP_URL).host;

/** The deployed override wins, so an environment can answer on its own domain. */
export function appUrl(env: { APP_URL?: string }): string {
  return env.APP_URL?.replace(/\/+$/, "") || APP_URL;
}
