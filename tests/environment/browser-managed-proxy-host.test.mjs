import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createBrowserManagedProxy,MANAGED_PROXY_STORE,reconcileManagedProxy}
  from '../../src/platform/chrome/browser-managed-proxy.js';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';
import {createContextMenuHost} from '../../src/platform/chrome/context-menus.js';
import {BROWSER_MENU_GRANTS_STORE} from '../../src/framework/sdk/browser-contract.js';
import {requestManagedProxyIntent} from '../../src/ui/sidebar-tools/managed-proxy-consent.js';
import {SIDEBAR_TOOL_STORE,sidebarToolPackageHash,validateSidebarToolPackage}
  from '../../src/ui/sidebar-tools/package.js';
import {TOOL_REVOCATION_EPOCHS_STORE,SIDEBAR_TOOL_ENABLE_STORE}
  from '../../src/ui/sidebar-tools/lifecycle.js';

// Real Registry/Facade, installed-tool Host and production Driver, with
// simulated Chrome APIs only. Not proof of native Chrome or network traffic.
const extensionId='a'.repeat(32),hostInstanceId=randomUUID(),toolInstance=randomUUID();
const sender={id:extensionId,frameId:0,documentLifecycle:'active',documentId:'proxy-host-doc',
  url:'chrome-extension://'+extensionId+'/sidepanel.html?hostInstanceId='+hostInstanceId};
const config={config:{endpoint:{scheme:'socks5',host:'proxy.example.com',port:1080},
  domains:['chatgpt.com','claude.ai']}};
const code=value=>error=>error?.code===value;
const packageFor=(id,caps=['browser.proxy.managed'])=>validateSidebarToolPackage({
  format:'opendesk.sidebar-tool.v2',id,version:'1.0.0',
  title:'Managed Proxy '+id,description:'Test only',capabilities:caps,
  html:'<main>fixture</main>',css:'',js:'void 0;',
  requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]}});
