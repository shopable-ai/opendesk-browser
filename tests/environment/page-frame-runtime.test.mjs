import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHash,randomUUID} from 'node:crypto';
import {createPageFrameRuntime,pageFrameBootstrapSource} from '../../src/scripting/user-scripts/page-frame-runtime.js';
import {wrapPageFrameSource} from '../../src/scripting/user-scripts/page-frame-resources.js';

const FORMAT='opendesk.page-frame.v1';
const RESOURCE_ID='renderer';
const RESOURCE_CODE='globalThis.resourceRuns++; globalThis.resourceData=OpenDeskFrame.data; globalThis.resourcePort=OpenDeskFrame.port;';
const RESOURCE_SHA=createHash('sha256').update(RESOURCE_CODE).digest('hex');
// Container/source-binding validation belongs to page-frame-resources.test.mjs.
const SOURCE=await wrapPageFrameSource('void 0;',[{resourceId:RESOURCE_ID,code:RESOURCE_CODE}]);
const PARENT_DOCUMENT='11111111-1111-4111-8111-111111111111';
const CHILD_DOCUMENT='22222222-2222-4222-8222-222222222222';
const PARENT_WORLD='opendesk-preview-d1-parent';
const CHILD_WORLD='opendesk-preview-d1-child';
const INPUT={label:'frame input',items:[1,2]};

