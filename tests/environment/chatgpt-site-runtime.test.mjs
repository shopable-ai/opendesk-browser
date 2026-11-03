import test from 'node:test';
import assert from 'node:assert/strict';
import {startChatGPTSiteRuntime} from '../../src/page-events/chatgpt-runtime.js';

test('the existing ChatGPT bridge starts for its official top-level origin only',()=>{
  const calls=[];
  const init=()=>{calls.push('started');return 'bridge';};
  const win={location:{href:'https://chatgpt.com/c/123'}};win.top=win;
  assert.equal(startChatGPTSiteRuntime({win,init}),'bridge');
  win.location.href='https://chatgpt.com.evil.test/c/123';
  assert.equal(startChatGPTSiteRuntime({win,init}),null);
  win.location.href='https://chatgpt.com/c/123';win.top={};
  assert.equal(startChatGPTSiteRuntime({win,init}),null);
  assert.deepEqual(calls,['started']);
});
