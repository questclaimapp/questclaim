// Shared by local SQLite and Cloudflare D1. No identities or raw events leave the server.
export const timelineMetrics = ['views', 'searches', 'finds', 'claims'];
const DAY = 86400000;
export function utcDayBuckets(from, to) {
 const start = Date.parse(from), end = Date.parse(to);
 if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start > 366 * DAY) {
  throw new Error('Invalid reporting interval.');
 }
 const buckets = [];
 const firstMidnight = Math.floor(start / DAY) * DAY;
 for (let midnight = firstMidnight; midnight < end; midnight += DAY) {
  const bucketStart = Math.max(start, midnight), bucketEnd = Math.min(end, midnight + DAY);
  buckets.push({ day: new Date(midnight).toISOString().slice(0, 10),
   from: new Date(bucketStart).toISOString(), to: new Date(bucketEnd).toISOString(),
   partialDay: bucketStart !== midnight || bucketEnd !== midnight + DAY });
 }
 return buckets;
}
export function dailyMetricSeries(buckets, coverage, dailyRows) {
 const counts = new Map(dailyRows.map(row => [row.day, row.count]));
 return { source: coverage?.source ?? null,
  coverage: coverage ? { from: coverage.from_at, through: coverage.through_at } : null,
  points: buckets.map(bucket => {
   // Complete coverage is checked per clipped day, not assumed from the presence of events.
   const covered = Boolean(coverage && coverage.from_at <= bucket.from && coverage.through_at >= bucket.to);
   return { day: bucket.day, count: covered ? (counts.get(bucket.day) ?? 0) : null };
  })
 };
}
