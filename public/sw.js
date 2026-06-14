self.addEventListener("push", function (event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Corpo & Evolucao", body: event.data ? event.data.text() : "Voce tem uma atualizacao no app." };
  }

  const options = {
    body: data.body || "Voce tem uma atualizacao no app.",
    icon: data.icon || "/icon-192x192.png",
    badge: data.badge || "/icon-192x192.png",
    tag: data.tag || "corpo-evolucao",
    renotify: true,
    requireInteraction: data.requireInteraction !== false,
    vibrate: [160, 80, 160, 80, 240],
    data: {
      dateOfArrival: Date.now(),
      url: data.url || "/portal",
    },
    actions: data.actions || [{ action: "open", title: "Abrir app" }],
  };

  event.waitUntil(self.registration.showNotification(data.title || "Corpo & Evolucao", options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const targetUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : "/portal";

  event.waitUntil((async function () {
    const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of allClients) {
      if ("focus" in client && client.url.includes(self.location.origin)) {
        await client.focus();
        if ("navigate" in client) return client.navigate(targetUrl);
        return;
      }
    }
    return clients.openWindow(targetUrl);
  })());
});
