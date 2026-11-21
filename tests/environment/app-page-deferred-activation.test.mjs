import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {reviewedQueue} from '../fixtures/ai-send-queue-reviewed.mjs';
import {fakeBuiltinSource} from './builtin-support.mjs';
import {digest,digestUtf8} from '../../src/platform/protocol.js';
import {createDependencyManager} from '../../src/scripting/user-scripts/dependency-manager.js';
import {createInstalledPagePrograms,PAGE_BOOT_PROTOCOL} from '../../src/scripting/user-scripts/installed-programs.js';
import {FIXED_QUEUE_PROTOCOL} from '../../src/scripting/user-scripts/fixed-send-queue.js';
import {SIDEBAR_TOOL_STORE,sidebarToolPackageHash} from '../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';

globalThis.crypto ||= webcrypto;

const match='https://example.com/demo/*';
const hostOrigin='https://example.com/*';
const toolId='deferred-fixture';
const programId='app.'+toolId;

async function makeTool(revision=1){
  const sourceUtf8='async function main(){ return '+revision+'; }';
  const version='1.0.'+revision;
  const page={format:'opendesk.page-install.v1',programId,version,title:'Fixture',revision,
    entryFormat:'async-main',sourceUtf8,sourceHash:await digestUtf8(sourceUtf8),
    pageRules:{matches:[match],excludeMatches:[],runAt:'document_end',allFrames:false,world:'USER_SCRIPT'}};
  return {format:'opendesk.sidebar-tool.v2',id:toolId,version,title:'Fixture',description:'Companion',
    html:'<p>Fixture</p>',css:'',js:'void 0;',capabilities:['page.module'],requires:{browserSdk:'1.0.0'},
    contributes:{contextMenus:[]},pageModule:{...page,packageHash:await digest(page)}};
}

