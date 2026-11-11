import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateWebFlowTaskIntent,validateWebFlowTaskIntentV2} from '../../../src/native-agent/chatgpt-task-request.js';
import {resolveWebFlowV2FixedTarget,webFlowV2ReviewedArgs} from '../../../src/native-agent/webflow-v2-target.js';
import {REVIEWED_BUILTIN_TASK_RELEASES} from '../../../src/platform/tasks/builtin-releases.js';

const id='wf-7e98a39d-4751-4755-a7c5-65dc62bb8e07';
const v2={protocol:'webflow.task.intent.v2',candidateId:id,taskId:'baidu.search.top3',
  args:{query:'Chrome extension Side Panel API',limit:3}};
const v1={...v2,protocol:'webflow.task.intent.v1',targetUrl:'https://www.baidu.com/'};
const fixture=async (taskId,version='0.2.0')=>{
  const packagePath=taskId==='chatgpt.conversation.create'?
    (version==='0.1.0'?'../tasks/chatgpt.conversation.create.v1.opendesk-task.json':
      '../tasks/chatgpt.conversation.create.0.2.0.opendesk-task.json'):
    `../../../examples/tasks/${taskId}.v1.opendesk-task.json`;
  const pkg=JSON.parse(await readFile(new URL(packagePath,import.meta.url),'utf8'));
  const pin=REVIEWED_BUILTIN_TASK_RELEASES.find(item=>item.taskId===taskId&&item.version===pkg.manifest.version);
  assert.ok(pin,'Expected exact reviewed release');
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
      // Fixed V2 admission never inherits the Task manifest's optional defaults.
      args:taskId==='chatgpt.conversation.create'?{prompt:'Hello B',send:false}:
        {...v2.args,showExecutionTab:true}}));
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

test('ChatGPT 0.2 requires explicit true to send; missing send remains safe draft',async()=>{
  const f=await fixture('chatgpt.conversation.create');
  for(const args of [{prompt:'Hello',send:'false'},{prompt:'Hello',send:1},
    {prompt:'Hello',send:false,unknownField:'x'}]){
    const intent=validateWebFlowTaskIntentV2(JSON.stringify({...v2,
      taskId:'chatgpt.conversation.create',args}));
    assert.throws(()=>resolveWebFlowV2FixedTarget({intent,...f}),{code:'E_WEBFLOW_V2_SCHEMA'});
  }
  const draft=validateWebFlowTaskIntentV2(JSON.stringify({...v2,
    taskId:'chatgpt.conversation.create',args:{prompt:'Hello B'}}));
  assert.deepEqual(resolveWebFlowV2FixedTarget({intent:draft,...f}).args,
    {prompt:'Hello B',send:false});
  const send=validateWebFlowTaskIntentV2(JSON.stringify({...v2,
    taskId:'chatgpt.conversation.create',args:{prompt:'Hello B',send:true}}));
  assert.equal(resolveWebFlowV2FixedTarget({intent:send,...f}).args.send,true);
});
test('historical 0.1 draft remains verifiable and strictly refuses send:true',async()=>{
  const f=await fixture('chatgpt.conversation.create','0.1.0');
  const intent=args=>validateWebFlowTaskIntentV2(JSON.stringify({...v2,
    taskId:'chatgpt.conversation.create',args}));
  assert.throws(()=>resolveWebFlowV2FixedTarget({intent:intent({prompt:'Hello B',send:true}),...f}),
    {code:'E_WEBFLOW_V2_SCHEMA'});
  assert.equal(resolveWebFlowV2FixedTarget({intent:intent({prompt:'Hello B'}),...f}).args.send,false);
});

test('two-phase ChatGPT V2 may PREPARE, but cannot submit without trusted continuation',()=>{
  const chatgpt=(args)=>({protocol:'webflow.task.intent.v2',candidateId:id,
    taskId:'chatgpt.conversation.create',args});
  assert.deepEqual(webFlowV2ReviewedArgs(chatgpt({prompt:'Hello B',phase:'prepare'})),
    {prompt:'Hello B',phase:'prepare'});
  assert.deepEqual(webFlowV2ReviewedArgs(chatgpt({prompt:'Legacy B'})),
    {send:false,prompt:'Legacy B'});
  for(const args of [
    {prompt:'Hello B',phase:'submit'},
    {prompt:'Hello B',phase:'prepare',send:false},
    {prompt:'Hello B',phase:'submit',prepareRunId:'run-original-0001'}
  ])assert.throws(()=>webFlowV2ReviewedArgs(chatgpt(args)),{code:'E_WEBFLOW_V2_SCHEMA'});
});
