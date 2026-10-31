import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {request} from 'node:http';
import {createCookieAccountService} from '../trusted/account-service.js';
import {presentCookieServiceState} from '../trusted/service-view.js';
import {COOKIE_ACCOUNT_PROTOCOL,COOKIE_ACCOUNT_STORE_KEY,COOKIE_SERVICE_FIELDS} from '../trusted/account-contract.js';
import {HistoryStore} from '../ai-account-usage/history-store.mjs';
import {ServiceBindingStore} from '../ai-account-usage/service-binding-store.mjs';
import {startManagementServer} from '../ai-account-usage/web-server.mjs';
import {createUsageNativeAdapter} from '../ai-account-usage/native-service-adapter.mjs';
import {SIDEBAR_TOOL_STORE,sidebarToolPackageHash,serializeSidebarToolPackage,validateSidebarToolPackage}
  from '../../../../src/ui/sidebar-tools/package.js';
import {TOOL_REVOCATION_EPOCHS_STORE} from '../../../../src/ui/sidebar-tools/lifecycle.js';
import {MARKET_PROVENANCE_STORE} from '../../../../src/sidebar-tools/official-reading-toc.js';
import {BROWSER_MENU_GRANTS_STORE} from '../../../../src/framework/sdk/browser-contract.js';

// Real fixed Cookie service → trusted consumer → real Node business adapter,
// private service store and HTTP management session. Only Chrome/Foundation and
// the not-yet-wired Go transport are substituted. Never native acceptance.
async function fixture(t,{loseBind=false,afterOpen=()=>{}}={}){
  const dir=await mkdtemp(join(tmpdir(),'cookie-service-core-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  for(const name of ['index.html','app.js','app.css'])await writeFile(join(dir,name),'fixture');
  const store=new HistoryStore({directory:join(dir,'history')});
  await store.register({alias:'remote_1',displayName:'Synthetic resource'});
  const bindingStore=new ServiceBindingStore({directory:join(dir,'bindings')});
  const server=await startManagementServer({store,bindingStore,assetsDirectory:dir,
    service:{query:async()=>assert.fail('No upstream queries in metadata workflow')}});
  t.after(()=>server.close());
  const nativeAdapter=createUsageNativeAdapter({server,store});
  t.after(()=>nativeAdapter.disconnectAll());
  const provider={serviceId:'ai-account-usage',serviceInstanceId:server.serviceBinding.serviceInstanceId,
    productName:'AI Account Usage',origin:new URL(server.url).origin,providerEpoch:'provider_1',
    capabilities:['usage:manual-binding','policy:metadata-state','management:resource-open']};
  const nativeCalls=[],tabs=[];
  const client={state:()=>({supported:true,connected:true,services:[provider]}),
    async request(input){nativeCalls.push(structuredClone(input));
      assert.equal(input.serviceId,provider.serviceId);assert.equal(input.providerEpoch,provider.providerEpoch);
      const result=await nativeAdapter({owner:input.owner,action:input.action,payload:input.payload});
      if(loseBind&&input.action==='bind')throw Object.assign(Error('lost response'),{outcome:'OUTCOME_UNKNOWN'});
      return result;
    }};
  const extensionId='a'.repeat(32),origin='https://shop.example.com';
  const tool=validateSidebarToolPackage({format:'opendesk.sidebar-tool.v2',id:'cookie-editor',
    version:'1.0.0',title:'Cookie Editor',description:'Isolated integration fixture',
    capabilities:['browser.cookies.read','browser.cookies.values','browser.cookies.write'],
    requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]},html:'<main></main>',css:'',js:'void 0;'});
  const bytes=Buffer.from(serializeSidebarToolPackage(tool)),hash=await sidebarToolPackageHash(tool);
  const release={id:'opendesk/cookie-editor',toolId:tool.id,kind:'sidebar-tool',installationPolicy:'optional',
    version:tool.version,packageTitle:tool.title,description:tool.description,capabilities:tool.capabilities,
    packagePath:'official-tools/cookie-editor/cookie-editor.opendesk-tool.json',bytes:bytes.length,
    sha256:createHash('sha256').update(bytes).digest('hex')};
  const originalFetch=globalThis.fetch;
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    if(new URL(url).protocol==='http:'&&new URL(url).hostname==='127.0.0.1')return originalFetch(url,options);
    assert.equal(url,'chrome-extension://'+extensionId+'/official-tools/catalog.json');
    return {ok:true,json:async()=>({schema:'opendesk.official-tools.releases.v1',
      sourceRepository:'https://github.com/shopable-ai/opendesk-browser',apps:[release]})};
  });
  const state={[SIDEBAR_TOOL_STORE]:[tool],[TOOL_REVOCATION_EPOCHS_STORE]:{'cookie-editor':'epoch_1'},
    [MARKET_PROVENANCE_STORE]:{'cookie-editor':{marketId:release.id,version:tool.version,sha256:release.sha256}},
    [BROWSER_MENU_GRANTS_STORE]:{'cookie-editor':{version:tool.version,packageHash:hash,installEpoch:'epoch_1',
      cookieSites:{[origin]:{read:true,values:true,write:true,grantEpoch:'grant_1',storeId:'0'}}}}};
  const records=new Map([[COOKIE_ACCOUNT_STORE_KEY,{format:1,revision:1,legacyMigrated:false,
    accounts:[{alias:'acct_local_1',origin,displayName:'Synthetic local',version:1,allowAuto:false,
      cookies:[{name:'sid',value:'SYNTHETIC_COOKIE_MUST_NOT_TRANSFER'}]}],
    settings:{autoEnabled:false,autoRefresh:true}}]]);
  let permitted=true,siteActive=true;
  const storage=async()=>({transaction:async(_tables,mode,work)=>{
    const next=structuredClone(records),result=await work({get:(_,k)=>structuredClone(next.get(k)),
      put:(_,v,k)=>next.set(k,structuredClone(v)),delete:(_,k)=>next.delete(k)});
    if(mode==='readwrite'){records.clear();for(const [k,v] of next)records.set(k,v);}return result;
  }});
  const document={tabId:1,documentId:'site_doc',url:origin+'/'};
  const sender={id:extensionId,url:'chrome-extension://'+extensionId+'/sidepanel.html?hostInstanceId=00000000-0000-4000-8000-000000000000&toolId=cookie-editor',
    documentId:'host_doc',frameId:0};
  const forbidden=()=>assert.fail('No Cookie values, Native startup, permission prompt or tab reload');
  const api={runtime:{id:extensionId,getURL:p=>'chrome-extension://'+extensionId+'/'+p,
    getContexts:async()=>[{contextType:'SIDE_PANEL',documentUrl:sender.url,documentId:sender.documentId,frameId:0,incognito:false}],
    connectNative:forbidden},
    storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys])
      .filter(k=>Object.hasOwn(state,k)).map(k=>[k,structuredClone(state[k])]))}},
    tabs:{get:async()=>({id:1,url:document.url,active:siteActive,incognito:false}),
      create:async input=>{tabs.push(input);siteActive=false;afterOpen({document,state});return {id:2};},reload:forbidden},
    webNavigation:{getFrame:async()=>({...document,documentLifecycle:'active'})},
    cookies:{getAll:forbidden,set:forbidden,remove:forbidden,
      getAllCookieStores:async()=>[{id:'0',tabIds:[1]}],
      getPartitionKey:async()=>({partitionKey:{topLevelSite:origin,hasCrossSiteAncestor:false}})},
    permissions:{contains:async()=>permitted,request:forbidden}};
  const service=createCookieAccountService({api,storage,serviceTransport:()=>client});
  let observedSessionRevision=0;
  const send=async(operation,payload={})=>{
    const result=await service.dispatch(structuredClone({protocol:COOKIE_ACCOUNT_PROTOCOL,toolId:'cookie-editor',operation,
      packageHash:hash,installEpoch:'epoch_1',trustedClick:true,payload:{origin,
        ...(COOKIE_SERVICE_FIELDS[operation]?.includes('sessionRevision')?{sessionRevision:observedSessionRevision}:{}),
        ...payload}}),structuredClone(sender));
    if(Number.isSafeInteger(result.sessionRevision))observedSessionRevision=result.sessionRevision;
    return presentCookieServiceState(result);
  };
  const http=(path,body,cookie)=>new Promise((resolve,reject)=>{
    const u=new URL(server.url),r=request({hostname:'127.0.0.1',port:u.port,path,method:body?'POST':'GET',
      headers:{host:u.host,origin:u.origin,...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})}},res=>{
      let text='';res.on('data',v=>text+=v);res.on('end',()=>resolve({status:res.statusCode,
        data:JSON.parse(text),cookie:res.headers['set-cookie']?.[0].split(';')[0]}));
    });r.on('error',reject);r.end(body?JSON.stringify(body):undefined);
  });
  return {send,state,records,document,origin,provider,tabs,nativeCalls,bindingStore,server,http,
    revokePermission:()=>{permitted=false;}};
}
async function ready(f){
  let state=await f.send('serviceSave',{revision:0,label:'本机',mode:'local',serviceOrigin:''});
  const connectionId=state.connections[0].id;
  state=await f.send('serviceConnect',{revision:state.revision,connectionId,serviceId:'ai-account-usage',providerEpoch:'provider_1'});
  assert.equal(state.connections[0].status,'CONNECTED');
  state=await f.send('serviceResources',{connectionId});
  assert.equal(state.connections[0].resources[0].remoteAccountId,'remote_1');
  state=await f.send('serviceAssociate',{revision:state.revision,connectionId,alias:'acct_local_1',accountVersion:1,
    remoteAccountId:'remote_1',organization:'本机用户',providerKey:'codex',document:f.document});
  return {state,connectionId,associationId:state.associations[0].id};
}
test('connection-only Native workflow does not depend on the Cookie account store',async t=>{
  const f=await fixture(t);
  f.records.set(COOKIE_ACCOUNT_STORE_KEY,null);
  let state=await f.send('serviceSave',{revision:0,label:'本机',mode:'local',serviceOrigin:''});
  const connectionId=state.connections[0].id;
  state=await f.send('serviceConnect',{revision:state.revision,connectionId,serviceId:'ai-account-usage',providerEpoch:'provider_1'});
  assert.equal(state.connections[0].status,'CONNECTED');
  state=await f.send('serviceResources',{connectionId});
  assert.equal(state.connections[0].resources[0].remoteAccountId,'remote_1');
  state=await f.send('serviceReadPolicy',{connectionId});
  assert.ok(state.connections[0].policy);
  state=await f.send('serviceOpenManagement',{revision:state.revision,connectionId,associationId:''});
  assert.equal(state.opened,true);
  assert.equal(f.tabs.length,1);
  assert.equal(new URL(f.tabs[0].url).pathname,'/opendesk/admin/sync');
  state=await f.send('serviceRemoteDisconnect',{revision:state.revision,connectionId});
  assert.equal(state.connections[0].status,'DISCONNECTED');
  assert.deepEqual(f.nativeCalls.map(call=>call.action),['connect','accounts','policy','open','disconnect']);
  assert.equal(f.records.get(COOKIE_ACCOUNT_STORE_KEY),null);
});
test('binding cannot bypass an unavailable Cookie account store',async t=>{
  const f=await fixture(t),{state,associationId}=await ready(f);
  f.records.set(COOKIE_ACCOUNT_STORE_KEY,null);
  const calls=f.nativeCalls.length;
  await assert.rejects(f.send('serviceCommitAssociation',{revision:state.revision,associationId,document:f.document}),{code:'E_VAULT_CORRUPT'});
  assert.equal(f.nativeCalls.length,calls);
});
test('fixed Cookie service binds real isolated resource, accepts a subset and consumes only scoped management open',async t=>{
  const f=await fixture(t);let {state,connectionId,associationId}=await ready(f);
  state=await f.send('serviceCommitAssociation',{revision:state.revision,associationId,document:f.document});
  const bindingId=state.associations[0].remoteBindingId;
  assert.equal(state.associations[0].status,'BOUND');assert.equal(state.associations[0].verification,'UNVERIFIED');
  const stored=(await f.bindingStore.read()).bindings[0];
  assert.equal(stored.localAccount.storeId,'0');assert.equal(stored.localAccount.partitionKey.topLevelSite,f.origin);
  const admin=await f.http('/session',{code:f.server.pairingCode});assert.equal(admin.status,200);
  const desiredScope={bindingIds:[bindingId],dataCategories:['ACCOUNT_METADATA','USAGE_SUMMARY'],trigger:'MANUAL',retentionDays:14};
  const desired=await f.http('/opendesk/admin/api/sync-policy',{deviceId:stored.deviceId,operationId:'desired_1',expectedRevision:0,scope:desiredScope},admin.cookie);
  assert.equal(desired.status,200);
  state=await f.send('serviceReadPolicy',{connectionId});
  const approved={...desiredScope,dataCategories:['ACCOUNT_METADATA'],retentionDays:7};
  state=await f.send('serviceAcceptPolicy',{revision:state.revision,connectionId,desiredRevision:desired.data.desiredRevision,
    desiredHash:desired.data.desiredHash,scope:approved});
  assert.deepEqual(state.connections[0].policy.acceptance.scope,approved);
  state=await f.send('serviceOpenManagement',{revision:state.revision,connectionId,associationId,document:f.document});
  assert.equal(state.opened,true);assert.equal(f.tabs.length,1);
  assert.doesNotMatch(JSON.stringify(state),/SYNTHETIC_COOKIE|#open=|secret|accessToken/);
  assert.doesNotMatch(JSON.stringify(f.nativeCalls),/SYNTHETIC_COOKIE|pairingCode|accessToken/);
  const u=new URL(f.tabs[0].url);assert.equal(u.origin,f.provider.origin);assert.equal(u.pathname,'/opendesk/admin/accounts/remote_1');
  const opened=await f.http('/opendesk/open-session',{code:new URLSearchParams(u.hash.slice(1)).get('open')});
  assert.equal(opened.status,200);
  assert.equal((await f.http('/api/v1/accounts/remote_1',undefined,opened.cookie)).status,200);
  assert.deepEqual((await f.http('/api/v1/accounts',undefined,opened.cookie)).data.accounts.map(a=>a.alias),['remote_1']);
  assert.equal((await f.http('/opendesk/admin/api/devices',undefined,opened.cookie)).status,403);
  state=await f.send('serviceUnbindAssociation',{revision:state.revision,associationId});
  assert.notEqual(state.associations[0].status,'BOUND');
  state=await f.send('serviceRemoveAssociation',{revision:state.revision,associationId});assert.equal(state.associations.length,0);
  state=await f.send('serviceRemoteDisconnect',{revision:state.revision,connectionId});
  assert.equal(state.connections[0].status,'DISCONNECTED');
  state=await f.send('serviceConnect',{revision:state.revision,connectionId,serviceId:'ai-account-usage',providerEpoch:'provider_1'});
  assert.equal(state.connections[0].status,'CONNECTED');
  const connects=f.nativeCalls.filter(c=>c.action==='connect');
  assert.equal(connects.length,2);assert.notEqual(connects[0].payload.connectionId,connects[1].payload.connectionId);
  assert.notEqual(connects[0].payload.operationId,connects[1].payload.operationId);
  assert.equal((await f.bindingStore.read()).devices.length,2);
});
test('lost real bind uses original receipt and never repeats the mutation',async t=>{
  const f=await fixture(t,{loseBind:true});const {state,associationId,connectionId}=await ready(f);
  const payload={revision:state.revision,associationId,document:f.document};
  await assert.rejects(f.send('serviceCommitAssociation',payload),{code:'E_OUTCOME_UNKNOWN'});
  await assert.rejects(f.send('serviceCommitAssociation',payload),{code:'E_SERVICE_CONFLICT'});
  const result=await f.send('serviceReconcile',{connectionId});assert.equal(result.associations[0].status,'BOUND');
  assert.equal(f.nativeCalls.filter(c=>c.action==='bind').length,1);
  assert.equal((await f.bindingStore.read()).bindings.length,1);
});
test('revoked live site permission blocks binding before Native dispatch',async t=>{
  const f=await fixture(t);const {state,associationId}=await ready(f);f.revokePermission();
  await assert.rejects(f.send('serviceCommitAssociation',{revision:state.revision,associationId,document:f.document}),{code:'E_SITE_GRANT_REQUIRED'});
  assert.equal(f.nativeCalls.filter(c=>c.action==='bind').length,0);
  assert.equal((await f.bindingStore.read()).bindings.length,0);
});
test('original fixed service rejects pre-reconnect confirmation before a new binding dispatch',async t=>{
  const f=await fixture(t);let {state,associationId,connectionId}=await ready(f);
  const stale={revision:state.revision,sessionRevision:state.sessionRevision,associationId,document:f.document};
  state=await f.send('serviceRemoteDisconnect',{revision:state.revision,connectionId});
  state=await f.send('serviceConnect',{revision:state.revision,connectionId,serviceId:'ai-account-usage',providerEpoch:'provider_1'});
  state=await f.send('serviceResources',{connectionId});
  await assert.rejects(f.send('serviceCommitAssociation',stale),{code:'E_SERVICE_CONFLICT'});
  assert.equal(f.nativeCalls.filter(c=>c.action==='bind').length,0);
  assert.equal((await f.bindingStore.read()).bindings.length,0);
  state=await f.send('serviceCommitAssociation',{revision:state.revision,associationId,document:f.document});
  assert.equal(state.associations[0].status,'BOUND');
});
for(const change of ['document','installation'])test('foreground open still rejects post-handoff '+change+' changes',async t=>{
  const f=await fixture(t,{afterOpen:({document,state})=>{
    if(change==='document')document.documentId='navigated_doc';
    else state[TOOL_REVOCATION_EPOCHS_STORE]['cookie-editor']='new_epoch';
  }});
  let {state,associationId,connectionId}=await ready(f);
  state=await f.send('serviceCommitAssociation',{revision:state.revision,associationId,document:f.document});
  await assert.rejects(f.send('serviceOpenManagement',{revision:state.revision,connectionId,associationId,document:f.document}),{code:'E_OUTCOME_UNKNOWN'});
  assert.equal(f.tabs.length,1);assert.equal(f.nativeCalls.filter(c=>c.action==='open').length,1);
});
