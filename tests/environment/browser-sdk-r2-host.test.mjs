import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';
import {normalizeBrowserOperation} from '../../src/framework/sdk/browser-contract.js';
import {validateSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {createContextMenuHost} from '../../src/platform/chrome/context-menus.js';

const uid='01234567-89ab-4def-8123-456789abcdef';
const pkg=validateSidebarToolPackage({
  format:'opendesk.sidebar-tool.v2',id:'browser-probe',version:'1.0.0',
  title:'Browser probe',description:'P0 acceptance probe',
  capabilities:['browser.tabs','browser.sidePanel','network','browser.network.observe','browser.events','browser.operations','browser.screenshot'],
  html:'<div>Browser probe</div>',css:'',js:'console.log("browser probe");',
  requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]}
});
const identity={toolId:pkg.id,toolVersion:pkg.version,toolInstance:uid,hostInstanceId:uid,installEpoch:null};
const sender={id:'ext-r2',frameId:0,documentId:'host-document-1',documentLifecycle:'active',
  url:'chrome-extension://ext-r2/ui/tool.html?hostInstanceId='+uid};
const locks={request:(_key,work)=>work()};
const err=code=>error=>error?.code===code;

function fixture({fetchImpl=async()=>new Response('{"ok":true}',{status:200,headers:{'content-type':'application/json'}})}={}){
  const local=new Map([['opendesk.sidebar-tools.installed.v1',[pkg]]]),session=new Map();
  const tabs=new Map(),created=[],updated=[],removed=[],listeners=[],storageListeners=[];
  const webRequests={start:[],complete:[],error:[]},downloads=[];
  let permitted=true,chromeGranted=true;
  const store=map=>({
    get:async key=>Object.fromEntries((Array.isArray(key)?key:[key]).map(k=>[k,map.get(k)])),
    set:async values=>{
      const changes={};
      for(const [key,value] of Object.entries(values)){
        changes[key]={oldValue:map.get(key),newValue:value};map.set(key,value);
      }
      for(const fn of storageListeners)fn(changes,map===local?'local':'session');
    }
  });
  const api={
    runtime:{id:'ext-r2',getURL:path=>'chrome-extension://ext-r2/'+path,lastError:null},
    permissions:{contains:async ({origins,permissions})=>origins?permitted && origins.every(x=>x.startsWith('https://example.org/')):chromeGranted},
    storage:{local:store(local),session:store(session),onChanged:{addListener:fn=>storageListeners.push(fn)}},
    tabs:{
      onRemoved:{addListener:fn=>removed.push(fn)},
      onUpdated:{addListener:fn=>updated.push(fn)},
      create:async ({url})=>{const item={id:100+created.length,windowId:9,url};tabs.set(item.id,item);created.push(item);return item;},
      remove:async id=>{tabs.delete(id);for(const fn of removed)fn(id);},
      get:async id=>{if(!tabs.has(id))throw Error('Tab missing');return tabs.get(id);},
      update:async (id,attrs)=>{const item={...tabs.get(id),...attrs};tabs.set(id,item);return item;},
      query:async ({active,windowId})=>[...tabs.values()].filter(x=>x.windowId===windowId).slice(-1),
      captureVisibleTab:async()=>(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAVs7gNYAAAAASUVORK5CYII='
      )
    },
    windows:{update:async()=>true},
    webNavigation:{getFrame:async({tabId})=>tabs.has(tabId)?{
      url:tabs.get(tabId).url,documentId:'doc-'+tabId,documentLifecycle:'active'}:null},
    webRequest:{
      onBeforeRequest:{addListener:fn=>webRequests.start.push(fn)},
      onCompleted:{addListener:fn=>webRequests.complete.push(fn)},
      onErrorOccurred:{addListener:fn=>webRequests.error.push(fn)}
    },
    downloads:{download:async opts=>{downloads.push(opts);return 777}},
    sidePanel:{open:async()=>true}
  };
  const host=createContextMenuHost({api,fetchImpl,lockManager:locks,logger:{warn(){}}});
  const confirm=async(operation,args)=>host.handleHost({
    operation:'browser.intent.confirm',targetOperation:operation,targetArgs:args,...identity
  },sender);
  const call=(operation,args={},approvalRef)=>host.handleTool({
    operation,args,approvalRef,...identity
  },sender);
  return {api,host,call,confirm,created,tabs,downloads,
    observeEvent:(type,info)=>webRequests[type].forEach(fn=>fn(info)),setSite:v=>{permitted=v;},
    setChrome:v=>{chromeGranted=v;},
    navigate(id,url){tabs.set(id,{...tabs.get(id),url});for(const fn of updated)fn(id,{url});}
  };
}

