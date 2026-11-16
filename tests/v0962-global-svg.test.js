import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('All achievement badge glyphs from the source catalog have a custom SVG, not an iOS emoji',()=>{
 const icons=source('src/scripts/icons.js');
 const sql=source('sql/010_flip_v093_achievements.sql');
 const match=icons.match(/const pattern = \/\[([^\]]+)\]\/g;/);
 assert.ok(match,'Global SVG replacement pattern is missing');
 const allowed=match[1];
 const seeds=sql.split('\n').filter(x=>/^\s*\('[a-z_]+','(?:oneoff|staged|secret|hidden)'/.test(x));
 assert.ok(seeds.length>=30,'All original achievements should be included');
 const symbols=new Set();
 for(const line of seeds){
   const symbol=line.match(/,'([^']+)',(?:true|false),(?:true|false),\d+\),?$/)?.[1];
   assert.ok(symbol,'Badge glyph is missing in '+line.slice(0,50));
   symbols.add(symbol);
 }
 for(const glyph of symbols){
   assert.ok(allowed.includes(glyph),'Missing replacement for badge '+glyph);
   assert.ok(icons.includes("'"+glyph+"': '<"),'Missing vector shape for badge '+glyph);
 }
 // These special characters are rendered by iOS Emoji by default without a vector.
 for(const glyph of ['⏱','♫','✷','✸','✹','✺','▤','▦','▥','↑','☷','✧']){
  assert.ok(symbols.has(glyph),'Expected catalog symbol '+glyph);
 }
});

