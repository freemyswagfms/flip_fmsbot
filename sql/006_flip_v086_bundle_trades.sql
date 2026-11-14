-- FLIP v0.8.6 — up to 5 different ranked variants per side and counteroffers.
-- Backward compatible with v0.8.5 (single-card offers stored in offer_card_id/want_card_id).
-- Even a counteroffer must contain >=1 card on both sides: gifts are NOT supported.

ALTER TABLE public.flip_trades
  ADD COLUMN IF NOT EXISTS offer_cards text[],
  ADD COLUMN IF NOT EXISTS want_cards text[],
  ADD COLUMN IF NOT EXISTS parent_trade_id uuid REFERENCES public.flip_trades(id);
ALTER TABLE public.flip_trades DROP CONSTRAINT IF EXISTS flip_trades_status_check;
ALTER TABLE public.flip_trades ADD CONSTRAINT flip_trades_status_check
  CHECK(status IN ('pending','accepted','declined','cancelled','countered'));
CREATE INDEX IF NOT EXISTS flip_trades_parent_idx ON public.flip_trades(parent_trade_id);

CREATE TABLE IF NOT EXISTS public.flip_trade_bundle_xp_pairs(
  player_a bigint NOT NULL,
  player_b bigint NOT NULL,
  cards_signature text NOT NULL,
  first_trade uuid NOT NULL REFERENCES public.flip_trades(id),
  PRIMARY KEY(player_a,player_b,cards_signature)
);
ALTER TABLE public.flip_trade_bundle_xp_pairs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flip_trade_bundle_xp_pairs FROM public,anon,authenticated;
GRANT SELECT,INSERT ON public.flip_trade_bundle_xp_pairs TO service_role;

CREATE OR REPLACE FUNCTION public.flip_trade_bundle_validate(p_offer text[],p_want text[])
RETURNS void LANGUAGE plpgsql SET search_path TO ''
AS $fn$
DECLARE v_card text;
BEGIN
  IF p_offer IS NULL OR p_want IS NULL
    OR cardinality(p_offer) NOT BETWEEN 1 AND 5 OR cardinality(p_want) NOT BETWEEN 1 AND 5
  THEN RAISE EXCEPTION 'BAD_TRADE'; END IF;
  IF (SELECT COUNT(DISTINCT id) FROM unnest(p_offer) AS id)<>cardinality(p_offer)
    OR (SELECT COUNT(DISTINCT id) FROM unnest(p_want) AS id)<>cardinality(p_want)
    OR EXISTS(SELECT 1 FROM unnest(p_offer) AS a(id) JOIN unnest(p_want) AS b(id) USING(id))
  THEN RAISE EXCEPTION 'BAD_TRADE'; END IF;
  FOREACH v_card IN ARRAY(p_offer||p_want) LOOP
    IF v_card IS NULL OR length(v_card)>160
      OR v_card !~ '^[a-zA-Z0-9-]+/[a-zA-Z0-9-]+/[a-zA-Z0-9-]+$'
    THEN RAISE EXCEPTION 'BAD_TRADE'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.flip_cards WHERE id=v_card AND active)
    THEN RAISE EXCEPTION 'CARD_NOT_FOUND'; END IF;
  END LOOP;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.flip_trade_bundle_delta(p_player_id bigint,p_give text[],p_receive text[])
RETURNS numeric LANGUAGE sql STABLE SET search_path TO ''
AS $fn$
  WITH card_ids AS (SELECT DISTINCT unnest(COALESCE(p_give,'{}'::text[]) || COALESCE(p_receive,'{}'::text[])) AS id),
  owned AS (
    SELECT c.id,c.rarity,COALESCE(i.ranked_quantity,0) AS copies
    FROM card_ids b JOIN public.flip_cards c ON c.id=b.id
    LEFT JOIN public.flip_inventory i ON i.telegram_id=p_player_id AND i.card_id=c.id
  )
  SELECT COALESCE(SUM(
    public.flip_cp_card_value(rarity,copies-
      CASE WHEN id=ANY(COALESCE(p_give,'{}'::text[])) THEN 1 ELSE 0 END+
      CASE WHEN id=ANY(COALESCE(p_receive,'{}'::text[])) THEN 1 ELSE 0 END)
    -public.flip_cp_card_value(rarity,copies)
  ),0)::numeric(16,2) FROM owned;
$fn$;

