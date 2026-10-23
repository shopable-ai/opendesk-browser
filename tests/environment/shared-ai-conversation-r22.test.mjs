import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';

const read=path=>readFile(new URL('../../'+path,import.meta.url),'utf8');

test('R2.2 shared frame drives My, Bookmark and Prompt; presentation holds no business IDs',async()=>{
 const [frame,my,main,css]=await Promise.all([
  read('src/ui/react/components/conversation.tsx'),
  read('src/ui/react/tabs/my-agent.tsx'),read('src/ui/react/main.tsx'),
  read('src/ui/react/tabs/my-agent.css')]);
 assert.match(frame,/export function SharedConversationFrame\(/);
 assert.match(frame,/<SharedConversationFrame open=\{open\}/);
 assert.match(my,/<SharedConversationFrame open=\{state\.open\}/);
 assert.doesNotMatch(my,/<form|<ConversationInput|<ConversationTranscript/);
 assert.doesNotMatch(frame,/businessKind|bookmarkId|folderId|promptId|taskId|scheduleId/);
 assert.match(main,/phaseLabels=\{PROMPT_PHASE_LABELS\}/);
 assert.match(main,/phaseLabels=\{BOOKMARK_PHASE_LABELS\}/);
 assert.match(css,/\.my-agent-panel \.od-conversation-log/);
 for(const source of [frame,my])
  assert.ok((await transform(source,{loader:'tsx',jsx:'transform',target:'es2022'})).code.length>1000);
});

test('R2.2 all trusted consumers reach the same Provider settings sheet and owner',async()=>{
 const [main,my,app,view,workflow,sheet]=await Promise.all([
  read('src/ui/react/main.tsx'),read('src/ui/react/tabs/my-agent.tsx'),
  read('src/ui/react/app-shell.tsx'),read('src/ui/workflow/workflow-view.js'),
  read('src/ui/react/tabs/workflow.tsx'),
  read('src/ui/react/components/provider-settings.tsx')]);
 assert.equal((main.match(/createRoot\(/g)||[]).length,1);
 assert.match(main,/onOpenSettings=\{\(\)=>workflowController\?\.actions\?\.openSettings\?\.\(\)\}/);
 assert.match(my,/onClick=\{onOpenSettings\}/);
 assert.match(app,/onOpenSettings=\{\(\)=>workflowController\?\.actions\?\.openSettings\?\.\(\)\}/);
 assert.match(view,/openSettings:\(\)=>\{if\(!disposed\)openAISettings\(\);\}/);
 assert.match(workflow,/<WorkflowSettingsSheet open=\{openSettings\}/);
 assert.match(sheet,/createPortal\(/);
 assert.doesNotMatch(sheet,/createRoot\(|chrome\.|permissions\.request|configure\(/);
 for(const source of [main,workflow,sheet,app])
  assert.ok((await transform(source,{loader:'tsx',jsx:'transform',target:'es2022'})).code.length>100);
});

test('R2.2 trusted business authority and isolated Provider leases are unchanged',async()=>{
 const [provider,agent,prompt,workflow]=await Promise.all([
  read('src/ui/ai/provider-runtime.js'),read('src/ui/my-task-agent.js'),
  read('src/ui/conversation/prompt-controller.js'),read('src/ui/workflow/workflow-view.js')]);
 assert.match(provider,/const leases=new Map\(\)/);
 assert.match(provider,/generation\+\+/);
 assert.match(agent,/createMyTaskAgent/);
 assert.match(prompt,/etag|ETag/i);
 assert.match(workflow,/workflowLease=providers\.acquire/);
});
