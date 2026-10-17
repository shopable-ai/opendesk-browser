import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script} from 'node:vm';

test('Workflow current primary HTML keeps compact composer, three independent actions and real provider sheet UI',async()=>{
  const html=await readFile('prototypes/sidebar/workflow.html','utf8');
  const source=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(source,'one offline script required');
  new Script(source,{filename:'workflow-primary-preview.js'});
  assert.match(html,/id="history"[^>]+aria-label="历史对话"/);
  assert.match(html,/id="new-chat"[^>]+aria-label="新对话"/);
  assert.match(html,/id="new-workflow"[^>]+aria-label="新建工作流"/);
  assert.doesNotMatch(html,/id="r23-mode-button"|const modeMenu|modeButton|modeMenu/);
  assert.doesNotMatch(html,/<p class="foot-note">/);
  assert.match(html,/left\.append\(\$\('settings'\),sourceLabel\)/);
  assert.match(html,/sourceLabel\.textContent=isNative\(\)\?'本机 Codex':'HTTPS 模型'/);
  assert.match(html,/r239-sheet/);
  assert.match(html,/r236-native/);
  assert.match(html,/r236-https/);
  assert.match(html,/r23-api-key/);
  assert.match(html,/data-stage="sharing-required"/);
  assert.match(html,/if\(!data\.siteGranted\)/);
  assert.match(html,/data\.entryView\|\|/);
});
