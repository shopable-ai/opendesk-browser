import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {randomUUID,createHash} from 'node:crypto';
import {createPageScriptPreview} from '../../src/scripting/user-scripts/preview.js';
import {createPreviewAdmission} from '../../src/platform/host/preview-admission.js';
import {createManagedUIPreview} from '../../src/native-agent/managed-preview.js';
import {wrapPageFrameSource} from '../../src/scripting/user-scripts/page-frame-resources.js';
import {loadFakeBuiltin} from './builtin-support.mjs';
import {describeDependencyManifest as describeClassic} from '../../src/scripting/user-scripts/dependency-manifest.js';
import {describeDependencyManifest as describeManaged} from '../../src/scripting/user-scripts/dependency-manager.js';

const target={tabId:5,frameId:0,documentId:'parent-document',expectedWindowId:9,expectedUrl:'https://example.com/demo'};
const resourceCode='globalThis.resourceRuns=(globalThis.resourceRuns||0)+1; globalThis.resourceData=OpenDeskFrame.data;';
const source=await wrapPageFrameSource('async function main(){return "parent ready";}',[{resourceId:'renderer',code:resourceCode}]);
const hash=value=>createHash('sha256').update(value).digest('hex');
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const retirement=message=>Object.fromEntries(Object.entries({...message,operation:'retire'})
  .filter(([key])=>!['resourceId','portToken','data','url'].includes(key)));

// Component-only exact-receipt/Authority fixture. The existing frame-runtime
// suite exercises the DOM/WindowProxy/MessagePort bootstrap separately. These
// stubs are never Chrome/native evidence.
function fixture(){
  const f={calls:[],session:{},contexts:new Map(),configs:new Map(),slot:null,revoked:false,
    permission:true,documentId:target.documentId,childGone:false,resourceFailure:false,resets:[],
    sender:{id:'extension',documentId:'host-document',url:'chrome-extension://extension/host.html'}};
  const host={registrationId:'host-one'};
  const assertHost=async sender=>{
    assert.equal(sender.documentId,f.sender.documentId);
    if(f.revoked)throw Object.assign(Error('host revoked'),{code:'E_OWNER'});
    return host;
  };
  const storage={transaction:async(stores,mode,work)=>work({
    get:async(name,key)=>name==='runs'?structuredClone(f.slot):undefined,
    put:async(name,value)=>{assert.equal(name,'runs');f.slot=structuredClone(value);}
  })};
  const root=()=>({frameId:0,documentId:f.documentId,url:target.expectedUrl,documentLifecycle:'active'});
  const child=()=>({frameId:7,documentId:'child-document',parentDocumentId:target.documentId,parentFrameId:0,
    url:'about:blank#opendesk-'+f.message?.requestId,documentLifecycle:'active'});
  const listeners=[];
  const api={runtime:{id:'extension'},storage:{session:{
    get:async key=>({[key]:structuredClone(f.session[key])}),
    set:async value=>Object.assign(f.session,structuredClone(value))}},
    tabs:{get:async()=>({id:5,windowId:9,active:true,incognito:false,status:'complete',url:target.expectedUrl}),
      query:async()=>[{id:5,active:true}]},
    permissions:{contains:async()=>f.permission,onRemoved:{addListener:fn=>listeners.push(fn)}},
    webNavigation:{getAllFrames:async()=>[root(),...(!f.childGone&&f.message?[child()]:[])],
      getFrame:async()=>f.childGone?null:child()},
    userScripts:{getScripts:async()=>[],
      getWorldConfigurations:async()=>[...f.configs.values()],
      configureWorld:async config=>f.configs.set(config.worldId,config),
      resetWorldConfiguration:async worldId=>{f.resets.push(worldId);f.configs.delete(worldId);},
      execute:async request=>{
        f.calls.push(request);
        const documentId=request.target.documentIds[0],frameId=documentId===target.documentId?0:7;
        const code=request.js.map(row=>row.code).join('\n;\n');
        if(code.startsWith('__opendeskPageFramesV1.inspect('))
          return [{frameId,documentId,result:{url:f.message.url,portToken:f.message.portToken,confirmed:true}}];
        const id=request.worldId||'default';
        if(!f.contexts.has(id))f.contexts.set(id,vm.createContext({document:{},window:{},setTimeout,clearTimeout,
          startFrame:()=>f.startFrame(),crypto:globalThis.crypto}));
        const context=f.contexts.get(id);
        if(code.startsWith('const __opendeskFrameState=')){
          vm.runInContext('const __opendeskFrameState={port:{}};',context);
          return [{frameId,documentId,result:true}];
        }
        const result=await vm.runInContext(code,context);
        if(code.startsWith('const OpenDeskFrame=')&&f.resourceWait)await f.resourceWait();
        if(code.startsWith('const OpenDeskFrame=')&&f.resourceFailure)return [{frameId,documentId}];
        return [{frameId,documentId,result:result===undefined?undefined:JSON.parse(JSON.stringify(result))}];
      }}
  };
  const admission=createPreviewAdmission({storage,assertHost,currentHost:async()=>assertHost(f.sender)});
  f.restart=()=>{f.service=createPageScriptPreview({api,storage,assertHost,admission,loadBuiltin:loadFakeBuiltin,
    managedFactory:createManagedUIPreview,
    dependencies:{loadForExecution:async()=>({entries:[],lockId:null,manifestDigest:'d'.repeat(64)})}});};
  f.restart();
  f.api=api;
  f.rows=()=>f.session.opendeskPagePreviewWorldsD1||[];
  f.parent=()=>f.rows().find(row=>row.managed);
  f.request=(sourceUtf8=source)=>({sourceUtf8,entryFormat:'async-main',lockId:null,target,
    managedUI:{previewId:randomUUID(),bindingId:'browser-v1-'+'a'.repeat(24),enabled:true}});
  f.begin=async sourceUtf8=>f.service.preview(f.request(sourceUtf8),f.sender);
  f.frameMessage=()=>{
    const row=f.parent(),binding=row.previewFrames;
    return {protocol:'opendesk.page-installed.boot.v1',action:'page-frame',previewId:row.managed.previewId,
      worldId:row.worldId,sourceHash:row.managed.sourceHash,receiptNonce:binding.receiptNonce,
      operation:'execute',requestId:randomUUID(),resourceId:'renderer',portToken:randomUUID(),data:{title:'中文 English 123'}};
  };
  f.frame=async(message=f.frameMessage(),sender={id:'extension',tab:{id:5,incognito:false},frameId:0,
    documentId:target.documentId,url:target.expectedUrl,origin:'https://example.com'})=>{
    f.message={...message,...(message.operation==='execute'?{url:'about:blank#opendesk-'+message.requestId}:{})};
    return f.service.handlePreviewFrame(f.message,sender);
  };
  f.revoke=()=>{f.permission=false;listeners.forEach(fn=>fn({origins:['https://example.com/*']}));};
  f.enrollCleanup=cleanup=>{
    const context=f.contexts.get(f.parent().worldId);context.cleanupFrame=cleanup;
    vm.runInContext('__opendeskManagedUIRegistryV1.enroll("owned-frame",cleanupFrame,()=>({clean:true}));',context);
  };
  return f;
}

