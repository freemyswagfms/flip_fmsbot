import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Trade sender gets an accelerated signed hub check while app stays visible',()=>{
 const app=read('src/scripts/app.js'),trades=read('src/scripts/trades.js');
 const region=app.slice(app.indexOf('// Sender-side fast delivery check'),app.indexOf('},12000);')+9);
 assert.match(region,/setInterval\(\(\)=>/);
 assert.match(region,/live\(\)/);
 assert.match(region,/document\.visibilityState!=='hidden'/);
 assert.match(region,/FLIPTrades\?\.hasPendingOutgoing\?\.\(\)/);
 assert.match(region,/refreshHub\(\{rerender:true\}\)/);
 assert.match(app,/},45000\)/,'ordinary 45-second hub is retained');
 assert.match(app,/FLIPDelivery\?\.enqueue\(data\?\.card_deliveries/);
 assert.match(app,/if\(hasNewCards&&bridge\?\.refreshInventory\)/);
 assert.match(trades,/hasPendingOutgoing\(\)/);
 assert.doesNotMatch(trades,/setInterval\(/);
 assert.doesNotMatch(app,/supabase\.channel|new EventSource|new WebSocket/);
});

test('Full-screen delivery controls sit below Telegram native close/menu buttons',()=>{
 const css=read('src/styles/delivery-reveal.css');
 const tg=read('src/scripts/telegram.js');
 assert.match(css,/:root\.flip-telegram-fullscreen \.flip-delivery-inner\{/);
 assert.match(css,/padding-top:max\(100px,calc\(var\(--flip-top-space,88px\) \+ 16px\)\)/);
 assert.match(css,/padding-top:max\(96px,calc\(var\(--flip-top-space,88px\) \+ 10px\)\)/);
 assert.match(tg,/root\.classList\.toggle\('flip-telegram-fullscreen', full\)/);
 assert.match(tg,/root\.style\.setProperty\('--flip-top-space'/);
 assert.match(css,/\.flip-delivery-header\{[^}]*justify-content:flex-end/);
});

test('Trade delivery overlay omits technical and duplicated copy, retaining player content',()=>{
 const script=read('src/scripts/delivery-reveal.js');
 assert.doesNotMatch(script,/SPECIAL DELIVERY|A NEW ADDITION|TO YOUR COLLECTION/);
 assert.doesNotMatch(script,/Карточка уже находится в твоей коллекции/);
 assert.match(script,/ПОЛУЧЕНО В ОБМЕНЕ/);
 assert.match(script,/ОБМЕН ЗАВЕРШЁН/);
 assert.match(script,/data-delivery-later/);
 assert.match(script,/data-delivery-next/);
 assert.match(script,/flip-delivery-sender/);
});

test('A new server trade receipt can reveal while the Telegram session is already open',()=>{
 const handlers={},timers=[],phone={append(node){node.isConnected=true;}};
 const scroll={setAttribute(){},removeAttribute(){}};
 let overlay;
 const makeClass=()=>({names:new Set(),add(...v){for(const x of v)this.names.add(x);},
   remove(...v){for(const x of v)this.names.delete(x);},
   contains(v){return this.names.has(v);}});
 const document={
  visibilityState:'visible',
  addEventListener(n,cb){handlers[n]=cb;},
  querySelector(s){if(s==='.phone')return phone;if(s==='.phone .scroll')return scroll;return null;},
  getElementById(){return null;},
  createElement(){overlay={isConnected:false,hidden:true,classList:makeClass(),
   style:{setProperty(){}},dataset:{},setAttribute(){},innerHTML:'',querySelector(){return null;}};
   return overlay;}
 };
 const context={
  window:{FLIPCatalog:{getCard(){return {title:'to hell with it',
    artist:'PinkPantheress',art:'/assets/card.webp',color:'rare'};}},
    FLIPIcons:{render(){}}},
  document,Date,Map,Set,Number,String,JSON,Object,Array,Promise,
  setTimeout(fn,ms){timers.push({fn,ms});return timers.length;},
  clearTimeout(){}, 
 };
 runInNewContext(read('src/scripts/delivery-reveal.js'),context);
 assert.equal(overlay,undefined,'overlay not mounted before a receipt');
 const received=context.window.FLIPDelivery.enqueue([
   {id:101,source:'trade',from:'alenaklasss',card_ids:['pinkpantheress/to-hell-with-it/rare']}
 ],{onAcknowledge:async()=>({ok:true})});
 assert.equal(received,true);
 assert.equal(timers[0]?.ms,450);
 timers.shift().fn();
 assert.equal(overlay?.hidden,false);
 assert.equal(overlay.classList.contains('is-visible'),true);
 assert.match(overlay.innerHTML,/PinkPantheress/);
 assert.match(overlay.innerHTML,/alenaklasss/);
 assert.match(overlay.innerHTML,/flip-delivery-later/);
 assert.doesNotMatch(overlay.innerHTML,/SPECIAL DELIVERY|A NEW ADDITION/);
});

test('Release version and Telegram WebView cache query refer to hotfix assets',()=>{
 const html=read('index.html'),pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.version,'0.9.7.1');
 for(const asset of [
  'src/scripts/app.js','src/scripts/trades.js',
  'src/scripts/delivery-reveal.js','src/styles/delivery-reveal.css'
 ])assert.ok(html.includes(asset+'?v='+pkg.version),asset);
 assert.ok(html.includes('FLIP v0.9.7.1 · TELEGRAM GAME'));
 assert.match(read('api/flip.js'),/version:'0\.9\.7\.1'/);
});
