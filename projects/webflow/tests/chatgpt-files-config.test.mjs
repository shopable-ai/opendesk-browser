import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createChatGPTFilesController,CHATGPT_FILES_PROTOCOL,CHATGPT_PROJECT_PROTOCOL} from '../trusted/chatgpt-files-controller.js';
import {installChatGPTFilesService} from '../trusted/chatgpt-files-service.js';
const sha=text=>createHash('sha256').update(text).digest('hex');
const workspaceId='workspace-11111111-1111-1111-1111-111111111111';
const source={tabId:7,documentId:'source-doc',url:'https://chatgpt.com/c/abc12345-1234-1234-1234-abcdef123456',windowId:3};
const owner={id:'extension',url:'chrome-extension://extension/native-agent/settings.html#chatgpt-files',frameId:0,documentId:'owner-doc',tab:{id:51,windowId:3}};
function setup({ledger={},unknown=false,fillUnknown=false,fillError=null,initialContent='safe original\n',claim=true}={}){
  let userText='',content=initialContent,answer,reads=0,writes=0,fills=0,epoch='',access='read-write',sessionId='native-session-123456',turnKey='turn-1',answerKey='answer-1',complete=true,observed=false,readError,afterReadError;
  const storage={async get(key){return {[key]:ledger[key]};},async set(value){Object.assign(ledger,structuredClone(value));}};
  // Emulate Chrome storage.session only inside Node fixture. Production
  // requires a trusted context boundary; tests must not weaken that gate.
  const sessionRows={};
  const session={async setAccessLevel({accessLevel}){assert.equal(accessLevel,'TRUSTED_CONTEXTS');},
    async get(key){return {[key]:structuredClone(sessionRows[key])};},
    async set(values){Object.assign(sessionRows,structuredClone(values));}};
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
  const api={runtime:{id:'extension',getURL:path=>'chrome-extension://extension/'+path},storage:{local:storage,session},
    tabs:{async get(tabId){return tabId===owner.tab.id?{...owner.tab,url:owner.url}:
      {id:source.tabId,windowId:source.windowId,url:source.url};}},
    webNavigation:{async getFrame({tabId}){return tabId===owner.tab.id?
      {frameId:0,documentId:owner.documentId,url:owner.url,documentLifecycle:'active'}:
      {frameId:0,documentId:source.documentId,url:source.url,documentLifecycle:'active'};}}};
  const readAnswer=async(_api,_source,_id,options={})=>{if(readError){const error=readError;readError=null;throw error;}return ({url:source.url,turnKey,answerKey,answerComplete:complete,
    resultObserved:observed,...(options.readUserMessage?{userText}:{}),blocks:[answer]});};
  const controller=createChatGPTFilesController({api,files,readAnswer,fillComposer:async()=>{fills++;if(fillError)throw fillError;if(fillUnknown)throw {code:'E_CHAT_FILL_UNKNOWN',outcome:'OUTCOME_UNKNOWN'};return {filled:true,sent:false};}});
  if(claim)void controller.claim({source,workspaceTab:owner.tab},owner);
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
  return {userText:value=>{userText=value;},call,prepare,proposal,controller,api,files,readAnswer,ledger,answer:value=>{answer=value;},content:value=>{content=value;},
    epoch:value=>{epoch=value;},access:value=>{access=value;},session:value=>{sessionId=value;},turn:value=>{turnKey=value;},revision:value=>{answerKey=value;},complete:value=>{complete=value;},observed:value=>{observed=value;},readError:value=>{readError=value;},afterReadError:value=>{afterReadError=value;},counts:()=>({reads,writes,fills}),text:()=>content};
}
const configKey='opendesk.chatgpt.files.preferences.v1';
const pageSender={id:'extension',url:source.url,frameId:0,documentId:source.documentId,tab:{id:7,windowId:3}};
const task='读取 isolated-test 项目的 demo.txt，只读取，不修改任何文件';
const writeTask='修改 isolated-test 项目的 demo.txt，把 original 替换为 modified';
const event=()=>{const listeners=new Set();return {listeners,addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}};
function serviceHarness(ledger={}){
  const h=setup({ledger,claim:false});h.controller.dispose();
  const changed=event(),messages=event();h.api.storage.onChanged=changed;h.api.runtime.onMessage=messages;
  h.api.tabs.onRemoved=event();h.api.webNavigation.onCommitted=event();h.api.webNavigation.onHistoryStateUpdated=event();
  h.api.tabs.get=async id=>id===51?{...owner.tab,url:owner.url}: {id:7,windowId:3,url:source.url};
  h.api.webNavigation.getFrame=async({tabId})=>tabId===51?{documentId:owner.documentId,url:owner.url,documentLifecycle:'active'}:
    {documentId:source.documentId,url:source.url,documentLifecycle:'active'};
  const set=h.api.storage.local.set;
  h.api.storage.local.set=async values=>{const old=h.ledger[configKey];await set(values);
    if(Object.hasOwn(values,configKey))for(const fn of changed.listeners)fn({[configKey]:{oldValue:old,newValue:values[configKey]}},'local');};
  const service=installChatGPTFilesService({api:h.api,files:h.files});
  const send=(action,extra={},sender=owner)=>new Promise(resolve=>{for(const fn of messages.listeners)
    fn({protocol:CHATGPT_PROJECT_PROTOCOL,action,...extra},sender,resolve);});
  return {...h,send,service,changed};
}
test('disabled storage blocks start, conversation and legacy prepare before any file access',async()=>{
  const h=setup({ledger:{[configKey]:{enabled:false,diagnosticsVisible:false}}});
  await assert.rejects(h.controller.projectTask({task},pageSender),{code:'E_FILES_DISABLED'});
  await assert.rejects(h.controller.conversationTask({task},pageSender),{code:'E_FILES_DISABLED'});
  await assert.rejects(h.prepare(),{code:'E_FILES_DISABLED'});
  assert.deepEqual(h.counts(),{reads:0,writes:0,fills:0});h.controller.dispose();
});
test('settings returns default preferences; configure persists partial booleans without grants',async()=>{
  const h=serviceHarness();
  try{
    assert.deepEqual(await h.send('settings'),{ok:true,data:{preferences:{enabled:true,diagnosticsVisible:false}}});
    assert.deepEqual(await h.send('configure',{preferences:{diagnosticsVisible:true}}),
      {ok:true,data:{preferences:{enabled:true,diagnosticsVisible:true}}});
    assert.equal(h.ledger['opendesk.chatgpt.files.grants.v1'],undefined);
    const reply=await h.send('settings',{},pageSender);assert.equal(reply.ok,true);
    assert.deepEqual(reply.data.preferences,{enabled:true,diagnosticsVisible:true});
  }finally{h.service.dispose();assert.equal(h.changed.listeners.size,0);}
});
test('configure denies pages, stale settings documents, unknown fields and non-booleans',async()=>{
  const h=serviceHarness();
  try{
    for(const preferences of [{enabled:'false'},{diagnosticsVisible:0},{extra:true},null,[]])
      assert.equal((await h.send('configure',{preferences})).ok,false);
    assert.equal((await h.send('configure',{preferences:{enabled:false}},pageSender)).ok,false);
    assert.equal((await h.send('configure',{preferences:{enabled:false}}, {...owner,documentId:'retired'})).ok,false);
    assert.equal((await h.send('settings',{extra:true})).ok,false);
    assert.equal(h.ledger[configKey],undefined);
    assert.deepEqual(h.counts(),{reads:0,writes:0,fills:0});
  }finally{h.service.dispose();}
});
function settingsIdentity(h){
  const get=h.api.tabs.get,frame=h.api.webNavigation.getFrame;
  h.api.tabs.get=async id=>id===51?{...owner.tab,url:owner.url}:get(id);
  h.api.webNavigation.getFrame=async args=>args.tabId===51?{documentId:owner.documentId,url:owner.url,documentLifecycle:'active'}:frame(args);
}
test('disable persists paused tasks; enable and service restart cannot revive them',async()=>{
  const h=setup();settingsIdentity(h);await h.controller.projectTask({task:writeTask},pageSender);
  await h.controller.configure({enabled:false},owner);
  await h.controller.configure({enabled:true,diagnosticsVisible:true},owner);
  assert.equal((await h.controller.projectStatus(pageSender)).automation.phase,'paused');
  h.controller.dispose();
  const next=createChatGPTFilesController({api:h.api,files:h.files,readAnswer:h.readAnswer});
  try{await next.tick();assert.equal((await next.projectStatus(pageSender)).automation.active,false);
    assert.deepEqual(h.counts(),{reads:0,writes:0,fills:0});
  }finally{next.dispose();}
});

