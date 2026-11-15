-- FLIP v0.9.2. Rotating quests + player rerolls + 7-day login streak.
-- Player state is modified exclusively through service-role RPCs after Telegram signature verification.
create table if not exists public.flip_task_templates (
 task_key text primary key,
 scope text not null check(scope in ('daily','weekly')),
 slot integer not null check(slot between 1 and 3),
 title text not null,
 description text not null,
 metric text not null check(metric in ('free_drops','all_drops','new_cards','all_cards','packs','trades')),
 target integer not null check(target between 1 and 40),
 min_level integer not null default 1 check(min_level>=1),
 max_level integer check(max_level is null or max_level>=min_level),
 active boolean not null default true
);
insert into public.flip_task_templates(task_key,scope,slot,title,description,metric,target,min_level,max_level) values
 ('d_simple_any_1','daily',1,'Открой дроп','Подойдёт и приветственный дроп','all_drops',1,1,null),
 ('d_simple_cards_1','daily',1,'Получи карточку','Любая карточка из дропа или пака','all_cards',1,1,null),
 ('d_simple_free_1','daily',1,'Открой бесплатный дроп','Открой обычный дроп после таймера','free_drops',1,2,null),
 ('d_simple_free_2','daily',1,'Открой 2 бесплатных дропа','Открой два обычных дропа за день','free_drops',2,5,null),
 ('d_collect_new_1','daily',2,'Получи новую карточку','Открой разновидность впервые','new_cards',1,1,15),
 ('d_collect_all_2','daily',2,'Получи 2 карточки','Подойдут дропы и паки','all_cards',2,1,null),
 ('d_collect_all_3','daily',2,'Получи 3 карточки','Подойдут дропы и паки','all_cards',3,4,null),
 ('d_active_drop_2','daily',3,'Открой 2 дропа','Подойдут любые дропы','all_drops',2,1,null),
 ('d_active_free_1','daily',3,'Открой обычный дроп','Без приветственного дропа','free_drops',1,2,null),
 ('d_active_cards_3','daily',3,'Собери 3 карточки','Из обычных дропов или паков','all_cards',3,1,null),
 ('d_active_pack_1','daily',3,'Открой стандартный пак','Используй F в магазине','packs',1,7,null),
 ('d_active_trade_1','daily',3,'Соверши успешный обмен','Обмен должен быть принят вторым игроком','trades',1,7,null),
 ('w_simple_free_4','weekly',1,'Открой 4 бесплатных дропа','Четыре обычных дропа за неделю','free_drops',4,1,null),
 ('w_simple_any_6','weekly',1,'Открой 6 дропов','Считаются любые дропы за неделю','all_drops',6,1,null),
 ('w_simple_free_7','weekly',1,'Открой 7 бесплатных дропов','Семь обычных дропов за неделю','free_drops',7,4,null),
 ('w_collect_new_3','weekly',2,'Открой 3 новые карточки','Открой три ещё неизвестные разновидности','new_cards',3,1,15),
 ('w_collect_all_8','weekly',2,'Получи 8 карточек','Подойдут дропы и паки','all_cards',8,1,null),
 ('w_collect_all_12','weekly',2,'Получи 12 карточек','Подойдут дропы и паки','all_cards',12,4,null),
 ('w_active_free_8','weekly',3,'Открой 8 бесплатных дропов','Восемь обычных дропов за неделю','free_drops',8,1,null),
 ('w_active_cards_12','weekly',3,'Собери 12 карточек','Карточки из дропов и паков','all_cards',12,1,null),
 ('w_active_pack_2','weekly',3,'Открой 2 стандартных пака','Открой два пака за F','packs',2,6,null),
 ('w_active_trade_1','weekly',3,'Соверши успешный обмен','Обмен должен быть принят','trades',1,6,null)
on conflict(task_key) do nothing;

