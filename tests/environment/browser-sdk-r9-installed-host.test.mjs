import test from 'node:test';
import assert from 'node:assert/strict';
import {BROWSER_MENU_GRANTS_STORE} from '../../src/framework/sdk/browser-contract.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE,sidebarToolStopLock} from '../../src/ui/sidebar-tools/lifecycle.js';
import {createContextMenuHost} from '../../src/platform/chrome/context-menus.js';
import {setInstalledSidebarToolEnabled} from '../../src/ui/sidebar-tools/installation.js';
import {SIDEBAR_TOOL_STORE,validateSidebarToolPackage,sidebarToolPackageHash} from '../../src/ui/sidebar-tools/package.js';

const uid='01234567-89ab-4def-8123-456789abcdef';
const origin='https://shop.example.test';
const url=origin+'/account';
const partitionKey={topLevelSite:origin,hasCrossSiteAncestor:false};
const reject=code=>err=>err?.code===code;

const cookiePkg=validateSidebarToolPackage({
  format:'opendesk.sidebar-tool.v2',id:'cookie-editor',version:'2.0.0',
  title:'Cookie Editor',description:'Installed Browser Cookies SDK test fixture',
  capabilities:['currentPage.read','user.export','browser.cookies.read','browser.cookies.values',
    'browser.cookies.write','browser.cookies.observe','browser.cookies.clear'],
  html:'<div>Cookie Editor</div>',css:'',js:'void 0;',
  requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]}
});
const identity={toolId:cookiePkg.id,toolVersion:cookiePkg.version,
  toolInstance:uid,hostInstanceId:uid,installEpoch:null,
  packageHash:await sidebarToolPackageHash(cookiePkg)};
const sender={id:'cookie-host-test',frameId:0,documentId:'host-doc',documentLifecycle:'active',
  url:'chrome-extension://cookie-host-test/sidepanel.html?hostInstanceId='+uid};

function fixture({sender:hostSender=sender,installedPackage=cookiePkg,installedIdentity=identity,deferGrantEvents=false,
  locks={request:(key,options,work=options)=>work({name:key})}}={}){
  const local=new Map([['opendesk.sidebar-tools.installed.v1',[installedPackage]]]),session=new Map();
  const onStorage=[],native=[],listeners=[],grantEvents=[];
  const tab={id:10,windowId:3,url,active:true,incognito:false,status:'complete'};
  const document={tabId:tab.id,windowId:tab.windowId,documentId:'website-document',url,origin};
  const state={hostAllowed:true,cookiesAllowed:true,activeTab:true,
    partition:{...partitionKey},
    records:[{name:'sid',value:'SECRET_TEST_ONLY',domain:'shop.example.test',path:'/',
      storeId:'0',hostOnly:true,session:true,secure:true,httpOnly:true,sameSite:'lax'}]};
  const storage=(map,area)=>({
    get:async ids=>Object.fromEntries((Array.isArray(ids)?ids:[ids]).map(k=>[k,map.get(k)])),
    set:async values=>{
      const changes={};
      for(const [k,value] of Object.entries(values)){
        changes[k]={oldValue:map.get(k),newValue:value};map.set(k,value);
      }
      const deliver=()=>{for(const callback of onStorage)callback(changes,area);};
      if(deferGrantEvents&&area==='local'&&Object.hasOwn(changes,BROWSER_MENU_GRANTS_STORE))grantEvents.push(deliver);
      else deliver();
    }
  });
  const samePartition=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
  const candidates=(details={})=>state.records.filter(row=>
    (!details.storeId||row.storeId===details.storeId)&&samePartition(row.partitionKey,details.partitionKey)&&
    (!details.name||row.name===details.name)&&
    (!details.domain||row.domain.replace(/^\./,'')===details.domain)&&
    (!details.url||new URL(details.url).hostname===row.domain.replace(/^\./,'')&&
      (new URL(details.url).pathname===row.path||
       new URL(details.url).pathname.startsWith(row.path.endsWith('/')?row.path:row.path+'/'))));
  const api={
    runtime:{id:'cookie-host-test',getURL:part=>'chrome-extension://cookie-host-test/'+part,lastError:null},
    permissions:{contains:async ({permissions,origins})=>
      permissions?state.cookiesAllowed:state.hostAllowed&&origins.length===1&&
        origins[0]==='https://shop.example.test/*'},
    storage:{local:storage(local,'local'),session:storage(session,'session'),
      onChanged:{addListener:fn=>onStorage.push(fn)}},
    tabs:{query:async()=>state.activeTab?[tab]:[]},
    webNavigation:{getFrame:async()=>({url:tab.url,documentId:document.documentId,documentLifecycle:'active'})},
    cookies:{
      onChanged:{addListener:fn=>listeners.push(fn)},
      getAllCookieStores:callback=>{native.push('getAllCookieStores');callback([{id:'0',tabIds:[10],incognito:false}]);},
      getPartitionKey:(_args,callback)=>{native.push('getPartitionKey');callback({partitionKey:state.partition});},
      getAll:(args,callback)=>{native.push('getAll');callback(candidates(args).map(x=>({...x})));},
      get:(args,callback)=>{native.push('get');callback(candidates(args)[0]??null);},
      set:(args,callback)=>{
        native.push('set');
        const result={name:args.name,value:args.value,domain:args.domain??new URL(args.url).hostname,
          path:args.path??'/',storeId:args.storeId??'0',hostOnly:args.domain===undefined,
          session:args.expirationDate===undefined,secure:args.secure===true,httpOnly:args.httpOnly===true,
          sameSite:args.sameSite??'unspecified',...(args.partitionKey?{partitionKey:args.partitionKey}:{})};
        state.records=state.records.filter(x=>x.name!==result.name||x.domain!==result.domain||
          x.path!==result.path||x.storeId!==result.storeId||!samePartition(x.partitionKey,result.partitionKey));
        if(args.expirationDate===0){callback(undefined);return;}
        state.records.push(result);callback(result);
      },
      remove:(args,callback)=>{
        native.push('remove');
        const row=candidates(args)[0];
        if(row)state.records.splice(state.records.indexOf(row),1);
        callback(row?{name:row.name,url:args.url,storeId:row.storeId}:null);
      }
    }
  };
  const host=createContextMenuHost({api,lockManager:locks,logger:{warn(){}}});
  const grant=(capability,enabled=true)=>host.handleHost({
    operation:'browser.cookies.userGrant',...installedIdentity,cookieCapability:capability,enabled,
    origin,...(enabled?{document}:{})},hostSender);
  const confirm=(operation,args,extra)=>host.handleHost({operation:'browser.intent.confirm',
    ...installedIdentity,targetOperation:operation,targetArgs:args,
    ...(extra?.cookieImportSource===undefined?{}:{cookieImportDeadlineAt:Date.now()+15000}),...extra},hostSender);
  const call=(operation,args={},approvalRef,as=installedIdentity)=>host.handleTool({
    ...as,operation,args,...(approvalRef?{approvalRef}:{})},hostSender);
  return {api,host,grant,call,confirm,state,native,local,document,sender:hostSender,identity:installedIdentity,
    deliverGrantEvents(){for(const deliver of grantEvents.splice(0))deliver();}};
}

