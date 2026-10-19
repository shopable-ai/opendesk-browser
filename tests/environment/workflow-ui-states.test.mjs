import {renderSidebarFixture,loadSidebarReact} from '../helpers/sidebar-react-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script} from 'node:vm';
import {load} from 'cheerio';
import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {parseHTML} from 'linkedom';
import {workflowFixture,tick} from './workflow-react-fixture.mjs';
import {deriveWorkflowViewState,WORKFLOW_VIEW_STATES} from '../../src/ui/workflow/view-state.js';

const file=path=>readFile(path,'utf8');
// Real controller initial state and actions, rendered by the production React
// tree. Service fakes belong to workflowFixture; this creates no legacy nodes.
async function workflowDOM({settings=false,...options}={}) {
  const fixture=await workflowFixture({steps:[],...options});
  try{
    if(settings){fixture.click('workflow-provider-toggle');await tick();}
    const html=await renderSidebarFixture({activeTab:'workflow',workflowController:fixture.view});
    return {html,$:load(html)};
  }finally{fixture.view.dispose();}
}

test('workflow UI phases are independently derived, not stored as execution authority',()=>{
  const scenarios=[
    [{},'ai-unconfigured'],
    [{providerReady:true},'empty'],
    [{phase:'planning',hasSteps:true},'planning'],
    [{proposal:true,hasSteps:true},'proposal'],
    [{hasSteps:true},'draft'],
    [{phase:'running',hasSteps:true},'running'],
    [{hasSteps:true,lastRun:'success'},'result'],
    [{hasSteps:true,lastRun:'failed'},'failed'],
    [{hasSteps:true,saved:true},'saved'],
    [{hasSteps:true,saved:true,error:true},'failed'],
    [{hasSteps:true,proposal:true,lastRun:'failed'},'proposal']
  ];
  assert.deepEqual([...new Set(scenarios.map(([,state])=>state))].sort(),[...WORKFLOW_VIEW_STATES].sort());
  for(const [input,expected] of scenarios)
    assert.equal(deriveWorkflowViewState(input),expected,JSON.stringify(input));
});