const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function stagedWrite(h){
  settingsIdentity(h);
  const active=await h.controller.projectTask({task:writeTask},pageSender);
  await h.call('connect-project',{workspaceId});
  const state=await h.controller.projectStatus(pageSender);
  const result=JSON.parse(state.resultText.slice(state.resultText.indexOf('{')));
  h.observed(true);h.turn('turn-2');h.answer(JSON.stringify({...result.editProposal,content:'safe modified\n'}));
  return active;
}
test('disable during pre-write read fences dispatch and old drafts after enable',{timeout:2000},async()=>{
  const h=setup();await stagedWrite(h);
  const entered=deferred(),release=deferred(),request=h.files.request;
  h.files.request=async(...args)=>{if(args[0]==='files.read'){entered.resolve();await release.promise;}return request(...args);};
  const waking=h.controller.tick();await entered.promise;
  const disabling=h.controller.configure({enabled:false},owner);
  // Wait for the persisted preference, independently of the blocked task queue.
  while(h.ledger[configKey]?.enabled!==false)await new Promise(resolve=>setImmediate(resolve));
  release.resolve();await Promise.all([waking,disabling]);
  await h.controller.configure({enabled:true},owner);await h.controller.tick();
  assert.equal(h.counts().writes,0);assert.equal(h.counts().fills,1);
  assert.equal((await h.controller.projectStatus(pageSender)).automation.active,false);h.controller.dispose();
});
test('disable during dispatched write preserves ACK readback and does not fill or replay',{timeout:2000},async()=>{
  for(const unknown of [false,true]){
    const h=setup({unknown});await stagedWrite(h);
    const entered=deferred(),release=deferred(),request=h.files.request;
    h.files.request=async(...args)=>{if(args[0]==='files.write'){entered.resolve();await release.promise;}return request(...args);};
    const waking=h.controller.tick();await entered.promise;
    const disabling=h.controller.configure({enabled:false},owner);
    while(h.ledger[configKey]?.enabled!==false)await new Promise(resolve=>setImmediate(resolve));
    release.resolve();await Promise.all([waking,disabling]);
    assert.equal(h.counts().writes,1);assert.equal(h.counts().fills,1);
    assert.equal(Object.values(h.ledger['opendesk.chatgpt.files.writes.v1'])[0].state,unknown?'unknown':'confirmed');
    if(unknown){const result=await h.call('reconcile');assert.match(result.resultText,/"readBackVerified":true/);}
    await h.controller.configure({enabled:true},owner);await h.controller.tick();
    assert.equal(h.counts().writes,1);assert.equal(h.counts().fills,1);h.controller.dispose();
  }
});
test('diagnostics toggles do not pause active tasks or perform file access',async()=>{
  const h=setup();settingsIdentity(h);await h.controller.projectTask({task:writeTask},pageSender);
  await h.call('connect-project',{workspaceId});
  const before=h.counts();await h.controller.configure({diagnosticsVisible:true},owner);
  assert.equal((await h.controller.projectStatus(pageSender)).automation.phase,'watching');
  assert.deepEqual(h.counts(),before);h.controller.dispose();
});
test('storage-disabled restoration pauses pending tasks durably even if enabled before next wake',async()=>{
  const h=setup();await h.controller.projectTask({task:writeTask},pageSender);h.controller.dispose();
  h.ledger[configKey]={enabled:false,diagnosticsVisible:false};
  const next=createChatGPTFilesController({api:h.api,files:h.files,readAnswer:h.readAnswer});
  await assert.rejects(next.tick(),{code:'E_FILES_DISABLED'});
  h.ledger[configKey]={enabled:true,diagnosticsVisible:false};await next.tick();
  assert.equal((await next.projectStatus(pageSender)).automation.active,false);next.dispose();
});
test('invalid stored preferences and unreadable storage never admit a file task',async()=>{
  for(const value of [null,{enabled:'yes'},{enabled:true,unrecognized:true}]){
    const h=setup({ledger:{[configKey]:value}});
    await assert.rejects(h.controller.projectTask({task},pageSender));assert.equal(h.counts().reads,0);h.controller.dispose();
  }
  const h=setup();await h.call('state');h.api.storage.local.get=async()=>{throw Error('storage unavailable');};
  await assert.rejects(h.controller.projectTask({task},pageSender));assert.deepEqual(h.counts(),{reads:0,writes:0,fills:0});h.controller.dispose();
});

