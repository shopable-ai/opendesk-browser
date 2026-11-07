import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, chmod, symlink, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAccountService} from '../../ai-account-usage/account-service.mjs';
import {codexAuthFileSource} from '../../ai-account-usage/authorized-sources.mjs';
import {HistoryStore} from '../../ai-account-usage/history-store.mjs';
const now = Date.parse('2026-10-30T00:00:00.000Z');
const AUTH = 'https://api.openai.com/auth';
const jwt = data => `${Buffer.from(JSON.stringify({alg:'RS256'})).toString('base64url')}.${Buffer.from(JSON.stringify(data)).toString('base64url')}.signature`;
function auth(user = 'user1') {
  const token = jwt({iss:'https://auth.openai.com',sub:user,exp:now/1000+3600,email:`${user}@example.com`,
    [AUTH]:{chatgpt_user_id:user,chatgpt_account_id:`account-${user}`}});
  return {auth_mode:'chatgpt',tokens:{access_token:token,id_token:token,account_id:`account-${user}`,refresh_token:'DO_NOT_RETURN'}};
}
const loaded = (alias, user = 'user1') => {
  const a = auth(user);
  return {alias,authorized:true,snapshot:{authMode:'chatgpt',accessToken:a.tokens.access_token,idToken:a.tokens.id_token,accountId:a.tokens.account_id},
    expectedIdentity:{userId:user,accountId:`account-${user}`,email:`${user}@example.com`}};
};
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(),'account-service-'));
  t.after(() => rm(directory,{recursive:true,force:true}));
  return {directory,store:new HistoryStore({directory})};
}
test('cache/history preserve labels and never load sources or request; unknown stays isolated',async t => {
  const {store} = await fixture(t); let loads=0, requests=0;
  await store.register({alias:'first',displayName:'Existing'});
  const service=createAccountService({store,accounts:[{alias:'first',displayName:'Replacement',mode:'CODEX_OAUTH',loadAuthorizedAccount:async()=>{loads++;throw Error('secret');}}],requestImpl:async()=>{requests++;}});
  assert.equal((await service.query()).results[0].account.displayName,'Existing');
  assert.deepEqual((await service.query({operation:'history'})).results[0].history,{observations:[],rollovers:[]});
  assert.equal((await service.query({alias:'unknown',operation:'refresh'})).results[0].error,'E_ACCOUNT_UNKNOWN');
  assert.equal(loads,0);assert.equal(requests,0);
  for(const aliases of [['first','first'],['!'],Array(65).fill('first')]) await assert.rejects(service.query({aliases}));
});
test('refresh continues after provider failure, isolates snapshots and serializes the same alias',async t => {
  const {store}=await fixture(t); let tick=now, active=0, peak=0, requests=0;
  const shared=loaded('good');
  const service=createAccountService({store,clock:()=>tick++,accounts:[
    {alias:'bad',displayName:'Bad',mode:'CODEX_OAUTH',loadAuthorizedAccount:async()=>{throw Error('TOKEN_SECRET');}},
    {alias:'good',displayName:'Good',mode:'CODEX_OAUTH',loadAuthorizedAccount:async()=>shared}],requestImpl:async()=>{
      requests++;active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,5));active--;
      return {status:401};
    }});
  const result=await service.query({operation:'refresh'});
  assert.equal(result.results.length,2);assert.equal(requests,1);
  assert.ok(!JSON.stringify(result).includes('TOKEN_SECRET'));
  await Promise.all([service.query({alias:'good',operation:'refresh'}),service.query({alias:'good',operation:'refresh'})]);
  assert.equal(peak,1);assert.equal(shared.snapshot.accessToken,loaded('good').snapshot.accessToken);
});
test('persisted identity blocks replaced source before any request',async () => {
  let requests=0, recorded;
  const store={accounts:async()=>[{alias:'bound',displayName:'Bound',identity:{userId:'original',accountId:'original-account',email:'original@example.com'}}],
    record:async(alias,attempt)=>{recorded=attempt;},register:async()=>{throw Error('unexpected');}};
  const service=createAccountService({store,clock:()=>now,accounts:[{alias:'bound',displayName:'Bound',mode:'CODEX_OAUTH',loadAuthorizedAccount:async()=>loaded('bound','replacement')}],requestImpl:async()=>{requests++;}});
  await service.query({alias:'bound',operation:'refresh'});
  assert.equal(requests,0);assert.equal(recorded.status,'IDENTITY_UNVERIFIED');
  assert.equal(recorded.reason,'ACCOUNT_BINDING_CHANGED');
});
test('private explicit source omits refresh tokens, rereads replacement and rejects unsafe files',async t => {
  const {directory}=await fixture(t);const path=join(directory,'auth.json');
  await writeFile(path,JSON.stringify(auth()),{mode:0o600});
  const source=codexAuthFileSource({alias:'local',path});
  const first=await source('local');assert.ok(!JSON.stringify(first).includes('DO_NOT_RETURN'));
  first.snapshot.accountId='mutated';assert.equal((await source('local')).snapshot.accountId,'account-user1');
  await writeFile(path,JSON.stringify(auth('user2')));assert.equal((await source('local')).expectedIdentity.userId,'user2');
  await assert.rejects(source('other'),/E_AUTH_REQUIRED/);
  await chmod(path,0o644);await assert.rejects(source('local'),/E_AUTH_REQUIRED/);await chmod(path,0o600);
  const link=join(directory,'link');await symlink(path,link);
  await assert.rejects(codexAuthFileSource({alias:'local',path:link})('local'),/E_AUTH_REQUIRED/);
  await assert.rejects(codexAuthFileSource({alias:'local',path:directory})('local'),/E_AUTH_REQUIRED/);
  await writeFile(path,' '.repeat(128*1024+1));await assert.rejects(source('local'),/E_AUTH_REQUIRED/);
});
test('successful refresh binds persisted identity and replacement file cannot rebind it',async t => {
  const {directory,store}=await fixture(t);const path=join(directory,'source.json');
  await writeFile(path,JSON.stringify(auth()),{mode:0o600});let requests=0,tick=now;
  const service=createAccountService({store,clock:()=>tick++,accounts:[{alias:'local',displayName:'Local',mode:'CODEX_OAUTH',
    loadAuthorizedAccount:codexAuthFileSource({alias:'local',path})}],requestImpl:async()=>{
      requests++;return {status:200,headers:{'content-type':'application/json'},body:JSON.stringify({
        user_id:'user1',account_id:'account-user1',email:'user1@example.com',plan_type:'plus',
        rate_limit:{primary_window:{used_percent:20,limit_window_seconds:18000,reset_at:now/1000+18000}}})};
    }});
  assert.equal((await service.query({operation:'refresh'})).results[0].status,'OK');
  assert.equal((await store.accounts())[0].identity.userId,'user1');
  await writeFile(path,JSON.stringify(auth('user2')));
  assert.notEqual((await service.query({operation:'refresh'})).results[0].status,'OK');
  assert.equal(requests,1);assert.equal((await store.accounts())[0].identity.userId,'user1');
  assert.equal((await service.query({operation:'history'})).results[0].history.observations.length,1);
});
test('an already bound user/account cannot also bind a second alias',async () => {
  let requests=0;
  const store={accounts:async()=>[{alias:'original',identity:{userId:'user1',accountId:'account-user1'}},{alias:'duplicate'}],
    record:async()=>{},register:async()=>{}};
  const service=createAccountService({store,clock:()=>now,accounts:[{alias:'duplicate',displayName:'Duplicate',mode:'CODEX_OAUTH',
    loadAuthorizedAccount:async()=>loaded('duplicate')}],requestImpl:async()=>{requests++;}});
  await service.query({operation:'refresh'});assert.equal(requests,0);
});
