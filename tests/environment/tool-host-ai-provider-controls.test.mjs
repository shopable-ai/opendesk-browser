import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {mountWorkflowClient} from './workflow-mounted-ui.mjs';
import {tick} from './workflow-react-fixture.mjs';

test('trusted conversation exposes the shared source selector only while open',async t=>{
  const f=await mountWorkflowClient({activeTab:'tools'});
  const mount=f.document.createElement('div'),header=f.document.createElement('span');
  f.document.body.append(mount,header);
  const root=createRoot(mount);
  t.after(async()=>{await React.act(async()=>{root.unmount();await tick();});await f.close();});
  const controller={readSession:()=>({}),saveSession:()=>{},request:()=>{}};
  let opened=0;
  await React.act(async()=>{root.render(React.createElement(f.TrustedConversationWorkspace,{
    controller,headerTarget:header,renderBusiness:()=>React.createElement('div',null,'书签业务'),
    renderHeaderControls:focusComposer=>React.createElement(f.ToolConversationProviderControls,{
      providerSettings:f.providerSettings,onOpenSettings:()=>opened++,focusComposer})
  }));await tick();});
  assert.equal(f.document.getElementById('sidebar-tool-conversation-provider-toggle'),null);
  await f.clickNode(header.querySelector('[aria-label="AI 对话"]'));
  const picker=f.document.getElementById('sidebar-tool-conversation-provider-toggle');
  assert.ok(picker,'open trusted conversation offers the same source selector as sandbox');
  await f.clickNode(picker);
  await f.click('sidebar-tool-conversation-source-option-https');
  assert.equal(opened,1,'unconfigured HTTPS opens shared settings without changing provider');
  assert.equal(f.providerSettings.settingsSnapshot().source,'local_codex');
  await f.clickNode(header.querySelector('[aria-label="AI 对话"]'));
  assert.equal(f.document.getElementById('sidebar-tool-conversation-provider-toggle'),null);
});

test('shared settings cancel discards the unsaved source and reopening reads the saved configuration',async t=>{
  const f=await mountWorkflowClient();
  t.after(()=>f.close());
  const source=value=>f.document.querySelector(`input[name="od-ai-provider-source"][value="${value}"]`);
  const cancel=()=>[...f.document.querySelectorAll('.od-shared-provider-form button')]
    .find(node=>node.textContent==='取消');
  const before=f.providerSettings.settingsSnapshot();
  await f.openSettings();
  await f.clickNode(source('https'));
  assert.ok(f.document.getElementById('od-ai-provider-endpoint'),'the unsaved form actually changed');
  assert.strictEqual(f.providerSettings.settingsSnapshot(),before);
  await f.clickNode(cancel());
  assert.equal(f.document.querySelector('.od-shared-provider-form'),null);
  assert.strictEqual(f.providerSettings.settingsSnapshot(),before,'cancel never saves a Provider draft');
  await f.openSettings();
  assert.equal(source('local_codex').checked,true);
  assert.equal(f.document.getElementById('od-ai-provider-endpoint'),null);
  await f.keydown('Escape');

  await React.act(async()=>{
    f.providerSettings.updateSettings({source:'cloud_responses',
      endpoint:'https://model.example/v1/responses',model:'saved-model'});
    await tick();
  });
  const saved=f.providerSettings.settingsSnapshot();
  await f.openSettings();
  await f.clickNode(source('local_codex'));
  await f.clickNode(cancel());
  assert.strictEqual(f.providerSettings.settingsSnapshot(),saved);
  await f.openSettings();
  assert.equal(source('https').checked,true);
  assert.equal(f.document.getElementById('od-ai-provider-endpoint').value,saved.endpoint);
  assert.equal(f.document.getElementById('od-ai-provider-model').value,saved.model);
});