test('storage disable/enable notifications pause restored tasks and listener disposal is complete',async()=>{
  const prior=setup();await prior.controller.projectTask({task:writeTask},pageSender);prior.controller.dispose();
  const h=serviceHarness(prior.ledger);
  try{
    h.ledger[configKey]={enabled:false,diagnosticsVisible:false};
    for(const fn of h.changed.listeners)fn({[configKey]:{newValue:h.ledger[configKey]}},'local');
    h.ledger[configKey]={enabled:true,diagnosticsVisible:false};
    for(const fn of h.changed.listeners)fn({[configKey]:{newValue:h.ledger[configKey]}},'local');
    const status=await h.send('status',{},pageSender);assert.equal(status.ok,true);assert.equal(status.data.phase,'paused');
    assert.deepEqual(h.counts(),{reads:0,writes:0,fills:0});
  }finally{h.service.dispose();assert.equal(h.changed.listeners.size,0);}
});
test('hashless settings document is accepted but a different fragment and pending navigation are denied',async()=>{
  const h=serviceHarness(),plain={...owner,url:'chrome-extension://extension/native-agent/settings.html'};
  const get=h.api.tabs.get,frame=h.api.webNavigation.getFrame;
  h.api.tabs.get=async id=>id===51?{...plain.tab,url:plain.url}:get(id);
  h.api.webNavigation.getFrame=async args=>args.tabId===51?{documentId:plain.documentId,url:plain.url,documentLifecycle:'active'}:frame(args);
  try{
    assert.equal((await h.send('configure',{preferences:{enabled:false}},plain)).ok,true);
    assert.equal((await h.send('configure',{preferences:{enabled:true}},{...plain,url:plain.url+'#other'})).ok,false);
    h.api.tabs.get=async()=>({...plain.tab,url:plain.url,pendingUrl:plain.url});
    assert.equal((await h.send('configure',{preferences:{enabled:true}},plain)).ok,false);
    assert.equal(h.ledger[configKey].enabled,false);
  }finally{h.service.dispose();}
});
test('Stop during dispatched write preserves receipt but prevents the late result draft',{timeout:2000},async()=>{
  const h=setup();await stagedWrite(h);
  const entered=deferred(),release=deferred(),request=h.files.request;
  h.files.request=async(...args)=>{if(args[0]==='files.write'){entered.resolve();await release.promise;}return request(...args);};
  const waking=h.controller.tick();await entered.promise;
  const stopping=h.controller.projectStop(pageSender);release.resolve();await Promise.all([waking,stopping]);
  assert.equal(h.counts().writes,1);assert.equal(h.counts().fills,1);
  assert.equal(Object.values(h.ledger['opendesk.chatgpt.files.writes.v1'])[0].state,'confirmed');h.controller.dispose();
});
test('rapid storage disable/enable cancels previously queued tasks instead of starting them on enable',{timeout:2000},async()=>{
  const h=setup();h.controller.dispose();const changed=event();h.api.storage.onChanged=changed;
  h.controller=createChatGPTFilesController({api:h.api,files:h.files,readAnswer:h.readAnswer,fillComposer:async()=>{}});
  await h.controller.projectTask({task:writeTask},pageSender);
  const entered=deferred(),release=deferred(),get=h.api.webNavigation.getFrame;
  h.api.webNavigation.getFrame=async(...args)=>{entered.resolve();await release.promise;return get(...args);};
  const waking=h.controller.projectStatus(pageSender);await entered.promise;
  const queued=h.controller.projectTask({task},pageSender);
  const rejected=assert.rejects(queued,{code:'E_FILE_PAUSED'});
  for(const enabled of [false,true]){
    h.ledger[configKey]={enabled,diagnosticsVisible:false};
    for(const fn of changed.listeners)fn({[configKey]:{newValue:h.ledger[configKey]}},'local');
  }
  release.resolve();await waking;await rejected;
  assert.deepEqual(h.counts(),{reads:0,writes:0,fills:0});h.controller.dispose();
});
test('settings uses live Chrome extension contexts when sender has no tab or webNavigation frame',async()=>{
  const h=serviceHarness();
  let context={contextType:'TAB',documentUrl:owner.url,documentId:owner.documentId,frameId:0,tabId:51,incognito:false};
  h.api.runtime.getContexts=async()=>[context];
  h.api.webNavigation.getFrame=async()=>null;
  const sender={...owner};delete sender.tab;delete sender.frameId;
  try{
    assert.equal((await h.send('configure',{preferences:{enabled:false}},sender)).ok,true);
    context={...context,documentId:'replacement-document'};
    assert.equal((await h.send('configure',{preferences:{enabled:true}},sender)).ok,false);
    assert.equal(h.ledger[configKey].enabled,false);
  }finally{h.service.dispose();}
});
test('a request received while disabled cannot wait in the queue and come alive on enable',{timeout:2000},async()=>{
  const h=setup();h.controller.dispose();const changed=event();h.api.storage.onChanged=changed;
  h.controller=createChatGPTFilesController({api:h.api,files:h.files,readAnswer:h.readAnswer});
  await h.controller.projectTask({task:writeTask},pageSender);
  const entered=deferred(),release=deferred(),get=h.api.webNavigation.getFrame;
  h.api.webNavigation.getFrame=async(...args)=>{entered.resolve();await release.promise;return get(...args);};
  const waking=h.controller.projectStatus(pageSender);await entered.promise;
  h.ledger[configKey]={enabled:false,diagnosticsVisible:false};
  for(const fn of changed.listeners)fn({[configKey]:{newValue:h.ledger[configKey]}},'local');
  const denied=assert.rejects(h.controller.projectTask({task},pageSender),{code:'E_FILES_DISABLED'});
  h.ledger[configKey]={enabled:true,diagnosticsVisible:false};
  for(const fn of changed.listeners)fn({[configKey]:{newValue:h.ledger[configKey]}},'local');
  release.resolve();await waking;await denied;h.controller.dispose();
});
test('main settings ChatGPT files controls anchor can configure preferences',async()=>{
  const h=serviceHarness(),sender={...owner,url:'chrome-extension://extension/native-agent/settings.html#chatgpt-files-controls'};
  h.api.tabs.get=async()=>({...owner.tab,url:sender.url});
  h.api.webNavigation.getFrame=async()=>({documentId:sender.documentId,url:sender.url,documentLifecycle:'active'});
  try{assert.equal((await h.send('configure',{preferences:{enabled:false}},sender)).ok,true);
    assert.equal(h.ledger[configKey].enabled,false);
  }finally{h.service.dispose();}
});
function existingGrant(h){h.ledger['opendesk.chatgpt.files.grants.v1']={existing:{id:'existing',version:1,service:'https://chatgpt.com',
  sourceUrl:source.url,scope:'task-named-existing-text',operations:['read','write'],authority:{workspaceId,sourceId:''}}};}
