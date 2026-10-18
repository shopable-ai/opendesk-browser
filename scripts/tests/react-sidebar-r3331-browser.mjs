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

const fixtureJS="\nimport {mountExtensionList} from '/src/ui/react/main.tsx';\nconst ui=mountExtensionList(document),calls=[],state={query:'',kind:'all',scope:'smart',menuOpen:false};\nconst rowMenu=document.getElementById('extension-center-row-menu');ui.attachRowMenu(rowMenu);ui.connectBack(()=>{calls.push('back');ui.renderView('list');});\nconst row={key:'app:sample',title:'React 安全演示',description:'不可运行用户代码',kind:'app',type:'应用',installed:true,primaryAction:'打开'};\nfunction draw(){\n  ui.renderToolbar({...state,language:'zh-CN',\n    onSearch(value){state.query=value;calls.push('search:'+value);draw();},\n    onToggleMenu(){state.menuOpen=!state.menuOpen;calls.push('menu:'+state.menuOpen);draw();},\n    onKind(value){state.kind=value;calls.push('kind:'+value);draw();},\n    onScope(value){state.scope=value;calls.push('scope:'+value);draw();},\n    onReset(){state.kind='all';state.scope='smart';calls.push('reset');draw();},\n    onMarket(){calls.push('market');},onImport(){calls.push('import');},\n    onReload(){calls.push('reload');},onLanguage(value){calls.push('language:'+value);}\n  });\n  ui.renderRows({rows:[row],busy:false,pendingKey:null,\n    onOpenRow(key){calls.push('open:'+key);ui.renderView('detail');\n      ui.renderDetail({key,title:row.title,description:row.description,\n        type:'应用',kind:'app',installed:true,busy:false,actions:[],\n        installationText:'本机已安装（测试模拟）',version:'1.0.0',source:null});},\n    onMore(key){calls.push('more:'+key);ui.setMenuKey(key);\n      ui.renderRowMenu([{id:'toggle',label:'停用应用',onClick:event=>{calls.push('toggle:'+event.isTrusted);rowMenu.hidden=true;ui.renderRowMenu([]);ui.setMenuKey(null);}}]);rowMenu.hidden=false;}\n  });\n  ui.renderFeedback({showEmpty:false,emptyText:'无匹配扩展',countText:'1 个扩展'});\n  ui.renderRecoveries({ids:[],busy:false,onRetry(id,event){calls.push('cleanup:'+id+':'+event.isTrusted);}});\n  ui.renderStatus({text:'测试状态',state:'info'});\n}\ndraw();\nconst myRows=[{taskId:'demo-a',title:'回归任务 A',description:'内容保持',enabled:true},{taskId:'demo-b',title:'回归任务 B',description:'不会重建参数',enabled:true}];\nlet mySelection='demo-a';\nfunction paintMy(){ui.renderMyTaskRows({rows:myRows,selectedId:mySelection,emptyText:'',onSelect:id=>{mySelection=id;calls.push('task-select:'+id);paintMy();}});}\npaintMy();\nui.renderMyTaskCount('2 个');ui.renderMyTaskDetail('身份由 TaskWorkbench 管理');\nconst dev={runDisabled:false,runLabel:'运行草稿',saveDisabled:false,saveHidden:false,saveTitle:'保存草稿',saveLabel:'保存版本',stopDisabled:false,stopLabel:'停止'};\nfunction paintDeveloperActions(){ui.renderDeveloperActions({...dev,onRun:event=>calls.push('run:'+event.isTrusted),onSave:event=>calls.push('save:'+event.isTrusted),onStop:event=>calls.push('stop:'+event.isTrusted)});}\npaintDeveloperActions();\nconst framework={mode:'javascript',compilerEnabled:true};\nfunction paintFramework(){ui.renderDeveloperFramework({...framework,onSelect:(kind,event)=>{if(framework.mode===kind)return;calls.push('framework:'+kind+':'+event.isTrusted);framework.mode=kind;paintFramework();}});}\npaintFramework();\nui.renderDeveloperStatus({state:'ready',text:'可运行'});\nui.renderDeveloperResult({text:'尚无结果',kind:'尚无结果'});\nui.renderDeveloperTarget({title:'本地 Chromium 页面',url:'https://example.com/view',host:'example.com',hostTitle:'https://example.com/view',status:'网页可运行',state:'available',statusTitle:'已核对身份'});\n\nconst providerNode=document.getElementById('workflow-ai-provider');\nconst workflowSettings=document.getElementById('workflow-provider-settings');\nconst closeWorkflow=()=>{\n  workflowSettings.open=false;\n  ui.renderWorkflowSettings({open:false,onClose:closeWorkflow});\n};\nui.connectWorkflowEvents({\n  onHistory:event=>calls.push('workflow-history:'+event.isTrusted),\n  onNewSession:event=>calls.push('workflow-session:'+event.isTrusted),\n  onNewWorkflow:event=>calls.push('workflow-new:'+event.isTrusted),\n  onOpenSavedHistory:(key,event)=>calls.push('workflow-open:'+key+':'+event.isTrusted)\n});\nui.renderWorkflowHeader({saved:true,savedText:'已保存',savedTitle:'已固定',busy:false,\n  planning:false,historyExpanded:false,sessionHint:'保留当前工作流'});\nui.renderWorkflowSettings({open:false,onClose:closeWorkflow});\nui.renderWorkflowSourceName('my-inference-model');\nui.renderWorkflowHistory({open:false,busy:false,canResume:false,\n  rows:[{key:'saved-revision-fixture',title:'已保存的测试版本',fullTitle:'测试版本 r2',savedText:'r2 · fixtures only'}]});\nui.renderWorkflowMessages([{id:'chat-1',speaker:'你',message:'安全输出 <script>不可执行</script>'}]);\ndocument.getElementById('workflow-provider-toggle').addEventListener('click',event=>{\n  if(!event.isTrusted)return;\n  workflowSettings.open=true;\n  ui.renderWorkflowSettings({open:true,onClose:closeWorkflow});\n});\n\nwindow.__reactTest={ui,calls,state,dev,framework,providerNode,paintDeveloperActions,paintFramework,dispose(){ui.dispose()}};\ndocument.documentElement.dataset.fixtureReady='true';\n";
const fixtureHtml="<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><link rel=\"stylesheet\" href=\"/src/ui/design-tokens.css\"><link rel=\"stylesheet\" href=\"/src/ui/design-system.css\"><link rel=\"stylesheet\" href=\"/src/ui/tool-shell.css\"><link rel=\"stylesheet\" href=\"/src/ui/extension-center.css\"></head><body><main id=\"extension-center\"></main><section id=\"workbench-tasks\" hidden><div id=\"task-installed-count\"></div><div id=\"task-installed-cards\" class=\"task-card-list od-stack\"></div><div id=\"task-selected-workspace\" class=\"task-selected-workspace\"><input id=\"task-param-proof\" value=\"保持参数\"><details class=\"task-tools od-disclosure\" open><summary>更多操作</summary><details class=\"od-disclosure od-disclosure--flat\" open><summary><span class=\"task-management-heading\">任务管理</span></summary><div class=\"task-management-actions\"><div class=\"row\"><button type=\"button\">停用</button></div><p class=\"hint\">操作提示</p></div></details></details></div><div id=\"task-installed-detail\"></div></section><section id=\"workbench-develop\"><span id=\"script-current-page-host\">正在识别…</span><span id=\"script-current-page-status\">检查中</span><p id=\"script-current-page-title\">正在识别…</p><p id=\"script-current-page-url\"></p><span id=\"script-status\" data-state=\"loading\">正在连接</span><span id=\"script-result-kind\">尚无结果</span><pre id=\"script-result\">尚无结果</pre></section><fieldset id=\"page-component-framework\"><div class=\"page-component-choices\"><label for=\"page-component-javascript\"><input id=\"page-component-javascript\" type=\"radio\" name=\"page-component-choice\" checked>JavaScript</label><label for=\"page-component-react\"><input id=\"page-component-react\" type=\"radio\" name=\"page-component-choice\">React</label><label for=\"page-component-vue\"><input id=\"page-component-vue\" type=\"radio\" name=\"page-component-choice\">Vue</label></div></fieldset><div id=\"develop-dock\"><div class=\"dock-buttons\"><button id=\"script-run\" disabled>运行草稿</button><button id=\"script-save\">保存版本</button><button id=\"script-stop\" disabled>停止</button></div></div><div id=\"extension-center-row-menu\" class=\"ec-context-menu\" role=\"menu\" hidden></div><section id='workbench-workflow' style='padding:10px;min-height:170px'><section id='workflow-editor' class='workflow-editor'><header class='workflow-head'><div class='workflow-head-actions'><button>旧标题动作</button></div></header><div id='workflow-history-react-host'></div><div id='workflow-ai-transcript' role='log' aria-live='polite'></div><div class='workflow-composer'><textarea id='workflow-ai-request'>保留原始输入草稿</textarea><button type='button' id='workflow-provider-toggle'>AI 设置</button><span id='workflow-source-react-host'></span><details id='workflow-provider-settings' class='workflow-provider od-disclosure od-disclosure--flat'><summary>AI 设置</summary><label for='workflow-ai-provider'>AI 来源</label><select id='workflow-ai-provider'><option value='local_codex'>本机 Codex</option><option value='cloud_responses'>HTTPS</option></select><input id='workflow-ai-key' type='password' value='保持原值' aria-label='演示密钥'><button type='button' id='workflow-local-refresh'>重新检查</button></details></div></section><div id='workflow-settings-react-host'></div></section><script type=\"module\" src=\"/__react_fixture.js\"></script></body></html>";

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const browser=process.env.CHROME_BIN||
  ['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser']
    .find(path=>existsSync(path));
