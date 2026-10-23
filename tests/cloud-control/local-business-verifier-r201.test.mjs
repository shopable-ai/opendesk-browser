import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {verifyBusinessResult} from '../../examples/cloud-control/local-business/verifier.mjs';
import {openLocalBusiness} from '../../examples/cloud-control/local-business/server.mjs';

const recordsOrigin = 'http://127.0.0.1:43112';
const task = {taskId:'local.record-create', version:'1.0.0', manifestHash:'a'.repeat(64), sourceHash:'b'.repeat(64)};
const params = {recordKey:'private-record /?&姓名', name:'private-name', status:'private-status'};
const context = {requestKey:'request-one', jobId:'job-one', executionKey:'c'.repeat(64), task,
  action:'create', params};
const record = {...params, updatedAt:'2026-10-24T00:00:00.000Z'};
const json = (value, options = {}) => new Response(JSON.stringify(value), {
  headers:{'content-type':'application/json'}, ...options});

// Mock HTTP responses exercise the module contract; only the separate PG case
// below supplies evidence about persisted state. Neither fixture executes a Run.
function fixture(overrides = {}) {
  const values = {
    '/api/verification-context':structuredClone(context),
    '/api/execution':{action:'create', params:structuredClone(params)},
    '/api/records':{records:[structuredClone(record)]}, ...overrides
  };
  const calls = [];
  const sessionFetch = async (input, options) => {
    const url = new URL(input);
    calls.push({url, options});
    assert.equal(url.origin, recordsOrigin);
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.body, undefined);
    assert.equal(options.headers, undefined, 'caller retains sole ownership of credentials');
    assert.ok(options.signal instanceof AbortSignal);
    const value = values[url.pathname];
    return typeof value === 'function' ? value() : json(value);
  };
  return {calls, sessionFetch, run:options => verifyBusinessResult({recordsOrigin,
    jobId:context.jobId, sessionFetch, ...options})};
}
function hidden(value) {
  const serialized = JSON.stringify(value);
  for (const secret of [context.executionKey, params.recordKey, params.name, params.status, 'cookie-secret', 'credential-secret']) {
    assert.ok(!serialized.includes(secret), 'evidence must hide business bodies and secrets');
  }
}

test('verifies exact job/task/execution/unique current record using three ordered GETs, hidden by default', async () => {
  const f = fixture();
  const value = await f.run({expectedTask:task});
  assert.equal(value.status, 'VERIFIED');
  assert.equal(value.causation, 'NOT_PROVEN');
  assert.deepEqual(value.taskPin, task);
  assert.deepEqual(value.checks, {context:'PASS',job:'PASS',task:'PASS',execution:'PASS',record:'PASS'});
  assert.deepEqual(f.calls.map(c => c.url.pathname), ['/api/verification-context','/api/execution','/api/records']);
  assert.deepEqual(f.calls.map(c => [...c.url.searchParams]), [[['jobId','job-one']],
    [['executionKey',context.executionKey]], [['recordKey',params.recordKey]]]);
  hidden(value);
  assert.equal(value.expected, undefined); assert.equal(value.observed, undefined);
});

test('only explicit allowResult true exposes projected expected/observed rows', async () => {
  const value = await fixture().run({allowResult:true});
  assert.deepEqual(value.expected, params);
  assert.deepEqual(value.observed, [params]);
  assert.ok(!JSON.stringify(value).includes(context.executionKey));
  hidden(await fixture().run({allowResult:'true'}));
  const update = fixture({'/api/verification-context':{...context,action:'update'},
    '/api/execution':{action:'update',params}});
  assert.equal((await update.run()).status,'VERIFIED');
});

test('invalid origin, job, missing session and malformed trusted task do not issue requests', async () => {
  for (const origin of ['http://example.com','file:///tmp','https://user:credential-secret@example.com',
    recordsOrigin+'/path', recordsOrigin+'/?a=b', recordsOrigin+'/#hash']) {
    const f = fixture(); assert.equal((await f.run({recordsOrigin:origin})).status, 'NOT_RUN');
    assert.equal(f.calls.length, 0);
  }
  for (const options of [{jobId:''},{jobId:'a'.repeat(201)},{sessionFetch:undefined},
    {expectedTask:{...task,version:'latest'}}]) {
    const f = fixture(); assert.equal((await f.run(options)).status, 'NOT_RUN');
    assert.equal(f.calls.length, 0);
  }
});

test('missing/expired/wrong-account session, absent job, network and JSON errors are inconclusive and sanitized', async () => {
  for (const status of [401,403,404,500]) {
    const f = fixture({'/api/verification-context':() => json({error:'cookie-secret credential-secret'}, {status})});
    const value = await f.run(); assert.equal(value.status, 'INCONCLUSIVE'); hidden(value);
    assert.equal(f.calls.length, 1);
  }
  for (const response of [() => { throw new Error('cookie-secret credential-secret'); },
    () => new Response('cookie-secret', {headers:{'content-type':'application/json'}}),
    () => json({}), () => json(null)]) {
    const value = await fixture({'/api/verification-context':response}).run();
    assert.equal(value.status, 'INCONCLUSIVE'); hidden(value);
  }
});