// Component-only Chrome/DOM/ports: generated parent, handshake and resource code
// really runs in VM contexts. These replies are NOT Chrome/native evidence.
function fixture(t,frames=[]){
  const execution={programId:'sample.frame',revision:3,sourceHash:'a'.repeat(64),
    installationId:'44444444-4444-4444-8444-444444444444',grantGeneration:2,
    executionKey:'installed-execution',managedUI:{worldId:PARENT_WORLD}};
  const nonce='parent-receipt';
  let ledger=[{tabId:41,documentId:PARENT_DOCUMENT,worldId:PARENT_WORLD,
    installed:{...execution,receiptNonce:nonce,state:'evaluated',frames:structuredClone(frames)}}];
  const f={execution,calls:[],allocations:[],queries:[],states:[],messages:[],disposals:[],
    authorizations:0,revokeAt:0,gone:false,observationError:null,replaceProxy:false,
    portTransfers:0,rejectedSpoofs:0,policies:[],reply:(_kind,rows)=>rows};
  f.child={frameId:7,documentId:CHILD_DOCUMENT,parentFrameId:0,
    parentDocumentId:PARENT_DOCUMENT,url:'about:blank',documentLifecycle:'active',errorOccurred:false};
  const worlds={
    async records(){return structuredClone(ledger);},
    async editRecords(work){
      const rows=structuredClone(ledger),result=work(rows);
      ledger=rows;
      f.states.push(structuredClone(rows[0].installed.frames));
      return result;
    },
    async allocate(native,target){
      assert.equal(native,api.userScripts);
      f.allocations.push(structuredClone(target));
      return CHILD_WORLD;
    }
  };
  const parentListeners=new Set(),childListeners=new Set(),loads=new Map();
  const parentWindow={
    addEventListener(type,listener){assert.equal(type,'message');parentListeners.add(listener);},
    removeEventListener(type,listener){assert.equal(type,'message');parentListeners.delete(listener);}
  };
  const deliver=(listeners,event)=>{for(const listener of [...listeners])listener(event);};
  const childProxy={postMessage(data,origin,ports){
    assert.equal(origin,'*');f.portTransfers++;
    deliver(childListeners,{source:parentProxy,data,ports});
  }};
  const frame={isConnected:false,contentWindow:childProxy,attributes:new Map(),
    setAttribute(key,value){this.attributes.set(key,value);},
    getAttribute(key){return this.attributes.get(key);},
    addEventListener(type,listener){loads.set(type,listener);},
    remove(){this.isConnected=false;}
  };
  const parentProxy={postMessage(data,origin){
    assert.equal(origin,'*');
    const inspect=()=>vm.runInContext(`__opendeskPageFramesV1.inspect(${JSON.stringify(f.message.requestId)})`,parentContext);
    // A matching payload from another WindowProxy, or a wrong challenge from
    // the real child, must not transfer the port or confirm the parent proof.
    for(const event of [
      {source:{},data},
      {source:childProxy,data:{...data,challenge:randomUUID()}}
    ]){
      deliver(parentListeners,event);
      assert.equal(inspect().confirmed,false);
      assert.equal(f.portTransfers,0);
      f.rejectedSpoofs++;
    }
    deliver(parentListeners,{source:childProxy,data});
  }};
  const ports=[{closed:false,close(){this.closed=true;}},{closed:false,close(){this.closed=true;}}];
  const childContext=vm.createContext({resourceRuns:0,parent:parentProxy,setTimeout,clearTimeout,
    document:{createElement(tag){assert.equal(tag,'meta');return {};},
      head:{appendChild(meta){f.policies.push(structuredClone(meta));}}},
    addEventListener(type,listener){assert.equal(type,'message');childListeners.add(listener);},
    removeEventListener(type,listener){assert.equal(type,'message');childListeners.delete(listener);}});
  const api={
    userScripts:{async execute(request){
      assert.equal(request.world,'USER_SCRIPT');
      assert.equal(request.js.length,1);
      const code=request.js[0].code;
      let kind,context,documentId,frameId,worldId;
      if(code.startsWith('__opendeskPageFramesV1.inspect(')){
        kind='parent';context=parentContext;documentId=PARENT_DOCUMENT;frameId=0;worldId=PARENT_WORLD;
        if(f.replaceProxy)frame.contentWindow={};
      }else if(code.startsWith('const __opendeskFrameState=')){
        kind='handshake';context=childContext;documentId=CHILD_DOCUMENT;frameId=7;worldId=CHILD_WORLD;
      }else if(code.startsWith('const OpenDeskFrame=')){
        kind='resource';context=childContext;documentId=CHILD_DOCUMENT;frameId=7;worldId=CHILD_WORLD;
        assert.deepEqual(f.policies,[{httpEquiv:'Content-Security-Policy',
          content:"default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; frame-src 'none'"}],
        'native handshake must install the child CSP before fixed resource evaluation');
      }else{
        assert.fail('Unexpected generated script');
      }
      assert.deepEqual(request.target,{tabId:41,documentIds:[documentId]});
      assert.equal(request.worldId,worldId);
      f.calls.push({kind,request:structuredClone(request)});
      const result=await vm.runInContext(code,context);
      return f.reply(kind,[{documentId,frameId,result:structuredClone(result)}]);
    }},
    webNavigation:{
      async getAllFrames(query){
        assert.deepEqual(query,{tabId:41});
        return [structuredClone(f.child)];
      },
      async getFrame(query){
        assert.deepEqual(query,{documentId:CHILD_DOCUMENT});
        f.queries.push(structuredClone(query));
        if(f.observationError)throw f.observationError;
        // Actual getFrame result fields; it need not echo documentId/frameId.
        return f.gone?null:{url:f.child.url,parentDocumentId:f.child.parentDocumentId,
          parentFrameId:f.child.parentFrameId,documentLifecycle:f.child.documentLifecycle};
      }
    }
  };
  const authorize=async()=>{
    if(++f.authorizations===f.revokeAt)
      throw Object.assign(new Error('Installation authorization revoked'),{code:'E_PAGE_AUTHORIZATION'});
  };
  const dispatch=async invoke=>{await authorize();return {completion:Promise.resolve(invoke())};};
  let runtime=createPageFrameRuntime({api,worlds});
  f.execute=message=>runtime.execute({message:message??f.message,
    sender:{url:'https://example.test/page',documentId:PARENT_DOCUMENT,frameId:0,tab:{id:41}},
    candidate:{sourceUtf8:SOURCE},execution},authorize,dispatch);
  f.restart=()=>{runtime=createPageFrameRuntime({api,worlds});};
  f.retire=()=>f.execute({operation:'retire',executionKey:execution.executionKey,
    receiptNonce:nonce,requestId:f.message.requestId});
  const parentContext=vm.createContext({window:parentWindow,
    document:{createElement(tag){assert.equal(tag,'iframe');return frame;}},
    chrome:{runtime:{async sendMessage(message){
      f.messages.push(structuredClone(message));
      if(message.operation==='execute'){
        assert.equal(message.url,'about:blank#opendesk-'+message.requestId);
        assert.equal(frame.src,message.url);
        f.message=structuredClone(message);
      }
      try{return {ok:true,data:await f.execute(message)};}
      catch(error){return {ok:false,error:{code:error.code,message:error.message}};}
    }}},
    crypto:{randomUUID},TextEncoder,setTimeout,clearTimeout,
    MessageChannel:class {constructor(){this.port1=ports[0];this.port2=ports[1];}},
    onDispose(dispose){f.disposals.push(dispose);},
    container:{appendChild(value){
      assert.equal(value,frame);frame.isConnected=true;f.child.url=frame.src;
      queueMicrotask(()=>loads.get('load')());
    }}
  });
  const bootstrap=pageFrameBootstrapSource({executionKey:execution.executionKey,
    receiptNonce:nonce,resourceIds:[RESOURCE_ID]});
  assert.doesNotMatch(bootstrap,/\bBlob\b|\b(?:createObjectURL|revokeObjectURL)\b|\bsrcdoc\b/);
  vm.runInContext(bootstrap,parentContext);
  f.open=(options={resourceId:RESOURCE_ID,data:INPUT})=>vm.runInContext(`__opendeskPageFramesV1.create(${JSON.stringify(options)},onDispose,container)`,parentContext);
  f.record=()=>structuredClone(ledger[0].installed.frames[0]);
  f.frames=()=>structuredClone(ledger[0].installed.frames);
  Object.assign(f,{frame,ports,childContext});
  t.after(async()=>{await Promise.allSettled(f.disposals.map(dispose=>dispose()));});
  return f;
}