CREATE OR REPLACE FUNCTION public.flip_trade_list(p_actor_id bigint,p_limit integer DEFAULT 40)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC),'[]'::jsonb)
  FROM (
    SELECT tr.id::text,tr.sender_id::text,tr.recipient_id::text,
      sender.username AS sender_username,sender.first_name AS sender_name,
      recipient.username AS recipient_username,recipient.first_name AS recipient_name,
      tr.offer_card_id,tr.want_card_id,
      COALESCE(tr.offer_cards,ARRAY[tr.offer_card_id]) AS offer_cards,
      COALESCE(tr.want_cards,ARRAY[tr.want_card_id]) AS want_cards,
      tr.parent_trade_id::text AS parent_trade_id,
      CASE WHEN tr.status='pending' AND now()>tr.expires_at THEN 'expired' ELSE tr.status END AS status,
      tr.created_at,tr.expires_at,tr.completed_at
    FROM public.flip_trades tr
    JOIN public.flip_players sender ON sender.telegram_id=tr.sender_id
    JOIN public.flip_players recipient ON recipient.telegram_id=tr.recipient_id
    WHERE tr.sender_id=p_actor_id OR tr.recipient_id=p_actor_id
    ORDER BY tr.created_at DESC LIMIT LEAST(GREATEST(COALESCE(p_limit,40),1),60)
  ) t;
$fn$;