test('managed developer preview binds fixed bytes, keeps parent messaging through child allocation, and has no installation identity',async()=>{
  const f=fixture(),parent=await f.begin();
  assert.equal(parent.state,'preview-evaluated');
  assert.equal(parent.sourceHash,hash(source));
  assert.equal(f.api.userScripts.register,undefined);
  assert.equal(f.parent().previewFrames.sourceHash,parent.sourceHash);
  const config=f.configs.get(parent.worldId);
  assert.equal(config.messaging,true);
  assert(f.calls.some(call=>call.js.some(row=>row.code.includes('const __opendeskPageFramesV1='))));
  const receipt=await f.frame();
  assert.equal(receipt.state,'evaluated');assert.equal(receipt.resourceSha256,hash(resourceCode));
  assert.equal(receipt.previewId,parent.managedPreviewId);assert.equal(receipt.sourceHash,parent.sourceHash);
  for(const key of ['installationId','programId','revision','grantGeneration','executionKey'])assert(!Object.hasOwn(receipt,key));
  assert.equal(f.resets.includes(parent.worldId),false,'child allocation preserves the live preview parent channel');
  const childContext=[...f.contexts.values()].find(context=>context.resourceRuns===1);
  assert.equal(childContext.resourceData.title,'中文 English 123');
  assert.equal(f.slot.preview,undefined);
});

test('a parent awaiting createFrame shares its original Authority slot without deadlock',async()=>{
  const f=fixture();let sharedNonce;
  f.startFrame=async()=>{sharedNonce=f.slot.preview.nonce;const receipt=await f.frame();
    assert.equal(f.slot.preview.nonce,sharedNonce);return receipt.resourceId;};
  const waitingSource=await wrapPageFrameSource('async function main(){return await startFrame();}',[{resourceId:'renderer',code:resourceCode}]);
  const receipt=await f.begin(waitingSource);
  assert.equal(receipt.resultText,'"renderer"');assert.equal(f.slot.preview,undefined);
});

