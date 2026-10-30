import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {runInNewContext} from 'node:vm';
import {createBrowserManagedProxy,MANAGED_PROXY_STORE}
  from '../../src/platform/chrome/browser-managed-proxy.js';

// Node/component evidence only. The loader models Vite's trusted MODE literal;
// it does not build an extension, start a watcher or prove native proxy traffic.
function runIsolated(checks,{mode='development'}={}){
  const loader=`let literals;
  export function initialize(data){literals=data}
  export async function load(url,context,nextLoad){
    const loaded=await nextLoad(url,context);
    if(url.endsWith('/browser-managed-proxy-profiles.js'))return {...loaded,
      source:String(loaded.source)
        .replaceAll('import.meta.env?.MODE',JSON.stringify(literals.mode))};
    return loaded;
  }`;
  return execFileSync(process.execPath,['--input-type=module','-e',`
    import assert from 'node:assert/strict';
    import {register} from 'node:module';
    import {runInNewContext} from 'node:vm';
    import {randomUUID} from 'node:crypto';
    import {resolve} from 'node:path';
    // Register before loading the packer: its installation graph also imports
    // the profile. A static import would cache an untransformed MODE first.
    register('data:text/javascript,'+encodeURIComponent(${JSON.stringify(loader)}),{
      parentURL:import.meta.url,data:{mode:${JSON.stringify(mode)}}});
    const {createSidebarToolPackage}=await import('./scripts/build-sidebar-tool.mjs');
    const {SIDEBAR_TOOL_STORE,sidebarToolPackageHash,validateSidebarToolPackage}=
      await import('./src/ui/sidebar-tools/package.js');
    process.env.NODE_ENV='production'; // WXT serve's inner Vite build also uses this.
    process.env.OPENDESK_BUILD_MODE='development'; // Cannot override production MODE.
    const packageFor=id=>validateSidebarToolPackage({format:'opendesk.sidebar-tool.v2',
      id,version:'1.0.0',title:'Development proxy fixture',description:'Test only',
      capabilities:['browser.proxy.managed'],html:'<main>fixture</main>',css:'',js:'void 0;',
      requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]}});
    const tool=await createSidebarToolPackage(resolve('examples/sidebar-tools/ai-vip-share'));
    const packageHash=await sidebarToolPackageHash(tool);
    // Runtime globals deliberately disagree with production literals: they
    // cannot turn a production-compiled route on.
    globalThis.__OPENDESK_MANAGED_PROXY_DEV__=true;
    globalThis.__OPENDESK_MANAGED_PROXY_DEV_PACKAGE_HASH__=packageHash;
    const profiles=await import('./src/platform/chrome/browser-managed-proxy-profiles.js');
    const {createBrowserManagedProxy,compileManagedProxyPac,validateManagedProxyConfig,
      reconcileManagedProxy,MANAGED_PROXY_STORE}=await import('./src/platform/chrome/browser-managed-proxy.js');
    const {normalizeBrowserOperation}=await import('./src/framework/sdk/browser-contract.js');
    const {operationSchemas,validateDirectBrowserValue}=await import('./src/framework/sdk/browser-schemas.js');
    const {createContextMenuHost}=await import('./src/platform/chrome/context-menus.js');
    const {createBrowserSdk}=await import('./src/framework/sdk/browser.js');
    const {TOOL_REVOCATION_EPOCHS_STORE,SIDEBAR_TOOL_ENABLE_STORE}=await import('./src/ui/sidebar-tools/lifecycle.js');
    const owner={toolId:tool.id,packageHash,epoch:null};
    const config=structuredClone(profiles.DEVELOPMENT_MANAGED_PROXY_CONFIG);
    const input={config},code=expected=>error=>error?.code===expected;
    ${installedFixture.toString()}
    ${checks}
  `],{cwd:process.cwd(),encoding:'utf8',timeout:20000});
}