test('R2 public Browser SDK wraps four real operations while page SDK stays isolated',async()=>{
  const calls=[],sdk=createBrowserSdk({request:async(operation,args)=>{calls.push([operation,args]);return {ok:true};}});
  await sdk.tabs.open({url:'https://example.org'});
  await sdk.tabs.focus({tabRef:'r'.repeat(32)});
  await sdk.sidePanel.openSelf();
  await sdk.network.request({method:'GET',url:'https://example.org'});
  assert.deepEqual(calls.map(x=>x[0]),['browser.tabs.open','browser.tabs.focus',
    'browser.sidePanel.openSelf','browser.network.request']);
  const page=createBrowserSdk({context:'page-sdk'});
  assert.equal(typeof page.tabs,'undefined');
  assert.equal(typeof page.network,'undefined');
});

test('R2 schema rejects arbitrary tabs, credentials, bad methods and unsafe headers',()=>{
  assert.throws(()=>normalizeBrowserOperation('browser.tabs.focus',{tabId:1}),err('E_SCHEMA'));
  assert.throws(()=>normalizeBrowserOperation('browser.tabs.open',{url:'javascript:alert(1)'}),err('E_SCHEMA'));
  assert.throws(()=>normalizeBrowserOperation('browser.tabs.open',{url:'https://user:secret@host.test/'}),err('E_SCHEMA'));
  assert.throws(()=>normalizeBrowserOperation('browser.network.request',{method:'GET',url:'https://host.test',data:'x'}),err('E_SCHEMA'));
  assert.throws(()=>normalizeBrowserOperation('browser.network.request',{method:'PATCH',url:'https://host.test'}),err('E_SCHEMA'));
  assert.throws(()=>normalizeBrowserOperation('browser.network.request',{method:'POST',url:'https://host.test',config:{headers:{authorization:'secret'}}}),err('E_SCHEMA'));
});

test('R2 Host requires exact one-use approved action, binds TabRef to package and rejects raw tabId',async()=>{
  const f=fixture(),args={url:'https://example.org/path'};
  await assert.rejects(f.call('browser.tabs.open',args),err('E_USER_GESTURE_REQUIRED'));
  const {approvalRef}=await f.confirm('browser.tabs.open',args);
  await assert.rejects(f.call('browser.tabs.open',{url:'https://different.test/'},approvalRef),err('E_USER_GESTURE_REQUIRED'));
  await assert.rejects(f.call('browser.tabs.open',args,approvalRef),err('E_USER_GESTURE_REQUIRED'));
  assert.equal(f.created.length,0);
  const ref=(await f.call('browser.tabs.open',args,(await f.confirm('browser.tabs.open',args)).approvalRef)).tabRef;
  assert.equal(typeof ref,'string');
  assert.equal(f.created.length,1);
  await assert.rejects(f.call('browser.tabs.focus',{tabId:100}),err('E_SCHEMA'));
  await assert.rejects(f.call('browser.tabs.focus',{tabRef:ref}),err('E_USER_GESTURE_REQUIRED'));
  assert.deepEqual(await f.call('browser.tabs.focus',{tabRef:ref},
    (await f.confirm('browser.tabs.focus',{tabRef:ref})).approvalRef),{focused:true});
  f.navigate(100,'https://different.test/elsewhere');
  await assert.rejects(f.call('browser.tabs.focus',{tabRef:ref},
    (await f.confirm('browser.tabs.focus',{tabRef:ref})).approvalRef),err('E_TAB_REF_INVALID'));
});

test('R2 Host enforces installed tool capability, site revocation and Chrome permission checks',async()=>{
  const f=fixture(),args={url:'https://example.org'};
  f.setSite(false);
  await assert.rejects(f.confirm('browser.tabs.open',args),err('E_SITE_PERMISSION_REVOKED'));
  f.setSite(true);f.setChrome(false);
  await assert.rejects(f.confirm('browser.tabs.open',args),err('E_CHROME_PERMISSION_REQUIRED'));
  f.setChrome(true);
  const {approvalRef}=await f.confirm('browser.tabs.open',args);
  await f.api.storage.local.set({'opendesk.sidebar-tools.installed.v1':[]});
  await assert.rejects(f.call('browser.tabs.open',args,approvalRef),err('E_TOOL_CHANGED'));
  assert.equal(f.created.length,0);
});

