import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const own='carti/die-lit/rare';
const theirs='carti/music/epic';
const wait=async()=>{await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));};
const date=()=>new Date(Date.now()+3600000).toISOString();

function runtime({trades=[],artOverride=null}={}){
 const requested=[],viewer=[],feed={innerHTML:''},results={innerHTML:''};
 const cardGrid={innerHTML:''},count={textContent:''},badge={hidden:true,textContent:''};
 const root={isConnected:true,innerHTML:'',handlers:{},
  contains(){return true;},addEventListener(event,fn){this.handlers[event]=fn;},
  querySelector(q){
   if(q==='#flip-trade-live-feed')return feed;
   if(q==='#flip-trade-player-results')return results;
   if(q==='[data-trade-viewport="give"]')return cardGrid;
   if(q==='[data-trade-choice-count="give"]')return count;
   return null;
  }};
 const ctx={URL,URLSearchParams,Map,Set,JSON,Number,String,Date,Promise,
  document:{visibilityState:'visible',querySelector(q){
   return q==='[data-tab="trades"] .count'?badge:null;
  }},location:{origin:'https://flip.test'},
  crypto:{randomUUID:()=> '44444444-4444-4444-8444-444444444444'},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}},
  window:{
   Telegram:{WebApp:{initData:new URLSearchParams({
     user:JSON.stringify({id:12345})}).toString()}},
   FLIPCatalog:{getCard(artist,release,rarity){
    return {id:[artist,release,rarity].join('/'),artist:'Playboi Carti',
     title:release==='die-lit'?'Die Lit':'MUSIC',color:rarity,rarity,
     style:'Масляная живопись',art:artOverride??'./src/assets/'+[artist,release,rarity].join('/')+'.webp'};
   }},
   FLIPGame:{state:{balance:400,received:[{id:own,isTestCopy:false,rarity:'rare'}]}},
   FLIPCardViewer:{open(item,options){viewer.push({item,options});return true}},
   FLIPIcons:{render(){}},
   dispatchEvent(){}
  },
  Event:class{constructor(type){this.type=type}},
  fetch:async(url,options)=>{
   const q=url.searchParams.get('view');
   if(options.method==='POST'){requested.push(JSON.parse(options.body));return Response.json({ok:true});}
   if(q==='expanded')return Response.json({trades,gifts:[]});
   if(q==='players')return Response.json({players:[{id:'54321',name:'@friend',level:4,cp:100}]});
   if(q==='cards')return Response.json({cards:[{id:theirs,rarity:'epic',ranked_count:1}]});
   if(q==='preview'||q==='currency_preview')return Response.json({
    preview:{available:true,sender_delta:-4,recipient_delta:12}});
   throw Error('Unexpected '+q);
  },
  confirm:()=>true,setTimeout:()=>1,clearTimeout(){}
 };
 runInNewContext(read('src/scripts/trades.js'),ctx);
 const click=(attribute,value,extra={})=>{
  const fields={'data-trade-preview-card':'tradePreviewCard',
   'data-trade-mode':'tradeMode','data-trade-select':'tradeSelect',
   'data-trade-rarity':'tradeRarity','data-trade-rarity-side':'tradeRaritySide'};
  const dataset={...extra};
  if(fields[attribute])dataset[fields[attribute]]=value;
  root.handlers.click({target:{
   dataset,hasAttribute(key){return key===attribute;},
   closest(selector){return selector==='button'?this:null;}
  }});
 };
 const select=(side,id,checked=true)=>root.handlers.change({target:{closest(){
  return {dataset:{tradeToggle:side},value:id,checked};
 }}});
 const input=(id,value,dataset={})=>root.handlers.input({target:{id,value,dataset}});
 async function chooseFriend(){
  input('flip-trade-user-search','friend');
  click('data-trade-find');await wait();
  click('data-trade-select','54321');await wait();
 }
 return {root,ctx,feed,viewer,requested,badge,cardGrid,count,click,select,input,
  chooseFriend,api:ctx.window.FLIPTrades};
}

