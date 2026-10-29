import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,lstat,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {request as httpRequest} from 'node:http';
import {HistoryStore} from '../services/ai-account-usage/history-store.mjs';
import {startReadApi} from '../services/ai-account-usage/read-api.mjs';
import {createCollector} from '../services/ai-account-usage/collector.mjs';
import {normalizeProviderPlan,normalizeSubscription} from '../services/ai-account-usage/domain.mjs';

const stamp = sec => new Date(sec * 1000).toISOString();
const profile=(tierLabel='Pro 5x')=>({source:'ADMIN_ENTERED',tierLabel,multiplier:5,
  membershipExpiresAt:'2027-03-01T00:00:00.000Z',nextBillingAt:'2027-02-01T00:00:00.000Z'});
const ok=({at=100000, reset=104000, used=20, key='primary', duration=18000,plan='pro'}={})=>({
  mode:'COOKIE_ONLY',status:'OK', reason:'COOKIE_ONLY_CONFIRMED',checkedAt:stamp(at),
  sessionUserVerified:true,workspaceVerified:true,workspaceEvidence:'QUOTA_ACCOUNT_ID',
  planType:plan,quotaHttpStatus:200,sessionHttpStatus:200,
  windows:[{key,durationSeconds:duration,usedPercent:used,remainingPercent:100-used,resetsAt:stamp(reset)}],
  accessToken:'this MUST NOT persist',cookie:'do not persist',userEmail:'sensitive@example.com'
});
const fail=(at,status='AUTH_REQUIRED')=>({mode:'COOKIE_ONLY',status,reason:'QUOTA_REJECTED_COOKIE_ONLY',checkedAt:stamp(at),quotaHttpStatus:401});
const fixture=async()=>{
  const root=await mkdtemp(join(tmpdir(),'opendesk-usage-'));
  const directory=join(root,'secure-history');
  const store=new HistoryStore({directory});
  return {root,directory,store, cleanup:()=>rm(root,{recursive:true,force:true})};
};

test('provider plan vs admin tier: never infer Pro multiplier or subscription end date',()=>{
  assert.deepEqual(normalizeProviderPlan('pro'),{family:'PRO',code:'pro',multiplier:null,source:'QUOTA_RESPONSE'});
  assert.equal(normalizeProviderPlan('Pro 5x').multiplier,5);
  assert.equal(normalizeProviderPlan('pro_10x').multiplier,10);
  assert.equal(normalizeProviderPlan('pro 20x').multiplier,20);
  assert.equal(normalizeProviderPlan('plus').family,'PLUS');
  assert.equal(normalizeProviderPlan(null).family,'UNKNOWN');
  assert.equal(normalizeSubscription(null).membershipExpiresAt,null);
  assert.equal(normalizeSubscription(profile()).nextBillingAt,'2027-02-01T00:00:00.000Z');
  assert.throws(()=>normalizeSubscription({...profile(),source:'QUOTA_RESPONSE'}),/E_SUBSCRIPTION_SOURCE/);
});

test('record only verified status; persist safe metadata, owner-only permissions',async()=>{
  const f=await fixture();
  try {
    await f.store.register({alias:'acct_01',displayName:'Team Account',subscription:profile()});
    await assert.rejects(f.store.record('acct_01',{...ok(),workspaceVerified:false}),/E_PROBE_UNVERIFIED/);
    await f.store.record('acct_01',ok({plan:'Pro'}));
    const records=await f.store.accounts();
    assert.equal(records[0].providerPlan.family,'PRO');
    assert.equal(records[0].providerPlan.multiplier,null);
    assert.equal(records[0].subscription.membershipExpiresAt,'2027-03-01T00:00:00.000Z');
    assert.equal(records[0].windows[0].remainingPercent,80);
    const body=await readFile(join(f.directory,'history-v1.json'),'utf8');
    for (const secret of ['this MUST NOT persist','do not persist','sensitive@example.com'])
      assert.ok(!body.includes(secret),`leaked: ${secret}`);
    assert.equal((await lstat(f.directory)).mode & 0o077,0);
    assert.equal((await lstat(join(f.directory,'history-v1.json'))).mode & 0o077,0);
    assert.equal((new HistoryStore({directory:f.directory})).accounts instanceof Function,true);
    assert.equal((await (new HistoryStore({directory:f.directory})).accounts()).length,1);
  } finally {await f.cleanup();}
});

test('pre-reset 90% is an estimate only when sampled near reset and crossing observed',async()=>{
  const f=await fixture();try{
    await f.store.register({alias:'acct_01',displayName:'A'});
    await f.store.record('acct_01',ok({at:103600,reset:104000,used:10}));
    await f.store.record('acct_01',ok({at:104200,reset:122000,used:2}));
    const h=await f.store.history('acct_01');
    assert.equal(h.rollovers.length,1);
    assert.equal(h.rollovers[0].type,'CROSSED_PREDICTED_RESET');
    assert.equal(h.rollovers[0].lastObservedRemainingPercent,90);
    assert.equal(h.rollovers[0].leadSeconds,400);
    assert.equal(h.rollovers[0].nearResetUnusedEstimatePercent,90);
    assert.equal(h.rollovers[0].estimateQuality,'NEAR_RESET_OBSERVATION');
    const insight=(await f.store.insights())[0];
    assert.equal(insight.highUnusedCycles,1);
    assert.equal(insight.averageNearResetRemainingPercent,90);
    assert.equal(insight.notExactWaste,true);
  }finally{await f.cleanup();}
});

