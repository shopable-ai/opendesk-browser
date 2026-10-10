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
  assert.match(workflow,/id="workflow-history-toggle"[^>]*aria-expanded="false"/);
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


test('R15.3 compact workflow header and composer use meaningful icons without redundant metadata',async()=>{
  const [html,css,view]=await Promise.all([
    file('src/ui/tool.html'),file('src/ui/tool-shell.css'),file('src/ui/workflow/workflow-view.js')
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
  assert.match(css,/\.workflow-icon-button\{[^}]*width:36px;height:36px/);
  assert.match(css,/#workflow-provider-settings:not\(\[open\]\)\{display:none\}/);
  assert.doesNotMatch(view,/workflow-head-site|workflow-provider-summary/);
  assert.match(view,/warning.hidden=!mismatch/);
  assert.match(view,/savedStatus.hidden=!revision/);
  assert.match(view,/workflow-plan-panel'\)\.hidden=!hasSteps \|\| Boolean\(proposal\)/);
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


test('R16 AI settings distinguish local Codex, custom HTTPS, future cloud and independent manual use',async()=>{
  const html=await file('src/ui/tool.html');
  const settings=html.slice(html.indexOf('id="workflow-provider-settings"'),html.indexOf('id="workflow-status"'));
  assert.match(settings,/id="workflow-provider-scope"/);
  assert.match(settings,/value="local_codex"/);
  assert.match(settings,/value="custom_https"/);
  assert.match(settings,/value="opendesk_cloud" disabled/);
  assert.match(settings,/value="manual"/);
  assert.match(settings,/模型推理可能联网/);
  assert.match(settings,/可能保存在 Codex 本机对话中/);
  assert.match(settings,/请勿填写 Codex 登录凭据/);
  assert.match(settings,/每次读取仍需确认/);
  assert.match(html,/id="workflow-provider-settings" class="workflow-provider"/);
  assert.doesNotMatch(settings,/localCodexReady\s*=\s*true|模拟连接成功/);
});
