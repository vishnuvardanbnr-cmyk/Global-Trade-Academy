/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;

// VitePWA injects the precache manifest here
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.skipWaiting();
self.addEventListener("activate", () => self.clients.claim());

/* ── Push notifications ──────────────────────────────────────────── */
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload: { title?: string; body?: string; data?: Record<string, unknown> } = {};
  try {
    payload = event.data.json() as typeof payload;
  } catch {
    payload = { title: "Bright Insight", body: event.data.text() };
  }

  const title = payload.title ?? "Bright Insight";
  const options: NotificationOptions = {
    body: payload.body,
    icon: "/icons/icon-192x192.png",
    badge: "/icons/badge-72x72.png",
    data: payload.data ?? {},
    vibrate: [150, 50, 150],
    tag: String(payload.data?.type ?? "notification"),
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/* ── Notification click — open / focus the app ───────────────────── */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = "/copy-trading"; // default destination for trade notifications
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((c) => c.url.includes(self.location.origin));
        if (existing) {
          existing.focus();
          existing.navigate(target);
        } else {
          self.clients.openWindow(target);
        }
      }),
  );
});
