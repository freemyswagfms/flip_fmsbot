-- FLIP v0.9.0 — three fixed daily slots and three fixed weekly slots.
-- Every slot can be configured by Owner as a subscription challenge.
create table if not exists public.flip_task_slots (
 scope text not null check(scope in ('daily','weekly')),
 slot integer not null check(slot between 1 and 3),
 kind text not null default 'default' check(kind in ('default','subscription')),
 title text not null,
 description text not null default '',
 channel_url text,
 channel_id text,
 reward_f integer not null check(reward_f between 0 and 1000),
 reward_xp integer not null check(reward_xp between 0 and 300),
 ends_at timestamptz,
 version uuid not null default gen_random_uuid(),
 updated_at timestamptz not null default now(),
 primary key(scope,slot),
 constraint subscription_target check(kind='default' or (channel_url is not null and channel_id is not null))
);
create table if not exists public.flip_task_claims (
 telegram_id bigint not null references public.flip_players(telegram_id),
 scope text not null check(scope in ('daily','weekly')),
 slot integer not null check(slot between 1 and 3),
 period_start date not null,
 slot_version uuid not null,
 reward_f integer not null,
 reward_xp integer not null,
 claimed_at timestamptz not null default now(),
 primary key(telegram_id,scope,slot,period_start)
);
create table if not exists public.flip_task_weekly_bonuses (
 telegram_id bigint not null references public.flip_players(telegram_id),
 week_start date not null,
 created_at timestamptz not null default now(),
 primary key(telegram_id,week_start)
);
create index if not exists flip_task_claims_account_idx on public.flip_task_claims(telegram_id,scope,period_start);
insert into public.flip_task_slots(scope,slot,title,description,reward_f,reward_xp) values
 ('daily',1,'Открой бесплатный дроп','Обычный дроп, не приветственный',30,20),
 ('daily',2,'Получи новую карточку','Открой ранее неизвестную разновидность',30,20),
 ('daily',3,'Открой стандартный пак','Приобрети пак за F',30,20),
 ('weekly',1,'Открой 5 бесплатных дропов','Пять обычных дропов за неделю',100,60),
 ('weekly',2,'Собери 5 новых карточек','Пять новых разновидностей за неделю',100,60),
 ('weekly',3,'Открой 3 стандартных пака','Три пака за неделю',100,60)
on conflict(scope,slot) do nothing;
alter table public.flip_task_slots enable row level security;
alter table public.flip_task_claims enable row level security;
alter table public.flip_task_weekly_bonuses enable row level security;
revoke all on public.flip_task_slots,public.flip_task_claims,public.flip_task_weekly_bonuses from public,anon,authenticated;
grant all on public.flip_task_slots,public.flip_task_claims,public.flip_task_weekly_bonuses to service_role;
-- Preserve today's payouts for players who used the previous implicit-task system.
insert into public.flip_task_claims(telegram_id,scope,slot,period_start,slot_version,reward_f,reward_xp)
select p.telegram_id,'daily',legacy.slot,p.daily_day,t.version,30,20
from public.flip_players p cross join lateral unnest(p.claimed_tasks) as legacy(slot)
join public.flip_task_slots t on t.scope='daily' and t.slot=legacy.slot
where p.daily_day=(now() at time zone 'Europe/Moscow')::date and legacy.slot between 1 and 3
on conflict do nothing;

create or replace function public.flip_task_progress(p_telegram_id bigint,p_scope text,p_slot integer)
returns integer language plpgsql stable security invoker set search_path = '' as $$
declare period_date date := case when p_scope='daily' then (now() at time zone 'Europe/Moscow')::date
 else date_trunc('week',now() at time zone 'Europe/Moscow')::date end;
 period_from timestamptz := (period_date::timestamp at time zone 'Europe/Moscow');
 period_until timestamptz := ((period_date + case when p_scope='daily' then 1 else 7 end)::timestamp at time zone 'Europe/Moscow');
 n integer := 0;
begin
 if (p_scope='daily' and p_slot=1) or (p_scope='weekly' and p_slot=1) then
   select count(*)::int into n from public.flip_actions a where a.telegram_id=p_telegram_id
     and a.action='drop' and a.result->>'welcome'='false'
     and a.created_at>=period_from and a.created_at<period_until;
 elsif (p_scope='daily' and p_slot=2) or (p_scope='weekly' and p_slot=2) then
   select count(*)::int into n from public.flip_discoveries d where d.telegram_id=p_telegram_id
     and d.first_found_at>=period_from and d.first_found_at<period_until;
 elsif (p_scope='daily' and p_slot=3) or (p_scope='weekly' and p_slot=3) then
   select count(*)::int into n from public.flip_actions a where a.telegram_id=p_telegram_id
     and a.action='pack' and a.created_at>=period_from and a.created_at<period_until;
 end if;
 return coalesce(n,0);
