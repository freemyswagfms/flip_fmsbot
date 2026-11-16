-- FLIP v0.9.8.8: free frame palette, three new items, dynamic public styling.
-- Existing purchases, equipped styles and slots remain intact.
ALTER TABLE public.flip_profile_settings
 ADD COLUMN IF NOT EXISTS frame_color text NOT NULL DEFAULT 'green';
ALTER TABLE public.flip_profile_settings
 DROP CONSTRAINT IF EXISTS flip_profile_settings_frame_color_check;
ALTER TABLE public.flip_profile_settings
 ADD CONSTRAINT flip_profile_settings_frame_color_check
 CHECK (frame_color IN ('green','pink','red','orange','blue','white','violet','cyan','rgb','glitch'));

INSERT INTO public.flip_cosmetic_catalog(id,kind,name,price,active,sort_order) VALUES
 ('pastel-dream','background','PASTEL DREAM',350,true,4),
 ('blush-gallery','showcase_skin','BLUSH GALLERY',450,true,24),
 ('aurora-flow','avatar_frame','AURORA FLOW',600,true,14)
 ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,name=excluded.name,
 price=excluded.price,active=true,sort_order=excluded.sort_order;

CREATE OR REPLACE FUNCTION public.flip_public_profile(p_public_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $f$
DECLARE p public.flip_players%ROWTYPE;
 st public.flip_profile_settings%ROWTYPE;
 v_slots jsonb:='[]'::jsonb; v_badges jsonb:='[]'::jsonb;
 v_pins jsonb:='[]'::jsonb; v_owned int:=0;v_unique int:=0;
 v_artist text;
BEGIN
 SELECT * INTO p FROM public.flip_players WHERE public_id=p_public_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'PLAYER_NOT_FOUND'; END IF;
 SELECT * INTO st FROM public.flip_profile_settings WHERE telegram_id=p.telegram_id;
 SELECT a.name INTO v_artist FROM public.flip_artists a WHERE a.id=st.favorite_artist_id AND a.active;

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'slot',n.slot,'card_id',CASE WHEN inv.card_id IS NOT NULL THEN s.card_id ELSE NULL END,
   'rarity',CASE WHEN inv.card_id IS NOT NULL THEN c.rarity ELSE NULL END)
   ORDER BY n.slot),'[]'::jsonb)
 INTO v_slots
 FROM generate_series(1,COALESCE(st.slot_count,3)::int) n(slot)
 LEFT JOIN public.flip_showcase_slots s ON s.telegram_id=p.telegram_id AND s.slot=n.slot
 LEFT JOIN public.flip_inventory inv ON inv.telegram_id=p.telegram_id
  AND inv.card_id=s.card_id AND inv.ranked_quantity>0
 LEFT JOIN public.flip_cards c ON c.id=inv.card_id;
 SELECT count(*)::int,COALESCE(sum(i.ranked_quantity),0)::int INTO v_unique,v_owned
 FROM public.flip_inventory i WHERE i.telegram_id=p.telegram_id AND i.ranked_quantity>0;
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'code',d.code,'title',d.title,'symbol',d.symbol,'badge',d.badge)
  ORDER BY cl.claimed_at DESC),'[]'::jsonb)
 INTO v_badges FROM (
  SELECT DISTINCT ON(achievement_code) achievement_code,claimed_at
  FROM public.flip_achievement_claims WHERE telegram_id=p.telegram_id
  ORDER BY achievement_code,claimed_at DESC
 ) cl JOIN public.flip_achievement_defs d ON d.code=cl.achievement_code
 WHERE d.badge IS NOT NULL AND d.active;
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'slot',bp.slot,'code',d.code,'title',d.title,
  'symbol',d.symbol,'badge',d.badge) ORDER BY bp.slot),'[]'::jsonb)
 INTO v_pins FROM public.flip_profile_badge_pins bp
 JOIN public.flip_achievement_defs d ON d.code=bp.badge_code AND d.active AND d.badge IS NOT NULL
 WHERE bp.telegram_id=p.telegram_id
 AND EXISTS(SELECT 1 FROM public.flip_achievement_claims cl
  WHERE cl.telegram_id=p.telegram_id AND cl.achievement_code=bp.badge_code);
 RETURN jsonb_build_object(
  'public_id',p.public_id,'username',p.username,'first_name',p.first_name,
  'level',p.level,'cp',public.flip_cp_total(p.telegram_id),
  'ranked_cards',v_owned,'ranked_variants',v_unique,
  'slot_count',COALESCE(st.slot_count,3),'slots',v_slots,'badges',v_badges,
  'pinned_badges',v_pins,
  'favorite_artist',CASE WHEN v_artist IS NOT NULL THEN jsonb_build_object(
     'id',st.favorite_artist_id,'name',v_artist) ELSE NULL END,
  'appearance',jsonb_build_object('background',st.background_id,
    'avatar_frame',st.avatar_frame_id,
    'frame_color',COALESCE(st.frame_color,'green'),'showcase_skin',st.showcase_skin_id,
    'title',st.title_id)
 );
END;
$f$;


CREATE OR REPLACE FUNCTION public.flip_profile_frame_color(
 p_telegram_id bigint,p_color text)
 RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $f$
BEGIN
 IF p_color IS NULL OR p_color NOT IN
 ('green','pink','red','orange','blue','white','violet','cyan','rgb','glitch')
 THEN RAISE EXCEPTION 'PROFILE_BAD_FRAME_COLOR'; END IF;
 PERFORM 1 FROM public.flip_players WHERE telegram_id=p_telegram_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
 INSERT INTO public.flip_profile_settings(telegram_id,frame_color)
 VALUES(p_telegram_id,p_color)
 ON CONFLICT(telegram_id) DO UPDATE
 SET frame_color=EXCLUDED.frame_color,updated_at=now();
 RETURN jsonb_build_object('ok',true,
  'profile',public.flip_showcase_own(p_telegram_id));
END;
$f$;
REVOKE ALL ON FUNCTION public.flip_profile_frame_color(bigint,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.flip_profile_frame_color(bigint,text) TO service_role;
