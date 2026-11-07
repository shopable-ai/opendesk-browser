import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createChatGPTFilesController,CHATGPT_FILES_PROTOCOL,CHATGPT_PROJECT_PROTOCOL} from '../trusted/chatgpt-files-controller.js';
import {installChatGPTFilesService} from '../trusted/chatgpt-files-service.js';
const sha=text=>createHash('sha256').update(text).digest('hex');
const workspaceId='workspace-11111111-1111-1111-1111-111111111111';
const source={tabId:7,documentId:'source-doc',url:'https://chatgpt.com/c/abc12345-1234-1234-1234-abcdef123456',windowId:3};
const owner={id:'extension',url:'chrome-extension://extension/native-agent/settings.html#chatgpt-files',frameId:0,documentId:'owner-doc',tab:{id:51,windowId:3}};
function setup({ledger={},unknown=false,fillUnknown=false,fillError=null,initialContent='safe original\n',simulateDiscovery=true}={}){
  let userText='',content=initialContent,answer,reads=0,writes=0,fills=0,epoch='',access='read-write',sessionId='native-session-123456',turnKey='turn-1',answerKey='answer-1',complete=true,observed=false,taskIntentPresent=false,readError,afterReadError;
  const storage={async get(key){return {[key]:ledger[key]};},async set(value){Object.assign(ledger,structuredClone(value));}};
  const files={state:()=>({connected:true,sessionId,devLeaseEpoch:1}),async request(method,params,expected){
    assert.equal(expected.sessionId,sessionId);
    expected.beforeDispatch?.();
    if(method==='workspaces.list')return {workspaces:[{workspaceId,name:'isolated-test',access,sourceId:'',leaseEpoch:epoch}]};
    assert.equal(params.workspaceId,workspaceId);assert.equal(params.leaseEpoch,epoch);
    if(method==='files.read'){reads++;if(afterReadError){readError=afterReadError;afterReadError=null;}return {workspaceId,path:params.path,content,bytes:Buffer.byteLength(content),sha256:sha(content)};}
    if(method==='files.write'){writes++;assert.ok(expected.requestId);if(params.expectedSha256!==sha(content))throw {code:'E_FILES_CONFLICT',outcome:'FAILED_CONFIRMED'};
      content=params.content;if(unknown)throw {code:'E_FILES_TIMEOUT',outcome:'OUTCOME_UNKNOWN'};
      return {workspaceId,path:params.path,saved:true,sha256:sha(content),bytes:Buffer.byteLength(content)};}
    if(method==='files.list')return {workspaceId,path:params.path,entries:[],truncated:false};
    throw Error(method);
  }};
  const api={runtime:{id:'extension',getURL:path=>'chrome-extension://extension/'+path,
    async getContexts({documentIds}){return (documentIds||[]).map(documentId=>({contextType:'TAB',documentId,documentUrl:owner.url,tabId:owner.tab.id,frameId:0,incognito:false}));}},storage:{local:storage,session:{...storage,async setAccessLevel(){}}},
    tabs:{async get(){return {id:7,windowId:3,url:source.url};}},webNavigation:{async getFrame(){return {frameId:0,documentId:source.documentId,url:source.url,documentLifecycle:'active'};}}};
  const readAnswer=async(_api,_source,_id,options={})=>{if(readError){const error=readError;readError=null;throw error;}return ({url:source.url,turnKey,answerKey,answerComplete:complete,
    resultObserved:observed,...(options.readUserMessage?{userText,...(options.identityOnly?{taskIntentPresent}:{})}:{}),
    ...(options.eventText?{readerEpoch:'reader-epoch-12345678',userText,answerText:answer}:{}),blocks:[answer]});};
  const controller=createChatGPTFilesController({api,files,readAnswer,fillComposer:async()=>{fills++;if(fillError)throw fillError;if(fillUnknown)throw {code:'E_CHAT_FILL_UNKNOWN',outcome:'OUTCOME_UNKNOWN'};return {filled:true,sent:false};}});
  controller.claim({source,workspaceTab:owner.tab},owner);
  let last;
  let prepared=false,revision=0,baselineTurn;
  const event=()=>({protocol:CHATGPT_PROJECT_PROTOCOL,action:'fixed-complete',readerEpoch:'reader-epoch-12345678',turnKey,answerKey,
    userSha256:sha(userText),answerSha256:sha(answer)});
  const call=async(action,extra={},sender=owner)=>{
    const bound=action==='approve'?{reviewId:last?.proposal?.reviewId}:action==='fill'?{packetId:last?.[extra.packet==='prompt'?'promptPacketId':'resultPacketId']}:{};
    // This unit driver supplies a separate observed event. Raw poll coverage
    // disables it; the original bridge/service integration has its own fixture.
    if(simulateDiscovery&&prepared&&['inspect','poll'].includes(action)&&complete&&answer?.startsWith('{')&&
      !last?.proposal&&!['completed','paused'].includes(last?.automation.phase)&&(action==='inspect'||turnKey!==baselineTurn)){
      if(turnKey===baselineTurn)turnKey='fixed-turn-'+(++revision);
      try{await controller.fixedComplete(event(),{id:'extension',frameId:0,documentId:source.documentId,url:source.url,tab:{id:7,windowId:3}});}
      catch(error){if(!['E_CHAT_STREAMING','E_CHAT_PENDING','E_CHAT_INCOMPLETE'].includes(error.code))throw error;return last;}
    }
    last=await controller.handle({protocol:CHATGPT_FILES_PROTOCOL,action,...bound,...extra},sender);
    if(action==='prepare'){prepared=true;baselineTurn=turnKey;}
    return last;
  };
  const prepare=async(path='demo.txt',operation='read',allowEdit=true)=>{
    const state=await call('prepare',{workspaceId,path,operation,allowEdit,task:'test'});answer=JSON.stringify(state.request);return state;
  };
  const proposal=async()=>{await prepare();const state=await call('inspect');
    const result=JSON.parse(state.resultText.slice(state.resultText.indexOf('{')));
    observed=true;turnKey='edit-turn-'+(++revision);answerKey='edit-answer-'+revision;
    answer=JSON.stringify({...result.editProposal,content:'safe modified\n'});
    await call('inspect');};
  return {fillError:value=>{fillError=value;},userText:value=>{userText=value;},taskIntent:value=>{taskIntentPresent=value;},call,prepare,proposal,controller,api,files,readAnswer,ledger,answer:value=>{answer=value;},content:value=>{content=value;},
    event,epoch:value=>{epoch=value;},access:value=>{access=value;},session:value=>{sessionId=value;},turn:value=>{turnKey=value;},revision:value=>{answerKey=value;},complete:value=>{complete=value;},observed:value=>{observed=value;},readError:value=>{readError=value;},afterReadError:value=>{afterReadError=value;},counts:()=>({reads,writes,fills}),text:()=>content};
}
test('a verified pre-insertion prompt failure permits only an explicit retry of the same packet',async()=>{
  const h=setup({fillError:{code:'E_CHAT_COMPOSER',message:'no composer',outcome:'NOT_DISPATCHED'}});
  try{
    const initial=await h.prepare();
    const retry=await h.call('fill',{packet:'prompt'});
    assert.equal(retry.promptDelivery,'ready');assert.equal(retry.promptPacketId,initial.promptPacketId);
    assert.deepEqual(retry.request,initial.request);assert.equal(retry.automation.phase,'approved');
    const key='fill:'+initial.promptPacketId,entry=h.ledger['opendesk.chatgpt.files.writes.v1'][key];
    assert.equal(entry.state,'failed');assert.equal(entry.failure.outcome,'NOT_DISPATCHED');
    await assert.rejects(h.prepare(),{code:'E_FILE_DELIVERY_UNKNOWN'});
    await h.call('poll');assert.deepEqual(h.counts(),{reads:0,writes:0,fills:1});
    h.fillError(null);
    const filled=await h.call('fill',{packet:'prompt',packetId:initial.promptPacketId});
    assert.equal(filled.promptDelivery,'filled');assert.deepEqual(filled.request,initial.request);
    assert.equal(h.ledger['opendesk.chatgpt.files.writes.v1'][key].state,'confirmed');
    await assert.rejects(h.call('fill',{packet:'prompt'}),{code:'E_FILE_REPLAY'});
    assert.deepEqual(h.counts(),{reads:0,writes:0,fills:2});
  }finally{h.controller.dispose();}
});
test('uncertain or unclassified prompt failures retain the original persistent replay fence',async()=>{
  for(const outcome of ['OUTCOME_UNKNOWN',undefined]){
    const error={code:'E_CHAT_COMPOSER',message:'unverified response',...(outcome?{outcome}:{})};
    const h=setup({fillError:error});
    try{
      const initial=await h.prepare();
      await assert.rejects(h.call('fill',{packet:'prompt'}),{code:error.code});
      assert.equal((await h.call('state')).promptDelivery,'unknown');
      await assert.rejects(h.call('fill',{packet:'prompt'}),{code:'E_FILE_REPLAY'});
      await assert.rejects(h.prepare(),{code:'E_FILE_DELIVERY_UNKNOWN'});
      assert.equal(h.ledger['opendesk.chatgpt.files.writes.v1']['fill:'+initial.promptPacketId].state,'unknown');
      assert.deepEqual(h.counts(),{reads:0,writes:0,fills:1});
    }finally{h.controller.dispose();}
  }
});
test('retrying a definite prompt failure still rechecks the exact Native authority',async()=>{
  const h=setup({fillError:{code:'E_CHAT_COMPOSER',outcome:'NOT_DISPATCHED'}});
  try{
    await h.prepare();await h.call('fill',{packet:'prompt'});h.fillError(null);h.access('read-only');
    await assert.rejects(h.call('fill',{packet:'prompt'}),{code:'E_FILES_SESSION'});
    assert.deepEqual(h.counts(),{reads:0,writes:0,fills:1});
  }finally{h.controller.dispose();}
});
test('a persisted definite prompt failure survives worker restart without allocating another request',async()=>{
  const h=setup({fillError:{code:'E_CHAT_COMPOSER',outcome:'NOT_DISPATCHED'}});
  const original=await h.prepare();await h.call('fill',{packet:'prompt'});h.controller.dispose();
  let fills=0;
  const resumed=createChatGPTFilesController({api:h.api,files:h.files,readAnswer:h.readAnswer,
    fillComposer:async(_api,_source,_text,{operationId})=>{assert.equal(operationId,original.promptPacketId);fills++;}});
  try{
    const state=await resumed.handle({protocol:CHATGPT_FILES_PROTOCOL,action:'state'},owner);
    assert.equal(state.promptDelivery,'ready');assert.deepEqual(state.request,original.request);
    await resumed.handle({protocol:CHATGPT_FILES_PROTOCOL,action:'fill',packet:'prompt',packetId:original.promptPacketId},owner);
    assert.equal(fills,1);assert.equal(h.counts().reads,0);assert.equal(h.counts().writes,0);
  }finally{resumed.dispose();}
});
test('failure-proof storage loss never makes an unknown prompt retryable',async()=>{
  const h=setup({fillError:{code:'E_CHAT_COMPOSER',outcome:'NOT_DISPATCHED'}});
  try{
    const original=await h.prepare(),set=h.api.storage.local.set;
    h.api.storage.local.set=async value=>{
      if(value['opendesk.chatgpt.files.writes.v1']?.['fill:'+original.promptPacketId]?.state==='failed')throw Error('failure proof unavailable');
      return set(value);
    };
    await assert.rejects(h.call('fill',{packet:'prompt'}),/failure proof unavailable/);
    assert.equal((await h.call('state')).promptDelivery,'unknown');
    await assert.rejects(h.call('fill',{packet:'prompt'}),{code:'E_FILE_REPLAY'});
    assert.equal(h.ledger['opendesk.chatgpt.files.writes.v1']['fill:'+original.promptPacketId].state,'unknown');
    assert.equal(h.counts().fills,1);
  }finally{h.controller.dispose();}
});
test('loss of the entire prompt failure entry cannot turn a retry into a first fill or a fresh request',async()=>{
  for(const restart of [false,true]){
    const h=setup({fillError:{code:'E_CHAT_COMPOSER',outcome:'NOT_DISPATCHED'}});
    const original=await h.prepare();await h.call('fill',{packet:'prompt'});
    delete h.ledger['opendesk.chatgpt.files.writes.v1']['fill:'+original.promptPacketId];
    let fills=0,controller=h.controller;
    if(restart){h.controller.dispose();controller=createChatGPTFilesController({api:h.api,files:h.files,readAnswer:h.readAnswer,
      fillComposer:async()=>{fills++;}});}
    try{
      await assert.rejects(controller.handle({protocol:CHATGPT_FILES_PROTOCOL,action:'fill',packet:'prompt',
        packetId:original.promptPacketId},owner),{code:'E_FILE_DELIVERY_UNKNOWN'});
      await assert.rejects(controller.handle({protocol:CHATGPT_FILES_PROTOCOL,action:'prepare',workspaceId,
        path:'demo.txt',operation:'read'},owner),{code:'E_FILE_DELIVERY_UNKNOWN'});
      assert.equal(fills,0);assert.deepEqual(h.counts(),{reads:0,writes:0,fills:1});
    }finally{controller.dispose();}
  }
});
test('backend refuses file admission when the independently read reply contains a Task candidate',async()=>{
  const h=setup();h.userText('读取 isolated-test 项目 demo.txt，只读');h.controller.dispose();
  const controller=createChatGPTFilesController({api:h.api,files:h.files,
    readAnswer:async(...args)=>({...await h.readAnswer(...args),taskIntentPresent:true})});
  try{
    await assert.rejects(controller.conversationTask({task:'读取 isolated-test 项目 demo.txt，只读'},
      {id:'extension',frameId:0,documentId:source.documentId,url:source.url,tab:{id:7,windowId:3}}),{code:'E_CHAT_ROUTE',outcome:'NOT_DISPATCHED'});
    assert.deepEqual(h.counts(),{reads:0,writes:0,fills:0});
  }finally{controller.dispose();}
});
test('web content cannot call the trusted controller or grant itself a directory',async()=>{
  const h=setup();await assert.rejects(h.call('state',{}, {...owner,url:source.url}),{code:'E_FILE_OWNER'});
  await assert.rejects(h.call('prepare',{workspaceId,path:'../secret.txt',operation:'read'}),{code:'E_FILES_PATH'});
  assert.deepEqual(h.counts(),{reads:0,writes:0,fills:0});
});
test('fixed poll and alarm cannot discover a historical answer without the original event',async()=>{
  const h=setup({simulateDiscovery:false});await h.prepare('demo.txt','read',false);h.turn('turn-without-witness');
  await h.call('poll');await h.controller.tick();
  assert.deepEqual(h.counts(),{reads:0,writes:0,fills:0});
});
test('a completed fixed event cannot block a new owner round or replay old effects',async()=>{
  const h=setup({simulateDiscovery:false});
  const first=await h.prepare('demo.txt','read',false);h.turn('first-round');h.answer(JSON.stringify(first.request));
  const oldEvent=h.event();await h.controller.fixedComplete(oldEvent,pageSender);await h.controller.tick();
  assert.deepEqual(h.counts(),{reads:1,writes:0,fills:1});
  const nextOwner={...owner,documentId:'second-owner-doc',tab:{id:52,windowId:3}};
  h.api.runtime.getContexts=async({documentIds})=>documentIds.map(documentId=>({contextType:'TAB',documentId,documentUrl:owner.url,
    tabId:documentId===nextOwner.documentId?52:51,frameId:0,incognito:false}));
  await h.controller.claim({source,workspaceTab:nextOwner.tab},nextOwner);
  const next=await h.controller.handle({protocol:CHATGPT_FILES_PROTOCOL,action:'prepare',workspaceId,path:'demo.txt',operation:'read'},nextOwner);
  h.turn('second-round');h.answer(JSON.stringify(next.request));
  assert.notEqual(first.request.requestId,next.request.requestId);
  await h.controller.fixedComplete(h.event(),pageSender);await h.controller.tick();
  const before=h.counts();assert.deepEqual(before,{reads:2,writes:0,fills:2});
  assert.equal((await h.controller.fixedComplete(oldEvent,pageSender)).status,'completed');
  assert.equal((await h.controller.fixedStatus({...oldEvent,action:'fixed-status'},pageSender)).status,'completed');
  await h.controller.tick();assert.deepEqual(h.counts(),before);
});
test('worker recovery invalidates the old review and requires a newly displayed concrete approval',async()=>{
  const h=setup();await h.proposal();const old=(await h.call('state')).proposal.reviewId;
  h.controller.dispose();
  const resumed=createChatGPTFilesController({api:h.api,files:h.files,readAnswer:h.readAnswer});
  const call=(action,extra={})=>resumed.handle({protocol:CHATGPT_FILES_PROTOCOL,action,...extra},owner);
  try{
    await assert.rejects(call('approve',{reviewId:old}),{code:'E_FILE_PAUSED'});assert.equal(h.counts().writes,0);
    const current=await call('state');assert.ok(current.proposal.reviewId);assert.notEqual(current.proposal.reviewId,old);
    assert.equal(current.automation.phase,'paused');assert.equal(current.canApprove,true);
    await assert.rejects(call('approve',{reviewId:old}),{code:'E_FILE_REVIEW'});assert.equal(h.counts().writes,0);
    const done=await call('approve',{reviewId:current.proposal.reviewId});
    assert.equal(done.result.data.saved,true);assert.equal(done.result.data.readBackVerified,true);assert.equal(h.counts().writes,1);
  }finally{resumed.dispose();}
});
test('first manual project connection rejects a current Task reply before file I/O',async()=>{
  const h=setup();
  await h.controller.projectTask({task:projectTask},pageSender);
  h.taskIntent(true);
  await assert.rejects(h.call('connect-project',{workspaceId}),{code:'E_CHAT_ROUTE',outcome:'NOT_DISPATCHED'});
  assert.deepEqual(h.counts(),{reads:0,writes:0,fills:0});
  assert.equal((await h.controller.projectStatus(pageSender)).automation.active,false);
});
test('locked read refuses a model-chosen path and reads only approved bytes',async()=>{
  const h=setup(),state=await h.prepare();h.answer(JSON.stringify({...state.request,path:'other.txt'}));
  await assert.rejects(h.call('inspect'),{code:'E_FILE_SCOPE'});assert.equal(h.counts().reads,0);
  h.answer(JSON.stringify(state.request));const result=await h.call('inspect');assert.match(result.resultText,/safe original/);
  await assert.rejects(h.call('inspect'),{code:'E_FILE_EVENT'});assert.equal(h.counts().reads,1);
});
test('a fixed file reply containing a Task candidate cannot dispatch a read or write',async()=>{
  const read=setup();await read.prepare('demo.txt','read',false);read.turn('turn-2');read.taskIntent(true);
  await assert.rejects(read.call('poll'),{code:'E_CHAT_ROUTE',outcome:'NOT_DISPATCHED'});
  assert.deepEqual(read.counts(),{reads:0,writes:0,fills:0});
  const write=setup();await write.proposal();write.taskIntent(true);
  await assert.rejects(write.call('approve'),{code:'E_CHAT_ROUTE',outcome:'NOT_DISPATCHED'});
  assert.equal(write.counts().writes,0);assert.equal(write.text(),'safe original\n');
});

