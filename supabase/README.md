# Royal FinTech Supabase request intake

## Live project
- Supabase project: `lqpfyanfbyafnfmexmuu` (Royal-FinTech-Website, eu-west-1)
- Edge Function: `app-requests`
- Edge Function: `admin-push`
- Browser helper: `supabase/app-requests-client.js`
- Push worker: `supabase/royal-fintech-push-sw.js`

## What is deployed
The migration `create_app_request_intake_and_admin_notifications` creates:
- `public.app_requests`: customer/project brief, quote range, status, priority, assignment and admin notes.
- `public.app_request_events`: admin action/status audit history.
- `public.admin_notifications`: in-app admin notification inbox.
- `public.admin_notification_subscriptions`: browser push subscriptions.

All four tables have RLS enabled and no client-facing policies. Direct anonymous/authenticated table access is revoked; the Edge Functions use the server-side service role only after validating input and (for admin actions) validating an authenticated user whose `app_metadata.role` is `admin` or whose `app_metadata.roles` includes `admin`. Never put the service-role key in website code.

## API
Base URL: `https://lqpfyanfbyafnfmexmuu.supabase.co/functions/v1`

### Submit a request (public)
`POST /app-requests?action=submit`
JSON payload accepts `full_name`, `email`, `project_summary` plus optional phone/country, company, language/currency, project type/name, platforms, features, audience, timeline, flexible budget range, integrations, reference URLs and additional details. It returns a request number only after the database insert succeeds. The `website` field is a honeypot. The site should show the returned request number and never claim success on an error.

### Admin actions (JWT required)
- `GET /app-requests?action=list&page=0&page_size=25&status=new&q=`
- `GET /app-requests?action=notifications`
- `PATCH /app-requests?action=update` with `{ "id": "...", "status": "reviewing", "priority": "normal", "admin_notes": "..." }`
- `POST /app-requests?action=mark_read` with `{ "id": "..." }`

Pass a real Supabase Auth user access token in `Authorization: Bearer <access-token>`. A user must have trusted admin app metadata. Do not treat a localStorage flag, hidden URL, or client-side PIN as administrator authentication. If no real admin auth exists yet, the admin API deliberately returns 401.

### Push notifications
`admin-push?action=public-key` returns the VAPID public key only after push secrets are configured.
`POST /admin-push?action=subscribe` registers a signed-in admin's browser subscription.
`POST /admin-push?action=dispatch` sends a test/update push to registered admins (admin JWT required).

Set these Edge Function secrets in Supabase before enabling browser push:
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (e.g. `mailto:royalfintechcompany@gmail.com`)
- `SITE_ORIGIN` (the exact public site origin, currently `https://royalfintech.github.io`)

The push worker needs to be served over HTTPS. Users must grant browser notification permission. Browser push is not configured merely by deploying the function; VAPID secrets and the UI subscription action are required. Automatic push dispatch on every new submission still needs a trusted server-to-server trigger; the database inbox is written immediately when a request is saved.

## Email
The submission function writes the request and the in-app notification first. Optional email notification uses Resend only when `RESEND_API_KEY`, `ADMIN_NOTIFICATION_EMAIL`, and a verified `RESEND_FROM_EMAIL` are configured. Without these secrets, requests still save and the response reports `notification_email: not_configured`. Do not claim email delivery unless the provider reports success.

## Website integration status
The helper exposes `window.RFAppRequests.submit/list/notifications/update/markNotificationRead/enablePush`. The primary HTML form and admin UI still need to call these helpers. The GitHub connector currently returns an empty content body for the existing primary HTML despite returning a blob SHA, so that file could not be safely edited in this pass. Do not assume the existing public form is already sending to Supabase until it is wired and tested in the page.

## Verification
Migration applied and table/function metadata re-queried. Edge functions are reported ACTIVE. No end-to-end browser submission/admin login/push delivery has been claimed; perform those after UI integration, admin Auth setup, and provider secrets are configured.
