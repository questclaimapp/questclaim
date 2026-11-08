// Generates read-only SQL for the existing sanctioned Supabase connector. No secrets,
// player identity/coordinates or runtime player-database access are needed by the Worker.
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const iso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
export function sourceExportSql(scopes,from,to) {
 if(!Array.isArray(scopes)||scopes.length>100||!scopes.every(s=>uuid(s.sponsorId)&&uuid(s.sourceOwnerRef))||!iso(from)||!iso(to)||from>=to||Date.parse(to)-Date.parse(from)>31*86400000)throw new Error('Verified UUID ownership scopes and a bounded ISO window required');
 const scope=scopes.length?scopes.map(s=>`('${s.sponsorId}'::uuid,'${s.sourceOwnerRef}'::uuid)`).join(','):'(NULL::uuid,NULL::uuid)';
 return `WITH approved_scope(sponsor_id,owner_id) AS (VALUES ${scope}),
 mine AS (
  SELECT h.id,h.sponsor_id,h.sponsor_name FROM public.hunts h
  JOIN public.sponsors s ON s.id=h.sponsor_id
  JOIN approved_scope a ON a.sponsor_id=s.id AND a.owner_id=s.owner_user_id
  JOIN public.sponsor_hunts sh ON sh.hunt_id=h.id::text AND sh.sponsor_user_id=a.owner_id
 ), normalized AS (
  SELECT m.id::text AS id,m.sponsor_id::text AS "sponsorId",coalesce(m.sponsor_name,'Sponsored hunt') AS title,
   'unknown'::text AS "prizeStatus",
   coalesce((SELECT jsonb_agg(event ORDER BY event->>'occurredAt',event->>'sourceId') FROM (
    SELECT jsonb_build_object('sourceId','view-'||e.id::text,'metric','views','occurredAt',to_char(e.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'actorHash',NULL) AS event
     FROM public.hunt_events e WHERE e.hunt_id=m.id::text AND e.kind='view' AND e.created_at>='${from}'::timestamptz AND e.created_at<'${to}'::timestamptz
    UNION ALL
    SELECT jsonb_build_object('sourceId','approved-claim-'||c.id::text,'metric','claims','occurredAt',to_char(c.reviewed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'actorHash',NULL)
     FROM public.claims c WHERE c.hunt_id=m.id AND c.status='approved' AND c.reviewed_at IS NOT NULL AND c.reviewed_at>='${from}'::timestamptz AND c.reviewed_at<'${to}'::timestamptz
   ) e),'[]'::jsonb) AS events,
   '[]'::jsonb AS coverage
  FROM mine m
 ) SELECT jsonb_build_object('version',1,'hunts',coalesce((SELECT jsonb_agg(n) FROM normalized n),'[]'::jsonb)) AS snapshot;`;
}