async function fixture(){
  const first=packageFor('proxy-owner'),second=packageFor('proxy-peer');
  const data=new Map([[SIDEBAR_TOOL_STORE,[first,second]],
    [TOOL_REVOCATION_EPOCHS_STORE,{[first.id]:'epoch-1',[second.id]:'epoch-1'}],
    [SIDEBAR_TOOL_ENABLE_STORE,{[first.id]:true,[second.id]:true}]]);
  const clone=x=>x===undefined?undefined:structuredClone(x);
  const storage={
    async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys])
      .filter(x=>data.has(x)).map(x=>[x,clone(data.get(x))]));},
    async set(obj){for(const [k,v] of Object.entries(obj))data.set(k,clone(v));},
    async remove(key){data.delete(key)}
  };
  let level='controllable_by_this_extension',value=null,proxyPermission=true;
  const effects={set:0,clear:0};
  const api={runtime:{id:extensionId,
      getURL:p=>'chrome-extension://'+extensionId+'/'+p,
      getContexts:async()=>[{contextType:'SIDE_PANEL',documentId:sender.documentId,
        documentUrl:sender.url,frameId:0,incognito:false}]},
    storage:{local:storage,session:storage,onChanged:{addListener(){}}},
    permissions:{contains:async({permissions})=>!permissions||permissions.every(x=>x==='proxy'&&proxyPermission)},
    alarms:{create:async()=>{},clear:async()=>true},
    proxy:{settings:{
      get:async()=>({levelOfControl:level,value:clone(value)}),
      set:async row=>{assert.equal(row.scope,'regular');effects.set++;
        value=clone(row.value);level='controlled_by_this_extension';},
      clear:async row=>{assert.equal(row.scope,'regular');effects.clear++;
        level='controllable_by_this_extension';value=null;}
    }},tabs:{},webNavigation:{}};
  const locks={request:(_name,work)=>work()};
  const host=createContextMenuHost({api,lockManager:locks,
    logger:{warn(){}},reviewedProxyProfiles:[]});
  async function user(id,patch={}){
    const tool=id==='proxy-owner'?first:second;
    const identity={toolId:id,toolVersion:tool.version,packageHash:await sidebarToolPackageHash(tool),
      installEpoch:'epoch-1',hostInstanceId,toolInstance};
    let approvalRef;
    return {
      identity,
      sdk:createBrowserSdk({request:(operation,args)=>host.handleTool(
        {...identity,operation,args,...(approvalRef?{approvalRef}:{})},sender)}),
      async approve(operation,args={},options={}){
        const data=await host.handleHost({...identity,operation:'browser.intent.confirm',
          targetOperation:operation,targetArgs:args,...options},sender);
        approvalRef=data.approvalRef;
        return approvalRef;
      },clearApproval(){approvalRef=undefined;}
    };
  }
  return {first,second,data,host,user,effects,api,locks,
    setProxyPermission:next=>{proxyPermission=next;}};
}
test('remembered exact proxy consent reuses review while issuing fresh one-use intents',async()=>{
  const f=await fixture(),actor=await f.user('proxy-owner');
  const operation='browser.proxy.managed.requestEnable';
  await assert.rejects(actor.approve(operation,config,{proxyConsent:'reuse'}),code('E_PROXY_CONSENT_REQUIRED'));
  await actor.approve(operation,config,{proxyConsent:'remember'});
  assert.equal((await actor.sdk.proxy.managed.requestEnable(config)).state,'enabled');
  await actor.approve('browser.proxy.managed.requestDisable');
  await actor.sdk.proxy.managed.requestDisable();
  const second=await actor.approve(operation,config,{proxyConsent:'reuse'});
  assert.equal((await actor.sdk.proxy.managed.requestEnable(config)).state,'enabled');
  await assert.rejects(actor.sdk.proxy.managed.requestEnable(config),code('E_USER_GESTURE_REQUIRED'));
  assert.equal(typeof second,'string');assert.equal(f.effects.set,2);
  const peer=await f.user('proxy-peer');
  await assert.rejects(peer.approve(operation,config,{proxyConsent:'reuse'}),code('E_PROXY_CONSENT_REQUIRED'));
  for(const changed of [{mode:'direct'},{...config.config,domains:['example.org']},
    {...config.config,endpoint:{...config.config.endpoint,port:1081}}])
    await assert.rejects(actor.approve(operation,{config:changed},{proxyConsent:'reuse'}),code('E_PROXY_CONSENT_REQUIRED'));
});

test('revoking remembered proxy consent retires pending enable and releases only its owned PAC',async()=>{
  const f=await fixture(),actor=await f.user('proxy-owner'),operation='browser.proxy.managed.requestEnable';
  await actor.approve(operation,config,{proxyConsent:'remember'});
  await actor.sdk.proxy.managed.requestEnable(config);
  const stale=await actor.approve(operation,config,{proxyConsent:'reuse'});
  await f.host.handleHost({...actor.identity,operation:'browser.proxy.managed.revokeConsent'},sender);
  assert.equal(f.effects.clear,1);
  await assert.rejects(f.host.handleTool({...actor.identity,operation,args:config,approvalRef:stale},sender));
  await assert.rejects(actor.approve(operation,config,{proxyConsent:'reuse'}),code('E_PROXY_CONSENT_REQUIRED'));
  assert.equal(f.effects.set,1);
});

