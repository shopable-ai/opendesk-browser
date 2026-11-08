// Isolated UI fixture: actual application sources + real React, mocked SDK.
// No Chrome extension, Authority, site effects or real user records are used.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
const project=new URL('../',import.meta.url);
const config=JSON.parse(await readFile(new URL('tool.config.json',project),'utf8'));
const files={'/model.js':'model.js','/main.js':'main.js','/style.css':'style.css'};
const sources=new Map(await Promise.all(Object.entries(files).map(async([route,file])=>
 [route,await readFile(new URL('src/ui/'+file,project))])));
const inputs=Object.fromEntries([...sources].map(([route,bytes])=>[files[route],createHash('sha256').update(bytes).digest('hex')]));
const {outputFiles}=await build({stdin:{contents:`import * as React from 'react';
 import {createRoot} from 'react-dom/client'; window.OpenDeskPageReact={...React,createRoot};`,
 resolveDir:process.cwd()},bundle:true,write:false,format:'iife',minify:true,platform:'browser'});
const runtime=outputFiles[0].contents,store=new Map(),calls=[];
const etag=key=>createHash('sha256').update(JSON.stringify(store.get(key)??null)).digest('hex');
let run=null,mode='held';
const snapshot=()=>run?{...run,retirementState:mode==='released'?'released':'retiring',
 state:'completed',result:{tag:'controller-result',runId:run.runId,resultId:run.resultId,state:'completed',outcome:{ok:true}},
 value:{status:'success',count:1,results:[{title:'组件夹具的结果正文（非真实网站）',url:'https://example.com/fixture'}]}}:null;
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Web Flow J06 · 独立 UI 组件验证</title>
<link rel="stylesheet" href="/style.css"><body><aside style="padding:12px;background:#fff4da;color:#442d00">
<strong>组件验证 · 模拟 SDK，无真实 Task、Chrome 安装或网页执行</strong>
<p id="calls">尚未派发</p><button id="release">模拟原任务完成并释放</button>
<button id="revoke">模拟撤权</button>
<button id="task-unavailable">模拟任务未安装或已停用</button>
<button id="task-restored">模拟恢复任务安装</button></aside><div id="fixture-root"><div id="webflow-app"></div></div>
<script src="/runtime.js"></script><script src="/fixture.js"></script>
<script src="/model.js"></script><script src="/main.js"></script></body></html>`;
const fixture=`window.OpenDeskTool={root:document.getElementById('fixture-root'),async request(name,args){
 const response=await fetch('/sdk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,args})});
 const value=await response.json();if(!response.ok)throw Object.assign(Error(value.message||value.code),{code:value.code});return value;}};
document.getElementById('release').onclick=()=>fetch('/control/released',{method:'POST'});
document.getElementById('revoke').onclick=()=>fetch('/control/revoked',{method:'POST'});
document.getElementById('task-unavailable').onclick=()=>fetch('/control/task-unavailable',{method:'POST'});
document.getElementById('task-restored').onclick=()=>fetch('/control/task-restored',{method:'POST'});
setInterval(async()=>{const s=await (await fetch('/counts')).json();document.getElementById('calls').textContent=
 '模拟派发次数：'+s.starts+' · 原请求 ID：'+(s.clientRequestId||'无');},400);`;
let revoked=false,taskUnavailable=false;
const server=createServer(async(req,res)=>{
 const json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
 try{
  if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);return;}
  if(req.url==='/runtime.js'||req.url==='/fixture.js'){
   res.writeHead(200,{'Content-Type':'text/javascript'});res.end(req.url==='/runtime.js'?runtime:fixture);return;
  }
  if(files[req.url]){res.writeHead(200,{'Content-Type':req.url.endsWith('.css')?'text/css':'text/javascript'});
   res.end(sources.get(req.url));return;}
  if(req.url==='/counts'){json({starts:calls.filter(c=>c.name==='tasks.start').length,clientRequestId:run?.clientRequestId});return;}
  if(req.url==='/control/released'&&req.method==='POST'){mode='released';json({});return;}
  if(req.url==='/control/revoked'&&req.method==='POST'){revoked=true;json({});return;}
  if(req.url==='/control/task-unavailable'&&req.method==='POST'){taskUnavailable=true;json({});return;}
  if(req.url==='/control/task-restored'&&req.method==='POST'){taskUnavailable=false;json({});return;}
  if(req.url==='/sdk'&&req.method==='POST'){
   let input='';for await(const chunk of req)input+=chunk;
   const {name,args}=JSON.parse(input);calls.push({name,args});
   if(name==='storage.get'){json({value:store.get(args.key)??null,etag:etag(args.key)});return;}
   if(name==='storage.set'){
    if(args.ifMatch!==etag(args.key)){json({code:'E_CONFLICT'},409);return;}
    store.set(args.key,args.value);json({});return;
   }
   if(name==='currentPage.info'){json({status:'available',url:'https://www.baidu.com/'});return;}
   if(revoked){json({code:'E_PERMISSION'},403);return;}
   if(name==='tasks.read'&&args.taskId){const pin=config.delegatedTasks.find(p=>p.taskId===args.taskId);
    if(taskUnavailable&&args.taskId==='baidu.search.top3'){
     json({code:'E_PERMISSION',message:'Task is disabled or not installed'},403);return;
    }
    json({task:{...pin,installationId:'fixture-installation',generation:1}});return;}
   if(name==='tasks.start'){
    run={clientRequestId:args.clientRequestId,runId:'fixture-run-original',resultId:'fixture-result-original'};
    json({...run,state:'running',retirementState:'retiring',result:null,value:null});return;
   }
   if(name==='tasks.read'){
    json(run?.clientRequestId===args.clientRequestId?snapshot():{clientRequestId:args.clientRequestId,state:'unknown',semantic:'UNKNOWN'});return;
   }
   if(name==='tasks.stop'){json({clientRequestId:args.clientRequestId,state:'stopping',result:null,value:null});return;}
   json({code:'E_UNSUPPORTED'},400);return;
  }
  res.writeHead(404);res.end();
 }catch(e){json({code:e.code||'E_FIXTURE'},500);}
});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({pid:process.pid,url:'http://127.0.0.1:'+server.address().port,level:'UI_COMPONENT_MOCK_SDK',inputs})));
