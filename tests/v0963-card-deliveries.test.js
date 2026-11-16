import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {handleRequest} from '../api/flip.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const token='12345:FLIP_DELIVERY_TEST_TOKEN';
const uuid='11111111-1111-4111-8111-111111111111';
function signed(id){
 const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),
   user:JSON.stringify({id,first_name:'Player'})});
 const key=createHmac('sha256','WebAppData').update(token).digest();
 p.set('hash',createHmac('sha256',key).update([...p.entries()]
   .sort(([a],[b])=>a.localeCompare(b,'en'))
   .map(([a,b])=>a+'='+b).join('\n')).digest('hex'));
 return p.toString();
}
async function withEnv(fetcher,fn){
 const before=process.env,oldFetch=globalThis.fetch;
 process.env={...before,TELEGRAM_BOT_TOKEN:token,
   SUPABASE_URL:'https://flip-test.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_mock'};
 globalThis.fetch=fetcher;
 try{return await fn();}finally{process.env=before;globalThis.fetch=oldFetch;}
}
function post(id,payload){
 return new Request('https://flip.test/api/flip',{
  method:'POST',headers:{'x-telegram-init-data':id?signed(id):'',
   'content-type':'application/json'},
  body:JSON.stringify({action:'ack_card_deliveries',requestId:uuid,...payload})
 });
}
test('Signed account exclusively owns receipt acknowledgments',async()=>{
 const calls=[];
 await withEnv(async(url,options)=>{
   calls.push({rpc:String(url).split('/').at(-1),payload:JSON.parse(options.body)});
   return Response.json({ok:true,acknowledged:2});
 },async()=>{
   const res=await handleRequest(post(123456,{deliveryIds:[15,16]}));
   assert.equal(res.status,200);
   assert.equal((await res.json()).acknowledged,2);
   assert.deepEqual(calls,[{
     rpc:'flip_delivery_ack',payload:{p_telegram_id:123456,p_delivery_ids:[15,16]}
   }]);
 });
});
test('Forged recipient, duplicates, malformed IDs and unauthenticated acknowledgments are rejected',async()=>{
 let requests=0;
 await withEnv(async()=>{requests++;throw Error('Unexpected database request');},async()=>{
   const invalid=[
     {deliveryIds:[]},{deliveryIds:[0]},
     {deliveryIds:[2,2]},{deliveryIds:[2,-4]},
     {deliveryIds:['2']},{deliveryIds:[1.5]},
     {deliveryIds:new Array(21).fill(1)},
     {deliveryIds:[Number.MAX_SAFE_INTEGER+2]},
     {deliveryIds:[2],telegram_id:999},
     {deliveryIds:[2],recipientId:999},
     {deliveryIds:[2],p_telegram_id:999},
     {deliveryIds:null}
   ];
   for(const payload of invalid){
     const res=await handleRequest(post(123456,payload));
     assert.equal(res.status,400,JSON.stringify(payload));
   }
   assert.equal((await handleRequest(post(null,{deliveryIds:[10]}))).status,401);
   assert.equal(requests,0);
 });
});
test('Hub includes owner-specific receipt queue without a new network poll',async()=>{
 const calls=[];
 await withEnv(async(url,options)=>{
   calls.push({name:String(url).split('/').at(-1),body:JSON.parse(options.body)});
   return Response.json({unread_count:0,notifications:[],activity:[],
     card_deliveries:[{id:11,source:'admin',card_ids:['carti/music/epic']}]});
 },async()=>{
   const req=new Request('https://flip.test/api/flip?hub=1&telegram_id=99999',{
     headers:{'x-telegram-init-data':signed(3456)}});
   const res=await handleRequest(req);
   assert.equal(res.status,200);
   assert.equal((await res.json()).card_deliveries[0].id,11);
   assert.deepEqual(calls,[{name:'flip_event_snapshot',body:{p_telegram_id:3456}}]);
 });
});