test('trusted project status conceals already cached file content after revocation, without a new Native call',async()=>{
  // Exercise the real trusted controller with an independently injected DOM
  // reader: no fake Chrome scripting privilege is needed in this Node fixture.
  const h=setup({claim:false});
  h.api.tabs.query=async()=>[];
  existingGrant(h);
  try{
    const started=await h.controller.projectTask({task},pageSender);
    assert.equal(started.needsConnection,false);
    const list=await h.controller.projectList(owner);
    assert.equal(list.tasks.length,1);
    const ref=list.tasks[0];
    const identity={sourceTabId:ref.sourceTabId,sourceDocumentId:ref.sourceDocumentId,projectId:ref.projectId};
    const before=h.counts();
    const permitted=await h.controller.projectStatusTrusted(identity,owner);
    assert.match(permitted.resultText,/safe original/,'the original live grant authorizes this trusted result');
    assert.deepEqual(h.counts(),before,'trusted status performs no new Native operation');

    h.ledger['opendesk.chatgpt.files.grants.v1'].existing.revoked=true;
    const concealed=await h.controller.projectStatusTrusted(identity,owner);
    assert.equal(concealed.resultText,undefined);
    assert.equal(concealed.result,undefined);
    assert.equal(concealed.comparison,undefined);
    assert.doesNotMatch(JSON.stringify(concealed),/safe original|safe modified/);
    assert.deepEqual(h.counts(),before,'revoked status never re-reads Native');

    const stopped=await h.controller.projectStopTrusted(identity,owner);
    assert.equal(stopped.automation.phase,'paused');
    assert.doesNotMatch(JSON.stringify(stopped),/safe original|safe modified/);
    assert.deepEqual(h.counts(),before,'Stop after revocation fences the task without further IO');
  }finally{h.controller.dispose();}
});

