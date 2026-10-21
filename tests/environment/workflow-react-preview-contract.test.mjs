import {renderSidebarFixture,loadSidebarReact} from '../helpers/sidebar-react-fixture.mjs';
import {load} from 'cheerio';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';

const read=path=>readFile(path,'utf8');
test('R33.3.6 source-bound preview only reuses real Workflow JSX and installed shell',async()=>{
  const [entry,builder,component]=await Promise.all([
    read('src/ui/react/preview/workflow-preview.tsx'),
    read('scripts/preview/build-workflow-react-preview.mjs'),
    read('src/ui/react/tabs/workflow.tsx')
  ]);
  assert.match(entry,/from '\.\.\/tabs\/workflow\.tsx'/);
  for(const name of ['WorkflowHeader','WorkflowHistory','WorkflowSourceName','WorkflowTranscript','WorkflowSettingsSheet','WorkflowResultText'])
    assert.match(entry,new RegExp('createPortal\\(<'+name));
  for(const path of ['src/ui/sidepanel.html','src/ui/design-tokens.css',
    'src/ui/design-system.css','src/ui/tool-shell.css','src/ui/react/tabs/workflow.tsx'])
    assert.ok(builder.includes(path),'canonical input missing '+path);
  assert.match(builder,/--check/);
  assert.match(component,/export function WorkflowSettingsSheet/);
  assert.match(component,/export function WorkflowResultText/);
  // Comments may describe forbidden APIs; guard the executable code, not prose.
  const executable=entry.replace(/^\s*\/\/[^\n]*$/gm,'');
  assert.doesNotMatch(executable,/chrome\.|(?:^|\W)fetch\(|localStorage|sessionStorage|createWorkflowProviderFacade/);
  assert.doesNotMatch(executable,/from ['"][^'"]*(?:framework\/sdk|platform\/host|installer|sandbox)/);
  const result=await transform(entry,
    {loader:'tsx',jsx:'transform',target:'es2022'});
  assert.ok(result.code.length>1000);
});
test('R33.3.6 compiled offline HTML has real source checksum and bundled React',async()=>{
  const html=await read('prototypes/sidebar/workflow/react-preview/index.html');
  assert.match(html,/SOURCE_BOUND_UI_PREVIEW React19/);
  assert.match(html,/PREVIEW_ADAPTER_NOT_NATIVE/);
  assert.match(html,/name="od-source-input-sha256" content="[0-9a-f]{64}"/);
  assert.match(html,/id="workflow-provider-settings"/);
  assert.match(html,/id="workflow-ai-request"/);
  assert.match(html,/id="od-workflow-preview-stage"/);
  assert.match(html,/data:text\/javascript;base64,/);
  assert.match(html,/connect-src 'none'/);
  assert.doesNotMatch(html,/<script(?=\s)[^>]*src="https?:/);
  assert.doesNotMatch(html,/<iframe[^>]+src="https?:/);
});

test('R23.12 preview offers 320px and preserves the chosen HTTPS protocol',async()=>{
  const [entry,components]=await Promise.all([
    read('src/ui/react/preview/workflow-preview.tsx'),
    read('src/ui/react/tabs/workflow.tsx')
  ]);
  assert.match(entry,/<option value=\{320\}>320px<\/option>/);
  assert.match(entry,/const lastHttps=React\.useRef\('custom_https'\)/);
  assert.match(entry,/selectProvider\(lastHttps\.current,event\)/);
  assert.match(components,/item\.tabIndex>=0/);
  assert.match(components,/item\.getAttribute\('aria-hidden'\)!=='true'/);
});

test('R23.11 preview never forges saved history, native status or a provider token',async()=>{
  const [entry,builder,html,view]=await Promise.all([
    read('src/ui/react/preview/workflow-preview.tsx'),
    read('scripts/preview/build-workflow-react-preview.mjs'),
    renderSidebarFixture(),
    read('src/ui/workflow/workflow-view.js')
  ]);
  for(const node of ['workflow-history-panel','workflow-source-name',
    'workflow-source-local','workflow-source-https','workflow-https-protocol'])
    assert.match(html,new RegExp('id="'+node+'"'));
  assert.match(entry,/model=\{\{open:history,rows:\[\],canResume:false/);
  assert.match(entry,/setSourceName\(local\?'Codex'/);
  assert.match(entry,/sourceBound:true,native:false,provider:false/);
  assert.match(builder,/src\/ui\/react\/preview\/workflow-preview\.tsx/);
  assert.match(builder,/src\/ui\/workflow\/workflow-view\.js/);
  assert.match(view,/control\('workflow-ai-model'\)\.value\.trim\(\)/);
});

test('R23.14 source-bound preview keeps honest disconnected state with production copy',async()=>{
  const [entry,html,view]=await Promise.all([
    read('src/ui/react/preview/workflow-preview.tsx'),
    renderSidebarFixture(),
    read('src/ui/workflow/workflow-view.js')
  ]);
  assert.match(entry,/get\('workflow-local-status'\)\.textContent='未连接'/);
  assert.match(entry,/get\('workflow-local-connect'\)\.disabled=true/);
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