create table if not exists public.flip_task_assignments(
 telegram_id bigint not null references public.flip_players(telegram_id) on delete cascade,
 scope text not null check(scope in ('daily','weekly')),
 slot integer not null check(slot between 1 and 3),
 period_start date not null,
 slot_version uuid not null,
 task_key text not null references public.flip_task_templates(task_key),
 rerolled boolean not null default false,
 created_at timestamptz not null default now(),
 primary key(telegram_id,scope,slot,period_start)
);
create table if not exists public.flip_task_rerolls(
 telegram_id bigint not null references public.flip_players(telegram_id) on delete cascade,
 scope text not null check(scope in ('daily','weekly')),
 period_start date not null,
 slot integer not null check(slot between 1 and 3),
 created_at timestamptz not null default now(),
 primary key(telegram_id,scope,period_start)
);
create index if not exists flip_task_assignments_lookup on public.flip_task_assignments(telegram_id,period_start,scope);
create index if not exists flip_task_templates_slot on public.flip_task_templates(scope,slot,active);
alter table public.flip_task_templates enable row level security;
alter table public.flip_task_assignments enable row level security;
alter table public.flip_task_rerolls enable row level security;
revoke all on public.flip_task_templates,public.flip_task_assignments,public.flip_task_rerolls from public,anon,authenticated;
grant all on public.flip_task_templates,public.flip_task_assignments,public.flip_task_rerolls to service_role;

alter table public.flip_players
  add column if not exists streak_days integer not null default 0 check(streak_days between 0 and 7),
  add column if not exists streak_last_day date,
  add column if not exists streak_grace_used boolean not null default false,
  add column if not exists streak_unclaimed integer not null default 0 check(streak_unclaimed>=0),
  add column if not exists streak_cycles integer not null default 0 check(streak_cycles>=0);

create or replace function public.flip_task_period(p_scope text)
returns date language sql stable security invoker set search_path = '' as $$
 select case when p_scope='daily' then (now() at time zone 'Europe/Moscow')::date
             else date_trunc('week',now() at time zone 'Europe/Moscow')::date end
$$;

create or replace function public.flip_task_ensure(p_telegram_id bigint)
returns void language plpgsql volatile security invoker set search_path = '' as $$
declare t record; v_level integer; v_period date; v_key text;
begin
 select level into v_level from public.flip_players where telegram_id=p_telegram_id;
 if not found then return; end if;
 for t in select * from public.flip_task_slots order by scope,slot loop
   if t.kind='subscription' and (t.ends_at is null or t.ends_at>now()) then continue; end if;
   v_period:=public.flip_task_period(t.scope);
   select task_key into v_key from public.flip_task_templates tt
    where tt.scope=t.scope and tt.slot=t.slot and tt.active and tt.min_level<=v_level
      and (tt.max_level is null or v_level<=tt.max_level)
    order by md5(p_telegram_id::text||'|'||v_period::text||'|'||tt.task_key) limit 1;
   if v_key is null then raise exception 'TASK_TEMPLATES_MISSING'; end if;
   insert into public.flip_task_assignments(telegram_id,scope,slot,period_start,slot_version,task_key)
     values(p_telegram_id,t.scope,t.slot,v_period,t.version,v_key)
     on conflict(telegram_id,scope,slot,period_start) do update
       set task_key=excluded.task_key,slot_version=excluded.slot_version,rerolled=false
       where public.flip_task_assignments.slot_version is distinct from excluded.slot_version;
 end loop;
end; $$;

create or replace function public.flip_metric_progress(p_telegram_id bigint,p_scope text,p_metric text)
returns integer language plpgsql stable security invoker set search_path = '' as $$
declare v_day date:=public.flip_task_period(p_scope);
  v_from timestamptz:=(v_day::timestamp at time zone 'Europe/Moscow');
  v_to timestamptz:=((v_day+case when p_scope='daily' then 1 else 7 end)::timestamp at time zone 'Europe/Moscow');
  v_result integer:=0;