test('R2 bounded HTTP uses old driver, strips sensitive headers, denies stale approval',async()=>{
  const seen=[];
  const f=fixture({fetchImpl:async(url,init)=>{
    seen.push({url,credentials:init.credentials,redirect:init.redirect});
    return new Response('{"ok":true}',{status:200,headers:{'content-type':'application/json','set-cookie':'hidden=1'}});
  }});
  const args={method:'GET',url:'https://example.org/json',config:{responseType:'json'}};
  assert.deepEqual(await f.call('browser.network.request',args,
    (await f.confirm('browser.network.request',args)).approvalRef),{status:200,data:{ok:true}});
  assert.deepEqual(seen,[{url:'https://example.org/json',credentials:'omit',redirect:'manual'}]);
  const token=(await f.confirm('browser.network.request',args)).approvalRef;
  f.setSite(false);
  await assert.rejects(f.call('browser.network.request',args,token),err('E_SITE_PERMISSION_REVOKED'));
  assert.equal(seen.length,1);
});

test('R2 Side Panel Host only authorizes preflight; synthetic tool RPC never directly opens it',async()=>{
  const f=fixture(),result=await f.call('browser.sidePanel.openSelf');
  assert.deepEqual(result,{requiresVisibleUserClick:true});
  f.setChrome(false);
  await assert.rejects(f.call('browser.sidePanel.openSelf'),err('E_CHROME_PERMISSION_REQUIRED'));
});

test('R2 revocation aborts a request that already entered the trusted fetch driver',async()=>{
 let entered;
 const inFlight=new Promise(resolve=>{entered=resolve});
 const f=fixture({fetchImpl:(_url,init)=>new Promise((_resolve,reject)=>{
   init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true});
   entered();
 })});
 const args={method:'GET',url:'https://example.org/private'};
 const token=(await f.confirm('browser.network.request',args)).approvalRef;
 const pending=f.call('browser.network.request',args,token);
 await inFlight;
 f.host.revokeBrowserOperations();
 await assert.rejects(pending,err('E_CANCELLED'));
});

test('R2 observe/end-to-end Host only sees owned TabRef; pagination and export are bound',async()=>{
 const f=fixture(),url={url:'https://example.org/page'};
 const tabRef=(await f.call('browser.tabs.open',url,
   (await f.confirm('browser.tabs.open',url)).approvalRef)).tabRef;
 const args={tabRef,origins:['https://example.org'],durationMs:10000,maxEvents:10};
 await assert.rejects(f.call('browser.network.observe.start',args),err('E_USER_GESTURE_REQUIRED'));
 const started=await f.call('browser.network.observe.start',args,
   (await f.confirm('browser.network.observe.start',args)).approvalRef);
 assert.match(started.observationId,/^[a-f0-9-]{36}$/i);
 f.observeEvent('start',{tabId:100,url:'https://example.org/data?token=SECRET',
   timeStamp:1000,method:'GET',type:'xmlhttprequest',requestHeaders:{cookie:'SECRET'}});
 f.observeEvent('complete',{tabId:100,url:'https://example.org/data?token=SECRET',
   timeStamp:1001,method:'GET',type:'xmlhttprequest',statusCode:200});
 const events=await f.call('browser.events.read',{sessionRef:started.observationId});
 assert.equal(events.events.length,2);
 assert(!JSON.stringify(events).includes('SECRET'));
 assert.equal((await f.call('browser.network.observe.stop',
   {observationId:started.observationId})).state,'stopped');
 const exp={observationId:started.observationId,format:'json'};
 await assert.rejects(f.call('browser.network.observe.export',exp),err('E_USER_GESTURE_REQUIRED'));
 const result=await f.call('browser.network.observe.export',exp,
   (await f.confirm('browser.network.observe.export',exp)).approvalRef);
 assert.equal(result.downloadId,777);
 assert.equal(f.downloads.length,1);
 assert.equal((await f.call('browser.events.close',{sessionRef:started.observationId})).closed,true);
});
test('R2 observer rejects off-Origin, Chrome revocation and uninstalled tool',async()=>{
 const f=fixture(),url={url:'https://example.org'};
 const tabRef=(await f.call('browser.tabs.open',url,(await f.confirm('browser.tabs.open',url)).approvalRef)).tabRef;
 const bad={tabRef,origins:['https://different.org']};
 await assert.rejects(f.confirm('browser.network.observe.start',bad),err('E_SITE_PERMISSION_REVOKED'));
 const exact={tabRef,origins:['https://example.org']};
 f.setChrome(false);
 await assert.rejects(f.confirm('browser.network.observe.start',exact),err('E_CHROME_PERMISSION_REQUIRED'));
 f.setChrome(true);
 await f.api.storage.local.set({'opendesk.sidebar-tools.installed.v1':[]});
 await assert.rejects(f.confirm('browser.network.observe.start',exact),err('E_TOOL_CHANGED'));
});