test('R9 actual Browser Dispatcher refuses a regular installed Cookie read before per-site grant',async()=>{
  const f=fixture(),args={url};
  await assert.rejects(f.call('browser.cookies.getAll',args),reject('E_SITE_GRANT_REQUIRED'));
  assert.equal(f.native.filter(x=>x==='getAll').length,0,'No native secret read on denied grant');
  await f.grant('read');
  const rows=await f.call('browser.cookies.getAll',args);
  assert.equal(rows.length,1);
  assert.equal(rows[0].valueRedacted,true);
  assert(!JSON.stringify(rows).includes('SECRET_TEST_ONLY'));
  f.state.activeTab=false;
  assert.equal((await f.call('browser.cookies.getAll',args)).length,1,
    'already-authorized site does not need to remain the active tab');
});

test('R9 all-sites partition reads follow the trusted panel document across windows',async()=>{
  const f=fixture();
  const query=f.api.tabs.query;
  f.api.tabs.query=filters=>filters.currentWindow
    ?[{id:20,windowId:7,url:'https://different.example.test/',active:true}]
    :query(filters);
  await f.host.handleHost({operation:'browser.cookies.userGrant',...identity,
    scope:'all-http-sites',cookieCapability:'all',enabled:true,document:f.document},sender);
  const operation='browser.cookies.getPartitionKey',args={url};
  const read=(cookieReadDocument,caller=sender)=>f.host.handleTool({
    ...identity,operation,args,cookieReadDocument},caller);
  await assert.rejects(f.call(operation,args),reject('E_COOKIE_PARTITION'));
  assert.deepEqual(await read(f.document),{partitionKey});
  const nativeCalls=f.native.filter(x=>x==='getPartitionKey').length;
  await assert.rejects(read({...f.document,documentId:'old-document'}),reject('E_DOCUMENT_CHANGED'));
  await assert.rejects(read(f.document,{...sender,url:'https://different.example.test/'}),reject('E_OWNER'));
  f.state.activeTab=false;
  await assert.rejects(read(f.document),reject('E_DOCUMENT_CHANGED'));
  assert.equal(f.native.filter(x=>x==='getPartitionKey').length,nativeCalls);
});

async function exactClearFixture({allSites=true,deferGrantEvents=false}={}){
  const f=fixture({deferGrantEvents});
  const query=f.api.tabs.query;
  let workerFocusChanged=false;
  f.api.tabs.query=filters=>filters.currentWindow&&workerFocusChanged
    ?[{id:20,windowId:7,url:'https://different.example.test/',active:true}]
    :query(filters);
  const getFrame=f.api.webNavigation.getFrame;
  let replacement=false;
  f.api.webNavigation.getFrame=async filters=>{
    const frame=await getFrame(filters);
    return replacement?{...frame,documentId:'replacement-document'}:frame;
  };
  if(allSites)await f.host.handleHost({operation:'browser.cookies.userGrant',...f.identity,
    scope:'all-http-sites',cookieCapability:'all',enabled:true,document:f.document},f.sender);
  else await f.grant('clear');

  const operation='browser.cookies.clearSite';
  const scope='site-exact-host';
  const preview=cookieReadDocument=>f.host.handleTool({...f.identity,operation,
    args:{url,scope,preview:true,maxCookies:50},cookieReadDocument},f.sender);
  const {previewRef,matched}=await preview(f.document);
  assert.equal(matched,1);
  const args={url,scope,previewRef,expectedCount:matched,maxCookies:50};
  return {...f,operation,args,preview,
    focusOtherWindow:()=>{workerFocusChanged=true;},
    reactivateTab:()=>{
      f.state.activeTab=false;
      f.host.noteActiveTab(f.document.tabId+1,f.document.windowId);
      f.state.activeTab=true;
      f.host.noteActiveTab(f.document.tabId,f.document.windowId);
    },
    navigateAndRestoreDocument:()=>{
      f.host.noteNavigation(f.document.tabId,0);
      f.host.noteNavigation(f.document.tabId,0);
    },
    replaceDocument:()=>{replacement=true;return {...f.document,documentId:'replacement-document'};}};
}

for(const allSites of [true,false])test('R9 first exact Cookie clear survives delayed grant notification: '+(allSites?'all-sites':'site'),async()=>{
  const f=await exactClearFixture({allSites,deferGrantEvents:true});
  if(!allSites)f.deliverGrantEvents();
  const {approvalRef}=await f.confirm(f.operation,f.args,{document:f.document});
  if(allSites)f.deliverGrantEvents();
  assert.deepEqual(await f.call(f.operation,f.args,approvalRef),{matched:1,removed:1,remaining:0,
    excluded:0,preview:false,scope:'SITE_EXACT_HOST'});
  assert.deepEqual(f.state.records,[]);
  assert.equal(f.native.filter(x=>x==='set').length,1);
});

test('R9 concurrent reviewed Cookie clear calls cannot spend the same preview twice',async()=>{
  const f=await exactClearFixture();
  const approvals=await Promise.all([1,2].map(()=>f.confirm(f.operation,f.args,{document:f.document})));
  const results=await Promise.allSettled(approvals.map(({approvalRef})=>f.call(f.operation,f.args,approvalRef)));
  assert.equal(results.filter(r=>r.status==='fulfilled'&&r.value.removed===1).length,1);
  assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.code==='E_COOKIE_STALE').length,1);
  assert.deepEqual(f.state.records,[]);
  assert.equal(f.native.filter(x=>x==='set').length,1);
});

test('R9 actual Cookie grant revocation blocks deletion before delayed notification and after restore',async()=>{
  const f=await exactClearFixture({allSites:false,deferGrantEvents:true});
  const {approvalRef}=await f.confirm(f.operation,f.args,{document:f.document});
  await f.grant('clear',false);
  await assert.rejects(f.call(f.operation,f.args,approvalRef),reject('E_SITE_GRANT_REQUIRED'));
  await f.grant('clear');
  const fresh=await f.confirm(f.operation,f.args,{document:f.document});
  await assert.rejects(f.call(f.operation,f.args,fresh.approvalRef),reject('E_COOKIE_STALE'));
  assert.equal(f.state.records.length,1);
  assert(!f.native.includes('set'));
  const preview=await f.preview(f.document);
  const newArgs={...f.args,previewRef:preview.previewRef,expectedCount:preview.matched};
  f.deliverGrantEvents();
  const newApproval=await f.confirm(f.operation,newArgs,{document:f.document});
  assert.equal((await f.call(f.operation,newArgs,newApproval.approvalRef)).removed,1);
  assert.equal(f.native.filter(x=>x==='set').length,1);
});

test('R9 exact Cookie clear cannot spend an earlier activation preview with a fresh approval',async()=>{
  const f=await exactClearFixture();
  f.reactivateTab();
  const {approvalRef}=await f.confirm(f.operation,f.args,{document:f.document});
  await assert.rejects(f.call(f.operation,f.args,approvalRef),reject('E_COOKIE_STALE'));
  assert(!f.native.includes('set'));
  assert.equal(f.state.records.length,1);
});