begin
 if p_metric='new_cards' then
   select count(*)::integer into v_result from public.flip_discoveries d
     where d.telegram_id=p_telegram_id and d.first_found_at>=v_from and d.first_found_at<v_to;
 elsif p_metric='trades' then
   select count(*)::integer into v_result from public.flip_trades t
     where (t.sender_id=p_telegram_id or t.recipient_id=p_telegram_id) and t.status='accepted'
       and t.completed_at>=v_from and t.completed_at<v_to;
 elsif p_metric in ('free_drops','all_drops','packs','all_cards') then
   select coalesce(sum(case
     when p_metric='free_drops' then case when a.action='drop' and a.result->>'welcome'='false' then 1 else 0 end
     when p_metric='all_drops' then case when a.action='drop' then 1 else 0 end
     when p_metric='packs' then case when a.action='pack' then 1 else 0 end
     when a.action='drop' then 1
     when a.action='pack' then jsonb_array_length(coalesce(a.result->'card_ids','[]'::jsonb))
     else 0 end),0)::integer into v_result
   from public.flip_actions a where a.telegram_id=p_telegram_id and a.created_at>=v_from and a.created_at<v_to;
 end if;
 return coalesce(v_result,0);
end; $$;

-- Called only after verified Telegram bootstrap; idempotent for every Moscow calendar day.
create or replace function public.flip_streak_touch(p_telegram_id bigint)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare p public.flip_players%rowtype;
  today_msk date:=(now() at time zone 'Europe/Moscow')::date;
  delta integer; next_days integer; next_grace boolean;
  rewarded boolean:=false;
begin
 select * into p from public.flip_players where telegram_id=p_telegram_id for update;
 if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;
 if p.streak_last_day=today_msk then
   return jsonb_build_object('days',p.streak_days,'unclaimed',p.streak_unclaimed,'new_reward',false);
 end if;
 delta:=case when p.streak_last_day is null then 999 else today_msk-p.streak_last_day end;
 if delta=1 and p.streak_days between 1 and 6 then
   next_days:=p.streak_days+1;next_grace:=p.streak_grace_used;
 elsif delta=2 and p.streak_days between 1 and 6 and not p.streak_grace_used then
   next_days:=p.streak_days+1;next_grace:=true;
 else
   next_days:=1;next_grace:=false;
 end if;
 if next_days=7 then rewarded:=true; end if;
 update public.flip_players
    set streak_days=next_days,streak_grace_used=next_grace,streak_last_day=today_msk,
        streak_unclaimed=p.streak_unclaimed+case when rewarded then 1 else 0 end,
        streak_cycles=p.streak_cycles+case when rewarded then 1 else 0 end,
        updated_at=now()
    where telegram_id=p_telegram_id;
 return jsonb_build_object('days',next_days,
   'unclaimed',p.streak_unclaimed+case when rewarded then 1 else 0 end,
   'new_reward',rewarded);
end; $$;

create or replace function public.flip_task_snapshot(p_telegram_id bigint)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare t public.flip_task_slots%rowtype;
  v_assignment public.flip_task_assignments%rowtype;
  v_template public.flip_task_templates%rowtype;
  p public.flip_players%rowtype;
  v_day date; v_claimed boolean; v_custom boolean; v_used boolean;
  v_version uuid; v_progress integer; v_target integer;
  v_f integer;v_xp integer;v_title text;v_desc text;
  v_task jsonb;daily_tasks jsonb:='[]'::jsonb;weekly_tasks jsonb:='[]'::jsonb;
  daily_reroll boolean:=false;weekly_reroll boolean:=false;
