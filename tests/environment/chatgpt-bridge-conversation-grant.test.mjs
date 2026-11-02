import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatGPTBridgeTriggerLedger,installChatGPTBridgeTriggerGate,
  CHATGPT_BRIDGE_LEDGER_KEY as KEY,CHATGPT_BRIDGE_PROTOCOL as protocol}
  from '../../src/native-agent/chatgpt-bridge-trigger-gate.js';

const source={tabId:7,documentId:'document-current',url:'https://chatgpt.com/c/conversation-current'};
const scope={taskId:'article.read',targetUrl:'https://example.com/article',installation:{
  version:'1.2.3',manifestHash:'a'.repeat(64),scriptId:'task:article.read:1.2.3',
  revision:1,contentHash:'b'.repeat(64),installationId:'install-article',generation:2}};
function store(){
  let data={};
  return {get:async key=>({[key]:structuredClone(data[key])}),
    set:async value=>{Object.assign(data,structuredClone(value));},rows:()=>structuredClone(data[KEY]||{})};
}
function harness(){
  const storage=store(),session=store();let now=1000,n=0;
  const restart=()=>createChatGPTBridgeTriggerLedger({storage,revocationStorage:session,clock:()=>now,
    generateId:()=>`11111111-1111-4111-8111-${String(++n).padStart(12,'0')}`});
  return {storage,session,restart,ledger:restart(),advance:ms=>{now+=ms;}};
}
function candidate(n,args={maxChars:n}){
  const candidateId=`candidate-${n}`;
  return {candidateId,turnKey:`turn-${n}`,answerKey:`answer-${n}`,text:JSON.stringify({
    protocol:'opendesk.task.intent.v1',candidateId,taskId:scope.taskId,targetUrl:scope.targetUrl,args})};
}
const input=n=>({...scope,args:{maxChars:n},candidate:candidate(n)});
const context=row=>({...row,mode:'auto',turnKey:row.candidate.turnKey,answerKey:row.candidate.answerKey});
const denied=work=>assert.rejects(async()=>await work());

test('conversation approval fixes installation and exact target for 30 minutes without parameters or baseline',async()=>{
  const h=harness(),grant=await h.ledger.approveConversation(source,scope);
  assert.deepEqual(grant,{grantId:Object.keys(h.storage.rows())[0],source,...scope,
    expiresAt:1801000,remainingRuns:10,parameterPolicy:'installed-schema'});
  assert.match(grant.grantId,/^[a-f0-9-]{36}$/);
  const row=h.storage.rows()[grant.grantId];
  assert.equal(row.kind,'conversation-grant');assert.equal(row.status,'approved');
  assert.deepEqual(row.scope,{...scope,args:{}});
  await denied(()=>h.ledger.approveConversation(source,scope));
  await denied(()=>h.restart().approveConversation(source,{...scope,targetUrl:'https://example.com/other'}));
  for(const bad of [{...scope,targetUrl:''},{taskId:scope.taskId},{...scope,installation:{...scope.installation,generation:0}}])
    await denied(()=>h.ledger.approveConversation({...source,tabId:8},bad));
});

test('successive candidates with different args allocate and consume independent auto requests',async()=>{
  const h=harness(),grant=await h.ledger.approveConversation(source,scope);
  for(let n=1;n<=3;n++){
    const row=await h.ledger.prepare(source,{...input(n),conversationGrantId:grant.grantId});
    assert.equal(row.mode,'auto');assert.equal(row.conversationGrantId,grant.grantId);
    assert.equal(row.remainingRuns,10-n);
    assert.equal(h.storage.rows()[row.requestId].status,'approved');
    assert.ok(h.storage.rows()[row.requestId].approvalExpiresAt<=grant.expiresAt);
    assert.equal((await h.ledger.reserve(context(row))).consumed,true);
    assert.equal((await h.ledger.assertConsumed(context(row))).allowed,true);
    await denied(()=>h.ledger.reserve(context(row)));
  }
});

