-- FLIP v0.9.6.3 — player-only unviewed card receipts (no retroactive popups).
-- Awards and exchanges remain unchanged: both triggers run inside the same
-- authoritative SQL transaction that grants/transfers inventory.
create table if not exists public.flip_card_deliveries (
  id bigint generated always as identity primary key,
  telegram_id bigint not null references public.flip_players(telegram_id) on delete cascade,
  source_kind text not null check (source_kind in ('admin','trade')),
  source_key text not null unique,
  card_ids text[] not null check(
    cardinality(card_ids) between 1 and 5 and array_position(card_ids,null) is null
  ),
  actor_id bigint,
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
create index if not exists flip_card_deliveries_pending
  on public.flip_card_deliveries(telegram_id,created_at,id)
  where seen_at is null;

alter table public.flip_card_deliveries enable row level security;
revoke all on public.flip_card_deliveries from public,anon,authenticated;
grant select,insert,update on public.flip_card_deliveries to service_role;
grant usage,select on sequence public.flip_card_deliveries_id_seq to service_role;

create or replace function public.flip_delivery_on_admin_grant()
returns trigger language plpgsql security invoker set search_path = '' as $grant$
begin
  insert into public.flip_card_deliveries(
    telegram_id,source_kind,source_key,card_ids,actor_id,created_at
  ) values(
    new.recipient_telegram_id,'admin','admin:'||new.request_id::text,
    array[new.card_id],new.admin_telegram_id,new.created_at
  ) on conflict(source_key) do nothing;
  return new;
end; $grant$;

drop trigger if exists flip_delivery_admin_grant on public.flip_admin_actions;
create trigger flip_delivery_admin_grant
after insert on public.flip_admin_actions
for each row execute function public.flip_delivery_on_admin_grant();

create or replace function public.flip_delivery_on_trade_accepted()
returns trigger language plpgsql security invoker set search_path = '' as $trade$
begin
  if new.status='accepted' and old.status is distinct from new.status then
    -- Sender receives the requested cards; recipient receives offered cards.
    insert into public.flip_card_deliveries(
      telegram_id,source_kind,source_key,card_ids,actor_id,created_at
    ) values(
      new.sender_id,'trade','trade:'||new.id::text||':'||new.sender_id::text,
      coalesce(new.want_cards,array[new.want_card_id]),
      new.recipient_id,coalesce(new.completed_at,now())
    ),(
      new.recipient_id,'trade','trade:'||new.id::text||':'||new.recipient_id::text,
      coalesce(new.offer_cards,array[new.offer_card_id]),
      new.sender_id,coalesce(new.completed_at,now())
    ) on conflict(source_key) do nothing;
  end if;
  return new;
end; $trade$;

drop trigger if exists flip_delivery_trade_accepted on public.flip_trades;
create trigger flip_delivery_trade_accepted
after update of status on public.flip_trades
for each row execute function public.flip_delivery_on_trade_accepted();

create or replace function public.flip_delivery_pending(p_telegram_id bigint)
returns jsonb
language sql stable security invoker set search_path = '' as $pending$
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',d.id,'source',d.source_kind,'card_ids',to_jsonb(d.card_ids),
   'created_at',d.created_at,
   'from',case when d.source_kind='admin' then 'FLIP TEAM'
     else coalesce(nullif(p.username,''),nullif(p.first_name,''),'FLIP PLAYER') end
 ) order by d.created_at,d.id),'[]'::jsonb)
 from (
   select id,source_kind,card_ids,actor_id,created_at
   from public.flip_card_deliveries
   where telegram_id=p_telegram_id and seen_at is null
   order by created_at,id
   limit 20
 ) d
 left join public.flip_players p on p.telegram_id=d.actor_id;
$pending$;

-- Explicit confirmation only after the recipient has viewed their card(s).
-- Replay is safe; foreign event IDs cannot be acknowledged.
create or replace function public.flip_delivery_ack(
 p_telegram_id bigint,p_delivery_ids bigint[]
) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $ack$
declare
 v_total integer;
 v_unique integer;
 v_owned integer;
 v_updated integer;
begin
 if p_telegram_id is null or p_telegram_id<=0 or p_delivery_ids is null
   or cardinality(p_delivery_ids) not between 1 and 20 then
   raise exception 'BAD_DELIVERY_REQUEST';
 end if;

 select count(*),count(distinct x.id) into v_total,v_unique
 from unnest(p_delivery_ids) x(id);
 if v_total<>v_unique or exists(select 1 from unnest(p_delivery_ids) x(id)
     where x.id is null or x.id<=0) then
   raise exception 'BAD_DELIVERY_REQUEST';
 end if;

 select count(*) into v_owned from public.flip_card_deliveries d
 where d.telegram_id=p_telegram_id and d.id=any(p_delivery_ids);
 if v_owned<>v_total then raise exception 'DELIVERY_NOT_FOUND';end if;

 update public.flip_card_deliveries
   set seen_at=now()
   where telegram_id=p_telegram_id and id=any(p_delivery_ids) and seen_at is null;
 get diagnostics v_updated=row_count;
 return jsonb_build_object('ok',true,'acknowledged',v_updated);
end; $ack$;

-- Keep the original 45-second in-app notification poll and include receipts:
-- no additional repeating network request is introduced.

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
    'card_deliveries',public.flip_delivery_pending(p_telegram_id));
end; $function$
;

revoke all on function public.flip_delivery_on_admin_grant(),
 public.flip_delivery_on_trade_accepted(),public.flip_delivery_pending(bigint),
 public.flip_delivery_ack(bigint,bigint[]),public.flip_event_snapshot(bigint)
 from public,anon,authenticated;

grant execute on function public.flip_delivery_on_admin_grant(),
 public.flip_delivery_on_trade_accepted(),public.flip_delivery_pending(bigint),
 public.flip_delivery_ack(bigint,bigint[]),public.flip_event_snapshot(bigint)
 to service_role;
