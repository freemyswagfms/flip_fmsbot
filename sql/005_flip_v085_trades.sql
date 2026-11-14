-- FLIP v0.8.5: atomic 1-for-1 ranked card trades.
-- All RPCs are server_role-only, invoked after validated Telegram HMAC. No test copies, no F.
CREATE TABLE IF NOT EXISTS public.flip_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  sender_id bigint NOT NULL REFERENCES public.flip_players(telegram_id),
  recipient_id bigint NOT NULL REFERENCES public.flip_players(telegram_id),
  offer_card_id text NOT NULL REFERENCES public.flip_cards(id),
  want_card_id text NOT NULL REFERENCES public.flip_cards(id),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now()+interval '72 hours'),
  completed_at timestamptz,
  CONSTRAINT flip_trade_people_distinct CHECK(sender_id<>recipient_id),
  CONSTRAINT flip_trade_cards_distinct CHECK(offer_card_id<>want_card_id)
);
CREATE INDEX IF NOT EXISTS flip_trades_incoming_idx ON public.flip_trades(recipient_id,created_at DESC);
CREATE INDEX IF NOT EXISTS flip_trades_outgoing_idx ON public.flip_trades(sender_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.flip_trade_replies (
  request_id uuid PRIMARY KEY,
  trade_id uuid NOT NULL REFERENCES public.flip_trades(id),
  actor_id bigint NOT NULL REFERENCES public.flip_players(telegram_id),
  verb text NOT NULL CHECK(verb IN ('accept','decline','cancel')),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.flip_trade_xp_pairs (
  first_player bigint NOT NULL,
  second_player bigint NOT NULL,
  first_card text NOT NULL,
  second_card text NOT NULL,
  first_trade uuid NOT NULL REFERENCES public.flip_trades(id),
  PRIMARY KEY(first_player,second_player,first_card,second_card)
);
CREATE TABLE IF NOT EXISTS public.flip_trade_xp_awards (
  trade_id uuid NOT NULL REFERENCES public.flip_trades(id),
  telegram_id bigint NOT NULL REFERENCES public.flip_players(telegram_id),
  reward_day date NOT NULL,
  PRIMARY KEY(trade_id,telegram_id)
);
CREATE INDEX IF NOT EXISTS flip_trade_xp_awards_day_idx
  ON public.flip_trade_xp_awards(telegram_id,reward_day);
ALTER TABLE public.flip_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flip_trade_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flip_trade_xp_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flip_trade_xp_awards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flip_trades,public.flip_trade_replies,
  public.flip_trade_xp_pairs,public.flip_trade_xp_awards FROM public,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.flip_trades,public.flip_trade_replies,
  public.flip_trade_xp_pairs,public.flip_trade_xp_awards TO service_role;

CREATE OR REPLACE FUNCTION public.flip_trade_find_players(p_actor_id bigint,p_query text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'telegram_id',t.telegram_id::text,'username',t.username,
    'first_name',t.first_name,'level',t.level,'cp',public.flip_cp_total(t.telegram_id))
    ORDER BY t.first_name,t.telegram_id),'[]'::jsonb)
  FROM (
    SELECT p.telegram_id,p.username,p.first_name,p.level
    FROM public.flip_players p
    WHERE p.telegram_id<>p_actor_id AND length(trim(COALESCE(p_query,'')))>0
      AND (p.telegram_id::text=trim(p_query)
        OR p.username ilike '%'||left(trim(p_query),64)||'%'
        OR p.first_name ilike '%'||left(trim(p_query),64)||'%')
    ORDER BY p.created_at DESC LIMIT 15
  ) t;
$function$;

CREATE OR REPLACE FUNCTION public.flip_trade_player_cards(p_actor_id bigint,p_player_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM public.flip_players WHERE telegram_id=p_actor_id)
   THEN '[]'::jsonb ELSE COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id',i.card_id,'rarity',c.rarity,
      'ranked_count',i.ranked_quantity) ORDER BY i.card_id)
    FROM public.flip_inventory i JOIN public.flip_cards c ON c.id=i.card_id
    WHERE i.telegram_id=p_player_id AND i.ranked_quantity>0),'[]'::jsonb) END;
