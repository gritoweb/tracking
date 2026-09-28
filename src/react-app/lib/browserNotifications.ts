import type { Notification as BellNotification } from "@shared/schemas";
import { fromBase64Url } from "@shared/base64url";
import { api } from "./api-client";
import { notificationsSupported, requestNotifyPermission } from "./notify";
import { useUIStore } from "@/stores/uiStore";

const SW_URL = "/sw.js";

export type BrowserNotificationState = "unsupported" | "blocked" | "off" | "on";

// True once this browser holds a push subscription: the service worker then shows everything, and the page stays quiet.
let pushActive = false;

export function browserNotificationsSupported(): boolean {
  return notificationsSupported() && "serviceWorker" in navigator;
}

function pushSupported(): boolean {
  return browserNotificationsSupported() && "PushManager" in window;
}

export function browserNotificationState(): BrowserNotificationState {
  if (!browserNotificationsSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return Notification.permission === "granted" && useUIStore.getState().browserNotifications ? "on" : "off";
}

async function subscribe(registration: ServiceWorkerRegistration): Promise<void> {
  const { publicKey } = await api.push.config();
  // No key on the server: the page's own notifications (site open, any tab) still work.
  if (!publicKey || !pushSupported()) return;
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(publicKey) }));
  await api.push.subscribe(subscription.endpoint);
  pushActive = true;
}

/** Asks the browser, registers the service worker and subscribes it; must run from a click. */
export async function enableBrowserNotifications(): Promise<BrowserNotificationState> {
  if (!browserNotificationsSupported()) return "unsupported";
  if (!(await requestNotifyPermission())) return browserNotificationState();
  await subscribe(await navigator.serviceWorker.register(SW_URL));
  useUIStore.getState().setBrowserNotifications(true);
  return "on";
}

export async function disableBrowserNotifications(): Promise<void> {
  useUIStore.getState().setBrowserNotifications(false);
  pushActive = false;
  const subscription = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
  if (!subscription) return;
  await api.push.unsubscribe(subscription.endpoint);
  await subscription.unsubscribe();
}

/** On load: re-claims this browser's subscription for whoever is signed in now. */
export async function syncBrowserNotifications(): Promise<void> {
  if (browserNotificationState() !== "on") return;
  await subscribe(await navigator.serviceWorker.register(SW_URL));
}

/** A new bell notification while the app is open but not in view, for a browser without push. */
export async function showFromPage(notification: BellNotification): Promise<void> {
  if (pushActive || !document.hidden || browserNotificationState() !== "on") return;
  const registration = await navigator.serviceWorker.getRegistration();
  registration?.active?.postMessage({ type: "show", notification });
}