test('R4 owned operation status/cancel refers to a real network observation and never controls other tabs',async()=>{
 const f=fixture(),url={url:'https://example.org/observe'};
 const tabRef=(await f.call('browser.tabs.open',url,
   (await f.confirm('browser.tabs.open',url)).approvalRef)).tabRef;
 const params={tabRef,origins:['https://example.org'],durationMs:30000};
 const started=await f.call('browser.network.observe.start',params,
   (await f.confirm('browser.network.observe.start',params)).approvalRef);
 assert.equal(started.operationId,started.observationId);
 assert.deepEqual(await f.call('browser.operations.getStatus',
   {operationId:started.operationId}),{state:'running'});
 assert.deepEqual(await f.call('browser.operations.cancel',
   {operationId:started.operationId}),{state:'cancelled',cancelRequested:true});
 assert.deepEqual(await f.call('browser.operations.cancel',
   {operationId:started.operationId}),{state:'cancelled',cancelRequested:false});
 await assert.rejects(f.call('browser.operations.cancel',{operationId:'x'.repeat(32)}),
   err('E_OBSERVATION_UNKNOWN'));
 f.setSite(false);
 await assert.rejects(f.call('browser.operations.getStatus',
   {operationId:started.operationId}),err('E_SITE_PERMISSION_REVOKED'));
});

test('P1 screenshot: exact owned visible tab, one-use user approval and private PNG Save As receipt',async()=>{
 const f=fixture(),args={url:'https://example.org/screenshot'};
 const tabRef=(await f.call('browser.tabs.open',args,
   (await f.confirm('browser.tabs.open',args)).approvalRef)).tabRef;
 const capture={tabRef};
 await assert.rejects(f.call('browser.screenshot.captureVisible',capture),err('E_USER_GESTURE_REQUIRED'));
 await assert.rejects(f.confirm('browser.screenshot.captureVisible',{tabId:100}),err('E_SCHEMA'));
 const approval=(await f.confirm('browser.screenshot.captureVisible',capture)).approvalRef;
 const result=await f.call('browser.screenshot.captureVisible',capture,approval);
 assert.equal(result.downloadId,777);
 assert.equal(result.width,1);
 assert.equal(result.height,1);
 assert(result.resourceRef.length>=16);
 assert(!JSON.stringify(result).includes('base64'));
 assert(!Object.hasOwn(result,'tabId'));
 assert.equal(f.downloads.length,1);
 assert.equal(f.downloads[0].saveAs,true);
 assert.equal(f.downloads[0].url.startsWith('data:image/png;base64,'),true);
 await assert.rejects(f.call('browser.screenshot.captureVisible',capture,approval),err('E_USER_GESTURE_REQUIRED'));
});
test('P1 screenshot revocation and wrong visible tab prevent a Chrome capture side effect',async()=>{
 const f=fixture(),args={url:'https://example.org/screenshot'};
 const tabRef=(await f.call('browser.tabs.open',args,
   (await f.confirm('browser.tabs.open',args)).approvalRef)).tabRef;
 f.setSite(false);
 const deniedRef=(await f.confirm('browser.screenshot.captureVisible',{tabRef})).approvalRef;
 await assert.rejects(f.call('browser.screenshot.captureVisible',{tabRef},deniedRef),
   err('E_SITE_PERMISSION_REVOKED'));
 assert.equal(f.downloads.length,0);
 f.setSite(true);
 const second={url:'https://example.org/another'};
 await f.call('browser.tabs.open',second,(await f.confirm('browser.tabs.open',second)).approvalRef);
 const approval=(await f.confirm('browser.screenshot.captureVisible',{tabRef})).approvalRef;
 await assert.rejects(f.call('browser.screenshot.captureVisible',{tabRef},approval),
   err('E_TARGET_CHANGED'));
 assert.equal(f.downloads.length,0);
});

