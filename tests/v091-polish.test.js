import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function revealHarness(reduced=false){
  const nodes={};
  const el=name=>nodes[name]??=({innerHTML:'',textContent:'',disabled:false,
    setAttribute(){}});
  const scheduled=[];
  const root={
    dataset:{},style:{setProperty(){}},innerHTML:'',
    classList:{add(){},remove(){}},setAttribute(){},removeAttribute(){},
    addEventListener(){},
    querySelector:selector=>{
      if(['#flipRevealTitle','#flipRevealSubtitle','#flipRevealHint'].includes(selector))
        return el(selector);
      return null;
    }
  };
  const window={
    matchMedia:()=>({matches:reduced}),addEventListener(){},
    FLIPIcons:{render(){}}
  };
  const document={querySelector:selector=>selector==='#dropReveal'?root:null,
    addEventListener(){}};
  runInNewContext(source('src/scripts/reveal.js'),{
    window,document,Image:class{},
    setTimeout(fn,ms){scheduled.push({fn,ms});return scheduled.length;},
    clearTimeout(){},requestAnimationFrame(){return 1;},
    cancelAnimationFrame(){},console
  });
  return {api:window.FLIPReveal,root,scheduled,nodes};
}
test('v0.9.1 roulette spins immediately, while the authoritative card is pending',()=>{
  const {api,root,scheduled}=revealHarness();
  assert.equal(api.begin(),true);
  assert.equal(root.dataset.phase,'spin');
  assert.equal(scheduled[0].ms,5500);
  assert.equal(api.isOpen(),true);
  api.skip();
  // Skipping an unresolved result must never show a placeholder prize.
  assert.equal(root.dataset.phase,'spin');
  assert.equal(api.resolve({rarity:'mythic',title:'Die Lit',artist:'Playboi Carti'}),true);
  assert.equal(root.dataset.rarity,'mythic');
  assert.equal(root.dataset.phase,'result');
  api.close();
  assert.equal(api.isOpen(),false);
});
test('Server can be slow without exposing the winning card early',()=>{
  const {api,root,scheduled}=revealHarness();
  api.begin();
  scheduled[0].fn();
  assert.equal(root.dataset.phase,'spin');
  assert.equal(api.resolve({rarity:'rare',title:'Release',artist:'Artist'}),true);
  assert.equal(root.dataset.phase,'settle');
});
test('An unavailable server aborts an unresolved reveal',()=>{
  const {api,root}=revealHarness();
  api.begin();api.abort();
  assert.equal(api.isOpen(),false);
  assert.equal(root.innerHTML,'');
});
test('Demo launches have a yellow status and never call the game server',async()=>{
  const window={Telegram:null,FLIPViewport:{isTelegram:false},
    dispatchEvent(){},addEventListener(){}};
  const document={visibilityState:'visible',addEventListener(){}};
  runInNewContext(source('src/scripts/server.js'),{
    window,document,localStorage:{getItem(){return null;}},
    setInterval(){},CustomEvent:class{constructor(name,opts){this.type=name;this.detail=opts.detail}},
    fetch(){throw Error('Demo must not use the game server');},JSON
  });
  await window.FLIPServer.connect();
  assert.equal(window.FLIPServer.mode,'demo');
  assert.equal(window.FLIPServer.health,'demo');
});
test('Desktop viewer disables native dragging, uses hover and red mythic tint',()=>{
  const js=source('src/scripts/card-viewer.js');
  const css=source('src/styles/card-viewer.css');
  assert.match(js,/mythic:\{label:'MYTHIC',color:'#ff626c'/);
  assert.match(js,/event\.pointerType==='mouse'/);
  assert.match(js,/dragstart',event=>event\.preventDefault\(\)/);
  assert.match(js,/tilt\.parentElement\|\|tilt/);
  assert.match(css,/\.flip-viewer-foil\{[^}]*linear-gradient\(108deg/s);
  assert.doesNotMatch(css,/#d9b7ff48/);
  assert.match(css,/border:2px solid #ff626c/);
  assert.match(css,/\.flip-viewer-backdrop\{[^}]*#040706f1/s);
});
test('Status dot replaces technical copy and compact tasks avoid extra rows',()=>{
  const html=source('index.html'),app=source('src/scripts/app.js');
  const css=source('src/styles/main.css'),home=source('src/styles/home.css');
  assert.match(html,/data-server-status="connecting"/);
  assert.doesNotMatch(html,/При входе через Telegram прогресс хранится/);
  assert.doesNotMatch(app,/СЕРВЕР · ПРОГРЕСС СОХРАНЁН/);
  assert.match(home,/flip-server-offline-pulse/);
  assert.match(css,/\.flip-real-task \.task-text\{[^}]*grid-row:1 \/ span 2/s);
  assert.match(css,/\.flip-task-controls\{[^}]*grid-column:2;grid-row:2/s);
});
test('Hidden edge glitch is available in reward, gallery, inspect and future showcase',()=>{
  const viewer=source('src/styles/card-viewer.css');
  const reveal=source('src/styles/reveal.css');
  assert.match(viewer,/\.flip-viewer\[data-rarity="hidden"\] \.flip-viewer-border\{/);
  assert.match(viewer,/\.col-gallery-tile\.col-hidden \.col-gallery-cover::after/);
  assert.match(viewer,/\.sq-card\.hidden::after/);
  assert.match(viewer,/\.flip-hidden-frame::after/);
  assert.match(reveal,/data-phase="result"\] \.flip-face-front\{/);
});
