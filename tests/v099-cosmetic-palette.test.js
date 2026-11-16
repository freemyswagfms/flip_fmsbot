import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function setup(){
 const window={FLIPCatalog:{getCard:()=>null},
  FLIPActivity:{publicStats:()=>'<section class="content-card flip-profile-stats"><span class="flip-stat-symbol">◈</span></section>'}};
 runInNewContext(read('src/scripts/profile-cosmetics.js'),{window});
 runInNewContext(read('src/scripts/showcase.js'),{window});
 return window;
}
const additions=[['lunar-haze','background','LUNAR HAZE',500],
 ['prism-shift','background','PRISM SHIFT',650],
 ['midnight-vault','showcase_skin','MIDNIGHT VAULT',600],
 ['prism-chamber','showcase_skin','PRISM CHAMBER',800]];
test('Each independent server-owned category now has six whitelisted styles',()=>{
 const x=setup().FLIPProfileCosmetics;
 const bg=['acid-signal','midnight-grid','redline','pastel-dream','lunar-haze','prism-shift'];
 const scenes=['glass-cabinet','black-chrome','red-velvet','blush-gallery','midnight-vault','prism-chamber'];
 assert.equal(bg.length,6);assert.equal(scenes.length,6);
 for(const id of bg)assert.equal(x.safe('background',id),id);
 for(const id of scenes)assert.equal(x.safe('showcase_skin',id),id);
 assert.equal(x.safe('background','midnight-vault'),null);
 const items=[...bg.map(id=>({id,kind:'background',name:id,price:500})),
  ...scenes.map(id=>({id,kind:'showcase_skin',name:id,price:600}))];
 const html=x.shop({shop:{items},profile:{appearance:{}},online:true});
 assert.equal((html.match(/class="flip-cosmetic-item /g)||[]).length,12);
 assert.match(html,/6 ПРЕДМЕТОВ/);
});
test('New styles exist as hero, showcase and store preview CSS',()=>{
 const x=setup(),css=read('src/styles/cosmetic-v099.css');
 for(const [id,kind] of additions){
  assert.ok(css.includes('.flip-sample-'+id+'{'));
  assert.ok(x.FLIPProfileCosmetics.classes({appearance:{[kind]:id}})
   .includes('flip-'+(kind==='background'?'bg-':'scene-')+id));
  if(kind==='background')assert.ok(css.includes('.flip-identity.flip-bg-'+id+'{'));
  else assert.ok(css.includes('.flip-scene-'+id+'.flip-showcase-profile{'));
 }
 const html=x.FLIPShowcase.publicPage({username:'test',level:1,slot_count:3,
  appearance:{background:'midnight-grid',showcase_skin:'midnight-vault'},
  slots:[],pinned_badges:[],badges:[],stats:{drops:1}});
 assert.match(html,/flip-bg-midnight-grid/);
 assert.match(html,/flip-scene-midnight-vault/);
 assert.match(html,/flip-stat-symbol/);
});
test('All stats icons get the selected skin color via currentColor, not hardcoded green',()=>{
 const css=read('src/styles/cosmetic-v099.css');
 assert.match(css,/\.flip-profile-lower \.flip-stat-symbol\{[\s\S]*?color:var\(--lower-accent\)!important/);
 assert.match(css,/\.flip-profile-lower \.flip-stat-symbol \.flip-svg\{[\s\S]*?stroke:currentColor/);
 const base=read('src/styles/profile-cosmetics.css');
 assert.match(base,/\.flip-profile-lower\.flip-scene-red-velvet\{[\s\S]*?--lower-accent:#f9a2bf/);
});
test('SQL safely adds four non-duplicated catalog entries with listed F prices',()=>{
 const sql=read('sql/023_flip_v099_cosmetic_skins.sql');
 for(const [id,kind,name,price] of additions)
  assert.ok(sql.includes("('"+id+"','"+kind+"','"+name+"',"+price+",true,"));
 assert.match(sql,/ON CONFLICT \(id\) DO UPDATE/);
 assert.doesNotMatch(sql,/DELETE\s+FROM|DROP\s+TABLE|ALTER\s+TABLE/i);
});
test('Versioned new stylesheet and game assets load under one release',()=>{
 const html=read('index.html'),pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.version,'0.9.11');
 assert.ok(html.includes('src/styles/cosmetic-v099.css?v=0.9.9'));
 for(const file of ['profile-cosmetics.js','app.js','showcase.js'])
  assert.ok(html.includes('src/scripts/'+file+'?v='+pkg.version));
 assert.ok(read('api/flip.js').includes("version:'"+pkg.version+"'"));
});
