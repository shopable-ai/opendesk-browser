// Component fixture only: real Shell, Switch, Bridge Host and trigger ledger.
// Installation, Chrome permissions and storage are injected test boundaries.
// No real browser Task, Native request or ChatGPT message can be submitted.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,relative,extname} from 'node:path';
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const root=new URL('../../../',import.meta.url).pathname;
export async function createWebflowUIFixture({selfContained=false,appRevision=null,sourceRevision=null,sourcePatches=[]}={}){
const isFrozenSource=path=>path.startsWith('src/')||/^projects\/[^/]+\/trusted\//.test(path)||path==='projects/webflow/tool.config.json';
const readSource=async path=>{
 let contents=sourceRevision&&isFrozenSource(relative(root,path))?
  execFileSync('git',['show',sourceRevision+':'+relative(root,path)],{cwd:root,encoding:'utf8'}):await readFile(path,'utf8');
 for(const patch of sourcePatches.filter(patch=>patch.file===relative(root,path)))for(const row of patch.replacements){
  if(contents.split(row.from).length!==2)throw Error('Preview presentation patch drift: '+row.id);
  contents=contents.replace(row.from,()=>row.to);
 }
 return contents;
};
const config=JSON.parse(await readSource(resolve(root,'projects/webflow/tool.config.json')));
const appSources=new Map(await Promise.all(['main.js','model.js','style.css'].map(async name=>
 ['/app/'+name,appRevision?execFileSync('git',['show',appRevision+':projects/webflow/src/ui/'+name],{cwd:root,encoding:'utf8'}):await readFile(new URL('../src/ui/'+name,import.meta.url),'utf8')])));
const appRuntime=await build({stdin:{contents:`import * as React from 'react';
 import {createRoot} from 'react-dom/client';window.OpenDeskPageReact={...React,createRoot};`,resolveDir:root},
 bundle:true,write:false,minify:selfContained,format:'iife',platform:'browser',logLevel:'silent'});
const sdk=`const pins=${JSON.stringify(config.delegatedTasks)},store=new Map();
 window.OpenDeskTool={root:document.getElementById('fixture-root'),async request(name,args){
  if(name==='storage.get')return {value:store.get(args.key)??null,etag:'fixture'};
  if(name==='storage.set'){store.set(args.key,args.value);return {};}
  if(name==='currentPage.info')return {status:'available',url:'https://www.baidu.com/'};
  if(name==='tasks.read'&&args.taskId){if(${selfContained}&&args.taskId!=='baidu.search.top3')throw Error('模拟：Google 尚未安装');
   return {task:{...pins.find(pin=>pin.taskId===args.taskId),installationId:'fixture-only',generation:1}};}
  throw Error('Fixture forbids real execution');}};`;
const script=value=>'<script>'+String(value).replaceAll('</script','<\\/script')+'</script>';
const applicationHtml=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'"><title>Web Flow 应用源码 · 模拟 SDK</title><style>${appSources.get('/app/style.css')}\nhtml,body,#fixture-root{margin:0;min-height:100%}</style><body><div id="fixture-root"><div id="webflow-app"></div></div>${script(appRuntime.outputFiles[0].text)}${script(sdk)}${script(appSources.get('/app/model.js'))}${script(appSources.get('/app/main.js'))}</body></html>`;
const {outputFiles,metafile}=await build({stdin:{contents:`
import * as React from 'react';
import {createRoot} from 'react-dom/client';
import {SidebarAppShell} from './src/ui/react/app-shell.tsx';
import {createDeveloperView} from './src/ui/develop-view.js';
import {createMyWorkbenchView} from './src/ui/my-workbench-view.js';
import sharedUiCSS from './src/ui/react/components/ui/sidebar-shared.css?raw';
import {createSidebarToolsView} from './src/ui/sidebar-tools-view.js';
import {createChatGPTFixedBridgeHost} from './src/native-agent/chatgpt-fixed-bridge-host.js';
import {createChatGPTBridgeTriggerLedger} from './src/native-agent/chatgpt-bridge-trigger-gate.js';
const pin=${JSON.stringify(config.delegatedTasks[0])};
const installation={...pin,scriptId:'task:'+pin.taskId+':'+pin.version,revision:1,
 installationId:'fixture-only-install',generation:1};
const manifest={taskId:pin.taskId,version:pin.version,title:'百度搜索（模拟安装）',siteOrigins:['https://www.baidu.com'],
 program:{revision:1,sourceHash:pin.contentHash},paramsSchema:{type:'object',additionalProperties:false,
 required:['query','limit'],properties:{query:{type:'string',title:'搜索词',default:'OpenDesk Browser'},
 limit:{type:'integer',title:'结果数量',enum:[3]}}}};
const installed={...installation,enabled:true};let data={};
const ledger=createChatGPTBridgeTriggerLedger({${selfContained?"clock:()=>Date.parse('2026-11-03T14:28:22+08:00'),":''}storage:{get:async key=>({[key]:structuredClone(data[key])}),
 set:async value=>Object.assign(data,structuredClone(value))}});
const denied=()=>{throw Error('Fixture forbids real execution');};
const bridge=createChatGPTFixedBridgeHost({isVerifiedSidePanel:()=>true,
 api:{runtime:{async sendMessage(message){try{
  const result=await(message.kind==='auto-settings'?ledger.readAutoSettings():message.kind==='auto-enable'?ledger.setAutoEnabled(message.enabled):
   message.kind==='auto-grant'?ledger.approveAuto(message.scope):message.kind==='auto-revoke'?ledger.revokeAuto(message.taskId):denied());
  return {ok:true,data:result};}catch(error){return {ok:false,error:{code:error.code,message:error.message}};}}},
  permissions:{contains:async()=>true}},
 client:{request:async method=>method==='listTaskCatalog'?{installed:[installed],catalog:[{
  taskId:pin.taskId,version:pin.version,manifestHash:pin.manifestHash,stage:'available',manifest}]}:{...installed,manifest},
  controller:{snapshotControllerRun:denied}},host:{start:denied}});
let writes=0,failNext=false,taskView={session:null,receipt:null};
let readFailure=false,readPending=false,invalid=false,pendingReads=[];
const webflowAuto={...bridge,readBridgeState:async()=>structuredClone(taskView),controlBridge:denied,setAutoEnabled(value,event){
 document.getElementById('fixture-events').textContent='开关事件 isTrusted='+event.isTrusted+'；写入次数='+ ++writes;
 if(failNext){failNext=false;return Promise.reject(Error('模拟存储不可用'));}
 return bridge.setAutoEnabled(value,event);
},async readAutoSettings(){
 if(readPending)await new Promise(resolve=>pendingReads.push(resolve));
 if(readFailure)throw Error('模拟：授权状态读取失败');
 const snapshot=await bridge.readAutoSettings();
 if(invalid)snapshot.tasks=snapshot.tasks.map(row=>({...row,installation:{...row.installation,generation:2}}));
 return snapshot;
}};
${selfContained?`const approvedScope={taskId:pin.taskId,targetUrl:'https://www.baidu.com/',args:{query:'OpenDesk Browser',limit:3},
 installation:Object.fromEntries(['version','manifestHash','contentHash','scriptId','revision','installationId','generation'].map(key=>[key,installation[key]]))};
await ledger.approveAuto(approvedScope);
await ledger.setAutoEnabled(true);
webflowAuto.controlBridge=async({source,requestId,action},event)=>{
 if(!event?.isTrusted||source.documentId!==taskView.source?.documentId||requestId!==taskView.session?.requestId||action!=='cancel')throw Error('模拟边界拒绝此操作');
 taskView.session={...taskView.session,status:'已停止原请求（模拟）',actions:{}};
 taskView.receipt={execution:'stopped',persistence:'unverified',release:'retiring',delivery:'尚未交付'};
 return structuredClone(taskView);
};
// Only the clipboard API boundary is replaced. The actual component handles feedback.
Object.defineProperty(navigator,'clipboard',{value:{async writeText(text){
 if(copyFailure)throw Error('模拟：剪贴板不可用'); copiedText=text;
}},configurable:true});
let copyFailure=false,copiedText='';`:''}
const view=createSidebarToolsView();
const display={hidden:false,data:{toolId:'webflow',enabled:true,preview:false,settingsOpen:false}};
view.patch('sidebar-tool-display',display);view.patch('sidebar-tool-title',{textContent:'Web Flow'});
view.patch('sidebar-tool-settings-open',{hidden:true});view.patch('sidebar-tool-remove',{hidden:true});
${selfContained?`view.patch('sidebar-tool-settings-open',{hidden:false,disabled:true});view.patch('sidebar-tool-remove',{hidden:false,disabled:true});`:''}
function ApplicationFrame(){
 React.useLayoutEffect(()=>{
  const parent=document.getElementById('sidebar-tool-frame');
  parent.dataset.officialWorkspace='true';
  const frame=document.createElement('iframe');frame.className='sidebar-tool-iframe';
  frame.title='Web Flow 应用（真实源码，模拟 SDK）';${selfContained?'frame.srcdoc='+JSON.stringify(applicationHtml):"frame.src='/application'"};
  frame.setAttribute('sandbox','allow-scripts');parent.append(frame);
  return ()=>frame.remove();
 },[]);
 return null;
}
const app=createRoot(document.getElementById('opendesk-react-app'));
app.render(React.createElement(React.Fragment,null,React.createElement('style',null,sharedUiCSS),
 React.createElement(SidebarAppShell,{activeTab:'tools',toolView:view,webflowAuto,
  developerView:createDeveloperView(),myView:createMyWorkbenchView()}),React.createElement(ApplicationFrame)));
document.getElementById('fixture-close').onclick=()=>view.patch('sidebar-tool-display',{hidden:true});
document.getElementById('fixture-open').onclick=()=>view.patch('sidebar-tool-display',display);
document.getElementById('fixture-fail').onclick=()=>{failNext=true;};
document.getElementById('fixture-result').onclick=()=>{taskView={source:{documentId:'fixture-document'},session:{
 url:'https://chatgpt.com/c/fixture-only',requestId:'fixture-request',runId:'fixture-run',resultId:'fixture-result',
 status:'百度搜索已完成',fields:{},tasks:[],actions:{}},receipt:{execution:'completed',persistence:'verified',
 release:'released',delivery:'confirmed',value:{status:'success',count:3,results:[{title:'模拟结果，仅供界面验证',url:'https://example.com'}]}}};};
${selfContained?`// Bounded, preview-only controls; source WindowProxy and command allowlist.
view.bind('sidebar-tool-back','click',()=>{view.patch('sidebar-tool-display',{hidden:true});document.getElementById('fixture-return').hidden=false;});
document.getElementById('fixture-reopen').onclick=()=>{view.patch('sidebar-tool-display',display);document.getElementById('fixture-return').hidden=true;};
window.addEventListener('message',async event=>{
 if(event.source!==parent||event.data?.protocol!=='webflow.source-preview.v1')return;
 const {action,value}=event.data;
 if(action==='view'&&['overview','scope','task','help'].includes(value)){
  if(value==='overview')document.querySelector('[aria-label="关闭运行与授权"]')?.click();
  else{document.getElementById('webflow-runtime-open')?.click();
   requestAnimationFrame(()=>document.getElementById('webflow-runtime-tab-'+value)?.click());}
 }else if(action==='auth'&&['approved','none','revoked','invalid','error','loading','save-fail'].includes(value)){
  readFailure=value==='error';readPending=value==='loading';invalid=value==='invalid';
  if(value==='none'){data={};await ledger.setAutoEnabled(false);}
  if(value==='approved')await ledger.approveAuto(approvedScope);
  if(value==='revoked')await ledger.revokeAuto(pin.taskId);
  failNext=value==='save-fail';
  if(!readPending)pendingReads.splice(0).forEach(resolve=>resolve());
  document.getElementById('webflow-auto-refresh')?.click();
 }else if(action==='copy'&&['success','error'].includes(value))copyFailure=value==='error';
 else if(action==='task'&&['empty','waiting','running','success','failed','unknown','history'].includes(value)){
  if(value==='empty'){taskView={session:null,receipt:null};return;}
  document.getElementById('fixture-result').click();
  const waiting=value==='waiting',running=value==='running',history=value==='history';
  taskView.session.status={history:'当前可见回复属于历史或未见证的发送，未触发新请求，也不会补跑。完成一次 ChatGPT 能力接入后，正常发送新需求；已用候选不会重新执行。',waiting:'等待 ChatGPT 完整回复',running:'百度搜索执行中',success:'百度搜索已完成',failed:'执行失败：模拟网站读取失败',unknown:'结果未知：请查询原请求，不会自动重试'}[value];
  if(history){taskView.session.requestId=null;taskView.session.url='https://chatgpt.com/g/g-p-fixture-opendesk-browser/c/fixture-conversation';}
  taskView.session.fields={disabled:true,task:'baidu',query:'OpenDesk Browser',target:'https://www.baidu.com/',args:'{}'};
  taskView.session.actions={cancel:waiting||running||value==='unknown'};
  if(waiting||history)taskView.receipt=null;
  else if(value!=='success'){taskView.receipt={execution:running?'running':value==='failed'?'failed':'unknown',persistence:'unverified',release:'retiring',delivery:value==='unknown'?'unknown':'尚未交付'};}
 }
});`:''}
`,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',
 minify:selfContained,metafile:true,outfile:'fixture.js',logLevel:'silent',alias:{'@opendesk/ui':resolve(root,'src/ui/react/components/ui/button.tsx')},plugins:[{name:'raw-css',setup(builder){
 builder.onResolve({filter:/\.css\?raw$/},args=>({path:resolve(args.resolveDir,args.path)}));
  builder.onLoad({filter:/\.css\?raw$/},async args=>({contents:await readSource(args.path.slice(0,-4)),loader:'text'}));
 }},{name:'explicit-source-snapshot',setup(builder){
  if(!sourceRevision&&!sourcePatches.length)return;
  builder.onLoad({filter:/\.(?:[cm]?js|jsx|tsx?|css)$/},async args=>{
   if(!isFrozenSource(relative(root,args.path)))return;
   return {contents:await readSource(args.path),loader:extname(args.path).slice(1)};
  });
 }}]});
const css=(await Promise.all(['design-tokens.css','design-system.css','tool-shell.css','extension-center.css']
 .map(name=>readSource(resolve(root,'src/ui/'+name))))).join('\n');
return {applicationHtml,appRuntime:appRuntime.outputFiles[0].contents,appSources,sdk,readSource,
 js:outputFiles.find(f=>f.path.endsWith('.js')).text,css,
 dependencyPaths:Object.keys(metafile.inputs).filter(path=>!path.includes('node_modules')&&path!=='<stdin>').map(path=>path.replace(/\?raw$/,''))};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
const {appRuntime,appSources,sdk,js,css}=await createWebflowUIFixture();
const server=createServer((req,res)=>{
 if(req.url==='/application'){
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>Web Flow 应用组件</title>
   <link rel="stylesheet" href="/app/style.css"><style>html,body,#fixture-root{margin:0;height:100%}</style></head>
   <body><div id="fixture-root"><div id="webflow-app"></div></div><script src="/app-runtime.js"></script>
   <script src="/app-sdk.js"></script><script src="/app/model.js"></script><script src="/app/main.js"></script></body></html>`);return;
 }
 if(req.url==='/app-runtime.js'){res.setHeader('Content-Type','text/javascript');res.end(appRuntime);return;}
 if(req.url==='/app-sdk.js'){
  res.setHeader('Content-Type','text/javascript');res.end(sdk);return;
 }
 if(appSources.has(req.url)){res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'text/javascript');res.end(appSources.get(req.url));return;}
 if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(js);return;}
 if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}
 if(req.url!=='/'){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type','text/html; charset=utf-8');
 res.end(`<!doctype html><html lang="zh-CN" data-opendesk-tab="tools"><head><title>Web Flow 自动运行 · 组件验证</title>
 <link rel="stylesheet" href="/style.css"><style>html,body{height:100%;margin:0}body{display:flex;flex-direction:column}</style></head><body>
 <details style="padding:4px 12px;background:#fff4da;color:#442d00"><summary>组件验证 · 真实 UI / 模拟数据</summary>
 <button id="fixture-close">模拟关闭应用</button><button id="fixture-open">模拟重开应用</button>
 <button id="fixture-fail">下次开关模拟保存失败</button><button id="fixture-result">模拟完成结果</button>
 <p id="fixture-events">尚未写入</p></details>
 <div id="opendesk-react-app" class="opendesk-react-app"></div><script type="module" src="/fixture.js"></script></body></html>`);
});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({url:'http://127.0.0.1:'+server.address().port,
 level:'COMPONENT_ONLY_REAL_SHELL_HOST_LEDGER',pid:process.pid})));
}
