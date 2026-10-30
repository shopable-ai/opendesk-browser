import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createApi, sampleStale, accountStale, matches, duration} from '../services/ai-account-usage/web/model.mjs';
const now=Date.parse('2026-10-30T10:00:00Z');
// Synthetic test fixtures only; never loaded by the product UI.
const account={alias:'test-account', displayName:'Test label',lastAttempt:{status:'OK'}};
const window={observedAt:new Date(now-1000).toISOString(),resetsAt:new Date(now+1000).toISOString()};
test('cached samples age, fail and cross reset conservatively',()=>{
  assert.equal(sampleStale(account,window,now),false);
  assert.equal(sampleStale({...account,lastAttempt:{status:'UNAVAILABLE'}},window,now),true);
  assert.equal(sampleStale(account,{...window,observedAt:new Date(now-900001).toISOString()},now),true);
  assert.equal(sampleStale(account,{...window,resetsAt:new Date(now).toISOString()},now),true);
  assert.equal(sampleStale(account,{...window,observedAt:null},now),true);
  assert.equal(accountStale(account,now),true);
  assert.equal(duration(7200),'2 小时');
  assert.equal(duration(259200),'3 天');
  assert.equal(matches(account,'TEST LABEL'),true);
});
test('API only uses cookie-session same-origin requests and explicit refresh has no retry',async()=>{
  const calls=[];
  const api=createApi(async(path,options)=>{calls.push({path,options});return {ok:true,json:async()=>path.endsWith('/refresh')?{account}:{accounts:[],observations:[],rollovers:[]}};});
  assert.equal(calls.length,0);
  await api.accounts(); await api.history(account.alias); await api.refresh(account.alias);
  assert.deepEqual(calls.map(x=>[x.path,x.options.method]),[
    ['/api/v1/accounts','GET'],['/api/v1/accounts/test-account/history?limit=20','GET'],['/api/v1/accounts/test-account/refresh','POST']]);
  for(const {options} of calls){
    assert.equal(options.credentials,'same-origin');assert.equal(options.redirect,'error');
    assert.deepEqual(options.headers,options.method==='POST' ? {Accept:'application/json','Content-Type':'application/json'} : {Accept:'application/json'});
    assert.equal(options.body,options.method==='POST' ? '{}' : undefined);
  }
  let attempts=0;
  const failing=createApi(async()=>{attempts++;throw new Error('private upstream details');});
  await assert.rejects(failing.refresh(account.alias),error=>!error.message.includes('private upstream'));
  assert.equal(attempts,1);
});
test('rejects session failures, malformed payloads and mismatched refresh identities',async()=>{
  for(const status of [401,403]) await assert.rejects(createApi(async()=>({ok:false,status})).accounts(),{message:'请从本机启动终端的连接链接打开'});
  await assert.rejects(createApi(async()=>({ok:true,json:async()=>({})})).accounts(),/格式/);
  await assert.rejects(createApi(async()=>({ok:true,json:async()=>({account:{alias:'other'}})})).refresh(account.alias),/身份/);
});
test('UI uses native modal focus boundary, Escape and return focus; no refresh effect',async()=>{
  const ui=await readFile(new URL('../services/ai-account-usage/web/main.jsx',import.meta.url),'utf8');
  assert.match(ui,/\.showModal\(\)/);assert.match(ui,/onCancel=/);assert.match(ui,/previous\.focus\(\)/);
  assert.equal((ui.match(/api\.refresh\(/g)||[]).length,1);
  assert.doesNotMatch(ui,/localStorage|sessionStorage|document\.cookie|Authorization|https?:\/\//);
});

test('R2.0 UI keeps independent six columns and no fabricated owner or raw aliases',async()=>{
  const source=await readFile(new URL('../services/ai-account-usage/web/main.jsx',import.meta.url),'utf8');
  const css=await readFile(new URL('../services/ai-account-usage/web/style.css',import.meta.url),'utf8');
  assert.ok(source.includes('className="col-current"'));
  assert.ok(source.includes('summarizeVisibleAccounts(rows,records,scope)'));
  assert.ok(source.includes('projectAccountView(a,records[a.alias],scope)'));
  for(const forbidden of ['负责 / 标签','负责人 / 管理标签','className="account-alias"','className="plan-source"'])
    assert.equal(source.includes(forbidden),false);
  assert.ok(source.includes('account.identity?.displayName ?'));
  assert.ok(css.includes('@media(max-width:520px)'));
  assert.ok(css.includes('@media(max-width:240px)'));
  assert.ok(source.includes('className="foot-note"><summary>'));
});
