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
function render(data) {
 $('sponsor').textContent=data.sponsorName; $('empty').hidden=data.hunts.length>0;$('hunts').replaceChildren();
 for(const hunt of data.hunts) {
  const article=el('article');article.append(el('h2',hunt.title));
  const verified=hunt.prize.asOf && hunt.prize.source;const [title,detail]=statusCopy[verified?hunt.prize.status:'unknown'] ?? statusCopy.unknown;
  const state=el('section',undefined,'prize');state.append(el('p','Is my hunt alive?','eyebrow'),el('h3',title),el('p',detail));
  if(verified)state.append(el('p',`Status as of ${hunt.prize.asOf} · Source: ${hunt.prize.source}`,'muted'));
  article.append(state,el('h3','Are people hunting it?'));
  const progression=el('div',undefined,'progression');
  progression.append(metricCard('Saw the hunt',hunt.activity.views,'unique source-identified people'),metricCard('Searched for the prize',hunt.activity.searches,'unique qualified engaged players'),metricCard('Recorded a find',hunt.activity.finds),metricCard('Approved claims',hunt.activity.claims));article.append(progression);
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
