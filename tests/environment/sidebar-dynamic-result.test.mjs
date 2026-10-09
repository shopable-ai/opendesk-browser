import test from 'node:test';
import assert from 'node:assert/strict';
import {formatRunValue, runValueKind} from '../../src/ui/run-value-format.js';
import {formatControllerRunResult} from '../../src/ui/run-result-presentation.js';
import {presentTaskValue} from '../../src/ui/task-run-diagnostics.js';

test('generic result preserves unknown object keys, scalar kinds and exact top-level strings', () => {
  const value={title:'脚本猿',url:'http://192.168.30.8:8000/',value:0};
  assert.equal(formatRunValue(value), '{\n  "title": "脚本猿",\n  "url": "http://192.168.30.8:8000/",\n  "value": 0\n}');
  assert.equal(formatRunValue('第一行\n<b>不是 HTML</b>'), '第一行\n<b>不是 HTML</b>');
  for(const [value,text] of [[0,'0'],[false,'false'],[null,'null'],[undefined,'undefined'],[-0,'-0'],['','']])
    assert.equal(formatRunValue(value),text);
  assert.equal(runValueKind([]),'数组');
  assert.equal(runValueKind(''),'字符串');
});

test('arrays, object undefined and negative zero are not silently JSON-stringified away', () => {
  assert.equal(formatRunValue({missing:undefined,delta:-0,nested:[false,undefined,null]}),
    '{\n  "missing": undefined,\n  "delta": -0,\n  "nested": [\n    false,\n    undefined,\n    null\n  ]\n}');
  assert.equal(formatRunValue([{ok:true},0]), '[\n  {\n    "ok": true\n  },\n  0\n]');
  const cyclic={};cyclic.self=cyclic;
  assert.throws(()=>formatRunValue(cyclic),/Cyclic/);
  assert.throws(()=>formatRunValue(new Date()),/Unsupported/);
  assert.throws(()=>formatRunValue(Number.NaN),/Non-finite/);
});

test('controller projection only displays authorized returned value, never envelope fields', () => {
  const rows=[{runId:'run-1',resultId:'result-1',sourceHash:'not-a-user-field',value:{custom:[1,false]}},
    {runId:'run-2',value:'secret'}];
  const value=formatControllerRunResult(rows,'run-1');
  assert.equal(value,'{\n  "custom": [\n    1,\n    false\n  ]\n}');
  assert.doesNotMatch(value,/runId|resultId|sourceHash/);
  assert.match(formatControllerRunResult(rows,'run-2',['run-2']),/无权查看/);
  assert.equal(formatControllerRunResult([{runId:'run-3',value:undefined}],'run-3'),'undefined');
});

test('installed task preview explicitly marks redaction and clipping without changing original value', () => {
  const value={ok:true,accessToken:'do-not-expose',nested:{offset:-0,flag:undefined},body:'z'.repeat(6000)};
  const preview=presentTaskValue(value);
  assert.equal(preview.redacted,true);
  assert.equal(preview.truncated,true);
  assert.match(preview.text,/已遮盖/);
  assert.match(preview.text,/内容已截断/);
  assert.doesNotMatch(preview.text,/do-not-expose/);
  assert.equal(value.accessToken,'do-not-expose');
  const original=formatRunValue(value);
  assert.match(original,/do-not-expose/);
  assert.match(original,/"offset": -0/);
});
