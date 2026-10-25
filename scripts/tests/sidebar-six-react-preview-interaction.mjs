#!/usr/bin/env node
// SOURCE_BOUND_UI_PREVIEW_CHROMIUM: real CDP input against the official React preview.
// Fixtures prove UI behavior only, never installed Chrome/Host/Native behavior.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir,homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const root=fileURLToPath(new URL('../../',import.meta.url));
const chromeBin=process.env.CHROME_BIN||[
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  join(homedir(),'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
  '/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'
].find(existsSync);
assert(chromeBin&&existsSync(chromeBin),'Chrome/Chromium required; set CHROME_BIN to its executable');
const html=resolve(root,'prototypes/sidebar/react-preview/index.html');
const htmlBytes=await readFile(html);
const profile=await mkdtemp(join(tmpdir(),'opendesk-six-tabs-cdp-'));
const artifacts=resolve(root,'artifacts/sidebar-six-react-preview');
await mkdir(artifacts,{recursive:true});
let chrome,socket,port=0,sequence=0,phase='launch',spawnError;
const pending=new Map(),exceptions=[],checks=[],screenshots=[],observations=[];
const report={kind:'SOURCE_BOUND_UI_PREVIEW_CHROMIUM',status:'RUNNING',
  executable:chromeBin,html,htmlSha256:createHash('sha256').update(htmlBytes).digest('hex'),
  input:'CDP Input.dispatchMouseEvent / Input.dispatchKeyEvent / Input.insertText; DOM.setFileInputFiles',
  nativeChrome:'NOT_TESTED',installedExtension:'NOT_TESTED',nativeHost:'NOT_TESTED',checks,screenshots,observations};
function cdp(method,params={}){
  return new Promise((ok,bad)=>{
    const id=++sequence;
    const timer=setTimeout(()=>{pending.delete(id);bad(Error('CDP timeout '+method));},15000);
    pending.set(id,{ok:r=>{clearTimeout(timer);ok(r);},bad:e=>{clearTimeout(timer);bad(e);}});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const value=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(value.exceptionDetails)throw Error('Browser: '+JSON.stringify(value.exceptionDetails));
  return value.result.value;
}
async function until(expression){
  let lastError;
  for(let i=0;i<110;i++){
    try{if(await evaluate(expression))return;}catch(error){lastError=error.message;}
    await sleep(80);
  }
  throw Error(phase+': condition not reached: '+expression+'; lastError='+lastError+
    '; exceptions='+JSON.stringify(exceptions));
}
const frames=()=>evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
async function pointerTarget(selector){
  return evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});
    if(!n)return null;
    n.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
    const b=n.getBoundingClientRect(),x=b.left+b.width/2,y=b.top+b.height/2;
    const h=document.elementFromPoint(x,y);
    return {x,y,w:b.width,h:b.height,visible:!n.closest('[hidden],[inert]')&&
      getComputedStyle(n).visibility==='visible',hit:h===n||n.contains(h)};
  })()`);
}
async function click(selector){
  // Hover can rerender a row or move a control: recheck actual compositor hit
  // targets after frames settle instead of extending fixed click delays.
  let box,ready=false;
  for(let attempt=0;attempt<20;attempt++){
    box=await pointerTarget(selector);
    assert(box,phase+': missing '+selector);
    await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:box.x,y:box.y,button:'none'});
    await frames();
    const next=await pointerTarget(selector);
    if(next?.visible&&next.hit&&next.w>0&&next.h>0&&
      Math.abs(next.x-box.x)<1&&Math.abs(next.y-box.y)<1){box=next;ready=true;break;}
  }
  assert(ready,phase+': '+selector+' must receive native pointer input '+JSON.stringify(box));
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:box.x,y:box.y,button:'left',clickCount:1});
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:box.x,y:box.y,button:'left',clickCount:1});
}
async function key(key,code=key,modifiers=0,commands){
  const windowsVirtualKeyCode={Backspace:8,Tab:9,Enter:13,Escape:27,Home:36,End:35,
    ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,a:65}[key];
  const params={key,code,modifiers,windowsVirtualKeyCode};
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',...params,...(commands?{commands}: {})});
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',...params});
}
async function fill(selector,text){
  await click(selector);
  // Headless macOS does not resolve Cmd+A through an AppKit menu. Supply the
  // same native editing command through CDP and prove the selected range.
  await key('a','KeyA',process.platform==='darwin'?4:2,['selectAll']);
  await until(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});
    return n.selectionStart===0&&n.selectionEnd===n.value.length;})()`);
  if(text)await cdp('Input.insertText',{text});
  else await key('Backspace');
  await until(`document.querySelector(${JSON.stringify(selector)}).value===${JSON.stringify(text)}`);
}
async function screenshot(name){
  await frames();const result=await cdp('Page.captureScreenshot',{format:'png'});
  // Keep the existing CI artifact glob (*.png); prefix our files to avoid
  // overwriting another preview driver's captures.
  const path=join(artifacts,'interaction-'+name+'.png');
  await writeFile(path,Buffer.from(result.data,'base64'));screenshots.push(path);
}
async function step(name,run){phase=name;await run();checks.push(name);}
async function selectedTab(tab,id){
  await until(`document.documentElement.dataset.opendeskTab===${JSON.stringify(tab)} &&
    document.getElementById(${JSON.stringify(id)}).getAttribute('aria-selected')==='true' &&
    !document.getElementById(${JSON.stringify('workbench-'+tab)}).hidden`);
  assert.deepEqual(await evaluate(`({selected:document.querySelectorAll('[role=tab][aria-selected=true]').length,
    tabStops:document.querySelectorAll('[role=tab][tabindex="0"]').length,
    panels:[...document.querySelectorAll('#workspace-content > [role=tabpanel]')]
      .filter(n=>!n.hidden).map(n=>n.id)})`),{selected:1,tabStops:1,panels:['workbench-'+tab]});
}
async function navigate(tab,id){await click('#'+id);await selectedTab(tab,id);}
async function openMenu(){
  await click('#extension-center-more');await until('!document.getElementById("extension-center-menu").hidden');
}
async function closeMenu(){
  await key('Escape');await until('document.getElementById("extension-center-menu").hidden');
}
async function rowIds(){
  return evaluate('[...document.querySelectorAll("#extension-center-list [data-extension-id]")].map(n=>n.dataset.extensionId)');
}
async function chooseFile(name,value){
  const path=join(profile,name);await writeFile(path,typeof value==='string'?value:JSON.stringify(value));
  const {root:documentNode}=await cdp('DOM.getDocument');
  const {nodeId}=await cdp('DOM.querySelector',{nodeId:documentNode.nodeId,selector:'#sidebar-tool-file'});
  assert(nodeId,'official file chooser must exist');
  await cdp('DOM.setFileInputFiles',{nodeId,files:[path]});
}
try{
  chrome=spawn(chromeBin,['--headless=new','--no-sandbox','--disable-gpu',
    '--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--window-size=800,1050',
    '--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'],{stdio:['ignore','ignore','pipe']});
  chrome.once('error',error=>{spawnError=error;});
  let stderr='';chrome.stderr.on('data',d=>{stderr=(stderr+d).slice(-6000);});
  for(let i=0;i<280;i++){
    if(spawnError)throw spawnError;
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
  report.browser=await cdp('Browser.getVersion');
  await cdp('Runtime.enable');await cdp('Page.enable');await cdp('DOM.enable');
  await cdp('Page.navigate',{url:pathToFileURL(html).href});
  await step('official React boot and preview-only provenance',async()=>{
    await until('document.documentElement.dataset.previewBootScript==="ready"');
    assert.equal(await evaluate('document.documentElement.dataset.previewProof'),'UI_PREVIEW_ONLY');
    assert.equal(await evaluate('document.querySelector("meta[name=od-preview-proof]").content'),'UI_PREVIEW_ONLY');
    report.source=await evaluate(`Object.fromEntries(['od-source-input-sha256','od-bundle-source-sha256']
      .map(name=>[name,document.querySelector('meta[name="'+name+'"]').content]))`);
    for(const [name,hash]of Object.entries(report.source)){
      assert.match(hash,/^[a-f0-9]{64}$/);
      assert(htmlBytes.includes(Buffer.from(`<meta name="${name}" content="${hash}">`)),
        'Preview regenerated between reading and loading; rerun against its new identity');
    }
    assert.equal(await evaluate('document.querySelectorAll("#opendesk-react-app").length'),1);
    await selectedTab('tools','tab-tools');
  });
  await step('approved AI sheet: 320px layout, protocol guard, secret and Cancel/Save',async()=>{
    const url=pathToFileURL(html);
    url.searchParams.set('tab','workflow');
    url.searchParams.set('ai-settings','1');
    url.searchParams.set('width','320');
    await cdp('Page.navigate',{url:url.href});
    await until('document.documentElement.dataset.previewBootScript==="ready"');
    await until('!!document.querySelector(".workflow-sheet-overlay .od-shared-provider-segments")');
    assert.equal(await evaluate('document.documentElement.dataset.previewProof'),'UI_PREVIEW_ONLY');
    assert.deepEqual(await evaluate('[...document.querySelectorAll(".od-shared-provider-segments input[type=radio]")].map(n=>n.value)'),
      ['local_codex','https']);
    const layout=await evaluate(`(()=>{
      const sheet=document.querySelector('.od-shared-provider-sheet'),
        rail=document.querySelector('.od-shared-provider-segments'),
        actions=document.querySelector('.od-shared-provider-actions');
      const s=sheet.getBoundingClientRect(),r=rail.getBoundingClientRect(),a=actions.getBoundingClientRect();
      return {sheetWidth:s.width,railWidth:r.width,footerInside:a.bottom<=s.bottom+1,
        footerHeight:a.height,scrollOwner:!!document.querySelector('.od-shared-provider-scroll')};
    })()`);
    assert.ok(layout.railWidth>=layout.sheetWidth-46,'two-option rail should fill approved sheet content width');
    assert.equal(layout.footerInside,true,'Save and Cancel must stay inside the 320px sheet');
    assert.ok(layout.footerHeight>=36&&layout.scrollOwner,'body scroll and fixed footer exist');
    await click('.od-shared-provider-segment:last-child span');
    await until('!!document.getElementById("od-ai-provider-endpoint")');
    await fill('#od-ai-provider-endpoint','https://api.example.test/custom/endpoint');
    await fill('#od-ai-provider-model','preview-model');
    await click('.od-shared-provider-actions button[type=submit]');
    await until('!!document.querySelector(".od-shared-provider-scroll [role=alert]")');
    assert.match(await evaluate('document.querySelector(".od-shared-provider-scroll [role=alert]").textContent'),
      /接口路径无法识别协议/);
    await click('button[aria-label="清空接口地址"]');
    assert.equal(await evaluate('document.getElementById("od-ai-provider-endpoint").value'),'');
    await fill('#od-ai-provider-endpoint','https://api.openai.com/v1/responses');
    assert.match(await evaluate('document.querySelector(".od-shared-provider-protocol-note").textContent'),
      /Responses/);
    await fill('#od-ai-provider-key','temporary-preview-key');
    await click('button[aria-label="显示 API Key"]');
    assert.equal(await evaluate('document.getElementById("od-ai-provider-key").type'),'text');
    await click('button[aria-label="隐藏 API Key"]');
    assert.equal(await evaluate('document.getElementById("od-ai-provider-key").type'),'password');
    await evaluate('document.querySelector(".od-shared-provider-scroll").scrollTop=9999');
    assert.equal(await evaluate('(()=>{const a=document.querySelector(".od-shared-provider-actions").getBoundingClientRect(),s=document.querySelector(".od-shared-provider-sheet").getBoundingClientRect();return a.bottom<=s.bottom+1&&a.height>=36})()'),true);
    await screenshot('workflow-approved-r239-bottom-sheet-320');
    await click('.od-shared-provider-actions button[type=submit]');
    await until('!document.querySelector(".workflow-sheet-overlay")');
    await click('#workflow-provider-toggle');
    await until('!!document.getElementById("workflow-source-menu")');
    await click('#workflow-source-menu [role=menuitem]');
    await until('!!document.querySelector(".od-shared-provider-segments")');
    assert.equal(await evaluate('document.querySelector(".od-shared-provider-segment:last-child input").checked'),true);
    assert.equal(await evaluate('document.getElementById("od-ai-provider-endpoint").value'),
      'https://api.openai.com/v1/responses');
    assert.equal(await evaluate('document.getElementById("od-ai-provider-model").value'),'preview-model');
    assert.equal(await evaluate('document.getElementById("od-ai-provider-key").value'),'',
      'API key must never be rehydrated into the UI draft');
    assert.match(await evaluate('document.getElementById("od-ai-provider-key").placeholder'),/已配置/);
    await fill('#od-ai-provider-endpoint','https://api.openai.com/v1/chat/completions');
    await click('.od-shared-provider-actions button[type=button]');
    await until('!document.querySelector(".workflow-sheet-overlay")');
    await click('#workflow-provider-toggle');
    await until('!!document.getElementById("workflow-source-menu")');
    await click('#workflow-source-menu [role=menuitem]');
    await until('!!document.getElementById("od-ai-provider-endpoint")');
    assert.equal(await evaluate('document.getElementById("od-ai-provider-endpoint").value'),
      'https://api.openai.com/v1/responses','Cancel must discard unsaved endpoint edits');
    await screenshot('workflow-approved-r239-saved-reopen');
    await cdp('Page.navigate',{url:pathToFileURL(html).href});
    await until('document.documentElement.dataset.previewBootScript==="ready"');
    await selectedTab('tools','tab-tools');
  });
  await step('six Tab pointer navigation and keyboard roving focus',async()=>{
    const tabs=[['tasks','tab-my-tasks'],['tools','tab-tools'],['workflow','tab-workflow'],
      ['develop','tab-develop'],['cloud','tab-cloud'],['debug','tab-debug']];
    assert.deepEqual(await evaluate('[...document.querySelectorAll("[role=tab]")].map(n=>n.textContent)'),
      ['我的','扩展','工作流','开发','云控','调试']);
    for(const [tab,id]of tabs)await navigate(tab,id);
    for(const [pressed,tab,id]of [['Home','tasks','tab-my-tasks'],['ArrowRight','tools','tab-tools'],
      ['ArrowLeft','tasks','tab-my-tasks'],['End','debug','tab-debug'],['ArrowRight','tasks','tab-my-tasks']]){
      await key(pressed);await selectedTab(tab,id);
      assert.equal(await evaluate('document.activeElement.id'),id);
    }
    await screenshot('six-tabs-my');
  });
  await step('My search disclosure without fabricated installed tasks',async()=>{
    assert.match(await evaluate('document.getElementById("task-installed-count").textContent'),/无真实安装任务/);
    assert.equal(await evaluate('document.querySelectorAll("#task-installed-cards .task-card").length'),0);
    await click('#task-search-toggle');await until('!document.getElementById("task-search-panel").hidden');
    await click('#task-search-toggle');await until('document.getElementById("task-search-panel").hidden');
  });
  let initialRows;
  await step('extension search, kind/scope filters and detail return',async()=>{
    await navigate('tools','tab-tools');initialRows=await rowIds();
    assert(initialRows.includes('app:demo-reading')&&initialRows.includes('page:demo-markup'));
    await openMenu();await click('[data-ec-kind="page"]');
    await until('document.querySelectorAll("#extension-center-list [data-extension-id]").length===1');
    assert.deepEqual(await rowIds(),['page:demo-markup']);
    await click('[data-ec-scope="available"]');await until('!document.getElementById("extension-center-empty").hidden');
    assert.deepEqual(await rowIds(),[]);
    await click('[data-ec-kind="app"]');
    await until('!!document.querySelector("[data-extension-id=\\"app:demo-import\\"]")');
    await closeMenu();await click('[data-extension-id="app:demo-import"] .ec-row-main');
    await until('!document.getElementById("extension-center-detail").hidden');
    assert.match(await evaluate('document.getElementById("extension-center-detail-body").textContent'),/尚未安装/);
    assert.equal(await evaluate('document.querySelectorAll("[data-ec-detail-action=install]").length'),0);
    await click('#extension-center-back');await until('document.getElementById("extension-center-detail").hidden');
    assert.equal(await evaluate('document.querySelector("[data-ec-kind=app]").getAttribute("aria-pressed")'),'true');
    assert.equal(await evaluate('document.querySelector("[data-ec-scope=available]").getAttribute("aria-pressed")'),'true');
    await openMenu();await click('#extension-center-reset');
    await until('document.getElementById("extension-center-menu").hidden');
    assert.deepEqual(await rowIds(),initialRows);
    await fill('#extension-center-search','不存在的演示扩展');
    await until('!document.getElementById("extension-center-empty").hidden');
    await fill('#extension-center-search','标注');assert.deepEqual(await rowIds(),['page:demo-markup']);
    await click('[data-extension-id="page:demo-markup"] .ec-row-main');
    await until('!document.getElementById("extension-center-detail").hidden');
    const detail=await evaluate('document.getElementById("extension-center-detail-body").textContent');
    assert.match(detail,/https:\/\/example\.com\/\*/);assert.match(detail,/无真实授权/);
    await screenshot('extension-page-detail');
    await click('#extension-center-back');await until('document.getElementById("extension-center-detail").hidden');
    assert.equal(await evaluate('document.getElementById("extension-center-search").value'),'标注');
    assert.deepEqual(await rowIds(),['page:demo-markup']);await fill('#extension-center-search','');
  });
  await step('demo detail uninstall cancel/Escape/focus trap and trusted confirmation',async()=>{
    await click('[data-extension-id="app:demo-reading"] .ec-row-main');
    await until('!document.getElementById("extension-center-detail").hidden');
    await click('[data-ec-detail-action="uninstall"]');
    await until('!!document.querySelector(".od-uninstall-dialog[aria-modal=true]")');
    assert.match(await evaluate('document.querySelector(".od-uninstall-dialog").textContent'),/demo-reading/);
    assert.equal(await evaluate('document.activeElement.hasAttribute("data-uninstall-cancel")'),true);
    await key('Tab');assert.equal(await evaluate('document.activeElement.matches(".od-uninstall-confirm")'),true);
    await key('Tab');assert.equal(await evaluate('document.activeElement.matches(".od-uninstall-close")'),true);
    await key('Tab','Tab',8);assert.equal(await evaluate('document.activeElement.matches(".od-uninstall-confirm")'),true);
    await key('Escape');await until('!document.querySelector(".od-uninstall-dialog")');
    assert.equal(await evaluate('document.activeElement.dataset.ecDetailAction'),'uninstall');
    await click('[data-ec-detail-action="uninstall"]');await until('!!document.querySelector(".od-uninstall-dialog")');
    await click('[data-uninstall-cancel]');await until('!document.querySelector(".od-uninstall-dialog")');
    await click('#extension-center-back');await until('document.getElementById("extension-center-detail").hidden');
    assert.deepEqual(await rowIds(),initialRows,'cancel must preserve all demo entries');
    await click('[data-extension-id="app:demo-reading"] .ec-row-main');
    await until('!document.getElementById("extension-center-detail").hidden');
    await click('[data-ec-detail-action="uninstall"]');await until('!!document.querySelector(".od-uninstall-dialog")');
    await screenshot('extension-uninstall-confirmation');await click('.od-uninstall-confirm');
    await until('document.getElementById("extension-center-detail").hidden');
    assert.deepEqual(await rowIds(),initialRows.filter(id=>id!=='app:demo-reading'));
    assert.match(await evaluate('document.getElementById("extension-center-status").textContent'),/仅内存演示，没有真实卸载或权限变更/);
    assert.equal(await evaluate('document.activeElement.id'),'extension-center-search');
  });
  await step('demo row menu close, uninstall cancel and list removal',async()=>{
    const more='[data-extension-id="page:demo-markup"] .ec-row-more';
    await click(more);await until('!!document.getElementById("extension-center-row-menu")');
    await key('Escape');await until('!document.getElementById("extension-center-row-menu")');
    const escapedFocus=await evaluate('document.activeElement.dataset.extensionKey');
    assert.equal(escapedFocus,'page:demo-markup','Escape restores the row menu trigger');
    await click(more);await until('!!document.getElementById("extension-center-row-menu")');
    await click('[data-ec-context-action="uninstall"]');await until('!!document.querySelector(".od-uninstall-dialog")');
    assert.match(await evaluate('document.querySelector(".od-uninstall-identity").textContent'),/demo-markup/);
    await click('[data-uninstall-cancel]');await until('!document.querySelector(".od-uninstall-dialog")');
    assert.equal(await evaluate('document.activeElement.dataset.extensionKey'),'page:demo-markup');
    assert((await rowIds()).includes('page:demo-markup'));
    await click(more);await until('!!document.getElementById("extension-center-row-menu")');
    await click('[data-ec-context-action="uninstall"]');await until('!!document.querySelector(".od-uninstall-dialog")');
    await click('.od-uninstall-confirm');await until('!document.querySelector(".od-uninstall-dialog")');
    assert.deepEqual(await rowIds(),initialRows.filter(id=>!['app:demo-reading','page:demo-markup'].includes(id)));
  });
  await step('Tool/Page file metadata, invalid files and disabled real installation',async()=>{
    const before=await rowIds(),framesBefore=await evaluate('document.querySelectorAll("iframe").length');
    await openMenu();await click('#extension-center-import');
    await until('!document.getElementById("sidebar-tool-import").hidden');
    assert.equal(await evaluate('document.getElementById("extension-center-menu").hidden'),true);
    for(const format of ['opendesk.sidebar-tool.v1','opendesk.sidebar-tool.v2']){
      const fileName='tool-'+format.at(-1)+'.json';
      await chooseFile(fileName,{format,id:'preview-import',title:'仅文件元数据 <b>不执行</b>',
        version:'1.3.0',capabilities:['storage.local'],html:'<script>globalThis.__metadataCodeRan=true</script>',
        css:'',js:'globalThis.__metadataCodeRan=true'});
      await until('!document.getElementById("sidebar-tool-preview").hidden');
      await until(`document.getElementById('sidebar-tool-preview-file').textContent.includes(${JSON.stringify(fileName)})`);
      assert.equal(await evaluate('document.getElementById("sidebar-tool-preview-title").textContent'),'仅文件元数据 <b>不执行</b>');
      assert.equal(await evaluate('document.querySelectorAll("#sidebar-tool-preview-title b").length'),0);
      assert.match(await evaluate('document.getElementById("sidebar-tool-preview-version").textContent'),/1\.3\.0/);
      assert.match(await evaluate('document.getElementById("sidebar-tool-preview-capabilities").textContent'),/storage\.local/);
      assert.equal(await evaluate('document.getElementById("sidebar-tool-install").disabled'),true);
      await click('#sidebar-tool-install');assert.deepEqual(await rowIds(),before,'disabled preview button must not install');
    }
    await chooseFile('page.json',{format:'opendesk.page-install.v1',programId:'preview-page',
      title:'网页增强元数据',version:'2.0.0',revision:3,pageRules:{matches:['https://example.com/*']}});
    await until('document.getElementById("sidebar-tool-preview-title").textContent==="网页增强元数据"');
    assert.match(await evaluate('document.getElementById("sidebar-tool-preview-version").textContent'),/r3/);
    assert.match(await evaluate('document.getElementById("sidebar-tool-preview-capabilities").textContent'),/https:\/\/example\.com\/\*/);
    assert.equal(await evaluate('document.getElementById("sidebar-tool-install").disabled'),true);
    assert.equal(await evaluate('document.getElementById("sidebar-tool-update").hidden'),true);
    assert.equal(await evaluate('Boolean(window.__metadataCodeRan)'),false);
    assert.equal(await evaluate('document.querySelectorAll("iframe").length'),framesBefore,'file metadata must not launch package UI');
    await screenshot('extension-file-metadata-only');
    for(const [name,value,reason]of [['invalid.json','{broken',/仅预览/],
      ['identity.json',{format:'opendesk.sidebar-tool.v2',title:'missing ID',version:'1'},/身份/],
      ['oversized.json',' '.repeat(1024*1024+1),/1 MiB/]]){
      await chooseFile(name,value);await until('!document.getElementById("sidebar-tool-file-error").hidden');
      assert.match(await evaluate('document.getElementById("sidebar-tool-file-error").textContent'),reason);
      assert.equal(await evaluate('document.getElementById("sidebar-tool-preview").hidden'),true);
    }
    await click('#sidebar-tool-import-close');await until('document.getElementById("sidebar-tool-import").hidden');
    await openMenu();await click('#extension-center-import');await until('!document.getElementById("sidebar-tool-import").hidden');
    assert.equal(await evaluate('document.getElementById("sidebar-tool-file").value'),'');
    assert.equal(await evaluate('document.getElementById("sidebar-tool-preview").hidden'),true);
    assert.equal(await evaluate('document.getElementById("sidebar-tool-file-error").hidden'),true);
    await key('Escape');await until('document.getElementById("sidebar-tool-import").hidden');assert.deepEqual(await rowIds(),before);
  });
  await step('workflow suggestions, settings, draft retention and disconnected controls',async()=>{
    await navigate('workflow','tab-workflow');
    assert.equal(await evaluate('document.getElementById("workflow-ai-plan").disabled'),true);
    await click('[data-workflow-example="fill"]');await until('document.getElementById("workflow-ai-request").value.includes("填写")');
    await fill('#workflow-ai-request','保留未发送草稿');
    await click('#workflow-provider-toggle');await until('!document.querySelector(".workflow-sheet-overlay").hidden');
    assert.equal(await evaluate('document.getElementById("workflow-local-connect").disabled'),true);
    assert.equal(await evaluate('document.getElementById("workflow-local-connected").hidden'),true);
    await click('.workflow-sheet-panel button[aria-label="关闭 AI 设置"]');await until('document.querySelector(".workflow-sheet-overlay").hidden');
    assert.equal(await evaluate('document.getElementById("workflow-ai-request").value'),'保留未发送草稿');
    // Header callbacks (onNewSession/onNewWorkflow/onHistory) are not connected
    // by this preview adapter. Do not revive retired fixture workflow history.
    observations.push({behavior:'workflow history/new-session/new-workflow',result:'NOT_CONNECTED',
      owner:'preview adapter workflowActions',
      detail:'Current header uses onHistory/onNewSession/onNewWorkflow, adapter only supplies click(id). Production controller not exercised.'});
    await click('[data-workflow-example="read"]');await until('document.getElementById("workflow-ai-request").value.includes("读取")');
    await navigate('tools','tab-tools');await navigate('workflow','tab-workflow');
    assert.match(await evaluate('document.getElementById("workflow-ai-request").value'),/读取/);
    await screenshot('workflow-preview-disconnected');
  });
  await step('developer draft, local project switch and Native boundary',async()=>{
    await navigate('develop','tab-develop');
    const draft='async function main() { return "保留草稿"; }';await fill('#script-source',draft);
    for(const id of ['script-run','script-save','script-stop','page-program-install'])
      assert.equal(await evaluate(`document.getElementById(${JSON.stringify(id)}).disabled`),true,id);
    await click('#local-project-mode');await until('!document.getElementById("local-project-tools").hidden');
    assert.equal(await evaluate('document.getElementById("manual-source-editor").hidden'),true);
    // Focus the collapsed select through the real keyboard path. macOS popup
    // menus are outside headless CDP hit testing; native type-ahead selects the
    // Controller option without opening that platform popup.
    for(let i=0;i<12&&await evaluate('document.activeElement.id!=="local-project-select"');i++)await key('Tab');
    assert.equal(await evaluate('document.activeElement.id'),'local-project-select');
    await cdp('Input.dispatchKeyEvent',{type:'char',key:'c',code:'KeyC',text:'c'});
    await until('document.getElementById("local-project-select").value==="preview-controller"');
    await until('!document.getElementById("local-project-params-tools").hidden');
    assert.match(await evaluate('document.getElementById("local-project-status").textContent'),/无法运行或安装/);
    await click('#local-project-refresh');await until('document.getElementById("local-project-status").textContent.includes("无法读取 Native")');
    await click('#local-project-connect');await until('document.getElementById("local-project-status").textContent.includes("离线文件不能连接")');
    await click('#local-project-guide > summary');await until('document.getElementById("local-project-guide").open');
    await click('#local-project-guide-open');
    await until('document.getElementById("local-project-status").textContent.includes("下方展示正式项目授权")');
    await screenshot('developer-local-project');
    await click('#local-project-mode');await until('document.getElementById("local-project-tools").hidden');
    assert.equal(await evaluate('document.getElementById("script-source").value'),draft);
    await navigate('tools','tab-tools');await navigate('develop','tab-develop');
    assert.equal(await evaluate('document.getElementById("script-source").value'),draft);
  });
  await step('cloud/debug read-only controls and browser-history permission boundary',async()=>{
    await navigate('cloud','tab-cloud');
    for(const id of ['cloud-open-console','cloud-overview-refresh'])
      assert.equal(await evaluate(`document.getElementById(${JSON.stringify(id)}).disabled`),true);
    await navigate('debug','tab-debug');
    for(const id of ['debug-refresh','debug-copy','trusted-history-search'])
      assert.equal(await evaluate(`document.getElementById(${JSON.stringify(id)}).disabled`),true);
    await click('#trusted-history-panel > summary');await until('document.getElementById("trusted-history-panel").open');
    assert.equal(await evaluate('document.getElementById("trusted-history-panel").dataset.historyPermission'),'unknown');
    assert.equal(await evaluate('document.getElementById("trusted-history-text").readOnly'),true);
    assert.equal(await evaluate('document.getElementById("trusted-history-results").textContent'),'');
    assert.match(await evaluate('document.getElementById("trusted-history-status").textContent'),/不读取浏览器历史/);
    await screenshot('debug-history-read-only');
  });
  assert.deepEqual(exceptions,[],'Browser errors');report.status='PASS';
}catch(error){
  report.status='FAIL';report.phase=phase;report.error=error.stack||String(error);
  try{report.page=await evaluate('({url:location.href,data:{...document.documentElement.dataset},focus:document.activeElement?.id,value:document.activeElement?.value})');
    await screenshot('failure');}catch{}
  process.exitCode=1;
}finally{
  report.exceptions=exceptions;
  await writeFile(join(artifacts,'interaction-result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
  try{socket?.close();}catch{}
  // Terminate only the Chrome process created above, never a shared browser.
  if(chrome?.pid&&chrome.exitCode===null){
    chrome.kill('SIGTERM');
    for(let i=0;i<50&&chrome.exitCode===null&&chrome.signalCode===null;i++)await sleep(100);
    if(chrome.exitCode===null&&chrome.signalCode===null)chrome.kill('SIGKILL');
  }
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
