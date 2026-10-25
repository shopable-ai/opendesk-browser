import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inferHttpsSource,httpsSourceConfigurationError} from '../../src/ui/ai/provider-https-source.js';
import {load} from 'cheerio';
import {renderSidebarReact} from '../../scripts/preview/react-sidebar-ssr.mjs';
import {createWorkflowUIState} from '../../src/ui/workflow/workflow-ui-state.js';
import {appendWorkflowSuggestionDraft} from '../../src/ui/conversation/draft-suggestion.js';
import {createPreviewProviderSettings,createPreviewMyAgent} from
  '../../src/ui/react/preview/shared-ai-preview.js';
import {workflowFixture,tick} from './workflow-react-fixture.mjs';

test('R2.3 real SidebarAppShell puts one Tasks AI Dock after scrolling workspace and before Run/Stop',async()=>{
 const preview=createPreviewMyAgent();
 preview.toggle();preview.setDraft('原有草稿');
 const $=load(await renderSidebarReact({activeTab:'tasks',myAgent:preview}));
 assert.equal($('#workbench-tasks #my-agent-panel').length,0,'AI cannot appear above tasks');
 assert.equal($('.my-agent-dock #my-agent-panel').length,1,'only one trusted Tasks Chat');
 assert.equal($('#workspace-content').nextAll('.my-agent-dock').length,1);
 assert.equal($('.my-agent-dock').nextAll('#workspace-dock').length,1);
 assert.equal($('#my-agent-input').attr('value')??$('#my-agent-input').text(),'原有草稿');
 assert.equal($('.my-agent-welcome, .my-agent-examples, .my-agent-secondary').length,0,
   'Tasks AI shows no default suggestion panel or redundant heading');
 assert.equal($('#workspace-dock #task-run').length,0,'idle footer must not contain ordinary Run');
 assert.equal($('#workbench-tasks #task-run').length,1,'same Run control lives inside selected workspace');
 assert.equal($('#workspace-dock #task-stop').length,1,'owner Stop stays in global dock');
 assert.equal($('.my-agent-dock .od-conversation-empty').text(),'想自动化什么？');
 preview.toggle();
 assert.equal(preview.getSnapshot().draft,'原有草稿','collapse never clears draft');
 preview.toggle();
 assert.equal(preview.getSnapshot().draft,'原有草稿','reopen preserves session state');
 preview.dispose();
});

test('R2.3 Workflow SSR has one icon Source entry, one shared composer target and no duplicate label',async()=>{
 const settings=createPreviewProviderSettings();
 settings.updateSettings({source:'cloud_responses',
  endpoint:'https://api.openai.com/v1/responses',model:'test-model',
  apiKey:'session-only-preview'});
 const $=load(await renderSidebarReact({activeTab:'workflow',providerSettings:settings}));
 assert.equal($('#workflow-provider-toggle[aria-haspopup="menu"]').length,1);
 assert.match($('#workflow-provider-toggle').attr('aria-label')||'',/HTTPS 模型/);
 assert.equal($('#workflow-source-name').length,0);
 assert.equal($('.workflow-composer-frame').length,1,'existing shared React Portal target');
 assert.equal($('#workflow-provider-settings').length,0,'legacy standalone settings not mounted in ToolShell');
 assert.equal($('.workflow-scroll').length,1,'the existing scroll container remains');
 assert.equal($('.workflow-chat-intro, .workflow-intro-suggestions').length,0,
   'Workflow no longer shows a default welcome or suggestion card');
 assert.equal($('#workspace-dock').length,1,'original Run Dock untouched');
 settings.dispose();
});

