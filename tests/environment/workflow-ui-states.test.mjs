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
import {mountWorkflowClient} from './workflow-mounted-ui.mjs';
import {deriveWorkflowViewState,WORKFLOW_VIEW_STATES} from '../../src/ui/workflow/view-state.js';

const file=path=>readFile(path,'utf8');
// Real controller initial state and actions, rendered by the production React
// tree. Service fakes belong to workflowFixture; this creates no legacy nodes.
async function workflowDOM({settings=false,...options}={}) {
  const mounted=await mountWorkflowClient(options);
  try {
    if(settings)await mounted.openSettings();
    const html=mounted.html();
    return {html,$:load(html)};
  }finally{await mounted.close();}
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

test('workflow default structure prioritizes the real shared composer and hides advanced sections',async()=>{
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
  assert.equal(workflow.find('#workflow-ai-request').length,1,'React portal must mount the composer');
  assert.equal(workflow.find('#workflow-ai-plan').attr('aria-label'),'发送');
  assert.equal(workflow.find('.od-conversation-composer').length,1);
  assert.equal(workflow.find('#workflow-provider-settings').length,0,
    'the old Workflow-specific Provider form is not a second settings owner');
  assert.equal($('.workflow-sheet-overlay').length,0,'closed settings do not mount a dialog');
  assert.match(workflow.find('#workflow-ai-request').attr('placeholder'),/描述要完成的操作/);
  const settings=await workflowDOM({settings:true});
  assert.equal(settings.$('.workflow-sheet-overlay [role="dialog"][aria-modal="true"]').length,1);
  assert.equal(settings.$('.od-shared-provider-form').length,1,'one shared Provider Settings form');
  const draft=await workflowDOM({steps:[{stepId:'one',op:'observe'}]});
  assert.equal(draft.$('#workflow-plan-panel').prop('hidden'),false);
  assert.equal(draft.$('#workflow-steps details summary').length,1,'semantic steps have readable summaries');
  assert.doesNotMatch(draft.$('#workflow-steps').text(),/"stepId"|"paramsSchema"/);
  assert.match(css,/#workbench-workflow:not\(\[hidden\]\)\{display:flex;flex-direction:column/);
  assert.match(view,/deriveWorkflowViewState\(\{phase,proposal:Boolean\(pendingAIReview\),hasSteps/);
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
  assert.doesNotMatch(html,/id="workflow-confirm-run"/);
  assert.match(html,/id="workflow-run-review"/);
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


test('compact Workflow and shared Send expose accessible icons without redundant metadata',async()=>{
  const [{html},css,view]=await Promise.all([
    workflowDOM(),file('src/ui/tool-shell.css'),file('src/ui/workflow/workflow-view.js')
  ]);
  const snippet=html.slice(html.indexOf('id="workbench-workflow"'),html.indexOf('id="workbench-develop"'));
  assert.ok(snippet.length>1000);
  for(const id of ['workflow-history-toggle','workflow-new','workflow-provider-toggle',
    'workflow-ai-plan','workflow-manage-close','workflow-refresh']){
    const button=snippet.match(new RegExp('<button[^>]*id="'+id+'"[^>]*>[\\s\\S]*?<\\/button>'))?.[0];
    assert.ok(button,'icon exists '+id);
    assert.match(button,/aria-label="[^"]+"/,'accessible name '+id);
    assert.match(button,/<svg[^>]*aria-hidden="true"/,'decorative svg '+id);
  }
  assert.doesNotMatch(snippet,/id="workflow-head-site"|id="workflow-provider-summary"/);
  assert.match(snippet,/id="workflow-saved-state"[^>]*hidden/);
  assert.match(snippet,/id="workflow-target-warning"[^>]*hidden/);
  assert.match(css,/#workspace-content \.workflow-icon-button,#workspace-content \.workflow-send-button\{width:44px;height:44px;min-width:44px;min-height:44px\}/);
  assert.match(css,/\.workflow-sheet-overlay/);
  assert.doesNotMatch(view,/workflow-head-site|workflow-provider-summary/);
  assert.match(view,/warning.hidden=!mismatch/);
  assert.match(view,/saved:Boolean\(revision\|\|selectedBundle\)/);
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


test('Workflow has three header actions and exactly one shared Provider modal owner',async()=>{
  const [{html,$},css,root,sheet]=await Promise.all([
    workflowDOM({settings:true}),file('src/ui/tool-shell.css'),
    file('src/ui/react/app-shell.tsx'),file('src/ui/react/components/provider-settings.tsx')
  ]);
  const header=$('#workflow-editor > .workflow-head');
  for(const id of ['workflow-history-toggle','workflow-ai-new-session','workflow-new']){
    assert.equal(header.find('#'+id).length,1,id);
    assert.ok(header.find('#'+id).attr('aria-label'));
  }
  assert.equal(header.find('#workflow-create-toggle,#workflow-create-menu').length,0);
  assert.equal($('#workflow-ai-resume').prop('hidden'),true);
  assert.equal($('.workflow-sheet-overlay [role="dialog"][aria-modal="true"]').length,1);
  assert.equal($('.od-shared-provider-form').length,1);
  assert.equal($('#workflow-provider-settings').length,0,'no legacy settings overlay beside shared modal');
  assert.equal($('[name="od-ai-provider-source"]').length,3);
  assert.equal($('[id$="-react-host"]').length,0,'no legacy portal anchors');
  assert.match(css,/\.workflow-sheet-content\{min-height:0;min-width:0;overflow-y:auto/);
  assert.match(root,/<SharedProviderSettingsSheet providerSettings=\{providerSettings\}/);
  assert.match(sheet,/doc\.addEventListener\('keydown',onKeydown,true\)/);
  assert.match(sheet,/if\(root\)root\.inert=true/);
  assert.match(sheet,/if\(root\)root\.inert=wasInert/);
  assert.doesNotMatch(root,/createPortal\(\s*<Workflow/);
  assert.doesNotMatch(html,/id="workflow-local-connect"|id="workflow-ai-model"/);
});

test('shared Provider selector is minimal and never adds Workflow-specific consent',async()=>{
  const [{$},view,frame]=await Promise.all([
    workflowDOM({settings:true}),file('src/ui/workflow/workflow-view.js'),
    file('src/ui/react/components/conversation.tsx')
  ]);
  const settings=$('.od-shared-provider-form');
  assert.equal(settings.length,1);
  assert.deepEqual(settings.find('input[name="od-ai-provider-source"]').map((_,node)=>$(node).val()).get(),
    ['local_codex','custom_https','cloud_responses']);
  assert.equal(settings.find('input[value="local_codex"]').prop('checked'),true);
  assert.equal($('#workflow-manual-start').length,0);
  assert.match(settings.text(),/Provider 配置对各 AI 入口共享/);
  assert.match(settings.text(),/网页摘要授权仍由原业务机制处理/);
  assert.equal($('#workflow-ai-plan').attr('aria-label'),'发送');
  assert.equal($('#workflow-ai-disclosure,[id^="workflow-ai-review-"],#workflow-ai-revoke').length,0);
  assert.doesNotMatch(settings.text(),/模型的数据发送许可|同意并生成/);
  assert.match(frame,/onSubmit=\{submit\}/);
  assert.match(view,/bind\('workflow-ai-plan','click',sendNaturalLanguage\)/);
  assert.match(view,/const taskSnapshot=await client\.request\('listTaskCatalog',\{\}\)/);
  assert.match(view,/return plan\(event,\{pregranted:true\}\)/);
  assert.doesNotMatch(view,/if\(immediate.state==='AI'&&!pendingReuse/);
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
  assert.match(view,/\bexecutable=structuredClone\(result\)/);
  assert.match(view,/const freeze=await compileWorkflow\(executable,\{verifyFill:true\}\)/);
  assert.match(view,/workflow=structuredClone\(executable\);touched=true;lastTrustedRun=null/);
  assert.doesNotMatch(view,/workflow=structuredClone\(executable\);touched=true;revision=null/);
});


test('installed Workflow keeps the real host and React owns history and shared model source',async()=>{
  const [{$},css,view,root,component]=await Promise.all([
    workflowDOM({settings:true}),file('src/ui/tool-shell.css'),
    file('src/ui/workflow/workflow-view.js'),file('src/ui/react/main.tsx'),
    file('src/ui/react/tabs/workflow.tsx')
  ]);
  for(const id of ['workflow-history-panel','workflow-edit-details',
    'workflow-history-toggle','workflow-ai-request','workflow-provider-toggle'])
    assert.equal($('#'+id).length,1,id+' owned by React');
  assert.equal($('#workflow-history-panel').prop('hidden'),true);
  assert.match($('#workflow-provider-toggle').attr('aria-label'),/AI 来源：本机 Codex/);
  assert.equal($('#workflow-source-name').length,0,'shared source picker replaces the duplicate label');
  assert.equal($('.od-shared-provider-form').length,1);
  assert.equal($('#workflow-ai-provider').length,0,'provider is managed by shared Runtime, not hidden select');
  assert.equal($('#workflow-ai-model').length,0,'old Workflow-specific credential form is absent');
  assert.match(component,/export function WorkflowHistory/);
  assert.match(component,/export function WorkflowSourceMenu/);
  assert.match(component,/onOpenSavedHistory/);
  const resume=component.match(/id="workflow-history-resume"[\s\S]*?<\/button>/)?.[0];
  assert.ok(resume);
  assert.match(resume,/disabled=\{Boolean\(model\.busy\)\}/);
  assert.match(view,/const onResumeSessionClick=event=>\{\s*if\(!event\.isTrusted\|\|busy\|\|/);
  assert.doesNotMatch(root,/createPortal\(\s*<Workflow(?:History|SourceName)/);
  assert.match(view,/selected==='local_codex'\?'Codex'/);
  assert.match(view,/saveList\.map\(item=>/);
  assert.match(view,/const saved=await host\.controller\.getControllerScript/);
  assert.match(view,/if\(saved\?\.contentHash!==compile\.sourceHash/);
  assert.match(view,/observationApproval=null;persistObservationApproval\(\)/);
  assert.match(view,/control\('workflow-ai-request'\)\.value\.trim\(\)/);
  assert.match(view,/if\(host\.executionPending\|\|host\.currentRun\)/);
  assert.match(view,/control\('workflow-saved-list'\)\.value=key/);
  assert.doesNotMatch(view,/dispatchEvent\(/);
  assert.match(css,/\.workflow-history-panel\[hidden\]\{display:none!important\}/);
  assert.doesNotMatch(component,/(?:createRoot\(|fetch\(|createWorkflowProviderFacade\()/);
});

test('shared Provider exposes real Native settings without a fake connection switch',async()=>{
  const [{$},sheet]=await Promise.all([
    workflowDOM({settings:true}),file('src/ui/react/components/provider-settings.tsx')
  ]);
  const settings=$('.od-shared-provider-form');
  assert.equal(settings.length,1);
  assert.equal(settings.find('[role="switch"],[aria-checked]').length,0);
  assert.equal(settings.find('input[name="od-ai-provider-source"]').length,3);
  assert.equal(settings.find('.od-shared-provider-fields .od-button--secondary').text(),'本机连接设置 ↗');
  assert.match(settings.text(),/当前授权/);
  assert.match(settings.text(),/切换后已有推理会安全失效/);
  assert.match(sheet,/onOpenNativeSettings\(\)/);
  assert.match(sheet,/event\.nativeEvent\?\.isTrusted/);
});

test('Workflow mounts the shared Provider and releases all modal subscriptions and focus traps',async t=>{
  const f=await mountWorkflowClient();
  t.after(()=>f.close());
  const get=id=>f.document.getElementById(id);
  assert.equal(f.subscriptions(),1,'one WorkflowView subscription');
  const baselineKeys=new Set(f.keys);
  assert.equal(get('workbench-workflow').hidden,false);
  assert.equal(get('workflow-provider-toggle').getAttribute('aria-expanded'),'false');
  await f.click('workflow-provider-toggle');
  assert.equal(f.document.querySelectorAll('#workflow-source-menu').length,1);
  assert.equal(f.document.querySelectorAll('.workflow-sheet-overlay').length,0,
    'source selection alone does not create a settings dialog');
  await f.clickNode(f.document.querySelector('#workflow-source-menu [role="menuitem"]'));
  assert.equal(f.document.querySelectorAll('.workflow-sheet-overlay [role="dialog"]').length,1);
  const app=get('opendesk-react-app');
  assert.equal(app.inert,true,'shared settings make the trusted app root inert');
  assert.equal(f.keys.size,baselineKeys.size+1,'one additional modal keyboard owner');
  const modalKey=[...f.keys].find(listener=>!baselineKeys.has(listener));
  await f.keydown('Escape');
  assert.equal(f.document.querySelectorAll('.workflow-sheet-overlay').length,0);
  assert.equal(app.inert,false,'Escape restores app interaction');
  assert.equal(f.keys.has(modalKey),false,'Escape releases modal listener');
  const example=f.document.querySelector('[data-workflow-example="read"]');
  await f.clickNode(example);
  assert.match(f.source.state().controls['workflow-ai-request'].value,/只读提取/);
  assert.equal(get('workflow-ai-request').value,f.source.state().controls['workflow-ai-request'].value);
  assert.equal(f.source.starts.length,0,'choosing an example does not execute code');
  assert.equal(f.source.requests.length,0,'choosing an example does not request Chrome permissions');
  await f.openSettings();
  assert.equal(app.inert,true);
  await f.close();
  assert.equal(f.subscriptions(),0,'unmount releases WorkflowView subscription');
  assert.equal(f.keys.has(modalKey),false,'unmount releases the keyboard listener');
  assert.equal(app.inert,false,'unmount restores app interaction');
  assert.equal(app.childNodes.length,0);
  f.source.view.actions.chooseExample('fill',f.source.event('workflow-ai-request'));
  await tick();
  assert.equal(app.childNodes.length,0,'late updates cannot recreate DOM');
});
