-- FLIP v0.8.4 — searchable admin catalog and audited XP/F grants.
-- Apply to Supabase BEFORE deploying v0.8.4 API. Existing v0.8.3 remains compatible.
create table if not exists public.flip_admin_rewards (
  request_id uuid primary key,
  admin_telegram_id bigint not null,
  recipient_telegram_id bigint not null references public.flip_players(telegram_id),
  kind text not null check (kind in ('xp','f')),
  amount integer not null check (amount between 1 and 1000000),
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists flip_admin_rewards_recipient_idx
  on public.flip_admin_rewards(recipient_telegram_id, created_at desc);
alter table public.flip_admin_rewards enable row level security;
revoke all on public.flip_admin_rewards from public,anon,authenticated;
grant select,insert on public.flip_admin_rewards to service_role;

create or replace function public.flip_admin_search_cards(p_query text default '', p_limit integer default 50)
returns jsonb language sql stable security definer set search_path to ''
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'rarity',t.rarity,'label',t.label) order by t.artist_name,t.release_title,t.rarity),'[]'::jsonb)
  from (
    select c.id,c.rarity,
      coalesce(a.name,'SECRET') as artist_name,
      coalesce(r.title,'HIDDEN') as release_title,
      coalesce(a.name,'SECRET')||' — '||coalesce(r.title,'HIDDEN')||' — '||upper(c.rarity) as label
    from public.flip_cards c
    left join public.flip_artists a on a.id=c.artist_id
    left join public.flip_releases r on r.id=c.release_id and r.artist_id=c.artist_id
    where c.active and (
      length(trim(coalesce(p_query,'')))=0
      or c.id ilike '%'||left(trim(p_query),80)||'%'
      or coalesce(a.name,'') ilike '%'||left(trim(p_query),80)||'%'
      or coalesce(r.title,'') ilike '%'||left(trim(p_query),80)||'%'
      or c.rarity ilike '%'||left(trim(p_query),80)||'%'
    )
    order by artist_name,release_title,c.rarity
    limit least(greatest(coalesce(p_limit,50),1),50)
  ) t;
$function$;

create or replace function public.flip_admin_search_rewards(p_limit integer default 30)
returns jsonb language sql stable security definer set search_path to ''
as $function$
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb)
  from (
    select request_id::text,admin_telegram_id::text,recipient_telegram_id::text,
      kind,amount,note,created_at
    from public.flip_admin_rewards order by created_at desc
    limit least(greatest(coalesce(p_limit,30),1),50)
  ) t;
$function$;

create or replace function public.flip_admin_grant_resource(
  p_admin_id bigint,p_recipient_id bigint,p_kind text,p_amount integer,p_note text,p_request_id uuid
)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  v_player public.flip_players%rowtype;
  v_previous public.flip_admin_rewards%rowtype;
  v_xp integer;
  v_level integer;
  v_balance integer;
  v_bonus_packs integer;
  v_threshold integer;
begin
  if p_admin_id is null or p_admin_id<=0 or p_recipient_id is null or p_recipient_id<=0
    or p_kind is null or p_kind not in ('xp','f')
    or p_amount is null or p_amount<1 or p_amount>1000000
    or p_note is null or length(p_note)>200
    or p_request_id is null then
    raise exception 'BAD_ADMIN_REWARD';
  end if;

  -- This RPC must be callable ONLY by service_role; the server validates Telegram HMAC
  -- and FLIP_ADMIN_TELEGRAM_ID before providing p_admin_id.
  select * into v_player from public.flip_players where telegram_id=p_recipient_id for update;
  if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;

  select * into v_previous from public.flip_admin_rewards where request_id=p_request_id;
  if found then
    if v_previous.admin_telegram_id<>p_admin_id or v_previous.recipient_telegram_id<>p_recipient_id
      or v_previous.kind<>p_kind or v_previous.amount<>p_amount or v_previous.note<>p_note
    then raise exception 'DUPLICATE_ADMIN_REQUEST'; end if;
    return jsonb_build_object('ok',true,'replayed',true,'kind',p_kind,'amount',p_amount,
      'recipient_id',p_recipient_id::text,'level',v_player.level,'xp',v_player.xp,'balance',v_player.balance);
  end if;

  v_balance:=v_player.balance;
  v_xp:=v_player.xp;
  v_level:=v_player.level;
  v_bonus_packs:=v_player.bonus_packs;

  if p_kind='f' then
    if v_balance::bigint+p_amount>2147483647 then raise exception 'ADMIN_REWARD_LIMIT'; end if;
    v_balance:=v_balance+p_amount;
  else
    if v_xp::bigint+p_amount>2147483647 then raise exception 'ADMIN_REWARD_LIMIT'; end if;
    v_xp:=v_xp+p_amount;
    loop
      exit when v_xp<100+50*(v_level-1);
      v_threshold:=100+50*(v_level-1);
      v_xp:=v_xp-v_threshold;
      v_level:=v_level+1;
      if v_balance>2147483617 then raise exception 'ADMIN_REWARD_LIMIT'; end if;
      v_balance:=v_balance+30;
      if mod(v_level,10)=0 then
        v_bonus_packs:=v_bonus_packs+1;
      elsif mod(v_level,5)=0 then
        if v_balance>2147483597 then raise exception 'ADMIN_REWARD_LIMIT'; end if;
        v_balance:=v_balance+50;
      end if;
    end loop;
  end if;

  insert into public.flip_admin_rewards(request_id,admin_telegram_id,recipient_telegram_id,kind,amount,note)
    values(p_request_id,p_admin_id,p_recipient_id,p_kind,p_amount,p_note);
  update public.flip_players set xp=v_xp,level=v_level,balance=v_balance,
    bonus_packs=v_bonus_packs,updated_at=now()
    where telegram_id=p_recipient_id;
  return jsonb_build_object('ok',true,'replayed',false,'kind',p_kind,'amount',p_amount,
    'recipient_id',p_recipient_id::text,'level',v_level,'xp',v_xp,'balance',v_balance);
end;
$function$;

revoke all on function public.flip_admin_search_cards(text,integer) from public,anon,authenticated;
revoke all on function public.flip_admin_search_rewards(integer) from public,anon,authenticated;
revoke all on function public.flip_admin_grant_resource(bigint,bigint,text,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.flip_admin_search_cards(text,integer) to service_role;
grant execute on function public.flip_admin_search_rewards(integer) to service_role;
grant execute on function public.flip_admin_grant_resource(bigint,bigint,text,integer,text,uuid) to service_role;
