import {test} from 'node:test';
import assert from 'node:assert/strict';
import {probeCookieOnly} from '../services/ai-account-usage/probe.mjs';

const account = (value, id) => ({
  snapshot: {origin: 'https://chatgpt.com', cookies: [{
    name:'__Secure-next-auth.session-token', value, domain:'.chatgpt.com',
    hostOnly: false, secure:true, path:'/', storeId:'0', session: true
  }]},
  expectedIdentity: {userId:id}
});
const json = (data, status=200) => new Response(JSON.stringify(data), {status, headers: {'content-type':'application/json'}});
const quota = {account_id:'workspace-1',rate_limit:{primary_window:{used_percent:30, limit_window_seconds:18000,reset_at:1900000000},secondary_window:{used_percent:60,limit_window_seconds:604800,reset_at:1900200000}}};
const user = id => ({user:{id, email:'private@example.invalid'},accessToken:'must-never-be-returned'});
const fake = (quotaResponse,sessionResponse,received=[]) => async (url, options) => {
  received.push({url,options});
  return url.endsWith('/wham/usage') ? quotaResponse : sessionResponse;
};

test('cookie-only GET, identity verified, windows remain separate and no credentials escape output', async()=>{
  const calls=[];
  const output=await probeCookieOnly({...account('top-secret','user-1'),expectedIdentity:{userId:'user-1',accountId:'workspace-1'},fetchImpl:fake(json(quota),json(user('user-1')),calls),clock:()=>1890000000000});
  assert.equal(output.status,'OK');
  assert.equal(output.mode,'COOKIE_ONLY');
  assert.equal(output.workspaceVerified,true);
  assert.equal(output.windows.length,2);
  assert.equal(output.windows[0].remainingPercent,70);
  assert.equal(output.windows[1].remainingPercent,40);
  assert.deepEqual(calls.map(x=>x.url), ['https://chatgpt.com/backend-api/wham/usage','https://chatgpt.com/api/auth/session']);
  assert.ok(calls.every(x=>x.options.method==='GET' && x.options.redirect==='manual' && x.options.headers.cookie.includes('top-secret')));
  assert.ok(calls.every(x=>!Object.keys(x.options.headers).some(k=>/auth|token|account-id|origin|referer/i.test(k))));
  assert.ok(!JSON.stringify(output).includes('top-secret'));
  assert.ok(!JSON.stringify(output).includes('private@example.invalid'));
  assert.ok(!JSON.stringify(output).includes('must-never-be-returned'));
});

test('HTTP 401 is not a success and never invokes session, access-token fallback or retry', async()=>{
  const calls=[];
  const output=await probeCookieOnly({...account('a','user-1'),fetchImpl:fake(json({detail:'bad'},401),json(user('user-1')),calls)});
  assert.equal(output.status,'AUTH_REQUIRED');
  assert.equal(output.reason,'QUOTA_REJECTED_COOKIE_ONLY');
  assert.equal(output.quotaHttpStatus,401);
  assert.equal(calls.length,1);
});

test('429, 302 and 503 are differentiated without redirect or retry', async()=>{
  for (const [code,status,reason] of [[429,'RATE_LIMITED','QUOTA_RATE_LIMITED'],[302,'UNAVAILABLE','REDIRECT_BLOCKED'],[503,'UNAVAILABLE','QUOTA_HTTP_ERROR']]) {
    const calls=[];
    const output=await probeCookieOnly({...account('a','u'),fetchImpl:fake(new Response(null,{status:code}),json(user('u')),calls)});
    assert.equal(output.status,status);
    assert.equal(output.reason,reason);
    assert.equal(calls.length,1);
  }
});

test('200 with unknown shape is SCHEMA_UNKNOWN, never empty quota', async()=>{
  const calls=[];
  const output=await probeCookieOnly({...account('a','u'),fetchImpl:fake(json({rate_limit:{primary_window:null}}),json(user('u')),calls)});
  assert.equal(output.status,'SCHEMA_UNKNOWN');
  assert.equal(calls.length,1);
  assert.equal(output.windows,undefined);
});

test('second account cannot claim first account identity', async()=>{
  const first=await probeCookieOnly({...account('cookie-a','user-a'),expectedIdentity:{userId:'user-a',accountId:'workspace-1'},fetchImpl:fake(json(quota),json(user('user-a')))});
  const second=await probeCookieOnly({...account('cookie-b','user-b'),expectedIdentity:{userId:'user-b',accountId:'workspace-1'},fetchImpl:fake(json(quota),json(user('user-a')))});
  assert.equal(first.status,'OK');
  assert.equal(second.status,'IDENTITY_UNVERIFIED');
  assert.equal(second.reason,'USER_ID_MISMATCH');
  assert.equal(second.windows,undefined);
});

