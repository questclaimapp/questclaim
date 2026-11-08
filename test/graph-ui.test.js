import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.attributes={};this.events={};this.value='';this.textContent='';}
 append(...nodes){this.children.push(...nodes);if(this.tag==='select'&&!this.value)this.value=this.children[0].value;}
 setAttribute(k,v){this.attributes[k]=v;}
 replaceChildren(...nodes){this.children=nodes;}
 addEventListener(name,fn){this.events[name]=fn;}
}
function descend(node,tag){return [...(node.tag===tag?[node]:[]),...node.children.flatMap(n=>descend(n,tag))];}
function ui(){const context={document:{createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)},Intl,Date,URLSearchParams};vm.createContext(context);const source=readFileSync('public/dashboard.js','utf8');vm.runInContext(source.slice(0,source.indexOf('\nfunction render(')),context);return context;}
function hunt(counts){const buckets=counts.map((_,i)=>({day:`2026-11-0${i+1}`,from:`2026-11-0${i+1}T00:00:00.000Z`,to:`2026-11-0${i+2}T00:00:00.000Z`,partialDay:false}));return {title:'Local synthetic UI fixture',timeline:{interval:'day',timeZone:'UTC',aggregation:'noncumulative_event_count',from:buckets[0].from,to:buckets.at(-1).to,buckets,series:Object.fromEntries(['views','searches','finds','claims'].map(key=>[key,{points:buckets.map((b,i)=>({day:b.day,count:key==='views'?counts[i]:null})),source:null,coverage:null}]))}};}
test('actual graph renderer plots real zero, stops lines at unknown days, exposes accessible table and metric control',()=>{
 const graph=ui().activityTrend(hunt([0,null,2]));assert.equal(descend(graph,'svg').length,1);
 const path=descend(graph,'path')[0];assert.equal((path.attributes.d.match(/M/g)||[]).length,2);assert.ok(!path.attributes.d.includes('L'));
 assert.equal(descend(graph,'circle').length,2);assert.ok(descend(graph,'td').some(n=>n.textContent==='Unavailable'));
 assert.equal(descend(graph,'svg')[0].attributes.role,'img');assert.equal(descend(graph,'caption').length,1);
 const select=descend(graph,'select')[0];select.value='claims';select.events.change();assert.equal(descend(graph,'svg').length,0);
});
test('graph never creates fabricated SVG trend for all unknown or malformed daily series',()=>{
 const context=ui();assert.equal(descend(context.activityTrend(hunt([null,null])),'svg').length,0);
 const bad=hunt([1]);bad.timeline.series.views.points[0].count=-1;assert.equal(descend(context.activityTrend(bad),'svg').length,0);
});
