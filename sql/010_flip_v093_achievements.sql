-- FLIP v0.9.3 — 30 achievements plus one fully concealed Hidden achievement.
-- All progress is derived from authoritative history; rewards are atomic and server-only.
create table if not exists public.flip_achievement_defs(
  code text primary key check(length(code) between 3 and 48),
  category text not null check(category in ('oneoff','staged','secret','hidden')),
  title text not null, description text not null,
  metric text not null, targets integer[] not null, rewards integer[] not null,
  badge text, symbol text not null default '✦',
  secret boolean not null default false,
  concealed boolean not null default false,
  sort_order integer not null unique,
  active boolean not null default true,
  constraint achievement_stages_valid check(
    cardinality(targets)=cardinality(rewards)
    and cardinality(targets) between 1 and 5)
);
create table if not exists public.flip_achievement_claims(
  telegram_id bigint not null references public.flip_players(telegram_id) on delete cascade,
  achievement_code text not null references public.flip_achievement_defs(code),
  stage integer not null check(stage between 1 and 5),
  rewarded_f integer not null check(rewarded_f between 0 and 1000),
  claimed_at timestamptz not null default now(),
  primary key(telegram_id,achievement_code,stage)
);
create index if not exists flip_achievement_claims_recent on public.flip_achievement_claims(telegram_id,claimed_at desc);
create index if not exists flip_ach_actions_lookup on public.flip_actions(telegram_id,action,created_at);
create index if not exists flip_ach_trade_sender on public.flip_trades(sender_id,status,completed_at);
create index if not exists flip_ach_trade_recipient on public.flip_trades(recipient_id,status,completed_at);
alter table public.flip_achievement_defs enable row level security;
alter table public.flip_achievement_claims enable row level security;
revoke all on public.flip_achievement_defs,public.flip_achievement_claims from public,anon,authenticated;
grant all on public.flip_achievement_defs,public.flip_achievement_claims to service_role;
insert into public.flip_achievement_defs(code,category,title,description,metric,targets,rewards,badge,symbol,secret,concealed,sort_order) values
 ('first_card','oneoff','Первый экспонат','Открой первую уникальную карточку.','unique_cards',ARRAY[1]::integer[],ARRAY[30]::integer[],null,'◈',false,false,1),
 ('shelf_five','oneoff','Своя полка','Собери 5 уникальных разновидностей.','unique_cards',ARRAY[5]::integer[],ARRAY[30]::integer[],null,'▣',false,false,2),
 ('archive_twentyfive','oneoff','Архив расширяется','Открой 25 уникальных разновидностей.','unique_cards',ARRAY[25]::integer[],ARRAY[75]::integer[],null,'▤',false,false,3),
 ('rare_first','oneoff','Первая редкость','Открой первую Rare-карточку.','rare_cards',ARRAY[1]::integer[],ARRAY[30]::integer[],null,'✧',false,false,4),
 ('epic_first','oneoff','Эпический момент','Открой первую Epic+ карточку.','epic_plus_cards',ARRAY[1]::integer[],ARRAY[75]::integer[],null,'✦',false,false,5),
 ('legendary_first','oneoff','В руках легенда','Открой Legendary или более редкую карточку.','legendary_plus_cards',ARRAY[1]::integer[],ARRAY[150]::integer[],'legendary','✷',false,false,6),
 ('mythic_first','oneoff','Красная аура','Открой свою первую Mythic-карточку.','mythic_cards',ARRAY[1]::integer[],ARRAY[150]::integer[],'mythic','◆',false,false,7),
 ('artist_five','oneoff','Верность артисту','Собери 5 разных карточек одного артиста.','artist_max',ARRAY[5]::integer[],ARRAY[75]::integer[],null,'♫',false,false,8),
 ('first_free','oneoff','Время открывать','Открой первый обычный бесплатный дроп.','free_drops',ARRAY[1]::integer[],ARRAY[30]::integer[],null,'↗',false,false,9),
 ('ten_free','oneoff','Ритм дропа','Открой 10 обычных бесплатных дропов.','free_drops',ARRAY[10]::integer[],ARRAY[75]::integer[],null,'⏱',false,false,10),
 ('first_pack','oneoff','Три за раз','Открой свой первый стандартный пак.','packs',ARRAY[1]::integer[],ARRAY[30]::integer[],null,'◈',false,false,11),
 ('ten_packs','oneoff','Запас коллекционера','Открой 10 стандартных паков.','packs',ARRAY[10]::integer[],ARRAY[75]::integer[],null,'▦',false,false,12),
 ('open_twentyfive','oneoff','Невозможно остановиться','Совершить 25 распаковок: дропов и паков.','total_opens',ARRAY[25]::integer[],ARRAY[75]::integer[],null,'✸',false,false,13),
 ('first_trade','oneoff','Первый обмен','Заверши первый обмен карточками.','trades',ARRAY[1]::integer[],ARRAY[30]::integer[],null,'⇄',false,false,14),
 ('five_trades','oneoff','На связи','Заверши 5 обменов с игроками.','trades',ARRAY[5]::integer[],ARRAY[75]::integer[],null,'↔',false,false,15),
 ('ten_trades','oneoff','Легенда рынка','Заверши 10 обменов.','trades',ARRAY[10]::integer[],ARRAY[150]::integer[],null,'◇',false,false,16),
 ('bundle_trade','oneoff','Комплектом','Заверши обмен с несколькими карточками хотя бы у одной стороны.','bundle_trades',ARRAY[1]::integer[],ARRAY[75]::integer[],null,'▥',false,false,17),
 ('first_steps','oneoff','Первые шаги','Достигни 2-го уровня.','level',ARRAY[2]::integer[],ARRAY[30]::integer[],null,'↑',false,false,18),
 ('week_control','oneoff','Неделя под контролем','Заверши первую семидневную серию активности.','streak_cycles',ARRAY[1]::integer[],ARRAY[75]::integer[],null,'◷',false,false,19),
 ('iron_discipline','oneoff','Железная дисциплина','Заверши 4 семидневных серии активности.','streak_cycles',ARRAY[4]::integer[],ARRAY[150]::integer[],'discipline','✹',false,false,20),
 ('collector','staged','Коллекционер','Открывай новые уникальные разновидности.','unique_cards',ARRAY[10,50,100,250,500]::integer[],ARRAY[30,30,75,75,150]::integer[],null,'◈',false,false,21),
 ('rarity_hunter','staged','Охотник за редкостями','Получай Epic и более редкие карточки.','epic_plus_cards',ARRAY[3,10,25,50,100]::integer[],ARRAY[30,30,75,75,150]::integer[],null,'✷',false,false,22),
 ('free_master','staged','Время открывать','Открывай обычные бесплатные дропы.','free_drops',ARRAY[10,50,150,300,600]::integer[],ARRAY[30,30,75,75,150]::integer[],null,'⏱',false,false,23),
 ('pack_master','staged','Мастер распаковки','Открывай стандартные паки.','packs',ARRAY[5,15,30,60,120]::integer[],ARRAY[30,30,75,75,150]::integer[],null,'▣',false,false,24),
 ('trade_master','staged','Мастер сделок','Завершай обмены с игроками.','trades',ARRAY[5,25,75,150,300]::integer[],ARRAY[30,30,75,75,150]::integer[],null,'⇄',false,false,25),
 ('task_master','staged','Мастер заданий','Получай награды за выполненные задания.','tasks_total',ARRAY[10,50,150,300,600]::integer[],ARRAY[30,30,75,75,150]::integer[],null,'☷',false,false,26),
 ('level_path','staged','Путь к вершине','Повышай свой уровень в FLIP.','level',ARRAY[10,25,50,100,200]::integer[],ARRAY[30,30,75,75,150]::integer[],null,'↑',false,false,27),
 ('lucky_ticket','secret','Счастливый билет','Выбей Legendary или выше из обычного бесплатного дропа.','lucky_free',ARRAY[1]::integer[],ARRAY[150]::integer[],'lucky','✧',true,false,28),
 ('absolute_jackpot','secret','Абсолютный джекпот','Получи сразу 3 Epic+ из одного пака.','jackpot_pack',ARRAY[1]::integer[],ARRAY[150]::integer[],'jackpot','✹',true,false,29),
 ('perfect_deal','secret','Идеальная сделка','Заверши обмен, в котором оба игрока получили новые для себя карточки.','perfect_trade',ARRAY[1]::integer[],ARRAY[75]::integer[],'deal','⇄',true,false,30),
 ('impossible','hidden','Невозможное возможно','Выбей Hidden из дропа или пака.','hidden_drop',ARRAY[1]::integer[],ARRAY[1000]::integer[],'hidden','✺',true,true,31)
