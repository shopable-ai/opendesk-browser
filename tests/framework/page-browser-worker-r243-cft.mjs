// Actual Chrome for Testing, ORIGINAL isolated launcher, no Native Host.
// This verifies extension CSP and private Worker module closure. It does NOT
// use CDP as a user-script executor or forge Page USER_SCRIPT run receipts.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {WebSocket} from 'ws';
import {launchLocalDevChrome} from './local-dev-cft-launcher.mjs';

const root=process.cwd(),output=path.resolve(process.env.OPENDESK_DEV_EVIDENCE||
  '.runtime/tests/page-browser-worker-r243'),packageRoot=path.resolve('dist/production');
fs.mkdirSync(output,{recursive:true});
const binary=process.env.CHROME_FOR_TESTING_BIN;
if(!binary||!fs.existsSync(binary))throw Error('Chrome for Testing binary is required');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'opendesk-browser-worker-'));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,timeout=25000){
  const end=Date.now()+timeout;let cause;
  while(Date.now()<end){try{const result=await fn();if(result)return result;}catch(error){cause=error;}
    await pause(100);}
  throw new Error(label+' timed out'+(cause?': '+cause.message:''));
}
async function cdp(uri){
  const socket=new WebSocket(uri),pending=new Map(),listeners=new Map();let currentId=0;
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  socket.on('message',raw=>{
    const row=JSON.parse(String(raw));
    if(row.id){const task=pending.get(row.id);if(!task)return;pending.delete(row.id);clearTimeout(task.timer);
      if(row.error)task.reject(Error(row.error.message));else task.resolve(row.result);return;}
    for(const handler of listeners.get(row.method)||[])handler(row.params);
  });
  const closed=()=>{for(const task of pending.values()){clearTimeout(task.timer);task.reject(Error('CDP closed'));}pending.clear();};
  socket.on('close',closed);
  const call=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++currentId,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP '+method+' timed out'));},35000);
    pending.set(id,{resolve,reject,timer});
    try{socket.send(JSON.stringify({id,method,params}));}catch(error){clearTimeout(timer);pending.delete(id);reject(error);}
  });
  const read=async expression=>{
    const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails)throw Error(result.exceptionDetails.text||'Runtime exception');
    return result.result?.value;
  };
  return {call,read,on:(method,fn)=>{const set=listeners.get(method)||new Set();set.add(fn);listeners.set(method,set);},
    close:()=>socket.close()};
}