test('a file reply changed between full parsing and the conflict probe cannot dispatch',async()=>{
  const h=setup();h.controller.dispose();let changed=false;
  const controller=createChatGPTFilesController({api:h.api,files:h.files,
    readAnswer:async(...args)=>{
      const value=await h.readAnswer(...args);
      return changed&&args[3]?.identityOnly?{...value,answerKey:'replacement-answer'}:value;
    }});
  try{
    controller.claim({source,workspaceTab:owner.tab},owner);
    const state=await controller.handle({protocol:CHATGPT_FILES_PROTOCOL,action:'prepare',workspaceId,path:'demo.txt',operation:'read'},owner);
    h.answer(JSON.stringify(state.request));h.turn('accepted-turn');
    await controller.fixedComplete(h.event(),pageSender);changed=true;
    await assert.rejects(controller.handle({protocol:CHATGPT_FILES_PROTOCOL,action:'inspect'},owner),{code:'E_CHAT_ANSWER'});
    assert.deepEqual(h.counts(),{reads:0,writes:0,fills:0});
  }finally{controller.dispose();}
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
  assert.deepEqual(reconciled.comparison,{before:'safe original\n',proposed:'safe modified\n',readBack:'safe modified\n'});
  assert.equal(h.counts().writes,1);assert.equal(reconciled.resultStatus,'unknown');
});
test('unknown write recovery acquires current authority after Native reconnect without reusing the proposal',async()=>{
  const h=setup({unknown:true});await h.proposal();await h.call('approve');
  h.session('native-session-reconnected');h.epoch('renewed-lease-123456');
  const result=await h.call('reconcile');
  assert.match(result.resultText,/"readBackVerified":true/);assert.equal(result.resultStatus,'unknown');
  assert.equal(h.counts().writes,1);await assert.rejects(h.call('approve'),{code:'E_FILE_REPLAY'});
});
test('unknown write reconciliation shows different current bytes without claiming the original receipt',async()=>{
  const h=setup({unknown:true});await h.proposal();await h.call('approve');h.content('external later edit\n');
  const result=await h.call('reconcile');
  assert.equal(result.resultStatus,'unknown');assert.match(result.resultText,/"readBackVerified":false/);
  assert.deepEqual(result.comparison,{before:'safe original\n',proposed:'safe modified\n',readBack:'external later edit\n'});
  assert.equal(h.counts().writes,1);
});
test('the durable unknown fence survives service restart and blocks a new mutation ID for the same path',async()=>{
  const ledger={},first=setup({ledger,unknown:true});await first.proposal();await first.call('approve');first.controller.dispose();
  const next=setup({ledger,initialContent:first.text()});
  await assert.rejects(next.prepare(),{code:'E_FILE_UNKNOWN'});assert.equal(next.counts().writes,0);
  const reconciled=await next.call('reconcile');assert.match(reconciled.resultText,/"readBackVerified":true/);
  assert.equal(reconciled.comparison.readBack,'safe modified\n');
  await assert.rejects(next.prepare(),{code:'E_FILE_UNKNOWN'},'readback cannot retire an unknown in-flight write');
  await assert.rejects(next.call('approve'),{code:'E_FILE_PAUSED'});assert.equal(next.counts().writes,0);
});
test('read-only grants and a retired source document cannot dispatch writes',async()=>{
  const readOnly=setup();await readOnly.proposal();readOnly.access('read-only');
  await assert.rejects(readOnly.call('approve'),{code:'E_FILES_SESSION'});assert.equal(readOnly.counts().writes,0);
  const gone=setup();await gone.proposal();gone.controller.drop(source.tabId);
  await assert.rejects(gone.call('approve'),{code:'E_FILE_SOURCE'});assert.equal(gone.counts().writes,0);
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
  const done=await h.call('poll');await h.call('poll');assert.deepEqual(h.counts(),{reads:3,writes:1,fills:2});
  assert.equal(done.automation.phase,'completed');assert.equal(done.automation.active,false);
  assert.equal(done.delivery,'filled');assert.equal(done.observed,false);
});

