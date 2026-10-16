/* Royal FinTech admin web-push worker. Served from /Royal-FinTech-Website/supabase/. */
self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) {
    payload = { title: "Royal FinTech update", body: event.data ? event.data.text() : "A new admin update is available." };
  }
  const title = typeof payload.title === "string" ? payload.title : "Royal FinTech update";
  const options = {
    body: typeof payload.body === "string" ? payload.body : "A new update is available in the admin portal.",
    icon: "/Royal-FinTech-Website/assets/royal-fintech-logo.png",
    badge: "/Royal-FinTech-Website/assets/royal-fintech-logo.png",
    tag: "royal-fintech-admin",
    renotify: false,
    data: { url: typeof payload.url === "string" ? payload.url : "/Royal-FinTech-Website/royal_fintech_website.html#admin" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data && event.notification.data.url || "/Royal-FinTech-Website/royal_fintech_website.html#admin", self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(windows => {
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin + "/Royal-FinTech-Website/") && "focus" in client) {
        client.navigate(target);
        return client.focus();
      }
    }
    return clients.openWindow(target);
  }));
});