CREATE OR REPLACE FUNCTION public.flip_trade_preview(p_actor_id bigint,p_trade_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v public.flip_trades%rowtype; v_offer text[];v_want text[];v_available boolean;
BEGIN
  SELECT * INTO v FROM public.flip_trades
    WHERE id=p_trade_id AND p_actor_id IN(sender_id,recipient_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'TRADE_NOT_FOUND'; END IF;
  v_offer:=COALESCE(v.offer_cards,ARRAY[v.offer_card_id]);
  v_want:=COALESCE(v.want_cards,ARRAY[v.want_card_id]);
  SELECT
    NOT EXISTS(SELECT 1 FROM unnest(v_offer) AS x(id)
      LEFT JOIN public.flip_inventory i ON i.telegram_id=v.sender_id AND i.card_id=x.id
      WHERE COALESCE(i.ranked_quantity,0)<1)
    AND NOT EXISTS(SELECT 1 FROM unnest(v_want) AS x(id)
      LEFT JOIN public.flip_inventory i ON i.telegram_id=v.recipient_id AND i.card_id=x.id
      WHERE COALESCE(i.ranked_quantity,0)<1)
  INTO v_available;
  RETURN jsonb_build_object('id',v.id::text,'status',
    CASE WHEN v.status='pending' AND now()>v.expires_at THEN 'expired' ELSE v.status END,
    'available',v.status='pending' AND now()<=v.expires_at AND v_available,
    'sender_delta',public.flip_trade_bundle_delta(v.sender_id,v_offer,v_want),
    'recipient_delta',public.flip_trade_bundle_delta(v.recipient_id,v_want,v_offer),
    'offer_cards',to_jsonb(v_offer),'want_cards',to_jsonb(v_want));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.flip_trade_bundle_create(
 p_actor_id bigint,p_recipient_id bigint,p_offer_cards text[],p_want_cards text[],
 p_request_id uuid,p_parent_trade_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_old public.flip_trades%rowtype;v_parent public.flip_trades%rowtype;
  v_offer text[];v_want text[];v_id uuid;
BEGIN
  IF p_actor_id IS NULL OR p_actor_id<=0 OR p_recipient_id IS NULL OR p_recipient_id<=0
    OR p_actor_id=p_recipient_id OR p_request_id IS NULL
  THEN RAISE EXCEPTION 'BAD_TRADE'; END IF;
  PERFORM public.flip_trade_bundle_validate(p_offer_cards,p_want_cards);
  v_offer:=ARRAY(SELECT unnest(p_offer_cards) ORDER BY 1);
  v_want:=ARRAY(SELECT unnest(p_want_cards) ORDER BY 1);
  SELECT * INTO v_old FROM public.flip_trades WHERE request_id=p_request_id;
  IF FOUND THEN
    IF v_old.sender_id<>p_actor_id OR v_old.recipient_id<>p_recipient_id
       OR COALESCE(v_old.offer_cards,ARRAY[v_old.offer_card_id])<>v_offer
       OR COALESCE(v_old.want_cards,ARRAY[v_old.want_card_id])<>v_want
       OR v_old.parent_trade_id IS DISTINCT FROM p_parent_trade_id
    THEN RAISE EXCEPTION 'DUPLICATE_TRADE_REQUEST'; END IF;
    RETURN jsonb_build_object('ok',true,'id',v_old.id::text,'replayed',true);
  END IF;
  IF p_parent_trade_id IS NOT NULL THEN
    SELECT * INTO v_parent FROM public.flip_trades WHERE id=p_parent_trade_id FOR UPDATE;
    IF NOT FOUND OR v_parent.recipient_id<>p_actor_id OR v_parent.sender_id<>p_recipient_id
    THEN RAISE EXCEPTION 'TRADE_FORBIDDEN'; END IF;
    IF v_parent.status<>'pending' THEN RAISE EXCEPTION 'TRADE_ALREADY_CLOSED'; END IF;
    IF now()>v_parent.expires_at THEN RAISE EXCEPTION 'TRADE_EXPIRED'; END IF;
  END IF;
  -- The same player locks are used by acceptance, so availability cannot race a settlement.
  PERFORM 1 FROM public.flip_players
    WHERE telegram_id IN(p_actor_id,p_recipient_id) ORDER BY telegram_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM public.flip_players WHERE telegram_id=p_actor_id)
  THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.flip_players WHERE telegram_id=p_recipient_id)
  THEN RAISE EXCEPTION 'PLAYER_NOT_FOUND'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(v_offer) AS x(id)
      LEFT JOIN public.flip_inventory i ON i.telegram_id=p_actor_id AND i.card_id=x.id
      WHERE COALESCE(i.ranked_quantity,0)<1)
    OR EXISTS(SELECT 1 FROM unnest(v_want) AS x(id)
      LEFT JOIN public.flip_inventory i ON i.telegram_id=p_recipient_id AND i.card_id=x.id
      WHERE COALESCE(i.ranked_quantity,0)<1)
  THEN RAISE EXCEPTION 'TRADE_CARD_UNAVAILABLE'; END IF;
  IF (SELECT COUNT(*) FROM public.flip_trades
       WHERE sender_id=p_actor_id AND status='pending' AND expires_at>now())>=20
  THEN RAISE EXCEPTION 'TRADE_PENDING_LIMIT'; END IF;
  INSERT INTO public.flip_trades(request_id,sender_id,recipient_id,offer_card_id,want_card_id,
    offer_cards,want_cards,parent_trade_id)
  VALUES(p_request_id,p_actor_id,p_recipient_id,v_offer[1],v_want[1],
    v_offer,v_want,p_parent_trade_id) RETURNING id INTO v_id;
  IF p_parent_trade_id IS NOT NULL THEN
    UPDATE public.flip_trades SET status='countered',completed_at=now()
     WHERE id=p_parent_trade_id;
  END IF;
  RETURN jsonb_build_object('ok',true,'id',v_id::text,'replayed',false,
    'counter',p_parent_trade_id IS NOT NULL);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.flip_trade_bundle_reply(
 p_actor_id bigint,p_trade_id uuid,p_verb text,p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v public.flip_trades%rowtype;v_previous public.flip_trade_replies%rowtype;v_result jsonb;
  v_offer text[];v_want text[];v_card text;
  v_cp_a_before numeric;v_cp_b_before numeric;v_cp_a_after numeric;v_cp_b_after numeric;
  v_new_a integer:=0;v_new_b integer:=0;v_xp_a integer:=0;v_xp_b integer:=0;
  v_reward_date date:=(now() AT TIME ZONE 'Europe/Moscow')::date;
  v_eligible integer:=0;v_signature text;
  v_player public.flip_players%rowtype;v_extra integer;v_xp integer;v_level integer;
  v_balance integer;v_bonus integer;
BEGIN
  IF p_actor_id IS NULL OR p_actor_id<=0 OR p_trade_id IS NULL OR p_request_id IS NULL
     OR p_verb IS NULL OR p_verb NOT IN ('accept','decline','cancel')
  THEN RAISE EXCEPTION 'BAD_TRADE'; END IF;
  SELECT * INTO v FROM public.flip_trades WHERE id=p_trade_id FOR UPDATE;
  IF NOT FOUND OR p_actor_id NOT IN (v.sender_id,v.recipient_id)
  THEN RAISE EXCEPTION 'TRADE_NOT_FOUND'; END IF;
  SELECT * INTO v_previous FROM public.flip_trade_replies WHERE request_id=p_request_id;
  IF FOUND THEN
    IF v_previous.trade_id<>p_trade_id OR v_previous.actor_id<>p_actor_id
      OR v_previous.verb<>p_verb THEN RAISE EXCEPTION 'DUPLICATE_TRADE_REQUEST'; END IF;
    RETURN v_previous.result;
  END IF;
  IF v.status<>'pending' THEN RAISE EXCEPTION 'TRADE_ALREADY_CLOSED'; END IF;
  IF now()>v.expires_at THEN RAISE EXCEPTION 'TRADE_EXPIRED'; END IF;
  IF p_verb='cancel' AND p_actor_id<>v.sender_id THEN RAISE EXCEPTION 'TRADE_FORBIDDEN'; END IF;
  IF p_verb IN ('accept','decline') AND p_actor_id<>v.recipient_id
  THEN RAISE EXCEPTION 'TRADE_FORBIDDEN'; END IF;

  IF p_verb='accept' THEN
    v_offer:=COALESCE(v.offer_cards,ARRAY[v.offer_card_id]);
    v_want:=COALESCE(v.want_cards,ARRAY[v.want_card_id]);
    PERFORM public.flip_trade_bundle_validate(v_offer,v_want);
    PERFORM 1 FROM public.flip_players
      WHERE telegram_id IN(v.sender_id,v.recipient_id) ORDER BY telegram_id FOR UPDATE;
    IF EXISTS(SELECT 1 FROM unnest(v_offer) AS x(id)
        LEFT JOIN public.flip_inventory i ON i.telegram_id=v.sender_id AND i.card_id=x.id
        WHERE COALESCE(i.ranked_quantity,0)<1)
      OR EXISTS(SELECT 1 FROM unnest(v_want) AS x(id)
        LEFT JOIN public.flip_inventory i ON i.telegram_id=v.recipient_id AND i.card_id=x.id
        WHERE COALESCE(i.ranked_quantity,0)<1)
    THEN RAISE EXCEPTION 'TRADE_CARD_UNAVAILABLE'; END IF;
    v_cp_a_before:=public.flip_cp_total(v.sender_id);
    v_cp_b_before:=public.flip_cp_total(v.recipient_id);
    -- Remove only ranked copies, never test copies; leave a positive quantity or delete row.
    FOREACH v_card IN ARRAY(v_offer) LOOP
      DELETE FROM public.flip_inventory
        WHERE telegram_id=v.sender_id AND card_id=v_card AND quantity=1 AND ranked_quantity=1;
      IF NOT FOUND THEN
        UPDATE public.flip_inventory SET quantity=quantity-1,ranked_quantity=ranked_quantity-1
          WHERE telegram_id=v.sender_id AND card_id=v_card AND quantity>1 AND ranked_quantity>0;
        IF NOT FOUND THEN RAISE EXCEPTION 'TRADE_CARD_UNAVAILABLE'; END IF;
      END IF;
    END LOOP;
    FOREACH v_card IN ARRAY(v_want) LOOP
      DELETE FROM public.flip_inventory
        WHERE telegram_id=v.recipient_id AND card_id=v_card AND quantity=1 AND ranked_quantity=1;
      IF NOT FOUND THEN
        UPDATE public.flip_inventory SET quantity=quantity-1,ranked_quantity=ranked_quantity-1
          WHERE telegram_id=v.recipient_id AND card_id=v_card AND quantity>1 AND ranked_quantity>0;
        IF NOT FOUND THEN RAISE EXCEPTION 'TRADE_CARD_UNAVAILABLE'; END IF;
      END IF;
    END LOOP;
    INSERT INTO public.flip_inventory(telegram_id,card_id,quantity,ranked_quantity,test_quantity)
      SELECT v.sender_id,id,1,1,0 FROM unnest(v_want) AS x(id)
      ON CONFLICT(telegram_id,card_id) DO UPDATE SET
        quantity=public.flip_inventory.quantity+1,
        ranked_quantity=public.flip_inventory.ranked_quantity+1;
    INSERT INTO public.flip_inventory(telegram_id,card_id,quantity,ranked_quantity,test_quantity)
      SELECT v.recipient_id,id,1,1,0 FROM unnest(v_offer) AS x(id)
      ON CONFLICT(telegram_id,card_id) DO UPDATE SET
        quantity=public.flip_inventory.quantity+1,
        ranked_quantity=public.flip_inventory.ranked_quantity+1;
    INSERT INTO public.flip_discoveries(telegram_id,card_id)
      SELECT v.sender_id,id FROM unnest(v_want) AS x(id) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_new_a=ROW_COUNT;
    INSERT INTO public.flip_discoveries(telegram_id,card_id)
      SELECT v.recipient_id,id FROM unnest(v_offer) AS x(id) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_new_b=ROW_COUNT;

    IF cardinality(v_offer)=1 AND cardinality(v_want)=1 THEN
      -- Preserve the exact XP anti-farm history from v0.8.5.
      INSERT INTO public.flip_trade_xp_pairs(first_player,second_player,first_card,second_card,first_trade)
        VALUES(LEAST(v.sender_id,v.recipient_id),GREATEST(v.sender_id,v.recipient_id),
          LEAST(v_offer[1],v_want[1]),GREATEST(v_offer[1],v_want[1]),v.id)
        ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS v_eligible=ROW_COUNT;
    ELSE
      v_signature:=CASE WHEN array_to_string(v_offer,',')<=array_to_string(v_want,',') THEN
        array_to_string(v_offer,',')||'::'||array_to_string(v_want,',')
      ELSE array_to_string(v_want,',')||'::'||array_to_string(v_offer,',') END;
      INSERT INTO public.flip_trade_bundle_xp_pairs(player_a,player_b,cards_signature,first_trade)
      VALUES(LEAST(v.sender_id,v.recipient_id),GREATEST(v.sender_id,v.recipient_id),v_signature,v.id)
      ON CONFLICT DO NOTHING;
      GET DIAGNOSTICS v_eligible=ROW_COUNT;
    END IF;
    IF v_eligible>0 THEN
      IF (SELECT COUNT(*) FROM public.flip_trade_xp_awards
          WHERE telegram_id=v.sender_id AND reward_day=v_reward_date)<5 THEN
        v_xp_a:=15;
        INSERT INTO public.flip_trade_xp_awards(trade_id,telegram_id,reward_day)
          VALUES(v.id,v.sender_id,v_reward_date);
      END IF;
      IF (SELECT COUNT(*) FROM public.flip_trade_xp_awards
          WHERE telegram_id=v.recipient_id AND reward_day=v_reward_date)<5 THEN
        v_xp_b:=15;
        INSERT INTO public.flip_trade_xp_awards(trade_id,telegram_id,reward_day)
          VALUES(v.id,v.recipient_id,v_reward_date);
      END IF;
    END IF;

    FOR v_player IN SELECT * FROM public.flip_players
      WHERE telegram_id IN(v.sender_id,v.recipient_id) ORDER BY telegram_id LOOP
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
    v_cp_a_after:=public.flip_cp_total(v.sender_id);
    v_cp_b_after:=public.flip_cp_total(v.recipient_id);
    UPDATE public.flip_trades SET status='accepted',completed_at=now() WHERE id=v.id;
    v_result:=jsonb_build_object('ok',true,'status','accepted',
      'sender_cp_delta',v_cp_a_after-v_cp_a_before,
      'recipient_cp_delta',v_cp_b_after-v_cp_b_before,
      'sender_xp',v_xp_a+v_new_a*10,
      'recipient_xp',v_xp_b+v_new_b*10);
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
$fn$;

-- Older v0.8.5 clients use flip_trade_reply. Route them through the safe bundle-aware logic.
CREATE OR REPLACE FUNCTION public.flip_trade_reply(
 p_actor_id bigint,p_trade_id uuid,p_verb text,p_request_id uuid
)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $fn$
  SELECT public.flip_trade_bundle_reply(p_actor_id,p_trade_id,p_verb,p_request_id);
$fn$;

REVOKE ALL ON FUNCTION public.flip_trade_bundle_validate(text[],text[]) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.flip_trade_bundle_delta(bigint,text[],text[]) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.flip_trade_bundle_create(bigint,bigint,text[],text[],uuid,uuid) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.flip_trade_bundle_reply(bigint,uuid,text,uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.flip_trade_bundle_validate(text[],text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.flip_trade_bundle_delta(bigint,text[],text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.flip_trade_bundle_create(bigint,bigint,text[],text[],uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.flip_trade_bundle_reply(bigint,uuid,text,uuid) TO service_role;