test('read-only completes after confirmed fill without sending, and fresh rounds use current bytes',async()=>{
  const h=setup();let previous;
  for(let i=0;i<2;i++){
    const prepared=await h.call('prepare',{workspaceId,path:'demo.txt',operation:'read',task:'只读'});
    assert.deepEqual(h.counts(),{reads:i,writes:0,fills:i});
    assert.ok(prepared.prompt.includes(JSON.stringify(prepared.request)),'prompt includes complete exact JSON');
    if(previous){assert.notEqual(prepared.request.requestId,previous.requestId);assert.notEqual(prepared.request.bindingId,previous.bindingId);}
    h.answer(JSON.stringify(prepared.request));h.turn(`read-only-${i}`);
    const done=await h.call('poll');
    assert.equal(done.result.editProposal,undefined);assert.equal(done.proposal,null);
    assert.equal(done.automation.phase,'completed');assert.equal(done.automation.active,false);
    assert.equal(done.delivery,'filled');assert.equal(done.observed,false);
    const observation=await h.call('observe');assert.match(observation.message,/本轮已结束，无需再发送/);
    assert.equal(observation.automation.phase,'completed');assert.equal(observation.observed,false);
    assert.equal(done.result.data.content,i?'second baseline\n':'safe original\n');
    h.answer('已收到');h.turn(`ack-${i}`);await h.call('poll');
    assert.deepEqual(h.counts(),{reads:i+1,writes:0,fills:i+1});
    await assert.rejects(h.call('inspect'),{code:'E_FILE_COMPLETED'});
    previous=prepared.request;h.content('second baseline\n');
  }
});
test('editing is trusted opt-in and model fields cannot grant it',async()=>{
  const h=setup();const prepared=await h.prepare('demo.txt','read',false);
  h.answer(JSON.stringify({...prepared.request,allowEdit:true}));
  await assert.rejects(h.call('inspect'),{code:'E_REQUEST_FORMAT'});assert.equal(h.counts().reads,0);
  h.answer(JSON.stringify(prepared.request));const read=await h.call('inspect');
  assert.equal(read.result.editProposal,undefined);
  h.answer(JSON.stringify({protocol:'opendesk.workspace.edit.v1',requestId:crypto.randomUUID(),
    bindingId:prepared.request.bindingId,workspaceId,path:'demo.txt',baseSha256:sha(h.text()),content:'forged'}));
  await assert.rejects(h.call('inspect'),{code:'E_FILES_ACCESS'});
  await assert.rejects(h.call('approve'),{code:'E_FILES_ACCESS'});assert.equal(h.counts().writes,0);
  await assert.rejects(h.call('prepare',{workspaceId,path:'demo.txt',operation:'read',allowEdit:'true'}),{code:'E_FILE_SCHEMA'});
});
test('unknown read-only fill cannot become successful completion or be filled again',async()=>{
  const h=setup({fillUnknown:true});await h.prepare('demo.txt','read',false);h.turn('readonly-fill');
  await assert.rejects(h.call('poll'),{code:'E_CHAT_FILL_UNKNOWN'});
  const state=await h.call('poll');assert.notEqual(state.automation.phase,'completed');
  assert.equal(state.automation.active,false);assert.equal(state.delivery,'unknown');
  await assert.rejects(h.prepare('demo.txt','read',false),{code:'E_FILE_DELIVERY_UNKNOWN'});
  await h.call('poll');assert.deepEqual(h.counts(),{reads:1,writes:0,fills:1});
});
test('two read-edit rounds finish after receipt fill and reject old confirmations',async()=>{
  const h=setup();let previousRead,previousResult,previousReview;
  for(let i=0;i<2;i++){
    const prepared=await h.prepare();h.turn(`write-read-${i}`);h.observed(false);
    const read=await h.call('poll');assert.equal(read.automation.active,true);
    assert.equal(read.automation.phase,'read-result-filled');
    assert.equal(read.result.editProposal.content,i?'changed-0\n':'safe original\n');
    if(previousRead){
      assert.notEqual(prepared.request.requestId,previousRead);assert.notEqual(read.resultPacketId,previousResult);
    }
    h.turn(`write-edit-${i}`);h.observed(true);
    h.answer(JSON.stringify({...read.result.editProposal,content:`changed-${i}\n`}));
    const staged=await h.call('poll');assert.equal(h.counts().writes,i);
    if(previousReview)await assert.rejects(h.call('approve',{reviewId:previousReview}),{code:'E_FILE_REVIEW'});
    await h.call('approve',{reviewId:staged.proposal.reviewId});
    const done=await h.call('poll');assert.equal(done.automation.phase,'completed');assert.equal(done.automation.active,false);
    assert.equal(done.result.data.saved,true);assert.equal(done.result.data.readBackVerified,true);
    assert.equal(done.observed,false);assert.equal(done.delivery,'filled');
    h.answer('已完成');await h.call('poll');assert.equal(h.counts().writes,i+1);
    previousRead=prepared.request.requestId;previousResult=read.resultPacketId;previousReview=staged.proposal.reviewId;
  }
  assert.deepEqual(h.counts(),{reads:6,writes:2,fills:4});
});
test('saved write with unknown final fill never completes or dispatches another write',async()=>{
  const h=setup({fillUnknown:true});await h.proposal();await h.call('approve');
  await assert.rejects(h.call('poll'),{code:'E_CHAT_FILL_UNKNOWN'});
  const state=await h.call('poll');assert.notEqual(state.automation.phase,'completed');
  assert.equal(state.result.data.saved,true);assert.equal(state.delivery,'unknown');
  await assert.rejects(h.prepare(),{code:'E_FILE_DELIVERY_UNKNOWN'});
  await h.call('poll');assert.deepEqual(h.counts(),{reads:3,writes:1,fills:1});
});
test('a paused project cannot shadow an explicitly prepared advanced request',async()=>{
  const h=setup();await h.controller.projectTask({task:projectTask},pageSender);
  await h.controller.projectStop(pageSender);
  const prepared=await h.prepare('demo.txt','read',false);h.turn('advanced-after-project');
  const done=await h.call('poll');assert.equal(done.request.requestId,prepared.request.requestId);
  assert.equal(done.automation.phase,'completed');assert.deepEqual(h.counts(),{reads:1,writes:0,fills:1});
});
test('directory listing binds the approved relative directory, fills once and completes without edits',async()=>{
  const h=setup(),request=h.files.request;let lists=0;
  h.files.request=(method,...args)=>{if(method==='files.list')lists++;return request(method,...args);};
  const prepared=await h.prepare('','list',false);
  h.answer(JSON.stringify({...prepared.request,path:'other'}));
  await assert.rejects(h.call('inspect'),{code:'E_FILE_SCOPE'});assert.equal(lists,0);
  h.answer(JSON.stringify(prepared.request));h.turn('list-root');const done=await h.call('poll');
  assert.equal(done.result.operation,'list');assert.equal(done.result.path,'');assert.equal(done.result.editProposal,undefined);
  assert.equal(done.automation.phase,'completed');assert.equal(done.delivery,'filled');assert.equal(done.observed,false);
  await h.call('poll');assert.equal(lists,1);assert.deepEqual(h.counts(),{reads:0,writes:0,fills:1});
  await assert.rejects(h.call('prepare',{workspaceId,path:'',operation:'list',allowEdit:true}),{code:'E_FILE_SCHEMA'});
});
test('a confirmed read failure stops without fabricated content, completion or automatic retry',async()=>{
  const h=setup(),request=h.files.request;let attempts=0;
  h.files.request=(method,...args)=>{if(method==='files.read'){attempts++;throw {code:'E_FILES_IO',message:'read failed',outcome:'FAILED_CONFIRMED'};}return request(method,...args);};
  await h.prepare('demo.txt','read',false);h.turn('failed-read');
  await assert.rejects(h.call('poll'),{code:'E_FILES_IO'});const stopped=await h.call('poll');
  assert.equal(stopped.automation.phase,'paused');assert.equal(stopped.result,null);assert.equal(stopped.resultText,'');
  assert.equal(attempts,1);assert.equal(h.counts().fills,0);
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

const pageSender={id:'extension',url:source.url,frameId:0,documentId:source.documentId,tab:{id:7,windowId:3}};
const projectTask='修改 isolated-test 项目的 demo.txt，将内容改为 safe modified';
test('project connection is once per conversation; two tasks read and write without prepare or per-write approval',async()=>{
  const h=setup();
  const needs=await h.controller.projectTask({task:projectTask},pageSender);
  assert.equal(needs.needsConnection,true);assert.deepEqual(h.counts(),{reads:0,writes:0,fills:0});
  const connected=await h.call('connect-project',{workspaceId});
  assert.equal(connected.projectConnection.needsConnection,false);
  assert.equal(h.counts().reads,1);assert.equal(h.counts().fills,1);
  let active=await h.controller.projectStatus(pageSender);
  h.observed(true);h.turn('turn-2');
  let result=JSON.parse(active.resultText.slice(active.resultText.indexOf('{')));
  h.answer(JSON.stringify({...result.editProposal,content:'safe modified\n'}));
  await h.controller.tick();active=await h.controller.projectStatus(pageSender);
  assert.equal(active.resultStatus,'success');assert.equal(h.counts().writes,1);
  h.observed(true);h.turn('turn-3');await h.controller.tick();
  const second=await h.controller.projectTask({task:projectTask},pageSender);
  assert.equal(second.needsConnection,false);assert.equal(h.counts().writes,1);
  active=await h.controller.projectStatus(pageSender);
  result=JSON.parse(active.resultText.slice(active.resultText.indexOf('{')));
  h.turn('turn-4');h.answer(JSON.stringify({...result.editProposal,content:'safe second\n'}));
  await h.controller.tick();assert.equal(h.counts().writes,2);assert.equal(h.text(),'safe second\n');
});

test('a changed Native lease stops old parameters while a fresh user task reuses stable disclosure consent',async()=>{
  const h=setup();await h.controller.projectTask({task:projectTask},pageSender);await h.call('connect-project',{workspaceId});
  const original=await h.controller.projectStatus(pageSender);
  h.epoch('changed-lease-123456');
  await h.controller.tick();assert.equal(h.counts().writes,0);
  const next=await h.controller.projectTask({task:projectTask},pageSender);
  assert.equal(next.needsConnection,false);assert.equal(h.counts().reads,2);
  assert.equal(next.projectConnection.grantId,original.projectConnection.grantId);
  assert.notEqual(next.request.requestId,original.request.requestId);assert.equal(h.counts().writes,0);
});

test('project tasks persist independently of the settings document and never replay an unknown mutation after restart',async()=>{
  const h=setup({unknown:true});await h.controller.projectTask({task:projectTask},pageSender);await h.call('connect-project',{workspaceId});
  h.controller.drop(owner.tab.id); // Closing settings cannot retire the source task.
  const active=await h.controller.projectStatus(pageSender);
  const result=JSON.parse(active.resultText.slice(active.resultText.indexOf('{')));
  h.observed(true);h.turn('turn-2');h.answer(JSON.stringify({...result.editProposal,content:'safe modified\n'}));
  await h.controller.tick();assert.equal(h.counts().writes,1);
  h.controller.dispose();
  const resumed=createChatGPTFilesController({api:h.api,files:h.files,readAnswer:h.readAnswer,fillComposer:async()=>{}});
  await resumed.tick();await resumed.tick();assert.equal(h.counts().writes,1);
  await assert.rejects(resumed.projectTask({task:projectTask},pageSender),{code:'E_FILE_UNKNOWN'});
});

async function projectProposal(h){
  await h.controller.projectTask({task:projectTask},pageSender);await h.call('connect-project',{workspaceId});
  const active=await h.controller.projectStatus(pageSender),result=JSON.parse(active.resultText.slice(active.resultText.indexOf('{')));
  h.observed(true);h.turn('turn-2');h.answer(JSON.stringify({...result.editProposal,content:'safe modified\n'}));
  return active;
}
test('revocation, retired source, and invalid restored grant each prevent automatic mutations',async()=>{
  const revoked=setup();const state=await projectProposal(revoked);
  await revoked.call('revoke-project',{grantId:state.projectConnection.grantId});await revoked.controller.tick();
  assert.equal(revoked.counts().writes,0);
  const retired=setup();await projectProposal(retired);
  retired.api.webNavigation.getFrame=async()=>({documentId:'new-document',url:source.url,documentLifecycle:'active'});
  await retired.controller.tick();assert.equal(retired.counts().writes,0);
  const invalid=setup();await projectProposal(invalid);invalid.controller.dispose();
  const grants=invalid.ledger['opendesk.chatgpt.files.grants.v1'];Object.values(grants)[0].version++;
  const restarted=createChatGPTFilesController({api:invalid.api,files:invalid.files,readAnswer:invalid.readAnswer});
  await restarted.tick();assert.equal(invalid.counts().writes,0);
});
test('stop after grant revocation fences a pending proposal through restart without disclosing its contents',async()=>{
  const h=setup();const active=await projectProposal(h);
  h.ledger['opendesk.chatgpt.files.grants.v1'][active.projectConnection.grantId].revoked=true;
  const stopped=await h.controller.projectStop(pageSender);
  assert.equal(stopped.automation.phase,'paused');assert.doesNotMatch(JSON.stringify(stopped),/safe original|safe modified/);
  await h.controller.tick();h.controller.dispose();
  const resumed=createChatGPTFilesController({api:h.api,files:h.files,readAnswer:h.readAnswer});
  try{await resumed.tick();assert.equal(h.counts().writes,0);}
  finally{resumed.dispose();}
});
test('cancelled first connection has zero file access and cannot later be accepted as a pending task',async()=>{
  const h=setup();await h.controller.projectTask({task:projectTask},pageSender);
  await h.controller.projectStop(pageSender);
  await assert.rejects(h.call('connect-project',{workspaceId}),{code:'E_PROJECT_GRANT'});
  assert.deepEqual(h.counts(),{reads:0,writes:0,fills:0});
});
test('a new conversation is outside the grant and discloses no new bytes',async()=>{
  const h=setup();await projectProposal(h);const before=h.counts();h.controller.drop(source.tabId);
  const other={...source,url:source.url.replace('abc12345','different'),documentId:'other-document'};
  h.api.webNavigation.getFrame=async()=>({...other,documentLifecycle:'active'});
  h.api.tabs.get=async()=>({id:7,windowId:3,url:other.url});
  const next=await h.controller.projectTask({task:projectTask},{...pageSender,url:other.url,documentId:other.documentId});
  assert.equal(next.needsConnection,true);assert.deepEqual(h.counts(),before);
});
test('concurrent service wakeups cannot dispatch the same mutation twice',async()=>{
  const h=setup();await projectProposal(h);
  await Promise.all([h.controller.tick(),h.controller.tick(),h.controller.tick()]);
  assert.equal(h.counts().writes,1);
  const entries=Object.values(h.ledger['opendesk.chatgpt.files.writes.v1']);
  assert.equal(entries.length,1);assert.equal(entries[0].state,'confirmed');
});
test('interruption after durable registration and before dispatch fences the path across restart',async()=>{
  const h=setup();await projectProposal(h);const set=h.api.storage.local.set;
  let interrupted=false;
  h.api.storage.local.set=async value=>{
    const task=Object.values(value['opendesk.chatgpt.files.tasks.v1']||{})[0];
    if(!interrupted&&task?.project.phase==='dispatching'){interrupted=true;throw Error('worker interrupted before dispatch');}
    return set(value);
  };
  await h.controller.tick();assert.equal(interrupted,true);assert.equal(h.counts().writes,0);
  const [entry]=Object.values(h.ledger['opendesk.chatgpt.files.writes.v1']);
  assert.equal(entry.state,'dispatching');h.controller.dispose();
  const resumed=createChatGPTFilesController({api:h.api,files:h.files,readAnswer:h.readAnswer});
  try{
    await resumed.tick();
    await assert.rejects(resumed.projectTask({task:projectTask},pageSender),{code:'E_FILE_UNKNOWN'});
    const before=h.counts();
    const result=await resumed.handle({protocol:CHATGPT_FILES_PROTOCOL,action:'reconcile'},owner);
    assert.equal(result.resultStatus,'unknown');assert.match(result.resultText,/"readBackVerified":false/);
    assert.match(result.resultText,/"writeReceiptObserved":false/);
    assert.deepEqual(h.counts(),{...before,reads:before.reads+1});
    assert.equal(h.ledger['opendesk.chatgpt.files.writes.v1'][entry.requestId].state,'dispatching');
    await assert.rejects(resumed.projectTask({task:projectTask},pageSender),{code:'E_FILE_UNKNOWN'});
    assert.equal(h.counts().writes,0);
  }finally{resumed.dispose();}
});

test('project unknown reconciliation after reconnect only reads current authority and never revives a write',async()=>{
  const h=setup({unknown:true});await projectProposal(h);await h.controller.tick();
  assert.equal(h.counts().writes,1);
  h.session('native-session-reconnected');h.epoch('renewed-lease-123456');
  const result=await h.call('reconcile');
  assert.match(result.resultText,/"readBackVerified":true/);
  assert.match(result.resultText,/"writeReceiptObserved":false/);
  assert.equal(result.resultStatus,'unknown');assert.equal(h.counts().writes,1);
  await h.controller.tick();assert.equal(h.counts().writes,1);
});
test('a live trusted settings document retains its exact source binding after worker restart',async()=>{
  const h=setup();await h.controller.projectTask({task:projectTask},pageSender);await h.call('connect-project',{workspaceId});
  const active=await h.controller.projectStatus(pageSender);h.controller.dispose();
  const resumed=createChatGPTFilesController({api:h.api,files:h.files,readAnswer:h.readAnswer});
  const call=(action,extra={},sender=owner)=>resumed.handle({protocol:CHATGPT_FILES_PROTOCOL,action,...extra},sender);
  const state=await call('state');assert.equal(state.projectConnection.grantId,active.projectConnection.grantId);
  await assert.rejects(call('state',{}, {...owner,documentId:'different-settings-document'}),{code:'E_FILE_OWNER'});
  await call('revoke-project',{grantId:active.projectConnection.grantId});await resumed.tick();
  assert.equal(h.counts().writes,0);
});

test('observing an intermediate read cannot replace a still active write task',async()=>{
  const h=setup();await h.controller.projectTask({task:projectTask},pageSender);await h.call('connect-project',{workspaceId});
  h.observed(true);h.complete(false);await h.controller.tick();
  await assert.rejects(h.controller.projectTask({task:projectTask},pageSender),{code:'E_PROJECT_BUSY'});
  assert.equal(h.counts().reads,1);assert.equal(h.counts().writes,0);
});
test('read-only project tasks complete on real result delivery without demanding an edit reply',async()=>{
  const h=setup();await h.controller.projectTask({task:'读取 isolated-test 项目的 demo.txt，只读取，不修改任何文件'},pageSender);
  const read=await h.call('connect-project',{workspaceId});
  const packet=JSON.parse(read.resultText.slice(read.resultText.indexOf('{')));
  assert.equal(packet.operation,'read');assert.equal(packet.editProposal,undefined);
  h.observed(true);h.turn('turn-2');h.answer('这是实际文件内容。');
  await h.controller.tick();const result=await h.controller.projectStatus(pageSender);
  assert.equal(result.automation.phase,'completed');assert.equal(result.observed,true);
  assert.equal(h.counts().writes,0);assert.equal(h.counts().fills,1);
});
test('revoked project grants cannot use the reconnect read-recovery exception',async()=>{
  const h=setup({unknown:true});const active=await projectProposal(h);await h.controller.tick();
  await h.call('revoke-project',{grantId:active.projectConnection.grantId});
  h.session('native-session-reconnected');const before=h.counts();
  await assert.rejects(h.call('reconcile'),{code:'E_PROJECT_GRANT'});
  assert.deepEqual(h.counts(),before);
});

test('an unrelated navigation waking a fresh worker cannot erase a persisted project task',async()=>{
  const h=setup();await h.controller.projectTask({task:projectTask},pageSender);await h.call('connect-project',{workspaceId});
  const original=await h.controller.projectStatus(pageSender);h.controller.dispose();
  const resumed=createChatGPTFilesController({api:h.api,files:h.files,readAnswer:h.readAnswer});
  resumed.drop(999);const active=await resumed.projectStatus(pageSender);
  assert.equal(active.request?.requestId,original.request.requestId);
  assert.equal(h.counts().writes,0);
});

// Faults and wakeups below use only the in-memory Native/storage adapters above.
const writeLedger='opendesk.chatgpt.files.writes.v1';
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
test('K3 unresolved project tasks disclose no bytes and never search the workspace',async()=>{
  for(const task of ['读取 demo.txt','读取 unknown 项目的 demo.txt','读取 isolated-test 项目的 demo.txt 和 other.txt']){
    const h=setup(),request=h.files.request,methods=[];
    h.files.request=async(...args)=>{methods.push(args[0]);return request(...args);};
    await assert.rejects(h.controller.projectTask({task},pageSender),{code:'E_PROJECT_CLARIFY'});
    assert.deepEqual(methods,['workspaces.list']);
    assert.deepEqual(h.counts(),{reads:0,writes:0,fills:0});h.controller.dispose();
  }
});
test('K3 automatic proposals cannot redirect disclosure or writes to another path or workspace',async()=>{
  for(const changed of [{path:'other.txt'},{workspaceId:'workspace-22222222-2222-2222-2222-222222222222'}]){
    const h=setup(),active=await projectProposal(h);
    const result=JSON.parse(active.resultText.slice(active.resultText.indexOf('{'))),before=h.counts();
    h.answer(JSON.stringify({...result.editProposal,content:'safe modified\n',...changed}));
    await h.controller.tick();assert.deepEqual(h.counts(),before);assert.equal(h.text(),'safe original\n');
    assert.equal((await h.controller.projectStatus(pageSender)).automation.active,false);h.controller.dispose();
  }
});
test('K5 automatic project SHA conflicts preserve external bytes without registering a mutation',async()=>{
  const h=setup();await projectProposal(h);h.content('external change\n');
  await h.controller.tick();const state=await h.controller.projectStatus(pageSender);
  assert.equal(state.automation.active,false);assert.equal(state.automation.phase,'paused');
  assert.equal(h.text(),'external change\n');assert.equal(h.counts().writes,0);
  assert.deepEqual(h.ledger[writeLedger]||{},{});h.controller.dispose();
});
test('K6 registration persistence failure never dispatches and restart keeps the proposal paused',async()=>{
  const h=setup();await projectProposal(h);const set=h.api.storage.local.set;let failures=0;
  h.api.storage.local.set=async value=>{
    if(value[writeLedger]){failures++;throw Error('registration storage unavailable');}
    return set(value);
  };
  await h.controller.tick();assert.equal(failures,1);assert.equal(h.counts().writes,0);
  assert.deepEqual(h.ledger[writeLedger]||{},{});h.controller.dispose();h.api.storage.local.set=set;
  const resumed=createChatGPTFilesController({api:h.api,files:h.files,readAnswer:h.readAnswer});
  try{await resumed.tick();assert.equal((await resumed.projectStatus(pageSender)).automation.active,false);
    assert.equal(h.counts().writes,0);
  }finally{resumed.dispose();}
});
test('K6 ACK followed by ledger persistence failure retains the durable dispatch fence through restart',async()=>{
  const h=setup();await projectProposal(h);const set=h.api.storage.local.set,failedStates=[];
  h.api.storage.local.set=async value=>{
    const row=Object.values(value[writeLedger]||{})[0];
    if(row&&row.state!=='dispatching'){failedStates.push(row.state);throw Error('ACK ledger storage unavailable');}
    return set(value);
  };
  await h.controller.tick();
  assert.deepEqual(failedStates,['confirmed-pending','unknown']);assert.equal(h.counts().writes,1);
  assert.equal(h.text(),'safe modified\n');assert.equal(h.counts().reads,3);
  const [entry]=Object.values(h.ledger[writeLedger]);assert.equal(entry.state,'dispatching');
  h.controller.dispose();h.api.storage.local.set=set;
  const resumed=createChatGPTFilesController({api:h.api,files:h.files,readAnswer:h.readAnswer});
  try{
    await resumed.tick();await assert.rejects(resumed.projectTask({task:projectTask},pageSender),{code:'E_FILE_UNKNOWN'});
    const before=h.counts();
    const result=await resumed.handle({protocol:CHATGPT_FILES_PROTOCOL,action:'reconcile'},owner);
    assert.equal(result.resultStatus,'unknown');assert.match(result.resultText,/"readBackVerified":true/);
    assert.match(result.resultText,/"writeReceiptObserved":false/);
    assert.deepEqual(result.comparison,{before:'safe original\n',proposed:'safe modified\n',readBack:'safe modified\n'});
    assert.deepEqual(h.counts(),{...before,reads:before.reads+1});
    assert.equal(h.ledger[writeLedger][entry.requestId].state,'readback-matched');
    await resumed.tick();assert.equal(h.counts().writes,1);
  }finally{resumed.dispose();}
});
test('K4 K6 revoked grants survive restart and deny recovery reads before any file access',async()=>{
  const h=setup({unknown:true}),active=await projectProposal(h);await h.controller.tick();
  await h.call('revoke-project',{grantId:active.projectConnection.grantId});h.controller.dispose();
  h.session('native-session-reconnected');h.epoch('renewed-lease-123456');const before=h.counts();
  const resumed=createChatGPTFilesController({api:h.api,files:h.files,readAnswer:h.readAnswer});
  try{
    await resumed.tick();
    await assert.rejects(resumed.handle({protocol:CHATGPT_FILES_PROTOCOL,action:'reconcile'},owner),{code:'E_PROJECT_GRANT'});
    assert.deepEqual(h.counts(),before);assert.equal(Object.values(h.ledger[writeLedger])[0].state,'unknown');
  }finally{resumed.dispose();}
});
test('K7 stop queued before wake prevents dispatch; stop during dispatch never replays the write',{timeout:2000},async()=>{
  const stopped=setup();await projectProposal(stopped);
  const [state]=await Promise.all([stopped.controller.projectStop(pageSender),stopped.controller.tick()]);
  assert.equal(state.automation.active,false);assert.equal(stopped.counts().writes,0);stopped.controller.dispose();

  const h=setup();await projectProposal(h);const entered=deferred(),release=deferred(),request=h.files.request;
  h.files.request=async(...args)=>{if(args[0]==='files.write'){
    const receipt=await request(...args);entered.resolve();await release.promise;return receipt;
  }return request(...args);};
  const waking=h.controller.tick();await entered.promise;
  const stopping=h.controller.projectStop(pageSender),lateWake=h.controller.tick();release.resolve();
  const [,paused]=await Promise.all([waking,stopping,lateWake]);
  assert.equal(paused.automation.active,false);assert.equal(h.counts().writes,1);
  h.controller.dispose();const before=h.counts();
  const resumed=createChatGPTFilesController({api:h.api,files:h.files,readAnswer:h.readAnswer});
  try{await resumed.tick();assert.deepEqual(h.counts(),before);
    assert.equal((await resumed.projectStatus(pageSender)).automation.active,false);
  }finally{resumed.dispose();}
});
test('K7 real alarm and page wake routes share one dispatch queue and release idle guards',{timeout:2000},async()=>{
  const h=setup();await projectProposal(h);h.controller.dispose();
  const event=()=>{const listeners=new Set();return {listeners,addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)};};
  const messages=event(),alarms=event(),committed=event(),history=event(),removed=event(),created=[];
  Object.assign(h.api.runtime,{onMessage:messages});
  Object.assign(h.api.webNavigation,{onCommitted:committed,onHistoryStateUpdated:history});
  Object.assign(h.api.tabs,{onRemoved:removed});
  h.api.alarms={onAlarm:alarms,create:async(...args)=>{created.push(args);}};
  const composerCalls=[];
  h.api.scripting={executeScript:async options=>{
    assert.deepEqual(options.target,{tabId:source.tabId,documentIds:[source.documentId]});assert.equal(options.world,'ISOLATED');
    // The service must reach its real read adapter; no DOM or real browser is used.
    let result;
    if(options.func.name==='inspectChatGPTEditsOnPage')result={ok:true,...await h.readAnswer()};
    else{
      assert.ok(['fillChatGPTComposerOnPage','verifyChatGPTComposerOnPage'].includes(options.func.name));
      composerCalls.push({name:options.func.name,...options.args[0]});
      result={ok:true,url:source.url,filled:true,sent:false,readBackVerified:true};
    }
    return [{frameId:0,documentId:source.documentId,result}];
  }};
  let pending=0,finished=0;const drained=deferred();
  const service=installChatGPTFilesService({api:h.api,files:h.files,development:{held:false,nativeStarted(){
    pending++;return ()=>{pending--;if(++finished===4)drained.resolve();};
  }}});
  const message=action=>new Promise(resolve=>{
    const accepted=[...messages.listeners].map(listener=>listener({protocol:CHATGPT_PROJECT_PROTOCOL,action},pageSender,resolve));
    assert.ok(accepted.includes(true));
  });
  try{
    for(const listener of alarms.listeners)listener({name:'unrelated-alarm'});
    assert.equal(pending,0);
    for(let i=0;i<2;i++)for(const listener of alarms.listeners)listener({name:'opendesk.chatgpt.files.tasks'});
    const replies=await Promise.all([message('wake'),message('wake')]);await drained.promise;
    assert.ok(replies.every(reply=>reply.ok));assert.equal(pending,0);assert.equal(finished,4);
    assert.equal(h.counts().writes,1);assert.equal(Object.values(h.ledger[writeLedger])[0].state,'confirmed');
    assert.deepEqual(composerCalls.map(call=>call.name),['fillChatGPTComposerOnPage','verifyChatGPTComposerOnPage']);
    assert.equal(composerCalls[0].operationId,composerCalls[1].operationId);
    assert.equal(composerCalls[0].text,composerCalls[1].text);
    assert.deepEqual(created,[['opendesk.chatgpt.files.tasks',{periodInMinutes:0.5}]]);
  }finally{service.dispose();}
  for(const listeners of [messages,alarms,committed,history,removed])assert.equal(listeners.listeners.size,0);
});

function conversationHarness(options={}){
  const h=setup(options);
  h.ledger['opendesk.chatgpt.files.grants.v1']={existing:{id:'existing',version:1,service:'https://chatgpt.com',
    sourceUrl:source.url,scope:'task-named-existing-text',operations:['read','write'],authority:{workspaceId,sourceId:''}}};
  h.controller.drop(owner.tab.id);
  return h;
}
const readTask='读取 isolated-test 项目的 demo.txt，只读取，不修改任何文件';
test('conversation mixed file and Task reply is denied before Native discovery',async()=>{
  const h=conversationHarness();h.userText(readTask);h.taskIntent(true);
  h.answer('读取文件，同时包含 Task 候选');
  let calls=0;const request=h.files.request;
  h.files.request=(...args)=>{calls++;return request(...args);};
  try{
    await assert.rejects(h.controller.conversationTask({task:readTask},pageSender),{code:'E_CHAT_ROUTE',outcome:'NOT_DISPATCHED'});
    assert.equal(calls,0);assert.deepEqual(h.counts(),{reads:0,writes:0,fills:0});
    assert.deepEqual(h.ledger['opendesk.chatgpt.files.tasks.v1'],{});
  }finally{h.controller.dispose();}
});
test('conversation admission requires a bound answer before planning a connection',async()=>{
  const h=setup();h.userText(readTask);h.revision('');
  try{
    await assert.rejects(h.controller.conversationTask({task:readTask},pageSender),{code:'E_CHAT_ANSWER',outcome:'NOT_DISPATCHED'});
    assert.deepEqual(h.counts(),{reads:0,writes:0,fills:0});
  }finally{h.controller.dispose();}
});
test('first connection rejects changed answers and Task conflicts without reading or filling',async()=>{
  for(const task of [readTask,projectTask])for(const conflict of [false,true]){
    const h=setup();h.userText(task);
    try{
      const pending=await h.controller.conversationTask({task},pageSender);
      assert.equal(pending.needsConnection,true);
      const stored=h.ledger['opendesk.chatgpt.files.tasks.v1']['project:7'];
      assert.equal(stored.project.entryAnswerKey,'answer-1');
      if(conflict)h.taskIntent(true);else h.revision('answer-2');
      await assert.rejects(h.call('connect-project',{workspaceId}),
        {code:conflict?'E_CHAT_ROUTE':'E_CHAT_ANSWER',outcome:'NOT_DISPATCHED'});
      assert.equal((await h.controller.projectStatus(pageSender)).automation.phase,'paused');
      await h.controller.tick();assert.deepEqual(h.counts(),{reads:0,writes:0,fills:0});
    }finally{h.controller.dispose();}
  }
});
test('existing grant still rechecks the admitted answer before the initial file read',async()=>{
  for(const conflict of [false,true]){
    const h=conversationHarness();h.userText(readTask);
    const request=h.files.request;
    h.files.request=(...args)=>{if(args[0]==='workspaces.list'){
      if(conflict)h.taskIntent(true);else h.revision('answer-2');
    }return request(...args);};
    try{
      await assert.rejects(h.controller.conversationTask({task:readTask},pageSender),
        {code:conflict?'E_CHAT_ROUTE':'E_CHAT_ANSWER',outcome:'NOT_DISPATCHED'});
      assert.deepEqual(h.counts(),{reads:0,writes:0,fills:0});
    }finally{h.controller.dispose();}
  }
});
test('legacy pending connection cannot inherit the current answer after restart',async()=>{
  const h=setup();h.userText(readTask);
  await h.controller.conversationTask({task:readTask},pageSender);h.controller.dispose();
  delete h.ledger['opendesk.chatgpt.files.tasks.v1']['project:7'].project.entryAnswerKey;
  const resumed=createChatGPTFilesController({api:h.api,files:h.files,readAnswer:h.readAnswer});
  try{
    await assert.rejects(resumed.handle({protocol:CHATGPT_FILES_PROTOCOL,action:'connect-project',workspaceId},owner),
      {code:'E_CHAT_ANSWER',outcome:'NOT_DISPATCHED'});
    assert.equal(h.ledger['opendesk.chatgpt.files.tasks.v1']['project:7'].project.entryAnswerKey,undefined);
    assert.equal((await resumed.projectStatus(pageSender)).automation.phase,'paused');
    await resumed.tick();assert.deepEqual(h.counts(),{reads:0,writes:0,fills:0});
  }finally{resumed.dispose();}
});
test('first conversation connection preserves a terminal inline draft failure without retry',async()=>{
  for(const fillError of [{code:'E_CHAT_DRAFT',outcome:'NOT_DISPATCHED'},
    {code:'E_CHAT_FILL_UNKNOWN',outcome:'OUTCOME_UNKNOWN'}]){
    const h=setup({fillError});h.userText(projectTask);
    const pending=await h.controller.conversationTask({task:projectTask},pageSender);
    assert.equal(pending.needsConnection,true);assert.equal(h.counts().reads,0);
    await assert.rejects(h.call('connect-project',{workspaceId}),{code:fillError.code});
    const result=await h.controller.projectStatus(pageSender);
    assert.equal(result.automation.phase,'completed');assert.equal(result.delivery,'inline');
    assert.equal(result.resultStatus,fillError.outcome==='OUTCOME_UNKNOWN'?'unknown':'failed');assert.equal(result.result.error.code,fillError.code);
    await h.controller.tick();assert.deepEqual(h.counts(),{reads:1,writes:0,fills:1});
  }
});
test('conversation read uses existing grant without trusted owner and completes inline once across restart',async()=>{
  const h=conversationHarness();h.userText(readTask);
  const result=await h.controller.conversationTask({task:readTask},pageSender);
  assert.equal(result.automation.phase,'completed');assert.equal(result.resultStatus,'success');
  assert.match(result.resultText,/safe original/);assert.equal(result.observed,false);
  assert.deepEqual(h.counts(),{reads:1,writes:0,fills:0});
  await assert.rejects(h.controller.conversationTask({task:readTask},pageSender),{code:'E_FILE_REPLAY'});
  h.controller.dispose();
  const resumed=createChatGPTFilesController({api:h.api,files:h.files,readAnswer:h.readAnswer});
  await assert.rejects(resumed.conversationTask({task:readTask},pageSender),{code:'E_FILE_REPLAY'});
  await resumed.tick();assert.deepEqual(h.counts(),{reads:1,writes:0,fills:0});resumed.dispose();
});
test('conversation task mismatch and incomplete user turn perform no Native I/O',async()=>{
  const h=conversationHarness();let calls=0;const request=h.files.request;
  h.files.request=(...args)=>{calls++;return request(...args);};
  h.userText(readTask+' ');
  await assert.rejects(h.controller.conversationTask({task:readTask},pageSender),{code:'E_CHAT_TURN'});
  h.userText(readTask);h.complete(false);
  await assert.rejects(h.controller.conversationTask({task:readTask},pageSender),{code:'E_CHAT_INCOMPLETE'});
  assert.equal(calls,0);
});
test('conversation write fills actual read and edit context once and completes with inline verified receipt',async()=>{
  const h=conversationHarness();h.userText(projectTask);
  const active=await h.controller.conversationTask({task:projectTask},pageSender);
  const packet=JSON.parse(active.resultText.slice(active.resultText.indexOf('{')));
  assert.equal(packet.data.content,'safe original\n');assert.ok(packet.editProposal);
  h.observed(true);h.turn('turn-2');h.answer(JSON.stringify({...packet.editProposal,content:'safe modified\n'}));
  await h.controller.tick();await h.controller.tick();
  const done=await h.controller.projectStatus(pageSender);
  assert.equal(done.automation.phase,'completed');assert.equal(done.resultStatus,'success');
  assert.equal(done.observed,false);assert.match(done.resultText,/readBackVerified/);
  assert.equal(done.result.data.saved,true);assert.equal(done.result.data.readBackVerified,true);
  assert.equal(done.result.data.sha256,sha('safe modified\n'));
  assert.deepEqual(done.comparison,{before:'safe original\n',proposed:'safe modified\n',readBack:'safe modified\n'});
  const receipt=JSON.parse(done.resultText.slice(done.resultText.indexOf('{')));
  assert.equal(Object.hasOwn(receipt,'comparison'),false,'comparison is not part of the model-facing receipt');
  assert.equal(Object.hasOwn(receipt.data,'content'),false);
  assert.deepEqual(h.counts(),{reads:3,writes:1,fills:1});
  h.controller.dispose();
  const event=()=>{const listeners=new Set();return {listeners,addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)};};
  const messages=event();h.api.runtime.onMessage=messages;
  Object.assign(h.api.webNavigation,{onCommitted:event(),onHistoryStateUpdated:event()});h.api.tabs.onRemoved=event();
  const service=installChatGPTFilesService({api:h.api,files:h.files});
  try{
    const reply=await new Promise(resolve=>{for(const listener of messages.listeners)
      listener({protocol:CHATGPT_PROJECT_PROTOCOL,action:'status'},pageSender,resolve);});
    assert.equal(reply.ok,true);
    assert.deepEqual(reply.data.projectConnection,{name:'isolated-test'});
    assert.deepEqual(reply.data.comparison,done.comparison);
    assert.deepEqual(h.counts(),{reads:3,writes:1,fills:1},'viewing the stored receipt performs no file I/O');
    h.ledger['opendesk.chatgpt.files.grants.v1'].existing.revoked=true;
    for(const action of ['stop','status','wake']){
      const afterRevoke=await new Promise(resolve=>{for(const listener of messages.listeners)
        listener({protocol:CHATGPT_PROJECT_PROTOCOL,action},pageSender,resolve);});
      assert.doesNotMatch(JSON.stringify(afterRevoke),/safe original|safe modified/);
      if(action==='stop')assert.equal(afterRevoke.ok,true);else assert.equal(afterRevoke.ok,false);
    }
    assert.deepEqual(h.counts(),{reads:3,writes:1,fills:1},'revoked stop and status do not access files');
  }finally{service.dispose();}
});
test('conversation fill failure never retries, Stop blocks proposal, unknown write remains fenced',async()=>{
  const draft=conversationHarness({fillUnknown:true});draft.userText(projectTask);
  await assert.rejects(draft.controller.conversationTask({task:projectTask},pageSender),{code:'E_CHAT_FILL_UNKNOWN'});
  await draft.controller.tick();assert.deepEqual(draft.counts(),{reads:1,writes:0,fills:1});
  for(const stop of [false,true]){
    const h=conversationHarness({unknown:true});h.userText(projectTask);
    const active=await h.controller.conversationTask({task:projectTask},pageSender);
    const packet=JSON.parse(active.resultText.slice(active.resultText.indexOf('{')));
    h.observed(true);h.turn('turn-2');h.answer(JSON.stringify({...packet.editProposal,content:'safe modified\n'}));
    if(stop)await h.controller.projectStop(pageSender);
    await h.controller.tick();await h.controller.tick();
    assert.equal(h.counts().writes,stop?0:1);assert.equal(h.counts().fills,1);
    if(!stop){
      const unknown=await h.controller.projectStatus(pageSender);
      assert.equal(unknown.resultStatus,'unknown');
      assert.deepEqual(unknown.comparison,{before:'safe original\n',proposed:'safe modified\n'});
      h.turn('turn-3');h.userText(projectTask);
      await assert.rejects(h.controller.conversationTask({task:projectTask},pageSender),{code:'E_FILE_UNKNOWN'});
    }
  }
});

