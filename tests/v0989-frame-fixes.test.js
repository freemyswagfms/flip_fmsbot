import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function cosmetics(){const window={};runInNewContext(read('src/scripts/profile-cosmetics.js'),{window});return window.FLIPProfileCosmetics;}
test('Four frame styles preview the true square player photo rather than fake circular tokens',()=>{
 const frames=['neon-ring','liquid-chrome','pulse','aurora-flow'];
 const html=cosmetics().shop({shop:{items:frames.map(id=>({id,kind:'avatar_frame',name:id,price:100})),owned:frames},
  profile:{appearance:{frame_color:'rgb',avatar_frame:'pulse'}},
  player:{telegramName:'Player',telegramAvatarUrl:'https://t.me/player.jpg'},online:true});
 assert.equal((html.match(/flip-cosmetic-sample-avatar/g)||[]).length,4);
 assert.equal((html.match(/src="https:\/\/t.me\/player.jpg"/g)||[]).length,5);
 assert.doesNotMatch(html,/flip-frame-sample-ring|flip-frame-sample-core/);
});
test('Chrome and multicolor styles use true hollow masks and never cover the photo',()=>{
 const css=read('src/styles/profile-cosmetics.css');
 assert.match(css,/-webkit-mask-composite:xor/);
 assert.match(css,/mask-composite:exclude/);
 assert.doesNotMatch(css,/linear-gradient\(transparent,transparent\) padding-box/);
 assert.doesNotMatch(css,/flip-frame-sample-ring/);
 assert.doesNotMatch(css,/box-shadow:-2px 0 0/);
 assert.match(css,/\.flip-frame-pulse \.flip-identity-avatar::after/);
});
test('Profile background does not create a colored rectangle behind public stats',()=>{
 const css=read('src/styles/profile-cosmetics.css');
 for(const id of ['acid-signal','midnight-grid','redline','pastel-dream'])
  assert.ok(css.includes('.flip-identity.flip-bg-'+id+'{'));
 assert.doesNotMatch(css,/(?:^|\n)\.flip-bg-pastel-dream\{/);
 assert.match(css,/\.flip-profile-lower\{background:transparent!important/);
 assert.match(css,/\.flip-cosmetic-hero\.flip-bg-pastel-dream/);
});
