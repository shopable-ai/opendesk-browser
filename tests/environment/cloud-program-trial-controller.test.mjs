// Controller contract tests only. These do not substitute for native Chrome
// execution, real page-effect receipts, or an end-to-end Provider demo.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCloudHosting} from '../../src/ui/cloud-hosting.js';

const pkg=JSON.parse(await readFile(new URL(
  '../../examples/tasks/form-fill.v1.opendesk-task.json',import.meta.url),'utf8'));
const deliveryId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  runId='11111111-1111-4111-8111-111111111111',
  resultId='22222222-2222-4222-8222-222222222222',
  origin=pkg.manifest.siteOrigins[0],
  pin={deliveryId,taskId:pkg.manifest.taskId,version:pkg.manifest.version,
    title:pkg.manifest.title,manifestHash:pkg.manifestHash,
    sourceHash:pkg.manifest.program.sourceHash,siteOrigins:pkg.manifest.siteOrigins};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(t){
  let taskStage='candidate';
  const calls=[],actual={origin,url:origin+'/demo-form.html',status:'available',
    tabId:11,windowId:9,frameId:0,documentId:'test-document'};
  let snapshot;
  const api={permissions:{contains:async()=>true,onAdded:{addListener(){},removeListener(){}},
    onRemoved:{addListener(){},removeListener(){}}}};
  const host={executionPending:false,currentRun:null,completion:Promise.resolve({state:'completed'}),
    async start(request){
      calls.push(['host.start',request]);
      host.currentRun=runId;
      host.completion=Promise.resolve({state:'completed'}).then(result=>{
        host.currentRun=null;return result;
      });
      return {runId,revision:{sourceHash:pkg.manifest.program.sourceHash}};
    },
    async stop(request){calls.push(['host.stop',request]);host.currentRun=null;return {state:'stopping'};}};
  const client={cloud:{
    cloudStatus:async()=>({provider:{providerId:'p'},enabled:false,online:false,
      reconciled:false,connection:'offline',tasks:[],hostReady:true,slotAvailable:true,
      requestTotal:0,requests:[]}),
    cloudProgramInbox:async()=>({programs:[pin]}),
    cloudProgramFetch:async()=>({deliveryId,package:pkg}),
    cloudProgramReceived:async()=>({received:true})
  },controller:{
    snapshotControllerRun:async input=>{
      calls.push(['snapshotControllerRun',input]);
      return {run:{tag:'controller-run',runId,resultId,
        revision:{sourceHash:pkg.manifest.program.sourceHash},
        state:'completed',retirementState:'released',workerRetired:true,
        target:{allowedOrigin:origin}},
        results:[{tag:'controller-result',runId,resultId,state:'completed',
          revision:{sourceHash:pkg.manifest.program.sourceHash},outcome:{ok:true}}]};
    }
  },request:async(method,input)=>{
    calls.push([method,input]);
    if(method==='listTaskCatalog')return {catalog:[],installed:[]};
    if(method==='getTaskCandidate')return {stage:taskStage,manifestHash:pkg.manifestHash,package:pkg};
    if(method==='importTaskPackage')return {taskId:pkg.manifest.taskId,version:pkg.manifest.version};
    if(method==='verifyTaskCandidate')return {verification:{sourceHash:pkg.manifest.program.sourceHash}};
    if(method==='makeTaskAvailable'){taskStage='available';return {stage:taskStage,manifestHash:pkg.manifestHash};}
    if(method==='installTask')return {taskId:pkg.manifest.taskId,version:pkg.manifest.version};
    throw Error('Unexpected operation: '+method);
  }};
  const currentPageTarget={capture:()=>({...actual}),revalidate:async captured=>{
    calls.push(['revalidate',captured.documentId]);
    assert.equal(captured.documentId,actual.documentId);
    assert.equal(captured.url,actual.url);
  }};
  const view=createCloudHosting({client,host,api,currentPageTarget,
    document:{documentElement:{dataset:{opendeskTab:'cloud'}},getElementById:()=>null},
    reactUI:{cloudPageMounted:true,renderCloudPage(next){snapshot=next;}}});
  t.after(()=>view.dispose());
  await flush();await flush();
  return {calls,actual,model:()=>snapshot,host};
}

test('Reviewed JS goes through one original draft RunHost and explicitly gated native verification and install',async t=>{
  const f=await fixture(t);
  await f.model().programs.onRefresh();
  await f.model().programs.onReview(deliveryId);
  assert.equal(f.model().programs.review.source,pkg.sourceUtf8);
  // No implicit execution simply because the descriptor or source is visible.
  assert.equal(f.calls.filter(([method])=>method==='host.start').length,0);
  await f.model().programs.onTrial(deliveryId,'{}',{isTrusted:false});
  assert.equal(f.calls.filter(([method])=>method==='host.start').length,0);
  await f.model().programs.onTrial(deliveryId,'{}',{isTrusted:true});
  const starts=f.calls.filter(([method])=>method==='host.start');
  assert.equal(starts.length,1);
  assert.deepEqual(starts[0][1].source,{kind:'draft',sourceUtf8:pkg.sourceUtf8});
  assert.equal(starts[0][1].target.mode,'borrowed');
  assert.equal(starts[0][1].target.documentId,'test-document');
  assert.equal(starts[0][1].target.expectedUrl,f.actual.url);
  assert.deepEqual(starts[0][1].networkOrigins,[]);
  assert.equal(f.model().programs.trial.runId,runId);
  assert.equal(f.model().programs.trial.state,'completed');
  assert.equal(f.model().programs.trial.canVerify,false,
    'Trial completion alone cannot verify or install a remote candidate');
  assert.equal(f.calls.some(([method])=>method==='verifyTaskCandidate'),false);
  await f.model().programs.onImport(deliveryId);
  assert.equal(f.model().programs.trial.imported,true);
  assert.equal(f.model().programs.trial.canVerify,true);
  assert.equal(f.calls.some(([method])=>method==='installTask'),false);
  await f.model().programs.onVerifyTrial();
  assert.deepEqual(f.calls.find(([method])=>method==='verifyTaskCandidate')[1],
    {taskId:pkg.manifest.taskId,version:pkg.manifest.version,runId});
  assert.equal(f.model().programs.trial.available,true);
  assert.equal(f.model().programs.trial.installed,false);
  assert.equal(f.model().programs.trial.canInstall,true);
  await f.model().programs.onInstallTrial({isTrusted:true});
  assert.equal(f.calls.filter(([method])=>method==='installTask').length,1);
  assert.equal(f.model().programs.trial.installed,true);
  assert.match(f.model().programs.trial.message,/云控仍须另行批准/);
  assert.equal(f.calls.filter(([method])=>method==='host.start').length,1,
    'Verification and installation never replay the one-time JS run');
});

test('Wrong site and malformed parameters reject before starting a Controller',async t=>{
  const f=await fixture(t);
  await f.model().programs.onRefresh();
  await f.model().programs.onReview(deliveryId);
  f.actual.origin='https://wrong.example';
  await f.model().programs.onTrial(deliveryId,'{}',{isTrusted:true});
  assert.equal(f.calls.some(([method])=>method==='host.start'),false);
  assert.match(f.model().pairing.status,/E_TARGET|切换到/);
  f.actual.origin=origin;
  await f.model().programs.onTrial(deliveryId,'[]',{isTrusted:true});
  assert.equal(f.calls.some(([method])=>method==='host.start'),false);
  assert.match(f.model().pairing.status,/E_PARAMS|参数格式/);
});