test('R9 exact Cookie clear binds the approval to its activation before queueing',async()=>{
  const f=await exactClearFixture();
  const approval=f.confirm(f.operation,f.args,{document:f.document});
  f.reactivateTab();
  await assert.rejects(approval,reject('E_DOCUMENT_CHANGED'));
  assert(!f.native.includes('set'));
});

test('R9 exact Cookie clear rejects an approval after navigation restores the same frame',async()=>{
  const f=await exactClearFixture();
  const {approvalRef}=await f.confirm(f.operation,f.args,{document:f.document});
  f.navigateAndRestoreDocument();
  await assert.rejects(f.call(f.operation,f.args,approvalRef),reject('E_DOCUMENT_CHANGED'));
  assert(!f.native.includes('set'));
  assert.equal(f.state.records.length,1);
});

test('R9 exact Cookie clear refuses an away-and-back tab switch during the last pre-write read',async()=>{
  const f=await exactClearFixture();
  const {approvalRef}=await f.confirm(f.operation,f.args,{document:f.document});
  const getAll=f.api.cookies.getAll;
  let exactReads=0;
  f.api.cookies.getAll=(details,callback)=>getAll(details,rows=>{
    if(details.name==='sid'&&++exactReads===2)f.reactivateTab();
    callback(rows);
  });
  const result=f.call(f.operation,f.args,approvalRef);
  await assert.rejects(result,reject('E_DOCUMENT_CHANGED'));
  assert.equal(exactReads,2);
  assert(!f.native.includes('set'));
  assert.equal(f.state.records.length,1);
});

for(const [name,change,expectedError,allSites] of [
  ['focus-only change',f=>f.focusOtherWindow(),null,true],
  ['away-and-back tab switch',f=>f.reactivateTab(),'E_OUTCOME_UNKNOWN',true],
  ['navigation restoring the same frame',f=>f.navigateAndRestoreDocument(),'E_OUTCOME_UNKNOWN',true],
  ['same-URL document replacement',f=>f.replaceDocument(),'E_OUTCOME_UNKNOWN',false],
  ['Chrome site permission revocation',f=>{f.state.hostAllowed=false;},'E_OUTCOME_UNKNOWN',true],
])test('R9 exact Cookie clear receipt after '+name,async()=>{
  const f=await exactClearFixture({allSites});
  const {approvalRef}=await f.confirm(f.operation,f.args,{document:f.document});
  let acknowledge;
  const dispatched=new Promise(resolve=>{acknowledge=resolve;});
  const set=f.api.cookies.set;
  f.api.cookies.set=(details,callback)=>{
    assert.equal(details.expirationDate,0);
    assert.equal(details.name,'sid');
    assert.equal(details.storeId,'0');
    set(details,receipt=>acknowledge(()=>callback(receipt)));
  };
  const result=f.call(f.operation,f.args,approvalRef);
  const release=await Promise.race([dispatched,result.then(()=>assert.fail('No native expiration'))]);
  change(f);
  release();
  if(expectedError)await assert.rejects(result,reject(expectedError));
  else assert.deepEqual(await result,{matched:1,removed:1,remaining:0,excluded:0,
    preview:false,scope:'SITE_EXACT_HOST'});
  assert.deepEqual(f.state.records,[]);
  assert.equal(f.native.filter(x=>x==='set').length,1);
  await assert.rejects(f.call(f.operation,f.args,approvalRef),reject('E_USER_GESTURE_REQUIRED'));
});

test('R9 exact Cookie clear rejects absent, malformed or replaced document proof before writing',async()=>{
  const f=await exactClearFixture();
  await assert.rejects(f.preview(undefined),reject('E_DOCUMENT_CHANGED'));
  await assert.rejects(f.confirm(f.operation,f.args),reject('E_DOCUMENT_CHANGED'));
  await assert.rejects(f.confirm(f.operation,f.args,{document:null}),reject('E_DOCUMENT_CHANGED'));
  const oldApproval=await f.confirm(f.operation,f.args,{document:f.document});
  const replacement=f.replaceDocument();
  await assert.rejects(f.host.handleTool({...f.identity,operation:f.operation,args:f.args,
    approvalRef:oldApproval.approvalRef,cookieReadDocument:replacement},f.sender),reject('E_DOCUMENT_CHANGED'));
  const newApproval=await f.confirm(f.operation,f.args,{document:replacement});
  await assert.rejects(f.call(f.operation,f.args,newApproval.approvalRef),reject('E_COOKIE_STALE'));
  assert(!f.native.includes('set'));
  assert.equal(f.state.records.length,1);
});

test('R9 legacy host-only Cookie clear retains the existing grant and click path without document proof',async()=>{
  const f=fixture(),operation='browser.cookies.clearSite';
  await f.grant('clear');
  f.state.activeTab=false;
  const {matched,previewRef}=await f.call(operation,{url,preview:true,maxCookies:50});
  const args={url,previewRef,expectedCount:matched,maxCookies:50};
  await assert.rejects(f.call(operation,args),reject('E_USER_GESTURE_REQUIRED'));
  const {approvalRef}=await f.confirm(operation,args);
  assert.deepEqual(await f.call(operation,args,approvalRef),{matched:1,removed:1,remaining:0,
    scopeComplete:true,siteFullyCleared:false,preview:false,scope:'EXACT_HOST_HOST_ONLY'});
  assert.equal(f.native.filter(x=>x==='set').length,1);
});

test('R9 exact Chrome host/values permissions, version, hash and extension sender are enforced',async()=>{
  const f=fixture(),args={url};
  await f.grant('read');
  await assert.rejects(f.call('browser.cookies.getAll',{...args,includeValues:true}),
    reject('E_COOKIE_VALUES_REQUIRED'));
  await f.grant('values');
  const rows=await f.call('browser.cookies.getAll',{...args,includeValues:true});
  assert.equal(rows[0].value,'SECRET_TEST_ONLY');
  f.state.hostAllowed=false;
  await assert.rejects(f.call('browser.cookies.getAll',args),reject('E_SITE_PERMISSION_REVOKED'));
  f.state.hostAllowed=true;
  await assert.rejects(f.call('browser.cookies.getAll',args,undefined,
    {...f.identity,packageHash:'0'.repeat(64)}),reject('E_TOOL_CHANGED'));
  await assert.rejects(f.host.handleTool({operation:'browser.cookies.getAll',args,...f.identity},
    {...f.sender,url:'https://attacker.example/'}),reject('E_OWNER'));
  await f.grant('values',false);
  await assert.rejects(f.call('browser.cookies.getAll',{...args,includeValues:true}),
    reject('E_COOKIE_VALUES_REQUIRED'));
});