test('preview frame rejects forged sender, source/world/nonce, changed document, original host and revoked site',async()=>{
  for(const change of [
    (f,m,s)=>{s.id='other-extension';},(f,m,s)=>{s.frameId=2;},(f,m,s)=>{s.documentId='other-document';},
    (f,m,s)=>{s.tab.id=6;},(f,m,s)=>{s.url+='?other';},(f,m,s)=>{s.origin='https://other.example';},
    (f,m)=>{m.worldId='another-world';},(f,m)=>{m.sourceHash='b'.repeat(64);},
    (f,m)=>{m.receiptNonce=randomUUID();},(f,m)=>{m.previewId=randomUUID();},
    f=>{f.revoked=true;},f=>{f.documentId='new-document';},f=>f.revoke()
  ]){
    const f=fixture();await f.begin();const message=f.frameMessage();
    const sender={id:'extension',tab:{id:5,incognito:false},frameId:0,documentId:target.documentId,
      url:target.expectedUrl,origin:'https://example.com'};
    change(f,message,sender);
    await assert.rejects(f.frame(message,sender));
    assert(!f.calls.some(call=>call.js.some(row=>row.code.startsWith('const OpenDeskFrame='))));
  }
});

test('Stop blocks new source but permits observing removed children without reauthorization',async()=>{
  const f=fixture(),parent=await f.begin();await f.frame();const prior={...f.message};
  await f.service.retire({previewId:parent.managedPreviewId},f.sender);
  await assert.rejects(f.frame(),{code:'E_FRAME_IDENTITY'});
  f.childGone=true;f.revoke();f.revoked=true;
  const {resourceId,portToken,data,url,...identity}=prior;
  const receipt=await f.frame({...identity,operation:'retire'});
  assert.equal(receipt.state,'retired');assert.equal(receipt.contextGone,true);
});

test('unknown child effects retain Authority ownership and cannot replay; exact child disappearance releases it',async()=>{
  const f=fixture();await f.begin();f.resourceFailure=true;
  await assert.rejects(f.frame(),{code:'E_EFFECT_UNKNOWN'});const prior={...f.message};
  assert.equal(f.slot.preview.nonce,prior.requestId);
  await assert.rejects(f.frame(),{code:'E_OWNER'});
  assert.equal(f.calls.filter(call=>call.js.some(row=>row.code.startsWith('const OpenDeskFrame='))).length,1);
  f.childGone=true;
  const {resourceId,portToken,data,url,...identity}=prior;
  await f.frame({...identity,operation:'retire'});
  assert.equal(f.slot.preview,undefined);
});

test('unknown child effect keeps a shared parent reservation even after a confirmed parent handles the error',async()=>{
  const f=fixture();f.resourceFailure=true;let prior;
  f.startFrame=async()=>{try{await f.frame();}catch{}prior={...f.message};return 'handled';};
  const waitingSource=await wrapPageFrameSource('async function main(){return await startFrame();}',[{resourceId:'renderer',code:resourceCode}]);
  const parent=await f.begin(waitingSource);
  assert.equal(parent.resultText,'"handled"');assert.equal(f.slot.preview.nonce,parent.receiptNonce);
  f.childGone=true;
  const {resourceId,portToken,data,url,...identity}=prior;
  await f.frame({...identity,operation:'retire'});
  assert.equal(f.slot.preview,undefined);
});

test('fixed preview resources require managed lifecycle and an intact resource hash before main code',async()=>{
  const f=fixture(),request=f.request();delete request.managedUI;
  await assert.rejects(f.service.preview(request,f.sender),{code:'E_UI_LIFECYCLE'});
  assert(!f.calls.some(call=>call.js.some(row=>row.code.includes('const __opendeskPageFramesV1='))));
  const corrupt=fixture();await assert.rejects(corrupt.begin(source.replace(resourceCode,'void 0;')));
  assert.equal(corrupt.parent(),undefined);
});

test('an occupied Controller slot and a lost worker preview context cannot authorize source',async()=>{
  const f=fixture();await f.begin();f.slot={currentRunId:'controller'};
  await assert.rejects(f.frame(),{code:'E_OWNER'});
  assert.equal(f.slot.currentRunId,'controller');
  const orphan=fixture();await orphan.begin();
  const message=orphan.frameMessage(),replacement=fixture();replacement.session=structuredClone(orphan.session);
  await assert.rejects(replacement.frame(message),{code:'E_FRAME_IDENTITY'});
});

test('large frame headers reuse the resource hash/size boundary in both dependency paths while plain code remains bounded',async()=>{
  const large=await wrapPageFrameSource('async function main(){return 1;}',[
    {resourceId:'renderer',code:'// '+ 'x'.repeat(140*1024)+'\nvoid 0;'}]);
  for(const describe of [describeClassic,describeManaged]){
    const identity=await describe({sourceUtf8:large,entryFormat:'async-main'});
    assert.deepEqual(identity.manifest.requires,[]);
    await assert.rejects(describe({sourceUtf8:large.replace('void 0;','void 1;'),entryFormat:'async-main'}),
      {code:'E_PAGE_FRAME_RESOURCE_HASH'});
    await assert.rejects(describe({sourceUtf8:'// '+'x'.repeat(129*1024),entryFormat:'async-main'}),{code:'E_SOURCE'});
  }
});
