import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createChatGPTFilesController,CHATGPT_FILES_PROTOCOL,CHATGPT_PROJECT_PROTOCOL} from '../trusted/chatgpt-files-controller.js';
import {createFileWorkspaceService,FILES_PROTOCOL} from '../../../src/native-agent/file-workspace-service.js';

const sha=text=>createHash('sha256').update(text).digest('hex');
const workspaceId='workspace-11111111-1111-1111-1111-111111111111';
const source={tabId:7,windowId:3,documentId:'source-doc',url:'https://chatgpt.com/c/lifecycle-test'};
const owner={id:'extension',frameId:0,documentId:'owner-doc',url:'chrome-extension://extension/native-agent/settings.html#chatgpt-files',tab:{id:51,windowId:3}};
const pageSender={id:'extension',frameId:0,documentId:source.documentId,url:source.url,tab:{id:source.tabId,windowId:source.windowId}};
const FIXED='opendesk.chatgpt.files.fixed.v1',WRITES='opendesk.chatgpt.files.writes.v1';
const clone=value=>structuredClone(value);

// Chrome identity, storage and Native host replies are simulated. All controller
// calls cross the real file service, including permissions.contains, its final
// connection check, the controller's actual guard and the Port postMessage.
function setup(t,{local={},session={},content='safe original\n',unknownWrite=false}={}){
  let ownerOpen=true,sourceOpen=true,answer='',userText='',turnKey='initial-turn',answerKey='initial-answer',observed=false;
  let pendingGate,currentMethod,controller;
  const sent=[],guards=[],checkpoints=new Map();
  const storage=data=>({async get(key){return {[key]:clone(data[key])};},async set(values){Object.assign(data,clone(values));}});
  const localStorage=storage(local),sessionStorage=storage(session);
  const api={runtime:{id:'extension',getURL:path=>'chrome-extension://extension/'+path,
    async getContexts(){return ownerOpen?[{contextType:'TAB',documentId:owner.documentId,documentUrl:owner.url,tabId:owner.tab.id,frameId:0,incognito:false}]:[];}},
    storage:{local:localStorage,session:{...sessionStorage,async setAccessLevel(options){assert.equal(options.accessLevel,'TRUSTED_CONTEXTS');},
      async set(values){
        await sessionStorage.set(values);
        const phase=values[FIXED]?.rows[0]?.fixed.phase;
        if(phase&&!checkpoints.has(phase))checkpoints.set(phase,{local:clone(local),session:clone(session)});
      }}},
    tabs:{async get(id){return id===owner.tab.id?{...owner.tab,url:owner.url}:{id:source.tabId,windowId:source.windowId,url:sourceOpen?source.url:'https://chatgpt.com/c/navigated'};}},
    webNavigation:{async getFrame(){return {frameId:0,documentId:sourceOpen?source.documentId:'new-document',url:sourceOpen?source.url:'https://chatgpt.com/c/navigated',documentLifecycle:'active'};}},
    permissions:{contains(options){
      assert.deepEqual(options,{permissions:['nativeMessaging']});
      if(pendingGate?.method===currentMethod&&!pendingGate.entered){
        pendingGate.entered=true;pendingGate.notify();return pendingGate.wait;
      }
      return Promise.resolve(true);
    }}};
  const sessionId='native-session-lifecycle-123456';
  const port={postMessage(message){
    assert.equal(Object.hasOwn(message,'beforeDispatch'),false);
    sent.push(clone(message));
    queueMicrotask(()=>{
      let result,error;
      const {method,params}=message;
      if(method==='workspaces.list')result={workspaces:[{workspaceId,name:'isolated-test',access:'read-write',sourceId:'',leaseEpoch:''}]};
      else if(method==='files.read')result={workspaceId,path:params.path,content,bytes:Buffer.byteLength(content),sha256:sha(content)};
      else if(method==='files.write'){
        if(params.expectedSha256!==sha(content))error={code:'E_FILES_CONFLICT',message:'baseline changed',outcome:'NOT_DISPATCHED'};
        else{
          content=params.content;
          if(unknownWrite)error={code:'E_FILES_TIMEOUT',message:'host result unknown',outcome:'OUTCOME_UNKNOWN'};
          else result={workspaceId,path:params.path,saved:true,bytes:Buffer.byteLength(content),sha256:sha(content)};
        }
      }else throw Error('Unexpected Native method '+method);
      native.receive({v:1,kind:'files.response',protocol:FILES_PROTOCOL,sessionId,requestId:message.requestId,...(error?{error}:{result})});
    });
  }};
  const connection={enabled:true,ready:true,generation:1,port};
  const native=createFileWorkspaceService({api,connection:()=>connection,timeoutMs:1000});
  native.negotiate(1);native.receive({v:1,kind:'files.state',protocol:FILES_PROTOCOL,connected:true,sessionId,devLeaseEpoch:1});
  const files={state:native.state,request(method,params,expected){
    // Instrument, never replace, the closure produced by the real controller.
    assert.equal(typeof expected.beforeDispatch,'function',method+' must carry the real controller fence');
    const guard={method,calls:0,rejected:false},beforeDispatch=expected.beforeDispatch;guards.push(guard);currentMethod=method;
    return native.request(method,params,{...expected,beforeDispatch(){
      guard.calls++;
      try{return beforeDispatch();}catch(error){guard.rejected=true;guard.code=error.code;throw error;}
    }});
  }};
  const readAnswer=async()=>({ok:true,url:source.url,readerEpoch:'reader-epoch-lifecycle-12345678',turnKey,answerKey,answerComplete:true,
    userText,answerText:answer,taskIntentPresent:false,resultObserved:observed,blocks:[answer]});
  // The actual fill helper consumes both trusted hooks. Only executeScript and
  // its independent verification are simulated, retaining real dispatch fences.
  let fills=0,injections=0;
  api.scripting={async executeScript({func,args}){
    injections++;if(func.name==='fillChatGPTComposerOnPage')fills++;
    assert.equal(args[0].expectedUrl,source.url);
    return [{frameId:0,documentId:source.documentId,result:{ok:true,url:source.url,filled:true,sent:false,readBackVerified:true}}];
  }};
  controller=createChatGPTFilesController({api,files,readAnswer});
  t.after(()=>{pendingGate?.release(true);controller.dispose();native.dispose();});
  const call=(action,extra={})=>controller.handle({protocol:CHATGPT_FILES_PROTOCOL,action,...extra},owner);
  const event=(action='fixed-complete')=>({protocol:CHATGPT_PROJECT_PROTOCOL,action,readerEpoch:'reader-epoch-lifecycle-12345678',turnKey,answerKey,userSha256:sha(userText),answerSha256:sha(answer)});
  async function prepare(){
    await controller.claim({source,workspaceTab:owner.tab},owner);
    return call('prepare',{workspaceId,path:'demo.txt',operation:'read',allowEdit:true});
  }
  async function accept(text){
    answer=text;turnKey='turn-'+crypto.randomUUID();answerKey='answer-'+crypto.randomUUID();userText='Echo exactly '+text;
    const before=sent.length,ack=await controller.fixedComplete(event(),pageSender);
    assert.equal(ack.status,'accepted');assert.equal(sent.length,before,'fixedComplete only accepts; tick owns advancement');
    const status=await controller.fixedStatus(event('fixed-status'),pageSender);assert.equal(status.status,'accepted');
    return ack;
  }
  async function read(){const prepared=await prepare();await accept(JSON.stringify(prepared.request));await controller.tick();return session[FIXED].rows[0];}
  async function proposal(){
    const row=await read();observed=true;
    await accept(JSON.stringify({...row.resultPacket.result.editProposal,content:'safe modified\n'}));
    await controller.tick();const state=await call('poll');assert.ok(state.proposal?.reviewId);return state;
  }
  function arm(method){
    let notify,release;const reached=new Promise(resolve=>{notify=resolve;}),wait=new Promise(resolve=>{release=resolve;});
    pendingGate={method,notify,release,wait,entered:false};return {reached,release};
  }
  function invalidate(action){
    if(action==='owner close'){ownerOpen=false;return controller.drop(owner.tab.id);}
    if(action==='source nav'){sourceOpen=false;return controller.drop(source.tabId);}
    assert.equal(action,'pageStop');return controller.projectStop(pageSender);
  }
  return {controller,call,prepare,accept,read,proposal,arm,invalidate,sent,guards,local,session,checkpoints,
    counts:()=>({posts:sent.length,reads:sent.filter(row=>row.method==='files.read').length,writes:sent.filter(row=>row.method==='files.write').length,fills,injections}),
    text:()=>content};
}

