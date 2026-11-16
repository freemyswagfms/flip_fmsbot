-- FLIP v0.9.8.4 — Owner-only FLIP STUDIO player supervision.
-- Game accounts (Telegram IDs) are separate from Supabase Auth Studio members.
-- All sensitive RPCs are INVOKER-only and execute exclusively through a
-- signed STUDIO owner session and the server-side service role.

CREATE TABLE IF NOT EXISTS public.flip_player_moderation (
 telegram_id bigint PRIMARY KEY REFERENCES public.flip_players(telegram_id),
 banned boolean NOT NULL DEFAULT false,
 reason text NOT NULL DEFAULT '',
 updated_by uuid REFERENCES auth.users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT flip_player_moderation_reason CHECK(length(reason)<=300)
);
ALTER TABLE public.flip_player_moderation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flip_player_moderation FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.flip_player_moderation TO service_role;

CREATE TABLE IF NOT EXISTS public.flip_studio_player_actions(
 request_id uuid PRIMARY KEY,
 actor uuid NOT NULL REFERENCES auth.users(id),
 target_id bigint NOT NULL REFERENCES public.flip_players(telegram_id),
 action text NOT NULL CHECK(action IN ('ban','unban','remove_card')),
 card_id text,
 copy_kind text,
 quantity integer,
 reason text NOT NULL DEFAULT '',
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT flip_studio_player_actions_reason CHECK(length(reason)<=300)
);
CREATE INDEX IF NOT EXISTS flip_studio_player_actions_target_recent
 ON public.flip_studio_player_actions(target_id,created_at DESC);
ALTER TABLE public.flip_studio_player_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.flip_studio_player_actions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.flip_studio_player_actions TO service_role;

CREATE OR REPLACE FUNCTION public.flip_player_is_banned(p_telegram_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $f$
 SELECT COALESCE((SELECT banned FROM public.flip_player_moderation
 WHERE telegram_id=p_telegram_id),false);
$f$;

CREATE OR REPLACE FUNCTION public.flip_studio_player_search(
 p_query text DEFAULT '',p_limit int DEFAULT 25,p_offset int DEFAULT 0
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $f$
 WITH term AS (
 SELECT left(trim(both from regexp_replace(coalesce(p_query,''),'^@','','g')),80) q
 ), filtered AS (
 SELECT p.telegram_id,p.username,p.first_name,p.public_id,p.level,
 p.balance,p.xp,p.created_at,p.updated_at,
 COALESCE(m.banned,false) banned
 FROM public.flip_players p LEFT JOIN public.flip_player_moderation m
 ON m.telegram_id=p.telegram_id
 CROSS JOIN term t WHERE t.q='' OR p.telegram_id::text LIKE '%'||t.q||'%'
 OR p.public_id::text ILIKE '%'||t.q||'%'
 OR p.username ILIKE '%'||replace(replace(t.q,'%','\%'),'_','\_')||'%' ESCAPE '\'
 OR p.first_name ILIKE '%'||replace(replace(t.q,'%','\%'),'_','\_')||'%' ESCAPE '\'
 ), page AS (
 SELECT * FROM filtered ORDER BY created_at DESC,telegram_id DESC
 LIMIT LEAST(GREATEST(COALESCE(p_limit,25),1),50)
 OFFSET LEAST(GREATEST(COALESCE(p_offset,0),0),1000000)
 )
 SELECT jsonb_build_object(
 'total',(SELECT count(*) FROM filtered),
 'players',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'id',telegram_id::text,'username',username,'first_name',first_name,
   'public_id',public_id::text,'level',level,'balance',balance,'xp',xp,
   'created_at',created_at,'updated_at',updated_at,'banned',banned)
 ORDER BY created_at DESC,telegram_id DESC) FROM page),'[]'::jsonb),
 'offset',LEAST(GREATEST(COALESCE(p_offset,0),0),1000000));
$f$;