test('compact network.watch() returns an owned session handle and uses only existing trusted Host operations',async()=>{
 const f=fixture(),routed=[];
 const needsApproval=new Set(['browser.tabs.open','browser.network.observe.start','browser.network.observe.export']);
 const sdk=createBrowserSdk({request:async(operation,args)=>{
   routed.push(operation);
   const approvalRef=needsApproval.has(operation)
     ?(await f.confirm(operation,args)).approvalRef:undefined;
   return f.call(operation,args,approvalRef);
 }});
 const tab=await sdk.tabs.open({url:'https://example.org/page'});
 const watch=await sdk.network.watch({
   tabRef:tab.tabRef,origin:'https://example.org',durationMs:30000,
   maxEvents:12,maxBufferedBytes:2048
 });
 assert.equal(Object.isFrozen(watch),true);
 assert.match(watch.id,/^[A-Za-z0-9_-]{16,160}$/);
 assert.equal(typeof watch.read,'function');
 assert.deepEqual(Object.keys(JSON.parse(JSON.stringify(watch))),['id','expiresAt']);
 assert.deepEqual((await watch.status()).state,'running');
 f.observeEvent('start',{tabId:100,url:'https://example.org/secret?auth=HIDDEN',
   method:'GET',type:'xmlhttprequest',timeStamp:1000});
 const data=await watch.read({limit:10});
 assert.equal(data.events.length,1);
 assert.equal(data.events[0].kind,'request');
 assert(!JSON.stringify(data).includes('HIDDEN'));
 assert.throws(()=>watch.read({sessionRef:'r'.repeat(32)}),err('E_SCHEMA'));
 assert.throws(()=>watch.export({format:'csv'}),err('E_SCHEMA'));
 const stop=await watch.stop();
 assert.equal(stop.state,'stopped');
 assert.equal(Number.isFinite(stop.stoppedAt),true);
 const saved=await watch.export();
 assert.equal(saved.downloadId,777);
 assert.equal(f.downloads.length,1);
 assert.equal((await watch.cancel()).cancelRequested,false);
 assert.equal((await watch.close()).closed,true);
 await assert.rejects(watch.read(),err('E_OBSERVATION_UNKNOWN'));
 assert.deepEqual(routed,[
   'browser.tabs.open','browser.network.observe.start',
   'browser.network.observe.getStatus','browser.events.read','browser.network.observe.stop',
   'browser.network.observe.export','browser.operations.cancel','browser.events.close',
   'browser.events.read'
 ]);
 assert(!routed.some(name=>name.includes('network.watch')),'No new privileged RPC route');
});
test('compact network.watch rejects non-exact origins, foreign fields, and absent site grants',async()=>{
 const f=fixture(),sdk=createBrowserSdk({request:async(operation,args)=>{
   const approvalRef=['browser.tabs.open','browser.network.observe.start'].includes(operation)
      ?(await f.confirm(operation,args)).approvalRef:undefined;
   return f.call(operation,args,approvalRef);
 }});
 const tab=await sdk.tabs.open({url:'https://example.org/page'});
 await assert.rejects(sdk.network.watch({tabRef:tab.tabRef,
   origin:'https://example.org/private'}),err('E_SCHEMA'));
 await assert.rejects(sdk.network.watch({tabRef:tab.tabRef,
   origins:['https://example.org']}),err('E_SCHEMA'));
 await assert.rejects(sdk.network.watch({tabRef:tab.tabRef,
   origin:'https://other.example'}),err('E_SITE_PERMISSION_REVOKED'));
 f.setSite(false);
 await assert.rejects(sdk.network.watch({tabRef:tab.tabRef,
   origin:'https://example.org'}),err('E_SITE_PERMISSION_REVOKED'));
 const page=createBrowserSdk({context:'page-sdk'});
 assert.equal(typeof page.network,'undefined');
});

test('R5 actual installed Host reads and closes an owned tab only after one-use approval',async()=>{
 const f=fixture(),url={url:'https://example.org/r5'};
 const {tabRef}=await f.call('browser.tabs.open',url,(await f.confirm('browser.tabs.open',url)).approvalRef);
 assert.equal((await f.call('browser.tabs.getOwned',{tabRef})).origin,'https://example.org');
 assert.deepEqual((await f.call('browser.tabs.listOwned')).tabs,[{tabRef,origin:'https://example.org'}]);
 await assert.rejects(f.call('browser.tabs.closeOwned',{tabRef}),err('E_USER_GESTURE_REQUIRED'));
 const receipt=(await f.confirm('browser.tabs.closeOwned',{tabRef})).approvalRef;
 assert.deepEqual(await f.call('browser.tabs.closeOwned',{tabRef},receipt),{closed:true});
 await assert.rejects(f.call('browser.tabs.closeOwned',{tabRef},receipt),err('E_USER_GESTURE_REQUIRED'));
 assert.deepEqual((await f.call('browser.tabs.listOwned')).tabs,[]);
});
