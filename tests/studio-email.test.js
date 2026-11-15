import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync(new URL('../studio/app.js',import.meta.url),'utf8');
const block=ui.slice(ui.indexOf('async function signIn(){'),ui.indexOf('async function claimOwner(){'));

test('Studio OTP email submit prevents concurrent duplicate requests',()=>{
 assert.match(block,/if\(emailRequestPending\)return/);
 assert.ok(block.indexOf('emailRequestPending=true')<block.indexOf('signInWithOtp('));
 assert.match(block,/finally\s*\{[\s\S]*?emailRequestPending=false/);
 assert.ok(block.indexOf('emailRequestPending=false')<block.indexOf('authScreen(feedback)'),
  'sending must reset before rebuilding the button');
 assert.match(block,/if\(input\)input\.value=email/);
 assert.match(ui,/emailRequestPending\|\|Date\.now\(\)<emailCooldownUntil/);
});
test('Studio OTP email reports an accurate success state and rate-limits retries',()=>{
 assert.match(block,/emailCooldownUntil=Date\.now\(\)\+30000/);
 assert.match(block,/Запрос принят\. Проверь входящие/);
 assert.match(block,/only request this after\|rate limit\|too many requests/);
 assert.match(block,/Возможно, первое письмо уже пришло/);
 assert.match(ui,/case 'auth-email':await signIn\(\);break/);
 assert.match(ui,/event\.target\.id==='auth-email'.*signIn\(\)/);
});
