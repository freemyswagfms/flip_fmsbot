-- FLIP v0.8.3 — run once AFTER 001_flip_v08.sql. Applied to flip-game in Supabase.
-- Existing owned copies are ranked. Administrative test gifts have their own quantity.
alter table public.flip_inventory add column if not exists ranked_quantity integer not null default 0;
alter table public.flip_inventory add column if not exists test_quantity integer not null default 0;
update public.flip_inventory set ranked_quantity=quantity where ranked_quantity=0 and test_quantity=0 and quantity>0;
alter table public.flip_inventory add constraint flip_inventory_provenance_counts
 check(ranked_quantity>=0 and test_quantity>=0 and quantity=ranked_quantity+test_quantity);

create table if not exists public.flip_admin_actions (
 request_id uuid primary key,
 admin_telegram_id bigint not null,
 recipient_telegram_id bigint not null references public.flip_players(telegram_id),
 card_id text not null references public.flip_cards(id),
 grant_mode text not null check(grant_mode in ('ranked','test')),
 note text not null default '',
 created_at timestamptz not null default now()
);
create index if not exists flip_admin_actions_recipient_idx
 on public.flip_admin_actions(recipient_telegram_id,created_at desc);
alter table public.flip_admin_actions enable row level security;
revoke all on public.flip_admin_actions from public,anon,authenticated;
grant select,insert on public.flip_admin_actions to service_role;

