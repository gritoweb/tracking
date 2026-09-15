import { appHost, normalizeAppUrl } from "@shared/app";

/** Build-time value from .env (VITE_APP_URL); a Chrome extension has no runtime env. */
export const APP_URL = normalizeAppUrl(
  import.meta.env.VITE_APP_URL ?? "http://localhost:5173"
);

export const APP_HOST = appHost(APP_URL);