$function$;

CREATE OR REPLACE FUNCTION public.flip_trade_list(p_actor_id bigint,p_limit integer DEFAULT 40)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC),'[]'::jsonb)
  FROM (
    SELECT tr.id::text,tr.sender_id::text,tr.recipient_id::text,
      sender.username AS sender_username,sender.first_name AS sender_name,
      recipient.username AS recipient_username,recipient.first_name AS recipient_name,
      tr.offer_card_id,tr.want_card_id,
      CASE WHEN tr.status='pending' AND now()>tr.expires_at THEN 'expired' ELSE tr.status END AS status,
      tr.created_at,tr.expires_at,tr.completed_at
    FROM public.flip_trades tr
    JOIN public.flip_players sender ON sender.telegram_id=tr.sender_id
    JOIN public.flip_players recipient ON recipient.telegram_id=tr.recipient_id
    WHERE tr.sender_id=p_actor_id OR tr.recipient_id=p_actor_id
    ORDER BY tr.created_at DESC LIMIT LEAST(GREATEST(COALESCE(p_limit,40),1),60)
  ) t;
$function$;

CREATE OR REPLACE FUNCTION public.flip_cp_swap_delta(p_player_id bigint,p_give text,p_receive text)
RETURNS numeric LANGUAGE sql STABLE SET search_path TO ''
AS $function$
 WITH v AS (
   SELECT c.rarity,
     COALESCE((SELECT i.ranked_quantity FROM public.flip_inventory i
       WHERE i.telegram_id=p_player_id AND i.card_id=c.id),0) AS copies,
     c.id FROM public.flip_cards c WHERE c.id IN (p_give,p_receive)
 )
 SELECT COALESCE(SUM(CASE WHEN id=p_give
   THEN public.flip_cp_card_value(rarity,copies-1)-public.flip_cp_card_value(rarity,copies)
   ELSE public.flip_cp_card_value(rarity,copies+1)-public.flip_cp_card_value(rarity,copies)
   END),0)::numeric(16,2) FROM v;
$function$;