async function clickReal(session,expression){
  const box=await session.read('(()=>{const node=('+expression+');if(!node||node.disabled)return null;'+
    'node.scrollIntoView({block:"center"});const r=node.getBoundingClientRect();'+
    'return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height}})()');
  assert(box?.width>0&&box.height>0&&box.x>0&&box.y>0,'visible, enabled input '+expression);
  for(const type of ['mousePressed','mouseReleased'])
    await session.call('Input.dispatchMouseEvent',{type,x:box.x,y:box.y,button:'left',clickCount:1});
}
async function selectFramework(session,framework){
  const index={react:1,vue:2}[framework];
  assert(Number.isSafeInteger(index));
  const el='document.querySelector("#page-component-framework")';
  if(await session.read(el+'.selectedIndex')===index)return;
  await clickReal(session,el);
  // CDP key dispatch is browser-native keyboard input, not JS dispatchEvent.
  await session.call('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Home',code:'Home',windowsVirtualKeyCode:36});
  await session.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Home',code:'Home',windowsVirtualKeyCode:36});
  for(let n=0;n<index;n++){
    await session.call('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});
    await session.call('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});
  }
  await session.call('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await session.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await until(()=>session.read(el+'.value==='+JSON.stringify(framework)),
    'trusted browser selection of '+framework,12000);
}
async function verifyBrowserUI({browser,page,base,extensionId,output,report}){
  const sample=fs.readFileSync(path.join(root,'examples/tasks/demo-form.html'));
  let site,settings,website;
  const createTab=async url=>{
    const res=await fetch(base+'/json/new?about%3Ablank',{method:'PUT'});
    assert.equal(res.status,200);
    const info=await res.json(),session=await cdp(info.webSocketDebuggerUrl);
    await session.call('Page.navigate',{url});
    return {info,session};
  };
  try{
    site=http.createServer((req,res)=>{
      if(req.url?.split('?')[0]!=='/demo-form.html'){
        res.writeHead(404);res.end();return;
      }
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(sample);
    });
    await new Promise((resolve,reject)=>{
      site.once('error',reject);site.listen(43111,'127.0.0.1',resolve);
    });
    settings=await createTab('chrome://extensions/?id='+extensionId);
    const detail='document.querySelector("extensions-manager")?.shadowRoot?.querySelector("extensions-detail-view")';
    const toggle='('+detail+')?.shadowRoot?.querySelector("#allow-user-scripts")?.shadowRoot?.querySelector("cr-toggle#crToggle")';
    await until(()=>settings.session.read('('+toggle+')!=null'),'Chrome userScripts actual toggle');
    await browser.call('Target.activateTarget',{targetId:settings.info.id});
    if(!await settings.session.read('('+toggle+').checked'))await clickReal(settings.session,toggle);
    await until(()=>settings.session.read('('+toggle+').checked===true'),'Chrome userScripts granted');
    report.tests.push({name:'r243-browser-ui-userScripts-real-Chrome-optin',
      status:'PASS',nativeHostConfigured:false,control:'chrome://extensions real toggle'});
    website=await createTab('http://127.0.0.1:43111/demo-form.html');
    await browser.call('Target.activateTarget',{targetId:website.info.id});
    await until(()=>website.session.read('document.readyState==="complete"'),'real website ready');
    await until(()=>page.read('document.querySelector("#script-source")!=null'),'developer view script loaded');
    await clickReal(page,'document.querySelector("#tab-develop")');
    const permission=await page.read('chrome.permissions.contains({origins:["http://127.0.0.1:43111/*"]})');
    assert.equal(permission,true,'original Chrome website permission must be granted');
    for(const framework of ['react','vue']){
      await selectFramework(page,framework);
      await until(()=>page.read('document.querySelector("#page-component-framework").value==='+JSON.stringify(framework)),
        'official '+framework+' selected');
      const editor=await page.read('document.querySelector("#script-source").value');
      assert(editor.includes(framework==='react'?"from 'react'":'<script setup>'));
      const active=await page.read('chrome.tabs.query({active:true,currentWindow:true})');
      assert.equal(active.length,1);
      assert.equal(active[0].url,'http://127.0.0.1:43111/demo-form.html',
        'the existing current-tab identity must remain the website');
      const expanded=await page.read('document.querySelector("#page-preview-tools").open');
      if(!expanded)await clickReal(page,'document.querySelector("#page-preview-tools > summary")');
      await until(()=>page.read('!document.querySelector("#page-preview-run").disabled'),
        framework+' Page run enabled',20000);
      await clickReal(page,'document.querySelector("#page-preview-run")');
      const state=await until(()=>page.read('(()=>{const node=document.querySelector("#page-preview-status");'+
        'return ["completed","error"].includes(node?.dataset.state)?{state:node.dataset.state,text:node.textContent}:null})()'),
      framework+' exact Page run completion',60000);
      assert.equal(state.state,'completed',framework+' run error: '+state.text);
      const receipt=JSON.parse(await page.read('document.querySelector("#page-preview-technical").textContent'));
      assert.equal(receipt.state,'preview-evaluated');
      assert.equal(receipt.packagedFrameworkId,framework);
      assert.equal(receipt.managedUI,true);
      assert.ok(receipt.managedPreviewId);
      assert.equal(receipt.authoring?.framework,framework);
      assert(/^[a-f0-9]{64}$/.test(receipt.sourceHash));
      const id='browser-'+framework;
      const rootExpr='document.querySelector('+JSON.stringify('[data-od-id="'+id+'"]')+')';
      await until(()=>website.session.read('('+rootExpr+')?.shadowRoot?.querySelector("button")?.textContent?.includes("已点击 0 次")'),
        framework+' DOM mounted in real webpage',15000);
      await clickReal(website.session,'('+rootExpr+')?.shadowRoot?.querySelector("button")');
      await until(()=>website.session.read('('+rootExpr+')?.shadowRoot?.querySelector("button")?.textContent?.includes("已点击 1 次")'),
        framework+' native pointer updated component state',15000);
      await clickReal(page,'document.querySelector("#script-stop")');
      await until(()=>website.session.read('!('+rootExpr+')'),
        framework+' native managed stop removed DOM',15000);
      const status=await page.read('document.querySelector("#page-component-status").textContent');
      assert(status.includes('已停止'),'UI must acknowledge original Stop receipt');
      const proof={name:'r243-browser-'+framework+'-no-native-real-run-stop',
        status:'PASS',sourceHash:receipt.sourceHash,previewId:receipt.managedPreviewId,
        documentId:receipt.documentId,frameworkSha256:receipt.packagedFrameworkSha256,
        actualPointerInput:true,domClean:true,noNative:true,packageVerified:true};
      report.tests.push(proof);
      await page.call('Page.captureScreenshot',{format:'png'}).then(async image=>
        fs.writeFileSync(path.join(output,'r243-browser-'+framework+'-editor.png'),Buffer.from(image.data,'base64')));
      const image=await website.session.call('Page.captureScreenshot',{format:'png'});
      fs.writeFileSync(path.join(output,'r243-browser-'+framework+'-stopped.png'),Buffer.from(image.data,'base64'));
    }
  }finally{
    settings?.session.close();website?.session.close();
    if(site)await new Promise(resolve=>site.close(resolve));
  }
}
async function main(){
  const argv=['--no-first-run','--no-default-browser-check','--use-mock-keychain',
    '--disable-gpu','--disable-background-networking','--disable-sync',
    '--remote-debugging-port=0','--user-data-dir='+profile,
    '--disable-extensions-except='+packageRoot,'--load-extension='+packageRoot,'about:blank'];
  const report={status:'IN_PROGRESS',startedAt:new Date().toISOString(),chrome:binary,
    sourceHead:process.env.GITHUB_SHA||null,nativeHostConfigured:false,tests:[]};
  let chrome,browser,page;
  try{
    const launched=await launchLocalDevChrome({root,out:output,binary,argv,profile});
    chrome=launched.chrome;
    const port=Number(launched.lines[0]),base='http://127.0.0.1:'+port;
    browser=await cdp('ws://127.0.0.1:'+port+launched.lines[1]);
    const extensionId=await until(async()=>{
      const list=await (await fetch(base+'/json/list')).json();
      const worker=list.find(x=>x.type==='service_worker'&&/^chrome-extension:\/\/[a-p]{32}\/sw\.js$/.test(x.url));
      return worker?.url?.split('/')[2];
    },'real loaded extension');
    report.extensionId=extensionId;
    const request=await fetch(base+'/json/new?about%3Ablank',{method:'PUT'});
    assert.equal(request.status,200);
    const tab=await request.json();page=await cdp(tab.webSocketDebuggerUrl);
    await page.call('Page.navigate',{url:'chrome-extension://'+extensionId+'/ui/tool.html'});
    await until(()=>page.read('location.protocol==="chrome-extension:"&&document.readyState==="complete"'),
      'actual packaged extension page');
    assert.equal(await page.read('typeof Worker'),'function');
    for(const [framework,fixture] of [
      ['react','examples/programs/page-ui-react/src/App.jsx'],
      ['vue','examples/programs/page-ui-vue/src/App.vue']
    ]){
      const componentSource=fs.readFileSync(path.join(root,fixture),'utf8');
      const projectId='sample.browser-native-free-'+framework;
      const pageRules={matches:['http://127.0.0.1:43111/*'],excludeMatches:[],
        runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'};
      const expression='(async()=>{'+
        "const url=chrome.runtime.getURL('ui/page-component-compiler-worker.js');"+
        "const helper=await fetch(chrome.runtime.getURL('libs/page-frameworks/page-ui-helper-r243.js')).then(r=>{if(!r.ok)throw Error('E_HELPER');return r.text()});"+
        "const worker=new Worker(url,{type:'classic'});"+
        "const job="+JSON.stringify({type:'prepare',requestId:1,framework,
          componentSource,projectId,pageRules})+";job.uiHelperSource=helper;"+
        "return await new Promise((resolve,reject)=>{"+
        "const timer=setTimeout(()=>{worker.terminate();reject(Error('E_WORKER_TIMEOUT'))},30000);"+
        "worker.onerror=e=>{clearTimeout(timer);worker.terminate();resolve({ok:false,error:{message:e.message}})};"+
        "worker.onmessage=e=>{clearTimeout(timer);worker.terminate();const x=e.data;resolve({ok:x.ok,"+
          "error:x.error,framework:x.result?.framework,bytes:x.result?.sourceUtf8?.length,"+
          "hasManaged:x.result?.sourceUtf8?.includes('createPageUI'),"+
          "hasHeader:x.result?.sourceUtf8?.includes('// @opendesk-lib "+framework+"'),"+
          "hasCSS:x.result?.sourceUtf8?.includes('data-v-')})};worker.postMessage(job)})"+
      '})()';
      const result=await page.read(expression);
      assert.equal(result?.ok,true,JSON.stringify(result?.error));
      assert.equal(result.framework,framework);
      assert(result.bytes>1000&&result.bytes<100000,'real Worker preserves Page budget');
      assert.equal(result.hasManaged,true);
      assert.equal(result.hasHeader,true);
      if(framework==='vue')assert.equal(result.hasCSS,true);
      const proof={framework,sourcePath:fixture,compiler:'Babel@7.29.9 / Vue@3.5.22',
        bytes:result.bytes,cspWorker:true,noNative:true,compiledWithoutExecutingComponent:true};
      report.tests.push(proof);
    }
    if(process.env.OPENDESK_R243_BROWSER_FULL_UI==='1'){
      await verifyBrowserUI({browser,page,base,extensionId,output,report});
      report.status='PASS_BROWSER_UI_NO_NATIVE_REACT_VUE_RUN_STOP';
    }else report.status='PASS_BROWSER_WORKER_NO_NATIVE';
  }catch(error){report.status='FAIL';report.error={code:error.code||'E_BROWSER_WORKER_TEST',message:error.message,
    stack:error.stack};process.exitCode=1;}
  finally{
    try{await browser?.call('Browser.close');}catch{}
    page?.close();browser?.close();
    if(chrome?.cleanup){report.cleanup=await chrome.cleanup();if(report.cleanup?.error||report.cleanup?.chromePidAlive)report.status='FAIL_CLEANUP';}
    else if(chrome?.exitCode===null){try{chrome.kill('SIGTERM');}catch{}}
    report.finishedAt=new Date().toISOString();
    fs.writeFileSync(path.join(output,'acceptance.json'),JSON.stringify(report,null,2)+'\n');
    console.log('R243_BROWSER_WORKER_CFT='+JSON.stringify({
      status:report.status,sourceHead:report.sourceHead,extensionId:report.extensionId,
      tests:report.tests,cleanup:report.cleanup,error:report.error}));
    if(!report.status.startsWith('PASS_'))process.exitCode=1;
  }
}
await main();
