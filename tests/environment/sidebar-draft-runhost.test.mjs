import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunHost} from '../../src/run-host.js';
import {decodeValue} from '../../src/platform/page-port/codec.js';
import {createControllerDraftRun} from '../../src/ui/controller-draft-run.js';

function stubHost() {
  const requests = [];
  const client = {
    ready: Promise.resolve(),
    subscribeConnection: () => () => {},
    controller: {
      async startControllerRun(request) {
        requests.push(structuredClone(request));
        // A duplicate reply lets us check the admission transport without
        // creating a fake Worker, native effect, or durable result.
        return {runId: crypto.randomUUID(), duplicate: true};
      },
    },
  };
  const document = {defaultView: {addEventListener() {}, removeEventListener() {}}};
  const host = createRunHost({client, document, templateModuleFactory: null});
  return {host, requests};
}

test('RunHost freezes a draft source variant and parameters before awaiting the host connection', async () => {
  const {host, requests} = stubHost();
  const source = {kind: 'draft', sourceUtf8: 'return {value:params.value};'};
  const params = {value: 5}, target = {mode: 'borrowed', tabId: 5, frameId: 0, documentId: 'test-document'};
  const running = host.start({source, params, target, deadlineAt: Date.now() + 30000});
  source.sourceUtf8 = 'return {value:999};';
  params.value = 999;
  target.tabId = 999;
  target.documentId = 'modified-after-click';
  await assert.rejects(running, error => error.code === 'E_EFFECT_UNKNOWN');
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].source, {kind: 'draft', sourceUtf8: 'return {value:params.value};'});
  assert.equal(decodeValue(requests[0].paramsWire).value, 5);
  assert.deepEqual(requests[0].target, {mode: 'borrowed', tabId: 5, frameId: 0, documentId: 'test-document'});
  assert.equal(requests[0].scriptId, undefined);
  assert.equal(requests[0].revision, undefined);
  assert.equal(requests[0].contentHash, undefined);
  host.dispose();
});

test('saved script API retains explicit scriptId/revision/contentHash admission', async () => {
  const {host, requests} = stubHost();
  const hash = 'a'.repeat(64);
  const target = {mode: 'borrowed', tabId: 5, frameId: 0, documentId: 'exact'};
  const running = host.start({scriptId: 'saved-r1', revision: 1, contentHash: hash, params: {}, target});
  target.tabId = 99;
  target.documentId = 'changed';
  await assert.rejects(running, error => error.code === 'E_EFFECT_UNKNOWN');
  assert.deepEqual(requests[0].target, {mode: 'borrowed', tabId: 5, frameId: 0, documentId: 'exact'});
  assert.deepEqual(Object.fromEntries(['scriptId', 'revision', 'contentHash'].map(key => [key, requests[0][key]])),
    {scriptId: 'saved-r1', revision: 1, contentHash: hash});
  assert.equal(requests[0].source, undefined);
  host.dispose();
});

function draftEditorFixture({deadline='30000',permission=Promise.resolve(true),completion=Promise.resolve({})}={}) {
  const fields=Object.fromEntries(Object.entries({
    'script-id':{value:'test-draft'},'script-params':{value:'{}'},
    'script-allow-cookies':{checked:false},'script-run-id':{value:''},
    'script-draft-deadline-ms':{value:deadline}
  }).map(([key,state])=>[key,{key,...state}]));
  const starts=[],errors=[];
  const runner=createControllerDraftRun({
    client:{},api:{permissions:{contains:()=>permission}},
    host:{currentRun:null,completion,async start(request){starts.push(request);return {runId:'test-run'};}},
    currentPageTarget:{capture:()=>({tabId:1,frameId:0,documentId:'exact',url:'https://example.com/',windowId:2}),revalidate:async()=>{}},
    programSource:{kind:()=> 'controller',source:()=> 'async function main(){return 1;}'},
    view:{fields,patch(key,values){Object.assign(fields[key],values);}},
    controllerResults:{projection:{slotAvailable:true},renderTask(){},read:async()=>{},clearProjection(){}},
    isDisposed:()=>false,isBlocked:()=>false,isControllerDraft:()=>true,
    display(){},fail:error=>errors.push(error),hideUserScriptsRecovery(){},beginResult(){},update(){}
  });
  return {fields,starts,errors,runner,settle:()=>new Promise(resolve=>setImmediate(resolve))};
}

test('trusted draft Run uses its selected existing deadline while preserving the default',async()=>{
  for(const deadline of ['30000','60000','120000']){
    const f=draftEditorFixture({deadline}),before=Date.now();
    f.runner.run({isTrusted:true});await f.settle();
    assert.equal(f.starts.length,1);assert.deepEqual(f.errors,[]);
    assert.ok(f.starts[0].deadlineAt>=before+Number(deadline));
    assert.ok(f.starts[0].deadlineAt<=Date.now()+Number(deadline));
    assert.equal(f.starts[0].target.documentId,'exact');
    assert.equal(f.starts[0].source.kind,'draft');
  }
});

test('invalid draft deadlines never reach admission or widen a runtime limit',async()=>{
  for(const deadline of ['', '999','120001','60000.5','Infinity','not-a-number']){
    const f=draftEditorFixture({deadline});f.runner.run({isTrusted:true});await f.settle();
    assert.equal(f.starts.length,0);assert.equal(f.errors[0]?.code,'E_ARGUMENT_TYPE');
  }
  const f=draftEditorFixture({deadline:'60000'});f.runner.run({isTrusted:false});await f.settle();
  assert.equal(f.starts.length,0);
});

test('a changed deadline during permission preparation cannot admit the old draft',async()=>{
  let grant;const permission=new Promise(resolve=>{grant=resolve;});
  const f=draftEditorFixture({deadline:'60000',permission});f.runner.run({isTrusted:true});
  f.fields['script-draft-deadline-ms'].value='120000';grant(true);await f.settle();
  assert.equal(f.starts.length,0);assert.equal(f.errors[0]?.code,'E_CONTROLLER_DRAFT_STALE');
});

test('cancelled or disposed preparation cannot start after a late permission reply',async()=>{
  for(const cancel of ['invalidate','dispose']){
    let grant;const permission=new Promise(resolve=>{grant=resolve;});
    const f=draftEditorFixture({deadline:'60000',permission});f.runner.run({isTrusted:true});
    f.runner[cancel]();grant(true);await f.settle();
    assert.equal(f.starts.length,0);assert.equal(f.errors[0]?.code,'E_CONTROLLER_DRAFT_STALE');
  }
});

test('a running draft keeps its frozen deadline and an older view retains the default',async()=>{
  let finish;const completion=new Promise(resolve=>{finish=resolve;});
  const f=draftEditorFixture({deadline:'60000',completion});f.runner.run({isTrusted:true});await f.settle();
  assert.equal(f.starts.length,1);const admitted=f.starts[0].deadlineAt;
  f.fields['script-draft-deadline-ms'].value='120000';f.runner.invalidate();
  assert.equal(f.starts[0].deadlineAt,admitted);finish({});await f.settle();
  const old=draftEditorFixture();delete old.fields['script-draft-deadline-ms'];const before=Date.now();
  old.runner.run({isTrusted:true});await old.settle();
  assert.equal(old.starts.length,1);assert.ok(old.starts[0].deadlineAt>=before+30000);
  assert.ok(old.starts[0].deadlineAt<=Date.now()+30000);
});
