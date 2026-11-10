import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateWebFlowTaskIntent,validateWebFlowTaskIntentV2} from '../../../src/native-agent/chatgpt-task-request.js';
import {resolveWebFlowV2FixedTarget} from '../../../src/native-agent/webflow-v2-target.js';
import {BUILTIN_TASK_RELEASES} from '../../../src/platform/tasks/builtin-releases.js';

const id='wf-7e98a39d-4751-4755-a7c5-65dc62bb8e07';
const v2={protocol:'webflow.task.intent.v2',candidateId:id,taskId:'baidu.search.top3',
  args:{query:'Chrome extension Side Panel API',limit:3}};
const v1={...v2,protocol:'webflow.task.intent.v1',targetUrl:'https://www.baidu.com/'};
const fixture=async taskId=>{
  const pkg=JSON.parse(await readFile(new URL(
    taskId==='chatgpt.conversation.create'?'../tasks/chatgpt.conversation.create.v1.opendesk-task.json':
      `../../../examples/tasks/${taskId}.v1.opendesk-task.json`,import.meta.url),'utf8'));
  const pin=BUILTIN_TASK_RELEASES.find(item=>item.taskId===taskId);
  return {manifest:pkg.manifest,installation:{version:pin.version,manifestHash:pin.manifestHash,
    contentHash:pin.sourceHash,scriptId:`task:${taskId}:${pin.version}`,
    revision:pkg.manifest.program.revision,generation:1,installationId:'test-installation-1'}};
};

test('V1 remains five-field and V2 is exactly four fields',()=>{
  assert.deepEqual(Object.keys(validateWebFlowTaskIntent(JSON.stringify(v1))).sort(),
    ['args','candidateId','protocol','targetUrl','taskId']);
  assert.deepEqual(Object.keys(validateWebFlowTaskIntentV2(JSON.stringify(v2))).sort(),
    ['args','candidateId','protocol','taskId']);
  assert.throws(()=>validateWebFlowTaskIntent(JSON.stringify(v2)),{code:'E_BRIDGE_SCHEMA'});
  assert.throws(()=>validateWebFlowTaskIntentV2(JSON.stringify(v1)),{code:'E_BRIDGE_SCHEMA'});
});
test('V2 refuses targetUrl, callback, activation and internal runtime identifiers',()=>{
  for(const extra of [{targetUrl:'https://www.baidu.com/'},{callbackUrl:'https://example.com/'},
    {tabId:3},{windowId:2},{runId:'fake'},{installationId:'fake'},{activateTab:true}]){
    assert.throws(()=>validateWebFlowTaskIntentV2(JSON.stringify({...v2,...extra})),{code:'E_BRIDGE_SCHEMA'});
  }
  assert.throws(()=>validateWebFlowTaskIntentV2(JSON.stringify(v2).replace('"limit":3','"limit":3,"limit":3')),
    {code:'E_BRIDGE_FORMAT'});
});
test('compiled fixed entry is pinned to reviewed builtin version and origin',async()=>{
  for(const [taskId,targetUrl] of [['baidu.search.top3','https://www.baidu.com/'],
    ['google.search.top3','https://www.google.com/'],
    ['chatgpt.conversation.create','https://chatgpt.com/']]){
    const f=await fixture(taskId);
    const intent=validateWebFlowTaskIntentV2(JSON.stringify({...v2,taskId,
      args:taskId==='chatgpt.conversation.create'?{prompt:'Hello B',send:false}:v2.args}));
    const target=resolveWebFlowV2FixedTarget({intent,...f});
    assert.equal(target.targetUrl,targetUrl);
    assert.equal(target.installation.contentHash,f.installation.contentHash);
    assert.equal(Object.hasOwn(target,'tabId'),false);
  }
});
test('wrong Origin, changed install, absent binding and incomplete args fail closed',async()=>{
  const f=await fixture('baidu.search.top3'),intent=validateWebFlowTaskIntentV2(JSON.stringify(v2));
  assert.throws(()=>resolveWebFlowV2FixedTarget({intent,manifest:{...f.manifest,
    siteOrigins:['https://www.google.com']},installation:f.installation}),{code:'E_WEBFLOW_TARGET_BINDING'});
  for(const installation of [{...f.installation,generation:0},{...f.installation,manifestHash:'a'.repeat(64)},
    {...f.installation,contentHash:'b'.repeat(64)},undefined]){
    assert.throws(()=>resolveWebFlowV2FixedTarget({intent,manifest:f.manifest,installation}),
      {code:'E_WEBFLOW_TARGET_BINDING'});
  }
  assert.throws(()=>resolveWebFlowV2FixedTarget({intent:{...intent,taskId:'gemini.conversation.create'},...f}),
    {code:'E_WEBFLOW_TARGET_UNBOUND'});
  assert.throws(()=>resolveWebFlowV2FixedTarget({intent:{...intent,args:{query:'missing limit'}},...f}),
    {code:'E_WEBFLOW_V2_SCHEMA'});
});

test('pinned ChatGPT draft refuses send:true and normalizes omitted send to false',async()=>{
  const f=await fixture('chatgpt.conversation.create');
  for(const args of [{prompt:'Hello',send:true},{prompt:'Hello',send:'false'},
    {prompt:'Hello',send:false,unknownField:'x'}]){
    const intent=validateWebFlowTaskIntentV2(JSON.stringify({...v2,
      taskId:'chatgpt.conversation.create',args}));
    assert.throws(()=>resolveWebFlowV2FixedTarget({intent,...f}),{code:'E_WEBFLOW_V2_SCHEMA'});
  }
  const intent=validateWebFlowTaskIntentV2(JSON.stringify({...v2,
    taskId:'chatgpt.conversation.create',args:{prompt:'Hello B'}}));
  const resolved=resolveWebFlowV2FixedTarget({intent,...f});
  assert.equal(resolved.args.send,false);
  assert.equal(resolved.args.prompt,'Hello B');
});
