const $ = id => document.getElementById(id);
const statusCopy = {
 available: ['Prize is available', 'The latest authoritative source lists this prize as available.'],
 found_pending: ['A find is awaiting confirmation', 'A find has been recorded; this is not an approved claim or payout.'],
 claimed: ['The prize has been claimed', 'The authoritative lifecycle source lists a claim. This does not confirm payout.'],
 paused: ['Your hunt is paused', 'The latest source lists this hunt as paused.'],
 rolled_over: ['The prize has rolled over', 'The original prize is not presented as still available. Check the authoritative rollover record.'],
 ended: ['This hunt has ended', 'The latest source lists the hunt as ended.'],
 unknown: ['Prize status is not verified', 'No assumption is made from activity counts or the absence of claims.']
};
function el(tag, text, className) { const node=document.createElement(tag); if(text!==undefined) node.textContent=text;if(className)node.className=className;return node; }
async function request(path, options={}) { const r=await fetch('/sponsors/api/'+path,{credentials:'same-origin',...options});const d=await r.json(); if(!r.ok)throw Object.assign(new Error(d.error || 'Report unavailable.'),{status:r.status});return d; }
function signedIn(value) { $('login').hidden=value;$('report').hidden=!value;$('signout').hidden=!value; if(!value)$('hunts').replaceChildren(); }
function metricCard(title, item, peopleLabel) {
 const card=el('section',undefined,'activity');card.append(el('h3',title),el('p',item.available?item.count.toLocaleString():'Unavailable','number'));
 card.append(el('p',item.available?'Recorded events in this period.':item.reason));
 if(peopleLabel)card.append(el('p',item.available && item.uniquePeople!==null ? `${item.uniquePeople.toLocaleString()} ${peopleLabel}` : `${peopleLabel}: unavailable.`, 'audience'));
 if(item.available) card.append(el('p',`Source: ${item.source}. Coverage through ${item.through}.`,'muted'));
 else if(item.coverage)card.append(el('p',`Available coverage: ${item.coverage.from_at} to ${item.coverage.through_at}. Source: ${item.coverage.source}.`,'muted'));
 return card;
}
const trendMetrics = [
 { key: 'views', label: 'Page views', line: 'solid', dash: '' },
 { key: 'searches', label: 'Search attempts', line: 'long dash', dash: '10 5' },
 { key: 'finds', label: 'Find events', line: 'short dash', dash: '4 4' },
 { key: 'claims', label: 'Approved claims', line: 'dotted', dash: '1 4' }
];
let trendSequence = 0;
function svgNode(tag, attributes = {}, text) {
 const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
 for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
 if (text !== undefined) node.textContent = text;
 return node;
}
function activityTrend(hunt) {
 const id = `hunt-trend-${++trendSequence}`;
 const section = el('section', undefined, 'trend');
 const heading = el('h3', 'Hunt activity over time'); heading.id = id;
 section.setAttribute('aria-labelledby', id);
 section.append(heading, el('p', 'Daily event counts in UTC — not cumulative totals or unique people. Search attempts are not unique engaged players; finds and approved claims are separate events. Gaps mean unavailable, not zero.', 'muted'));
 const timeline = hunt.timeline;
 if (!timeline || timeline.interval !== 'day' || timeline.timeZone !== 'UTC' || timeline.aggregation !== 'noncumulative_event_count' || !Array.isArray(timeline.buckets) || !timeline.buckets.length ||
  !trendMetrics.every(metric => Array.isArray(timeline.series?.[metric.key]?.points) && timeline.series[metric.key].points.length === timeline.buckets.length &&
   timeline.series[metric.key].points.every((point, index) => point && point.day === timeline.buckets[index].day && (point.count === null || Number.isSafeInteger(point.count) && point.count >= 0)))) {
  section.append(el('p', 'Daily trend is unavailable. This report needs verified per-day source coverage; period totals cannot be reconstructed into a genuine trend.'));
  return section;
 }
 section.append(el('p', `Reporting interval: ${timeline.from} to ${timeline.to} (end excluded). Partial UTC days are labeled in the table.`, 'muted'));
 const controls = el('div', undefined, 'trend-controls');
 const label = el('label', 'Show metric'); label.htmlFor = `${id}-metric`;
 const select = el('select'); select.id = `${id}-metric`;
 const all = el('option', 'All four metrics'); all.value = 'all'; select.append(all);
 for (const metric of trendMetrics) { const option = el('option', metric.label); option.value = metric.key; select.append(option); }
 controls.append(label, select); section.append(controls);
 const legend = el('ul', undefined, 'trend-legend'); legend.setAttribute('aria-label', 'Chart legend'); section.append(legend);
 const summary = el('p', undefined, 'muted'); summary.setAttribute('role', 'status'); summary.setAttribute('aria-live', 'polite'); section.append(summary);
 const viewport = el('div', undefined, 'trend-viewport'); viewport.tabIndex = 0; viewport.setAttribute('role', 'region');
 viewport.setAttribute('aria-label', `${hunt.title}: daily activity chart, horizontally scrollable on narrow screens`); section.append(viewport);
 function draw() {
  const visible = trendMetrics.filter(metric => select.value === 'all' || select.value === metric.key);
  legend.replaceChildren(); viewport.replaceChildren();
  for (const metric of visible) {
   const item = el('li'); const swatch = el('span', undefined, `trend-swatch trend-swatch-${metric.key}`); swatch.setAttribute('aria-hidden', 'true');
   item.append(swatch, el('span', `${metric.label} (${metric.line})`)); legend.append(item);
  }
  const values = visible.flatMap(metric => timeline.series[metric.key].points.map(point => point.count)).filter(value => value !== null);
  if (!values.length) {
   summary.textContent = 'No verified daily values for this selection. The graph will plot genuine daily counts when source coverage is available; it will not invent a trend.';
   viewport.append(el('p', 'Daily graph unavailable — no fully covered day intervals in this selection.', 'trend-unavailable'));
   return;
  }
  summary.textContent = 'Daily counts shown only for fully covered day intervals. Lines stop at unavailable days. A covered day with no events is shown at zero. Scale adjusts to the selected metric; the chart scrolls horizontally on small screens.';
  const width = 640, height = 300, left = 52, right = 20, top = 20, bottom = 58;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const step = Math.max(1, Math.ceil(Math.max(...values) / 4)), maximum = step * 4;
  const x = index => left + (index + 0.5) * plotWidth / timeline.buckets.length;
  const y = value => top + plotHeight - value / maximum * plotHeight;
  const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, width, height, class: 'trend-svg', role: 'img', 'aria-labelledby': `${id}-title ${id}-description` });
  svg.append(svgNode('title', { id: `${id}-title` }, `${hunt.title}: ${visible.map(metric => metric.label).join(', ')} by UTC day`));
  svg.append(svgNode('desc', { id: `${id}-description` }, 'Noncumulative event counts. Unknown intervals are gaps, not zero. Different colors and line patterns identify metrics. Exact daily values and partial-day intervals are in the expandable table following this graph.'));
  for (let value = 0; value <= maximum; value += step) {
   svg.append(svgNode('line', { x1: left, y1: y(value), x2: width - right, y2: y(value), class: 'trend-grid' }));
   svg.append(svgNode('text', { x: left - 9, y: y(value) + 4, 'text-anchor': 'end', class: 'trend-axis' }, value.toLocaleString()));
  }
  svg.append(svgNode('text', { x: left, y: height - 5, class: 'trend-axis' }, 'UTC day · daily event count'));
  const tickCount = Math.min(6, timeline.buckets.length);
  const ticks = new Set(Array.from({ length: tickCount }, (_, index) => tickCount === 1 ? 0 : Math.round(index * (timeline.buckets.length - 1) / (tickCount - 1))));
  const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  for (const index of ticks) {
   svg.append(svgNode('text', { x: x(index), y: height - bottom + 23, 'text-anchor': 'middle', class: 'trend-axis' }, dateFormat.format(new Date(timeline.buckets[index].day + 'T00:00:00Z'))));
  }
  for (const metric of visible) {
   let path = '', connected = false;
   const points = timeline.series[metric.key].points;
   points.forEach((point, index) => {
    if (point.count === null) { connected = false; return; }
    path += `${connected ? 'L' : 'M'}${x(index)} ${y(point.count)} `; connected = true;
   });
   svg.append(svgNode('path', { d: path, class: `trend-line trend-series-${metric.key}`, 'stroke-dasharray': metric.dash }));
   points.forEach((point, index) => {
    if (point.count === null) return;
    const dot = svgNode('circle', { cx: x(index), cy: y(point.count), r: 3, class: `trend-dot trend-series-${metric.key}` });
    dot.append(svgNode('title', {}, `${point.day} UTC: ${metric.label}, ${point.count}`)); svg.append(dot);
   });
  }
  viewport.append(svg);
 }
 select.addEventListener('change', draw); draw();
 const details = el('details', undefined, 'trend-details'); details.append(el('summary', 'Daily counts — accessible data table'));
 const tableViewport = el('div', undefined, 'trend-table-viewport'); tableViewport.tabIndex = 0; tableViewport.setAttribute('role', 'region'); tableViewport.setAttribute('aria-label', `${hunt.title}: daily counts table, horizontally scrollable`);
 const table = el('table', undefined, 'trend-table');
 table.append(el('caption', 'All four event metrics by UTC day. Unavailable values are not zero. Partial-day rows count only the selected interval; counts are not cumulative or unique people.'));
 const head = el('thead'), header = el('tr');
 for (const name of ['Day (UTC)', ...trendMetrics.map(metric => metric.label)]) { const th = el('th', name); th.scope = 'col'; header.append(th); } head.append(header); table.append(head);
 const body = el('tbody');
 timeline.buckets.forEach((bucket, index) => {
  const row = el('tr'), day = el('th', bucket.day + (bucket.partialDay ? ' (partial day)' : '')); day.scope = 'row';
  day.append(el('span', `${bucket.from} → ${bucket.to} (end excluded)`, 'trend-interval')); row.append(day);
  for (const metric of trendMetrics) { const count = timeline.series[metric.key].points[index].count; row.append(el('td', count === null ? 'Unavailable' : count.toLocaleString())); }
  body.append(row);
 });
 table.append(body); tableViewport.append(table); details.append(tableViewport); section.append(details);
 const sources = el('ul', undefined, 'trend-sources');
 for (const metric of trendMetrics) { const series = timeline.series[metric.key]; sources.append(el('li', series.source && series.coverage ? `${metric.label}: ${series.source}. Verified coverage ${series.coverage.from} to ${series.coverage.through}.` : `${metric.label}: verified daily source coverage unavailable.`)); }
 section.append(sources); return section;
}

