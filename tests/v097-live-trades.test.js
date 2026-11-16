import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const now=()=>new Date().toISOString();
const later=()=>new Date(Date.now()+60*60*1000).toISOString();
const earlier=()=>new Date(Date.now()-60*60*1000).toISOString();
const card='carti/music/rare';
function trade(id,{status='pending',mine=false,expires_at=later()}={}){
 return {id,status,mine,expires_at,created_at:now(),
  sender_label:mine?'@me':'@friend',recipient_label:mine?'@friend':'@me',
  sender_id:mine?12345:67890,recipient_id:mine?67890:12345,
  offer_cards:[card],want_cards:['carti/die-lit/common'],parent_trade_id:null};
}
const tid=a=>'11111111-1111-4111-8111-'+a.padStart(12,'0');
async function flush(){await new Promise(resolve=>setImmediate(resolve));}
function runtime(respond){
 const count={textContent:'',hidden:true};
 const feed={innerHTML:''};
 const root={innerHTML:'',isConnected:true,events:{},
  addEventListener(type,fn){this.events[type]=fn;},
  querySelector(q){return q==='#flip-trade-live-feed'?feed:null;}};
 let calls=0;
 const context={
  URL,URLSearchParams,Date,Set,Map,Number,JSON,Promise,
  location:{origin:'https://flip.test'},
  document:{visibilityState:'visible',querySelector(q){
   return q==='[data-tab="trades"] .count'?count:null;
  }},
  window:{
   Telegram:{WebApp:{initData:new URLSearchParams({user:JSON.stringify({id:12345})}).toString()}},
   FLIPGame:{state:{received:[]}},FLIPCatalog:{getCard(){return null;}},
   FLIPIcons:{render(){}}
  },
  fetch:async(url,options)=>{
   calls++;
   assert.equal(url.searchParams.get('view'),'expanded');
   assert.equal(options.headers['x-telegram-init-data'],context.window.Telegram.WebApp.initData);
   const result=await respond(calls);
   return Response.json({trades:result,gifts:[]});
  },
  crypto:{randomUUID(){return tid('42');}},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
  confirm(){return true;},
  setTimeout,clearTimeout
 };
 runInNewContext(read('src/scripts/trades.js'),context);
 return {trades:context.window.FLIPTrades,root,feed,count,context,calls:()=>calls};
}
test('Hub updates a pending incoming trade without remounting composer or losing focus',async()=>{
 const first=trade(tid('1')) ,second=trade(tid('2'));
 const rt=runtime(async n=>n===1?[first]:[first,second]);
 rt.trades.mount(rt.root);
 await flush();
 assert.equal(rt.count.textContent,'1');
 assert.equal(rt.count.hidden,false);
 const before=rt.root.innerHTML;
 const initial=rt.calls();
 rt.trades.syncHub({activity:[{id:5,kind:'trade_offer',read:false}]});
 await flush();
 assert.equal(rt.calls(),initial,'unchanged initial hub must not repeat a fresh list read');
 rt.trades.syncHub({activity:[{id:6,kind:'trade_offer'},{id:5,kind:'trade_offer'}]});
 await flush();
 assert.equal(rt.calls(),initial+1);
 assert.equal(rt.count.textContent,'2');
 assert.equal(rt.root.innerHTML,before,'background refresh never overwrites active draft');
 assert.match(rt.feed.innerHTML,/is-fresh/);
 assert.match(rt.feed.innerHTML,/ВХОДЯЩИЕ<\/h3><span>2<\/span>/);
 rt.trades.syncHub({activity:[{id:6,kind:'trade_offer',read:true},{id:5,kind:'trade_offer',read:true}]});
 await flush();
 assert.equal(rt.calls(),initial+1,'marking notifications read does not refetch trades');
});
test('Expired trade is removed from active badge and accept controls',async()=>{
 const old=trade(tid('3'),{expires_at:earlier()});
 const rt=runtime(async()=>[old]);
 rt.trades.mount(rt.root);await flush();
 assert.equal(rt.count.hidden,true);
 assert.match(rt.feed.innerHTML,/ИСТЁК/);
 assert.match(rt.feed.innerHTML,/ИСТОРИЯ/);
 assert.doesNotMatch(rt.feed.innerHTML,/data-trade-verb="accept"/);
});
test('Inactive tab reconciles changed hub events without resetting draft and skips hidden app',async()=>{
 const rt=runtime(async n=>n===1?[]:[trade(tid('4'))]);
 rt.trades.mount(rt.root);await flush();
 rt.root.isConnected=false;
 rt.context.document.visibilityState='hidden';
 rt.trades.syncHub({activity:[{id:4,kind:'trade_offer'}]});
 await flush();
 assert.equal(rt.calls(),1);
 rt.context.document.visibilityState='visible';
 rt.trades.syncHub({activity:[{id:4,kind:'trade_offer'}]});
 await flush();
 // This is the initial fingerprint. It cannot trigger an unnecessary fetch.
 assert.equal(rt.calls(),1);
 rt.trades.syncHub({activity:[{id:5,kind:'trade_offer'},{id:4,kind:'trade_offer'}]});
 await flush();
 assert.equal(rt.calls(),2);
 assert.equal(rt.count.textContent,'1');
 assert.equal(rt.count.hidden,false);
});
test('A forced reconciliation cannot be overwritten by an older in-flight response',async()=>{
 let finishOld;
 const old=new Promise(resolve=>finishOld=resolve);
 const rt=runtime(async n=>n===1?old:[trade(tid('7'))]);
 rt.trades.mount(rt.root);
 rt.trades.syncHub({activity:[{id:9,kind:'trade_offer'}]});
 rt.trades.syncHub({activity:[{id:10,kind:'trade_offer'},{id:9,kind:'trade_offer'}]});
 await flush();
 assert.equal(rt.calls(),2);
 assert.equal(rt.count.textContent,'1');
 finishOld([trade(tid('8'),{status:'declined'})]);
 await flush();
 assert.equal(rt.count.textContent,'1','old pending response must be ignored');
 assert.match(rt.feed.innerHTML,/ВХОДЯЩИЕ<\/h3><span>1<\/span>/);
});
test('Failure keeps last known trades and successful subsequent event can recover',async()=>{
 const rt=runtime(async n=>n===2?Promise.reject(new Error('NETWORK_FAILED')):[trade(tid('9'))]);
 rt.trades.mount(rt.root);await flush();
 rt.trades.syncHub({activity:[{id:2,kind:'trade_offer'}]});
 rt.trades.syncHub({activity:[{id:3,kind:'trade_offer'},{id:2,kind:'trade_offer'}]});
 await flush();
 assert.equal(rt.count.textContent,'1');
 assert.match(rt.feed.innerHTML,/НЕТ СОЕДИНЕНИЯ/);
 rt.trades.syncHub({activity:[{id:4,kind:'trade_offer'},{id:3,kind:'trade_offer'}]});
 await flush();
 assert.equal(rt.count.textContent,'1');
 assert.doesNotMatch(rt.feed.innerHTML,/НЕТ СОЕДИНЕНИЯ/);
});
test('v0.9.7 reuses only existing hub polling and busts Telegram cache',()=>{
 const app=read('src/scripts/app.js'),script=read('src/scripts/trades.js'),
  html=read('index.html'),pkg=JSON.parse(read('package.json'));
 assert.match(app,/FLIPTrades\?\.syncHub\?\.\(data\)/);
 assert.match(app,/},45000\)/);
 assert.doesNotMatch(script,/setInterval\(/);
 assert.ok(html.includes('trades.js?v=0.9.8'));
 assert.ok(html.includes('social.css?v=0.9.8'));
 assert.ok(pkg.version.localeCompare('0.9.7',undefined,{numeric:true})>=0);
});

test('Fast-check eligibility tracks only active outgoing offers, then stops on acceptance',async()=>{
 const id=tid('88');
 const rt=runtime(async n=>n===1?[trade(id,{mine:true})]:
    [trade(id,{mine:true,status:'accepted'})]);
 rt.trades.mount(rt.root);
 await flush();
 assert.equal(rt.trades.hasPendingOutgoing(),true);
 rt.trades.syncHub({activity:[{id:19,kind:'trade_offer'}]});
 rt.trades.syncHub({activity:[{id:20,kind:'trade_accepted'},{id:19,kind:'trade_offer'}]});
 await flush();
 assert.equal(rt.trades.hasPendingOutgoing(),false);
});
test('No accelerated sender polling for an account without active outgoing trades',async()=>{
 const rt=runtime(async()=>[trade(tid('31'),{mine:false})]);
 rt.trades.mount(rt.root);
 await flush();
 assert.equal(rt.trades.hasPendingOutgoing(),false);
});