test('wrong job binding, execution key, task format or trusted task pin stops before execution lookup', async () => {
  for (const change of [{jobId:'other-job'}, {requestKey:''}, {executionKey:'bad'},
    {task:{...task,manifestHash:'bad'}}, {task:{...task,taskId:'../invalid'}},
    {task:{...task,version:'01.0.0'}}, {action:'delete'}, {params:{...params,unexpected:true}}]) {
    const f = fixture({'/api/verification-context':{...context,...change}});
    const value = await f.run(); assert.equal(value.status, 'MISMATCH'); hidden(value);
    assert.equal(f.calls.length, 1);
  }
  for (const key of Object.keys(task)) {
    const f = fixture();
    const wrong = {...task,[key]:key.endsWith('Hash') ? 'd'.repeat(64) : key === 'version' ? '2.0.0' : 'other-task'};
    assert.equal((await f.run({expectedTask:wrong})).status, 'MISMATCH');
    assert.equal(f.calls.length, 1);
  }
});

test('execution action and exact params must match, without reading records on mismatch', async () => {
  for (const execution of [{action:'update',params}, {action:'create',params:{...params,name:'wrong'}},
    {action:'create',params:{...params,recordKey:'wrong'}}, {action:'create',params:{...params,status:'wrong'}},
    {action:'create',params:{...params,extra:'credential-secret'}}]) {
    const f = fixture({'/api/execution':execution});
    const value = await f.run(); assert.equal(value.status,'MISMATCH'); hidden(value);
    assert.equal(f.calls.length,2);
  }
});

test('absent, duplicate, wrong-key/content and malformed persisted rows cannot verify', async () => {
  for (const records of [[], [record,record], [{...record,recordKey:'wrong'}], [{...record,name:'wrong'}],
    [{...record,status:'wrong'}], [{...record,updatedAt:'invalid'}], [null],
    [{...record,credential:'credential-secret'}]]) {
    const value = await fixture({'/api/records':{records}}).run();
    assert.equal(value.status,'MISMATCH'); hidden(value);
  }
  assert.equal((await fixture({'/api/records':{records:null}}).run()).status,'INCONCLUSIVE');
  const value = await fixture({'/api/records':{records:[{...record,name:'changed'}]}}).run({allowResult:true});
  assert.deepEqual(value.expected,params); assert.equal(value.observed[0].name,'changed');
});

test('redirected/wrong-URL, non-JSON and oversized responses are bounded and sanitized', async () => {
  const withMetadata = metadata => Object.defineProperties(json(context),
    Object.fromEntries(Object.entries(metadata).map(([key,value]) => [key,{value}])));
  const responses = [
    () => Response.redirect('https://example.com/credential-secret'),
    () => withMetadata({redirected:true}),
    () => withMetadata({url:'https://example.com/'}),
    () => json(context, {headers:{'content-type':'text/html'}}),
    () => json(context, {headers:{'content-type':'application/json','content-length':'32769'}}),
    () => new Response(' '.repeat(32769), {headers:{'content-type':'application/json'}})
  ];
  for (const response of responses) {
    const f = fixture({'/api/verification-context':response});
    const value = await f.run(); assert.equal(value.status,'INCONCLUSIVE'); hidden(value);
    assert.equal(f.calls.length,1);
  }
});

test('evidence failure at either downstream read remains inconclusive, with no replay or business content', async () => {
  for (const [path,count] of [['/api/execution',2],['/api/records',3]]) {
    const f = fixture({[path]:() => json({error:'credential-secret'}, {status:403})});
    const value = await f.run();
    assert.equal(value.status,'INCONCLUSIVE'); hidden(value);
    assert.equal(f.calls.length,count);
  }
});

test('real HTTP redirects are rejected without visiting another endpoint or creating a session', async t => {
  const paths = [];
  const server = http.createServer((req,res) => {
    paths.push(req.url.split('?')[0]);
    res.writeHead(302, {location:'/api/session'}); res.end();
  });
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const value = await verifyBusinessResult({recordsOrigin:`http://127.0.0.1:${server.address().port}`,
    jobId:'unknown-outcome-job', sessionFetch:fetch});
  assert.equal(value.status,'INCONCLUSIVE');
  assert.deepEqual(paths,['/api/verification-context']); hidden(value);
});

test('total deadline returns inconclusive even if session wrapper ignores abort; no replay follows', {timeout:12000}, async () => {
  let resolveFetch, calls = 0, signal;
  const pending = verifyBusinessResult({recordsOrigin, jobId:'job-one', sessionFetch:async (_url,options) => {
    calls++; signal = options.signal; return new Promise(resolve => { resolveFetch = resolve; });
  }});
  const value = await pending;
  assert.equal(value.status,'INCONCLUSIVE'); assert.equal(signal.aborted,true); hidden(value);
  resolveFetch(json(context));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls,1);
});