-- public.flip_open_drop(bigint,uuid)
CREATE OR REPLACE FUNCTION public.flip_open_drop(p_telegram_id bigint, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.flip_players%rowtype; v_old public.flip_actions%rowtype;
  today_msk date := (now() at time zone 'Europe/Moscow')::date;
  v_artist text;v_release text;v_rarity text;v_card_id text;v_first boolean;
  v_welcome boolean;v_forced boolean;v_xp integer;v_level integer;v_balance integer;
  v_tasks integer[];v_pity integer;v_rem integer;v_rare boolean;v_bonus_packs integer;
  v_result jsonb;
begin
  select * into p from public.flip_players where telegram_id=p_telegram_id for update;
  if not found then raise exception 'ACCOUNT_NOT_FOUND';end if;
  select * into v_old from public.flip_actions where telegram_id=p_telegram_id and request_id=p_request_id;
  if found then
    if v_old.action<>'drop' then raise exception 'DUPLICATE_REQUEST_ACTION';end if;
    -- Reuse the exact awarded item(s), but return the player's CURRENT state.
    return jsonb_set(v_old.result,'{state}',public.flip_snapshot(p_telegram_id),true);
  end if;
  v_tasks:=case when p.daily_day is distinct from today_msk then '{}'::integer[] else p.claimed_tasks end;
  v_welcome:=p.welcome_remaining>0;
  if not v_welcome and now()<p.drop_ready_at then raise exception 'DROP_COOLDOWN';end if;
  v_forced:=v_welcome and p.welcome_remaining=1 and not p.welcome_rare_obtained;
  select id into v_artist from public.flip_artists where active order by public.flip_random() limit 1;
  select id into v_release from public.flip_releases where artist_id=v_artist and active order by public.flip_random() limit 1;
  if v_artist is null or v_release is null then raise exception 'EMPTY_CATALOG';end if;
  v_rarity:=public.flip_roll_rarity(case when v_welcome then 0 else p.pity_misses end,v_forced);
  v_card_id:=case when v_rarity='hidden' then 'demo/hidden/archive-001'
     else v_artist||'/'||v_release||'/'||v_rarity end;
  if not exists (select 1 from public.flip_cards where id=v_card_id and active) then raise exception 'CARD_NOT_FOUND';end if;
  v_first:=not exists(select 1 from public.flip_discoveries where telegram_id=p_telegram_id and card_id=v_card_id);
  insert into public.flip_inventory(telegram_id,card_id,quantity,ranked_quantity,test_quantity) values(p_telegram_id,v_card_id,1,1,0)
    on conflict(telegram_id,card_id) do update set quantity=public.flip_inventory.quantity+1, ranked_quantity=public.flip_inventory.ranked_quantity+1;
  insert into public.flip_discoveries(telegram_id,card_id) values(p_telegram_id,v_card_id)
    on conflict do nothing;
  v_xp:=p.xp+10+(case when v_first then 10 else 0 end);
  v_balance:=p.balance; v_level:=p.level; v_pity:=p.pity_misses;
  v_rem:=p.welcome_remaining;v_rare:=p.welcome_rare_obtained;v_bonus_packs:=p.bonus_packs;
  if v_welcome then
    v_rem:=v_rem-1;
    if v_rarity<>'common' and v_rarity<>'hidden' then v_rare:=true;end if;
  else
    if v_rarity in ('epic','legendary','mythic') then v_pity:=0;
    elsif v_rarity<>'hidden' then v_pity:=v_pity+1;end if;
  end if;
  -- Three simplified auto-claimed daily tasks, reset at midnight Moscow time.
  if not(1=any(v_tasks)) then v_tasks:=array_append(v_tasks,1);v_balance:=v_balance+30;v_xp:=v_xp+20;end if;
  if v_first and not(2=any(v_tasks)) then v_tasks:=array_append(v_tasks,2);v_balance:=v_balance+30;v_xp:=v_xp+20;end if;
  while v_xp>=100+50*(v_level-1) loop
    v_xp:=v_xp-(100+50*(v_level-1));v_level:=v_level+1;v_balance:=v_balance+30;
    if mod(v_level,10)=0 then v_bonus_packs:=v_bonus_packs+1;
    elsif mod(v_level,5)=0 then v_balance:=v_balance+50;end if;
  end loop;
  update public.flip_players set balance=v_balance,xp=v_xp,level=v_level,pity_misses=v_pity,
    welcome_remaining=v_rem,welcome_rare_obtained=v_rare,
    drop_ready_at=case when v_welcome then p.drop_ready_at else now()+interval '4 hours' end,
    daily_day=today_msk,claimed_tasks=v_tasks,bonus_packs=v_bonus_packs,
    pack_day=case when p.pack_day is distinct from today_msk then today_msk else p.pack_day end,
    packs_today=case when p.pack_day is distinct from today_msk then 0 else p.packs_today end,
    updated_at=now() where telegram_id=p_telegram_id;
  v_result:=jsonb_build_object('action','drop','card_id',v_card_id,'welcome',v_welcome,
    'state',public.flip_snapshot(p_telegram_id));
  insert into public.flip_actions(telegram_id,request_id,action,result) values(p_telegram_id,p_request_id,'drop',v_result);
  return v_result;
end; $function$

-- public.flip_buy_pack(bigint,uuid)
CREATE OR REPLACE FUNCTION public.flip_buy_pack(p_telegram_id bigint, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.flip_players%rowtype; v_old public.flip_actions%rowtype;
  today_msk date := (now() at time zone 'Europe/Moscow')::date;
  v_cards text[]:='{}';v_card text;v_rarity text;v_artist text;v_release text;
  v_rare boolean:=false;v_xp integer;v_level integer;v_balance integer;
  v_tasks integer[];v_count integer;v_first boolean;v_any_new boolean:=false;
  v_bonus_packs integer;v_result jsonb; i integer;j integer;v_tries integer;
begin
  select * into p from public.flip_players where telegram_id=p_telegram_id for update;
  if not found then raise exception 'ACCOUNT_NOT_FOUND';end if;
  select * into v_old from public.flip_actions where telegram_id=p_telegram_id and request_id=p_request_id;
  if found then
    if v_old.action<>'pack' then raise exception 'DUPLICATE_REQUEST_ACTION';end if;
    -- Reuse the exact awarded item(s), but return the player's CURRENT state.
    return jsonb_set(v_old.result,'{state}',public.flip_snapshot(p_telegram_id),true);
  end if;
  v_count:=case when p.pack_day is distinct from today_msk then 0 else p.packs_today end;
  if v_count>=10 then raise exception 'DAILY_PACK_LIMIT';end if;
  if p.balance<200 then raise exception 'INSUFFICIENT_FUNDS';end if;
  for i in 1..3 loop
    v_tries:=0;
    loop
      v_tries:=v_tries+1;if v_tries>100 then raise exception 'PACK_GENERATION_FAILED';end if;
      select id into v_artist from public.flip_artists where active order by public.flip_random() limit 1;
      select id into v_release from public.flip_releases where artist_id=v_artist and active order by public.flip_random() limit 1;
      if v_artist is null or v_release is null then raise exception 'EMPTY_CATALOG';end if;
      v_rarity:=public.flip_roll_rarity(0,false);
      v_card:=case when v_rarity='hidden' then 'demo/hidden/archive-001' else v_artist||'/'||v_release||'/'||v_rarity end;
      exit when not(v_card=any(v_cards));
    end loop;
    v_cards:=array_append(v_cards,v_card);
    if v_rarity<>'common' then v_rare:=true;end if;
  end loop;
  if not v_rare then
    j:=floor(public.flip_random()*3)::integer+1;
    v_tries:=0;
    loop
      v_tries:=v_tries+1;if v_tries>100 then raise exception 'PACK_GENERATION_FAILED';end if;
      select id into v_artist from public.flip_artists where active order by public.flip_random() limit 1;
      select id into v_release from public.flip_releases where artist_id=v_artist and active order by public.flip_random() limit 1;
      v_rarity:=public.flip_roll_rarity(0,true);
      v_card:=v_artist||'/'||v_release||'/'||v_rarity;
      exit when not(v_card=any(v_cards));
    end loop;
    v_cards[j]:=v_card;
  end if;
  v_balance:=p.balance-200;v_xp:=p.xp+30;v_level:=p.level;v_bonus_packs:=p.bonus_packs;
  v_tasks:=case when p.daily_day is distinct from today_msk then '{}'::integer[] else p.claimed_tasks end;
  for i in 1..3 loop
    v_first:=not exists(select 1 from public.flip_discoveries where telegram_id=p_telegram_id and card_id=v_cards[i]);
    insert into public.flip_inventory(telegram_id,card_id,quantity,ranked_quantity,test_quantity) values(p_telegram_id,v_cards[i],1,1,0)
      on conflict(telegram_id,card_id) do update set quantity=public.flip_inventory.quantity+1, ranked_quantity=public.flip_inventory.ranked_quantity+1;
    insert into public.flip_discoveries(telegram_id,card_id) values(p_telegram_id,v_cards[i]) on conflict do nothing;
    if v_first then v_xp:=v_xp+10;v_any_new:=true;end if;
  end loop;
  if v_any_new and not(2=any(v_tasks)) then
    v_tasks:=array_append(v_tasks,2);v_balance:=v_balance+30;v_xp:=v_xp+20;end if;
  if not(3=any(v_tasks)) then
    v_tasks:=array_append(v_tasks,3);v_balance:=v_balance+30;v_xp:=v_xp+20;end if;
  while v_xp>=100+50*(v_level-1) loop
    v_xp:=v_xp-(100+50*(v_level-1));v_level:=v_level+1;v_balance:=v_balance+30;
    if mod(v_level,10)=0 then v_bonus_packs:=v_bonus_packs+1;
    elsif mod(v_level,5)=0 then v_balance:=v_balance+50;end if;
  end loop;
  update public.flip_players set balance=v_balance,xp=v_xp,level=v_level,
    daily_day=today_msk,claimed_tasks=v_tasks,pack_day=today_msk,packs_today=v_count+1,
    bonus_packs=v_bonus_packs,updated_at=now() where telegram_id=p_telegram_id;
  v_result:=jsonb_build_object('action','pack','card_ids',to_jsonb(v_cards),
    'state',public.flip_snapshot(p_telegram_id));
  insert into public.flip_actions(telegram_id,request_id,action,result) values(p_telegram_id,p_request_id,'pack',v_result);
  return v_result;
end; $function$

-- public.flip_snapshot(bigint)
CREATE OR REPLACE FUNCTION public.flip_snapshot(p_telegram_id bigint)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'balance',p.balance,'xp',p.xp,'level',p.level,'xp_to_next',100+50*(p.level-1),
    'pity_misses',p.pity_misses,'drop_ready_at',p.drop_ready_at,
    'welcome_remaining',p.welcome_remaining,'claimed_tasks',to_jsonb(p.claimed_tasks),
    'packs_today',p.packs_today,'bonus_packs',p.bonus_packs,
    'username',p.username,'first_name',p.first_name,
    'inventory',coalesce((select jsonb_agg(jsonb_build_object('id',i.card_id,'count',i.quantity,'ranked_count',i.ranked_quantity,'test_count',i.test_quantity) order by i.card_id)
        from public.flip_inventory i where i.telegram_id=p.telegram_id),'[]'::jsonb),
    'discovered',coalesce((select jsonb_agg(d.card_id order by d.card_id)
        from public.flip_discoveries d where d.telegram_id=p.telegram_id),'[]'::jsonb)
  ) from public.flip_players p where p.telegram_id=p_telegram_id;
$function$

-- public.flip_admin_search_players(text)
CREATE OR REPLACE FUNCTION public.flip_admin_search_players(p_query text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb)
 from (
   select p.telegram_id::text as telegram_id, p.first_name, p.username, p.level, p.balance, p.xp,
     p.created_at,
     coalesce((select sum(i.quantity) from public.flip_inventory i where i.telegram_id=p.telegram_id),0)::int as total_cards,
     coalesce((select sum(i.ranked_quantity) from public.flip_inventory i where i.telegram_id=p.telegram_id),0)::int as ranked_cards
   from public.flip_players p
   where length(trim(coalesce(p_query,''))) = 0
      or p.telegram_id::text = trim(p_query)
      or p.username ilike '%' || left(trim(p_query),64) || '%'
      or p.first_name ilike '%' || left(trim(p_query),64) || '%'
   order by p.created_at desc limit 20
 ) t;
$function$

-- public.flip_admin_catalog()
CREATE OR REPLACE FUNCTION public.flip_admin_catalog()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(jsonb_build_object(
     'id',c.id,'rarity',c.rarity,'label',
     coalesce(a.name,'SECRET')||' — '||coalesce(r.title,'HIDDEN')||' — '||upper(c.rarity))
     order by a.name nulls last,r.title nulls last,c.rarity),'[]'::jsonb)
 from public.flip_cards c
 left join public.flip_artists a on a.id=c.artist_id
 left join public.flip_releases r on r.id=c.release_id and r.artist_id=c.artist_id
 where c.active;
