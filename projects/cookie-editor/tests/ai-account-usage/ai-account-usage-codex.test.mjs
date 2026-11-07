import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {probeCodexOAuth} from '../../ai-account-usage/codex-oauth.mjs';
const now = 1800000000000;
const authKey = 'https://api.openai.com/auth';
const claims = {iss: 'https://auth.openai.com', sub: 'auth0|synthetic', exp: now / 1000 + 3600,
  email: 'synthetic@example.test', [authKey]: {chatgpt_user_id: 'user-test', chatgpt_account_id: 'account-test'}};
const jwt = data => [ {alg: 'RS256'}, data ].map(x => Buffer.from(JSON.stringify(x)).toString('base64url')).join('.') + '.c3ludGhldGlj';
const snapshot = () => ({authMode: 'chatgpt', accessToken: jwt(claims), idToken: jwt(claims), accountId: 'account-test'});
const expectedIdentity = {userId: 'user-test', accountId: 'account-test', email: 'synthetic@example.test'};
const window = {used_percent: 23, limit_window_seconds: 18000, reset_at: now / 1000 + 100};
const data = () => ({user_id: 'user-test', account_id: 'account-test', plan_type: 'plus', rate_limit: {primary_window: {...window}, secondary_window: null}});
async function run({snap = snapshot(), expected = expectedIdentity, status = 200, body = data(), transport} = {}) {
  let calls = 0;
  const result = await probeCodexOAuth({snapshot: snap, expectedIdentity: expected, clock: () => now,
    requestImpl: async (url, options) => {
      calls++;
      assert.equal(url, 'https://chatgpt.com/backend-api/wham/usage');
      assert.equal(options.method, 'GET');
      assert.equal(options.headers.authorization, `Bearer ${snap.accessToken}`);
      assert.equal(options.headers['ChatGPT-Account-Id'], 'account-test');
      assert.equal(options.headers['User-Agent'], 'codex-cli');
      assert.equal(options.timeoutMs, 10000);
      if (transport) return transport();
      return {status, headers: {'content-type': 'application/json'}, body: typeof body === 'string' ? body : JSON.stringify(body)};
    }});
  assert.equal(result.mode, 'CODEX_OAUTH');
  assert.equal(result.sessionHttpStatus, null);
  assert.ok(!JSON.stringify(result).includes(snap?.accessToken ?? 'never-match'));
  return {result, calls};
}
test('reject invalid auth and token bindings before any network', async () => {
  const mutations = [s => s.authMode = 'apikey', s => s.refreshToken = 'forbidden', s => s.accessToken += '\r\n',
    s => s.accountId = 'other', s => s.accessToken = jwt({...claims, exp: now / 1000}),
    s => s.accessToken = jwt({...claims, iss: 'https://other.test'}), s => s.idToken = jwt({...claims, sub: 'other'}),
    s => s.accessToken = jwt({...claims, email: 'other@example.test'}), s => s.accessToken = jwt({...claims, [authKey]: {...claims[authKey], chatgpt_user_id: 'other'}}),
    s => s.idToken = jwt({...claims, [authKey]: {...claims[authKey], chatgpt_account_id: 'other'}}),
    s => s.accessToken = 'a'.repeat(32769), s => s.idToken = 'bad.token.parts'];
  for (const mutate of mutations) {
    const snap = snapshot(); mutate(snap);
    const {result, calls} = await run({snap}); assert.equal(calls, 0); assert.equal(result.status, 'AUTH_REQUIRED');
  }
  for (const expected of [{}, {...expectedIdentity, email: 'other@example.test'}, {...expectedIdentity, accountId: 'other'}]) {
    const {result, calls} = await run({expected}); assert.equal(calls, 0); assert.notEqual(result.status, 'OK');
  }
});
test('HTTP failures stop after exactly one GET', async () => {
  for (const [status, expected] of [[401,'AUTH_REQUIRED'],[403,'AUTH_REQUIRED'],[429,'RATE_LIMITED'],[302,'UNAVAILABLE'],[500,'UNAVAILABLE']]) {
    const {result, calls} = await run({status}); assert.equal(calls, 1); assert.equal(result.status, expected); assert.equal(result.quotaHttpStatus, status);
  }
});
test('response requires both top-level identities', async () => {
  for (const key of ['user_id', 'account_id']) for (const value of [null, undefined, 'other']) {
    const body = data(); body[key] = value;
    assert.equal((await run({body})).result.status, 'IDENTITY_UNVERIFIED');
  }
});
test('main and additional buckets preserve independent windows', async () => {
  const body = data(); body.additional_rate_limits = [{metered_feature:'review',limit_name:'Human readable review', rate_limit:{primary_window:{...window, used_percent: 0}, secondary_window:{...window, used_percent:100}}}];
  const {result} = await run({body, transport: () => new Response(JSON.stringify(body), {headers:{'content-type':'application/json'}})});
  assert.equal(result.status,'OK'); assert.equal(result.sessionUserVerified,true); assert.equal(result.workspaceVerified,true);
  assert.deepEqual(result.windows.map(w => [w.limitId,w.key,w.usedPercent]), [['codex','primary',23],['review','primary',0],['review','secondary',100]]);
  assert.equal(result.windows[0].resetsAt,new Date(window.reset_at*1000).toISOString());
});
test('null, malformed and oversized schemas fail closed', async () => {
  for (const raw of [null, {}, {...window,used_percent:null}, {...window,used_percent:'0'}, {...window,used_percent:101}, {...window,limit_window_seconds:null}, {...window,reset_at:null}, {...window,reset_at:'1800000100'}]) {
    const body=data(); body.rate_limit.primary_window=raw;
    assert.equal((await run({body})).result.status,'SCHEMA_UNKNOWN');
  }
  for (const body of ['null','{', ' '.repeat(98305), {...data(),rate_limit:{}}, {...data(),additional_rate_limits:{}}, {...data(),additional_rate_limits:[{metered_feature:'codex',limit_name:'Other',rate_limit:data().rate_limit}]}])
    assert.equal((await run({body})).result.status,'SCHEMA_UNKNOWN');
  const {result} = await run({transport: () => ({status:200,headers:{'content-type':'application/json'},body:(async function*(){yield Buffer.alloc(98305);})()})});
  assert.equal(result.status,'SCHEMA_UNKNOWN');
});
test('transport errors and raw payload secrets never escape', async () => {
  const secret='SYNTHETIC_SECRET_DO_NOT_OUTPUT';
  const {result,calls}=await run({transport:()=>{throw Error(secret);}});
  assert.equal(calls,1); assert.equal(result.status,'UNAVAILABLE'); assert.ok(!JSON.stringify(result).includes(secret));
  const body=data(); body.secret=secret;
  assert.ok(!JSON.stringify((await run({body})).result).includes(secret));
});

