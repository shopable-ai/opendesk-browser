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

// Opt in to the same installed Playwright/Chromium used by existing browser
// contracts. These are the generated file:// pages, with no product Host.
for(const [name,path,ready]of [
 ['Workflow','prototypes/sidebar/workflow/react-preview/index.html','workflowPreviewReady'],
 ['Sidebar','prototypes/sidebar/react-preview/index.html','previewBootScript']
])test(`${name} source-bound settings: native input, protocol retention, safe save/cancel and focus`,
 {skip:process.env.OPENDESK_PLAYWRIGHT_MODULE?false:'NOT_TESTED: set OPENDESK_PLAYWRIGHT_MODULE'},async t=>{
 const {chromium}=await import(process.env.OPENDESK_PLAYWRIGHT_MODULE);
 const browser=await chromium.launch({headless:true,
  ...(process.env.OPENDESK_CHROMIUM_EXECUTABLE?{executablePath:process.env.OPENDESK_CHROMIUM_EXECUTABLE}:{}),
  args:['--no-sandbox']});
 t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1000,height:900}});
 page.setDefaultTimeout(5000);
 const errors=[],requests=[];
 page.on('pageerror',error=>errors.push(String(error)));
 page.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});
 const url=pathToFileURL(new URL('../../'+path,import.meta.url).pathname);
 if(name==='Sidebar')url.search='?tab=workflow';
 await page.goto(url.href);
 await page.waitForFunction(({ready,name})=>document.documentElement.dataset[ready]===(name==='Workflow'?'true':'ready'),{ready,name});
 // Regress the real bottom-row defect: Source must stay alongside the draft
 // and Send, including when the draft grows, rather than reserve another row.
 const input=page.locator('#workflow-ai-request'),send=page.locator('#workflow-ai-plan');
 const checkComposer=async(actionSelector='#workflow-ai-plan')=>{
  const boxes=await page.evaluate(actionSelector=>{
   const box=selector=>{const r=document.querySelector(selector).getBoundingClientRect();
    return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height};};
   return {composer:box('.workflow-composer'),source:box('#workflow-provider-toggle'),
    input:box('#workflow-ai-request'),send:box(actionSelector)};
  },actionSelector);
  assert.ok(boxes.input.right<=boxes.composer.right,'draft stays inside the composer');
  assert.ok(boxes.source.right<=boxes.input.left,'Source sits before the input');
  assert.ok(boxes.source.top>=boxes.input.top&&boxes.source.bottom<=boxes.input.bottom,
   'Source shares the input row');
  assert.ok(Math.abs(boxes.source.bottom-boxes.send.bottom)<=4,'Source aligns with Send');
  assert.ok(boxes.composer.height<=boxes.input.height+12,'no independent bottom action row');
 };
 await checkComposer();assert.equal(await send.isDisabled(),true);
 await input.fill('只检查布局，不发送');await checkComposer();
 assert.equal(await send.isEnabled(),name==='Workflow',
  'the six-tab preview keeps real execution disabled');
 await input.fill(Array.from({length:10},(_,i)=>`第 ${i+1} 行布局检查`).join('\n'));
 await checkComposer();assert.equal(await send.isVisible(),true);
 await input.fill('');await checkComposer();
 await page.locator('#workflow-provider-toggle').focus();await page.keyboard.press('Tab');
 assert.equal(await input.evaluate(node=>node===document.activeElement),true,
  'keyboard order follows the visible Source → input → Send row');
 await page.keyboard.press('Shift+Tab');await page.keyboard.press('Enter');
 assert.equal(await page.getByRole('menuitemradio').count(),2);
 const menuBox=await page.locator('#workflow-source-menu').boundingBox();
 const triggerBox=await page.locator('#workflow-provider-toggle').boundingBox();
 assert.ok(menuBox.y+menuBox.height<=triggerBox.y,'source menu opens above the row');
 assert.equal(await page.getByRole('menuitem',{name:'高级 AI 设置…',exact:true}).isVisible(),true);
 await page.keyboard.press('End');
 assert.equal(await page.getByRole('menuitem',{name:'高级 AI 设置…',exact:true})
  .evaluate(node=>node===document.activeElement),true);
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('#workflow-provider-toggle')
  .evaluate(node=>node===document.activeElement),true);
 if(name==='Workflow'){
  await page.locator('#od-workflow-preview-scenario').selectOption('planning');
  assert.equal(await page.getByRole('button',{name:'停止对话',exact:true}).isVisible(),true);
  await checkComposer('#workflow-ai-cancel');
  await page.locator('#od-workflow-preview-scenario').selectOption('empty');
 }
 await page.locator('#workflow-provider-toggle').click();
 await page.getByRole('menuitemradio',{name:'HTTPS 模型',exact:true}).click();
 await page.getByRole('dialog',{name:'AI 设置'}).waitFor();
 await page.getByRole('button',{name:'取消',exact:true}).click();
 await checkComposer();
 assert.equal(await page.getByRole('alert').isVisible(),true,
  'missing HTTPS configuration stays visible without displacing the input');
 const open=async()=>{
  await page.locator('#workflow-provider-toggle').click();
  await page.getByRole('menuitem',{name:'高级 AI 设置…',exact:true}).click();
  await page.getByRole('dialog',{name:'AI 设置'}).waitFor();
  assert.equal(await page.getByRole('dialog').count(),1);
 };
 const segment=value=>page.locator(`.od-shared-provider-segment:has(input[value="${value}"]) span`);
 const save=async()=>{
  await page.getByRole('button',{name:'保存 AI 设置',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'detached'});
 };
 await open();
 assert.deepEqual(await page.getByRole('radio').evaluateAll(nodes=>nodes.map(node=>node.value)),['local_codex','https']);
 assert.equal(await page.evaluate(()=>document.activeElement?.value),'local_codex');
 await page.keyboard.press('ArrowRight');
 assert.equal(await page.getByRole('radio',{name:'HTTPS 模型',exact:true}).isChecked(),true);
 assert.equal(await page.getByLabel('接口地址',{exact:true}).isVisible(),true);
 const viewport=await page.evaluate(()=>{
  const stage=document.querySelector('.od-sidebar-preview-stage,.od-workflow-preview-stage').getBoundingClientRect();
  const overlay=document.querySelector('.workflow-sheet-overlay').getBoundingClientRect();
  const panel=document.querySelector('.workflow-sheet-panel').getBoundingClientRect();
  return {stage:{left:stage.left,top:stage.top,width:stage.width,height:stage.height,bottom:stage.bottom},
   overlay:{left:overlay.left,top:overlay.top,width:overlay.width,height:overlay.height},
   panel:{left:panel.left,width:panel.width,bottom:panel.bottom}};
 });
 for(const key of ['left','top','width','height'])assert.ok(Math.abs(viewport.overlay[key]-viewport.stage[key])<1,
  'settings viewport matches the displayed Side Panel: '+key);
 assert.ok(viewport.panel.bottom<=viewport.stage.bottom+1);
 const boxes=await page.locator('.od-shared-provider-segment span').evaluateAll(nodes=>nodes.map(node=>{
  const r=node.getBoundingClientRect();return {top:r.top,height:r.height};
 }));
 assert.equal(boxes[0].top,boxes[1].top,'source options occupy one compact row');
 assert.ok(boxes.every(box=>box.height>=30&&box.height<=44));
 await page.getByLabel('接口地址',{exact:true}).fill('https://preview.example.test/custom/plan');
 await page.locator('.od-shared-provider-protocol summary').click();
 await page.getByLabel('接口协议',{exact:true}).selectOption('custom_https');
 await page.getByLabel('模型 ID',{exact:true}).fill('preview-only-model');
 await page.getByLabel('API Key（仅当前会话）',{exact:true}).fill('preview-dummy-not-a-real-key');
 await save();
 // Both the settings sheet and Workflow's shortcut use the retained explicit
 // protocol for this nonstandard gateway, rather than re-inferring its path.
 await page.locator('#workflow-provider-toggle').click();
 await page.getByRole('menuitemradio',{name:'本机 Codex',exact:true}).click();
 await open();await segment('https').click();
 await page.locator('.od-shared-provider-protocol summary').click();
 assert.equal(await page.getByLabel('接口协议',{exact:true}).inputValue(),'custom_https');
 assert.equal(await page.getByLabel('模型 ID',{exact:true}).inputValue(),'preview-only-model');
 assert.match(await page.getByLabel('API Key（仅当前会话）',{exact:true}).getAttribute('placeholder'),/已配置/);
 await page.getByRole('button',{name:'取消',exact:true}).click();
 await page.locator('#workflow-provider-toggle').click();
 await page.getByRole('menuitemradio',{name:'HTTPS 模型',exact:true}).click();
 assert.equal(await page.getByRole('dialog').count(),0,'configured legacy HTTPS shortcut needs no second review');
 await open();
 await page.getByLabel('接口地址',{exact:true}).fill('https://preview.example.test/proxy/v1/responses');
 await page.getByRole('button',{name:'保存 AI 设置',exact:true}).click();
 assert.match(await page.getByRole('alert').innerText(),/仅支持 \/v1\/responses/);
 await page.getByLabel('接口地址',{exact:true}).fill('https://preview.example.test/v1/responses?feature=1');
 await page.locator('.od-shared-provider-protocol summary').click();
 await page.getByLabel('接口协议',{exact:true}).selectOption('custom_https');
 await page.getByRole('button',{name:'保存 AI 设置',exact:true}).click();
 assert.match(await page.getByRole('alert').innerText(),/不能使用 Chat Completions/);
 await page.getByLabel('接口地址',{exact:true}).fill('https://preview.example.test/v1/responses');
 await save();
 await page.locator('#workflow-provider-toggle').click();
 await page.getByRole('menuitemradio',{name:'本机 Codex',exact:true}).click();
 await page.locator('#workflow-provider-toggle').click();
 await page.getByRole('menuitemradio',{name:'HTTPS 模型',exact:true}).click();
 await open();
 assert.match(await page.locator('.od-shared-provider-remote').innerText(),/Responses/);
 // A new receiver must not silently inherit another origin's credential.
 await page.getByLabel('接口地址',{exact:true}).fill('https://other.example.test/v1/responses');
 await page.getByRole('button',{name:'保存 AI 设置',exact:true}).click();
 assert.match(await page.getByRole('alert').innerText(),/API Key|密钥/);
 await page.getByRole('checkbox',{name:'清除现有会话密钥'}).check();
 await save();await open();
 assert.equal(await page.getByLabel('接口地址',{exact:true}).inputValue(),'https://other.example.test/v1/responses');
 assert.equal(await page.getByRole('checkbox',{name:'清除现有会话密钥'}).count(),0);
 // Save stays inside the scrollable sheet; Tab cycles and Escape returns to
 // the stable Workflow trigger without changing the saved configuration.
 await page.getByRole('button',{name:'保存 AI 设置',exact:true}).focus();
 await page.keyboard.press('Tab');
 assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'关闭 AI 设置');
 await page.keyboard.press('Shift+Tab');
 assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'保存 AI 设置');
 await page.keyboard.press('Escape');
 assert.equal(await page.evaluate(()=>document.activeElement?.id),'workflow-provider-toggle');
 assert.equal(await page.evaluate(()=>document.getElementById('opendesk-react-app').inert),false);
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[],'preview cannot send AI requests');
});
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
  assert.match(settings,/网页摘要仍需按本轮授权/);
  assert.match(settings,/切换 AI 来源不会扩大 Chrome 或本机权限，也不会自动重放业务操作/);
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
  const dockCss=await read('src/ui/react/components/conversation-dock.css');
  assert.match(dockCss,/\.od-conversation-entry\[data-speaker="user"\]\{[^}]*background:var\(--od-conversation-user-bg\)/);
  assert.match(css,/\.workflow-chat-transcript\{[^}]*max-height:none;overflow:visible\}/);
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
  assert.match(settings,/const \[keyVisible,setKeyVisible\]=React\.useState\(false\)/);
  assert.match(settings,/id="od-ai-provider-key" type=\{keyVisible\?'text':'password'\}\s+value=\{keyDraft\}/);
  assert.doesNotMatch(settings,/snapshot\.apiKey/);
  const adapter=await read('src/ui/react/preview/shared-ai-preview.js');
  assert.doesNotMatch(adapter,/chrome\.|(?:^|\W)fetch\(|localStorage|sessionStorage|createWorkflowProviderFacade|new WebSocket\(/);
  assert.match(settings,/else\{\s*setKeyDraft\(''\);setKeyVisible\(false\);setClearKey\(false\)/);
  providerSettings.updateSettings({apiKey:''});
  assert.equal(providerSettings.settingsSnapshot().hasApiKey,false);
  // NOT_TESTED here: Portal mount, focus/inert restoration, key clearing on close,
  // menu/Send gestures, and actual 320–960px/theme rendering require live DOM.
  // Parent R2.3.1 Chrome tests own those interactions; SSR is only structure.
});
