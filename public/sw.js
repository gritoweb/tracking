// TimeTracker service worker: a push wakes it, it shows what the bell shows, and a click opens that task.
// The push carries no data (docs/PUSH_NOTIFICATIONS.md), so every notification is read from /api/notifications.

const SHOWN_CACHE = "timetracker-push";
const SHOWN_KEY = "/__shown-notification-ids";
const SHOWN_LIMIT = 100;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_PER_PUSH = 3;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

async function readShown() {
  const res = await (await caches.open(SHOWN_CACHE)).match(SHOWN_KEY);
  return res ? res.json() : [];
}

async function writeShown(ids) {
  const cache = await caches.open(SHOWN_CACHE);
  await cache.put(SHOWN_KEY, new Response(JSON.stringify(ids.slice(-SHOWN_LIMIT))));
}

async function showUnread() {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  // Someone looking at the app sees it arrive in the bell, so only the test (asked for from the app itself) pops up then.
  const appInFocus = windows.some((w) => w.focused);

  let notifications = [];
  try {
    const res = await fetch("/api/notifications", { credentials: "same-origin" });
    if (res.ok) notifications = (await res.json()).notifications;
  } catch {
    return;
  }

  const shown = await readShown();
  const fresh = notifications
    .filter((n) => !n.isRead && !shown.includes(n.id) && Date.now() - Date.parse(n.createdAt) < MAX_AGE_MS)
    .filter((n) => !appInFocus || n.type === "test")
    .slice(0, MAX_PER_PUSH);
  if (!fresh.length) return;

  await writeShown([...shown, ...fresh.map((n) => n.id)]);
  await Promise.all(
    fresh.map((n) =>
      self.registration.showNotification(n.title, {
        body: n.body,
        icon: "/logo192.png",
        badge: "/maskable-192.png",
        tag: n.id,
        data: { id: n.id, link: n.link },
      })
    )
  );
}

self.addEventListener("push", (event) => event.waitUntil(showUnread()));

// The page shows its own when push isn't on; this handles those clicks too.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "show" || !event.data.notification) return;
  const n = event.data.notification;
  event.waitUntil(
    readShown().then(async (shown) => {
      if (shown.includes(n.id)) return;
      await writeShown([...shown, n.id]);
      await self.registration.showNotification(n.title, {
        body: n.body,
        icon: "/logo192.png",
        badge: "/maskable-192.png",
        tag: n.id,
        data: { id: n.id, link: n.link },
      });
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { id, link } = event.notification.data || {};
  const path = link || "/";
  event.waitUntil(
    (async () => {
      // Opening it is reading it, so the bell clears and Slack stays quiet.
      if (id) {
        await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, {
          method: "PATCH",
          credentials: "same-origin",
        }).catch(() => {});
      }
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        open.postMessage({ type: "open-notification", link: path });
        return;
      }
      await self.clients.openWindow(new URL(path, self.location.origin).href);
    })()
  );
});