test('long gaps cannot become fabricated wasted percentage',async()=>{
  const f=await fixture();try{
    await f.store.register({alias:'acct_01',displayName:'A'});
    await f.store.record('acct_01',ok({at:100000,reset:104000,used:10}));
    await f.store.record('acct_01',ok({at:104300,reset:122000,used:2}));
    const h=await f.store.history('acct_01');
    assert.equal(h.rollovers[0].lastObservedRemainingPercent,90);
    assert.equal(h.rollovers[0].nearResetUnusedEstimatePercent,null);
    const insight=(await f.store.insights())[0];
    assert.equal(insight.cyclesWithoutReliableEstimate,1);
    assert.equal(insight.averageNearResetRemainingPercent,null);
  }finally{await f.cleanup();}
});

test('early reset forecast move is not proof of automatic reset or waste',async()=>{
  const f=await fixture();try{
    await f.store.register({alias:'acct_01',displayName:'A'});
    await f.store.record('acct_01',ok({at:100000,reset:104000,used:30}));
    await f.store.record('acct_01',ok({at:102000,reset:120000,used:0}));
    assert.equal((await f.store.history('acct_01')).rollovers[0].type,'FORECAST_MOVED_UNCONFIRMED');
    assert.deepEqual(await f.store.insights(),[]);
  }finally{await f.cleanup();}
});

test('long-window primary and short-window secondary retain identities and no fake total',async()=>{
  const f=await fixture();try{
    await f.store.register({alias:'acct_01',displayName:'A'});
    const data=ok({at:100000,reset:900000,used:75,key:'primary',duration:604800});
    data.windows.push({key:'secondary',durationSeconds:18000,usedPercent:20,remainingPercent:80,resetsAt:stamp(105000)});
    await f.store.record('acct_01',data);
    const account=(await f.store.accounts())[0];
    assert.equal(account.windows.length,2);
    assert.equal(account.windows[0].kind,'LONG_WINDOW');
    assert.equal(account.windows[1].kind,'SHORT_WINDOW');
    assert.equal(account.totalRemainingPercent,undefined);
  }finally{await f.cleanup();}
});

test('failed refresh retains last success but marks last attempt failure',async()=>{
  const f=await fixture();try{
    await f.store.register({alias:'acct_01',displayName:'A'});
    await f.store.record('acct_01',ok({at:100000}));
    await f.store.record('acct_01',fail(101000));
    const a=(await f.store.accounts())[0];
    assert.equal(a.lastAttempt.status,'AUTH_REQUIRED');
    assert.equal(a.lastSuccessAt,stamp(100000));
    assert.equal(a.windows[0].remainingPercent,80);
  }finally{await f.cleanup();}
});

test('two accounts remain isolated with own histories and timestamps',async()=>{
  const f=await fixture();try{
    await f.store.register({alias:'acct_A',displayName:'A'});
    await f.store.register({alias:'acct_B',displayName:'B'});
    await f.store.record('acct_A',ok({at:100000,used:80}));
    await f.store.record('acct_B',ok({at:100000,used:10}));
    assert.equal((await f.store.history('acct_A')).observations[0].remainingPercent,20);
    assert.equal((await f.store.history('acct_B')).observations[0].remainingPercent,90);
    await assert.rejects(f.store.record('acct_A',ok({at:99999})),/E_SAMPLE_NOT_NEWER/);
    assert.equal((await f.store.accounts()).length,2);
  }finally{await f.cleanup();}
});

test('reject symlink data directory and unknown fields in persisted state',async()=>{
  const f=await fixture();try{
    const linked=join(f.root,'linked');
    await f.store.register({alias:'acct_01',displayName:'A'});
    await symlink(f.directory,linked);
    await assert.rejects(new HistoryStore({directory:linked}).accounts(),/E_HISTORY_PERMISSIONS/);
    const path=join(f.directory,'history-v1.json');
    const state=JSON.parse(await readFile(path,'utf8'));
    state.accounts.acct_01.cookie='dont leak';
    await writeFile(path,JSON.stringify(state),{mode:0o600});
    await assert.rejects(f.store.accounts(),/E_HISTORY_SCHEMA/);
  }finally{await f.cleanup();}
});

