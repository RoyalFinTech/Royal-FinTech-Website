import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") ?? "";
const ADMIN_NOTIFICATION_EMAIL = Deno.env.get("ADMIN_NOTIFICATION_EMAIL") ?? "royalfintechcompany@gmail.com";
const SITE_ORIGIN = Deno.env.get("SITE_ORIGIN") ?? "https://royalfintech.github.io";

const corsHeaders = {
  "Access-Control-Allow-Origin": SITE_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, GET, PATCH, OPTIONS",
  "Vary": "Origin",
  "Content-Type": "application/json; charset=utf-8",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
function cleanText(value: unknown, max = 1000): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function cleanStringArray(value: unknown, maxItems = 60, maxLen = 180): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).map(v => cleanText(v, maxLen)).filter(Boolean);
}
function validEmail(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function client() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) throw new Error("Server configuration is incomplete.");
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function requireAdmin(req: Request, sb: ReturnType<typeof createClient>) {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  const app = data.user.app_metadata ?? {};
  const roles = Array.isArray(app.roles) ? app.roles : [];
  if (app.role !== "admin" && !roles.includes("admin")) return null;
  return data.user;
}
async function sendEmail(subject: string, html: string) {
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) return { sent: false, reason: "email_provider_not_configured" };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [ADMIN_NOTIFICATION_EMAIL],
      subject,
      html,
    }),
  });
  if (!response.ok) {
    console.error("Admin email notification failed", response.status, (await response.text()).slice(0, 300));
    return { sent: false, reason: "email_provider_error" };
  }
  return { sent: true };
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!["POST", "GET", "PATCH"].includes(req.method)) return reply({ error: "Method not allowed" }, 405);
  const origin = req.headers.get("Origin");
  if (origin && origin !== SITE_ORIGIN) return reply({ error: "Origin not allowed" }, 403);
  if (Number(req.headers.get("content-length") ?? "0") > 100_000) return reply({ error: "Request is too large" }, 413);

  let sb;
  try { sb = client(); } catch { return reply({ error: "Request service is not configured yet." }, 503); }

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "submit";

  try {
    if (req.method === "POST" && action === "submit") {
      const payload = await req.json();
      // Honeypot field: bots should receive a generic success without creating a row.
      if (cleanText(payload.website, 200)) return reply({ ok: true, message: "Request received." }, 201);
      const full_name = cleanText(payload.full_name ?? payload.fullName, 160);
      const email = cleanText(payload.email, 254).toLowerCase();
      const project_summary = cleanText(payload.project_summary ?? payload.projectSummary ?? payload.description, 12000);
      if (full_name.length < 2 || !validEmail(email) || project_summary.length < 10) {
        return reply({ error: "Please provide your name, a valid email address, and a project description of at least 10 characters." }, 422);
      }
      const budgetMin = payload.budget_min ?? payload.budgetMin;
      const budgetMax = payload.budget_max ?? payload.budgetMax;
      const numOrNull = (v: unknown) => v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.min(Number(v), 1000000000));
      const row = {
        full_name, email,
        phone_country_code: cleanText(payload.phone_country_code ?? payload.phoneCountryCode, 12) || null,
        phone_number: cleanText(payload.phone_number ?? payload.phone, 40) || null,
        country: cleanText(payload.country, 100) || null,
        company_name: cleanText(payload.company_name ?? payload.companyName, 180) || null,
        preferred_language: cleanText(payload.preferred_language ?? payload.language, 60) || null,
        preferred_currency: cleanText(payload.preferred_currency ?? payload.currency, 12) || null,
        project_type: cleanText(payload.project_type ?? payload.projectType, 100) || null,
        project_name: cleanText(payload.project_name ?? payload.projectName, 180) || null,
        project_summary,
        target_platforms: cleanStringArray(payload.target_platforms ?? payload.platforms),
        requested_features: cleanStringArray(payload.requested_features ?? payload.features),
        design_preferences: cleanText(payload.design_preferences ?? payload.designPreferences, 4000) || null,
        audience: cleanText(payload.audience, 2000) || null,
        timeline: cleanText(payload.timeline, 160) || null,
        budget_min: numOrNull(budgetMin),
        budget_max: numOrNull(budgetMax),
        budget_currency: cleanText(payload.budget_currency ?? payload.budgetCurrency, 12) || null,
        budget_flexible: payload.budget_flexible !== false && payload.budgetFlexible !== false,
        integrations: cleanStringArray(payload.integrations),
        reference_urls: cleanStringArray(payload.reference_urls ?? payload.referenceUrls, 20, 500).filter(v => /^https:\/\//i.test(v)),
        additional_details: payload.additional_details && typeof payload.additional_details === "object" && !Array.isArray(payload.additional_details) ? payload.additional_details : (payload.details && typeof payload.details === "object" ? payload.details : {}),
        source: "website",
        contact_method: cleanText(payload.contact_method ?? payload.contactMethod, 60) || null,
      };
      if (row.budget_min !== null && row.budget_max !== null && row.budget_max < row.budget_min) return reply({ error: "Maximum budget must be at least the minimum budget." }, 422);
      const { data, error } = await sb.from("app_requests").insert(row).select("id,request_number,created_at,status").single();
      if (error) {
        console.error("Request insert failed", error.message);
        return reply({ error: "We could not save your request right now. Please try again or contact Royal FinTech directly." }, 500);
      }
      const notificationTitle = `New project request #${data.request_number}`;
      const notificationBody = `${full_name} submitted a ${row.project_type || "project"} request.`;
      let notificationSaved = false;
      try {
        const { error: notificationError } = await sb.from("admin_notifications").insert({
          request_id: data.id, kind: "new_app_request",
          title: notificationTitle, body: notificationBody,
          metadata: { request_number: data.request_number, project_type: row.project_type },
        });
        notificationSaved = !notificationError;
        if (notificationError) console.error("Admin notification record failed", notificationError.message);
      } catch (notificationError) {
        console.error("Admin notification record failed", notificationError instanceof Error ? notificationError.message : "unknown");
      }
      try {
        const { error: eventError } = await sb.from("app_request_events").insert({
          request_id: data.id, event_type: "request_submitted",
          new_value: { status: data.status, request_number: data.request_number },
          message: "Project request submitted through the public website.",
        });
        if (eventError) console.error("Request audit event failed", eventError.message);
      } catch (eventError) {
        console.error("Request audit event failed", eventError instanceof Error ? eventError.message : "unknown");
      }
      let pushResult: { sent?: number; configured?: boolean; message?: string } = {};
      try {
        const pushResponse = await fetch(`${SUPABASE_URL}/functions/v1/admin-push?action=dispatch`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${SERVICE_ROLE_KEY}`, "apikey": SERVICE_ROLE_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ title: notificationTitle, body: notificationBody }),
        });
        pushResult = await pushResponse.json().catch(() => ({}));
        if (!pushResponse.ok) console.warn("Push dispatch not completed", pushResponse.status, pushResult.message ?? "Push is not configured.");
      } catch (pushError) {
        console.warn("Push dispatch not completed", pushError instanceof Error ? pushError.message : "unknown");
      }
      let emailResult: { sent: boolean; reason?: string } = { sent: false, reason: "email_provider_not_configured" };
      try {
        emailResult = await sendEmail(
          `New Royal FinTech project request #${data.request_number}`,
          `<h2>New project request</h2><p><b>Request:</b> #${data.request_number}</p><p><b>Name:</b> ${escapeHtml(full_name)}</p><p><b>Email:</b> ${escapeHtml(email)}</p><p><b>Type:</b> ${escapeHtml(row.project_type || "Not specified")}</p><p><b>Summary:</b><br>${escapeHtml(project_summary).replaceAll("\n","<br>")}</p><p>Open the authenticated Royal FinTech admin portal to review the full brief.</p>`
        );
      } catch (emailError) {
        console.error("Admin email notification failed", emailError instanceof Error ? emailError.message : "unknown");
        emailResult = { sent: false, reason: "email_provider_error" };
      }
      return reply({ ok: true, request: data, notification_record: notificationSaved ? "saved" : "failed", notification_email: emailResult.sent ? "sent" : (emailResult.reason ?? "not_configured"), push: { sent: pushResult.sent ?? 0, configured: pushResult.configured ?? false }, message: "Your request has been saved. Keep your request number for follow-up." }, 201);
    }

    const admin = await requireAdmin(req, sb);
    if (!admin) return reply({ error: "Admin access required. Please sign in with an authorized administrator account." }, 401);

    if (req.method === "GET" && action === "list") {
      const status = url.searchParams.get("status");
      const search = cleanText(url.searchParams.get("q"), 160);
      const page = Math.max(0, Math.min(10000, Number(url.searchParams.get("page") ?? 0) || 0));
      const pageSize = Math.max(1, Math.min(100, Number(url.searchParams.get("page_size") ?? 25) || 25));
      let query = sb.from("app_requests").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);
      if (status && status !== "all") query = query.eq("status", status);
      if (search) query = query.or(`full_name.ilike.%${search.replace(/[,%()]/g, "")}%,email.ilike.%${search.replace(/[,%()]/g, "")}%,project_name.ilike.%${search.replace(/[,%()]/g, "")}%`);
      const { data, error, count } = await query;
      if (error) return reply({ error: "Could not load project requests." }, 500);
      return reply({ data, count, page, page_size: pageSize });
    }

    if (req.method === "GET" && action === "notifications") {
      const { data, error } = await sb.from("admin_notifications").select("*").or(`user_id.is.null,user_id.eq.${admin.id}`).order("created_at", { ascending: false }).limit(100);
      if (error) return reply({ error: "Could not load notifications." }, 500);
      return reply({ data });
    }

    if (req.method === "PATCH" && action === "update") {
      const body = await req.json();
      const id = cleanText(body.id, 80);
      if (!/^[0-9a-f-]{36}$/i.test(id)) return reply({ error: "A valid request ID is required." }, 422);
      const allowed = ["new","reviewing","needs_information","quoted","approved","in_progress","completed","declined","archived"];
      const patch: Record<string, unknown> = {};
      if (typeof body.status === "string") {
        if (!allowed.includes(body.status)) return reply({ error: "Invalid request status." }, 422);
        patch.status = body.status;
        if (["completed","declined","archived"].includes(body.status)) patch.closed_at = new Date().toISOString();
        else patch.closed_at = null;
      }
      if (typeof body.priority === "string") {
        if (!["low","normal","high","urgent"].includes(body.priority)) return reply({ error: "Invalid priority." }, 422);
        patch.priority = body.priority;
      }
      if (typeof body.admin_notes === "string") patch.admin_notes = body.admin_notes.slice(0, 12000);
      if (Object.keys(patch).length === 0) return reply({ error: "No supported changes provided." }, 422);
      const { data: before } = await sb.from("app_requests").select("status,priority,admin_notes").eq("id", id).maybeSingle();
      const { data, error } = await sb.from("app_requests").update(patch).eq("id", id).select("*").single();
      if (error) return reply({ error: "Could not update this request." }, 500);
      await sb.from("app_request_events").insert({ request_id: id, actor_user_id: admin.id, event_type: "admin_update", old_value: before ?? {}, new_value: patch, message: "Request updated by an administrator." });
      return reply({ data });
    }

    if (req.method === "POST" && action === "mark_read") {
      const body = await req.json();
      const id = cleanText(body.id, 80);
      if (!/^[0-9a-f-]{36}$/i.test(id)) return reply({ error: "A valid notification ID is required." }, 422);
      const { error } = await sb.from("admin_notifications").update({ read_at: new Date().toISOString() }).eq("id", id).or(`user_id.is.null,user_id.eq.${admin.id}`);
      if (error) return reply({ error: "Could not mark notification as read." }, 500);
      return reply({ ok: true });
    }
    return reply({ error: "Unknown action." }, 404);
  } catch (error) {
    console.error("app-requests function error", error instanceof Error ? error.message : "unknown");
    return reply({ error: "Unexpected request-service error." }, 500);
  }
});
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
}
