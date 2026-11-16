import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const src=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const publicId='11111111-1111-4111-8111-111111111111';

test('Leaderboard paints actionable player buttons with real UUIDs',async()=>{
  let clickHandler;
  const el={
    innerHTML:'',isConnected:true,
    addEventListener(name,handler){if(name==='click')clickHandler=handler;}
  };
  const window={
    Telegram:{WebApp:{initData:'test-telegram-auth'}},
    FLIPIcons:{render(){}}
  };
  let requested='';
  const fetch=async(url)=>{
    requested=url;
    return {
      ok:true,
      json:async()=>({
        me:{place:2,cp:57},
        players:2,
        leaders:[
          {place:1,name:'@collector',level:12,cp:80,rankedCards:14,rankedVariants:7,profileId:publicId},
          {place:2,name:'@friend',level:3,cp:57,rankedCards:5,rankedVariants:5,
            profileId:'22222222-2222-4222-8222-222222222222'}
        ]
      })
    };
  };
  runInNewContext(src('src/scripts/leaderboard.js'),{window,fetch});
  window.FLIPLeaderboard.mount(el);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requested,'/api/social?view=leaderboard');
  assert.match(el.innerHTML,new RegExp('data-player-profile="'+publicId+'"'));
  assert.match(el.innerHTML,/aria-label="Открыть профиль @collector"/);
  assert.match(el.innerHTML,/Нажми на игрока, чтобы посмотреть его профиль/);
  assert.equal((el.innerHTML.match(/data-player-profile=/g)||[]).length,2);
  assert.equal(typeof clickHandler,'function');
  assert.doesNotMatch(el.innerHTML,/рейтинговых экземпляр|Тестовые карточки исключены/i);
});

test('Navigation is handled directly and only once by the app click delegate',()=>{
  const app=src('src/scripts/app.js');
  const leaderboard=src('src/scripts/leaderboard.js');
  assert.match(app,/const player=e\.target\.closest\('\[data-player-profile\]'\);/);
  assert.match(app,/if\(player\)\{\s*e\.preventDefault\(\);\s*openPlayerProfile\(player\.dataset\.playerProfile\);\s*return;/s);
  assert.match(app,/publicProfileData=await bridge\.publicProfile\(publicId\);/);
  assert.match(app,/publicProfileLoading=true;/);
  assert.match(app,/if\(current==='publicProfile'\)render\('publicProfile'\);/);
  assert.doesNotMatch(leaderboard,/flip-open-public-profile/);
  assert.doesNotMatch(app,/window\.addEventListener\('flip-open-public-profile'/);
  assert.match(src('api/flip.js'),/flip_public_profile/);
  assert.match(src('api/social.js'),/flip_profile_directory/);
});

test('The normal game has no internal ranked/test-copy vocabulary',()=>{
  for(const path of [
    'src/scripts/app.js',
    'src/scripts/leaderboard.js',
    'src/scripts/showcase.js',
    'src/scripts/trades.js',
    'src/scripts/card-viewer.js'
  ]){
    const text=src(path);
    // Admin-specific words are still allowed ONLY in the admin UI.
    assert.doesNotMatch(text,/рейтингов(?:ых|ые|ую|ая|ой|ые|ого)? (?:карточ|копи|экземпляр)/i,path);
    assert.doesNotMatch(text,/тестов(?:ых|ые|ую|ая|ой|ого)? (?:карточ|копи|экземпляр)/i,path);
    assert.doesNotMatch(text,/тестовые административные копии/i,path);
  }
  assert.match(src('src/scripts/admin.js'),/Рейтинговых карточек/);
  assert.match(src('src/scripts/trades.js'),/Доступно для обмена:/);
  assert.match(src('src/scripts/showcase.js'),/Выбери три карточки из своей коллекции/);
  assert.match(src('src/scripts/showcase.js'),/КАРТОЧЕК/);
});

test('Telegram WebView receives v0.9.4.1 for every changed script',()=>{
  const html=src('index.html');
  for(const name of ['app','leaderboard','showcase','trades','card-viewer'])
    assert.ok(html.includes('src/scripts/'+name+'.js?v=0.9.4.1'),name);
  assert.match(html,/FLIP v0\.9\.4\.1 · TELEGRAM GAME/);
});
