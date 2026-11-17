import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Card style names agree with FLIP Studio, without altering rarity or artwork',()=>{
 const win={};
 runInNewContext(read('src/scripts/catalog.js'),{window:win,URL,Map,Math});
 const style=win.FLIPCatalog.rarityStyles;
 const expected={common:'Мраморный барельеф',rare:'Вышивка / гобелен',
   epic:'Витраж',legendary:'Масляная живопись',
   mythic:'Многослойная бумажная скульптура',hidden:'Секретный вариант'};
 assert.deepEqual(JSON.parse(JSON.stringify(style)),expected);
 const studio=read('studio/app.js');
 for(const [r,label] of Object.entries({
   common:'Цветной мраморный барельеф',rare:'Вышивка и ткань',
   epic:'Витраж и стекло',legendary:'Живопись маслом',
   mythic:'Многослойная бумага'})){
   assert.ok(studio.includes("{id:'"+r+"'") && studio.includes("desc:'"+label+"'"),r);
 }
 for(const rarity of ['common','rare','epic','legendary','mythic']){
   const card=win.FLIPCatalog.getCard('carti','die-lit',rarity);
   assert.equal(card.id,'carti/die-lit/'+rarity);
   assert.equal(card.color,rarity);
   assert.equal(card.style,expected[rarity]);
   assert.equal(card.art,'./src/assets/carti/die-lit/'+rarity+'.webp');
 }
 assert.ok(read('index.html').includes('src/scripts/catalog.js?v=0.9.13.9'));
});
