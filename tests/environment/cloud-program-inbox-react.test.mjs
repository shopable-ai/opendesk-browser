import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCloudHosting} from '../../src/ui/cloud-hosting.js';
import {verifyTaskPackage} from '../../src/platform/tasks/contract.js';

const pkg=JSON.parse(await readFile(new URL('../../examples/tasks/form-fill.v1.opendesk-task.json',import.meta.url),'utf8'));
const deliveryId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const pin={deliveryId,taskId:pkg.manifest.taskId,version:pkg.manifest.version,
  title:pkg.manifest.title,manifestHash:pkg.manifestHash,
  sourceHash:pkg.manifest.program.sourceHash,siteOrigins:pkg.manifest.siteOrigins};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function make(t,{mutate=packageValue=>packageValue,ackFailure=false}={}){
  const calls=[],forbidden=()=>assert.fail('Cloud delivery must not run or authorize anything');
  let snapshot;
  const client={cloud:{
    cloudStatus:async request=>{calls.push(['cloudStatus',request]);return {provider:{providerId:'paired'},
      enabled:false,online:false,reconciled:false,connection:'offline',tasks:[],
      slotAvailable:true,hostReady:true,requestTotal:0,requests:[]};},
    cloudNext:forbidden,cloudResolve:forbidden,cloudApprove:forbidden,
    cloudProgramInbox:async()=>{calls.push(['inbox']);return {programs:[pin]};},
    cloudProgramFetch:async input=>{
      calls.push(['fetch',input]);return {deliveryId,package:mutate(pkg)};
    },
    cloudProgramReceived:async input=>{
      calls.push(['received',input]);if(ackFailure)throw {code:'E_PROVIDER'};
      return {received:true};
    }
  },request:async(method,input)=>{
    calls.push([method,input]);
    if(method==='listTaskCatalog')return {catalog:[],installed:[]};
    if(method==='importTaskPackage')return verifyTaskPackage(input.package);
    throw Error('Unexpected Task method: '+method);
  }};
  const view=createCloudHosting({client,host:{executionPending:false,start:forbidden},
    document:{documentElement:{dataset:{opendeskTab:'cloud'}},getElementById:()=>null},
    api:{},reactUI:{cloudPageMounted:true,renderCloudPage(next){snapshot=next;}}});
  t.after(()=>view.dispose());
  await flush();await flush();
  return {calls,model:()=>snapshot};
}
test('Provider sends a source descriptor, and only a trusted user action imports a Candidate',async t=>{
  const f=await make(t);
  assert.equal(f.model().programs.rows.length,0);
  assert.equal(f.calls.filter(c=>c[0]==='inbox'||c[0]==='fetch').length,0,
    'Heartbeat never fetches remote executable source');
  await f.model().programs.onRefresh();
  assert.equal(f.model().programs.rows.length,1);
  assert.equal(JSON.stringify(f.model().programs.rows).includes(pkg.sourceUtf8),false);
  assert.equal(f.calls.some(c=>c[0]==='importTaskPackage'),false);
  await f.model().programs.onImport(deliveryId);
  assert.equal(f.calls.filter(c=>c[0]==='importTaskPackage').length,1);
  assert.deepEqual(f.calls.find(c=>c[0]==='received')[1],
    {deliveryId,manifestHash:pkg.manifestHash});
  assert.equal(f.model().programs.rows.length,0);
  assert.match(f.model().programs.status,/待验证任务/);
  assert.equal(f.calls.some(c=>['cloudApprove','cloudNext','run'].includes(c[0])),false);
});
test('Tampered JS is rejected by the existing immutable Task verifier with no ACK',async t=>{
  const f=await make(t,{mutate:p=>({...p,sourceUtf8:p.sourceUtf8+'\n// unauthorized mutation'})});
  await f.model().programs.onRefresh();
  await f.model().programs.onImport(deliveryId);
  assert.equal(f.calls.some(c=>c[0]==='received'),false);
  assert.equal(f.model().programs.rows.length,1);
  assert.match(f.model().pairing.status,/操作未完成|交付程序/);
});
test('Lost Provider ACK does not roll back locally imported Candidate or cause a re-run',async t=>{
  const f=await make(t,{ackFailure:true});
  await f.model().programs.onRefresh();
  await f.model().programs.onImport(deliveryId);
  assert.equal(f.calls.filter(c=>c[0]==='importTaskPackage').length,1);
  assert.equal(f.model().programs.rows.length,0);
  assert.match(f.model().programs.status,/回执待核对/);
});
