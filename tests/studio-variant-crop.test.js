import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {readFileSync} from 'node:fs';

const client=readFileSync(new URL('../studio/app.js',import.meta.url),'utf8');
const cropSource=client.slice(
 client.indexOf('function croppingCanvas(size=1024){'),
 client.indexOf('function paintCrop(){')
);

function renderCrop({width,height,mode='contain',zoom=1,x=0,y=0}){
 const operations=[];
 const ctx={
   fillRect(...args){operations.push(['fillRect',...args])},
   drawImage(...args){operations.push(['drawImage',...args])},
   set fillStyle(value){operations.push(['fillStyle',value])},
   set imageSmoothingEnabled(value){},
   set imageSmoothingQuality(value){}
 };
 const context={
   document:{createElement(type){
     assert.equal(type,'canvas');
     return {width:0,height:0,getContext:()=>ctx};
   }},
   imageBitmap:{width,height},
   crop:{mode,zoom,x,y},Math,Error
 };
 const canvas=runInNewContext(cropSource+'\ncroppingCanvas(1024)',context);
 return {canvas,draw:operations.find(x=>x[0]==='drawImage'),operations};
}

test('Portrait photo is fully visible by default, without forced crop or zoom',()=>{
 const result=renderCrop({width:768,height:1280});
 assert.equal(result.canvas.width,1024);
 assert.equal(result.canvas.height,1024);
 const [_,bitmap,x,y,w,h]=result.draw;
 assert.equal(bitmap.width,768);
 assert.equal(bitmap.height,1280);
 assert.equal(y,0);
 assert.equal(h,1024);
 assert.ok(Math.abs(w-614.4)<1e-6,'portrait width should fit without cropping');
 assert.equal(x,(1024-w)/2);
 assert.ok(result.operations.some(x=>x[0]==='fillRect'),'blank margins are filled neutrally');
});
test('Landscape image remains fully visible with contain',()=>{
 const {draw}=renderCrop({width:1600,height:900});
 const [_,bitmap,x,y,w,h]=draw;
 assert.equal(w,1024);
 assert.equal(x,0);
 assert.equal(h,576);
 assert.equal(y,224);
});
test('Cover is optional and crops edges only on explicit selection',()=>{
 const {draw}=renderCrop({width:768,height:1280,mode:'cover'});
 const [_,bitmap,x,y,w,h]=draw;
 assert.equal(w,1024);
 assert.ok(h>1024);
 assert.ok(y<0);
 assert.equal(x,0);
});
test('Square art is not arbitrarily enlarged',()=>{
 const {draw}=renderCrop({width:1024,height:1024});
 assert.deepEqual(Array.from(draw).slice(2),[0,0,1024,1024]);
});
test('Studio editor exposes both fit modes and keeps 1024 WebP pipeline',()=>{
 assert.match(client,/value="contain">Вписать целиком/);
 assert.match(client,/value="cover">Заполнить квадрат/);
 assert.match(client,/crop\.mode=el\.value==='cover'\?'cover':'contain'/);
 assert.match(client,/croppingCanvas\(1024\)/);
 assert.match(client,/croppingCanvas\(384\)/);
});
test('Variant saves use column-scoped INSERT or UPDATE instead of broad UPSERT',()=>{
 const source=client.slice(client.indexOf('async function uploadImage('),client.indexOf('async function saveCrop(){'));
 assert.match(source,/from\('flip_studio_variants'\)\.insert\(/);
 assert.match(source,/from\('flip_studio_variants'\)\.update\(fields\)/);
 assert.match(source,/\.eq\('release_id',r\.id\)\.eq\('rarity',rarity\)/);
 assert.match(source,/if\(result\.error\)throw result\.error/);
 assert.doesNotMatch(source,/\.upsert\(/);
 assert.doesNotMatch(source,/public_url:/);
 assert.match(source,/remove\(uploaded\)/);
});
