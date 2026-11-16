import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('Signed trade polling updates only the visible tab, no faster than every 15s',async()=>{
 let clock=1770000000000,calls=0;
 class Clock extends Date{static now(){return clock}}
 const feed={innerHTML:''},root={innerHTML:'',isConnected:true,addEventListener(){},
  querySelector(q){return q==='#flip-trade-live-feed'?feed:null}};
 const context={URL,URLSearchParams,Date:Clock,Set,Map,Number,JSON,Promise,
  location:{origin:'https://flip.test'},
  document:{visibilityState:'visible',querySelector(){return null}},
  window:{Telegram:{WebApp:{initData:new URLSearchParams({user:JSON.stringify({id:12345})}).toString()}},
   FLIPGame:{state:{received:[]}},FLIPCatalog:{getCard(){return null}},FLIPIcons:{render(){}}},
  fetch:async(url,options)=>{
   calls++;assert.equal(options.method,'GET');assert.equal(url.searchParams.get('view'),'expanded');
   return Response.json({trades:[],gifts:[]});
  },localStorage:{getItem(){return null},setItem(){},removeItem(){}},
  crypto:{randomUUID(){return '11111111-1111-4111-8111-111111111111'}},
  setTimeout,clearTimeout,confirm(){return true}};
 runInNewContext(read('src/scripts/trades.js'),context);
 const trades=context.window.FLIPTrades;trades.mount(root);await flush();
 assert.equal(calls,1);assert.match(feed.innerHTML,/АВТО · 15 С/);
 assert.equal(trades.tickVisible(),null);
 clock+=14999;assert.equal(trades.tickVisible(),null);
 clock+=1;await trades.tickVisible();assert.equal(calls,2);
 context.document.visibilityState='hidden';clock+=20000;
 assert.equal(trades.tickVisible(),null);
 context.document.visibilityState='visible';root.isConnected=false;
 assert.equal(trades.tickVisible(),null);assert.equal(calls,2);
 assert.doesNotMatch(read('src/scripts/trades.js'),/setInterval\(/);
});
function ui(){
 const window={FLIPCatalog:{getCard(){return null}},
  FLIPActivity:{publicStats:()=>'<section class="content-card flip-profile-stats">STATS</section>'}};
 runInNewContext(read('src/scripts/profile-cosmetics.js'),{window});
 runInNewContext(read('src/scripts/showcase.js'),{window});
 runInNewContext(read('src/scripts/achievements.js'),{window});
 return window;
}
const pinned={code:'pinned',title:'Закреплённый',symbol:'◆',badge:'mythic'};
const spare={code:'spare',title:'Остальной',symbol:'✦',badge:'secret'};
const profile={username:'tester',level:6,cp:100,ranked_cards:4,ranked_variants:3,
 slot_count:3,appearance:{background:'midnight-grid',showcase_skin:'midnight-vault'},
 slots:[],pinned_badges:[pinned],badges:[pinned,spare]};
test('Pinned badges appear once, remaining badges are still visible on public profiles',()=>{
 const x=ui(),html=x.FLIPShowcase.publicPage(profile);
 assert.match(html,/ЗНАКИ ОТЛИЧИЯ/);assert.match(html,/ДРУГИЕ ЗНАЧКИ/);
 const rest=html.slice(html.indexOf('ДРУГИЕ ЗНАЧКИ'));
 assert.doesNotMatch(rest,/Закреплённый/);assert.match(rest,/Остальной/);
 assert.equal(x.FLIPShowcase.unpinnedBadges(profile.badges,profile.pinned_badges).length,1);
 assert.doesNotMatch(x.FLIPShowcase.publicPage({...profile,badges:[pinned]}),/ДРУГИЕ ЗНАЧКИ/);
});
test('Personal achievements do not repeat profile-pinned badges',()=>{
 const x=ui(),html=x.FLIPAchievements.profile({badges:[pinned,spare],completed:12,total:31},
  {online:true,pinnedBadges:[pinned]});
 assert.match(html,/Остальной/);assert.doesNotMatch(html,/Закреплённый/);
 const all=x.FLIPAchievements.profile({badges:[pinned]},{online:true,pinnedBadges:[pinned]});
 assert.match(all,/Закреплённые значки показаны выше/);
});
test('Personal skin, smart hub rerender and spare requests are guarded',()=>{
 const app=read('src/scripts/app.js'),css=read('src/styles/qol-v0910.css');
 for(const bit of ['lastProfileStatsSignature','lastActivitySignature',
  "current==='profile'&&profileChanged","current==='store'&&packChanged",
  "current==='trades'&&document.visibilityState!=='hidden'",
  'pinnedBadges:data?.pinned_badges'])
  assert.ok(app.includes(bit),bit);
 assert.match(app,/flip-profile-lower '\+lowerSkin/);
 assert.match(css,/\.flip-profile-lower>\.flip-profile-metrics>div/);
 assert.match(css,/color:var\(--lower-accent\)/);
 assert.match(app,/},45000\)/);
});
test('Economy remains server-authoritative; new release has correct cache stamps',()=>{
 const pkg=JSON.parse(read('package.json')),index=read('index.html');
 assert.equal(pkg.version,'0.9.10');
 for(const p of ['app.js','trades.js','showcase.js','achievements.js'])
  assert.ok(index.includes('src/scripts/'+p+'?v='+pkg.version),p);
 assert.ok(index.includes('src/styles/qol-v0910.css?v='+pkg.version));
 assert.ok(read('api/flip.js').includes("version:'0.9.10'"));
 assert.match(read('src/scripts/server.js'),/return makeState\(data.state\)/);
 assert.match(read('src/scripts/trades.js'),/const factors=\[1,\.25,\.10,\.05,\.05,\.01/);
});