// The parent registry models a completed UI review; storage and Chrome are
// doubles. The actual candidate, authorization and registration logic runs.
function fixture(offMode='namespace absent',{toolId:targetId=toolId,origin=hostOrigin}={}){
  const host={tag:'host',namespace:'tool:test',registrationId:'fixture-host',hostDocumentId:'fixture-panel',
    hostUrl:'chrome-extension://test/sidepanel.html',hostInstanceId:'fixture-instance',
    browserSessionIncarnation:'fixture-session',active:true,revoked:false};
  const sender={id:'test',documentId:host.hostDocumentId,url:host.hostUrl};
  let db=new Map([['frameworkKV',new Map()],['commandJournal',new Map([['host:'+host.registrationId,host]])]]);
  let queue=Promise.resolve();
  const storage={transaction(stores,mode,work){
    const next=queue.then(async()=>{
      const copy=structuredClone(db);
      const table=name=>{assert.ok(stores.includes(name));return copy.get(name);};
      const tx={get:async(name,key)=>structuredClone(table(name).get(key)),
        all:async name=>Array.from(table(name).values(),value=>structuredClone(value)),
        put:async(name,value,key)=>{assert.equal(mode,'readwrite');table(name).set(key,structuredClone(value));},
        delete:async(name,key)=>{assert.equal(mode,'readwrite');table(name).delete(key);}};
      const result=await work(tx);
      if(mode==='readwrite')db=copy;
      return result;
    });
    queue=next.catch(()=>{});
    return next;
  }};
  const local={},scripts=new Map(),calls=[];
  const f={enabled:false,siteGranted:true,scripts,calls};
  const url=new URL('/c/fixture',origin.replace('/*','')).href;
  const target={tabId:7,frameId:0,documentId:'queue-document',expectedUrl:url,expectedWindowId:8};
  const pageSender={id:'test',frameId:0,documentId:target.documentId,url,tab:{id:7,incognito:false}};
  f.documentId=target.documentId;
  f.url=url;
  const native={getScripts:async filter=>{
    f.beforeReadScripts?.(filter);
    if(!f.enabled)throw Error("'userScripts.getScripts' is not available in this context.");
    return [...scripts.values()].filter(row=>!filter||filter.ids.includes(row.id)).map(row=>structuredClone(row));
  },configureWorld:async()=>{calls.push('configureWorld');await f.afterConfigure?.();},
  register:([script])=>{
    f.beforeDispatchRegister?.();
    calls.push('register');
    if(f.onRegister)return Promise.resolve().then(()=>f.onRegister(structuredClone(script)));
    scripts.set(script.id,structuredClone(script));
    return Promise.resolve();
  },unregister:async({ids})=>{calls.push('unregister');for(const id of ids)scripts.delete(id);},
  execute:async()=>{calls.push('execute');throw Error('test must not execute a page script');}};
  const api={runtime:{id:'test',getManifest:()=>({permissions:['userScripts']})},
    tabs:{get:async()=>({id:7,windowId:8,url:f.url,incognito:false}),sendMessage:async(...args)=>f.pageStatus(...args)},
    webNavigation:{getAllFrames:async()=>[{frameId:0,documentId:f.documentId,url:f.url,documentLifecycle:'active'}]},
    scripting:{executeScript:async({target:probe,world,func})=>{
      assert.deepEqual(probe,{tabId:target.tabId,documentIds:[f.documentId]});
      assert.equal(world,'ISOLATED');
      if(f.siteBlocked)throw new Error('Blocked');
      return [{frameId:0,documentId:f.documentId,result:func()}];
    }},
    storage:{local:{get:async keys=>Object.fromEntries(keys.map(key=>[key,structuredClone(local[key])]))}},
    permissions:{contains:async request=>{
      assert.deepEqual(request,{origins:[origin]});
      f.beforeCheckGrant?.();
      return f.siteGranted;
    }},get userScripts(){return f.enabled||offMode==='guarded namespace'?native:undefined;}};
  const assertHost=async value=>{assert.deepEqual(value,sender);return host;};
  const loadBuiltin=async()=>fakeBuiltinSource;
  f.restart=()=>{
    const dependencies=createDependencyManager({loadBuiltin,api,storage,assertHost});
    f.service=createInstalledPagePrograms({loadBuiltin,api,storage,assertHost,dependencies,preview:{},
      session:host.browserSessionIncarnation});
  };
  f.restart();
  f.setParent=async(tool,installEpoch='review-1')=>{
    local[SIDEBAR_TOOL_STORE]=tool?[structuredClone(tool)]:[];
    local[TOOL_REVOCATION_EPOCHS_STORE]={[targetId]:installEpoch};
    return tool?{toolId:targetId,installEpoch,packageHash:await sidebarToolPackageHash(tool)}:null;
  };
  f.prepare=tool=>f.service.prepareAppPage({tool},sender);
  f.import=owner=>f.service.importAppPage(owner,sender);
  f.verify=owner=>f.service.verifyAppPage(owner,sender);
  f.check=owner=>f.service.checkAppPage(owner,sender);
  f.list=()=>f.service.listPagePrograms({},sender);
  f.row=()=>structuredClone([...db.get('frameworkKV').values()].find(row=>row.tag==='page-installed-v1'&&row.programId==='app.'+targetId));
  f.patchInstalled=patch=>{
    const row=[...db.get('frameworkKV').values()].find(row=>row.tag==='page-installed-v1'&&row.programId==='app.'+targetId);
    Object.assign(row,patch);
  };
  f.synchronize=()=>f.service.synchronizeAppPages({toolId:targetId},sender);
  f.disable=()=>{local[SIDEBAR_TOOL_ENABLE_STORE]={[targetId]:false};};
  f.authorize=(extra={},from=pageSender)=>f.service.authorizeFixedQueue({protocol:FIXED_QUEUE_PROTOCOL,kind:'authorize',url,...extra},from);
  f.request=(owner,operation='queue.status')=>f.service.requestAppPage({...owner,target,operation,payload:{}},sender);
  f.oldExecution=programId=>db.get('frameworkKV').set('page-execution:legacy',{tag:'page-execution-v1',
    namespace:'tool:test',programId,tabId:target.tabId,documentId:f.documentId,state:'outcome-unknown'});
  f.install=async(tool)=>{
    const prepared=await f.prepare(tool),owner=await f.setParent(tool);
    assert.equal(prepared.packageHash,owner.packageHash);
    const receipt=await f.import(owner);
    assert.equal(receipt.status,'installed');
    assert.equal(receipt.nativeState,'waiting-user-scripts');
    assert.equal(receipt.ready,false);
    return owner;
  };
  return f;
}

const queueTool=()=>readFile(process.env.SEND_QUEUE_PACKAGE_PATH||new URL(
  '../../projects/ai-send-queue/ai-send-queue.opendesk-tool.json',import.meta.url),'utf8').then(JSON.parse);
const queueFixture=()=>fixture('namespace absent',{toolId:'ai-send-queue',origin:'https://chatgpt.com/*'});

const originalQueueTool=async()=>structuredClone(reviewedQueue);