test('conversation proposal conflict returns a terminal inline error without a second fill',async()=>{
  const h=conversationHarness();h.userText(projectTask);
  const active=await h.controller.conversationTask({task:projectTask},pageSender);
  const packet=JSON.parse(active.resultText.slice(active.resultText.indexOf('{')));
  h.observed(true);h.turn('turn-2');h.answer(JSON.stringify({...packet.editProposal,content:'safe modified\n'}));
  h.content('external change\n');await h.controller.tick();
  const result=await h.controller.projectStatus(pageSender);
  assert.equal(result.resultStatus,'conflict');assert.equal(result.automation.phase,'completed');
  assert.equal(result.delivery,'inline');assert.equal(result.observed,false);
  assert.equal(h.counts().fills,1);assert.equal(h.counts().writes,0);
});
test('conversation service routes exact task and returns inline result fields for status and wake',async()=>{
  const h=conversationHarness();h.userText(readTask);await h.controller.tick();h.controller.dispose();
  const event=()=>{const listeners=new Set();return {listeners,addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)};};
  const messages=event();h.api.runtime.onMessage=messages;
  Object.assign(h.api.webNavigation,{onCommitted:event(),onHistoryStateUpdated:event()});h.api.tabs.onRemoved=event();
  h.api.scripting={executeScript:async options=>{
    assert.equal(options.func.name,'inspectChatGPTEditsOnPage');
    return [{frameId:0,documentId:source.documentId,result:{ok:true,...await h.readAnswer(null,null,null,options.args[0])}}];
  }};
  const service=installChatGPTFilesService({api:h.api,files:h.files});
  const send=message=>new Promise(resolve=>{
    for(const listener of messages.listeners)listener({protocol:CHATGPT_PROJECT_PROTOCOL,...message},pageSender,resolve);
  });
  try{
    const started=await send({action:'conversation',task:readTask});assert.equal(started.ok,true);
    for(const action of ['status','wake']){
      const reply=await send({action});assert.equal(reply.ok,true);
      assert.equal(reply.data.resultText,started.data.resultText);assert.match(reply.data.resultText,/safe original/);
      assert.equal(reply.data.resultStatus,'success');assert.ok(reply.data.resultPacketId);
      assert.equal(reply.data.result.data.content,'safe original\n');
      assert.equal(reply.data.result.data.sha256,sha('safe original\n'));
      assert.equal(reply.data.result.resultId,reply.data.resultPacketId);
      assert.equal(reply.data.phase,'completed');assert.equal(reply.data.observed,false);
    }
    const duplicate=await send({action:'conversation',task:readTask});assert.equal(duplicate.error.code,'E_FILE_REPLAY');
    const forged=await send({action:'conversation',task:readTask,workspaceId});assert.equal(forged.error.code,'E_FILE_SCHEMA');
    assert.deepEqual(h.counts(),{reads:1,writes:0,fills:0});
  }finally{service.dispose();}
});