on conflict(code) do nothing;

-- Compute only from trusted server records, never from data sent by the Mini App.
create or replace function public.flip_achievement_metric(p_telegram_id bigint,p_metric text)
returns integer language plpgsql stable security invoker set search_path = '' as $$
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
     and a.action in ('drop','pack');
 when 'packs' then
   select count(*)::integer into n from public.flip_actions a where a.telegram_id=p_telegram_id
     and a.action='pack';
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
     where a.telegram_id=p_telegram_id and a.action='pack'
       and (select count(*) from jsonb_array_elements_text(
         coalesce(a.result->'card_ids','[]'::jsonb)) item(card_id)
         join public.flip_cards c on c.id=item.card_id
         where c.rarity in ('epic','legendary','mythic','hidden'))>=3;
 when 'hidden_drop' then
   select count(*)::integer into n from public.flip_actions a
     where a.telegram_id=p_telegram_id
       and ((a.action='drop' and exists(select 1 from public.flip_cards c
             where c.id=a.result->>'card_id' and c.rarity='hidden'))
         or (a.action='pack' and exists(
             select 1 from jsonb_array_elements_text(
               coalesce(a.result->'card_ids','[]'::jsonb)) item(card_id)
               join public.flip_cards c on c.id=item.card_id and c.rarity='hidden')));
 else
   n:=0;
 end case;
 return coalesce(n,0);
end; $$;

