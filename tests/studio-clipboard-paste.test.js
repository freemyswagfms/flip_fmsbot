import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../studio/app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../studio/styles.css',import.meta.url),'utf8');
const handlers={};
const file={name:'test.png',type:'image/png',size:1000};
const context={
 document:{
  addEventListener:(event,callback)=>handlers[event]=callback,
  querySelectorAll:()=>[]
 },
 s:{member:{role:'owner'},current:'editor',busy:false,selectedRelease:'release-1',
   releases:[{id:'release-1',status:'draft'}]},
 clipboardRarity:'epic',
 clipboardRelease:'release-1',
 rarities:[{id:'common'},{id:'epic'}],
 mainRarities:['common'],
 releaseVariants:()=>[],
 '$':()=>null,ico:()=>'',notice:()=>{},
 openCrop:(image,rarity)=>{context.lastOpened={image,rarity}}
};
const section=source.slice(source.indexOf('function isTextPasteTarget('),
 source.indexOf("document.addEventListener('click',async event=>"));
assert.ok(section.includes("document.addEventListener('paste'"));
runInNewContext(section,context);

function paste({fileImage=file,items=true,targetText=false,blocked=false}={}){
 let prevented=0;
 if(blocked)context.s.busy=true;
 const event={
  target:{closest:()=>targetText?{}:null},
  clipboardData:{
   items:items?[{kind:'file',type:fileImage.type,getAsFile:()=>fileImage}]:[],
   files:items?[]:[fileImage]
  },
  preventDefault:()=>prevented++
 };
 context.lastOpened=null;
 handlers.paste(event);
 context.s.busy=false;
 return {prevented,opened:context.lastOpened};
}
test('Pasting copied image opens crop editor for selected rarity (not an immediate publish)',()=>{
 const {prevented,opened}=paste();
 assert.equal(prevented,1);
 assert.equal(opened?.image,file);
 assert.equal(opened?.rarity,'epic');
});
test('Image files from clipboardData.files are supported',()=>{
 const {prevented,opened}=paste({items:false});
 assert.equal(prevented,1);
 assert.equal(opened?.rarity,'epic');
});
test('Text clipboard is not hijacked',()=>{
 const target={closest:()=>null};
 let prevented=false;
 context.lastOpened=null;
 handlers.paste({target,clipboardData:{items:[{kind:'string',type:'text/plain'}],files:[]},
  preventDefault:()=>prevented=true});
 assert.equal(prevented,false);
 assert.equal(context.lastOpened,null);
});
test('Pasting into a text field preserves normal browser paste',()=>{
 const {prevented,opened}=paste({targetText:true});
 assert.equal(prevented,0);
 assert.equal(opened,null);
});
test('Published artwork and in-flight uploads cannot be replaced by paste',()=>{
 context.s.releases[0].status='published';
 assert.equal(paste().opened,null);
 context.s.releases[0].status='draft';
 assert.equal(paste({blocked:true}).opened,null);
});
test('Only supported image formats up to 15 MB go through crop',()=>{
 context.lastOpened=null;
 const a=paste({fileImage:{type:'image/gif',size:2000}});
 assert.equal(a.prevented,1);
 assert.equal(a.opened,null);
 const b=paste({fileImage:{type:'image/png',size:16*1024*1024}});
 assert.equal(b.prevented,1);
 assert.equal(b.opened,null);
});
test('Editor has selectable paste target for each rarity and clear shortcut help',()=>{
 assert.ok(source.includes('data-paste-rarity='));
 assert.match(source,/document\.addEventListener\('paste',event=>/);
 assert.match(source,/document\.querySelectorAll\('\[data-art-slot\]'\)/);
 assert.match(source,/Скопируй изображение \(Ctrl\+C\)/);
 assert.match(source,/Поддерживаются PNG, JPEG и WebP до 15 МБ/);
 assert.match(css,/\.art-slot\.paste-selected/);
});
