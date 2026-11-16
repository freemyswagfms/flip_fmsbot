import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const owned='carti/die-lit/rare';
const requested='carti/music/epic';
const tick=async()=>{await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));};
function runtime(initialTrades=[]){
 const calls=[],feed={innerHTML:''},players={innerHTML:''};
 const badge={hidden:true,textContent:''};
 const root={
  isConnected:true,innerHTML:'',handlers:{},contains(){return true;},
  addEventListener(name,callback){this.handlers[name]=callback;},
  querySelector(s){return s==='#flip-trade-live-feed'?feed:
    s==='#flip-trade-player-results'?players:null;}
 };
 const document={visibilityState:'visible',querySelector(s){
  return s==='[data-tab="trades"] .count'?badge:null;}};
 const initData=new URLSearchParams({user:JSON.stringify({id:12345})}).toString();
 const ctx={
  URL,URLSearchParams,Map,Set,JSON,Date,Number,String,Promise,
  document,location:{origin:'https://flip.test'},
  crypto:{randomUUID(){return '44444444-4444-4444-8444-444444444444';}},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
  window:{
   Telegram:{WebApp:{initData}},
   FLIPGame:{state:{balance:500,received:[{id:owned,rarity:'rare',isTestCopy:false}]}},
   FLIPIcons:{render(){}},
   FLIPCatalog:{getCard(a,b,c){return {artist:'Carti',title:b,rarity:c};}},
   dispatchEvent(){}
  },
  Event:class{constructor(type){this.type=type;}},
  confirm(){return true;},
  fetch:async(url,options)=>{
   const view=url.searchParams.get('view');
   if(options.method==='POST'){
    calls.push(JSON.parse(options.body));
    return Response.json({ok:true,id:'11111111-1111-4111-8111-111111111111'});
   }
   if(view==='expanded')return Response.json({trades:initialTrades,gifts:[]});
   if(view==='players')return Response.json({players:[{
     id:'54321',name:'@friend',level:1,cp:10}]});
   if(view==='cards')return Response.json({cards:[{
     id:requested,rarity:'epic',ranked_count:1}]});
   throw Error('Unexpected view '+view);
  },
  setTimeout(){return 1;},clearTimeout(){}
 };
 runInNewContext(read('src/scripts/trades.js'),ctx);
 const button=(attr,value)=>{
  const dataset={};
  if(attr==='data-trade-mode')dataset.tradeMode=value;
  if(attr==='data-trade-select')dataset.tradeSelect=value;
  if(attr==='data-trade-currency-side')dataset.tradeCurrencySide=value;
  const target={dataset,hasAttribute(n){return n===attr;},closest(){return this;}};
  return target;
 };
 function click(attr,value){root.handlers.click({target:button(attr,value)});}
 function choose(side,id){
  root.handlers.change({target:{closest(){
    return {dataset:{tradeToggle:side},value:id,checked:true};}}});
 }
 function input(id,value){root.handlers.input({target:{id,value}});}
 async function findFriend(){
  input('flip-trade-user-search','friend');
  click('data-trade-find');await tick();
  click('data-trade-select','54321');await tick();
 }
 return {ctx,root,feed,badge,calls,click,input,choose,findFriend,api:ctx.window.FLIPTrades};
}
test('Gift mode selects one owned card and sends an immediate signed gift action',async()=>{
 const ui=runtime();
 ui.api.mount(ui.root);await tick();
 ui.click('data-trade-mode','gift');
 await ui.findFriend();
 assert.match(ui.root.innerHTML,/ПОДАРОК/);
 ui.choose('give',owned);
 assert.match(ui.root.innerHTML,/ПОДАРИТЬ КАРТОЧКУ/);
 ui.click('data-trade-create');await tick();
 assert.equal(ui.calls.length,1);
 assert.equal(ui.calls[0].action,'gift');
 assert.equal(ui.calls[0].recipientId,'54321');
 assert.equal(ui.calls[0].cardId,owned);
 assert.equal(ui.calls[0].requestId,'44444444-4444-4444-8444-444444444444');
});
test('Currency sell proposal delivers selected card and requested F only after acceptance',async()=>{
 const ui=runtime();
 ui.api.mount(ui.root);await tick();
 ui.click('data-trade-mode','currency');
 await ui.findFriend();
 ui.choose('give',owned);
 ui.input('flip-trade-amount','145');
 ui.click('data-trade-create');await tick();
 assert.equal(ui.calls.length,1);
 assert.equal(ui.calls[0].action,'create_f');
 assert.equal(ui.calls[0].offerF,0);
 assert.equal(ui.calls[0].wantF,145);
 assert.deepEqual(Array.from(ui.calls[0].offerCards),[owned]);
 assert.deepEqual(Array.from(ui.calls[0].wantCards),[]);
});
test('Currency buy proposal requires known F balance before enabling action',async()=>{
 const ui=runtime();
 ui.api.mount(ui.root);await tick();
 ui.click('data-trade-mode','currency');await ui.findFriend();
 ui.click('data-trade-currency-side','buy');
 ui.choose('take',requested);
 ui.input('flip-trade-amount','600');
 ui.click('data-trade-create');await tick();
 assert.equal(ui.calls.length,0,'cannot offer more F than current balance');
 ui.input('flip-trade-amount','250');
 ui.click('data-trade-create');await tick();
 assert.equal(ui.calls.length,1);
 assert.equal(ui.calls[0].action,'create_f');
 assert.equal(ui.calls[0].offerF,250);
 assert.equal(ui.calls[0].wantF,0);
 assert.deepEqual(Array.from(ui.calls[0].wantCards),[requested]);
});
test('Live feed shows F proposals and pending badge for incoming currency offers',async()=>{
 const t={id:'22222222-2222-4222-8222-222222222222',type:'currency',
  mine:false,status:'pending',expires_at:new Date(Date.now()+3600000).toISOString(),
  created_at:new Date().toISOString(),sender_label:'@friend',
  recipient_label:'@mine',offer_cards:[owned],want_cards:[],
  offer_f:0,want_f:145};
 const ui=runtime([t]);ui.api.mount(ui.root);await tick();
 assert.match(ui.feed.innerHTML,/КАРТОЧКИ ↔ F/);
 assert.match(ui.feed.innerHTML,/145 F/);
 assert.equal(ui.badge.hidden,false);
 assert.equal(ui.badge.textContent,'1');
 assert.match(ui.feed.innerHTML,/data-trade-verb="accept"/);
});
