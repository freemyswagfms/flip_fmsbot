-- FLIP v0.9.4.3 — owner-only cooldown controls for the authenticated admin panel.
-- The API must verify Telegram HMAC and FLIP_ADMIN_TELEGRAM_ID before calling these RPCs.
-- No cards, F, XP, pity, bonus packs, or task state are changed by a reset.
create table if not exists public.flip_admin_cooldown_resets (
  request_id uuid primary key,
  admin_telegram_id bigint not null references public.flip_players(telegram_id) on delete cascade,
  kind text not null check (kind in ('drop','pack')),
  prior_drop_ready_at timestamptz,
  prior_pack_day date,
  prior_packs_today integer,
  created_at timestamptz not null default now()
);
create index if not exists flip_admin_cooldown_resets_owner_recent
  on public.flip_admin_cooldown_resets(admin_telegram_id,created_at desc);

alter table public.flip_admin_cooldown_resets enable row level security;
revoke all on public.flip_admin_cooldown_resets from public,anon,authenticated;
grant select,insert on public.flip_admin_cooldown_resets to service_role;

create or replace function public.flip_admin_cooldown_status(p_admin_id bigint)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  p public.flip_players%rowtype;
  today_msk date:=(now() at time zone 'Europe/Moscow')::date;
  v_history jsonb:='[]'::jsonb;
begin
  select * into p from public.flip_players where telegram_id=p_admin_id;
  if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'kind',a.kind,'created_at',a.created_at,
    'prior_packs_today',a.prior_packs_today
  ) order by a.created_at desc),'[]'::jsonb) into v_history
  from (
    select kind,created_at,prior_packs_today
    from public.flip_admin_cooldown_resets
    where admin_telegram_id=p_admin_id
    order by created_at desc
    limit 10
  ) a;

  return jsonb_build_object(
    'drop_ready_at',p.drop_ready_at,
    'drop_ready',now()>=p.drop_ready_at or p.welcome_remaining>0,
    'packs_today',case when p.pack_day=today_msk then p.packs_today else 0 end,
    'packs_limit',10,
    'welcome_remaining',p.welcome_remaining,
    'history',v_history
  );
end; $$;

create or replace function public.flip_admin_reset_cooldown(
  p_admin_id bigint,p_kind text,p_request_id uuid
) returns jsonb
language plpgsql volatile security invoker set search_path = '' as $$
declare
  p public.flip_players%rowtype;
  previous public.flip_admin_cooldown_resets%rowtype;
  today_msk date:=(now() at time zone 'Europe/Moscow')::date;
  replay boolean:=false;
begin
  if p_admin_id is null or p_admin_id<=0 or p_request_id is null or
     p_kind is null or p_kind not in ('drop','pack') then
    raise exception 'BAD_ADMIN_COOLDOWN';
  end if;

  -- Same player lock as flip_open_drop and flip_buy_pack: no race with purchases.
  select * into p from public.flip_players
    where telegram_id=p_admin_id for update;
  if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;

  select * into previous from public.flip_admin_cooldown_resets
    where request_id=p_request_id;
  if found then
    if previous.admin_telegram_id<>p_admin_id or previous.kind<>p_kind then
      raise exception 'DUPLICATE_ADMIN_REQUEST';
    end if;
    replay:=true;
  else
    insert into public.flip_admin_cooldown_resets(
      request_id,admin_telegram_id,kind,
      prior_drop_ready_at,prior_pack_day,prior_packs_today
    ) values (
      p_request_id,p_admin_id,p_kind,
      p.drop_ready_at,p.pack_day,p.packs_today
    );
    if p_kind='drop' then
      update public.flip_players
        set drop_ready_at=now()-interval '1 second',updated_at=now()
        where telegram_id=p_admin_id;
    else
      update public.flip_players
        set pack_day=today_msk,packs_today=0,updated_at=now()
        where telegram_id=p_admin_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,'kind',p_kind,'already_applied',replay,
    'cooldowns',public.flip_admin_cooldown_status(p_admin_id)
  );
end; $$;

revoke all on function public.flip_admin_cooldown_status(bigint),
  public.flip_admin_reset_cooldown(bigint,text,uuid) from public,anon,authenticated;
grant execute on function public.flip_admin_cooldown_status(bigint),
  public.flip_admin_reset_cooldown(bigint,text,uuid) to service_role;
