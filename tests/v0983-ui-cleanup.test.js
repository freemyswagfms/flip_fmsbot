import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const evaluate=(path)=>{const window={};runInNewContext(read(path),{window,Date,Map,Set,Number,Object,JSON,Intl});return window;};

test('Catalog counts are static equal-weight facts, not clickable filter tabs',()=>{
 const app=read('src/scripts/app.js'),styles=read('src/styles/collection.css');
 const catalog=app.slice(app.indexOf('function catalogView(){'),app.indexOf('function trades(){'));
 assert.match(catalog,/class="chips catalog-stats"/);
 assert.match(catalog,/class="catalog-stat"/);
 assert.doesNotMatch(catalog,/class="chip active"/);
 assert.doesNotMatch(catalog,/data-catalog-tab|data-catalog-filter/);
 assert.match(styles,/\.catalog-stats \.catalog-stat\{/);
 assert.match(styles,/cursor:default/);
 assert.match(catalog,/data-catalog-rarity/);
});
test('Store only explains public odds, pack guarantee and reset time',()=>{
 const store=evaluate('src/scripts/store.js').FLIPStore;
 const html=store.page({state:{balance:600},live:true,shop:{history:[],packs:[],packs_today:0,daily_limit:10}});
 for(const term of ['65%','25%','8%','1.8%','0.2%','Rare+','00:00 МСК','≥ 1 RARE+','ВЕРОЯТНОСТИ']){
   assert.ok(html.includes(term),term);
 }
 for(const term of ['Hidden','Pity','pity','БЕЗ PITY','Гарантия может менять',
  'сохранены на сервере','Цена списывается только после']){
  assert.ok(!html.includes(term),'Store leaked '+term);
 }
 assert.match(html,/НАБОРЫ/);
 assert.match(html,/ИСТОРИЯ/);
 assert.match(html,/ТЕМАТИЧЕСКИЕ НАБОРЫ/);
});
test('Profile only shows troubleshooting while offline and admin ID only for admins',()=>{
 const app=read('src/scripts/app.js');
 const prof=app.slice(app.indexOf('function profile(){'),app.indexOf('function tasks(){'));
 assert.doesNotMatch(prof,/SERVER CONNECTED|Локальные демо-награды не перенесены|ПОДКЛЮЧЕНИЕ К TELEGRAM/);
 assert.match(prof,/НЕТ СОЕДИНЕНИЯ|СБРОСИТЬ ДЕМО/);
 assert.match(read('src/scripts/profile-cosmetics.js'),/СЛЕДУЮЩИЙ УРОВЕНЬ · \+30 F/);
 assert.match(app,/const idInfo=live\(\)&&bridge\?\.isAdmin===true/);
});
test('Achievements conceal unrevealed hidden item and keep functional claims',()=>{
 const achievements=evaluate('src/scripts/achievements.js').FLIPAchievements;
 const example={code:'one',category:'oneoff',title:'Первые шаги',description:'Уровень 5',
  symbol:'✦',completed:false,claimable:true,secret:false,unlocked:true,progress:5,target:5,
  stage:1,total_stages:1,reward_f:30,claimed_stages:0};
 const hidden={...example,code:'impossible',category:'hidden',title:'Невозможное возможно',
  description:'Получить Hidden',claimable:false,secret:true,unlocked:false};
 const hub={items:[example,hidden],total:31,completed:0,claimable:1,badges:[]};
 const initial=achievements.page(hub,{online:true});
 assert.match(initial,/Первые шаги/);
 assert.match(initial,/data-achievement-claim="one"/);
 assert.doesNotMatch(initial,/Невозможное возможно|Получить Hidden|Особое достижение за Hidden/);
 assert.doesNotMatch(initial,/SECRET \/ FLIP|FLIP ACHIEVEMENT|Условие откроется при выполнении|НАВСЕГДА/);
 assert.match(achievements.page({...hub,items:[example,{...hidden,unlocked:true}]},{online:true}),/Невозможное возможно/);
});
test('Trades preserve rules and show concise live sync without internal errors',()=>{
 const t=read('src/scripts/trades.js');
 assert.match(t,/flip-trade-rules/);
 assert.match(t,/24 часа/);
 assert.match(t,/ПРАВИЛА/);
 assert.match(t,/data-trade-inspect|ПРОВЕРИТЬ УСЛОВИЯ/);
 assert.doesNotMatch(t,/СИНХРОНИЗИРОВАНО|~45 С|FLIP \/ PLAYER|Повтор безопасен с теми же параметрами/);
 assert.match(t,/TRADE_CARD_UNAVAILABLE:'Карточка недоступна/);
 assert.match(t,/if\(s\.syncError\)return/);
 assert.match(t,/АВТО · 15 С/);
});
test('Stats, rating and history are concise without revealing secret CP value',()=>{
 const activity=evaluate('src/scripts/activity.js').FLIPActivity;
 assert.match(activity.notifications({notifications:[],rewards_ready:0},{online:true}),/Пока нет уведомлений/);
 assert.doesNotMatch(activity.profileStats({drops:1,packs:2},{online:true}),/PLAYER DATA|LIVE/);
 assert.doesNotMatch(activity.activityPage({activity:[],stats:{}},{online:true}),/последние 60 действий/);
 const leaderboard=read('src/scripts/leaderboard.js');
 assert.match(leaderboard,/flip-cp-rules/);
 assert.doesNotMatch(leaderboard,/Hidden — 250 CP|Нажми на игрока, чтобы/);
 const showcase=read('src/scripts/showcase.js');
 assert.doesNotMatch(showcase,/Эффекты редкостей сохраняются|Смотри любимые карточки и особые значки/);
 assert.match(showcase,/flip-showcase-controls|flip-showcase-grid/);
});
test('Pack and delivery result overlays preserve cards but no repetitive technical HUD',()=>{
 const pack=read('src/scripts/pack-reveal.js'),gift=read('src/scripts/delivery-reveal.js');
 assert.match(pack,/flip-pack-cards|flip-pack-found-titles|data-flip-pack-skip/);
 assert.doesNotMatch(pack,/OPEN YOUR COLLECTION|PACK 03 \/ 03|REVEALING YOUR CARDS|Карточки уже сохранены/);
 assert.match(gift,/flip-delivery-stage|flip-delivery-meta|data-delivery-next/);
 assert.doesNotMatch(gift,/СОХРАНЯЕМ ПРОСМОТР|Особенный подарок для твоей коллекции|Игрок отправил тебе новую карточку/);
 assert.match(gift,/status\.classList\?\.add\?\.\('is-working'\)/);
 assert.match(read('src/styles/delivery-reveal.css'),/flip-delivery-loading\.is-working/);
});
test('Release is v0.9.8.3 without modifying admin, backend mechanics or previous roulette',()=>{
 const html=read('index.html'),pkg=JSON.parse(read('package.json'));
 assert.ok(pkg.version.localeCompare('0.9.8.3',undefined,{numeric:true})>=0);
 for(const file of ['src/scripts/app.js','src/scripts/trades.js','src/scripts/store.js',
 'src/scripts/achievements.js','src/scripts/showcase.js','src/scripts/leaderboard.js',
 'src/scripts/activity.js','src/scripts/pack-reveal.js','src/scripts/delivery-reveal.js',
 'src/styles/collection.css','src/styles/social.css','src/styles/delivery-reveal.css']){
  assert.ok(html.includes(file+'?v='+(file==='src/scripts/leaderboard.js'?'0.9.13.3':['src/scripts/app.js','src/scripts/showcase.js','src/scripts/trades.js','src/scripts/achievements.js','src/scripts/pack-reveal.js'].includes(file)?pkg.version:['src/scripts/store.js','src/scripts/activity.js'].includes(file)?'0.9.8.7':['src/styles/social.css'].includes(file)?'0.9.8.5':'0.9.8.3')),file);
 }
 assert.match(html,/src\/scripts\/reveal\.js\?v=0\.9\.8\.1/);
 assert.match(html,/src\/scripts\/admin\.js\?v=0\.9\.6\.4/);
 assert.doesNotMatch(html,/FLIP v0\.9\.8\.3 · TELEGRAM GAME/);
 assert.ok(read('api/flip.js').includes("version:'"+pkg.version+"'"));
});