for(const action of ['owner close','source nav','pageStop'])for(const method of ['workspaces.list','files.read','files.write']){
  test(`${action} observed during ${method} permission await: real guard rejects and Port gets zero new messages`,{timeout:5000},async t=>{
    const h=setup(t);let operation,review;
    if(method==='files.write')review=await h.proposal();
    else if(method==='files.read'){
      const prepared=await h.prepare();await h.accept(JSON.stringify(prepared.request));
    }else await h.controller.claim({source,workspaceTab:owner.tab},owner);
    const gate=h.arm(method);
    operation=method==='workspaces.list'?h.call('prepare',{workspaceId,path:'demo.txt',operation:'read',allowEdit:true}):
      method==='files.write'?h.call('approve',{reviewId:review.proposal.reviewId}):h.controller.tick();
    // Observe failures immediately, including methods whose controller surfaces
    // failure as a paused/error packet instead of rejecting the operation.
    const settled=operation.then(value=>({value}),error=>({error}));
    await gate.reached;
    const before=h.counts(),guard=h.guards.at(-1);
    assert.equal(guard.method,method);assert.equal(guard.calls,0);
    const invalidated=h.invalidate(action);gate.release(true);
    const outcome=await settled;await invalidated;
    assert.equal(guard.calls,1,'real Native service must invoke the real controller guard');
    assert.equal(guard.rejected,true);assert.equal(guard.code,'E_FILE_PAUSED');
    assert.deepEqual(h.counts(),before,'no extra postMessage, disk read/write or fill after observed invalidation');
    if(outcome.error)assert.equal(outcome.error.outcome,'NOT_DISPATCHED');
  });
}

