import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Script} from 'node:vm';
import {deriveWorkflowViewState,WORKFLOW_VIEW_STATES} from '../../src/ui/workflow/view-state.js';

const file=path=>readFile(path,'utf8');
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
  const [html,css,view]=await Promise.all([
    file('src/ui/tool.html'),file('src/ui/tool-shell.css'),
    file('src/ui/workflow/workflow-view.js')
  ]);
  const workflow=html.slice(html.indexOf('id="workbench-workflow"'),html.indexOf('id="workbench-develop"'));
  assert.ok(workflow.length>0);
  assert.ok(workflow.indexOf('id="workflow-chat-intro"') < workflow.indexOf('id="workflow-saved-list"'),
    'chat should appear before version administration');
  assert.ok(workflow.indexOf('id="workflow-ai-request"') < workflow.indexOf('id="workflow-ai-key"'),
    'task request should appear before provider credentials');
  for(const id of ['workflow-plan-panel','workflow-params-panel','workflow-result-panel','workflow-manage-panel'])
    assert.match(workflow,new RegExp('id="'+id+'"[^>]*hidden'));
  assert.match(workflow,/id="workflow-provider-settings" class="workflow-provider"/,
    'credentials must be disclosed only on demand');
  assert.match(workflow,/id="workflow-ai-preview" class="workflow-ai-step-preview"/,
    'AI suggestion is a human-readable step list, not JSON in pre');
  assert.match(workflow,/id="workflow-history-toggle" aria-expanded="false"/);
  assert.match(css,/#workbench-workflow:not\(\[hidden\]\)\{display:flex;flex-direction:column/);
  assert.match(css,/#workspace-dock:has\(> #workflow-dock:not\(\[hidden\]\)\[data-empty="true"\]\)/);
  assert.match(view,/deriveWorkflowViewState\(/);
  assert.match(view,/preview\.replaceChildren\(\)/);
  assert.match(view,/get\('workflow-provider-settings'\)\.open=true/);
  assert.match(view,/get\('workflow-chat-intro'\)\.hidden=/);
  assert.match(view,/lastRun=completed\?\.state===/);
  assert.doesNotMatch(view,/innerHTML\s*=|eval\(|new Function\(/);
});

test('no new privileged workflow executor, no default visible version manager',async()=>{
  const [html,view,contract]=await Promise.all([
    file('src/ui/tool.html'),
    file('src/ui/workflow/workflow-view.js'),
    file('src/framework/workflow/contract.js')
  ]);
  assert.match(html,/id="workflow-confirm-run"/);
  assert.match(view,/currentPageTarget\.revalidate\(captured\)/);
  assert.match(view,/host\.start\(\{source,params/);
  assert.match(view,/snapshotControllerRun\(\{runId:claim\.runId\}\)/);
  assert.match(view,/get\('workflow-manage-panel'\)\.hidden=true/);
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
