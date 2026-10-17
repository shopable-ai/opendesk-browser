import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transformWithEsbuild} from 'vite';

const read=path=>readFile(path,'utf8');
test('R33.3.6 source-bound preview only reuses real Workflow JSX and installed shell',async()=>{
  const [entry,builder,component]=await Promise.all([
    read('src/ui/react/preview/workflow-preview.tsx'),
    read('scripts/preview/build-workflow-react-preview.mjs'),
    read('src/ui/react/tabs/workflow.tsx')
  ]);
  assert.match(entry,/from '\.\.\/tabs\/workflow\.tsx'/);
  for(const name of ['WorkflowHeader','WorkflowTranscript','WorkflowSettingsSheet','WorkflowResultText'])
    assert.match(entry,new RegExp('createPortal\\(<'+name));
  for(const path of ['src/ui/tool.html','src/ui/design-tokens.css',
    'src/ui/design-system.css','src/ui/tool-shell.css','src/ui/react/tabs/workflow.tsx'])
    assert.ok(builder.includes(path),'canonical input missing '+path);
  assert.match(builder,/--check/);
  assert.match(component,/export function WorkflowSettingsSheet/);
  assert.match(component,/export function WorkflowResultText/);
  // Comments may describe forbidden APIs; guard the executable code, not prose.
  const executable=entry.replace(/^\s*\/\/[^\n]*$/gm,'');
  assert.doesNotMatch(executable,/chrome\.|(?:^|\W)fetch\(|localStorage|sessionStorage|createWorkflowProviderFacade/);
  assert.doesNotMatch(executable,/from ['"][^'"]*(?:framework\/sdk|platform\/host|installer|sandbox)/);
  const result=await transformWithEsbuild(entry,'workflow-preview.tsx',
    {loader:'tsx',jsx:'transform',target:'es2022'});
  assert.ok(result.code.length>1000);
});
test('R33.3.6 compiled offline HTML has real source checksum and bundled React',async()=>{
  const html=await read('prototypes/sidebar/workflow/react-preview/index.html');
  assert.match(html,/SOURCE_BOUND_UI_PREVIEW React19/);
  assert.match(html,/PREVIEW_ADAPTER_NOT_NATIVE/);
  assert.match(html,/name="od-source-input-sha256" content="[0-9a-f]{64}"/);
  assert.match(html,/id="workflow-provider-settings"/);
  assert.match(html,/id="workflow-ai-request"/);
  assert.match(html,/id="od-workflow-preview-stage"/);
  assert.match(html,/data:text\/javascript;base64,/);
  assert.match(html,/connect-src 'none'/);
  assert.doesNotMatch(html,/<script(?=\s)[^>]*src="https?:/);
  assert.doesNotMatch(html,/<iframe[^>]+src="https?:/);
});
