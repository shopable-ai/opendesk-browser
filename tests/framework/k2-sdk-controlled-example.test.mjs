import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {startSdkTargets} from './fixtures/sdk-target-origins/server.mjs';
import {createHttp} from '../../src/framework/sdk/http.js';

// These checks validate the real HTTP facade and controlled fixture, NOT native
// browser grant enforcement. The broker suites own authorization/deduplication.
test('existing axiosx facade emits the admitted GET contract without a replacement SDK',async()=>{
  const calls=[], facade=createHttp(async(...args)=>{calls.push(args);return {data:0};});
  const config={responseType:'json',timeout:15000,withCredentials:false};
  assert.deepEqual(await facade.get('http://127.0.0.1:43111/probe',config),{data:0});
  assert.deepEqual(calls,[['AXIOS_GET',{url:'http://127.0.0.1:43111/probe',config}]]);
});

test('controlled A/B/C records exact request counts, not observation traffic, with no CORS allowance',async t=>{
  const f=await startSdkTargets({ports:[0,0,0]});t.after(()=>f.close());
  assert.equal(new Set(Object.values(f.origins)).size,3);
  const page=await fetch(f.url);assert.equal(page.status,200);assert.match(await page.text(),/只批准/);
  for(const role of ['B','B','C']){
    const response=await fetch(`${f.origins[role]}${f.prefix}/probe?case=test-${role}`);
    assert.equal(response.headers.get('access-control-allow-origin'),null);
    const body=await response.json();assert.equal(body.role,role);assert.equal(body.runId,f.runId);
  }
  const observations=await(await fetch(`${f.origins.A}${f.prefix}/counts`)).json();
  assert.deepEqual(observations.counts,{A:0,B:2,C:1});
  assert.equal(observations.records.every(r=>!r.cookiePresent&&!r.authorizationPresent),true);
  assert.deepEqual(f.snapshot().counts,{A:0,B:2,C:1});
  assert.equal((await fetch(`${f.origins.B}/wrong-run/probe?case=x`)).status,404);
  assert.equal((await fetch(`${f.origins.B}${f.prefix}/probe?case=x`,{headers:{origin:'https://other.example'}})).status,403);
  assert.equal((await fetch(`${f.origins.B}${f.prefix}/probe?case=x`,{method:'POST'})).status,405);
  assert.deepEqual(f.snapshot().counts,{A:0,B:2,C:1});
});

test('held response uses an observed-request barrier and explicit release, never an automatic retry',async t=>{
  let observed;const barrier=new Promise(resolve=>{observed=resolve;});
  const f=await startSdkTargets({ports:[0,0,0],log:observed});t.after(()=>f.close());
  const pending=fetch(`${f.origins.B}${f.prefix}/hold?case=barrier`);
  const row=await barrier;assert.equal(row.caseId,'barrier');assert.equal(f.snapshot().held,1);
  assert.deepEqual(f.snapshot().counts,{A:0,B:1,C:0});
  assert.equal(f.release(),1);assert.equal((await(await pending).json()).caseId,'barrier');
  assert.equal(f.release(),0);assert.equal(f.snapshot().counts.B,1);
});

test('consumer keeps network operations on existing SDK and confines native fetch to same-origin telemetry',async()=>{
  const client=await readFile(new URL('./fixtures/sdk-target-origins/client.js',import.meta.url),'utf8');
  assert.match(client,/sdk\.axiosx\.get/);assert.match(client,/globalThis\.OpenDeskSDK/);
  assert.doesNotMatch(client,/approveSdkDocument|installPageSdk|createProductionBroker|chrome\.runtime|setInterval/);
  assert.equal((client.match(/fetch\(/g)||[]).length,2);
  assert.match(client,/fetch\(`\$\{base\}\/counts/);assert.match(client,/fetch\(`\$\{base\}\/release/);
});
