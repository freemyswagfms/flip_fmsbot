-- FLIP v0.9.6 — private activity ledger, notifications and player statistics.
-- Events are emitted by real database writes, never from untrusted browser state.
create table if not exists public.flip_user_events (
  id bigint generated always as identity primary key,
  telegram_id bigint not null references public.flip_players(telegram_id) on delete cascade,
  event_key text not null unique,
  kind text not null check (kind in (
    'trade_offer','trade_counteroffer','trade_accepted','trade_declined',
    'trade_cancelled','trade_countered','drop','pack','achievement_claim')),
  actor_id bigint,
  trade_id uuid,
  details jsonb not null default '{}'::jsonb,
  is_notification boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists flip_user_events_user_recent
  on public.flip_user_events (telegram_id,created_at desc,id desc);
create index if not exists flip_user_events_unread
  on public.flip_user_events (telegram_id,created_at desc)
  where is_notification and read_at is null;
alter table public.flip_user_events enable row level security;
revoke all on public.flip_user_events from public,anon,authenticated;
grant select,insert,update on public.flip_user_events to service_role;

create or replace function public.flip_event_on_trade()
returns trigger language plpgsql security invoker set search_path = '' as $trade$
declare v_kind text;
begin
  if tg_op='INSERT' then
    if new.status='pending' then
      v_kind:=case when new.parent_trade_id is null
        then 'trade_offer' else 'trade_counteroffer' end;
      insert into public.flip_user_events
        (telegram_id,event_key,kind,actor_id,trade_id,is_notification,created_at)
      values(new.recipient_id,'trade:'||new.id::text||':'||v_kind||':'||
        new.recipient_id::text,v_kind,new.sender_id,new.id,true,new.created_at)
      on conflict(event_key) do nothing;
    end if;
  else
    if new.status is distinct from old.status then
      -- An old pending offer is no longer actionable.
      update public.flip_user_events e set read_at=coalesce(e.read_at,now())
      where e.trade_id=new.id and e.kind in ('trade_offer','trade_counteroffer');

      if new.status='accepted' then
        insert into public.flip_user_events
          (telegram_id,event_key,kind,actor_id,trade_id,is_notification,created_at)
        values
         (new.sender_id,'trade:'||new.id::text||':accepted:'||new.sender_id::text,
          'trade_accepted',new.recipient_id,new.id,true,coalesce(new.completed_at,now())),
         (new.recipient_id,'trade:'||new.id::text||':accepted:'||new.recipient_id::text,
          'trade_accepted',new.sender_id,new.id,true,coalesce(new.completed_at,now()))
        on conflict(event_key) do nothing;
      elsif new.status='declined' then
        insert into public.flip_user_events
          (telegram_id,event_key,kind,actor_id,trade_id,is_notification)
        values(new.sender_id,'trade:'||new.id::text||':declined:'||new.sender_id::text,
          'trade_declined',new.recipient_id,new.id,true)
        on conflict(event_key) do nothing;
      elsif new.status='cancelled' then
        insert into public.flip_user_events
          (telegram_id,event_key,kind,actor_id,trade_id,is_notification)
        values(new.recipient_id,'trade:'||new.id::text||':cancelled:'||new.recipient_id::text,
          'trade_cancelled',new.sender_id,new.id,true)
        on conflict(event_key) do nothing;
      -- Counter-offer creates its own pending trade event for the original
      -- sender; do not notify them twice for one counteroffer.
      end if;
    end if;
  end if;
  return new;
end; $trade$;
drop trigger if exists flip_event_trade_trigger on public.flip_trades;
create trigger flip_event_trade_trigger
after insert or update of status on public.flip_trades
for each row execute function public.flip_event_on_trade();

create or replace function public.flip_event_on_action()
returns trigger language plpgsql security invoker set search_path = '' as $action$
begin
  if new.action in ('drop','pack','theme_pack') then
    insert into public.flip_user_events
      (telegram_id,event_key,kind,details,is_notification,created_at)
    values(new.telegram_id,'action:'||new.request_id::text,
      case when new.action='drop' then 'drop' else 'pack' end,
      case when new.action='drop'
        then jsonb_build_object('card_id',new.result->>'card_id')
        else jsonb_build_object(
          'pack_type',case when new.action='pack' then 'standard'
            else new.result->>'pack_type' end,
          'card_ids',coalesce(new.result->'card_ids','[]'::jsonb))
        end,
      false,new.created_at)
    on conflict(event_key) do nothing;
  end if;
  return new;
end; $action$;
drop trigger if exists flip_event_action_trigger on public.flip_actions;
create trigger flip_event_action_trigger after insert on public.flip_actions
for each row execute function public.flip_event_on_action();

create or replace function public.flip_event_on_achievement()
returns trigger language plpgsql security invoker set search_path = '' as $achievement$
begin
  insert into public.flip_user_events
    (telegram_id,event_key,kind,details,is_notification,created_at)
  values(new.telegram_id,
    'achievement:'||new.achievement_code||':'||new.stage::text||':'||new.telegram_id::text,
    'achievement_claim',
    jsonb_build_object('code',new.achievement_code,'stage',new.stage,
      'reward_f',new.rewarded_f),
    true,new.claimed_at)
  on conflict(event_key) do nothing;
  return new;
end; $achievement$;
drop trigger if exists flip_event_achievement_trigger on public.flip_achievement_claims;
create trigger flip_event_achievement_trigger
after insert on public.flip_achievement_claims
for each row execute function public.flip_event_on_achievement();

-- Preserve existing actions/achievements/trades in player history, without
-- pretending they happened now. Historical alerts start as read.
insert into public.flip_user_events
  (telegram_id,event_key,kind,details,is_notification,created_at,read_at)
select a.telegram_id,'action:'||a.request_id::text,
  case when a.action='drop' then 'drop' else 'pack' end,
  case when a.action='drop'
    then jsonb_build_object('card_id',a.result->>'card_id')
    else jsonb_build_object('pack_type',
      case when a.action='pack' then 'standard' else a.result->>'pack_type' end,
      'card_ids',coalesce(a.result->'card_ids','[]'::jsonb)) end,
  false,a.created_at,now()
from public.flip_actions a where a.action in('drop','pack','theme_pack')
on conflict(event_key) do nothing;

insert into public.flip_user_events
  (telegram_id,event_key,kind,actor_id,trade_id,is_notification,created_at,read_at)
select t.recipient_id,'trade:'||t.id::text||':'||
  (case when t.parent_trade_id is null then 'trade_offer' else 'trade_counteroffer' end)
  ||':'||t.recipient_id::text,
  case when t.parent_trade_id is null then 'trade_offer' else 'trade_counteroffer' end,
  t.sender_id,t.id,true,t.created_at,now()
from public.flip_trades t
on conflict(event_key) do nothing;

insert into public.flip_user_events
  (telegram_id,event_key,kind,actor_id,trade_id,is_notification,created_at,read_at)
select x.telegram_id,'trade:'||t.id::text||':accepted:'||x.telegram_id::text,
  'trade_accepted',x.actor_id,t.id,true,coalesce(t.completed_at,t.created_at),now()
from public.flip_trades t
cross join lateral (values (t.sender_id,t.recipient_id),
  (t.recipient_id,t.sender_id)) x(telegram_id,actor_id)
where t.status='accepted'
on conflict(event_key) do nothing;

insert into public.flip_user_events
  (telegram_id,event_key,kind,details,is_notification,created_at,read_at)
select c.telegram_id,
 'achievement:'||c.achievement_code||':'||c.stage::text||':'||c.telegram_id::text,
 'achievement_claim',jsonb_build_object('code',c.achievement_code,
   'stage',c.stage,'reward_f',c.rewarded_f),
 true,c.claimed_at,now()
from public.flip_achievement_claims c
on conflict(event_key) do nothing;

create or replace function public.flip_profile_stats(p_telegram_id bigint)
returns jsonb language sql stable security invoker set search_path = '' as $stats$
select jsonb_build_object(
 'joined_at',p.created_at,'level',p.level,'cp',public.flip_cp_total(p.telegram_id),
 'drops',(select count(*) from public.flip_actions a
    where a.telegram_id=p.telegram_id and a.action='drop'),
 'packs',(select count(*) from public.flip_actions a
    where a.telegram_id=p.telegram_id and a.action in ('pack','theme_pack')),
 'trades',(select count(*) from public.flip_trades t
    where (t.sender_id=p.telegram_id or t.recipient_id=p.telegram_id)
      and t.status='accepted'),
 'unique_cards',(select count(*) from public.flip_discoveries d
    where d.telegram_id=p.telegram_id),
 'owned_cards',(select coalesce(sum(i.quantity),0) from public.flip_inventory i
    where i.telegram_id=p.telegram_id),
 'achievements',(select count(distinct c.achievement_code)
    from public.flip_achievement_claims c where c.telegram_id=p.telegram_id),
 'streak_days',p.streak_days
) from public.flip_players p where p.telegram_id=p_telegram_id;
$stats$;

create or replace function public.flip_public_profile_stats(p_public_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $publicstats$
select public.flip_profile_stats(p.telegram_id)
from public.flip_players p where p.public_id=p_public_id;
$publicstats$;

create or replace function public.flip_event_snapshot(p_telegram_id bigint)
returns jsonb language plpgsql stable security invoker set search_path = '' as $snapshot$
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
    'stats',v_stats,'rewards_ready',v_ready);
end; $snapshot$;

create or replace function public.flip_event_mark_read(
 p_telegram_id bigint,p_event_id bigint default null)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $mark$
declare v_updated integer;
begin
 if not exists(select 1 from public.flip_players where telegram_id=p_telegram_id)
 then raise exception 'ACCOUNT_NOT_FOUND';end if;
 update public.flip_user_events
   set read_at=now()
   where telegram_id=p_telegram_id and is_notification and read_at is null
      and (p_event_id is null or id=p_event_id);
 get diagnostics v_updated=row_count;
 return jsonb_build_object('ok',true,'updated',v_updated,
   'unread_count',(select count(*) from public.flip_user_events e
     left join public.flip_trades t on t.id=e.trade_id
     where e.telegram_id=p_telegram_id and e.is_notification and e.read_at is null
       and (e.kind not in ('trade_offer','trade_counteroffer')
         or (t.status='pending' and t.expires_at>now()))));
end; $mark$;

revoke all on function public.flip_event_on_trade(),public.flip_event_on_action(),
 public.flip_event_on_achievement(),public.flip_profile_stats(bigint),
 public.flip_public_profile_stats(uuid),public.flip_event_snapshot(bigint),
 public.flip_event_mark_read(bigint,bigint) from public,anon,authenticated;
grant execute on function public.flip_event_on_trade(),public.flip_event_on_action(),
 public.flip_event_on_achievement(),public.flip_profile_stats(bigint),
 public.flip_public_profile_stats(uuid),public.flip_event_snapshot(bigint),
 public.flip_event_mark_read(bigint,bigint) to service_role;
