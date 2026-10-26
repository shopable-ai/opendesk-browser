import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCleanupPrompt,parseManualResult,fillGate,readTerms} from '../src/model.js';
const requestId='11111111-1111-4111-8111-111111111111';
test('terms are contextual hints and prompt keeps original unchanged',()=>{
  const original='不能删除 https://example.com/?a=1；金额 300.50，日期 10/26';
  const prompt=buildCleanupPrompt({requestId,original,terms:'扣得克斯 → Codex'});
  assert.ok(prompt.includes(original));
  assert.ok(prompt.includes('不是无条件的全局替换'));
  assert.ok(prompt.includes('扣得克斯 → Codex'));
});
test('manual result is not an authenticated plugin receipt',()=>{
  assert.deepEqual(parseManualResult(JSON.stringify({requestId,text:'Codex 与 React'}),requestId),
    {text:'Codex 与 React',kind:'manual-json'});
  assert.throws(()=>parseManualResult('{"requestId":"other","text":"bad"}',requestId));
  assert.equal(parseManualResult('用户核对后的文字',requestId).kind,'manual-plain');
});
test('reject empty source and excessive terminology',()=>{
  assert.throws(()=>buildCleanupPrompt({requestId,original:''}));
  assert.throws(()=>readTerms('术语\n'.repeat(41)));
});
test('same document, editor, form and exact unchanged draft required',()=>{
  const binding={doc:{},url:'https://chatgpt.com/c/abc',editor:{},form:{},draft:'原文'};
  const current={ok:true,doc:binding.doc,editor:binding.editor,
    form:binding.form,draft:binding.draft,rich:false};
  assert.deepEqual(fillGate(binding,current,{url:binding.url}),{ok:true});
  assert.equal(fillGate(binding,{...current,draft:'新草稿'},{url:binding.url}).ok,false);
  assert.equal(fillGate(binding,{...current,editor:{}},{url:binding.url}).ok,false);
  assert.equal(fillGate(binding,{...current,rich:true},{url:binding.url}).ok,false);
  assert.equal(fillGate(binding,current,{url:binding.url,composing:true}).ok,false);
});
