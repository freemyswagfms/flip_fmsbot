-- FLIP v0.9.8 — immediate gifts and card <-> F trades.
-- Only authenticated API service_role may invoke these routines. All transfers are transactional.
-- Existing card/card trade functions and CP rarity weights remain unchanged.

CREATE TABLE IF NOT EXISTS public.flip_gifts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL UNIQUE,
 sender_id bigint NOT NULL REFERENCES public.flip_players(telegram_id),
 recipient_id bigint NOT NULL REFERENCES public.flip_players(telegram_id),
 card_id text NOT NULL REFERENCES public.flip_cards(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT flip_gifts_distinct_players CHECK(sender_id<>recipient_id)
);
CREATE INDEX IF NOT EXISTS flip_gifts_sender_recent ON public.flip_gifts(sender_id,created_at DESC);
CREATE INDEX IF NOT EXISTS flip_gifts_recipient_recent ON public.flip_gifts(recipient_id,created_at DESC);
ALTER TABLE public.flip_gifts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flip_gifts FROM public,anon,authenticated;
GRANT SELECT,INSERT ON public.flip_gifts TO service_role;

CREATE TABLE IF NOT EXISTS public.flip_f_trades(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL UNIQUE,
 sender_id bigint NOT NULL REFERENCES public.flip_players(telegram_id),
 recipient_id bigint NOT NULL REFERENCES public.flip_players(telegram_id),
 offer_cards text[] NOT NULL DEFAULT '{}'::text[],
 want_cards text[] NOT NULL DEFAULT '{}'::text[],
 offer_f integer NOT NULL DEFAULT 0,
 want_f integer NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','declined','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '72 hours'),
 completed_at timestamptz,
 CONSTRAINT flip_f_trades_distinct_players CHECK(sender_id<>recipient_id),
 CONSTRAINT flip_f_trade_shape CHECK(
  (cardinality(offer_cards) BETWEEN 1 AND 5 AND cardinality(want_cards)=0
   AND offer_f=0 AND want_f BETWEEN 1 AND 10000)
  OR (cardinality(want_cards) BETWEEN 1 AND 5 AND cardinality(offer_cards)=0
   AND want_f=0 AND offer_f BETWEEN 1 AND 10000))
);
CREATE INDEX IF NOT EXISTS flip_f_trades_sender_recent ON public.flip_f_trades(sender_id,created_at DESC);
CREATE INDEX IF NOT EXISTS flip_f_trades_recipient_recent ON public.flip_f_trades(recipient_id,created_at DESC);
ALTER TABLE public.flip_f_trades ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flip_f_trades FROM public,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.flip_f_trades TO service_role;

