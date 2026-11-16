import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function harness(reduced=false){
 const slots=Array.from({length:3},()=>({done:false,classList:{
   add(name){if(name==='is-revealed')this.parent.done=true;}}}));
 for(const slot of slots)slot.classList.parent=slot;
 const button={dataset:{},innerHTML:'',focus(){this.focused=true}};
 const scene={classList:{add(name){scene.finished=name==='is-finished'}}};
 const modal={classList:{add(){},remove(){}},innerHTML:'',
   querySelector(selector){
     const match=selector.match(/data-pack-index="(\d)"/);
     if(match)return slots[Number(match[1])];
     return selector==='[data-flip-pack-skip]'?button:
       selector==='.flip-pack-scene'?scene:null;
   },
   querySelectorAll(selector){return selector==='.flip-pack-slot.is-revealed'?
      slots.filter(x=>x.done):[];}
 };
 const overlay={classList:{add(){},remove(){}},setAttribute(){},removeAttribute(){},scrollTop:0};
 const listeners={};
 let timers=0,icons=0;
 const document={getElementById(id){return id==='modal'?modal:id==='overlay'?overlay:null},
   addEventListener(type,fn){listeners[type]=fn}};
 const window={matchMedia(){return {matches:reduced}},FLIPIcons:{render(){icons++}}};
 runInNewContext(read('src/scripts/pack-reveal.js'),{
   document,window,setTimeout(){timers++;return timers},clearTimeout(){}
 });
 return {open:window.FLIPPackReveal.open,api:window.FLIPPackReveal,
   slots,modal,scene,button,listeners,overlay,timers:()=>timers,icons:()=>icons};
}
const cards=[
 {title:'Up 2 Më',artist:'Yeat',color:'rare',art:'./src/assets/yeat/rare.webp'},
 {title:'Million Dollar Minion',artist:'Young Thug',color:'legendary',art:'./src/assets/yt/legendary.webp'},
 {title:'Fancy That',artist:'PinkPantheress',color:'common',art:'./src/assets/pp/common.webp'}
];
test('New Era layout groups title, art, details and earned XP instead of spacing everything apart',()=>{
 const h=harness();
 assert.equal(h.open(cards,{type:'new-era',price:250}),true);
 const html=h.modal.innerHTML;
 assert.match(html,/class="flip-pack-stage"/);
 assert.match(html,/class="flip-pack-heading"/);
 assert.match(html,/class="flip-pack-footer"/);
 assert.match(html,/NEW ERA<span>\.<\/span>/);
 assert.match(html,/3 КАРТОЧКИ ПОЛУЧЕНО/);
 assert.match(html,/3 КАРТОЧКИ ПОЛУЧЕНО/);
 assert.equal((html.match(/data-pack-index=/g)||[]).length,3);
 assert.equal((html.match(/data-pack-found=/g)||[]).length,3);
 assert.match(html,/Million Dollar Minion/);
 assert.match(html,/Young Thug/);
 assert.match(html,/LEGENDARY/);
 assert.match(html,/−250 F/);
 assert.match(html,/\+30 XP/);
 assert.ok(html.indexOf('flip-pack-heading')<html.indexOf('flip-pack-cards'));
 assert.ok(html.indexOf('flip-pack-cards')<html.indexOf('flip-pack-found'));
 assert.ok(html.indexOf('flip-pack-found')<html.indexOf('flip-pack-bottom'));
 assert.ok(html.indexOf('flip-pack-bottom')<html.indexOf('flip-pack-footer'));
});
test('Pack result remains purely visual, securely escapes release strings, keeps flip and collect',()=>{
 const h=harness();
 const malicious={...cards[0],title:'<script>alert(1)</script>',
   artist:'A "quoted" artist'};
 assert.equal(h.open([malicious,...cards.slice(1)],{type:'archive',price:250}),true);
 assert.doesNotMatch(h.modal.innerHTML,/<script>/);
 assert.match(h.modal.innerHTML,/&lt;script&gt;/);
 assert.match(h.modal.innerHTML,/&quot;quoted&quot;/);
 assert.equal(h.timers(),3);
 h.api.revealAll();
 assert.ok(h.slots.every(c=>c.done));
 assert.equal(h.scene.finished,true);
 assert.match(h.button.innerHTML,/ЗАБРАТЬ КАРТОЧКИ/);
 assert.ok(h.icons()>1);
 assert.equal(h.api.isOpen(),true);
 h.listeners.click({target:{closest(){return {dataset:{flipPackSkip:'done'}}}},
   preventDefault(){},stopPropagation(){}});
 assert.equal(h.api.isOpen(),false);
 const src=read('src/scripts/pack-reveal.js');
 assert.doesNotMatch(src,/fetch\(|balance\s*[-+]=|crypto\.randomUUID/);
 assert.match(src,/setTimeout\(\(\)=>reveal\(i\),delay\)/);
});
test('Reduced motion shows all three cards and retains price and native safe-space',()=>{
 const h=harness(true);assert.equal(h.open(cards,{type:'standard',price:200}),true);
 assert.ok(h.slots.every(c=>c.done));
 assert.equal(h.timers(),0);
 assert.match(h.modal.innerHTML,/STANDARD<span>\.<\/span>/);
 assert.match(h.modal.innerHTML,/−200 F/);
 const css=read('src/styles/pack-result-v0911.css');
 assert.match(css,/var\(--flip-top-space,14px\)/);
 assert.match(css,/justify-content:flex-start/);
 assert.match(css,/\.flip-pack-stage/);
 assert.match(css,/\.flip-pack-found-item/);
 assert.match(css,/\.flip-pack-footer/);
 assert.match(css,/@media\(max-height:729px\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});
test('Only pack result assets are changed; server-issued cards remain authoritative',()=>{
 const pkg=JSON.parse(read('package.json'));
 const index=read('index.html');
 assert.equal(pkg.version,'0.9.11');
 assert.ok(index.includes('src/styles/pack-result-v0911.css?v=0.9.11'));
 assert.ok(index.includes('src/scripts/pack-reveal.js?v=0.9.11'));
 assert.ok(read('api/flip.js').includes("version:'0.9.11'"));
 assert.match(read('src/scripts/app.js'),/const pack=\(result\.card_ids\|\|\[\]\)\.map\(cardById\)/);
 assert.match(read('src/scripts/app.js'),/await bridge\.themePack\(packType,crypto\.randomUUID\(\)\)/);
 assert.match(read('src/styles/store.css'),/flip-pack-slot\.hidden \.flip-pack-front:after/);
});
