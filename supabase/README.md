# Royal FinTech Supabase request intake

## Live project
- Supabase project: `lqpfyanfbyafnfmexmuu` (Royal-FinTech-Website, eu-west-1)
- Edge Functions: `app-requests`, `admin-push`
- Website client: `supabase/app-requests-client.js`
- Push worker: `supabase/royal-fintech-push-sw.js`
- Primary page: `royal_fintech_website.html`

## Database
The migration `create_app_request_intake_and_admin_notifications` creates:
- `public.app_requests`: customer/project brief, flexible budget fields, status, priority, assignment and admin notes.
- `public.app_request_events`: admin action/status audit history.
- `public.admin_notifications`: in-app admin notification inbox.
- `public.admin_notification_subscriptions`: browser push subscriptions.

All tables have Row Level Security enabled and no client-facing policies. Direct anonymous/authenticated table access is revoked. The Edge Functions use the service role only on the server and validate an authenticated user for protected admin operations. Never put the service-role key in website code.

## Public request submission
`POST /functions/v1/app-requests?action=submit`

The five-step form now calls `window.RFAppRequests.submit(payload)`. It sends contact details, project type/name/summary, platforms, requested features, budget preference, timeline, language/currency, and selected file names as additional details. File contents are not uploaded to Supabase storage in this implementation.

The Edge Function returns `{ ok: true, request: { id, request_number, created_at, status }, notification_email, message }`. The website only displays a central-submission success after the returned request number is present. If submission fails, the page explicitly says the request was not saved centrally and offers WhatsApp/email fallback. Browser-local cache is not presented as server storage.

## Admin API (real Supabase Auth JWT required)
- `GET /app-requests?action=list&page=0&page_size=25&status=new&q=`
- `GET /app-requests?action=notifications`
- `PATCH /app-requests?action=update` with `{ "id": "UUID", "status": "reviewing", "priority": "normal", "admin_notes": "..." }`
- `POST /app-requests?action=mark_read` with `{ "id": "UUID" }`

Pass a real Supabase Auth access token in `Authorization: Bearer <access-token>`. The user must have trusted `app_metadata.role=admin` or `app_metadata.roles` containing `admin`. The website's Applications panel has a **Refresh Supabase** action and attempts a central load using `sessionStorage.rft_admin_access_token`. The existing legacy admin login is not automatically a Supabase Auth session, so central admin loading remains locked until the login flow is configured to obtain a real Supabase Auth token. Do not treat a localStorage flag, hidden URL, or client-side PIN as administrator authorization.

## Notifications
A new request creates an in-app notification row in the database. Optional email notification uses Resend only when `RESEND_API_KEY`, `ADMIN_NOTIFICATION_EMAIL`, and a verified `RESEND_FROM_EMAIL` are configured. Without these secrets, the request is still saved and the API reports `notification_email: not_configured`.

Browser push requires these Edge Function secrets:
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (e.g. `mailto:royalfintechcompany@gmail.com`)
- `SITE_ORIGIN` (currently `https://royalfintech.github.io`)

The push worker is included, and the client exposes `enablePush(accessToken)`. VAPID secrets, an authenticated admin token, notification permission and the subscription action are required. Automatic push dispatch on every new submission is not yet connected to a trusted server-side trigger.

## Verification and limitations
- Confirmed the latest primary HTML contains the client script, asynchronous Supabase submission flow, response-envelope handling, honest failure state, and admin refresh action.
- Confirmed the public Edge Function response shape and the live schema columns against Supabase metadata.
- Confirmed both Edge Functions are reported ACTIVE.
- No end-to-end browser submission, admin login, email delivery or push delivery has been claimed. Those require browser testing, real admin Auth setup and provider secrets.