test('read API is loopback-only, authorization-required, read-only, and emits no secrets',async()=>{
  const f=await fixture();let api;try{
    await f.store.register({alias:'acct_01',displayName:'A'});
    await f.store.record('acct_01',ok());
    api=await startReadApi({store:f.store});
    const unauthorized=await fetch(`${api.url}/api/v1/accounts`);
    assert.equal(unauthorized.status,401);
    const headers={authorization:`Bearer ${api.secret}`};
    const get=await fetch(`${api.url}/api/v1/accounts`,{headers});
    assert.equal(get.status,200);
    assert.equal(get.headers.get('access-control-allow-origin'),null);
    const body=await get.text();
    assert.ok(!/this MUST NOT persist|do not persist|accessToken|cookie|sensitive@example.com/.test(body));
    const history=await fetch(`${api.url}/api/v1/accounts/acct_01/history`,{headers});
    assert.equal(history.status,200);
    const insight=await fetch(`${api.url}/api/v1/insights`,{headers});
    assert.equal(insight.status,200);
    assert.equal((await fetch(`${api.url}/api/v1/accounts`,{headers,method:'POST'})).status,405);
    assert.equal((await fetch(`${api.url}/api/v1/accounts`,{headers:{...headers,origin:'https://evil.example'}})).status,403);
    assert.equal((await fetch(`${api.url}/api/v1/accounts?token=${api.secret}`,{headers})).status,400);
    const hostSpoof=await new Promise((resolve,reject)=>{
      const req=httpRequest(api.url+'/api/v1/accounts',{headers:{...headers,host:'malicious.example'}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});
      req.once('error',reject);req.end();
    });
    assert.equal(hostSpoof,403);
  }finally{await api?.close();await f.cleanup();}
});

test('collector only loads explicit authorized snapshot and never exposes it to API',async()=>{
  const f=await fixture();try{
    await f.store.register({alias:'acct_01',displayName:'A'});
    let called=0;
    const collector=createCollector({store:f.store,
      loadAuthorizedAccount:async(alias)=>({alias,authorized:true,
        snapshot:{cookies:[{value:'PROTECTED_SECRET'}]},expectedIdentity:{userId:'id',accountId:'workspace'}}),
      probe:async()=>{called++;return ok({at:100000});}});
    const row=await collector.refresh('acct_01');
    assert.equal(row.lastAttempt.status,'OK');
    assert.equal(called,1);
    assert.ok(!JSON.stringify(row).includes('PROTECTED_SECRET'));
    const denied=createCollector({store:f.store,clock:()=>101000000,
      loadAuthorizedAccount:async()=>({authorized:false}),probe:async()=>{throw Error('must not request');}});
    const result=await denied.refresh('acct_01');
    assert.equal(result.lastAttempt.status,'AUTH_REQUIRED');
    assert.equal(result.lastSuccessAt,stamp(100000));
  }finally{await f.cleanup();}
});

test('sampling planner pauses auth/429 and plans near-reset catch-up without retries',async()=>{
  const {nextSampleDecision,runDueSamples}=await import('../services/ai-account-usage/sampling.mjs');
  const base={lastAttempt:{status:'OK',checkedAt:stamp(100000)},
    windows:[{resetsAt:stamp(104000)}]};
  const near=nextSampleDecision(base,103800000);
  assert.equal(near.reason,'NEAR_RESET');
  assert.equal(Date.parse(near.dueAt),103800000);
  const far=nextSampleDecision({...base,windows:[{resetsAt:stamp(200000)}]},100100000);
  assert.equal(far.reason,'NORMAL');
  assert.equal(Date.parse(far.dueAt),107200000);
  for(const status of ['AUTH_REQUIRED','RATE_LIMITED','SCHEMA_UNKNOWN','IDENTITY_UNVERIFIED'])
    assert.equal(nextSampleDecision({...base,lastAttempt:{...base.lastAttempt,status}},104000000).dueAt,null);
  const f=await fixture();try{
    await f.store.register({alias:'acct_01',displayName:'A'});
    await f.store.register({alias:'acct_02',displayName:'B'});
    const called=[];
    const results=await runDueSamples({store:f.store,nowMs:104000000,
      authorizedAliases:['acct_01'], collector:{refresh:async(alias)=>{called.push(alias);return {lastAttempt:{status:'OK'}};}}});
    assert.deepEqual(called,['acct_01']);
    assert.deepEqual(results,[{alias:'acct_01',status:'OK'}]);
  } finally {await f.cleanup();}
});


test('crossing without counter decrease is not a verified reset or waste',async()=>{
  const f=await fixture();try{
    await f.store.register({alias:'acct_01',displayName:'A'});
    await f.store.record('acct_01',ok({at:103600,reset:104000,used:10}));
    await f.store.record('acct_01',ok({at:104200,reset:122000,used:15}));
    const h=await f.store.history('acct_01');
    assert.equal(h.rollovers[0].type,'CROSSED_BUT_UNVERIFIED');
    assert.equal(h.rollovers[0].nearResetUnusedEstimatePercent,null);
    assert.deepEqual(await f.store.insights(),[]);
  }finally{await f.cleanup();}
});

test('zero-use period can be conservatively noted only after full-size reset advance',async()=>{
  const f=await fixture();try{
    await f.store.register({alias:'acct_01',displayName:'A'});
    await f.store.record('acct_01',ok({at:103600,reset:104000,used:0}));
    await f.store.record('acct_01',ok({at:104200,reset:122000,used:0}));
    const h=await f.store.history('acct_01');
    assert.equal(h.rollovers[0].nearResetUnusedEstimatePercent,100);
  }finally{await f.cleanup();}
});
