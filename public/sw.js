self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'WhatSpot', {
      body: data.body ?? '',
      icon: '/whatspot_question_marker_icon.png',
      badge: '/whatspot_question_marker_icon.png',
      tag: data.tag ?? 'whatspot-request',
      data: { url: data.url ?? '/' },
      requireInteraction: data.requireInteraction ?? false,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => {
        const existing = list.find((c) => 'focus' in c);
        if (existing) return existing.focus();
        return clients.openWindow(url);
      })
  );
});