assert.ok(browser,'Real Chromium/Chrome required (CHROME_BIN or installed binary)');
// Serve fixture endpoints BEFORE Vite's transform/fallback middleware.
 // This avoids a custom route appended after Vite's terminal 404 handler.
const fixtureCache=await mkdtemp(join(tmpdir(),'opendesk-react-r3331-cache-'));
const vite=await createServer({root:process.cwd(),configFile:false,appType:'custom',
  cacheDir:fixtureCache,resolve:{dedupe:['react','react-dom']},
  logLevel:'error',
  // The fixture imports JSX from source. Browser ESM cannot directly import
  // React 19's CommonJS exports (e.g. react-dom.createPortal), so prebundle
  // only the pinned React entrypoints; do not scan the entire repository.
  optimizeDeps:{noDiscovery:true,entries:[],
    include:['react','react/jsx-runtime','react-dom','react-dom/client']},
  server:{middlewareMode:true}});
const http=createHttpServer((req,res)=>{
  const path=new URL(req.url||'/','http://localhost').pathname;
  if(path==='/'||path==='/__react_fixture.js'){
    res.writeHead(200,{'Content-Type':path==='/'?'text/html; charset=utf-8':'text/javascript'});
    res.end(path==='/'?fixtureHtml:fixtureJS);
    return;
  }
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
  assert.match(await fixture.text(),/mountExtensionList/);
  chrome=spawn(browser,[
    '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--no-default-browser-check',
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
  const navigation=await cdp('Page.navigate',{url:'http://127.0.0.1:'+httpPort+'/'});
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
  assert.equal(await evaluate('document.querySelectorAll("#extension-center-list .ec-row").length'),1);
  assert.equal(await evaluate('document.getElementById("extension-center-count").textContent'),'1 个扩展');
  assert.equal(await evaluate('document.getElementById("extension-center-status").textContent'),'测试状态');
  assert.equal(await evaluate('document.getElementById("extension-center-empty").hidden'),true);
  assert.equal(await evaluate('document.getElementById("script-current-page-host").textContent'),'example.com');
  assert.equal(await evaluate('document.querySelectorAll("#develop-dock .dock-buttons > button").length'),3);
  assert.equal(await evaluate('document.querySelectorAll("#page-component-framework input").length'),3);
  assert.equal(await evaluate('document.getElementById("script-status").textContent'),'可运行');
  assert.equal(await evaluate('document.getElementById("script-status").dataset.state'),'ready');
  assert.equal(await evaluate('document.getElementById("script-result").dataset.opendeskReactOwner'),'developer-result');
  await evaluate('window.__reactTest.ui.renderDeveloperResult({text:"安全文本 <script>alert(1)</script>",kind:"JSON"})');
  assert.equal(await evaluate('document.getElementById("script-result").textContent'),'安全文本 <script>alert(1)</script>');
  assert.equal(await evaluate('document.querySelectorAll("#script-result script").length'),0);
  assert.equal(await evaluate('document.getElementById("script-result-kind").textContent'),'JSON');
  await evaluate('window.__reactTest.ui.renderDeveloperStatus({state:"error",text:"错误 <unsafe>"})');
  assert.equal(await evaluate('document.getElementById("script-status").textContent'),'错误 <unsafe>');
  assert.equal(await evaluate('document.getElementById("script-status").dataset.state'),'error');
  await click('#page-component-react');
  await checkEventually('window.__reactTest.framework.mode==="react"');
  assert.equal(await evaluate('document.getElementById("page-component-react").checked'),true);
  assert.equal(await evaluate('window.__reactTest.calls.filter(x=>x==="framework:react:true").length'),1);
  await click('#page-component-vue');
  await checkEventually('window.__reactTest.framework.mode==="vue"');
  await evaluate('window.__reactTest.framework.mode="javascript";window.__reactTest.framework.compilerEnabled=false;window.__reactTest.paintFramework()');
  assert.equal(await evaluate('document.getElementById("page-component-react").disabled'),true);
  assert.equal(await evaluate('document.querySelector("#develop-dock .dock-buttons").dataset.opendeskReactOwner'),'developer-actions');
  await click('#script-run');await click('#script-save');await click('#script-stop');
  await checkEventually('window.__reactTest.calls.includes("stop:true")');
  for(const action of ['run:true','save:true','stop:true'])
    assert.equal(await evaluate('window.__reactTest.calls.filter(x=>x==='+JSON.stringify(action)+').length'),1);
  await evaluate('window.__reactTest.dev.runDisabled=true;window.__reactTest.dev.stopLabel="取消准备";window.__reactTest.paintDeveloperActions()');
  assert.equal(await evaluate('document.getElementById("script-run").disabled'),true);
  assert.equal(await evaluate('document.getElementById("script-stop").textContent'),'取消准备');
  await click('#script-run');
  assert.equal(await evaluate('window.__reactTest.calls.filter(x=>x==="run:true").length'),1,'Disabled React Run must not execute');
  assert.equal(await evaluate('document.getElementById("script-current-page-status").dataset.state'),'available');
  assert.equal(await evaluate('document.getElementById("script-current-page-title").textContent'),'本地 Chromium 页面');
  await evaluate('window.__reactTest.ui.renderDeveloperTarget({title:"正在识别…",url:"",host:"正在识别…",hostTitle:"",status:"检查中",state:"resolving",statusTitle:""})');
  assert.equal(await evaluate('document.getElementById("script-current-page-status").dataset.state'),'resolving');
  await evaluate('window.__reactTest.ui.renderDeveloperTarget({title:"本地 Chromium 页面",url:"https://example.com/view",host:"example.com",hostTitle:"https://example.com/view",status:"网页可运行",state:"available",statusTitle:"已核对身份"})');
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
  assert.equal(await evaluate('document.querySelector("#extension-center-row-menu").dataset.opendeskReactOwner'),'extension-row-menu');
  await click('#extension-center-row-menu button');
  await checkEventually('window.__reactTest.calls.includes("toggle:true")');
  assert.equal(await evaluate('document.querySelector("#extension-center-row-menu").hidden'),true);
  assert.equal(await evaluate('document.querySelector("#extension-center-row-menu").childElementCount'),0);
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
  // This component fixture follows a long Extension+Developer test page.
  // Move ONLY the workflow fixture into the visible viewport before sending
  // real CDP mouse events; never fake trusted clicks or bypass hit testing.
  await evaluate('Object.assign(document.getElementById("workbench-workflow").style,{position:"fixed",top:"10px",left:"10px",width:"min(360px, calc(100vw - 20px))",height:"320px",background:"white",zIndex:"300"})');
  assert.equal(await evaluate('window.__reactTest.ui.workflowMounted'),true);
  assert.equal(await evaluate('document.querySelectorAll("#workflow-ai-transcript .workflow-chat-entry").length'),1);
  assert.equal(await evaluate('document.querySelector("#workflow-ai-transcript .workflow-chat-entry p").textContent'),'安全输出 <script>不可执行</script>');
  assert.equal(await evaluate('document.querySelectorAll("#workflow-ai-transcript script").length'),0);
  assert.equal(await evaluate('document.querySelectorAll("#workflow-history-toggle,#workflow-ai-new-session,#workflow-new").length'),3);
  assert.equal(await evaluate('document.querySelector("#workflow-source-name").textContent'),'my-inference-model');
  await evaluate('window.__reactTest.ui.renderWorkflowHistory({open:true,busy:false,canResume:false,rows:[{key:"saved-revision-fixture",title:"已保存的测试版本",fullTitle:"测试版本 r2",savedText:"r2 · fixtures only"}]})');
  assert.equal(await evaluate('document.querySelectorAll("#workflow-history-panel .workflow-history-row").length'),1);
  await click('#workflow-history-panel .workflow-history-row');
  assert.equal(await evaluate('window.__reactTest.calls.filter(s=>s==="workflow-open:saved-revision-fixture:true").length'),1);
  await evaluate('window.__reactTest.ui.renderWorkflowHistory({open:false,busy:false,canResume:false,rows:[]})');
  await click('#workflow-history-toggle');
  await click('#workflow-ai-new-session');
  await click('#workflow-new');
  for(const name of ['workflow-history:true','workflow-session:true','workflow-new:true'])
    assert.equal(await evaluate('window.__reactTest.calls.filter(x=>x==='+JSON.stringify(name)+').length'),1);
  await click('#workflow-provider-toggle');
  await checkEventually('document.querySelector(".workflow-sheet-overlay") && !document.querySelector(".workflow-sheet-overlay").hidden');
  assert.equal(await evaluate('document.querySelectorAll(".workflow-sheet-panel[role=dialog][aria-modal=true]").length'),1);
  assert.equal(await evaluate('document.getElementById("workflow-editor").inert'),true);
  assert.equal(await evaluate('document.activeElement.id'),'workflow-ai-provider');
  assert.equal(await evaluate('document.getElementById("workflow-ai-provider")===window.__reactTest.providerNode'),true);
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  assert.equal(await evaluate('document.querySelector(".workflow-sheet-panel").contains(document.activeElement)'),true);
  await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await checkEventually('document.querySelector(".workflow-sheet-overlay").hidden');
  assert.equal(await evaluate('document.getElementById("workflow-editor").inert'),false);
  assert.equal(await evaluate('document.getElementById("workflow-ai-request").value'),'保留原始输入草稿');
  assert.equal(await evaluate('document.getElementById("workflow-ai-key").value'),'保持原值');
  await click('#workflow-provider-toggle');
  await checkEventually('!document.querySelector(".workflow-sheet-overlay").hidden');
  // Click above the sheet using real CDP pointer input; the backdrop's
  // geometric center can sit beneath the foreground panel.
  const backdropPoint=await evaluate('({x:innerWidth/2,y:8,hit:document.elementFromPoint(innerWidth/2,8)?.className})');
  assert.equal(backdropPoint.hit,'workflow-sheet-backdrop');
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:backdropPoint.x,y:backdropPoint.y,button:'left',clickCount:1});
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:backdropPoint.x,y:backdropPoint.y,button:'left',clickCount:1});
  await checkEventually('document.querySelector(".workflow-sheet-overlay").hidden');
  assert.equal(await evaluate('document.getElementById("workflow-provider-settings")===window.__reactTest.providerNode.parentElement.querySelector("#workflow-ai-provider").closest("details")'),true);
  // Use actual CDP mouse input (isTrusted=true), not a synthetic DOM click.
  await evaluate('Object.assign(document.getElementById("workbench-tasks").style,{position:"fixed",top:"10px",left:"10px",width:"360px",height:"390px",overflow:"auto",background:"white",zIndex:"400"});document.getElementById("workbench-tasks").hidden=false');
  await checkEventually('document.querySelector("[data-task-id=demo-a]").getAttribute("aria-expanded")==="true"');
  const oldParam=await evaluate('document.getElementById("task-param-proof").value');
  await click('[data-task-id="demo-a"]');
  await checkEventually('document.querySelector("[data-task-id=demo-a]").getAttribute("aria-expanded")==="false"');
  assert.equal(await evaluate('document.getElementById("task-selected-workspace").hidden'),true);
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
  // Mount the exact trusted markup into the UI-only browser fixture before
  // inspecting its geometry; do not test the retired nested manager HTML.
  const {load:readTaskHtml}=await import('cheerio');
  const official=(await import('node:fs/promises')).readFile;
  const $task=readTaskHtml(await official('src/ui/tool.html','utf8'));
  const moreMarkup=$task('#task-tools').toString();
  assert.match(moreMarkup,/task-operation-strip/);
  await evaluate('document.querySelector(".task-tools").outerHTML='+JSON.stringify(moreMarkup));
  const strip=await evaluate('(()=>{const node=document.querySelector("#task-tools .task-operation-strip");'+
    'const box=node.getBoundingClientRect();const parent=document.querySelector("#task-selected-workspace").getBoundingClientRect();'+
    'return {display:getComputedStyle(node).display,buttons:node.querySelectorAll("button").length,'+
    'left:box.left,right:box.right,parentLeft:parent.left,parentRight:parent.right}})()');
  assert.equal(strip.display,'flex','More actions must be one aligned strip');
  assert.equal(strip.buttons,5,'Refresh, draft, toggle, uninstall and catalog actions stay available');
  assert(strip.left>=strip.parentLeft-1&&strip.right<=strip.parentRight+1,
    'Compact action strip must not overflow a selected task card: '+JSON.stringify(strip));
  assert.deepEqual(exceptions,[],'React must not throw inside Chrome');
  await evaluate('window.__reactTest.dispose()');
  assert.equal(await evaluate('document.querySelectorAll("#extension-center-react-root").length'),0);
  assert.equal(await evaluate('document.getElementById("workflow-provider-settings").closest(".workflow-composer")!==null'),true);
  assert.equal(await evaluate('document.querySelectorAll("#workflow-settings-react-host > *").length'),0);
  assert.equal(await evaluate('document.querySelector("#extension-center-list") === null'),true,
    'React root unmount must remove the complete Extension Center view');
  assert.equal(await evaluate('document.getElementById("extension-center").dataset.opendeskReactOwner'),undefined);
  assert.equal(await evaluate('document.querySelector("#develop-dock .dock-buttons").dataset.opendeskReactOwner'),undefined);
  assert.equal(await evaluate('document.querySelector("#develop-dock .dock-buttons").childElementCount'),0);
  assert.equal(await evaluate('document.querySelector(".page-component-choices").childElementCount'),0);
  assert.equal(await evaluate('document.querySelector(".page-component-choices").dataset.opendeskReactOwner'),undefined);
  assert.equal(await evaluate('document.querySelector("#extension-center-row-menu").dataset.opendeskReactOwner'),undefined);
  assert.equal(await evaluate('document.getElementById("script-status").dataset.opendeskReactOwner'),undefined);
  assert.equal(await evaluate('document.getElementById("script-result").dataset.opendeskReactOwner'),undefined);
  assert.equal(await evaluate('document.getElementById("script-result-kind").dataset.opendeskReactOwner'),undefined);
  console.log(JSON.stringify({kind:'SOURCE_UI_SIMULATION_CHROMIUM',status:'PASS',
    browser:(await cdp('Browser.getVersion')).product,checks:['single root','real typing',
    'filter selection','menu click','row menu trusted click','row click','React detail subtree','empty state',
    'trusted cleanup callback','live status','developer target indicator','developer run status',
    'developer Run Save Stop trusted clicks','disabled Run state','code-type trusted radio','developer result text escape','unmount'],operations:recorded}));
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