test('source-scoped Stop cancels start before session creation and conversation waiting for its user turn',{timeout:2000},async()=>{
  for(const stage of ['source','answer','native']){
    const h=setup();existingGrant(h);await h.call('state');h.controller.dispose();
    const entered=deferred(),release=deferred();
    let readAnswer=h.readAnswer;
    if(stage==='source'){
      const frame=h.api.webNavigation.getFrame;
      h.api.webNavigation.getFrame=async(...args)=>{entered.resolve();await release.promise;return frame(...args);};
    }else if(stage==='answer'){
      readAnswer=async(...args)=>{entered.resolve();await release.promise;return h.readAnswer(...args);};
    }else{
      const state=h.files.state;h.files.state=async()=>{entered.resolve();await release.promise;return state();};
    }
    const controller=createChatGPTFilesController({api:h.api,files:h.files,readAnswer});h.userText(task);
    const pending=stage==='answer'?controller.conversationTask({task},pageSender):controller.projectTask({task},pageSender);
    const cancelled=assert.rejects(pending,{code:'E_FILE_PAUSED'});await entered.promise;
    const stopped=controller.projectStop(pageSender);release.resolve();await cancelled;await stopped;
    await controller.tick();assert.deepEqual(h.counts(),{reads:0,writes:0,fills:0});controller.dispose();
  }
});
test('Stop for another source document, URL, window or tab never cancels a pending conversation',{timeout:2000},async()=>{
  for(const change of [{documentId:'different-doc'},{url:source.url+'x'},{tab:{...pageSender.tab,windowId:99}},{tab:{...pageSender.tab,id:88}}]){
    const h=setup();existingGrant(h);await h.call('state');h.controller.dispose();h.userText(task);
    const entered=deferred(),release=deferred();
    const controller=createChatGPTFilesController({api:h.api,files:h.files,readAnswer:async(...args)=>{entered.resolve();await release.promise;return h.readAnswer(...args);}});
    const pending=controller.conversationTask({task},pageSender);await entered.promise;
    const stopped=controller.projectStop({...pageSender,...change}).catch(()=>{});release.resolve();
    assert.equal((await pending).resultStatus,'success');await stopped;
    assert.equal(h.counts().reads,1);controller.dispose();
  }
});
test('Stop survives busy replacement rollback before an already queued alarm wake',{timeout:2000},async()=>{
  const h=setup(),entered=deferred(),release=deferred();
  try{
    await stagedWrite(h);const before=h.counts();
    assert.deepEqual(before,{reads:1,writes:0,fills:1});
    const state=h.files.state;let blocked=false;
    h.files.state=async()=>{if(!blocked){blocked=true;entered.resolve();await release.promise;}return state();};
    const replacement=h.controller.projectTask({task},pageSender);
    const rejected=assert.rejects(replacement,error=>['E_PROJECT_BUSY','E_FILE_PAUSED'].includes(error.code));await entered.promise;
    const get=h.api.storage.local.get;let durableAtWake;
    h.api.storage.local.get=async key=>{
      if(key===configKey&&durableAtWake===undefined)durableAtWake=h.ledger['opendesk.chatgpt.files.tasks.v1']['project:7'].paused===true;
      return get(key);
    };
    const waking=h.controller.tick();
    const stopping=h.controller.projectStop(pageSender);release.resolve();
    await Promise.all([rejected,waking,stopping]);
    assert.deepEqual(h.counts(),before,'a Stop must prevent reads, writes and fills after restoring the busy task');
    assert.equal(h.text(),'safe original\n');
    assert.equal(durableAtWake,true,'the restored pause must be durable before the queued wake starts');
    assert.equal((await h.controller.projectStatus(pageSender)).automation.active,false);
    assert.equal(h.ledger['opendesk.chatgpt.files.tasks.v1']['project:7'].paused,true);
    h.controller.dispose();
    const next=createChatGPTFilesController({api:h.api,files:h.files,readAnswer:h.readAnswer});
    try{await next.tick();assert.deepEqual(h.counts(),before);
      assert.equal((await next.projectStatus(pageSender)).automation.active,false);
    }finally{next.dispose();}
  }finally{release.resolve();h.controller.dispose();}
});
test('busy replacement rollback does not transfer a new document Stop to the previous source',{timeout:2000},async()=>{
  const h=setup();await stagedWrite(h);
  const nextSender={...pageSender,documentId:'replacement-source-document'};
  let documentId=nextSender.documentId;
  const frame=h.api.webNavigation.getFrame;
  h.api.webNavigation.getFrame=async args=>args.tabId===source.tabId?
    {documentId,url:source.url,documentLifecycle:'active'}:frame(args);
  const entered=deferred(),release=deferred(),state=h.files.state;
  h.files.state=async()=>{entered.resolve();await release.promise;return state();};
  const replacement=h.controller.projectTask({task:writeTask},nextSender);
  const rejected=assert.rejects(replacement,{code:'E_PROJECT_BUSY'});await entered.promise;
  const stopping=h.controller.projectStop(nextSender);release.resolve();
  await rejected;await stopping;
  documentId=source.documentId;
  assert.equal((await h.controller.projectStatus(pageSender)).automation.active,true);
  assert.notEqual(h.ledger['opendesk.chatgpt.files.tasks.v1']['project:7'].paused,true);
  assert.equal(h.counts().writes,0);h.controller.dispose();
});


