import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../studio/app.js',import.meta.url),'utf8');

test('Music Importer search rows are connected to a delegated artist selection click handler',()=>{
 assert.ok(source.includes('data-import-artist='), 'search result has a selectable artist ID');
 assert.ok(source.includes('esc(a.id)'), 'selected ID is escaped');
 const handler=source.slice(source.indexOf("document.addEventListener('click'"),
   source.indexOf("document.addEventListener('change'"));
 assert.match(handler,/event\.target\.closest\('\[data-import-artist\]'\)/);
 assert.match(handler,/await selectMusicArtist\(musicArtist\.dataset\.importArtist\)/);
 assert.ok(handler.indexOf('await selectMusicArtist(')<handler.indexOf('const act='),
   'Artist selection should precede generic action handling');
});

test('Selecting an artist loads its discography and gives clear loading feedback',()=>{
 const select=source.slice(source.indexOf('async function selectMusicArtist('),
   source.indexOf('async function importSelected('));
 assert.match(select,/s\.importArtist=artist/);
 assert.match(select,/s\.importReleases=\[\]/);
 assert.match(select,/s\.importPage=0/);
 assert.match(select,/render\(\);await fetchReleases\(\)/);
 assert.match(select,/s\.busy=true;s\.importError='';\s*render\(\)/);
 assert.match(source,/Загружаем дискографию…/);
 assert.match(source,/Релизы не найдены/);
});