test('native transport issues one fixed GET and does not follow redirects', async t => {
  let calls=0;
  t.mock.method(https,'request',(url,options,callback)=>{
    calls++;
    assert.equal(url,'https://chatgpt.com/backend-api/wham/usage');
    assert.equal(options.agent,false);
    assert.equal(options.method,'GET');
    const req=new EventEmitter();
    req.setTimeout=()=>req;
    req.destroy=error=>req.emit('error',error);
    req.end=()=>queueMicrotask(()=>{
      const res=Readable.from(['do not forward this body']);
      res.statusCode=302;
      res.headers={location:'https://other.example/'};
      callback(res);
    });
    return req;
  });
  const result=await probeCodexOAuth({snapshot:snapshot(),expectedIdentity,clock:()=>now});
  assert.equal(result.reason,'REDIRECT_BLOCKED');
  assert.equal(calls,1);
});

test('stalled injected transport times out without retry', async t => {
  t.mock.timers.enable({apis:['setTimeout']});
  let calls=0;
  const pending=probeCodexOAuth({snapshot:snapshot(),expectedIdentity,clock:()=>now,
    requestImpl:()=>{calls++;return new Promise(()=>{});}});
  t.mock.timers.tick(10001);
  assert.equal((await pending).status,'UNAVAILABLE');
  assert.equal(calls,1);
});
