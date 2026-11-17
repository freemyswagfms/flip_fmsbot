-- FLIP 0.9.12 / server-only read-only searchable leaderboard.
-- Deployed to Supabase on 2026-11-17; kept here as the project SQL record.
CREATE OR REPLACE FUNCTION public.flip_leaderboard_social(
  p_viewer_id bigint, p_query text DEFAULT '', p_limit integer DEFAULT 50
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO '' AS $flipsql$
 WITH scores AS (
   SELECT p.telegram_id,p.public_id,p.username,p.first_name,p.level,
     COALESCE(SUM(public.flip_cp_card_value(c.rarity,i.ranked_quantity)),0)::numeric(16,2) AS cp,
     COALESCE(SUM(i.ranked_quantity),0)::bigint AS ranked_cards,
     COUNT(i.card_id) FILTER (WHERE i.ranked_quantity>0)::bigint AS ranked_variants
   FROM public.flip_players p
   LEFT JOIN public.flip_inventory i ON i.telegram_id=p.telegram_id
   LEFT JOIN public.flip_cards c ON c.id=i.card_id
   GROUP BY p.telegram_id,p.public_id,p.username,p.first_name,p.level
 ), ranked AS (
   SELECT *,ROW_NUMBER() OVER(ORDER BY cp DESC,ranked_variants DESC,telegram_id ASC)::integer AS place
   FROM scores
 ), filter AS (
   SELECT lower(left(ltrim(trim(COALESCE(p_query,'')),'@'),64)) AS q
 ), results AS (
   SELECT r.*
   FROM ranked r CROSS JOIN filter f
   WHERE f.q='' OR position(f.q IN lower(coalesce(r.username,'')))>0
     OR position(f.q IN lower(coalesce(r.first_name,'')))>0
   ORDER BY r.place LIMIT LEAST(GREATEST(COALESCE(p_limit,50),1),50)
 )
 SELECT jsonb_build_object(
   'leaders',COALESCE((SELECT jsonb_agg(jsonb_build_object(
     'telegram_id',r.telegram_id::text,
     'public_id',r.public_id,
     'username',r.username,'first_name',r.first_name,
     'level',r.level,'cp',r.cp,'place',r.place,
     'ranked_cards',r.ranked_cards,'ranked_variants',r.ranked_variants,
     'appearance',jsonb_build_object('background',st.background_id,
       'showcase_skin',st.showcase_skin_id,
       'avatar_frame',st.avatar_frame_id,'frame_color',coalesce(st.frame_color,'green'))
     ) ORDER BY r.place)
     FROM results r LEFT JOIN public.flip_profile_settings st ON st.telegram_id=r.telegram_id),'[]'::jsonb),
   'me',(SELECT jsonb_build_object('place',r.place,'cp',r.cp,'level',r.level,
        'ranked_cards',r.ranked_cards,'ranked_variants',r.ranked_variants,
        'public_id',r.public_id) FROM ranked r WHERE r.telegram_id=p_viewer_id),
   'players',(SELECT count(*) FROM ranked),
   'matches',(SELECT count(*) FROM ranked r CROSS JOIN filter f
     WHERE f.q='' OR position(f.q IN lower(coalesce(r.username,'')))>0
     OR position(f.q IN lower(coalesce(r.first_name,'')))>0)
 );
$flipsql$;
REVOKE ALL ON FUNCTION public.flip_leaderboard_social(bigint,text,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.flip_leaderboard_social(bigint,text,integer) TO service_role;

-- The numeric Telegram ID is resolved only by the signed trade endpoint,
-- not included in player profiles or leaderboard responses.
CREATE OR REPLACE FUNCTION public.flip_trade_profile_target(
  p_actor_id bigint, p_public_id uuid
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO '' AS $flipsql$
 SELECT jsonb_build_object('telegram_id',p.telegram_id::text,
   'username',p.username,'first_name',p.first_name,'level',p.level)
 FROM public.flip_players p
 WHERE p.public_id=p_public_id AND p.telegram_id<>p_actor_id;
$flipsql$;
REVOKE ALL ON FUNCTION public.flip_trade_profile_target(bigint,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.flip_trade_profile_target(bigint,uuid) TO service_role;