test('authorizeConversation reuses a prepared candidate and serializes one durable debit before ACK',async()=>{
  const h=harness(),prepared=await h.ledger.prepare(source,input(1));
  const grant=await h.ledger.approveConversation(source,scope);
  const request={...prepared,grantId:grant.grantId};
  const results=await Promise.allSettled([h.ledger.authorizeConversation(request),h.ledger.authorizeConversation(request)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.deepEqual(results.find(r=>r.status==='fulfilled').value,
    {requestId:prepared.requestId,mode:'auto',expiresAt:301000,remainingRuns:9});
  const rows=h.storage.rows();assert.equal(rows[grant.grantId].remainingRuns,9);
  assert.equal(rows[prepared.requestId].conversationGrantId,grant.grantId);
  await denied(()=>h.restart().authorizeConversation(request));
  await denied(()=>h.restart().prepare(source,{...input(1),conversationGrantId:grant.grantId}));
  assert.equal((await h.restart().reserve(context(prepared))).consumed,true);
});

test('grant prepare rejects missing candidate and every source, task, target and installation mismatch without fallback',async()=>{
  const h=harness(),grant=await h.ledger.approveConversation(source,scope);
  const good={...input(1),conversationGrantId:grant.grantId};
  const bad=[{...good,conversationGrantId:''},{...good,conversationGrantId:'unknown'},
    {...good,candidate:undefined},{...good,taskId:'other.task'},
    {...good,targetUrl:scope.targetUrl+'/'},
    ...Object.keys(scope.installation).map(key=>({...good,installation:{...scope.installation,
      [key]:typeof scope.installation[key]==='number'?scope.installation[key]+1:scope.installation[key]+'x'}}))];
  for(const value of bad)await denied(()=>h.ledger.prepare(source,value));
  for(const changed of [{...source,tabId:8},{...source,documentId:'different'},
    {...source,url:source.url+'/'}])await denied(()=>h.ledger.prepare(changed,good));
  assert.equal(h.storage.rows()[grant.grantId].remainingRuns,10);
  assert.equal(Object.keys(h.storage.rows()).length,1);
});

test('authorizeConversation requires the original prepared candidate and exact approved scope',async()=>{
  const h=harness(),prepared=await h.ledger.prepare(source,input(1));
  const grant=await h.ledger.approveConversation(source,scope),good={...prepared,grantId:grant.grantId};
  for(const bad of [{...good,candidate:undefined},{...good,candidate:candidate(2)},
    {...good,args:{maxChars:2}},{...good,source:{...source,documentId:'other'}},
    {...good,targetUrl:scope.targetUrl+'/'},{...good,grantId:prepared.requestId}])
    await denied(()=>h.ledger.authorizeConversation(bad));
  assert.equal(h.storage.rows()[grant.grantId].remainingRuns,10);
  await h.ledger.authorizeConversation(good);
});

test('Host-normalized schema defaults may differ from the original candidate args',async()=>{
  const h=harness(),grant=await h.ledger.approveConversation(source,scope);
  const selected={...input(1),candidate:candidate(1,{})};
  const first=await h.ledger.prepare(source,{...selected,conversationGrantId:grant.grantId});
  await h.ledger.reserve(context(first));
  const second=await h.ledger.prepare(source,{...input(2),candidate:candidate(2,{})});
  assert.equal((await h.ledger.authorizeConversation({...second,grantId:grant.grantId})).remainingRuns,8);
});

test('a mismatched candidate task or exact target is never admitted under a grant',async()=>{
  const h=harness(),grant=await h.ledger.approveConversation(source,scope);
  for(const change of [{taskId:'other.task'},{targetUrl:scope.targetUrl+'/'}]){
    const selected=input(1),intent={...JSON.parse(selected.candidate.text),...change};
    selected.candidate.text=JSON.stringify(intent);
    await denied(()=>h.ledger.prepare(source,{...selected,conversationGrantId:grant.grantId}));
  }
  assert.equal(h.storage.rows()[grant.grantId].remainingRuns,10);
});

test('ten-run limit is atomic, exhaustion preserves allocated child, expiry blocks consumption and delivery',async()=>{
  const h=harness(),grant=await h.ledger.approveConversation(source,scope);
  const results=await Promise.allSettled(Array.from({length:11},(_,n)=>h.ledger.prepare(source,
    {...input(n+1),conversationGrantId:grant.grantId})));
  const allocated=results.filter(r=>r.status==='fulfilled').map(r=>r.value);
  assert.equal(allocated.length,10);assert.equal(h.storage.rows()[grant.grantId].remainingRuns,0);
  const last=allocated.at(-1);await h.ledger.reserve(context(last));
  assert.equal((await h.ledger.assertConsumed(context(last))).allowed,true);
  await denied(()=>h.ledger.approveConversation(source,scope));
  h.advance(1800000);
  await denied(()=>h.ledger.assertConsumed(context(last)));
  await denied(()=>h.ledger.prepare(source,{...input(12),conversationGrantId:grant.grantId}));
  // Expiry does not erase the original candidate replay tombstone.
  const renewed=await h.ledger.approveConversation(source,scope);
  await denied(()=>h.ledger.prepare(source,{...input(1),conversationGrantId:renewed.grantId}));
});

test('parent expiry also fences an unconsumed child even when its own deadline has not elapsed',async()=>{
  const h=harness(),grant=await h.ledger.approveConversation(source,scope);
  h.advance(1799000);
  const row=await h.ledger.prepare(source,{...input(1),conversationGrantId:grant.grantId});
  assert.equal(h.storage.rows()[row.requestId].approvalExpiresAt,grant.expiresAt);
  h.advance(1000);await denied(()=>h.ledger.reserve(context(row)));
});

test('ordinary prepare and legacy preapproval preserve parent grants and keep old manual semantics',async()=>{
  const h=harness(),grant=await h.ledger.approveConversation(source,scope);
  const plain=await h.ledger.prepare(source);
  assert.equal(plain.mode,undefined);assert.equal(h.storage.rows()[grant.grantId].status,'approved');
  await h.ledger.authorize({...plain,mode:'manual'});
  await h.ledger.reserve({...plain,mode:'manual',turnKey:'turn',answerKey:'answer'});
  await h.ledger.preapproveNext(source,{...scope,args:{},baseline:{turnKey:'old',answerKey:'old'}});
  assert.equal(h.storage.rows()[grant.grantId].status,'approved');
});

test('ordinary request eviction never erases a live grant or permits duplicate authorization',async()=>{
  const h=harness(),grant=await h.ledger.approveConversation(source,scope);
  for(let n=0;n<513;n++)await h.ledger.prepare(source);
  assert.equal(h.storage.rows()[grant.grantId]?.status,'approved');
  await assert.rejects(h.restart().approveConversation(source,scope),{code:'E_BRIDGE_REPLAY'});
});

test('parent, source and global revocation fence children and consumed delivery across reconstruction',async()=>{
  for(const revoke of ['parent','source','all']){
    const h=harness(),grant=await h.ledger.approveConversation(source,scope);
    const first=await h.ledger.prepare(source,{...input(1),conversationGrantId:grant.grantId});
    await h.ledger.reserve(context(first));
    const second=await h.ledger.prepare(source,{...input(2),conversationGrantId:grant.grantId});
    if(revoke==='parent')await h.ledger.revokeRequest({source,requestId:grant.grantId});
    else if(revoke==='source')await h.ledger.revokeSource(source.tabId);
    else await h.ledger.revokeApprovals();
    const rows=h.storage.rows();
    for(const id of [grant.grantId,first.requestId,second.requestId])assert.equal(rows[id].status,'revoked');
    await denied(()=>h.restart().reserve(context(second)));
    await denied(()=>h.restart().assertConsumed(context(first)));
    await denied(()=>h.restart().prepare(source,{...input(3),conversationGrantId:grant.grantId}));
  }
});

test('failed parent revocation persists its recovery fence and cascades before admission after restart',async()=>{
  const h=harness(),grant=await h.ledger.approveConversation(source,scope);
  const row=await h.ledger.prepare(source,{...input(1),conversationGrantId:grant.grantId});
  await h.ledger.reserve(context(row));
  const set=h.storage.set;h.storage.set=async()=>{throw Error('local unavailable');};
  await assert.rejects(h.ledger.revokeRequest({source,requestId:grant.grantId}),/local unavailable/);
  assert.equal(h.session.rows().requests[0].requestId,grant.grantId);
  h.storage.set=set;
  await denied(()=>h.restart().assertConsumed(context(row)));
  assert.equal(h.storage.rows()[row.requestId].status,'revoked');
});

test('durable child write with lost ACK is not retried or debited twice after reconstruction',async()=>{
  const h=harness(),grant=await h.ledger.approveConversation(source,scope),set=h.storage.set;
  h.storage.set=async value=>{await set(value);throw Error('ACK lost');};
  await assert.rejects(h.ledger.prepare(source,{...input(1),conversationGrantId:grant.grantId}),/ACK lost/);
  h.storage.set=set;
  await denied(()=>h.restart().prepare(source,{...input(1),conversationGrantId:grant.grantId}));
  assert.equal(h.storage.rows()[grant.grantId].remainingRuns,9);
  assert.equal(Object.values(h.storage.rows()).filter(row=>row.candidate).length,1);
});

test('lost parent ACK rejects duplicate grants after restart and candidate tombstones survive ordinary pruning',async()=>{
  const h=harness(),set=h.storage.set;
  h.storage.set=async value=>{await set(value);throw Error('ACK lost');};
  await assert.rejects(h.ledger.approveConversation(source,scope),/ACK lost/);
  h.storage.set=set;
  await assert.rejects(h.restart().approveConversation(source,scope),{code:'E_BRIDGE_REPLAY'});
  const grantId=Object.keys(h.storage.rows())[0];
  await h.ledger.prepare(source,{...input(1),conversationGrantId:grantId});
  h.advance(8*86400000);
  await h.restart().prepare(source);
  await assert.rejects(h.restart().prepare({...source,documentId:'reloaded'},input(1)),{code:'E_BRIDGE_REPLAY'});
});

test('failed child persistence leaves neither a debit nor an approved child',async()=>{
  const h=harness(),grant=await h.ledger.approveConversation(source,scope),before=h.storage.rows(),set=h.storage.set;
  h.storage.set=async()=>{throw Error('write denied');};
  await assert.rejects(h.ledger.prepare(source,{...input(1),conversationGrantId:grant.grantId}),/write denied/);
  assert.deepEqual(h.storage.rows(),before);
  h.storage.set=set;
  assert.equal((await h.ledger.prepare(source,{...input(2),conversationGrantId:grant.grantId})).remainingRuns,9);
});

function gateHarness({holdFrame=false}={}){
  const h=harness(),events={},frame=Promise.withResolvers();
  const event=name=>({addListener:fn=>{events[name]=fn;}});
  const api={storage:{local:h.storage,session:h.session},runtime:{id:'extid',getURL:()=> 'chrome-extension://extid/',
    onMessage:event('message')},webNavigation:{getFrame:async()=>holdFrame?frame.promise:
      ({...source,documentLifecycle:'active'}),onCommitted:event('navigation'),onHistoryStateUpdated:event('history')},
    tabs:{get:async()=>({id:source.tabId,url:source.url}),onRemoved:event('close')},permissions:{onRemoved:event('permission')}};
  const ledger=installChatGPTBridgeTriggerGate({api,clock:()=>1000});
  const trusted={id:'extid',url:'chrome-extension://extid/sidepanel.html?hostInstanceId=trusted'};
  const call=(msg,sender=trusted)=>new Promise(resolve=>{
    assert.equal(events.message({protocol,...msg},sender,resolve),true);
  });
  return {...h,events,frame,ledger,trusted,call};
}

test('new gate actions dispatch only for trusted sidepanel and browser-observed exact source',async()=>{
  const h=gateHarness(),approve={kind:'approve-conversation',source,...scope};
  for(const sender of [{id:'extid',frameId:0,tab:{id:7},documentId:source.documentId,url:source.url},
    {...h.trusted,id:'foreign'},...['toolId=x','previewId=x','scheduledRunner=1'].map(s=>({...h.trusted,url:h.trusted.url+'&'+s}))]){
    for(const kind of ['approve-conversation','authorize-conversation'])
      assert.equal((await h.call({...approve,kind},sender)).error.code,'E_BRIDGE_SENDER');
  }
  assert.equal((await h.call({...approve,source:{...source,documentId:'other'}})).error.code,'E_BRIDGE_SOURCE');
  const prepared=await h.ledger.prepare(source,input(1));
  const grant=await h.call(approve);assert.equal(grant.ok,true);
  const authorized=await h.call({kind:'authorize-conversation',...prepared,grantId:grant.data.grantId});
  assert.equal(authorized.ok,true);assert.equal(authorized.data.remainingRuns,9);
});

test('source and permission epochs reject new grant actions racing browser identity checks',async()=>{
  for(const kind of ['approve-conversation','authorize-conversation'])for(const change of ['navigation','permission']){
    const h=gateHarness({holdFrame:true});
    const prepared=await h.ledger.prepare(source,input(1));
    const grant=await h.ledger.approveConversation(source,scope);
    const pending=h.call({kind,source,...scope,...(kind==='authorize-conversation'?{...prepared,grantId:grant.grantId}:{})});
    await Promise.resolve();
    if(change==='permission')h.events.permission();else h.events.navigation({tabId:source.tabId,frameId:0});
    h.frame.resolve({...source,documentLifecycle:'active'});
    assert.equal((await pending).ok,false);
  }
});
