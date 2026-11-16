-- FLIP v0.9.8.7 — persistent profile personalization, store and six-slot showcase.
-- Existing 3-slot pins and prior inventory remain unchanged.
-- All changes run through the signed Telegram game API with the service role.

ALTER TABLE public.flip_showcase_slots
 DROP CONSTRAINT IF EXISTS flip_showcase_slots_slot_check;
ALTER TABLE public.flip_showcase_slots
 ADD CONSTRAINT flip_showcase_slots_slot_check CHECK (slot BETWEEN 1 AND 6);

CREATE TABLE IF NOT EXISTS public.flip_profile_settings (
 telegram_id bigint PRIMARY KEY REFERENCES public.flip_players(telegram_id) ON DELETE CASCADE,
 slot_count smallint NOT NULL DEFAULT 3 CHECK(slot_count BETWEEN 3 AND 6),
 background_id text, avatar_frame_id text, showcase_skin_id text, title_id text,
 favorite_artist_id text REFERENCES public.flip_artists(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.flip_cosmetic_catalog (
 id text PRIMARY KEY CHECK(id ~ '^[a-z][a-z0-9-]{1,39}$'),
 kind text NOT NULL CHECK(kind IN('background','avatar_frame','showcase_skin','title')),
 name text NOT NULL CHECK(length(name) BETWEEN 2 AND 80),
 price integer NOT NULL CHECK(price BETWEEN 0 AND 50000),
 active boolean NOT NULL DEFAULT true,
 event_tag text,
 sort_order integer NOT NULL DEFAULT 0
);
INSERT INTO public.flip_cosmetic_catalog(id,kind,name,price,sort_order) VALUES
 ('acid-signal','background','ACID SIGNAL',250,1),
 ('midnight-grid','background','MIDNIGHT GRID',400,2),
 ('redline','background','REDLINE',600,3),
 ('neon-ring','avatar_frame','NEON RING',150,11),
 ('liquid-chrome','avatar_frame','LIQUID CHROME',350,12),
 ('pulse','avatar_frame','PULSE',500,13),
 ('glass-cabinet','showcase_skin','GLASS CABINET',350,21),
 ('black-chrome','showcase_skin','BLACK CHROME',550,22),
 ('red-velvet','showcase_skin','RED VELVET',750,23),
 ('archive-hunter','title','ARCHIVE HUNTER',180,31),
 ('no-skips','title','NO SKIPS',240,32),
 ('day-one','title','DAY ONE',400,33)
 ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,name=excluded.name,
 price=excluded.price,sort_order=excluded.sort_order;

CREATE TABLE IF NOT EXISTS public.flip_cosmetic_ownership(
 telegram_id bigint NOT NULL REFERENCES public.flip_players(telegram_id) ON DELETE CASCADE,
 item_id text NOT NULL REFERENCES public.flip_cosmetic_catalog(id),
 source text NOT NULL DEFAULT 'purchase'
  CHECK(source IN('purchase','event','bundle','admin')),
 acquired_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(telegram_id,item_id)
);
CREATE TABLE IF NOT EXISTS public.flip_profile_badge_pins(
 telegram_id bigint NOT NULL REFERENCES public.flip_players(telegram_id) ON DELETE CASCADE,
 slot smallint NOT NULL CHECK(slot BETWEEN 1 AND 3),
 badge_code text NOT NULL REFERENCES public.flip_achievement_defs(code),
 PRIMARY KEY(telegram_id,slot),UNIQUE(telegram_id,badge_code)
);
CREATE TABLE IF NOT EXISTS public.flip_profile_purchases(
 request_id uuid PRIMARY KEY,
 telegram_id bigint NOT NULL REFERENCES public.flip_players(telegram_id) ON DELETE CASCADE,
 action text NOT NULL CHECK(action IN('buy_slot','buy_cosmetic')),
 target text NOT NULL CHECK(length(target) BETWEEN 1 AND 50),
 price integer NOT NULL CHECK(price>=0),
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS flip_profile_purchases_user_time
 ON public.flip_profile_purchases(telegram_id,created_at DESC);

ALTER TABLE public.flip_profile_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flip_cosmetic_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flip_cosmetic_ownership ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flip_profile_badge_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flip_profile_purchases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flip_profile_settings,public.flip_cosmetic_catalog,
 public.flip_cosmetic_ownership,public.flip_profile_badge_pins,
 public.flip_profile_purchases FROM public,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.flip_profile_settings,
 public.flip_cosmetic_catalog,public.flip_cosmetic_ownership,
 public.flip_profile_badge_pins,public.flip_profile_purchases TO service_role;

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
    'avatar_frame',st.avatar_frame_id,'showcase_skin',st.showcase_skin_id,
    'title',st.title_id)
 );
END;
$f$;

CREATE OR REPLACE FUNCTION public.flip_showcase_own(p_telegram_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $f$
DECLARE v_id uuid; result jsonb;owned jsonb;
BEGIN
 SELECT public_id INTO v_id FROM public.flip_players WHERE telegram_id=p_telegram_id;
 IF v_id IS NULL THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
 result:=public.flip_public_profile(v_id);
 SELECT COALESCE(jsonb_agg(co.item_id ORDER BY co.item_id),'[]'::jsonb)
 INTO owned FROM public.flip_cosmetic_ownership co
 WHERE co.telegram_id=p_telegram_id;
 RETURN result||jsonb_build_object('owned_cosmetics',owned);
END;
$f$;

CREATE OR REPLACE FUNCTION public.flip_profile_cosmetics_shop(p_telegram_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $f$
DECLARE v_slots int;v_owned jsonb;v_items jsonb;v_balance int;
BEGIN
 SELECT balance INTO v_balance FROM public.flip_players
 WHERE telegram_id=p_telegram_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
 SELECT slot_count INTO v_slots FROM public.flip_profile_settings
 WHERE telegram_id=p_telegram_id;
 v_slots:=COALESCE(v_slots,3);
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'id',id,'kind',kind,'name',name,'price',price,'event_tag',event_tag)
  ORDER BY sort_order),'[]'::jsonb)
 INTO v_items FROM public.flip_cosmetic_catalog WHERE active AND event_tag IS NULL;
 SELECT COALESCE(jsonb_agg(item_id),'[]'::jsonb) INTO v_owned
 FROM public.flip_cosmetic_ownership WHERE telegram_id=p_telegram_id;
 RETURN jsonb_build_object('items',v_items,'owned',v_owned,
  'slot_count',v_slots,'next_slot_price',
   CASE v_slots WHEN 3 THEN 300 WHEN 4 THEN 600 WHEN 5 THEN 1200 ELSE NULL END,
  'balance',v_balance);