for(const phase of ['read-in-flight','fill-in-flight'])test(`restored fixed ${phase} performs no automatic Native dispatch or fill`,async t=>{
  const first=setup(t);await first.read();
  const checkpoint=first.checkpoints.get(phase);assert.ok(checkpoint,'capture a real persisted phase');
  assert.equal(checkpoint.session[FIXED].rows[0].fixed.phase,phase);first.controller.dispose();
  const resumed=setup(t,clone(checkpoint)),before=resumed.counts();
  await resumed.controller.tick();await resumed.controller.tick();
  assert.deepEqual(resumed.counts(),before);
  const row=resumed.session[FIXED].rows[0];assert.equal(row.paused,true);assert.equal(row.pauseReason,'interrupted');
  assert.equal(row.fixed.phase,phase);
  if(phase==='fill-in-flight')assert.ok(Object.values(resumed.local[WRITES]).some(entry=>entry.kind==='fill'&&entry.state==='unknown'));
});

for(const corrupt of [null,[],42,'broken',{bad:{state:'unknown'}}])test(`corrupt local ledger fails closed: ${JSON.stringify(corrupt)}`,async t=>{
  const local={[WRITES]:corrupt},h=setup(t,{local});
  await assert.rejects(h.prepare(),{code:'E_FILE_STORAGE',outcome:'NOT_DISPATCHED'});
  assert.deepEqual(h.counts(),{posts:0,reads:0,writes:0,fills:0,injections:0});
  assert.deepEqual(h.local[WRITES],corrupt,'corruption must not be replaced with an empty ledger');
});

test('real unknown write plus matching reconciliation keeps readback-matched fence against a fresh request after restart',async t=>{
  const first=setup(t,{unknownWrite:true}),review=await first.proposal();
  const failed=await first.call('approve',{reviewId:review.proposal.reviewId});
  assert.equal(failed.resultStatus,'unknown');assert.equal(first.counts().writes,1);assert.equal(first.text(),'safe modified\n');
  const originalId=review.proposal.requestId;assert.equal(first.local[WRITES][originalId].state,'unknown');
  const reconciled=await first.call('reconcile');
  assert.equal(reconciled.resultStatus,'unknown');assert.match(reconciled.resultText,/"readBackVerified":true/);
  assert.match(reconciled.resultText,/"writeReceiptObserved":false/);
  assert.equal(first.local[WRITES][originalId].state,'readback-matched');
  const checkpoint={local:clone(first.local),session:clone(first.session),content:first.text()};first.controller.dispose();
  const resumed=setup(t,checkpoint),before=resumed.counts();await resumed.controller.tick();
  await assert.rejects(resumed.prepare(),{code:'E_FILE_UNKNOWN',outcome:'NOT_DISPATCHED'});
  assert.deepEqual(resumed.counts(),before);assert.equal(resumed.local[WRITES][originalId].state,'readback-matched');
  assert.equal(Object.values(resumed.local[WRITES]).filter(entry=>entry.kind!=='fill').length,1,'no replacement write ID');
});