test('remembering a route preserves independently bound menu restrictions without rebinding stale grants',async()=>{
  const f=await fixture(),actor=await f.user('proxy-owner');
  const contextMenu={version:actor.identity.toolVersion,packageHash:actor.identity.packageHash,
    installEpoch:'epoch-1',defaults:false,origins:[],activeActions:[],disabledOrigins:['https://example.com']};
  for(const old of [{contextMenu},{version:'0.0.0',packageHash:'stale',installEpoch:'old',
    bookmarkFull:true,cookieSites:{'https://example.com':{read:true}},contextMenu},
    {contextMenu:{...contextMenu,version:'0.9.0',packageHash:'interrupted-update'}}]){
    f.data.set(BROWSER_MENU_GRANTS_STORE,{[f.first.id]:old});
    await actor.approve('browser.proxy.managed.requestEnable',config,{proxyConsent:'remember'});
    const saved=f.data.get(BROWSER_MENU_GRANTS_STORE)[f.first.id];
    assert.deepEqual(saved.contextMenu,old.contextMenu);
    assert.equal(saved.bookmarkFull,undefined);assert.equal(saved.cookieSites,undefined);
  }
});

test('remembered proxy consent is rechecked inside Driver before a native write',async()=>{
  const f=await fixture(),actor=await f.user('proxy-owner'),operation='browser.proxy.managed.requestEnable';
  await actor.approve(operation,config,{proxyConsent:'remember'});
  const original=f.api.storage.local.set;
  f.api.storage.local.set=async values=>{
    await original(values);
    if(values[MANAGED_PROXY_STORE]?.phase==='applying')f.data.delete(BROWSER_MENU_GRANTS_STORE);
  };
  await assert.rejects(actor.sdk.proxy.managed.requestEnable(config),code('E_PROXY_CONSENT_REQUIRED'));
  assert.equal(f.effects.set,0);
});

test('real UI to Host and Driver applies, stops and reapplies with only the initial route review',async()=>{
  const f=await fixture(),actor=await f.user('proxy-owner');let reviews=0;
  f.api.runtime.sendMessage=async request=>{
    try{return {ok:true,data:await f.host.handleHost(request,sender)}}
    catch(error){return {ok:false,error:{code:error.code,message:error.message}}}
  };
  const sdk=createBrowserSdk({request:async(operation,args)=>{
    const approvalRef=await requestManagedProxyIntent({api:f.api,identity:actor.identity,
      title:'Proxy owner',operation,payload:args,hasUserActivation:true,assertCurrent(){},
      requestReview:review=>{reviews++;return review.run({isTrusted:true})}});
    return f.host.handleTool({...actor.identity,operation,args,approvalRef},sender);
  }});
  await sdk.proxy.managed.requestEnable({config:{mode:'direct'}});
  await sdk.proxy.managed.requestDisable();
  await sdk.proxy.managed.requestEnable({config:{mode:'direct'}});
  assert.equal(reviews,1);assert.deepEqual(f.effects,{set:2,clear:1});
  // Restart drops action tokens but retains the exact installation's consent.
  const restarted=createContextMenuHost({api:f.api,lockManager:f.locks,logger:{warn(){}}});
  await restarted.handleHost({...actor.identity,operation:'browser.intent.confirm',
    targetOperation:'browser.proxy.managed.requestDisable',targetArgs:{}},sender);
  assert.equal(typeof (await restarted.handleHost({...actor.identity,operation:'browser.intent.confirm',
    targetOperation:'browser.proxy.managed.requestEnable',targetArgs:{config:{mode:'direct'}},
    proxyConsent:'reuse'},sender)).approvalRef,'string');
  // Reinstall identity cannot inherit consent by claiming the old package hash.
  f.data.set(TOOL_REVOCATION_EPOCHS_STORE,{[actor.identity.toolId]:'epoch-2'});
  await assert.rejects(restarted.handleHost({...actor.identity,installEpoch:'epoch-2',
    operation:'browser.intent.confirm',targetOperation:'browser.proxy.managed.requestEnable',
    targetArgs:{config:{mode:'direct'}},proxyConsent:'reuse'},sender),code('E_PROXY_CONSENT_REQUIRED'));
});
test('unpinned installed package ENABLE and STOP use exact Host intent with static profiles empty',async()=>{
  const f=await fixture(),actor=await f.user('proxy-owner');
  assert.equal((await actor.sdk.proxy.managed.getStatus()).state,'disabled');
  await assert.rejects(actor.sdk.proxy.managed.requestEnable(config),code('E_USER_GESTURE_REQUIRED'));
  assert.equal(f.effects.set,0);
  await actor.approve('browser.proxy.managed.requestEnable',config);
  const result=await actor.sdk.proxy.managed.requestEnable(config);
  assert.equal(result.state,'enabled');
  assert.equal(f.effects.set,1);
  await assert.rejects(actor.sdk.proxy.managed.requestEnable(config),code('E_USER_GESTURE_REQUIRED'));
  actor.clearApproval();
  await assert.rejects(actor.sdk.proxy.managed.requestDisable(),code('E_USER_GESTURE_REQUIRED'));
  assert.equal(f.effects.clear,0);
  await actor.approve('browser.proxy.managed.requestDisable',{});
  assert.equal((await actor.sdk.proxy.managed.requestDisable()).state,'disabled');
  assert.equal(f.effects.clear,1);
});

