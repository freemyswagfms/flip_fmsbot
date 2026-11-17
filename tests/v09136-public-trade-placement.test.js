import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const id='12345678-1234-4234-8234-123456789abc';
function ui(){
 const window={FLIPCatalog:{getCard:()=>null}};
 runInNewContext(read('src/scripts/profile-cosmetics.js'),{window});
 runInNewContext(read('src/scripts/showcase.js'),{window});
 return window;
}
const profile={public_id:id,username:'collector',level:12,xp:240,xp_to_next:650,
 cp:1400,ranked_cards:100,ranked_variants:50,slot_count:6,slots:[],
 badges:[],pinned_badges:[],appearance:{background:'pastel-dream',
 avatar_frame:'pulse',frame_color:'pink'}};
test('Exchange is inside the identity header, leaving profile and showcase consecutive',()=>{
 const html=ui().FLIPShowcase.publicPage(profile);
 const header=html.indexOf('class="flip-identity-top"'),
 identityEnd=html.indexOf('</section>',header),
 trade=html.indexOf('data-profile-trade="'+id+'"'),
 showcase=html.indexOf('class="content-card flip-showcase-profile');
 assert.ok(header>=0&&identityEnd>header&&trade>header&&trade<identityEnd,
  'Trade button must be inside the hero top row');
 assert.ok(showcase>identityEnd);
 assert.doesNotMatch(html.slice(identityEnd,showcase),
  /button|data-profile-trade|flip-profile-trade-action/);
 assert.equal((html.match(/data-profile-trade=/g)||[]).length,1);
 assert.match(html,/class="flip-identity-trade"/);
 assert.match(html,/ОБМЕН/);
 assert.match(html,/flip-bg-pastel-dream/);
 assert.match(html,/role="progressbar"/);
});
test('Own profile and invalid targets never show trade',()=>{
 const x=ui().FLIPShowcase;
 for(const {data,options} of [
  {data:profile,options:{isOwn:true}},
  {data:{...profile,public_id:'bad'},options:{}},
  {data:{...profile,public_id:null},options:{}}
 ]){
  const html=x.publicPage(data,options);
  assert.doesNotMatch(html,/data-profile-trade|flip-identity-trade/);
  assert.match(html,/PLAYER PROFILE/);
  assert.match(html,/ВИТРИНА ИГРОКА/);
 }
 const hero=ui().FLIPProfileCosmetics.identity({profile,name:'Collector',
  avatar:'AVATAR',level:12,xp:240,xpToNext:650,publicMode:false,tradePublicId:id});
 assert.doesNotMatch(hero,/data-profile-trade|flip-identity-trade/);
 assert.match(hero,/YOUR IDENTITY/);
});
test('Tiny action uses theme-accent ink and mobile sizing, retains working deep link',()=>{
 const css=read('src/styles/public-profile-v09135.css');
 assert.match(css,/\.flip-public-profile \.flip-identity-top \.flip-identity-trade\{/);
 assert.match(css,/border:1px solid var\(--identity-edge\)/);
 assert.match(css,/color:var\(--identity-ink\)/);
 assert.match(css,/background:rgba\(8,16,17,\.44\)/);
 assert.match(css,/@media\(max-width:355px\)/);
 assert.doesNotMatch(css,/\.flip-identity-trade\{[^}]*width:100%/);
 assert.match(read('src/scripts/profile-cosmetics.js'),/aria-label="Предложить обмен с /);
 const app=read('src/scripts/app.js');
 assert.match(app,/profileTrade\.dataset\.profileTrade/);
 assert.match(app,/window\.FLIPTrades\?\.openWithProfile\?\.\(publicId\)/);
});
test('New CSS and JS are cache-busted without changing economic rules or version',()=>{
 const html=read('index.html'),pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.version,'0.9.13');
 for(const p of ['showcase.js','profile-cosmetics.js'])
  assert.ok(html.includes('src/scripts/'+p+'?v='+(p==='profile-cosmetics.js'?'0.9.13.7':'0.9.13.6')));
 assert.ok(html.includes('src/styles/public-profile-v09135.css?v=0.9.13.6'));
});