test('execute binds exact parent/child documents and WindowProxy proof before evaluating the fixed resource',async t=>{
  const f=fixture(t),handle=await f.open();
  const receipt={format:FORMAT,requestId:f.message.requestId,resourceId:RESOURCE_ID,
    resourceSha256:RESOURCE_SHA,state:'evaluated',parentDocumentId:PARENT_DOCUMENT,documentId:CHILD_DOCUMENT,
    programId:f.execution.programId,revision:3,sourceHash:f.execution.sourceHash,
    installationId:f.execution.installationId,grantGeneration:2,executionKey:f.execution.executionKey};
  assert.deepEqual(structuredClone(handle.receipt),receipt);
  assert.deepEqual(f.record(),{requestId:f.message.requestId,resourceId:RESOURCE_ID,
    resourceSha256:RESOURCE_SHA,state:'evaluated',documentId:CHILD_DOCUMENT,frameId:7,worldId:CHILD_WORLD,receipt});
  assert.deepEqual(f.calls.map(row=>row.kind),['parent','handshake','parent','resource','parent']);
  for(const {kind,request} of f.calls){
    assert.equal(request.injectImmediately,true,
      `${kind} must bypass document_idle so the browser-created blank child can complete`);
  }
  assert.deepEqual(f.allocations,[{...f.child,tabId:41}]);
  assert.equal(f.authorizations,4);
  assert.equal(f.rejectedSpoofs,2);
  assert.equal(f.portTransfers,1);
  assert.equal(f.childContext.resourceRuns,1);
  assert.deepEqual(structuredClone(f.childContext.resourceData),INPUT);
  assert.equal(f.childContext.resourcePort,f.ports[1]);
  assert.equal(handle.port,f.ports[0]);
});

test('child creation rejects arbitrary source inputs and native requests require the exact about:blank fragment',async t=>{
  const f=fixture(t);
  for(const key of ['url','src','srcdoc','code']){
    await assert.rejects(f.open({resourceId:RESOURCE_ID,data:INPUT,[key]:'arbitrary source'}),{code:'E_FRAME_RESOURCE'});
  }
  assert.equal(f.messages.length,0);
  assert.equal(f.calls.length,0);
  await f.open();
  const calls=f.calls.length;
  for(const url of ['blob:https://example.test/'+randomUUID(),'https://example.test/frame',
    'about:blank','about:blank#opendesk-'+randomUUID()]){
    await assert.rejects(f.execute({...f.message,url}),{code:'E_FRAME_REQUEST'});
  }
  assert.equal(f.calls.length,calls,'invalid child URLs must not reach native probes or resource dispatch');
  assert.equal(f.childContext.resourceRuns,1);
});

test('a child owned by another parent document never receives handshake or resource code',async t=>{
  const f=fixture(t);f.child.parentDocumentId='another-parent-document';
  await assert.rejects(f.open(),{code:'E_FRAME_IDENTITY'});
  assert.deepEqual(f.calls.map(row=>row.kind),['parent']);
  assert.equal(f.allocations.length,0);
  assert.equal(f.childContext.resourceRuns,0);
});

test('replacing the captured WindowProxy invalidates the parent proof before any child injection',async t=>{
  const f=fixture(t);f.replaceProxy=true;
  await assert.rejects(f.open(),{code:'E_FRAME_STALE'});
  assert.deepEqual(f.calls.map(row=>row.kind),['parent']);
  assert.equal(f.allocations.length,0);
  assert.equal(f.childContext.resourceRuns,0);
});

