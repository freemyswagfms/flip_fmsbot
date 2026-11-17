import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Profile goes hero → showcase → styled leaderboard entry, never between them',()=>{
 const app=read('src/scripts/app.js'),css=read('src/styles/leaderboard-v0912.css');
 assert.ok(app.includes('hero+showcase+rankingProfile(data)+'));
 assert.ok(!app.includes('hero+rankingProfile()+showcase'));
 assert.ok(app.includes("window.FLIPProfileCosmetics?.safe?.("));
 assert.ok(app.includes('flip-leader-bg-'));
 assert.ok(css.includes('.flip-profile-page .flip-leader-entry{'));
 assert.ok(css.includes('color:var(--leader-muted)'));
});
test('Personal rank has identical styled player tile even when outside top 50',async()=>{
 const output={innerHTML:'',dataset:{},setAttribute(){}};
 const root={isConnected:true,innerHTML:'',querySelector(k){
   return k==='#flip-leaderboard-results'?output:null;
 },addEventListener(){}};
 const ctx={window:{Telegram:{WebApp:{initData:'signed'}},FLIPIcons:{render(){}}},
  fetch:async()=>({ok:true,json:async()=>({
    leaders:[{place:1,name:'@first',cp:99,level:1,rankedCards:1,rankedVariants:1,
      appearance:{background:'acid-signal'}}],
    me:{place:356,name:'@viewer',cp:31.5,level:3,rankedCards:9,rankedVariants:7,
      appearance:{background:'midnight-grid',frame_color:'red'}},
    players:356,matches:356
  })}),setTimeout(){return 1;},clearTimeout(){},URL,Set,JSON};
 runInNewContext(read('src/scripts/leaderboard.js'),ctx);
 ctx.window.FLIPLeaderboard.mount(root);
 await new Promise(r=>setImmediate(r));
 assert.ok(output.innerHTML.includes('МОЯ ПОЗИЦИЯ'));
 assert.ok(output.innerHTML.includes('flip-leader-mine'));
 assert.ok(output.innerHTML.includes('flip-leader-player flip-leader-bg-midnight-grid'));
 assert.ok(output.innerHTML.includes('#356'));
 assert.ok(output.innerHTML.includes('@viewer'));
 assert.ok(output.innerHTML.includes('31,5'));
});
test('Headline and leaderboard items have explicit breathing room',()=>{
 const css=read('src/styles/leaderboard-v0912.css');
 assert.ok(css.includes('.flip-leaderboard-page .flip-leader-results-heading{'));
 assert.ok(css.includes('margin:25px 0 14px'));
 assert.ok(css.includes('.flip-leader-mine-caption{'));
 assert.ok(!css.includes('.flip-leader-mine span{'));
 assert.ok(!css.includes('.flip-leader-mine strong{'));
 assert.ok(css.includes('.flip-leader-podium + .flip-leader-list{margin-top:8px}'));
});
test('Read-only leaderboard SQL returns self with safe appearance from settings',()=>{
 const sql=read('sql/025_flip_v0913_leaderboard_identity.sql');
 assert.ok(sql.includes("'me',(SELECT jsonb_build_object"));
 assert.ok(sql.includes("'background',st.background_id"));
 assert.ok(sql.includes("'username',r.username,'first_name',r.first_name"));
 assert.ok(sql.includes('WHERE r.telegram_id=p_viewer_id'));
 assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.flip_leaderboard_social'));
 assert.doesNotMatch(sql,/UPDATE\s+public\.flip_players|DELETE\s+FROM|TRUNCATE/i);
});
test('Current release is cache-busted for Telegram WebView',()=>{
 const index=read('index.html'),pkg=JSON.parse(read('package.json'));
 assert.equal(pkg.version,'0.9.13');
 for(const p of ['app.js','leaderboard.js','profile-cosmetics.js'])
  assert.ok(index.includes('src/scripts/'+p+'?v='+pkg.version),p);
 assert.ok(index.includes('src/styles/leaderboard-v0912.css?v=0.9.13.1'));
 assert.ok(read('api/flip.js').includes("version:'"+pkg.version+"'"));
});
