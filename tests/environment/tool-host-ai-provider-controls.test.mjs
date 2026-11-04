import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {mountWorkflowClient} from './workflow-mounted-ui.mjs';
import {tick} from './workflow-react-fixture.mjs';

test('trusted conversation keeps one AI header action and opens settings from the shared Dock',async t=>{
  const f=await mountWorkflowClient({activeTab:'tools'});
  const mount=f.document.createElement('div'),header=f.document.createElement('span');
  f.document.body.append(mount,header);
  const root=createRoot(mount);
  t.after(async()=>{await React.act(async()=>{root.unmount();await tick();});await f.close();});
  let opened=0,requests=0;
  const controller={readSession:()=>({}),saveSession:()=>{},request:()=>{requests++;}};
  await React.act(async()=>{root.render(React.createElement(f.TrustedConversationWorkspace,{
    controller,headerTarget:header,renderBusiness:()=>React.createElement('div',null,'书签业务'),
    onOpenSettings:()=>opened++
  }));await tick();});
  assert.equal(f.document.getElementById('sidebar-tool-conversation-provider-toggle'),null);
  await f.clickNode(header.querySelector('[aria-label="AI 对话"]'));
  assert.equal(header.querySelectorAll('button').length,1);
  assert.equal(header.querySelector('[aria-label="AI 设置"]'),null);
  const input=mount.querySelector('textarea');
  const before=f.providerSettings.settingsSnapshot();
  await f.clickNode(mount.querySelector('[aria-label="AI 设置"]'));
  assert.equal(opened,1,'the shared Dock owns the settings entry');
  assert.strictEqual(f.providerSettings.settingsSnapshot(),before);
  assert.equal(f.providerSettings.settingsSnapshot().source,'local_codex');
  await f.clickNode(header.querySelector('[aria-label="AI 对话"]'));
  assert.equal(f.document.getElementById('sidebar-tool-conversation-provider-toggle'),null);
  await f.clickNode(header.querySelector('[aria-label="AI 对话"]'));
  assert.equal(mount.querySelector('textarea'),input,'collapse preserves the conversation subtree');
  assert.equal(requests,0,'opening Chat/settings and collapsing never starts inference');
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

test('ToolHost keeps the original AI button without a source selector or duplicate settings entry',async t=>{
  const f=await mountWorkflowClient({activeTab:'tools'});
  t.after(()=>f.close());
  const get=id=>f.document.getElementById(id);
  const patch=async(id,values)=>React.act(async()=>{f.toolView.patch(id,values);await tick();});
  const toggle='sidebar-tool-conversation-toggle';
  const before=f.providerSettings.settingsSnapshot();
  const header=()=>get(toggle).closest('.sidebar-tool-view-head');
  const checkHeader=()=>{
    assert.equal(header().querySelector('[aria-label="AI 来源与设置"]'),null);
    assert.equal(header().querySelector('[aria-label="AI 设置"]'),null);
    assert.equal(get('sidebar-tool-conversation-provider-toggle'),null);
    assert.equal(get('sidebar-tool-conversation-source-menu'),null);
    assert.equal(get('sidebar-tool-conversation-settings'),null);
    assert.strictEqual(f.providerSettings.settingsSnapshot(),before);
  };
  await patch('sidebar-tool-display',{hidden:false});
  await patch(toggle,{hidden:false,attributes:{'aria-expanded':'false'}});
  checkHeader();
  await patch(toggle,{attributes:{'aria-expanded':'true'}});
  checkHeader();
  assert.ok(get('workflow-provider-toggle'),'Workflow retains its original independent ID');
  await patch(toggle,{attributes:{'aria-expanded':'false'}});
  checkHeader();
  await patch(toggle,{hidden:true,attributes:{'aria-expanded':'true'}});
  checkHeader();
  await patch(toggle,{hidden:false});
  checkHeader();
  await patch('sidebar-tool-display',{hidden:true});
  checkHeader();
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
