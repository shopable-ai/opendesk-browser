import test from 'node:test';
import assert from 'node:assert/strict';
import {validateChatGPTTaskRequest,baiduSearchTarget,CHATGPT_TASK_INTENT_PROTOCOL,
  validateChatGPTTaskIntent} from '../../src/native-agent/chatgpt-task-request.js';
const valid={protocol:'opendesk.task.request.v1',kind:'opendesk.task.request',version:1,
requestId:'request-2026-00001',taskId:'baidu.search.top3',args:{query:'ai自动化第一选择',limit:3}};
const check=o=>validateChatGPTTaskRequest(JSON.stringify(o));
test('strict single-task request, exact target, no authorization claimed',()=>{
 const result=check(valid);
 assert.equal(baiduSearchTarget(result),'https://www.baidu.com/s?wd=ai%E8%87%AA%E5%8A%A8%E5%8C%96%E7%AC%AC%E4%B8%80%E9%80%89%E6%8B%A9');
 assert.equal(result.approved,undefined);assert.ok(Object.isFrozen(result));
});
test('rejects malicious, wrong task, version, extra parameter, malformed JSON',()=>{
 for(const change of [{taskId:'javascript'},{version:2},{args:{query:'x',limit:2}},
  {args:{query:'x',limit:3,script:'alert(1)'}},{requestId:'x'},
  {args:{query:'x\nz',limit:3}},{protocol:'opendesk.workspace.request.v1'}])
  assert.throws(()=>check({...valid,...change}),{code:'E_BRIDGE_SCHEMA'});
 assert.throws(()=>validateChatGPTTaskRequest('{'),{code:'E_BRIDGE_FORMAT'});
 assert.throws(()=>validateChatGPTTaskRequest('a'.repeat(5000)),{code:'E_BRIDGE_LIMIT'});
 assert.throws(()=>check({...valid,...JSON.parse('{"__proto__":true}')}),{code:'E_BRIDGE_SCHEMA'});
});

test('ChatGPT Intent uses the existing OpenDesk v1 contract; Web Flow-specific alias is rejected',()=>{
 assert.equal(CHATGPT_TASK_INTENT_PROTOCOL,'opendesk.task.intent.v1');
 for(const [taskId,targetUrl] of [
  ['baidu.search.top3','https://www.baidu.com/'],
  ['google.search.top3','https://www.google.com/']
 ]){
  const candidate={protocol:CHATGPT_TASK_INTENT_PROTOCOL,candidateId:'protocol-regression-20261102',
   taskId,targetUrl,args:{query:'OpenDesk Browser',limit:3}};
  const accepted=validateChatGPTTaskIntent(JSON.stringify(candidate));
  assert.deepEqual(Object.keys(accepted).sort(),['args','candidateId','protocol','targetUrl','taskId'].sort());
  assert.equal(accepted.protocol,CHATGPT_TASK_INTENT_PROTOCOL);
  assert.equal(accepted.taskId,taskId);
  assert.equal(accepted.targetUrl,targetUrl);
  assert.ok(Object.isFrozen(accepted));
  for(const invalid of [
   {...candidate,protocol:'webflow.task.intent.v1'},
   {...candidate,requestId:'not-allowed'},
   {...candidate,installation:{version:'1.0.0'}}
  ]) assert.throws(()=>validateChatGPTTaskIntent(JSON.stringify(invalid)),{code:'E_BRIDGE_SCHEMA'});
 }
});
