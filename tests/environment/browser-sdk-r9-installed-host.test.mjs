import test from 'node:test';
import assert from 'node:assert/strict';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {createContextMenuHost} from '../../src/platform/chrome/context-menus.js';
import {validateSidebarToolPackage,sidebarToolPackageHash} from '../../src/ui/sidebar-tools/package.js';

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

function fixture({sender:hostSender=sender,installedPackage=cookiePkg,installedIdentity=identity}={}){
  const local=new Map([['opendesk.sidebar-tools.installed.v1',[installedPackage]]]),session=new Map();
  const onStorage=[],native=[],listeners=[];
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
      for(const callback of onStorage)callback(changes,area);
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
  const locks={request:(_key,work)=>work()};
  const host=createContextMenuHost({api,lockManager:locks,logger:{warn(){}}});
  const grant=(capability,enabled=true)=>host.handleHost({
    operation:'browser.cookies.userGrant',...installedIdentity,cookieCapability:capability,enabled,
    origin,...(enabled?{document}:{})},hostSender);
  const confirm=(operation,args)=>host.handleHost({operation:'browser.intent.confirm',
    ...installedIdentity,targetOperation:operation,targetArgs:args},hostSender);
  const call=(operation,args={},approvalRef,as=installedIdentity)=>host.handleTool({
    ...as,operation,args,...(approvalRef?{approvalRef}:{})},hostSender);
  return {api,host,grant,call,confirm,state,native,local,document,sender:hostSender,identity:installedIdentity};
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