test('a handshake receipt from a different child document cannot authorize resource injection',async t=>{
  const f=fixture(t);
  f.reply=(kind,rows)=>kind==='handshake'?[{...rows[0],documentId:'another-child-document'}]:rows;
  await assert.rejects(f.open(),{code:'E_EFFECT_UNKNOWN'});
  assert.deepEqual(f.calls.map(row=>row.kind),['parent','handshake']);
  assert.equal(f.childContext.resourceRuns,0);
  assert.equal(f.record().state,'failed');
});

test('a completed requestId cannot allocate another world or replay the resource',async t=>{
  const f=fixture(t);await f.open();
  const calls=f.calls.length,record=f.record();
  await assert.rejects(f.execute(),{code:'E_REQUEST_CONFLICT'});
  assert.equal(f.calls.length,calls);
  assert.equal(f.allocations.length,1);
  assert.equal(f.childContext.resourceRuns,1);
  assert.deepEqual(f.record(),record);
});

test('a lost resource receipt persists unknown and a new runtime cannot replay that requestId',async t=>{
  const f=fixture(t);f.reply=(kind,rows)=>kind==='resource'?[]:rows;
  await assert.rejects(f.open(),{code:'E_EFFECT_UNKNOWN'});
  assert.equal(f.childContext.resourceRuns,1,'code ran even though its execution receipt was lost');
  assert.equal(f.record().state,'unknown');
  assert.equal(f.record().error.code,'E_EFFECT_UNKNOWN');
  const calls=f.calls.length,record=f.record();f.restart();
  await assert.rejects(f.execute(),{code:'E_REQUEST_CONFLICT'});
  const requestId=randomUUID();
  await assert.rejects(f.execute({...f.message,requestId,url:'about:blank#opendesk-'+requestId}),{code:'E_REQUEST_CONFLICT'});
  assert.equal(f.calls.length,calls);
  assert.equal(f.allocations.length,1);
  assert.equal(f.childContext.resourceRuns,1);
  assert.deepEqual(f.record(),record);
});

test('revocation after the handshake but before resource dispatch blocks evaluation',async t=>{
  const f=fixture(t);f.revokeAt=2;
  await assert.rejects(f.open(),{code:'E_PAGE_AUTHORIZATION'});
  assert.deepEqual(f.calls.map(row=>row.kind),['parent','handshake','parent']);
  assert.equal(f.authorizations,2);
  assert.equal(f.childContext.resourceRuns,0);
  assert.equal(f.record().state,'failed');
  assert.equal(f.record().error.code,'E_PAGE_AUTHORIZATION');
  assert.ok(f.states.every(rows=>rows.every(row=>row.state!=='dispatched')));
});

test('retirement requires getFrame to confirm disappearance; live documents and observation errors stay unresolved',async t=>{
  const f=fixture(t);await f.open();
  const calls=f.calls.length,record=f.record();
  await assert.rejects(f.retire(),{code:'E_EFFECT_UNKNOWN'});
  assert.deepEqual(f.record(),record);
  f.observationError=new Error('getFrame observation failed');
  await assert.rejects(f.retire(),error=>error===f.observationError);
  assert.deepEqual(f.record(),record);
  f.observationError=null;f.gone=true;
  const retired=await f.retire();
  assert.deepEqual(retired,{format:FORMAT,state:'retired',requestId:f.message.requestId,
    documentId:CHILD_DOCUMENT,contextGone:true});
  assert.equal(f.record().state,'retired');
  assert.deepEqual(f.record().receipt,retired);
  assert.deepEqual(f.queries.at(-1),{documentId:CHILD_DOCUMENT});
  assert.equal(f.calls.length,calls,'retirement observes context loss without re-executing code');
});

test('seventeen sequential create/retire cycles retain history without exhausting the live frame quota',async t=>{
  let frames=[];
  for(let index=0;index<17;index++){
    // Carry the same installed execution's durable history across fresh VM
    // fixtures. Browser world-allocation limits are outside this component test.
    const f=fixture(t,frames),handle=await f.open();
    assert.equal(f.childContext.resourceRuns,1);
    f.gone=true;await handle.destroy();
    frames=f.frames();
    assert.equal(frames.length,index+1);
    assert.ok(frames.every(row=>row.state==='retired'));
  }
  assert.equal(new Set(frames.map(row=>row.requestId)).size,17,'retired request tombstones remain distinct');
});
