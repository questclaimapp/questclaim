# Trusted offline snapshot contract (version 1)

The source exporter must establish authoritative hunt ownership and metric semantics before this import. Never accept an uploaded sponsor/client file as evidence of spend, ownership or approved claims. This importer validates format, reconciliation and ownership stability; it cannot independently prove a source's honesty. Production integration is a separate gate.

Root: `{ "version": 1, "hunts": [...] }`. There are no seeded/demo snapshots. See in-memory tests for the schema exercised with clearly synthetic fixtures.

Per hunt:
- `id`, `sponsorId`: stable opaque identifiers (`A-Z a-z 0-9 _ -`, max 100). Existing hunt ownership cannot be changed by import.
- `title`: display label, max 500 characters. Rendered as text, never HTML.
- `prizeStatus`: `unknown`, `available`, `found_pending`, `claimed`, `paused`, `rolled_over`, or `ended`.
- Non-unknown status requires `statusAsOf` (canonical millisecond UTC ISO) and `statusSource` (authoritative lifecycle provenance). Status is displayed as-of, not inferred from counts. Lifecycle claimed does not establish payout.
- `events`: immutable source records `{sourceId, metric, occurredAt, actorHash}`. `metric` is `views`, `searches`, `finds`, or `claims`. Time is canonical millisecond UTC ISO. IDs deduplicate per hunt across all metrics; conflicting duplicates abort the transaction. Previously imported events remain; this is additive/idempotent, not a destructive full replacement.
- `actorHash`: null or a 64-hex **source-keyed HMAC** of an opaque player identifier, scoped consistently to this sponsor. Do not export an unsalted email hash, raw account ID, name, email, GPS, cookies, payment data or secrets. This remains pseudonymous data and needs retention/access governance. The sponsor browser never receives these hashes. In-memory tests use synthetic hashes only.
- `coverage`: up to one record per metric: `{metric, from, through, source, complete: true, eventCount}`. ISO interval is inclusive start, exclusive end. Count must reconcile to stored events in this full interval. `searches` additionally requires `qualifiedSearches: true`; `claims` requires `approvedClaimsOnly: true`. `complete` is a trusted source attestation, not something the importer can derive from rows. For partial/unreliable capture omit coverage for that metric. Re-import replaces coverage for the supplied hunt; omitted coverage becomes unavailable.
- Optional `cost`: `{amountMinor, currency: "USD", basis, source, verified: true, from, to}`. Amount is nonnegative safe-integer US cents. Basis must say which prize funding and fees are included. This first slice supports USD only, not arbitrary currency exponents. Cost is usable only when interval exactly equals the requested reporting interval. No period prorating or financial ROI computation.

A qualified search is a genuine, source-validated attempt on this hunt, excluding known test/admin/bot traffic and retries where appropriate. The authoritative source must document and enforce the qualification rule; the dashboard does not invent one from client page hits. The engaged-player denominator is distinct non-null source HMACs with qualified search records in the exact interval. If **any** search event lacks an actor, unique engagement and cost-per-engaged are unavailable. Zero engaged players never causes division by zero or a displayed zero cost.

Views count recorded hunt-page exposures, not generic website hits. Unique identified audience is exact only within the source's stable identity/coverage rules, not an estimate of all real humans. Authenticated versus anonymous coverage and identity-method changes must be documented by the exporter. Searches, finds, approved claims and payouts are different stages; no payout metric is implemented.

Imports are offline operator actions, transactionally validated. Corrections/deletions, audit retention, automated signed ingestion and late-event monitoring are follow-up work. Protect the sponsor SQL file and backups, document retention, and restrict operator access before production.

## Daily graph response (source implementation; not yet built/deployed)

Each overview hunt now includes `timeline`: `{interval: "day", timeZone: "UTC", aggregation: "noncumulative_event_count", from, to, buckets, series}`. Buckets are ascending UTC calendar days clipped to the exact requested half-open interval. Each has `day`, `from`, `to`, and `partialDay`. Each series (`views`, `searches`, `finds`, `claims`) has source/coverage provenance and a point per bucket: `{day, count}`.

Counts come from server-side grouped event records for that already-authorized sponsor's hunt, metric and exact time interval, using the existing immutable event deduplication key. They are daily occurrences, **not cumulative totals and not unique audience counts**. Approved claims retain the existing trusted-import `approvedClaimsOnly` attestation; a claim is not a payout. Daily search counts are qualified attempts, not unique engaged players. Existing unique audience cards and exact-period cost denominator are unchanged.

A point is numeric only when source-attested coverage contains the entire clipped bucket. Fully covered days without events yield 0; missing or partially covered buckets yield `null` even if some events exist. A partial first/last calendar day can be plotted only when its whole selected interval is covered and is labeled partial in the table. A whole-period card can be unavailable while some fully covered days plot legitimately. No unknown period is filled/interpolated and lines stop across null points. The graph exposes only daily aggregate counts, never actor identifiers.

No new database tables or ingestion endpoint are needed. This does not create source instrumentation or establish the completeness of existing sources. A previously deployed backend without the new daily contract produces an explicit unavailable-trend UI; the frontend never derives a trend from period totals.
