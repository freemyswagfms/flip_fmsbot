-- FLIP v0.9.6.4 — owner-only visual card search, atomic bulk grants,
-- and per-player test controls. Existing awards/economy/owner modes unchanged.
create table if not exists public.flip_admin_grant_batches(
 request_id uuid primary key,
 admin_id bigint not null references public.flip_players(telegram_id),
 recipient_id bigint not null references public.flip_players(telegram_id),
 mode text not null check(mode in ('test','ranked')),
 note text not null default '',
 cards jsonb not null,
 total integer not null check(total between 1 and 20),
 created_at timestamptz not null default now()
);
alter table public.flip_admin_grant_batches enable row level security;
revoke all on public.flip_admin_grant_batches from public,anon,authenticated;
grant select,insert on public.flip_admin_grant_batches to service_role;

create table if not exists public.flip_admin_player_mode_events(
 request_id uuid primary key,
 admin_id bigint not null references public.flip_players(telegram_id),
 target_id bigint not null references public.flip_players(telegram_id),
 kind text not null check(kind in ('drop','pack')),
 enabled boolean not null,
 created_at timestamptz not null default now()
);
create index if not exists flip_admin_player_mode_target_recent
 on public.flip_admin_player_mode_events(target_id,created_at desc);
alter table public.flip_admin_player_mode_events enable row level security;
revoke all on public.flip_admin_player_mode_events from public,anon,authenticated;
grant select,insert on public.flip_admin_player_mode_events to service_role;

-- Server search with count + stable pagination; no stale first-50-only list.
create or replace function public.flip_admin_card_browser(
 p_query text,p_rarity text,p_limit integer,p_offset integer
) returns jsonb language sql stable security invoker set search_path = '' as $browser$
with filtered as (
 select c.id,c.rarity,
  coalesce(a.name,'SECRET') artist,
  coalesce(r.title,'HIDDEN') release
 from public.flip_cards c
 left join public.flip_artists a on a.id=c.artist_id
 left join public.flip_releases r on r.id=c.release_id and r.artist_id=c.artist_id
 where c.active
   and (coalesce(p_rarity,'')='' or c.rarity=p_rarity)
   and (trim(coalesce(p_query,''))='' or
     c.id ilike '%'||left(trim(p_query),80)||'%' or
     coalesce(a.name,'') ilike '%'||left(trim(p_query),80)||'%' or
     coalesce(r.title,'') ilike '%'||left(trim(p_query),80)||'%' or
     c.rarity ilike '%'||left(trim(p_query),80)||'%')
), page as (
 select * from filtered
 order by artist,release,
   case rarity when 'common' then 1 when 'rare' then 2
   when 'epic' then 3 when 'legendary' then 4
   when 'mythic' then 5 else 6 end,id
 limit least(greatest(coalesce(p_limit,24),1),40)
 offset least(greatest(coalesce(p_offset,0),0),10000)
)
select jsonb_build_object(
 'total',(select count(*) from filtered),
 'cards',coalesce((select jsonb_agg(jsonb_build_object(
   'id',id,'rarity',rarity,'artist',artist,'release',release,
   'label',artist||' — '||release||' — '||upper(rarity))
   order by artist,release,id) from page),'[]'::jsonb),
 'offset',least(greatest(coalesce(p_offset,0),0),10000)
);
$browser$;