CREATE TABLE IF NOT EXISTS public.flip_f_trade_replies(
 request_id uuid PRIMARY KEY,
 trade_id uuid NOT NULL REFERENCES public.flip_f_trades(id),
 actor_id bigint NOT NULL,
 verb text NOT NULL CHECK(verb IN('accept','decline','cancel')),
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.flip_f_trade_replies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flip_f_trade_replies FROM public,anon,authenticated;
GRANT SELECT,INSERT ON public.flip_f_trade_replies TO service_role;

-- New delivery source is an actual player gift, not a fabricated admin award.
ALTER TABLE public.flip_card_deliveries DROP CONSTRAINT IF EXISTS flip_card_deliveries_source_kind_check;
ALTER TABLE public.flip_card_deliveries ADD CONSTRAINT flip_card_deliveries_source_kind_check
 CHECK(source_kind IN ('admin','trade','gift'));
ALTER TABLE public.flip_user_events DROP CONSTRAINT IF EXISTS flip_user_events_kind_check;
ALTER TABLE public.flip_user_events ADD CONSTRAINT flip_user_events_kind_check CHECK(kind IN(
 'trade_offer','trade_counteroffer','trade_accepted','trade_declined',
 'trade_cancelled','trade_countered','drop','pack','achievement_claim',
 'gift_received','gift_sent','currency_offer','currency_accepted',
 'currency_declined','currency_cancelled'
));

-- Ranked copies obtained in a drop/pack during the last 24h cannot be
-- gifted or sold in new F trades. Older ranked copies remain transferable.
-- This is deliberately conservative for variants with several copies.
CREATE OR REPLACE FUNCTION public.flip_transferable_ranked(p_player_id bigint,p_card_id text)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $fn$
DECLARE v_owned integer:=0; v_locked integer:=0;
BEGIN
 SELECT COALESCE(i.ranked_quantity,0) INTO v_owned
 FROM public.flip_inventory i WHERE i.telegram_id=p_player_id AND i.card_id=p_card_id;
 v_owned:=COALESCE(v_owned,0);
 SELECT COALESCE(SUM(CASE
   WHEN a.action='drop' AND a.result->>'card_id'=p_card_id THEN 1
   WHEN a.action IN('pack','theme_pack') THEN (
     SELECT count(*) FROM jsonb_array_elements_text(
       CASE WHEN jsonb_typeof(a.result->'card_ids')='array' THEN a.result->'card_ids'
        ELSE '[]'::jsonb END) x(id) WHERE x.id=p_card_id)
   ELSE 0 END),0)::integer
 INTO v_locked
 FROM public.flip_actions a
 WHERE a.telegram_id=p_player_id AND a.created_at>now()-interval '24 hours'
   AND a.action IN('drop','pack','theme_pack');
 RETURN GREATEST(0,v_owned-v_locked);
END; $fn$;

-- Must be called only AFTER locking the owning players, from a service-role
-- transaction. A test copy is never deducted, even if other copies exist.
CREATE OR REPLACE FUNCTION public.flip_transfer_take(p_player_id bigint,p_card_id text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
BEGIN
 DELETE FROM public.flip_inventory
 WHERE telegram_id=p_player_id AND card_id=p_card_id
   AND quantity=1 AND ranked_quantity=1;
 IF NOT FOUND THEN
   UPDATE public.flip_inventory
   SET quantity=quantity-1,ranked_quantity=ranked_quantity-1
   WHERE telegram_id=p_player_id AND card_id=p_card_id
     AND quantity>1 AND ranked_quantity>0;
   IF NOT FOUND THEN RAISE EXCEPTION 'TRADE_CARD_UNAVAILABLE'; END IF;
 END IF;
END; $fn$;

CREATE OR REPLACE FUNCTION public.flip_transfer_grant(p_player_id bigint,p_card_id text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
BEGIN
 INSERT INTO public.flip_inventory(telegram_id,card_id,quantity,ranked_quantity,test_quantity)
 VALUES(p_player_id,p_card_id,1,1,0)
 ON CONFLICT(telegram_id,card_id) DO UPDATE
 SET quantity=public.flip_inventory.quantity+1,
     ranked_quantity=public.flip_inventory.ranked_quantity+1;
 INSERT INTO public.flip_discoveries(telegram_id,card_id)
 VALUES(p_player_id,p_card_id) ON CONFLICT DO NOTHING;
END; $fn$;

CREATE OR REPLACE FUNCTION public.flip_gift_send(
 p_actor_id bigint,p_recipient_id bigint,p_card_id text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_old public.flip_gifts%rowtype;v_id uuid;
BEGIN
 IF p_actor_id IS NULL OR p_actor_id<=0 OR p_recipient_id IS NULL OR
   p_recipient_id<=0 OR p_actor_id=p_recipient_id OR p_request_id IS NULL OR
   p_card_id IS NULL OR length(p_card_id)>160
 THEN RAISE EXCEPTION 'BAD_GIFT'; END IF;
 SELECT * INTO v_old FROM public.flip_gifts WHERE request_id=p_request_id;
 IF FOUND THEN
   IF v_old.sender_id<>p_actor_id OR v_old.recipient_id<>p_recipient_id OR
      v_old.card_id<>p_card_id THEN RAISE EXCEPTION 'DUPLICATE_TRADE_REQUEST'; END IF;
   RETURN jsonb_build_object('ok',true,'id',v_old.id::text,'replayed',true);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.flip_cards WHERE id=p_card_id AND active)
 THEN RAISE EXCEPTION 'CARD_NOT_FOUND'; END IF;
 PERFORM 1 FROM public.flip_players
  WHERE telegram_id IN(p_actor_id,p_recipient_id) ORDER BY telegram_id FOR UPDATE;
 -- A concurrent retry may have committed while waiting for player row locks.
 SELECT * INTO v_old FROM public.flip_gifts WHERE request_id=p_request_id;
 IF FOUND THEN
   IF v_old.sender_id<>p_actor_id OR v_old.recipient_id<>p_recipient_id OR
      v_old.card_id<>p_card_id THEN RAISE EXCEPTION 'DUPLICATE_TRADE_REQUEST'; END IF;
   RETURN jsonb_build_object('ok',true,'id',v_old.id::text,'replayed',true);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.flip_players WHERE telegram_id=p_actor_id)
 THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.flip_players WHERE telegram_id=p_recipient_id)
 THEN RAISE EXCEPTION 'PLAYER_NOT_FOUND'; END IF;
 IF (SELECT count(*) FROM public.flip_gifts
   WHERE sender_id=p_actor_id AND created_at>=now()-interval '24 hours')>=10
 THEN RAISE EXCEPTION 'GIFT_DAILY_LIMIT'; END IF;
 IF public.flip_transferable_ranked(p_actor_id,p_card_id)<1
 THEN RAISE EXCEPTION 'TRADE_CARD_UNAVAILABLE'; END IF;
 PERFORM public.flip_transfer_take(p_actor_id,p_card_id);
 PERFORM public.flip_transfer_grant(p_recipient_id,p_card_id);
 INSERT INTO public.flip_gifts(request_id,sender_id,recipient_id,card_id)
 VALUES(p_request_id,p_actor_id,p_recipient_id,p_card_id) RETURNING id INTO v_id;
 INSERT INTO public.flip_card_deliveries
   (telegram_id,source_kind,source_key,card_ids,actor_id)
 VALUES(p_recipient_id,'gift','gift:'||v_id::text,ARRAY[p_card_id],p_actor_id)
 ON CONFLICT(source_key) DO NOTHING;
 INSERT INTO public.flip_user_events
   (telegram_id,event_key,kind,actor_id,details,is_notification)
 VALUES(p_recipient_id,'gift:'||v_id::text||':received','gift_received',p_actor_id,
     jsonb_build_object('card_id',p_card_id),true),
       (p_actor_id,'gift:'||v_id::text||':sent','gift_sent',p_recipient_id,
     jsonb_build_object('card_id',p_card_id),false)
 ON CONFLICT(event_key) DO NOTHING;
 RETURN jsonb_build_object('ok',true,'id',v_id::text,'replayed',false);
END; $fn$;

CREATE OR REPLACE FUNCTION public.flip_gift_list(p_actor_id bigint,p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]'::jsonb)
FROM (SELECT g.id::text,g.sender_id::text,g.recipient_id::text,g.card_id,g.created_at,
  sender.username AS sender_username,sender.first_name AS sender_name,
  recipient.username AS recipient_username,recipient.first_name AS recipient_name
 FROM public.flip_gifts g
 JOIN public.flip_players sender ON sender.telegram_id=g.sender_id
 JOIN public.flip_players recipient ON recipient.telegram_id=g.recipient_id
 WHERE g.sender_id=p_actor_id OR g.recipient_id=p_actor_id
 ORDER BY g.created_at DESC LIMIT LEAST(GREATEST(COALESCE(p_limit,20),1),40)) x;
$fn$;

CREATE OR REPLACE FUNCTION public.flip_f_trade_validate(
 p_offer text[],p_want text[],p_offer_f integer,p_want_f integer)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
DECLARE v_card text;
BEGIN
 IF p_offer IS NULL OR p_want IS NULL OR p_offer_f IS NULL OR p_want_f IS NULL
 OR NOT(
 (cardinality(p_offer) BETWEEN 1 AND 5 AND cardinality(p_want)=0
   AND p_offer_f=0 AND p_want_f BETWEEN 1 AND 10000)
 OR (cardinality(p_want) BETWEEN 1 AND 5 AND cardinality(p_offer)=0
   AND p_want_f=0 AND p_offer_f BETWEEN 1 AND 10000))
 THEN RAISE EXCEPTION 'BAD_TRADE'; END IF;
 IF array_position(p_offer,NULL) IS NOT NULL OR array_position(p_want,NULL) IS NOT NULL
    OR (SELECT count(DISTINCT id) FROM unnest(p_offer) x(id))<>cardinality(p_offer)
    OR (SELECT count(DISTINCT id) FROM unnest(p_want) x(id))<>cardinality(p_want)
 THEN RAISE EXCEPTION 'BAD_TRADE'; END IF;
 FOREACH v_card IN ARRAY p_offer||p_want LOOP
   IF length(v_card)>160 OR v_card!~'^[a-zA-Z0-9-]+/[a-zA-Z0-9-]+/[a-zA-Z0-9-]+$'
   THEN RAISE EXCEPTION 'BAD_TRADE'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.flip_cards WHERE id=v_card AND active)
   THEN RAISE EXCEPTION 'CARD_NOT_FOUND'; END IF;
 END LOOP;