CREATE OR REPLACE FUNCTION public.flip_studio_player_detail(
 p_target_id bigint,p_limit int DEFAULT 50,p_offset int DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $f$
 DECLARE p public.flip_players%ROWTYPE;
 m public.flip_player_moderation%ROWTYPE;
 v_cards jsonb;v_total int;v_actions jsonb;
 BEGIN
 SELECT * INTO p FROM public.flip_players WHERE telegram_id=p_target_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'PLAYER_NOT_FOUND'; END IF;
 SELECT * INTO m FROM public.flip_player_moderation WHERE telegram_id=p_target_id;
 SELECT count(*) INTO v_total FROM public.flip_inventory WHERE telegram_id=p_target_id;
 SELECT COALESCE(jsonb_agg(rowdata ORDER BY rowdata->>'card_id'),'[]'::jsonb)
 INTO v_cards FROM(
 SELECT jsonb_build_object('card_id',i.card_id,
  'rarity',COALESCE(c.rarity,'unknown'),'quantity',i.quantity,
  'ranked_quantity',i.ranked_quantity,'test_quantity',i.test_quantity,
  'artist',COALESCE(a.name,c.artist_id,i.card_id),
  'title',COALESCE(r.title,c.release_id,i.card_id)) rowdata
 FROM public.flip_inventory i
 LEFT JOIN public.flip_cards c ON c.id=i.card_id
 LEFT JOIN public.flip_artists a ON a.id=c.artist_id
 LEFT JOIN public.flip_releases r ON r.id=c.release_id AND r.artist_id=c.artist_id
 WHERE i.telegram_id=p_target_id ORDER BY i.card_id
 LIMIT LEAST(GREATEST(COALESCE(p_limit,50),1),100)
 OFFSET LEAST(GREATEST(COALESCE(p_offset,0),0),1000000)
 ) t;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('action',x.action,
   'card_id',x.card_id,'copy_kind',x.copy_kind,'quantity',x.quantity,
   'reason',x.reason,'created_at',x.created_at) ORDER BY x.created_at DESC),'[]'::jsonb)
 INTO v_actions FROM (
  SELECT action,card_id,copy_kind,quantity,reason,created_at
  FROM public.flip_studio_player_actions WHERE target_id=p_target_id
  ORDER BY created_at DESC LIMIT 25
 ) x;
 RETURN jsonb_build_object(
  'player',jsonb_build_object('id',p.telegram_id::text,'username',p.username,
   'first_name',p.first_name,'public_id',p.public_id::text,
   'balance',p.balance,'xp',p.xp,'level',p.level,
   'cp',public.flip_cp_total(p.telegram_id),'created_at',p.created_at,
   'updated_at',p.updated_at,'banned',COALESCE(m.banned,false),
   'ban_reason',CASE WHEN COALESCE(m.banned,false) THEN m.reason ELSE '' END),
  'cards',v_cards,'cards_total',v_total,'card_offset',
  LEAST(GREATEST(COALESCE(p_offset,0),0),1000000),
  'actions',v_actions);
 END;
$f$;