test('explicit direct, single endpoint and loopback rules require exact intent and remain stoppable',async()=>{
  const routes=[{mode:'direct'},
    {mode:'fixed_servers',endpoint:{scheme:'http',host:'127.0.0.1',port:7897}},
    {mode:'fixed_servers',endpoint:{scheme:'socks5',host:'proxy.example.com',port:1080}},
    {mode:'rules',endpoint:{scheme:'socks5',host:'127.0.0.1',port:7897},domains:['ip111.cn']}];
  for(const route of routes){
    const f=await fixture(),actor=await f.user('proxy-owner'),peer=await f.user('proxy-peer');
    const args={config:route};
    await assert.rejects(actor.sdk.proxy.managed.requestEnable(args));
    assert.equal(f.effects.set,0);
    await actor.approve('browser.proxy.managed.requestEnable',args);
    assert.equal((await actor.sdk.proxy.managed.requestEnable(args)).state,'enabled');
    const native=(await f.api.proxy.settings.get({})).value;
    assert.equal(native.mode,'pac_script');
    assert.match(native.pacScript.data,/OpenDesk Managed Proxy owner/);
    assert.equal((await peer.sdk.proxy.managed.getStatus()).state,'conflict');
    await peer.approve('browser.proxy.managed.requestDisable',{});
    await assert.rejects(peer.sdk.proxy.managed.requestDisable(),code('E_PROXY_OWNERSHIP'));
    assert.equal(f.effects.clear,0);
    await actor.approve('browser.proxy.managed.requestDisable',{});
    assert.equal((await actor.sdk.proxy.managed.requestDisable()).state,'disabled');
    assert.equal(f.effects.clear,1);
  }
});

test('new routing modes reject broader local networks, raw PAC and changed intent',async()=>{
  const f=await fixture(),actor=await f.user('proxy-owner');
  const operation='browser.proxy.managed.requestEnable';
  const args={config:{mode:'fixed_servers',endpoint:{scheme:'http',host:'127.0.0.1',port:7897}}};
  await actor.approve(operation,args);
  await assert.rejects(actor.sdk.proxy.managed.requestEnable({config:{mode:'direct'}}),code('E_USER_GESTURE_REQUIRED'));
  for(const route of [
    {mode:'direct',endpoint:args.config.endpoint},
    {mode:'pac_script',pacScript:{data:'return "DIRECT"'}},
    ...['localhost','127.0.0.2','192.168.1.1','10.0.0.1','::1','proxy.local'].map(host=>
      ({mode:'fixed_servers',endpoint:{scheme:'http',host,port:7897}})),
    {mode:'rules',endpoint:args.config.endpoint,domains:['*.ip111.cn']},
    {mode:'rules',endpoint:args.config.endpoint,domains:[]}
  ])await assert.rejects(actor.approve(operation,{config:route}));
  assert.equal(f.effects.set,0);
});