let databaseUrl;
try { databaseUrl = JSON.parse(await readFile(new URL('../../.local/cloud-r201/environment.json',import.meta.url),'utf8')).url; }
catch (error) { if (error.code !== 'ENOENT') throw new Error('local PG fixture configuration unavailable'); }

test('real PG + independent short-lived BFF: stored job mapping, fixed session scope and restart persistence', {
  skip:!databaseUrl && 'Real PG configuration unavailable; persistence NOT_TESTED', timeout:30000
}, async t => {
  const require = createRequire(new URL('../../scripts/cloud-control/package.json',import.meta.url));
  const {Pool} = require('pg');
  const pool = new Pool({connectionString:databaseUrl,max:3,connectionTimeoutMillis:5000});
  const businessId = 'verifier-test:'+randomUUID();
  const account = {username:'verifier-only',password:randomUUID(),subjectId:randomUUID(),tenantId:randomUUID(),clientCredential:randomUUID()};
  const other = {...account,username:'verifier-other',subjectId:randomUUID(),clientCredential:randomUUID()};
  const options = {pool,businessId,accounts:[account,other],providerUrl:'https://127.0.0.1:1',providerCa:'unused: no provider requests'};
  let app;
  t.after(async () => {
    try {
      await app?.close();
      const db = await pool.connect();
      try {
        await db.query('BEGIN');
        // Shared DDL lock precedes namespace lock; this fixture creates no ledger.
        await db.query('SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))',['opendesk:cloud:ddl:r201']);
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`opendesk:cloud:business:${businessId}`]);
        for (const table of ['opendesk_local_business_records','opendesk_local_business_requests']) {
          const exists = await db.query('SELECT to_regclass($1) AS relation',[table]);
          if (exists.rows[0].relation) await db.query(`DELETE FROM ${table} WHERE business_id=$1`,[businessId]);
        }
        await db.query('COMMIT');
      } catch { await db.query('ROLLBACK'); throw new Error('verifier fixture cleanup failed'); }
      finally { db.release(); }
    } finally { await pool.end(); }
  });
  // Avoid leaking PG connection URLs in test runner diagnostics.
  try {
    app = await openLocalBusiness(options);
    const jobId = randomUUID(), executionKey = 'e'.repeat(64);
    const input = {...task,action:'create',params};
    // Explicit fixture intent, not a Provider job or Controller execution claim.
    await pool.query(`INSERT INTO opendesk_local_business_requests
      (business_id,tenant_id,subject_id,request_key,job_id,execution_key,input) VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [businessId,account.tenantId,account.subjectId,randomUUID(),jobId,executionKey,JSON.stringify(input)]);
    await pool.query(`INSERT INTO opendesk_local_business_records
      (business_id,tenant_id,subject_id,record_key,name,status) VALUES($1,$2,$3,$4,$5,$6)`,
    [businessId,account.tenantId,account.subjectId,params.recordKey,params.name,params.status]);
    async function login(who) {
      const origin = app.recordsOrigin;
      const initial = await fetch(origin+'/api/session');
      const csrf = (await initial.json()).csrf;
      const response = await fetch(origin+'/api/login',{method:'POST',headers:{origin,
        cookie:initial.headers.get('set-cookie').split(';')[0], 'content-type':'application/json','x-csrf-token':csrf},
      body:JSON.stringify({username:who.username,password:who.password}),redirect:'error'});
      assert.equal(response.status,200);
      const cookie = response.headers.get('set-cookie').split(';')[0];
      await response.arrayBuffer();
      return (url,init) => {
        assert.equal(new URL(url).origin,origin); assert.equal(init.method,'GET');
        return fetch(url,{...init,headers:{cookie}});
      };
    }
    const verify = sessionFetch => verifyBusinessResult({recordsOrigin:app.recordsOrigin,jobId,sessionFetch,expectedTask:task});
    assert.equal((await verify(fetch)).status,'INCONCLUSIVE');
    assert.equal((await verify(await login(other))).status,'INCONCLUSIVE');
    let value = await verify(await login(account));
    assert.equal(value.status,'VERIFIED'); assert.equal(value.causation,'NOT_PROVEN'); hidden(value);
    // Close only our ephemeral fixture, then read the same persisted PG intent/row.
    await app.close(); app = await openLocalBusiness(options);
    const sessionFetch = await login(account);
    assert.equal((await verify(sessionFetch)).status,'VERIFIED');
    await pool.query(`UPDATE opendesk_local_business_records SET status=$2 WHERE business_id=$1`,[businessId,'changed']);
    value = await verify(sessionFetch);
    assert.equal(value.status,'MISMATCH'); hidden(value);
    const detailed = await verifyBusinessResult({recordsOrigin:app.recordsOrigin,jobId,sessionFetch,allowResult:true});
    assert.equal(detailed.observed[0].status,'changed');
    assert.ok(!JSON.stringify(detailed).includes(executionKey));
  } catch (error) {
    if (error.code === 'ERR_ASSERTION') throw error;
    throw new Error('Independent PG verifier fixture failed (transport/configuration details withheld)');
  }
});