CREATE OR REPLACE FUNCTION public.flip_trade_preview(p_actor_id bigint,p_trade_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v public.flip_trades%rowtype;
  v_offer integer;
  v_want integer;
BEGIN
  SELECT * INTO v FROM public.flip_trades
    WHERE id=p_trade_id AND p_actor_id IN (sender_id,recipient_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'TRADE_NOT_FOUND'; END IF;
  SELECT COALESCE((SELECT ranked_quantity FROM public.flip_inventory
    WHERE telegram_id=v.sender_id AND card_id=v.offer_card_id),0) INTO v_offer;
  SELECT COALESCE((SELECT ranked_quantity FROM public.flip_inventory
    WHERE telegram_id=v.recipient_id AND card_id=v.want_card_id),0) INTO v_want;
  RETURN jsonb_build_object('id',v.id::text,'status',
      CASE WHEN v.status='pending' AND now()>v.expires_at THEN 'expired' ELSE v.status END,
    'available',v.status='pending' AND now()<=v.expires_at AND v_offer>0 AND v_want>0,
    'sender_delta',public.flip_cp_swap_delta(v.sender_id,v.offer_card_id,v.want_card_id),
    'recipient_delta',public.flip_cp_swap_delta(v.recipient_id,v.want_card_id,v.offer_card_id));
END;
$function$;

CREATE OR REPLACE FUNCTION public.flip_trade_create(
  p_actor_id bigint,p_recipient_id bigint,p_offer_card text,p_want_card text,p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE v_old public.flip_trades%rowtype; v_id uuid;
BEGIN
 IF p_actor_id IS NULL OR p_recipient_id IS NULL OR p_actor_id<=0 OR p_recipient_id<=0
  OR p_actor_id=p_recipient_id OR p_request_id IS NULL
  OR p_offer_card IS NULL OR p_want_card IS NULL
  OR p_offer_card=p_want_card OR length(p_offer_card)>160 OR length(p_want_card)>160
 THEN RAISE EXCEPTION 'BAD_TRADE'; END IF;
 SELECT * INTO v_old FROM public.flip_trades WHERE request_id=p_request_id;
 IF FOUND THEN
   IF v_old.sender_id<>p_actor_id OR v_old.recipient_id<>p_recipient_id
     OR v_old.offer_card_id<>p_offer_card OR v_old.want_card_id<>p_want_card
   THEN RAISE EXCEPTION 'DUPLICATE_TRADE_REQUEST'; END IF;
   RETURN jsonb_build_object('ok',true,'id',v_old.id::text,'replayed',true);
 END IF;
 -- Both players must be registered; a pending trade does not reserve an item.
 PERFORM 1 FROM public.flip_players WHERE telegram_id=p_actor_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
 PERFORM 1 FROM public.flip_players WHERE telegram_id=p_recipient_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'PLAYER_NOT_FOUND'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.flip_inventory
   WHERE telegram_id=p_actor_id AND card_id=p_offer_card AND ranked_quantity>0)
   OR NOT EXISTS(SELECT 1 FROM public.flip_inventory
   WHERE telegram_id=p_recipient_id AND card_id=p_want_card AND ranked_quantity>0)
 THEN RAISE EXCEPTION 'TRADE_CARD_UNAVAILABLE'; END IF;
 IF (SELECT COUNT(*) FROM public.flip_trades
   WHERE sender_id=p_actor_id AND status='pending' AND expires_at>now())>=20
 THEN RAISE EXCEPTION 'TRADE_PENDING_LIMIT'; END IF;
 INSERT INTO public.flip_trades(request_id,sender_id,recipient_id,offer_card_id,want_card_id)
  VALUES(p_request_id,p_actor_id,p_recipient_id,p_offer_card,p_want_card)
  RETURNING id INTO v_id;
 RETURN jsonb_build_object('ok',true,'id',v_id::text,'replayed',false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.flip_trade_reply(
  p_actor_id bigint,p_trade_id uuid,p_verb text,p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v public.flip_trades%rowtype;
  v_old public.flip_trade_replies%rowtype;
  v_result jsonb;
  v_count_a integer; v_count_b integer;
  v_cp_before_a numeric; v_cp_before_b numeric;
  v_cp_after_a numeric; v_cp_after_b numeric;
  v_xp_a integer:=0; v_xp_b integer:=0;
  v_new_a integer:=0; v_new_b integer:=0;
  v_pair_added integer;
  v_reward_day date:=(now() AT TIME ZONE 'Europe/Moscow')::date;
  v_player public.flip_players%rowtype;
  v_extra integer; v_xp integer; v_level integer; v_balance integer; v_bonus integer;
BEGIN
 IF p_actor_id IS NULL OR p_actor_id<=0 OR p_trade_id IS NULL OR p_request_id IS NULL
   OR p_verb NOT IN ('accept','decline','cancel')
 THEN RAISE EXCEPTION 'BAD_TRADE'; END IF;
 -- Serialize competing replies to a single trade, including replays.
 SELECT * INTO v FROM public.flip_trades WHERE id=p_trade_id FOR UPDATE;
 IF NOT FOUND OR p_actor_id NOT IN (v.sender_id,v.recipient_id) THEN
   RAISE EXCEPTION 'TRADE_NOT_FOUND';
 END IF;
 SELECT * INTO v_old FROM public.flip_trade_replies WHERE request_id=p_request_id;
 IF FOUND THEN
   IF v_old.trade_id<>p_trade_id OR v_old.actor_id<>p_actor_id OR v_old.verb<>p_verb
   THEN RAISE EXCEPTION 'DUPLICATE_TRADE_REQUEST'; END IF;
   RETURN v_old.result;
 END IF;
 IF v.status<>'pending' THEN RAISE EXCEPTION 'TRADE_ALREADY_CLOSED'; END IF;
 IF now()>v.expires_at THEN RAISE EXCEPTION 'TRADE_EXPIRED'; END IF;
 IF p_verb='cancel' AND p_actor_id<>v.sender_id THEN RAISE EXCEPTION 'TRADE_FORBIDDEN'; END IF;
 IF p_verb IN ('accept','decline') AND p_actor_id<>v.recipient_id
 THEN RAISE EXCEPTION 'TRADE_FORBIDDEN'; END IF;
 IF p_verb='accept' THEN
   -- All mutations to player inventories are serialized via player row locks.
   PERFORM 1 FROM public.flip_players
    WHERE telegram_id IN (v.sender_id,v.recipient_id) ORDER BY telegram_id FOR UPDATE;
   SELECT COALESCE((SELECT ranked_quantity FROM public.flip_inventory
     WHERE telegram_id=v.sender_id AND card_id=v.offer_card_id),0) INTO v_count_a;
   SELECT COALESCE((SELECT ranked_quantity FROM public.flip_inventory
     WHERE telegram_id=v.recipient_id AND card_id=v.want_card_id),0) INTO v_count_b;
   IF v_count_a=0 OR v_count_b=0 THEN RAISE EXCEPTION 'TRADE_CARD_UNAVAILABLE'; END IF;
   v_cp_before_a:=public.flip_cp_total(v.sender_id);
   v_cp_before_b:=public.flip_cp_total(v.recipient_id);
   -- A card copy can only be ranked OR test; transfer one ranked copy only.
   DELETE FROM public.flip_inventory
     WHERE telegram_id=v.sender_id AND card_id=v.offer_card_id
       AND quantity=1 AND ranked_quantity=1;
   IF NOT FOUND THEN
     UPDATE public.flip_inventory SET quantity=quantity-1,ranked_quantity=ranked_quantity-1
       WHERE telegram_id=v.sender_id AND card_id=v.offer_card_id AND ranked_quantity>0;
   END IF;
   DELETE FROM public.flip_inventory
     WHERE telegram_id=v.recipient_id AND card_id=v.want_card_id
       AND quantity=1 AND ranked_quantity=1;
   IF NOT FOUND THEN
     UPDATE public.flip_inventory SET quantity=quantity-1,ranked_quantity=ranked_quantity-1
       WHERE telegram_id=v.recipient_id AND card_id=v.want_card_id AND ranked_quantity>0;
   END IF;
   INSERT INTO public.flip_inventory(telegram_id,card_id,quantity,ranked_quantity,test_quantity)
     VALUES(v.sender_id,v.want_card_id,1,1,0)
     ON CONFLICT(telegram_id,card_id) DO UPDATE SET
       quantity=public.flip_inventory.quantity+1,ranked_quantity=public.flip_inventory.ranked_quantity+1;
   INSERT INTO public.flip_inventory(telegram_id,card_id,quantity,ranked_quantity,test_quantity)
     VALUES(v.recipient_id,v.offer_card_id,1,1,0)
     ON CONFLICT(telegram_id,card_id) DO UPDATE SET
       quantity=public.flip_inventory.quantity+1,ranked_quantity=public.flip_inventory.ranked_quantity+1;
   INSERT INTO public.flip_discoveries(telegram_id,card_id)
     VALUES(v.sender_id,v.want_card_id) ON CONFLICT DO NOTHING;
   GET DIAGNOSTICS v_new_a=ROW_COUNT;
   INSERT INTO public.flip_discoveries(telegram_id,card_id)
     VALUES(v.recipient_id,v.offer_card_id) ON CONFLICT DO NOTHING;
   GET DIAGNOSTICS v_new_b=ROW_COUNT;
   -- No repeated +15 XP for cycling the same pair of cards between the same users.
   INSERT INTO public.flip_trade_xp_pairs(first_player,second_player,first_card,second_card,first_trade)
     VALUES(LEAST(v.sender_id,v.recipient_id),GREATEST(v.sender_id,v.recipient_id),
       LEAST(v.offer_card_id,v.want_card_id),GREATEST(v.offer_card_id,v.want_card_id),v.id)
     ON CONFLICT DO NOTHING;
   GET DIAGNOSTICS v_pair_added=ROW_COUNT;
   IF v_pair_added>0 THEN
     IF (SELECT COUNT(*) FROM public.flip_trade_xp_awards
       WHERE telegram_id=v.sender_id AND reward_day=v_reward_day)<5 THEN
       v_xp_a:=15;
       INSERT INTO public.flip_trade_xp_awards(trade_id,telegram_id,reward_day)
         VALUES(v.id,v.sender_id,v_reward_day);
     END IF;
     IF (SELECT COUNT(*) FROM public.flip_trade_xp_awards
       WHERE telegram_id=v.recipient_id AND reward_day=v_reward_day)<5 THEN
       v_xp_b:=15;
       INSERT INTO public.flip_trade_xp_awards(trade_id,telegram_id,reward_day)
         VALUES(v.id,v.recipient_id,v_reward_day);
     END IF;
   END IF;
   -- First-ever discovery from a trade qualifies for the normal +10 unique XP,
   -- once per account, independently of the repeating-pair +15 protection.
   FOR v_player IN SELECT * FROM public.flip_players
     WHERE telegram_id IN (v.sender_id,v.recipient_id) ORDER BY telegram_id LOOP
     v_extra:=CASE WHEN v_player.telegram_id=v.sender_id
       THEN v_xp_a+v_new_a*10 ELSE v_xp_b+v_new_b*10 END;
     IF v_extra>0 THEN
       v_xp:=v_player.xp+v_extra;v_level:=v_player.level;
       v_balance:=v_player.balance;v_bonus:=v_player.bonus_packs;
       WHILE v_xp>=100+50*(v_level-1) LOOP
         v_xp:=v_xp-(100+50*(v_level-1));v_level:=v_level+1;
         v_balance:=v_balance+30;
         IF MOD(v_level,10)=0 THEN v_bonus:=v_bonus+1;
         ELSIF MOD(v_level,5)=0 THEN v_balance:=v_balance+50; END IF;
       END LOOP;
       UPDATE public.flip_players SET xp=v_xp,level=v_level,
         balance=v_balance,bonus_packs=v_bonus,updated_at=now()
         WHERE telegram_id=v_player.telegram_id;
     END IF;
   END LOOP;
   v_cp_after_a:=public.flip_cp_total(v.sender_id);
   v_cp_after_b:=public.flip_cp_total(v.recipient_id);
   UPDATE public.flip_trades SET status='accepted',completed_at=now() WHERE id=v.id;
   v_result:=jsonb_build_object('ok',true,'status','accepted',
     'sender_cp_delta',v_cp_after_a-v_cp_before_a,
     'recipient_cp_delta',v_cp_after_b-v_cp_before_b,
     'sender_xp',v_xp_a+v_new_a*10,'recipient_xp',v_xp_b+v_new_b*10);
 ELSE
   UPDATE public.flip_trades SET status=CASE WHEN p_verb='cancel' THEN 'cancelled' ELSE 'declined' END,
     completed_at=now() WHERE id=v.id;
   v_result:=jsonb_build_object('ok',true,'status',
     CASE WHEN p_verb='cancel' THEN 'cancelled' ELSE 'declined' END);
 END IF;
 INSERT INTO public.flip_trade_replies(request_id,trade_id,actor_id,verb,result)
   VALUES(p_request_id,p_trade_id,p_actor_id,p_verb,v_result);
 RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.flip_trade_find_players(bigint,text) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.flip_trade_player_cards(bigint,bigint) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.flip_trade_list(bigint,integer) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.flip_cp_swap_delta(bigint,text,text) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.flip_trade_preview(bigint,uuid) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.flip_trade_create(bigint,bigint,text,text,uuid) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.flip_trade_reply(bigint,uuid,text,uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.flip_trade_find_players(bigint,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.flip_trade_player_cards(bigint,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.flip_trade_list(bigint,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.flip_cp_swap_delta(bigint,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.flip_trade_preview(bigint,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.flip_trade_create(bigint,bigint,text,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.flip_trade_reply(bigint,uuid,text,uuid) TO service_role;