begin
 select * into p from public.flip_players where telegram_id=p_telegram_id;
 if not found then return jsonb_build_object('daily',daily_tasks,'weekly',weekly_tasks); end if;
 perform public.flip_task_ensure(p_telegram_id);
 for t in select * from public.flip_task_slots order by scope,slot loop
   v_day:=public.flip_task_period(t.scope);
   v_custom:=t.kind='subscription' and (t.ends_at is null or t.ends_at>now());
   v_claimed:=exists(select 1 from public.flip_task_claims c
     where c.telegram_id=p_telegram_id and c.scope=t.scope and c.slot=t.slot and c.period_start=v_day);
   v_used:=exists(select 1 from public.flip_task_rerolls r
     where r.telegram_id=p_telegram_id and r.scope=t.scope and r.period_start=v_day);
   if v_custom then
     v_version:=t.version;v_title:=t.title;v_desc:=t.description;v_target:=1;v_progress:=0;
     v_f:=t.reward_f;v_xp:=t.reward_xp;
   else
     select * into v_assignment from public.flip_task_assignments a
       where a.telegram_id=p_telegram_id and a.scope=t.scope and a.slot=t.slot and a.period_start=v_day;
     if not found then raise exception 'TASK_ASSIGNMENT_MISSING'; end if;
     select * into v_template from public.flip_task_templates tt where tt.task_key=v_assignment.task_key;
     if not found then raise exception 'TASK_TEMPLATES_MISSING'; end if;
     v_version:=md5(t.version::text||'|'||v_day::text||'|'||v_assignment.task_key||'|'||p_telegram_id::text)::uuid;
     v_title:=v_template.title;v_desc:=v_template.description;v_target:=v_template.target;
     v_progress:=public.flip_metric_progress(p_telegram_id,t.scope,v_template.metric);
     v_f:=case when t.scope='daily' then 30 else 100 end;
     v_xp:=case when t.scope='daily' then 20 else 60 end;
   end if;
   v_task:=jsonb_build_object('scope',t.scope,'slot',t.slot,'version',v_version,
     'type',case when v_custom then 'subscription' else 'default' end,
     'title',v_title,'description',v_desc,
     'url',case when v_custom then t.channel_url else null end,
     'reward_f',v_f,'reward_xp',v_xp,'target',v_target,'progress',v_progress,
     'claimed',v_claimed,'ready',not v_claimed and not v_custom and v_progress>=v_target,
     'rerollable',not v_custom and not v_claimed and not v_used);
   if t.scope='daily' then daily_tasks:=daily_tasks||jsonb_build_array(v_task);
   else weekly_tasks:=weekly_tasks||jsonb_build_array(v_task);end if;
 end loop;
 daily_reroll:=exists(select 1 from public.flip_task_rerolls r
   where r.telegram_id=p_telegram_id and r.scope='daily' and r.period_start=public.flip_task_period('daily'));
 weekly_reroll:=exists(select 1 from public.flip_task_rerolls r
   where r.telegram_id=p_telegram_id and r.scope='weekly' and r.period_start=public.flip_task_period('weekly'));
 return jsonb_build_object('daily',daily_tasks,'weekly',weekly_tasks,
   'daily_reroll_used',daily_reroll,'weekly_reroll_used',weekly_reroll,
   'weekly_bonus_claimed',exists(select 1 from public.flip_task_weekly_bonuses b
     where b.telegram_id=p_telegram_id and b.week_start=public.flip_task_period('weekly')),
   'streak',jsonb_build_object('days',p.streak_days,'grace_used',p.streak_grace_used,
     'last_day',p.streak_last_day,'unclaimed',p.streak_unclaimed,
     'cycles',p.streak_cycles,'reward_f',100));
end; $$;

create or replace function public.flip_reroll_task(p_telegram_id bigint,p_scope text,p_slot integer)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare p public.flip_players%rowtype;
 t public.flip_task_slots%rowtype;v_assignment public.flip_task_assignments%rowtype;
 v_period date;v_next text;affected integer;
