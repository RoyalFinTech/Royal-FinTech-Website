# Royal FinTech Supabase request intake

## Live project and files

- Supabase project: lqpfyanfbyafnfmexmuu (Royal-FinTech-Website, eu-west-1)
- Primary page: royal_fintech_website.html
- Browser API helper: supabase/app-requests-client.js
- Request API: app-requests Edge Function
- Push API: admin-push Edge Function
- Push worker: royal-fintech-push-sw.js (repository root)

The service-worker file is deliberately hosted at the repository root. Its default maximum scope can then cover /Royal-FinTech-Website/ without requiring a Service-Worker-Allowed response header. See the browser registration rules in the [MDN documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Service-Worker-Allowed).

## Database

The production project has had these migrations applied:

- create_app_request_intake_and_admin_notifications
- index_request_audit_relations_and_harden_admin_rpc

The resulting public tables are:

- app_requests — customer/project brief, flexible budget fields, status, priority, assignment and admin notes.
- app_request_events — audit history for submissions and administrator updates.
- admin_notifications — the in-app administrator notification inbox.
- admin_notification_subscriptions — browser push subscription records.

All four tables have Row Level Security enabled and direct anonymous/authenticated table access revoked. The Edge Functions use the service role only on the server. Protected operations validate the supplied access token with Supabase Auth and require trusted app_metadata role information. Never place the service-role key in website code.

**Migration reproducibility remains a release task:** this branch currently has no supabase/migrations directory or SQL migration files, even though the migrations are present in the live project's history. Export the exact applied SQL and commit it before relying on this repository to recreate the backend in another environment. Do not reconstruct migration SQL from assumptions.

## Customer request submission

The five-step website form calls window.RFAppRequests.submit(payload), which sends the request to:

POST /functions/v1/app-requests?action=submit

The server validates the contact fields and project summary, creates an app_requests record, and returns a request number. The website only reports central submission success when the server returns that number. If the request cannot be saved centrally, the page identifies the failure and offers direct contact alternatives; it does not present a browser-only record as a centrally saved request.

The submitted brief includes contact details, project type/name/summary, target platforms, requested features, budget preference, timeline, language/currency, and selected file names as additional details. File contents are not uploaded to Supabase Storage in this implementation.

## Administrator access

The admin login in the primary HTML uses Supabase Auth password sign-in. The browser checks for app_metadata.role = admin or an app_metadata.roles array containing admin, then places the access token in sessionStorage for the protected API calls. The Edge Functions independently validate the token using auth.getUser(); client-side flags or a legacy PIN are not authorization.

The authenticated Applications panel can:

- Load centrally stored requests using GET /app-requests?action=list.
- Load in-app alerts using GET /app-requests?action=notifications.
- Update request status, priority and notes through PATCH /app-requests?action=update.
- Mark an administrator notification as read through POST /app-requests?action=mark_read.

The existence and role metadata of a real administrator account still need confirmation. No account credentials have been added to the repository.

## Notifications

After a successful insert, app-requests creates an in-app notification record and audit event, then attempts:

- Browser push through a server-to-server call to admin-push?action=dispatch. This path is now connected. Delivery requires VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY plus at least one valid administrator browser subscription. VAPID_SUBJECT and SITE_ORIGIN should also be configured correctly. The dispatch is best-effort and does not undo a saved request.
- Email through Resend. Configure RESEND_API_KEY and a verified RESEND_FROM_EMAIL. ADMIN_NOTIFICATION_EMAIL overrides the destination; otherwise the function defaults to royalfintechcompany@gmail.com. Email delivery is optional and failures do not undo a saved request.

The admin Applications toolbar has an Enable Admin Push action. The signed-in administrator must grant browser notification permission and successfully register a subscription before push messages can be delivered.

## Verification snapshot — 4 November 2026

- Both Edge Functions are ACTIVE: app-requests v3 and admin-push v2.
- The committed GitHub source files for both functions match the deployed Edge Function source byte-for-byte.
- GitHub Actions passed on PR head 47865e0d85d0f394bca1030e90db82e681818a5a:
  - Validate website JavaScript.
  - Royal FinTech Frontend Smoke Test.
- The frontend smoke test checks static HTML structure, navigation, theme contrast, branding, route targets, and admin timeout behavior. It is not a real browser end-to-end test.
- A browser-based customer submission followed by administrator sign-in and inbox retrieval has not yet been executed.
- Admin account role metadata, Resend configuration, VAPID configuration and active push subscriptions have not been confirmed. Recent database inspection calls timed out; secret values must never be exposed in documentation or chat.

## Release gates

1. Restore database metadata/query access and confirm the four table definitions, migration history, administrator account role, and notification-subscription count.
2. Confirm the Resend and VAPID secret names are configured without printing secret values; verify the sender domain and at least one admin browser subscription.
3. Run a real browser test: submit a clearly marked test request, sign in as an authorized admin, confirm it appears in the central inbox, update its status, and check the audit/in-app notification. Verify email/push only when providers are configured.
4. Commit the exact production migration SQL to supabase/migrations and rerun the relevant CI checks.

Do not merge until the production admin and customer-to-admin browser workflow is verified, or explicitly record any intentionally deferred notification providers.
