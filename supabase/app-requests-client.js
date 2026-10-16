/* Royal FinTech — Supabase request intake client.
 * Browser-safe: publishable key only. Never put service-role keys in this file.
 * Load after the Request App form markup, then call window.RFAppRequests.submit(payload).
 */
(function (window) {
  "use strict";
  const CONFIG = Object.freeze({
    url: "https://lqpfyanfbyafnfmexmuu.supabase.co",
    publishableKey: "sb_publishable_H06Z3HcJ1A2NYmHDMn7qZQ_5JH_-9mT",
    requestFunction: "app-requests",
    pushFunction: "admin-push",
    serviceWorkerPath: "/Royal-FinTech-Website/supabase/royal-fintech-push-sw.js",
    serviceWorkerScope: "/Royal-FinTech-Website/"
  });
  const endpoint = (name, query) => CONFIG.url + "/functions/v1/" + name + (query ? "?" + query : "");
  function headers(accessToken) {
    const result = { "Content-Type": "application/json", "apikey": CONFIG.publishableKey };
    if (accessToken) result.Authorization = "Bearer " + accessToken;
    return result;
  }
  async function parseResponse(response) {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error || body.message || "The service could not complete this action.");
      error.status = response.status;
      error.details = body;
      throw error;
    }
    return body;
  }
  async function submit(payload) {
    if (!payload || typeof payload !== "object") throw new Error("Please review your project details and try again.");
    const response = await fetch(endpoint(CONFIG.requestFunction, "action=submit"), {
      method: "POST", headers: headers(), body: JSON.stringify(payload)
    });
    return parseResponse(response);
  }
  async function list({ accessToken, status = "all", q = "", page = 0, pageSize = 25 } = {}) {
    if (!accessToken) throw new Error("Please sign in with an authorized administrator account.");
    const query = new URLSearchParams({ action: "list", status, q, page: String(page), page_size: String(pageSize) });
    return parseResponse(await fetch(endpoint(CONFIG.requestFunction, query.toString()), { headers: headers(accessToken) }));
  }
  async function notifications(accessToken) {
    if (!accessToken) throw new Error("Please sign in with an authorized administrator account.");
    return parseResponse(await fetch(endpoint(CONFIG.requestFunction, "action=notifications"), { headers: headers(accessToken) }));
  }
  async function update({ accessToken, id, status, priority, admin_notes } = {}) {
    if (!accessToken) throw new Error("Please sign in with an authorized administrator account.");
    return parseResponse(await fetch(endpoint(CONFIG.requestFunction, "action=update"), {
      method: "PATCH", headers: headers(accessToken), body: JSON.stringify({ id, status, priority, admin_notes })
    }));
  }
  async function markNotificationRead({ accessToken, id } = {}) {
    if (!accessToken) throw new Error("Please sign in with an authorized administrator account.");
    return parseResponse(await fetch(endpoint(CONFIG.requestFunction, "action=mark_read"), {
      method: "POST", headers: headers(accessToken), body: JSON.stringify({ id })
    }));
  }
  function urlBase64ToUint8Array(base64) {
    const padding = "=".repeat((4 - base64.length % 4) % 4);
    const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }
  async function enablePush(accessToken) {
    if (!accessToken) throw new Error("Admin sign-in is required to enable notifications.");
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("This browser does not support web push notifications.");
    const keyResult = await parseResponse(await fetch(endpoint(CONFIG.pushFunction, "action=public-key"), { headers: headers(accessToken) }));
    if (!keyResult.enabled || !keyResult.publicKey) throw new Error(keyResult.message || "Browser push has not been configured by the administrator yet.");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Notification permission was not granted.");
    const registration = await navigator.serviceWorker.register(CONFIG.serviceWorkerPath, { scope: CONFIG.serviceWorkerScope });
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(keyResult.publicKey)
    });
    return parseResponse(await fetch(endpoint(CONFIG.pushFunction, "action=subscribe"), {
      method: "POST", headers: headers(accessToken), body: JSON.stringify({ subscription: subscription.toJSON() })
    }));
  }
  window.RFAppRequests = Object.freeze({
    submit, list, notifications, update, markNotificationRead, enablePush,
    config: Object.freeze({ projectUrl: CONFIG.url, requestFunction: CONFIG.requestFunction })
  });
})(window);