test('public installation runtime kind identifies a dynamic waiting companion',async()=>{
  const f=fixture();
  await f.install(await makeTool());
  const [installed]=(await f.list()).installed;
  assert.equal(installed.runtimeKind,'user-script');
  assert.equal(installed.nativeState,'waiting-user-scripts');
  assert.equal(installed.ready,false);
});

test('public installation runtime kind identifies the original reviewed queue v0.1.34 as fixed content',async()=>{
  const f=queueFixture(),tool=await originalQueueTool();
  await f.import(await f.setParent(tool));
  const [installed]=(await f.list()).installed;
  assert.equal(installed.runtimeKind,'fixed-content');
  assert.equal(installed.nativeState,'fixed');
  assert.equal(installed.ready,true);
  assert.deepEqual(f.calls,[]);
});

for(const state of ['blocked','disabled','unknown'])
test('public installation runtime kind preserves fixed content without claiming readiness: '+state,async()=>{
  const f=queueFixture();
  await f.import(await f.setParent(await originalQueueTool()));
  if(state==='blocked')f.siteGranted=false;
  if(state==='disabled'){
    f.enabled=true;
    f.patchInstalled({enabled:false,nativeState:'disabled',authorization:{...f.row().authorization,status:'disabled'}});
  }
  if(state==='unknown')f.patchInstalled({nativeState:'activation-unconfirmed',
    error:{code:'E_EFFECT_UNKNOWN',message:'Registration outcome unknown'}});
  const before=f.row(),[installed]=(await f.list()).installed;
  assert.equal(installed.runtimeKind,'fixed-content');
  assert.equal(installed.nativeState,state==='unknown'?'activation-unconfirmed':state);
  assert.equal(installed.ready,false);
  assert.deepEqual(f.row(),before);
  assert.deepEqual(f.calls,[]);
});

test('public installation runtime kind is absent for an independent Page installation',async()=>{
  const f=fixture();
  await f.install(await makeTool());
  f.patchInstalled({appOwner:undefined});
  const [installed]=(await f.list()).installed;
  assert.equal(Object.hasOwn(installed,'appOwner'),false);
  assert.equal(Object.hasOwn(installed,'runtimeKind'),false);
});

test('reviewed Send Queue reports status on the exact document with User Scripts unavailable',async()=>{
  const f=queueFixture(),tool=await queueTool();
  await f.prepare(tool);
  const owner=await f.setParent(tool),receipt=await f.import(owner);
  assert.equal(receipt.nativeState,'fixed');
  assert.equal(receipt.ready,true);
  f.restart();await f.service.reconcile();
  assert.equal((await f.check(owner)).nativeState,'fixed');
  const {token}=await f.authorize();
  f.pageStatus=async (tab,message,target)=>{
    assert.equal(tab,7);
    assert.deepEqual(target,{documentId:'queue-document'});
    assert.deepEqual(message,{protocol:FIXED_QUEUE_PROTOCOL,kind:'status',url:'https://chatgpt.com/c/fixture'});
    return {ok:true,data:{status:'ready',version:tool.version}};
  };
  assert.deepEqual(await f.request(owner),{status:'ready',version:tool.version});
  await assert.rejects(f.request(owner,'queue.send'),{code:'E_CAPABILITY'});
  const originalUrl=f.url;
  f.url='https://chatgpt.com/c/next-conversation';
  assert.deepEqual(await f.authorize({token,url:f.url}),{token});
  await assert.rejects(f.authorize({token}),{code:'E_DOCUMENT_STALE'});
  f.url=originalUrl;
  f.siteGranted=false;
  await assert.rejects(f.authorize({token}),/访问受限/);
  f.siteGranted=true;
  const status=f.pageStatus;
  f.pageStatus=async(...args)=>{f.documentId='next-document';return status(...args);};
  await assert.rejects(f.request(owner),{code:'E_DOCUMENT_STALE'});
  await assert.rejects(f.authorize({token}),{code:'E_DOCUMENT_STALE'});
  f.documentId='queue-document';f.disable();
  await assert.rejects(f.authorize({token}),{code:'E_APP_PAGE_OWNER'});
  assert.deepEqual(f.calls,[]);
});

