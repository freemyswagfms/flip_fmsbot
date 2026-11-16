import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Home keeps essential gameplay and trims only duplicated text',()=>{
 const source=read('src/scripts/app.js');
 const home=source.slice(source.indexOf('function home(){'),source.indexOf('const taskDefs='));
 assert.match(home,/Открой свой дроп/);
 assert.match(home,/hero-progress/);
 assert.match(home,/id="dropBtn"/);
 assert.match(home,/id="readyBadge"/);
 assert.match(home,/id="dropTimer" hidden/);
 assert.match(home,/id="timerValue"/);
 assert.match(home,/data-action="catalog"/);
 assert.match(home,/СМОТРЕТЬ РЕЛИЗЫ/);
 assert.match(home,/НОВАЯ КОЛЛЕКЦИЯ/);
 assert.match(home,/ЗАДАНИЯ/);
 assert.match(home,/streakHomeTeaser/);
 assert.match(home,/ТЕСТ РУЛЕТКИ/);
 assert.doesNotMatch(home,/hero-description|Находи редкие релизы/);
 assert.doesNotMatch(home,/dropCopy|dropSubtitle|Какая редкость выпадет/);
 assert.doesNotMatch(home,/Следующий через 4 часа|До следующего дропа/);
 assert.doesNotMatch(home,/NEW ARRIVAL|Первые пять релизов уже/);
 assert.doesNotMatch(home,/quick-nav|ТЕМАТИЧЕСКИЕ НАБОРЫ ↗|МОЙ ПРОФИЛЬ ↗/);
 assert.equal((home.match(/data-action="catalog"/g)||[]).length,1,
  'Only one browse releases action remains in the new collection feature');
});
test('Home cooldown still displays actual countdown without redundant copy',()=>{
 const source=read('src/scripts/app.js');
 const countdown=source.slice(source.indexOf('function updateTimer(){'),
   source.indexOf('function rollRarity('));
 assert.match(countdown,/timer\.hidden=ready\|\|blocked\(\)/);
 assert.match(countdown,/value\.textContent=\`\$\{h\}:\$\{m\}:\$\{sec\}\`/);
 assert.match(countdown,/ДРОП ПЕРЕЗАРЯЖАЕТСЯ/);
 assert.match(countdown,/ВОССТАНОВИТЬ ДРОП/);
 assert.match(countdown,/ПРИВЕТСТВЕННЫЙ ДРОП/);
 assert.doesNotMatch(countdown,/timerLabel|dropCopy|label\.textContent/);
 assert.match(read('src/styles/home.css'),/\.flip-drop-timer\[hidden\]/);
});
test('Free drop reveal has no English build HUD or redundant phase subtitles',()=>{
 const source=read('src/scripts/reveal.js');
 assert.match(source,/flip-reveal-logo/);
 assert.match(source,/ПОЙМАЙ МОМЕНТ/);
 assert.match(source,/ЭТО ОНА/);
 assert.match(source,/РАСКРЫВАЕМ/);
 assert.match(source,/ТВОЯ КАРТОЧКА/);
 assert.match(source,/НАЖМИ, ЧТОБЫ ПРОПУСТИТЬ/);
 assert.match(source,/НАЖМИ, ЧТОБЫ ЗАКРЫТЬ/);
 assert.match(source,/flip-reveal-continue/);
 assert.match(source,/flip-roulette-track/);
 assert.match(source,/is-flipped/);
 assert.doesNotMatch(source,/FREE DROP|DROP \/ REVEAL|ANIMATION \/ PREVIEW|FLIP \/ DEMO ARTWORK/);
 assert.doesNotMatch(source,/Карточка уже выбрана|Редкость найдена|Что скрывается за карточкой/);
 assert.doesNotMatch(source,/ДОБАВЛЕНО В КОЛЛЕКЦИЮ/);
 assert.doesNotMatch(source,/flip-reveal-subtitle|flip-reveal-headnote/);
 assert.match(source,/ТЕСТ · БЕЗ НАГРАДЫ/, 'Admin-only preview remains marked as non-awarding');
});
test('No accidental cleanup outside home and reveal, versioned assets refreshed',()=>{
 const html=read('index.html'),pkg=JSON.parse(read('package.json'));
 assert.ok(pkg.version.localeCompare('0.9.8.1',undefined,{numeric:true})>=0);
 assert.ok(html.includes('src/scripts/app.js?v='+pkg.version));
 assert.ok(html.includes('src/scripts/reveal.js?v=0.9.8.1'));
 assert.ok(html.includes('src/styles/home.css?v=0.9.8.1'));
 assert.ok(html.includes('src/styles/reveal.css?v=0.9.8.2'));
 assert.ok(html.includes('src/scripts/trades.js?v=0.9.8.5'));
 assert.ok(html.includes('src/scripts/delivery-reveal.js?v=0.9.8'));
 assert.ok(html.includes('src/scripts/admin.js?v=0.9.6.4'));
 assert.ok(read('api/flip.js').includes("version:'"+pkg.version+"'"));
});