begin
 if p_scope not in ('daily','weekly') or p_slot not between 1 and 3 then raise exception 'BAD_TASK'; end if;
 select * into p from public.flip_players where telegram_id=p_telegram_id for update;
 if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;
 select * into t from public.flip_task_slots where scope=p_scope and slot=p_slot;
 if not found then raise exception 'BAD_TASK'; end if;
 if t.kind='subscription' and (t.ends_at is null or t.ends_at>now()) then
   raise exception 'TASK_REROLL_FORBIDDEN'; end if;
 v_period:=public.flip_task_period(p_scope);
 if exists(select 1 from public.flip_task_claims c where c.telegram_id=p_telegram_id
   and c.scope=p_scope and c.slot=p_slot and c.period_start=v_period) then
   raise exception 'TASK_ALREADY_CLAIMED'; end if;
 if exists(select 1 from public.flip_task_rerolls r where r.telegram_id=p_telegram_id
   and r.scope=p_scope and r.period_start=v_period) then raise exception 'TASK_REROLL_USED'; end if;
 perform public.flip_task_ensure(p_telegram_id);
 select * into v_assignment from public.flip_task_assignments a where
  a.telegram_id=p_telegram_id and a.scope=p_scope and a.slot=p_slot and a.period_start=v_period for update;
 if not found then raise exception 'TASK_ASSIGNMENT_MISSING'; end if;
 select task_key into v_next from public.flip_task_templates tt
   where tt.scope=p_scope and tt.slot=p_slot and tt.active and tt.task_key<>v_assignment.task_key
     and tt.min_level<=p.level and (tt.max_level is null or p.level<=tt.max_level)
   order by md5(p_telegram_id::text||'|'||v_period::text||'|reroll|'||tt.task_key) limit 1;
 if v_next is null then raise exception 'TASK_REROLL_UNAVAILABLE'; end if;
 insert into public.flip_task_rerolls(telegram_id,scope,period_start,slot)
   values(p_telegram_id,p_scope,v_period,p_slot);
 update public.flip_task_assignments set task_key=v_next,rerolled=true where
   telegram_id=p_telegram_id and scope=p_scope and slot=p_slot and period_start=v_period;
 return jsonb_build_object('ok',true,'tasks',public.flip_task_snapshot(p_telegram_id));
end; $$;

create or replace function public.flip_claim_streak(p_telegram_id bigint)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare p public.flip_players%rowtype;
begin
 select * into p from public.flip_players where telegram_id=p_telegram_id for update;
 if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;
 if p.streak_unclaimed<=0 then raise exception 'STREAK_NOT_READY'; end if;
 update public.flip_players set streak_unclaimed=streak_unclaimed-1,
   balance=balance+100,updated_at=now() where telegram_id=p_telegram_id;
 return jsonb_build_object('ok',true,'earned_f',100,'state',public.flip_snapshot(p_telegram_id),
  'tasks',public.flip_task_snapshot(p_telegram_id));
end; $$;

create or replace function public.flip_claim_task(p_telegram_id bigint,p_scope text,p_slot integer,
 p_version uuid,p_verified boolean default false)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare player public.flip_players%rowtype; task public.flip_task_slots%rowtype;
 current_task jsonb; snapshot_tasks jsonb;v_period date;
 n integer; goal integer; is_custom boolean;rewardf integer;rewardxp integer;
 new_balance integer;new_xp integer;new_level integer;new_packs integer;
 bonus_inserted integer:=0;claimed_count integer;
 assignment public.flip_task_assignments%rowtype;
 template public.flip_task_templates%rowtype;
