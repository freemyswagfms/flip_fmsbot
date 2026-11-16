-- FLIP v0.9.5 — themed, non-artist packs and server-owned store/history.
-- Existing standard pack (200 F), drop rates, Pity and creator overrides remain unchanged.
-- Themes are time-based: Archive (<2020) and New Era (2020+).
-- Both spend the SAME shared 10-pack/day quota as standard packs.
alter table public.flip_actions drop constraint if exists flip_actions_action_check;
alter table public.flip_actions add constraint flip_actions_action_check
  check(action in ('drop','pack','theme_pack'));

create or replace function public.flip_buy_theme_pack(
 p_telegram_id bigint,p_request_id uuid,p_theme text
) returns jsonb
language plpgsql security invoker set search_path = '' as $theme_pack$
declare
 p public.flip_players%rowtype;
 v_old public.flip_actions%rowtype;
 today_msk date:=(now() at time zone 'Europe/Moscow')::date;
 v_cards text[]:='{}';
 v_card text;
 v_rarity text;
 v_rare boolean:=false;
 v_xp integer;
 v_level integer;
 v_balance integer;
 v_tasks integer[];
 v_count integer;
 v_first boolean;
 v_bonus_packs integer;
 v_result jsonb;
 v_eligible integer;
 i integer;j integer;v_tries integer;
begin
 if p_theme is null or p_theme not in ('archive','new-era') then
   raise exception 'UNKNOWN_PACK';
 end if;
 if p_request_id is null then raise exception 'BAD_REQUEST';end if;
 select * into p from public.flip_players
   where telegram_id=p_telegram_id for update;
 if not found then raise exception 'ACCOUNT_NOT_FOUND';end if;
 select * into v_old from public.flip_actions
   where telegram_id=p_telegram_id and request_id=p_request_id;
 if found then
   if v_old.action<>'theme_pack' or v_old.result->>'pack_type'<>p_theme then
     raise exception 'DUPLICATE_REQUEST_ACTION';
   end if;
   return jsonb_set(v_old.result,'{state}',public.flip_snapshot(p_telegram_id),true);
 end if;

 v_count:=case when p.pack_day is distinct from today_msk then 0 else p.packs_today end;
 if v_count>=10 then raise exception 'DAILY_PACK_LIMIT';end if;
 if p.balance<250 then raise exception 'INSUFFICIENT_FUNDS';end if;
 select count(*)::integer into v_eligible
   from public.flip_releases r join public.flip_artists a
     on a.id=r.artist_id and a.active
   where r.active and (
     (p_theme='archive' and r.release_year<2020) or
     (p_theme='new-era' and r.release_year>=2020))
     and exists(select 1 from public.flip_cards c where c.active
       and c.artist_id=r.artist_id and c.release_id=r.id and c.rarity='rare')
     and exists(select 1 from public.flip_cards c where c.active
       and c.artist_id=r.artist_id and c.release_id=r.id and c.rarity='common');
 if v_eligible<3 then raise exception 'THEME_UNAVAILABLE';end if;

 for i in 1..3 loop
   v_tries:=0;
   loop
     v_tries:=v_tries+1;
     if v_tries>250 then raise exception 'PACK_GENERATION_FAILED';end if;
     v_rarity:=public.flip_roll_rarity(0,false);
     if v_rarity='hidden' then
       -- Global secret card remains available in both themes at the original odds.
       v_card:='demo/hidden/archive-001';
     else
       select c.id into v_card
       from public.flip_cards c
         join public.flip_releases r on r.artist_id=c.artist_id and r.id=c.release_id
         join public.flip_artists a on a.id=c.artist_id
       where c.active and r.active and a.active and c.rarity=v_rarity
         and ((p_theme='archive' and r.release_year<2020) or
              (p_theme='new-era' and r.release_year>=2020))
       order by public.flip_random() limit 1;
     end if;
     exit when v_card is not null and not(v_card=any(v_cards));
   end loop;
   v_cards:=array_append(v_cards,v_card);
   if v_rarity<>'common' then v_rare:=true;end if;
 end loop;

 if not v_rare then
   j:=floor(public.flip_random()*3)::integer+1;
   v_tries:=0;
   loop
     v_tries:=v_tries+1;
     if v_tries>250 then raise exception 'PACK_GENERATION_FAILED';end if;
     v_rarity:=public.flip_roll_rarity(0,true);
     select c.id into v_card
     from public.flip_cards c
       join public.flip_releases r on r.artist_id=c.artist_id and r.id=c.release_id
       join public.flip_artists a on a.id=c.artist_id
     where c.active and r.active and a.active and c.rarity=v_rarity
       and ((p_theme='archive' and r.release_year<2020) or
            (p_theme='new-era' and r.release_year>=2020))
     order by public.flip_random() limit 1;
     exit when v_card is not null and not(v_card=any(v_cards));
   end loop;
   v_cards[j]:=v_card;
 end if;

 v_balance:=p.balance-250;
 v_xp:=p.xp+30;v_level:=p.level;v_bonus_packs:=p.bonus_packs;
 v_tasks:=case when p.daily_day is distinct from today_msk
   then '{}'::integer[] else p.claimed_tasks end;
 for i in 1..3 loop
   v_first:=not exists(select 1 from public.flip_discoveries
     where telegram_id=p_telegram_id and card_id=v_cards[i]);
   insert into public.flip_inventory
      (telegram_id,card_id,quantity,ranked_quantity,test_quantity)
     values(p_telegram_id,v_cards[i],1,1,0)
     on conflict(telegram_id,card_id) do update
       set quantity=public.flip_inventory.quantity+1,
           ranked_quantity=public.flip_inventory.ranked_quantity+1;
   insert into public.flip_discoveries(telegram_id,card_id)
     values(p_telegram_id,v_cards[i]) on conflict do nothing;
   if v_first then v_xp:=v_xp+10;end if;
 end loop;

 while v_xp>=100+50*(v_level-1) loop
   v_xp:=v_xp-(100+50*(v_level-1));
   v_level:=v_level+1;v_balance:=v_balance+30;
   if mod(v_level,10)=0 then v_bonus_packs:=v_bonus_packs+1;
   elsif mod(v_level,5)=0 then v_balance:=v_balance+50;end if;
 end loop;

 update public.flip_players set balance=v_balance,xp=v_xp,level=v_level,
   daily_day=today_msk,claimed_tasks=v_tasks,pack_day=today_msk,
   packs_today=v_count+1,bonus_packs=v_bonus_packs,updated_at=now()
   where telegram_id=p_telegram_id;
 v_result:=jsonb_build_object('action','theme_pack','pack_type',p_theme,
   'price',250,'card_ids',to_jsonb(v_cards),
   'state',public.flip_snapshot(p_telegram_id));
 insert into public.flip_actions(telegram_id,request_id,action,result)
   values(p_telegram_id,p_request_id,'theme_pack',v_result);
 return v_result;
