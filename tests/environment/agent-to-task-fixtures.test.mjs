import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {verifyTaskPackage,validateTaskParams} from '../../src/platform/tasks/contract.js';

// These are fixture/contract tests, NOT Chrome or AI Agent E2E evidence.
test('read-only Agent observation draft returns a bounded semantic snapshot without actions',async()=>{
  const source=await readFile('examples/tasks/agent-observe-draft.js','utf8');
  const observed=[],snapshot={nodes:[{role:'textbox',name:'搜索关键词'}],truncated:false};
  const page={
    observe:async options=>{observed.push(JSON.parse(JSON.stringify(options)));return snapshot;},
    url:async()=> 'http://127.0.0.1:43111/demo-form.html'
  };
  const result=await runInNewContext(source+'\nmain();',{page});
  assert.equal(result.kind,'opendesk.agent-observation.v1');
  assert.equal(result.url,'http://127.0.0.1:43111/demo-form.html');
  assert.equal(result.observation,snapshot);
  assert.deepEqual(observed,[{root:'#search-form',maxDepth:5,maxNodes:32,maxChars:4200}]);
});

test('modern Locator Task candidate is exact and immutable, never pre-verified',async()=>{
  const source=await readFile('examples/tasks/modern-search-draft.js','utf8');
  const pkg=JSON.parse(await readFile('examples/tasks/modern-search.v1.opendesk-task.json','utf8'));
  const verified=await verifyTaskPackage(pkg);
  assert.equal(verified.sourceUtf8,source,'imported candidate must exactly match the tested script bytes');
  assert.equal(verified.manifest.taskId,'sample.modern-search');
  assert.equal(verified.manifest.entryFormat,'async-main');
  assert.deepEqual(verified.manifest.siteOrigins,['http://127.0.0.1:43111']);
  assert.deepEqual(validateTaskParams(verified.manifest.paramsSchema,{}),{keyword:'OpenDesk'});
  assert.equal(Object.hasOwn(pkg,'verified'),false);
  assert.equal(Object.hasOwn(pkg,'stage'),false);
  await assert.rejects(verifyTaskPackage({...pkg,sourceUtf8:source+'\n'}),{code:'E_HASH'});
});
