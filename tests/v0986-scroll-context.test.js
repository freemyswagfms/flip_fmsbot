import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const scrollModule=()=>read('src/scripts/scroll-context.js');
function setup(){
 const scroller={scrollTop:680,scrollLeft:0,getBoundingClientRect:()=>({top:60,bottom:620})};
 let cardAbsolute=760;
 const attrs={'data-achievement-id':'collector-50'};
 const anchor={
  hasAttribute:k=>k in attrs,getAttribute:k=>attrs[k],
  getBoundingClientRect(){const top=cardAbsolute-scroller.scrollTop+60;return {top,bottom:top+155}}
 };
 const horizontal={scrollLeft:140,scrollTop:0};
 const textField={value:'Music',selectionStart:2,selectionEnd:3,
  didFocus:false,focus(opts){this.didFocus=opts?.preventScroll===true},
  setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end}};
 let anchors=[anchor],selected='rare',replacedControls=null;
 function filterNode(key){
  return {getAttribute:name=>name==='data-collection-gallery-filter'?key:
    name==='aria-pressed'?String(key===selected):null,
   setAttribute(name,value){if(name==='aria-pressed'&&value==='true')selected=key}};
 }
 let controls={'[data-collection-gallery-search]':textField};
 const screen={
  querySelectorAll(selector){
   if(selector.includes('[data-achievement-id]'))return anchors;
   if(selector==='.flip-ach-filters')return [horizontal];
   if(selector==='[data-collection-gallery-filter]')return [filterNode('all'),filterNode('rare')];
   return [];
  },
  querySelector(selector){
   if(selector==='[data-collection-gallery-filter][aria-pressed="true"]')
    return filterNode(selected);
   return controls[selector]||null;
  }
 };
 const document={activeElement:textField};
 const window={};
 runInNewContext(scrollModule(),{window,document,Number,Array,Object,Set,Map,JSON});
 return {api:window.FLIPScrollContext,scroller,screen,anchor,horizontal,textField,
  setCardAbsolute:value=>cardAbsolute=value,
  removeCard:()=>anchors=[],
  setFilter:value=>selected=value,
  getFilter:()=>selected,
  replaceField:()=>{
   const fresh={...textField,didFocus:false,focus:textField.focus,
    setSelectionRange:textField.setSelectionRange,value:''};
   controls={'[data-collection-gallery-search]':fresh};
   document.activeElement=null;
   return fresh;
  }
 };
}
test('After achievement reward, the same visible card stays at its former screen coordinate',()=>{
 const x=setup(),old=x.anchor.getBoundingClientRect().top;
 const saved=x.api.capture(x.scroller,x.screen);
 assert.equal(saved.top,680);
 assert.equal(saved.anchor.key[0][1],'collector-50');
 // Reward / badges inserted before the card; old unconditional render resets the page.
 x.setCardAbsolute(890);
 x.scroller.scrollTop=0;
 x.api.restore(x.scroller,x.screen,saved);
 assert.equal(x.scroller.scrollTop,810);
 assert.equal(x.anchor.getBoundingClientRect().top,old);
});
test('Achievements still preserve scroll when the claimed item disappears from the current filter',()=>{
 const x=setup(),saved=x.api.capture(x.scroller,x.screen);
 x.scroller.scrollTop=0;x.removeCard();
 x.api.restore(x.scroller,x.screen,saved);
 assert.equal(x.scroller.scrollTop,680);
});
test('Horizontal category filter, nested scroll, and search text survive screen replacement',()=>{
 const x=setup(),saved=x.api.capture(x.scroller,x.screen);
 const newField=x.replaceField();
 x.scroller.scrollTop=0;x.horizontal.scrollLeft=0;x.setFilter('all');
 x.api.restore(x.scroller,x.screen,saved);
 assert.equal(x.horizontal.scrollLeft,140);
 assert.equal(newField.value,'Music');
 assert.equal(newField.didFocus,true);
 assert.equal(newField.selectionStart,2);
 assert.equal(newField.selectionEnd,3);
 assert.equal(x.getFilter(),'rare');
});
test('Null DOM state is ignored; anchors work without scrolling the page on navigation',()=>{
 const x=setup();
 assert.equal(x.api.capture(null,x.screen),null);
 assert.equal(x.api.capture(x.scroller,null),null);
 assert.doesNotThrow(()=>x.api.restore(x.scroller,x.screen,null));
 const saved=x.api.capture(x.scroller,x.screen);
 assert.ok(saved);
 // A new screen is intentionally opened at the top by app.js, not by this helper.
 x.scroller.scrollTop=0;
 assert.equal(x.scroller.scrollTop,0);
});
test('v0.9.8.6 routes treat an in-place rerender differently from navigation and Back',()=>{
 const source=read('src/scripts/app.js');
 const scroll=source.slice(source.indexOf('const scrollMemo='),source.indexOf('let toastTid;'));
 assert.match(scroll,/const same=view===current/);
 assert.match(scroll,/same\?prior:returnTo\?scrollMemo\.get\(scrollKey\(view\)\)/);
 assert.match(scroll,/tracker\.restore\(scroll,screen,snapshot\)/);
 assert.match(scroll,/if\(!snapshot\)\{if\(scroll\)scroll\.scrollTop=0/);
 assert.doesNotMatch(scroll,/\$\('#scroll'\)\.scrollTop=0/);
 assert.match(source,/collectionBack==='artist'\?'collectionArtist':'collection',\{returnTo:true\}/);
 assert.match(source,/render\('profile',\{returnTo:true\}\)/);
 assert.match(source,/returnTo:a==='profile'&&\[/);
});
test('Achievement claim, streak claim and task reroll all use same-screen preservation',()=>{
 const app=read('src/scripts/app.js');
 for(const text of ['render(current);','render(\'achievements\')',
  'await bridge.claimAchievement','await bridge.claimStreak','await bridge.rerollTask']){
  assert.ok(app.includes(text),text);
 }
 assert.match(app,/try\{await bridge\.refreshTasks\(\);render\(current\);/);
 assert.match(app,/if\(current==='achievements'\)render\('achievements'\)/);
 assert.match(app,/bridge\.refreshTasks\?\.\(\)\.then\(\(\)=>render\(current\)\)/);
});
test('Inbox polling preserves an open notification list at its position',()=>{
 const app=read('src/scripts/app.js');
 assert.match(app,/const sheetScroll=sheet\?\.scrollTop\|\|0/);
 assert.match(app,/if\(sheet\)sheet\.scrollTop=sheetScroll/);
});
test('Correct v0.9.8.6 cache tag and release; game and Studio mechanics untouched',()=>{
 const pkg=JSON.parse(read('package.json')),html=read('index.html');
 assert.ok(pkg.version.localeCompare('0.9.8.6',undefined,{numeric:true})>=0);
 assert.ok(html.includes('src/scripts/scroll-context.js?v=0.9.8.6'));
 assert.ok(html.includes('src/scripts/app.js?v='+pkg.version));
 assert.ok(html.indexOf('scroll-context.js?v=0.9.8.6')<
   html.indexOf('src/scripts/app.js?v='+pkg.version));
 assert.ok(html.includes('src/scripts/trades.js?v=0.9.8.5'));
 assert.ok(html.includes('src/scripts/achievements.js?v=0.9.8.3'));
 assert.ok(read('api/flip.js').includes("version:'"+pkg.version+"'"));
});
