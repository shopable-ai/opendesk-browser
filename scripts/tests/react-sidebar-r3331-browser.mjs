#!/usr/bin/env node
// SOURCE_UI_SIMULATION_CHROMIUM, not native installed-extension evidence.
// The Chrome CDP input below creates browser-trusted events, never hand-built
// JS isTrusted flags. No extension host / permissions / Sandbox is simulated.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer as createHttpServer} from 'node:http';
import {existsSync} from 'node:fs';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'vite';

const fixtureJS=String.raw`
import {mountSidebarApp} from '/src/ui/react/main.tsx';
import {createDeveloperView} from '/src/ui/develop-view.js';
import {createMyWorkbenchView} from '/src/ui/my-workbench-view.js';
const calls=[],navState={tab:'tasks',blocked:null};
const developerView=createDeveloperView(),myView=createMyWorkbenchView();
// Chromium source UI fixture: imitate only the existing shared settings store
// contract. This is not a real Provider, grant, or installed-extension receipt.
const settingsListeners=new Set();
let providerSnapshot=Object.freeze({
  source:'custom_https',endpoint:'https://example.com/v1/chat/completions',
  model:'my-inference-model',hasApiKey:true,generation:1
});
const providerSettings=Object.freeze({
  subscribeSettings(listener){settingsListeners.add(listener);return ()=>settingsListeners.delete(listener);},
  settingsSnapshot(){return providerSnapshot;},
  updateSettings(patch){
    calls.push('provider-update:true');
    providerSnapshot=Object.freeze({...providerSnapshot,...patch,
      hasApiKey:patch.apiKey===undefined?providerSnapshot.hasApiKey:Boolean(patch.apiKey),
      generation:providerSnapshot.generation+1});
    for(const listener of settingsListeners)listener();
  }
});
const ui=mountSidebarApp(document,{debugEnabled:false,developerView,myView,providerSettings,
  onNavigate(view){
    calls.push('nav:'+view);
    if(navState.blocked===view)return false;
    navState.tab=view;ui.renderNavigation(view);return true;
  }
});
const state={query:'',kind:'all',scope:'smart',menuOpen:false};
ui.connectBack(()=>{calls.push('back');ui.renderView('list');});
const row={key:'app:sample',title:'React 安全演示',description:'不可运行用户代码',kind:'app',type:'应用',installed:true,primaryAction:'打开'};
function draw(){
  ui.renderToolbar({...state,language:'zh-CN',
    onSearch(value){state.query=value;calls.push('search:'+value);draw();},
    onToggleMenu(){state.menuOpen=!state.menuOpen;calls.push('menu:'+state.menuOpen);draw();},
    onKind(value){state.kind=value;calls.push('kind:'+value);draw();},
    onScope(value){state.scope=value;calls.push('scope:'+value);draw();},
    onReset(){state.kind='all';state.scope='smart';calls.push('reset');draw();},
    onMarket(){calls.push('market');},onImport(){calls.push('import');},
    onReload(){calls.push('reload');},onLanguage(value){calls.push('language:'+value);}
  });
  ui.renderRows({rows:[row],busy:false,pendingKey:null,
    onOpenRow(key){calls.push('open:'+key);ui.renderView('detail');
      ui.renderDetail({key,title:row.title,description:row.description,
        type:'应用',kind:'app',installed:true,busy:false,actions:[],
        installationText:'本机已安装（测试模拟）',version:'1.0.0',source:null});},
    onMore(key,trigger){calls.push('more:'+key);ui.setMenuKey(key);
      const close=()=>{ui.renderRowMenu([]);ui.setMenuKey(null);};
      ui.renderRowMenu([{id:'toggle',label:'停用应用',onClick:event=>{
        calls.push('toggle:'+event.isTrusted);close();
      }}],{trigger,title:row.title,onClose:close});}

  });
  ui.renderFeedback({showEmpty:false,emptyText:'无匹配扩展',countText:'1 个扩展'});
  ui.renderRecoveries({ids:[],busy:false,onRetry(id,event){calls.push('cleanup:'+id+':'+event.isTrusted);}});
  ui.renderStatus({text:'测试状态',state:'info'});
}
draw();
const myRows=[{taskId:'demo-a',title:'回归任务 A',description:'内容保持',enabled:true},{taskId:'demo-b',title:'回归任务 B',description:'不会重建参数',enabled:true}];
let mySelection='demo-a';
function paintMy(){myView.project('taskRows',{rows:myRows,selectedId:mySelection,emptyText:'',onSelect:id=>{mySelection=id;calls.push('task-select:'+id);paintMy();}});}
paintMy();
myView.setText('task-installed-count','2 个');
myView.project('taskDetail','身份由 TaskWorkbench 管理');
myView.project('taskParams',[{name:'proof',rule:{type:'string',title:'证明参数'},required:false}]);
myView.setValue('task-param-proof','保持参数');
myView.field('task-tools').open=true;myView.publish();
const patchDeveloper=(id,state)=>developerView.patch(id,state);
patchDeveloper('develop-dock',{hidden:false});

const dev={runDisabled:false,runLabel:'运行草稿',saveDisabled:false,saveHidden:false,saveTitle:'保存草稿',saveLabel:'保存版本',stopDisabled:false,stopLabel:'停止'};
function paintDeveloperDock(){
  for(const action of ['run','save','stop']){
    // Save moved into the real Developer advanced > version management section.
    // Keep the trusted click assertion, but bind its current React-owned ID.
    const id=action==='save'?'script-save-version':'script-'+action;
    patchDeveloper(id,{textContent:dev[action+'Label'],disabled:dev[action+'Disabled'],
      hidden:!!dev[action+'Hidden'],title:dev[action+'Title']||''});
    developerView.actions[id]=event=>calls.push(action+':'+event.isTrusted);
  }
}
paintDeveloperDock();
const framework={mode:'javascript',compilerEnabled:true};
function paintFramework(){
  for(const kind of ['javascript','react','vue']){
    patchDeveloper('page-component-'+kind,{checked:framework.mode===kind,
      disabled:!framework.compilerEnabled&&kind!=='javascript'});
    developerView.actions['page-component-'+kind]=event=>{
      if(framework.mode===kind||!event.isTrusted)return;
      calls.push('framework:'+kind+':'+event.isTrusted);framework.mode=kind;paintFramework();
    };
  }
}
paintFramework();
function setDeveloperStatus({state,text}){patchDeveloper('script-status',{textContent:text,data:{state}});}
function setDeveloperResult({text,kind}){
  patchDeveloper('script-result',{textContent:text});
  patchDeveloper('script-result-kind',{textContent:kind});
}
function setDeveloperTarget({title,url,host,hostTitle,status,state,statusTitle}){
  patchDeveloper('script-current-page-title',{textContent:title});
  patchDeveloper('script-current-page-url',{textContent:url});
  patchDeveloper('script-current-page-host',{textContent:host,title:hostTitle});
  patchDeveloper('script-current-page-status',{textContent:status,title:statusTitle,data:{state}});
}
setDeveloperStatus({state:'ready',text:'可运行'});
setDeveloperResult({text:'尚无结果',kind:'尚无结果'});
setDeveloperTarget({title:'本地 Chromium 页面',url:'https://example.com/view',host:'example.com',hostTitle:'https://example.com/view',status:'网页可运行',state:'available',statusTitle:'已核对身份'});
// The workflow presentation uses the same subscription/action contract as production.
// No Provider, execution Host, permissions or persisted workflow is supplied here.
const subscriptions=new Set();
let workflowModel={
  controls:{
    'workflow-ai-request':{value:'保留原始输入草稿'},
    'workflow-ai-provider':{value:'custom_https'},
    'workflow-custom-settings':{hidden:false},
    'workflow-local-settings':{hidden:true},
    'workflow-https-mode':{hidden:false},
    'workflow-https-protocol':{value:'custom_https'},
    'workflow-ai-key':{value:'保持原值'},
    'workflow-provider-settings':{open:false}
  },
  phase:'idle',sourceName:'my-inference-model',
  header:{saved:true,savedText:'已保存',savedTitle:'已固定',busy:false,
    planning:false,historyExpanded:false,sessionHint:'保留当前工作流'},
  history:{open:false,busy:false,canResume:false,rows:[]},
  messages:[{id:'chat-1',speaker:'你',message:'安全输出 <script>不可执行</script>'}]
};
function publishWorkflow(changes){
  workflowModel={...workflowModel,...changes};
  for(const listener of subscriptions)listener();
}
function workflowField(id,changes){
  publishWorkflow({controls:{...workflowModel.controls,
    [id]:{...workflowModel.controls[id],...changes}}});
}
const workflowController={
  subscribe(listener){subscriptions.add(listener);return ()=>subscriptions.delete(listener);},
  getSnapshot(){return workflowModel;},
  actions:{
    input(id,value,event){calls.push('input:'+id+':'+event.isTrusted);workflowField(id,{value});},
    click(id,event){
      calls.push('workflow-click:'+id+':'+event.isTrusted);
      if(id==='workflow-provider-toggle')workflowField('workflow-provider-settings',{open:true});
    },
    closeSettings(){calls.push('workflow-close');workflowField('workflow-provider-settings',{open:false});},
    onHistory:event=>calls.push('workflow-history:'+event.isTrusted),
    onNewSession:event=>calls.push('workflow-session:'+event.isTrusted),
    onNewWorkflow:event=>calls.push('workflow-new:'+event.isTrusted),
    onOpenSavedHistory:(key,event)=>calls.push('workflow-open:'+key+':'+event.isTrusted)
  }
};
ui.connectWorkflowPage(workflowController);
const providerNode=document.getElementById('workflow-provider-toggle');
window.__reactTest={ui,calls,navState,state,dev,framework,developerView,myView,providerNode,subscriptions,settingsListeners,publishWorkflow,workflowController,get workflowModel(){return workflowModel;},get providerSnapshot(){return providerSnapshot;},paintDeveloperDock,paintFramework,setDeveloperResult,setDeveloperStatus,setDeveloperTarget,dispose(){ui.dispose();developerView.dispose()}};
document.documentElement.dataset.fixtureReady='true';
`;
const originalHtml=await readFile('src/ui/sidepanel.html','utf8');
assert.match(originalHtml,/<div\b[^>]*id="opendesk-react-app"[^>]*><\/div>/,
  'Production starts from one empty React mount');