test('R9 Chrome Cookie native effect requires one-use reviewed intent and respects revocation',async()=>{
  const f=fixture(),args={url,name:'theme',value:'test',path:'/'};
  await f.grant('write');
  await assert.rejects(f.call('browser.cookies.set',args),reject('E_USER_GESTURE_REQUIRED'));
  const approval=(await f.confirm('browser.cookies.set',args)).approvalRef;
  assert.equal((await f.call('browser.cookies.set',args,approval)).saved,true);
  assert.equal(f.native.filter(x=>x==='set').length,1);
  await assert.rejects(f.call('browser.cookies.set',args,approval),reject('E_USER_GESTURE_REQUIRED'));
  const pending=(await f.confirm('browser.cookies.set',{...args,value:'new'})).approvalRef;
  await f.grant('write',false);
  const nativeAfterRevoke=[...f.native];
  const recordsAfterRevoke=structuredClone(f.state.records);
  // Missing capability is denied before comparing the intent's grant epoch.
  await assert.rejects(f.call('browser.cookies.set',{...args,value:'new'},pending),
    reject('E_SITE_GRANT_REQUIRED'));
  await assert.rejects(f.confirm('browser.cookies.set',{...args,value:'new'}),
    reject('E_SITE_GRANT_REQUIRED'));
  assert.deepEqual(f.native,nativeAfterRevoke,'Revoked requests never reach native Cookies');
  assert.deepEqual(f.state.records,recordsAfterRevoke,'Revocation leaves existing Cookie values unchanged');
  assert.equal(f.native.filter(x=>x==='set').length,1);
  await f.grant('write');
  const nativeAfterRegrant=[...f.native];
  await assert.rejects(f.call('browser.cookies.set',{...args,value:'new'},pending),
    reject('E_USER_GESTURE_REQUIRED'));
  assert.deepEqual(f.native,nativeAfterRegrant,'A denied attempt consumes the old intent');
  assert.deepEqual(f.state.records,recordsAfterRevoke);
});

test('R9 an unused Cookie intent stays revoked after website permission is restored',async()=>{
  const f=fixture(),args={url,name:'theme',value:'restored',path:'/'};
  await f.grant('write');
  const pending=(await f.confirm('browser.cookies.set',args)).approvalRef;
  await f.grant('all',false);
  assert.equal(f.native.filter(x=>x==='set'||x==='remove').length,0);
  await f.grant('write');
  const nativeAfterRegrant=[...f.native];
  const recordsAfterRegrant=structuredClone(f.state.records);
  await assert.rejects(f.call('browser.cookies.set',args,pending),reject('E_GRANT_REVOKED'));
  await assert.rejects(f.call('browser.cookies.set',args,pending),reject('E_USER_GESTURE_REQUIRED'));
  assert.deepEqual(f.native,nativeAfterRegrant,'Restoring a capability cannot revive an old intent');
  assert.deepEqual(f.state.records,recordsAfterRegrant,'An unused stale intent cannot change Cookie values');
  assert.equal(f.native.filter(x=>x==='set'||x==='remove').length,0);
  const fresh=(await f.confirm('browser.cookies.set',args)).approvalRef;
  assert.equal((await f.call('browser.cookies.set',args,fresh)).saved,true);
  assert.equal(f.native.filter(x=>x==='set').length,1,'Only a fresh reviewed intent can write');
});

test('R9 uninstalled and disabled Cookie tools cannot reuse previously granted site capability',async()=>{
  const f=fixture();
  await f.grant('read');
  await f.api.storage.local.set({'opendesk.sidebar-tools.installed.v1':[]});
  await assert.rejects(f.call('browser.cookies.getAll',{url}),reject('E_TOOL_CHANGED'));
});


test('R9 revoking an entire Cookie website is atomic even without the tab open',async()=>{
  const f=fixture();
  await f.grant('read');await f.grant('write');await f.grant('values');
  f.state.activeTab=false;
  const writes=[];
  f.api.storage.onChanged.addListener((changes,area)=>{
    if(area==='local'&&changes['opendesk.browser.context-menu-grants.v1'])
      writes.push(structuredClone(changes['opendesk.browser.context-menu-grants.v1'].newValue));
  });
  await f.grant('all',false);
  assert.equal(writes.length,1,'All site capabilities are revoked in one durable write');
  for(const cap of ['read','values','write','observe','clear']){
    const grant=f.local.get('opendesk.browser.context-menu-grants.v1')?.[f.identity.toolId]?.cookieSites?.[origin];
    assert.equal(grant?.[cap],false,cap);
  }
  await assert.rejects(f.call('browser.cookies.getAll',{url}),reject('E_SITE_GRANT_REQUIRED'));
  await assert.rejects(f.call('browser.cookies.set',{url,name:'x',value:'x'}),
    reject('E_USER_GESTURE_REQUIRED'));
  const revoked=structuredClone(f.local.get('opendesk.browser.context-menu-grants.v1'));
  const beforeNative=[...f.native];
  await assert.rejects(f.grant('all',true),reject('E_DOCUMENT_CHANGED'),
    'Restoring a site requires the actual current website document');
  assert.deepEqual(f.local.get('opendesk.browser.context-menu-grants.v1'),revoked);
  assert.deepEqual(f.native,beforeNative,'No Cookie access while the website is absent');
  f.state.activeTab=true;
  await assert.rejects(f.call('browser.cookies.userGrant',{
    cookieCapability:'all',enabled:true,origin,document:f.document}),reject('E_SERVICE_UNSUPPORTED'),
    'The sandbox cannot call the trusted consent operation');
  await assert.rejects(f.host.handleHost({operation:'browser.cookies.userGrant',...identity,
    cookieCapability:'all',enabled:true,origin,document:f.document},
  {...sender,url:'https://attacker.example/'}),reject('E_OWNER'));
  assert.deepEqual(f.local.get('opendesk.browser.context-menu-grants.v1'),revoked,
    'Unauthorized requests cannot restore any revoked capability');
  assert.equal(writes.length,1,'Denied requests do not write authorization');
});

