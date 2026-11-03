// Component fixture only: real Shell, Switch, Bridge Host and trigger ledger.
// Installation, Chrome permissions and storage are injected test boundaries.
// No real browser Task, Native request or ChatGPT message can be submitted.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'esbuild';

const root=new URL('../../../',import.meta.url).pathname;
const config=JSON.parse(await readFile(new URL('../tool.config.json',import.meta.url),'utf8'));
const appSources=new Map(await Promise.all(['main.js','model.js','style.css'].map(async name=>
 ['/app/'+name,await readFile(new URL('../src/ui/'+name,import.meta.url),'utf8')])));
const appRuntime=await build({stdin:{contents:`import * as React from 'react';
 import {createRoot} from 'react-dom/client';window.OpenDeskPageReact={...React,createRoot};`,resolveDir:root},
 bundle:true,write:false,format:'iife',platform:'browser',logLevel:'silent'});
const {outputFiles}=await build({stdin:{contents:`
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
const ledger=createChatGPTBridgeTriggerLedger({storage:{get:async key=>({[key]:structuredClone(data[key])}),
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
const webflowAuto={...bridge,readBridgeState:async()=>structuredClone(taskView),controlBridge:denied,setAutoEnabled(value,event){
 document.getElementById('fixture-events').textContent='开关事件 isTrusted='+event.isTrusted+'；写入次数='+ ++writes;
 if(failNext){failNext=false;return Promise.reject(Error('模拟存储不可用'));}
 return bridge.setAutoEnabled(value,event);
}};
const view=createSidebarToolsView();
const display={hidden:false,data:{toolId:'webflow',enabled:true,preview:false,settingsOpen:false}};
view.patch('sidebar-tool-display',display);view.patch('sidebar-tool-title',{textContent:'Web Flow'});
view.patch('sidebar-tool-settings-open',{hidden:true});view.patch('sidebar-tool-remove',{hidden:true});
function ApplicationFrame(){
 React.useLayoutEffect(()=>{
  const parent=document.getElementById('sidebar-tool-frame');
  parent.dataset.officialWorkspace='true';
  const frame=document.createElement('iframe');frame.className='sidebar-tool-iframe';
  frame.title='Web Flow 应用（真实源码，模拟 SDK）';frame.src='/application';
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
`,resolveDir:root,loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser',
 outfile:'fixture.js',logLevel:'silent',alias:{'@opendesk/ui':resolve(root,'src/ui/react/components/ui/button.tsx')},plugins:[{name:'raw-css',setup(builder){
 builder.onResolve({filter:/\.css\?raw$/},args=>({path:resolve(args.resolveDir,args.path)}));
 builder.onLoad({filter:/\.css\?raw$/},async args=>({contents:await readFile(args.path.slice(0,-4),'utf8'),loader:'text'}));
 }}]});
const css=(await Promise.all(['design-tokens.css','design-system.css','tool-shell.css','extension-center.css']
 .map(name=>readFile(new URL('src/ui/'+name,new URL('../../../',import.meta.url)),'utf8')))).join('\n');
const server=createServer((req,res)=>{
 if(req.url==='/application'){
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>Web Flow 应用组件</title>
   <link rel="stylesheet" href="/app/style.css"><style>html,body,#fixture-root{margin:0;height:100%}</style></head>
   <body><div id="fixture-root"><div id="webflow-app"></div></div><script src="/app-runtime.js"></script>
   <script src="/app-sdk.js"></script><script src="/app/model.js"></script><script src="/app/main.js"></script></body></html>`);return;
 }
 if(req.url==='/app-runtime.js'){res.setHeader('Content-Type','text/javascript');res.end(appRuntime.outputFiles[0].contents);return;}
 if(req.url==='/app-sdk.js'){
  res.setHeader('Content-Type','text/javascript');res.end(`
   const pins=${JSON.stringify(config.delegatedTasks)},store=new Map();
   window.OpenDeskTool={root:document.getElementById('fixture-root'),async request(name,args){
    if(name==='storage.get')return {value:store.get(args.key)??null,etag:'fixture'};
    if(name==='storage.set'){store.set(args.key,args.value);return {};}
    if(name==='currentPage.info')return {status:'available',url:'https://www.baidu.com/'};
    if(name==='tasks.read'&&args.taskId)return {task:{...pins.find(pin=>pin.taskId===args.taskId),installationId:'fixture-only',generation:1}};
    throw Error('Fixture forbids real execution');}};`);return;
 }
 if(appSources.has(req.url)){res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':'text/javascript');res.end(appSources.get(req.url));return;}
 if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(outputFiles.find(f=>f.path.endsWith('.js')).text);return;}
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
