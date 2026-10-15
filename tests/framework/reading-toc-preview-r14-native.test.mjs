// Real Chromium acceptance of the two committed OFFLINE preview HTML files.
// These scenarios cannot certify the installed extension or a user's Mac profile.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';
const binary=[process.env.CHROME_BIN,'google-chrome-stable','google-chrome','chromium']
 .filter(Boolean).find(name=>spawnSync(name,['--version'],{stdio:'ignore'}).status===0);
async function connect(url){
 const socket=new WebSocket(url),waiting=new Map();let counter=0,listener=()=>{};
 await new Promise((ok,no)=>{socket.onopen=ok;socket.onerror=no;});
 socket.onmessage=event=>{
  const msg=JSON.parse(event.data);
  if(!msg.id){listener(msg);return;}
  const row=waiting.get(msg.id);if(!row)return;
  waiting.delete(msg.id);clearTimeout(row.timer);
  msg.error?row.reject(Error(msg.error.message)):row.resolve(msg.result);
 };
 return {onEvent(fn){listener=fn;},
  send(method,params={},timeout=12000,sessionId=null){return new Promise((resolve,reject)=>{
   const id=++counter,timer=setTimeout(()=>{waiting.delete(id);reject(Error('CDP_TIMEOUT '+method));},timeout);
   waiting.set(id,{resolve,reject,timer});
   socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });},
  close(){socket.close();for(const row of waiting.values()){clearTimeout(row.timer);row.reject(Error('CLOSED'));}waiting.clear();}
 };
}
async function evaluate(target,expression){
 const row=await target.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,
  ...(target.contextId?{contextId:target.contextId}:{})});
 if(row.exceptionDetails)throw Error('BROWSER_EVAL '+JSON.stringify(row.exceptionDetails).slice(0,700));
 return row.result.value;
}
async function until(probe,label,count=65){
 let error;
 for(let i=0;i<count;i++){try{const result=await probe();if(result)return result;}catch(e){error=e;}await pause(120);}
 throw Error(label+(error?' / '+error.message:''));
}
async function select(page,id,value){
 const expression="(()=>{const n=document.getElementById("+JSON.stringify(id)+");"+
 "if(!n)throw Error('Missing preview control');n.value="+JSON.stringify(value)+";"+
 "n.dispatchEvent(new Event('change',{bubbles:true}));return true;})()";
 return evaluate(page,expression);
}
async function child(browser,page){
 // A sandboxed srcdoc is typically an OOPIF. Fallback handles same-process
 // execution contexts without relaxing sandbox="allow-scripts".
 for(let i=0;i<8;i++){
  const targets=(await browser.send('Target.getTargets')).targetInfos;
  const found=targets.find(row=>row.type==='iframe'&&row.url?.startsWith('about:srcdoc'));
  if(found){
   const session=(await browser.send('Target.attachToTarget',{targetId:found.targetId,flatten:true})).sessionId;
   const client={send:(name,args={},timeout=12000)=>browser.send(name,args,timeout,session)};
   await client.send('Runtime.enable');
   if(await evaluate(client,'Boolean(document.querySelector("#tool-root,[data-opendesk-toc-root]"))').catch(()=>false))return client;
  }
  await pause(130);
 }
 const contexts=[];
 page.onEvent(event=>{if(event.method==='Runtime.executionContextCreated')contexts.push(event.params.context);});
 await page.send('Runtime.disable');await page.send('Runtime.enable');
 const root=(await page.send('Page.getFrameTree')).frameTree.frame.id;
 const context=await until(()=>contexts.find(x=>x.auxData?.frameId!==root&&x.auxData?.isDefault), 'No real sandboxed iframe JS context',20);
 const inFrame={send:page.send,contextId:context.id};
 assert(await evaluate(inFrame,'Boolean(document.querySelector("#tool-root,[data-opendesk-toc-root]"))'));
 return inFrame;
}
test('R1.4 real Chrome opens saved file:// bilingual previews and exercises inner UI',{timeout:120000},async t=>{
 assert(binary,'Chrome for Testing is required: no mock PREVIEW_PASS');
 const profile=await mkdtemp(join(tmpdir(),'toc-r14-chrome-'));
 const chrome=spawn(binary,['--headless=new','--no-sandbox','--disable-gpu',
  '--disable-dev-shm-usage','--no-proxy-server','--no-first-run',
  '--disable-background-networking','--site-per-process','--remote-allow-origins=*',
  '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',
  '--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
 let browser,log='';const pages=[];
 chrome.stderr.on('data',chunk=>{log=(log+chunk).slice(-2700);});
 t.after(async()=>{
  for(const page of pages)page.close();browser?.close();
  if(chrome.exitCode===null&&chrome.signalCode===null){
   const done=new Promise(resolve=>{const alarm=setTimeout(()=>chrome.kill('SIGKILL'),2700);
    chrome.once('close',()=>{clearTimeout(alarm);resolve();});});
   chrome.kill('SIGTERM');await done;
  }
  await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:100});
 });
 const port=await until(async()=>{try{return +(await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];}catch{return 0;}},
  'Chrome binary could not start: '+log,110);
 const base='http://127.0.0.1:'+port,version=await(await fetch(base+'/json/version')).json();
 browser=await connect(version.webSocketDebuggerUrl);
 async function open(name){
  const input=resolve('examples/sidebar-tools/reading-toc/preview',name);
  const contents=await readFile(input,'utf8');assert(contents.includes('opendesk-preview-manifest'));
  const targetId=(await browser.send('Target.createTarget',{url:pathToFileURL(input).href})).targetId;
  const url=await until(async()=>{const data=await(await fetch(base+'/json/list')).json();
   return data.find(row=>row.id===targetId)?.webSocketDebuggerUrl;},'Missing target for '+name);
  const page=await connect(url);pages.push(page);
  await page.send('Runtime.enable');await page.send('Page.enable');
  await until(()=>evaluate(page,'Boolean(document.querySelector("#od-toc-language"))'), 'Preview shell did not render '+name);
  assert.equal(await evaluate(page,'location.protocol'),'file:');
  await until(()=>evaluate(page,'Boolean(document.querySelector("#opendesk-preview-frame")?.srcdoc)'),'Preview iframe missing');
  return {page,targetId};
 }
 async function screenshot(page,file){
  await mkdir(resolve('artifacts/reading-toc-r41'),{recursive:true});
  const result=await page.send('Page.captureScreenshot',{format:'png'});
  await writeFile(resolve('artifacts/reading-toc-r41',file),Buffer.from(result.data,'base64'));
 }
 const side=await open('reading-toc-r12-interactive-preview.html'),panel=await child(browser,side.page);
 await until(()=>evaluate(panel,'document.querySelectorAll("#toc-list button").length>0'),'Compiled TOC did not start in real sandbox');
 await select(side.page,'od-toc-language','en');
 await until(()=>evaluate(panel,'document.querySelector(".toc-title")?.textContent==="CONTENTS"'),'English panel switch failed');
 await evaluate(panel,"(()=>{const s=document.querySelector('#toc-source');s.value='s-2';s.dispatchEvent(new Event('change',{bubbles:true}));})()");
 const labels=await until(async()=>{const rows=await evaluate(panel,
  '[...document.querySelectorAll("#toc-list button")].map(n=>({id:n.dataset.id,label:n.textContent.trim()}))');
  return rows.length===4?rows:null;},'Two-H1 answer did not show both duplicate H2');
 assert.equal(labels.filter(row=>row.label==='重复标题').length,2);
 assert.equal(new Set(labels.map(row=>row.id)).size,4);
 await evaluate(panel,"document.querySelector('[data-toc-mode=full]').click()");
 await select(side.page,'od-toc-language','zh-CN');
 await until(()=>evaluate(panel,'document.querySelector(".toc-title")?.textContent==="阅读目录"'),'Chinese restore failed');
 assert.equal(await evaluate(panel,'document.querySelector("#toc-source").value'),'s-2');
 assert.equal(await evaluate(panel,'document.querySelector("[data-toc-mode=full]").getAttribute("aria-pressed")'),'true');
 await screenshot(side.page,'toc-r14-preview-panel.png');
 await select(side.page,'od-toc-scenario','error');
 await until(()=>evaluate(panel,'document.querySelector("#toc-error")?.dataset.state==="error"'),'Failure state did not activate');
 await select(side.page,'od-toc-scenario','success');
 await until(()=>evaluate(panel,'document.querySelector("#toc-error")?.hidden===true'),'Failure did not recover');
 await browser.send('Target.closeTarget',{targetId:side.targetId});
 console.log('TOC_PREVIEW_STAGE: real Chromium panel locale, source, mode, duplicates, recovery passed');
 const overlay=await open('reading-toc-r12-overlay-preview.html'),trusted=await child(browser,overlay.page);
 await until(()=>evaluate(trusted,'document.querySelectorAll("[data-opendesk-toc-root]").length===1'),'Trusted overlay failed to mount');
 const original=await evaluate(trusted,'document.querySelector("article h1").textContent');
 await select(overlay.page,'od-toc-language','en');
 await until(async()=>{const tree=await trusted.send('Accessibility.getFullAXTree');
  return tree.nodes.some(node=>node.name?.value==='On-page table of contents');},
  'Closed-shadow overlay did not present translated English accessible label');
 assert.equal(await evaluate(trusted,'document.querySelector("article h1").textContent'),original);
 await screenshot(overlay.page,'toc-r14-preview-overlay.png');
 console.log('TOC_PREVIEW_EVIDENCE '+JSON.stringify({browser:version.Browser,file:true,installed:false,
  screenshots:['toc-r14-preview-panel.png','toc-r14-preview-overlay.png']}));
});
