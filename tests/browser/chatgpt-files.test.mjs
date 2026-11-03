import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createChatGPTFilesController,CHATGPT_FILES_PROTOCOL} from '../../src/native-agent/chatgpt-files-controller.js';
import {installChatGPTFilesService} from '../../src/native-agent/chatgpt-files-service.js';
const sha=text=>createHash('sha256').update(text).digest('hex');
const workspaceId='workspace-11111111-1111-1111-1111-111111111111';
const source={tabId:7,documentId:'source-doc',url:'https://chatgpt.com/c/abc12345-1234-1234-1234-abcdef123456',windowId:3};
const owner={id:'extension',url:'chrome-extension://extension/native-agent/settings.html#chatgpt-files',frameId:0,documentId:'owner-doc',tab:{id:51,windowId:3}};
function setup({ledger={},unknown=false,fillUnknown=false,initialContent='safe original\n'}={}){
  let content=initialContent,answer,reads=0,writes=0,fills=0,epoch='',access='read-write',sessionId='native-session-123456',turnKey='turn-1',answerKey='answer-1',complete=true,observed=false,readError,afterReadError;
  const storage={async get(key){return {[key]:ledger[key]};},async set(value){Object.assign(ledger,structuredClone(value));}};
  const files={state:()=>({connected:true,sessionId,devLeaseEpoch:1}),async request(method,params,expected){
    assert.equal(expected.sessionId,sessionId);
    if(method==='workspaces.list')return {workspaces:[{workspaceId,name:'isolated-test',access,sourceId:'',leaseEpoch:epoch}]};
    assert.equal(params.workspaceId,workspaceId);assert.equal(params.leaseEpoch,epoch);
    if(method==='files.read'){reads++;if(afterReadError){readError=afterReadError;afterReadError=null;}return {workspaceId,path:params.path,content,bytes:Buffer.byteLength(content),sha256:sha(content)};}
    if(method==='files.write'){writes++;assert.ok(expected.requestId);if(params.expectedSha256!==sha(content))throw {code:'E_FILES_CONFLICT',outcome:'FAILED_CONFIRMED'};
      content=params.content;if(unknown)throw {code:'E_FILES_TIMEOUT',outcome:'OUTCOME_UNKNOWN'};
      return {workspaceId,path:params.path,saved:true,sha256:sha(content),bytes:Buffer.byteLength(content)};}
    if(method==='files.list')return {workspaceId,path:params.path,entries:[],truncated:false};
    throw Error(method);
  }};
  const api={runtime:{id:'extension',getURL:path=>'chrome-extension://extension/'+path},storage:{local:storage},
    tabs:{async get(){return {id:7,windowId:3,url:source.url};}},webNavigation:{async getFrame(){return {frameId:0,documentId:source.documentId,url:source.url,documentLifecycle:'active'};}}};
  const readAnswer=async(_api,_source,_id,options={})=>{if(readError){const error=readError;readError=null;throw error;}return ({url:source.url,turnKey,answerKey,answerComplete:complete,
    resultObserved:observed,blocks:[answer]});};
  const controller=createChatGPTFilesController({api,files,readAnswer,fillComposer:async()=>{fills++;if(fillUnknown)throw {code:'E_CHAT_FILL_UNKNOWN',outcome:'OUTCOME_UNKNOWN'};return {filled:true,sent:false};}});
  controller.claim({source,workspaceTab:owner.tab},owner);
  let last;
  const call=async(action,extra={},sender=owner)=>{
    const bound=action==='approve'?{reviewId:last?.proposal?.reviewId}:action==='fill'?{packetId:last?.[extra.packet==='prompt'?'promptPacketId':'resultPacketId']}:{};
    return last=await controller.handle({protocol:CHATGPT_FILES_PROTOCOL,action,...bound,...extra},sender);
  };
  const prepare=async(path='demo.txt',operation='read')=>{
    const state=await call('prepare',{workspaceId,path,operation,task:'test'});answer=JSON.stringify(state.request);return state;
  };
  const proposal=async()=>{await prepare();const state=await call('inspect');
    const result=JSON.parse(state.resultText.slice(state.resultText.indexOf('{')));
    answer=JSON.stringify({...result.editProposal,content:'safe modified\n'});
    await call('inspect');};
  return {call,prepare,proposal,controller,ledger,answer:value=>{answer=value;},content:value=>{content=value;},
    epoch:value=>{epoch=value;},access:value=>{access=value;},session:value=>{sessionId=value;},turn:value=>{turnKey=value;},revision:value=>{answerKey=value;},complete:value=>{complete=value;},observed:value=>{observed=value;},readError:value=>{readError=value;},afterReadError:value=>{afterReadError=value;},counts:()=>({reads,writes,fills}),text:()=>content};
}
test('web content cannot call the trusted controller or grant itself a directory',async()=>{
  const h=setup();await assert.rejects(h.call('state',{}, {...owner,url:source.url}),{code:'E_FILE_OWNER'});
  await assert.rejects(h.call('prepare',{workspaceId,path:'../secret.txt',operation:'read'}),{code:'E_FILES_PATH'});
  assert.deepEqual(h.counts(),{reads:0,writes:0,fills:0});
});
test('locked read refuses a model-chosen path and reads only approved bytes',async()=>{
  const h=setup(),state=await h.prepare();h.answer(JSON.stringify({...state.request,path:'other.txt'}));
  await assert.rejects(h.call('inspect'),{code:'E_FILE_SCOPE'});assert.equal(h.counts().reads,0);
  h.answer(JSON.stringify(state.request));const result=await h.call('inspect');assert.match(result.resultText,/safe original/);
  await assert.rejects(h.call('inspect'),{code:'E_FILE_REPLAY'});assert.equal(h.counts().reads,1);
});
test('write requires exact proposal confirmation, stable ID, SHA, and independent readback',async()=>{
  const h=setup();await h.proposal();assert.equal(h.counts().writes,0);
  const result=await h.call('approve');assert.equal(h.text(),'safe modified\n');
  assert.equal(result.resultStatus,'success');assert.match(result.resultText,/readBackVerified/);
  await assert.rejects(h.call('approve'),{code:'E_FILE_REPLAY'});assert.equal(h.counts().writes,1);
});
test('external edits and lease renewal invalidate the approved write',async()=>{
  const h=setup();await h.proposal();h.content('external change');
  await assert.rejects(h.call('approve'),{code:'E_FILES_CONFLICT'});assert.equal(h.text(),'external change');
  const other=setup();await other.proposal();other.epoch('new-lease-12345678');
  await assert.rejects(other.call('approve'),{code:'E_FILES_SESSION'});assert.equal(other.counts().writes,0);
});
test('unknown writes are reconciled by reads, never by another mutation',async()=>{
  const h=setup({unknown:true});await h.proposal();const result=await h.call('approve');
  assert.equal(result.resultStatus,'unknown');await assert.rejects(h.call('approve'),{code:'E_FILE_REPLAY'});
  const reconciled=await h.call('reconcile');assert.match(reconciled.resultText,/readBackVerified/);
  assert.equal(h.counts().writes,1);assert.equal(reconciled.resultStatus,'unknown');
});
test('unknown write recovery acquires current authority after Native reconnect without reusing the proposal',async()=>{
  const h=setup({unknown:true});await h.proposal();await h.call('approve');
  h.session('native-session-reconnected');h.epoch('renewed-lease-123456');
  const result=await h.call('reconcile');
  assert.match(result.resultText,/"readBackVerified":true/);assert.equal(result.resultStatus,'unknown');
  assert.equal(h.counts().writes,1);await assert.rejects(h.call('approve'),{code:'E_FILE_REPLAY'});
});
test('the durable unknown fence survives service restart and blocks a new mutation ID for the same path',async()=>{
  const ledger={},first=setup({ledger,unknown:true});await first.proposal();await first.call('approve');first.controller.dispose();
  const next=setup({ledger,initialContent:first.text()});await next.proposal();
  await assert.rejects(next.call('approve'),{code:'E_FILE_UNKNOWN'});assert.equal(next.counts().writes,0);
  const reconciled=await next.call('reconcile');assert.match(reconciled.resultText,/"readBackVerified":true/);
  await assert.rejects(next.call('approve'),{code:'E_FILE_REPLAY'});assert.equal(next.counts().writes,0);
});
test('read-only grants and a retired source document cannot dispatch writes',async()=>{
  const readOnly=setup();await readOnly.proposal();readOnly.access('read-only');
  await assert.rejects(readOnly.call('approve'),{code:'E_FILES_SESSION'});assert.equal(readOnly.counts().writes,0);
  const gone=setup();await gone.proposal();gone.controller.drop(source.tabId);
  await assert.rejects(gone.call('approve'),{code:'E_FILE_OWNER'});assert.equal(gone.counts().writes,0);
});
test('result fills once and is never called sent merely because it was filled',async()=>{
  const h=setup();await h.prepare();await h.call('inspect');const filled=await h.call('fill',{packet:'result'});
  assert.equal(filled.delivery,'filled');assert.equal(filled.observed,false);
  await assert.rejects(h.call('fill',{packet:'result'}),{code:'E_FILE_REPLAY'});assert.equal(h.counts().fills,1);
});
test('the existing development idle fence blocks file effects while a safe reload is held',async()=>{
  const messages=new Set(),event=()=>({addListener(){},removeListener(){}});let pending=0,calls=0;
  const api={runtime:{onMessage:{addListener:fn=>messages.add(fn),removeListener:fn=>messages.delete(fn)}},
    webNavigation:{onCommitted:event(),onHistoryStateUpdated:event()},tabs:{onRemoved:event()}};
  const service=installChatGPTFilesService({api,files:{state(){calls++;}},
    development:{held:true,nativeStarted(){pending++;return ()=>pending--;}}});
  const response=await new Promise(resolve=>{
    for(const listener of messages)listener({protocol:CHATGPT_FILES_PROTOCOL,action:'approve'},owner,resolve);
    assert.equal(pending,1);
  });
  await Promise.resolve();assert.equal(response.error.code,'E_DEV_RELOADING');
  assert.equal(pending,0);assert.equal(calls,0);service.dispose();assert.equal(messages.size,0);
});

