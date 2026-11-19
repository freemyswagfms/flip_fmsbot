import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function ui(){
 const window={FLIPCatalog:{getCard:()=>({title:'MUSIC',artist:'Playboi Carti'})}};
 runInNewContext(read('src/scripts/activity.js'),{window,Date,Intl,Number});
 return window.FLIPActivity;
}
const id='12345678-1234-4234-8234-123456789abc';
const events=[
 {id:11,kind:'trade_offer',read:false,created_at:'2026-11-15T18:00:00Z',
   partner_name:'@friend'},
 {id:12,kind:'gift_received',read:false,created_at:'2026-11-15T17:00:00Z',
   partner_name:'@sponsor',details:{card_id:'carti/music/rare'}},
 {id:13,kind:'achievement_claim',read:true,created_at:'2026-11-15T16:00:00Z',
   details:{stage:2,reward_f:30}},
 {id:14,kind:'pack',read:true,created_at:'2026-11-15T15:00:00Z',details:{}}
];
test('Inbox groups unread before older events and uses distinct visual tones',()=>{
 const html=ui().notifications({notifications:events,unread_count:2,rewards_ready:0},{online:true});
 assert.ok(html.indexOf('НОВЫЕ')<html.indexOf('РАНЕЕ'));
 assert.ok(html.indexOf('data-event-read="11"')<html.indexOf('data-event-read="13"'));
 assert.match(html,/НОВЫХ · 2/);
 for(const tone of ['trade','gift','achievement','collection'])
  assert.match(html,new RegExp('flip-event--'+tone));
 assert.equal((html.match(/class="flip-event flip-event--/g)||[]).length,4);
 assert.equal((html.match(/class="flip-notif-new"/g)||[]).length,2);
 assert.match(html,/data-event-read-all/);
 assert.match(html,/ВСЯ АКТИВНОСТЬ/);
});
test('A notification is one accessible tap target; event ID and route stay intact',()=>{
 const html=ui().notifications({notifications:[events[0]]},{online:true});
 assert.match(html,/<button type="button" class="flip-event flip-event--trade is-unread flip-notif-item"/);
 assert.match(html,/data-event-route="trades"/);
 assert.match(html,/data-event-read="11"/);
 assert.match(html,/aria-label="Открыть: Новое предложение обмена"/);
 assert.doesNotMatch(html,/class="flip-event-open"[^>]*><button/);
 assert.match(html,/class="flip-event-open" aria-hidden="true">↗<\/span>/);
 assert.match(read('src/scripts/app.js'),/markNotification\(id,route\)/);
});
test('Inbox safely escapes other players names and handles empty, offline and reward states',()=>{
 const html=ui().notifications({notifications:[{...events[0],partner_name:'<script>pwn</script>'}],
   rewards_ready:3},{online:true});
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&lt;script&gt;pwn&lt;\/script&gt;/);
 assert.match(html,/data-event-route="achievements"/);
 assert.match(html,/3 наград ждут в достижениях/);
 assert.match(ui().notifications({notifications:[],rewards_ready:0},{online:true}),/Пока нет уведомлений/);
 assert.match(ui().notifications(null,{online:false}),/Открой FLIP через Telegram/);
 assert.match(ui().notifications(null,{online:true,loading:true}),/Загружаем уведомления/);
 const readHtml=ui().notifications({notifications:[{...events[0],read:true}]},{online:true});
 assert.match(readHtml,/ВСЁ ПРОЧИТАНО/);
 assert.match(readHtml,/data-event-read-all disabled/);
});
test('Activity history retains the partner-profile action while notification tiles do not nest buttons',()=>{
 const e={...events[0],partner_public_id:id};
 const html=ui().eventMarkup(e);
 assert.match(html,/<article class="flip-event/);
 assert.match(html,/data-player-profile="/);
 assert.match(html,/class="flip-event-description"/);
 const compact=ui().eventMarkup(e,{compact:true});
 assert.doesNotMatch(compact,/data-player-profile=/);
 assert.match(compact,/class="flip-notif-item"|flip-notif-item"/);
 assert.equal((compact.match(/<button/g)||[]).length,1);
});
test('New notification sheet has mobile-safe layout, focus indication and SVG-ready glyphs',()=>{
 const css=read('src/styles/notifications-v0914.css');
 assert.match(css,/#notifications\.notif-sheet\{/);
 assert.match(css,/max-height:min\(78dvh,690px\)/);
 assert.match(css,/#notifications \.flip-notif-head\{[\s\S]*?position:sticky/);
 assert.match(css,/#notifications \.flip-notif-item:focus-visible/);
 assert.match(css,/#notifications \.flip-notif-item\.flip-event--gift/);
 assert.match(css,/@media\(max-width:370px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 const icons=read('src/scripts/icons.js');
 for(const icon of ['✕','↗','✓','↔','⇄','✦','◈','▣'])
  assert.ok(icons.includes("'"+icon+"':"),icon);
});
test('Trade polling remains 15 seconds; healthy technical timestamps no longer appear',()=>{
 const script=read('src/scripts/trades.js');
 assert.match(script,/LIVE_TRADE_REFRESH_MS\s*=\s*15000/);
 assert.match(script,/if\(s\.syncError\)return/);
 assert.doesNotMatch(script,/АВТО · 15 С|ОБНОВЛЕНО/);
 assert.match(script,/function liveStatus\(\)\{/);
 assert.match(script,/return '';/);
 assert.match(script,/data-trade-refresh/);
});
test('Release 0.9.14 uses fresh inbox and keeps all game operations server-authoritative',()=>{
 const html=read('index.html');
 assert.equal(JSON.parse(read('package.json')).version,'0.9.14');
 assert.ok(html.includes('src/scripts/activity.js?v=0.9.14'));
 assert.ok(html.includes('src/scripts/trades.js?v=0.9.14'));
 assert.ok(html.includes('src/scripts/app.js?v=0.9.14'));
 assert.ok(html.includes('src/styles/notifications-v0914.css?v=0.9.14'));
 assert.ok(html.indexOf('src/styles/notifications-v0914.css')>
  html.indexOf('src/styles/activity.css'));
 assert.ok(html.includes('id="closeNotifications"'));
 assert.ok(html.includes('id="flip-notifications-body"'));
 assert.ok(read('api/flip.js').includes("version:'0.9.14'"));
 assert.match(read('src/scripts/app.js'),/bridge\.markEventsRead\(eventId\)/);
});
