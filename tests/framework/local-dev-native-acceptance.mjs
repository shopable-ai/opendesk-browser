// Real Chrome for Testing + real installed Native Host + real stdio MCP.
// CDP is test observation and trusted pointer input only, never the program executor.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {setup,cleanup,doctor} from '../../native-agent/install.mjs';
import {requestAgent} from '../../native-agent/cli.mjs';
import {approveNativePermission} from './native-chrome-consent.mjs';

const root=process.cwd(),out=path.resolve(process.env.OPENDESK_DEV_EVIDENCE||'docs/framework/evidence/local-dev-r22-native');
fs.mkdirSync(out,{recursive:true});
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label,ms=20000){const end=Date.now()+ms;let last;while(Date.now()<end){try{const v=await fn();if(v)return v;}catch(error){last=error;}await pause(150);}throw new Error(label+' timed out'+(last?': '+last.message:''));}
const events=[];const record=(type,value)=>{const row={time:new Date().toISOString(),type,value};events.push(row);fs.appendFileSync(out+'/events.jsonl',JSON.stringify(row)+'\n');console.log(type+' '+JSON.stringify(value));};
async function cdp(url){
 const ws=new WebSocket(url),requests=new Map();let seq=0;
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(!msg.id||!requests.has(msg.id))return;const p=requests.get(msg.id);requests.delete(msg.id);clearTimeout(p.timer);msg.error?p.reject(new Error(msg.error.message)):p.resolve(msg.result);});
 ws.addEventListener('close',()=>{for(const p of requests.values()){clearTimeout(p.timer);p.reject(new Error('CDP disconnected'));}requests.clear();});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{requests.delete(id);reject(new Error('CDP timeout '+method));},15000);requests.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
 return {call,close:()=>ws.close(),read:async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text);return result.result?.value;},
  async click(selector){const r=await this.read('(()=>{const n=document.querySelector('+JSON.stringify(selector)+');if(!n)return null;const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');assert.ok(r&&r.x>0&&r.y>0,'visible trusted click '+selector);await call('Input.dispatchMouseEvent',{type:'mousePressed',...r,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...r,button:'left',clickCount:1});},
  async screenshot(file){const image=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,file),Buffer.from(image.data,'base64'));}};
}
function mcp(project){
 const child=spawn(process.execPath,[path.join(root,'native-agent/local-dev/mcp.mjs'),'--allow-project',project],{stdio:['pipe','pipe','pipe']});
 const pending=new Map();let seq=0,buffer='';child.stderr.on('data',bytes=>fs.appendFileSync(out+'/mcp-stderr.log',bytes));
 child.stdout.on('data',bytes=>{buffer+=bytes;let index;while((index=buffer.indexOf('\n'))>=0){const value=JSON.parse(buffer.slice(0,index));buffer=buffer.slice(index+1);const item=pending.get(value.id);if(item){clearTimeout(item.timer);pending.delete(value.id);value.error?item.reject(new Error(JSON.stringify(value.error))):item.resolve(value.result);}}});
 const request=(method,params)=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(new Error('MCP timeout '+method));},40000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
 return {child,request,notify:(method,params)=>child.stdin.write(JSON.stringify({jsonrpc:'2.0',method,params})+'\n'),
  async tool(name,args){const result=await request('tools/call',{name:'opendesk.dev.'+name,arguments:args});record('mcp.'+name,result.structuredContent);if(result.isError)throw Object.assign(new Error(result.structuredContent.error.message),result.structuredContent.error);return result.structuredContent;},
  close(){child.stdin.end();for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('MCP closed'));}pending.clear();}};
}
const binary=process.env.CHROME_FOR_TESTING_BIN;
if(!binary||!fs.existsSync(binary))throw new Error('CHROME_FOR_TESTING_BIN must identify an actual controlled Chrome for Testing binary');
const workspace=fs.mkdtempSync(path.join(os.tmpdir(),'od-dev-')),profile=path.join(workspace,'profile'),project=path.join(workspace,'project');
fs.mkdirSync(profile,{mode:0o700});fs.mkdirSync(project);
let chrome,server,browser,options,tool,target,mcpClient,installed=false;
let report={status:'IN_PROGRESS',startedAt:new Date().toISOString(),platform:process.platform,sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),packageManifestSha256:sha(fs.readFileSync('dist/production/manifest.json')),buildReceipt:JSON.parse(fs.readFileSync('docs/framework/evidence/wxt/builds/build-production.json','utf8')),chromeVersion:spawnSync(binary,['--version'],{encoding:'utf8'}).stdout.trim(),profile,tests:[]};
try{
 const argv=['--no-first-run','--no-default-browser-check','--use-mock-keychain','--disable-gpu','--disable-dev-shm-usage','--disable-background-networking','--disable-sync','--remote-debugging-port=0','--user-data-dir='+profile,'--disable-extensions-except='+path.join(root,'dist/production'),'--load-extension='+path.join(root,'dist/production'),'about:blank'];
 if(process.platform==='linux'&&process.getuid()===0)argv.unshift('--no-sandbox');
 chrome=spawn(binary,argv,{stdio:['ignore','ignore','pipe']});report.launch={executable:binary,argv,pid:chrome.pid};chrome.stderr.on('data',bytes=>fs.appendFileSync(out+'/chrome-stderr.log',bytes));
 const lines=await until(()=>fs.existsSync(path.join(profile,'DevToolsActivePort'))&&fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').trim().split('\n'),'Chrome DevTools');
 const base='http://127.0.0.1:'+lines[0];browser=await cdp('ws://127.0.0.1:'+lines[0]+lines[1]);
 const newTab=async url=>{const response=await fetch(base+'/json/new?'+encodeURIComponent(url),{method:'PUT'});assert.equal(response.status,200);const tab=await response.json();return {tab,session:await cdp(tab.webSocketDebuggerUrl)};};
 const extensionId=await until(async()=>{const list=await (await fetch(base+'/json/list')).json();return list.find(row=>row.type==='service_worker'&&/chrome-extension:\/\/[a-p]{32}\/sw\.js/.test(row.url))?.url.split('/')[2];},'OpenDesk extension');report.extensionId=extensionId;
 const install=setup(extensionId,'cft',profile);installed=true;record('native.install',install);
 ({session:options}=await newTab('about:blank'));await options.call('Page.navigate',{url:'chrome-extension://'+extensionId+'/native-agent/settings.html'});
 // The HTML button exists before settings.js has installed its trusted handler.
 // Wait for the real settings response, not merely for a DOM node.
 await until(()=>options.read('document.querySelector("#bridge-status")?.textContent.includes('+JSON.stringify('Extension ID：'+extensionId)+')'),'Native Options ready');
 record('native.options.before',await options.read('document.querySelector("#bridge-status").textContent'));
 await options.click('#bridge-enable');
 record('native.permission.input',await approveNativePermission({pid:chrome.pid,evidenceDirectory:out}));
 const bridge=await until(async()=>{const r=await requestAgent('bridge.status',{},crypto.randomUUID(),3000);return r.result?.nativeConnected?r.result:null;},'real Native handshake');record('native.handshake',bridge);report.tests.push({name:'real-native-handshake',status:'PASS'});
 await options.click('#bridge-refresh');await options.screenshot('native-options.png');
 ({session:tool}=await newTab('about:blank'));await tool.call('Page.navigate',{url:'chrome-extension://'+extensionId+'/ui/tool.html'});
 await until(async()=>{const r=await requestAgent('bridge.status',{},crypto.randomUUID(),3000);return r.result?.hostRegistrations?.length===1;},'registered original RunHost');
 const html=fs.readFileSync(path.join(root,'examples/tasks/demo-form.html'));
 server=http.createServer((req,res)=>{if(req.url.split('?')[0]!=='/demo-form.html'){res.writeHead(404);res.end();return;}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port,url=origin+'/demo-form.html';
 const targetInfo=await newTab(url);target=targetInfo.session;await browser.call('Target.activateTarget',{targetId:targetInfo.tab.id});
 await until(()=>target.read('document.readyState==="complete"'),'demo form');
 const selected=await until(async()=>{const r=await requestAgent('target.current',{},crypto.randomUUID(),3000);return r.result?.target?.origin===origin?r.result:null;},'exact demo document');record('native.target',selected);
 const pkg={name:'opendesk-local-demo',private:true,type:'module',version:'1.0.0',description:'Native multi-file local source acceptance',opendesk:{format:'opendesk.project.v1',id:'demo.local-controller',runtimeKind:'controller',sourceFormat:'esm',entry:'main.js',siteOrigins:[origin],permissions:['page.automation'],paramsSchema:{type:'object',properties:{},required:[],additionalProperties:false}}};
 fs.writeFileSync(project+'/package.json',JSON.stringify(pkg));fs.writeFileSync(project+'/main.js','import {describe} from "./describe.js"; export default async function({page}) {return describe(await page.title());}\n');fs.writeFileSync(project+'/describe.js','export function describe(title){return {version:1,title};}\n');
 mcpClient=mcp(project);const initialized=await mcpClient.request('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'opendesk-real-acceptance',version:'1'}});assert.equal(initialized.protocolVersion,'2025-11-25');mcpClient.notify('notifications/initialized');
 const attached=await mcpClient.tool('attach',{path:project});
 async function runVersion(version){
  const started=await mcpClient.tool('run',{bindingId:attached.bindingId,requestId:'acceptance-v'+version+'-'+crypto.randomUUID(),params:{}});assert.ok(started.runId);assert.equal(started.source.sourceHash,started.revision.sourceHash);
  const result=await until(async()=>{const result=await mcpClient.tool('result',{runId:started.runId});return result.run.retirementState==='released'&&result.results.length?result:null;},'durable result',30000);
  assert.equal(result.results[0].outcome.ok,true);assert.equal(result.value.version,version);assert.equal(result.value.title,await target.read('document.title'));assert.equal(result.sourceHash,started.source.sourceHash);
  report.tests.push({name:'multifile-version-'+version,status:'PASS',runId:result.runId,resultId:result.results[0].resultId,sourceHash:result.sourceHash,documentId:selected.target.documentId,retirement:result.run.retirementState});return result;
 }
 const first=await runVersion(1);fs.writeFileSync(project+'/describe.js','export function describe(title){return {version:2,title,changed:"dependency edited without build"};}\n');const second=await runVersion(2);assert.notEqual(first.sourceHash,second.sourceHash);
 assert.deepEqual(fs.readdirSync(project).sort(),['describe.js','main.js','package.json']);report.tests.push({name:'no-build-or-json-handoff',status:'PASS'});
 fs.writeFileSync(project+'/describe.js','export const invalid=;');await assert.rejects(()=>mcpClient.tool('run',{bindingId:attached.bindingId,requestId:'syntax-'+crypto.randomUUID()}),{code:'E_PROJECT_SYNTAX'});report.tests.push({name:'invalid-source-no-stale-fallback',status:'PASS'});
 await tool.screenshot('workbench-after-runs.png');await target.screenshot('demo-after-runs.png');
 report.status='PASS_P0_REAL_CHROME_MCP';report.scope='Real packaged tool.html Host, Native Messaging, stdio MCP and original RunHost/Controller; actual Side Panel chrome and Page preview are separate acceptance stages';
}catch(error){report.status='FAIL';report.error={code:error.code||'E_NATIVE_ACCEPTANCE',message:error.message,stack:error.stack};record('failure',report.error);process.exitCode=1;
 if(options){try{record('native.options.failure',await options.read('({url:location.href,status:document.querySelector("#bridge-status")?.textContent,disabled:document.querySelector("#bridge-enable")?.disabled})'));await options.screenshot('native-options-failure.png');}catch(inspection){record('inspection.failure',{message:inspection.message});}}
}
finally{
 mcpClient?.close();options?.close();tool?.close();target?.close();
 try{await browser?.call('Browser.close');}catch{}browser?.close();
 if(chrome&&chrome.exitCode===null){chrome.kill('SIGTERM');await pause(600);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
 await new Promise(resolve=>server?server.close(resolve):resolve());
 if(installed){for(let i=0;i<40&&doctor().socketExists;i++)await pause(100);try{report.cleanup=cleanup();}catch(error){report.cleanup={error:error.code||error.message};report.status='FAIL_CLEANUP';process.exitCode=1;}}
 report.finishedAt=new Date().toISOString();report.resourcesReleased=!report.cleanup?.error;fs.writeFileSync(out+'/acceptance.json',JSON.stringify(report,null,2)+'\n');console.log('LOCAL_DEV_ACCEPTANCE='+JSON.stringify({status:report.status,sourceHead:report.sourceHead,packageHash:report.buildReceipt.packageHash,tests:report.tests,error:report.error,resourcesReleased:report.resourcesReleased}));
}
