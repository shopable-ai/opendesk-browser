#!/usr/bin/env node
// SOURCE_BOUND_UI_PREVIEW_CHROMIUM: authentic CDP input, offline only.
// Never interpret fixture state as installed Chrome extension or Host proof.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const chromeBin=process.env.CHROME_BIN||
  ['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);
assert.ok(chromeBin,'Linux Chromium required');
const html=resolve('prototypes/sidebar/react-preview/index.html');
assert(existsSync(html),'generate source-bound HTML first');
const profile=await mkdtemp(join(tmpdir(),'r3339-cdp-'));
const artifacts=resolve('artifacts/sidebar-six-react-preview');
await mkdir(artifacts,{recursive:true});
let chrome,socket,port=0,sequence=0;
const pending=new Map(),exceptions=[];
function cdp(method,params={}){
  return new Promise((ok,bad)=>{
    const id=++sequence;
    const timer=setTimeout(()=>{pending.delete(id);bad(Error('CDP timeout '+method));},15000);
    pending.set(id,{ok:r=>{clearTimeout(timer);ok(r);},
      bad:e=>{clearTimeout(timer);bad(e);}});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const value=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(value.exceptionDetails)throw Error('Browser: '+JSON.stringify(value.exceptionDetails));
  return value.result.value;
}
async function until(expression){
  for(let i=0;i<110;i++){
    try{if(await evaluate(expression))return;}catch{}
    await sleep(80);
  }
  throw Error('Condition not reached: '+expression+'; exceptions='+JSON.stringify(exceptions));
}
async function click(selector){
  const s=JSON.stringify(selector);
  const rect=await evaluate('(()=>{const n=document.querySelector('+s+
    ');if(!n)throw Error("missing element");n.scrollIntoView({block:"center",inline:"nearest"});'+
    'const b=n.getBoundingClientRect();return {x:Math.round(b.left+b.width/2),'+
    'y:Math.round(b.top+b.height/2),w:b.width,h:b.height,hidden:!!n.closest("[hidden]"),'+
    'hit:(()=>{const h=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return h===n||n.contains(h);})()}})()');
  assert(rect.w>0&&rect.h>0&&!rect.hidden&&rect.hit,
    selector+' must be visible and receive native pointer input '+JSON.stringify(rect));
  // Allow the Chromium compositor to apply scroll/hit-test before pressing.
  await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.x,y:rect.y,button:'none'});
  await sleep(90);
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x,y:rect.y,button:'left',clickCount:1});
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x,y:rect.y,button:'left',clickCount:1});
  await sleep(155);
}
async function screenshot(name){
  const result=await cdp('Page.captureScreenshot',{format:'png'});
  await writeFile(join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));
}
try{
  chrome=spawn(chromeBin,['--headless=new','--no-sandbox','--disable-gpu',
    '--disable-dev-shm-usage','--no-first-run','--window-size=800,1050',
    '--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'],
  {stdio:['ignore','ignore','pipe']});
  let stderr='';chrome.stderr.on('data',d=>{stderr=(stderr+d).slice(-6000);});
  for(let i=0;i<280;i++){
    if(chrome.exitCode!==null)throw Error('Chrome exited '+stderr);
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break;}
    catch{}
    await sleep(100);
  }
  assert(port,'CDP not ready '+stderr);
  const tabs=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket=new WebSocket(tabs.find(x=>x.type==='page').webSocketDebuggerUrl);
  await new Promise((ok,bad)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',bad,{once:true});});
  socket.addEventListener('message',e=>{
    const message=JSON.parse(e.data);
    if(message.method==='Runtime.exceptionThrown')
      exceptions.push(message.params.exceptionDetails?.exception?.description||'Runtime exception');
    if(message.method==='Runtime.consoleAPICalled'&&message.params.type==='error')
      exceptions.push('console.error '+message.params.args?.map(x=>x.value||x.description).join(' '));
    if(!pending.has(message.id))return;
    const waiter=pending.get(message.id);pending.delete(message.id);
    message.error?waiter.bad(Error(JSON.stringify(message.error))):waiter.ok(message.result);
  });
  await cdp('Runtime.enable');await cdp('Page.enable');await cdp('DOM.enable');
  await cdp('Page.navigate',{url:pathToFileURL(html).href});
  await until('document.documentElement.dataset.sidebarPreviewReady==="true"');
  await until('document.querySelector("[data-task-id=preview-task]")?.getAttribute("aria-expanded")==="true"');
  assert.equal(await evaluate('document.getElementById("task-status").textContent'),'',
    'Normal task detail must not repeat the preview-only warning inside the product card');
  await screenshot('my-expanded-360');
  await click('[data-task-id="preview-task"]');
  await until('document.querySelector("[data-task-id=preview-task]").getAttribute("aria-expanded")==="false"');
  assert.equal(await evaluate('document.getElementById("task-selected-workspace").hidden'),true);
  await screenshot('my-collapsed-360');
  await click('[data-task-id="preview-task"]');
  await until('document.querySelector("[data-task-id=preview-task]").getAttribute("aria-expanded")==="true"');
  await click('[data-task-id="preview-off"]');
  await until('document.querySelector("[data-task-id=preview-off]").getAttribute("aria-expanded")==="true"');
  assert.equal(await evaluate('document.getElementById("task-search-toggle").hidden'),false,
    'Task search is discoverable as an icon in the main task header');
  assert.equal(await evaluate('document.getElementById("task-search-panel").hidden'),true);
  await click('#task-search-toggle');
  await until('!document.getElementById("task-search-panel").hidden');
  await click('#task-search-toggle');
  await until('document.getElementById("task-search-panel").hidden');
  await click('#task-manage-toggle');
  await until('document.getElementById("task-manage-toggle").getAttribute("aria-pressed")==="true"');
  await until('document.querySelectorAll(".task-card-manage").length===2');
  const managementRow=await evaluate('(()=>{const group=document.querySelector(".task-card-group.selected");'+
    'const row=group?.querySelector(":scope > .task-card");'+
    'const icon=group?.querySelector(":scope > .task-card-manage");'+
    'const form=group?.querySelector(":scope > .task-selected-workspace");'+
    'if(!row||!icon||!form)return {order:false,aligned:false};'+
    'const a=row.getBoundingClientRect(),b=icon.getBoundingClientRect();'+
    'return {order:icon.previousElementSibling===row&&icon.nextElementSibling===form,'+
    'aligned:b.top>=a.top&&b.bottom<=a.bottom}})()');
  assert.deepEqual(managementRow,{order:true,aligned:true},
    'Task management icon must be aligned beside row, BEFORE native detail in DOM and tab order');
  await click('.task-card-manage');
  await until('document.getElementById("task-tools").open');
  await click('#task-uninstall');
  await until('!document.getElementById("task-uninstall-confirm").hidden');
  await click('#task-uninstall-cancel');
  await until('document.getElementById("task-uninstall-confirm").hidden');
  await screenshot('my-manage-360');
  await click('#task-manage-toggle');
  await until('document.getElementById("task-manage-toggle").getAttribute("aria-pressed")==="false"');
  await click('#task-open-catalog');
  await until('!document.getElementById("task-add-menu").hidden');
  await screenshot('my-add-360');
  await click('#task-add-catalog');
  await until('!document.getElementById("workbench-discover").hidden');
  await click('#task-catalog-back');
  await until('!document.querySelector("#workbench-tasks .tasks-surface").hidden');
  await click('#schedule-open');
  await until('!document.getElementById("scheduled-panel").hidden');
  await until('document.querySelectorAll("#schedule-plan-list .schedule-card").length>=8');
  const projected=await evaluate('[...document.querySelectorAll("#schedule-plan-list .schedule-state")].map(x=>x.getAttribute("aria-label"))');
  for(const state of ['已安排','已暂停','运行中','已完成','需要处理','结果待核对','已错过','正在结算'])
    assert(projected.some(label=>label.includes(state)),'accessible icon must identify '+state);
  assert.equal(await evaluate('[...document.querySelectorAll("#schedule-plan-list .schedule-state")].every(x=>x.getAttribute("role")==="img")'),true);
  assert.equal(await evaluate('document.querySelectorAll("#schedule-plan-list .schedule-plan-actions button").length'),17,
    'completed one-off cards must not show a fake restart; active Fire owns a distinct Stop');
  assert.equal(await evaluate('Boolean(document.querySelector("[data-schedule-id=preview-3] [data-schedule-action=stop]"))'),true);
  assert.equal(await evaluate('Boolean(document.querySelector("[data-schedule-id=preview-4] [data-schedule-action=toggle]"))'),false,
    'successful one-off cannot silently be started a second time');
  assert.equal(await evaluate('document.querySelector("[data-schedule-id=preview-3] .schedule-state")?.getAttribute("aria-label").includes("计划：已安排")'),true,
    'running Fire and scheduled plan lifecycle must share one truthful accessible icon');
  assert.equal(await evaluate('document.getElementById("schedule-list-summary").textContent.includes("运行中")'),true);
  assert.equal(await evaluate('document.querySelector("[data-schedule-id=preview-3] .schedule-state").dataset.tone'),'positive');
  assert.equal(await evaluate('document.querySelector("[data-schedule-id=preview-3] .schedule-recent-result")===null'),true,
    'ordinary running state needs no duplicate third line');
  assert.equal(await evaluate('document.querySelector("[data-schedule-id=preview-2] .schedule-state").dataset.tone'),'muted');
  await screenshot('my-schedule-multi-360');
  await click('[data-schedule-id="preview-3"] [data-schedule-action="stop"]');
  await until('document.querySelector("[data-schedule-id=preview-3] .schedule-state")?.getAttribute("aria-label")==="已安排"');
  assert.equal(await evaluate('document.querySelector("[data-schedule-id=preview-3] .schedule-plan-meta").textContent.includes("下次")'),true,
    'stopping current UI Fire must leave the recurring plan schedule intact');
  await click('[data-schedule-id="preview-2"] [data-schedule-action="toggle"]');
  await until('document.querySelector("[data-schedule-id=preview-2] .schedule-state")?.getAttribute("aria-label")==="已安排"');
  // Real pointer steps exercise the single header delete entry and its review.
  await click('[data-schedule-id="preview-1"] .schedule-plan-open');
  await until('!document.getElementById("schedule-detail-view").hidden');
  assert.equal(await evaluate('document.getElementById("schedule-detail-delete").hidden'),false);
  assert.equal(await evaluate('document.querySelectorAll("#schedule-detail-view .schedule-danger-link").length'),0);
  await click('#schedule-detail-delete');
  await until('Boolean(document.querySelector("#schedule-detail-view .schedule-delete-confirm"))');
  await screenshot('schedule-header-delete-confirm-360');
  await click('#schedule-detail-view .schedule-delete-confirm button:last-child');
  await until('!document.querySelector("#schedule-detail-view .schedule-delete-confirm")');
  assert.equal(await evaluate('document.activeElement?.id'),"schedule-detail-delete",
    'cancel must return focus to the header delete trigger');
  await click('#schedule-back');
  await until('!document.getElementById("schedule-list-view").hidden');
  await click('#schedule-open-manager');
  await until('!document.getElementById("schedule-task-manager").hidden');
  await screenshot('task-manager-from-header-360');
  await click('#schedule-back');
  await until('!document.getElementById("schedule-list-view").hidden');
  await click('#schedule-create');
  await until('!document.getElementById("schedule-form").hidden');
  const formCopy=await evaluate('document.getElementById("schedule-form").innerText');
  assert.doesNotMatch(formCopy,/UI_PREVIEW_ONLY|未连接 Host|不写入真实计划/,
    'technical preview guards belong in metadata or one top banner, not the create form');
  assert.equal(await evaluate('document.getElementById("schedule-timezone").getClientRects().length>0'),true,
    'Timezone must be a directly visible native select');
  assert.equal(await evaluate('document.getElementById("schedule-timezone-edit")===null'),true,
    'No nested timezone edit/search/done steps');
  assert((await evaluate('[...document.getElementById("schedule-timezone").options].map(x=>x.value)'))
    .includes('Asia/Tokyo'),'Preview timezone picker offers Tokyo');
  await click('#schedule-title');await cdp('Input.insertText',{text:'回归演示计划'});
  await click('#schedule-manage-tasks');
  await until('!document.getElementById("schedule-task-manager").hidden');
  assert.equal(await evaluate('document.querySelectorAll("#schedule-manager-list .schedule-manager-card").length'),2);
  const managerGeometry=await evaluate('(()=>{const card=document.querySelector("#schedule-manager-list .schedule-manager-card");const host=document.getElementById("schedule-manager-list");return {card:card.getBoundingClientRect().width,host:host.getBoundingClientRect().width}})()');
  assert(managerGeometry.card>=managerGeometry.host-2,'manager card must fill content width');
  await click('#schedule-manager-list .schedule-manager-toggle');
  await until('document.querySelector("#schedule-manager-list .schedule-manager-card .schedule-manager-state").getAttribute("aria-label")==="已停用"');
  await click('[data-manager-more="preview-off"]');
  await until('document.querySelector("[data-manager-more=preview-off]").parentElement.open');
  await click('[data-manager-uninstall="preview-off"]');
  await until('!document.getElementById("schedule-uninstall-confirm").hidden');
  assert.equal(await evaluate('document.querySelectorAll("#schedule-manager-list .schedule-manager-card").length'),2,
    'opening uninstall review cannot remove a task');
  await click('#schedule-uninstall-no');
  await until('document.getElementById("schedule-uninstall-confirm").hidden');
  await screenshot('task-manager-420');
  await click('#schedule-back');
  await until('!document.getElementById("schedule-form").hidden');
  assert.equal(await evaluate('document.getElementById("schedule-title").value'),'回归演示计划',
    'manager detour must preserve unsaved plan title');
  await click('#schedule-save');
  await until('!document.getElementById("schedule-save-confirm").hidden');
  await click('#schedule-confirm-yes');
  await until('document.getElementById("schedule-plan-list").textContent.includes("回归演示计划")');
  await screenshot('my-plan-confirmed-360');
  // Completed one-off detail must not offer a misleading re-run/pause control.
  await click('[data-schedule-id="preview-4"] .schedule-plan-open');
  await until('!document.getElementById("schedule-detail-view").hidden');
  assert.equal(await evaluate('document.querySelector("#schedule-detail-view .schedule-detail-actions button")===null'),true);
  await click('#schedule-detail-delete');
  await until('!!document.querySelector("#schedule-detail-view .schedule-delete-confirm")');
  await click('#schedule-detail-view .schedule-delete-confirm button:last-child');
  await until('!document.querySelector("#schedule-detail-view .schedule-delete-confirm")');
  await click('#schedule-back');
  await until('!document.getElementById("schedule-list-view").hidden');
  await click('#schedule-create');
  await until('!document.getElementById("schedule-form").hidden');
  await click('#schedule-manage-tasks');
  await until('!document.getElementById("schedule-task-manager").hidden');
  await click('[data-manager-more="preview-off"]');
  await until('document.querySelector("[data-manager-more=preview-off]").parentElement.open');
  await click('[data-manager-uninstall="preview-off"]');
  await until('!document.getElementById("schedule-uninstall-confirm").hidden');
  await click('#schedule-uninstall-yes');
  await until('document.querySelectorAll("#schedule-manager-list .schedule-manager-card").length===1');
  assert.equal(await evaluate('document.querySelector("#schedule-manager-count").textContent.includes("1 / 1")'),true);
  await click('#schedule-back');
  await until('!document.getElementById("schedule-form").hidden');
  await click('#schedule-back');
  await until('!document.getElementById("schedule-list-view").hidden');
  // Real Chromium clicks against the same WorkflowHeader / History / SourceName
  // portals as production. There is no Planner, revision storage or RunHost here.
  await click('#tab-workflow');
  await until('!document.getElementById("workbench-workflow").hidden');
  await until('document.getElementById("workflow-source-name")?.textContent==="Codex"');
  await click('#workflow-history-toggle');
  await until('!document.getElementById("workflow-history-panel").hidden');
  assert.equal(await evaluate('document.getElementById("workflow-history-toggle").getAttribute("aria-expanded")'),"true");
  assert((await evaluate('document.getElementById("workflow-history-panel").textContent')).includes('演示工作流'),
    'History must be the latest formal React portal, not the obsolete management view');
  await screenshot('workflow-history-360');
  await click('#workflow-history-toggle');
  await until('document.getElementById("workflow-history-panel").hidden');
  await click('#workflow-ai-request');
  await cdp('Input.insertText',{text:'保留未发送草稿'});
  await until('document.getElementById("workflow-ai-request").value.includes("保留未发送草稿")');
  await click('#workflow-new');
  await until('!document.getElementById("workflow-new-review").hidden');
  await screenshot('workflow-unsaved-review-360');
  await click('#workflow-new-cancel');
  await until('document.getElementById("workflow-new-review").hidden');
  assert((await evaluate('document.getElementById("workflow-ai-request").value')).includes('保留未发送草稿'),
    'Cancel must preserve the unsaved composer draft');
  await click('#workflow-new');
  await until('!document.getElementById("workflow-new-review").hidden');
  await click('#workflow-new-discard');
  await until('document.getElementById("workflow-new-review").hidden');
  assert.equal(await evaluate('document.getElementById("workflow-ai-request").value'),'');
  await until('document.querySelectorAll("#workflow-intro-suggestions button:not([hidden])").length===2');
  const examplesWidth=await evaluate('(()=>{const host=document.getElementById("workflow-intro-suggestions");const buttons=[...host.querySelectorAll("button:not([hidden])")];return {container:host.getBoundingClientRect().width,buttons:buttons.map(b=>b.getBoundingClientRect().width),labels:buttons.map(b=>b.textContent)}})()');
  assert(examplesWidth.buttons.every(w=>Math.abs(w-examplesWidth.container)<2),
    'two suggestions must fill the formal workflow content column '+JSON.stringify(examplesWidth));
  assert.deepEqual(examplesWidth.labels,['填写表单并读回','只读提取网页信息']);
  await click('[data-workflow-example="fill"]');
  await until('document.getElementById("workflow-ai-request").value.includes("填入")');
  await click('#workflow-new');
  await until('!document.getElementById("workflow-new-review").hidden');
  await click('#workflow-new-discard');
  await until('document.getElementById("workflow-new-review").hidden');
  await click('#workflow-ai-new-session');
  await until('document.getElementById("workflow-ai-title").textContent==="开始新对话"');
  assert.deepEqual(await evaluate('[...document.querySelectorAll("#workflow-intro-suggestions button:not([hidden])")].map(b=>b.textContent)'),
    ['继续修改填写内容','检查当前网页']);
  await click('[data-workflow-example="check"]');
  await until('document.getElementById("workflow-ai-request").value.includes("检查当前网页")');
  assert.equal(await evaluate('window.__sidebarPreviewInfo.realHost'),false);
  // Resize through the real preview select's change event, then read computed
  // geometry from Chromium. No extra HTML page or fake workflow engine.
  for(const targetWidth of [320,360,400,420,440,520]){
    await evaluate('(()=>{const select=document.querySelector("[data-preview-width]");'+
      'Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,"value").set.call(select,'+
      JSON.stringify(String(targetWidth))+');'+
      'select.dispatchEvent(new Event("change",{bubbles:true}));return select.value})()');
    await until('Math.abs(document.getElementById("od-sidebar-preview-stage").getBoundingClientRect().width-'+targetWidth+')<1');
    const layout=await evaluate('(()=>{const host=document.getElementById("workflow-intro-suggestions");'+
      'const bounds=host.getBoundingClientRect();return {width:bounds.width,'+
      'buttons:[...host.querySelectorAll("button:not([hidden])")].map(b=>({'+
      'w:b.getBoundingClientRect().width,left:b.getBoundingClientRect().left,right:b.getBoundingClientRect().right}))}})()');
    assert(layout.width>0&&layout.buttons.length===2,
      targetWidth+'px: both workflow suggestions must be visible');
    assert(layout.buttons.every(b=>Math.abs(b.w-layout.width)<2),
      targetWidth+'px: suggestion must fill its parent '+JSON.stringify(layout));
    await screenshot('workflow-suggestions-'+targetWidth);
  }
  await click('#workflow-history-toggle');
  await until('!document.getElementById("workflow-history-panel").hidden');
  await click('#workflow-history-panel .workflow-history-row');
  await until('document.getElementById("workflow-status").textContent.includes("源码哈希")');
  assert.equal(await evaluate('Boolean(window.__sidebarPreviewInfo?.realHost)'),false);
  await click('#workflow-ai-plan');
  await until('document.getElementById("workflow-status").textContent.includes("未连接")');
  assert((await evaluate('document.getElementById("workflow-status").textContent')).includes('AI 设置'),
    'offline Workflow send must explain how to connect instead of reporting fabricated Host success');
  await screenshot('workflow-preview-feedback-360');
  await click('#workflow-provider-toggle');
  await until('!document.querySelector(".workflow-sheet-overlay").hidden');
  await click('#workflow-source-https');
  await until('document.getElementById("workflow-source-https").getAttribute("aria-pressed")==="true"');
  await click('#workflow-ai-model');
  await cdp('Input.insertText',{text:'gpt-preview-id'});
  await until('document.getElementById("workflow-source-name")?.textContent==="gpt-preview-id"');
  assert.equal(await evaluate('document.getElementById("workflow-source-name").textContent'),'gpt-preview-id',
    'HTTPS source badge must show the configured model ID only');
  await click('#workflow-source-local');
  await until('document.getElementById("workflow-source-name")?.textContent==="Codex"');
  await click('.workflow-sheet-panel button[aria-label="关闭 AI 设置"]');
  await until('document.querySelector(".workflow-sheet-overlay").hidden');
  await screenshot('workflow-source-codex-360');
  await click('#tab-develop');
  await until('!document.getElementById("workbench-develop").hidden');
  await click('#local-project-mode');
  await until('!document.getElementById("local-project-tools").hidden');
  assert.equal(await evaluate('document.getElementById("manual-source-editor").hidden'),true,
    'Local project mode must hide the manual editor and show existing project tools');
  assert((await evaluate('document.getElementById("local-project-status").textContent')).includes('仅预览'),
    'No native authorization may be implied in offline preview');
  await screenshot('developer-local-project-360');
  await click('#local-project-refresh');
  await until('document.getElementById("local-project-status").textContent.includes("Native")');
  await click('#local-project-mode');
  await until('document.getElementById("local-project-tools").hidden');
  await click('#tab-tools');
  await until('!document.getElementById("workbench-tools").hidden');
  await click('#extension-center-more');
  await until('!document.getElementById("extension-center-menu").hidden');
  await click('#extension-center-import');
  await until('!document.getElementById("sidebar-tool-import").hidden');
  assert.equal(await evaluate('document.getElementById("extension-center-menu").hidden'),true,
    'Import action must close the menu, never obscure review or confirm controls');
  const fixture=join(profile,'demo.opendesk-tool.json');
  await writeFile(fixture,JSON.stringify({format:'opendesk.sidebar-tool.v2',
    id:'preview-import',title:'演示导入工具',version:'1.2.0',
    capabilities:['storage.local'],html:'<main>fixture</main>',css:'',js:''}));
  const root=await cdp('DOM.getDocument',{depth:0});
  const file=await cdp('DOM.querySelector',{nodeId:root.root.nodeId,selector:'#sidebar-tool-file'});
  assert(file.nodeId,'Real source file chooser absent');
  await cdp('DOM.setFileInputFiles',{nodeId:file.nodeId,files:[fixture]});
  await until('!document.getElementById("sidebar-tool-preview").hidden');
  assert.equal(await evaluate('document.getElementById("sidebar-tool-install").disabled'),false);
  await screenshot('extension-import-review-360');
  await click('#sidebar-tool-install');
  await until('!!document.querySelector("[data-extension-id=\\"app:preview-import\\"]")');
  assert.equal(await evaluate('document.querySelectorAll("[data-extension-id=\\"app:preview-import\\"]").length'),1);
  await click('[data-extension-id="app:preview-import"] .ec-row-main');
  await sleep(220);
  const rowState=await evaluate('(()=>({detailHidden:document.getElementById("extension-center-detail").hidden,'+
    'listHidden:document.getElementById("extension-center-list-view").hidden,'+
    'menuHidden:document.getElementById("extension-center-menu").hidden,'+
    'rowCount:document.querySelectorAll("[data-extension-id=\\\"app:preview-import\\\"]").length,'+
    'focused:document.activeElement?.outerHTML?.slice(0,250)}))()');
  assert.equal(rowState.detailHidden,true,
    'An installed app must NOT open pre-install detail: '+JSON.stringify(rowState));
  await until('!document.getElementById("sidebar-tool-display").hidden');
  assert((await evaluate('document.getElementById("sidebar-tool-frame").textContent')).includes('工具工作区'),
    'Installed app should display the real shared tool container with a preview fixture');
  await screenshot('extension-use-360');
  await click('#sidebar-tool-settings-open');
  await until('document.getElementById("sidebar-tool-frame").textContent.includes("工具设置")');
  await click('#sidebar-tool-back');
  await until('document.getElementById("sidebar-tool-display").hidden');
  await click('#extension-center-more');
  await until('!document.getElementById("extension-center-menu").hidden');
  await click('#extension-center-import');
  await until('!document.getElementById("sidebar-tool-import").hidden');
  const upgrade=join(profile,'demo-upgrade.opendesk-tool.json');
  await writeFile(upgrade,JSON.stringify({format:'opendesk.sidebar-tool.v2',
    id:'preview-import',title:'演示导入工具',version:'1.3.0',
    capabilities:['storage.local'],html:'<main>upgrade fixture</main>',css:'',js:''}));
  await cdp('DOM.setFileInputFiles',{nodeId:file.nodeId,files:[upgrade]});
  await until('document.getElementById("sidebar-tool-preview-version").textContent.includes("1.3.0")');
  assert((await evaluate('document.getElementById("sidebar-tool-update-versions").textContent')).includes('1.2.0'),
    'Same-ID import must show previous version before updating');
  await click('#sidebar-tool-install');
  const importedSelector='[data-extension-id="app:preview-import"]';
  await until('document.querySelectorAll('+JSON.stringify(importedSelector)+').length===1');
  await click('[data-extension-id="app:preview-import"] .ec-row-main');
  await until('!document.getElementById("sidebar-tool-display").hidden');
  assert((await evaluate('document.getElementById("sidebar-tool-frame").textContent')).includes('1.3.0'),
    'Updated app usage must show the new version without a duplicate installed ID');
  await screenshot('extension-updated-use-360');
  await click('#sidebar-tool-remove');
  await until('!document.getElementById("sidebar-tool-action-review").hidden');
  await screenshot('extension-uninstall-review-360');
  await click('#sidebar-tool-action-continue');
  await until('document.getElementById("extension-center-detail").hidden && '+
    '!document.getElementById("extension-center-list-view").hidden');
  assert.equal(await evaluate('document.querySelectorAll('+JSON.stringify(importedSelector)+').length'),1,
    'Uninstalled fixture remains once, only in available list');
  assert.equal(await evaluate('document.querySelector("[data-ec-scope=available]").getAttribute("aria-pressed")'),'true',
    'Uninstall must switch to available scope');
  assert((await evaluate('document.querySelector('+JSON.stringify(importedSelector+' .ec-row-main')+').getAttribute("aria-label")')).includes('查看详情'),
    'Uninstalled app must not show Open');
  assert((await evaluate('document.getElementById("od-sidebar-preview-controls").textContent')).includes('仅预览'),
    'Memory-only uninstall must retain preview-only notice');
  await screenshot('extension-uninstalled-360');
  // Regression R24.1: uninstall the selected final row. React must rescue the
  // real DOM-owned detail form before deleting its enclosing React card.
  await click('#tab-my-tasks');
  await until('!document.getElementById("workbench-tasks").hidden');
  // Switching tabs does not silently exit the scheduled-plan subview.
  // Return explicitly to the installed task list before managing tasks.
  await click('#schedule-back');
  await until('!document.querySelector("#workbench-tasks .tasks-surface").hidden');
  await click('#task-manage-toggle');
  await until('document.getElementById("task-manage-toggle").getAttribute("aria-pressed")==="true"');
  await click('#task-uninstall');
  await until('!document.getElementById("task-uninstall-confirm").hidden');
  await click('#task-uninstall-yes');
  await until('document.querySelectorAll("#task-installed-cards .task-card").length===0');
  assert.equal(await evaluate('!!document.getElementById("task-selected-workspace")'),true,
    'Selected row removal must preserve the single trusted task workspace');
  assert.equal(await evaluate('!!document.getElementById("task-tools")'),true,
    'Selected uninstall cannot destroy More actions or unmount React');
  await screenshot('my-task-uninstalled-360');
  await click('#task-open-catalog');
  await until('!document.getElementById("task-add-menu").hidden');
  await click('#task-add-catalog');
  await until('!document.getElementById("workbench-discover").hidden');
  await click('#task-catalog-back');
  await until('!document.querySelector("#workbench-tasks .tasks-surface").hidden');
  assert.equal(await evaluate('document.querySelectorAll("#task-installed-cards .task-card").length'),0,
    'Returning from catalog must keep an emptied installed list without remounting');
  assert.deepEqual(exceptions,[],'Browser errors');
  console.log(JSON.stringify({kind:'SOURCE_BOUND_UI_PREVIEW_CHROMIUM',status:'PASS',
    checks:['real clicks: task collapse/reopen/switch','search','catalog','schedule form',
      'schedule memory review','workflow history and unsaved draft',
      'preview send/Host boundary','extension file choose','import review','in-memory install',
      'installed app usage, header and settings','same-ID update without duplicate',
      'uninstall review and available-list return',
      'preview-only boundary preserved'],nativeChrome:'NOT_TESTED'}));
}finally{
  try{socket?.close()}catch{}
  try{chrome?.kill('SIGTERM')}catch{}
  await sleep(140);
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