test('All remaining store-specific decorative glyphs are custom vector shapes',()=>{
 const icons=source('src/scripts/icons.js');
 const store=source('src/scripts/store.js');
 const css=source('src/styles/store.css');
 for(const g of ['↗','✦','⌄','∞','∷','✓']){
   assert.ok(icons.includes("'"+g+"': '<"),'No vector for store glyph '+g);
 }
 assert.ok(store.includes('flip-shop-chevron'));
 assert.ok(store.includes('flip-pack-art-bottom'));
 assert.ok(store.includes('∞ БЕЗ ЛИМИТА'));
 assert.doesNotMatch(css,/content\s*:\s*['"]✳['"]/);
 assert.doesNotMatch(css,/content\s*:\s*['"]\s*✓['"]/);
 assert.match(css,/\.flip-shop-feature-row span\+span:before\{content:'';display:inline-block/);
 assert.match(css,/\.flip-pack-scene\.is-finished \.flip-pack-found-label:after\{content:'';display:inline-block/);
 assert.match(css,/\.flip-shop-chevron \.flip-svg\{width:17px/);
 assert.match(css,/\.flip-pack-action \.flip-svg\{width:21px/);
});

test('Global icon observer replaces glyphs in DOM nodes created after page initialization',()=>{
 const svgNodes=[];
 const replaced=[];
 let observerCallback;
 let observedTarget;
 const lateText={
   nodeValue:'∷ ⌄ ∞ ⏱ ♫ ✷ ▤ ▥ ▦ ✺',
   parentElement:{closest:()=>null},
   replaceWith(fragment){replaced.push(fragment);}
 };
 const newPanel={nodeType:1};
 const doc={
  body:{nodeType:1},readyState:'complete',
  createTreeWalker(root){
    let done=false;
    return {
      currentNode:null,
      nextNode(){
        if(root!==newPanel||done)return false;
        done=true;this.currentNode=lateText;return true;
      }
    };
  },
  createElementNS(ns,name){
    assert.equal(ns,'http://www.w3.org/2000/svg');
    assert.equal(name,'svg');
    const svg={
      attributes:{},setAttribute(k,v){this.attributes[k]=v;},
      set innerHTML(x){this.path=x;}
    };
    svgNodes.push(svg);return svg;
  },
  createTextNode(value){return {text:value};},
  createDocumentFragment(){return {children:[],append(n){this.children.push(n);}}}
 };
 class MockMutationObserver{
  constructor(callback){observerCallback=callback;}
  observe(target,options){observedTarget={target,options};}
 }
 const window={};
 runInNewContext(source('src/scripts/icons.js'),{
   document:doc,window,MutationObserver:MockMutationObserver,
   NodeFilter:{SHOW_TEXT:4,FILTER_ACCEPT:1,FILTER_REJECT:2}
 });
 assert.equal(observedTarget.target,doc.body);
 assert.equal(observedTarget.options.subtree,true);
 assert.equal(observedTarget.options.childList,true);
 assert.equal(observedTarget.options.characterData,true);
 observerCallback([{type:'childList',addedNodes:[newPanel]}]);
 assert.equal(replaced.length,1);
 assert.equal(svgNodes.length,10);
 for(const s of svgNodes){
  assert.equal(s.attributes.class,'flip-svg');
  assert.equal(s.attributes['aria-hidden'],'true');
  assert.match(s.path,/<(?:path|circle|rect)/);
 }
});

test('Pack opening converts SVG controls on both reveal and collect transitions',()=>{
 const elements=[];
 const clear=[];
 const slots=Array.from({length:3},()=>({done:false,classList:{
    add(x){if(x==='is-revealed')this.parent.done=true;}
  }}));
 for(const slot of slots)slot.classList.parent=slot;
 const button={dataset:{},innerHTML:'',focus(){},classList:{add(){}}};
 const scene={classList:{add(){}}};
 const modal={
   classList:{add(){},remove(){}},innerHTML:'',
   querySelector(selector){
      const id=selector.match(/data-pack-index="(\d)"/)?.[1];
      if(id!==undefined)return slots[Number(id)];
      if(selector==='[data-flip-pack-skip]')return button;
      if(selector==='.flip-pack-scene')return scene;
      return null;
   },
   querySelectorAll(){return slots.filter(s=>s.done);}
 };
 const overlay={classList:{add(){},remove(){}},setAttribute(){},
   removeAttribute(){},scrollTop:0};
 const document={
  getElementById(id){return id==='modal'?modal:id==='overlay'?overlay:null;},
  addEventListener(){}
 };
 const window={
  matchMedia(){return {matches:false};},
  FLIPIcons:{render(element){elements.push(element);}}
 };
 runInNewContext(source('src/scripts/pack-reveal.js'),{
   document,window,setTimeout:()=>1,clearTimeout(id){clear.push(id);}
 });
 const cards=Array.from({length:3},(_,i)=>({
   art:'test'+i+'.webp',title:'Card '+i,color:i===2?'mythic':'rare'
 }));
 assert.equal(window.FLIPPackReveal.open(cards,{type:'archive',price:250}),true);
 assert.strictEqual(elements[0],modal);
 assert.match(modal.innerHTML,/ПОКАЗАТЬ ВСЁ/);
 window.FLIPPackReveal.revealAll();
 assert.ok(slots.every(x=>x.done));
 assert.ok(elements.includes(button),'Collect button icons were not vectorized');
 assert.match(button.innerHTML,/ЗАБРАТЬ КАРТОЧКИ/);
 assert.ok(clear.length>=3);
});

test('New global SVG engine does not modify game economy or trade refresh logic',()=>{
 const html=source('index.html');
 const packageVersion=JSON.parse(source('package.json')).version;
 const api=source('api/flip.js');
 const app=source('src/scripts/app.js');
 const reveal=source('src/scripts/pack-reveal.js');
 assert.ok(packageVersion.localeCompare('0.9.6.4',undefined,{numeric:true})>=0);
 assert.ok(api.includes("version:'"+packageVersion+"'"));
 assert.ok(html.includes('src/scripts/icons.js?v=0.9.6.2'));
 assert.ok(html.includes('src/scripts/store.js?v=0.9.8.7'));
 assert.ok(html.includes('src/scripts/pack-reveal.js?v='+packageVersion));

 assert.ok(html.includes('src/styles/store.css?v=0.9.6.2'));
 assert.ok(html.includes('● FLIP · TELEGRAM GAME'));
 assert.match(app,/45000/);
 assert.match(reveal,/window\.FLIPIcons\?\.render\(modal\)/);
 assert.match(reveal,/window\.FLIPIcons\?\.render\(b\)/);
 assert.doesNotMatch(reveal,/fetch\(|balance\s*[-+]=|crypto\.randomUUID/);
});
