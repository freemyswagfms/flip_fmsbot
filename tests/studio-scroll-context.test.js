import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {captureStudioPosition,restoreStudioPosition} from '../studio/scroll-context.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function harness(){
 const win={scrollY:520,scrollX:0,innerHeight:760,
  scrollTo(options){this.scrollY=options.top;this.scrollX=options.left}};
 let absolute=730;
 const release={getAttribute(name){return name==='data-edit-release'?'rel-39':null},
  hasAttribute(name){return name==='data-edit-release'},
  closest(){return null},
  getBoundingClientRect(){const top=absolute-win.scrollY;return {top,bottom:top+85}}};
 let releaseNode=release;
 let filterScroll=475;
 let contentOffset=492;
 let scroller={scrollTop:filterScroll,scrollLeft:21,
  getAttribute:name=>name==='data-studio-scroll-key'?'import-releases':null,
  getBoundingClientRect(){return {top:190,bottom:620}}};
 const select={id:'global-search',tagName:'INPUT',selectionStart:3,selectionEnd:5,
  focus(opts){this.focused=opts?.preventScroll===true},
  setSelectionRange(a,b){this.selectionStart=a;this.selectionEnd=b}};
 let currentSelect=select;
 const item={getAttribute(name){return name==='data-import-id'?'disc-68':null},
  hasAttribute(name){return name==='data-import-id'},
  closest(){return scroller},
  getBoundingClientRect(){const top=190+contentOffset-scroller.scrollTop;return {top,bottom:top+37}}};
 const root={contains(element){return element===currentSelect},
  querySelectorAll(selector){
   if(selector==='[data-studio-scroll-key]')return [scroller];
   if(selector==='input[id],textarea[id],select[id]')return [currentSelect];
   if(selector.includes('[data-edit-release]'))return [releaseNode,item];
   return [];
  }};
 const doc={activeElement:select};
 return {win,root,doc,release,item,select,getScroller:()=>scroller,
  changedReleasePosition(pos){absolute=pos},
  swapRelease(){
   releaseNode={...release,getBoundingClientRect:release.getBoundingClientRect};
  },
  changeInner(pos){contentOffset=pos},
  replaceScroller(){
   scroller={...scroller,scrollTop:0,scrollLeft:0};
   return scroller;
  },
  replaceInput(){
   currentSelect={...select,selectionStart:0,selectionEnd:0,focused:false};
   doc.activeElement=null;
   return currentSelect;
  }};
}

test('Studio same-page re-render restores the exact release row after height changes above',()=>{
 const h=harness(),initial=h.release.getBoundingClientRect().top;
 const saved=captureStudioPosition(h.root,h.win,h.doc);
 assert.equal(saved.y,520);
 assert.equal(saved.anchor.value,'rel-39');
 h.changedReleasePosition(875);
 h.win.scrollY=0;
 restoreStudioPosition(h.root,saved,h.win);
 assert.equal(h.win.scrollY,665);
 assert.equal(h.release.getBoundingClientRect().top,initial);
});
test('Importer saves its independent discography scroll when selecting all/loading more',()=>{
 const h=harness(),before=h.item.getBoundingClientRect().top;
 const saved=captureStudioPosition(h.root,h.win,h.doc);
 assert.equal(saved.scrollers[0].key,'import-releases');
 h.changeInner(550);
 const replaced=h.replaceScroller();
 h.win.scrollY=0;
 restoreStudioPosition(h.root,saved,h.win);
 assert.equal(replaced.scrollTop,533);
 assert.equal(replaced.scrollLeft,21);
 assert.equal(h.item.getBoundingClientRect().top,before);
});
test('Search input focus and cursor survive replacement without scrolling',()=>{
 const h=harness(),saved=captureStudioPosition(h.root,h.win,h.doc);
 const input=h.replaceInput();
 restoreStudioPosition(h.root,saved,h.win);
 assert.equal(input.focused,true);
 assert.deepEqual([input.selectionStart,input.selectionEnd],[3,5]);
});
test('Page navigation can intentionally reset to top while Back restores the saved release list',()=>{
 const app=read('studio/app.js');
 assert.match(app,/function go\(page,\{restore=false,keepFilters=false\}=\{\}\)/);
 assert.match(app,/render\(\{restore,reset:!restore\}\)/);
 assert.match(app,/studioScrollPositions\.set\(renderedViewKey,old\)/);
 assert.match(app,/go\('editor',\{keepFilters:true\}\)/);
 assert.match(app,/case 'editor-back':go\('releases',\{restore:true,keepFilters:true\}\)/);
 assert.match(app,/data-action="editor-back"/);
 assert.match(app,/if\(page==='releases'&&!restore\)s\.artistFilter=null/);
 assert.doesNotMatch(app,/window\.scrollTo\(\{top:0,behavior:'instant'\}\)/);
});
test('Same screen filters and multi-select preserve context; player Back restores list',()=>{
 const app=read('studio/app.js');
 assert.match(app,/data-studio-scroll-key="import-releases"/);
 assert.match(app,/case 'import-all':s\.importSelected=new Set\([\s\S]*?\);render\(\);break/);
 assert.match(app,/case 'import-clear':s\.importSelected\.clear\(\);render\(\);break/);
 assert.match(app,/case 'import-reset':[\s\S]*?render\(\{restore:true\}\)/);
 assert.match(app,/case 'players-back':[\s\S]*?render\(\{restore:true\}\)/);
 assert.match(app,/return 'import:'\+String\(s\.importArtist\?\.id\|\|'search'\)/);
 assert.match(app,/return 'players:'\+\(s\.selectedPlayer/);
 assert.match(app,/return 'editor:'\+s\.editorMode/);
});
test('STUDIO v0.9.8.6 requires no server or game migration',()=>{
 const pkg=JSON.parse(read('studio/package.json'));
 assert.equal(pkg.version,'0.9.8.6');
 const studio=read('studio/app.js');
 assert.match(studio,/from '\.\/scroll-context\.js'/);
 assert.match(studio,/FLIP STUDIO 0\.9\.8\.6/);
 const mini=JSON.parse(read('package.json'));
 assert.equal(mini.version,'0.9.8.6');
});