function deliveryRuntime(){
 const timers=new Map(),handlers={};let nextId=1,root=null,ackCalls=[];
 const scroll={attrs:new Set(),
   setAttribute(k){this.attrs.add(k);},removeAttribute(k){this.attrs.delete(k);}};
 const cls=()=>({add(){},remove(){},contains(){return false;}});
 const label={textContent:''};
 const button={disabled:false};
 const phone={append(node){node.isConnected=true;}};
 const document={
  visibilityState:'visible',
  querySelector(selector){
    if(selector==='.phone')return phone;
    if(selector==='.phone .scroll')return scroll;
    return null;
  },
  getElementById(){return null;},
  createElement(){root={
    isConnected:false,hidden:false,classList:cls(),dataset:{},style:{setProperty(){}},
    setAttribute(){},innerHTML:'',
    querySelector(selector){
      if(selector==='[data-delivery-next] span')return label;
      if(selector==='[data-delivery-next]')return button;
      if(selector==='[data-delivery-all]')return {disabled:false};
      if(selector==='.flip-delivery-card-shell'||selector==='.flip-delivery-meta')
        return {classList:cls()};
      if(selector==='.flip-delivery-loading')return {textContent:''};
      return null;
    }
   };return root;},
  addEventListener(name,cb){handlers[name]=cb;}
 };
 const window={
   matchMedia:()=>({matches:false}),
   FLIPCatalog:{getCard:(artist,release,rarity)=>({
     id:[artist,release,rarity].join('/'),title:'ALBUM '+release,
     artist:artist.toUpperCase(),color:rarity,art:'./assets/'+rarity+'.webp'
   })},
   FLIPIcons:{render(){}}
 };
 const timer=(fn)=>{const id=nextId++;timers.set(id,fn);return id;};
 const clear=id=>timers.delete(id);
 runInNewContext(read('src/scripts/delivery-reveal.js'),{
   window,document,setTimeout:timer,clearTimeout:clear
 });
 const flush=()=>{
   let count=0;
   while(timers.size&&count++<30){
     const [id,fn]=timers.entries().next().value;timers.delete(id);fn();
   }
   assert.ok(count<30,'Delivery animation has infinite timer loop');
 };
 const click=selector=>{
   const event={target:{
     closest(query){return query===selector?{}:null;}
   }};
   handlers.click(event);
 };
 const enqueue=(items,options={})=>window.FLIPDelivery.enqueue(items,{
   onAcknowledge:async ids=>{ackCalls.push(ids);return {ok:true,acknowledged:ids.length};},
   onRefresh:async()=>{},...options
 });
 return {window,document,flush,click,enqueue,ackCalls,
   get root(){return root;},scroll};
}
const gift={id:11,source:'admin',card_ids:['carti/music/epic'],
  from:'FLIP TEAM'};
const trade={id:12,source:'trade',
  card_ids:['carti/die-lit/legendary','travis/utopia/mythic'],
  from:'Other player'};
