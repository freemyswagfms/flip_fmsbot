import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createHmac} from 'node:crypto';
import {handleRequest} from '../api/flip.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const itemData=[
 ['acid-signal','background',250],['midnight-grid','background',400],
 ['redline','background',600],['pastel-dream','background',350],
 ['neon-ring','avatar_frame',150],['liquid-chrome','avatar_frame',350],
 ['pulse','avatar_frame',500],['aurora-flow','avatar_frame',600],
 ['glass-cabinet','showcase_skin',350],['black-chrome','showcase_skin',550],
 ['red-velvet','showcase_skin',750],['blush-gallery','showcase_skin',450],
 ['archive-hunter','title',180],['no-skips','title',240],['day-one','title',400]
 ];
const items=itemData.map(([id,kind,price])=>({id,kind,price,name:id.toUpperCase()}));
function view(){
 const window={
  FLIPCatalog:{getCard:(artist,release,rarity)=>({
   id:[artist,release,rarity].join('/'),artist,title:release,
   rarity,color:rarity,art:'./src/assets/'+artist+'/'+release+'/'+rarity+'.webp'
  })},
  FLIPActivity:{publicStats:()=>'<section class="content-card flip-profile-stats">STATS</section>'}
 };
 runInNewContext(read('src/scripts/profile-cosmetics.js'),{window});
 runInNewContext(read('src/scripts/showcase.js'),{window});
 return window;
}
const profile={
 username:'demo',first_name:'Demo',level:9,cp:1384.5,
 ranked_cards:138,ranked_variants:72,slot_count:6,
 appearance:{background:'pastel-dream',avatar_frame:'pulse',
  frame_color:'pink',showcase_skin:'blush-gallery',title:'day-one'},
 slots:Array.from({length:6},(_,i)=>({slot:i+1,card_id:i===0?'carti/music/mythic':null})),
 pinned_badges:[{slot:1,title:'Идеальная сделка',badge:'trade',symbol:'⇄'}],
 badges:[{title:'Мастер сделок',badge:'trade',symbol:'⇄'}]
};
test('Four animation styles can share one free 10-color palette, including RGB and Glitch',()=>{
 const x=view().FLIPProfileCosmetics;
 const choices=x.frameColors;
 assert.equal(choices.length,10);
 assert.equal(new Set(Array.from(choices,([key])=>key)).size,10);
 for(const name of ['green','pink','red','orange','blue','white','violet','cyan','rgb','glitch'])
  assert.ok(choices.some(([key])=>key===name),name);
 assert.equal(x.safeColor('<script>'),'green');
 assert.match(x.classes(profile),/flip-frame-pulse/);
 assert.match(x.classes(profile),/flip-color-pink/);
 assert.match(x.classes(profile,{kind:'avatar_frame',id:'aurora-flow'}),/flip-frame-aurora-flow/);
 assert.match(x.classes(profile,{kind:'avatar_frame',id:'aurora-flow'}),/flip-color-pink/);
});
test('Shop displays 15 items with centered square avatar previews and free color buttons',()=>{
 const x=view().FLIPProfileCosmetics;
 const html=x.shop({shop:{items,owned:['pulse'],slot_count:6,balance:3000},
  player:{telegramName:'Demo'},profile,online:true,previewId:'aurora-flow'});
 assert.equal((html.match(/class="flip-cosmetic-item /g)||[]).length,15);
 assert.equal((html.match(/data-profile-frame-color="/g)||[]).length,10);
 assert.match(html,/data-profile-frame-color="pink"[^>]+aria-label="Розовый"[^>]+aria-pressed="true"/);
 for(const id of ['neon-ring','liquid-chrome','pulse','aurora-flow'])
  assert.match(html,new RegExp('flip-frame-'+id));
 assert.equal((html.match(/flip-cosmetic-sample-avatar/g)||[]).length,4);
 assert.match(html,/flip-cosmetic-preview-avatar">F<\/span>/);
 assert.doesNotMatch(html,/flip-frame-sample-ring/);
 assert.match(html,/flip-cosmetic-preview-shell/);
 assert.match(html,/ЦВЕТ РАМКИ/);
 assert.match(html,/БЕСПЛАТНО/);
 assert.match(html,/15 ПРЕДМЕТОВ/);
 assert.match(html,/data-cosmetic-buy="aurora-flow"/);
 assert.doesNotMatch(html,/data-cosmetic-buy="pulse"/);
});
test('Pastel identity and pink showcase appear publicly with consistent compact lower panel',()=>{
 const x=view();
 const html=x.FLIPShowcase.publicPage(profile);
 for(const fragment of ['flip-bg-pastel-dream','flip-scene-blush-gallery',
   'flip-color-pink','flip-profile-lower','flip-profile-featured',
   'flip-showcase-stats-public','flip-profile-stats','flip-profile-all-badges']){
  assert.ok(html.includes(fragment),fragment);
 }
 const start=html.indexOf('flip-profile-lower');
 assert.ok(start>html.indexOf('ВИТРИНА ИГРОКА'));
 assert.ok(html.indexOf('ЗНАКИ ОТЛИЧИЯ')<html.indexOf('COLLECTION POINTS'));
 assert.ok(html.indexOf('COLLECTION POINTS')<html.indexOf('STATS'));
 assert.doesNotMatch(html,/telegram_id|owned_cosmetics|balance/);
});
test('Frame overlay uses a matching 78/70 square shell, animates independently, and respects motion settings',()=>{
 const css=read('src/styles/profile-cosmetics.css');
 assert.match(css,/width:78px;height:78px;flex:0 0 78px/);
 assert.match(css,/width:70px;height:70px;min-width:70px/);
 assert.match(css,/\.flip-identity-avatar::before,\.flip-identity-avatar::after/);
 assert.match(css,/inset:4px;border-radius:20px/);
 for(const effect of ['Neon','Chrome','Pulse','Aurora','Rainbow','Glitch'])
  assert.match(css,new RegExp('@keyframes flipFrame'+effect));
 assert.match(css,/\.flip-frame-pulse \.flip-identity-avatar::after/);
 assert.match(css,/\.flip-cosmetic-sample-avatar/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/\.flip-bg-pastel-dream/);
 assert.match(css,/\.flip-scene-blush-gallery\.flip-showcase-profile/);
 assert.match(css,/\.flip-profile-lower\.flip-scene-blush-gallery/);
 assert.match(css,/\.flip-profile-lower \.flip-stat-grid\{margin:0!important/);
});
test('Migration only adds safe colors and three priced items, never changes existing purchases',()=>{
 const sql=read('sql/022_flip_v0988_profile_polish.sql');
 for(const entry of [['pastel-dream',350],['blush-gallery',450],['aurora-flow',600]]){
  assert.match(sql,new RegExp("'"+entry[0]+"'[^\\n]*?"+entry[1]));
 }
 assert.match(sql,/ADD COLUMN IF NOT EXISTS frame_color text NOT NULL DEFAULT 'green'/);
 assert.match(sql,/frame_color.*COALESCE\(st\.frame_color,'green'\)/);
 assert.match(sql,/PROFILE_BAD_FRAME_COLOR/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.flip_profile_frame_color/);
 assert.match(sql,/TO service_role/);
 const frameFn=sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.flip_profile_frame_color'));
 assert.doesNotMatch(frameFn,/balance\s*=\s*balance-|flip_profile_purchases|buy_cosmetic/);
});
const token='123456:FRAME-COLOR-TEST';
function signed(id){
 const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),
  user:JSON.stringify({id,username:'tester'})});
 const secret=createHmac('sha256','WebAppData').update(token).digest();
 params.set('hash',createHmac('sha256',secret).update([...params]
  .sort(([a],[b])=>a.localeCompare(b,'en')).map(([a,b])=>a+'='+b).join('\n')).digest('hex'));
 return params.toString();
}
test('Frame color request uses signed player only and rejects forged actor or invalid colors',async()=>{
 const env=process.env,original=globalThis.fetch,calls=[];
 process.env={...env,TELEGRAM_BOT_TOKEN:token,SUPABASE_URL:'https://test.supabase.co',
  SUPABASE_SECRET_KEY:'sb_secret_test'};
 globalThis.fetch=async(url,options={})=>{
  const name=String(url).split('/').at(-1);
  const body=JSON.parse(options.body||'{}');
  calls.push({name,body});
  if(name==='flip_player_is_banned')return Response.json(false);
  if(name==='flip_profile_frame_color')return Response.json({ok:true,
   profile:{appearance:{frame_color:body.p_color}}});
  throw Error('Unexpected RPC '+name);
 };
 const req=payload=>new Request('https://flip.test/api/flip',{
  method:'POST',headers:{'content-type':'application/json',
   'x-telegram-init-data':signed(87540)},
  body:JSON.stringify({requestId:'22222222-2222-4222-8222-222222222222',...payload})});
 try{
  const good=await handleRequest(req({action:'profile_frame_color',color:'rgb'}));
  assert.equal(good.status,200);
  assert.equal((await good.json()).profile.appearance.frame_color,'rgb');
  assert.deepEqual(calls.filter(x=>x.name==='flip_profile_frame_color').map(x=>x.body),
   [{p_telegram_id:87540,p_color:'rgb'}]);
  const bad=await handleRequest(req({action:'profile_frame_color',color:'<script>'}));
  assert.equal(bad.status,400);
  const forged=await handleRequest(req({action:'profile_frame_color',color:'pink',telegramId:9999}));
  assert.equal(forged.status,400);
  assert.equal(calls.filter(x=>x.name==='flip_profile_frame_color').length,1);
 }finally{process.env=env;globalThis.fetch=original}
});
test('Release stamps preserve the unaffected store but refresh changed assets',()=>{
 const pkg=JSON.parse(read('package.json')),index=read('index.html');
 assert.equal(pkg.version,'0.9.9');
 for(const filename of ['server.js']){
  assert.ok(index.includes('src/scripts/'+filename+'?v=0.9.8.8'),filename);
 }
 assert.ok(index.includes('src/scripts/profile-cosmetics.js?v=0.9.9'));
 assert.ok(index.includes('src/scripts/app.js?v=0.9.9'));
 assert.ok(index.includes('src/scripts/showcase.js?v=0.9.9'));
 assert.ok(index.includes('src/styles/profile-cosmetics.css?v=0.9.9'));
 assert.ok(index.includes('src/scripts/store.js?v=0.9.8.7'));
 assert.ok(read('api/flip.js').includes("version:'0.9.9'"));
});