test('R2.3 shared provider settings use two native radio choices in a compact segmented group',async()=>{
 const [sheet,css,workflow]=await Promise.all([
  readFile(new URL('../../src/ui/react/components/provider-settings.tsx',import.meta.url),'utf8'),
  readFile(new URL('../../src/ui/react/components/conversation-dock.css',import.meta.url),'utf8'),
  readFile(new URL('../../src/ui/react/tabs/workflow.tsx',import.meta.url),'utf8')
 ]);
 const choices=[...sheet.matchAll(/name="od-ai-provider-source" value="([^"]+)"/g)].map(match=>match[1]);
 assert.deepEqual(choices,['local_codex','https'],'protocols are not peer-level sources');
 assert.match(workflow,/https:'HTTPS 模型'/);
 assert.doesNotMatch(workflow,/https:'HTTPS Chat Completions'/);
 assert.match(sheet,/className="od-shared-provider-segments" role="radiogroup"/);
 assert.match(sheet,/aria-labelledby="od-ai-provider-source-label"/);
 assert.match(sheet,/querySelector\('input\[name="od-ai-provider-source"\]:checked'\)/);
 assert.match(css,/\.od-shared-provider-segment input\[type=radio\]\{/);
 assert.match(css,/\.od-shared-provider-segment input:checked\+span/);
 assert.match(css,/\.od-shared-provider-segment input:focus-visible\+span/);
 assert.match(css,/\.od-shared-provider-form input\[type=checkbox\]\{/);
 assert.match(css,/@media\(pointer:coarse\)\{\.od-shared-provider-segment span\{min-height:44px\}\}/);
 assert.match(sheet,/providerSettings\.updateSettings\(patch\)/);
 assert.match(sheet,/className="od-shared-provider-scroll"/);
 assert.match(sheet,/className="od-shared-provider-actions"/);
 assert.match(sheet,/className="od-shared-provider-input-action"/);
 assert.match(sheet,/aria-label="清空接口地址"/);
 assert.match(sheet,/keyVisible\?'text':'password'/);
 assert.match(sheet,/setKeyVisible\(false\)/);
 assert.match(sheet,/onSubmit=\{save\} autoComplete="off" noValidate/,
  'HTTPS errors must be reported by trusted form validation, not silent browser blocking');
 assert.doesNotMatch(sheet,/Codex 已就绪/,'do not invent Native connection readiness');
 assert.match(css,/\.od-shared-provider-form \.od-shared-provider-segments\{width:100%;max-width:none/);
 assert.match(css,/\.od-shared-provider-sheet>\.od-shared-provider-content\{display:flex;flex-direction:column/);
 assert.match(css,/\.od-shared-provider-scroll\{display:flex;flex:1 1 auto;min-height:0/);
 assert.match(css,/\.od-shared-provider-form \.od-shared-provider-actions\{display:flex;align-items:center/);
 assert.match(css,/\.od-shared-provider-input-action input\.od-field\{flex:1 1 auto/);
 assert.match(sheet,/onOpenNativeSettings\(\)/,'Native settings continue through existing trusted callback');

 assert.match(sheet,/savedSource\|\|inferredSource/,'unchanged configured protocol wins over a URL hint');
 assert.match(sheet,/selectedHttpsSource/);
 assert.match(sheet,/option value="custom_https"/);
 assert.match(sheet,/option value="cloud_responses"/);
 assert.match(sheet,/if\(external&&clearKey\)patch\.apiKey=''/);
});

test('R2.3 infer known HTTPS protocol paths only; unknown custom paths require explicit selection',()=>{
 assert.equal(inferHttpsSource('https://api.openai.com/v1/responses'),'cloud_responses');
 assert.equal(inferHttpsSource('https://api.openai.com/v1/chat/completions'),'custom_https');
 assert.equal(inferHttpsSource('https://api.example.com/custom/v2/responses/?feature=1'),'cloud_responses');
 assert.equal(inferHttpsSource('https://api.example.com/proxy/v1/chat/completions'),'custom_https');
 for(const endpoint of ['https://api.example.com/custom/plan','https://api.example.com/my-responses',
   'http://example.com/v1/responses','https://name:password@example.com/v1/responses','not-a-url']){
  assert.equal(inferHttpsSource(endpoint),null,endpoint);
 }
});

test('settings reject unsupported Responses paths before saving without rejecting legacy Chat Completions gateways',()=>{
 assert.equal(httpsSourceConfigurationError('cloud_responses','https://api.example.test/v1/responses'),'');
 for(const endpoint of ['https://api.example.test/proxy/v1/responses',
  'https://api.example.test/v1/responses/','https://api.example.test/v1/responses?feature=1',
  'https://api.example.test/custom/plan'])
  assert.match(httpsSourceConfigurationError('cloud_responses',endpoint),/仅支持 \/v1\/responses/);
 assert.equal(httpsSourceConfigurationError('custom_https','https://api.example.test/custom/plan?feature=1'),'');
 for(const endpoint of ['https://api.example.test/v1/responses',
  'https://api.example.test/v1/responses?feature=1'])
  assert.match(httpsSourceConfigurationError('custom_https',endpoint),/不能使用 Chat Completions/);
 for(const endpoint of ['http://api.example.test/v1/chat/completions',
  'https://user:secret@api.example.test/v1/chat/completions','https://api.example.test/v1/chat/completions#fragment'])
  assert.match(httpsSourceConfigurationError('custom_https',endpoint),/有效的 HTTPS/);
});

test('R2.3 suggestion draft is append-only, deduplicated, IME-neutral, length bounded and never a Send',()=>{
 const instruction='填写目标页面并读回';
 assert.deepEqual(appendWorkflowSuggestionDraft('',instruction),
  {value:instruction,kind:'filled'});
 assert.deepEqual(appendWorkflowSuggestionDraft('先检查标题',instruction),
  {value:'先检查标题\n\n'+instruction,kind:'appended'});
 assert.deepEqual(appendWorkflowSuggestionDraft('先检查标题\n\n'+instruction,instruction),
  {value:'先检查标题\n\n'+instruction,kind:'duplicate'});
 assert.deepEqual(appendWorkflowSuggestionDraft('请在段落中引用'+instruction+'这些文字',instruction),
  {value:'请在段落中引用'+instruction+'这些文字\n\n'+instruction,kind:'appended'});
 assert.deepEqual(appendWorkflowSuggestionDraft('x'.repeat(3998),instruction),
  {value:'x'.repeat(3998),kind:'too_long'});
});

test('Workflow controlled input publishes in the input event while other projection updates stay batched',async()=>{
 const ui=createWorkflowUIState();let seen=[];
 const unsubscribe=ui.subscribe(()=>seen.push(ui.getSnapshot().controls['workflow-ai-request'].value));
 try{
  ui.control('workflow-ai-request').value='中文输入';
  assert.deepEqual(seen,['中文输入'],'React must receive the new value before native input returns');
  ui.control('workflow-ai-title').text='标题更新';
  assert.equal(seen.length,1,'unrelated layout updates keep existing batching');
  await tick();
  assert.equal(ui.getSnapshot().controls['workflow-ai-title'].text,'标题更新');
 }finally{unsubscribe();ui.dispose();}
});

test('R2.3 real Workflow consumer choice appends without replacing or launching RunHost',async t=>{
 const f=await workflowFixture();t.after(()=>f.view.dispose());
 f.input('workflow-ai-request','先报告任务情况');
 let nativeEdits=0;
 const first=f.view.actions.chooseExample('fill',{isTrusted:true},outcome=>{
  assert.equal(f.state().controls['workflow-ai-request'].value,'先报告任务情况',
   'native edit happens before a controlled snapshot can replace DOM value');
  nativeEdits++;
  f.input('workflow-ai-request',outcome.value);
 });
 assert.equal(first.kind,'appended');
 assert.equal(nativeEdits,1);
 // Feedback/focus is still batched; the input value is already current.
 await tick();
 const draft=f.state().controls['workflow-ai-request'].value;
 assert.ok(draft.startsWith('先报告任务情况\n\n'));
 assert.match(draft,/读取输入框实际值/);
 assert.equal(f.starts.length,0);
 const second=f.view.actions.chooseExample('fill',{isTrusted:true});
 assert.equal(second.kind,'duplicate');
 await tick();
 assert.equal(f.state().controls['workflow-ai-request'].value,draft);
 assert.equal(f.starts.length,0,'choosing suggestions must not trigger RunHost');
 f.input('workflow-ai-request','x'.repeat(3998));
 const tooLong=f.view.actions.chooseExample('read',{isTrusted:true});
 assert.equal(tooLong.kind,'too_long');
 await tick();
 assert.equal(f.state().controls['workflow-ai-request'].value.length,3998);
 await tick();
 assert.equal(f.starts.length,0);
});

test('late Workflow example callback cannot edit a disposed shared composer',async()=>{
 const f=await workflowFixture();
 f.input('workflow-ai-request','保留关闭前的草稿');
 await tick();
 const draft=f.state().controls['workflow-ai-request'].value;
 let nativeEdits=0;
 f.view.dispose();
 assert.equal(f.view.actions.chooseExample('fill',{isTrusted:true},()=>{nativeEdits++;}),undefined);
 assert.equal(nativeEdits,0,'unmounted callbacks must not edit the native input');
 assert.equal(f.state().controls['workflow-ai-request'].value,draft);
 assert.equal(f.starts.length,0);
});

test('R2.3 workflow public React snapshot never contains the old standalone API key',async()=>{
 const state=createWorkflowUIState();
 state.control('workflow-ai-key').value='credential-must-stay-private';
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(state.control('workflow-ai-key').value,'credential-must-stay-private',
  'legacy standalone View retains original in-memory contract');
 assert.equal(state.getSnapshot().controls['workflow-ai-key'].value,'');
 state.control('workflow-ai-request').value='normal-text';
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(state.getSnapshot().controls['workflow-ai-request'].value,'normal-text',
  'all nonsecret input values remain plain strings');
 assert.doesNotMatch(JSON.stringify(state.getSnapshot()),/credential-must-stay-private/);
 state.dispose();
});

test('R2.3 offline preview Settings mirrors only a public key presence flag and keeps generation',()=>{
 const preview=createPreviewProviderSettings(),initial=preview.settingsSnapshot();
 let observed=0;const un=preview.subscribeSettings(()=>{observed++;});
 preview.updateSettings({source:'custom_https',endpoint:'https://api.example.test/v1/chat/completions',
  model:'preview-only',apiKey:'not-stored-credential'});
 const after=preview.settingsSnapshot();
 assert.equal(after.hasApiKey,true);
 assert.equal(after.source,'custom_https');
 assert.equal(after.generation,initial.generation+1);
 assert.equal(observed,1);
 assert.doesNotMatch(JSON.stringify(after),/not-stored-credential/);
 un();preview.dispose();
});
