import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {controllerMayRetainOwnedTarget,RETAIN_ON_SUCCESS}
  from '../../../src/platform/host/controller-target-retention.js';
import {validateTaskManifest} from '../../../src/platform/tasks/contract.js';

const baseline=Object.freeze({
  targetDisposition:RETAIN_ON_SUCCESS,
  sourceKind:'saved',
  selection:{mode:'owned',url:'https://chatgpt.com/'},
  target:{mode:'owned',tabId:91,frameId:0,documentId:'original-chat-document',
    browserSessionIncarnation:'browser-session',allowedOrigin:'https://chatgpt.com'},
  browserSessionIncarnation:'browser-session',
  state:'completed',workerRetired:true,retirementId:'finished-run',
});

test('ordinary Controller targets close; only a completed reviewed owned Task may retain a tab',()=>{
  assert.equal(controllerMayRetainOwnedTarget(baseline),true);
  for(const patch of [
    {targetDisposition:undefined},{targetDisposition:'close'},
    {sourceKind:'draft'},{state:'failed'},{state:'paused_unknown'},
    {workerRetired:false},{retirementId:null},
    {selection:{mode:'borrowed'}},
    {target:{...baseline.target,documentId:''}},
    {target:{...baseline.target,frameId:1}},
    {target:{...baseline.target,mode:'borrowed'}},
    {target:{...baseline.target,tabId:-1}},
    {target:{...baseline.target,browserSessionIncarnation:'other-session'}}
  ])assert.equal(controllerMayRetainOwnedTarget({...baseline,...patch}),false,
    'Unexpected retention for '+JSON.stringify(patch));
});

test('task manifest makes retention hash-covered and expressly reviewed; old packages are unchanged',async()=>{
  const pkg=JSON.parse(await readFile(new URL(
    '../../../examples/tasks/google.search.top3.v1.opendesk-task.json',import.meta.url),'utf8'));
  assert.equal(validateTaskManifest(pkg.manifest),pkg.manifest);
  assert.equal(pkg.manifest.targetDisposition,undefined);
  const reviewed={...pkg.manifest,targetDisposition:'retain-on-success'};
  assert.equal(validateTaskManifest(reviewed),reviewed);
  for(const value of ['retain','keep-open','always',null,false,true])
    assert.throws(()=>validateTaskManifest({...pkg.manifest,targetDisposition:value}),{code:'E_SCHEMA'});
});
