import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const css=read('src/styles/leaderboard-v0912.css');
const js=read('src/scripts/leaderboard.js');
test('Ring and photo plane have exactly the same inset and radius',()=>{
 assert.match(css,/\.flip-leader-avatar\{[\s\S]*?--leader-avatar-inset:2px/);
 assert.match(css,/\.flip-leader-avatar-inner\{\s*position:absolute;\s*inset:var\(--leader-avatar-inset\)/);
 assert.match(css,/\.flip-leader-avatar::before,[\s\S]*?inset:var\(--leader-avatar-inset\)/);
 assert.match(css,/\.flip-leader-avatar-inner\{[\s\S]*?border-radius:var\(--leader-avatar-radius\)/);
 assert.match(css,/\.flip-leader-avatar::before,[\s\S]*?border-radius:var\(--leader-avatar-radius\)/);
 assert.match(css,/\.flip-leader-photo\{[\s\S]*?object-fit:cover/);
 assert.doesNotMatch(css,/\.flip-leader-color-(?:pink|red|rgb|glitch) \.flip-leader-avatar\{border/);
});
test('All paid frame styles and free tints preserve the separate photo mask',()=>{
 for(const frame of ['neon-ring','pulse','liquid-chrome','aurora-flow'])
  assert.ok(css.includes('.flip-leader-frame-'+frame+' .flip-leader-avatar::before'));
 for(const tint of ['rgb','glitch'])
  assert.ok(css.includes('.flip-leader-color-'+tint+' .flip-leader-avatar::before'));
 assert.match(css,/-webkit-mask-composite:xor/);
 assert.match(css,/mask-composite:exclude/);
 assert.match(css,/\.flip-leader-frame-pulse \.flip-leader-avatar::after/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(js,/const frames=new Set\(\['neon-ring','liquid-chrome','pulse','aurora-flow'\]\)/);
 assert.match(js,/flip-leader-frame-'\+frame/);
 assert.match(js,/element\.querySelector\('\.flip-leader-avatar-inner'\)/);
});
test('Rendered ranking avatars contain nested masks for both own rank and top players',async()=>{
 const output={innerHTML:'',dataset:{},setAttribute(){}};
 const root={innerHTML:'',isConnected:true,querySelector(selector){
   return selector==='#flip-leaderboard-results'?output:null;
 },addEventListener(){}};
 const window={Telegram:{WebApp:{initData:'signed'}},FLIPIcons:{render(){}}};
 const context={window,URL,Set,Map,JSON,Promise,
  setTimeout(){return 1;},clearTimeout(){},
  fetch:async()=>({ok:true,json:async()=>({
    me:{place:4,profileId:'11111111-1111-4111-8111-111111111111',
      name:'@me',cp:1401,level:9,rankedCards:148,rankedVariants:78,
      appearance:{frame_color:'glitch',avatar_frame:'pulse'}},
    leaders:[{place:1,profileId:'22222222-2222-4222-8222-222222222222',
      name:'@other',cp:1606,level:8,rankedCards:171,rankedVariants:97,
      appearance:{frame_color:'rgb',avatar_frame:'liquid-chrome'}}],
    players:2,matches:2
  })})};
 runInNewContext(js,context);
 window.FLIPLeaderboard.mount(root);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal((output.innerHTML.match(/flip-leader-avatar-inner/g)||[]).length,2);
 assert.equal((output.innerHTML.match(/flip-leader-avatar-fallback/g)||[]).length,2);
 assert.match(output.innerHTML,/flip-leader-frame-pulse/);
 assert.match(output.innerHTML,/flip-leader-frame-liquid-chrome/);
 assert.match(output.innerHTML,/flip-leader-color-glitch/);
 assert.match(output.innerHTML,/flip-leader-color-rgb/);
});
