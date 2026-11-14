import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

function collectionRuntime(){
  const context={window:{}};
  runInNewContext(source('src/scripts/catalog.js'),context);
  runInNewContext(source('src/scripts/collection.js'),context);
  return context.window;
}

test('Collection gallery only displays owned variants, merges duplicates and exposes filters',()=>{
  const {FLIPCatalog,FLIPCollection}=collectionRuntime();
  const rare=FLIPCatalog.getCard('carti','die-lit','rare');
  const mythic=FLIPCatalog.getCard('carti','music','mythic');
  const state={received:[rare,rare,{...mythic,isTestCopy:true}],discovered:[]};
  const html=FLIPCollection.home(state);
  assert.match(html,/data-collection-gallery/);
  assert.match(html,/data-collection-gallery-search/);
  assert.match(html,/data-collection-gallery-sort/);
  assert.match(html,/data-collection-gallery-filter="mythic"/);
  assert.equal((html.match(/data-gallery-item/g)||[]).length,2);
  assert.match(html,/data-gallery-count="2"/);
  assert.match(html,/ТЕСТ 1/);
  assert.match(html,/data-owned-card="carti\/die-lit\/rare"/);
  assert.match(html,/data-owned-card="carti\/music\/mythic"/);
  assert.doesNotMatch(html,/data-owned-card="carti\/playboi-carti\/common"/);
});
test('Empty collection has no fake cards and still provides navigation to drops',()=>{
  const {FLIPCollection}=collectionRuntime();
  const html=FLIPCollection.home({received:[],discovered:[]});
  assert.match(html,/data-action="home"/);
  assert.doesNotMatch(html,/data-gallery-item/);
});
test('Release hero opens owned art without exposing locked variants',()=>{
  const {FLIPCatalog,FLIPCollection}=collectionRuntime();
  const state={received:[FLIPCatalog.getCard('carti','die-lit','epic')],discovered:[]};
  const html=FLIPCollection.release(state,'carti','die-lit');
  assert.match(html,/col-release-hero-open/);
  assert.match(html,/data-owned-card="carti\/die-lit\/epic"/);
  assert.match(html,/disabled aria-disabled="true"/);
});

function viewerRuntime(){
  const listeners={};
  class ClassList{
    constructor(){this.items=new Set()}
    add(name){this.items.add(name)}
    remove(name){this.items.delete(name)}
    contains(name){return this.items.has(name)}
  }
  class FakeNode{
    constructor(kind='node'){
      this.kind=kind;this.classList=new ClassList();this.listeners={};
      this.vars={};this.style={setProperty:(key,value)=>{this.vars[key]=value}};
      this.dataset={};this.isConnected=true;this.innerHTML='';
      this.attributes={};
    }
    setAttribute(name,value){this.attributes[name]=value}
    addEventListener(name,fn){this.listeners[name]=fn}
    removeEventListener(name){delete this.listeners[name]}
    querySelector(selector){
      if(selector==='[data-flip-tilt]')return tilt;
      if(selector==='.flip-viewer-close')return closeButton;
      return null;
    }
    querySelectorAll(){return []}
    closest(selector){if(selector==='.phone')return phone;return null}
    appendChild(node){this.lastChild=node;node.parent=this}
    remove(){this.removed=true;this.isConnected=false}
    focus(){this.focused=true}
    getBoundingClientRect(){return {left:0,top:0,width:200,height:200}}
    setPointerCapture(){}
  }
  const phone=new FakeNode('phone'),tilt=new FakeNode('tilt'),
    closeButton=new FakeNode('close'),before=new FakeNode('before');
  const document={
    activeElement:before,
    querySelector(selector){return selector==='.phone'?phone:null},
    createElement(){return new FakeNode('dialog')},
    addEventListener(name,fn){listeners[name]=fn},
    removeEventListener(name){delete listeners[name]}
  };
  const window={matchMedia:()=>({matches:false})};
  runInNewContext(source('src/scripts/card-viewer.js'),{
    window,document,clearTimeout,setTimeout
  });
  return {window,phone,tilt,closeButton,before,listeners};
}

test('3D viewer limits rotations and safely resets on pointer release',()=>{
  const {window,phone,tilt,closeButton,before,listeners}=viewerRuntime();
  const card={artist:'Playboi Carti',title:'MUSIC',rarity:'Mythic',
    art:'./src/assets/carti/music/mythic.webp'};
  assert.equal(window.FLIPCardViewer.open(card,{mode:'owned',count:2}),true);
  const dialog=phone.lastChild;
  assert.equal(dialog.dataset.rarity,'mythic');
  assert.equal(phone.classList.contains('flip-viewer-open'),true);
  assert.match(dialog.innerHTML,/mythic\.webp/);
  assert.match(dialog.innerHTML,/×2/);
  assert.equal(closeButton.focused,true);
  tilt.listeners.pointerdown({button:0,pointerId:7,clientX:450,clientY:-70,
    target:{closest:()=>tilt}});
  assert.equal(tilt.vars['--flip-rotate-y'],'9.00deg');
  assert.equal(tilt.vars['--flip-rotate-x'],'9.00deg');
  tilt.listeners.pointerup({pointerId:7});
  assert.equal(tilt.vars['--flip-rotate-x'],'0deg');
  assert.equal(tilt.vars['--flip-rotate-y'],'0deg');
  assert.ok(listeners.keydown);
  window.FLIPCardViewer.close(true);
  assert.equal(dialog.removed,true);
  assert.equal(phone.classList.contains('flip-viewer-open'),false);
  assert.equal(before.focused,true);
});
test('Viewer escapes untrusted labels and does not accept remote image URLs',()=>{
  const {window,phone}=viewerRuntime();
  window.FLIPCardViewer.open({title:'<img src=x onerror=alert(1)>',
    artist:'<script>alert(2)</script>',rarity:'Rare',art:'https://example.com/evil.png'},
    {mode:'catalog'});
  const html=phone.lastChild.innerHTML;
  assert.doesNotMatch(html,/<script>|<img[^>]*onerror=|https:\/\/example\.com\/evil/);
  assert.match(html,/&lt;script&gt;/);
  assert.match(html,/ПРЕВЬЮ/);
  window.FLIPCardViewer.close(true);
});
test('3D viewer is registered before the application and no viewport zoom lock is introduced',()=>{
  const index=source('index.html'),css=source('src/styles/card-viewer.css');
  assert.ok(index.indexOf('card-viewer.js')<index.indexOf('scripts/app.js'));
  assert.match(index,/card-viewer\.css\?v=0\.8\.7/);
  assert.match(css,/prefers-reduced-motion/);
  assert.match(css,/touch-action:none/);
  assert.doesNotMatch(index,/user-scalable\s*=\s*no/);
});