end; $theme_pack$;

-- An authenticated personal snapshot: excludes other players, private IDs,
-- request payload state, and any administrator-only data.
create or replace function public.flip_shop_snapshot(p_telegram_id bigint)
returns jsonb language plpgsql stable security invoker set search_path = '' as $shop$
declare
 p public.flip_players%rowtype;
 archive_count integer;era_count integer;
 archive_previews jsonb:='[]'::jsonb;
 era_previews jsonb:='[]'::jsonb;
 purchases jsonb:='[]'::jsonb;
 today_msk date:=(now() at time zone 'Europe/Moscow')::date;
begin
 select * into p from public.flip_players
   where telegram_id=p_telegram_id;
 if not found then raise exception 'ACCOUNT_NOT_FOUND';end if;

 select count(*)::integer into archive_count from public.flip_releases r
   join public.flip_artists a on a.id=r.artist_id and a.active
   where r.active and r.release_year<2020
     and exists(select 1 from public.flip_cards c where c.active and
       c.artist_id=r.artist_id and c.release_id=r.id and c.rarity='rare');
 select count(*)::integer into era_count from public.flip_releases r
   join public.flip_artists a on a.id=r.artist_id and a.active
   where r.active and r.release_year>=2020
     and exists(select 1 from public.flip_cards c where c.active and
       c.artist_id=r.artist_id and c.release_id=r.id and c.rarity='rare');

 select coalesce(jsonb_agg(x.id),'[]'::jsonb) into archive_previews from (
   select c.id from public.flip_cards c join public.flip_releases r
     on r.artist_id=c.artist_id and r.id=c.release_id
     join public.flip_artists a on a.id=c.artist_id and a.active
   where c.active and r.active and r.release_year<2020 and c.rarity='epic'
   order by r.release_year desc,c.id limit 3
 ) x;
 select coalesce(jsonb_agg(x.id),'[]'::jsonb) into era_previews from (
   select c.id from public.flip_cards c join public.flip_releases r
     on r.artist_id=c.artist_id and r.id=c.release_id
     join public.flip_artists a on a.id=c.artist_id and a.active
   where c.active and r.active and r.release_year>=2020 and c.rarity='epic'
   order by r.release_year desc,c.id limit 3
 ) x;

 select coalesce(jsonb_agg(jsonb_build_object(
     'id',a.request_id,'date',a.created_at,
     'pack_type',case when a.action='pack' then 'standard'
       else a.result->>'pack_type' end,
     'price',case when a.action='pack' then 200 else 250 end,
     'card_ids',coalesce(a.result->'card_ids','[]'::jsonb)
   ) order by a.created_at desc,a.request_id desc),'[]'::jsonb)
 into purchases from (
   select request_id,created_at,action,result
   from public.flip_actions where telegram_id=p_telegram_id
     and action in ('pack','theme_pack')
   order by created_at desc,request_id desc limit 40
 ) a;

 return jsonb_build_object(
   'packs',jsonb_build_array(
     jsonb_build_object('id','standard','name','STANDARD PACK',
       'description','Любые активные релизы','price',200,
       'available',true,'collection_size',null,'previews','[]'::jsonb),
     jsonb_build_object('id','archive','name','ARCHIVE PACK',
       'description','Релизы до 2020 года','price',250,
       'available',archive_count>=3,'collection_size',archive_count,
       'previews',archive_previews),
     jsonb_build_object('id','new-era','name','NEW ERA PACK',
       'description','Релизы с 2020 года','price',250,
       'available',era_count>=3,'collection_size',era_count,
       'previews',era_previews)
   ),
   'guarantee','rare_plus','cards_per_pack',3,
   'odds',jsonb_build_object('common',65,'rare',25,'epic',8,
     'legendary',1.8,'mythic',0.2),
   'packs_today',case when p.pack_day=today_msk then p.packs_today else 0 end,
   'daily_limit',10,
   'unlimited',coalesce((select m.unlimited_packs from public.flip_admin_play_modes m
     where m.telegram_id=p_telegram_id),false),
   'history',purchases
 );
