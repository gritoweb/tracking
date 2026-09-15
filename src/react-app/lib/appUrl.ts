import { appHost, normalizeAppUrl } from "@shared/app";

/** Build-time value from .env (VITE_APP_URL); the SPA has no runtime env. */
export const APP_URL = normalizeAppUrl(import.meta.env.VITE_APP_URL ?? window.location.origin);

export const APP_HOST = appHost(APP_URL);