begin
 if p_scope not in ('daily','weekly') or p_slot not between 1 and 3 or p_version is null
   then raise exception 'BAD_TASK'; end if;
 select * into player from public.flip_players where telegram_id=p_telegram_id for update;
 if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;
 select * into task from public.flip_task_slots where scope=p_scope and slot=p_slot;
 if not found then raise exception 'BAD_TASK'; end if;
 v_period:=public.flip_task_period(p_scope);
 if exists(select 1 from public.flip_task_claims c where c.telegram_id=p_telegram_id
   and c.scope=p_scope and c.slot=p_slot and c.period_start=v_period) then
   raise exception 'TASK_ALREADY_CLAIMED';end if;
 snapshot_tasks:=public.flip_task_snapshot(p_telegram_id);
 current_task:=(snapshot_tasks->p_scope)->(p_slot-1);
 if current_task is null or (current_task->>'version')::uuid<>p_version then
   raise exception 'TASK_CHANGED';end if;
 is_custom:=(current_task->>'type')='subscription';
 if is_custom then
   if not p_verified then raise exception 'TASK_NOT_VERIFIED'; end if;
 else
   select * into assignment from public.flip_task_assignments a where
     a.telegram_id=p_telegram_id and a.scope=p_scope and a.slot=p_slot and a.period_start=v_period;
   select * into template from public.flip_task_templates tt where tt.task_key=assignment.task_key;
   goal:=template.target;
   n:=public.flip_metric_progress(p_telegram_id,p_scope,template.metric);
   if n<goal then raise exception 'TASK_INCOMPLETE'; end if;
 end if;
 rewardf:=(current_task->>'reward_f')::integer;rewardxp:=(current_task->>'reward_xp')::integer;
 insert into public.flip_task_claims(telegram_id,scope,slot,period_start,slot_version,reward_f,reward_xp)
 values(p_telegram_id,p_scope,p_slot,v_period,p_version,rewardf,rewardxp);
 new_balance:=player.balance+rewardf;new_xp:=player.xp+rewardxp;
 new_level:=player.level;new_packs:=player.bonus_packs;
 while new_xp>=100+50*(new_level-1) loop
   new_xp:=new_xp-(100+50*(new_level-1));new_level:=new_level+1;new_balance:=new_balance+30;
   if mod(new_level,10)=0 then new_packs:=new_packs+1;
   elsif mod(new_level,5)=0 then new_balance:=new_balance+50;end if;
 end loop;
 if p_scope='weekly' then
   select count(*) into claimed_count from public.flip_task_claims c
     where c.telegram_id=p_telegram_id and c.scope='weekly' and c.period_start=v_period;
   if claimed_count=3 then
     insert into public.flip_task_weekly_bonuses(telegram_id,week_start)
       values(p_telegram_id,v_period) on conflict do nothing;
     get diagnostics bonus_inserted=row_count;
     if bonus_inserted=1 then new_balance:=new_balance+50;end if;
   end if;
 end if;
 update public.flip_players set balance=new_balance,xp=new_xp,level=new_level,
   bonus_packs=new_packs,updated_at=now() where telegram_id=p_telegram_id;
 return jsonb_build_object('ok',true,
   'earned_f',rewardf+case when bonus_inserted=1 then 50 else 0 end,
   'earned_xp',rewardxp,'weekly_bonus',bonus_inserted=1,
   'state',public.flip_snapshot(p_telegram_id),'tasks',public.flip_task_snapshot(p_telegram_id));
end; $$;

revoke all on function public.flip_task_period(text),public.flip_task_ensure(bigint),
 public.flip_metric_progress(bigint,text,text),public.flip_streak_touch(bigint),
 public.flip_task_snapshot(bigint),public.flip_reroll_task(bigint,text,integer),
 public.flip_claim_streak(bigint),public.flip_claim_task(bigint,text,integer,uuid,boolean)
 from public,anon,authenticated;
grant execute on function public.flip_task_period(text),public.flip_task_ensure(bigint),
 public.flip_metric_progress(bigint,text,text),public.flip_streak_touch(bigint),
 public.flip_task_snapshot(bigint),public.flip_reroll_task(bigint,text,integer),
 public.flip_claim_streak(bigint),public.flip_claim_task(bigint,text,integer,uuid,boolean)
 to service_role;