test('R9 trusted one-consent restoration binds declared capabilities to the exact website and installation',async()=>{
  const f=fixture();
  let writes=0;
  f.api.storage.onChanged.addListener((changes,area)=>{
    if(area==='local'&&changes['opendesk.browser.context-menu-grants.v1'])writes++;
  });
  await f.grant('all');
  assert.equal(writes,1,'All declared site capabilities are persisted atomically');
  const grants=f.local.get('opendesk.browser.context-menu-grants.v1');
  const installed=grants[identity.toolId],site=installed.cookieSites[origin];
  assert.equal(installed.version,identity.toolVersion);
  assert.equal(installed.packageHash,identity.packageHash);
  assert.equal(installed.installEpoch,identity.installEpoch);
  assert.deepEqual(Object.keys(installed.cookieSites),[origin]);
  assert.equal(installed.cookieAllSites,undefined,'Site consent cannot create all-site consent');
  assert.equal(site.storeId,'0');assert.deepEqual(site.partitionKey,partitionKey);
  assert.equal(site.valueConsent,true);assert.ok(site.grantEpoch);
  for(const cap of ['read','values','write','observe','clear'])assert.equal(site[cap],true,cap);
  assert.equal(f.native.some(name=>['getAll','get','set','remove'].includes(name)),false,
    'Granting capabilities does not read or write Cookie values');
  const initialEpoch=site.grantEpoch;
  await f.grant('all',false);
  await f.grant('all');
  assert.notEqual(f.local.get('opendesk.browser.context-menu-grants.v1')
    [identity.toolId].cookieSites[origin].grantEpoch,initialEpoch);
  await f.api.storage.local.set({[TOOL_REVOCATION_EPOCHS_STORE]:{[cookiePkg.id]:'replacement'}});
  const before=structuredClone(f.local.get('opendesk.browser.context-menu-grants.v1'));
  await assert.rejects(f.grant('all'),reject('E_TOOL_CHANGED'));
  assert.deepEqual(f.local.get('opendesk.browser.context-menu-grants.v1'),before,
    'Old installation cannot grant permissions to a replacement');
});
test('R9 one-consent site grant cannot add an undeclared Cookie capability',async()=>{
  const installedPackage=validateSidebarToolPackage({...cookiePkg,
    capabilities:cookiePkg.capabilities.filter(cap=>cap!=='browser.cookies.clear')});
  const installedIdentity={...identity,packageHash:await sidebarToolPackageHash(installedPackage)};
  const f=fixture({installedPackage,installedIdentity});
  await f.grant('all');
  const site=f.local.get('opendesk.browser.context-menu-grants.v1')[identity.toolId].cookieSites[origin];
  for(const cap of ['read','values','write','observe'])assert.equal(site[cap],true,cap);
  assert.notEqual(site.clear,true,'Trusted consent is bounded by the installed manifest');
});
test('R9 a later values/write grant cannot silently move an earlier read grant to another partition',async()=>{
  const f=fixture();
  await f.grant('read');
  f.state.partition={topLevelSite:'https://other.example.test',hasCrossSiteAncestor:false};
  await assert.rejects(f.grant('values'),reject('E_COOKIE_SCOPE'));
  await assert.rejects(f.grant('write'),reject('E_COOKIE_SCOPE'));
  assert.notEqual(f.local.get('opendesk.browser.context-menu-grants.v1')?.[f.identity.toolId]?.cookieSites?.[origin]?.write,true);
});

test('setMany installed Host binds one approval to the exact complete batch and consumes it once',async()=>{
  const f=fixture(),operation='browser.cookies.setMany',args={url,cookies:[
    {name:'batch1',value:'PRIVATE1',path:'/child'}, {name:'batch2',value:'PRIVATE2',path:'/other'}]};
  await assert.rejects(f.call(operation,args),reject('E_USER_GESTURE_REQUIRED'));
  await assert.rejects(f.confirm(operation,args),reject('E_SITE_GRANT_REQUIRED'));
  await f.grant('write');
  const ref=(await f.confirm(operation,args)).approvalRef;
  assert.deepEqual(await f.call(operation,args,ref),{saved:2,verified:2,results:[
    {index:0,saved:true,verified:true},{index:1,saved:true,verified:true}]});
  assert.equal(f.native.filter(x=>x==='set').length,2);
  await assert.rejects(f.call(operation,args,ref),reject('E_USER_GESTURE_REQUIRED'));
  for(const changed of [{...args,cookies:[...args.cookies].reverse()},
    {...args,cookies:[args.cookies[0],{...args.cookies[1],value:'ALTERED'}]},
    {...args,cookies:args.cookies.slice(0,1)}]){
    const pending=(await f.confirm(operation,args)).approvalRef;
    await assert.rejects(f.call(operation,changed,pending),reject('E_USER_GESTURE_REQUIRED'));
    await assert.rejects(f.call(operation,args,pending),reject('E_USER_GESTURE_REQUIRED'));
  }
  assert.equal(f.native.filter(x=>x==='set').length,2);
});

test('setMany installed Host rejects revoked grant, foreign sender and changed install identity',async()=>{
  const f=fixture(),operation='browser.cookies.setMany',args={url,cookies:[{name:'batch',value:'PRIVATE'}]};
  await f.grant('write');
  const pending=(await f.confirm(operation,args)).approvalRef;
  await f.grant('write',false);
  await assert.rejects(f.call(operation,args,pending));
  await f.grant('write');
  const fresh=(await f.confirm(operation,args)).approvalRef;
  await assert.rejects(f.host.handleTool({...identity,operation,args,approvalRef:fresh},
    {...sender,id:'foreign-extension'}));
  await assert.rejects(f.call(operation,args,fresh,{...identity,installEpoch:'changed'}));
  assert.equal(f.native.filter(x=>x==='set').length,0);
});

test('setMany installed Host rechecks real website permission between native effects',async()=>{
  const f=fixture(),operation='browser.cookies.setMany',args={url,cookies:[
    {name:'first',value:'PRIVATE'}, {name:'unknown',value:'PRIVATE'}, {name:'unattempted',value:'PRIVATE'}]};
  await f.grant('write');
  const ref=(await f.confirm(operation,args)).approvalRef,set=f.api.cookies.set;let writes=0;
  f.api.cookies.set=(details,cb)=>set(details,row=>{
    if(++writes===2)f.state.hostAllowed=false;
    cb(row);
  });
  const result=await f.call(operation,args,ref);
  assert.deepEqual(result,{saved:1,verified:1,results:[{index:0,saved:true,verified:true},
    {index:1,saved:false,verified:false,code:'E_OUTCOME_UNKNOWN'}],stopped:true});
  assert.equal(writes,2);
  assert(!f.state.records.some(row=>row.name==='unattempted'));
});

test('cross-site skip policy skips only the exact slot and continues the approved batch',async()=>{
  const f=fixture(),operation='browser.cookies.setMany',destination='https://other.example.test';
  const contains=f.api.permissions.contains;
  f.api.permissions.contains=options=>options.origins?.includes(destination+'/*')?Promise.resolve(true):contains(options);
  const existing={...f.state.records[0],domain:'other.example.test',name:'conflict',value:'preserve'};
  f.state.records.push(existing);
  const args={url:destination+'/',skipConflicts:true,cookies:[
    {name:'conflict',path:'/',value:'do-not-overwrite',ifAbsent:true},
    {name:'conflict',path:'/different',value:'new',ifAbsent:true},
    {name:'later',path:'/',value:'new',ifAbsent:true}]};
  await f.grant('write');
  await assert.rejects(f.confirm(operation,{...args,cookies:[{...args.cookies[0],ifAbsent:false}]},
    {cookieImportSource:origin,document:f.document}),reject('E_SCHEMA'));
  const {approvalRef}=await f.confirm(operation,args,{cookieImportSource:origin,document:f.document});
  assert.deepEqual(await f.call(operation,args,approvalRef),{saved:2,verified:2,results:[
    {index:0,saved:false,verified:false,skipped:true,code:'E_COOKIE_CONFLICT'},
    {index:1,saved:true,verified:true},{index:2,saved:true,verified:true}]});
  assert.ok(f.state.records.includes(existing));
  assert.equal(f.native.filter(event=>event==='set').length,2);
});