async function installedFixture(){
  const peer=packageFor('proxy-peer'),extensionId='a'.repeat(32),hostInstanceId=randomUUID();
  const data=new Map([[SIDEBAR_TOOL_STORE,[tool,peer]],
    [TOOL_REVOCATION_EPOCHS_STORE,{}],[SIDEBAR_TOOL_ENABLE_STORE,{}]]);
  const clone=value=>value===undefined?undefined:structuredClone(value);
  let control='controllable_by_this_extension',value=null,permission=true,revokeOnApplying=false;
  const effects={set:0,clear:0},storage={
    async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys])
      .filter(key=>data.has(key)).map(key=>[key,clone(data.get(key))]));},
    async set(rows){
      for(const [key,row] of Object.entries(rows))data.set(key,clone(row));
      if(revokeOnApplying&&rows[MANAGED_PROXY_STORE]?.phase==='applying')
        data.set(SIDEBAR_TOOL_ENABLE_STORE,{[tool.id]:false});
    }
  };
  const sender={id:extensionId,frameId:0,documentLifecycle:'active',documentId:'dev-proxy-host-doc',
    url:'chrome-extension://'+extensionId+'/sidepanel.html?hostInstanceId='+hostInstanceId};
  const api={runtime:{id:extensionId,getURL:path=>'chrome-extension://'+extensionId+'/'+path,
    getContexts:async()=>[{contextType:'SIDE_PANEL',documentId:sender.documentId,
      documentUrl:sender.url,frameId:0,incognito:false}]},
    storage:{local:storage,session:storage,onChanged:{addListener(){}}},
    permissions:{contains:async({permissions})=>!permissions||permissions.every(name=>name==='proxy'&&permission)},
    alarms:{create:async()=>{},clear:async()=>true},proxy:{settings:{
      get:async()=>({levelOfControl:control,value:clone(value)}),
      set:async row=>{effects.set++;value=clone(row.value);control='controlled_by_this_extension';},
      clear:async()=>{effects.clear++;value=null;control='controllable_by_this_extension';}
    }},tabs:{},webNavigation:{}};
  const tails=new Map();
  const locks={request:(name,work)=>{
    const next=(tails.get(name)??Promise.resolve()).then(work);
    tails.set(name,next.catch(()=>{}));return next;
  }};
  const host=createContextMenuHost({api,lockManager:locks,logger:{warn(){}}});
  async function actor(installed=tool){
    const identity={toolId:installed.id,toolVersion:installed.version,
      packageHash:await sidebarToolPackageHash(installed),installEpoch:null,hostInstanceId,toolInstance:randomUUID()};
    let approvalRef;
    return {identity,sdk:createBrowserSdk({request:(operation,args)=>host.handleTool(
      {...identity,operation,args,...(approvalRef?{approvalRef}:{})},sender)}),
      async approve(operation,args={}){
        const result=await host.handleHost({...identity,operation:'browser.intent.confirm',
          targetOperation:operation,targetArgs:args},sender);
        approvalRef=result.approvalRef;return approvalRef;
      }};
  }
  return {api,locks,host,sender,data,peer,actor,effects,get value(){return clone(value)},
    set permission(next){permission=next},set control(next){control=next},
    set revokeOnApplying(next){revokeOnApplying=next}};
}

test('trusted development MODE and reviewed source pin emit fixed HTTP PAC for website/API hosts',()=>{
  runIsolated(`
    assert.equal(profiles.MANAGED_PROXY_DEVELOPMENT_ENABLED,true);
    assert.equal(tool.version,'1.4.6');
    assert.equal(packageHash,'2edc509ca45a853fdfe09786cd5fd448d3935e8affb1245a73b30fefc963d4d0');
    assert.deepEqual(profiles.REVIEWED_MANAGED_PROXY_PROFILES,[]);
    assert(Object.isFrozen(profiles.REVIEWED_MANAGED_PROXY_PROFILES));
    assert.deepEqual(profiles.getDevelopmentManagedProxyProfile(owner),config);
    assert.equal(profiles.getDevelopmentManagedProxyProfile({...owner,packageHash:'f'.repeat(64)}),null);
    assert.equal(profiles.getDevelopmentManagedProxyProfile({...owner,toolId:'proxy-peer'}),null);
    const pac=compileManagedProxyPac(config,{...owner,installEpoch:null});
    const ctx={dnsDomainIs:(host,suffix)=>host.endsWith(suffix)};
    runInNewContext(pac,ctx);
    for(const host of ['chatgpt.com','api.openai.com','claude.ai','api.anthropic.com',
      'gemini.google.com','generativelanguage.googleapis.com','api.perplexity.ai'])
      assert.equal(ctx.FindProxyForURL('https://'+host+'/',host),'PROXY 127.0.0.1:7897');
    for(const host of ['example.com','evilopenai.com','openai.com.evil.com','127.0.0.1'])
      assert.equal(ctx.FindProxyForURL('https://'+host+'/',host),'DIRECT');
    assert(!pac.includes('HTTPS 127.0.0.1'));
    const changed=profiles.getDevelopmentManagedProxyProfile(owner);changed.domains.push('evil.com');
    assert.deepEqual(profiles.getDevelopmentManagedProxyProfile(owner),config);
    for(const bad of [
      {...config,endpoint:{...config.endpoint,host:'127.0.0.2'}},
      {...config,endpoint:{...config.endpoint,host:'localhost'}},
      {...config,endpoint:{...config.endpoint,port:7898}},
      {...config,endpoint:{...config.endpoint,scheme:'https'}},
      {...config,domains:[...config.domains,'example.com']},
      {...config,domains:config.domains.slice(1)},
      {...config,domains:config.domains.map(()=>config.domains[0])},
      {...config,pacScript:'return DIRECT'}]){
      assert.throws(()=>validateManagedProxyConfig(bad),code('E_PROXY_CONFIG'));
      assert.throws(()=>normalizeBrowserOperation('browser.proxy.managed.requestEnable',{config:bad}));
    }
    validateDirectBrowserValue(input,operationSchemas('browser.proxy.managed.requestEnable').input);
  `);
});

