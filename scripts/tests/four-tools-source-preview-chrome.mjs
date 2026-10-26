#!/usr/bin/env node
// R1.2: real Chrome checks of the canonical generated HTML with SDK-only mocks.
// NOT an installed Chrome extension, Native Host, real download, or site-permission test.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

const output=resolve(process.argv[2]||'artifacts/preview-chrome/four-tools-r12');
const tools=[
 ['markdown-workbench','mdw-source'],
 ['web-markdown-clipper','clip-fetch'],
 ['knowledge-inbox','ki-new'],
 ['ai-knowledge-answers','qa-query']
];
const delay=ms=>new Promise(done=>setTimeout(done,ms));
const profile=await mkdtemp(join(tmpdir(),'four-tools-r12-chrome-'));
const chrome=spawn(process.env.CHROME_BIN||'chromium',[
 '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
 '--no-first-run','--no-default-browser-check','--user-data-dir='+profile,
 '--remote-debugging-port=0','about:blank'
],{stdio:'ignore'});
let socket,seq=0,activeTool='';
const pending=new Map(),contexts=new Map(),exceptions=[],rows=[];
function cdp(method,params={},sessionId){
 return new Promise((ok,fail)=>{
  const id=++seq,timer=setTimeout(()=>{pending.delete(id);fail(Error('CDP timeout: '+method));},20000);
  pending.set(id,{ok(value){clearTimeout(timer);ok(value);},fail(error){clearTimeout(timer);fail(error);}});
  socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
 });
}
async function connect(){
 let port=0;
 for(let i=0;i<100;i++){
  if(chrome.exitCode!==null)throw Error('Chrome exited before DevTools started');
  try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);}catch{}
  if(port)break;
  await delay(100);
 }
 assert.ok(port,'Chrome DevTools is available');
 const tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
 const page=tabs.find(x=>x.type==='page');
 assert.ok(page?.webSocketDebuggerUrl,'a headless Chrome page exists');
 socket=new WebSocket(page.webSocketDebuggerUrl);
 await new Promise((ok,fail)=>{
  socket.addEventListener('open',ok,{once:true});
  socket.addEventListener('error',fail,{once:true});
 });
 socket.addEventListener('message',evt=>{
  const m=JSON.parse(evt.data),session=m.sessionId||null;
  if(m.id&&pending.has(m.id)){
   const cb=pending.get(m.id);pending.delete(m.id);
   if(m.error)cb.fail(Error(m.error.message));else cb.ok(m.result);
  }
  if(m.method==='Runtime.executionContextCreated'){
   const c=m.params.context;
   contexts.set((session||'root')+':'+c.id,{id:c.id,session});
  }else if(m.method==='Runtime.executionContextDestroyed'){
   contexts.delete((session||'root')+':'+m.params.executionContextId);
  }else if(m.method==='Runtime.executionContextsCleared'){
   for(const key of [...contexts.keys()])if(key.startsWith((session||'root')+':'))contexts.delete(key);
  }else if(m.method==='Runtime.exceptionThrown'){
   const d=m.params.exceptionDetails;
   exceptions.push({tool:activeTool,message:String(d.exception?.description||d.text||'script exception').slice(0,500)});
  }else if(m.method==='Target.attachedToTarget'){
   const nested=m.params.sessionId;
   void cdp('Runtime.enable',{},nested).catch(e=>exceptions.push({tool:activeTool,message:e.message}));
  }
 });
 await cdp('Page.enable');
 await cdp('Runtime.enable');
 await cdp('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true});
}
async function evaluate(expression,ctx){
 const r=await cdp('Runtime.evaluate',{expression,contextId:ctx.id,returnByValue:true,awaitPromise:true},ctx.session);
 if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text||'evaluation failed');
 return r.result?.value;
}
async function findToolContext(id){
 for(let i=0;i<130;i++){
  for(const ctx of [...contexts.values()]){
   try{
    if(await evaluate('Boolean(document.getElementById('+JSON.stringify(id)+')&&globalThis.OpenDeskTool)',ctx))
     return ctx;
   }catch{/* transient navigated context */}
  }
  await delay(80);
 }
 throw Error('Production iframe did not mount: '+id);
}
async function navigateTool(tool,elementId,width=360,theme='light'){
 activeTool=tool;
 const name='side-panel-success-'+theme+'-'+width+'.html';
 const url=pathToFileURL(resolve('artifacts/previews',tool,name)).href;
 await cdp('Emulation.setDeviceMetricsOverride',{width:Math.max(480,width+80),height:920,deviceScaleFactor:1,mobile:false});
 await cdp('Page.navigate',{url});
 const ctx=await findToolContext(elementId);
 await delay(180);
 const metrics=await evaluate('('+function(){
  const tool=document.querySelector('#tool-root');
  return {mounted:!!tool,scrollWidth:document.documentElement.scrollWidth,
   viewportWidth:innerWidth,htmlLength:tool?.innerHTML.length||0,
   heading:document.title,activeElement:document.activeElement?.id||''};
 }.toString()+')()',ctx);
 assert.ok(metrics.mounted&&metrics.htmlLength>100,'genuine packaged HTML was mounted: '+tool);
 assert.ok(metrics.scrollWidth<=metrics.viewportWidth+2,'iframe horizontal overflow at '+width+': '+tool);
 const screenshot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
 await writeFile(join(output,tool+'-'+width+'-'+theme+'.png'),Buffer.from(screenshot.data,'base64'));
 return {ctx,metrics,url};
}
async function testMarkdown(ctx){
 const code='('+async function(){
  const q=id=>document.getElementById(id),ed=q('mdw-source');
  if(!q('mdw-clear').disabled)throw Error('Clear must initially be disabled');
  ed.value='# Heading\n\n**Bold** <img src=x onerror=alert(1)> \n\n![remote](https://example.invalid/p.png)';
  ed.dispatchEvent(new Event('input',{bubbles:true}));
  await new Promise(ok=>setTimeout(ok,160));
  if(q('mdw-clear').disabled)throw Error('Clear did not become enabled');
  document.querySelector('.mdw-modes [data-mode="preview"]')?.click();
  if(q('mdw-preview').querySelector('img,script'))throw Error('Unsafe Markdown generated active elements');
  if(!q('mdw-preview').textContent.includes('<img'))throw Error('Unsafe markup was not escaped');
  q('mdw-clear').click();
  if(q('mdw-inline-review').hidden)throw Error('Clear confirmation was not displayed');
  q('mdw-review-cancel').click();
  if(!ed.value.startsWith('# Heading'))throw Error('Cancel lost the draft');
  q('mdw-clear').click();q('mdw-review-confirm').click();
  await Promise.resolve();await Promise.resolve();
  if(ed.value||!q('mdw-clear').disabled)throw Error('Confirm did not clear/disable');
  ed.value='# Keep';ed.dispatchEvent(new Event('input',{bubbles:true}));
  const input=q('mdw-file'),dt=new DataTransfer();
  dt.items.add(new File(['# Replacement'], 'replacement.md',{type:'text/markdown'}));
  input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  if(q('mdw-inline-review').hidden)throw Error('Import replacement did not ask for confirmation');
  q('mdw-review-cancel').click();
  if(ed.value!=='# Keep')throw Error('Import cancel lost existing draft');
  q('mdw-copy').click();await Promise.resolve();await Promise.resolve();
  const copied=q('mdw-status').textContent;
  if(!copied.includes('已复制'))throw Error('Simulated copy did not respond');
  q('mdw-download').click();await Promise.resolve();await Promise.resolve();
  const downloaded=q('mdw-status').textContent;
  if(!downloaded.includes('已发起下载')||!downloaded.includes('下载记录'))
   throw Error('Download feedback must not claim persisted file');
  return {cancelPreserved:true,clearConfirmed:true,untrustedMarkupPassive:true,
   importCancelPreserved:true,copySimulated:true,downloadSimulated:true};
 }.toString()+')()';
 return evaluate(code,ctx);
}
try{
 await mkdir(output,{recursive:true});
 await connect();
 for(const [tool,id] of tools){
  const {ctx,metrics,url}=await navigateTool(tool,id);
  const tested=tool==='markdown-workbench'?await testMarkdown(ctx):{mountOnly:true};
  rows.push({tool,width:360,theme:'light',url,metrics,tested,status:'PASS'});
 }
 for(const width of [320,400,440]){
  const {metrics,url}=await navigateTool('markdown-workbench','mdw-source',width);
  rows.push({tool:'markdown-workbench',width,theme:'light',url,metrics,tested:{layoutOnly:true},status:'PASS'});
 }
 for(const width of [320,360,400,440]){
  const {metrics,url}=await navigateTool('markdown-workbench','mdw-source',width,'dark');
  rows.push({tool:'markdown-workbench',width,theme:'dark',url,metrics,tested:{layoutOnly:true},status:'PASS'});
 }
 assert.equal(exceptions.length,0,'Chrome JS exceptions: '+JSON.stringify(exceptions));
 await writeFile(join(output,'evidence.json'),JSON.stringify({kind:'OFFLINE_MOCK_CHROME',rows,exceptions},null,2)+'\n');
 console.log('FOUR_TOOLS_PREVIEW_CHROME_PASS',rows.length,'cases; no real SDK writes');
}catch(error){
 await mkdir(output,{recursive:true});
 await writeFile(join(output,'evidence.json'),JSON.stringify({kind:'OFFLINE_MOCK_CHROME',rows,exceptions,error:String(error.stack||error)},null,2)+'\n');
 console.error(error.stack||error);
 process.exitCode=1;
}finally{
 socket?.close();chrome.kill('SIGTERM');await rm(profile,{recursive:true,force:true});
}