end; $shop$;

revoke all on function public.flip_buy_theme_pack(bigint,uuid,text),
 public.flip_shop_snapshot(bigint) from public,anon,authenticated;
grant execute on function public.flip_buy_theme_pack(bigint,uuid,text),
 public.flip_shop_snapshot(bigint) to service_role;

-- Every activity metric that counts packs must count the new shop pack too.

-- Compatible pack progress for flip_metric_progress(bigint,text,text)
CREATE OR REPLACE FUNCTION public.flip_metric_progress(p_telegram_id bigint, p_scope text, p_metric text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
     when p_metric='packs' then case when a.action in ('pack','theme_pack') then 1 else 0 end
     when a.action='drop' then 1
     when a.action in ('pack','theme_pack') then jsonb_array_length(coalesce(a.result->'card_ids','[]'::jsonb))
     else 0 end),0)::integer into v_result
   from public.flip_actions a where a.telegram_id=p_telegram_id and a.created_at>=v_from and a.created_at<v_to;
 end if;
 return coalesce(v_result,0);
end; $function$
;
-- Compatible pack progress for flip_task_progress(bigint,text,integer)
CREATE OR REPLACE FUNCTION public.flip_task_progress(p_telegram_id bigint, p_scope text, p_slot integer)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
     and a.action in ('pack','theme_pack') and a.created_at>=period_from and a.created_at<period_until;
 end if;
 return coalesce(n,0);