create or replace function public.flip_achievement_snapshot(p_telegram_id bigint)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare a public.flip_achievement_defs%rowtype;
  progress_count integer;claimed_stages integer;next_stage integer;
  unlocked boolean;completed boolean;visible_count integer:=0;ready_count integer:=0;
  completed_count integer:=0;list_items jsonb:='[]'::jsonb; badges jsonb:='[]'::jsonb;
begin
 if not exists(select 1 from public.flip_players p where p.telegram_id=p_telegram_id) then
   return jsonb_build_object('items',list_items,'badges',badges,'total',0,
     'completed',0,'claimable',0);
 end if;
 for a in select * from public.flip_achievement_defs where active order by sort_order loop
   progress_count:=public.flip_achievement_metric(p_telegram_id,a.metric);
   select coalesce(max(c.stage),0) into claimed_stages
     from public.flip_achievement_claims c
     where c.telegram_id=p_telegram_id and c.achievement_code=a.code;
   unlocked:=progress_count>=a.targets[1] or claimed_stages>0;
   if a.concealed and not unlocked then continue; end if;
   completed:=claimed_stages>=cardinality(a.targets);
   next_stage:=least(claimed_stages+1,cardinality(a.targets));
   visible_count:=visible_count+1;
   if completed then completed_count:=completed_count+1;
   elsif progress_count>=a.targets[next_stage] then ready_count:=ready_count+1;end if;
   list_items:=list_items||jsonb_build_array(jsonb_build_object(
     'code',a.code,'category',a.category,'title',
       case when a.secret and not unlocked then 'ЗАСЕКРЕЧЕНО' else a.title end,
     'description',case when a.secret and not unlocked then 'Условие скрыто до выполнения'
       else a.description end,
     'symbol',case when a.secret and not unlocked then '?' else a.symbol end,
     'badge',case when a.secret and not unlocked then null else a.badge end,
     'secret',a.secret,'unlocked',unlocked,
     'progress',case when a.secret and not unlocked then 0 else progress_count end,
     'target',a.targets[next_stage], 'stage',next_stage,
     'claimed_stages',claimed_stages,'total_stages',cardinality(a.targets),
     'reward_f',a.rewards[next_stage],
     'claimable',not completed and progress_count>=a.targets[next_stage],
     'completed',completed));
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object(
   'code',d.code,'title',d.title,'symbol',d.symbol,
   'badge',d.badge,'claimed_at',c.claimed_at) order by c.claimed_at desc),'[]'::jsonb)
 into badges from public.flip_achievement_claims c
   join public.flip_achievement_defs d on d.code=c.achievement_code
   where c.telegram_id=p_telegram_id and d.badge is not null;
 return jsonb_build_object('items',list_items,'badges',badges,
   'total',visible_count,'completed',completed_count,'claimable',ready_count);
end; $$;

-- Serialise rewards on the player row. Stages must be claimed in order.
create or replace function public.flip_claim_achievement(
 p_telegram_id bigint,p_code text,p_stage integer)
returns jsonb language plpgsql volatile security invoker set search_path = '' as $$
declare p public.flip_players%rowtype;
 a public.flip_achievement_defs%rowtype;
 prior_stages integer;actual_progress integer;award_f integer;
begin
 if p_code is null or length(p_code)>48 or p_stage not between 1 and 5 then
   raise exception 'BAD_ACHIEVEMENT';end if;
 select * into p from public.flip_players where telegram_id=p_telegram_id for update;
 if not found then raise exception 'ACCOUNT_NOT_FOUND';end if;
 select * into a from public.flip_achievement_defs where code=p_code and active;
 if not found then raise exception 'BAD_ACHIEVEMENT';end if;
 select count(*)::integer into prior_stages from public.flip_achievement_claims c
   where c.telegram_id=p_telegram_id and c.achievement_code=p_code;
 if prior_stages>=cardinality(a.targets) then raise exception 'ACHIEVEMENT_ALREADY_CLAIMED';end if;
 if p_stage<>prior_stages+1 then raise exception 'ACHIEVEMENT_STAGE_ORDER';end if;
 actual_progress:=public.flip_achievement_metric(p_telegram_id,a.metric);
 if actual_progress<a.targets[p_stage] then raise exception 'ACHIEVEMENT_NOT_READY';end if;
 award_f:=a.rewards[p_stage];
 insert into public.flip_achievement_claims(telegram_id,achievement_code,stage,rewarded_f)
 values(p_telegram_id,p_code,p_stage,award_f);
 update public.flip_players set balance=balance+award_f,updated_at=now()
 where telegram_id=p_telegram_id;
 return jsonb_build_object('ok',true,'earned_f',award_f,
   'badge',a.badge,'title',a.title,
   'state',public.flip_snapshot(p_telegram_id),
   'achievements',public.flip_achievement_snapshot(p_telegram_id));
end; $$;
revoke all on function public.flip_achievement_metric(bigint,text),
  public.flip_achievement_snapshot(bigint),
  public.flip_claim_achievement(bigint,text,integer)
  from public,anon,authenticated;
grant execute on function public.flip_achievement_metric(bigint,text),
  public.flip_achievement_snapshot(bigint),
  public.flip_claim_achievement(bigint,text,integer) to service_role;
