import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {handleAdminRequest} from '../api/admin.js';
import {readFileSync} from 'node:fs';

const botToken='12345:STUDIO-BOT-TEST';
function signed(id){
  const data=new URLSearchParams({
    auth_date:String(Math.floor(Date.now()/1000)),
    user:JSON.stringify({id,first_name:'Tester'})
  });
  const key=createHmac('sha256','WebAppData').update(botToken).digest();
  data.set('hash',createHmac('sha256',key).update(
    [...data.entries()].sort(([a],[b])=>a.localeCompare(b,'en'))
      .map(([k,v])=>k+'='+v).join('\n')
  ).digest('hex'));
  return data.toString();
}
function request(id,body={action:'studio_login'}){
  return new Request('https://flip.example.com/api/admin',{
    method:'POST',headers:{
      'x-telegram-init-data':signed(id),'content-type':'application/json'
    },body:JSON.stringify(body)
  });
}
test('Email-free login rejects non-owners even with the right email in POST',async()=>{
  const env=process.env;
  process.env={...env,TELEGRAM_BOT_TOKEN:botToken,
    FLIP_ADMIN_TELEGRAM_ID:'12345',
    FLIP_STUDIO_OWNER_EMAIL:'owner@example.com',
    SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test'};
  try{
    const blocked=await handleAdminRequest(request(99999,{
      action:'studio_login',email:'owner@example.com'
    }));
    assert.equal(blocked.status,403);
    const unsigned=await handleAdminRequest(new Request('https://flip.example.com/api/admin',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({action:'studio_login'})
    }));
    assert.equal(unsigned.status,401);
  }finally{process.env=env}
});
test('Email-free login fails closed when owner email is not configured',async()=>{
  const env=process.env;
  process.env={...env,TELEGRAM_BOT_TOKEN:botToken,
    FLIP_ADMIN_TELEGRAM_ID:'12345',FLIP_STUDIO_OWNER_EMAIL:'',
    SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_test'};
  try{
    const r=await handleAdminRequest(request(12345,{
      action:'studio_login',email:'attacker@example.com'
    }));
    assert.equal(r.status,503);
    assert.equal((await r.json()).error,'STUDIO_LOGIN_NOT_CONFIGURED');
  }finally{process.env=env}
});
test('Secure login uses owner-pinned server email and does not disclose keys',()=>{
  const src=readFileSync(new URL('../api/admin.js',import.meta.url),'utf8');
  assert.match(src,/process\.env\.FLIP_STUDIO_OWNER_EMAIL/);
  assert.match(src,/client\.auth\.admin\.generateLink/);
  assert.match(src,/type:'magiclink'/);
  assert.match(src,/scope:'studio_owner'/);
  assert.match(src,/STUDIO_LOGIN_UNAVAILABLE/);
  assert.doesNotMatch(src,/email:body\.email/);
  const admin=readFileSync(new URL('../src/scripts/admin.js',import.meta.url),'utf8');
  assert.match(admin,/data-admin-studio-login/);
  assert.match(admin,/data-admin-studio-login-copy/);
  assert.match(admin,/grant_card/);
  assert.match(admin,/grant_resource/);
});
