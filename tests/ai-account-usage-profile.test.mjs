import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {HistoryStore} from '../services/ai-account-usage/history-store.mjs';
import {probeCodexOAuth} from '../services/ai-account-usage/codex-oauth.mjs';
const now=1800000000000,stamp=new Date(now).toISOString();
const claims={iss:'https://auth.openai.com',sub:'synthetic',exp:now/1000+3600,email:'sample@example.test',name:'Cached Name',
  'https://api.openai.com/auth':{chatgpt_user_id:'user-test',chatgpt_account_id:'account-test'}};
const jwt=x=>[Buffer.from(JSON.stringify({alg:'RS256'})).toString('base64url'),Buffer.from(JSON.stringify(x)).toString('base64url'),'c3ludGhldGlj'].join('.');
const snapshot={authMode:'chatgpt',accountId:'account-test',idToken:jwt(claims),accessToken:jwt(claims)};
const expectedIdentity={userId:'user-test',accountId:'account-test'};
const data={user_id:'user-test',account_id:'account-test',plan_type:'pro',rate_limit:{primary_window:{used_percent:15,limit_window_seconds:604800,reset_at:now/1000+5000}}};
const probe=(extra={},at=now)=>probeCodexOAuth({snapshot,expectedIdentity,clock:()=>at,requestImpl:async()=>({status:200,headers:{'content-type':'application/json'},body:JSON.stringify({...data,...extra,access_token:'NEVER_FORWARD'})})});
test('server email/name projected with sources, cached name distinct, no tokens',async()=>{
  const live=await probe({email:'sample@example.test',name:'Server Name'});
  assert.equal(live.status,'OK');
  assert.equal(live.identity.emailSource,'USAGE_RESPONSE');assert.equal(live.identity.displayNameSource,'USAGE_RESPONSE');
  assert.equal(live.identity.displayName,'Server Name');
  const cache=await probe();assert.equal(cache.identity.emailSource,'OAUTH_CACHE');assert.equal(cache.identity.displayName,'Cached Name');
  assert.equal(cache.identity.displayNameSource,'OAUTH_CACHE');
  for(const secret of [snapshot.idToken,snapshot.accessToken,'NEVER_FORWARD'])assert.ok(!JSON.stringify(live).includes(secret));
});
test('mismatched or malformed server email fails closed without profile',async()=>{
  for(const email of ['other@example.test','not-email',false]){
    const result=await probe({email});assert.equal(result.status,'IDENTITY_UNVERIFIED');assert.equal(result.identity,undefined);
  }
});
test('profile persists privately; failed refresh preserves it and binding cannot change',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'usage-profile-'));
  try{
    const store=new HistoryStore({directory});await store.register({alias:'test_01',displayName:'Admin Note'});
    const result=await probe({email:'sample@example.test'});await store.record('test_01',result);
    const reopened=new HistoryStore({directory});let a=(await reopened.accounts())[0];
    assert.equal(a.identity.emailSource,'USAGE_RESPONSE');assert.equal(a.displayName,'Admin Note');
    await reopened.record('test_01',{mode:'CODEX_OAUTH',status:'AUTH_REQUIRED',reason:'QUOTA_REJECTED_OAUTH',checkedAt:new Date(now+1000).toISOString()});
    a=(await store.accounts())[0];assert.equal(a.identity.observedAt,stamp);assert.equal(a.windows[0].usedPercent,15);
    const changed=await probe({},now+2000);changed.identity.accountId='different';
    await assert.rejects(store.record('test_01',changed),/E_ACCOUNT_IDENTITY_CHANGED/);
    changed.identity.accountId='account-test';changed.identity.accessToken='NEVER';
    await assert.rejects(store.record('test_01',changed),/E_ACCOUNT_IDENTITY/);
    const path=join(directory,'history-v1.json'),body=await readFile(path,'utf8');assert.ok(!body.includes(snapshot.accessToken));
    const state=JSON.parse(body);delete state.accounts.test_01.identity;await writeFile(path,JSON.stringify(state));
    assert.equal((await store.accounts())[0].identity,null); // Existing R1.4 records remain readable.
    state.accounts.test_01.identity={...result.identity,token:'NEVER'};await writeFile(path,JSON.stringify(state));
    await assert.rejects(store.accounts(),/E_HISTORY_SCHEMA/);
  }finally{await rm(directory,{recursive:true,force:true});}
});
