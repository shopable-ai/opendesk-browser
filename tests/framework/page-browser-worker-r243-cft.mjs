// Actual Chrome for Testing, ORIGINAL isolated launcher, no Native Host.
// This verifies extension CSP and private Worker module closure. It does NOT
// use CDP as a user-script executor or forge Page USER_SCRIPT run receipts.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WebSocket} from 'ws';
import {launchLocalDevChrome} from './local-dev-cft-launcher.mjs';
import {runBrowserComponentCycles} from './page-browser-ui-r243-cycles.mjs';
import {runR72PageClassicCycle} from './page-dependency-r72-cft-cycle.mjs';
import {runR78D3RestartCycle} from './controller-d3-restart-r78-cft-cycle.mjs';

const root=process.cwd(),output=path.resolve(process.env.OPENDESK_DEV_EVIDENCE||
  '.runtime/tests/page-browser-worker-r243'),packageRoot=path.resolve(process.env.OPENDESK_DEV_PACKAGE_DIR||'dist/production');
fs.mkdirSync(output,{recursive:true});
const binary=process.env.CHROME_FOR_TESTING_BIN;
const r77Focus=process.env.OPENDESK_R77_IMPORT_SCENARIOS;
if(r77Focus){
  assert(['d3','classic'].includes(r77Focus),'R77 focus must be d3 or classic');
  assert.equal(process.env.OPENDESK_R243_BROWSER_FULL_UI,'1','R77 requires the real UI driver');
  assert.equal(process.env.OPENDESK_R72_DEPENDENCY_NATIVE_SMOKE,'1','R77 requires the dependency scenario driver');
  assert.notEqual(process.env.OPENDESK_R245_STANDARD_SMOKE,'1','R77 Developer focus cannot skip Standard validation');
}
if(process.env.OPENDESK_R78_OFFLINE_RESTART==='1'){
  assert.equal(r77Focus,'classic','R78 restart requires the completed ChromePage/D3 cycle');
  assert.equal(process.env.OPENDESK_DEV_CHROME_RESTART,'1','R78 restart requires the existing same-profile adapter');
}
if(process.env.OPENDESK_R78_ALL_SCENARIOS==='1')
  assert.equal(r77Focus,'classic','R78 combined acceptance extends the original classic focus');
if(!binary||!fs.existsSync(binary))throw Error('Chrome for Testing binary is required');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'opendesk-browser-worker-'));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,timeout=25000){
  const end=Date.now()+timeout;let cause;
  while(Date.now()<end){try{const result=await fn();if(result)return result;}catch(error){cause=error;}
    await pause(100);}
  throw new Error(label+' timed out'+(cause?': '+cause.message:''));
}
async function cdp(uri){
  const socket=new WebSocket(uri),pending=new Map(),listeners=new Map();let currentId=0;
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  socket.on('message',raw=>{
    const row=JSON.parse(String(raw));
    if(row.id){const task=pending.get(row.id);if(!task)return;pending.delete(row.id);clearTimeout(task.timer);
      if(row.error)task.reject(Error(row.error.message));else task.resolve(row.result);return;}
    for(const handler of listeners.get(row.method)||[])handler(row.params);
  });
  const closed=()=>{for(const task of pending.values()){clearTimeout(task.timer);task.reject(Error('CDP closed'));}pending.clear();};
  socket.on('close',closed);
  const call=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++currentId,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP '+method+' timed out'));},35000);
    pending.set(id,{resolve,reject,timer});
    try{socket.send(JSON.stringify({id,method,params}));}catch(error){clearTimeout(timer);pending.delete(id);reject(error);}
  });
  const read=async expression=>{
    const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails)throw Error(result.exceptionDetails.text||'Runtime exception');
    return result.result?.value;
  };
  return {call,read,on:(method,fn)=>{const set=listeners.get(method)||new Set();set.add(fn);listeners.set(method,set);},
    close:()=>socket.close()};
}