CREATE OR REPLACE FUNCTION public.flip_studio_player_action(
 p_actor uuid,p_owner_telegram_id bigint,p_target_id bigint,
 p_action text,p_card_id text,p_kind text,p_quantity int,
 p_reason text,p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $f$
 DECLARE prior public.flip_studio_player_actions%ROWTYPE;
 inv public.flip_inventory%ROWTYPE;
 available int;new_qty int;v_result jsonb;reason text:=trim(COALESCE(p_reason,''));
 BEGIN
 IF p_actor IS NULL OR p_target_id IS NULL OR p_target_id<=0 OR
 p_owner_telegram_id IS NULL OR p_owner_telegram_id<=0 OR
 p_request_id IS NULL OR p_action NOT IN('ban','unban','remove_card')
 OR length(reason)>300 THEN RAISE EXCEPTION 'BAD_REQUEST'; END IF;
 -- Defense in depth: even an accidentally exposed Studio endpoint cannot
 -- use a valid editor/admin session to alter players.
 IF NOT EXISTS(SELECT 1 FROM public.flip_studio_members
  WHERE user_id=p_actor AND role='owner' AND active)
 THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF p_action='ban' AND (p_target_id=p_owner_telegram_id OR length(reason)<3)
 THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF p_action='remove_card' AND
 (p_card_id IS NULL OR length(p_card_id)>160 OR
  p_kind NOT IN('ranked','test') OR p_quantity IS NULL OR
  p_quantity<1 OR p_quantity>100 OR length(reason)<3)
 THEN RAISE EXCEPTION 'BAD_REQUEST'; END IF;
 -- Serializes simultaneous operations, inventory transfers and replay IDs.
 PERFORM 1 FROM public.flip_players WHERE telegram_id=p_target_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PLAYER_NOT_FOUND'; END IF;
 SELECT * INTO prior FROM public.flip_studio_player_actions
 WHERE request_id=p_request_id;
 IF FOUND THEN
  IF prior.actor<>p_actor OR prior.target_id<>p_target_id OR
    prior.action<>p_action OR
    prior.card_id IS DISTINCT FROM p_card_id OR
    prior.copy_kind IS DISTINCT FROM p_kind OR
    prior.quantity IS DISTINCT FROM p_quantity OR prior.reason<>reason
  THEN RAISE EXCEPTION 'DUPLICATE_REQUEST_ACTION'; END IF;
  RETURN prior.result;
 END IF;
 IF p_action IN('ban','unban') THEN
   INSERT INTO public.flip_player_moderation(telegram_id,banned,reason,updated_by)
   VALUES(p_target_id,p_action='ban',
     CASE WHEN p_action='ban' THEN reason ELSE '' END,p_actor)
   ON CONFLICT (telegram_id) DO UPDATE SET
      banned=EXCLUDED.banned,reason=EXCLUDED.reason,
      updated_by=EXCLUDED.updated_by,updated_at=now();
   IF p_action='ban' THEN
     UPDATE public.flip_trades SET status='cancelled',completed_at=now()
       WHERE status='pending' AND (sender_id=p_target_id OR recipient_id=p_target_id);
     UPDATE public.flip_f_trades SET status='cancelled',completed_at=now()
       WHERE status='pending' AND (sender_id=p_target_id OR recipient_id=p_target_id);
   END IF;
   v_result:=jsonb_build_object('ok',true,'status',
     CASE WHEN p_action='ban' THEN 'banned' ELSE 'active' END);
 ELSE
   SELECT * INTO inv FROM public.flip_inventory
    WHERE telegram_id=p_target_id AND card_id=p_card_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'CARD_NOT_OWNED'; END IF;
   available:=CASE WHEN p_kind='ranked' THEN inv.ranked_quantity ELSE inv.test_quantity END;
   IF available<p_quantity THEN RAISE EXCEPTION 'CARD_COUNT_CHANGED'; END IF;
   new_qty:=inv.quantity-p_quantity;
   IF new_qty=0 THEN
      DELETE FROM public.flip_inventory
        WHERE telegram_id=p_target_id AND card_id=p_card_id;
   ELSE
      UPDATE public.flip_inventory SET quantity=new_qty,
       ranked_quantity=inv.ranked_quantity-CASE WHEN p_kind='ranked' THEN p_quantity ELSE 0 END,
       test_quantity=inv.test_quantity-CASE WHEN p_kind='test' THEN p_quantity ELSE 0 END
       WHERE telegram_id=p_target_id AND card_id=p_card_id;
   END IF;
   -- Discoveries are permanent history and are intentionally not erased.
   v_result:=jsonb_build_object('ok',true,'card_id',p_card_id,'kind',p_kind,
      'removed',p_quantity,'remaining',new_qty);
 END IF;
 INSERT INTO public.flip_studio_player_actions
  (request_id,actor,target_id,action,card_id,copy_kind,quantity,reason,result)
 VALUES(p_request_id,p_actor,p_target_id,p_action,p_card_id,p_kind,p_quantity,reason,v_result);
 INSERT INTO public.flip_studio_audit(actor,action,entity,detail)
 VALUES(p_actor,'player_'||p_action,'player',jsonb_build_object(
   'target_id',p_target_id::text,'request_id',p_request_id,
   'card_id',p_card_id,'kind',p_kind,'quantity',p_quantity,'reason',reason));
 RETURN v_result;
 END;
$f$;

REVOKE ALL ON FUNCTION public.flip_player_is_banned(bigint) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.flip_studio_player_search(text,int,int) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.flip_studio_player_detail(bigint,int,int) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.flip_studio_player_action(uuid,bigint,bigint,text,text,text,int,text,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.flip_player_is_banned(bigint),
 public.flip_studio_player_search(text,int,int),
 public.flip_studio_player_detail(bigint,int,int),
 public.flip_studio_player_action(uuid,bigint,bigint,text,text,text,int,text,uuid)
 TO service_role;
