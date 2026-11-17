import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const css=read('src/styles/trades-polish-v09138.css');
function mount(trades=[]){
 const feed={innerHTML:''},badge={hidden:true,textContent:''};
 const root={isConnected:true,innerHTML:'',addEventListener(){},
   querySelector(selector){return selector==='#flip-trade-live-feed'?feed:null;}};
 const context={
  URL,URLSearchParams,Date,Set,Map,Number,JSON,Promise,
  location:{origin:'https://flip.test'},
  document:{visibilityState:'visible',querySelector(selector){
    return selector==='[data-tab="trades"] .count'?badge:null;
  }},
  window:{Telegram:{WebApp:{initData:new URLSearchParams({
    user:JSON.stringify({id:12345})}).toString()}},
    FLIPGame:{state:{received:[]}},FLIPCatalog:{getCard(){return null;}},
    FLIPIcons:{render(){}}},
  fetch:async()=>Response.json({trades,gifts:[]}),
  crypto:{randomUUID:()=> '55555555-5555-4555-8555-555555555555'},
  localStorage:{getItem(){return null},setItem(){},removeItem(){}},
  confirm:()=>true,setTimeout:()=>1,clearTimeout(){}
 };
 runInNewContext(read('src/scripts/trades.js'),context);
 context.window.FLIPTrades.mount(root);
 return {feed,root,refresh:()=>new Promise(r=>setImmediate(r))};
}
test('Three empty sections explain their state without touching exchange mechanics',async()=>{
 const ui=mount();await ui.refresh();await ui.refresh();
 const html=ui.feed.innerHTML;
 for(const heading of ['ВХОДЯЩИЕ','ИСХОДЯЩИЕ','ИСТОРИЯ'])
  assert.ok(html.includes('<h3>'+heading+'</h3>'),heading);
 for(const label of ['Пока нет входящих предложений',
   'Пока нет исходящих предложений','Здесь появятся завершённые сделки'])
  assert.ok(html.includes(label),label);
 assert.equal((html.match(/class="flip-trade-empty-state"/g)||[]).length,3);
 assert.match(html,/data-trade-refresh/);
});
test('Feed owns vertical spacing without joined or doubled panel margins',()=>{
 assert.match(css,/#flip-trade-live-feed\{[\s\S]*?row-gap:16px/);
 assert.match(css,/#flip-trade-live-feed > \.flip-trade-feed-panel\{[\s\S]*?margin:0!important/);
 assert.match(css,/#flip-trade-live-feed > \.flip-trade-feed-header\{[\s\S]*?margin:0 0 2px/);
 assert.match(css,/#flip-trade-live-feed > \.flip-trade-sync\{[\s\S]*?margin:3px 1px 0/);
 assert.match(css,/@media\(max-width:365px\)/);
});
test('Offer header and give/take content have consistent internal spacing',()=>{
 assert.match(css,/#flip-trade-live-feed \.flip-trade-offer-heading\{[\s\S]*?margin:0 0 15px!important/);
 assert.match(css,/#flip-trade-live-feed \.flip-trade-offer-side\{[\s\S]*?padding:14px 10px 12px/);
 assert.match(css,/#flip-trade-live-feed \.flip-trade-offer \.flip-trade-side-top\{[\s\S]*?margin-bottom:12px/);
 assert.match(css,/#flip-trade-live-feed \.flip-trade-offer \+ \.flip-trade-offer\{margin-top:12px\}/);
 assert.match(css,/#flip-trade-live-feed \.flip-trade-feed-head h3:before/);
 assert.match(css,/#flip-trade-live-feed \.flip-trade-empty-state>small/);
 const js=read('src/scripts/trades.js');
 assert.match(js,/data-trade-verb="accept"/);
 assert.match(js,/data-trade-verb="decline"/);
 assert.match(js,/data-trade-inspect/);
 assert.match(js,/data-trade-counter/);
});
test('Scoped CSS is loaded after base social stylesheet with refreshed cache',()=>{
 const html=read('index.html');
 assert.ok(html.includes('src/styles/social.css?v=0.9.8.5'));
 assert.ok(html.includes('src/styles/trades-polish-v09138.css?v=0.9.13.8'));
 assert.ok(html.indexOf('src/styles/trades-polish-v09138.css')>
   html.indexOf('src/styles/social.css'));
 assert.ok(html.includes('src/scripts/trades.js?v=0.9.13.8'));
 assert.equal(JSON.parse(read('package.json')).version,'0.9.13');
});