test('ToolHost offers trusted shared AI controls only for a visible, open sandbox conversation',async t=>{
  const f=await mountWorkflowClient({activeTab:'tools'});
  t.after(()=>f.close());
  const get=id=>f.document.getElementById(id);
  const patch=async(id,values)=>React.act(async()=>{f.toolView.patch(id,values);await tick();});
  const toggle='sidebar-tool-conversation-toggle';
  const picker='sidebar-tool-conversation-provider-toggle';
  const settings='sidebar-tool-conversation-settings';
  const menu='sidebar-tool-conversation-source-menu';
  assert.equal(get(picker),null);
  await patch('sidebar-tool-display',{hidden:false});
  await patch(toggle,{hidden:false,attributes:{'aria-expanded':'false'}});
  assert.equal(get(picker),null,'closed conversation has no provider chrome');
  await patch(toggle,{attributes:{'aria-expanded':'true'}});
  assert.ok(get(picker));
  assert.ok(get('workflow-provider-toggle'),'Workflow retains its original independent ID');
  const ids=[...f.document.querySelectorAll('[id]')].map(node=>node.id);
  assert.equal(ids.filter(id=>id===picker).length,1);
  assert.match(get(picker).parentNode.parentNode.querySelector('span').getAttribute('title'),/本机 Codex · 模型由本机配置/);
  assert.equal(get(settings),null,'AI settings gear belongs to the sandbox Dock, never beside uninstall');
  assert.equal(get(picker).closest('.sidebar-tool-view-head').querySelector('[aria-label="AI 设置"]'),null);

  await f.click(picker);
  assert.equal(get(picker).getAttribute('aria-controls'),menu);
  assert.equal(get(picker).getAttribute('aria-expanded'),'true');
  assert.equal(f.document.querySelectorAll('#'+menu).length,1);
  assert.equal(get(menu).style.bottom,'auto','header menu opens below its trigger');
  assert.equal(get(menu).style.left,'auto');
  assert.equal(get(menu).style.right,'0');
  assert.equal(get('workflow-source-menu'),null);
  const advanced=()=>get(menu).querySelector('[role="menuitem"]');
  await f.clickNode(advanced(),false);
  assert.equal(f.document.querySelector('.workflow-sheet-overlay [role="dialog"]'),null);
  await f.clickNode(advanced());
  assert.equal(f.document.querySelectorAll('.od-shared-provider-form').length,1);
  assert.equal(get(menu),null);
  await f.keydown('Escape');
  assert.equal(f.document.activeElement?.id,get(picker).id);

  await f.click(picker);
  const before=f.providerSettings.settingsSnapshot();
  await f.click('sidebar-tool-conversation-source-option-https',false);
  assert.strictEqual(f.providerSettings.settingsSnapshot(),before,'synthetic source changes are ignored');
  await f.click('sidebar-tool-conversation-source-option-https');
  assert.strictEqual(f.providerSettings.settingsSnapshot(),before,'unconfigured HTTPS opens settings without switching');
  assert.equal(f.document.querySelectorAll('.od-shared-provider-form').length,1);
  await f.keydown('Escape');
  await React.act(async()=>{
    f.providerSettings.updateSettings({endpoint:'https://model.example/v1/responses',
      model:'test-model',hasApiKey:true,httpsSource:'cloud_responses'});
    await tick();
  });
  const frame=f.document.createElement('iframe');
  get('sidebar-tool-frame').appendChild(frame);
  await f.click(picker);
  await f.click('sidebar-tool-conversation-source-option-https');
  assert.equal(f.providerSettings.settingsSnapshot().source,'cloud_responses');
  assert.match(get(picker).parentNode.parentNode.textContent,/HTTPS · test-model/);
  assert.ok(f.document.activeElement===frame,'Host focuses the sandbox boundary without accessing its DOM');
  assert.equal(get(menu),null);
  await f.click(picker);
  await f.click('sidebar-tool-conversation-source-option-local_codex');
  assert.equal(f.providerSettings.settingsSnapshot().source,'local_codex');
  assert.doesNotMatch(get(picker).parentNode.parentNode.textContent,/test-model/,
    'retained HTTPS configuration is not presented as the local model');
  await f.click(picker);
  await patch(toggle,{attributes:{'aria-expanded':'false'}});
  assert.equal(get(menu),null);
  assert.equal(get(settings),null);
  await patch(toggle,{hidden:true,attributes:{'aria-expanded':'true'}});
  assert.equal(get(picker),null,'a hidden toggle cannot expose settings even if expanded is stale');
  await patch(toggle,{hidden:false});
  assert.ok(get(picker));
  await patch('sidebar-tool-display',{hidden:true});
  assert.equal(get(picker),null,'closing the tool removes the controls');
});

test('Workflow keeps its default source IDs, advanced settings and composer focus',async t=>{
  const f=await mountWorkflowClient();
  t.after(()=>f.close());
  const get=id=>f.document.getElementById(id);
  await f.click('workflow-provider-toggle');
  assert.equal(get('workflow-provider-toggle').getAttribute('aria-controls'),'workflow-source-menu');
  assert.equal(get('sidebar-tool-conversation-source-menu'),null);
  await f.clickNode(get('workflow-source-menu').querySelector('[role="menuitem"]'));
  assert.equal(f.document.querySelectorAll('.od-shared-provider-form').length,1);
  await f.keydown('Escape');
  assert.equal(f.document.activeElement?.id,'workflow-provider-toggle');
  await React.act(async()=>{
    f.providerSettings.updateSettings({endpoint:'https://model.example/v1/chat/completions',
      model:'workflow-model',hasApiKey:true,httpsSource:'custom_https'});
    await tick();
  });
  await f.click('workflow-provider-toggle');
  await f.click('workflow-source-option-https');
  assert.equal(f.providerSettings.settingsSnapshot().source,'custom_https');
  assert.equal(f.document.activeElement?.id,'workflow-ai-request');
  assert.equal(get('workflow-source-menu'),null);
});