end; $$;

create or replace function public.flip_task_snapshot(p_telegram_id bigint)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare t public.flip_task_slots%rowtype; d jsonb := '[]'::jsonb; w jsonb := '[]'::jsonb;
 period_date date; active_subscription boolean; claimed boolean; n integer; goal integer;
 task jsonb; default_title text; default_desc text; base_reward_f integer; base_reward_xp integer;
begin
 for t in select * from public.flip_task_slots order by scope,slot loop
   period_date := case when t.scope='daily' then (now() at time zone 'Europe/Moscow')::date
     else date_trunc('week',now() at time zone 'Europe/Moscow')::date end;
   active_subscription := t.kind='subscription' and (t.ends_at is null or t.ends_at>now());
   claimed := exists(select 1 from public.flip_task_claims c where c.telegram_id=p_telegram_id
     and c.scope=t.scope and c.slot=t.slot and c.period_start=period_date);
   goal := case when t.scope='daily' then 1 when t.slot=1 or t.slot=2 then 5 else 3 end;
   n := case when active_subscription then 0 else public.flip_task_progress(p_telegram_id,t.scope,t.slot) end;
   default_title := case when t.scope='daily' and t.slot=1 then 'Открой бесплатный дроп'
     when t.scope='daily' and t.slot=2 then 'Получи новую карточку'
     when t.scope='daily' then 'Открой стандартный пак'
     when t.slot=1 then 'Открой 5 бесплатных дропов'
     when t.slot=2 then 'Собери 5 новых карточек' else 'Открой 3 стандартных пака' end;
   default_desc := case when t.slot=1 then 'Открывай бесплатные дропы'
     when t.slot=2 then 'Собирай новые разновидности' else 'Открывай стандартные паки за F' end;
   base_reward_f := case when t.scope='daily' then 30 else 100 end;
   base_reward_xp := case when t.scope='daily' then 20 else 60 end;
   task := jsonb_build_object('scope',t.scope,'slot',t.slot,'version',t.version,
     'type',case when active_subscription then 'subscription' else 'default' end,
     'title',case when active_subscription then t.title else default_title end,
     'description',case when active_subscription then t.description else default_desc end,
     'url',case when active_subscription then t.channel_url else null end,
     'reward_f',case when active_subscription then t.reward_f else base_reward_f end,
     'reward_xp',case when active_subscription then t.reward_xp else base_reward_xp end,
     'progress',n,'target',case when active_subscription then 1 else goal end,
     'claimed',claimed,'ready',not claimed and not active_subscription and n>=goal);
   if t.scope='daily' then d:=d||jsonb_build_array(task); else w:=w||jsonb_build_array(task); end if;
 end loop;
 return jsonb_build_object('daily',d,'weekly',w,'weekly_bonus_claimed',exists(
    select 1 from public.flip_task_weekly_bonuses b where b.telegram_id=p_telegram_id
      and b.week_start=date_trunc('week',now() at time zone 'Europe/Moscow')::date));
end; $$;

create or replace function public.flip_claim_task(p_telegram_id bigint,p_scope text,p_slot integer,
 p_version uuid,p_verified boolean default false)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare player public.flip_players%rowtype; task public.flip_task_slots%rowtype;
 period_date date; n integer; goal integer; custom boolean; rewardf integer; rewardxp integer;
 new_balance integer; new_xp integer; new_level integer; new_packs integer;
 bonus_inserted integer := 0; claimed_count integer;