END;
$f$;

CREATE OR REPLACE FUNCTION public.flip_showcase_set(
 p_telegram_id bigint,p_slot integer,p_card_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $f$
DECLARE v_qty int;v_slots int;
BEGIN
 IF p_slot IS NULL OR p_slot NOT BETWEEN 1 AND 6 THEN RAISE EXCEPTION 'SHOWCASE_BAD_SLOT'; END IF;
 IF p_card_id IS NOT NULL AND
 (length(p_card_id)>160 OR p_card_id !~ '^[a-z0-9-]+/[a-z0-9-]+/[a-z0-9-]+$')
 THEN RAISE EXCEPTION 'SHOWCASE_BAD_CARD'; END IF;
 PERFORM 1 FROM public.flip_players WHERE telegram_id=p_telegram_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
 SELECT COALESCE(slot_count,3) INTO v_slots FROM public.flip_profile_settings
 WHERE telegram_id=p_telegram_id;
 IF p_slot>COALESCE(v_slots,3) THEN RAISE EXCEPTION 'SHOWCASE_SLOT_LOCKED'; END IF;
 IF p_card_id IS NULL THEN
  DELETE FROM public.flip_showcase_slots WHERE telegram_id=p_telegram_id AND slot=p_slot;
 ELSE
  SELECT ranked_quantity INTO v_qty FROM public.flip_inventory
  WHERE telegram_id=p_telegram_id AND card_id=p_card_id;
  IF COALESCE(v_qty,0)<=0 THEN RAISE EXCEPTION 'SHOWCASE_NOT_OWNED'; END IF;
  DELETE FROM public.flip_showcase_slots WHERE telegram_id=p_telegram_id
   AND card_id=p_card_id AND slot<>p_slot;
  INSERT INTO public.flip_showcase_slots(telegram_id,slot,card_id)
  VALUES(p_telegram_id,p_slot,p_card_id)
  ON CONFLICT(telegram_id,slot) DO UPDATE SET
    card_id=EXCLUDED.card_id,updated_at=now();
 END IF;
 RETURN jsonb_build_object('ok',true,'profile',public.flip_showcase_own(p_telegram_id));
END;
$f$;

-- Atomic, exactly-once F purchase. Player lock serializes with packs and trades.
CREATE OR REPLACE FUNCTION public.flip_profile_purchase(
 p_telegram_id bigint,p_request_id uuid,p_action text,p_item_id text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $f$
DECLARE player public.flip_players%ROWTYPE;
 saved public.flip_profile_purchases%ROWTYPE;
 item public.flip_cosmetic_catalog%ROWTYPE;
 slot_count int;v_cost int;v_new_slot int;v_result jsonb;
BEGIN
 IF p_request_id IS NULL OR p_action NOT IN('buy_slot','buy_cosmetic') OR
  p_item_id IS NULL OR length(p_item_id)>50
 THEN RAISE EXCEPTION 'PROFILE_BAD_REQUEST'; END IF;
 SELECT * INTO player FROM public.flip_players
 WHERE telegram_id=p_telegram_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
 SELECT * INTO saved FROM public.flip_profile_purchases WHERE request_id=p_request_id;
 IF FOUND THEN
  IF saved.telegram_id<>p_telegram_id OR saved.action<>p_action OR saved.target<>p_item_id
  THEN RAISE EXCEPTION 'DUPLICATE_REQUEST_ACTION'; END IF;
  RETURN saved.result;
 END IF;
 IF p_action='buy_slot' THEN
  SELECT COALESCE(st.slot_count,3) INTO slot_count FROM public.flip_profile_settings st
  WHERE st.telegram_id=p_telegram_id;
  slot_count:=COALESCE(slot_count,3);
  v_new_slot:=slot_count+1;
  IF v_new_slot>6 OR p_item_id<>('slot-'||v_new_slot) THEN
   RAISE EXCEPTION 'PROFILE_SLOT_UNAVAILABLE'; END IF;
  v_cost:=CASE v_new_slot WHEN 4 THEN 300 WHEN 5 THEN 600 WHEN 6 THEN 1200 END;
 ELSE
  SELECT * INTO item FROM public.flip_cosmetic_catalog
   WHERE id=p_item_id AND active AND event_tag IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROFILE_ITEM_UNAVAILABLE'; END IF;
  IF EXISTS(SELECT 1 FROM public.flip_cosmetic_ownership
   WHERE telegram_id=p_telegram_id AND item_id=p_item_id)
  THEN RAISE EXCEPTION 'PROFILE_ALREADY_OWNED'; END IF;
  v_cost:=item.price;
 END IF;
 IF player.balance<v_cost THEN RAISE EXCEPTION 'INSUFFICIENT_FUNDS'; END IF;
 UPDATE public.flip_players SET balance=balance-v_cost,updated_at=now()
 WHERE telegram_id=p_telegram_id;
 IF p_action='buy_slot' THEN
  INSERT INTO public.flip_profile_settings(telegram_id,slot_count)
  VALUES(p_telegram_id,v_new_slot)
  ON CONFLICT(telegram_id) DO UPDATE SET slot_count=v_new_slot,updated_at=now();
 ELSE
  INSERT INTO public.flip_cosmetic_ownership(telegram_id,item_id,source)
  VALUES(p_telegram_id,p_item_id,'purchase');
 END IF;
 v_result:=jsonb_build_object('ok',true,'price',v_cost,
  'balance',player.balance-v_cost,'profile',public.flip_showcase_own(p_telegram_id),
  'shop',public.flip_profile_cosmetics_shop(p_telegram_id));
 INSERT INTO public.flip_profile_purchases(request_id,telegram_id,action,target,price,result)
 VALUES(p_request_id,p_telegram_id,p_action,p_item_id,v_cost,v_result);
 RETURN v_result;
END;
$f$;

CREATE OR REPLACE FUNCTION public.flip_profile_equip(
 p_telegram_id bigint,p_kind text,p_item_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $f$
DECLARE v_kind text;
BEGIN
 IF p_kind NOT IN('background','avatar_frame','showcase_skin','title') OR
   (p_item_id IS NOT NULL AND length(p_item_id)>40)
 THEN RAISE EXCEPTION 'PROFILE_BAD_REQUEST'; END IF;
 PERFORM 1 FROM public.flip_players WHERE telegram_id=p_telegram_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
 IF p_item_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.flip_cosmetic_ownership o
  JOIN public.flip_cosmetic_catalog c ON c.id=o.item_id
  WHERE o.telegram_id=p_telegram_id AND o.item_id=p_item_id
   AND c.kind=p_kind AND c.active
 ) THEN RAISE EXCEPTION 'PROFILE_NOT_OWNED'; END IF;
 INSERT INTO public.flip_profile_settings(telegram_id) VALUES(p_telegram_id)
 ON CONFLICT DO NOTHING;
 UPDATE public.flip_profile_settings SET
   background_id=CASE WHEN p_kind='background' THEN p_item_id ELSE background_id END,
   avatar_frame_id=CASE WHEN p_kind='avatar_frame' THEN p_item_id ELSE avatar_frame_id END,
   showcase_skin_id=CASE WHEN p_kind='showcase_skin' THEN p_item_id ELSE showcase_skin_id END,
   title_id=CASE WHEN p_kind='title' THEN p_item_id ELSE title_id END,
   updated_at=now() WHERE telegram_id=p_telegram_id;
 RETURN jsonb_build_object('ok',true,'profile',public.flip_showcase_own(p_telegram_id));
END;
$f$;

CREATE OR REPLACE FUNCTION public.flip_profile_favorite_artist(
 p_telegram_id bigint,p_artist_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $f$
BEGIN
 IF p_artist_id IS NOT NULL AND
  (length(p_artist_id)>65 OR NOT EXISTS(SELECT 1 FROM public.flip_artists
   WHERE id=p_artist_id AND active))
 THEN RAISE EXCEPTION 'PROFILE_BAD_ARTIST'; END IF;
 PERFORM 1 FROM public.flip_players WHERE telegram_id=p_telegram_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
 INSERT INTO public.flip_profile_settings(telegram_id,favorite_artist_id)
 VALUES(p_telegram_id,p_artist_id)
 ON CONFLICT(telegram_id) DO UPDATE SET favorite_artist_id=EXCLUDED.favorite_artist_id,updated_at=now();
 RETURN jsonb_build_object('ok',true,'profile',public.flip_showcase_own(p_telegram_id));
END;
$f$;

CREATE OR REPLACE FUNCTION public.flip_profile_pin_badge(
 p_telegram_id bigint,p_slot integer,p_badge_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $f$
BEGIN
 IF p_slot IS NULL OR p_slot NOT BETWEEN 1 AND 3 OR
  (p_badge_code IS NOT NULL AND length(p_badge_code)>60)
 THEN RAISE EXCEPTION 'PROFILE_BAD_REQUEST'; END IF;
 PERFORM 1 FROM public.flip_players WHERE telegram_id=p_telegram_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
 IF p_badge_code IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.flip_achievement_claims cl
  JOIN public.flip_achievement_defs d ON d.code=cl.achievement_code
  WHERE cl.telegram_id=p_telegram_id AND cl.achievement_code=p_badge_code
   AND d.badge IS NOT NULL AND d.active
 ) THEN RAISE EXCEPTION 'PROFILE_BAD_BADGE'; END IF;
 IF p_badge_code IS NULL THEN
  DELETE FROM public.flip_profile_badge_pins
  WHERE telegram_id=p_telegram_id AND slot=p_slot;
 ELSE
  DELETE FROM public.flip_profile_badge_pins WHERE telegram_id=p_telegram_id
   AND badge_code=p_badge_code AND slot<>p_slot;
  INSERT INTO public.flip_profile_badge_pins(telegram_id,slot,badge_code)
  VALUES(p_telegram_id,p_slot,p_badge_code)
  ON CONFLICT(telegram_id,slot) DO UPDATE SET badge_code=EXCLUDED.badge_code;
 END IF;
 RETURN jsonb_build_object('ok',true,'profile',public.flip_showcase_own(p_telegram_id));
END;
$f$;

-- Called only by trusted future event/bundle/admin server logic; not by the client API.
CREATE OR REPLACE FUNCTION public.flip_profile_award_cosmetic(
 p_telegram_id bigint,p_item_id text,p_source text DEFAULT 'event')
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $f$
BEGIN
 IF p_source NOT IN('event','bundle','admin') OR
  NOT EXISTS(SELECT 1 FROM public.flip_cosmetic_catalog WHERE id=p_item_id AND active)
 THEN RAISE EXCEPTION 'PROFILE_BAD_REQUEST'; END IF;
 PERFORM 1 FROM public.flip_players WHERE telegram_id=p_telegram_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
 INSERT INTO public.flip_cosmetic_ownership(telegram_id,item_id,source)
 VALUES(p_telegram_id,p_item_id,p_source) ON CONFLICT DO NOTHING;
 RETURN true;
END;
$f$;

REVOKE ALL ON FUNCTION public.flip_public_profile(uuid),
 public.flip_showcase_own(bigint),public.flip_profile_cosmetics_shop(bigint),
 public.flip_showcase_set(bigint,integer,text),
 public.flip_profile_purchase(bigint,uuid,text,text),
 public.flip_profile_equip(bigint,text,text),
 public.flip_profile_favorite_artist(bigint,text),
 public.flip_profile_pin_badge(bigint,integer,text),
 public.flip_profile_award_cosmetic(bigint,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.flip_public_profile(uuid),
 public.flip_showcase_own(bigint),public.flip_profile_cosmetics_shop(bigint),
 public.flip_showcase_set(bigint,integer,text),
 public.flip_profile_purchase(bigint,uuid,text,text),
 public.flip_profile_equip(bigint,text,text),
 public.flip_profile_favorite_artist(bigint,text),
 public.flip_profile_pin_badge(bigint,integer,text),
 public.flip_profile_award_cosmetic(bigint,text,text)
 TO service_role;