async function clickReal(session,expression){
  const collapsed=await session.read('(()=>{const e=('+expression+');const d=e?.closest("details:not([open])");return !!d&&!!d.querySelector(":scope > summary")&&!d.querySelector(":scope > summary").contains(e)})()');
  if(collapsed)await clickReal(session,'('+expression+').closest("details:not([open])").querySelector(":scope > summary")');
  const box=await session.read('(()=>{const node=('+expression+');if(!node||node.disabled)return null;'+
    'node.scrollIntoView({block:"center",inline:"center"});const r=node.getBoundingClientRect();'+
    'return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height}})()');
  assert(box?.width>0&&box.height>0&&box.x>0&&box.y>0,'visible, enabled input '+expression);
  for(const type of ['mousePressed','mouseReleased'])
    await session.call('Input.dispatchMouseEvent',{type,x:box.x,y:box.y,button:'left',clickCount:1});
}
async function selectFramework(session,framework){
  assert(['react','vue'].includes(framework));
  const input='document.querySelector("#page-component-'+framework+'")';
  if(await session.read(input+'?.checked===true'))return;
  // The native radio label is activated by a genuine CDP pointer gesture,
  // not Runtime.evaluate, dispatchEvent or a fabricated DOM interaction.
  await clickReal(session,'document.querySelector("label[for=page-component-'+framework+']")');
  await until(()=>session.read(input+'?.checked===true'),
    'trusted browser selection of '+framework,12000);
  await until(()=>session.read('document.querySelector("#script-source").value.includes('+
    JSON.stringify(framework==='react'?"from 'react'":'<script setup>')+')'),
    'official '+framework+' source draft restored',12000);
}
async function verifyBrowserUI({browser,page,catalogTabId,base,extensionId,output,report}){
  const sample=fs.readFileSync(path.join(root,'examples/tasks/demo-form.html'));
  let site,settings,website,sidebar;
  const createTab=async url=>{
    const res=await fetch(base+'/json/new?about%3Ablank',{method:'PUT'});
    assert.equal(res.status,200);
    const info=await res.json(),session=await cdp(info.webSocketDebuggerUrl);
    await session.call('Page.navigate',{url});
    return {info,session};
  };
  try{
    let existingSample;
    try {
      const response=await fetch('http://127.0.0.1:43111/demo-form.html');
      if(response.ok)existingSample=Buffer.from(await response.arrayBuffer());
    } catch(error) { if(error.cause?.code!=='ECONNREFUSED')throw error; }
    if(existingSample){
      assert(existingSample.equals(sample),'Existing 43111 service must serve the exact repository demo-form.html');
      report.fixtureService='REUSED_EXACT_BYTES';
    }else{
    site=http.createServer((req,res)=>{
      if(req.url?.split('?')[0]!=='/demo-form.html'){
        res.writeHead(404);res.end();return;
      }
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(sample);
    });
    await new Promise((resolve,reject)=>{
      site.once('error',reject);site.listen(43111,'127.0.0.1',resolve);
    });
    report.fixtureService='OWNED_43111';
    }
    settings=await createTab('chrome://extensions/?id='+extensionId);
    const detail='document.querySelector("extensions-manager")?.shadowRoot?.querySelector("extensions-detail-view")';
    const toggle='('+detail+')?.shadowRoot?.querySelector("#allow-user-scripts")?.shadowRoot?.querySelector("cr-toggle#crToggle")';
    await until(()=>settings.session.read('('+toggle+')!=null'),'Chrome userScripts actual toggle');
    await browser.call('Target.activateTarget',{targetId:settings.info.id});
    if(!await settings.session.read('('+toggle+').checked'))await clickReal(settings.session,toggle);
    await until(()=>settings.session.read('('+toggle+').checked===true'),'Chrome userScripts granted');
    report.tests.push({name:'r243-browser-ui-userScripts-real-Chrome-optin',
      status:'PASS',nativeHostConfigured:false,control:'chrome://extensions real toggle'});
    website=await createTab('http://127.0.0.1:43111/demo-form.html');
    await browser.call('Target.activateTarget',{targetId:website.info.id});
    await until(()=>website.session.read('document.readyState==="complete"'),'real website ready');
    await until(()=>page.read('document.querySelector("#catalog-open-dev-sidebar")!=null'),
      'real full-catalog sidebar entry');
    await browser.call('Target.activateTarget',{targetId:catalogTabId});
    await clickReal(page,'document.querySelector("#catalog-open-dev-sidebar")');
    await until(()=>page.read('document.querySelector("#catalog-dev-sidebar-status").textContent.includes("已打开侧栏")'),
      'explicit Chrome Side Panel open acknowledgement',15000);
    const sidebarTarget=await until(async()=>{
      const list=await (await fetch(base+'/json/list')).json();
      return list.find(t=>t.url?.startsWith('chrome-extension://'+extensionId+'/ui/tool.html')&&
        t.id!==catalogTabId&&t.webSocketDebuggerUrl);
    },'actual Chrome Side Panel CDP target',20000);
    sidebar=await cdp(sidebarTarget.webSocketDebuggerUrl);
    await until(()=>sidebar.read('document.readyState==="complete"&&location.href.includes("hostInstanceId=")&&document.querySelector("#tab-develop")!=null'),
      'Final Side Panel workbench document available');
    const observePanel=()=>sidebar.read('(async()=>{const e=document.querySelector("#tab-develop");'+
      'const r=e?.getBoundingClientRect();const nav=document.querySelector(".workbench-nav");'+
      'let contexts=[];try{contexts=await chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})}catch(error){contexts=[{error:String(error)}]};'+
      'return {url:location.href,surface:document.documentElement.dataset.opendeskSurface,'+
      'selected:document.documentElement.dataset.opendeskTab,'+
      'navStyle:nav&&getComputedStyle(nav).display,tabVisible:!!(r&&r.width>0&&r.height>0),'+
      'rect:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null,'+
      'currentTab:await chrome.tabs.getCurrent(),contexts:contexts.map(x=>({type:x.contextType,url:x.documentUrl,tabId:x.tabId}))}})()');
    console.log('R243_SIDEPANEL_CONTEXT '+JSON.stringify({
      target:{id:sidebarTarget.id,type:sidebarTarget.type,url:sidebarTarget.url},
      ui:await observePanel()}));
    await until(async()=>{const result=await observePanel();return result.tabVisible?result:null},
      'actual Sidebar Developer tab becomes visible',10000);
    await browser.call('Target.activateTarget',{targetId:website.info.id});
    await clickReal(sidebar,'document.querySelector("#tab-develop")');
    await until(()=>sidebar.read('document.querySelector("#tab-develop").getAttribute("aria-selected")==="true"'),
      'trusted Sidebar developer navigation',10000);
    const permission=await sidebar.read('chrome.permissions.contains({origins:["http://127.0.0.1:43111/*"]})');
    assert.equal(permission,true,'original Chrome website permission must be granted');
    report.currentPageAdmissionObservation=await until(()=>sidebar.read('(async()=>{const win=await chrome.windows.getCurrent();'+
      'const tabs=await chrome.tabs.query({active:true,windowId:win.id});if(tabs.length!==1)return null;'+
      'const frames=await chrome.webNavigation.getAllFrames({tabId:tabs[0].id});const root=frames?.find(r=>r.frameId===0);'+
      'return tabs[0].status==="complete"&&!tabs[0].pendingUrl&&root?.documentId&&!root.errorOccurred&&'+
      'root.documentLifecycle==="active"&&root.url===tabs[0].url?{windowId:win.id,tabs,frames}:null})()'),
      'active Chrome main document available before user Run',20000);
    if(process.env.OPENDESK_R72_DEPENDENCY_NATIVE_SMOKE==='1')
      await runR72PageClassicCycle({sidebar,website,browser,base,extensionId,cdp,until,clickReal,report});
    if(process.env.OPENDESK_R77_IMPORT_SCENARIOS)return;
    if(process.env.OPENDESK_R245_STANDARD_SMOKE==='1'){
      const marker=await sidebar.read('(async()=>{const r=await fetch(chrome.runtime.getURL("framework/browser-edition.json"));'+
        'if(!r.ok)throw Error("E_EDITION_MARKER");return r.json()})()');
      assert.equal(marker.edition,'standard');
      assert.equal(marker.browserComponentCompiler,false);
      const state=await sidebar.read('(()=>{const js=document.querySelector("#page-component-javascript");'+
        'const react=document.querySelector("#page-component-react");'+
        'const vue=document.querySelector("#page-component-vue");'+
        'const hint=document.querySelector("#page-component-hint");'+
        'return {jsChecked:js?.checked,reactDisabled:react?.disabled,vueDisabled:vue?.disabled,'+
        'reactHidden:react?.parentElement?.hidden,vueHidden:vue?.parentElement?.hidden,'+
        'modeRowHidden:document.querySelector("#page-component-editor-tools")?.hidden,'+
        'modeRowDisplay:getComputedStyle(document.querySelector("#page-component-editor-tools")).display,'+
        'sourceLabel:document.querySelector("label[for=script-source]")?.textContent,'+
        'hint:hint?.textContent}})()');
      assert.equal(state.jsChecked,true);
      assert.equal(state.reactDisabled,true);
      assert.equal(state.vueDisabled,true);
      assert.equal(state.reactHidden,true);
      assert.equal(state.vueHidden,true);
      assert.equal(state.modeRowHidden,true);
      assert.equal(state.modeRowDisplay,'none','The Standard editor must not display a one-choice mode picker');
      assert.equal(state.sourceLabel,'JavaScript 源码编辑器');
      assert.match(state.hint,/标准版/);
      report.tests.push({name:'r245-standard-real-chrome-no-browser-compiler-ui',
        status:'PASS',edition:marker.edition,noNative:true,compilerChoicesHidden:true,
        javascriptChoiceRetained:true});
      const screenshot=await sidebar.call('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(path.join(output,'r245-standard-sidepanel.png'),Buffer.from(screenshot.data,'base64'));
      // Run plain JavaScript from a trusted Chrome textarea/Run click to prove
      // removing JSX/SFC compilers did not disable the ordinary Page executor.
      const standardJS='async function main(){'+
        'const node=document.createElement("div");node.id="r245-standard-js-proof";'+
        'node.textContent="Standard JavaScript executed";document.body.append(node);'+
        'return "r245-standard-js-ok";}';
      const typed=await sidebar.read('(()=>{const editor=document.querySelector("#script-source");'+
        'if(!editor||editor.readOnly)return false;editor.focus();editor.select();return true})()');
      assert.equal(typed,true,'Standard JavaScript source textarea must be editable');
      await sidebar.call('Input.insertText',{text:standardJS});
      await until(()=>sidebar.read('document.querySelector("#script-source").value==='+
        JSON.stringify(standardJS)),'genuine Standard editor input',10000);
      if(!await sidebar.read('document.querySelector("#page-preview-tools").open'))
        await clickReal(sidebar,'document.querySelector("#page-preview-tools > summary")');
      await until(()=>sidebar.read('!document.querySelector("#page-preview-run").disabled'),
        'Standard JavaScript run enabled',20000);
      await clickReal(sidebar,'document.querySelector("#page-preview-run")');
      const ran=await until(()=>sidebar.read('(()=>{const node=document.querySelector("#page-preview-status");'+
        'return ["completed","error"].includes(node?.dataset.state)?{state:node.dataset.state,text:node.textContent}:null})()'),
        'real Standard JavaScript admission',60000);
      assert.equal(ran.state,'completed','Standard JavaScript run failed: '+ran.text);
      assert.equal(await website.session.read('document.querySelector("#r245-standard-js-proof")?.textContent'),
        'Standard JavaScript executed');
      const ordinaryReceipt=JSON.parse(await sidebar.read(
        'document.querySelector("#page-preview-technical").textContent'));
      assert.equal(ordinaryReceipt.state,'preview-evaluated');
      assert(/^[a-f0-9]{64}$/.test(ordinaryReceipt.sourceHash));
      report.tests.push({name:'r245-standard-real-chrome-javascript-execution',
        status:'PASS',sourceHash:ordinaryReceipt.sourceHash,
        documentId:ordinaryReceipt.documentId,actualPointerInput:true,
        pageDOMUpdated:true,noNative:true,noBrowserCompiler:true});
      return;
    }
    for(const framework of ['react','vue']){
      await selectFramework(sidebar,framework);
      await until(()=>sidebar.read('document.querySelector("#page-component-'+framework+'").checked===true'),
        'official '+framework+' selected');
      const editor=await sidebar.read('document.querySelector("#script-source").value');
      assert(editor.includes(framework==='react'?"from 'react'":'<script setup>'));
      const active=await sidebar.read('chrome.tabs.query({active:true,currentWindow:true})');
      assert.equal(active.length,1);
      assert.equal(active[0].url,'http://127.0.0.1:43111/demo-form.html',
        'the existing current-tab identity must remain the website');
      const expanded=await sidebar.read('document.querySelector("#page-preview-tools").open');
      if(!expanded)await clickReal(sidebar,'document.querySelector("#page-preview-tools > summary")');
      await until(()=>sidebar.read('!document.querySelector("#page-preview-run").disabled'),
        framework+' Page run enabled',20000);
      await clickReal(sidebar,'document.querySelector("#page-preview-run")');
      const state=await until(()=>sidebar.read('(()=>{const node=document.querySelector("#page-preview-status");'+
        'return ["completed","error"].includes(node?.dataset.state)?{state:node.dataset.state,text:node.textContent}:null})()'),
      framework+' exact Page run completion',60000);
      assert.equal(state.state,'completed',framework+' run error: '+state.text);
      const receipt=JSON.parse(await sidebar.read('document.querySelector("#page-preview-technical").textContent'));
      assert.equal(receipt.state,'preview-evaluated');
      assert.equal(receipt.packagedFrameworkId,framework);
      assert.equal(receipt.managedUI,true);
      assert.ok(receipt.managedPreviewId);
      assert.equal(receipt.authoring?.framework,framework);
      assert(/^[a-f0-9]{64}$/.test(receipt.sourceHash));
      const id='browser-'+framework;
      const rootExpr='document.querySelector('+JSON.stringify('[data-od-id="'+id+'"]')+')';
      await until(()=>website.session.read('('+rootExpr+')?.shadowRoot?.querySelector("button")?.textContent?.includes("已点击 0 次")'),
        framework+' DOM mounted in real webpage',15000);
      await clickReal(website.session,'('+rootExpr+')?.shadowRoot?.querySelector("button")');
      await until(()=>website.session.read('('+rootExpr+')?.shadowRoot?.querySelector("button")?.textContent?.includes("已点击 1 次")'),
        framework+' native pointer updated component state',15000);
      await clickReal(sidebar,'document.querySelector("#script-stop")');
      await until(()=>website.session.read('!('+rootExpr+')'),
        framework+' native managed stop removed DOM',15000);
      const status=await sidebar.read('document.querySelector("#page-component-status").textContent');
      assert(status.includes('已停止'),'UI must acknowledge original Stop receipt');
      const proof={name:'r243-browser-'+framework+'-no-native-real-run-stop',
        status:'PASS',sourceHash:receipt.sourceHash,previewId:receipt.managedPreviewId,
        documentId:receipt.documentId,frameworkSha256:receipt.packagedFrameworkSha256,
        actualPointerInput:true,domClean:true,noNative:true,packageVerified:true};
      report.tests.push(proof);
      await sidebar.call('Page.captureScreenshot',{format:'png'}).then(async image=>
        fs.writeFileSync(path.join(output,'r243-browser-'+framework+'-editor.png'),Buffer.from(image.data,'base64')));
      const image=await website.session.call('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(path.join(output,'r243-browser-'+framework+'-stopped.png'),Buffer.from(image.data,'base64'));
    }
    // The last successfully executed Vue source must NEVER be replayed when
    // the user edits it into a syntax error. Use Chrome's native text input;
    // Runtime.evaluate is used only to select the textarea, never to fake Run.
    const vuePrevious=report.tests.find(row=>row.name==='r243-browser-vue-no-native-real-run-stop');
    assert(vuePrevious?.previewId);
    const editorNode='document.querySelector("#script-source")';
    const originalVue=await sidebar.read(editorNode+'.value');
    const brokenVue='<script setup>import {ref} from "vue"; const = ref(0);</script>'+
      '<template><button>broken</button></template>';
    async function typeSource(source){
      assert.equal(await sidebar.read('(()=>{const editor='+editorNode+
        ';if(!editor)return false;editor.focus();editor.select();return true})()'),true);
      await sidebar.call('Input.insertText',{text:source});
      await until(()=>sidebar.read(editorNode+'.value==='+JSON.stringify(source)),
        'native editor input preserved exact authored bytes',10000);
    }
    await typeSource(brokenVue);
    await until(()=>sidebar.read('!document.querySelector("#page-preview-run").disabled'),
      'invalid source is still reviewable via explicit Run');
    await clickReal(sidebar,'document.querySelector("#page-preview-run")');
    const invalid=await until(()=>sidebar.read('(()=>{const el=document.querySelector("#page-preview-status");'+
      'return el?.dataset.state==="error"?el.textContent:null})()'),
      'syntax-error source rejected by on-demand SFC compiler',60000);
    assert.match(invalid,/E_PAGE_VUE_|E_PAGE_COMPONENT_SYNTAX|E_PAGE_COMPILER_/,
      'Compiler must reject broken source with an actionable error');
    assert.equal(await website.session.read(
      '!document.querySelector("[data-od-id=browser-vue]")'),true,
      'New invalid source must not resurrect previous successful Vue DOM');
    assert.equal(await sidebar.read('document.querySelector("#page-preview-technical").textContent'), '',
      'No previous sourceHash, previewId or success receipt may be reused for failed source');
    report.tests.push({name:'r243-browser-vue-invalid-edit-no-stale-execution',
      status:'PASS',previousPreviewId:vuePrevious.previewId,
      error:invalid.slice(0,240),noOldDOM:true,noStaleReceipt:true,noNative:true});
    // A later corrected source is a separate explicit Run/Stop with its own
    // previewId; a failed transform cannot poison the next valid candidate.
    await typeSource(originalVue);
    await until(()=>sidebar.read('!document.querySelector("#page-preview-run").disabled'),
      'corrected Vue source ready for explicit user Run',15000);
    await clickReal(sidebar,'document.querySelector("#page-preview-run")');
    const recovered=await until(()=>sidebar.read('(()=>{const el=document.querySelector("#page-preview-status");'+
      'return el?.dataset.state==="completed"?el.textContent:null})()'),
      'genuine Vue component recovery after compiler failure',60000);
    assert.match(recovered,/组件已在当前网页运行/);
    const nextReceipt=JSON.parse(await sidebar.read(
      'document.querySelector("#page-preview-technical").textContent'));
    assert.equal(nextReceipt.state,'preview-evaluated');
    assert.notEqual(nextReceipt.managedPreviewId,vuePrevious.previewId);
    assert.equal(nextReceipt.packagedFrameworkId,'vue');
    await until(()=>website.session.read(
      'document.querySelector("[data-od-id=browser-vue]")?.shadowRoot?.querySelector("button")!=null'),
      'corrected Vue component genuinely mounted',12000);
    await clickReal(sidebar,'document.querySelector("#script-stop")');
    await until(()=>website.session.read('!document.querySelector("[data-od-id=browser-vue]")'),
      'corrected Vue component stopped using original managed receipt',12000);
    report.tests.push({name:'r243-browser-vue-recovery-after-invalid-edit',status:'PASS',
      previewId:nextReceipt.managedPreviewId,sourceHash:nextReceipt.sourceHash,
      previousPreviewId:vuePrevious.previewId,realRun:true,domClean:true,noNative:true});
    // A Vue Teleport deliberately renders outside the managed Shadow DOM.
    // Its externally mounted DOM must still be owned by Vue app.unmount()
    // when the same original previewId is explicitly retired.
    const teleportSource=[
      '<script setup>',
      "import {ref} from 'vue';",
      'const count=ref(0);',
      '</script>',
      '<template>',
      '  <Teleport to="body">',
      '    <aside id="r243-teleported-vue" aria-label="Vue Teleport cleanup">Teleported {{count}}</aside>',
      '  </Teleport>',
      '  <button type="button" @click="count++">Change</button>',
      '</template>'
    ].join('\n');
    await typeSource(teleportSource);
    assert.equal(await website.session.read('document.querySelector("#r243-teleported-vue")'),null);
    await until(()=>sidebar.read('!document.querySelector("#page-preview-run").disabled'),
      'Teleport source ready for explicit Run');
    await clickReal(sidebar,'document.querySelector("#page-preview-run")');
    const teleportState=await until(()=>sidebar.read('(()=>{const el=document.querySelector("#page-preview-status");'+
      'return ["completed","error"].includes(el?.dataset.state)?{state:el.dataset.state,text:el.textContent}:null})()'),
      'genuine Vue Teleport Page preview receipt',60000);
    assert.equal(teleportState.state,'completed',teleportState.text);
    const teleportReceipt=JSON.parse(await sidebar.read(
      'document.querySelector("#page-preview-technical").textContent'));
    assert.equal(teleportReceipt.managedUI,true);
    assert.equal(teleportReceipt.packagedFrameworkId,'vue');
    assert.notEqual(teleportReceipt.managedPreviewId,nextReceipt.managedPreviewId);
    await until(()=>website.session.read('(()=>{const el=document.querySelector("#r243-teleported-vue");'+
      'return el?.parentElement===document.body&&el.textContent.includes("Teleported 0")})()'),
      'Vue Teleport rendered outside managed Shadow DOM');
    await clickReal(website.session,
      'document.querySelector("[data-od-id=browser-vue]")?.shadowRoot?.querySelector("button")');
    await until(()=>website.session.read(
      'document.querySelector("#r243-teleported-vue")?.textContent.includes("Teleported 1")'),
      'real pointer updates Vue Teleport outside Shadow DOM');
    await clickReal(sidebar,'document.querySelector("#script-stop")');
    await until(()=>website.session.read('!document.querySelector("#r243-teleported-vue")&&'+
      '!document.querySelector("[data-od-id=browser-vue]")'),
      'Vue app.unmount removed both owned UI and external Teleport DOM');
    report.tests.push({name:'r243-browser-vue-teleport-external-dom-managed-stop',
      status:'PASS',previewId:teleportReceipt.managedPreviewId,
      documentId:teleportReceipt.documentId,sourceHash:teleportReceipt.sourceHash,
      actualPointerInput:true,teleportOutsideShadow:true,externalDOMClean:true,noNative:true});
    await typeSource(originalVue);
    assert.equal(await website.session.read('!document.querySelector("#r243-teleported-vue")'),true,
      'restoring the editor source alone must never execute a Page component');
    if(process.env.OPENDESK_R4_CONTROLLER_ESM_NATIVE_SMOKE==='1'){
      // Controller Single-file ESM is NOT a Page USER_SCRIPT. Drive the original
      // Side Panel click, RunHost/Authority, opaque Worker, durable Result and
      // saved Program Revision. CDP observes only; it never executes user code.
      const controllerSource=[
        'export default async function main() {',
        '  const title=await page.title();',
        '  return {controllerEsmR4:true,title,words:_.words(title),parameter:params.value};',
        '}'
      ].join('\n');
      const devChoice='document.querySelector("#page-component-javascript")';
      await clickReal(sidebar,'document.querySelector("label[for=page-component-javascript]")');
      await until(()=>sidebar.read(devChoice+'?.checked===true'),
        'real browser returned from Vue SFC to JavaScript editor');
      await typeSource(controllerSource);
      await until(()=>sidebar.read('!document.querySelector("#script-run").disabled'),
        'Controller original RunHost slot and exact current-page target available');
      await clickReal(sidebar,'document.querySelector("#script-run")');
      const ran=await until(()=>sidebar.read('(()=>{const s=document.querySelector("#script-status");'+
        'const result=document.querySelector("#script-result");'+
        'return s?.dataset.state==="error"?{state:"error",message:s.textContent}:'
        +'s?.dataset.state==="results"&&result?.textContent.includes("controllerEsmR4")?'
        +'{state:"results",message:s.textContent,value:result.textContent}:null})()'),
        'real Controller ESM Worker executes after trusted Run and yields durable Result',60000);
      assert.equal(ran.state,'results',ran.message);
      assert.match(ran.value,/controllerEsmR4/);
      assert.match(ran.value,/true/);
      assert.match(ran.value,/parameter/);
      const runId=await sidebar.read('document.querySelector("#script-run-id").value');
      assert(typeof runId==='string'&&runId.length>10,'real original Controller runId');
      const version=await sidebar.read('document.querySelector("#script-task-version").textContent');
      const sourceHash=await sidebar.read('document.querySelector("#script-task-id").textContent');
      report.tests.push({name:'r4-controller-actual-sidepanel-esm-runhost-worker-durable-result',
        status:'PASS',runId,version,sourceIdentity:sourceHash,returnedValue:ran.value,
        actualPointerInput:true,noNative:true,executedIn:'CONTROLLER_OPAQUE_WORKER'});
      await until(()=>sidebar.read('!document.querySelector("#script-save").disabled'),
        'Controller ESM save ready',10000);
      await clickReal(sidebar,'document.querySelector("#script-save")');
      const saved=await until(()=>sidebar.read('(()=>{const s=document.querySelector("#script-status");'+
        'return s?.dataset.state==="saved"?s.textContent:null})()'),
        'Controller ESM verified built revision saved without rerunning',30000);
      assert.match(saved,/已持久保存/);
      await clickReal(sidebar,'document.querySelector("#script-load")');
      await until(()=>sidebar.read('document.querySelector("#script-source").value==='+
        JSON.stringify(controllerSource)),
        'Controller ESM author source restored from immutable compiled revision',15000);
      report.tests.push({name:'r4-controller-actual-sidepanel-save-load-edited-esm-source',
        status:'PASS',runId,originalAuthorSourceRestored:true,savedReceipt:saved,
        noUnapprovedRemoteFetch:true,noNative:true});
      const screenshot=await sidebar.call('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(path.join(output,'r4-controller-esm-durable-result.png'),
        Buffer.from(screenshot.data,'base64'));
    }
    if(process.env.OPENDESK_R243_BROWSER_STRESS==='1')
      await runBrowserComponentCycles({sidebar,website,output,report,until,clickReal,selectFramework});
  }catch(error){
    for(const [session,label] of [[sidebar,'sidebar'],[website?.session,'website']])if(session){
      try{
        const screenshot=await session.call('Page.captureScreenshot',{format:'png'});
        fs.writeFileSync(path.join(output,'failure-'+label+'.png'),Buffer.from(screenshot.data,'base64'));
        const state=await session.read('({url:location.href,body:document.body.innerText,inputs:[...document.querySelectorAll("input,textarea")].map(e=>({id:e.id,value:e.value,disabled:e.disabled})),active:document.activeElement?.id})');
        fs.writeFileSync(path.join(output,'failure-'+label+'.json'),JSON.stringify(state,null,2)+'\n');
      }catch(observationError){report.observationError=observationError.message;}
    }
    throw error;
  }finally{
    settings?.session.close();website?.session.close();sidebar?.close();
    if(site)await new Promise(resolve=>site.close(resolve));
  }
}
async function main(){
  const argv=['--no-first-run','--no-default-browser-check','--use-mock-keychain',
    '--disable-gpu','--disable-background-networking','--disable-sync',
    '--remote-debugging-port=0','--user-data-dir='+profile,
    '--disable-extensions-except='+packageRoot,'--load-extension='+packageRoot,'about:blank'];
  const report={status:'IN_PROGRESS',startedAt:new Date().toISOString(),chrome:binary,
    sourceHead:process.env.GITHUB_SHA||null,nativeHostConfigured:false,tests:[]};
  let chrome,browser,page;
  try{
    const launched=await launchLocalDevChrome({root,out:output,binary,argv,profile});
    chrome=launched.chrome;
    const port=Number(launched.lines[0]),base='http://127.0.0.1:'+port;
    browser=await cdp('ws://127.0.0.1:'+port+launched.lines[1]);
    const extensionId=await until(async()=>{
      const list=await (await fetch(base+'/json/list')).json();
      const worker=list.find(x=>x.type==='service_worker'&&/^chrome-extension:\/\/[a-p]{32}\/sw\.js$/.test(x.url));
      return worker?.url?.split('/')[2];
    },'real loaded extension');
    report.extensionId=extensionId;
    report.browserVersion=await browser.call('Browser.getVersion');
    report.launch=launched.launch;
    const request=await fetch(base+'/json/new?about%3Ablank',{method:'PUT'});
    assert.equal(request.status,200);
    const tab=await request.json();page=await cdp(tab.webSocketDebuggerUrl);
    await page.call('Page.navigate',{url:'chrome-extension://'+extensionId+'/ui/tool.html'});
    await until(()=>page.read('location.protocol==="chrome-extension:"&&document.readyState==="complete"'),
      'actual packaged extension page');
    assert.equal(await page.read('typeof Worker'),'function');
    if(process.env.OPENDESK_R245_STANDARD_SMOKE!=='1'&&!process.env.OPENDESK_R77_IMPORT_SCENARIOS)for(const [framework,fixture] of [
      ['react','examples/programs/page-ui-react/src/App.jsx'],
      ['vue','examples/programs/page-ui-vue/src/App.vue']
    ]){
      const componentSource=fs.readFileSync(path.join(root,fixture),'utf8');
      const projectId='sample.browser-native-free-'+framework;
      const pageRules={matches:['http://127.0.0.1:43111/*'],excludeMatches:[],
        runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};
      const expression='(async()=>{'+
        "const url=chrome.runtime.getURL('ui/page-component-compiler-worker.js');"+
        "const helper=await fetch(chrome.runtime.getURL('libs/page-frameworks/page-ui-helper-r243.js')).then(r=>{if(!r.ok)throw Error('E_HELPER');return r.text()});"+
        "const worker=new Worker(url,{type:'classic'});"+
        "const job="+JSON.stringify({type:'prepare',requestId:1,framework,
          componentSource,projectId,pageRules})+";job.uiHelperSource=helper;"+
        "return await new Promise((resolve,reject)=>{"+
        "const timer=setTimeout(()=>{worker.terminate();reject(Error('E_WORKER_TIMEOUT'))},30000);"+
        "worker.onerror=e=>{clearTimeout(timer);worker.terminate();resolve({ok:false,error:{message:e.message}})};"+
        "worker.onmessage=e=>{clearTimeout(timer);worker.terminate();const x=e.data;resolve({ok:x.ok,"+
          "error:x.error,framework:x.result?.framework,bytes:x.result?.sourceUtf8?.length,"+
          "hasManaged:x.result?.sourceUtf8?.includes('createPageUI'),"+
          "hasHeader:x.result?.sourceUtf8?.includes('// @opendesk-lib "+framework+"'),"+
          "hasCSS:x.result?.sourceUtf8?.includes('data-v-')})};worker.postMessage(job)})"+
      '})()';
      const result=await page.read(expression);
      assert.equal(result?.ok,true,JSON.stringify(result?.error));
      assert.equal(result.framework,framework);
      assert(result.bytes>1000&&result.bytes<100000,'real Worker preserves Page budget');
      assert.equal(result.hasManaged,true);
      assert.equal(result.hasHeader,true);
      if(framework==='vue')assert.equal(result.hasCSS,true);
      const proof={framework,sourcePath:fixture,compiler:'Babel@7.29.9 / Vue@3.5.22',
        bytes:result.bytes,cspWorker:true,noNative:true,compiledWithoutExecutingComponent:true};
      report.tests.push(proof);
    }
    if(process.env.OPENDESK_R245_STANDARD_SMOKE==='1'){
      await verifyBrowserUI({browser,page,catalogTabId:tab.id,base,extensionId,output,report});
      report.status='PASS_STANDARD_BROWSER_NO_COMPILER';
    }else if(process.env.OPENDESK_R243_BROWSER_FULL_UI==='1'){
      await verifyBrowserUI({browser,page,catalogTabId:tab.id,base,extensionId,output,report});
      if(r77Focus){
        const expected=r77Focus==='d3'?[
          ['R76-PAGE-URL-ESM-D3-DOM','CHROME_PASS_R76_PAGE_ESM_D3'],
          ['S05-R77-CONTROLLER-D3','CHROME_PASS_R77_CONTROLLER_D3']
        ]:[
          ['D02/D03-R72-ONE-CLICK-AB','CHROME_PASS_R72_ONE_CLICK_AB'],
          ['D05-R73-CONTROLLER-CLASSIC-REAL-MITT','CHROME_PASS_D05_CONTROLLER_CLASSIC'],
          ['D04-EXT-R74-NORMAL-NPM-IMPORT-MITT','CHROME_PASS_R76_PINNED_AND_BARE_NPM']
        ];
        for(const [caseId,status] of expected)assert(report.tests.some(row=>row.caseId===caseId&&row.status===status),'Missing completed R77 scenario '+caseId);
        if(process.env.OPENDESK_R78_ALL_SCENARIOS==='1')
          assert(report.tests.some(row=>row.caseId==='R76-PAGE-URL-ESM-D3-DOM'&&row.status==='CHROME_PASS_R76_PAGE_ESM_D3'),
            'R78 combined acceptance requires real Page D3 receipt');
      }
      report.status=process.env.OPENDESK_R77_IMPORT_SCENARIOS?'PASS_R77_IMPORT_SCENARIOS':process.env.OPENDESK_R243_BROWSER_STRESS==='1'?
        'PASS_BROWSER_UI_NO_NATIVE_20X_EACH_RUN_STOP':'PASS_BROWSER_UI_NO_NATIVE_REACT_VUE_RUN_STOP';
      if(process.env.OPENDESK_R78_OFFLINE_RESTART==='1')
        await runR78D3RestartCycle({chrome,browser,cdp,until,clickReal,report,output});
    }else report.status='PASS_BROWSER_WORKER_NO_NATIVE';
  }catch(error){report.status='FAIL';report.error={code:error.code||'E_BROWSER_WORKER_TEST',message:error.message,
    stack:error.stack};process.exitCode=1;}
  finally{
    if(!report.tests.some(row=>row.caseId==='R78-D3-SAME-PROFILE-OFFLINE-RESTART'&&row.newPid))
      try{await browser?.call('Browser.close');}catch{}
    page?.close();browser?.close();
    if(chrome?.cleanup){report.cleanup=await chrome.cleanup();if(report.cleanup?.error||report.cleanup?.chromePidAlive)report.status='FAIL_CLEANUP';}
    else if(chrome?.exitCode===null){try{chrome.kill('SIGTERM');}catch{}}
    report.finishedAt=new Date().toISOString();
    fs.writeFileSync(path.join(output,'acceptance.json'),JSON.stringify(report,null,2)+'\n');
    console.log('R243_BROWSER_WORKER_CFT='+JSON.stringify({
      status:report.status,sourceHead:report.sourceHead,extensionId:report.extensionId,
      tests:report.tests,cleanup:report.cleanup,error:report.error}));
    if(!report.status.startsWith('PASS_'))process.exitCode=1;
  }
}
await main();
