import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Every v0.9.6 notification and statistics glyph has a matching FLIP vector icon',()=>{
 const icons=source('src/scripts/icons.js');
 const activity=source('src/scripts/activity.js');
 const glyphs=['↔','⇄','×','✓','✦','◈','▣','◇','◉','↗','←'];
 const marker=icons.match(/const pattern = \/\[([^\]]+)\]\/g;/);
 assert.ok(marker,'Icon converter must have a global pattern');
 const allowed=marker[1];
 for(const glyph of glyphs){
  assert.ok(allowed.includes(glyph),'SVG converter ignores '+glyph);
  assert.ok(icons.includes("'"+glyph+"': '<"),'No SVG path for '+glyph);
 }
 assert.match(activity,/trade_counteroffer:\{icon:'⇄'/);
 assert.match(activity,/trade_declined:\{icon:'×'/);
 assert.match(activity,/pack:\{icon:'▣'/);
 assert.match(activity,/\['◇','УНИКАЛЬНЫЕ'/);
 assert.doesNotMatch(activity,/>● LIVE</);
 assert.doesNotMatch(activity,/>● FLIP</);
 assert.match(activity,/flip-stat-live-dot/);
});
test('Custom icon renderer actually replaces iPhone-fallback characters with vector SVG',()=>{
 const svgNodes=[];
 const replacements=[];
 const fakeText={
  nodeValue:'⇄ × ▣ ◇ ↔ ✓ ✦ ◈ ◉',
  parentElement:{closest:()=>null},
  replaceWith(fragment){replacements.push(fragment);}
 };
 const doc={
  createElementNS(ns,name){
   assert.equal(ns,'http://www.w3.org/2000/svg');
   assert.equal(name,'svg');
   const el={name,attributes:{},setAttribute(k,v){this.attributes[k]=v;},
    set innerHTML(value){this.body=value;}};
   svgNodes.push(el);return el;
  },
  createTreeWalker(){
   let count=0;return{
    currentNode:null,
    nextNode(){
     if(count++)return false;
     this.currentNode=fakeText;return true;
    }
   };
  },
  createDocumentFragment(){return{
   children:[],append(x){this.children.push(x);}
  };},
  createTextNode(value){return{nodeValue:value};}
 };
 const window={};
 runInNewContext(source('src/scripts/icons.js'),{
  document:doc,window,
  NodeFilter:{SHOW_TEXT:4,FILTER_ACCEPT:1,FILTER_REJECT:2}
 });
 window.FLIPIcons.render({});
 assert.equal(replacements.length,1);
 assert.equal(svgNodes.length,9);
 for(const svg of svgNodes){
  assert.equal(svg.attributes.class,'flip-svg');
  assert.equal(svg.attributes['aria-hidden'],'true');
  assert.match(svg.body,/path|rect|circle/);
 }
});
test('Notifications are converted to SVG after every async refresh, not just initial load',()=>{
 const app=source('src/scripts/app.js');
 const idx=app.indexOf("const body=document.querySelector('#flip-notifications-body')");
 assert.ok(idx>=0,'Inbox update function missing');
 const update=app.slice(idx,idx+540);
 assert.match(update,/body\.innerHTML=/);
 assert.match(update,/window\.FLIPIcons\?\.render\(body\);/);
 assert.ok(update.indexOf('body.innerHTML=')<update.indexOf('render(body)'),
  'Convert only after the latest content is inserted');
 const html=source('index.html');
 assert.match(html,/src\/scripts\/icons\.js\?v=0\.9\.6\.2/);
 assert.match(html,/src\/scripts\/activity\.js\?v=0\.9\.6\.1/);
 assert.match(html,/src\/scripts\/app\.js\?v=0\.9\.6\.1/);
 assert.match(html,/src\/styles\/activity\.css\?v=0\.9\.6\.1/);
});
test('Notification and statistic icon dimensions are fixed instead of relying on iOS font glyphs',()=>{
 const css=source('src/styles/activity.css');
 assert.match(css,/\.flip-event-icon \.flip-svg\{[^}]*width:21px;height:21px/);
 assert.match(css,/\.flip-stat-symbol \.flip-svg\{[^}]*width:22px;height:22px/);
 assert.match(css,/\.flip-event-reward \.flip-svg\{/);
 assert.match(css,/\.flip-stat-live-dot\{[^}]*border-radius:50%/s);
 assert.match(css,/\.notif-sheet \.flip-event-copy p\{border:0;padding:0/);
});
test('v0.9.6.1 remains a pure icon hotfix and preserves signed notification APIs',()=>{
 const app=source('src/scripts/app.js');
 const bridge=source('src/scripts/server.js');
 const api=source('api/flip.js');
 const packageVersion=JSON.parse(source('package.json')).version;
 assert.equal(packageVersion,'0.9.6.3');
 assert.match(app,/45000/);
 assert.match(app,/bridge\.markEventsRead/);
 assert.match(bridge,/bridge\.refreshHub=async/);
 assert.match(api,/version:'0\.9\.6\.3'/);
 assert.match(api,/validateTelegramInitData/);
});