test('workflow default structure prioritizes AI conversation and hides advanced sections',async()=>{
  const [{html,$},css,view]=await Promise.all([
    workflowDOM(),file('src/ui/tool-shell.css'),file('src/ui/workflow/workflow-view.js')
  ]);
  const workflow=$('#workbench-workflow');
  assert.equal(workflow.length,1);
  assert.equal(workflow.prop('hidden'),false);
  const ids=workflow.find('[id]').map((_,node)=>$(node).attr('id')).get();
  assert.ok(ids.indexOf('workflow-chat-intro')<ids.indexOf('workflow-saved-list'));
  for(const id of ['workflow-plan-panel','workflow-params-panel','workflow-result-panel','workflow-manage-panel'])
    assert.equal(workflow.find('#'+id).prop('hidden'),true,id);
  assert.equal(workflow.find('#workflow-history-toggle').attr('aria-expanded'),'false');
  assert.equal(workflow.find('#workflow-provider-settings').length,1,'one settings owner inside the hidden modal');
  assert.equal(workflow.find('.workflow-sheet-overlay').prop('hidden'),true,'settings have no visible overlay');
  assert.ok(ids.indexOf('workflow-ai-request')<ids.indexOf('workflow-ai-key'),'composer precedes credentials');
  assert.match(workflow.find('#workflow-ai-request').attr('placeholder'),/任务/);
  const settings=await workflowDOM({settings:true});
  assert.equal(settings.$('#workflow-provider-settings').prop('open'),true);
  assert.ok(settings.$('#workflow-provider-settings').hasClass('od-disclosure--flat'));
  const draft=await workflowDOM({steps:[{stepId:'one',op:'observe'}]});
  assert.equal(draft.$('#workflow-plan-panel').prop('hidden'),false);
  assert.equal(draft.$('#workflow-steps details summary').length,1,'semantic steps have readable summaries');
  assert.doesNotMatch(draft.$('#workflow-steps').text(),/"stepId"|"paramsSchema"/);
  assert.match(css,/#workbench-workflow:not\(\[hidden\]\)\{display:flex;flex-direction:column/);
  assert.match(view,/deriveWorkflowViewState\(\{phase,proposal:false,hasSteps/);
  assert.doesNotMatch(view,/renderProposal\(/);
  assert.match(view,/prepareDirectExecution\(/);
  assert.match(view,/control\('workflow-chat-intro'\)\.hidden=/);
  assert.match(view,/lastRun=completed\?\.state===/);
  assert.doesNotMatch(view,/innerHTML\s*=|eval\(|new Function\(/);
});


test('no new privileged workflow executor, no default visible version manager',async()=>{
  const [html,view,contract]=await Promise.all([
    renderSidebarFixture(),
    file('src/ui/workflow/workflow-view.js'),
    file('src/framework/workflow/contract.js')
  ]);
  assert.match(html,/id="workflow-confirm-run"/);
  assert.match(view,/currentPageTarget\.revalidate\(captured\)/);
  assert.match(view,/host\.start\(\{source,params/);
  assert.match(view,/snapshotControllerRun\(\{runId:claim\.runId\}\)/);
  assert.match(view,/control\('workflow-manage-panel'\)\.hidden=true/);
  assert.match(contract,/跨 origin 跳转需独立授权协调器/);
  assert.doesNotMatch(view,/scripting\.executeScript|chrome\.tabs\.update\(/);
});

test('updated offline prototype covers ten user-visible states without claiming execution',async()=>{
  const html=await file('prototypes/sidebar/workflow-r15-stateful-preview.html');
  for(const word of [
    "['unconfigured','AI 未配置']","['empty','首次空白']",
    "['planning','规划中']","['proposal','建议待确认']",
    "['draft','编辑草稿']","['running','正在运行']",
    "['result','执行完成']","['failed','执行失败']",
    "['saved','已保存']","['history','历史管理']"
  ])assert.ok(html.includes(word),'missing prototype scenario '+word);
  assert.match(html,/UI_SIMULATION/);
  assert.match(html,/不发送 AI 请求、不执行网页、不保存数据/);
  assert.doesNotMatch(html,/<script[^>]*src=|<link[^>]*rel="stylesheet"/i);
  const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script,'self contained UI script');
  assert.doesNotThrow(()=>new Script(script),'offline prototype script must parse');
});


test('R15.3 compact workflow header and composer use meaningful icons without redundant metadata',async()=>{
  const [html,css,view]=await Promise.all([
    renderSidebarFixture(),file('src/ui/tool-shell.css'),file('src/ui/workflow/workflow-view.js')
  ]);
  const snippet=html.slice(html.indexOf('id="workbench-workflow"'),html.indexOf('id="workbench-develop"'));
  assert.ok(snippet.length>1000);
  for(const id of ['workflow-history-toggle','workflow-new','workflow-provider-toggle','workflow-ai-plan',
    'workflow-manage-close','workflow-refresh']){
    const button=snippet.match(new RegExp('<button[^>]*id="'+id+'"[^>]*>[\\s\\S]*?<\\/button>'))?.[0];
    assert.ok(button,'icon exists '+id);
    assert.match(button,/aria-label="[^"]+"/,'accessible name '+id);
    assert.match(button,/<svg[^>]*aria-hidden="true"/,'decorative svg '+id);
  }
  assert.doesNotMatch(snippet,/id="workflow-head-site"|id="workflow-provider-summary"/);
  assert.match(snippet,/id="workflow-saved-state"[^>]*hidden/);
  assert.match(snippet,/id="workflow-target-warning"[^>]*hidden/);
  assert.match(css,/#workspace-content \.workflow-icon-button,#workspace-content \.workflow-send-button\{width:44px;height:44px;min-width:44px;min-height:44px\}/);
  assert.match(css,/#workflow-provider-settings:not\(\[open\]\)\{display:none\}/);
  assert.doesNotMatch(view,/workflow-head-site|workflow-provider-summary/);
  assert.match(view,/warning.hidden=!mismatch/);
  assert.match(view,/saved:Boolean\(revision\)/);
  assert.match(view,/workflow-plan-panel'\)\.hidden=!hasSteps/);
  assert.match(view,/workflow-result-panel'\)\.hidden=!\['success','failed'\]\.includes\(lastRun\)/);
});

test('R15.3 standalone compact preview preserves all ten scenarios with icon keyboard labels',async()=>{
  const compact=await file('prototypes/sidebar/workflow-r15-compact-preview.html');
  assert.match(compact,/UI_SIMULATION/);
  assert.doesNotMatch(compact,/当前网页 · demo\.example|id="subtitle"|id="provider"/);
  for(const id of ['history','new','settings'])
    assert.match(compact,new RegExp('id="'+id+'"[^>]*aria-label="[^"]+"'));
  assert.match(compact,/event\.target\.closest\('button'\)\?\.id==='history'/);
  assert.match(compact,/不发送 AI 请求、不执行网页、不保存数据/);
  const inline=compact.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(inline);
  assert.doesNotThrow(()=>new Script(inline));
});


test('compact workflow keeps header actions accessible under 200 percent zoom',async()=>{
  const css=await file('src/ui/tool-shell.css');
  assert.match(css,/@media\(max-width:280px\)\{\s*\.workflow-head\{flex-wrap:wrap;row-gap:2px\}/);
  const html=await file('prototypes/sidebar/workflow-r15-compact-preview.html');
  assert.match(html,/\.visually-hidden\{position:absolute!important;/);
});


test('workflow R23.10 has three independent header actions and one React modal owner',async()=>{
  const [{html,$},view,css,root,component]=await Promise.all([
    workflowDOM({settings:true}),file('src/ui/workflow/workflow-view.js'),
    file('src/ui/tool-shell.css'),file('src/ui/react/main.tsx'),file('src/ui/react/tabs/workflow.tsx')
  ]);
  const header=$('#workflow-editor > .workflow-head');
  for(const id of ['workflow-history-toggle','workflow-ai-new-session','workflow-new']){
    assert.equal(header.find('#'+id).length,1,id);
    assert.ok(header.find('#'+id).attr('aria-label'));
  }
  assert.equal(header.find('#workflow-create-toggle,#workflow-create-menu').length,0);
  assert.equal($('#workflow-ai-resume').prop('hidden'),true,'unavailable Codex resume is hidden');
  assert.equal($('[role="dialog"][aria-modal="true"]').length,1);
  const settings=$('#workflow-provider-settings');
  assert.equal(settings.find('#workflow-provider-privacy > summary').text(),'数据与隐私');
  assert.equal(settings.find('#workflow-local-diagnostics > summary').text(),'连接诊断');
  assert.equal(settings.find('#workflow-local-connect').length,1);
  assert.equal(settings.find('#workflow-ai-new-session,#workflow-ai-resume').length,0);
  assert.equal($('[id$="-react-host"]').length,0,'no legacy portal anchors');
  assert.match(css,/\.workflow-sheet-content\{min-height:0;min-width:0;overflow-y:auto/);
  assert.match(root,/connectWorkflowPage\(controller\)/);
  assert.doesNotMatch(root,/createPortal\(\s*<Workflow/);
  assert.match(component,/doc\.addEventListener\('keydown',onKeydown,true\)/);
  assert.match(component,/editor\.inert=true/);
  assert.match(view,/state\.ready\?'Codex 已就绪':compact\[state\.state\]/);
  assert.match(view,/control\('workflow-local-status-detail'\)\.text=detail/);
  assert.match(view,/sessionState\.sessionId&&localCapability\.resumeSupported===false/);
  assert.match(view,/if\(describeLocalCodex\(localCapability\)\.ready\)closeAISettings\(true\)/);
  assert.doesNotMatch(view,/showCreateMenu\(/);
});


test('workflow model selector stays minimal without manual creation or custom approval',async()=>{
  const [{html,$},view]=await Promise.all([
    workflowDOM({settings:true}),file('src/ui/workflow/workflow-view.js')
  ]);
  const settings=$('#workflow-provider-settings');
  assert.equal(settings.find('#workflow-provider-scope').length,1);
  assert.equal(settings.find('#workflow-source-local').text(),'Codex');
  assert.equal(settings.find('#workflow-source-https').text(),'HTTPS');
  assert.deepEqual(settings.find('#workflow-https-protocol option').map((_,node)=>$(node).val()).get(),['custom_https','cloud_responses']);
  assert.equal($('#workflow-manual-start').length,0);
  assert.match(settings.text(),/模型推理可能联网/);
  assert.match(settings.text(),/可能保存在 Codex 本机对话中/);
  assert.match(settings.text(),/请勿填写 Codex 登录凭据|API Key（本次使用，不保存）/);
  assert.equal($('#workflow-ai-plan').attr('aria-label'),'发送并执行浏览器任务');
  assert.equal($('#workflow-ai-disclosure,[id^="workflow-ai-review-"],#workflow-ai-revoke').length,0);
  assert.doesNotMatch(settings.text(),/模型的数据发送许可|同意并生成|每次读取仍需确认/);
  assert.ok(settings.hasClass('od-disclosure--flat'));
  assert.doesNotMatch(html,/localCodexReady\s*=\s*true|模拟连接成功/);
  assert.match(view,/bind\('workflow-ai-plan','click',plan\)/);
  assert.match(view,/control\('workflow-provider-settings'\)\.open=true/);
  assert.doesNotMatch(view,/modelConsent|pendingModelReview|renderDataDisclosure/);
});


test('R5.2 unsaved workflow starts a non-modal explicit discard or cancel review',async()=>{
  const [html,view,css]=await Promise.all([
    renderSidebarFixture(),file('src/ui/workflow/workflow-view.js'),file('src/ui/tool-shell.css')]);
  for(const id of ['workflow-new-review','workflow-new-discard','workflow-new-cancel'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/id="workflow-new-review"[^>]*hidden/);
  assert.match(view,/newReviewSignature=workflowReviewSignature\(\)/);
  assert.match(view,/function commitNewWorkflow\(\)/);
  assert.match(view,/newReviewSignature!==workflowReviewSignature\(\)/);
  assert.match(view,/function dismissNewReview\(\)/);
  assert.match(css,/\.workflow-new-review\[hidden\]\{display:none!important\}/);
  assert.doesNotMatch(view,/(?:globalThis\.|window\.)?confirm\s*\(/);
});

test('later AI Send retains committed Controller revision for optimistic Save',async()=>{
  const view=await file('src/ui/workflow/workflow-view.js');
  assert.match(view,/const previous=revision\?\.workflow\?\.workflowId===freeze\.workflow\.workflowId\?revision\.revision:0/);
  assert.match(view,/workflow=structuredClone\(result\);touched=true;lastTrustedRun=null/);
  assert.doesNotMatch(view,/workflow=structuredClone\(result\);touched=true;revision=null/);
});


test('R23.11 installed Workflow preserves real host while React owns concise history and model label',async()=>{
  const [{html,$},css,view,root,component]=await Promise.all([
    workflowDOM({settings:true}),file('src/ui/tool-shell.css'),
    file('src/ui/workflow/workflow-view.js'),file('src/ui/react/main.tsx'),file('src/ui/react/tabs/workflow.tsx')
  ]);
  for(const id of ['workflow-history-panel','workflow-source-name','workflow-edit-details',
    'workflow-source-local','workflow-source-https','workflow-https-protocol','workflow-history-toggle','workflow-ai-request'])
    assert.equal($('#'+id).length,1,id+' owned by React');
  assert.equal($('#workflow-history-panel').prop('hidden'),true);
  assert.equal($('#workflow-ai-model').attr('placeholder'),'输入模型 ID');
  assert.notEqual($('#workflow-ai-model').val(),'gpt-4o-mini');
  assert.equal($('#workflow-ai-provider').length,0,'provider value is controller state, not a hidden native select');
  assert.match(component,/export function WorkflowHistory/);
  assert.match(component,/export function WorkflowSourceName/);
  assert.match(component,/onOpenSavedHistory/);
  const resume=component.match(/id="workflow-history-resume"[\s\S]*?<\/button>/)?.[0];
  assert.ok(resume);
  assert.match(resume,/disabled=\{Boolean\(model\.busy\)\}/);
  assert.match(view,/const onResumeSessionClick=event=>\{\s*if\(!event\.isTrusted\|\|busy\|\|/);
  assert.doesNotMatch(root,/createPortal\(\s*<Workflow(?:History|SourceName)/);
  assert.match(view,/selected==='local_codex'\?'Codex'/);
  assert.match(view,/control\('workflow-ai-model'\)\.value\.trim\(\)/);
  assert.match(view,/saveList\.map\(item=>/);
  assert.match(view,/const saved=await host\.controller\.getControllerScript/);
  assert.match(view,/if\(saved\?\.contentHash!==compile\.sourceHash/);
  assert.match(view,/observationApproval=null;persistObservationApproval\(\)/);
  assert.match(view,/control\('workflow-ai-request'\)\.value\.trim\(\)/);
  assert.match(view,/if\(host\.executionPending\|\|host\.currentRun\)/);
  assert.match(view,/control\('workflow-saved-list'\)\.value=key/);
  assert.doesNotMatch(view,/dispatchEvent\(/);
  assert.match(css,/\.workflow-history-panel\[hidden\]\{display:none!important\}/);
  assert.match(css,/\.workflow-source-name\{/);
  assert.doesNotMatch(component,/(?:createRoot\(|fetch\(|createWorkflowProviderFacade\()/);
});


test('R23.14 Codex connection is one-row action with full diagnostics, not a fake switch',async()=>{
  const [{$},css,view]=await Promise.all([
    workflowDOM({settings:true}),file('src/ui/tool-shell.css'),file('src/ui/workflow/workflow-view.js')
  ]);
  const settings=$('#workflow-provider-settings'),line=settings.find('.workflow-connection-line');
  assert.equal(line.length,1);
  assert.equal(line.find('#workflow-local-connect').text(),'连接');
  assert.equal(line.find('#workflow-local-status').length,1);
  assert.equal(line.find('[role="switch"],[aria-checked]').length,0);
  assert.equal(settings.find('#workflow-local-status-detail').length,1);
  assert.equal(settings.find('#workflow-local-connected').length,1);
  assert.equal(settings.find('#workflow-provider-privacy').prev().attr('id'),'workflow-custom-settings');
  assert.match(css,/grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(view,/control\('workflow-local-status-detail'\)\.text=detail/);
  assert.match(view,/control\('workflow-local-connected'\)\.hidden=!connected/);
  assert.match(view,/connect\.hidden=localChecking\|\|connected\|\|state\.ready/);
});


test('R37 Workflow renders controller actions and releases subscriptions/modal effects on unmount',async t=>{
  const f=await workflowFixture({steps:[]});
  const {SidebarAppShell,createDeveloperView,createMyWorkbenchView,createSidebarToolsView}=await loadSidebarReact();
  const views=[createDeveloperView(),createMyWorkbenchView(),createSidebarToolsView()];
  const {window,document}=parseHTML('<html><body><div id="root"></div></body></html>');
  const previous=new Map(['window','document','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value] of Object.entries({window,document,IS_REACT_ACT_ENVIRONMENT:true}))
    Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  let subscriptions=0,unmounted=false;
  const keys=new Set(),add=document.addEventListener.bind(document),remove=document.removeEventListener.bind(document);
  document.addEventListener=(type,listener,...rest)=>{if(type==='keydown')keys.add(listener);return add(type,listener,...rest);};
  document.removeEventListener=(type,listener,...rest)=>{if(type==='keydown')keys.delete(listener);return remove(type,listener,...rest);};
  const controller={...f.view,subscribe(listener){subscriptions++;const off=f.view.subscribe(listener);return ()=>{subscriptions--;off();};}};
  const root=createRoot(document.getElementById('root'));
  const unmount=async()=>{if(!unmounted){await React.act(async()=>root.unmount());unmounted=true;}};
  t.after(async()=>{
    await unmount();f.view.dispose();for(const view of views)view.dispose?.();
    for(const [key,value] of previous){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
  });
  const get=id=>document.getElementById(id);
  const click=async(id,trusted=false)=>React.act(async()=>{
    const event=new window.Event('click',{bubbles:true});
    if(trusted)Object.defineProperty(event,'isTrusted',{value:true});
    get(id).dispatchEvent(event);await tick();
  });
  await React.act(async()=>root.render(React.createElement(SidebarAppShell,{
    activeTab:'workflow',workflowController:controller,developerView:views[0],myView:views[1],toolView:views[2]})));
  assert.equal(subscriptions,1);
  const baselineKeys=new Set(keys);
  assert.equal(get('workbench-workflow').hidden,false);
  assert.equal(get('workflow-provider-toggle').getAttribute('aria-expanded'),'false');
  await click('workflow-provider-toggle');
  assert.equal(f.state().controls['workflow-provider-settings'].open,false,'untrusted DOM click cannot open settings');
  await click('workflow-provider-toggle',true);
  assert.equal(f.state().controls['workflow-provider-settings'].open,true);
  assert.equal(document.querySelector('.workflow-sheet-overlay').hidden,false);
  const editor=get('workflow-editor');
  assert.equal(editor.inert,true);
  assert.equal(keys.size,baselineKeys.size+1,'one additional modal keyboard owner');
  const modalKey=[...keys].find(listener=>!baselineKeys.has(listener));
  await React.act(async()=>{
    const event=new window.Event('keydown',{bubbles:true});Object.defineProperty(event,'key',{value:'Escape'});
    document.dispatchEvent(event);await tick();
  });
  assert.equal(f.state().controls['workflow-provider-settings'].open,false);
  assert.equal(document.querySelector('.workflow-sheet-overlay').hidden,true);
  assert.equal(Boolean(editor.inert),false);
  assert.equal(keys.has(modalKey),false,'modal listener is released');
  const example=document.querySelector('[data-workflow-example="read"]');
  await React.act(async()=>{
    const event=new window.Event('click',{bubbles:true});Object.defineProperty(event,'isTrusted',{value:true});
    example.dispatchEvent(event);await tick();
  });
  assert.match(f.state().controls['workflow-ai-request'].value,/只读提取/);
  assert.equal(get('workflow-ai-request').value,f.state().controls['workflow-ai-request'].value);
  assert.equal(f.starts.length,0,'choosing an example never executes');
  assert.equal(f.requests.length,0,'choosing an example never requests permissions');
  await click('workflow-provider-toggle',true);
  assert.equal(editor.inert,true);
  await unmount();
  assert.equal(subscriptions,0);
  assert.equal(keys.has(modalKey),false,'modal listener is released');
  assert.equal(Boolean(editor.inert),false,'unmount restores editor interaction');
  assert.equal(get('root').childNodes.length,0);
  f.view.actions.chooseExample('fill',f.event('workflow-ai-request'));
  await tick();
  assert.equal(get('root').childNodes.length,0,'late controller updates cannot recreate DOM');
});
