import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function screen(){
 const window={FLIPCatalog:{getCard:(artist,release,rarity)=>({
   id:[artist,release,rarity].join('/'),artist,title:release,rarity,color:rarity,
   art:'./src/assets/'+artist+'/'+release+'/'+rarity+'.webp'
  })},FLIPActivity:{publicStats:()=>'<section class="content-card">STATS</section>'}};
 runInNewContext(read('src/scripts/profile-cosmetics.js'),{window});
 runInNewContext(read('src/scripts/showcase.js'),{window});
 return window.FLIPShowcase;
}
const publicId='11111111-1111-4111-8111-111111111111';
const base={public_id:publicId,username:'guest',level:9,xp:350,xp_to_next:500,cp:1401.85,
 ranked_cards:148,ranked_variants:78,slot_count:6,appearance:{
 background:'midnight-grid',showcase_skin:'midnight-vault',frame_color:'blue'},
 pinned_badges:[],badges:[],slots:[
  {slot:1,card_id:'carti/music/mythic'},{slot:2,card_id:'carti/wlr/mythic'},
  {slot:3,card_id:'yeat/up2me/rare'},{slot:4,card_id:null},{slot:5,card_id:null},{slot:6,card_id:null}
 ]};
test('Public identity shows real XP on the same adaptive bar as own profile',()=>{
 const show=screen(),html=show.publicPage(base);
 assert.match(html,/flip-identity flip-profile-themed flip-bg-midnight-grid/);
 assert.match(html,/role="progressbar" aria-label="Прогресс уровня"/);
 assert.match(html,/aria-valuemax="500"/);
 assert.match(html,/aria-valuenow="350"/);
 assert.match(html,/style="width:70%"/);
 assert.match(html,/350 \/ 500 XP/);
 assert.match(html,/СЛЕДУЮЩИЙ УРОВЕНЬ/);
 const css=read('src/styles/public-profile-v09135.css');
 assert.match(css,/\.flip-public-profile \.flip-identity-progress>div\{/);
 assert.match(css,/background:var\(--identity-ink\)/);
 assert.match(css,/\.flip-public-profile \.flip-identity-progress-caption span:first-child\{/);
 assert.match(css,/color:var\(--identity-ink\)/);
});
test('Public profile without title or favorite artist is compact, but always has level progress',()=>{
 const html=screen().publicPage({...base,appearance:{background:'pastel-dream'},
  favorite_artist:null,slots:[],slot_count:3,xp:0,xp_to_next:500});
 assert.match(html,/flip-bg-pastel-dream/);
 assert.match(html,/role="progressbar"/);
 assert.match(html,/0 \/ 500 XP/);
 assert.match(html,/Игрок пока не добавил карточки в витрину/);
 assert.doesNotMatch(html,/class="flip-showcase-empty is-public"/);
 const css=read('src/styles/public-profile-v09135.css');
 assert.match(css,/\.flip-public-profile \.flip-identity\{\s*min-height:0/);
 assert.match(css,/height:auto/);
});
test('Six unlocked slots, three filled: public visitors see exactly three cards',()=>{
 const show=screen(),html=show.publicPage(base);
 assert.match(html,/TOP 3/);
 assert.equal((html.match(/data-showcase-view-card=/g)||[]).length,3);
 assert.doesNotMatch(html,/class="flip-showcase-empty is-public"/);
 assert.doesNotMatch(html,/МЕСТО 4|МЕСТО 5|МЕСТО 6/);
 const own=show.own(base,{online:true});
 assert.match(own,/3 \/ 6/);
 assert.match(own,/МЕСТО 4/);
 assert.match(own,/МЕСТО 6/);
});
test('Noncontiguous public slots keep the chosen cards, without phantom placeholders',()=>{
 const html=screen().publicPage({...base,slots:[
  {slot:1,card_id:'carti/music/mythic'},{slot:6,card_id:'yeat/up2me/rare'}]});
 assert.match(html,/TOP 2/);
 assert.equal((html.match(/data-showcase-view-card=/g)||[]).length,2);
 assert.match(html,/carti\/music\/mythic/);
 assert.match(html,/yeat\/up2me\/rare/);
 assert.doesNotMatch(html,/class="flip-showcase-empty is-public"/);
});
test('Statistics have player-friendly labels, no test/ranked vocabulary',()=>{
 const app=read('src/scripts/app.js'),show=read('src/scripts/showcase.js');
 for(const js of [app,show]){
  assert.match(js,/<small>КАРТОЧЕК<\/small>/);
  assert.match(js,/<small>УНИКАЛЬНЫХ<\/small>/);
  assert.doesNotMatch(js,/РЕЙТИНГОВЫХ/);
 }
 const publicHtml=screen().publicPage(base);
 assert.match(publicHtml,/<small>КАРТОЧЕК<\/small>/);
 assert.match(publicHtml,/<small>УНИКАЛЬНЫХ<\/small>/);
 assert.doesNotMatch(publicHtml,/РЕЙТИНГОВЫХ КАРТОЧЕК|РАЗНЫХ РЕЙТИНГОВЫХ/);
 assert.match(read('src/scripts/admin.js'),/Тестовая \/ административная/);
});
test('Public SQL adds only per-level XP, never wallet or internal inventory',()=>{
 const sql=read('sql/026_flip_v09135_public_progress.sql');
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.flip_public_profile/);
 assert.match(sql,/'xp',p\.xp,'xp_to_next',100\+50\*\(p\.level-1\)/);
 assert.match(sql,/'level',p\.level/);
 assert.doesNotMatch(sql,/'balance',p\.balance|'test_quantity',/);
 assert.doesNotMatch(sql,/TRUNCATE|DELETE FROM public\.flip_players/i);
});
test('Telegram WebView loads updated styles and scripts without changing currency or XP rules',()=>{
 const html=read('index.html');
 for(const file of ['showcase.js','profile-cosmetics.js'])
  assert.ok(html.includes('src/scripts/'+file+'?v=0.9.13.6'),file);
 assert.ok(html.includes('src/scripts/app.js?v=0.9.13.5'));
 assert.ok(html.includes('src/styles/public-profile-v09135.css?v=0.9.13.6'));
 assert.equal(JSON.parse(read('package.json')).version,'0.9.13');
});