test('Gallery selector displays trusted album art, rarity chips, and separate preview buttons',async()=>{
 const ui=runtime();ui.api.mount(ui.root);await wait();await ui.chooseFriend();
 const html=ui.root.innerHTML;
 assert.match(html,/flip-trade-card-choices/);
 assert.match(html,/flip-trade-choice-art/);
 assert.match(html,/data-trade-preview-card="carti\/die-lit\/rare"/);
 assert.match(html,/data-trade-preview-card="carti\/music\/epic"/);
 assert.match(html,/data-trade-card-search="give"/);
 assert.match(html,/data-trade-card-search="take"/);
 assert.match(html,/data-trade-rarity="rare"/);
 assert.match(html,/src=".\/src\/assets\/carti\/die-lit\/rare.webp"/);
 assert.match(html,/src=".\/src\/assets\/carti\/music\/epic.webp"/);
});
test('Choosing each side updates visual cover comparison and keeps card/card transaction intact',async()=>{
 const ui=runtime();ui.api.mount(ui.root);await wait();await ui.chooseFriend();
 ui.select('give',own);ui.select('take',theirs);
 const html=ui.root.innerHTML;
 assert.match(html,/УСЛОВИЯ СДЕЛКИ/);
 assert.match(html,/flip-trade-review-grid/);
 assert.match(html,/data-trade-preview-card="carti\/die-lit\/rare"/);
 assert.match(html,/data-trade-preview-card="carti\/music\/epic"/);
 assert.match(html,/data-trade-create/);
 ui.click('data-trade-create');await wait();
 assert.equal(ui.requested.length,1);
 assert.equal(ui.requested[0].action,'create');
 assert.deepEqual(Array.from(ui.requested[0].offerCards),[own]);
 assert.deepEqual(Array.from(ui.requested[0].wantCards),[theirs]);
});
test('Tapping a cover opens the existing fullscreen catalog viewer with correct art',async()=>{
 const ui=runtime();ui.api.mount(ui.root);await wait();await ui.chooseFriend();
 ui.click('data-trade-preview-card',theirs);
 assert.equal(ui.viewer.length,1);
 assert.equal(ui.viewer[0].item.id,theirs);
 assert.equal(ui.viewer[0].item.artist,'Playboi Carti');
 assert.equal(ui.viewer[0].item.title,'MUSIC');
 assert.equal(ui.viewer[0].options.mode,'catalog');
 assert.equal(ui.viewer[0].item.art,'./src/assets/carti/music/epic.webp');
});
test('Incoming/outgoing trade and F proposals show actual two-sided art previews',async()=>{
 const trades=[
 {id:'22222222-2222-4222-8222-222222222222',status:'pending',type:'cards',mine:false,
  created_at:new Date().toISOString(),expires_at:date(),sender_label:'@friend',recipient_label:'@me',
  offer_cards:[theirs],want_cards:[own]},
 {id:'33333333-3333-4333-8333-333333333333',status:'pending',type:'currency',mine:true,
  created_at:new Date().toISOString(),expires_at:date(),sender_label:'@me',recipient_label:'@friend',
  offer_cards:[own],want_cards:[],offer_f:0,want_f:145}
 ];
 const ui=runtime({trades});ui.api.mount(ui.root);await wait();
 assert.match(ui.feed.innerHTML,/src=".\/src\/assets\/carti\/die-lit\/rare.webp"/);
 assert.match(ui.feed.innerHTML,/src=".\/src\/assets\/carti\/music\/epic.webp"/);
 assert.match(ui.feed.innerHTML,/data-trade-preview-card="carti\/music\/epic"/);
 assert.match(ui.feed.innerHTML,/data-trade-preview-card="carti\/die-lit\/rare"/);
 assert.match(ui.feed.innerHTML,/ОТДАЁШЬ/);
 assert.match(ui.feed.innerHTML,/ПОЛУЧАЕШЬ/);
 assert.match(ui.feed.innerHTML,/145 F/);
 assert.equal(ui.badge.textContent,'1');
 assert.match(ui.feed.innerHTML,/data-trade-verb="accept"/);
});
test('Card search filters only gallery without replacing composer and stealing focus',async()=>{
 const ui=runtime();ui.api.mount(ui.root);await wait();await ui.chooseFriend();
 const old=ui.root.innerHTML;
 ui.input('filter','not-a-card',{tradeCardSearch:'give'});
 assert.match(ui.cardGrid.innerHTML,/Ничего не найдено/);
 assert.equal(ui.count.textContent,'0 в списке');
 assert.equal(ui.root.innerHTML,old);
 ui.input('filter','die lit',{tradeCardSearch:'give'});
 assert.match(ui.cardGrid.innerHTML,/Die Lit/);
});
test('Untrusted artwork never reaches an image src or fullscreen viewer',async()=>{
 const ui=runtime({artOverride:'javascript:alert(1)'});
 ui.api.mount(ui.root);await wait();await ui.chooseFriend();
 assert.doesNotMatch(ui.root.innerHTML,/src="javascript:/);
 ui.click('data-trade-preview-card',own);
 assert.equal(ui.viewer[0].item.art,'./src/assets/carti/die-lit/rare.webp');
});
test('v0.9.8.5 only revamps presentation: server mechanics and conditions retained',()=>{
 const trades=read('src/scripts/trades.js'),html=read('index.html'),
 css=read('src/styles/social.css'),app=read('src/scripts/app.js'),
 pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.version,'0.9.8.5');
 assert.ok(html.includes('src/scripts/trades.js?v=0.9.8.5'));
 assert.ok(html.includes('src/styles/social.css?v=0.9.8.5'));
 assert.ok(html.includes('src/scripts/app.js?v=0.9.8.5'));
 assert.match(app,/panel flip-trade-page/);
 assert.match(trades,/window\.FLIPCardViewer\?\.open\?\./);
 assert.match(trades,/data-trade-preview-card/);
 assert.match(trades,/data-trade-card-search/);
 assert.match(trades,/data-trade-rarity-side/);
 assert.match(trades,/flip-trade-review/);
 assert.match(trades,/TRADE_CARD_UNAVAILABLE/);
 assert.match(trades,/72 часа/);
 assert.match(trades,/data-trade-inspect/);
 assert.doesNotMatch(trades,/setInterval\(/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
