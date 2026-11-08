// Source-only regression cases. Do not run until execution/build approval is granted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { utcDayBuckets, dailyMetricSeries } from '../src/timeline.js';

test('daily buckets are UTC, end-exclusive and clip first/last partial days', () => {
 const buckets = utcDayBuckets('2026-11-01T12:00:00.000Z', '2026-11-03T06:00:00.000Z');
 assert.deepEqual(buckets.map(bucket => bucket.day), ['2026-11-01','2026-11-02','2026-11-03']);
 assert.equal(buckets[0].from, '2026-11-01T12:00:00.000Z');
 assert.equal(buckets[2].to, '2026-11-03T06:00:00.000Z');
 assert.deepEqual(buckets.map(bucket => bucket.partialDay), [true,false,true]);
 assert.equal(utcDayBuckets('2026-11-01T00:00:00.000Z','2026-11-02T00:00:00.000Z').length, 1);
});

test('unknown days are null, covered zero is zero, daily counts are not cumulative', () => {
 const buckets = utcDayBuckets('2026-11-01T00:00:00.000Z','2026-11-05T00:00:00.000Z');
 const coverage = { from_at:'2026-11-02T00:00:00.000Z', through_at:'2026-11-04T00:00:00.000Z', source:'Synthetic fixture only' };
 const series = dailyMetricSeries(buckets,coverage,[{day:'2026-11-01',count:99},{day:'2026-11-02',count:3}]);
 assert.deepEqual(series.points.map(point => point.count),[null,3,0,null]);
 assert.deepEqual(dailyMetricSeries(buckets,null,[{day:'2026-11-02',count:3}]).points.map(point => point.count),[null,null,null,null]);
 assert.equal(series.source,'Synthetic fixture only');
});

test('partial day requires full clipped coverage and ignores records without source coverage', () => {
 const buckets = utcDayBuckets('2026-11-01T12:00:00.000Z','2026-11-02T06:00:00.000Z');
 const series = dailyMetricSeries(buckets,{from_at:'2026-11-01T12:00:00.000Z',through_at:'2026-11-02T05:59:59.999Z',source:'test'},[{day:'2026-11-01',count:2},{day:'2026-11-02',count:5}]);
 assert.deepEqual(series.points.map(point => point.count),[2,null]);
 assert.throws(() => utcDayBuckets('bad','2026-11-02T06:00:00.000Z'),/Invalid/);
 assert.throws(() => utcDayBuckets('2026-11-02T06:00:00.000Z','2026-11-01T12:00:00.000Z'),/Invalid/);
});
