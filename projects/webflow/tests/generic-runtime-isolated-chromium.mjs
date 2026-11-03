#!/usr/bin/env node
// Bounded component fixture, NOT an installed-product/Authority/Task E2E.
// All grants, registrations and ledger rows belong to this disposable extension.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir, homedir} from 'node:os';
import {join, resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const temp=await mkdtemp(join(tmpdir(),'opendesk-web-task-component-'));
const extension=join(temp,'extension'),profile=join(temp,'profile');
const binary=process.env.OPENDESK_CFT_BINARY||join(homedir(),
  'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const scopeLabel='Chrome component runtime/registration/ingress; no product Authority/Task execution proof';
const deadline=Date.now()+60000;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const servers=[],pending=new Map();
let child,socket,launchError,stderr='',sequence=0;

async function until(read,label){
  const end=Math.min(deadline,Date.now()+12000);
  while(Date.now()<end){
    if(launchError)throw launchError;
    if(child&&(child.exitCode!==null||child.signalCode))throw Error('Chrome exited: '+stderr);
    const value=await read();
    if(value)return value;
    await sleep(50);
  }
  throw Error('Timed out: '+label);
}
function call(method,params={},sessionId){
  return new Promise((resolve,reject)=>{
    const id=++sequence;
    const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},
      Math.max(1,Math.min(8000,deadline-Date.now())));
    pending.set(id,{resolve,reject,timer});
    try{socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));}
    catch(error){clearTimeout(timer);pending.delete(id);reject(error);}
  });
}
async function evaluate(sessionId,expression,contextId){
  const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,
    ...(contextId?{contextId}:{})},sessionId);
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
  return result.result.value;
}
async function bundle(name,source){
  // Only these entries and their real imports are compiled; no WXT config/output.
  const entry=join(temp,name+'.entry.js');
  await writeFile(entry,source);
  const result=await build({root,configFile:false,logLevel:'error',
    build:{write:false,minify:false,target:'es2022',
    lib:{entry,name:'ComponentFixture',formats:['iife']}}});
  const outputs=(Array.isArray(result)?result:[result]).flatMap(item=>item.output);
  assert.equal(outputs.length,1,'Fixture must be one self-contained JavaScript chunk');
  assert.equal(outputs[0].type,'chunk');
  await writeFile(join(extension,name),outputs[0].code);
}
const modulePath=path=>JSON.stringify(join(root,path));
async function serve(){
  const server=createServer((_req,res)=>{
    res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
    res.end(`<!doctype html><title>Web task component fixture</title><script>
      window.receipts=[];
      window.addEventListener('opendesk:task-receipt',event=>receipts.push(JSON.parse(event.detail)));
    </script><p>Disposable component fixture</p>`);
  });
  servers.push(server);
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return 'http://127.0.0.1:'+server.address().port;
}