test('installed development SDK requires real Host intent and owner, preserves STOP race and reopen',()=>{
  runIsolated(`
    const f=await installedFixture(),actor=await f.actor();
    const status=await actor.sdk.proxy.managed.getStatus();
    assert.deepEqual(status.developmentProfile,config);
    validateDirectBrowserValue(status,operationSchemas('browser.proxy.managed.getStatus').output);
    await assert.rejects(actor.sdk.proxy.managed.requestEnable(input),code('E_USER_GESTURE_REQUIRED'));
    await actor.approve('browser.proxy.managed.requestEnable',input);
    assert.equal((await actor.sdk.proxy.managed.requestEnable(input)).state,'enabled');
    assert.equal(f.effects.set,1);
    assert.equal(f.data.get(MANAGED_PROXY_STORE).owner.packageHash,packageHash);
    const reopened=await f.actor();
    assert.equal((await reopened.sdk.proxy.managed.getStatus()).state,'enabled');
    const peer=await f.actor(f.peer);
    assert.equal((await peer.sdk.proxy.managed.getStatus()).developmentProfile,null);
    await peer.approve('browser.proxy.managed.requestDisable',{});
    await assert.rejects(peer.sdk.proxy.managed.requestDisable(),code('E_PROXY_OWNERSHIP'));
    await reopened.approve('browser.proxy.managed.requestDisable',{});
    assert.equal((await reopened.sdk.proxy.managed.requestDisable()).state,'disabled');
    const old=await actor.approve('browser.proxy.managed.requestEnable',input);
    await actor.approve('browser.proxy.managed.requestDisable',{});
    await actor.sdk.proxy.managed.requestDisable();
    await assert.rejects(f.host.handleTool({...actor.identity,operation:'browser.proxy.managed.requestEnable',
      args:input,approvalRef:old},f.sender),code('E_USER_GESTURE_REQUIRED'));
    assert.equal(f.effects.set,1);assert.equal(f.effects.clear,1);
    assert.equal(f.data.get(MANAGED_PROXY_STORE).phase,'released');
    assert.equal((await (await f.actor()).sdk.proxy.managed.getStatus()).state,'disabled');
    await peer.approve('browser.proxy.managed.requestEnable',input);
    await assert.rejects(peer.sdk.proxy.managed.requestEnable(input),code('E_PROXY_PROFILE_NOT_APPROVED'));
    const stale={...actor.identity,packageHash:'f'.repeat(64)};
    await assert.rejects(f.host.handleTool({...stale,operation:'browser.proxy.managed.getStatus',args:{}},
      f.sender),code('E_TOOL_CHANGED'));
    assert.equal(f.effects.set,1);
  `);
});

