-- FLIP v0.9.4.4 — persistent creator-only developer modes.
-- The trusted Vercel /api/admin handler verifies the Telegram initData signature
-- and the configured FLIP_ADMIN_TELEGRAM_ID before invoking these service-role RPCs.
-- Only the authenticated creator's own account may be changed.
create table if not exists public.flip_admin_play_modes (
  telegram_id bigint primary key references public.flip_players(telegram_id) on delete cascade,
  unlimited_drop boolean not null default false,
  unlimited_packs boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists public.flip_admin_mode_events (
  request_id uuid primary key,
  admin_telegram_id bigint not null references public.flip_players(telegram_id) on delete cascade,
  kind text not null check(kind in ('drop','pack')),
  enabled boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists flip_admin_mode_events_recent
  on public.flip_admin_mode_events(admin_telegram_id,created_at desc);

alter table public.flip_admin_play_modes enable row level security;
alter table public.flip_admin_mode_events enable row level security;
revoke all on public.flip_admin_play_modes,public.flip_admin_mode_events
  from public,anon,authenticated;
grant select,insert,update on public.flip_admin_play_modes to service_role;
grant select,insert on public.flip_admin_mode_events to service_role;

-- Existing drop/pack functions are intentionally untouched. Their normal row
-- lock and award calculations remain authoritative; the trigger only adjusts
-- player cooldown counters for a specifically opted-in creator.
create or replace function public.flip_admin_apply_unlimited()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  no_drop boolean:=false;
  no_pack boolean:=false;
begin
  if new.drop_ready_at is not distinct from old.drop_ready_at and
     new.pack_day is not distinct from old.pack_day and
     new.packs_today is not distinct from old.packs_today then
    return new;
  end if;
  select coalesce(m.unlimited_drop,false),coalesce(m.unlimited_packs,false)
    into no_drop,no_pack from public.flip_admin_play_modes m
    where m.telegram_id=new.telegram_id;
  if coalesce(no_drop,false) then
    new.drop_ready_at=now()-interval '1 second';
  end if;
  if coalesce(no_pack,false) then
    new.pack_day=(now() at time zone 'Europe/Moscow')::date;
    new.packs_today=0;
  end if;
  return new;
end; $$;

drop trigger if exists flip_admin_apply_unlimited_players on public.flip_players;
create trigger flip_admin_apply_unlimited_players
before update of drop_ready_at,pack_day,packs_today on public.flip_players
for each row execute function public.flip_admin_apply_unlimited();

create or replace function public.flip_admin_set_unlimited(
  p_admin_id bigint,p_kind text,p_enabled boolean,p_request_id uuid
) returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare
  p public.flip_players%rowtype;
  prior public.flip_admin_mode_events%rowtype;
  was_enabled boolean:=false;
  replay boolean:=false;
  latest_drop timestamptz;
begin
  if p_admin_id is null or p_admin_id<=0 or
     p_kind is null or p_kind not in ('drop','pack') or
     p_enabled is null or p_request_id is null then
    raise exception 'BAD_ADMIN_MODE';
  end if;

  -- Serialize mode changes with every live drop/pack via the player row lock.
  select * into p from public.flip_players
    where telegram_id=p_admin_id for update;
  if not found then raise exception 'ACCOUNT_NOT_FOUND';end if;

  select * into prior from public.flip_admin_mode_events
    where request_id=p_request_id;
  if found then
    if prior.admin_telegram_id<>p_admin_id or prior.kind<>p_kind or
       prior.enabled is distinct from p_enabled then
      raise exception 'DUPLICATE_ADMIN_REQUEST';
    end if;
    replay:=true;
  else
    select case when p_kind='drop' then unlimited_drop else unlimited_packs end
    into was_enabled from public.flip_admin_play_modes
    where telegram_id=p_admin_id;
    was_enabled:=coalesce(was_enabled,false);

    insert into public.flip_admin_play_modes(telegram_id,unlimited_drop,unlimited_packs)
      values (p_admin_id,p_kind='drop' and p_enabled,p_kind='pack' and p_enabled)
      on conflict(telegram_id) do update set
        unlimited_drop=case when p_kind='drop' then p_enabled
                            else public.flip_admin_play_modes.unlimited_drop end,
        unlimited_packs=case when p_kind='pack' then p_enabled
                             else public.flip_admin_play_modes.unlimited_packs end,
        updated_at=now();

    if p_kind='drop' then
      if p_enabled then
        update public.flip_players set drop_ready_at=now()-interval '1 second',
          updated_at=now() where telegram_id=p_admin_id;
      elsif was_enabled then
        -- Restore the *real* cooldown, measured from the last ordinary drop.
        -- Welcome drops don't start a 4-hour cooldown.
        select max(a.created_at) into latest_drop
        from public.flip_actions a
        where a.telegram_id=p_admin_id and a.action='drop'
          and a.result->>'welcome'='false';
        update public.flip_players set
          drop_ready_at=greatest(now()-interval '1 second',
            coalesce(latest_drop+interval '4 hours',now()-interval '1 second')),
          updated_at=now()
        where telegram_id=p_admin_id;
      end if;
    elsif p_kind='pack' and p_enabled then
      -- The physical column is bounded to 10 by the original schema.
      -- In unlimited mode, the trigger ensures it stays 0 after every purchase.
      update public.flip_players set
        pack_day=(now() at time zone 'Europe/Moscow')::date,
        packs_today=0,updated_at=now() where telegram_id=p_admin_id;
    end if;

    insert into public.flip_admin_mode_events
      (request_id,admin_telegram_id,kind,enabled)
      values(p_request_id,p_admin_id,p_kind,p_enabled);
  end if;

  return jsonb_build_object(
    'ok',true,'kind',p_kind,'enabled',p_enabled,
    'already_applied',replay,
    'cooldowns',public.flip_admin_cooldown_status(p_admin_id)
  );
end; $$;

create or replace function public.flip_admin_cooldown_status(p_admin_id bigint)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  p public.flip_players%rowtype;
  today_msk date:=(now() at time zone 'Europe/Moscow')::date;
  v_history jsonb:='[]'::jsonb;
  no_drop boolean:=false;no_pack boolean:=false;
begin
  select * into p from public.flip_players where telegram_id=p_admin_id;
  if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;
  select m.unlimited_drop,m.unlimited_packs into no_drop,no_pack
    from public.flip_admin_play_modes m where m.telegram_id=p_admin_id;
  no_drop:=coalesce(no_drop,false);
  no_pack:=coalesce(no_pack,false);

  select coalesce(jsonb_agg(jsonb_build_object(
    'kind',a.kind,'enabled',a.enabled,'created_at',a.created_at,
    'prior_packs_today',a.prior_packs_today
  ) order by a.created_at desc),'[]'::jsonb) into v_history
  from (
    select kind,enabled,created_at,null::integer as prior_packs_today
      from public.flip_admin_mode_events
      where admin_telegram_id=p_admin_id
    union all
    select kind,null::boolean as enabled,created_at,prior_packs_today
      from public.flip_admin_cooldown_resets
      where admin_telegram_id=p_admin_id
    order by created_at desc limit 10
  ) a;

  return jsonb_build_object(
    'drop_ready_at',p.drop_ready_at,
    'drop_ready',no_drop or now()>=p.drop_ready_at or p.welcome_remaining>0,
    'drop_unlimited',no_drop,
    'pack_unlimited',no_pack,
    'packs_today',case when p.pack_day=today_msk then p.packs_today else 0 end,
    'packs_limit',10,
    'welcome_remaining',p.welcome_remaining,
    'history',v_history
  );
end; $$;

-- Add mode flags only to the player's *own* authenticated snapshot,
-- so the shop can show "Без лимита" instead of an incorrect 0/10 label.
create or replace function public.flip_snapshot(p_telegram_id bigint)
returns jsonb language sql stable set search_path = '' as $
  select jsonb_build_object(
    'balance',p.balance,'xp',p.xp,'level',p.level,'xp_to_next',100+50*(p.level-1),
    'cp',public.flip_cp_total(p.telegram_id),
    'pity_misses',p.pity_misses,'drop_ready_at',p.drop_ready_at,
    'welcome_remaining',p.welcome_remaining,'claimed_tasks',to_jsonb(p.claimed_tasks),
    'packs_today',p.packs_today,'bonus_packs',p.bonus_packs,
    'unlimited_drop',coalesce((select m.unlimited_drop from public.flip_admin_play_modes m
      where m.telegram_id=p.telegram_id),false),
    'unlimited_packs',coalesce((select m.unlimited_packs from public.flip_admin_play_modes m
      where m.telegram_id=p.telegram_id),false),
    'username',p.username,'first_name',p.first_name,
    'inventory',coalesce((select jsonb_agg(jsonb_build_object('id',i.card_id,
       'count',i.quantity,'ranked_count',i.ranked_quantity,'test_count',i.test_quantity)
       order by i.card_id) from public.flip_inventory i
       where i.telegram_id=p.telegram_id),'[]'::jsonb),
    'discovered',coalesce((select jsonb_agg(d.card_id order by d.card_id)
       from public.flip_discoveries d
       where d.telegram_id=p.telegram_id),'[]'::jsonb)
  ) from public.flip_players p where p.telegram_id=p_telegram_id;
$;
revoke all on function public.flip_snapshot(bigint) from public,anon,authenticated;
grant execute on function public.flip_snapshot(bigint) to service_role;

revoke all on function public.flip_admin_apply_unlimited(),
  public.flip_admin_set_unlimited(bigint,text,boolean,uuid),
  public.flip_admin_cooldown_status(bigint)
  from public,anon,authenticated;
grant execute on function public.flip_admin_apply_unlimited(),
  public.flip_admin_set_unlimited(bigint,text,boolean,uuid),
  public.flip_admin_cooldown_status(bigint) to service_role;
