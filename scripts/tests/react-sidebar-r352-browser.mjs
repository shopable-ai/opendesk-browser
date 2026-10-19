#!/usr/bin/env node
// SOURCE_UI_SIMULATION_CHROMIUM. Real sidepanel.html and mountSidebarApp, but NO installed
// extension, Host, permission grant, sandbox, Scheduler or persistence proof.
// Navigate through real CDP input: JavaScript-dispatched clicks cannot fake isTrusted.
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

const state={ui:null,accepted:'tasks',blocked:null,calls:[],trustedClicks:[],
  cloudActions:[],headerActions:[],inputs:[]};
state.developerView=createDeveloperView();
state.myView=createMyWorkbenchView();
state.myView.project('taskRows',{rows:[{taskId:'draft-proof',title:'草稿身份',enabled:true}],selectedId:'draft-proof'});
state.developerView.actions['script-source']=event=>state.inputs.push('source:'+event.isTrusted);
document.addEventListener('click',event=>{
  if(event.target.closest?.('[data-workbench-tab]'))state.trustedClicks.push(event.isTrusted);
},true);
state.ui=mountSidebarApp(document,{
  debugEnabled:false,developerView:state.developerView,myView:state.myView,
  onNavigate(tab){
    state.calls.push(tab);
    if(tab===state.blocked)return false;
    state.accepted=tab;
    state.ui.renderNavigation(tab);
    return true;
  }
});

// The UI fixture supplies presentation models only. There is no Cloud Host,
// installer, credential, scheduler or execution authority in this browser test.
const subscriptions=new Set();
state.workflowModel={controls:{'workflow-ai-request':{value:''}},phase:'idle',messages:[]};
state.workflowSubscriptionCount=()=>subscriptions.size;
state.publishWorkflow=changes=>{
  state.workflowModel={...state.workflowModel,...changes};
  for(const listener of subscriptions)listener();
};
state.workflowController={
  subscribe(listener){subscriptions.add(listener);return ()=>subscriptions.delete(listener);},
  getSnapshot(){return state.workflowModel;},
  actions:{
    input(id,value,event){
      state.inputs.push(id+':'+event.isTrusted);
      state.publishWorkflow({controls:{
        ...state.workflowModel.controls,[id]:{
          ...(state.workflowModel.controls[id]||{}),value
        }
      }});
    },
    click(){}
  }
};
state.ui.connectWorkflowPage(state.workflowController);
const requestRows=[{key:'entry-0',index:0,title:'请求 <img src=x onerror=evil()>',
  summary:'状态未知 · 未重新执行'}];