try{
  assert.equal(typeof WebSocket,'function','Node built-in WebSocket is required');
  await mkdir(extension);
  const origin=await serve(),otherOrigin=await serve();
  assert.notEqual(origin,otherOrigin);
  const site={id:'fixture-site',version:'1.0.0',origin,adapter:'generic',
    adapterVersion:'1.0.0',protocols:['webflow.task.intent.v1'],enabled:true};
  const scope={taskId:'fixture.read',args:{query:'component-only'},targetUrl:origin+'/target',sourceOrigin:origin,
    installation:{version:'1.0.0',manifestHash:'a'.repeat(64),contentHash:'b'.repeat(64),
      scriptId:'task:fixture.read:1.0.0',revision:1,installationId:'fixture-installation',generation:1}};
  await writeFile(join(extension,'manifest.json'),JSON.stringify({manifest_version:3,
    name:'Disposable Web task component fixture',version:'1.0.0',
    permissions:['storage','scripting','webNavigation','tabs'],
    host_permissions:['http://127.0.0.1/*'],background:{service_worker:'sw.js'}}));
  await bundle('content.js',`
    import {startWebTaskContent} from ${modulePath('src/page-events/content-bridge.js')};
    // Observe actual adapter listener installation without mocking runtime APIs.
    globalThis.fixtureObservation={adapterStarts:0};
    const add=window.addEventListener;
    window.addEventListener=function(type,...args){
      if(type==='opendesk:task-intent')globalThis.fixtureObservation.adapterStarts++;
      return Reflect.apply(add,this,[type,...args]);
    };
    startWebTaskContent();
  `);
  await bundle('sw.js',`
    import {createWebTaskIngress} from ${modulePath('src/page-events/web-task-ingress.js')};
    import {createChatGPTBridgeTriggerLedger,CHATGPT_BRIDGE_LEDGER_KEY}
      from ${modulePath('src/native-agent/chatgpt-bridge-trigger-gate.js')};
    import {createSiteContentRegistration} from ${modulePath('src/page-events/content-script-registration.js')};
    import {SITE_PROFILES_KEY,WEB_TASK_PROTOCOL} from ${modulePath('src/page-events/web-task-contract.js')};
    const site=${JSON.stringify(site)},scope=${JSON.stringify(scope)};
    const fixture=globalThis.fixture={ready:false,error:null,events:[],reads:0};
    const ledger=createChatGPTBridgeTriggerLedger({storage:chrome.storage.local,
      revocationStorage:chrome.storage.session});
    const foundation={storage:{async transaction(stores,mode,read){
      if(JSON.stringify(stores)!=='["runs"]'||mode!=='readonly')throw Error('Only readonly runs allowed');
      fixture.reads++;
      return read({all(store){if(store!=='runs')throw Error('Unexpected store');return [];},
        get(store,key){if(store!=='runs'||key!=='@slot')throw Error('Unexpected read');return null;}});
    }}};
    const ingress=createWebTaskIngress({api:chrome,ledger,
      loadFoundation:async()=>foundation,ensureRunner:async()=>{}});
    chrome.runtime.onMessage.addListener((message,sender,reply)=>{
      if(message?.protocol!==WEB_TASK_PROTOCOL)return;
      const record={kind:message.kind,source:{id:sender.id,tabId:sender.tab?.id,
        frameId:sender.frameId,documentId:sender.documentId,url:sender.url,
        documentLifecycle:sender.documentLifecycle}};
      fixture.events.push(record);
      Promise.resolve().then(()=>ingress.handle(message,sender)).then(data=>{
        record.reply={ok:true,data};reply(record.reply);
      },error=>{record.reply={ok:false,error:{code:error.code||'FIXTURE_ERROR',message:error.message}};reply(record.reply);});
      return true;
    });
    fixture.snapshot=async()=>({ready:fixture.ready,error:fixture.error,events:fixture.events,
      reads:fixture.reads,rows:(await chrome.storage.local.get(CHATGPT_BRIDGE_LEDGER_KEY))[CHATGPT_BRIDGE_LEDGER_KEY]||{},
      profiles:(await chrome.storage.local.get(SITE_PROFILES_KEY))[SITE_PROFILES_KEY],
      settings:await ledger.readAutoSettings(),registrations:await chrome.scripting.getRegisteredContentScripts()});
    (async()=>{
      // Explicit fixture policy in ONLY this new temporary extension's storage.
      // Installation hashes are schema-valid fixtures, not product installation proof.
      await chrome.storage.local.set({[SITE_PROFILES_KEY]:[site]});
      await ledger.approveAuto(scope);await ledger.setAutoEnabled(true);
      await createSiteContentRegistration({api:chrome,profiles:async()=>
        (await chrome.storage.local.get(SITE_PROFILES_KEY))[SITE_PROFILES_KEY],
        adapterIds:['generic'],protocolIds:['webflow.task.intent.v1'],scriptPath:'content.js'}).reconcile();
      fixture.ready=true;
    })().catch(error=>{fixture.error=String(error.stack||error);});
  `);

  child=spawn(binary,['--headless=new','--no-first-run','--no-default-browser-check',
    '--remote-debugging-port=0',`--user-data-dir=${profile}`,
    `--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'about:blank'],
  {stdio:['ignore','ignore','pipe']});
  child.once('error',error=>{launchError=error;});
  child.stderr.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-4000);});
  const endpoint=await until(async()=>{
    let lines;
    try{lines=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');}
    catch(error){if(error.code==='ENOENT')return null;throw error;}
    return lines[1]?'ws://127.0.0.1:'+lines[0]+lines[1]:null;
  },'own Chrome CDP endpoint');
  socket=new WebSocket(endpoint);
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('CDP WebSocket open timeout')),8000);
    socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
    socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('CDP WebSocket error'));},{once:true});
  });
  const contexts=new Map();
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.method==='Runtime.executionContextCreated'){
      const list=contexts.get(message.sessionId)||[];
      list.push(message.params.context);contexts.set(message.sessionId,list);
    }
    if(message.method==='Runtime.executionContextsCleared')contexts.set(message.sessionId,[]);
    if(message.method==='Runtime.executionContextDestroyed')contexts.set(message.sessionId,
      (contexts.get(message.sessionId)||[]).filter(context=>context.id!==message.params.executionContextId));
    const request=pending.get(message.id);
    if(!request)return;
    pending.delete(message.id);clearTimeout(request.timer);
    if(message.error)request.reject(Error(message.error.message));else request.resolve(message.result);
  });
  const worker=await until(async()=>(await call('Target.getTargets')).targetInfos.find(target=>
    target.type==='service_worker'&&target.url.startsWith('chrome-extension://')&&target.url.endsWith('/sw.js')),
  'temporary extension worker');
  const extensionId=new URL(worker.url).host;
  const sw=(await call('Target.attachToTarget',{targetId:worker.targetId,flatten:true})).sessionId;
  const snapshot=()=>evaluate(sw,'fixture.snapshot()');
  const initial=await until(async()=>{
    const state=await evaluate(sw,'globalThis.fixture ? ({ready:fixture.ready,error:fixture.error}) : null');
    if(state?.error)throw Error(state.error);
    return state?.ready?await snapshot():null;
  },'fixture grants and real registration ready');
  assert.deepEqual(initial.profiles,[site]);
  assert.equal(initial.settings.enabled,true);
  assert.deepEqual(initial.settings.grants[scope.taskId].scope,scope);
  assert.deepEqual(initial.rows,{});
  assert.equal(initial.registrations.length,1);
  const registration=initial.registrations[0];
  assert.equal(registration.world,'ISOLATED');
  assert.equal(registration.allFrames,false);
  assert.equal(registration.runAt,'document_idle');
  assert.equal(registration.persistAcrossSessions,true);
  assert.deepEqual(registration.matches,['http://127.0.0.1/*']);
  assert.deepEqual(registration.js,['content.js']);

  async function open(url){
    // No fixture document is created until registration ready has been awaited.
    const {targetId}=await call('Target.createTarget',{url});
    const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
    await call('Runtime.enable',{},sessionId);await call('Page.enable',{},sessionId);
    return sessionId;
  }
  async function contentReady(sessionId,url,starts){
    await until(async()=>{
      if(await evaluate(sessionId,'location.href')!==url)return false;
      for(const context of contexts.get(sessionId)||[]){
        if(context.auxData?.isDefault||context.origin!=='chrome-extension://'+extensionId)continue;
        const state=await evaluate(sessionId,'globalThis.fixtureObservation||null',context.id);
        if(state?.adapterStarts===starts)return true;
      }
      return false;
    },'real ISOLATED bridge/adapter at '+url);
    assert.equal(await evaluate(sessionId,'typeof globalThis.fixtureObservation'),'undefined','MAIN world stays isolated');
  }
  async function receipt(sessionId,name,data,index){
    await evaluate(sessionId,`window.dispatchEvent(new CustomEvent(${JSON.stringify(name)},
      {detail:${JSON.stringify(JSON.stringify(data))}}))`);
    return until(()=>evaluate(sessionId,`window.receipts[${index}]||null`),'page receipt '+index);
  }
  const url=origin+'/source',page=await open(url);
  await contentReady(page,url,1);
  const candidate={protocol:'webflow.task.intent.v1',candidateId:'fixture-candidate-native-001',
    taskId:scope.taskId,targetUrl:scope.targetUrl,args:scope.args};
  const ack=await receipt(page,'opendesk:task-intent',candidate,0);
  assert.equal(ack.ok,true,JSON.stringify(ack));assert.equal(ack.data.state,'approved');
  assert.equal(ack.data.candidateId,candidate.candidateId);
  const requestId=ack.data.requestId;
  assert.match(requestId,/^[0-9a-f-]{36}$/i);
  let state=await snapshot();
  assert.deepEqual(Object.keys(state.rows),[requestId]);
  const row=state.rows[requestId];
  const native=state.events.find(event=>event.kind==='candidate').source;
  const frame=await evaluate(sw,`chrome.webNavigation.getFrame({tabId:${native.tabId},frameId:0})`);
  assert.equal(native.id,extensionId);assert.equal(native.frameId,0);
  assert.equal(native.documentLifecycle,'active');
  assert.ok(frame.documentId);assert.equal(native.documentId,frame.documentId);
  assert.deepEqual(row.source,{tabId:native.tabId,documentId:frame.documentId,url});
  assert.deepEqual(row.site,site);assert.deepEqual(row.scope,scope);assert.equal(row.status,'approved');
  const duplicate=await receipt(page,'opendesk:task-intent',candidate,1);
  assert.equal(duplicate.ok,false);assert.equal(duplicate.error.code,'E_BRIDGE_REPLAY');
  state=await snapshot();assert.deepEqual(state.rows,{[requestId]:row},'Replay must not change or append ledger rows');
  const query=await receipt(page,'opendesk:task-query',{requestId},2);
  assert.equal(query.ok,true,JSON.stringify(query));assert.equal(query.data.state,'approved');
  assert.equal(query.data.runId,null);assert.equal(query.data.resultId,null);

  // Reload the SAME URL: documentId alone must prevent access to the old request.
  await call('Page.reload',{},page);
  await until(async()=>{
    const current=await evaluate(sw,`chrome.webNavigation.getFrame({tabId:${native.tabId},frameId:0})`);
    return current?.documentLifecycle==='active'&&current.documentId!==frame.documentId;
  },'navigation creates a new native document');
  await contentReady(page,url,1);
  const denied=await receipt(page,'opendesk:task-query',{requestId},0);
  assert.equal(denied.ok,false);assert.equal(denied.error.code,'E_WEB_TASK_SOURCE');
  state=await snapshot();
  const newQuery=state.events.filter(event=>event.kind==='query').at(-1);
  assert.equal(newQuery.source.tabId,native.tabId);assert.equal(newQuery.source.url,url);
  assert.notEqual(newQuery.source.documentId,native.documentId);

  const foreignUrl=otherOrigin+'/source',foreign=await open(foreignUrl);
  await until(async()=>(await snapshot()).events.some(event=>event.kind==='site-profile'&&
    event.source.url===foreignUrl&&event.reply?.ok&&event.reply.data.profile===null),
  'same-host other-port real ingress returns no Profile');
  await contentReady(foreign,foreignUrl,0);
  const before=(await snapshot()).events.length;
  await evaluate(foreign,`window.dispatchEvent(new CustomEvent('opendesk:task-intent',
    {detail:${JSON.stringify(JSON.stringify({...candidate,candidateId:'fixture-other-port-001'}))}}));
    window.dispatchEvent(new CustomEvent('opendesk:task-query',{detail:${JSON.stringify(JSON.stringify({requestId}))}}));`);
  // Bounded negative-observation window; profile response and real injection are
  // already proven above, so silence cannot be mistaken for missing injection.
  await sleep(300);
  await contentReady(foreign,foreignUrl,0);
  assert.deepEqual(await evaluate(foreign,'window.receipts'),[]);
  state=await snapshot();assert.equal(state.events.length,before);
  assert.deepEqual(state.rows,{[requestId]:row});
  assert.equal(state.events.filter(event=>event.kind==='candidate').length,2);
  assert.equal(state.events.filter(event=>event.kind==='query').length,2);
  assert.ok(state.reads>=1,'Approved query reaches only the readonly empty runs boundary');
  assert.ok(state.events.every(event=>['site-profile','candidate','query'].includes(event.kind)));
  console.log(JSON.stringify({checks:['registration ready before page','MAIN → ISOLATED → native sender → ingress → original ledger',
    'approved ACK','native documentId matches ledger','replay rejected with one unchanged row','approved query',
    'same-URL new document denied old request','same host other port: no Profile/adapter/messages'],
    chrome:(await call('Browser.getVersion')).product,documentId:frame.documentId,
    newDocumentId:newQuery.source.documentId,ledgerRows:Object.keys(state.rows).length}));
}catch(error){
  console.error('FAIL: '+scopeLabel+'\n'+(error.stack||error));
  if(stderr)console.error('Own Chrome stderr (bounded): '+stderr.slice(-1500));
  process.exitCode=1;
}finally{
  socket?.close();
  for(const request of pending.values()){clearTimeout(request.timer);request.reject(Error('Fixture closed'));}
  pending.clear();
  // Never find/kill browsers by name, touch existing services, or retain a Profile.
  if(child?.pid&&child.exitCode===null&&!child.signalCode){
    await new Promise(resolve=>{
      const timer=setTimeout(()=>{child.kill('SIGKILL');},2000);
      child.once('close',()=>{clearTimeout(timer);resolve();});
      child.kill('SIGTERM');
    });
  }
  for(const server of servers){
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  }
  await rm(temp,{recursive:true,force:true});
}
// Success is reported only after our child, servers and temporary Profile close.
if(!process.exitCode)console.log('PASS: '+scopeLabel);
