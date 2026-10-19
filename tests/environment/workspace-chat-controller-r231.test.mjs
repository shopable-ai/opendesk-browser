import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createWorkspaceChatEdit,initWorkspaceChatEdit} from '../../src/native-agent/workspace-chat-edit-ui.js';

const sha=text=>createHash('sha256').update(text).digest('hex');
const envelope=(prompt,tag)=>JSON.parse(prompt.match(new RegExp('```'+tag+'\\s+([\\s\\S]*?)\\s+```'))[1]);
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};

// Stub only the Chrome/Native boundaries. No document, elements, or page-function
// emulation: the production read/fill wrappers still verify the injected replies.
function harness({demo=false,unknownFill=false,readGate=null,fillGate=null}={}){
  let authority={workspaceId:'workspace-'+randomUUID(),sourceId:'source-a',leaseEpoch:randomUUID(),sessionId:randomUUID(),access:'read-write',devLeaseEpoch:1};
  let target={tabId:7,documentId:'document-a',url:'https://chatgpt.com/c/conversation-a'};
  let record={workspaceId:authority.workspaceId,path:'README.md',content:'original',baseContent:'original',sha256:sha('original')};
  const page={turnKey:'turn-1',answerKey:'answer-1',text:''};
  const calls={reads:0,fills:0,drafts:0,runs:0,scripts:[]};
  const api={webNavigation:{getFrame:async()=>({...target})},scripting:{executeScript:async options=>{
    calls.scripts.push(options);
    const args=options.args[0];let result;
    if(Object.hasOwn(args,'identityOnly'))result={ok:true,url:target.url,turnKey:page.turnKey,answerKey:page.answerKey,blocks:args.identityOnly?[]:[page.text]};
    else if(options.func.name==='fillChatGPTComposerOnPage'){
      calls.fills++;
      if(fillGate)await fillGate.promise;
      if(unknownFill)throw new Error('lost injection response');
      result={ok:true,url:target.url,filled:true,sent:false,readBackVerified:true};
    }else result={ok:true,url:target.url};
    return [{frameId:0,documentId:target.documentId,result}];
  }}};
  const controller=createWorkspaceChatEdit({api,demo,getRecord:()=>record,getTarget:()=>demo?null:target,
    getAuthority:()=>authority,assertAuthority:async expected=>{
      if(['workspaceId','sourceId','leaseEpoch','sessionId','access'].some(key=>expected[key]!==authority[key]))throw {code:'E_FILES_SESSION'};
    },isWritable:()=>authority.access==='read-write',readCurrent:async()=>{if(readGate)await readGate.promise;return record;},
    setDraft:(item,text)=>{calls.drafts++;item.content=text;},run:async fn=>{calls.runs++;await fn();},
    requestFile:async()=>{calls.reads++;return {record,data:{workspaceId:record.workspaceId,path:record.path,content:record.content,sha256:record.sha256,bytes:record.content.length}};}});
  controller.update({connected:true});
  return {controller,calls,page,get record(){return record;},get target(){return target;},
    changeAuthority(patch){authority={...authority,...patch};},changeTarget(patch){target={...target,...patch};},
    async prepareProposal(){
      await controller.actions.prepareEdit();
      page.text=JSON.stringify({...envelope(controller.getSnapshot().prompt,'json'),content:'approved'});
      if(demo){controller.actions.setAnswer(page.text);await controller.actions.review();}
      else await controller.actions.readChatGPT();
    },saveDraft(){record.baseContent=record.content;record.sha256=sha(record.content);}};
}

test('DOM-free snapshots are stable, immutable, subscribed, and keyed by action names',()=>{
  assert.equal(initWorkspaceChatEdit,createWorkspaceChatEdit);
  const {controller,calls}=harness({demo:true});
  const initial=controller.getSnapshot();let notifications=0;
  const unsubscribe=controller.subscribe(()=>{notifications++;});
  assert.equal(controller.getSnapshot(),initial);
  controller.actions.setTask('Make a change');controller.actions.setRequestPath('notes.txt');controller.actions.setAnswer('untrusted answer');
  const state=controller.getSnapshot();
  assert.equal(initial.task,'');assert.equal(state.task,'Make a change');assert.equal(state.requestPath,'notes.txt');
  assert.equal(state.answer,'untrusted answer');assert.ok(Object.isFrozen(state));assert.ok(Object.isFrozen(state.controls));
  assert.deepEqual(Object.keys(state.controls).sort(),Object.keys(controller.actions).sort());
  assert.equal(notifications,3);assert.equal(calls.runs,0);assert.equal(calls.drafts,0);assert.equal(calls.scripts.length,0);
  unsubscribe();controller.actions.setTask('Changed');assert.equal(notifications,3);
});

test('review never adopts or saves; explicit adoption and verified save produce a receipt',async()=>{
  const h=harness({demo:true}),c=h.controller;
  await h.prepareProposal();
  assert.equal(c.getSnapshot().contextFile,'README.md');assert.equal(c.getSnapshot().proposalBefore,'original');
  assert.equal(c.getSnapshot().proposalAfter,'approved');assert.equal(h.record.content,'original');assert.equal(h.calls.drafts,0);
  c.actions.setAnswer(h.page.text);assert.equal(c.getSnapshot().proposal,null);
  await c.actions.review();await c.actions.adopt();
  assert.equal(h.calls.drafts,1);assert.equal(h.record.content,'approved');assert.equal(h.record.baseContent,'original');
  assert.equal(c.getSnapshot().receipt,'');await c.beforeSave(h.record);
  h.saveDraft();await c.saved(h.record);
  const receipt=JSON.parse(c.getSnapshot().receipt);
  assert.equal(receipt.saved,true);assert.equal(receipt.readBackVerified,true);assert.equal(receipt.sha256,sha('approved'));
});