END; $fn$;

CREATE OR REPLACE FUNCTION public.flip_f_trade_create(
 p_actor_id bigint,p_recipient_id bigint,p_offer_cards text[],p_want_cards text[],
 p_offer_f integer,p_want_f integer,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_previous public.flip_f_trades%rowtype;v_id uuid;v_offer text[];v_want text[];
BEGIN
 IF p_actor_id IS NULL OR p_actor_id<=0 OR p_recipient_id IS NULL OR
 p_recipient_id<=0 OR p_actor_id=p_recipient_id OR p_request_id IS NULL
 THEN RAISE EXCEPTION 'BAD_TRADE'; END IF;
 PERFORM public.flip_f_trade_validate(p_offer_cards,p_want_cards,p_offer_f,p_want_f);
 v_offer:=ARRAY(SELECT unnest(p_offer_cards) ORDER BY 1);
 v_want:=ARRAY(SELECT unnest(p_want_cards) ORDER BY 1);
 SELECT * INTO v_previous FROM public.flip_f_trades WHERE request_id=p_request_id;
 IF FOUND THEN
   IF v_previous.sender_id<>p_actor_id OR v_previous.recipient_id<>p_recipient_id
     OR v_previous.offer_cards<>v_offer OR v_previous.want_cards<>v_want
     OR v_previous.offer_f<>p_offer_f OR v_previous.want_f<>p_want_f
   THEN RAISE EXCEPTION 'DUPLICATE_TRADE_REQUEST'; END IF;
   RETURN jsonb_build_object('ok',true,'id',v_previous.id::text,'replayed',true);
 END IF;
 PERFORM 1 FROM public.flip_players
 WHERE telegram_id IN(p_actor_id,p_recipient_id) ORDER BY telegram_id FOR UPDATE;
 SELECT * INTO v_previous FROM public.flip_f_trades WHERE request_id=p_request_id;
 IF FOUND THEN
   IF v_previous.sender_id<>p_actor_id OR v_previous.recipient_id<>p_recipient_id
     OR v_previous.offer_cards<>v_offer OR v_previous.want_cards<>v_want
     OR v_previous.offer_f<>p_offer_f OR v_previous.want_f<>p_want_f
   THEN RAISE EXCEPTION 'DUPLICATE_TRADE_REQUEST'; END IF;
   RETURN jsonb_build_object('ok',true,'id',v_previous.id::text,'replayed',true);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.flip_players WHERE telegram_id=p_actor_id)
 THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.flip_players WHERE telegram_id=p_recipient_id)
 THEN RAISE EXCEPTION 'PLAYER_NOT_FOUND'; END IF;
 IF (SELECT count(*) FROM public.flip_trades WHERE sender_id=p_actor_id
     AND status='pending' AND expires_at>now())+
    (SELECT count(*) FROM public.flip_f_trades WHERE sender_id=p_actor_id
     AND status='pending' AND expires_at>now())>=20
 THEN RAISE EXCEPTION 'TRADE_PENDING_LIMIT'; END IF;
 IF (SELECT balance FROM public.flip_players WHERE telegram_id=p_actor_id)<p_offer_f
    OR (SELECT balance FROM public.flip_players WHERE telegram_id=p_recipient_id)<p_want_f
 THEN RAISE EXCEPTION 'INSUFFICIENT_FUNDS'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(v_offer) x(id)
       WHERE public.flip_transferable_ranked(p_actor_id,x.id)<1)
   OR EXISTS(SELECT 1 FROM unnest(v_want) x(id)
       WHERE public.flip_transferable_ranked(p_recipient_id,x.id)<1)
 THEN RAISE EXCEPTION 'TRADE_CARD_UNAVAILABLE'; END IF;
 INSERT INTO public.flip_f_trades
 (request_id,sender_id,recipient_id,offer_cards,want_cards,offer_f,want_f)
 VALUES(p_request_id,p_actor_id,p_recipient_id,v_offer,v_want,p_offer_f,p_want_f)
 RETURNING id INTO v_id;
 RETURN jsonb_build_object('ok',true,'id',v_id::text,'replayed',false);