test('conversation draft refusal is terminal and restart cannot retry the original fill',async()=>{
  const h=conversationHarness({fillError:{code:'E_CHAT_DRAFT',message:'existing draft',outcome:'NOT_DISPATCHED'}});
  h.userText(projectTask);
  await assert.rejects(h.controller.conversationTask({task:projectTask},pageSender),{code:'E_CHAT_DRAFT'});
  const result=await h.controller.projectStatus(pageSender);
  assert.equal(result.automation.phase,'completed');assert.equal(result.delivery,'inline');
  assert.equal(result.result.error.code,'E_CHAT_DRAFT');
  h.controller.dispose();let fills=0;
  const resumed=createChatGPTFilesController({api:h.api,files:h.files,readAnswer:h.readAnswer,fillComposer:async()=>{fills++;}});
  try{
    await resumed.tick();await assert.rejects(resumed.conversationTask({task:projectTask},pageSender),{code:'E_FILE_REPLAY'});
    assert.equal(fills,0);assert.deepEqual(h.counts(),{reads:1,writes:0,fills:1});
  }finally{resumed.dispose();}
});
test('conversation receipt is unavailable to a different original document',async()=>{
  const h=conversationHarness();h.userText(readTask);
  await h.controller.conversationTask({task:readTask},pageSender);
  const other={...pageSender,documentId:'new-document'};
  h.api.webNavigation.getFrame=async()=>({documentId:other.documentId,url:source.url,documentLifecycle:'active'});
  const status=await h.controller.projectStatus(other);
  assert.equal(status.result,undefined);assert.equal(status.resultText,undefined);
  assert.equal(status.resultPacketId,undefined);
});
