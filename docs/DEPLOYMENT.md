# Separate sponsor architecture and deployment gate

## Provenance found, not guessed

The public website source is present in historical/local generated Worker bundles rather than the inspected player repository:
- `/workspace/qc_tools/site_worker.mjs`: embedded assets and auth-proxy code.
- `/workspace/qc-legal-publish-202611071626-edited/worker.mjs`: later generated bundle.
- Its embedded `/index.html` exactly matched the public `https://questclaim.com/` bytes on November 7, 2026 (CST). SHA-256 `d1a6a8d77000234d6d026dc398d5e351be0468c6f124767810d1b665b824db9b`.
- Its embedded `/privacy/index.html` exactly matched public `https://questclaim.com/privacy/`. SHA-256 `bcf4f4e8d738bbf29b67e83bb9b5b6be7a764dfeef1af497563722ba5918dfcd`.

These two byte matches identify useful current-source provenance, **not proof every route or the whole Worker is identical to live**. No legacy bundles, credentials or player auth wiring were copied into this new repository. The sponsor slice is a new separately tracked baseline, not a replacement of existing public/legal pages.

Existing bundle routes at lines 27–57 handle general signin/signup using the existing Supabase auth service. Lines 55–66 route static assets. That does not provide verified sponsor membership or metrics. The saved sponsor page is an inquiry form. Original signup/signout, prize editing, payout views and current production data/RLS are not fully audited by this narrow build. Do not claim a complete security audit of the player service.

## Boundary

Browser -> HTTPS questclaim.com `/sponsors/dashboard/*` and `/sponsors/api/*` -> dedicated sponsor Node service -> private sponsor-only SQLite volume.

- No player Supabase connection, player token, service-role key, membership or cost record in player storage.
- Tenant scope derives only from approved server membership. There is no sponsor role selector, sponsor-ID query or public ingest endpoint.
- Sponsor backend cannot read the player database. Future source integration should deliver allowlisted, de-identified server exports through a reviewed one-way bridge. Keep cost/ledger and membership in sponsor infrastructure.
- Current offline admin tool has no remote API/network access. No infrastructure, schema or records were changed in production.

## Local operation

Bind to loopback by default. `SPONSOR_ORIGIN=http://127.0.0.1:8788` enables a local-only non-Secure cookie. Non-loopback public origins require HTTPS; production uses `__Host-` Secure/HttpOnly/SameSite=Strict cookies. Server validates Host and POST Origin; no permissive CORS. Cookies and private responses are no-store. CSP forbids framing, external scripts, inline scripts and arbitrary connections. No client-stored bearer tokens.

## Production checklist (not executed)

1. Establish a sanctioned deployment path. Existing Cloudflare connector returned: connected, but this tool needs a permission the connection cannot request; reconnecting will not help. Do not retry or bypass with tokens, credential extraction, undocumented APIs or browser side doors. A supported administrator-controlled deployment/access change is required outside this refused path.
2. Prepare the separately hosted Node 24 service and dedicated persistent sponsor volume. This code uses native Node SQLite and is **not directly deployable as the existing Cloudflare Worker bundle**. No server/vendor has been provisioned.
3. Set explicit `SPONSOR_ORIGIN=https://questclaim.com`, `SPONSOR_DB_PATH` to a separate private volume, and an internal HOST/PORT. Restrict directory/file and backup access. No player database mounts. SQLite needs a single writer/service instance; multi-instance production needs an explicitly designed shared store/session backend, not independently replicated files.
4. Add only `/sponsors/dashboard`, `/sponsors/dashboard/*`, and `/sponsors/api/*` reverse-proxy routes to the sponsor service. Preserve current public `/sponsors/`, legal, signup and player paths. Avoid public direct backend access. Do not forward private tokens to unrelated services.
5. Enforce HTTPS, correct public Host forwarding, no cache for private/session responses, edge rate limiting and trusted request limits. In-process rate limits are per service and intentionally do not trust client `X-Forwarded-For`; proxy deployments need edge limits. Use a private volume and test backups/restore. Memory sessions mean restart signs users out.
6. Verify actual sponsor ownership independently; issue/revoke approved invites securely. Integrate actual authoritative lifecycle, complete qualified events, approved claims and period-matched cost. Do not populate fabricated analytics to make the board appear live.
7. Run tests; verify anonymous denial, cross-sponsor isolation, CSRF, status source timestamps, missing coverage, zero denominator and deployment route correctness through the real HTTPS domain.
8. Only report live when the real route serves the expected build and approved accounts see their own authoritative data. No merge/deploy has been done in this task.

No GitHub Actions/CI deployment configuration is included. At inspection the remote `questclaimapp/questclaim` was empty. Work is pushed only to a non-main feature branch, not production main; external Cloudflare build triggers could not be inventoried due to the binding permission refusal. There is no known production connection to this previously empty repository.

## Remaining scope

This slice prioritizes a meaningful sponsor hunt story, not vanity charts. Sponsor password/email onboarding, full account recovery/MFA, automatic event bridge, long-term audit/retention, prize editing, payout views and financial settlement are not implemented. Current production schema/event availability is unverified. Future work must preserve the separate sponsor boundary and leave in-app `dashboard.tsx`/`sponsor.tsx` untouched. No Stripe integration.
