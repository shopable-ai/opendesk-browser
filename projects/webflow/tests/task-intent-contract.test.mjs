import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {WEBFLOW_TASK_INTENT_PROTOCOL,WEBFLOW_TASK_INTENT_V2_PROTOCOL,
  validateWebFlowTaskIntent,validateWebFlowTaskIntentV2,validateTaskIntent}
  from '../src/task-intent-contract.js';
import * as legacy from '../../../src/native-agent/chatgpt-task-request.js';
import {webFlowV2ReviewedArgs} from '../../../src/native-agent/webflow-v2-entry.js';

const candidateId='wf-7e98a39d-4751-4755-a7c5-65dc62bb8e07';
const v1={protocol:WEBFLOW_TASK_INTENT_PROTOCOL,candidateId,taskId:'baidu.search.top3',
  targetUrl:'https://www.baidu.com/',args:{query:'WebFlow',limit:3}};
const v2={protocol:WEBFLOW_TASK_INTENT_V2_PROTOCOL,candidateId,taskId:'baidu.search.top3',
  args:{query:'WebFlow',limit:3}};

test('one WebFlow parser and historical ChatGPT bridge exports use the same implementation',()=>{
  assert.equal(WEBFLOW_TASK_INTENT_PROTOCOL,'webflow.task.intent.v1');
  assert.equal(WEBFLOW_TASK_INTENT_V2_PROTOCOL,'webflow.task.intent.v2');
  assert.strictEqual(legacy.validateWebFlowTaskIntent,validateWebFlowTaskIntent);
  assert.strictEqual(legacy.validateWebFlowTaskIntentV2,validateWebFlowTaskIntentV2);
  assert.equal(legacy.WEBFLOW_TASK_INTENT_PROTOCOL,WEBFLOW_TASK_INTENT_PROTOCOL);
  assert.deepEqual(validateWebFlowTaskIntent(JSON.stringify(v1)),v1);
  assert.deepEqual(validateWebFlowTaskIntentV2(JSON.stringify(v2)),v2);
  assert.ok(Object.isFrozen(validateWebFlowTaskIntent(JSON.stringify(v1)).args));
  assert.ok(Object.isFrozen(validateWebFlowTaskIntentV2(JSON.stringify(v2))));
  const old={...v1,protocol:'opendesk.task.intent.v1'};
  assert.deepEqual(legacy.validateChatGPTTaskIntent(JSON.stringify(old)),old);
  assert.deepEqual(validateTaskIntent(JSON.stringify(old),'opendesk.task.intent.v1'),old);
  assert.throws(()=>validateWebFlowTaskIntent(JSON.stringify(old)),{code:'E_BRIDGE_SCHEMA'});
  assert.throws(()=>legacy.validateChatGPTTaskIntent(JSON.stringify(v1)),{code:'E_BRIDGE_SCHEMA'});
});

test('five-field V1 and four-field V2 preserve duplicate-key, size and schema rejection',()=>{
  assert.throws(()=>validateWebFlowTaskIntent(JSON.stringify(v2)),{code:'E_BRIDGE_SCHEMA'});
  assert.throws(()=>validateWebFlowTaskIntentV2(JSON.stringify(v1)),{code:'E_BRIDGE_SCHEMA'});
  for(const parse of [validateWebFlowTaskIntent,validateWebFlowTaskIntentV2]){
    assert.throws(()=>parse('{'),{code:'E_BRIDGE_FORMAT'});
    assert.throws(()=>parse('x'.repeat(4097)),{code:'E_BRIDGE_LIMIT'});
  }
  for(const [parse,candidate] of [[validateWebFlowTaskIntent,v1],[validateWebFlowTaskIntentV2,v2]]){
    const raw=JSON.stringify(candidate);
    assert.throws(()=>parse(raw.replace('"taskId":"baidu.search.top3"',
      '"taskId":"baidu.search.top3","taskId":"baidu.search.top3"')),{code:'E_BRIDGE_FORMAT'});
    assert.throws(()=>parse(raw.replace('"limit":3','"limit":3,"limit":3')),{code:'E_BRIDGE_FORMAT'});
    assert.throws(()=>parse(JSON.stringify({...candidate,requestId:'untrusted'})),{code:'E_BRIDGE_SCHEMA'});
    assert.throws(()=>parse(JSON.stringify({...candidate,args:{nested:{a:1}}})),{code:'E_BRIDGE_SCHEMA'});
  }
  assert.throws(()=>validateWebFlowTaskIntentV2(JSON.stringify({...v2,targetUrl:v1.targetUrl})),
    {code:'E_BRIDGE_SCHEMA'});
  assert.throws(()=>validateWebFlowTaskIntent(JSON.stringify({...v1,targetUrl:'https://www.baidu.com/#x'})),
    {code:'E_BRIDGE_SCHEMA'});
});

test('V2 PREPARE-only remains a separate trusted policy, not an intent authorization',()=>{
  const prepare={...v2,taskId:'chatgpt.conversation.create',args:{prompt:'Hello B',phase:'prepare'}};
  assert.equal(validateWebFlowTaskIntentV2(JSON.stringify(prepare)).args.phase,'prepare');
  assert.deepEqual(webFlowV2ReviewedArgs(prepare),prepare.args);
  assert.throws(()=>webFlowV2ReviewedArgs({...prepare,args:{...prepare.args,phase:'submit'}}),
    {code:'E_WEBFLOW_V2_SCHEMA'});
  assert.throws(()=>webFlowV2ReviewedArgs({...prepare,args:{...prepare.args,send:true}}),
    {code:'E_WEBFLOW_V2_SCHEMA'});
});

test('generic module does not import ChatGPT and both generic consumers import it directly',async()=>{
  const root=new URL('../../../',import.meta.url);
  const get=path=>readFile(new URL(path,root),'utf8');
  const [contract,adapter,target,compat]=await Promise.all([
    get('projects/webflow/src/task-intent-contract.js'),
    get('src/page-events/generic-task-adapter.js'),
    get('src/native-agent/webflow-v2-target.js'),
    get('src/native-agent/chatgpt-task-request.js')
  ]);
  assert.doesNotMatch(contract,/\bchatgpt\b|^\s*import\s/m);
  for(const source of [adapter,target]){
    assert.match(source,/from '\.\.\/\.\.\/projects\/webflow\/src\/task-intent-contract\.js'/);
    assert.doesNotMatch(source,/from '[^']*chatgpt-task-request\.js'/);
  }
  assert.match(compat,/export \{WEBFLOW_TASK_INTENT_PROTOCOL/);
});
