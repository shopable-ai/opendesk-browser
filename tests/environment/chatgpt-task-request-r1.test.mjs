import test from 'node:test';
import assert from 'node:assert/strict';
import {validateChatGPTTaskRequest,baiduSearchTarget} from '../../src/native-agent/chatgpt-task-request.js';
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