test('a queued import row that expires after approval cannot delete the existing slot',async t=>{
  const f=fixture(),operation='browser.cookies.setMany';
  let now=Date.now();t.mock.method(Date,'now',()=>now);
  const args={url,cookies:[{name:'new',value:'fixture'},
    {name:'sid',value:'past',path:'/',expirationDate:now/1000+1},
    {name:'later',value:'fixture'}]};
  const existing=f.state.records[0];
  await f.grant('write');
  const {approvalRef}=await f.confirm(operation,args),set=f.api.cookies.set;
  f.api.cookies.set=(details,callback)=>set(details,result=>{now+=1500;callback(result);});
  assert.deepEqual(await f.call(operation,args,approvalRef),{saved:1,verified:1,stopped:true,results:[
    {index:0,saved:true,verified:true},{index:1,saved:false,verified:false,code:'E_COOKIE_EXPIRED'}]});
  assert.ok(f.state.records.includes(existing));
  assert.equal(f.native.filter(event=>event==='set').length,1);
});

test('trusted import approval expires even if source document checks stall before minting',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.now()});
  const f=fixture(),operation='browser.cookies.setMany',args={url,cookies:[{name:'queued',value:'fixture'}]};
  const context={cookieImportSource:origin,document:f.document};
  await f.grant('write');
  const getFrame=f.api.webNavigation.getFrame;
  let release,checking;
  const started=new Promise(resolve=>{checking=resolve;});
  f.api.webNavigation.getFrame=async options=>{
    await new Promise(resolve=>{release=resolve;checking();});
    return getFrame(options);
  };
  const receipt=assert.rejects(f.confirm(operation,args,context),reject('E_COOKIE_BATCH_EXPIRED'));
  await started;
  t.mock.timers.tick(15000);
  await receipt;
  f.api.webNavigation.getFrame=getFrame;
  // Neither the original approval nor its stalled read holds the lock now.
  const next=await f.confirm(operation,args,context);
  release();
  assert.equal(f.native.filter(x=>x==='set').length,0);
  assert.equal((await f.call(operation,args,next.approvalRef)).verified,1);
});

test('a trusted import approval spends part of the original dispatch budget',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.now()});
  const f=fixture(),operation='browser.cookies.setMany',args={url,cookies:[{name:'queued',value:'fixture'}]};
  const context={cookieImportSource:origin,document:f.document};
  await f.grant('write');
  const getFrame=f.api.webNavigation.getFrame,start=Date.now();
  let delayed=false;
  f.api.webNavigation.getFrame=async options=>{
    if(!delayed){delayed=true;t.mock.timers.tick(5000);}
    return getFrame(options);
  };
  const approval=await f.confirm(operation,args,context);
  assert.equal(approval.expiresAt,start+15000);
  t.mock.timers.tick(10000);
  await assert.rejects(f.call(operation,args,approval.approvalRef),reject('E_COOKIE_BATCH_EXPIRED'));
  assert.equal(f.native.filter(x=>x==='set').length,0);
});

test('trusted approval cannot extend the original panel deadline',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.now()});
  const f=fixture(),operation='browser.cookies.setMany',args={url,cookies:[{name:'queued',value:'fixture'}]};
  const context={cookieImportSource:origin,document:f.document},start=Date.now();
  await f.grant('write');
  for(const cookieImportDeadlineAt of [undefined,start,start-1])
    await assert.rejects(f.confirm(operation,args,{...context,cookieImportDeadlineAt}),reject('E_COOKIE_BATCH_EXPIRED'));
  const approval=await f.confirm(operation,args,{...context,cookieImportDeadlineAt:start+100});
  assert.equal(approval.expiresAt,start+100);
  const capped=await f.confirm(operation,args,{...context,cookieImportDeadlineAt:start+120000});
  assert.equal(capped.expiresAt,start+15000);
  t.mock.timers.tick(100);
  await assert.rejects(f.call(operation,args,approval.approvalRef),reject('E_COOKIE_BATCH_EXPIRED'));
  assert.equal(f.native.filter(x=>x==='set').length,0);
});

test('real installed STOP fences the next row while preserving an already dispatched receipt',async()=>{
  const stopKey=sidebarToolStopLock(identity.toolId,identity.installEpoch);
  const held=Promise.withResolvers();
  const locks={request(key,options,work=options){
    if(key===stopKey&&typeof options==='function')return navigator.locks.request(key,lock=>{
      held.resolve();return work(lock);
    });
    return navigator.locks.request(key,options,...(options===work?[]:[work]));
  }};
  const f=fixture({locks}),operation='browser.cookies.setMany';
  const args={url,cookies:[{name:'dispatched',value:'fixture'},{name:'not-run',value:'fixture'}]};
  await f.grant('write');
  const {approvalRef}=await f.confirm(operation,args,{cookieImportSource:origin,document:f.document});
  const entered=Promise.withResolvers(),nativeSet=f.api.cookies.set;
  f.api.cookies.set=(row,callback)=>nativeSet(row,result=>entered.resolve(()=>callback(result)));
  const receipt=f.call(operation,args,approvalRef);
  const release=await entered.promise;
  const stop=setInstalledSidebarToolEnabled({api:f.api,lockManager:locks,tool:cookiePkg,enabled:false,
    expectedEpoch:null,expectedEnabled:true});
  await held.promise;
  release();
  assert.deepEqual(await receipt,{saved:1,verified:1,stopped:true,results:[
    {index:0,saved:true,verified:true},{index:1,saved:false,verified:false,code:'E_TOOL_DISABLED'}]});
  assert.deepEqual(await stop,{enabled:false});
  assert.equal(f.native.filter(x=>x==='set').length,1);
  assert.ok(!f.state.records.some(row=>row.name==='not-run'));
});

for(const [label,decision,caller,code] of [
  ['source',{origin},sender,'E_GRANT_REVOKED'],
  ['unrelated site',{origin:'https://other.example.test'},sender,null],
  ['untrusted sender',{origin},{...sender,frameId:1},null],
  ['different package',{origin,packageHash:'0'.repeat(64)},sender,null],
])test('pending site revoke only fences a matching trusted source: '+label,async()=>{
  const f=fixture(),operation='browser.cookies.setMany';
  const args={url,cookies:[{name:'first',value:'fixture'},{name:'second',value:'fixture'}]};
  await f.grant('write');
  const {approvalRef}=await f.confirm(operation,args,{cookieImportSource:origin,document:f.document});
  const entered=Promise.withResolvers(),nativeSet=f.api.cookies.set;
  f.api.cookies.set=(row,callback)=>nativeSet(row,result=>row.name==='first'?
    entered.resolve(()=>callback(result)):callback(result));
  const receipt=f.call(operation,args,approvalRef);
  const release=await entered.promise;
  const revoke=f.host.handleHost({operation:'browser.cookies.userGrant',...identity,
    cookieCapability:'write',enabled:false,...decision},caller);
  const settled=revoke.catch(error=>error);
  release();
  if(code)assert.deepEqual(await receipt,{saved:1,verified:1,stopped:true,results:[
    {index:0,saved:true,verified:true},{index:1,saved:false,verified:false,code}]});
  else assert.equal((await receipt).verified,2);
  assert.equal((await settled).code,label==='untrusted sender'?'E_OWNER':label==='different package'?'E_TOOL_CHANGED':undefined);
  assert.equal(f.native.filter(x=>x==='set').length,code?1:2);
});

