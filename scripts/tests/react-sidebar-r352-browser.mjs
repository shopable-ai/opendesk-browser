#!/usr/bin/env node
// SOURCE_UI_SIMULATION_CHROMIUM. Real tool.html and appShell:true, but NO installed
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

const fixtureJS="\nimport {mountExtensionList} from '/src/ui/react/main.tsx';\nconst state={ui:null,accepted:'tasks',blocked:null,calls:[],trustedClicks:[]};\ndocument.addEventListener('click',event=>{\n  if(event.target.closest?.('[data-workbench-tab]'))state.trustedClicks.push(event.isTrusted);\n},true);\nstate.ui=mountExtensionList(document,{\n  debugEnabled:false,appShell:true,\n  onNavigate(tab){\n    state.calls.push(tab);\n    if(tab===state.blocked)return false;\n    state.accepted=tab;\n    state.ui.renderNavigation(tab);\n    return true;\n  }\n});\nconst get=id=>document.getElementById(id);\nstate.original={\n  task:get('workbench-tasks'),workflow:get('workbench-workflow'),\n  develop:get('workbench-develop'),cloudApproval:get('cloud-approval-section'),\n  cloudHosting:get('cloud-hosting'),taskParams:get('task-params-form'),\n  scriptSource:get('script-source'),workflowDraft:get('workflow-ai-request')\n};\nstate.ui.renderCloudOverview({summary:'连接 <script>不应执行</script>',connection:'未连接'});\nstate.ui.renderMyTaskCount('0 个任务');\nstate.ui.renderFeedback({showEmpty:true,emptyText:'暂无扩展',countText:'0 个扩展'});\nwindow.__r352=state;\ndocument.documentElement.dataset.r352Ready='true';\n";
const originalHtml=await readFile('src/ui/tool.html','utf8');
assert.doesNotMatch(originalHtml, /id="workbench-cloud"/,
  'Cloud is supplied by its React page, without a competing static template');
assert.match(originalHtml, /id="workspace-dock"/);
const fixtureHtml=originalHtml
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
  .replace(/<\/body>/i,'<script type="module" src="/__r352.js"></script></body>');
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const binary=process.env.CHROME_BIN||
  ['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser']
    .find(path=>existsSync(path));
assert.ok(binary,'CHROME_BIN or an installed Chromium is required');
const profile=await mkdtemp(join(tmpdir(),'od-r352-chrome-'));
const cacheDir=await mkdtemp(join(tmpdir(),'od-r352-vite-'));
const vite=await createServer({
  root:process.cwd(),configFile:false,appType:'custom',cacheDir,
  resolve:{dedupe:['react','react-dom']},logLevel:'error',
  optimizeDeps:{noDiscovery:true,entries:[],
    include:['react','react/jsx-runtime','react-dom','react-dom/client']},
  server:{middlewareMode:true}
});
const server=createHttpServer((req,res)=>{
  const path=new URL(req.url||'/','http://localhost').pathname;
  if(path==='/src/ui/tool.html'||path==='/__r352.js'){
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
  const url='http://127.0.0.1:'+server.address().port+'/src/ui/tool.html';
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
  assert.equal(baseline.shell,true,'The formal appShell:true branch must run');
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

  // R35.3: formal React Cloud request view. Physical CDP clicks must be
  // trusted, cause exactly one Controller action and preserve disclosure focus.
  await evaluate(`(()=>{const s=window.__r352;
    s.cloudActions=[];
    const model={
      rows:[{key:'entry-0',index:0,title:'请求 <img src=x onerror=evil()>',
        summary:'状态未知 · 未重新执行'}],
      pageText:'第 1 条 / 2 条',canPrev:false,canNext:true,detail:null,
      onPrev(){s.cloudActions.push('prev');},
      onNext(){s.cloudActions.push('next');s.ui.renderCloudRequests({
        ...model,pageText:'第 2 条 / 2 条',canNext:false,canPrev:true});},
      onDetail(index){
        s.cloudActions.push('detail:'+index);
        s.ui.renderCloudRequests({...model,detail:{
          key:'entry-'+index,title:'详情 <script>alert(1)</script>',
          state:'状态未知',facts:'未收到回执',reason:'不能自动重试',
          runId:'尚无可核对的原始 Run',canOpenRun:false,
          note:'仅状态，没有正文'}});},
      onClose(){s.cloudActions.push('close');s.ui.renderCloudRequests(model);},
      onOpenResult(){s.cloudActions.push('unexpected-open');}
    };
    s.ui.renderCloudRequests(model);
  })()`);
  await mouseClick('#tab-cloud');
  await evaluate('(()=>{const s=window.__r352;s.cloudSetupClicks=0;'+
    's.ui.renderCloudSetup({visible:true,nextStep:"连接提供者",'+
    'onConfigure:()=>{s.cloudSetupClicks++;}});})()');
  assert.equal(await evaluate('document.getElementById("cloud-first-run").hidden'),false);
  await mouseClick('#cloud-configure');
  assert.equal(await evaluate('window.__r352.cloudSetupClicks'),1,
    'React setup button forwards exactly one trusted callback');
  await evaluate('window.__r352.ui.renderCloudSetup({visible:false,'+
    'nextStep:"已连接",onConfigure:()=>{}})');
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

  // Paint many React snapshots, but preserve the same business nodes and drafts.
  await evaluate('(()=>{const s=window.__r352;'+
    's.original.scriptSource.value="async function main(){return 42;}";'+
    's.original.workflowDraft.value="不可丢失的工作流草稿";'+
    's.ui.renderCloudOverview({tasks:"3",requests:"1"});'+
    's.ui.renderMyTaskDetail("身份：保留");'+
    's.ui.renderNavigation("cloud");s.ui.renderNavigation("develop");})()');
  const preserved=await evaluate('(()=>{const s=window.__r352;'+
    'return {source:s.original.scriptSource===document.getElementById("script-source"),'+
    'sourceValue:s.original.scriptSource.value,'+
    'workflow:s.original.workflowDraft===document.getElementById("workflow-ai-request"),'+
    'workflowValue:s.original.workflowDraft.value,'+
    'cloud:s.original.cloudHosting===document.getElementById("cloud-hosting"),'+
    'approval:s.original.cloudApproval===document.getElementById("cloud-approval-section"),'+
    'task:s.original.task===document.getElementById("workbench-tasks")};})()');
  for(const key of ['source','workflow','cloud','approval','task'])
    assert.equal(preserved[key],true,'Borrowed business DOM identity: '+key);
  assert.equal(preserved.sourceValue,'async function main(){return 42;}');
  assert.equal(preserved.workflowValue,'不可丢失的工作流草稿');

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
  assert.deepEqual(exceptions,[],'No console errors or uncaught runtime exceptions');
  console.log('REACT_SIDEBAR_R352_APPSHELL_CHROMIUM_PASS',{
    evidence:'SOURCE_UI_SIMULATION_CHROMIUM',fixture:'src/ui/tool.html',
    mode:'appShell:true',widths:[320,360,400,440,960]
  });
}finally{
  try{socket?.close();}catch{}
  try{chrome?.kill('SIGTERM');}catch{}
  await new Promise(ok=>server.close(()=>ok()));
  await vite.close();
  await rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:100});
  await rm(cacheDir,{recursive:true,force:true,maxRetries:4,retryDelay:100});
}