test('a committed approved version gets its own receipt while newer input stays dirty',async()=>{
  const h=harness(),c=h.controller;await h.prepareProposal();await c.actions.adopt();await c.beforeSave(h.record);
  const committed=Object.freeze({...h.record,baseContent:'approved',sha256:sha('approved'),unknown:false,remote:null});
  h.record.baseContent=committed.content;h.record.sha256=committed.sha256;h.record.content='newer unsaved input';
  await c.saved({...h.record},committed);assert.equal(c.getSnapshot().receipt,'','only the original WeakMap identity may consume adoption');
  await c.saved(h.record,committed);
  const receipt=JSON.parse(c.getSnapshot().receipt);
  assert.equal(receipt.sha256,sha('approved'));assert.equal(receipt.bytes,Buffer.byteLength('approved'));
  assert.equal(h.record.content,'newer unsaved input');assert.equal(h.record.baseContent,'approved');
  assert.notEqual(h.record.content,h.record.baseContent);assert.match(c.getSnapshot().status.text,/后续编辑.*未保存/);
});

test('a submitted version differing from the approved bytes cannot receive an AI success receipt',async()=>{
  const h=harness(),c=h.controller;await h.prepareProposal();await c.actions.adopt();
  const content='manually changed submission';
  const committed=Object.freeze({...h.record,content,baseContent:content,sha256:sha(content),unknown:false,remote:null});
  // The live draft still matches the proposal; receipt attribution must use the submitted version.
  await c.saved(h.record,committed);
  assert.equal(c.getSnapshot().receipt,'');assert.match(c.getSnapshot().status.text,/人工调整/);
  assert.equal(h.record.content,'approved');
});

test('reviewed proposals remain bound to the document, turn, answer, session and lease',async t=>{
  for(const [name,change,code] of [
    ['document',h=>h.changeTarget({documentId:'document-b'}),'E_CHAT_TARGET'],
    ['turn',h=>{h.page.turnKey='turn-2';},'E_CHAT_TURN'],
    ['answer',h=>{h.page.answerKey='answer-2';},'E_CHAT_ANSWER'],
    ['session',h=>h.changeAuthority({sessionId:randomUUID()}),'E_FILES_SESSION'],
    ['lease',h=>h.changeAuthority({leaseEpoch:randomUUID()}),'E_FILES_SESSION']
  ])await t.test(name,async()=>{
    const h=harness();await h.prepareProposal();assert.ok(h.controller.getSnapshot().proposal);
    change(h);await h.controller.actions.adopt();
    assert.equal(h.calls.drafts,0);assert.match(h.controller.getSnapshot().status.text,new RegExp(code));
  });
});

test('beforeSave rejects an adopted proposal after lease revocation; saved withholds its receipt',async()=>{
  const h=harness();await h.prepareProposal();await h.controller.actions.adopt();
  h.changeAuthority({leaseEpoch:randomUUID()});h.controller.authorityChanged();
  await assert.rejects(h.controller.beforeSave(h.record));
  h.saveDraft();await h.controller.saved(h.record,Object.freeze({...h.record}));
  assert.equal(h.controller.getSnapshot().receipt,'');assert.equal(h.controller.getSnapshot().status.error,true);
});

test('an unknown composer outcome retains the Native result and cannot refill or re-read its nonce',async()=>{
  const h=harness({unknownFill:true}),c=h.controller;
  c.actions.setRequestPath('README.md');await c.actions.prepareFileRequest();
  h.page.text=JSON.stringify(envelope(c.getSnapshot().prompt,'opendesk-request'));
  await c.actions.readChatGPT();
  const result=c.getSnapshot().resultText;
  assert.ok(result.includes('original'));assert.equal(h.calls.reads,1);assert.equal(h.calls.fills,1);
  assert.equal(c.getSnapshot().controls.refillResult,false);assert.match(c.getSnapshot().stages.fill,/结果未知/);
  await c.actions.refillResult();await c.actions.readChatGPT();
  assert.equal(h.calls.reads,1);assert.equal(h.calls.fills,1);assert.equal(c.getSnapshot().resultText,result);
  assert.match(c.getSnapshot().status.text,/E_REQUEST_REPLAY/);assert.equal(h.calls.drafts,0);
});

test('concurrent fill actions reserve one packet before the asynchronous page checks',async()=>{
  const gate=deferred(),h=harness({fillGate:gate,unknownFill:true}),c=h.controller;
  await c.actions.prepareFileRequest();
  const pending=c.actions.fillContext();
  await c.actions.fillContext();
  for(let n=0;n<80&&h.calls.fills===0;n++)await Promise.resolve();
  assert.equal(h.calls.fills,1);assert.equal(c.getSnapshot().promptState,'filling');
  assert.equal(c.getSnapshot().controls.fillContext,false);assert.match(c.getSnapshot().status.text,/E_CHAT_REPLAY/);
  gate.resolve();await pending;
  assert.equal(c.getSnapshot().promptState,'unknown');
  await c.actions.fillContext();assert.equal(h.calls.fills,1);
});

test('disposing an in-flight binding prevents late context publication and future actions',async()=>{
  const gate=deferred(),h=harness({demo:true,readGate:gate}),c=h.controller;
  const pending=c.actions.prepareEdit();await Promise.resolve();await Promise.resolve();
  c.dispose();const snapshot=c.getSnapshot();gate.resolve();await pending;
  assert.equal(c.getSnapshot(),snapshot);assert.equal(snapshot.prompt,'');
  assert.ok(Object.values(snapshot.controls).every(enabled=>enabled===false));
  c.actions.setTask('late');await c.actions.prepareEdit();assert.equal(c.getSnapshot(),snapshot);
  assert.equal(h.calls.drafts,0);
});
