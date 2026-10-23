import test from 'node:test';
import assert from 'node:assert/strict';
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
 assert.equal($('#workspace-dock #task-run').length,1,'original Task Run Dock remains');
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
 assert.match($('#workflow-provider-toggle').attr('aria-label')||'',/HTTPS Responses/);
 assert.equal($('#workflow-source-name').length,0);
 assert.equal($('.workflow-composer-frame').length,1,'existing shared React Portal target');
 assert.equal($('#workflow-provider-settings').length,0,'legacy standalone settings not mounted in ToolShell');
 assert.equal($('.workflow-scroll').length,1,'the existing scroll container remains');
 assert.equal($('#workspace-dock').length,1,'original Run Dock untouched');
 settings.dispose();
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

test('R2.3 real Workflow consumer choice appends without replacing or launching RunHost',async t=>{
 const f=await workflowFixture();t.after(()=>f.view.dispose());
 f.input('workflow-ai-request','先报告任务情况');
 const first=f.view.actions.chooseExample('fill',{isTrusted:true});
 assert.equal(first.kind,'appended');
 const draft=f.state().controls['workflow-ai-request'].value;
 assert.ok(draft.startsWith('先报告任务情况\n\n'));
 assert.match(draft,/读取输入框实际值/);
 assert.equal(f.starts.length,0);
 const second=f.view.actions.chooseExample('fill',{isTrusted:true});
 assert.equal(second.kind,'duplicate');
 assert.equal(f.state().controls['workflow-ai-request'].value,draft);
 assert.equal(f.starts.length,0,'choosing suggestions must not trigger RunHost');
 f.input('workflow-ai-request','x'.repeat(3998));
 const tooLong=f.view.actions.chooseExample('read',{isTrusted:true});
 assert.equal(tooLong.kind,'too_long');
 assert.equal(f.state().controls['workflow-ai-request'].value.length,3998);
 await tick();
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