test('Chrome site blocking revokes fixed Send Queue access even with the host grant intact',async()=>{
  const f=queueFixture(),tool=await queueTool(),owner=await f.setParent(tool);
  await f.import(owner);
  const {token}=await f.authorize();
  let statusCalls=0;
  f.pageStatus=async()=>{
    statusCalls++;
    if(f.blockDuringStatus)f.siteBlocked=true;
    return {ok:true,data:{status:'ready',version:tool.version}};
  };
  const denied={code:'E_PERMISSION'};
  f.siteBlocked=true;
  await assert.rejects(f.authorize({token}),denied);
  await assert.rejects(f.authorize(),denied);
  await assert.rejects(f.request(owner),denied);
  assert.equal(statusCalls,0);
  f.siteBlocked=false;
  f.blockDuringStatus=true;
  await assert.rejects(f.request(owner),denied);
  assert.equal(statusCalls,1);
  f.siteBlocked=false;
  f.blockDuringStatus=false;
  assert.deepEqual(await f.authorize({token}),{token});
  assert.deepEqual(await f.request(owner),{status:'ready',version:tool.version});
});

test('fixed Send Queue does not take over a legacy execution or an unreviewed copy',async()=>{
  const f=queueFixture(),tool=await queueTool(),owner=await f.setParent(tool);
  await f.import(owner);
  for(const id of ['app.ai-send-queue','opendesk.chatgpt-send-queue','opendesk.ai-send-queue']){
    f.oldExecution(id);
    await assert.rejects(f.authorize(),{code:'E_APP_PAGE_RELOAD_REQUIRED'});
  }
  const copy=queueFixture();
  const page={...tool.pageModule,sourceUtf8:tool.pageModule.sourceUtf8+'\n// local edit'};
  delete page.packageHash;
  page.sourceHash=await digestUtf8(page.sourceUtf8);
  tool.pageModule={...page,packageHash:await digest(page)};
  assert.equal((await copy.import(await copy.setParent(tool))).nativeState,'waiting-user-scripts');
  await assert.rejects(copy.authorize(),{code:'E_APP_PAGE_OWNER'});
});

for(const offMode of ['namespace absent','guarded namespace'])
test('an approved companion stays installed without native writes while the switch is off: '+offMode,async()=>{
  const f=fixture(offMode),owner=await f.install(await makeTool()),before=f.row();
  f.restart();
  await f.service.reconcile();
  assert.deepEqual(await f.check(owner),{status:'verified',appOwner:owner,programId,
    manifestHash:before.manifestHash,sourceHash:before.sourceHash,nativeState:'waiting-user-scripts',ready:false});
  await assert.rejects(f.request(owner,'toc.snapshot'),{code:'E_APP_PAGE_ACTIVATION_REQUIRED'});
  assert.deepEqual(f.row(),before);
  assert.deepEqual(f.calls,[]);
  assert.equal(f.scripts.size,0);
});

test('worker reconciliation activates the same immutable owner and exact approved site without reimport',async()=>{
  const f=fixture(),owner=await f.install(await makeTool()),before=f.row();
  f.enabled=true;
  f.restart();
  await f.service.reconcile();
  assert.equal((await f.verify(owner)).ready,true);
  assert.deepEqual(f.row(),{...before,nativeState:'registered'});
  const script=f.scripts.get(before.nativeId);
  assert.deepEqual(script.matches,[match]);
  assert.equal(script.allFrames,false);
  assert.equal(script.world,'USER_SCRIPT');
  assert.deepEqual(f.calls,['configureWorld','register']);
});

test('switch turning off after preflight and before registration still returns a durable pending receipt',async()=>{
  const f=fixture('guarded namespace'),tool=await makeTool();
  f.enabled=true;
  await f.prepare(tool);
  const owner=await f.setParent(tool);
  f.beforeReadScripts=filter=>{if(filter)f.enabled=false;};
  const pending=await f.import(owner);
  assert.equal(pending.nativeState,'waiting-user-scripts');
  assert.equal(pending.ready,false);
  const before=f.row();
  assert.deepEqual(f.calls,[]);
  delete f.beforeReadScripts;
  f.enabled=true;
  assert.equal((await f.check(owner)).ready,true);
  assert.deepEqual(f.row(),{...before,nativeState:'registered'});
});

test('a failure known to precede dispatch can be checked again without reimport',async()=>{
  const f=fixture(),owner=await f.install(await makeTool()),before=f.row();
  f.enabled=true;
  f.beforeCheckGrant=()=>{
    if(f.row()?.nativeState==='activation-unconfirmed')throw Error('Transient grant read error');
  };
  await assert.rejects(f.check(owner),/Transient grant read error/);
  assert.deepEqual(f.calls,['configureWorld']);
  assert.deepEqual(f.row(),before);
  delete f.beforeCheckGrant;
  assert.equal((await f.check(owner)).ready,true);
  assert.deepEqual(f.calls,['configureWorld','configureWorld','register']);
});