test('Cinematic gift and three-card trade queue acknowledges only after the last card',async()=>{
 const ui=deliveryRuntime();
 ui.enqueue([gift,trade]);
 ui.enqueue([gift,trade]); // duplicate hub updates cannot open twice
 ui.flush();
 assert.equal(ui.window.FLIPDelivery.isOpen(),true);
 assert.match(ui.root.innerHTML,/ТЕБЕ ПОДАРИЛИ/);
 assert.match(ui.root.innerHTML,/ALBUM music/);
 assert.match(ui.root.innerHTML,/EPIC/);
 assert.equal(ui.ackCalls.length,0);
 ui.click('[data-delivery-next]');ui.flush();
 assert.match(ui.root.innerHTML,/ОБМЕН ЗАВЕРШЁН/);
 assert.match(ui.root.innerHTML,/ALBUM die-lit/);
 assert.match(ui.root.innerHTML,/LEGENDARY/);
 ui.click('[data-delivery-next]');ui.flush();
 assert.match(ui.root.innerHTML,/MYTHIC/);
 assert.match(ui.root.innerHTML,/ALBUM utopia/);
 assert.equal(ui.ackCalls.length,0);
 ui.click('[data-delivery-next]');
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(ui.ackCalls.map(ids=>Array.from(ids)),[[11,12]]);
 assert.equal(ui.window.FLIPDelivery.isOpen(),false);
 assert.equal(ui.root.hidden,true);
 assert.equal(ui.scroll.attrs.has('inert'),false);
});
test('Later/dismiss leaves receipt pending and it can reappear on a fresh launch',()=>{
 const ui=deliveryRuntime();
 ui.enqueue([gift]);ui.flush();
 assert.equal(ui.window.FLIPDelivery.isOpen(),true);
 ui.click('[data-delivery-later]');
 assert.equal(ui.window.FLIPDelivery.isOpen(),false);
 assert.equal(ui.ackCalls.length,0);
 ui.enqueue([gift]);ui.flush();
 assert.equal(ui.window.FLIPDelivery.isOpen(),false,'Deferred receipt stays quiet in same session');
 const next=deliveryRuntime();
 next.enqueue([gift]);next.flush();
 assert.equal(next.window.FLIPDelivery.isOpen(),true,'Unacknowledged gift appears after restart');
});
test('Fresh gifts can reconcile inventory without restarting or touching other accounts',async()=>{
 const calls=[];
 await withEnv(async(url,opts)=>{
   calls.push({name:String(url).split('/').at(-1),payload:JSON.parse(opts.body)});
   return Response.json({inventory:[],discovered:[],balance:40,level:3});
 },async()=>{
   const req=new Request('https://flip.test/api/flip?inventory=1&telegram_id=999',{
     headers:{'x-telegram-init-data':signed(4567)}});
   const res=await handleRequest(req);
   assert.equal(res.status,200);
   assert.equal((await res.json()).balance,40);
   assert.deepEqual(calls,[{name:'flip_snapshot',payload:{p_telegram_id:4567}}]);
 });
 const app=read('src/scripts/app.js'),server=read('src/scripts/server.js');
 assert.match(app,/if\(hasNewCards&&bridge\?\.refreshInventory\)/);
 assert.match(app,/bridge\.refreshInventory\(\)\.then\(snapshot=>/);
 assert.match(server,/bridge\.refreshInventory=async\(\)=>/);
 assert.match(server,/\?inventory=1/);
});

test('The receipt layer is independent from the existing roulette and pack reveal',()=>{
 const ui=deliveryRuntime();
 assert.equal(ui.window.FLIPDelivery.isOpen(),false);
 ui.enqueue([gift]);ui.flush();
 assert.match(ui.root.innerHTML,/flip-delivery-card-shell/);
 assert.match(ui.root.innerHTML,/flip-delivery-particles/);
 assert.match(ui.root.innerHTML,/flip-delivery-card/);
 assert.match(ui.root.innerHTML,/flip-delivery-later/);
 assert.match(ui.root.innerHTML,/flip-delivery-primary/);
 assert.doesNotMatch(read('src/scripts/delivery-reveal.js'),/crypto\.randomUUID\(\)|fetch\(/);
});
test('Migration records genuine post-release deliveries, never alters awarded inventory',()=>{
 const sql=read('sql/017_flip_v0963_card_deliveries.sql');
 assert.match(sql,/create table if not exists public\.flip_card_deliveries/);
 assert.match(sql,/after insert on public\.flip_admin_actions/);
 assert.match(sql,/after update of status on public\.flip_trades/);
 assert.match(sql,/new\.status='accepted' and old\.status is distinct from new\.status/);
 assert.match(sql,/new\.sender_id,'trade'/);
 assert.match(sql,/new\.recipient_id,'trade'/);
 assert.match(sql,/coalesce\(new\.want_cards,array\[new\.want_card_id\]\)/);
 assert.match(sql,/coalesce\(new\.offer_cards,array\[new\.offer_card_id\]\)/);
 assert.match(sql,/seen_at is null/);
 assert.match(sql,/on conflict\(source_key\) do nothing/);
 assert.match(sql,/where d\.telegram_id=p_telegram_id/);
 assert.match(sql,/v_owned<>v_total/);
 assert.match(sql,/raise exception 'DELIVERY_NOT_FOUND'/);
 assert.match(sql,/alter table public\.flip_card_deliveries enable row level security/);
 assert.match(sql,/from public,anon,authenticated/);
 assert.match(sql,/to service_role/);
 assert.doesNotMatch(sql,/update public\.flip_inventory/);
 assert.doesNotMatch(sql,/insert into public\.flip_inventory/);
 assert.doesNotMatch(sql,/select.+from public\.flip_admin_actions a.*insert into public\.flip_card_deliveries/s);
});
test('Delivery styles are animated, reduced-motion friendly and iPhone-emoji independent',()=>{
 const css=read('src/styles/delivery-reveal.css');
 const js=read('src/scripts/delivery-reveal.js');
 const html=read('index.html');
 assert.match(css,/perspective:1100px/);
 assert.match(css,/rotateY\(180deg\)/);
 assert.match(css,/@keyframes delivery-particle/);
 assert.match(css,/@keyframes delivery-hidden-pulse/);
 assert.match(css,/@keyframes delivery-mythic-light/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(js,/data-delivery-all/);
 assert.match(js,/window\.FLIPIcons\?\.render\(root\)/);
 assert.match(js,/document\.visibilityState==='hidden'/);
 assert.match(html,/src\/scripts\/delivery-reveal\.js\?v=0\.9\.6\.3/);
 assert.match(html,/src\/styles\/delivery-reveal\.css\?v=0\.9\.6\.3/);
 assert.match(html,/src\/scripts\/app\.js\?v=0\.9\.6\.3/);
 assert.match(html,/src\/scripts\/server\.js\?v=0\.9\.6\.3/);
 assert.equal(JSON.parse(read('package.json')).version,'0.9.6.3');
 assert.match(read('api/flip.js'),/version:'0\.9\.6\.3'/);
});
test('Existing hub poll is reused for receipts and no new polling interval is added',()=>{
 const app=read('src/scripts/app.js');
 const bridge=read('src/scripts/server.js');
 assert.match(app,/window\.FLIPDelivery\?\.enqueue\(data\?\.card_deliveries/);
 assert.match(app,/onAcknowledge:ids=>bridge\.ackCardDeliveries\(ids\)/);
 assert.match(app,/refreshHub\(\{rerender:true\}\)/);
 assert.match(app,/45000/);
 assert.match(bridge,/bridge\.ackCardDeliveries=async ids=>/);
 assert.match(bridge,/request\('ack_card_deliveries',crypto\.randomUUID\(\),\{deliveryIds:ids\}\)/);
 assert.doesNotMatch(bridge,/setInterval\([^)]*delivery/i);
});