-- Up to 20 physical cards per atomic transaction. Original grant RPC remains
-- the only writer of inventory, discoveries and admin action receipts, so all
-- admin deliveries still use the v0.9.6.3 cinematic reveal queue.
create or replace function public.flip_admin_grant_batch(
 p_admin_id bigint,p_recipient_id bigint,p_cards jsonb,
 p_mode text,p_note text,p_request_id uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $batch$
declare
 p public.flip_players%rowtype;
 old public.flip_admin_grant_batches%rowtype;
 item jsonb;
 item_id text;
 quantity integer;
 v_total integer:=0;
 seen_ids text[]:='{}';
 n integer;
begin
 if p_admin_id is null or p_admin_id<=0 or p_recipient_id is null
   or p_recipient_id<=0 or p_request_id is null
   or p_mode is null or p_mode not in ('test','ranked')
   or p_note is null or length(p_note)>200
   or p_cards is null or jsonb_typeof(p_cards)<>'array'
   or jsonb_array_length(p_cards) not between 1 and 20
 then raise exception 'BAD_ADMIN_BATCH';end if;

 -- Serialize replays and grants for this player. The whole batch either
 -- commits or rolls back, including all audit and delivery rows.
 select * into p from public.flip_players
  where telegram_id=p_recipient_id for update;
 if not found then raise exception 'ACCOUNT_NOT_FOUND';end if;
 if not exists(select 1 from public.flip_players where telegram_id=p_admin_id)
 then raise exception 'ACCOUNT_NOT_FOUND';end if;
 select * into old from public.flip_admin_grant_batches
  where request_id=p_request_id;
 if found then
   if old.admin_id<>p_admin_id or old.recipient_id<>p_recipient_id or
      old.mode<>p_mode or old.note<>p_note or old.cards<>p_cards
   then raise exception 'DUPLICATE_ADMIN_REQUEST';end if;
   return jsonb_build_object('ok',true,'replayed',true,
      'recipient_id',p_recipient_id::text,'total',old.total,'mode',p_mode);
 end if;

 for item in select value from jsonb_array_elements(p_cards) loop
   if jsonb_typeof(item)<>'object' or
      (select count(*) from jsonb_object_keys(item))<>2 or
      not (item?'id' and item?'quantity') or
      jsonb_typeof(item->'id')<>'string' or
      jsonb_typeof(item->'quantity')<>'number' or
      (item->>'quantity') !~ '^[1-9][0-9]?$'
   then raise exception 'BAD_ADMIN_BATCH';end if;
   item_id:=item->>'id';
   quantity:=(item->>'quantity')::integer;
   if item_id !~ '^[a-z0-9-]+/[a-z0-9-]+/[a-z0-9-]+$'
      or length(item_id)>160 or quantity>20
      or item_id=any(seen_ids)
   then raise exception 'BAD_ADMIN_BATCH';end if;
   seen_ids:=array_append(seen_ids,item_id);
   v_total:=v_total+quantity;
   if v_total>20 then raise exception 'BAD_ADMIN_BATCH';end if;
   if not exists(select 1 from public.flip_cards where id=item_id and active)
     then raise exception 'CARD_NOT_FOUND';end if;
 end loop;

 insert into public.flip_admin_grant_batches(
   request_id,admin_id,recipient_id,mode,note,cards,total)
 values(p_request_id,p_admin_id,p_recipient_id,p_mode,p_note,p_cards,v_total);
 for item in select value from jsonb_array_elements(p_cards) loop
   item_id:=item->>'id';quantity:=(item->>'quantity')::integer;
   for n in 1..quantity loop
     perform public.flip_admin_grant_card(
       p_admin_id,p_recipient_id,item_id,p_mode,p_note,gen_random_uuid()
     );
   end loop;
 end loop;
 return jsonb_build_object('ok',true,'replayed',false,
   'recipient_id',p_recipient_id::text,'total',v_total,
   'unique',jsonb_array_length(p_cards),'mode',p_mode);
end; $batch$;

-- A read-only status view of a chosen test player's limits, including a log
-- of who changed them. The HTTP handler verifies the original creator ID.
create or replace function public.flip_admin_player_mode_status(
 p_admin_id bigint,p_target_id bigint
) returns jsonb language plpgsql stable security invoker set search_path = '' as $status$
declare
 modes jsonb;events jsonb;
 v_name text;
begin
 if p_admin_id is null or p_admin_id<=0 or
    p_target_id is null or p_target_id<=0 then
    raise exception 'BAD_ADMIN_MODE';end if;
 select coalesce(nullif(username,''),nullif(first_name,''),telegram_id::text)
  into v_name from public.flip_players where telegram_id=p_target_id;
 if v_name is null then raise exception 'ACCOUNT_NOT_FOUND';end if;
 modes:=public.flip_admin_cooldown_status(p_target_id);
 select coalesce(jsonb_agg(jsonb_build_object(
     'kind',h.kind,'enabled',h.enabled,'created_at',h.created_at,
     'admin_id',h.admin_id::text) order by h.created_at desc),'[]'::jsonb)
 into events from(
   select admin_id,kind,enabled,created_at
   from public.flip_admin_player_mode_events
   where target_id=p_target_id order by created_at desc limit 20
 ) h;
 return jsonb_build_object('target_id',p_target_id::text,
   'name',v_name,'cooldowns',modes,'history',events);
end; $status$;

-- Assign or revoke a player's drop/pack bypass; always log the real creator.
-- Player-row lock is shared with drop/pack writes and owner self-mode updates.
create or replace function public.flip_admin_set_player_mode(
 p_admin_id bigint,p_target_id bigint,p_kind text,
 p_enabled boolean,p_request_id uuid
) returns jsonb language plpgsql volatile security invoker set search_path = '' as $mode$
declare
 p public.flip_players%rowtype;
 prior public.flip_admin_player_mode_events%rowtype;
 was_enabled boolean:=false;
 latest_drop timestamptz;
 replay boolean:=false;
begin
 if p_admin_id is null or p_admin_id<=0 or p_target_id is null
    or p_target_id<=0 or p_kind not in ('drop','pack')
    or p_enabled is null or p_request_id is null
 then raise exception 'BAD_ADMIN_MODE';end if;
 if not exists(select 1 from public.flip_players where telegram_id=p_admin_id)
 then raise exception 'ACCOUNT_NOT_FOUND';end if;

 select * into p from public.flip_players
  where telegram_id=p_target_id for update;
 if not found then raise exception 'ACCOUNT_NOT_FOUND';end if;

 select * into prior from public.flip_admin_player_mode_events
   where request_id=p_request_id;
 if found then
   if prior.admin_id<>p_admin_id or prior.target_id<>p_target_id or
     prior.kind<>p_kind or prior.enabled is distinct from p_enabled
   then raise exception 'DUPLICATE_ADMIN_REQUEST';end if;
   replay:=true;
 else
   select case when p_kind='drop' then unlimited_drop else unlimited_packs end
     into was_enabled from public.flip_admin_play_modes where telegram_id=p_target_id;
   was_enabled:=coalesce(was_enabled,false);

   insert into public.flip_admin_play_modes
     (telegram_id,unlimited_drop,unlimited_packs)
   values(p_target_id,p_kind='drop' and p_enabled,p_kind='pack' and p_enabled)
   on conflict(telegram_id) do update set
     unlimited_drop=case when p_kind='drop' then p_enabled
       else public.flip_admin_play_modes.unlimited_drop end,
     unlimited_packs=case when p_kind='pack' then p_enabled
       else public.flip_admin_play_modes.unlimited_packs end,
     updated_at=now();

   if p_kind='drop' then
     if p_enabled then
       update public.flip_players set
         drop_ready_at=now()-interval '1 second',updated_at=now()
       where telegram_id=p_target_id;
     elsif was_enabled then
       select max(a.created_at) into latest_drop from public.flip_actions a
       where a.telegram_id=p_target_id and a.action='drop'
         and a.result->>'welcome'='false';
       update public.flip_players set
         drop_ready_at=greatest(now()-interval '1 second',
           coalesce(latest_drop+interval '4 hours',now()-interval '1 second')),
         updated_at=now()
       where telegram_id=p_target_id;
     end if;
   elsif p_kind='pack' and p_enabled then
     update public.flip_players set
       pack_day=(now() at time zone 'Europe/Moscow')::date,
       packs_today=0,updated_at=now() where telegram_id=p_target_id;
   end if;
   insert into public.flip_admin_player_mode_events(
     request_id,admin_id,target_id,kind,enabled)
   values(p_request_id,p_admin_id,p_target_id,p_kind,p_enabled);
 end if;
 return jsonb_build_object('ok',true,'already_applied',replay,
   'kind',p_kind,'enabled',p_enabled,'target_id',p_target_id::text,
   'status',public.flip_admin_player_mode_status(p_admin_id,p_target_id));
end; $mode$;

revoke all on function public.flip_admin_card_browser(text,text,integer,integer),
 public.flip_admin_grant_batch(bigint,bigint,jsonb,text,text,uuid),
 public.flip_admin_player_mode_status(bigint,bigint),
 public.flip_admin_set_player_mode(bigint,bigint,text,boolean,uuid)
 from public,anon,authenticated;
grant execute on function public.flip_admin_card_browser(text,text,integer,integer),
 public.flip_admin_grant_batch(bigint,bigint,jsonb,text,text,uuid),
 public.flip_admin_player_mode_status(bigint,bigint),
 public.flip_admin_set_player_mode(bigint,bigint,text,boolean,uuid)
 to service_role;

-- Live tester mode changes ride the existing 45-second private hub poll.
CREATE OR REPLACE FUNCTION public.flip_event_snapshot(p_telegram_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare v_notifications jsonb:='[]'::jsonb;
        v_activity jsonb:='[]'::jsonb;
        v_unread integer:=0;
        v_stats jsonb;
        v_ready integer:=0;
begin
 if not exists(select 1 from public.flip_players where telegram_id=p_telegram_id)
   then raise exception 'ACCOUNT_NOT_FOUND';end if;
 select public.flip_profile_stats(p_telegram_id) into v_stats;
 select coalesce((public.flip_achievement_snapshot(p_telegram_id)->>'claimable')::integer,0)
   into v_ready;
 -- Ignore offers that are no longer actionable, even if an expiry cron hasn't run.
 select count(*)::integer into v_unread
 from public.flip_user_events e
 left join public.flip_trades t on t.id=e.trade_id
 where e.telegram_id=p_telegram_id and e.is_notification and e.read_at is null
   and (e.kind not in ('trade_offer','trade_counteroffer')
        or (t.status='pending' and t.expires_at>now()));

 select coalesce(jsonb_agg(rowdata.data order by rowdata.created_at desc,rowdata.id desc),'[]'::jsonb)
 into v_notifications from (
   select e.id,e.created_at,jsonb_build_object(
     'id',e.id,'kind',e.kind,'created_at',e.created_at,
     'read',e.read_at is not null,'trade_id',e.trade_id,
     'details',e.details,
     'partner_public_id',actor.public_id,
     'partner_name',coalesce(nullif(actor.username,''),actor.first_name,'FLIP PLAYER')
   ) data
   from public.flip_user_events e
   left join public.flip_players actor on actor.telegram_id=e.actor_id
   left join public.flip_trades t on t.id=e.trade_id
   where e.telegram_id=p_telegram_id and e.is_notification
     and (e.kind not in ('trade_offer','trade_counteroffer')
        or (t.status='pending' and t.expires_at>now()))
   order by e.created_at desc,e.id desc limit 35
 ) rowdata;

 select coalesce(jsonb_agg(rowdata.data order by rowdata.created_at desc,rowdata.id desc),'[]'::jsonb)
 into v_activity from (
   select e.id,e.created_at,jsonb_build_object(
     'id',e.id,'kind',e.kind,'created_at',e.created_at,
     'read',e.read_at is not null,'trade_id',e.trade_id,
     'details',e.details,'partner_public_id',actor.public_id,
     'partner_name',coalesce(nullif(actor.username,''),actor.first_name,'FLIP PLAYER')
   ) data from public.flip_user_events e
   left join public.flip_players actor on actor.telegram_id=e.actor_id
   where e.telegram_id=p_telegram_id
   order by e.created_at desc,e.id desc limit 60
 ) rowdata;
 return jsonb_build_object('unread_count',v_unread,
    'notifications',v_notifications,'activity',v_activity,
    'stats',v_stats,'rewards_ready',v_ready,
    'card_deliveries',public.flip_delivery_pending(p_telegram_id),
    'play_modes',(select jsonb_build_object(
      'unlimited_drop',coalesce(m.unlimited_drop,false),
      'unlimited_packs',coalesce(m.unlimited_packs,false),
      'drop_ready_at',p.drop_ready_at,'packs_today',p.packs_today)
     from public.flip_players p
     left join public.flip_admin_play_modes m on m.telegram_id=p.telegram_id
     where p.telegram_id=p_telegram_id));
end; $function$

revoke all on function public.flip_event_snapshot(bigint) from public,anon,authenticated;
grant execute on function public.flip_event_snapshot(bigint) to service_role;