const registerUnavailable="'userScripts.register' is not available in this context.";

test('the synchronous Chrome register guard restores waiting without changing the installation',async()=>{
  const f=fixture('guarded namespace'),owner=await f.install(await makeTool()),before=f.row();
  f.enabled=true;
  f.beforeDispatchRegister=()=>{f.enabled=false;throw Error(registerUnavailable);};
  assert.equal((await f.check(owner)).nativeState,'waiting-user-scripts');
  assert.deepEqual(f.row(),before);
  assert.deepEqual(f.calls,['configureWorld']);
  assert.equal(f.scripts.size,0);
  f.restart();
  f.enabled=true;
  delete f.beforeDispatchRegister;
  assert.equal((await f.check(owner)).ready,true);
  assert.deepEqual(f.row(),{...before,nativeState:'registered'});
  assert.deepEqual(f.calls,['configureWorld','configureWorld','register']);
});

test('an asynchronous registration rejection cannot restore waiting even with the same guard text',async()=>{
  const f=fixture('guarded namespace'),owner=await f.install(await makeTool()),before=f.row();
  f.enabled=true;
  f.onRegister=()=>{f.enabled=false;throw Error(registerUnavailable);};
  await assert.rejects(f.check(owner),{message:registerUnavailable});
  assert.deepEqual(f.row(),{...before,nativeState:'activation-unconfirmed'});
  f.restart();
  f.enabled=true;
  await assert.rejects(f.check(owner),{code:'E_EFFECT_UNKNOWN'});
  assert.deepEqual(f.calls,['configureWorld','register']);
  assert.equal(f.scripts.size,0);
});

test('an attested companion survives switch off and worker restart, without changing its registration',async()=>{
  const f=fixture('guarded namespace'),owner=await f.install(await makeTool());
  f.enabled=true;
  assert.equal((await f.check(owner)).ready,true);
  const before=f.row(),registration=structuredClone(f.scripts.get(before.nativeId));
  f.enabled=false;
  f.restart();await f.service.reconcile();
  const [paused]=(await f.list()).installed;
  assert.equal(paused.nativeState,'paused-user-scripts');
  assert.equal(paused.ready,false);
  assert.deepEqual(f.row(),before);
  f.enabled=true;
  assert.equal((await f.check(owner)).ready,true);
  assert.deepEqual(f.row(),before);
  assert.deepEqual(f.scripts.get(before.nativeId),registration);
  assert.deepEqual(f.calls,['configureWorld','register']);
});

test('a real site grant lost while the switch is off cannot be restored by switching it back on',async()=>{
  const f=fixture(),owner=await f.install(await makeTool());
  f.enabled=true;
  assert.equal((await f.check(owner)).ready,true);
  const before=f.row();
  f.enabled=false;
  f.siteGranted=false;
  f.restart();await f.service.reconcile();
  const after=f.row();
  assert.equal(after.authorization.status,'suspended');
  assert.equal(after.error.code,'E_PERMISSION');
  assert.notEqual(after.token,before.token);
  f.enabled=true;
  f.siteGranted=true;
  await assert.rejects(f.check(owner),{code:'E_PAGE_INSTALLATION'});
  assert.deepEqual(f.calls,['configureWorld','register']);
});

test('revoking a pending companion site prevents activation after the site permission returns',async()=>{
  const f=fixture(),owner=await f.install(await makeTool()),before=f.row();
  f.siteGranted=false;
  await f.service.revokePermissions({origins:[hostOrigin]});
  assert.equal(f.row().authorization.status,'suspended');
  assert.equal(f.row().authorization.generation,before.authorization.generation+1);
  f.enabled=true;
  f.siteGranted=true;
  f.restart();
  await f.service.reconcile();
  await assert.rejects(f.check(owner),{code:'E_PAGE_INSTALLATION'});
  assert.deepEqual(f.calls,[]);
});

test('site revocation during world configuration fences the deferred registration dispatch',async()=>{
  const f=fixture(),owner=await f.install(await makeTool());
  f.enabled=true;
  let revocation;
  f.afterConfigure=()=>{
    // Queue the event without awaiting it inside the in-flight mutation.
    revocation=f.service.revokePermissions({origins:[hostOrigin]});
  };
  await assert.rejects(f.check(owner),{code:'E_PERMISSION'});
  await revocation;
  assert.deepEqual(f.calls,['configureWorld']);
  assert.equal(f.row().authorization.status,'suspended');
});

