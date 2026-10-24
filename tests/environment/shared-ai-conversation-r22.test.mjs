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
 assert.match(frame,/inputDisabled=false/,'editor can still accept a draft while inference is pending');
 assert.match(my,/inputDisabled=\{Boolean\(state\.pending\)\}/,'draft remains editable while AI is busy');
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
 assert.match(main,/providerSettings=\{providerSettings\}/);
 assert.match(main,/onOpenNativeSettings=\{openNativeSettings\}/);
 assert.match(my,/onClick=\{onOpenSettings\}/);
 assert.match(app,/onOpenSettings=\{onOpenProviderSettings\}/);
 assert.match(app,/providerSettings=\{providerSettings\}/);
 assert.match(view,/unsubscribeProviderSettings/);
 assert.match(main,/openProviderSettings:openSharedProviderSettings/);
 assert.match(view,/if\(typeof openAIProviderSettings==='function'\)/);
 assert.match(workflow,/<WorkflowSettingsSheet open=\{openSettings\}/);
 assert.match(workflow,/<IconButton id="workflow-provider-toggle"/);
 assert.match(sheet,/createPortal\(/);
 assert.match(sheet,/providerSettings\.updateSettings\(patch\)/);
 const shell=await read('src/ui/tool-shell.js');
 assert.match(shell,/providerSettings=Object\.freeze\(/);
 assert.doesNotMatch(main,/providerRuntime/,'the React root must not own the complete Provider Runtime');
 assert.doesNotMatch(sheet,/\.configuration\(\)|\.acquire\(/,'settings UI cannot read secrets or lease inference');
 assert.match(sheet,/onOpenNativeSettings\(\)/);
 assert.match(sheet,/!event\.nativeEvent\?\.isTrusted/);
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
 assert.strictEqual(changed,runtime.settingsSnapshot());
 assert.equal(JSON.stringify(changed).includes('private-secret'),false,'save result must not disclose the key');
 assert.equal(events.length,1);
 assert.deepEqual(runtime.settingsSnapshot(),{
  source:'custom_https',endpoint:'https://example.org/v1/chat/completions',
  model:'model-one',hasApiKey:true,generation:2,httpsSource:'custom_https'
 });
 assert.equal(Object.hasOwn(runtime.settingsSnapshot(),'apiKey'),false);
 const edited=runtime.updateSettings({model:'model-two'});
 assert.equal(JSON.stringify(edited).includes('private-secret'),false,'editing a model cannot disclose a retained key');
 assert.equal(events.length,2);
 assert.equal(runtime.configuration().settings.apiKey,'private-secret','model update cannot erase key');
 assert.notEqual(bookmark.identity().instanceId,tasks.identity().instanceId);
 assert.throws(()=>runtime.updateSettings({admin:true}),{code:'E_AI_CONFIG'});
 unsubscribe();runtime.updateSettings({source:'local_codex'});
 assert.equal(events.length,2);
 bookmark.dispose();tasks.dispose();runtime.dispose();
 assert.throws(()=>runtime.updateSettings({model:'later'}),{code:'E_HOST_CLOSED'});
});

test('R2.2.1 Workflow shares transcript, IME, Send and Stop with the trusted frame',async()=>{
 const [page,frame,css]=await Promise.all([
  read('src/ui/react/tabs/workflow.tsx'),
  read('src/ui/react/components/conversation.tsx'),
  read('src/ui/tool-shell.css')
 ]);
 assert.match(page,/<SharedConversationFrame open=\{active\}/);
 assert.match(page,/splitTargets transcriptTarget=\{transcriptTarget\} composerTarget=\{composerTarget\}/);
 assert.match(page,/onSend=\{event=>click\('workflow-ai-plan',event\)\}/);
 assert.match(page,/onStop=\{event=>click\('workflow-ai-cancel',event\)\}/);
 assert.match(page,/onDraftChange=\{\(value,event\)=>field\('workflow-ai-request',value,event\)\}/);
 assert.doesNotMatch(page,/<ConversationInput id="workflow-ai-request"/);
 assert.match(frame,/splitTargets=false,transcriptTarget=null,composerTarget=null/);
 assert.match(frame,/createPortal\(transcript,transcriptTarget\)/);
 assert.match(frame,/createPortal\(composer,composerTarget\)/);
 assert.match(frame,/onCompositionStart=/);
 assert.match(frame,/!event\.shiftKey/);
 assert.match(css,/\.workflow-composer \.od-conversation-composer/);
 for(const source of [page,frame])
  assert.ok((await transform(source,{loader:'tsx',jsx:'transform',target:'es2022'})).code.length>1000);
});