test('trusted project management lists original identities, denies forged senders and stops the exact task',async()=>{
  const h=serviceHarness();
  try{
    const created=await h.send('start',{task},pageSender);
    assert.equal(created.ok,true,JSON.stringify(created));
    const list=await h.send('project-list');
    assert.equal(list.ok,true,JSON.stringify(list));
    assert.equal(list.data.tasks.length,1);
    const reference=list.data.tasks[0];
    assert.equal(reference.sourceTabId,source.tabId);
    assert.equal(reference.sourceDocumentId,source.documentId);
    assert.equal(reference.sourceUrl,source.url);
    const identity={sourceTabId:reference.sourceTabId,sourceDocumentId:reference.sourceDocumentId,projectId:reference.projectId};
    const status=await h.send('project-status',identity);
    assert.equal(status.ok,true,JSON.stringify(status));
    assert.equal(status.data.resultText,'');
    assert.equal(status.data.result,null);
    assert.equal(status.data.comparison,null);
    assert.equal((await h.send('project-list',{},pageSender)).ok,false,'page sender must not read trusted list');
    assert.equal((await h.send('project-stop',identity,pageSender)).ok,false,'page sender must not forge a trusted Stop');
    for(const changed of [{sourceTabId:8},{sourceDocumentId:'another'},{projectId:'forged'}]){
      const bad={...identity,...changed};
      assert.equal((await h.send('project-status',bad)).ok,false);
      assert.equal((await h.send('project-stop',bad)).ok,false);
    }
    const stop=await h.send('project-stop',identity);
    assert.equal(stop.ok,true,JSON.stringify(stop));
    assert.equal(stop.data.phase,'paused');
    assert.deepEqual(h.counts(),{reads:0,writes:0,fills:0});
    const again=await h.send('project-status',identity);
    assert.equal(again.ok,true);assert.equal(again.data.phase,'paused');
    assert.equal(again.data.resultText,'');
    assert.equal((await h.send('project-status',{...identity,unexpected:true})).ok,false);
    assert.equal((await h.send('project-status',identity,{...owner,documentId:'retired'})).ok,false);
    assert.equal((await h.send('project-review',identity,{...owner,url:source.url})).ok,false);
    assert.deepEqual(h.counts(),{reads:0,writes:0,fills:0});
  }finally{h.service.dispose();}
});