$function$

-- public.flip_admin_history(integer)
CREATE OR REPLACE FUNCTION public.flip_admin_history(p_limit integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb)
  from (
    select request_id::text, admin_telegram_id::text, recipient_telegram_id::text,
      card_id, grant_mode, note, created_at
    from public.flip_admin_actions order by created_at desc limit least(greatest(coalesce(p_limit,30),1),50)
  ) t;
$function$

-- public.flip_ranked_leaderboard(integer)
CREATE OR REPLACE FUNCTION public.flip_ranked_leaderboard(p_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.ranked_cards desc,t.ranked_variants desc,t.telegram_id asc),'[]'::jsonb)
  from (
    select p.telegram_id::text as telegram_id,p.username,p.first_name,
      sum(i.ranked_quantity)::integer as ranked_cards,
      count(*) filter(where i.ranked_quantity>0)::integer as ranked_variants
    from public.flip_players p
    join public.flip_inventory i on i.telegram_id=p.telegram_id
    group by p.telegram_id,p.username,p.first_name
    having sum(i.ranked_quantity)>0
    order by ranked_cards desc,ranked_variants desc,p.telegram_id asc
    limit least(greatest(coalesce(p_limit,25),1),50)
  ) t;
$function$

-- public.flip_admin_grant_card(bigint,bigint,text,text,text,uuid)
CREATE OR REPLACE FUNCTION public.flip_admin_grant_card(p_admin_id bigint, p_recipient_id bigint, p_card_id text, p_mode text, p_note text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_player public.flip_players%rowtype; v_previous public.flip_admin_actions%rowtype;
begin
  if p_admin_id is null or p_admin_id <= 0
     or p_request_id is null or p_recipient_id is null or p_recipient_id <= 0
     or p_mode not in ('ranked','test') or p_card_id is null or length(p_card_id)>160
     or p_note is null or length(p_note)>200
  then raise exception 'BAD_ADMIN_GRANT'; end if;
  select * into v_player from public.flip_players where telegram_id=p_recipient_id for update;
  if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;

  select * into v_previous from public.flip_admin_actions where request_id=p_request_id;
  if found then
    if v_previous.admin_telegram_id<>p_admin_id
       or v_previous.recipient_telegram_id<>p_recipient_id
       or v_previous.card_id<>p_card_id or v_previous.grant_mode<>p_mode
       or v_previous.note<>p_note
    then raise exception 'DUPLICATE_ADMIN_REQUEST'; end if;
    return jsonb_build_object('ok',true,'replayed',true,'recipient_id',p_recipient_id::text,
      'card_id',p_card_id,'mode',p_mode,'state',public.flip_snapshot(p_recipient_id));
  end if;
  if not exists(select 1 from public.flip_cards where id=p_card_id and active)
     then raise exception 'CARD_NOT_FOUND'; end if;
  insert into public.flip_admin_actions(request_id,admin_telegram_id,recipient_telegram_id,card_id,grant_mode,note)
    values(p_request_id,p_admin_id,p_recipient_id,p_card_id,p_mode,p_note);

  insert into public.flip_inventory(telegram_id,card_id,quantity,ranked_quantity,test_quantity)
    values(p_recipient_id,p_card_id,1,
      case when p_mode='ranked' then 1 else 0 end,
      case when p_mode='test' then 1 else 0 end)
    on conflict(telegram_id,card_id) do update set
      quantity=public.flip_inventory.quantity+1,
      ranked_quantity=public.flip_inventory.ranked_quantity+(case when p_mode='ranked' then 1 else 0 end),
      test_quantity=public.flip_inventory.test_quantity+(case when p_mode='test' then 1 else 0 end);
  -- Administrative gifts do not award discovery XP, coins, or affect pity.
  insert into public.flip_discoveries(telegram_id,card_id) values(p_recipient_id,p_card_id) on conflict do nothing;
  return jsonb_build_object('ok',true,'replayed',false,'recipient_id',p_recipient_id::text,
     'card_id',p_card_id,'mode',p_mode,'state',public.flip_snapshot(p_recipient_id));
end;
$function$


revoke all on function public.flip_admin_search_players(text) from public,anon,authenticated;
revoke all on function public.flip_admin_catalog() from public,anon,authenticated;
revoke all on function public.flip_admin_history(integer) from public,anon,authenticated;
revoke all on function public.flip_ranked_leaderboard(integer) from public,anon,authenticated;
revoke all on function public.flip_admin_grant_card(bigint,bigint,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.flip_admin_search_players(text) to service_role;
grant execute on function public.flip_admin_catalog() to service_role;
grant execute on function public.flip_admin_history(integer) to service_role;
grant execute on function public.flip_ranked_leaderboard(integer) to service_role;
grant execute on function public.flip_admin_grant_card(bigint,bigint,text,text,text,uuid) to service_role;