test('automatic mode waits for a fresh complete answer, reads once and fills once without a write',async()=>{
  const h=setup();await h.prepare();await h.call('poll');assert.deepEqual(h.counts(),{reads:0,writes:0,fills:0});
  h.turn('turn-2');h.complete(false);await h.call('poll');assert.equal(h.counts().reads,0);
  h.complete(true);const read=await h.call('poll');assert.equal(read.delivery,'filled');assert.match(read.resultText,/safe original/);
  await h.call('poll');assert.deepEqual(h.counts(),{reads:1,writes:0,fills:1});
});
test('automatic mode only stages a proposal, binds exact review and fills the confirmed receipt once',async()=>{
  const h=setup();await h.prepare();h.turn('turn-2');const read=await h.call('poll');
  const result=JSON.parse(read.resultText.slice(read.resultText.indexOf('{')));
  h.turn('turn-3');h.answer(JSON.stringify({...result.editProposal,content:'safe modified\n'}));h.observed(true);
  const staged=await h.call('poll');assert.ok(staged.proposal.reviewId);assert.equal(staged.automation.active,false);
  await h.call('poll');assert.equal(h.counts().writes,0);
  await assert.rejects(h.call('approve',{reviewId:'stale-review'}),{code:'E_FILE_REVIEW'});assert.equal(h.counts().writes,0);
  const written=await h.call('approve',{reviewId:staged.proposal.reviewId});assert.equal(written.resultStatus,'success');
  await h.call('poll');await h.call('poll');assert.deepEqual(h.counts(),{reads:3,writes:1,fills:2});
});
test('packet identities, scope changes and unknown writes fence automatic processing',async()=>{
  const h=setup();await h.prepare();h.turn('turn-2');const read=await h.call('poll');
  await assert.rejects(h.call('fill',{packet:'result',packetId:'retired-packet'}),{code:'E_FILE_PACKET'});
  await h.call('pause');h.turn('turn-3');await h.call('poll');assert.deepEqual(h.counts(),{reads:1,writes:0,fills:1});
  const unknown=setup({unknown:true});await unknown.proposal();await unknown.call('approve');
  await unknown.call('poll');await unknown.call('poll');assert.equal(unknown.counts().writes,1);assert.equal(unknown.counts().fills,0);
});

