import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCloudHosting} from '../../src/ui/cloud-hosting.js';
import {verifyTaskPackage} from '../../src/platform/tasks/contract.js';
import {matchesCloudProgramDescriptor,summarizeCloudSourceDifference} from '../../src/ui/cloud-program-review.js';

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
test('Provider descriptor remains source-free until a trusted review, then imports only the reviewed version',async t=>{
  const f=await make(t);
  assert.equal(f.model().programs.rows.length,0);
  assert.equal(f.calls.filter(c=>c[0]==='inbox'||c[0]==='fetch').length,0,
    'Heartbeat never fetches remote executable source');
  await f.model().programs.onRefresh();
  assert.equal(f.model().programs.rows.length,1);
  assert.equal(JSON.stringify(f.model().programs.rows).includes(pkg.sourceUtf8),false);
  assert.equal(f.model().programs.review,null);
  await f.model().programs.onImport(deliveryId);
  assert.equal(f.calls.some(c=>c[0]==='importTaskPackage'),false,
    'A direct import without a source-review action cannot stage code');
  assert.match(f.model().pairing.status,/查看并核对完整源码/);
  await f.model().programs.onReview(deliveryId);
  assert.equal(f.model().programs.review.source,pkg.sourceUtf8);
  assert.deepEqual(f.model().programs.review.permissions,pkg.manifest.permissions);
  assert.equal(f.model().programs.review.manifestHash,pkg.manifestHash);
  assert.equal(f.model().programs.review.sourceHash,pkg.manifest.program.sourceHash);
  assert.equal(f.calls.some(c=>c[0]==='importTaskPackage'),false);
  await f.model().programs.onImport(deliveryId);
  assert.equal(f.calls.filter(c=>c[0]==='importTaskPackage').length,1);
  assert.deepEqual(f.calls.find(c=>c[0]==='received')[1],
    {deliveryId,manifestHash:pkg.manifestHash});
  assert.equal(f.model().programs.rows.length,0);
  assert.equal(f.model().programs.review,null);
  assert.match(f.model().programs.status,/待验证任务/);
  assert.equal(f.calls.some(c=>['cloudApprove','cloudNext','run'].includes(c[0])),false);
});
test('Tampered JS is rejected at review before import and Provider acknowledgement',async t=>{
  const f=await make(t,{mutate:p=>({...p,sourceUtf8:p.sourceUtf8+'\\n// unauthorized mutation'})});
  await f.model().programs.onRefresh();
  await f.model().programs.onReview(deliveryId);
  assert.equal(f.model().programs.review,null);
  assert.equal(f.calls.some(c=>c[0]==='importTaskPackage'),false);
  assert.equal(f.calls.some(c=>c[0]==='received'),false);
  assert.equal(f.model().programs.rows.length,1);
  assert.match(f.model().pairing.status,/源码哈希验证失败|交付程序|操作未完成/);
});
test('Lost Provider ACK keeps imported Candidate without permitting auto-run',async t=>{
  const f=await make(t,{ackFailure:true});
  await f.model().programs.onRefresh();
  await f.model().programs.onReview(deliveryId);
  await f.model().programs.onImport(deliveryId);
  assert.equal(f.calls.filter(c=>c[0]==='importTaskPackage').length,1);
  assert.equal(f.model().programs.rows.length,0);
  assert.match(f.model().programs.status,/回执待核对/);
});
test('Changed descriptor cannot import code reviewed for a different fixed source',async t=>{
  const f=await make(t);
  await f.model().programs.onRefresh();
  await f.model().programs.onReview(deliveryId);
  f.model().programs.rows[0]={...f.model().programs.rows[0],sourceHash:'0'.repeat(64)};
  await f.model().programs.onImport(deliveryId);
  assert.equal(f.calls.some(c=>c[0]==='importTaskPackage'),false);
  assert.equal(f.calls.some(c=>c[0]==='received'),false);
});

test('reviewed descriptor pins name and origin as well as source and manifest hash',()=>{
  assert.equal(matchesCloudProgramDescriptor(pin,deliveryId,pkg),true);
  assert.equal(matchesCloudProgramDescriptor({...pin,title:'Renamed'},deliveryId,pkg),false);
  assert.equal(matchesCloudProgramDescriptor({...pin,siteOrigins:['https://bad.example']},deliveryId,pkg),false);
});
test('line change preview explains omissions and leaves original sources immutable',()=>{
  const before='same\\nold\\nfooter',after='same\\nnew\\nfooter';
  const result=summarizeCloudSourceDifference(before,after);
  assert.equal(result.removed,1);
  assert.equal(result.added,1);
  assert.match(result.excerpt,/- old/);
  assert.match(result.excerpt,/\\+ new/);
  assert.equal(summarizeCloudSourceDifference(undefined,after),null);
});
