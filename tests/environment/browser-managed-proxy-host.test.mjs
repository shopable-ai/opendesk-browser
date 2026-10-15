import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {MANAGED_PROXY_STORE,reconcileManagedProxy} from '../../src/platform/chrome/browser-managed-proxy.js';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';
import {createContextMenuHost} from '../../src/platform/chrome/context-menus.js';
import {SIDEBAR_TOOL_STORE,sidebarToolPackageHash,validateSidebarToolPackage}
  from '../../src/ui/sidebar-tools/package.js';
import {TOOL_REVOCATION_EPOCHS_STORE,SIDEBAR_TOOL_ENABLE_STORE}
  from '../../src/ui/sidebar-tools/lifecycle.js';

// Real Registry/Facade, installed-tool Host and production Driver, with
// simulated Chrome APIs only. Not proof of native Chrome or network traffic.
const extensionId='a'.repeat(32),hostInstanceId=randomUUID(),toolInstance=randomUUID();
const sender={id:extensionId,frameId:0,documentLifecycle:'active',documentId:'proxy-host-doc',
  url:'chrome-extension://'+extensionId+'/ui/tool.html?hostInstanceId='+hostInstanceId};
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
    logger:{warn(){}},reviewedProxyProfiles:[{
      reviewId:'FIXTURE-PROXY-REVIEW-0002',reviewedAt:'2026-10-15',
      reviewedBy:'node-fixture',toolId:first.id,
      packageHash:await sidebarToolPackageHash(first),config:config.config
    }]});
  async function user(id,patch={}){
    const tool=id==='proxy-owner'?first:second;
    const identity={toolId:id,toolVersion:tool.version,packageHash:await sidebarToolPackageHash(tool),
      installEpoch:'epoch-1',hostInstanceId,toolInstance};
    let approvalRef;
    return {
      identity,
      sdk:createBrowserSdk({request:(operation,args)=>host.handleTool(
        {...identity,operation,args,...(approvalRef?{approvalRef}:{})},sender)}),
      async approve(operation,args={}){
        const data=await host.handleHost({...identity,operation:'browser.intent.confirm',
          targetOperation:operation,targetArgs:args},sender);
        approvalRef=data.approvalRef;
        return approvalRef;
      },clearApproval(){approvalRef=undefined;}
    };
  }
  return {first,second,data,host,user,effects,api,locks,
    setProxyPermission:next=>{proxyPermission=next;}};
}
test('installed Browser SDK proxy ENABLE and STOP traverse the single signed Host and one-use intent',async()=>{
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