test('quota account_id is checked against explicit expectedAccountId', async()=>{
  const input=account('a','u');
  const bad=await probeCookieOnly({...input,fetchImpl:fake(json({...quota,account_id:'workspace-other'}),json(user('u')))});
  assert.equal(bad.status,'IDENTITY_UNVERIFIED');
  const ok=await probeCookieOnly({...input,expectedIdentity:{userId:'u',accountId:'workspace-1'},fetchImpl:fake(json({...quota,account_id:'workspace-1'}),json(user('u')))});
  assert.equal(ok.status,'OK');
  assert.equal(ok.workspaceVerified,true);
});

test('rejects wrong origin and partitioned Cookie; no request is sent', async()=>{
  let n=0;
  const fetchImpl=async()=>{n++;throw Error('should not send');};
  const input=account('a','u');
  assert.equal((await probeCookieOnly({...input,snapshot:{...input.snapshot,origin:'https://evil.example'},fetchImpl})).reason,'SNAPSHOT_SCOPE_INVALID');
  input.snapshot.cookies[0].partitionKey={topLevelSite:'https://chatgpt.com'};
  assert.equal((await probeCookieOnly({...input,fetchImpl})).reason,'COOKIE_ROW_UNSAFE');
  assert.equal(n,0);
});

test('expired cookies are never sent',async()=>{
  const input=account('expired','u');
  input.snapshot.cookies[0].session=false;
  input.snapshot.cookies[0].expirationDate=1000;
  const output=await probeCookieOnly({...input,fetchImpl:async()=>{throw Error('unexpected')}});
  assert.equal(output.status,'AUTH_REQUIRED');
  assert.equal(output.reason,'NO_ELIGIBLE_COOKIES');
});

test('expected user identity is mandatory before network request',async()=>{
  const input=account('secret','u');
  const output=await probeCookieOnly({...input,expectedIdentity:{},fetchImpl:async()=>{throw Error('unexpected')}});
  assert.equal(output.status,'IDENTITY_UNVERIFIED');
  assert.equal(output.reason,'EXPECTED_IDENTITY_REQUIRED');
});

test('a session user match cannot claim success without matching quota workspace identity', async()=>{
  const input=account('a','u');
  const output=await probeCookieOnly({...input,fetchImpl:fake(json({...quota,account_id:undefined}),json(user('u')))});
  assert.equal(output.status,'IDENTITY_UNVERIFIED');
  assert.equal(output.reason,'QUOTA_ACCOUNT_ID_NOT_RETURNED');
  assert.equal(output.quotaHttpStatus,200);
  assert.equal(output.quotaSchemaRecognized,true);
  assert.equal(output.windows,undefined);
});

test('never mutates saved cookie snapshot', async()=>{
  const input=account('a','u');
  const before=structuredClone(input.snapshot);
  await probeCookieOnly({...input,expectedIdentity:{userId:'u',accountId:'workspace-1'},fetchImpl:fake(json(quota),json(user('u')))});
  assert.deepEqual(input.snapshot,before);
});

test('recognizes wrapped rate_limits.rate_limit and rejects invalid reset dates', async()=>{
  const input=account('a','u');
  const good=await probeCookieOnly({...input,expectedIdentity:{userId:'u',accountId:'workspace-1'},fetchImpl:fake(json({account_id:'workspace-1',rate_limits:{rate_limit:quota.rate_limit}}),json(user('u')))});
  assert.equal(good.status,'OK');
  assert.equal(good.windows.length,2);
  const bad=await probeCookieOnly({...input,fetchImpl:fake(json({...quota,rate_limit:{primary_window:{used_percent:2,limit_window_seconds:18000,reset_at:9000000000000000}}}),json(user('u')))});
  assert.equal(bad.status,'SCHEMA_UNKNOWN');
});

test('successful quota query captures provider plan type and reset_after_seconds fallback without guessing membership', async()=>{
  const input=account('a','u');
  const raw={account_id:'workspace-1',plan_type:'pro',rate_limit:{primary_window:{used_percent:35,
    limit_window_seconds:604800,reset_after_seconds:120}}};
  const output=await probeCookieOnly({...input,expectedIdentity:{userId:'u',accountId:'workspace-1'},
    fetchImpl:fake(json(raw),json(user('u'))),clock:()=>1890000000000});
  assert.equal(output.status,'OK');
  assert.equal(output.planType,'pro');
  assert.equal(output.windows[0].durationSeconds,604800);
  assert.equal(output.windows[0].resetsAt,new Date(1890000120000).toISOString());
  assert.equal(output.membershipExpiresAt,undefined);
});
