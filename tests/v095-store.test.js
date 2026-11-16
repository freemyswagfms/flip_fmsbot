import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {handleRequest} from '../api/flip.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const token='12345:FLIP_STORE_VERSION_095';
const rid='11111111-1111-4111-8111-111111111111';
function signed(id){
 const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),
   user:JSON.stringify({id,first_name:'Store User'})});
 const key=createHmac('sha256','WebAppData').update(token).digest();
 params.set('hash',createHmac('sha256',key).update([...params.entries()]
   .sort(([a],[b])=>a.localeCompare(b,'en')).map(([a,b])=>a+'='+b).join('\n')).digest('hex'));
 return params.toString();
}
async function withEnv(fetcher,fn){
 const originalEnv=process.env,oldFetch=globalThis.fetch;
 process.env={...originalEnv,TELEGRAM_BOT_TOKEN:token,
  SUPABASE_URL:'https://flip-test.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_mock'};
 globalThis.fetch=fetcher;
 try{return await fn();}finally{process.env=originalEnv;globalThis.fetch=oldFetch;}
}
function request(user,body){
 return new Request('https://flip.test/api/flip',{
   method:'POST',
   headers:{'x-telegram-init-data':signed(user),'content-type':'application/json'},
   body:JSON.stringify({requestId:rid,...body})
 });
}
test('The shop snapshot belongs only to the verified Telegram account',async()=>{
 const calls=[];
 await withEnv(async(url,opts)=>{
  calls.push({method:String(url).split('/').at(-1),payload:JSON.parse(opts.body)});
  return Response.json({packs:[],history:[],packs_today:0,daily_limit:10});
 },async()=>{
  const response=await handleRequest(new Request('https://flip.test/api/flip?store=1&telegram_id=987654',{
   headers:{'x-telegram-init-data':signed(12345)}
  }));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{packs:[],history:[],packs_today:0,daily_limit:10});
  assert.deepEqual(calls,[{method:'flip_shop_snapshot',payload:{p_telegram_id:12345}}]);
 });
});
test('Theme purchase is signed, idempotent and never accepts client prices or recipient ID',async()=>{
 const calls=[];
 await withEnv(async(url,opts)=>{
  calls.push({method:String(url).split('/').at(-1),payload:JSON.parse(opts.body)});
  return Response.json({action:'theme_pack',pack_type:'archive',price:250,
    card_ids:['carti/die-lit/epic','carti/die-lit/rare','carti/die-lit/common'],
    state:{inventory:[],discovered:[]}});
 },async()=>{
  const result=await handleRequest(request(45678,{action:'theme_pack',theme:'archive'}));
  assert.equal(result.status,200);
  assert.equal((await result.json()).price,250);
  assert.deepEqual(calls,[{method:'flip_buy_theme_pack',
   payload:{p_telegram_id:45678,p_request_id:rid,p_theme:'archive'}}]);
 });
});
test('Untrusted pack selection and fake price adjustments are rejected before SQL',async()=>{
 let calls=0;
 await withEnv(async()=>{calls++;throw Error('No RPC expected');},async()=>{
  const invalid=[
   {action:'theme_pack',theme:'carti'},
   {action:'theme_pack',theme:'standard'},
   {action:'theme_pack',theme:'archive',price:1},
   {action:'theme_pack',theme:'archive',recipientId:999},
   {action:'theme_pack',theme:'archive',p_telegram_id:999},
   {action:'theme_pack',theme:null},
   {action:'theme_pack',theme:'new-era',quantity:20}
  ];
  for(const b of invalid)assert.equal((await handleRequest(request(12345,b))).status,400);
  const unsigned=await handleRequest(new Request('https://flip.test/api/flip?store=1'));
  assert.equal(unsigned.status,401);
  assert.equal(calls,0);
 });
});
test('Shop UI uses server prices, approved periods and genuine collectible artwork',()=>{
 const window={
  FLIPCatalog:{getCard:(artist,release,rarity)=>({
   id:[artist,release,rarity].join('/'),artist:'Artist',
   title:'Record',rarity:rarity.toUpperCase(),color:rarity,
   art:'./src/assets/'+artist+'/'+release+'/'+rarity+'.webp'
  })}
 };
 runInNewContext(source('src/scripts/store.js'),{window});
 const store=window.FLIPStore;
 const shop={packs:[
  {id:'standard',name:'STANDARD PACK',price:200,available:true,previews:[]},
  {id:'archive',name:'ARCHIVE PACK',price:250,available:true,collection_size:11,
    previews:['carti/die-lit/epic']},
  {id:'new-era',name:'NEW ERA PACK',price:250,available:true,collection_size:26,
    previews:['carti/music/epic']}
 ],packs_today:8,daily_limit:10,history:[]};
 const page=store.page({shop,state:{balance:2000,packsToday:8},live:true});
 assert.match(page,/data-shop-buy="standard"/);
 assert.match(page,/data-shop-buy="archive"/);
 assert.match(page,/data-shop-buy="new-era"/);
 assert.match(page,/ОСТАЛОСЬ 2 \/ 10/);
 assert.match(page,/250 F/);
 assert.match(page,/src\/assets\/carti\/music\/epic\.webp/);
 assert.doesNotMatch(page,/ПАК PLAYBOI CARTI|ARTIST PACK/i);
 assert.match(page,/Pity действует только на бесплатные дропы/);
 const disabled=store.page({shop:{...shop,packs_today:10},state:{balance:1000,packsToday:10},live:true});
 assert.match(disabled,/ЛИМИТ НА СЕГОДНЯ/);
 const owner=store.page({shop:{...shop,unlimited:true,packs_today:0},
   state:{balance:3000,unlimitedPacks:true},live:true});
 assert.match(owner,/∞ БЕЗ ЛИМИТА/);
 const mock=store.page({shop:null,state:{balance:1500,packsToday:0},live:false,demo:true});
 assert.match(mock,/ОТКРЫТЬ ДЕМО/);
 assert.match(mock,/ДОСТУПНО В TELEGRAM/);
 const blocked=store.page({shop:null,state:{balance:1500},live:false,demo:false});
 assert.doesNotMatch(blocked,/ОТКРЫТЬ ДЕМО/);
});
test('Private historical purchases render three original cards and hide all account IDs',()=>{
 const window={FLIPCatalog:{getCard:(a,r,rarity)=>({
  id:[a,r,rarity].join('/'),artist:'Artist',title:'Title',
  rarity:'Rare',color:rarity,art:'./src/assets/'+a+'/'+r+'/'+rarity+'.webp'
 })}};
 runInNewContext(source('src/scripts/store.js'),{window});
 const history=[{id:rid,date:'2026-11-16T00:00:00Z',
  pack_type:'archive',price:250,
  card_ids:['carti/die-lit/rare','carti/music/epic','carti/die-lit/mythic']}];
 const result=window.FLIPStore.page({shop:{packs:[],history},state:{balance:500},
  live:true,tab:'history'});
 assert.match(result,/−250 F/);
 assert.match(result,/ARCHIVE PACK/);
 assert.match(result,/data-shop-inspect="carti\/music\/epic"/);
 assert.equal((result.match(/data-shop-inspect=/g)||[]).length,3);
 assert.doesNotMatch(result,/telegram_id|recipientId|state\.balance/);
});
test('Reveal is visual only: three separate square cards, skip animation and hidden effect',()=>{
 const js=source('src/scripts/pack-reveal.js');
 const css=source('src/styles/store.css');
 assert.match(js,/received\.length!==3/);
 assert.match(js,/data-flip-pack-skip/);
 assert.match(js,/setTimeout\(\(\)=>reveal\(i\),delay\)/);
 assert.match(js,/function revealAll\(\)/);
 assert.match(js,/prefers-reduced-motion/);
 assert.match(css,/flip-pack-slot\.hidden \.flip-pack-front:after/);
 assert.match(css,/flip-pack-slot\.mythic \.flip-pack-front:before/);
 assert.match(css,/aspect-ratio:1\/1/);
 assert.doesNotMatch(js,/fetch\(|balance\s*[-+]=|crypto\.randomUUID/);
});
test('All player progress metrics treat themed packs the same as standard packs',()=>{
 const sql=source('sql/015_flip_v095_store.sql');
 assert.match(sql,/action in \('drop','pack','theme_pack'\)/);
 assert.match(sql,/v_balance:=p\.balance-250/);
 assert.match(sql,/v_xp:=p\.xp\+30/);
 assert.match(sql,/public\.flip_roll_rarity\(0,false\)/);
 assert.match(sql,/public\.flip_roll_rarity\(0,true\)/);
 assert.match(sql,/v_count>=10/);
 assert.match(sql,/p_theme='archive' and r\.release_year<2020/);
 assert.match(sql,/p_theme='new-era' and r\.release_year>=2020/);
 assert.match(sql,/jsonb_array_length/);
 assert.match(sql,/when 'jackpot_pack' then/);
 assert.match(sql,/when 'hidden_drop' then/);
 assert.match(sql,/p_theme not in \('archive','new-era'\)/);
 assert.match(sql,/to service_role/);
 assert.doesNotMatch(sql,/pity_misses=/);
});