test('exact Host proxy approval rejects parameter, operation, instance, host and tool substitution',async()=>{
  const f=await fixture(),actor=await f.user('proxy-owner'),peer=await f.user('proxy-peer');
  const operation='browser.proxy.managed.requestEnable';
  const changed=structuredClone(config);changed.config.endpoint.port++;
  for(const patch of [
    {args:changed},
    {args:{config:{...config.config,domains:['example.org']}}},
    {operation:'browser.proxy.managed.requestDisable',args:{}},
    {toolInstance:randomUUID()},
    {hostInstanceId:randomUUID()},
    {...peer.identity}
  ]){
    const approvalRef=await actor.approve(operation,config);
    await assert.rejects(f.host.handleTool({...actor.identity,operation,args:config,
      approvalRef,...patch},sender));
  }
  assert.equal(f.effects.set,0);assert.equal(f.effects.clear,0);
  assert.equal(f.data.has(MANAGED_PROXY_STORE),false);
});

test('approval does not survive installed epoch or package content changes',async()=>{
  for(const change of ['epoch','package']){
    const f=await fixture(),actor=await f.user('proxy-owner');
    const operation='browser.proxy.managed.requestEnable';
    const approvalRef=await actor.approve(operation,config);
    const identity={...actor.identity};
    if(change==='epoch'){
      f.data.set(TOOL_REVOCATION_EPOCHS_STORE,{[f.first.id]:'epoch-2',[f.second.id]:'epoch-1'});
      identity.installEpoch='epoch-2';
    }else{
      const replacement=validateSidebarToolPackage({...f.first,js:'void 1;'});
      f.data.set(SIDEBAR_TOOL_STORE,[replacement,f.second]);
      identity.packageHash=await sidebarToolPackageHash(replacement);
    }
    await assert.rejects(f.host.handleTool({...identity,operation,args:config,approvalRef},sender),
      code('E_USER_GESTURE_REQUIRED'));
    assert.equal(f.effects.set,0);assert.equal(f.data.has(MANAGED_PROXY_STORE),false);
  }
});

test('sandbox approval claims cannot replace a consumed Host intent',async()=>{
  const f=await fixture(),actor=await f.user('proxy-owner');
  await assert.rejects(f.host.handleTool({...actor.identity,
    operation:'browser.proxy.managed.requestEnable',args:config,
    approved:true,validated:true},sender),code('E_USER_GESTURE_REQUIRED'));
  for(const flag of ['approved','validated']){
    await assert.rejects(actor.approve('browser.proxy.managed.requestEnable',{
      config:{...config.config,[flag]:true}}));
  }
  assert.equal(f.effects.set,0);
});

test('Driver config authorizer must explicitly succeed even with a matching static profile',async()=>{
  for(const result of [false,undefined]){
    const f=await fixture(),actor=await f.user('proxy-owner');
    const driver=createBrowserManagedProxy({api:f.api,lockManager:f.locks,
      authorizeEnable:async()=>{},authorizeConfig:async()=>result,
      reviewedProfiles:[{reviewId:'FIXTURE-PROXY-REVIEW-0002',reviewedAt:'2026-10-15',
        reviewedBy:'node-fixture',toolId:f.first.id,
        packageHash:actor.identity.packageHash,config:config.config}]});
    await assert.rejects(driver.requestEnable(config,{...actor.identity,epoch:'epoch-1'}),
      code('E_PROXY_AUTHORIZATION_REQUIRED'));
    assert.equal(f.effects.set,0);assert.equal(f.data.has(MANAGED_PROXY_STORE),false);
  }
});

