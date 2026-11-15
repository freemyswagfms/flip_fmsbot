import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const server=readFileSync(new URL('../studio/api/manage.js',import.meta.url),'utf8');
const client=readFileSync(new URL('../studio/app.js',import.meta.url),'utf8');

test('Team invite never depends on SMTP and only the owner can create invite links',()=>{
 assert.match(server,/auth\.member\.role!=='owner'/);
 assert.match(server,/type:candidate\?'magiclink':'invite'/);
 assert.match(server,/supabase\.auth\.admin\.generateLink/);
 assert.doesNotMatch(server,/inviteUserByEmail/);
 assert.match(server,/if\(!isEmail\(email\)\|\|!\['admin','editor'\]\.includes\(role\)\)/);
 assert.match(server,/const actionLink=data\?\.properties\?\.action_link/);
 assert.match(server,/secureLink\.origin!==auth\.db\.origin/);
 assert.match(server,/secureLink\.pathname!=='\/auth\/v1\/verify'/);
 assert.match(server,/delivery:'copy_code'/);
 assert.match(server,/action:'invite_or_change_role'/);
});
test('Studio invites expose bearer URL only to authenticated Owner via a transient copy dialog',()=>{
 assert.match(client,/data-action="invite-copy"/);
 assert.match(client,/async function copyInviteLink/);
 assert.match(client,/case 'invite-copy':await copyInviteLink\(\);break/);
 assert.match(client,/result\.delivery!=='copy_code'/);
 assert.match(client,/Код приглашения/);
 assert.match(client,/Почта и SMTP не используются/);
 assert.doesNotMatch(client,/localStorage\.setItem\('studio-team-invite/);
});
