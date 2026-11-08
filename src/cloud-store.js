export async function hash(value) {
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
function secret() { return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''); }
export function cloudStore(db) {
 return {
  async login(code,now=new Date()) {
   if(typeof code!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(code))return null;
   const member=await db.prepare('SELECT id FROM members WHERE code_hash=? AND approved=1 AND expires_at>?').bind(await hash(code),now.toISOString()).first();
   if(!member)return null;
   const token=secret();
   await db.batch([
    db.prepare('DELETE FROM sponsor_sessions WHERE expires_at<=?').bind(now.toISOString()),
    db.prepare('INSERT INTO sponsor_sessions VALUES(?,?,?)').bind(await hash(token),member.id,new Date(now.getTime()+8*3600000).toISOString())
   ]);
   return token;
  },
  async authenticate(token,now=new Date()) {
   if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
   return db.prepare(`SELECT m.id,m.sponsor_id,m.name FROM members m JOIN sponsor_sessions s ON m.id=s.member_id
    WHERE s.token_hash=? AND s.expires_at>? AND m.approved=1 AND m.expires_at>?`).bind(await hash(token),now.toISOString(),now.toISOString()).first();
  },
  async logout(token) {if(typeof token==='string'&&token.length===43)await db.prepare('DELETE FROM sponsor_sessions WHERE token_hash=?').bind(await hash(token)).run();},
  async overview(member,from,to) {
   const {results:hunts}=await db.prepare('SELECT * FROM hunts WHERE sponsor_id=? ORDER BY title,id').bind(member.sponsor_id).all();
   const report=[];
   for(const hunt of hunts) {
    const activity={};
    for(const metric of ['views','searches','finds','claims']) {
     const coverage=await db.prepare('SELECT * FROM coverage WHERE hunt_id=? AND metric=?').bind(hunt.id,metric).first();
     if(!coverage||coverage.from_at>from||coverage.through_at<to) {activity[metric]={available:false,count:null,uniquePeople:null,reason:'Verified source coverage does not cover this whole period.',coverage:coverage??null};continue;}
     const row=await db.prepare(`SELECT COUNT(*) AS count,COUNT(DISTINCT actor_hash) AS people,
      SUM(CASE WHEN actor_hash IS NULL THEN 1 ELSE 0 END) AS unidentified FROM events
      WHERE hunt_id=? AND metric=? AND occurred_at>=? AND occurred_at<?`).bind(hunt.id,metric,from,to).first();
     activity[metric]={available:true,count:row.count,uniquePeople:row.unidentified>0?null:row.people,source:coverage.source,through:coverage.through_at};
    }
    const engaged=activity.searches.uniquePeople;
    const verified=Boolean(hunt.cost_verified&&Number.isSafeInteger(hunt.cost_minor)&&hunt.currency==='USD'&&hunt.cost_basis&&hunt.cost_source&&hunt.cost_from===from&&hunt.cost_to===to);
    const available=verified&&activity.searches.available&&engaged!==null&&engaged>0;
    report.push({id:hunt.id,title:hunt.title,prize:{status:hunt.prize_status,asOf:hunt.status_as_of,source:hunt.status_source},activity,
     cost:{available,minorPerEngagedPlayer:available?hunt.cost_minor/engaged:null,amountMinor:verified?hunt.cost_minor:null,currency:verified?hunt.currency:null,basis:verified?hunt.cost_basis:null,source:verified?hunt.cost_source:null,
      denominator:'Unique source-pseudonymized players with at least one qualified hunt search in this exact period.',reason:available?null:'Needs verified cost for this exact period and a nonzero, fully identified qualified search audience.'}});
   }
   return {sponsorName:member.name,period:{from,to},hunts:report};
  }
 };
}