test('ordinary config authorizer cannot approve the fixed development HTTP exception',()=>{
  // Model trusted Vite MODE without changing the source-reviewed pin or package.
  const loader=`export async function load(url,context,next){
    const loaded=await next(url,context);
    if(url.endsWith('/browser-managed-proxy-profiles.js'))return {...loaded,
      source:String(loaded.source).replaceAll('import.meta.env?.MODE','"development"')};
    return loaded;
  }`;
  execFileSync(process.execPath,['--input-type=module','-e',`
    import assert from 'node:assert/strict';
    import {register} from 'node:module';
    register('data:text/javascript,'+encodeURIComponent(${JSON.stringify(loader)}));
    const {createBrowserManagedProxy}=await import('./src/platform/chrome/browser-managed-proxy.js');
    const {DEVELOPMENT_MANAGED_PROXY_CONFIG}=await import('./src/platform/chrome/browser-managed-proxy-profiles.js');
    let approvals=0;
    const driver=createBrowserManagedProxy({
      api:{storage:{local:{get:async()=>({})}}},
      lockManager:{request:(_name,work)=>work()},authorizeEnable:async()=>{},
      authorizeConfig:async()=>{approvals++;return true;}
    });
    await assert.rejects(driver.requestEnable({config:DEVELOPMENT_MANAGED_PROXY_CONFIG},
      {toolId:'proxy-owner',packageHash:'a'.repeat(64),epoch:'epoch-1'}),
      error=>error.code==='E_PROXY_PROFILE_NOT_APPROVED');
    assert.equal(approvals,0);
  `],{cwd:process.cwd(),encoding:'utf8',timeout:20000});
});

test('Driver rechecks exact context and normalized config credential before second identity check',async()=>{
  const f=await fixture(),actor=await f.user('proxy-owner');
  const context={...actor.identity,epoch:'epoch-1'};
  let checks=0,identityChecks=0;
  const driver=createBrowserManagedProxy({api:f.api,lockManager:f.locks,
    authorizeEnable:async()=>{identityChecks++;},
    authorizeConfig:async(actual,safe)=>{
      assert.equal(actual,context);
      assert.deepEqual(safe,{endpoint:config.config.endpoint,domains:[...config.config.domains].sort()});
      return ++checks===1;
    }});
  await assert.rejects(driver.requestEnable(config,context),code('E_PROXY_AUTHORIZATION_REQUIRED'));
  assert.equal(checks,2);assert.equal(identityChecks,1);
  assert.equal(f.effects.set,0);assert.equal(f.data.get(MANAGED_PROXY_STORE).phase,'applying');
  assert.equal((await driver.requestDisable({},context)).state,'disabled');
});