END; $fn$;

CREATE OR REPLACE FUNCTION public.flip_f_trade_list(p_actor_id bigint,p_limit integer DEFAULT 40)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]'::jsonb)
FROM (SELECT t.id::text,t.sender_id::text,t.recipient_id::text,
 sender.username AS sender_username,sender.first_name AS sender_name,
 recipient.username AS recipient_username,recipient.first_name AS recipient_name,
 t.offer_cards,t.want_cards,t.offer_f,t.want_f,
 CASE WHEN t.status='pending' AND t.expires_at<=now() THEN 'expired'
 ELSE t.status END status,t.created_at,t.expires_at,t.completed_at
 FROM public.flip_f_trades t
 JOIN public.flip_players sender ON sender.telegram_id=t.sender_id
 JOIN public.flip_players recipient ON recipient.telegram_id=t.recipient_id
 WHERE t.sender_id=p_actor_id OR t.recipient_id=p_actor_id
 ORDER BY t.created_at DESC LIMIT LEAST(GREATEST(COALESCE(p_limit,40),1),60)) x;
$fn$;

CREATE OR REPLACE FUNCTION public.flip_f_trade_preview(p_actor_id bigint,p_trade_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v public.flip_f_trades%rowtype;v_available boolean;
BEGIN
 SELECT * INTO v FROM public.flip_f_trades
 WHERE id=p_trade_id AND p_actor_id IN(sender_id,recipient_id);
 IF NOT FOUND THEN RAISE EXCEPTION 'TRADE_NOT_FOUND'; END IF;
 SELECT (s.balance>=v.offer_f AND r.balance>=v.want_f) INTO v_available
 FROM public.flip_players s JOIN public.flip_players r ON r.telegram_id=v.recipient_id
 WHERE s.telegram_id=v.sender_id;
 v_available:=COALESCE(v_available,false)
 AND NOT EXISTS(SELECT 1 FROM unnest(v.offer_cards) x(id)
   WHERE public.flip_transferable_ranked(v.sender_id,x.id)<1)
 AND NOT EXISTS(SELECT 1 FROM unnest(v.want_cards) x(id)
   WHERE public.flip_transferable_ranked(v.recipient_id,x.id)<1);
 RETURN jsonb_build_object(
  'id',v.id::text,'status',CASE WHEN v.status='pending' AND v.expires_at<=now()
    THEN 'expired' ELSE v.status END,
  'available',v_available AND v.status='pending' AND v.expires_at>now(),
  'sender_delta',public.flip_trade_bundle_delta(v.sender_id,v.offer_cards,v.want_cards),
  'recipient_delta',public.flip_trade_bundle_delta(v.recipient_id,v.want_cards,v.offer_cards),
  'sender_f_delta',v.want_f-v.offer_f,'recipient_f_delta',v.offer_f-v.want_f);
END; $fn$;

CREATE OR REPLACE FUNCTION public.flip_f_trade_reply(
 p_actor_id bigint,p_trade_id uuid,p_verb text,p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v public.flip_f_trades%rowtype;v_previous public.flip_f_trade_replies%rowtype;
 v_card text;v_before_a numeric;v_before_b numeric;v_result jsonb;
BEGIN
 IF p_actor_id IS NULL OR p_actor_id<=0 OR p_trade_id IS NULL OR p_request_id IS NULL
 OR p_verb NOT IN('accept','decline','cancel') THEN RAISE EXCEPTION 'BAD_TRADE'; END IF;
 SELECT * INTO v FROM public.flip_f_trades WHERE id=p_trade_id FOR UPDATE;
 IF NOT FOUND OR p_actor_id NOT IN(v.sender_id,v.recipient_id)
 THEN RAISE EXCEPTION 'TRADE_NOT_FOUND'; END IF;
 SELECT * INTO v_previous FROM public.flip_f_trade_replies WHERE request_id=p_request_id;
 IF FOUND THEN
   IF v_previous.trade_id<>p_trade_id OR v_previous.actor_id<>p_actor_id
   OR v_previous.verb<>p_verb THEN RAISE EXCEPTION 'DUPLICATE_TRADE_REQUEST'; END IF;
   RETURN v_previous.result;
 END IF;
 IF v.status<>'pending' THEN RAISE EXCEPTION 'TRADE_ALREADY_CLOSED'; END IF;
 IF v.expires_at<=now() THEN RAISE EXCEPTION 'TRADE_EXPIRED'; END IF;
 IF p_verb='cancel' AND p_actor_id<>v.sender_id THEN RAISE EXCEPTION 'TRADE_FORBIDDEN'; END IF;
 IF p_verb IN('accept','decline') AND p_actor_id<>v.recipient_id
 THEN RAISE EXCEPTION 'TRADE_FORBIDDEN'; END IF;
 IF p_verb='accept' THEN
   PERFORM 1 FROM public.flip_players
   WHERE telegram_id IN(v.sender_id,v.recipient_id) ORDER BY telegram_id FOR UPDATE;
   IF (SELECT balance FROM public.flip_players WHERE telegram_id=v.sender_id)<v.offer_f
     OR (SELECT balance FROM public.flip_players WHERE telegram_id=v.recipient_id)<v.want_f
   THEN RAISE EXCEPTION 'INSUFFICIENT_FUNDS'; END IF;
   IF EXISTS(SELECT 1 FROM unnest(v.offer_cards) x(id)
     WHERE public.flip_transferable_ranked(v.sender_id,x.id)<1)
    OR EXISTS(SELECT 1 FROM unnest(v.want_cards) x(id)
     WHERE public.flip_transferable_ranked(v.recipient_id,x.id)<1)
   THEN RAISE EXCEPTION 'TRADE_CARD_UNAVAILABLE'; END IF;
   v_before_a:=public.flip_cp_total(v.sender_id);
   v_before_b:=public.flip_cp_total(v.recipient_id);
   FOREACH v_card IN ARRAY v.offer_cards LOOP
     PERFORM public.flip_transfer_take(v.sender_id,v_card);
     PERFORM public.flip_transfer_grant(v.recipient_id,v_card);
   END LOOP;
   FOREACH v_card IN ARRAY v.want_cards LOOP
     PERFORM public.flip_transfer_take(v.recipient_id,v_card);
     PERFORM public.flip_transfer_grant(v.sender_id,v_card);
   END LOOP;
   UPDATE public.flip_players SET balance=balance-v.offer_f+v.want_f,updated_at=now()
     WHERE telegram_id=v.sender_id;
   UPDATE public.flip_players SET balance=balance+v.offer_f-v.want_f,updated_at=now()
     WHERE telegram_id=v.recipient_id;
   UPDATE public.flip_f_trades SET status='accepted',completed_at=now() WHERE id=v.id;
   v_result:=jsonb_build_object('ok',true,'status','accepted',
    'sender_cp_delta',public.flip_cp_total(v.sender_id)-v_before_a,
    'recipient_cp_delta',public.flip_cp_total(v.recipient_id)-v_before_b,
    'sender_f_delta',v.want_f-v.offer_f,'recipient_f_delta',v.offer_f-v.want_f,
    'sender_xp',0,'recipient_xp',0);
 ELSE
   UPDATE public.flip_f_trades SET status=CASE WHEN p_verb='cancel' THEN 'cancelled'
     ELSE 'declined' END,completed_at=now() WHERE id=v.id;
   v_result:=jsonb_build_object('ok',true,'status',
    CASE WHEN p_verb='cancel' THEN 'cancelled' ELSE 'declined' END);
 END IF;
 INSERT INTO public.flip_f_trade_replies(request_id,trade_id,actor_id,verb,result)
 VALUES(p_request_id,p_trade_id,p_actor_id,p_verb,v_result);
 RETURN v_result;
END; $fn$;

-- Activity and card animations are written from the same committed transaction.
CREATE OR REPLACE FUNCTION public.flip_f_trade_events()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $fn$
BEGIN
 IF tg_op='INSERT' THEN
   INSERT INTO public.flip_user_events
   (telegram_id,event_key,kind,actor_id,trade_id,is_notification,details)
   VALUES(new.recipient_id,'ftrade:'||new.id::text||':offer','currency_offer',
     new.sender_id,new.id,true,
     jsonb_build_object('offer_f',new.offer_f,'want_f',new.want_f))
   ON CONFLICT(event_key) DO NOTHING;
 ELSE
   IF new.status IS DISTINCT FROM old.status THEN
     UPDATE public.flip_user_events SET read_at=COALESCE(read_at,now())
       WHERE trade_id=new.id AND kind='currency_offer';
     IF new.status='accepted' THEN
       INSERT INTO public.flip_user_events
       (telegram_id,event_key,kind,actor_id,trade_id,is_notification,details)
       VALUES
        (new.sender_id,'ftrade:'||new.id::text||':accepted:sender','currency_accepted',
          new.recipient_id,new.id,true,jsonb_build_object('f_delta',new.want_f-new.offer_f)),
        (new.recipient_id,'ftrade:'||new.id::text||':accepted:recipient','currency_accepted',
          new.sender_id,new.id,true,jsonb_build_object('f_delta',new.offer_f-new.want_f))
       ON CONFLICT(event_key) DO NOTHING;
       IF cardinality(new.offer_cards)>0 THEN
         INSERT INTO public.flip_card_deliveries
         (telegram_id,source_kind,source_key,card_ids,actor_id)
         VALUES(new.recipient_id,'trade','ftrade:'||new.id::text||':recipient',
           new.offer_cards,new.sender_id) ON CONFLICT(source_key) DO NOTHING;
       ELSIF cardinality(new.want_cards)>0 THEN
         INSERT INTO public.flip_card_deliveries
         (telegram_id,source_kind,source_key,card_ids,actor_id)
         VALUES(new.sender_id,'trade','ftrade:'||new.id::text||':sender',
           new.want_cards,new.recipient_id) ON CONFLICT(source_key) DO NOTHING;
       END IF;
     ELSIF new.status='cancelled' OR new.status='declined' THEN
       INSERT INTO public.flip_user_events
       (telegram_id,event_key,kind,actor_id,trade_id,is_notification)
       VALUES(CASE WHEN new.status='cancelled' THEN new.recipient_id ELSE new.sender_id END,
         'ftrade:'||new.id::text||':'||new.status,
         CASE WHEN new.status='cancelled' THEN 'currency_cancelled' ELSE 'currency_declined' END,
         CASE WHEN new.status='cancelled' THEN new.sender_id ELSE new.recipient_id END,
         new.id,true) ON CONFLICT(event_key) DO NOTHING;
     END IF;
   END IF;
 END IF;
 RETURN new;
END; $fn$;
DROP TRIGGER IF EXISTS flip_f_trade_events_trigger ON public.flip_f_trades;
CREATE TRIGGER flip_f_trade_events_trigger
AFTER INSERT OR UPDATE OF status ON public.flip_f_trades
FOR EACH ROW EXECUTE FUNCTION public.flip_f_trade_events();

-- Include currency swaps in profile trade statistics, gifts as separate totals.
CREATE OR REPLACE FUNCTION public.flip_profile_stats(p_telegram_id bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $fn$
SELECT jsonb_build_object(
 'joined_at',p.created_at,'level',p.level,'cp',public.flip_cp_total(p.telegram_id),
 'drops',(SELECT count(*) FROM public.flip_actions a
   WHERE a.telegram_id=p.telegram_id AND a.action='drop'),
 'packs',(SELECT count(*) FROM public.flip_actions a
   WHERE a.telegram_id=p.telegram_id AND a.action IN('pack','theme_pack')),
 'trades',(SELECT count(*) FROM public.flip_trades t
   WHERE (t.sender_id=p.telegram_id OR t.recipient_id=p.telegram_id) AND t.status='accepted')
  +(SELECT count(*) FROM public.flip_f_trades f
   WHERE (f.sender_id=p.telegram_id OR f.recipient_id=p.telegram_id) AND f.status='accepted'),
 'gifts_sent',(SELECT count(*) FROM public.flip_gifts g WHERE g.sender_id=p.telegram_id),
 'gifts_received',(SELECT count(*) FROM public.flip_gifts g WHERE g.recipient_id=p.telegram_id),
 'unique_cards',(SELECT count(*) FROM public.flip_discoveries d WHERE d.telegram_id=p.telegram_id),
 'owned_cards',(SELECT coalesce(sum(i.quantity),0) FROM public.flip_inventory i
   WHERE i.telegram_id=p.telegram_id),
 'achievements',(SELECT count(DISTINCT c.achievement_code) FROM public.flip_achievement_claims c
   WHERE c.telegram_id=p.telegram_id),
 'streak_days',p.streak_days
) FROM public.flip_players p WHERE p.telegram_id=p_telegram_id;
$fn$;

-- Keep helper RPCs closed to public roles. Server validates Telegram initData
-- and supplies p_actor_id; database locks guarantee atomic settlement.
REVOKE ALL ON FUNCTION public.flip_transferable_ranked(bigint,text) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.flip_transfer_take(bigint,text) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.flip_transfer_grant(bigint,text) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.flip_gift_send(bigint,bigint,text,uuid) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.flip_gift_list(bigint,integer) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.flip_f_trade_validate(text[],text[],integer,integer) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.flip_f_trade_create(bigint,bigint,text[],text[],integer,integer,uuid) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.flip_f_trade_list(bigint,integer) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.flip_f_trade_preview(bigint,uuid) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.flip_f_trade_reply(bigint,uuid,text,uuid) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.flip_f_trade_events() FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.flip_profile_stats(bigint) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.flip_transferable_ranked(bigint,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.flip_transfer_take(bigint,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.flip_transfer_grant(bigint,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.flip_gift_send(bigint,bigint,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.flip_gift_list(bigint,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.flip_f_trade_validate(text[],text[],integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.flip_f_trade_create(bigint,bigint,text[],text[],integer,integer,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.flip_f_trade_list(bigint,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.flip_f_trade_preview(bigint,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.flip_f_trade_reply(bigint,uuid,text,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.flip_profile_stats(bigint) TO service_role;