test('trusted import admission expires without dispatch while its source document check is pending',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.now()});
  const f=fixture(),operation='browser.cookies.setMany',args={url,cookies:[{name:'fixture',value:'fixture'}]};
  await f.grant('write');
  const {approvalRef}=await f.confirm(operation,args,{cookieImportSource:origin,document:f.document});
  const getFrame=f.api.webNavigation.getFrame;
  let release,checking;
  const started=new Promise(resolve=>{checking=resolve;});
  f.api.webNavigation.getFrame=async options=>{
    await new Promise(resolve=>{release=resolve;checking();});
    return getFrame(options);
  };
  const receipt=assert.rejects(f.call(operation,args,approvalRef),reject('E_COOKIE_BATCH_EXPIRED'));
  await started;
  t.mock.timers.tick(15000);
  await receipt;
  f.api.webNavigation.getFrame=getFrame;
  const next=(await f.confirm(operation,args,{cookieImportSource:origin,document:f.document})).approvalRef;
  release();
  await assert.rejects(f.call(operation,args,approvalRef),reject('E_USER_GESTURE_REQUIRED'));
  assert.equal(f.native.filter(x=>x==='set').length,0);
  assert.equal((await f.call(operation,args,next)).verified,1);
});

test('a trusted import cancels catalog lock acquisition and cannot write after its expiry',async t=>{
  t.mock.timers.enable({apis:['setTimeout','Date'],now:Date.now()});
  let queued,release,aborted=false;
  const entered=new Promise(resolve=>{queued=resolve;});
  const locks={request:async (key,options,work=options)=>{
    if(key==='opendesk.sidebar-tools:catalog'&&release===null)
      await new Promise((resolve,reject)=>{
        release=resolve;queued();
        options.signal.addEventListener('abort',()=>{aborted=true;reject(options.signal.reason);},{once:true});
      });
    return work({name:key});
  }};
  const f=fixture({locks}),operation='browser.cookies.setMany',args={url,cookies:[{name:'queued',value:'fixture'}]};
  const context={cookieImportSource:origin,document:f.document};
  await f.grant('write');
  const {approvalRef}=await f.confirm(operation,args,context);
  release=null;
  const receipt=assert.rejects(f.call(operation,args,approvalRef),reject('E_COOKIE_BATCH_EXPIRED'));
  await entered;
  t.mock.timers.tick(15000);
  t.mock.timers.setTime(Date.now()-60000);
  await receipt;
  assert.equal(aborted,true);
  const next=(await f.confirm(operation,args,context)).approvalRef;
  release();
  assert.equal((await f.call(operation,args,next)).verified,1);
  assert.equal(f.native.filter(x=>x==='set').length,1);
});

for(const [label,change,code] of [
  ['navigation',f=>f.host.noteNavigation(f.document.tabId),'E_DOCUMENT_CHANGED'],
  ['tab switch',f=>f.host.noteActiveTab(f.document.tabId+1,f.document.windowId),'E_DOCUMENT_CHANGED'],
  ['permission removal',f=>f.host.revokeBrowserOperations(),'E_GRANT_REVOKED']
])test('trusted import fences '+label+' during an in-flight permission check',async()=>{
  const f=fixture(),operation='browser.cookies.setMany';
  const args={url,cookies:[{name:'first',value:'fixture'},{name:'not-run',value:'fixture'}]};
  await f.grant('write');
  const {approvalRef}=await f.confirm(operation,args,{cookieImportSource:origin,document:f.document});
  let sites=0,release,entered;
  const checking=new Promise(resolve=>{entered=resolve;});
  const contains=f.api.permissions.contains;
  f.api.permissions.contains=async query=>{
    const allowed=await contains(query);
    if(query.origins&&++sites===2)await new Promise(resolve=>{release=resolve;entered();});
    return allowed;
  };
  const receipt=f.call(operation,args,approvalRef);
  await checking;
  change(f);
  release();
  assert.deepEqual(await receipt,{saved:0,verified:0,stopped:true,results:[
    {index:0,saved:false,verified:false,code}]});
  assert.equal(f.native.filter(method=>method==='set').length,0);
});

test('setMany stops on a same-version package change after a native write',async()=>{
  const f=fixture(),operation='browser.cookies.setMany',store='opendesk.sidebar-tools.installed.v1';
  f.local.set(store,structuredClone(f.local.get(store)));
  const args={url,cookies:[
    {name:'confirmed',value:'fixture'}, {name:'unknown',value:'fixture'}, {name:'unattempted',value:'fixture'}]};
  await f.grant('write');
  const {approvalRef}=await f.confirm(operation,args),set=f.api.cookies.set;
  let writes=0;
  f.api.cookies.set=(details,cb)=>set(details,row=>{
    // The installed bytes alone change, invalidating the old package proof.
    if(++writes===2)f.local.get(store)[0].js+='\n/* changed fixture */';
    cb(row);
  });
  assert.deepEqual(await f.call(operation,args,approvalRef),{saved:1,verified:1,stopped:true,results:[
    {index:0,saved:true,verified:true},
    {index:1,saved:false,verified:false,code:'E_OUTCOME_UNKNOWN'}]});
  assert.equal(writes,2);
  assert(!f.state.records.some(row=>row.name==='unattempted'));
  await assert.rejects(f.call(operation,args,approvalRef),reject('E_TOOL_CHANGED'));
  assert.equal(writes,2);
});

test('Cookie Editor import reads package bytes at locked admission and checks live site authority at each boundary',async()=>{
  const f=fixture(),operation='browser.cookies.setMany';
  const destination='https://other.example.test',pattern=destination+'/*';
  const args={url:destination+'/',cookies:Array.from({length:30},(_,i)=>({name:'synthetic_'+i,value:'fixture'}))};
  const contains=f.api.permissions.contains,get=f.api.storage.local.get;
  let installationReads=0,authorityReads=0,destinationChecks=0,destinationAllowed=true;
  f.api.storage.local.get=async keys=>{
    if(keys.includes(SIDEBAR_TOOL_STORE))installationReads++;
    if(keys.includes(TOOL_REVOCATION_EPOCHS_STORE))authorityReads++;
    return get(keys);
  };
  f.api.permissions.contains=async options=>{
    if(options.origins?.includes(pattern)){destinationChecks++;return destinationAllowed;}
    return contains(options);
  };
  await f.grant('write');
  const confirm=()=>f.confirm(operation,args,{cookieImportSource:origin,document:f.document});
  const {approvalRef}=await confirm();
  installationReads=0;authorityReads=0;destinationChecks=0;
  const receipt=await f.call(operation,args,approvalRef);
  const rows=args.cookies.length;
  assert.equal(receipt.verified,rows);
  assert.equal(f.native.filter(event=>event==='getAll').length,rows);
  assert.equal(installationReads,1,'Package bytes are stable inside the shared installation locks');
  assert.equal(authorityReads,rows*3+1,'Enable, grant and epoch remain live at every boundary');
  assert.ok(destinationChecks>=rows*3&&destinationChecks<=rows*3+1,
    'The distinct destination still requires Chrome access at each boundary; got '+destinationChecks);

  const next=await confirm(),set=f.api.cookies.set;let writes=0;
  f.api.cookies.set=(details,callback)=>set(details,row=>{
    if(++writes===2)destinationAllowed=false;
    callback(row);
  });
  assert.deepEqual(await f.call(operation,args,next.approvalRef),{saved:1,verified:1,results:[
    {index:0,saved:true,verified:true},
    {index:1,saved:false,verified:false,code:'E_OUTCOME_UNKNOWN'}],stopped:true});
  assert.equal(writes,2);
});