test('automatic completion transitions wait safely; concurrent polls cannot duplicate a read',async()=>{
  const h=setup();await h.prepare();h.turn('turn-2');h.readError({code:'E_CHAT_INCOMPLETE'});
  const waiting=await h.call('poll');assert.equal(waiting.automation.active,true);assert.equal(h.counts().reads,0);
  await Promise.all([h.call('poll'),h.call('poll')]);assert.deepEqual(h.counts(),{reads:1,writes:0,fills:1});
});
test('an uncertain automatic composer fill pauses without replaying either file or composer effects',async()=>{
  const h=setup({fillUnknown:true});await h.prepare();h.turn('turn-2');
  await assert.rejects(h.call('poll'),{code:'E_CHAT_FILL_UNKNOWN'});
  const stopped=await h.call('poll');await h.call('poll');assert.equal(stopped.delivery,'unknown');
  assert.equal(stopped.automation.active,false);assert.deepEqual(h.counts(),{reads:1,writes:0,fills:1});
});
test('changing the approved scope pauses the exact staged proposal and refuses later confirmation',async()=>{
  const h=setup();await h.proposal();const state=await h.call('pause');
  await assert.rejects(h.call('approve',{reviewId:state.proposal.reviewId}),{code:'E_FILE_PAUSED'});
  assert.equal(h.counts().writes,0);assert.equal(state.automation.phase,'paused');
});

test('a consumed read whose answer resumes streaming pauses without losing its replay fence',async()=>{
  const h=setup();await h.prepare();h.turn('turn-2');h.afterReadError({code:'E_CHAT_STREAMING'});
  await assert.rejects(h.call('poll'),{code:'E_FILE_READ_CHANGED'});
  const stopped=await h.call('poll');await h.call('poll');assert.equal(stopped.automation.active,false);
  assert.deepEqual(h.counts(),{reads:1,writes:0,fills:0});
});
