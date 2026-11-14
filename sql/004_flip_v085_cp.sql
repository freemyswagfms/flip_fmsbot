-- FLIP v0.8.5: Collection Points (CP) are derived from CURRENT ranked inventory.
-- Never store an accumulating CP balance. Admin ranked gifts count exactly like drops;
-- administrative test copies never count. The first 10 copies contribute 150% maximum.
CREATE OR REPLACE FUNCTION public.flip_cp_card_value(p_rarity text,p_quantity integer)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $function$
  SELECT CASE lower(coalesce(p_rarity,''))
    WHEN 'common' THEN 1 WHEN 'rare' THEN 4 WHEN 'epic' THEN 12
    WHEN 'legendary' THEN 35 WHEN 'mythic' THEN 90 WHEN 'hidden' THEN 250
    ELSE 0 END::numeric
    * (
        CASE WHEN coalesce(p_quantity,0)>=1 THEN 100 ELSE 0 END +
        CASE WHEN coalesce(p_quantity,0)>=2 THEN 25 ELSE 0 END +
        CASE WHEN coalesce(p_quantity,0)>=3 THEN 10 ELSE 0 END +
        CASE WHEN coalesce(p_quantity,0)>=4 THEN 5 ELSE 0 END +
        CASE WHEN coalesce(p_quantity,0)>=5 THEN 5 ELSE 0 END +
        GREATEST(0,LEAST(coalesce(p_quantity,0),10)-5)
      )::numeric / 100;
$function$;

CREATE OR REPLACE FUNCTION public.flip_cp_total(p_telegram_id bigint)
RETURNS numeric LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  SELECT COALESCE(SUM(public.flip_cp_card_value(c.rarity,i.ranked_quantity)),0)::numeric(16,2)
  FROM public.flip_inventory i JOIN public.flip_cards c ON c.id=i.card_id
  WHERE i.telegram_id=p_telegram_id AND i.ranked_quantity>0;
$function$;

CREATE OR REPLACE FUNCTION public.flip_cp_leaderboard(p_viewer_id bigint,p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  WITH player_scores AS (
    SELECT p.telegram_id,p.username,p.first_name,p.level,
      COALESCE(SUM(public.flip_cp_card_value(c.rarity,i.ranked_quantity)),0)::numeric(16,2) AS cp,
      COALESCE(SUM(i.ranked_quantity),0)::bigint AS ranked_cards,
      COUNT(i.card_id) FILTER(WHERE i.ranked_quantity>0)::bigint AS ranked_variants
    FROM public.flip_players p
    LEFT JOIN public.flip_inventory i ON i.telegram_id=p.telegram_id
    LEFT JOIN public.flip_cards c ON c.id=i.card_id
    GROUP BY p.telegram_id,p.username,p.first_name,p.level
  ), ordered AS (
    SELECT *,ROW_NUMBER() OVER(ORDER BY cp DESC,ranked_variants DESC,telegram_id ASC)::integer AS place
    FROM player_scores
  )
  SELECT jsonb_build_object(
    'leaders',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'telegram_id',telegram_id::text,'username',username,'first_name',first_name,
      'level',level,'cp',cp,'ranked_cards',ranked_cards,
      'ranked_variants',ranked_variants,'place',place) ORDER BY place)
      FROM ordered WHERE place<=LEAST(GREATEST(COALESCE(p_limit,50),1),100)),'[]'::jsonb),
    'me',(SELECT jsonb_build_object('telegram_id',telegram_id::text,
      'level',level,'cp',cp,'ranked_cards',ranked_cards,
      'ranked_variants',ranked_variants,'place',place) FROM ordered WHERE telegram_id=p_viewer_id),
    'players',(SELECT COUNT(*) FROM ordered)
  );
$function$;

-- Enrich the existing authoritative snapshot without changing the drop/pack RPC contract.
CREATE OR REPLACE FUNCTION public.flip_snapshot(p_telegram_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO ''
AS $function$
  SELECT jsonb_build_object(
    'balance',p.balance,'xp',p.xp,'level',p.level,'xp_to_next',100+50*(p.level-1),
    'cp',public.flip_cp_total(p.telegram_id),
    'pity_misses',p.pity_misses,'drop_ready_at',p.drop_ready_at,
    'welcome_remaining',p.welcome_remaining,'claimed_tasks',to_jsonb(p.claimed_tasks),
    'packs_today',p.packs_today,'bonus_packs',p.bonus_packs,
    'username',p.username,'first_name',p.first_name,
    'inventory',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.card_id,
       'count',i.quantity,'ranked_count',i.ranked_quantity,'test_count',i.test_quantity)
       ORDER BY i.card_id) FROM public.flip_inventory i WHERE i.telegram_id=p.telegram_id),'[]'::jsonb),
    'discovered',COALESCE((SELECT jsonb_agg(d.card_id ORDER BY d.card_id)
       FROM public.flip_discoveries d WHERE d.telegram_id=p.telegram_id),'[]'::jsonb)
  ) FROM public.flip_players p WHERE p.telegram_id=p_telegram_id;
$function$;

REVOKE ALL ON FUNCTION public.flip_cp_card_value(text,integer) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.flip_cp_total(bigint) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.flip_cp_leaderboard(bigint,integer) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.flip_snapshot(bigint) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.flip_cp_card_value(text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.flip_cp_total(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.flip_cp_leaderboard(bigint,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.flip_snapshot(bigint) TO service_role;