test('Host revocation after applying persistence blocks native ENABLE with user-approved routes',async()=>{
  const f=await fixture(),actor=await f.user('proxy-owner');
  const set=f.api.storage.local.set;
  f.api.storage.local.set=async rows=>{
    await set(rows);
    if(rows[MANAGED_PROXY_STORE]?.phase==='applying')
      f.data.set(SIDEBAR_TOOL_ENABLE_STORE,{[f.first.id]:false,[f.second.id]:true});
  };
  await actor.approve('browser.proxy.managed.requestEnable',config);
  await assert.rejects(actor.sdk.proxy.managed.requestEnable(config),code('E_TOOL_DISABLED'));
  assert.equal(f.effects.set,0);assert.equal(f.data.get(MANAGED_PROXY_STORE).phase,'applying');
  f.data.set(SIDEBAR_TOOL_ENABLE_STORE,{[f.first.id]:true,[f.second.id]:true});
  await assert.rejects(actor.sdk.proxy.managed.requestEnable(config),code('E_USER_GESTURE_REQUIRED'));
  await actor.approve('browser.proxy.managed.requestDisable',{});
  assert.equal((await actor.sdk.proxy.managed.requestDisable()).state,'disabled');
});
test('accepted trusted STOP revokes a previously approved but delayed ENABLE, not a fresh click',async()=>{
  const f=await fixture(),actor=await f.user('proxy-owner');
  // The old click has a perfectly valid one-use enable ref but its RPC is late.
  const staleEnableRef=await actor.approve('browser.proxy.managed.requestEnable',config);
  await actor.approve('browser.proxy.managed.requestDisable',{});
  assert.equal((await actor.sdk.proxy.managed.requestDisable()).state,'disabled');
  await assert.rejects(f.host.handleTool({...actor.identity,
    operation:'browser.proxy.managed.requestEnable',args:config,
    approvalRef:staleEnableRef},sender),code('E_USER_GESTURE_REQUIRED'));
  assert.equal(f.effects.set,0,'No native proxy activation after an accepted STOP');
  assert.equal(f.effects.clear,0,'No arbitrary Chrome clear if no proxy was owned');
  // Deliberately starting a NEW operation still requires, and accepts, a new click.
  await actor.approve('browser.proxy.managed.requestEnable',config);
  assert.equal((await actor.sdk.proxy.managed.requestEnable(config)).state,'enabled');
  assert.equal(f.effects.set,1);
});
test('peer cannot clear active signed owner PAC even after their own real Host approval',async()=>{
  const f=await fixture(),first=await f.user('proxy-owner'),peer=await f.user('proxy-peer');
  await first.approve('browser.proxy.managed.requestEnable',config);
  assert.equal((await first.sdk.proxy.managed.requestEnable(config)).state,'enabled');
  assert.equal((await peer.sdk.proxy.managed.getStatus()).state,'conflict');
  await peer.approve('browser.proxy.managed.requestDisable',{});
  await assert.rejects(peer.sdk.proxy.managed.requestDisable(),code('E_PROXY_OWNERSHIP'));
  assert.equal(f.effects.clear,0);
});
test('stale package identity and spoofed Side Panel sender fail before privileged Chrome calls',async()=>{
  const f=await fixture(),actor=await f.user('proxy-owner');
  const wrong={...actor.identity,packageHash:'0'.repeat(64)};
  await assert.rejects(f.host.handleTool({...wrong,
    operation:'browser.proxy.managed.getStatus',args:{}},sender),code('E_TOOL_CHANGED'));
  await assert.rejects(f.host.handleTool({...actor.identity,
    operation:'browser.proxy.managed.getStatus',args:{}},
    {...sender,id:'foreign-extension'}));
  assert.equal(f.effects.set,0);assert.equal(f.effects.clear,0);
});
test('malicious PAC source, localhost and direct native ProxyConfig never pass public input schema',async()=>{
  const f=await fixture(),actor=await f.user('proxy-owner');
  for(const bad of [{config:{...config.config,pacScript:'return \"DIRECT\";'}},
    {config:{endpoint:{scheme:'http',host:'127.0.0.1',port:7897},domains:['chatgpt.com']}},
    {config:{endpoint:{scheme:'socks5',host:'proxy.example.com',port:1080},
      domains:['chatgpt.com', 'evil.com);return \"DIRECT\";']}}]){
    await assert.rejects(Promise.resolve().then(()=>actor.sdk.proxy.managed.requestEnable(bad)));
  }
  assert.equal(f.effects.set,0);
});

test('SDK STATUS and STOP persist recovery intent if Chrome proxy permission is revoked',async()=>{
  const f=await fixture(),actor=await f.user('proxy-owner');
  await actor.approve('browser.proxy.managed.requestEnable',config);
  assert.equal((await actor.sdk.proxy.managed.requestEnable(config)).state,'enabled');
  f.setProxyPermission(false);
  const status=await actor.sdk.proxy.managed.getStatus();
  assert.equal(status.permission,false);
  assert.equal(status.canStop,true);
  assert.equal(status.state,'unavailable');
  await actor.approve('browser.proxy.managed.requestDisable',{});
  await assert.rejects(actor.sdk.proxy.managed.requestDisable(),
    code('E_CHROME_PERMISSION_REQUIRED'));
  assert.equal(f.data.get(MANAGED_PROXY_STORE).phase,'stopping');
  assert.equal(f.effects.clear,0,'No native release while Chrome permission is missing');
  f.setProxyPermission(true);
  assert.equal(await reconcileManagedProxy(f.api,{lockManager:f.locks}),'released');
  assert.equal(f.effects.clear,1);
});
