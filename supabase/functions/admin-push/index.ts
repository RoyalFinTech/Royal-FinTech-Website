import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:royalfintechcompany@gmail.com";
const ORIGIN = Deno.env.get("SITE_ORIGIN") ?? "https://royalfintech.github.io";
const headers = { "Access-Control-Allow-Origin": ORIGIN, "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Vary": "Origin", "Content-Type": "application/json; charset=utf-8" };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const sb = () => createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
async function adminUser(req: Request, db: ReturnType<typeof createClient>) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const { data, error } = await db.auth.getUser(auth.slice(7));
  if (error || !data.user) return null;
  const meta = data.user.app_metadata ?? {};
  if (meta.role !== "admin" && !(Array.isArray(meta.roles) && meta.roles.includes("admin"))) return null;
  return data.user;
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (!["GET","POST"].includes(req.method)) return response({ error: "Method not allowed" }, 405);
  if (req.headers.get("Origin") && req.headers.get("Origin") !== ORIGIN) return response({ error: "Origin not allowed" }, 403);
  const db = sb();
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("action") === "public-key") {
    if (!VAPID_PUBLIC) return response({ enabled: false, message: "Push notifications are not configured on this project yet." }, 503);
    return response({ enabled: true, publicKey: VAPID_PUBLIC });
  }
  const internalDispatch = req.method === "POST" &&
    url.searchParams.get("action") === "dispatch" &&
    !!SERVICE &&
    req.headers.get("Authorization") === `Bearer ${SERVICE}`;
  const admin = internalDispatch ? { id: "internal-service" } : await adminUser(req, db);
  if (!admin) return response({ error: "Admin access required." }, 401);
  if (req.method === "POST" && url.searchParams.get("action") === "subscribe") {
    const body = await req.json();
    const sub = body.subscription;
    if (!sub || typeof sub.endpoint !== "string" || !sub.keys?.p256dh || !sub.keys?.auth || sub.endpoint.length > 2048) return response({ error: "Invalid push subscription." }, 422);
    const { error } = await db.from("admin_notification_subscriptions").upsert({
      user_id: admin.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth_secret: sub.keys.auth,
      user_agent: (req.headers.get("user-agent") ?? "").slice(0, 500)
    }, { onConflict: "user_id,endpoint" });
    if (error) return response({ error: "Could not save notification subscription." }, 500);
    return response({ ok: true, message: "This admin browser is subscribed to notifications." });
  }
  if (req.method === "POST" && url.searchParams.get("action") === "dispatch") {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) return response({ sent: 0, configured: false, message: "VAPID keys must be configured before browser push can be delivered." }, 503);
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    const body = await req.json();
    const title = typeof body.title === "string" ? body.title.slice(0, 120) : "Royal FinTech update";
    const message = typeof body.body === "string" ? body.body.slice(0, 500) : "A new update is available in the admin portal.";
    const { data: subs, error } = await db.from("admin_notification_subscriptions").select("*");
    if (error) return response({ error: "Could not load push subscriptions." }, 500);
    let sent = 0, failed = 0;
    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_secret } }, JSON.stringify({ title, body: message, url: "/Royal-FinTech-Website/royal_fintech_website.html#admin" }), { TTL: 60 * 60 });
        sent++;
      } catch (e) {
        failed++;
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await db.from("admin_notification_subscriptions").delete().eq("id", sub.id);
        console.error("Push delivery failed", status ?? "unknown");
      }
    }
    return response({ sent, failed, configured: true });
  }
  return response({ error: "Unknown action." }, 404);
});