test('development ENABLE retains installation revocation and permission/foreign-owner STOP fences',()=>{
  runIsolated(`
    const f=await installedFixture(),actor=await f.actor();
    f.revokeOnApplying=true;
    await actor.approve('browser.proxy.managed.requestEnable',input);
    await assert.rejects(actor.sdk.proxy.managed.requestEnable(input),code('E_TOOL_DISABLED'));
    assert.equal(f.effects.set,0);assert.equal(f.data.get(MANAGED_PROXY_STORE).phase,'applying');
    f.data.set(SIDEBAR_TOOL_ENABLE_STORE,{});f.revokeOnApplying=false;
    await actor.approve('browser.proxy.managed.requestDisable',{});await actor.sdk.proxy.managed.requestDisable();
    await actor.approve('browser.proxy.managed.requestEnable',input);await actor.sdk.proxy.managed.requestEnable(input);
    f.control='controlled_by_other_extensions';
    await actor.approve('browser.proxy.managed.requestDisable',{});
    await assert.rejects(actor.sdk.proxy.managed.requestDisable(),code('E_PROXY_OWNERSHIP'));
    assert.equal(f.effects.clear,0);
    f.control='controlled_by_this_extension';f.permission=false;
    assert.equal((await actor.sdk.proxy.managed.getStatus()).canStop,true);
    await actor.approve('browser.proxy.managed.requestDisable',{});
    await assert.rejects(actor.sdk.proxy.managed.requestDisable(),code('E_CHROME_PERMISSION_REQUIRED'));
    assert.equal(f.data.get(MANAGED_PROXY_STORE).phase,'stopping');
    f.permission=true;
    assert.equal(await reconcileManagedProxy(f.api,{lockManager:f.locks}),'released');
    assert.equal(f.effects.set,1);assert.equal(f.effects.clear,1);
  `);
});

test('production or unknown MODE cannot admit loopback even with spoofed globals and storage',()=>{
  for(const mode of ['production','unknown'])runIsolated(`
    assert.equal(profiles.MANAGED_PROXY_DEVELOPMENT_ENABLED,false);
    assert.deepEqual(profiles.REVIEWED_MANAGED_PROXY_PROFILES,[]);
    assert.equal(profiles.getDevelopmentManagedProxyProfile(owner),null);
    assert.throws(()=>validateManagedProxyConfig(config),code('E_PROXY_CONFIG'));
    assert.throws(()=>normalizeBrowserOperation('browser.proxy.managed.requestEnable',input));
    const f=await installedFixture(),actor=await f.actor();
    f.data.set('opendesk.managed-proxy.development-profile',{approved:true,config,packageHash});
    assert.equal((await actor.sdk.proxy.managed.getStatus()).developmentProfile,undefined);
    assert.throws(()=>actor.sdk.proxy.managed.requestEnable(input));
    assert.equal(f.effects.set,0);
  `,{mode});
});

test('production can release an exact previous development journal without authorizing a new HTTP route',async()=>{
  const saved=JSON.parse(runIsolated(`
    const f=await installedFixture(),actor=await f.actor();
    await actor.approve('browser.proxy.managed.requestEnable',input);
    await actor.sdk.proxy.managed.requestEnable(input);
    console.log(JSON.stringify({journal:f.data.get(MANAGED_PROXY_STORE),value:f.value,owner}));
  `));
  let journal=saved.journal,value=saved.value,control='controlled_by_this_extension',clears=0;
  const api={storage:{local:{get:async()=>({[MANAGED_PROXY_STORE]:structuredClone(journal)}),
    set:async rows=>{journal=structuredClone(rows[MANAGED_PROXY_STORE])}}},
    permissions:{contains:async()=>true},alarms:{clear:async()=>true,create:async()=>{}},proxy:{settings:{
      get:async()=>({value,levelOfControl:control}),set:async()=>assert.fail('No production HTTP ENABLE'),
      clear:async()=>{clears++;value=null;control='controllable_by_this_extension'}
    }}};
  const driver=createBrowserManagedProxy({api,lockManager:{request:(_name,work)=>work()},
    authorizeEnable:async()=>{}});
  assert.equal((await driver.getStatus({},saved.owner)).canStop,true);
  assert.equal((await driver.requestDisable({},saved.owner)).state,'disabled');
  assert.equal(journal.phase,'released');assert.equal(clears,1);
  await assert.rejects(driver.requestEnable({config:saved.journal.config},saved.owner),{code:'E_PROXY_CONFIG'});
  const pac={dnsDomainIs:(host,suffix)=>host.endsWith(suffix)};
  runInNewContext(saved.value.pacScript.data,pac);
  assert.equal(pac.FindProxyForURL('https://api.openai.com/','api.openai.com'),'PROXY 127.0.0.1:7897');
});

