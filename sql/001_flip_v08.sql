-- FLIP v0.8 • Run ONCE in your NEW Supabase project's SQL Editor.
-- This script creates tables, seeds 25 cards and atomic server-only game functions.
-- Never expose Supabase secret keys or bot tokens to the browser.

create table if not exists public.flip_artists (
  id text primary key,
  name text not null,
  active boolean not null default true
);
create table if not exists public.flip_releases (
  artist_id text not null references public.flip_artists(id),
  id text not null,
  title text not null,
  release_year integer,
  active boolean not null default true,
  primary key(artist_id,id)
);
create table if not exists public.flip_cards (
  id text primary key,
  artist_id text,
  release_id text,
  rarity text not null check(rarity in ('common','rare','epic','legendary','mythic','hidden')),
  active boolean not null default true,
  foreign key(artist_id,release_id) references public.flip_releases(artist_id,id)
);
create table if not exists public.flip_players (
  telegram_id bigint primary key,
  username text not null default '',
  first_name text not null default '',
  balance integer not null default 0 check(balance>=0),
  xp integer not null default 0 check(xp>=0),
  level integer not null default 1 check(level>=1),
  pity_misses integer not null default 0 check(pity_misses>=0),
  drop_ready_at timestamptz not null default (now()+interval '4 hours'),
  welcome_remaining integer not null default 3 check(welcome_remaining between 0 and 3),
  welcome_rare_obtained boolean not null default false,
  daily_day date not null default ((now() at time zone 'Europe/Moscow')::date),
  claimed_tasks integer[] not null default '{}',
  pack_day date not null default ((now() at time zone 'Europe/Moscow')::date),
  packs_today integer not null default 0 check(packs_today between 0 and 10),
  bonus_packs integer not null default 0 check(bonus_packs>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.flip_inventory (
  telegram_id bigint not null references public.flip_players(telegram_id),
  card_id text not null references public.flip_cards(id),
  quantity integer not null default 1 check(quantity>0),
  primary key(telegram_id,card_id)
);
create table if not exists public.flip_discoveries (
  telegram_id bigint not null references public.flip_players(telegram_id),
  card_id text not null references public.flip_cards(id),
  first_found_at timestamptz not null default now(),
  primary key(telegram_id,card_id)
);
create table if not exists public.flip_actions (
  telegram_id bigint not null references public.flip_players(telegram_id),
  request_id uuid not null,
  action text not null check(action in ('drop','pack')),
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(telegram_id,request_id)
);
create index if not exists flip_actions_created_idx on public.flip_actions(created_at);

-- Enforce that no public API caller can access state directly.
alter table public.flip_artists enable row level security;
alter table public.flip_releases enable row level security;
alter table public.flip_cards enable row level security;
alter table public.flip_players enable row level security;
alter table public.flip_inventory enable row level security;
alter table public.flip_discoveries enable row level security;
alter table public.flip_actions enable row level security;
revoke all on public.flip_artists,public.flip_releases,public.flip_cards,public.flip_players,
  public.flip_inventory,public.flip_discoveries,public.flip_actions from public,anon,authenticated;
grant all on public.flip_artists,public.flip_releases,public.flip_cards,public.flip_players,
  public.flip_inventory,public.flip_discoveries,public.flip_actions to service_role;

insert into public.flip_artists(id,name) values ('carti','Playboi Carti') on conflict(id) do nothing;
insert into public.flip_releases(artist_id,id,title,release_year) values
('carti','playboi-carti','Playboi Carti',2017),
('carti','die-lit','Die Lit',2018),
('carti','whole-lotta-red','Whole Lotta Red',2020),
('carti','music','MUSIC',2025),
('carti','in-abundance','In Abundance',null)
on conflict(artist_id,id) do nothing;
insert into public.flip_cards(id,artist_id,release_id,rarity)
select a.id || '/' || r.id || '/' || rarity.id, a.id, r.id, rarity.id
from public.flip_artists a
join public.flip_releases r on r.artist_id=a.id
cross join (values('common'),('rare'),('epic'),('legendary'),('mythic')) rarity(id)
where a.id='carti'
on conflict(id) do nothing;
-- Placeholder for the still undecided Hidden style. Its card can be remapped later.
insert into public.flip_cards(id,artist_id,release_id,rarity) values
('demo/hidden/archive-001',null,null,'hidden') on conflict(id) do nothing;

-- Secure random fractional value in [0,1). pgcrypto is available in Supabase Postgres.
create or replace function public.flip_random() returns double precision
language plpgsql volatile set search_path = '' as $$
declare b bytea; n bigint;
begin
  b:=decode(substring(replace(pg_catalog.gen_random_uuid()::text,'-','') from 1 for 8),'hex');
  n:=get_byte(b,0)::bigint*16777216+get_byte(b,1)::bigint*65536+get_byte(b,2)::bigint*256+get_byte(b,3)::bigint;
  return n::double precision/4294967296.0;
end; $$;

create or replace function public.flip_roll_rarity(p_misses integer, p_force_rare boolean default false)
returns text language plpgsql volatile set search_path = '' as $$
declare t double precision; bonus double precision; c double precision; r double precision;
begin
  t:=public.flip_random()*100;
  if p_force_rare then
    if t< (25.0/35.0)*100 then return 'rare'; end if;
    if t< (33.0/35.0)*100 then return 'epic'; end if;
    if t< (34.8/35.0)*100 then return 'legendary'; end if;
    return 'mythic';
  end if;
  -- Hidden 0.005% is fixed and never contributes to pity.
  if t<0.005 then return 'hidden'; end if;
  t:=t-0.005;
  bonus:=least(40.0,greatest(0.0,(coalesce(p_misses,0)-29)*2.0));
  c:=64.995-bonus*(64.995/89.995);
  r:=25.0-bonus*(25.0/89.995);
  if t<c then return 'common';end if;
  if t<c+r then return 'rare';end if;
  if t<c+r+8+bonus then return 'epic';end if;
  if t<c+r+8+bonus+1.8 then return 'legendary';end if;
  return 'mythic';
end; $$;

create or replace function public.flip_snapshot(p_telegram_id bigint)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'balance',p.balance,'xp',p.xp,'level',p.level,'xp_to_next',100+50*(p.level-1),
    'pity_misses',p.pity_misses,'drop_ready_at',p.drop_ready_at,
    'welcome_remaining',p.welcome_remaining,'claimed_tasks',to_jsonb(p.claimed_tasks),
    'packs_today',p.packs_today,'bonus_packs',p.bonus_packs,
    'username',p.username,'first_name',p.first_name,
    'inventory',coalesce((select jsonb_agg(jsonb_build_object('id',i.card_id,'count',i.quantity) order by i.card_id)
        from public.flip_inventory i where i.telegram_id=p.telegram_id),'[]'::jsonb),
    'discovered',coalesce((select jsonb_agg(d.card_id order by d.card_id)
        from public.flip_discoveries d where d.telegram_id=p.telegram_id),'[]'::jsonb)
  ) from public.flip_players p where p.telegram_id=p_telegram_id;
$$;

create or replace function public.flip_bootstrap(telegram_id bigint, username text, first_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare today_msk date := (now() at time zone 'Europe/Moscow')::date;
begin
  if telegram_id is null or telegram_id<=0 then raise exception 'INVALID_ID'; end if;
  insert into public.flip_players(telegram_id,username,first_name)
    values(flip_bootstrap.telegram_id,left(coalesce(flip_bootstrap.username,''),64),left(coalesce(flip_bootstrap.first_name,''),128))
  on conflict on constraint flip_players_pkey do update set
    username=excluded.username, first_name=excluded.first_name, updated_at=now();
  update public.flip_players as player set daily_day=today_msk,claimed_tasks='{}'
    where player.telegram_id=flip_bootstrap.telegram_id and daily_day is distinct from today_msk;
  update public.flip_players as player set pack_day=today_msk,packs_today=0
    where player.telegram_id=flip_bootstrap.telegram_id and pack_day is distinct from today_msk;
  return public.flip_snapshot(flip_bootstrap.telegram_id);
end; $$;

create or replace function public.flip_open_drop(p_telegram_id bigint,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
  insert into public.flip_inventory(telegram_id,card_id,quantity) values(p_telegram_id,v_card_id,1)
    on conflict(telegram_id,card_id) do update set quantity=public.flip_inventory.quantity+1;
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
end; $$;

create or replace function public.flip_buy_pack(p_telegram_id bigint,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
    insert into public.flip_inventory(telegram_id,card_id,quantity) values(p_telegram_id,v_cards[i],1)
      on conflict(telegram_id,card_id) do update set quantity=public.flip_inventory.quantity+1;
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
end; $$;

-- Important: function execution is EXCLUSIVE to the server's service_role.
revoke all on function public.flip_random() from public,anon,authenticated;
revoke all on function public.flip_roll_rarity(integer,boolean) from public,anon,authenticated;
revoke all on function public.flip_snapshot(bigint) from public,anon,authenticated;
revoke all on function public.flip_bootstrap(bigint,text,text) from public,anon,authenticated;
revoke all on function public.flip_open_drop(bigint,uuid) from public,anon,authenticated;
revoke all on function public.flip_buy_pack(bigint,uuid) from public,anon,authenticated;
grant execute on function public.flip_random() to service_role;
grant execute on function public.flip_roll_rarity(integer,boolean) to service_role;
grant execute on function public.flip_snapshot(bigint) to service_role;
grant execute on function public.flip_bootstrap(bigint,text,text) to service_role;
grant execute on function public.flip_open_drop(bigint,uuid) to service_role;
grant execute on function public.flip_buy_pack(bigint,uuid) to service_role;
