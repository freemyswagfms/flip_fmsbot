-- FLIP v0.9.4: real-player showcases and public profile identities.
-- Never expose Telegram ID or private wallet fields to other players.
alter table public.flip_players
  add column if not exists public_id uuid not null default gen_random_uuid();
create unique index if not exists flip_players_public_id_unique
  on public.flip_players(public_id);

create table if not exists public.flip_showcase_slots(
  telegram_id bigint not null references public.flip_players(telegram_id) on delete cascade,
  slot smallint not null check(slot between 1 and 3),
  card_id text not null references public.flip_cards(id),
  updated_at timestamptz not null default now(),
  primary key(telegram_id,slot),
  unique(telegram_id,card_id)
);
create index if not exists flip_showcase_slots_card on public.flip_showcase_slots(card_id);
alter table public.flip_showcase_slots enable row level security;
revoke all on public.flip_showcase_slots from public,anon,authenticated;
grant all on public.flip_showcase_slots to service_role;

-- Invalidate showcases when the last real (ranked) copy leaves the inventory.
-- A retained test copy must NEVER keep a showcase pin alive.
create or replace function public.flip_showcase_prune()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op='DELETE' then
    delete from public.flip_showcase_slots s
      where s.telegram_id=old.telegram_id and s.card_id=old.card_id;
    return old;
  end if;
  if new.ranked_quantity<=0 then
    delete from public.flip_showcase_slots s
      where s.telegram_id=new.telegram_id and s.card_id=new.card_id;
  end if;
  return new;
end; $$;
drop trigger if exists flip_showcase_prune_inventory on public.flip_inventory;
create trigger flip_showcase_prune_inventory
  after update of ranked_quantity or delete on public.flip_inventory
  for each row execute function public.flip_showcase_prune();

-- Every existing player receives their own opaque UUID; it can be shared safely
-- without publishing a Telegram numeric ID.
create or replace function public.flip_public_profile(p_public_id uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare p public.flip_players%rowtype;
  v_slots jsonb:='[]'::jsonb;v_badges jsonb:='[]'::jsonb;
  v_unique integer:=0;v_owned integer:=0;
begin
  select * into p from public.flip_players where public_id=p_public_id;
  if not found then raise exception 'PLAYER_NOT_FOUND'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'slot',numbers.slot,
      'card_id',case when inv.card_id is not null then s.card_id else null end,
      'rarity',c.rarity) order by numbers.slot),'[]'::jsonb)
    into v_slots
    from generate_series(1,3) numbers(slot)
    left join public.flip_showcase_slots s
      on s.telegram_id=p.telegram_id and s.slot=numbers.slot
    left join public.flip_inventory inv
      on inv.telegram_id=p.telegram_id and inv.card_id=s.card_id and inv.ranked_quantity>0
    left join public.flip_cards c on c.id=inv.card_id;
  select count(*)::integer,coalesce(sum(i.ranked_quantity),0)::integer
    into v_unique,v_owned
    from public.flip_inventory i where i.telegram_id=p.telegram_id and i.ranked_quantity>0;
  select coalesce(jsonb_agg(jsonb_build_object(
    'code',d.code,'title',d.title,'symbol',d.symbol,'badge',d.badge)
    order by coalesce(cl.claimed_at,'epoch'::timestamptz) desc),'[]'::jsonb)
    into v_badges from (
      select distinct on (achievement_code) achievement_code,claimed_at
      from public.flip_achievement_claims
      where telegram_id=p.telegram_id order by achievement_code,claimed_at desc
    ) cl join public.flip_achievement_defs d
      on d.code=cl.achievement_code and d.badge is not null;
  return jsonb_build_object('public_id',p.public_id,'username',p.username,
    'first_name',p.first_name,'level',p.level,
    'cp',public.flip_cp_total(p.telegram_id),
    'ranked_cards',v_owned,'ranked_variants',v_unique,
    'slots',v_slots,'badges',v_badges);
end; $$;

create or replace function public.flip_showcase_own(p_telegram_id bigint)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_id uuid;
begin
 select public_id into v_id from public.flip_players
   where telegram_id=p_telegram_id;
 if v_id is null then raise exception 'ACCOUNT_NOT_FOUND';end if;
 return public.flip_public_profile(v_id);
end; $$;

-- Authenticate p_telegram_id in Vercel first; server serializes changes by
-- locking this player's row, consistent with trading/selling player locks.
create or replace function public.flip_showcase_set(
 p_telegram_id bigint,p_slot integer,p_card_id text default null)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare v_user bigint;v_quantity integer;
begin
 if p_slot not between 1 and 3 or p_slot is null then
   raise exception 'SHOWCASE_BAD_SLOT';end if;
 if p_card_id is not null and
   (length(p_card_id)>160 or p_card_id !~ '^[a-z0-9-]+/[a-z0-9-]+/[a-z0-9-]+$') then
   raise exception 'SHOWCASE_BAD_CARD';end if;
 select telegram_id into v_user from public.flip_players
   where telegram_id=p_telegram_id for update;
 if not found then raise exception 'ACCOUNT_NOT_FOUND';end if;
 if p_card_id is null then
   delete from public.flip_showcase_slots
     where telegram_id=p_telegram_id and slot=p_slot;
 else
   select ranked_quantity into v_quantity from public.flip_inventory
     where telegram_id=p_telegram_id and card_id=p_card_id;
   if coalesce(v_quantity,0)<=0 then raise exception 'SHOWCASE_NOT_OWNED';end if;
   -- Moving a card to another slot never duplicates it.
   delete from public.flip_showcase_slots
     where telegram_id=p_telegram_id and card_id=p_card_id and slot<>p_slot;
   insert into public.flip_showcase_slots(telegram_id,slot,card_id)
     values(p_telegram_id,p_slot,p_card_id)
     on conflict(telegram_id,slot) do update
       set card_id=excluded.card_id,updated_at=now();
 end if;
 return jsonb_build_object('ok',true,'profile',public.flip_showcase_own(p_telegram_id));
end; $$;

-- Used server-side to decorate the existing leaderboard with opaque profile IDs.
-- Does not expose balances, private IDs, or inventory.
create or replace function public.flip_profile_directory(p_player_ids bigint[])
returns jsonb language sql stable security invoker set search_path = '' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
   'telegram_id',p.telegram_id::text,'public_id',p.public_id)),'[]'::jsonb)
 from public.flip_players p
 where p.telegram_id=any(coalesce(p_player_ids,'{}'::bigint[]))
$$;
revoke all on function public.flip_showcase_prune(),
  public.flip_public_profile(uuid),public.flip_showcase_own(bigint),
  public.flip_showcase_set(bigint,integer,text),
  public.flip_profile_directory(bigint[])
  from public,anon,authenticated;
grant execute on function public.flip_showcase_prune(),
  public.flip_public_profile(uuid),public.flip_showcase_own(bigint),
  public.flip_showcase_set(bigint,integer,text),
  public.flip_profile_directory(bigint[])
  to service_role;