function render(data) {
 $('sponsor').textContent=data.sponsorName; $('empty').hidden=data.hunts.length>0;$('hunts').replaceChildren();
 for(const hunt of data.hunts) {
  const article=el('article');article.append(el('h2',hunt.title));
  const verified=hunt.prize.asOf && hunt.prize.source;const [title,detail]=statusCopy[verified?hunt.prize.status:'unknown'] ?? statusCopy.unknown;
  const state=el('section',undefined,'prize');state.append(el('p','Is my hunt alive?','eyebrow'),el('h3',title),el('p',detail));
  if(verified)state.append(el('p',`Status as of ${hunt.prize.asOf} · Source: ${hunt.prize.source}`,'muted'));
  article.append(state,el('h3','Are people hunting it?'));
  const progression=el('div',undefined,'progression');
  progression.append(metricCard('Saw the hunt',hunt.activity.views,'unique source-identified people'),metricCard('Searched for the prize',hunt.activity.searches,'unique qualified engaged players'),metricCard('Recorded a find',hunt.activity.finds),metricCard('Approved claims',hunt.activity.claims));article.append(progression,activityTrend(hunt));
  const cost=el('section',undefined,'cost');cost.append(el('h3','What did each engaged player cost?'));
  if(hunt.cost.available) {
   cost.append(el('p',new Intl.NumberFormat(undefined,{style:'currency',currency:hunt.cost.currency}).format(hunt.cost.minorPerEngagedPlayer / 100),'number'));
   cost.append(el('p',`Cost basis: ${hunt.cost.basis}. Verified spend: ${new Intl.NumberFormat(undefined,{style:'currency',currency:hunt.cost.currency}).format(hunt.cost.amountMinor/100)}. Source: ${hunt.cost.source}.`));
  } else cost.append(el('p','Unavailable','number'),el('p',hunt.cost.reason));
  cost.append(el('p',hunt.cost.denominator,'muted'),el('p','Engagement is not revenue. Use this alongside your own business outcomes, not as a claim of financial return.'));article.append(cost);$('hunts').append(article);
 }
}
async function refresh() {
 $('message').textContent='Loading your hunt report…';
 try {const query=new URLSearchParams({from:new Date($('from').value+'T00:00:00Z').toISOString(),to:new Date($('through').value+'T00:00:00Z').toISOString()});const data=await request('overview?'+query);signedIn(true);render(data);$('message').textContent='Report updated. Unavailable means unverified, not zero.';}
 catch(e){if(e.status===401)signedIn(false);$('message').textContent=e.message;}
}
const today=new Date();today.setUTCHours(0,0,0,0);$('through').value=today.toISOString().slice(0,10);$('through').max=$('through').value;$('from').value=new Date(today.getTime()-30*86400000).toISOString().slice(0,10);
$('login-form').addEventListener('submit',async e=>{e.preventDefault();const code=$('code').value;$('code').value='';try{await request('session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code})});await refresh();}catch(error){$('message').textContent=error.message;}});
$('signout').addEventListener('click',async()=>{try{await request('logout',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});signedIn(false);$('message').textContent='Signed out.';}catch(error){$('message').textContent=error.message;}});
$('refresh').addEventListener('click',refresh);
refresh();