for(const change of ['disable','replace'])test(
  'a companion '+change+' during a check cannot register the old installation',async()=>{
  const f=fixture(),oldOwner=await f.install(await makeTool()),before=f.row();
  const updated=change==='replace'?await makeTool(2):null;
  if(updated)assert.equal((await f.prepare(updated)).status,'prepared');
  f.enabled=true;
  let owner;
  f.afterConfigure=async()=>{
    if(updated)owner=await f.setParent(updated,'review-2');
    else f.disable();
  };
  await assert.rejects(f.check(oldOwner),{code:'E_APP_PAGE_OWNER'});
  assert.deepEqual(f.row(),before);
  f.afterConfigure=null;
  await f.service.reconcile();
  await assert.rejects(f.check(oldOwner),{code:'E_APP_PAGE_OWNER'});
  assert.deepEqual(f.calls,['configureWorld']);
  assert.equal(f.scripts.size,0);
  if(updated){
    await f.synchronize();
    const receipt=await f.import(owner);
    assert.equal(receipt.ready,true);
    assert.deepEqual(f.row().appOwner,owner);
    assert.notEqual(f.row().authorization.installationId,before.authorization.installationId);
    assert.ok(!f.scripts.has(before.nativeId)||f.row().nativeId===before.nativeId);
  }
});

test('uninstall retires a never dispatched companion while the switch is still off',async()=>{
  const f=fixture(),owner=await f.install(await makeTool());
  await f.setParent(null,'removed');
  assert.deepEqual(await f.synchronize(),{status:'synchronized',retired:[programId],cleanupPending:[],revocationPending:[]});
  assert.equal(f.row(),undefined);
  f.enabled=true;
  await f.service.reconcile();
  await assert.rejects(f.check(owner),{code:'E_APP_PAGE_OWNER'});
  assert.deepEqual(f.calls,[]);
});

test('a pending companion replacement activates only the newly reviewed revision',async()=>{
  const f=fixture(),oldOwner=await f.install(await makeTool()),old=f.row(),updated=await makeTool(2);
  assert.equal((await f.prepare(updated)).status,'prepared');
  const owner=await f.setParent(updated,'review-2');
  await assert.rejects(f.check(oldOwner),{code:'E_APP_PAGE_OWNER'});
  assert.deepEqual((await f.synchronize()).retired,[programId]);
  assert.equal((await f.import(owner)).ready,false);
  assert.deepEqual(f.calls,[]);
  f.enabled=true;
  assert.equal((await f.check(owner)).ready,true);
  assert.deepEqual(f.row().appOwner,owner);
  assert.equal(f.row().sourceHash,updated.pageModule.sourceHash);
  assert.notEqual(f.row().token,old.token);
  await assert.rejects(f.service.handleBoot({protocol:PAGE_BOOT_PROTOCOL,nativeId:old.nativeId,token:old.token},
    {id:'test',url:'https://example.com/demo/fixture',documentId:'web-document',frameId:0,tab:{id:1,incognito:false}}),{code:'E_PERMISSION'});
  assert.deepEqual(f.calls,['configureWorld','register']);
});

for(const readback of ['exact','missing','changed scope','changed bootstrap'])
test('a lost register reply is settled by readback without replay: '+readback,async()=>{
  const f=fixture(),owner=await f.install(await makeTool()),before=f.row();
  f.enabled=true;
  f.onRegister=script=>{
    if(readback==='changed scope')script.matches=[hostOrigin];
    if(readback==='changed bootstrap')script.js[0].code+='\n// different bootstrap';
    if(readback!=='missing')f.scripts.set(script.id,script);
    throw Error('Chrome registration reply lost');
  };
  await assert.rejects(f.check(owner));
  assert.deepEqual(f.row(),{...before,nativeState:'activation-unconfirmed'});
  f.restart();
  await f.service.reconcile();
  if(readback==='exact'){
    assert.equal((await f.verify(owner)).ready,true);
    assert.deepEqual(f.row(),{...before,nativeState:'registered'});
  }else{
    await assert.rejects(f.check(owner),{code:'E_EFFECT_UNKNOWN'});
    assert.deepEqual(f.row(),{...before,nativeState:'activation-unconfirmed'});
  }
  assert.deepEqual(f.calls,['configureWorld','register']);
});