const requestModel={
  rows:requestRows,pageText:'第 1 条 / 2 条',canPrev:false,canNext:true,detail:null,
  onPrev(){state.cloudActions.push('prev');},
  onNext(){
    state.cloudActions.push('next');
    state.publishCloud({requests:{...state.cloudPage.requests,
      pageText:'第 2 条 / 2 条',canNext:false,canPrev:true,detail:null}});
  },
  onDetail(index){
    state.cloudActions.push('detail:'+index);
    state.publishCloud({requests:{...state.cloudPage.requests,detail:{
      key:'entry-'+index,title:'详情 <script>alert(1)</script>',
      state:'状态未知',facts:'未收到回执',reason:'不能自动重试',
      runId:'尚无可核对的原始 Run',canOpenRun:false,
      note:'仅状态，没有正文'
    }}});
  },
  onClose(){
    state.cloudActions.push('close');
    state.publishCloud({requests:{...state.cloudPage.requests,detail:null}});
  },
  onOpenResult(){state.cloudActions.push('unexpected-open');}
};
state.cloudPage={
  overview:{summary:'连接 <script>不应执行</script>',connection:'未连接'},
  authorization:{tasks:[],busy:false,canApprove:false,canStop:false},
  pairing:{brief:'未配对',status:'尚未配对',busy:false},
  clients:{rows:[],tasks:[],count:0,busy:false},
  requests:requestModel,
  setup:{visible:true,nextStep:'连接提供者'},
  visibleApproval:false,
  onRefresh(){state.headerActions.push('refresh');},
  onOpenConsole(){state.headerActions.push('console');}
};
state.publishCloud=(changes={})=>{
  state.cloudPage={...state.cloudPage,...changes};
  state.ui.renderCloudPage(state.cloudPage);
};
state.publishCloud();
state.myView.setText('task-installed-count','0 个任务');
state.ui.renderFeedback({showEmpty:true,emptyText:'暂无扩展',countText:'0 个扩展'});
const get=id=>document.getElementById(id);
state.original={
  task:get('workbench-tasks'),workflow:get('workbench-workflow'),
  develop:get('workbench-develop'),cloudApproval:get('cloud-approval-section'),
  cloudHosting:get('cloud-hosting'),taskParams:get('task-params-form'),
  scriptSource:get('script-source'),workflowDraft:get('workflow-ai-request')
};
window.__r352=state;
document.documentElement.dataset.r352Ready='true';
`;
const originalHtml=await readFile('src/ui/sidepanel.html','utf8');
assert.doesNotMatch(originalHtml, /id="workbench-cloud"/,
  'Cloud is supplied by its React page, without a competing static template');
assert.match(originalHtml,/<div\b[^>]*id="opendesk-react-app"[^>]*><\/div>/,
  'The production React root is empty before mountSidebarApp runs');
assert.doesNotMatch(originalHtml,/id="workspace-dock"/,
  'React supplies the Dock without a competing static template');
const fixtureHtml=originalHtml
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
  .replace(/href="ui\//g,'href="/src/ui/')
  .replace(/<\/body>/i,'<script type="module" src="/__r352.js"></script></body>');
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const binary=process.env.CHROME_BIN||
  [join(process.cwd(),'tests/.cache/m5-browsers/155.0.8059.39/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),'/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser']
    .find(path=>existsSync(path));
assert.ok(binary,'CHROME_BIN or an installed Chromium is required');
const profile=await mkdtemp(join(tmpdir(),'od-r352-chrome-'));
const cacheDir=await mkdtemp(join(tmpdir(),'od-r352-vite-'));
const vite=await createServer({
  root:process.cwd(),configFile:false,appType:'custom',cacheDir,
  resolve:{dedupe:['react','react-dom']},logLevel:'error',
  optimizeDeps:{noDiscovery:true,entries:[],
    include:['react','react/jsx-runtime','react-dom','react-dom/client']},
  // Source transforms only: no shared HMR port or development watcher.
  server:{middlewareMode:true,hmr:false,ws:false,watch:null}
});
const server=createHttpServer((req,res)=>{
  const path=new URL(req.url||'/','http://localhost').pathname;
  if(path==='/sidepanel.html'||path==='/__r352.js'){
    res.writeHead(200,{'Content-Type':path.endsWith('.html')
      ?'text/html; charset=utf-8':'text/javascript; charset=utf-8'});
    res.end(path.endsWith('.html')?fixtureHtml:fixtureJS);
    return;
  }
  vite.middlewares(req,res);
});
let chrome,socket,launchError,port=0,nextId=0;
const pending=new Map(),exceptions=[];
function cdp(method,params={}){
  return new Promise((resolve,reject)=>{
    const id=++nextId;
    const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP_TIMEOUT '+method));},18000);
    pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},
      reject:error=>{clearTimeout(timer);reject(error);}});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const result=await cdp('Runtime.evaluate',{
    expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)
    throw Error('Browser evaluate exception: '+JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function eventually(expression){
  for(let attempt=0;attempt<100;attempt++){
    try{if(await evaluate(expression))return;}catch{}
    await sleep(80);
  }
  throw Error('Expected browser condition: '+expression);
}
async function mouseClick(selector){
  await evaluate('document.querySelector('+JSON.stringify(selector)+
    ')?.scrollIntoView({block:"nearest",inline:"nearest"})');
  const rect=await evaluate('(()=>{const el=document.querySelector('+
    JSON.stringify(selector)+');if(!el)throw Error("Missing selector");'+
    'const r=el.getBoundingClientRect();return {x:r.x+r.width/2,'+
    'y:r.y+r.height/2,w:r.width,h:r.height}})()');
  assert(rect.w>0&&rect.h>0,'Clickable element is visible: '+selector);
  assert(rect.x>=0&&rect.x<960&&rect.y>=0&&rect.y<900,
    'Target must be within current browser viewport: '+selector+' '+JSON.stringify(rect));
  await cdp('Input.dispatchMouseEvent',{
    type:'mousePressed',button:'left',clickCount:1,x:rect.x,y:rect.y});
  await cdp('Input.dispatchMouseEvent',{
    type:'mouseReleased',button:'left',clickCount:1,x:rect.x,y:rect.y});
}
async function key(key,code,windowsVirtualKeyCode){
  const args={key,code,windowsVirtualKeyCode};
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',...args});
  await cdp('Input.dispatchKeyEvent',{type:'keyUp',...args});
}
try{
  await new Promise((ok,fail)=>server.listen(0,'127.0.0.1',ok)
    .once('error',fail));
  chrome=spawn(binary,[
    '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--no-default-browser-check','--window-size=960,900',
    '--user-data-dir='+profile,'--remote-debugging-port=0','about:blank'
  ],{stdio:['ignore','ignore','pipe']});
  chrome.once('error',error=>{launchError=error;});
  let stderr='';
  chrome.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-9000);});
  for(let attempt=0;attempt<300;attempt++){
    if(launchError)throw launchError;
    if(chrome.exitCode!==null||chrome.signalCode)
      throw Error('Chrome crashed: '+stderr);
    try{
      port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);
      if(port)break;
    }catch{}
    await sleep(100);
  }
  assert(port,'No DevTools port: '+stderr);
  const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const target=targets.find(tab=>tab.type==='page');
  assert(target?.webSocketDebuggerUrl,'No Chromium tab');
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{
    socket.addEventListener('open',ok,{once:true});
    socket.addEventListener('error',fail,{once:true});
  });
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.method==='Runtime.exceptionThrown'){
      const d=message.params.exceptionDetails||{};
      exceptions.push([d.text,d.exception?.description,d.url].filter(Boolean).join(' | '));
    }
    if(message.method==='Runtime.consoleAPICalled'&&message.params.type==='error')
      exceptions.push('console.error: '+message.params.args.map(x=>x.value||x.description).join(' '));
    const result=pending.get(message.id);
    if(!result)return;
    pending.delete(message.id);
    if(message.error)result.reject(Error(message.error.message));
    else result.resolve(message.result);
  });
  await cdp('Runtime.enable');await cdp('Page.enable');
  const url='http://127.0.0.1:'+server.address().port+'/sidepanel.html';
  const navigation=await cdp('Page.navigate',{url});
  assert(!navigation.errorText,'Unable to load real HTML');
  try{await eventually('document.documentElement.dataset.r352Ready==="true"');}
  catch(error){
    const page=await evaluate('({text:document.body.innerText.slice(0,900),'+
      'root:!!document.getElementById("opendesk-react-app"),'+
      'scripts:[...document.scripts].map(node=>node.src)})');
    throw Error(error.message+'; page='+JSON.stringify(page)+'; exceptions='+exceptions.join('\n'));
  }
  const baseline=await evaluate('(()=>{const d=document;const ids=['+
    '"opendesk-react-app","workspace-content","workspace-dock",'+
    '"workbench-tasks","workbench-tools","workbench-workflow",'+
    '"workbench-develop","workbench-cloud","extension-center",'+
    '"cloud-hosting","cloud-approval-section","script-source",'+
    '"workflow-ai-request"];return {'+
    'shell:window.__r352.ui.appShellMounted,'+
    'owned:!!d.getElementById("extension-center").dataset.opendeskReactOwner,'+
    'counts:ids.map(id=>[id,d.querySelectorAll("#"+id).length]),'+
    'roots:d.querySelectorAll("#opendesk-react-app").length,'+
    'nav:d.querySelectorAll(".workbench-nav [role=tab]").length,'+
    'selected:d.querySelector("[aria-selected=true][data-workbench-tab]")?.dataset.workbenchTab,'+
    'cloudSections:[...d.querySelector("#workbench-cloud .cloud-panel").children].map(x=>x.id||x.className)'+
    '}})()');
  assert.equal(baseline.shell,true,'The production mountSidebarApp must own the complete shell');
  assert.equal(baseline.owned,true);
  assert.equal(baseline.nav,6);
  assert.equal(baseline.roots,1);
  assert.equal(baseline.selected,'tasks');
  for(const [id,count] of baseline.counts)
    assert.equal(count,1,'DOM ID must have one reachable owner: '+id);
  assert(baseline.cloudSections.some(value=>String(value).includes('cloud-hosting')),
    'Actual Cloud Host UI must be preserved, not replaced by simulated authority');
  assert.equal(await evaluate('document.querySelector("#cloud-overview-state script")'),null,
    'Cloud text must be escaped');
  assert.match(await evaluate('document.getElementById("cloud-overview-state").textContent'),
    /<script>不应执行<\/script>/);

  // Real CDP actions against the current complete React Cloud page.
  // Each click reaches exactly one presentation callback; no Host exists here.
  await mouseClick('#tab-cloud');
  assert.equal(await evaluate('document.getElementById("cloud-first-run").hidden'),false);
  assert.equal(await evaluate('document.getElementById("cloud-open-console").disabled'),false);
  assert.equal(await evaluate('document.getElementById("cloud-overview-refresh").disabled'),false);
  await mouseClick('#cloud-overview-refresh');
  await mouseClick('#cloud-open-console');
  assert.deepEqual(await evaluate('window.__r352.headerActions'),['refresh','console']);
  await mouseClick('#cloud-configure');
  await eventually('document.getElementById("cloud-hosting").open===true');
  await eventually('document.activeElement.id==="cloud-url"');
  await evaluate('window.__r352.publishCloud({setup:{visible:false,nextStep:"已连接"}})');
  assert.equal(await evaluate('document.getElementById("cloud-first-run").hidden'),true);
  assert.equal(await evaluate('document.querySelectorAll("#cloud-request-samples").length'),1);
  assert.equal(await evaluate('document.querySelector("#cloud-request-samples img")'),null);
  assert.match(await evaluate('document.getElementById("cloud-request-samples").textContent'),
    /<img src=x onerror=evil\(\)>/);
  assert.equal(await evaluate('document.getElementById("cloud-request-prev").disabled'),true);
  await mouseClick('#cloud-request-samples button');
  await eventually('document.getElementById("cloud-request-detail").hidden===false');
  assert.equal(await evaluate('document.activeElement.id'),'cloud-request-detail-title');
  assert.equal(await evaluate('document.getElementById("cloud-request-detail-title").textContent'),
    '详情 <script>alert(1)</script>');
  assert.equal(await evaluate('document.querySelector("#cloud-request-detail script")'),null);
  assert.equal(await evaluate('document.getElementById("cloud-request-open-result").disabled'),true);
  await mouseClick('#cloud-request-close');
  assert.equal(await evaluate('document.getElementById("cloud-request-detail").hidden'),true);
  assert.equal(await evaluate('document.activeElement.textContent.trim()'),'查看详情',
    'Close should restore focus to the same request action');
  await mouseClick('#cloud-request-next');
  assert.match(await evaluate('document.getElementById("cloud-request-page").textContent'),
    /第 2 条/);
  assert.equal(await evaluate('document.getElementById("cloud-request-next").disabled'),true);
  assert.deepEqual(await evaluate('window.__r352.cloudActions'),
    ['detail:0','close','next'],'One native gesture must invoke one action');

  // A veto through the same navigation interface must preserve selected tab
  // AND keyboard focus. A real mouse click checks the Chrome-trusted path.
  await mouseClick('#tab-tools');
  await eventually('window.__r352.accepted==="tools"');
  assert.equal(await evaluate('document.getElementById("workbench-tools").hidden'),false);
  assert.equal(await evaluate('document.getElementById("workbench-tasks").hidden'),true);
  await mouseClick('#tab-workflow');
  await eventually('window.__r352.accepted==="workflow"');
  await evaluate('window.__r352.blocked="develop";document.getElementById("tab-workflow").focus()');
  // A rejected trusted pointer activation must restore focus to the selected
  // tab instead of leaving a tabIndex=-1 button focused.
  await mouseClick('#tab-develop');
  assert.equal(await evaluate('window.__r352.accepted'),'workflow');
  assert.equal(await evaluate('document.activeElement.id'),'tab-workflow',
    'Rejected mouse navigation restores roving tab focus');
  await key('ArrowRight','ArrowRight',39);
  assert.equal(await evaluate('window.__r352.accepted'),'workflow');
  assert.equal(await evaluate('document.activeElement.id'),'tab-workflow');
  await evaluate('window.__r352.blocked=null');
  await key('ArrowRight','ArrowRight',39);
  await eventually('window.__r352.accepted==="develop"');
  assert.equal(await evaluate('document.activeElement.id'),'tab-develop');
  assert.equal(await evaluate('window.__r352.trustedClicks.every(Boolean)'),true,
    'Native mouse clicks must be trusted');

  // Real input must reach the models before navigation and repeated paints.
  await mouseClick('#script-source');
  await evaluate('document.getElementById("script-source").select()');
  await cdp('Input.insertText',{text:'async function main(){return 42;}'});
  await eventually('window.__r352.developerView.getSnapshot().fields["script-source"].value==="async function main(){return 42;}"');
  await mouseClick('#tab-workflow');
  await eventually('window.__r352.accepted==="workflow"');
  await mouseClick('#workflow-ai-request');
  await cdp('Input.insertText',{text:'不可丢失的工作流草稿'});
  await eventually('window.__r352.workflowModel.controls["workflow-ai-request"].value==="不可丢失的工作流草稿"');
  await mouseClick('#tab-cloud');
  await mouseClick('#tab-develop');
  await evaluate('(()=>{const s=window.__r352;'+
    's.ui.renderCloudOverview({tasks:"3",requests:"1"});'+
    's.myView.project("taskDetail","身份：保留");'+
    's.ui.renderNavigation("cloud");s.ui.renderNavigation("develop");})()');
  await eventually('document.getElementById("script-source").value==="async function main(){return 42;}" && document.getElementById("workflow-ai-request").value==="不可丢失的工作流草稿"');
  const preserved=await evaluate('(()=>{const s=window.__r352;'+
    'return {source:s.original.scriptSource===document.getElementById("script-source"),'+
    'sourceValue:s.original.scriptSource.value,'+
    'workflow:s.original.workflowDraft===document.getElementById("workflow-ai-request"),'+
    'workflowValue:s.original.workflowDraft.value,'+
    'cloud:s.original.cloudHosting===document.getElementById("cloud-hosting"),'+
    'approval:s.original.cloudApproval===document.getElementById("cloud-approval-section"),'+
    'task:s.original.task===document.getElementById("workbench-tasks")};})()');
  for(const key of ['source','workflow','cloud','approval','task'])
    assert.equal(preserved[key],true,'React retained business DOM identity: '+key);
  assert.equal(preserved.sourceValue,'async function main(){return 42;}');
  assert.equal(preserved.workflowValue,'不可丢失的工作流草稿');
  assert.deepEqual(await evaluate('window.__r352.inputs'),
    ['source:true','workflow-ai-request:true'],'Both drafts must use trusted browser input');

  for(const width of [320,360,400,440,960]){
    await cdp('Emulation.setDeviceMetricsOverride',{
      width,height:900,deviceScaleFactor:1,mobile:false});
    const result=await evaluate('({root:document.querySelectorAll("#opendesk-react-app").length,'+
      'selected:document.querySelectorAll(".workbench-nav [aria-selected=true]").length,'+
      'source:!!document.getElementById("script-source"),'+
      'dock:!!document.getElementById("workspace-dock")})');
    assert.deepEqual(result,{root:1,selected:1,source:true,dock:true},
      'No duplicate mount or detached controls at '+width+'px');
  }
  await cdp('Emulation.clearDeviceMetricsOverride');
  await evaluate('(()=>{const s=window.__r352;s.beforeDispose={calls:s.calls.length,inputs:s.inputs.length,cloud:s.cloudActions.length,header:s.headerActions.length};s.ui.dispose();})()');
  assert.equal(await evaluate('document.getElementById("opendesk-react-app").childElementCount'),0,
    'Disposing the production root removes all pages and the Dock');
  assert.equal(await evaluate('document.querySelectorAll(".workbench-nav,#workspace-dock,[data-workbench-page]").length'),0);
  assert.equal(await evaluate('window.__r352.myView.subscriberCount'),0);
  assert.equal(await evaluate('window.__r352.workflowSubscriptionCount()'),0);
  assert.equal(await evaluate('window.__r352.developerView.resourceSnapshot().subscriptions'),0);
  await evaluate('(()=>{const s=window.__r352;s.original.scriptSource.dispatchEvent(new Event("input",{bubbles:true}));s.original.workflowDraft.dispatchEvent(new Event("input",{bubbles:true}));s.developerView.patch("script-source",{value:"after disposal"});s.myView.setText("task-installed-count","after disposal");s.publishWorkflow({sourceName:"after disposal"});s.ui.renderNavigation("cloud");s.publishCloud();})()');
  assert.deepEqual(await evaluate('(()=>{const s=window.__r352;return {calls:s.calls.length,inputs:s.inputs.length,cloud:s.cloudActions.length,header:s.headerActions.length}})()'),
    await evaluate('window.__r352.beforeDispose'),'Unmounted controls must not dispatch actions');
  assert.equal(await evaluate('document.getElementById("opendesk-react-app").childElementCount'),0,
    'Late presentation updates must not remount the app');
  await evaluate('window.__r352.developerView.dispose()');
  assert.deepEqual(exceptions,[],'No console errors or uncaught runtime exceptions');
  console.log('REACT_SIDEBAR_R352_APPSHELL_CHROMIUM_PASS',{
    evidence:'SOURCE_UI_SIMULATION_CHROMIUM',fixture:'src/ui/sidepanel.html',
    mode:'mountSidebarApp',browser:(await cdp('Browser.getVersion')).product,binary,
    widths:[320,360,400,440,960],checks:['trusted navigation and veto focus',
      'cloud actions and focus','trusted controlled draft input','retained DOM',
      'unmount subscriptions','detached actions and late updates']
  });
}finally{
  try{socket?.close();}catch{}
  try{chrome?.kill('SIGTERM');}catch{}
  await new Promise(ok=>server.close(()=>ok()));
  await vite.close();
  await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:100});
  await rm(cacheDir,{recursive:true,force:true,maxRetries:4,retryDelay:100});
}
