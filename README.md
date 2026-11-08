# QuestClaim sponsor website

A new, isolated website-only source baseline for the sponsor hunt report. It is deployed at **https://questclaim.com/sponsors/dashboard/** using a separate Cloudflare Worker and sponsor-only D1 database. It is not a checkout of the player app. No player files or player Supabase resources are used.

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

## Production deployment

See [architecture and deployment](docs/DEPLOYMENT.md). After the user reported changed Cloudflare access, a minimal sanctioned account check succeeded. The Workers/D1 adaptation was deployed through that connector, without alternate credentials or browser access. The original public website Worker was not replaced.

Production uses `src/cloud-worker.js` and `src/cloud-store.js`, a separate D1 database, persistent hashed sessions and native sign-in rate limiting. `npm run build:cloud` produces multipart-ready modules under ignored `.build/`; deployed resource IDs and exact routes are recorded in `cloudflare-deployment.json`. The local Node/SQLite implementation remains available and has contract-parity tests against the cloud adapter.

**Live access/data limitations:** no approved sponsor membership, hunt, metrics or verified cost has been invented or seeded. Public secured entry and private APIs are live; actual sponsors need independently verified membership issuance and authoritative records. Read-only source inspection found zero sponsors, sponsor-hunt links, spotlight impressions and cost certifications in the existing Supabase project. General player events are not substituted for attributed sponsor metrics. There is no runtime Supabase connection or automatic source import.

The first D1 database is within the included database allowance on both Free and Paid plans; no paid plan subscription or upgrade was created. Usage/storage are subject to Cloudflare's normal allowances and overage rules. Billing-plan inspection itself was OAuth-forbidden and was not retried or bypassed.

## Verification

`npm test` exercises source import validation/idempotency, true zero versus unavailable, unique engagement, cost denominator and period, approved membership, expiry/revocation, tenant scope, CSRF, logout, secure cookies, rate limits, HTTP headers and actual asset/API requests. All test data is synthetic, in-memory and confined to tests. Test fixtures query no real data or production services. Deployment verification separately checked public production routes without reading player records.

Production verification: dashboard and assets 200 with expected content/service header; anonymous reporting and unapproved sign-in 401; hostile-origin POST 403. Home/privacy byte hashes unchanged. Ten local tests pass, including cloud adapter tenant isolation and aggregation parity. Not yet verified: real approved sponsor sign-in, production cross-tenant records, authoritative source completeness, automatic ingestion, end-to-end browser rendering/accessibility, actual analytics or payouts. Do not describe live entry/API availability as real sponsor analytics already populated.

## Pending source-only graph work — November 8, 2026

An accessible native SVG daily activity chart is implemented in the **uncommitted working tree only**, not live. It offers all four metrics or one metric at a time, a line-pattern/color legend, UTC date/count axes, gaps for unknown days, source coverage notes and an expandable exact-value table. A keyboard-focusable horizontal viewport preserves readable labels on narrow screens. No chart dependency is installed.

Both local and cloud report implementations now provide tenant-scoped daily event aggregates through the shared `src/timeline.js` contract. Cards, unique-person counts and cost semantics remain intact. No synthetic trend is supplied. A graph with no covered daily values explicitly reports unavailable rather than drawing a zero line.

New regression test source covers clipped UTC days, zero versus unknown, noncumulative counts, tenant scope/deduplication and partial coverage. Existing cloud/local equality assertions also cover the new field. **No tests, syntax checks, build, bundle generation, server restart, commit, push or deployment were run for this graph change.** Static inspection only; runtime/browser/accessibility verification remains pending approval.

When execution is separately approved, run the existing checks/tests plus the new cases and browser verification. Cloud packaging must include the new `timeline.js` module: `scripts/build-cloud.js` has been edited accordingly but has not been run. Existing `.build` modules and the live Worker still contain the old cards-only version. A later authorized build must regenerate assets and deploy both backend daily aggregation and the updated frontend together. No D1 migration or production database write is required for this graph feature itself.

### Production operator bridge

See `docs/DEPLOYMENT.md` for the sanctioned-control-plane provisioning/revocation/import workflow and verification prerequisites. `operator:prepare` and `source:prepare` generate private operation files/read-only source SQL; they do not execute network calls. No public operator API, player-service key, email-derived sponsor approval, automated scheduler or invented tracking coverage is introduced. Actual sponsor records and qualified tracking evidence must exist before populated analytics can be claimed.