test('project task list survives service restart without reenacting the file operation',async()=>{
  const ledger={};let h=serviceHarness(ledger);
  let reference;
  try{
    const start=await h.send('start',{task},pageSender);
    assert.equal(start.ok,true,JSON.stringify(start));
    const list=await h.send('project-list');
    reference=list.data.tasks[0];
    assert.ok(reference?.projectId);
    const first=h.counts();assert.deepEqual(first,{reads:0,writes:0,fills:0});
  }finally{h.service.dispose();}
  h=serviceHarness(ledger);
  try{
    const listed=await h.send('project-list');
    assert.equal(listed.ok,true,JSON.stringify(listed));
    assert.equal(listed.data.tasks.length,1);
    assert.equal(listed.data.tasks[0].projectId,reference.projectId);
    const status=await h.send('project-status',{sourceTabId:reference.sourceTabId,
      sourceDocumentId:reference.sourceDocumentId,projectId:reference.projectId});
    assert.equal(status.ok,true);
    assert.deepEqual(h.counts(),{reads:0,writes:0,fills:0});
  }finally{h.service.dispose();}
});


test('trusted manual review uses a live same-window original document and the existing one-time gate',async()=>{
  const h=serviceHarness();
  let opens=0;
  const originalFrame=h.api.webNavigation.getFrame;
  try{
    h.api.tabs.query=async({windowId,url})=>{
      assert.equal(windowId,3);assert.equal(url,'https://chatgpt.com/*');
      return [{...pageSender.tab,url:source.url}];
    };
    h.api.tabs.create=async options=>{
      opens++;assert.equal(options.openerTabId,source.tabId);
      assert.equal(options.windowId,source.windowId);
      return {id:51,windowId:3};
    };
    const list=await h.send('project-list');
    assert.equal(list.ok,true,JSON.stringify(list));
    assert.equal(list.data.tasks.length,0);
    assert.deepEqual(list.data.sources,[{sourceTabId:7,sourceDocumentId:source.documentId,
      sourceUrl:source.url,sourceWindowId:3}]);
    const identity={sourceTabId:7,sourceDocumentId:source.documentId};
    assert.equal((await h.send('review-source',identity,pageSender)).ok,false);
    assert.equal((await h.send('review-source',{...identity,projectId:'forged'})).ok,false);
    assert.equal((await h.send('review-source',{...identity,sourceDocumentId:'foreign'})).ok,false);
    assert.equal(opens,0);
    const opened=await h.send('review-source',identity);
    assert.equal(opened.ok,true,JSON.stringify(opened));
    assert.equal(opened.data.opened,true);assert.equal(opens,1);
    h.api.webNavigation.getFrame=async args=>args.tabId===7?
      {url:source.url,documentId:'replaced-document',documentLifecycle:'active'}:originalFrame(args);
    assert.equal((await h.send('review-source',identity)).ok,false,
      'retired document cannot open another trusted review');
    assert.equal(opens,1);
    assert.deepEqual(h.counts(),{reads:0,writes:0,fills:0});
  }finally{h.service.dispose();}
});
