import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function runtime(){
 const context={window:{}};
 runInNewContext(source('src/scripts/catalog.js'),context);
 runInNewContext(source('src/scripts/collection.js'),context);
 return context.window;
}
const state=(catalog)=>({
 received:[
  {...catalog.getCard('carti','die-lit','rare'),isTestCopy:true},
  catalog.getCard('carti','die-lit','rare'),
  catalog.getCard('carti','music','mythic')
 ],
 discovered:['carti/die-lit/rare','carti/music/mythic']
});
test('Collection home retains counts, artwork, testing markers, gallery controls and links',()=>{
 const {FLIPCatalog,FLIPCollection}=runtime();
 const html=FLIPCollection.home(state(FLIPCatalog));
 for(const term of ['МОЯ КОЛЛЕКЦИЯ','УНИКАЛЬНЫХ КАРТОЧЕК','ТВОЯ ГАЛЕРЕЯ',
  'АРТИСТЫ','ИСТОРИЯ НАХОДОК','КАТАЛОГ ОФОРМЛЕНИЙ','ТЕСТ 1']){
  assert.ok(html.includes(term),term);
 }
 for(const term of ['data-collection-gallery-search','data-collection-gallery-sort',
  'data-collection-gallery-filter','data-collection-history','data-action="catalog"',
  'data-collection-artist','data-gallery-item','data-gallery-count="2"']){
  assert.ok(html.includes(term),term);
 }
 for(const copy of ['THE ARCHIVE / 087','ARTWORK GALLERY','YOUR ARTISTS','DISCOVERED ARTIST',
  'FLIP / ARTIST','Нажми на обложку','Просмотр и фильтры не меняют',
  'Личная галерея музыкальных','Сравнить все доступные стили',
  'Все ранее открытые карточки']){
   assert.ok(!html.includes(copy),'Unexpected home copy: '+copy);
 }
});
test('Artist, release and discovery pages preserve stats, locked copies and navigation',()=>{
 const {FLIPCatalog,FLIPCollection}=runtime();
 const owned=state(FLIPCatalog);
 const artist=FLIPCollection.artist(owned,'carti');
 assert.match(artist,/ОТКРЫТЫЕ РЕЛИЗЫ/);
 assert.match(artist,/col-stats-line/);
 assert.match(artist,/data-collection-back="collection"/);
 assert.match(artist,/data-collection-search/);
 assert.doesNotMatch(artist,/ARTIST COLLECTION|RELEASE ARCHIVE|Только релизы, которые/);
 assert.doesNotMatch(artist,/Новые релизы появляются здесь/);
 const release=FLIPCollection.release(owned,'carti','die-lit');
 assert.match(release,/ПЯТЬ РЕДКОСТЕЙ/);
 assert.match(release,/data-collection-back="artist"/);
 assert.match(release,/disabled aria-disabled="true"/);
 assert.match(release,/ТЕСТ ×1/);
 assert.doesNotMatch(release,/RELEASE COLLECTION|ALBUM ARTWORK|RARITY VARIANTS/);
 assert.doesNotMatch(release,/Нажми на открытую карточку/);
 const history=FLIPCollection.history(owned);
 assert.match(history,/ИСТОРИЯ НАХОДОК/);
 assert.match(history,/col-stats-line/);
 assert.doesNotMatch(history,/DISCOVERIES \/ ARCHIVE|История открытий сохраняется/);
});
test('Secret cards never appear before ownership, remain accessible once actually received',()=>{
 const {FLIPCatalog,FLIPCollection}=runtime();
 assert.deepEqual(Array.from(FLIPCatalog.rarities),['common','rare','epic','legendary','mythic']);
 const without=FLIPCollection.home({received:[],discovered:[]});
 assert.doesNotMatch(without,/HIDDEN|SECRET ARCHIVE|СКРЫТЫЕ НАХОДКИ/);
 const withSecret=FLIPCollection.home({received:[{id:'demo/hidden/archive-001',
    rarity:'Hidden',title:'ARCHIVE 001',isTestCopy:false}],discovered:[]});
 assert.match(withSecret,/СКРЫТЫЕ НАХОДКИ/);
 assert.match(withSecret,/data-hidden-card="demo\/hidden\/archive-001"/);
});
test('The five public artistic styles match the approved definitions',()=>{
 const {FLIPCatalog}=runtime();
 assert.deepEqual(JSON.parse(JSON.stringify(FLIPCatalog.rarityStyles)),{
  common:'Мраморный барельеф',rare:'Витраж',epic:'Масляная живопись',
  legendary:'Вышивка / гобелен',mythic:'Многослойная бумажная скульптура',
  hidden:'Секретный вариант'
 });
 assert.equal(FLIPCatalog.getCard('carti','die-lit','rare').id,'carti/die-lit/rare');
});
test('Catalog and card inspector no longer expose developer instructions',()=>{
 const app=source('src/scripts/app.js');
 const catalog=app.slice(app.indexOf('function catalogView(){'),app.indexOf('function trades(){'));
 assert.match(catalog,/АРТИСТОВ|РЕЛИЗОВ|catalog-release|catalog-tile/);
 assert.doesNotMatch(catalog,/CATALOG \/ PUBLISHED ARTWORK|FLIP STUDIO|идентификаторы|Каталог синхронизируется/);
 const viewer=source('src/scripts/card-viewer.js');
 assert.match(viewer,/ПРЕДПРОСМОТР/);
 assert.match(viewer,/flip-viewer-pagination/);
 assert.match(viewer,/flip-viewer-close|data-flip-viewer-dismiss/);
 assert.doesNotMatch(viewer,/FLIP \/ CARD INSPECT|ЛИСТАЙ КАРТОЧКИ|Наведи курсор|Короткое движение|Проведи пальцем по обложке/);
 const style=source('src/styles/card-viewer.css');
 assert.match(style,/\.flip-viewer-tilt\.is-active/);
 assert.match(style,/prefers-reduced-motion/);
 assert.match(style,/\.flip-viewer-header\{[^}]*justify-content:flex-end/);
});
test('Final roulette information and action are spaced without changing animation stages',()=>{
 const css=source('src/styles/reveal.css'),reveal=source('src/scripts/reveal.js');
 assert.match(css,/\.flip-reveal-continue\{[^}]*margin-top:22px/);
 assert.match(css,/\.flip-reveal-outcome h3\{[^}]*margin:13px 12px 7px/);
 assert.match(css,/\.flip-reveal-outcome p\{[^}]*font:650 12px\/1\.45/);
 assert.match(css,/@media\(max-height:760px\)\{/);
 assert.match(css,/\.flip-reveal-continue\{margin-top:16px\}/);
 assert.match(reveal,/НАЖМИ, ЧТОБЫ ПРОПУСТИТЬ/);
 assert.match(reveal,/НАЖМИ, ЧТОБЫ ЗАКРЫТЬ/);
 assert.match(reveal,/flip-roulette-track/);
 assert.match(reveal,/id="flipRevealContinue"/);
});
test('v0.9.8.2 asset cache revision is confined to changed public files',()=>{
 const html=source('index.html'),pkg=JSON.parse(source('package.json'));
 assert.ok(pkg.version.localeCompare('0.9.8.2',undefined,{numeric:true})>=0);
 for(const file of ['src/scripts/catalog.js','src/scripts/collection.js','src/scripts/card-viewer.js',
  'src/styles/card-viewer.css']){
  assert.ok(html.includes(file+'?v=0.9.8.2'),file);
 }
 assert.ok(html.includes('src/scripts/reveal.js?v=0.9.8.1'));
 assert.ok(html.includes('src/scripts/app.js?v='+pkg.version));
 assert.ok(html.includes('src/styles/collection.css?v=0.9.8.3'));
 assert.ok(html.includes('src/scripts/admin.js?v=0.9.6.4'));
 assert.ok(html.includes('src/scripts/store.js?v=0.9.8.3'));
 assert.ok(source('api/flip.js').includes("version:'"+pkg.version+"'"));
});