begin
 if p_scope not in ('daily','weekly') or p_slot not between 1 and 3 or p_version is null
   then raise exception 'BAD_TASK'; end if;
 select * into player from public.flip_players where telegram_id=p_telegram_id for update;
 if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;
 select * into task from public.flip_task_slots where scope=p_scope and slot=p_slot;
 if not found then raise exception 'BAD_TASK'; end if;
 if task.version<>p_version then raise exception 'TASK_CHANGED'; end if;
 period_date := case when p_scope='daily' then (now() at time zone 'Europe/Moscow')::date
   else date_trunc('week',now() at time zone 'Europe/Moscow')::date end;
 if exists(select 1 from public.flip_task_claims c where c.telegram_id=p_telegram_id
   and c.scope=p_scope and c.slot=p_slot and c.period_start=period_date) then
     raise exception 'TASK_ALREADY_CLAIMED'; end if;
 custom := task.kind='subscription' and (task.ends_at is null or task.ends_at>now());
 if custom then
   if not p_verified then raise exception 'TASK_NOT_VERIFIED'; end if;
   rewardf:=task.reward_f; rewardxp:=task.reward_xp;
 else
   goal := case when p_scope='daily' then 1 when p_slot in (1,2) then 5 else 3 end;
   n:=public.flip_task_progress(p_telegram_id,p_scope,p_slot);
   if n<goal then raise exception 'TASK_INCOMPLETE'; end if;
   rewardf:=case when p_scope='daily' then 30 else 100 end;
   rewardxp:=case when p_scope='daily' then 20 else 60 end;
 end if;
 insert into public.flip_task_claims(telegram_id,scope,slot,period_start,slot_version,reward_f,reward_xp)
   values(p_telegram_id,p_scope,p_slot,period_date,p_version,rewardf,rewardxp);
 new_balance:=player.balance+rewardf; new_xp:=player.xp+rewardxp;
 new_level:=player.level; new_packs:=player.bonus_packs;
 while new_xp>=100+50*(new_level-1) loop
   new_xp:=new_xp-(100+50*(new_level-1));new_level:=new_level+1;new_balance:=new_balance+30;
   if mod(new_level,10)=0 then new_packs:=new_packs+1;
   elsif mod(new_level,5)=0 then new_balance:=new_balance+50; end if;
 end loop;
 if p_scope='weekly' then
   select count(*) into claimed_count from public.flip_task_claims c
     where c.telegram_id=p_telegram_id and c.scope='weekly' and c.period_start=period_date;
   if claimed_count=3 then
     insert into public.flip_task_weekly_bonuses(telegram_id,week_start)
       values(p_telegram_id,period_date) on conflict do nothing;
     get diagnostics bonus_inserted = row_count;
     if bonus_inserted=1 then new_balance:=new_balance+50; end if;
   end if;
 end if;
 update public.flip_players set balance=new_balance,xp=new_xp,level=new_level,
   bonus_packs=new_packs,updated_at=now() where telegram_id=p_telegram_id;
 return jsonb_build_object('ok',true,'earned_f',rewardf+case when bonus_inserted=1 then 50 else 0 end,
   'earned_xp',rewardxp,'weekly_bonus',bonus_inserted=1,
   'state',public.flip_snapshot(p_telegram_id),'tasks',public.flip_task_snapshot(p_telegram_id));
end; $$;

revoke all on function public.flip_task_progress(bigint,text,integer),public.flip_task_snapshot(bigint),
  public.flip_claim_task(bigint,text,integer,uuid,boolean) from public,anon,authenticated;
grant execute on function public.flip_task_progress(bigint,text,integer),public.flip_task_snapshot(bigint),
  public.flip_claim_task(bigint,text,integer,uuid,boolean) to service_role;
-- Remove legacy implicit rewards without changing other mechanics.
do $patch$
declare fn text; original text; patched text;
begin
 foreach fn in array array['public.flip_open_drop(bigint,uuid)','public.flip_buy_pack(bigint,uuid)'] loop
   original:=pg_get_functiondef(fn::regprocedure);
   patched:=original;
   if fn like '%flip_open_drop%' then
     patched:=replace(patched,
       '  if not(1=any(v_tasks)) then v_tasks:=array_append(v_tasks,1);v_balance:=v_balance+30;v_xp:=v_xp+20;end if;'||chr(10)||
       '  if v_first and not(2=any(v_tasks)) then v_tasks:=array_append(v_tasks,2);v_balance:=v_balance+30;v_xp:=v_xp+20;end if;',
       '  -- Rewards for task slots are granted only through flip_claim_task.');
   else
     patched:=replace(patched,
       '  if v_any_new and not(2=any(v_tasks)) then'||chr(10)||
       '    v_tasks:=array_append(v_tasks,2);v_balance:=v_balance+30;v_xp:=v_xp+20;end if;'||chr(10)||
       '  if not(3=any(v_tasks)) then'||chr(10)||
       '    v_tasks:=array_append(v_tasks,3);v_balance:=v_balance+30;v_xp:=v_xp+20;end if;',
       '  -- Rewards for task slots are granted only through flip_claim_task.');
   end if;
   if original=patched then raise exception 'Could not safely patch implicit rewards: %',fn; end if;
   execute patched;
 end loop;
end; $patch$;