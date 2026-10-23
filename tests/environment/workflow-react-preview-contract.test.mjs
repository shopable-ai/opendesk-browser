import {renderSidebarFixture,loadSidebarReact} from '../helpers/sidebar-react-fixture.mjs';
import {load} from 'cheerio';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build,stop,transform} from 'esbuild';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createPreviewProviderSettings} from '../../src/ui/react/preview/shared-ai-preview.js';

const require=createRequire(import.meta.url);
// Render the actual shared primitive, not invented SSR content for Portal targets.
async function renderSharedFrame(props){
  let result;
  try{
    result=await build({stdin:{resolveDir:process.cwd(),contents:
      "export {SharedConversationFrame} from './src/ui/react/components/conversation.tsx';"},
      bundle:true,write:false,format:'esm',platform:'node',jsx:'transform',
      plugins:[{name:'shared-react-instance',setup(builder){
        builder.onResolve({filter:/^react(?:-dom)?(?:$|\/)/},({path})=>({
          path:pathToFileURL(require.resolve(path)).href,external:true}));
      }}]});
  }finally{stop();}
  const {SharedConversationFrame}=await import('data:text/javascript;base64,'+
    Buffer.from(result.outputFiles[0].text).toString('base64'));
  return renderToStaticMarkup(React.createElement(SharedConversationFrame,props));
}
async function sharedFixture(options={}){
  const providerSettings=options.providerSettings??createPreviewProviderSettings();
  try{return await renderSidebarFixture({activeTab:'workflow',providerSettings,...options});}
  finally{if(!options.providerSettings)providerSettings.dispose();}
}

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
  assert.match(component,/export \{SharedProviderSettingsSheet as WorkflowSettingsSheet\} from '\.\.\/components\/provider-settings\.tsx'/);
  const settings=await read('src/ui/react/components/provider-settings.tsx');
  assert.match(settings,/export function SharedProviderSettingsSheet/);
  assert.match(settings,/createPortal\([\s\S]*doc\.body\)/);
  assert.doesNotMatch(settings,/createRoot\(/);
  assert.match(component,/useSyncExternalStore/);
  assert.match(main,/const root=createRoot\(mount\)/);
  assert.equal([...main.matchAll(/\bcreateRoot\(/g)].length,1);
  assert.doesNotMatch(component,/createRoot\(/);
  assert.doesNotMatch(entry,/createRoot\(|createPortal\(|workflow-settings-react-host|workflow-history-react-host/);
  assert.doesNotMatch(builder,/workflow-settings-react-host|workflow-history-react-host/);
  for(const path of [
    'src/ui/sidepanel.html','src/ui/design-tokens.css','src/ui/design-system.css',
    'src/ui/tool-shell.css','src/ui/react/main.tsx','src/ui/react/app-shell.tsx',
    'src/ui/workflow/workflow-ui-state.js','src/ui/react/tabs/workflow.tsx',
    'src/ui/react/components/provider-settings.tsx','src/ui/react/components/conversation.tsx',
    'src/ui/react/preview/shared-ai-preview.js'
  ])assert.ok(builder.includes(path),'canonical preview input missing '+path);
  for(const currentDom of ['workflow-editor','workflow-history-panel','workflow-ai-transcript','workflow-provider-toggle','workflow-composer-frame'])
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
  const $=load(html);
  assert.equal($('#opendesk-react-app').length,1);
  assert.equal($('#opendesk-react-app').html(),'','product owns the initially empty root');
  const builder=await read('scripts/preview/build-workflow-react-preview.mjs');
  const inputs=[...builder.match(/const inputs=\[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(match=>match[1]);
  const bytes=await Promise.all(inputs.map(read));
  const sourceSha=createHash('sha256').update(Buffer.concat(bytes.flatMap((value,i)=>[
    Buffer.from(inputs[i]+'\u0000'),Buffer.from(value),Buffer.from('\u0000')]))).digest('hex');
  assert.equal($('meta[name="od-source-input-sha256"]').attr('content'),sourceSha,
    'generated preview must match the current source inputs');
  assert.match(html,/id="od-workflow-preview-stage"/);
  assert.match(html,/id="od-workflow-preview-controls"/);
  assert.match(html,/data:text\/javascript;base64,/);
  for(const directive of ["default-src 'none'","connect-src 'none'","object-src 'none'","base-uri 'none'","form-action 'none'",'script-src data:'])
    assert.ok($('meta[http-equiv="Content-Security-Policy"]').attr('content').includes(directive),directive);
  assert.doesNotMatch(html,/<script(?=\s)[^>]*src="https?:/);
  assert.doesNotMatch(html,/<iframe[^>]+src="https?:/);
});

test('Preview covers all UI outcomes, requested 320–960px widths, both themes and HTTPS choices',async()=>{
  const [entry,builder,settings]=await Promise.all([
    read('src/ui/react/preview/workflow-preview.tsx'),
    read('scripts/preview/build-workflow-react-preview.mjs'),
    read('src/ui/react/components/provider-settings.tsx')
  ]);
  for(const scene of ['empty','conversation','planning','running','success','failure',
    'unknown','approval','run-review','denied','disconnected','history','settings'])
    assert.ok(builder.includes('value="'+scene+'"'),'preview selector must include '+scene);
  for(const width of [320,360,400,420,440,520,640,768,960])
    assert.ok(builder.includes('value="'+width+'"'),'preview viewport missing '+width);
  for(const theme of ['light','dark'])
    assert.ok(builder.includes('value="'+theme+'"'),'theme selector missing '+theme);
  assert.match(entry,/let lastHttps='custom_https'/);
  assert.match(entry,/chooseProvider\(lastHttps\)/);
  assert.match(entry,/\[320,360,400,420,440,520,640,768,960\]\.includes\(width\)/);
  const $=load(await read('prototypes/sidebar/workflow/react-preview/index.html'));
  assert.deepEqual($('#od-workflow-preview-width option').map((_,node)=>Number($(node).val())).get(),
    [320,360,400,420,440,520,640,768,960]);
  assert.deepEqual($('#od-workflow-preview-theme option').map((_,node)=>$(node).val()).get(),['light','dark']);
  assert.match(entry,/stage\.dataset\.previewTheme=event\.target\.value==='dark'\?'dark':'light'/);
  assert.match($('#od-preview-viewport-css').text(),/\.od-workflow-preview-stage\[data-preview-theme="dark"\]\{[^}]*--od-bg:var\(--od-dark-bg\)/);
  assert.match($('#od-preview-viewport-css').text(),/\.od-workflow-preview-stage\{[^}]*background:var\(--od-bg\)/);
  assert.match(settings,/item\.tabIndex>=0/);
  assert.match(settings,/item\.getAttribute\('aria-hidden'\)!=='true'/);
});

test('Preview does not forge saved workflow history or native/Provider authority',async()=>{
  const [entry,builder,html,view]=await Promise.all([
    read('src/ui/react/preview/workflow-preview.tsx'),
    read('scripts/preview/build-workflow-react-preview.mjs'),
    sharedFixture(),
    read('src/ui/workflow/workflow-view.js')
  ]);
  const $=load(html);
  assert.equal($('#workflow-history-panel').length,1);
  assert.equal($('#workflow-history-panel .workflow-history-row').length,0);
  assert.equal($('#workflow-provider-toggle[aria-haspopup="menu"]').length,1);
  assert.equal($('#workflow-provider-toggle').attr('aria-expanded'),'false');
  assert.equal($('#workflow-source-local,#workflow-source-https,#workflow-source-name').length,0,
    'shared entry replaces legacy local settings and source label');
  const component=await read('src/ui/react/tabs/workflow.tsx');
  assert.match(component,/<WorkflowSourceMenu snapshot=\{settingsSnapshot\}/);
  assert.match(component,/Object\.entries\(SOURCE_LABELS\)/);
  for(const source of ['local_codex','custom_https','cloud_responses'])
    assert.ok(component.includes(source),'source menu must retain '+source);
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
    sharedFixture(),
    read('src/ui/workflow/workflow-view.js')
  ]);
  assert.match(entry,/control\('workflow-local-status'\)\.text='未连接'/);
  assert.match(entry,/control\('workflow-local-connect'\)\.disabled=true/);
  assert.match(entry,/control\('workflow-observation-revoke'\)\.disabled=true/);
  assert.match(entry,/未连接模型|离线预览未连接 Provider/);
  assert.match(entry,/native:false,provider:false/);
  assert.doesNotMatch(entry,/尚未连接 OpenDesk（离线预览，不探测）|示例规划中|本轮批准交互示例|UNKNOWN（模拟 UI 状态）/);
  assert.equal(load(html)('#workflow-provider-toggle').attr('aria-expanded'),'false');
  const settings=await read('src/ui/react/components/provider-settings.tsx');
  assert.match(settings,/网页摘要授权仍由原业务机制处理/);
  assert.match(settings,/原 Chrome\/Native 权限不因此扩大/);
  assert.doesNotMatch(settings,/chrome\.|(?:^|\W)fetch\(|requestPermissions\(/);
  assert.match(view,/control\('workflow-local-status-detail'\)\.text=detail/);
});

test('Shared Workflow transcript preserves escaped speaker semantics and native scroll styling',async t=>{
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
  const transcript=$('#workflow-ai-transcript');
  assert.equal(transcript.children().length,0,'SSR preserves the empty Portal target');
  assert.equal($('.workflow-composer-frame').length,1);
  assert.equal($('#workflow-ai-request').length,0,'input mounts into its target after React refs commit');
  const shared=load(await renderSharedFrame({rows:ui.getSnapshot().messages,
    inputId:'workflow-ai-request',entryClassName:'workflow-chat-entry'}));
  const rows=shared('.workflow-chat-entry');
  assert.equal(transcript.attr('role'),'log');
  assert.equal(rows.length,4);
  assert.deepEqual(rows.map((_,node)=>shared(node).attr('data-speaker')).get(),
    ['user','assistant','assistant','system']);
  assert.deepEqual(rows.map((_,node)=>shared(node).attr('aria-label')).get(),
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
  assert.match(component,/<SharedConversationFrame open=\{active\} rows=\{model\.messages\|\|\[\]\}/);
  assert.match(component,/splitTargets transcriptTarget=\{transcriptTarget\} composerTarget=\{composerTarget\}/);
  assert.match(component,/autoScroll=\{false\} focusOnOpen=\{false\}/);
  const conversation=await read('src/ui/react/components/conversation.tsx');
  assert.match(conversation,/transcriptTarget\?createPortal\(transcript,transcriptTarget\):null/);
  assert.match(conversation,/composerTarget\?createPortal\(composer,composerTarget\):null/);
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
  const $=load(await sharedFixture({workflowController:{...ui,actions:{}}}));
  const details=$('#workflow-technical-details');
  assert.equal(details.attr('open'),undefined);
  assert.match(details.find('summary').text(),/诊断详情/);
  assert.match(details.find('#workflow-technical').text(),/local_codex.*run-private.*result-private/);
  const ordinaryUI=$('#workbench-workflow').clone();
  ordinaryUI.find('#workflow-technical-details').remove();
  assert.doesNotMatch(ordinaryUI.text(),/wf-private|local_codex|run-private|result-private/);
  assert.equal($('#workflow-source-local,#workflow-source-name').length,0);
  assert.match($('#workflow-provider-toggle').attr('aria-label'),/AI 来源：本机 Codex/);
});

test('Offline shared settings never expose legacy API keys or retain supplied credentials',async t=>{
  const {createWorkflowUIState}=await loadSidebarReact();
  const ui=createWorkflowUIState();t.after(()=>ui.dispose());
  const secret='legacy-api-key-must-not-leak';
  ui.control('workflow-ai-key').value=secret;
  ui.control('workflow-provider-settings').open=true;
  await Promise.resolve();
  const providerSettings=createPreviewProviderSettings();t.after(()=>providerSettings.dispose());
  providerSettings.updateSettings({source:'custom_https',model:'preview-model',apiKey:secret});
  const snapshot=providerSettings.settingsSnapshot();
  assert.equal(snapshot.hasApiKey,true);
  assert.equal(Object.hasOwn(snapshot,'apiKey'),false);
  assert.ok(!JSON.stringify(snapshot).includes(secret));
  const html=await sharedFixture({providerSettings,workflowController:{...ui,actions:{}}});
  assert.ok(!html.includes(secret),'legacy business control cannot populate shared DOM');
  assert.equal(load(html)('#workflow-ai-key').length,0);
  const component=await read('src/ui/react/tabs/workflow.tsx');
  const settings=await read('src/ui/react/components/provider-settings.tsx');
  assert.match(component,/value=\{id==='workflow-ai-key'\?legacyKeyDraft:c\(id\)\.value\|\|''\}/);
  assert.match(settings,/const \[keyDraft,setKeyDraft\]=React\.useState\(''\)/);
  assert.match(settings,/id="od-ai-provider-key" type="password"\s+value=\{keyDraft\}/);
  assert.doesNotMatch(settings,/snapshot\.apiKey/);
  const adapter=await read('src/ui/react/preview/shared-ai-preview.js');
  assert.doesNotMatch(adapter,/chrome\.|(?:^|\W)fetch\(|localStorage|sessionStorage|createWorkflowProviderFacade|new WebSocket\(/);
  assert.match(settings,/else\{\s*setKeyDraft\(''\);setClearKey\(false\)/);
  providerSettings.updateSettings({apiKey:''});
  assert.equal(providerSettings.settingsSnapshot().hasApiKey,false);
  // NOT_TESTED here: Portal mount, focus/inert restoration, key clearing on close,
  // menu/Send gestures, and actual 320–960px/theme rendering require live DOM.
  // Parent R2.3.1 Chrome tests own those interactions; SSR is only structure.
});
