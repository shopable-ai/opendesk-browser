import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrustedCookieHost,TRUSTED_COOKIE_OPERATIONS} from '../../src/platform/chrome/browser-cookie-host.js';
import {createContextMenuHost} from '../../src/platform/chrome/context-menus.js';
import {BROWSER_OPERATIONS,normalizeBrowserOperation,BROWSER_HOST_PROTOCOL} from '../../src/framework/sdk/browser-contract.js';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';
const uuid='01234567-89ab-4def-8123-456789abcdef';
const sender={id:'cookie-test-ext',frameId:0,documentId:'trusted-host-document-1',documentLifecycle:'active',
  url:'chrome-extension://cookie-test-ext/ui/tool.html?hostInstanceId='+uuid};
const reject=code=>error=>error?.code===code;
function fixture(){
  const tab={id:27,windowId:9,active:true,url:'https://shop.example.test/account',
    status:'complete',incognito:false};
  const document={tabId:27,windowId:9,documentId:'web-document-1',url:tab.url,origin:'https://shop.example.test'};
  const state={tab,document,site:true,cookiesPermission:true,
    cookies:[{name:'sid',value:'SECRET_PRIVATE',domain:'shop.example.test',path:'/',storeId:'0',
      secure:true,httpOnly:true,hostOnly:true,sameSite:'lax'}],
    native:[],changes:[],loseRemoveReceipt:false};
  const mock=(method,fn)=>(details,cb)=>{state.native.push([method,structuredClone(details)]);cb(fn(details));};
  const api={
    runtime:{id:'cookie-test-ext',getURL:part=>'chrome-extension://cookie-test-ext/'+part,
      lastError:null},
    tabs:{query:async()=>[state.tab]},
    webNavigation:{getFrame:async()=>({url:state.tab.url,documentId:state.document.documentId,
      documentLifecycle:'active'})},
    permissions:{contains:async ({permissions,origins})=>permissions?state.cookiesPermission:
      state.site&&origins?.length===1&&origins[0]==='https://shop.example.test/*'},
    cookies:{
      onChanged:{addListener:cb=>state.changes.push(cb)},
      getAllCookieStores:cb=>{state.native.push(['getAllCookieStores',{}]);cb([
        {id:'0',tabIds:[27],incognito:false},{id:'other',tabIds:[93],incognito:false}
      ]);},
      getAll:mock('getAll',details=>state.cookies.filter(row=>
        (!details.storeId||details.storeId===row.storeId)&&
        (!details.partitionKey||JSON.stringify(details.partitionKey)===JSON.stringify(row.partitionKey)))),
      get:mock('get',details=>state.cookies.find(row=>
        row.name===details.name&&(!details.storeId||details.storeId===row.storeId)&&
        JSON.stringify(details.partitionKey??null)===JSON.stringify(row.partitionKey??null)&&
        new URL(details.url).pathname.startsWith(row.path))??null),
      set:mock('set',details=>{
        const row={name:details.name,value:details.value,domain:details.domain??'shop.example.test',
          path:details.path??'/',storeId:details.storeId??'0',
          hostOnly:!details.domain,secure:details.secure??false,httpOnly:details.httpOnly??false,
          sameSite:details.sameSite??'unspecified',...(details.partitionKey?{partitionKey:details.partitionKey}:{})};
        state.cookies=state.cookies.filter(x=>x.name!==row.name);state.cookies.push(row);return row;
      }),
      remove:mock('remove',details=>{
        const index=state.cookies.findIndex(row=>row.name===details.name&&row.storeId===details.storeId);
        if(index<0)return null;
        state.cookies.splice(index,1);
        return state.loseRemoveReceipt?null:{name:details.name,url:details.url,storeId:details.storeId};
      }),
      getPartitionKey:mock('getPartitionKey',()=>({partitionKey:{
        topLevelSite:'https://shop.example.test',hasCrossSiteAncestor:false
      }}))
    }
  };
  const cookieHost=createTrustedCookieHost({api});
  const caller={hostInstanceId:uuid,documentId:sender.documentId};
  const approve=(op,args={},extra={})=>cookieHost.approve({
    targetOperation:op,targetArgs:args,document,hostInstanceId:uuid,...extra
  },caller);
  const execute=(approvalRef,overrideCaller=caller)=>cookieHost.execute({
    approvalRef,hostInstanceId:uuid
  },overrideCaller);
  const run=async(op,args={})=>execute((await approve(op,args)).approvalRef);
  return {api,state,document,cookieHost,caller,approve,execute,run};
}
test('R9 prelaunch registry removes undeployed placeholders while Cookie stays Host-only and Page blocked',()=>{
  assert.equal(TRUSTED_COOKIE_OPERATIONS.length,11);
  assert.equal(Object.keys(BROWSER_OPERATIONS).length,26);
  assert.equal(createBrowserSdk({context:'page-sdk'}).cookies,undefined);
  assert.equal(createBrowserSdk({request:()=>{}}).cookies,undefined);
  assert.throws(()=>normalizeBrowserOperation('browser.cookies.getAll',{}),reject('E_SERVICE_UNSUPPORTED'));
});
test('R7 authenticated pre-existing Browser Host route, forged sender rejected, one-use approval',async()=>{
  const f=fixture(),host=createContextMenuHost({api:f.api,logger:{warn(){}}});
  const proposal={protocol:BROWSER_HOST_PROTOCOL,operation:'browser.cookies.approve',
    targetOperation:'browser.cookies.getAll',targetArgs:{},document:f.document,hostInstanceId:uuid};
  await assert.rejects(host.handleHost(proposal,{...sender,url:'https://bad.test/'}),reject('E_OWNER'));
  const {approvalRef}=await host.handleHost(proposal,sender);
  const response=await host.handleHost({protocol:BROWSER_HOST_PROTOCOL,operation:'browser.cookies.execute',
    approvalRef,hostInstanceId:uuid},sender);
  assert.equal(response.cookies[0].value,'SECRET_PRIVATE');
  await assert.rejects(host.handleHost({operation:'browser.cookies.execute',
    approvalRef,hostInstanceId:uuid},sender),reject('E_USER_GESTURE_REQUIRED'));
  host.revokeBrowserOperations();
});
test('R7 current-document read, single store and validated partition',async()=>{
  const f=fixture();
  assert.equal((await f.run('browser.cookies.getAll')).cookies[0].value,'SECRET_PRIVATE');
  assert.equal((await f.run('browser.cookies.get',{name:'sid'})).cookie.value,'SECRET_PRIVATE');
  assert.deepEqual((await f.run('browser.cookies.getStores')).stores,[{storeId:'0'}]);
  assert.deepEqual((await f.run('browser.cookies.getPartitionKey')).partitionKey,
    {topLevelSite:'https://shop.example.test',hasCrossSiteAncestor:false});
  await assert.rejects(f.run('browser.cookies.getAll',{storeId:'other'}),reject('E_COOKIE_STORE'));
  await assert.rejects(f.run('browser.cookies.getAll',{partitionKey:{topLevelSite:'https://wrong.test'}}),
    reject('E_COOKIE_PARTITION'));
});
test('R9 same-name Cookies on different paths or partitions are never selected by array order',async()=>{
  const f=fixture();
  f.state.cookies.push({...f.state.cookies[0],value:'ANOTHER_SECRET',
    path:'/account',partitionKey:{topLevelSite:'https://shop.example.test',hasCrossSiteAncestor:false}});
  assert.equal((await f.run('browser.cookies.getAll')).cookies.length,2);
  await assert.rejects(f.run('browser.cookies.get',{name:'sid'}),reject('E_COOKIE_AMBIGUOUS'));
  assert.equal((await f.run('browser.cookies.get',{name:'sid',partitionKey:{
    topLevelSite:'https://shop.example.test',hasCrossSiteAncestor:false
  }})).cookie.value,'ANOTHER_SECRET');
  assert.equal((await f.run('browser.cookies.get',{name:'missing'})).cookie,null);
});
test('R7 denied Chrome permission, changed document, and untrusted identity cannot reach Cookie value',async()=>{
  const f=fixture(),approval=await f.approve('browser.cookies.getAll');
  f.state.site=false;
  await assert.rejects(f.execute(approval.approvalRef),reject('E_CHROME_PERMISSION_REQUIRED'));
  f.state.site=true;
  // The approval must be bound to the OLD document; a fresh approval for the
  // replacement would legitimately succeed and cannot prove the stale fence.
  const staleDocument=await f.approve('browser.cookies.getAll');
  f.state.document.documentId='changed-document';
  await assert.rejects(f.execute(staleDocument.approvalRef),reject('E_DOCUMENT_CHANGED'));
  f.state.document.documentId='web-document-1';
  const staleUrl=await f.approve('browser.cookies.getAll');
  f.state.tab.url='https://shop.example.test/other';
  await assert.rejects(f.execute(staleUrl.approvalRef),reject('E_DOCUMENT_CHANGED'));
  assert.equal(f.state.native.filter(([name])=>name==='getAll').length,0);
});
test('R7 reuse R8 Cookie Driver write/readback, prefix denial, scoped remove and no automatic retry',async()=>{
  const f=fixture();
  await assert.rejects(f.run('browser.cookies.set',{cookie:{
    name:'__Host-evil',value:'x',domain:'.other.test',secure:true
  }}),reject('E_SCHEMA'));
  await assert.rejects(f.run('browser.cookies.set',{cookie:{
    name:'__Secure-evil',value:'x',secure:false
  }}),reject('E_SCHEMA'));
  await assert.rejects(f.run('browser.cookies.set',{cookie:{
    name:'same-site',value:'x',sameSite:'no_restriction',secure:false
  }}),reject('E_SCHEMA'));
  const saved=await f.run('browser.cookies.set',{cookie:{
    name:'new',value:'HIDDEN_NEW',path:'/',secure:true,httpOnly:true,sameSite:'lax'
  }});
  assert.equal(saved.written,true);
  assert.equal(f.state.native.filter(([method])=>method==='set').length,1);
  assert.equal((await f.run('browser.cookies.get',{name:'new'})).cookie.value,'HIDDEN_NEW');
  const removed=await f.run('browser.cookies.remove',{
    name:'new',domain:'shop.example.test',path:'/',storeId:'0'
  });
  assert.equal(removed.removed,true);
  assert.equal(f.state.native.filter(([method])=>method==='remove').length,1);
  f.state.loseRemoveReceipt=true;
  await assert.rejects(f.run('browser.cookies.remove',{
    name:'sid',domain:'shop.example.test',path:'/',storeId:'0'
  }),reject('E_OUTCOME_UNKNOWN'));
  assert.equal(f.state.native.filter(([method])=>method==='remove').length,2);
});
test('R7 dedicated Cookie events omit values; sessions are volatile under navigation/revocation',async()=>{
  const f=fixture();
  const first=await f.run('browser.cookies.observe.start',{durationMs:10000,maxEvents:2});
  for(const fn of f.state.changes)fn({cookie:{...f.state.cookies[0]},removed:false,cause:'explicit'});
  const status=await f.run('browser.cookies.observe.getStatus',{sessionRef:first.sessionRef});
  assert.equal(status.status,'running');
  assert.equal(status.bufferedCount,1);
  assert.equal(Object.hasOwn(status,'events'),false,'Status must not consume events');
  const firstRead=await f.run('browser.cookies.observe.read',{sessionRef:first.sessionRef,cursor:'0',limit:1});
  assert.equal(firstRead.events.length,1);
  assert.equal(firstRead.events[0].seq,1);
  assert.equal(firstRead.nextCursor,'1');
  assert(!JSON.stringify(firstRead).includes('SECRET_PRIVATE'));
  assert.deepEqual((await f.run('browser.cookies.observe.read',{
    sessionRef:first.sessionRef,cursor:firstRead.nextCursor
  })).events,[],'Cursor reads must be idempotent');
  for(const fn of f.state.changes)fn({cookie:{...f.state.cookies[0]},removed:true,cause:'explicit'});
  for(const fn of f.state.changes)fn({cookie:{...f.state.cookies[0]},removed:false,cause:'explicit'});
  const overflow=await f.run('browser.cookies.observe.read',{sessionRef:first.sessionRef,cursor:'0'});
  assert.equal(overflow.events.length,2);
  assert.equal(overflow.gapCount,1);
  assert.equal(overflow.droppedCount,1);
  assert(!JSON.stringify(overflow).includes('SECRET_PRIVATE'));
  assert.equal((await f.run('browser.cookies.observe.getStatus',{sessionRef:first.sessionRef})).bufferedCount,2);
  await assert.rejects(f.run('browser.cookies.observe.read',{sessionRef:first.sessionRef,cursor:'-1'}),
    reject('E_SCHEMA'));
  await assert.rejects(f.run('browser.cookies.observe.read',{sessionRef:first.sessionRef,limit:51}),
    reject('E_SCHEMA'));
  f.cookieHost.noteNavigation(27);
  await assert.rejects(f.run('browser.cookies.observe.read',{sessionRef:first.sessionRef}),
    reject('E_SESSION_EXPIRED'));
  await assert.rejects(f.run('browser.cookies.observe.getStatus',{sessionRef:first.sessionRef}),
    reject('E_SESSION_EXPIRED'));
  const second=await f.run('browser.cookies.observe.start');
  const afterWorkerRestart=createTrustedCookieHost({api:f.api});
  const receipt=await afterWorkerRestart.approve({
    targetOperation:'browser.cookies.observe.getStatus',targetArgs:{sessionRef:second.sessionRef},
    document:f.document,hostInstanceId:uuid
  },f.caller);
  await assert.rejects(afterWorkerRestart.execute({approvalRef:receipt.approvalRef,
    hostInstanceId:uuid},f.caller),reject('E_SESSION_EXPIRED'));
  f.cookieHost.revoke();
});
