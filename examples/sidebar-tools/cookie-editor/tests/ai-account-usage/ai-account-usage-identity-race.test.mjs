import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {HistoryStore} from '../../ai-account-usage/history-store.mjs';
import {createAccountService} from '../../ai-account-usage/account-service.mjs';

const now = Date.parse('2026-10-30T00:00:00.000Z');
const identity = {userId:'synthetic-user', accountId:'synthetic-account', email:'race@example.test'};
const jwt = claims => `${Buffer.from('{"alg":"RS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
const token = jwt({iss:'https://auth.openai.com', sub:identity.userId, exp:now/1000+3600,
  email:identity.email, 'https://api.openai.com/auth':{chatgpt_user_id:identity.userId, chatgpt_account_id:identity.accountId}});
const authorized = alias => ({alias, authorized:true, expectedIdentity:{...identity},
  snapshot:{authMode:'chatgpt', accessToken:token, idToken:token, accountId:identity.accountId}});
const response = () => ({status:200, headers:{'content-type':'application/json'}, body:JSON.stringify({
  user_id:identity.userId, account_id:identity.accountId, email:identity.email, plan_type:'pro',
  rate_limit:{primary_window:{used_percent:25, limit_window_seconds:18000, reset_at:now/1000+18000}}
})});
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
};
const sample = (checkedAt, profile) => ({mode:'CODEX_OAUTH', status:'OK', reason:'CODEX_OAUTH_CONFIRMED', checkedAt,
  sessionUserVerified:true, workspaceVerified:true, workspaceEvidence:'OAUTH_USAGE_USER_AND_ACCOUNT_IDS',
  identityEvidence:'OAUTH_TOKEN_CLAIMS_AND_USAGE_RESPONSE_USER_ACCOUNT_IDS',
  ...(profile ? {identity:{...profile, emailSource:'OAUTH_CACHE', displayName:null, displayNameSource:'UNKNOWN', observedAt:checkedAt}} : {}),
  windows:[{key:'primary', durationSeconds:18000, usedPercent:60, remainingPercent:40, resetsAt:'2026-10-30T05:00:00.000Z'}]});
async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'usage-identity-race-'));
  t.after(() => rm(directory, {recursive:true, force:true}));
  const store = new HistoryStore({directory});
  for (const alias of ['alpha','bravo']) await store.register({alias, displayName:alias});
  return {directory, store};
}

for (const winner of ['alpha','bravo']) test(`two services first-bind one identity: ${winner} commits first`, {timeout:5000}, async t => {
  const {directory, store} = await setup(t);
  const loser = winner === 'alpha' ? 'bravo' : 'alpha';
  // Keep pre-existing quota/history on the still-unbound losing alias.
  await store.record(loser, sample(new Date(now-1000).toISOString()));
  const calls = {alpha:0, bravo:0}, entered = {}, release = {}, services = {};
  for (const alias of ['alpha','bravo']) {
    entered[alias] = deferred(); release[alias] = deferred();
    t.after(() => release[alias].resolve());
    services[alias] = createAccountService({store:new HistoryStore({directory}), clock:()=>now,
      accounts:[{alias, displayName:alias, mode:'CODEX_OAUTH', loadAuthorizedAccount:async()=>authorized(alias)}],
      requestImpl:async()=>{calls[alias]++; entered[alias].resolve(); await release[alias].promise; return response();}});
    await services[alias].initialize();
  }
  const pending = Object.fromEntries(['alpha','bravo'].map(alias=>[alias, services[alias].query({alias, operation:'refresh'})]));
  // Both independent refresh queues pass the lock-free precheck before either commits.
  await Promise.all(Object.values(entered).map(gate=>gate.promise));
  release[winner].resolve();
  const accepted = (await pending[winner]).results[0];
  assert.equal(accepted.status, 'OK');
  const committed = await new HistoryStore({directory}).snapshot();
  const committedBytes = await readFile(join(directory,'history-v1.json'), 'utf8');
  release[loser].resolve();
  const rejected = (await pending[loser]).results[0];
  const persisted = await new HistoryStore({directory}).snapshot();
  t.diagnostic(JSON.stringify({winner, results:[accepted.status, rejected.status], error:rejected.error, simulatedRequests:calls,
    persistedIdentityCount:Object.values(persisted.accounts).filter(row=>row.identity?.userId===identity.userId && row.identity?.accountId===identity.accountId).length}));
  assert.equal(rejected.status, 'UNAVAILABLE');
  assert.equal(rejected.error, 'E_IDENTITY_DUPLICATE');
  assert.deepEqual(calls, {alpha:1, bravo:1}); // Commit rejection, no retries; both simulated requests already occurred.
  assert.deepEqual(persisted, committed);
  assert.equal(await readFile(join(directory,'history-v1.json'), 'utf8'), committedBytes);
  assert.equal(Object.values(persisted.accounts).filter(row=>row.identity).length, 1);
  assert.equal(persisted.accounts[loser].identity, null);
  assert.equal((await new HistoryStore({directory}).history(loser)).observations.length, 1);
});

test('store rejects duplicate identity across aliases atomically, but accepts a different account for the same user', async t => {
  const {directory, store} = await setup(t);
  const checkedAt = new Date(now).toISOString();
  await store.record('alpha', sample(checkedAt, identity));
  const before = await readFile(join(directory,'history-v1.json'), 'utf8');
  await assert.rejects(new HistoryStore({directory}).record('bravo', sample(checkedAt, {...identity, email:'other@example.test'})),
    {code:'E_IDENTITY_DUPLICATE', message:'E_IDENTITY_DUPLICATE'});
  assert.equal(await readFile(join(directory,'history-v1.json'), 'utf8'), before);
  await store.record('bravo', sample(checkedAt, {...identity, accountId:'another-account'}));
  assert.equal(Object.values((await new HistoryStore({directory}).snapshot()).accounts).filter(row=>row.identity).length, 2);
});
