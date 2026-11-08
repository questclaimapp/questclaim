# QuestClaim sponsor website

A new, isolated website-only source baseline for the sponsor hunt report. It is **not deployed** and is not a checkout of the player app. No player files or player Supabase resources are used.

## Run locally

Requires Node 24 (built-in `node:sqlite`), no npm dependencies.

```sh
npm test
npm run check
npm start
# http://127.0.0.1:8788/sponsors/dashboard/
```

Startup creates a **local separate sponsor database** under ignored `data/`, with no members, hunts, or analytics. The public sign-in shell loads; private reporting requires an administrator-approved invitation. No sample counts or test fixtures are loaded at startup. The local database is not a player app database. Never point `SPONSOR_DB_PATH` at any existing app database.

### Approve a sponsor (operator only, after real verification)

```sh
SPONSOR_DB_PATH=/absolute/private/sponsor.sqlite node scripts/admin.js approve MEMBER_ID SPONSOR_ID 'Sponsor display name' FUTURE_ISO_EXPIRY
SPONSOR_DB_PATH=/absolute/private/sponsor.sqlite node scripts/admin.js revoke MEMBER_ID
```

`approve` prints a high-entropy bearer invitation once, storing only its SHA-256 digest. Deliver through an approved secure channel, never chat logs or source control. An invitation is reusable until expiry/revocation, so protect it as a password; this first slice is not full account onboarding or MFA. Do not run approve with fabricated production identities. No sponsor role is self-selected. Membership is checked on every private request, including active sessions. Sessions are opaque, memory-only, eight-hour maximum, invalidated by sign-out or restart. Revocation blocks existing sessions immediately on the next request.

### Connect authoritative reporting data

There is no public import endpoint and no player service credential. An administrator can import a trusted, de-identified, source-attested JSON snapshot into the **separate sponsor database**, using `scripts/admin.js import FILE.json` with `SPONSOR_DB_PATH` set. See [data contract](docs/DATA-CONTRACT.md). Importing a snapshot is a data mutation; obtain operational approval and provenance review before production imports. No real snapshot has been imported.

## What sponsors see

1. **Is my hunt alive?** Authoritative prize lifecycle, source and timestamp; unknown if unverified. Rollover is explicit. A find count does not establish availability.
2. **Are people hunting?** Total views versus source-identified people; search attempts versus unique qualified engaged players, with completeness and freshness.
3. **Did anyone win?** Finds and approved claims are separate. Neither claims nor lifecycle status implies payout.
4. **Was it worth it?** Cost per engaged player only for verified, exactly period-matched USD spend and a fully identified, nonzero qualified-search audience. Cost basis explicitly states prize funding/fees included. No revenue or financial ROI assertion.

Reports use UTC inclusive-start/exclusive-end intervals. UI defaults to the last 30 completed UTC days. Missing/partial source coverage is **Unavailable**, never zero. A true zero requires complete source-attested coverage for the selected interval.

## Deployment gate

See [architecture and deployment](docs/DEPLOYMENT.md). This repository has no Actions workflows, deployment hook configuration, or production credentials. Its new feature branch is not connected to a known production deployment. Deployment access is currently blocked by the existing Cloudflare connector permission refusal. This project does not attempt to bypass it.

Production requires a separate Node 24 service with a persistent, private sponsor-only volume, HTTPS and explicit same-origin reverse proxy routes from questclaim.com. Merely pushing this repository does not add routes to the existing Cloudflare Worker. No infrastructure was provisioned. The existing public website and player authentication are unchanged.

## Verification

`npm test` exercises source import validation/idempotency, true zero versus unavailable, unique engagement, cost denominator and period, approved membership, expiry/revocation, tenant scope, CSRF, logout, secure cookies, rate limits, HTTP headers and actual asset/API requests. All test data is synthetic, in-memory and confined to tests. No real data or production services are queried.

Not yet verified: production TLS/proxy/volume/edge limits, actual sponsor identity issuance, authoritative source completeness, ingestion pipeline, end-to-end browser rendering and accessibility audit, production domain routes, production counts or payouts. No claim is made that this is live.
