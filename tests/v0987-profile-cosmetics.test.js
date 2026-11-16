import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createHmac} from 'node:crypto';
import {handleRequest} from '../api/flip.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const card='carti/music/mythic',id='carti/music/mythic';
function modules(){
 const ctx={window:{
   FLIPCatalog:{getCard:(artist,release,rarity)=>({
     id:[artist,release,rarity].join('/'),artist:'Playboi Carti',title:'MUSIC',
     rarity:'Mythic',color:rarity,art:'./src/assets/'+[artist,release,rarity].join('/')+'.webp'
   })},
   FLIPActivity:{publicStats:()=>'<div class="statistics">STATS AFTER SHOWCASE</div>'},
 }};
 runInNewContext(read('src/scripts/profile-cosmetics.js'),ctx);
 runInNewContext(read('src/scripts/showcase.js'),ctx);
 return ctx.window;
}
const sample={
 username:'tester',first_name:'Test',level:7,cp:1337,ranked_cards:128,ranked_variants:72,
 slot_count:4,appearance:{background:'acid-signal',avatar_frame:'neon-ring',
  showcase_skin:'glass-cabinet',title:'archive-hunter'},
 favorite_artist:{id:'carti',name:'Playboi Carti'},
 slots:[{slot:1,card_id:card},{slot:2,card_id:null},{slot:3,card_id:null},{slot:4,card_id:null}],
 badges:[{code:'mythic_first',title:'Красная аура',symbol:'◆',badge:'mythic'}],
 pinned_badges:[{slot:1,code:'mythic_first',title:'Красная аура',symbol:'◆',badge:'mythic'}]
};
test('Profile is a collectible identity with verified cosmetic classes, avatar and favorite',()=>{
 const x=modules(),html=x.FLIPProfileCosmetics.identity({
   profile:sample,name:'Player Name',handle:'@tester',
   avatar:'<b>avatar</b>',level:7,xp:45,xpToNext:150});
 for(const fragment of ['Player Name','ARCHIVE HUNTER','LVL 7','1 337 CP','Playboi Carti',
   'flip-bg-acid-signal','flip-frame-neon-ring','flip-scene-glass-cabinet','45 / 150 XP'])
  assert.ok(html.includes(fragment),fragment);
 const bad=x.FLIPProfileCosmetics.classes({appearance:{background:'javascript:alert(1)'}});
 assert.doesNotMatch(bad,/javascript|alert/);
});
test('Owned showcase keeps 3 free slots and offers upgrades up to 6 without exposing Hidden',()=>{
 const x=modules();
 const three=x.FLIPShowcase.own({...sample,slot_count:3,slots:sample.slots.slice(0,3)},{online:true});
 assert.match(three,/3 \/ 3/);
 assert.equal((three.match(/data-cosmetic-open-shop/g)||[]).length,3);
 const six=x.FLIPShowcase.own({...sample,slot_count:6},{online:true});
 assert.match(six,/1 \/ 6/);
 assert.doesNotMatch(six,/data-cosmetic-open-shop/);
 assert.match(six,/data-showcase-view-card="carti\/music\/mythic"/);
 const edited=x.FLIPShowcase.editor({received:[{id:card,isTestCopy:false,
   artist:'Playboi Carti',title:'MUSIC',rarity:'Mythic'}]},
  {...sample,slot_count:6},6);
 assert.match(edited,/data-showcase-slot="6"/);
 assert.match(edited,/data-showcase-pick/);
});
test('Public profile puts the actual six-slot showcase BEFORE stats and pins badges',()=>{
 const x=modules();
 const html=x.FLIPShowcase.publicPage(sample);
 assert.ok(html.indexOf('ВИТРИНА ИГРОКА')<html.indexOf('СТАТИСТИКА'));
 assert.ok(html.indexOf('ВИТРИНА ИГРОКА')<html.indexOf('COLLECTION POINTS'));
 assert.match(html,/ЗНАКИ ОТЛИЧИЯ/);
 assert.match(html,/Красная аура/);
 assert.match(html,/ARCHIVE HUNTER/);
 assert.match(html,/PLAYER PROFILE/);
 assert.doesNotMatch(html,/Telegram ID|ИНВЕНТАРЬ КОСМЕТИКИ|owner_id/);
});
test('Cosmetic store has twelve whitelisted CSS editions and honest owned states',()=>{
 const x=modules();
 const items=[
 ['acid-signal','background',250],['midnight-grid','background',400],
 ['redline','background',600],['neon-ring','avatar_frame',150],
 ['liquid-chrome','avatar_frame',350],['pulse','avatar_frame',500],
 ['glass-cabinet','showcase_skin',350],['black-chrome','showcase_skin',550],
 ['red-velvet','showcase_skin',750],['archive-hunter','title',180],
 ['no-skips','title',240],['day-one','title',400]
 ].map(([id,kind,price])=>({id,kind,price,name:id.toUpperCase()}));
 const html=x.FLIPProfileCosmetics.shop({shop:{items,owned:['acid-signal','neon-ring'],
  slot_count:4,next_slot_price:600,balance:4000},profile:sample,
  player:{telegramName:'Amir',telegramAvatarUrl:'https://t.me/photo.jpg',
   balance:4000},online:true,previewId:'redline'});
 assert.equal((html.match(/class="flip-cosmetic-item /g)||[]).length,12);
 assert.match(html,/data-cosmetic-buy-slot/);
 assert.match(html,/600 F ↗/);
 assert.match(html,/ПРИМЕНЕНО/);
 assert.match(html,/data-cosmetic-equip="neon-ring"/);
 assert.match(html,/data-cosmetic-buy="redline"/);
 assert.match(html,/Amir/);
 assert.match(html,/src="https:\/\/t.me\/photo.jpg"/);
 assert.match(html,/flip-bg-redline/);
 assert.match(html,/flip-cosmetic-mini-showcase/);
 assert.doesNotMatch(html,/data-cosmetic-buy="acid-signal"/);
});
test('Favorite artist and pinned badge selectors only list catalog artists and earned badges',()=>{
 const x=modules();const html=x.FLIPProfileCosmetics.profileSettings(sample,
  [{id:'carti',name:'Playboi Carti',active:true},
   {id:'hidden',name:'Not Active',active:false}],{online:true});
 assert.match(html,/data-profile-favorite/);
 assert.match(html,/data-profile-pin="1"/);
 assert.match(html,/data-profile-pin="3"/);
 assert.match(html,/value="mythic_first"/);
 assert.doesNotMatch(html,/Not Active/);
 assert.match(html,/data-profile-open-cosmetics/);
});
test('Server enforces spend and validation, including role restrictions and all 3 prices',()=>{
 const sql=read('sql/021_flip_v0987_profile_cosmetics.sql');
 const api=read('api/flip.js');
 for(const [slot,price] of [[4,300],[5,600],[6,1200]]){
  assert.match(sql,new RegExp('WHEN '+slot+' THEN '+price));
 }
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/request_id uuid PRIMARY KEY/);
 assert.match(sql,/saved\.result/);
 assert.match(sql,/IF player\.balance<v_cost/);
 assert.match(sql,/c\.kind=p_kind/);
 assert.match(sql,/cl\.telegram_id=p_telegram_id AND cl\.achievement_code=p_badge_code/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.flip_public_profile/);
 assert.match(sql,/service_role/);
 assert.match(api,/body\.action==='profile_buy'/);
 assert.match(api,/p_telegram_id:user\.telegram_id/);
 assert.match(api,/PROFILE_SLOT_UNAVAILABLE/);
 assert.match(api,/slot<1\|\|slot>6/);
});
test('Live UI and cache versions include cosmetic JS before showcase, plus new styles',()=>{
 const html=read('index.html'),pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.version,'0.9.8.7');
 for(const path of ['profile-cosmetics.js','showcase.js','store.js','server.js','app.js']){
  assert.ok(html.includes('src/scripts/'+path+'?v=0.9.8.7'),path);
 }
 assert.ok(html.includes('src/styles/profile-cosmetics.css?v=0.9.8.7'));
 assert.ok(html.includes('src/styles/showcase.css?v=0.9.8.7'));
 assert.ok(html.indexOf('profile-cosmetics.js')<html.indexOf('showcase.js'));
 const css=read('src/styles/profile-cosmetics.css');
 assert.match(css,/@media\(max-width:380px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/flip-scene-red-velvet/);
 assert.match(css,/flip-frame-liquid-chrome/);
});