test('installed package changes serialize with import and invalidate the next approval',async()=>{
  const tails=new Map();
  const locks={request(key,options,work=options){
    const result=(tails.get(key)??Promise.resolve()).then(()=>work({name:key}));
    tails.set(key,result.catch(()=>{}));
    return result;
  }};
  const f=fixture({locks}),operation='browser.cookies.setMany';
  const args={url,cookies:[{name:'first',value:'fixture'},{name:'second',value:'fixture'}]};
  const scope={cookieImportSource:origin,document:f.document};
  await f.grant('write');
  const first=(await f.confirm(operation,args,scope)).approvalRef;
  const stale=(await f.confirm(operation,args,scope)).approvalRef;
  const set=f.api.cookies.set;
  let replacement,complete=false;
  f.api.cookies.set=(details,callback)=>set(details,row=>{
    assert.equal(complete,false,'Package writer must wait until native readback and receipt');
    replacement??=locks.request('opendesk.sidebar-tools:tool:'+identity.toolId,()=>
      locks.request('opendesk.sidebar-tools:catalog',async()=>{
        await f.api.storage.local.set({[SIDEBAR_TOOL_STORE]:[{...cookiePkg,js:'/* replacement */'}]});
        complete=true;
      }));
    callback(row);
  });
  assert.equal((await f.call(operation,args,first)).verified,2);
  await replacement;
  await assert.rejects(f.call(operation,args,stale),reject('E_TOOL_CHANGED'));
  assert.equal(f.native.filter(method=>method==='set').length,2);
});


const appSender=(overrides={})=>({...sender,
  url:'chrome-extension://cookie-host-test/app.html?toolId=cookie-editor&hostInstanceId='+uid,
  tab:{id:20,windowId:3,incognito:false},...overrides});

test('installed app Host uses the same SDK dispatch and grant path as Side Panel',async()=>{
  const f=fixture({sender:appSender()});
  await assert.rejects(f.call('browser.cookies.getAll',{url}),reject('E_SITE_GRANT_REQUIRED'));
  await f.grant('read');
  const rows=await f.call('browser.cookies.getAll',{url});
  assert.equal(rows.length,1);assert.equal(rows[0].valueRedacted,true);
  await f.grant('read',false);
  const before=[...f.native];
  await assert.rejects(f.call('browser.cookies.getAll',{url}),reject('E_SITE_GRANT_REQUIRED'));
  assert.deepEqual(f.native,before);
});

for(const [label,overrides] of [
  ['foreign extension',{id:'foreign-extension'}],
  ['foreign URL',{url:'chrome-extension://foreign-extension/app.html?toolId=cookie-editor&hostInstanceId='+uid}],
  ['subframe',{frameId:1}],['missing top-frame identity',{frameId:undefined}],
  ['missing document',{documentId:undefined}],
  ['inactive document',{documentLifecycle:'cached'}],['missing tab',{tab:undefined}],
  ['invalid tab',{tab:{id:-1}}],['incognito tab',{tab:{id:20,incognito:true}}],
  ['unapproved path',{url:'chrome-extension://cookie-host-test/other.html?hostInstanceId='+uid}],
  ['duplicate host identity',{url:'chrome-extension://cookie-host-test/app.html?toolId=cookie-editor&hostInstanceId='+uid+'&hostInstanceId='+uid}],
  ['missing app tool locator',{url:'chrome-extension://cookie-host-test/app.html?hostInstanceId='+uid}],
  ['unexpected query',{url:'chrome-extension://cookie-host-test/app.html?toolId=cookie-editor&hostInstanceId='+uid+'&extra=1'}],
  ['fragment',{url:'chrome-extension://cookie-host-test/app.html?toolId=cookie-editor&hostInstanceId='+uid+'#extra'}],
  ['non-UUID host identity',{url:'chrome-extension://cookie-host-test/app.html?toolId=cookie-editor&hostInstanceId='+ '-'.repeat(36)}],
  ['invalid UUID version',{url:'chrome-extension://cookie-host-test/app.html?toolId=cookie-editor&hostInstanceId=01234567-89ab-adef-8123-456789abcdef'}],
  ['invalid UUID variant',{url:'chrome-extension://cookie-host-test/app.html?toolId=cookie-editor&hostInstanceId=01234567-89ab-4def-0123-456789abcdef'}],
  ['different host identity',{url:'chrome-extension://cookie-host-test/app.html?toolId=cookie-editor&hostInstanceId=11234567-89ab-4def-8123-456789abcdef'}]
])test('installed app Host rejects '+label+' before native access',async()=>{
  const f=fixture({sender:appSender(overrides)});
  await assert.rejects(f.call('browser.cookies.getAll',{url}),reject('E_OWNER'));
  await assert.rejects(f.grant('read'),reject('E_OWNER'));
  assert.deepEqual(f.native,[]);
});

test('installed app Host preserves package version/hash, install epoch and disable revocation',async()=>{
  const f=fixture({sender:appSender()});await f.grant('read');
  const before=[...f.native];
  for(const changed of [{toolVersion:'9.0.0'},{packageHash:'0'.repeat(64)},{installEpoch:'revoked'}])
    await assert.rejects(f.call('browser.cookies.getAll',{url},undefined,{...identity,...changed}),reject('E_TOOL_CHANGED'));
  await f.api.storage.local.set({[TOOL_REVOCATION_EPOCHS_STORE]:{[cookiePkg.id]:'new-install-epoch'}});
  await assert.rejects(f.call('browser.cookies.getAll',{url}),reject('E_TOOL_CHANGED'));
  await f.api.storage.local.set({[TOOL_REVOCATION_EPOCHS_STORE]:{}});
  await f.api.storage.local.set({[SIDEBAR_TOOL_ENABLE_STORE]:{[cookiePkg.id]:false}});
  await assert.rejects(f.call('browser.cookies.getAll',{url}),reject('E_TOOL_DISABLED'));
  assert.deepEqual(f.native,before);
});


test('installed app Host accepts the shared own-page view/section grammar',async()=>{
  const f=fixture({sender:appSender({url:appSender().url+'&view=settings&section=profiles'})});
  await f.grant('read');
  assert.equal((await f.call('browser.cookies.getAll',{url})).length,1);
});
