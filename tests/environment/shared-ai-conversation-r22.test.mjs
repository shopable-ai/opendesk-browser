import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';
import {createSharedAIProviderRuntime} from '../../src/ui/ai/provider-runtime.js';

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
 assert.match(main,/onOpenSettings=\{openSharedProviderSettings\}/);
 assert.match(main,/providerRuntime=\{providerRuntime\}/);
 assert.match(my,/onClick=\{onOpenSettings\}/);
 assert.match(app,/onOpenSettings=\{onOpenProviderSettings\}/);
 assert.match(app,/providerRuntime=\{providerRuntime\}/);
 assert.match(view,/unsubscribeProviderSettings/);
 assert.match(workflow,/<WorkflowSettingsSheet open=\{openSettings\}/);
 assert.match(workflow,/<IconButton id="workflow-provider-toggle"/);
 assert.match(sheet,/createPortal\(/);
 assert.match(sheet,/providerRuntime\.updateSettings\(patch\)/);
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


test('R2.2 public Provider settings are stable, never reveal a key and preserve each Lease',async()=>{
 const disposed=[];
 const runtime=createSharedAIProviderRuntime({
  hostInstanceId:'trusted-panel',
  client:{requestWorkflowAI:async()=>({})},
  plannerFactory:()=>({
   plan:async()=>({}),planStructured:async()=>({}),probe:async()=>({}),
   resume:async()=>({}),cancel:async()=>({}),close:async()=>({}),
   snapshot:()=>({sessionId:'native-session-one'}),dispose:()=>disposed.push('released')
  }),
  facadeFactory:()=>({probeCapabilities:()=>({}),generateWorkflow:async()=>({}),
   generateStructured:async()=>({})})
 });
 const events=[],unsubscribe=runtime.subscribeSettings(()=>events.push(runtime.settingsSnapshot()));
 const before=runtime.settingsSnapshot();
 assert.strictEqual(runtime.settingsSnapshot(),before,'no change must retain snapshot identity');
 assert.equal(before.hasApiKey,false);
 const bookmark=runtime.acquire({consumerId:'bookmark',instanceId:'bookmark-1'});
 const tasks=runtime.acquire({consumerId:'tasks',instanceId:'tasks-1'});
 assert.notEqual(bookmark,tasks,'different business leases');
 const changed=runtime.updateSettings({
  source:'custom_https',endpoint:'https://example.org/v1/chat/completions',
  model:'model-one',apiKey:'private-secret'
 });
 assert.equal(changed.settings.apiKey,'private-secret');
 assert.equal(events.length,1);
 assert.deepEqual(runtime.settingsSnapshot(),{
  source:'custom_https',endpoint:'https://example.org/v1/chat/completions',
  model:'model-one',hasApiKey:true,generation:2
 });
 assert.equal(Object.hasOwn(runtime.settingsSnapshot(),'apiKey'),false);
 runtime.updateSettings({model:'model-two'});
 assert.equal(events.length,2);
 assert.equal(runtime.configuration().settings.apiKey,'private-secret','model update cannot erase key');
 assert.notEqual(bookmark.identity().instanceId,tasks.identity().instanceId);
 assert.throws(()=>runtime.updateSettings({admin:true}),{code:'E_AI_CONFIG'});
 unsubscribe();runtime.updateSettings({source:'local_codex'});
 assert.equal(events.length,2);
 bookmark.dispose();tasks.dispose();runtime.dispose();
 assert.throws(()=>runtime.updateSettings({model:'later'}),{code:'E_HOST_CLOSED'});
});