assert.doesNotMatch(originalHtml,/id="(?:workspace-dock|workbench-tasks|extension-center)"/,
  'The production document must not recreate the retired static scaffold');
const fixtureHtml=originalHtml
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
  .replace(/href="ui\//g,'href="/src/ui/')
  .replace(/<\/body>/i,'<script type="module" src="/__react_fixture.js"></script></body>');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const browser=process.env.CHROME_BIN||
  [join(process.cwd(),'tests/.cache/m5-browsers/155.0.8059.39/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),'/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser']
    .find(path=>existsSync(path));
assert.ok(browser,'Real Chromium/Chrome required (CHROME_BIN or installed binary)');
// Serve fixture endpoints BEFORE Vite's transform/fallback middleware.
 // This avoids a custom route appended after Vite's terminal 404 handler.
const fixtureCache=await mkdtemp(join(tmpdir(),'opendesk-react-r3331-cache-'));
const fixtureId='\0opendesk-react-fixture';
const vite=await createServer({root:process.cwd(),configFile:false,appType:'custom',
  // Serve the fixture through Vite import analysis, not as raw ESM. Raw
  // responses leave bare "react" imports unresolved in genuine Chromium.
  plugins:[{name:'opendesk-react-fixture',
    resolveId(id){return id==='/__react_fixture.js'?fixtureId:null;},
    load(id){return id===fixtureId?fixtureJS:null;}}],
  cacheDir:fixtureCache,resolve:{dedupe:['react','react-dom']},
  logLevel:'error',
  // The fixture imports JSX from source. Browser ESM cannot directly import
  // React 19's CommonJS exports (e.g. react-dom.createPortal), so prebundle
  // only the pinned React entrypoints; do not scan the entire repository.
  optimizeDeps:{noDiscovery:true,entries:[],
    include:['react','react/jsx-runtime','react-dom','react-dom/client']},
  // This source fixture needs transforms only; never bind the shared HMR port
  // or start a source watcher alongside the development extension.
  server:{middlewareMode:true,hmr:false,ws:false,watch:null}});
const http=createHttpServer((req,res)=>{
  const path=new URL(req.url||'/','http://localhost').pathname;
  if(path==='/'||path==='/sidepanel.html'){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
    res.end(fixtureHtml);
    return;
  }
  // Vite transforms the virtual fixture and rewrites its React dependencies.
  vite.middlewares(req,res);
});
const profile=await mkdtemp(join(tmpdir(),'opendesk-react-r3331-'));
let chrome,socket,chromeStartError;
const pending=new Map(),exceptions=[],networkFailures=[];
let sequence=0,port=0;
function cdp(method,params={}){
  return new Promise((ok,fail)=>{
    const id=++sequence;
    const timer=setTimeout(()=>{pending.delete(id);fail(Error('CDP timeout '+method));},15000);
    pending.set(id,{ok:x=>{clearTimeout(timer);ok(x);},
      fail:e=>{clearTimeout(timer);fail(e);}});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const result=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw Error('Browser evaluation failed: '+JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function checkEventually(expression){
  for(let i=0;i<100;i++){
    try{if(await evaluate(expression))return;}catch{}
    await delay(60);
  }
  throw Error('Browser assertion never became true: '+expression);
}
async function click(selector){
  await evaluate('document.querySelector('+JSON.stringify(selector)+')?.scrollIntoView({block:"nearest",inline:"nearest"})');
  let rect;
  for(let attempt=0;attempt<8;attempt++){
    rect=await evaluate('(()=>{const node=document.querySelector('+JSON.stringify(selector)+');'+
      'if(!node)throw Error("Missing click target");const r=node.getBoundingClientRect();'+
      'const left=Math.max(0,r.left),right=Math.min(innerWidth,r.right),'+
      'top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom);'+
      'const x=(left+right)/2,y=(top+bottom)/2;'+
      'const hit=left<right&&top<bottom?document.elementFromPoint(x,y):null;'+
      'return {x,y,width:r.width,height:r.height,visible:getComputedStyle(node).visibility==="visible",'+
      'hit:!!hit&&(hit===node||node.contains(hit)),hitTarget:hit?.id||hit?.tagName||null,'+
      'wheelX:Math.max(0,Math.min(innerWidth-1,x)),wheelY:Math.max(0,Math.min(innerHeight-1,y)),'+
      'deltaX:left<right?0:Math.max(-innerWidth,Math.min(innerWidth,r.left+r.width/2-innerWidth/2)),'+
      'deltaY:top<bottom?0:Math.max(-innerHeight,Math.min(innerHeight,r.top+r.height/2-innerHeight/2))}})()');
    // Product radios are intentionally transparent; require a visible layout and
    // actual hit target without rejecting their opacity or disabled controls.
    assert(rect.width>0&&rect.height>0&&rect.visible,'Browser click target must be visible: '+selector);
    if(rect.hit||(!rect.deltaX&&!rect.deltaY)||attempt===7)break;
    await cdp('Input.dispatchMouseEvent',{type:'mouseWheel',x:rect.wheelX,y:rect.wheelY,
      deltaX:rect.deltaX,deltaY:rect.deltaY});
    await delay(60);
  }
  assert(rect.hit,'Browser click target must receive native input: '+selector+'; '+JSON.stringify(rect));
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x,y:rect.y,button:'left',clickCount:1});
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x,y:rect.y,button:'left',clickCount:1});
}
try{
  await new Promise((resolve,reject)=>{
    http.once('error',reject);
    http.listen(0,'127.0.0.1',resolve);
  });
  const httpPort=http.address().port;
  const fixture=await fetch('http://127.0.0.1:'+httpPort+'/__react_fixture.js');
  assert.equal(fixture.status,200,'React fixture route must return HTTP 200');
  assert.match(await fixture.text(),/mountSidebarApp/);
  chrome=spawn(browser,[
    '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--no-default-browser-check','--window-size=960,900',
    '--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'
  ],{stdio:['ignore','ignore','pipe']});
  let stderr='';
  chrome.once('error',error=>{chromeStartError=error;});
  chrome.stderr.on('data',data=>{stderr=(stderr+data.toString()).slice(-10000);});
  // CI hosts can spend more than ten seconds initializing a fresh Chrome
  // profile under load. Wait for the actual CDP port, not an arbitrary sleep.
  for(let i=0;i<300;i++){
    if(chromeStartError)throw Error('Chrome startup failed: '+chromeStartError.message);
    if(chrome.exitCode!==null||chrome.signalCode)
      throw Error('Chrome quit early ('+chrome.exitCode+'/'+chrome.signalCode+'): '+stderr);
    try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break;}
    catch{}
    await delay(100);
  }
  assert(port,'Chrome CDP port unavailable: binary='+browser+' pid='+chrome.pid+
    ' exit='+chrome.exitCode+' signal='+chrome.signalCode+' stderr='+stderr);
  const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const page=targets.find(t=>t.type==='page');
  assert(page?.webSocketDebuggerUrl,'Chrome page target unavailable');
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',fail,{once:true});});
  socket.addEventListener('message',event=>{
    const m=JSON.parse(event.data);
    if(m.method==='Runtime.exceptionThrown'){
      const d=m.params.exceptionDetails||{};
      exceptions.push([d.text,d.exception?.description,d.url,d.lineNumber].filter(Boolean).join(' | '));
    }
    if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')
      exceptions.push('console.error: '+(m.params.args||[]).map(x=>x.value||x.description).join(' '));
    if(m.method==='Network.responseReceived'&&m.params.response?.status>=400)
      networkFailures.push(m.params.response.status+' '+m.params.response.url);
    if(m.method==='Network.loadingFailed')
      networkFailures.push('request failed: '+m.params.errorText+' '+(m.params.blockedReason||''));
    if(!pending.has(m.id))return;
    const waiter=pending.get(m.id);pending.delete(m.id);
    if(m.error)waiter.fail(Error(m.error.message));else waiter.ok(m.result);
  });
  await cdp('Runtime.enable');await cdp('Page.enable');await cdp('Network.enable');
  const navigation=await cdp('Page.navigate',{url:'http://127.0.0.1:'+httpPort+'/sidepanel.html'});
  assert(!navigation.errorText,'Fixture navigation failed: '+navigation.errorText);
  try {
    await checkEventually('document.documentElement.dataset.fixtureReady==="true"');
  } catch(error) {
    let snapshot;
    try{snapshot=await evaluate('({url:location.href,readyState:document.readyState,'+
      'title:document.title,script:[...document.scripts].map(s=>s.src),'+
      'rootOwner:document.getElementById("extension-center")?.dataset.opendeskReactOwner,'+
      'html:document.documentElement.outerHTML.slice(0,800)})');}
    catch(readError){snapshot={readError:String(readError)};}
    throw Error(error.message+'; browserErrors='+JSON.stringify(exceptions.slice(-15))+
      '; failedRequests='+JSON.stringify(networkFailures.slice(-15))+
      '; snapshot='+JSON.stringify(snapshot));
  }
  assert.equal(await evaluate('document.getElementById("extension-center").dataset.opendeskReactOwner'),'extension-center');
  assert.equal(await evaluate('document.querySelectorAll("#extension-center-react-root").length'),0,
    'The old hidden Portal root must not be recreated');
  assert.equal(await evaluate('document.querySelectorAll("#extension-center-search").length'),1);
  assert.equal(await evaluate('document.getElementById("opendesk-react-app").contains(document.querySelector(".workbench-nav"))'),true,
    'Navigation belongs to the single production React root');
  assert.equal(await evaluate('document.querySelectorAll(".workbench-nav button[role=tab]").length'),6);
  assert.equal(await evaluate('document.getElementById("tab-debug").hidden'),true);
  await click('#tab-tools');
  await checkEventually('document.getElementById("tab-tools").getAttribute("aria-selected")==="true"');
  assert.equal(await evaluate('window.__reactTest.calls.filter(x=>x==="nav:tools").length'),1);
  await evaluate('window.__reactTest.navState.blocked="cloud"');
  await click('#tab-cloud');
  assert.equal(await evaluate('document.getElementById("tab-tools").getAttribute("aria-selected")'),'true',
    'A rejected navigation must not change the selected React tab');
  assert.equal(await evaluate('window.__reactTest.calls.filter(x=>x==="nav:cloud").length'),1);
  await evaluate('window.__reactTest.navState.blocked=null;document.getElementById("tab-tools").focus()');
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39});
  await checkEventually('document.getElementById("tab-workflow").getAttribute("aria-selected")==="true"');
  assert.equal(await evaluate('document.activeElement.id'),'tab-workflow');
  assert.equal(await evaluate('window.__reactTest.calls.filter(x=>x==="nav:workflow").length'),1);
  assert.equal(await evaluate('document.querySelectorAll("#extension-center-list .ec-row").length'),1);
  assert.equal(await evaluate('document.getElementById("extension-center-count").textContent'),'1 个扩展');
  assert.equal(await evaluate('document.getElementById("extension-center-status").textContent'),'测试状态');
  assert.equal(await evaluate('document.getElementById("extension-center-empty").hidden'),true);
  assert.equal(await evaluate('document.getElementById("script-current-page-host").textContent'),'example.com');
  assert.deepEqual(
    await evaluate('[...document.querySelectorAll("#develop-dock .dock-buttons > button")].map(node=>node.id)'),
    ['script-run','script-stop'],
    'The current React Developer Dock owns exactly its Run/Stop controls');
  assert.equal(await evaluate('document.querySelectorAll("#page-component-framework input").length'),3);
  assert.equal(await evaluate('document.getElementById("script-status").textContent'),'可运行');
  assert.equal(await evaluate('document.getElementById("script-status").dataset.state'),'ready');
  await evaluate('window.__reactTest.setDeveloperResult({text:"安全文本 <script>alert(1)</script>",kind:"JSON"})');
  await checkEventually('document.getElementById("script-result-kind").textContent==="JSON"');
  assert.equal(await evaluate('document.getElementById("script-result").textContent'),'安全文本 <script>alert(1)</script>');
  assert.equal(await evaluate('document.querySelectorAll("#script-result script").length'),0);
  assert.equal(await evaluate('document.getElementById("script-result-kind").textContent'),'JSON');
  await evaluate('window.__reactTest.setDeveloperStatus({state:"error",text:"错误 <unsafe>"})');
  await checkEventually('document.getElementById("script-status").dataset.state==="error"');
  assert.equal(await evaluate('document.getElementById("script-status").textContent'),'错误 <unsafe>');
  assert.equal(await evaluate('document.getElementById("script-status").dataset.state'),'error');
  await click('#tab-develop');
  await checkEventually('window.__reactTest.navState.tab==="develop"');
  await click('#page-component-react');
  await checkEventually('window.__reactTest.framework.mode==="react"');
  assert.equal(await evaluate('document.getElementById("page-component-react").checked'),true);
  assert.equal(await evaluate('window.__reactTest.calls.filter(x=>x==="framework:react:true").length'),1);
  await click('#page-component-vue');
  await checkEventually('window.__reactTest.framework.mode==="vue"');
  await evaluate('window.__reactTest.framework.mode="javascript";window.__reactTest.framework.compilerEnabled=false;window.__reactTest.paintFramework()');
  await checkEventually('document.getElementById("page-component-react").disabled');
  assert.equal(await evaluate('document.getElementById("page-component-react").disabled'),true);
  await click('#script-run');
  await click('#developer-program-management > summary');
  await checkEventually('document.getElementById("developer-program-management").open');
  await checkEventually('document.getElementById("script-library-tools").checkVisibility()');
  await click('#script-save-version');
  await click('#script-stop');
  await checkEventually('window.__reactTest.calls.includes("stop:true")');
  for(const action of ['run:true','save:true','stop:true'])
    assert.equal(await evaluate('window.__reactTest.calls.filter(x=>x==='+JSON.stringify(action)+').length'),1);
  await evaluate('window.__reactTest.dev.runDisabled=true;window.__reactTest.dev.stopLabel="取消准备";window.__reactTest.paintDeveloperDock()');
  await checkEventually('document.getElementById("script-run").disabled && document.getElementById("script-stop").textContent==="取消准备"');
  assert.equal(await evaluate('document.getElementById("script-run").disabled'),true);
  assert.equal(await evaluate('document.getElementById("script-stop").textContent'),'取消准备');
  await click('#script-run');
  assert.equal(await evaluate('window.__reactTest.calls.filter(x=>x==="run:true").length'),1,'Disabled React Run must not execute');
  assert.equal(await evaluate('document.getElementById("script-current-page-status").dataset.state'),'available');
  assert.equal(await evaluate('document.getElementById("script-current-page-title").textContent'),'本地 Chromium 页面');
  await evaluate('window.__reactTest.setDeveloperTarget({title:"正在识别…",url:"",host:"正在识别…",hostTitle:"",status:"检查中",state:"resolving",statusTitle:""})');
  await checkEventually('document.getElementById("script-current-page-status").dataset.state==="resolving"');
  assert.equal(await evaluate('document.getElementById("script-current-page-status").dataset.state'),'resolving');
  await evaluate('window.__reactTest.setDeveloperTarget({title:"本地 Chromium 页面",url:"https://example.com/view",host:"example.com",hostTitle:"https://example.com/view",status:"网页可运行",state:"available",statusTitle:"已核对身份"})');
  await click('#tab-tools');
  await checkEventually('window.__reactTest.navState.tab==="tools"');
  await evaluate('window.__reactTest.ui.renderFeedback({showEmpty:true,emptyText:"没有匹配",countText:"0 个扩展"})');
  assert.equal(await evaluate('document.getElementById("extension-center-empty").hidden'),false);
  assert.equal(await evaluate('document.getElementById("extension-center-empty-text").textContent'),'没有匹配');
  await evaluate('window.__reactTest.ui.renderFeedback({showEmpty:false,emptyText:"",countText:"1 个扩展"})');
  await evaluate('window.__reactTest.ui.renderRecoveries({ids:["cleanup-test"],busy:false,onRetry(id,event){window.__reactTest.calls.push("cleanup:"+id+":"+event.isTrusted)}})');
  assert.equal(await evaluate('document.getElementById("extension-center-cleanups").hidden'),false);
  await click('#extension-center-cleanups button');
  await checkEventually('window.__reactTest.calls.includes("cleanup:cleanup-test:true")');
  await evaluate('window.__reactTest.ui.renderRecoveries({ids:[],busy:false,onRetry(){}})');
  assert.equal(await evaluate('document.getElementById("extension-center-cleanups").hidden'),true);
  await evaluate('document.getElementById("extension-center-search").focus()');
  await cdp('Input.insertText',{text:'React UI'});
  await checkEventually('window.__reactTest.calls.includes("search:React UI")');
  assert.equal(await evaluate('document.getElementById("extension-center-search").value'),'React UI');
  await click('#extension-center-more');
  await checkEventually('document.getElementById("extension-center-more").getAttribute("aria-expanded")==="true"');
  await click('[data-ec-scope="available"]');
  await checkEventually('window.__reactTest.state.scope==="available"');
  await click('[data-ec-kind="page"]');
  await checkEventually('window.__reactTest.state.kind==="page"');
  await click('#extension-center-more');
  await click('.ec-row-more');
  await checkEventually('window.__reactTest.calls.includes("more:app:sample")');
  assert.equal(await evaluate('document.querySelector(".ec-row-more").getAttribute("aria-expanded")'),'true');
  assert.equal(await evaluate('document.querySelector("#extension-center-row-menu").getAttribute("role")'),'menu',
    'The production React menu portal owns the menu');
  await click('#extension-center-row-menu button');
  await checkEventually('window.__reactTest.calls.includes("toggle:true")');
  assert.equal(await evaluate('document.querySelector("#extension-center-row-menu")'),null);
  assert.equal(await evaluate('document.querySelectorAll("#extension-center-row-menu > *").length'),0);
  await click('.ec-row-main');
  await checkEventually('window.__reactTest.calls.includes("open:app:sample")');
  assert.equal(await evaluate('document.querySelectorAll(".ec-detail-head").length'),1);
  assert.equal(await evaluate('document.getElementById("extension-center-detail").hidden'),false);
  assert.equal(await evaluate('document.getElementById("extension-center-list-view").hidden'),true);
  await click('#extension-center-back');
  await checkEventually('window.__reactTest.calls.includes("back")');
  assert.equal(await evaluate('document.getElementById("extension-center-detail").hidden'),true);
  assert.equal(await evaluate('document.getElementById("extension-center-list-view").hidden'),false);
  const recorded=await evaluate('window.__reactTest.calls');
  assert.equal(recorded.filter(s=>s==='open:app:sample').length,1,'one click must not duplicate listeners');
  await click('#tab-workflow');
  await checkEventually('window.__reactTest.navState.tab==="workflow"');
  assert.equal(await evaluate('document.getElementById("workbench-workflow").dataset.opendeskReactOwner'),'workflow-page');
  assert.equal(await evaluate('document.querySelectorAll("#workflow-ai-transcript .workflow-chat-entry").length'),1);
  assert.equal(await evaluate('document.querySelector("#workflow-ai-transcript .workflow-chat-entry p").textContent'),'安全输出 <script>不可执行</script>');
  assert.equal(await evaluate('document.querySelectorAll("#workflow-ai-transcript script").length'),0);
  assert.equal(await evaluate('document.querySelectorAll("#workflow-history-toggle,#workflow-ai-new-session,#workflow-new").length'),3);
  assert.equal(await evaluate('document.getElementById("workflow-provider-toggle").getAttribute("aria-label")'),
    'AI 来源：HTTPS Chat Completions；选择来源',
    'The shared Provider source button replaces the retired static model label');
  await evaluate('window.__reactTest.publishWorkflow({history:{open:true,busy:false,canResume:false,rows:[{key:"saved-revision-fixture",title:"已保存的测试版本",fullTitle:"测试版本 r2",savedText:"r2 · fixtures only"}]}})');
  await checkEventually('document.querySelectorAll("#workflow-history-panel .workflow-history-row").length===1');
  assert.equal(await evaluate('document.querySelectorAll("#workflow-history-panel .workflow-history-row").length'),1);
  await click('#workflow-history-panel .workflow-history-row');
  assert.equal(await evaluate('window.__reactTest.calls.filter(s=>s==="workflow-open:saved-revision-fixture:true").length'),1);
  await evaluate('window.__reactTest.publishWorkflow({history:{open:false,busy:false,canResume:false,rows:[]}})');
  await checkEventually('document.getElementById("workflow-history-panel").hidden');
  await click('#workflow-history-toggle');
  await click('#workflow-ai-new-session');
  await click('#workflow-new');
  for(const name of ['workflow-history:true','workflow-session:true','workflow-new:true'])
    assert.equal(await evaluate('window.__reactTest.calls.filter(x=>x==='+JSON.stringify(name)+').length'),1);
  await click('#workflow-ai-request');
  await evaluate('(()=>{const node=document.getElementById("workflow-ai-request");node.setSelectionRange(node.value.length,node.value.length);})()');
  await cdp('Input.insertText',{text:' · 浏览器输入'});
  await checkEventually('window.__reactTest.workflowModel.controls["workflow-ai-request"].value==="保留原始输入草稿 · 浏览器输入"');
  assert.equal(await evaluate('window.__reactTest.calls.filter(x=>x==="input:workflow-ai-request:true").length'),1);
  // The source button now opens a menu. Advanced AI Settings is the ONE
  // shared Provider Sheet; the old Workflow-specific details are retired.
  await click('#workflow-provider-toggle');
  await checkEventually('document.querySelector("#workflow-source-menu [role=menuitem]")');
  assert.equal(await evaluate('document.querySelectorAll("#workflow-source-menu [role=menuitemradio]").length'),3);
  await click('#workflow-source-menu [role="menuitem"]');
  await checkEventually('document.querySelector(".workflow-sheet-panel[role=dialog][aria-modal=true]")!==null');
  assert.equal(await evaluate('document.querySelectorAll(".workflow-sheet-panel[role=dialog][aria-modal=true]").length'),1);
  assert.equal(await evaluate('document.getElementById("opendesk-react-app").inert'),true,
    'The single React application, not a retired inner editor, is inert behind the modal');
  assert.equal(await evaluate('document.querySelector(".workflow-sheet-panel").contains(document.activeElement)'),true,
    'Initial focus stays within the portalled sheet');
  assert.equal(await evaluate('document.getElementById("workflow-provider-toggle")===window.__reactTest.providerNode'),true);
  assert.equal(await evaluate('document.getElementById("workflow-provider-settings")===null'),true,
    'Legacy Workflow Provider details must not reappear');
  await click('#od-ai-provider-key');
  await cdp('Input.insertText',{text:' · 浏览器输入'});
  await checkEventually('document.getElementById("od-ai-provider-key")?.value===" · 浏览器输入"');
  assert.equal(await evaluate('window.__reactTest.calls.filter(x=>x==="provider-update:true").length'),0,
    'Typing a secret must not persist settings before explicit Save');
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  assert.equal(await evaluate('document.querySelector(".workflow-sheet-panel").contains(document.activeElement)'),true);
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await checkEventually('document.querySelector(".workflow-sheet-overlay")===null');
  assert.equal(await evaluate('document.getElementById("opendesk-react-app").inert'),false);
  await checkEventually('document.activeElement.id==="workflow-provider-toggle"');
  assert.equal(await evaluate('document.getElementById("workflow-ai-request").value'),'保留原始输入草稿 · 浏览器输入');
  await click('#workflow-provider-toggle');
  await checkEventually('document.querySelector("#workflow-source-menu [role=menuitem]")');
  await click('#workflow-source-menu [role="menuitem"]');
  await checkEventually('document.querySelector(".workflow-sheet-panel")!==null');
  // Click above the sheet using real CDP pointer input; the backdrop's
  // geometric center can sit beneath the foreground panel.
  const backdropPoint=await evaluate('({x:innerWidth/2,y:8,hit:document.elementFromPoint(innerWidth/2,8)?.className})');
  assert.equal(backdropPoint.hit,'workflow-sheet-backdrop');
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:backdropPoint.x,y:backdropPoint.y,button:'left',clickCount:1});
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:backdropPoint.x,y:backdropPoint.y,button:'left',clickCount:1});
  await checkEventually('document.querySelector(".workflow-sheet-overlay")===null');
  assert.equal(await evaluate('document.getElementById("opendesk-react-app").inert'),false);
  // Use actual CDP mouse input (isTrusted=true), not a synthetic DOM click.
  await click('#tab-my-tasks');
  await checkEventually('window.__reactTest.navState.tab==="tasks"');
  await checkEventually('document.querySelector("[data-task-id=demo-a]").getAttribute("aria-expanded")==="true"');
  await click('#task-param-proof');
  await evaluate('(()=>{const node=document.getElementById("task-param-proof");node.setSelectionRange(node.value.length,node.value.length);})()');
  await cdp('Input.insertText',{text:' · 浏览器输入'});
  await checkEventually('window.__reactTest.myView.field("task-param-proof").value==="保持参数 · 浏览器输入"');
  const oldParam=await evaluate('document.getElementById("task-param-proof").value');
  await click('[data-task-id="demo-a"]');
  await checkEventually('document.querySelector("[data-task-id=demo-a]").getAttribute("aria-expanded")==="false"');
  assert.equal(await evaluate('document.getElementById("task-selected-workspace").checkVisibility()'),false,
    'Collapsing the selected task hides its retained workspace');
  assert.equal(await evaluate('document.querySelector("[data-task-id=demo-a]").getAttribute("aria-pressed")'),'true');
  await click('[data-task-id="demo-a"]');
  await checkEventually('document.querySelector("[data-task-id=demo-a]").getAttribute("aria-expanded")==="true"');
  assert.equal(await evaluate('document.getElementById("task-param-proof").value'),oldParam);
  assert.equal(await evaluate('window.__reactTest.calls.filter(x=>x.startsWith("task-select:")).length'),0);
  await click('[data-task-id="demo-b"]');
  await checkEventually('document.querySelector("[data-task-id=demo-b]").getAttribute("aria-expanded")==="true"');
  assert.equal(await evaluate('window.__reactTest.calls.filter(x=>x==="task-select:demo-b").length'),1);
  assert.equal(await evaluate('document.getElementById("task-param-proof").value'),oldParam);
  // The installed task More actions are now one-level and icon-only.
  // Inspect the actual React workspace, without replacing its owned DOM.
  const moreMarkup=await evaluate('document.getElementById("task-tools").outerHTML');
  assert.match(moreMarkup,/task-operation-strip/);
  const strip=await evaluate('(()=>{const node=document.querySelector("#task-tools .task-operation-strip");'+
    'const box=node.getBoundingClientRect();const parent=document.querySelector("#task-selected-workspace").getBoundingClientRect();'+
    'return {display:getComputedStyle(node).display,buttons:node.querySelectorAll("button").length,'+
    'left:box.left,right:box.right,parentLeft:parent.left,parentRight:parent.right}})()');
  assert.equal(strip.display,'flex','More actions must be one aligned strip');
  assert.equal(strip.buttons,5,'Refresh, draft, toggle, uninstall and catalog actions stay available');
  assert(strip.left>=strip.parentLeft-1&&strip.right<=strip.parentRight+1,
    'Compact action strip must not overflow a selected task card: '+JSON.stringify(strip));
  assert.deepEqual(exceptions,[],'React must not throw inside Chrome');
  await click('#tab-workflow');
  await click('#workflow-provider-toggle');
  await checkEventually('document.querySelector("#workflow-source-menu [role=menuitem]")');
  await click('#workflow-source-menu [role="menuitem"]');
  await checkEventually('document.getElementById("opendesk-react-app").inert');
  await evaluate('(()=>{const s=window.__reactTest;s.detached={root:document.getElementById("opendesk-react-app"),editor:document.getElementById("workflow-editor"),settings:document.querySelector(".workflow-sheet-panel"),navigation:document.querySelector(".workbench-nav"),menu:document.getElementById("extension-center-row-menu"),run:document.getElementById("script-run"),input:document.getElementById("workflow-ai-request")};s.beforeDispose=s.calls.length;s.dispose();})()');
  assert.equal(await evaluate('document.querySelectorAll("#extension-center-react-root").length'),0);
  assert.equal(await evaluate('window.__reactTest.detached.settings.isConnected'),false,
    'The React-owned settings subtree is removed on disposal');
  assert.equal(await evaluate('document.querySelectorAll(".workflow-sheet-panel").length'),0,
    'Unmount must remove the actual React-owned Workflow settings panel');
  assert.equal(await evaluate('document.querySelector("#extension-center-list") === null'),true,
    'React root unmount must remove the complete Extension Center view');
  assert.equal(await evaluate('document.getElementById("extension-center")'),null);
  assert.equal(await evaluate('document.querySelector(".workbench-nav")'),null);
  assert.equal(await evaluate('document.querySelectorAll(".workbench-nav > *").length'),0);
  assert.equal(await evaluate('document.querySelector("#extension-center-row-menu")'),null);
  assert.equal(await evaluate('document.querySelectorAll("#develop-dock > *, #workbench-develop > *").length'),0);
  assert.equal(await evaluate('document.getElementById("workbench-develop")'),null);
  assert.equal(await evaluate('document.getElementById("opendesk-react-app").childElementCount'),0);
  assert.equal(await evaluate('window.__reactTest.detached.root.inert'),false,
    'Disposing an open sheet restores the shared React root inert state');
  assert.equal(await evaluate('window.__reactTest.subscriptions.size'),0);
  assert.equal(await evaluate('window.__reactTest.settingsListeners.size'),0,
    'Unmount must release shared Provider settings subscribers');
  assert.equal(await evaluate('window.__reactTest.myView.subscriberCount'),0);
  assert.deepEqual(await evaluate('window.__reactTest.developerView.resourceSnapshot()'),{subscriptions:0,actions:0});
  await evaluate('(()=>{const s=window.__reactTest;s.detached.run.click();s.detached.navigation.querySelector("button").click();s.detached.input.dispatchEvent(new Event("input",{bubbles:true}));s.publishWorkflow({sourceName:"after disposal"});s.myView.setText("task-installed-count","after disposal");s.ui.renderNavigation("tools");})()');
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  assert.equal(await evaluate('window.__reactTest.calls.length===window.__reactTest.beforeDispose'),true,
    'Detached controls and late model updates must not invoke actions after unmount');
  assert.equal(await evaluate('document.getElementById("opendesk-react-app").childElementCount'),0,
    'Late updates must not remount the disposed app');
  assert.deepEqual(exceptions,[],'Disposal and late updates must not throw');
  console.log(JSON.stringify({kind:'SOURCE_UI_SIMULATION_CHROMIUM',status:'PASS',
    browser:(await cdp('Browser.getVersion')).product,binary:browser,
    fixture:'src/ui/sidepanel.html',mode:'mountSidebarApp',checks:['single root','real typing',
    'React tab navigation','veto and arrow focus','filter selection','menu click','row menu trusted click','row click','React detail subtree','empty state',
    'trusted cleanup callback','live status','developer target indicator','developer run status',
    'developer Run Save Stop trusted clicks','disabled Run state','code-type trusted radio','developer result text escape',
    'workflow history and sheet focus','controlled draft and key input','retained task parameters',
    'unmount subscriptions and inert cleanup','detached actions and late updates'],operations:await evaluate('window.__reactTest.calls')}));
}catch(error){
  let snapshot;
  try{snapshot=await evaluate('({url:location.href,body:document.body.innerText.slice(0,4000),root:document.getElementById("extension-center")?.outerHTML.slice(0,1000),searchCount:document.querySelectorAll("#extension-center-search").length})');}
  catch(readError){snapshot={error:String(readError)};}
  console.error(JSON.stringify({kind:'SOURCE_UI_SIMULATION_CHROMIUM',status:'FAIL',
    error:String(error),exceptions,networkFailures,snapshot}));
  throw error;
}finally{
  try{socket?.close()}catch{}
  try{chrome?.kill('SIGTERM')}catch{}
  if(http.listening)await new Promise(resolve=>http.close(resolve));
  await vite.close();
  await delay(150);
  await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  await rm(fixtureCache,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
