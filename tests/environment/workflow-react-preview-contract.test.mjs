import {renderSidebarFixture,loadSidebarReact} from '../helpers/sidebar-react-fixture.mjs';
import {load} from 'cheerio';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';

const read=path=>readFile(path,'utf8');
test('Workflow preview mounts the installed SidebarAppShell and exactly one React root',async()=>{
  const [entry,builder,component,main]=await Promise.all([
    read('src/ui/react/preview/workflow-preview.tsx'),
    read('scripts/preview/build-workflow-react-preview.mjs'),
    read('src/ui/react/tabs/workflow.tsx'),
    read('src/ui/react/main.tsx')
  ]);
  assert.match(entry,/import \{mountSidebarApp\} from '\.\.\/main\.tsx'/);
  assert.match(entry,/import \{createWorkflowUIState\} from '\.\.\/\.\.\/workflow\/workflow-ui-state\.js'/);
  assert.match(entry,/app=mountSidebarApp|const app=mountSidebarApp/);
  assert.match(entry,/app\.connectWorkflowPage\(\{\.\.\.state,actions\}\)/);
  assert.match(component,/export function WorkflowPage/);
  assert.match(component,/export function WorkflowSettingsSheet/);
  assert.match(component,/useSyncExternalStore/);
  assert.match(main,/const root=createRoot\(mount\)/);
  assert.doesNotMatch(entry,/createRoot\(|createPortal\(|workflow-settings-react-host|workflow-history-react-host/);
  assert.doesNotMatch(builder,/workflow-settings-react-host|workflow-history-react-host/);
  for(const path of [
    'src/ui/sidepanel.html','src/ui/design-tokens.css','src/ui/design-system.css',
    'src/ui/tool-shell.css','src/ui/react/main.tsx','src/ui/react/app-shell.tsx',
    'src/ui/workflow/workflow-ui-state.js','src/ui/react/tabs/workflow.tsx'
  ])assert.ok(builder.includes(path),'canonical preview input missing '+path);
  for(const currentDom of ['workflow-sheet-title','workflow-history-panel','workflow-ai-request'])
    assert.ok(builder.includes(currentDom),'must validate installed JSX node '+currentDom);
  assert.match(builder,/--check/);
  // No native call or simulated receipt can become execution authority.
  const executable=entry.replace(/^\s*\/\/[^\n]*$/gm,'');
  assert.doesNotMatch(executable,/chrome\.|(?:^|\W)fetch\(|localStorage|sessionStorage|createWorkflowProviderFacade/);
  assert.doesNotMatch(executable,/from ['"][^'"]*(?:framework\/sdk|platform\/host|installer|sandbox)/);
  assert.match(entry,/runHost:false,permission:false,realResult:false/);
  const result=await transform(entry,{loader:'tsx',jsx:'transform',target:'es2022'});
  assert.ok(result.code.length>5000);
});

test('Generated offline HTML uses an empty installed React root and exact source identity',async()=>{
  // Generation runs before this contract in the preview CI.
  const html=await read('prototypes/sidebar/workflow/react-preview/index.html');
  assert.match(html,/SOURCE_BOUND_UI_PREVIEW React19/);
  assert.match(html,/PREVIEW_ADAPTER_NOT_NATIVE/);
  assert.match(html,/name="od-source-input-sha256" content="[0-9a-f]{64}"/);
  assert.match(html,/id="opendesk-react-app"/);
  assert.match(html,/id="od-workflow-preview-stage"/);
  assert.match(html,/id="od-workflow-preview-controls"/);
  assert.match(html,/data:text\/javascript;base64,/);
  assert.match(html,/connect-src 'none'/);
  assert.doesNotMatch(html,/<script(?=\s)[^>]*src="https?:/);
  assert.doesNotMatch(html,/<iframe[^>]+src="https?:/);
});

test('Preview covers all UI outcomes, five widths, both themes and the HTTPS protocol choice',async()=>{
  const [entry,builder,component]=await Promise.all([
    read('src/ui/react/preview/workflow-preview.tsx'),
    read('scripts/preview/build-workflow-react-preview.mjs'),
    read('src/ui/react/tabs/workflow.tsx')
  ]);
  for(const scene of ['empty','conversation','planning','running','success','failure',
    'unknown','approval','run-review','denied','disconnected','history','settings'])
    assert.ok(builder.includes('value="'+scene+'"'),'preview selector must include '+scene);
  for(const width of [320,360,400,420,440,520])
    assert.ok(builder.includes('value="'+width+'"'),'preview viewport missing '+width);
  for(const theme of ['light','dark'])
    assert.ok(builder.includes('value="'+theme+'"'),'theme selector missing '+theme);
  assert.match(entry,/let lastHttps='custom_https'/);
  assert.match(entry,/chooseProvider\(lastHttps\)/);
  assert.match(component,/item\.tabIndex>=0/);
  assert.match(component,/item\.getAttribute\('aria-hidden'\)!=='true'/);
});

test('Preview does not forge saved workflow history or native/Provider authority',async()=>{
  const [entry,builder,html,view]=await Promise.all([
    read('src/ui/react/preview/workflow-preview.tsx'),
    read('scripts/preview/build-workflow-react-preview.mjs'),
    renderSidebarFixture(),
    read('src/ui/workflow/workflow-view.js')
  ]);
  for(const node of ['workflow-history-panel','workflow-source-local',
    'workflow-source-https','workflow-https-protocol','workflow-local-status-detail'])
    assert.match(html,new RegExp('id="'+node+'"'));
  assert.match(entry,/history:\{open:historyOpen,rows:\[\],canResume:false,busy\}/);
  assert.match(entry,/sourceName:local\?'Codex'/);
  assert.match(entry,/sourceBound:true,native:false,provider:false/);
  assert.match(entry,/runHost:false,permission:false,realResult:false/);
  assert.match(builder,/src\/ui\/react\/preview\/workflow-preview\.tsx/);
  assert.match(builder,/src\/ui\/workflow\/workflow-view\.js/);
  assert.match(view,/control\('workflow-ai-model'\)\.value\.trim\(\)/);
});

test('Disconnected UI is honest and cannot connect or grant observation permission',async()=>{
  const [entry,html,view]=await Promise.all([
    read('src/ui/react/preview/workflow-preview.tsx'),
    renderSidebarFixture(),
    read('src/ui/workflow/workflow-view.js')
  ]);
  assert.match(entry,/control\('workflow-local-status'\)\.text='未连接'/);
  assert.match(entry,/control\('workflow-local-connect'\)\.disabled=true/);
  assert.match(entry,/control\('workflow-observation-revoke'\)\.disabled=true/);
  assert.match(entry,/未连接模型|离线预览未连接 Provider/);
  assert.match(entry,/native:false,provider:false/);
  assert.doesNotMatch(entry,/尚未连接 OpenDesk（离线预览，不探测）|示例规划中|本轮批准交互示例|UNKNOWN（模拟 UI 状态）/);
  assert.match(html,/id="workflow-local-status-detail"/);
  assert.match(view,/control\('workflow-local-status-detail'\)\.text=detail/);
});

test('Workflow chat keeps speaker semantics without labels, compact green user bubbles and one scroll owner',async t=>{
  const {createWorkflowUIState}=await loadSidebarReact();
  const ui=createWorkflowUIState();t.after(()=>ui.dispose());
  ui.patch({messages:[
    {id:'u',speaker:'你',message:'请读取当前网页 <script>alert(1)</script>'},
    {id:'a',speaker:'Codex',message:'已整理浏览器步骤'},
    {id:'r',speaker:'执行结果',message:'运行已结束。读回一致，但未提交服务器'},
    {id:'s',speaker:'本机权限',message:'不允许命令行操作，已拒绝'}
  ]});
  await Promise.resolve();
  const $=load(await renderSidebarFixture({
    activeTab:'workflow',workflowController:{...ui,actions:{}}
  }));
  const transcript=$('#workflow-ai-transcript'),rows=transcript.children('.workflow-chat-entry');
  assert.equal(transcript.attr('role'),'log');
  assert.equal(rows.length,4);
  assert.deepEqual(rows.map((_,node)=>$(node).attr('data-speaker')).get(),
    ['user','assistant','assistant','system']);
  assert.deepEqual(rows.map((_,node)=>$(node).attr('aria-label')).get(),
    ['你的消息','AI 回复','运行反馈','系统提示']);
  assert.equal(rows.find('strong').length,0,'speaker names never occupy a visible line');
  assert.match(rows.eq(0).text(),/请读取当前网页/);
  assert.equal(rows.find('script').length,0,'untrusted message text must be escaped');
  assert.match(rows.eq(2).text(),/未提交服务器/);
  const [css,component,builder,view]=await Promise.all([
    read('src/ui/tool-shell.css'),read('src/ui/react/tabs/workflow.tsx'),
    read('scripts/preview/build-workflow-react-preview.mjs'),
    read('src/ui/workflow/workflow-view.js')
  ]);
  assert.ok(component.includes('ConversationTranscript rows={rows} showSpeaker={false}'));
  assert.ok(css.includes('background:color-mix(in srgb,var(--od-positive) 13%,var(--od-paper))'));
  assert.ok(css.includes('.workflow-chat-transcript{display:flex;flex-direction:column;gap:6px;min-width:0;max-height:none;overflow:visible}'));
  assert.ok(!css.includes('max-height:210px'));
  assert.ok(css.includes('.workflow-composer:focus-within'));
  assert.ok(builder.includes('src/ui/react/components/conversation.tsx'));
  assert.ok(!view.includes("appendChat('模型来源'"));
  assert.ok(!view.includes("execution.runId+' / '+execution.resultId+effectMessage"));
});

test('Workflow diagnostics disclose source and execution identities only on demand',async t=>{
  const {createWorkflowUIState}=await loadSidebarReact();
  const ui=createWorkflowUIState();t.after(()=>ui.dispose());
  ui.control('workflow-technical').text=JSON.stringify({workflowId:'wf-private',
    modelSource:{source:'local_codex'},runId:'run-private',resultId:'result-private'});
  await Promise.resolve();
  const $=load(await renderSidebarFixture({activeTab:'workflow',
    workflowController:{...ui,actions:{}}}));
  const details=$('#workflow-technical-details');
  assert.equal(details.attr('open'),undefined);
  assert.match(details.find('summary').text(),/诊断详情/);
  assert.match(details.find('#workflow-technical').text(),/local_codex.*run-private.*result-private/);
  assert.doesNotMatch($('#workflow-ai-transcript').text(),/wf-private|local_codex|run-private|result-private/);
  assert.equal($('#workflow-source-local').text(),'本机 Codex');
  assert.equal($('#workflow-source-name').text(),'本机 Codex');
});