end; $function$
;
-- Compatible pack progress for flip_achievement_metric(bigint,text)
CREATE OR REPLACE FUNCTION public.flip_achievement_metric(p_telegram_id bigint, p_metric text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare n integer:=0;
begin
 case p_metric
 when 'level' then
   select coalesce(level,0) into n from public.flip_players where telegram_id=p_telegram_id;
 when 'streak_cycles' then
   select coalesce(streak_cycles,0) into n from public.flip_players where telegram_id=p_telegram_id;
 when 'unique_cards' then
   select count(*)::integer into n from public.flip_discoveries d where d.telegram_id=p_telegram_id;
 when 'rare_cards','epic_plus_cards','legendary_plus_cards','mythic_cards' then
   select count(*)::integer into n from public.flip_discoveries d
     join public.flip_cards c on c.id=d.card_id
     where d.telegram_id=p_telegram_id and (
       (p_metric='rare_cards' and c.rarity='rare') or
       (p_metric='epic_plus_cards' and c.rarity in ('epic','legendary','mythic','hidden')) or
       (p_metric='legendary_plus_cards' and c.rarity in ('legendary','mythic','hidden')) or
       (p_metric='mythic_cards' and c.rarity='mythic'));
 when 'artist_max' then
   select coalesce(max(quantity),0)::integer into n from (
     select count(*) quantity from public.flip_discoveries d
       join public.flip_cards c on c.id=d.card_id
       where d.telegram_id=p_telegram_id group by c.artist_id
   ) grouped;
 when 'free_drops' then
   select count(*)::integer into n from public.flip_actions a where a.telegram_id=p_telegram_id
     and a.action='drop' and a.result->>'welcome'='false';
 when 'total_opens' then
   select count(*)::integer into n from public.flip_actions a where a.telegram_id=p_telegram_id
     and a.action in ('drop','pack','theme_pack');
 when 'packs' then
   select count(*)::integer into n from public.flip_actions a where a.telegram_id=p_telegram_id
     and a.action in ('pack','theme_pack');
 when 'trades','bundle_trades','perfect_trade' then
   select count(*)::integer into n from public.flip_trades t where t.status='accepted'
     and (t.sender_id=p_telegram_id or t.recipient_id=p_telegram_id)
     and (p_metric='trades' or
       (p_metric='bundle_trades' and
        (cardinality(coalesce(t.offer_cards,array[t.offer_card_id]))>1 or
         cardinality(coalesce(t.want_cards,array[t.want_card_id]))>1))
       or
       (p_metric='perfect_trade' and t.completed_at is not null and
         exists(select 1 from public.flip_discoveries d
           where d.telegram_id=t.sender_id and d.first_found_at=t.completed_at
             and d.card_id=any(coalesce(t.want_cards,array[t.want_card_id])))
         and exists(select 1 from public.flip_discoveries d
           where d.telegram_id=t.recipient_id and d.first_found_at=t.completed_at
             and d.card_id=any(coalesce(t.offer_cards,array[t.offer_card_id])))));
 when 'tasks_total' then
   select count(*)::integer into n from public.flip_task_claims c where c.telegram_id=p_telegram_id;
 when 'lucky_free' then
   select count(*)::integer into n from public.flip_actions a
      join public.flip_cards c on c.id=a.result->>'card_id'
     where a.telegram_id=p_telegram_id and a.action='drop'
       and a.result->>'welcome'='false' and c.rarity in ('legendary','mythic','hidden');
 when 'jackpot_pack' then
   select count(*)::integer into n from public.flip_actions a
     where a.telegram_id=p_telegram_id and a.action in ('pack','theme_pack')
       and (select count(*) from jsonb_array_elements_text(
         coalesce(a.result->'card_ids','[]'::jsonb)) item(card_id)
         join public.flip_cards c on c.id=item.card_id
         where c.rarity in ('epic','legendary','mythic','hidden'))>=3;
 when 'hidden_drop' then
   select count(*)::integer into n from public.flip_actions a
     where a.telegram_id=p_telegram_id
       and ((a.action='drop' and exists(select 1 from public.flip_cards c
             where c.id=a.result->>'card_id' and c.rarity='hidden'))
         or (a.action in ('pack','theme_pack') and exists(
             select 1 from jsonb_array_elements_text(
               coalesce(a.result->'card_ids','[]'::jsonb)) item(card_id)
               join public.flip_cards c on c.id=item.card_id and c.rarity='hidden')));
 else
   n:=0;
 end case;
 return coalesce(n,0);
end; $function$
;
