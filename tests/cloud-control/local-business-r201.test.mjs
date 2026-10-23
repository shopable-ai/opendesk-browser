import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {Script} from 'node:vm';
import {openLocalBusiness} from '../../examples/cloud-control/local-business/server.mjs';

const accounts = [
  {username:'alice',password:'local-alice',tenantId:'tenant-a',subjectId:'alice',clientCredential:'local-only-client-a'},
  {username:'bob',password:'local-bob',tenantId:'tenant-a',subjectId:'bob',clientCredential:'local-only-client-b'},
  {username:'carol',password:'local-carol',tenantId:'tenant-b',subjectId:'alice',clientCredential:'local-only-client-c'}
];
let databaseUrl = process.env.CLOUD_CONTROL_TEST_DATABASE_URL;
if (!databaseUrl) {
  try { databaseUrl = JSON.parse(await readFile(new URL('../../.local/cloud-r201/environment.json', import.meta.url), 'utf8')).url; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const require = createRequire(new URL('../../scripts/cloud-control/package.json', import.meta.url));

test('local fixture rejects non-HTTPS provider and credential-bearing URLs before DB use', async () => {
  for (const providerUrl of ['http://127.0.0.1:1234','https://user:secret@localhost','https://localhost/path','https://localhost/?redirect=x']) {
    await assert.rejects(openLocalBusiness({providerUrl, providerCa:'test',accounts}), /HTTPS provider/);
  }
});

test('both standalone UI scripts parse and provide stable Task selectors', async () => {
  for (const name of ['portal','records']) {
    const html = await readFile(new URL(`../../examples/cloud-control/local-business/${name}.html`, import.meta.url), 'utf8');
    new Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
    assert.match(html,/id="login-username"/);
    assert.match(html,/id="login-password"/);
    assert.ok(!html.includes('clientCredential'));
    if (name === 'records') for (const id of ['create-recordKey','create-name','create-status','create-submit','update-recordKey','update-name','update-status','update-submit','search-recordKey','search-submit','records-list','execution-context','execution-params']) assert.ok(html.includes(`id="${id}"`));
  }
});

test('Records UI gates manual, approved and wrong-account execution before Task readiness', async () => {
  const html = await readFile(new URL('../../examples/cloud-control/local-business/records.html', import.meta.url), 'utf8');
  const source = html.match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace('boot().catch(showError);', 'globalThis.booted = boot().catch(showError);');
  for (const mode of ['manual','create','update','wrong-account','malformed']) {
    const nodes = new Map();
    const element = id => {
      if (!nodes.has(id)) nodes.set(id, {id, dataset:{}, hidden:false, disabled:false, value:'', textContent:'',
        replaceChildren() {}, querySelectorAll() {
          if (id === 'business') return ['create','update','search'].flatMap(action => element(action + '-form').querySelectorAll());
          return ['recordKey','name','status','submit'].map(key => element(id.replace('-form','-') + key));
        }});
      return nodes.get(id);
    };
    let writes = 0;
    const sandbox = {URLSearchParams, location:{search:mode === 'manual' ? '' : '?executionKey=' + (mode === 'malformed' ? '' : 'a'.repeat(64))},
      document:{getElementById:element}, fetch:async (path, options) => {
        let value, ok = true;
        if (path === '/api/session') value = {username:'fixture-user',csrf:'fixture-csrf'};
        else if (path.startsWith('/api/execution')) {
          ok = !['wrong-account','malformed'].includes(mode);
          value = ok ? {action:mode,params:{recordKey:'r',name:'n',status:'s'}} : {error:{code:'E_EXECUTION_SCOPE'}};
        } else if (path.startsWith('/api/records?')) value = {records:[]};
        else { writes++; value = {record:{recordKey:'r'}}; }
        return {ok,json:async () => value};
      }};
    new Script(source).runInNewContext(sandbox);
    await sandbox.booted;
    const blocked = ['wrong-account','malformed'].includes(mode);
    assert.equal(element('execution-context').dataset.state, blocked ? 'blocked' : 'ready', mode);
    assert.equal(element('business').hidden, blocked, mode);
    for (const action of ['create','update']) {
      const allowed = !blocked && (mode === 'manual' || mode === action);
      assert.equal(element(action + '-submit').disabled, !allowed, mode + ':' + action);
      if (blocked) {
        await element(action + '-form').onsubmit({preventDefault() {}});
        assert.equal(writes, 0, 'blocked UI must never submit');
      } else assert.equal(element(action + '-form').hidden, !allowed);
    }
  }
});

test('real PostgreSQL: login, CSRF, create/update/read, isolation and restart persistence', {
  skip:!databaseUrl && 'CLOUD_CONTROL_TEST_DATABASE_URL unavailable; no mock or T00 success claimed'
}, async t => {
  const {Pool} = require('pg');
  const pool = new Pool({connectionString:databaseUrl,max:4});
  const businessId = 'local-test:' + randomUUID();
  let app;
  const options = {pool,businessId,providerUrl:'https://127.0.0.1:1',providerCa:'unused: no Provider calls in CRUD test',accounts};
  t.after(async () => {
    try {
      await app?.close();
      // Remove only this test namespace, never shared tables or unrelated rows.
      await pool.query('DELETE FROM opendesk_local_business_records WHERE business_id=$1',[businessId]);
      await pool.query('DELETE FROM opendesk_local_business_requests WHERE business_id=$1',[businessId]);
    } finally { await pool.end(); }
  });
  app = await openLocalBusiness(options);
  function browser(origin) {
    let cookie, csrf;
    return {
      get cookie() { return cookie; },
      async request(path, input, overrides = {}) {
        const headers = {...(cookie ? {cookie} : {}),...(input === undefined ? {} : {
          origin,'content-type':'application/json','x-csrf-token':csrf}),...overrides};
        const response = await fetch(origin + path,{method:input===undefined?'GET':'POST',headers,
          ...(input===undefined?{}:{body:JSON.stringify(input)}),redirect:'error'});
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        const value = await response.json();
        if (value.csrf) csrf = value.csrf;
        return {status:response.status,value,setCookie};
      },
      async login(account) {
        const initial = await this.request('/api/session');
        if (initial.setCookie) {
          assert.match(initial.setCookie,/HttpOnly/); assert.match(initial.setCookie,/SameSite=Strict/);
          assert.match(initial.setCookie,/Max-Age=1800/);
        } else assert.ok(cookie, 'existing session cookie is retained');
        const result = await this.request('/api/login',{username:account.username,password:account.password});
        assert.equal(result.status,200); return result;
      }
    };
  }
  const alice = browser(app.recordsOrigin), bob = browser(app.recordsOrigin), carol = browser(app.recordsOrigin);
  assert.equal((await alice.request('/api/records')).status,401);
  await alice.request('/api/session');
  assert.equal((await alice.request('/api/login',{username:'alice',password:'wrong'})).status,401);
  await alice.login(accounts[0]); await bob.login(accounts[1]); await carol.login(accounts[2]);
  const record = {recordKey:'invoice-1',name:'本地真实业务',status:'draft'};
  assert.equal((await alice.request('/api/records/create',record,{'x-csrf-token':'wrong'})).status,403);
  assert.equal((await alice.request('/api/records/create',record,{origin:app.portalOrigin})).status,403);
  assert.equal((await alice.request('/api/records/create',{...record,subjectId:'bob'})).status,400);
  assert.equal((await alice.request('/api/records/create',record)).status,200);
  assert.equal((await alice.request('/api/records/create',record)).status,200);
  assert.equal((await alice.request('/api/records/create',{...record,name:'conflict'})).status,409);
  let read = await alice.request('/api/records?recordKey=invoice-1');
  assert.equal(read.value.records.length,1); assert.equal(read.value.records[0].name,record.name);
  assert.equal((await alice.request('/api/execution?executionKey=bad')).status,400);
  assert.equal((await alice.request('/api/records/create',{...record,executionKey:'bad'})).status,400);
  assert.equal((await alice.request('/api/records/create',{...record,executionKey:'f'.repeat(64)})).status,403);
  assert.deepEqual(Object.keys((await alice.request('/api/session')).value).sort(), ['csrf','expiresAt','username']);
  for (const other of [bob,carol]) {
    assert.deepEqual((await other.request('/api/records?recordKey=invoice-1')).value.records,[]);
    assert.equal((await other.request('/api/records/update',{...record,status:'stolen'})).status,404);
  }
  const updated = {...record,name:'已更新',status:'approved'};
  assert.equal((await alice.request('/api/records/update',updated)).status,200);
  read = await alice.request('/api/records?recordKey=invoice-1');
  assert.equal(read.value.records[0].name,updated.name); assert.equal(read.value.records[0].status,'approved');
  // Seed only this isolated BFF intent, then use the authenticated read-only
  // route. No Provider receipt or Controller result is created by this check.
  const jobId='verify-'+randomUUID(),executionKey='e'.repeat(64);
  const pin={taskId:'local.record-update',version:'1.0.1',manifestHash:'a'.repeat(64),sourceHash:'b'.repeat(64)};
  await pool.query(`INSERT INTO opendesk_local_business_requests
    (business_id,tenant_id,subject_id,request_key,input,job_id,execution_key) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [businessId,'tenant-a','alice','verified-update',{...pin,action:'update',params:updated},jobId,executionKey]);
  const evidence=await alice.request('/api/verify?jobId='+encodeURIComponent(jobId));
  assert.equal(evidence.status,200);assert.equal(evidence.value.status,'VERIFIED');
  assert.equal(evidence.value.causation,'NOT_PROVEN');assert.deepEqual(evidence.value.taskPin,pin);
  for(const secret of [executionKey,updated.name,updated.status,updated.recordKey,alice.cookie])assert.ok(!JSON.stringify(evidence.value).includes(secret));
  for(const other of [bob,carol])assert.equal((await other.request('/api/verify?jobId='+jobId)).value.status,'INCONCLUSIVE');
  assert.equal((await alice.request('/api/verify?jobId='+jobId+'&subjectId=bob')).status,400);
  assert.equal((await alice.request('/api/verify?jobId='+jobId,undefined,{origin:app.portalOrigin})).status,403);
  assert.equal((await browser(app.recordsOrigin).request('/api/verify?jobId='+jobId)).status,401);
  assert.equal((await alice.request('/api/records?subjectId=bob')).status,400);
  const portal = browser(app.portalOrigin); await portal.login(accounts[0]);
  assert.match(portal.cookie,/^od_local_portal=/); assert.match(alice.cookie,/^od_local_records=/);
  assert.notEqual(portal.cookie.split('=')[0],alice.cookie.split('=')[0]);
  assert.equal((await portal.request('/api/job-status',{jobId:'someone-elses-job'})).status,404);
  assert.equal((await portal.request('/api/job-cancel',{jobId:'someone-elses-job'})).status,404);
  assert.equal((await portal.request('/api/submit',{sourceUtf8:'evil()'})).status,400);
  assert.deepEqual((await portal.request('/api/jobs')).value.jobs,[{requestKey:'verified-update',jobId}]);
  const html = await fetch(app.portalUrl).then(res => res.text());
  for (const account of accounts) assert.ok(!html.includes(account.clientCredential));
  await app.close(); app = await openLocalBusiness(options);
  const afterRestart = browser(app.recordsOrigin); await afterRestart.login(accounts[0]);
  const persisted = (await afterRestart.request('/api/records?recordKey=invoice-1')).value.records;
  assert.equal(persisted.length,1); assert.equal(persisted[0].name,'已更新'); assert.equal(persisted[0].status,'approved');
  await afterRestart.request('/api/logout',{});
  assert.equal((await afterRestart.request('/api/records')).status,401);
});
