// Component evidence, not real Chrome evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatGPTTaskDiscovery} from '../../src/native-agent/chatgpt-task-discovery.js';
import {initChatGPTFixedBridgePage} from '../../src/native-agent/chatgpt-fixed-bridge-page.js';

const message=(id,text=id)=>({textContent:text,getAttribute:key=>key==='data-message-id'?id:null,
  compareDocumentPosition:()=>4,isConnected:true});
const snapshot=()=>({ok:true,route:'c/discovery-test-12345678',users:[message('u0')],
  assistants:[message('a0')],idle:true,busy:false,answerComplete:true,draft:'',rich:false});
const witness=(probe,snap,text='u1')=>{
  snap.draft=text;assert.equal(probe.witnessSubmission(snap),true);snap.draft='';
};
test('P1 discovery ignores a complete historical batch appended after a complete first batch',()=>{
  const probe=createChatGPTTaskDiscovery(),snap=snapshot();probe.reset(snap);
  snap.users.push(message('history-u1'));snap.assistants.push(message('history-a1'));
  assert.equal(probe.observe(snap),null);
  assert.equal(probe.observe(snap),null);
});
test('P1 submission witnesses expire before a user appears and mismatches cannot be revived',()=>{
  for(const change of ['expired','mismatched']){
    let now=0;const probe=createChatGPTTaskDiscovery({now:()=>now}),snap=snapshot();probe.reset(snap);
    witness(probe,snap,'expected prompt');
    if(change==='expired')now=60000;
    snap.users.push(message('u1',change==='mismatched'?'different prompt':'expected prompt'));
    snap.assistants.push(message('a1'));
    assert.equal(probe.observe(snap),null,change);
    snap.users.at(-1).textContent='expected prompt';assert.equal(probe.observe(snap),null,change);
    witness(probe,snap,'new prompt');snap.users.push(message('u2','new prompt'));
    snap.assistants.push(message('a2'));assert.equal(probe.observe(snap)?.user,snap.users.at(-1));
  }
});
test('P1 discovery rejects a reused historical user identity even with matching submitted text',()=>{
  const probe=createChatGPTTaskDiscovery(),snap=snapshot();probe.reset(snap);witness(probe,snap,'new prompt');
  snap.users.push(message('u0','new prompt'));snap.assistants.push(message('a1'));
  assert.equal(probe.observe(snap),null);assert.equal(probe.observe(snap),null);
});
test('P0 discovery ignores initial complete replies and replies already streaming at attachment',()=>{
  for(const streaming of [false,true]){
    const probe=createChatGPTTaskDiscovery(),snap=snapshot();
    snap.busy=streaming;snap.idle=!streaming;snap.answerComplete=!streaming;probe.reset(snap);
    snap.busy=false;snap.idle=true;snap.answerComplete=true;
    assert.equal(probe.observe(snap),null);assert.equal(probe.observe(snap),null);
  }
});
test('P0 discovery waits across send/stream gaps and emits one new complete answer',()=>{
  let now=0;const probe=createChatGPTTaskDiscovery({now:()=>now}),snap=snapshot();probe.reset(snap);
  witness(probe,snap);assert.equal(probe.observe(snap),null);
  snap.users.push(message('u1'));assert.equal(probe.observe(snap),null);
  snap.assistants.push(message('a1','partial'));snap.busy=true;snap.idle=false;snap.answerComplete=false;
  assert.equal(probe.observe(snap),null);
  now=60000;assert.equal(probe.observe(snap),null); // Only waiting for the user node expires, not streaming.
  snap.assistants.at(-1).textContent='complete';snap.busy=false;snap.idle=true;snap.answerComplete=true;
  assert.equal(probe.observe(snap).answer,snap.assistants.at(-1));
  assert.equal(probe.observe(snap),null);
});
test('discovery refuses multiple new assistant replies for one new user turn',()=>{
  const probe=createChatGPTTaskDiscovery(),snap=snapshot();probe.reset(snap);
  witness(probe,snap);
  snap.users.push(message('u1'));probe.observe(snap);
  snap.assistants.push(message('a1'),message('a2'));
  assert.equal(probe.observe(snap),null);
  assert.equal(probe.observe(snap),null);
});
test('P0 discovery does not mistake remounts or regeneration under an old user for a new task',()=>{
  const probe=createChatGPTTaskDiscovery(),snap=snapshot();probe.reset(snap);
  snap.users=snap.users.map(node=>message(node.getAttribute('data-message-id'),node.textContent));
  snap.assistants=snap.assistants.map(node=>message(node.getAttribute('data-message-id'),node.textContent));
  assert.equal(probe.observe(snap),null);
  snap.assistants=[message('regenerated','different candidate')];assert.equal(probe.observe(snap),null);
  snap.users=[message('unidentified-remount','u0')];snap.assistants=[message('old-answer')];
  assert.equal(probe.observe(snap),null);
});
test('P0 discovery tolerates lazy hydration of older replies behind an unchanged latest reply',()=>{
  const probe=createChatGPTTaskDiscovery(),snap=snapshot();
  const older=message('older-answer','ChatGPT 说：ChatGPT');
  snap.assistants.unshift(older);probe.reset(snap);
  witness(probe,snap);
  snap.users.push(message('u1'));assert.equal(probe.observe(snap),null);
  older.textContent='Earlier historical answer, now fully hydrated';
  snap.assistants.push(message('a1','new complete answer'));
  assert.equal(probe.observe(snap)?.answer,snap.assistants.at(-1));
  assert.equal(probe.observe(snap),null);
});
test('P0 lazy history still requires the unchanged latest reply anchor',()=>{
  for(const change of ['missing','edited','replaced','reused-answer','duplicate-anchor']){
    const probe=createChatGPTTaskDiscovery(),snap=snapshot();
    snap.assistants.unshift(message('older-answer'));probe.reset(snap);
    witness(probe,snap);
    snap.users.push(message('u1'));probe.observe(snap);
    if(change==='missing')snap.assistants.pop();
    if(change==='edited')snap.assistants.at(-1).textContent='edited prior reply';
    if(change==='replaced')snap.assistants[1]=message('other-answer');
    if(change==='duplicate-anchor')snap.assistants.unshift(message('a0'));
    snap.assistants.push(change==='reused-answer'?snap.assistants[0]:message('a1'));
    assert.equal(probe.observe(snap),null,change);
  }
});
test('P0 discovery rejects hydrated historical replies reused after the latest anchor',()=>{
  for(const remount of [false,true]){
    const probe=createChatGPTTaskDiscovery(),snap=snapshot();
    const older=message('older-answer','placeholder');snap.assistants.unshift(older);probe.reset(snap);
    witness(probe,snap);
    snap.users.push(message('u1'));probe.observe(snap);
    older.textContent='hydrated historical answer';
    snap.assistants=[snap.assistants[1],remount?message('older-answer',older.textContent):older];
    assert.equal(probe.observe(snap),null,remount?'stable-ID remount':'same node');
  }
});
test('P0 discovery resets on SPA navigation and will only observe a later new user turn',()=>{
  const probe=createChatGPTTaskDiscovery(),snap=snapshot();probe.reset(snap);
  witness(probe,snap);
  snap.users.push(message('u1'));probe.observe(snap);
  snap.route='c/another-conversation';snap.assistants.push(message('a1'));
  assert.equal(probe.observe(snap),null);assert.equal(probe.observe(snap),null);
  witness(probe,snap,'u2');
  snap.users.push(message('u2'));snap.assistants.push(message('a2'));
  assert.equal(probe.observe(snap).user,snap.users.at(-1));
});

const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function pageHarness({taskId='page.read.fixed',args={},targetUrl='https://httpbingo.org/html',
  grantReply=value=>value,bindReply=value=>value,adoptReply=value=>value,initialEmpty=false,
  intentProtocol='opendesk.task.intent.v1',autoTaskReply=value=>({ok:true,data:value}),executeReply=value=>value}={}){
  const nodes=[],sends=[],events=new Map(),windowEvents=new Map(),intervals=new Map(),snap=snapshot();
  let poll,autoRequests=0,nextTurn=0,nextInterval=0;
  if(initialEmpty){snap.users=[];snap.assistants=[];}
  const element=tag=>{
    const node={tag,style:{},classList:{toggle(){}},listeners:{},setAttribute(){},append(){},
      removed:false,remove(){this.removed=true;},
      attachShadow:()=>element('shadow'),addEventListener(type,fn){this.listeners[type]=fn;}};
    nodes.push(node);return node;
  };
  const doc={getElementById:id=>nodes.find(node=>node.id===id&&!node.removed)||null,
    createElement:element,body:element('body'),
    addEventListener:(type,fn)=>events.set(type,fn),removeEventListener:type=>events.delete(type)};
  snap.editor={ownerDocument:doc};snap.form={};
  snap.sendButton={disabled:false,getAttribute:()=>null};doc.activeElement=snap.editor;
  const source={tabId:9,documentId:'document-discovery',url:'https://chatgpt.com/c/discovery-test-12345678'};
  const win={location:{href:source.url,origin:'https://chatgpt.com'},
    setInterval(fn){poll=fn;intervals.set(++nextInterval,fn);return nextInterval;},
    clearInterval:id=>intervals.delete(id),
    addEventListener(type,listener,options){
      if(!windowEvents.has(type))windowEvents.set(type,new Map());
      windowEvents.get(type).set(listener,options?.once===true);
    },
    removeEventListener:(type,listener)=>windowEvents.get(type)?.delete(listener)};win.top=win;
  const emitWindow=(type,event)=>{
    const listeners=windowEvents.get(type);
    for(const [listener,once] of [...(listeners||[])]){
      if(!listeners.has(listener))continue;
      if(once)listeners.delete(listener);
      listener(event);
    }
  };
  const installation={version:'1.0.0',manifestHash:'a'.repeat(64),scriptId:`task:${taskId}:1.0.0`,
    revision:1,contentHash:'b'.repeat(64),installationId:'fixed-install',generation:1};
  const task={taskId,version:'1.0.0',installation,paramsSchema:{properties:{}},siteOrigins:[new URL(targetUrl).origin]};
  const intent={protocol:intentProtocol,candidateId:'p0-new-candidate-123',taskId:task.taskId,
    targetUrl,args};
  let grantHook=()=>{},noCandidate=false;
  const identity=()=>noCandidate?{ok:false,error:{code:'E_CHAT_FORMAT',message:'no candidate'}}:{ok:!snap.busy,turnKey:snap.users.at(-1).getAttribute('data-message-id'),
    answerKey:snap.assistants.at(-1).getAttribute('data-message-id'),blocks:[JSON.stringify(intent)]};
  const scope={taskId:task.taskId,args:{...args},targetUrl:intent.targetUrl,installation};
  const prepared=()=>({requestId:'33333333-3333-4333-8333-333333333333',source:{...source,url:win.location.href},...scope,args:{...intent.args},
    candidate:{candidateId:intent.candidateId,text:JSON.stringify(intent),turnKey:identity().turnKey,answerKey:identity().answerKey}});
  let grant;
  const api={runtime:{id:'extid',getURL:path=>'chrome-extension://extid/'+(path||''),
    onMessage:{addListener(){},removeListener(){}},async sendMessage(msg){
    sends.push(msg);
    if(msg.kind==='list-tasks')return {ok:true,data:{tasks:[task]}};
    if(msg.kind==='approve-conversation-task'){
      grant={grantId:'77777777-7777-4777-8777-777777777777',source,...scope,
        parameterPolicy:'installed-schema',expiresAt:Date.now()+1800000,remainingRuns:msg.adoptedRequest?9:10,
        ...(msg.adoptedRequest?{currentRequest:{requestId:msg.requestId,mode:'auto',expiresAt:Date.now()+300000}}:{})};
      return {ok:true,data:await grantReply(structuredClone(grant))};
    }
    if(msg.kind==='preapprove-next-task'){
      grant={...prepared(),candidate:undefined,baseline:{turnKey:identity().turnKey,answerKey:identity().answerKey},expiresAt:Date.now()+300000};
      grantHook();return {ok:true,data:grantReply(structuredClone(grant))};
    }
    if(msg.kind==='bind-preapproved-task')return {ok:true,data:bindReply({...prepared(),expiresAt:grant.expiresAt,baseline:grant.baseline})};
    if(msg.kind==='auto-task')return autoTaskReply({...prepared(),
      requestId:`55555555-5555-4555-8555-${String(++autoRequests).padStart(12,'0')}`,
      persistentAuto:true,expiresAt:Date.now()+600000});
    if(msg.kind==='adopt-task')return {ok:true,data:await adoptReply({...prepared(),...(msg.conversationGrantId?{
      mode:'auto',conversationGrantId:msg.conversationGrantId,remainingRuns:--grant.remainingRuns}: {})})};
    if(msg.kind==='execute')return executeReply({ok:true,
      data:{sent:true,aiReplyObserved:true,runId:'run-p0',resultId:'result-p0'}},msg);
    if(msg.kind==='revoke-request')return {ok:true,data:{requestId:msg.requestId,revoked:true}};
    return {ok:true,data:{}};
  }}};
  const page=initChatGPTFixedBridgePage({api,doc,win,site:{inspect:()=>({...snap})},readPage:identity});
  const buttons=nodes.filter(node=>node.tag==='button');
  const click=async index=>{await buttons[index].listeners.click({isTrusted:true});await flush();};
  const submit=(text='u'+(nextTurn+1),type='click',overrides={})=>{
    snap.draft=text;
    const event={type,isTrusted:true,button:0,key:'Enter',
      target:type==='click'?snap.sendButton:type==='submit'?snap.form:snap.editor,
      submitter:snap.sendButton,...overrides};
    events.get(type)?.(event);snap.draft='';return event;
  };
  const next=()=>{const turn=++nextTurn;submit('u'+turn);snap.users.push(message('u'+turn));
    snap.assistants.push(message('a'+turn,JSON.stringify(intent)));poll();};
  return {snap,sends,nodes,buttons,win,intent,poll:()=>poll(),next,submit,click,page,events,windowEvents,intervals,emitWindow,
    setNoCandidate:value=>{noCandidate=value;},
    setGrantHook:fn=>{grantHook=fn;},async selectInstalled(){
      const select=nodes.find(node=>node.tag==='select');select.value='__installed__';await select.listeners.change();
      nodes.filter(node=>node.tag==='input')[1].value=intent.targetUrl;
      nodes.find(node=>node.tag==='textarea').value=JSON.stringify(intent.args);
    }};
}
test('P1 Web Flow never auto-runs a historical batch appended after a complete first batch',async t=>{
  const h=pageHarness({intentProtocol:'webflow.task.intent.v1'});t.after(()=>h.page.dispose());
  h.poll();
  h.snap.users.push(message('history-u1'));
  h.snap.assistants.push(message('history-a1',JSON.stringify(h.intent)));
  h.poll();await flush();h.poll();await flush();
  assert.deepEqual(h.sends,[]);
});
for(const type of ['click','keydown','submit'])
test('P1 Web Flow binds a native '+type+' submission across send and stream gaps exactly once',async t=>{
  const h=pageHarness({intentProtocol:'webflow.task.intent.v1'});t.after(()=>h.page.dispose());
  // Native form submission is initiated by a trusted composer Enter/click.
  // requestSubmit() alone can produce a trusted SubmitEvent, so is not a witness.
  if(type==='submit')h.submit('new prompt','keydown');
  h.submit('new prompt',type);h.poll();await flush();assert.deepEqual(h.sends,[]);
  h.snap.users.push(message('u1','new prompt'));h.poll();await flush();assert.deepEqual(h.sends,[]);
  h.snap.assistants.push(message('a1','partial'));h.snap.busy=true;h.snap.idle=false;h.snap.answerComplete=false;
  h.poll();await flush();assert.deepEqual(h.sends,[]);
  h.snap.assistants.at(-1).textContent=JSON.stringify(h.intent);
  h.snap.busy=false;h.snap.idle=true;h.snap.answerComplete=true;
  h.poll();await flush();h.poll();await flush();
  assert.deepEqual(h.sends.map(msg=>msg.kind),['auto-task','execute']);
  assert.equal(h.sends[1].turnKey,'u1');assert.equal(h.sends[1].answerKey,'a1');
  h.snap.users.push(message('history-u2'));h.snap.assistants.push(message('history-a2',JSON.stringify(h.intent)));
  h.poll();await flush();assert.equal(h.sends.length,2);
});
test('P1 Web Flow ignores synthetic, unrelated, disabled, composing and mismatched submissions',async()=>{
  for(const kind of ['synthetic-click','synthetic-keydown','synthetic-submit','uninitiated-submit',
    'wrong-button','wrong-editor','wrong-form','disabled','readonly','aria-disabled','busy','rich',
    'empty','shift-enter','ctrl-enter','meta-enter','alt-enter','repeat','composing','prevented','mismatched']){
    const h=pageHarness({intentProtocol:'webflow.task.intent.v1'});
    try{
      let type='click',text='expected prompt',overrides={};
      if(kind.startsWith('synthetic-')){type=kind.slice(10);overrides.isTrusted=false;}
      if(kind==='uninitiated-submit')type='submit';
      if(kind==='wrong-button')overrides.target={};
      if(kind==='wrong-editor'){type='keydown';overrides.target={};}
      if(kind==='wrong-form'){type='submit';overrides.target={};}
      if(kind==='disabled')h.snap.sendButton.disabled=true;
      if(kind==='readonly')h.snap.editor.readOnly=true;
      if(kind==='aria-disabled')h.snap.sendButton.getAttribute=()=> 'true';
      if(kind==='busy'){h.snap.busy=true;h.snap.idle=false;}
      if(kind==='rich')h.snap.rich=true;
      if(kind==='empty')text='  ';
      if(kind.endsWith('-enter')){type='keydown';overrides[kind.split('-')[0]+'Key']=true;}
      if(kind==='repeat'){type='keydown';overrides.repeat=true;}
      if(kind==='composing'){type='keydown';overrides.isComposing=true;}
      if(kind==='prevented')overrides.defaultPrevented=true;
      h.submit(text,type,overrides);
      h.snap.users.push(message('history-u1',kind==='mismatched'?'different prompt':text));
      h.snap.assistants.push(message('history-a1',JSON.stringify(h.intent)));
      h.snap.busy=false;h.snap.idle=true;h.snap.rich=false;
      h.poll();await flush();h.poll();await flush();assert.deepEqual(h.sends,[],kind);
      h.snap.users.at(-1).textContent=text;h.poll();await flush();assert.deepEqual(h.sends,[],kind);
    }finally{h.page.dispose();}
  }
});
test('P1 a trusted programmatic form submit cannot reuse a consumed composer gesture',async t=>{
  const h=pageHarness({intentProtocol:'webflow.task.intent.v1'});t.after(()=>h.page.dispose());
  h.submit('same prompt');h.snap.users.push(message('u1','same prompt'));
  h.snap.assistants.push(message('a1',JSON.stringify(h.intent)));h.poll();await flush();
  assert.deepEqual(h.sends.map(msg=>msg.kind),['auto-task','execute']);
  h.submit('same prompt','submit');h.snap.users.push(message('u2','same prompt'));
  h.snap.assistants.push(message('a2',JSON.stringify({...h.intent,candidateId:'unwitnessed-candidate'})));
  h.poll();await flush();h.poll();await flush();
  assert.deepEqual(h.sends.map(msg=>msg.kind),['auto-task','execute']);
});
test('P1 an existing complete task remains manually adoptable and executable without a send witness',async t=>{
  const h=pageHarness();t.after(()=>h.page.dispose());
  h.poll();await flush();assert.deepEqual(h.sends,[]);
  await h.click(4);assert.deepEqual(h.sends.map(msg=>msg.kind),['adopt-task']);
  await h.click(2);await h.click(2);
  assert.deepEqual(h.sends.map(msg=>msg.kind),['adopt-task','authorize-task','execute']);
});
test('P1 page removes submission listeners on dispose and reinstalls them once after BFCache',async()=>{
  const h=pageHarness({intentProtocol:'webflow.task.intent.v1'});
  assert.ok(h.events.has('click'));assert.ok(h.events.has('keydown'));
  h.submit('abandoned');h.emitWindow('pagehide',{persisted:true});
  assert.equal(h.events.size,0);
  h.snap.users.push(message('cached-u','abandoned'));h.snap.assistants.push(message('cached-a',JSON.stringify(h.intent)));
  h.emitWindow('pageshow',{persisted:true});h.poll();await flush();assert.deepEqual(h.sends,[]);
  h.next();await flush();assert.deepEqual(h.sends.map(msg=>msg.kind),['auto-task','execute']);
  h.emitWindow('pagehide',{persisted:false});assert.equal(h.events.size,0);assert.equal(h.intervals.size,0);
  h.page.dispose();
});
test('P0 discovery delayed history from an empty shell never adopts, then adopts a real new turn once',async()=>{
  for(const streaming of [false,true]){
    const h=pageHarness({initialEmpty:true});h.poll();
    h.snap.users.push(message('history-user'));
    h.snap.assistants.push(message('history-answer',JSON.stringify(h.intent)));
    h.snap.busy=streaming;h.snap.idle=!streaming;h.snap.answerComplete=!streaming;
    h.poll();await flush();
    assert.equal(h.sends.filter(msg=>msg.kind==='adopt-task').length,0);
    h.snap.busy=false;h.snap.idle=true;h.snap.answerComplete=true;
    h.poll();await flush();h.poll();await flush();
    assert.equal(h.sends.filter(msg=>msg.kind==='adopt-task').length,0);
    h.next();await flush();h.poll();await flush();
    assert.equal(h.sends.filter(msg=>msg.kind==='adopt-task').length,1);
    assert.equal(h.sends.filter(msg=>msg.kind==='execute').length,0);
    h.page.dispose();
  }
});
test('P0 discovery preserves a new turn across same-route editor absence and adopts once',async()=>{
  const h=pageHarness();
  h.submit('u1');
  h.snap.users.push(message('u1'));h.poll();
  h.snap.ok=false;h.poll();
  h.snap.ok=true;h.snap.assistants.push(message('a1','partial'));
  h.snap.busy=true;h.snap.idle=false;h.snap.answerComplete=false;h.poll();await flush();
  assert.equal(h.sends.filter(msg=>msg.kind==='adopt-task').length,0);
  h.snap.assistants.at(-1).textContent=JSON.stringify(h.intent);
  h.snap.busy=false;h.snap.idle=true;h.snap.answerComplete=true;
  h.poll();await flush();h.poll();await flush();
  assert.equal(h.sends.filter(msg=>msg.kind==='adopt-task').length,1);
  assert.equal(h.sends.filter(msg=>msg.kind==='execute').length,0);h.page.dispose();
});
test('P0 discovery ignores staggered initial history until a witnessed new submission',async()=>{
  const h=pageHarness({initialEmpty:true});h.poll();
  h.snap.users.push(message('history-u0'));h.snap.assistants.push(message('history-a0'));
  h.snap.busy=true;h.snap.idle=false;h.snap.answerComplete=false;h.poll();await flush();
  h.snap.users.push(message('history-u1'));
  h.snap.assistants.push(message('history-a1',JSON.stringify(h.intent)));
  h.snap.busy=false;h.snap.idle=true;h.snap.answerComplete=true;
  h.poll();await flush();h.poll();await flush();
  assert.equal(h.sends.filter(msg=>msg.kind==='adopt-task').length,0);
  h.next();await flush();h.poll();await flush();
  assert.equal(h.sends.filter(msg=>msg.kind==='adopt-task').length,1);
  assert.equal(h.sends.filter(msg=>msg.kind==='execute').length,0);h.page.dispose();
});
test('P0 discovery rejects interrupted turns after unknown or different routes and user anchor changes',()=>{
  for(const change of ['unknown-route','different-route','user-id','user-text','prior-anchor','extra-user']){
    const probe=createChatGPTTaskDiscovery(),snap=snapshot();probe.reset(snap);
    witness(probe,snap);
    snap.users.push(message('u1'));assert.equal(probe.observe(snap),null);
    const failed={ok:false,route:snap.route};
    if(change==='unknown-route')delete failed.route;
    if(change==='different-route')failed.route='c/other-chat';
    assert.equal(probe.observe(failed),null);
    if(change==='user-id')snap.users[1]=message('replacement','u1');
    if(change==='user-text')snap.users[1].textContent='edited';
    if(change==='prior-anchor')snap.users[0]=message('replacement-anchor');
    if(change==='extra-user')snap.users.splice(1,0,message('unexpected-user'));
    snap.assistants.push(message('a1'));
    assert.equal(probe.observe(snap),null,change);
    assert.equal(probe.observe(snap),null,change);
  }
});
test('P0 page automatically prepares a new five-field candidate and requires exactly one execute click',async()=>{
  const h=pageHarness();h.poll();assert.equal(h.sends.length,0);
  h.next();await flush();
  assert.equal(h.sends.filter(msg=>msg.kind==='adopt-task').length,1);
  assert.equal(h.sends.filter(msg=>msg.kind==='auto-task').length,0);
  assert.equal(h.sends.filter(msg=>msg.kind==='execute').length,0);
  assert.equal(h.buttons[2].disabled,false);
  await h.click(2);await h.click(2);h.poll();await flush();
  assert.equal(h.sends.filter(msg=>msg.kind==='execute').length,1);h.page.dispose();
});
test('Web Flow page uses a persistent grant for automatic execution and repeats only for a new candidate after settlement',async t=>{
  const grants=[],h=pageHarness({intentProtocol:'webflow.task.intent.v1',autoTaskReply:grant=>{
    grants.push(structuredClone(grant));return {ok:true,data:grant};
  }});t.after(()=>h.page.dispose());
  h.poll();await flush();assert.equal(h.sends.length,0);
  for(const candidateId of ['webflow-candidate-111','webflow-candidate-222']){
    h.intent.candidateId=candidateId;h.next();await flush();
    assert.match(h.nodes.find(node=>node.className==='status').textContent,/本次执行已完成/);
    h.poll();await flush(); // Settled replies must not be admitted or executed again.
  }
  assert.deepEqual(h.sends.map(msg=>msg.kind),['auto-task','execute','auto-task','execute']);
  const executions=h.sends.filter(msg=>msg.kind==='execute');
  assert.notEqual(executions[0].requestId,executions[1].requestId);
  for(const [index,execution] of executions.entries()){
    const admission=h.sends[index*2],grant=grants[index];
    assert.equal(admission.persistentAuto,true);
    assert.equal(execution.persistentAuto,true);assert.equal(execution.mode,'auto');
    assert.equal(execution.requestId,grant.requestId);
    assert.equal(execution.adoptedRequest.requestId,grant.requestId);
    assert.equal(execution.candidateText,grant.candidate.text);
    assert.equal(execution.turnKey,'u'+(index+1));assert.equal(execution.answerKey,'a'+(index+1));
    assert.equal(JSON.parse(execution.candidateText).candidateId,['webflow-candidate-111','webflow-candidate-222'][index]);
  }
});
test('Web Flow page refuses a new candidate without a persistent grant and never authorizes or executes it',async t=>{
  const h=pageHarness({intentProtocol:'webflow.task.intent.v1',autoTaskReply:()=>({ok:false,
    error:{code:'E_WEBFLOW_AUTO_DENIED',message:'没有有效的持续批准'}})});t.after(()=>h.page.dispose());
  h.next();await flush();h.poll();await flush();
  assert.deepEqual(h.sends.map(msg=>msg.kind),['auto-task']);
  assert.match(h.nodes.find(node=>node.className==='status').textContent,/E_WEBFLOW_AUTO_DENIED/);
});
test('Web Flow background admission arms its original request without sending a panel execute',async t=>{
  const h=pageHarness({intentProtocol:'webflow.task.intent.v1',autoTaskReply:grant=>({ok:true,
    data:{...grant,executionOwner:'background'}})});t.after(()=>h.page.dispose());
  h.next();await flush();h.poll();await flush();
  assert.deepEqual(h.sends.map(msg=>msg.kind),['auto-task','background-ready']);
  assert.equal(h.sends[1].requestId,'55555555-5555-4555-8555-000000000001');
  assert.match(h.nodes.find(node=>node.className==='status').textContent,/框架后台/);
});
for(const outcome of ['settled','UNKNOWN'])
test('Web Flow page handles a complete B discovered before A execute ACK: '+outcome,async t=>{
  const ack=Promise.withResolvers();let firstReply;
  const h=pageHarness({intentProtocol:'webflow.task.intent.v1',executeReply:(reply,msg)=>{
    if(JSON.parse(msg.candidateText).candidateId==='webflow-delayed-A'){
      firstReply=reply;return ack.promise;
    }
    return reply;
  }});t.after(()=>h.page.dispose());
  h.intent.candidateId='webflow-delayed-A';h.next();await flush();
  assert.deepEqual(h.sends.map(msg=>msg.kind),['auto-task','execute']);
  h.intent.candidateId='webflow-deferred-B';h.next();await flush();h.poll();await flush();
  assert.deepEqual(h.sends.map(msg=>msg.kind),['auto-task','execute']); // A still owns the in-flight execution.
  ack.resolve(outcome==='settled'?firstReply:{ok:false,error:{code:'E_BRIDGE_OUTCOME_UNKNOWN',
    message:'首轮执行 ACK 结果未知',outcome:'OUTCOME_UNKNOWN'}});
  await flush();h.poll();await flush();h.poll();await flush();
  if(outcome==='UNKNOWN'){
    assert.deepEqual(h.sends.map(msg=>msg.kind),['auto-task','execute']);
    assert.match(h.nodes.find(node=>node.className==='status').textContent,/E_BRIDGE_OUTCOME_UNKNOWN/);
  }else{
    assert.deepEqual(h.sends.map(msg=>msg.kind),['auto-task','execute','auto-task','execute']);
    const admission=h.sends[2],execution=h.sends[3];
    assert.equal(JSON.parse(admission.candidateText).candidateId,'webflow-deferred-B');
    assert.equal(execution.candidateText,admission.candidateText);
    assert.equal(execution.turnKey,'u2');assert.equal(execution.answerKey,'a2');
    assert.equal(execution.persistentAuto,true);assert.equal(execution.mode,'auto');
    assert.notEqual(execution.requestId,h.sends[1].requestId);
    h.poll();await flush();assert.equal(h.sends.length,4);
  }
});
test('Web Flow page rebuilds after persisted hide/show, ignores the cached candidate and runs only a fresh candidate',async t=>{
  const h=pageHarness({intentProtocol:'webflow.task.intent.v1'});
  t.after(()=>h.emitWindow('pagehide',{persisted:false}));
  h.intent.candidateId='webflow-before-cache';h.next();await flush();
  assert.deepEqual(h.sends.map(msg=>msg.kind),['auto-task','execute']);
  const oldRoot=h.nodes.find(node=>node.id==='opendesk-fixed-bridge-r12');
  assert.equal(h.intervals.size,1);
  h.emitWindow('pagehide',{persisted:true});await flush();
  assert.equal(oldRoot.removed,true);assert.equal(h.intervals.size,0);
  h.emitWindow('pageshow',{persisted:true});await flush();
  assert.equal(h.intervals.size,1);
  assert.equal(h.nodes.filter(node=>node.id==='opendesk-fixed-bridge-r12'&&!node.removed).length,1);
  h.poll();await flush();h.poll();await flush();
  assert.deepEqual(h.sends.map(msg=>msg.kind),['auto-task','execute']);
  h.intent.candidateId='webflow-after-cache';h.next();await flush();h.poll();await flush();
  assert.deepEqual(h.sends.map(msg=>msg.kind),['auto-task','execute','auto-task','execute']);
  assert.equal(JSON.parse(h.sends[2].candidateText).candidateId,'webflow-after-cache');
  assert.equal(h.sends[3].candidateText,h.sends[2].candidateText);
  assert.equal(h.sends[3].persistentAuto,true);
});
for(const lifecycle of ['dispose','persisted hide/show'])
test('Web Flow page ignores a late auto-task ACK after '+lifecycle,async t=>{
  const ack=Promise.withResolvers();let oldGrant;
  const h=pageHarness({intentProtocol:'webflow.task.intent.v1',autoTaskReply:grant=>{
    if(grant.candidate.candidateId==='webflow-admission-before-close'){
      oldGrant=structuredClone(grant);return ack.promise;
    }
    return {ok:true,data:grant};
  }});t.after(()=>{h.emitWindow('pagehide',{persisted:false});h.page.dispose();});
  h.intent.candidateId='webflow-admission-before-close';h.next();await flush();
  assert.deepEqual(h.sends.map(msg=>msg.kind),['auto-task']);
  if(lifecycle==='dispose')h.page.dispose();
  else h.emitWindow('pagehide',{persisted:true});
  assert.equal(h.intervals.size,0);
  if(lifecycle==='persisted hide/show'){
    h.emitWindow('pageshow',{persisted:true});await flush();
    assert.equal(h.intervals.size,1);
  }
  ack.resolve({ok:true,data:oldGrant});await flush();h.poll();await flush();h.poll();await flush();
  assert.deepEqual(h.sends.map(msg=>msg.kind),['auto-task']);
  if(lifecycle==='persisted hide/show'){
    h.intent.candidateId='webflow-fresh-after-late-ack';h.next();await flush();h.poll();await flush();
    assert.deepEqual(h.sends.map(msg=>msg.kind),['auto-task','auto-task','execute']);
    assert.equal(JSON.parse(h.sends[2].candidateText).candidateId,'webflow-fresh-after-late-ack');
    assert.notEqual(h.sends[2].requestId,oldGrant.requestId);
    assert.equal(h.sends[2].persistentAuto,true);
  }
});
for(const changed of ['answer','user'])
test('Web Flow page discards deferred B after same-node '+changed+' edits and never revives restored bytes',async t=>{
  const ack=Promise.withResolvers();let firstReply;
  const h=pageHarness({intentProtocol:'webflow.task.intent.v1',executeReply:(reply,msg)=>{
    if(JSON.parse(msg.candidateText).candidateId==='webflow-pending-A'){
      firstReply=reply;return ack.promise;
    }
    return reply;
  }});t.after(()=>h.page.dispose());
  h.intent.candidateId='webflow-pending-A';h.next();await flush();
  h.intent.candidateId='webflow-observed-B';h.next();await flush();
  assert.deepEqual(h.sends.map(msg=>msg.kind),['auto-task','execute']);
  const user=h.snap.users.at(-1),answer=h.snap.assistants.at(-1);
  const userText=user.textContent,answerText=answer.textContent;
  if(changed==='answer'){
    h.intent.candidateId='webflow-unobserved-C';answer.textContent=JSON.stringify(h.intent);
  }else user.textContent='Edited text on the existing user node';
  h.poll();await flush(); // Observe the byte change while A is still awaiting its ACK.
  ack.resolve(firstReply);await flush();h.poll();await flush();h.poll();await flush();
  assert.deepEqual(h.sends.map(msg=>msg.kind),['auto-task','execute']);
  h.intent.candidateId='webflow-observed-B';user.textContent=userText;answer.textContent=answerText;
  h.poll();await flush();h.poll();await flush();
  assert.deepEqual(h.sends.map(msg=>msg.kind),['auto-task','execute']);
  h.intent.candidateId='webflow-fresh-D';h.next();await flush();h.poll();await flush();
  assert.deepEqual(h.sends.map(msg=>msg.kind),['auto-task','execute','auto-task','execute']);
  assert.equal(JSON.parse(h.sends[3].candidateText).candidateId,'webflow-fresh-D');
});
test('P0 preapproved new task executes once while an older reply hydrates',async()=>{
  const h=pageHarness();
  const older=message('older-answer','ChatGPT 说：ChatGPT');h.snap.assistants.unshift(older);
  h.poll();await h.selectInstalled();await h.click(6);
  assert.equal(h.sends.filter(msg=>msg.kind==='preapprove-next-task').length,1);
  h.submit('u1');
  h.snap.users.push(message('u1'));h.poll();await flush();
  older.textContent='Earlier historical answer, now fully hydrated';
  h.snap.assistants.push(message('a1',JSON.stringify(h.intent)));
  h.poll();await flush();h.poll();await flush();
  assert.equal(h.sends.filter(msg=>msg.kind==='bind-preapproved-task').length,1);
  assert.equal(h.sends.filter(msg=>msg.kind==='execute').length,1);
  h.page.dispose();
});
test('P0 discovered task replaces the old task, target and args shown before execution',async()=>{
  for(const taskId of ['page.read.fixed','custom.page.read']){
    const h=pageHarness({taskId});
    const select=h.nodes.find(node=>node.tag==='select');
    const target=h.nodes.filter(node=>node.tag==='input')[1];
    const args=h.nodes.find(node=>node.tag==='textarea');
    select.value='baidu.search.top3';target.value='https://www.baidu.com/s?wd=old';
    args.value='{"query":"old","limit":3}';
    h.next();await flush();
    const selected=h.nodes.find(node=>node.tag==='option'&&node.value===select.value);
    assert.ok(selected?.textContent.includes(taskId));
    assert.equal(target.value,h.intent.targetUrl);
    assert.equal(args.value,JSON.stringify(h.intent.args));
    assert.equal(h.sends.filter(msg=>msg.kind==='execute').length,0);
    assert.equal(h.buttons[2].disabled,false);
    await h.click(2);
    assert.equal(h.sends.filter(msg=>msg.kind==='execute').length,1);
    h.page.dispose();
  }
});
test('P0 page denies in-flight preapproval and binds only a future reply for one automatic run',async()=>{
  for(const race of ['already-streaming','starts-during-approval','future']){
    const h=pageHarness();await h.selectInstalled();
    if(race==='already-streaming'){h.snap.busy=true;h.snap.idle=false;h.snap.answerComplete=false;}
    if(race==='starts-during-approval')h.setGrantHook(()=>{h.snap.busy=true;h.snap.idle=false;h.snap.answerComplete=false;});
    await h.click(6);
    assert.equal(h.sends.filter(msg=>msg.kind==='execute').length,0);
    if(race==='already-streaming')assert.equal(h.sends.filter(msg=>msg.kind==='preapprove-next-task').length,0);
    if(race==='future'){
      h.poll();await flush();assert.equal(h.sends.filter(msg=>msg.kind==='bind-preapproved-task').length,0);
      h.next();await flush();h.poll();await flush();
      assert.equal(h.sends.filter(msg=>msg.kind==='bind-preapproved-task').length,1);
      assert.equal(h.sends.filter(msg=>msg.kind==='execute').length,1);
      assert.equal(h.sends.find(msg=>msg.kind==='execute').mode,'auto');
      assert.equal(h.sends.filter(msg=>msg.kind==='authorize-task').length,0);
    }
    h.page.dispose();
  }
});

const baiduScope={taskId:'baidu.search.top3',args:{query:'OpenDesk Browser',limit:3},
  targetUrl:'https://www.baidu.com/s?wd=OpenDesk%20Browser'};
const storageOrder=scope=>({...scope,
  args:Object.fromEntries(Object.entries(scope.args).sort()),
  installation:Object.fromEntries(Object.entries(scope.installation).sort())});
test('P0 page accepts identical preapproved scope after storage reorders its dictionaries',async()=>{
  for(const grantReply of [value=>value,storageOrder]){
    const h=pageHarness({...baiduScope,grantReply,bindReply:storageOrder});await h.selectInstalled();
    await h.click(6);h.next();await flush();h.poll();await flush();
    assert.equal(h.sends.filter(msg=>msg.kind==='bind-preapproved-task').length,1);
    assert.equal(h.sends.filter(msg=>msg.kind==='execute').length,1);
    h.poll();await flush();assert.equal(h.sends.filter(msg=>msg.kind==='execute').length,1);
    h.page.dispose();
  }
});
test('P0 page still rejects changed preapproval scope, request identity or expiry without retry',async()=>{
  for(const change of [
    value=>({...value,args:{...value.args,limit:2}}),
    value=>({...value,targetUrl:'https://www.baidu.com/s?wd=another'}),
    value=>({...value,installation:{...value.installation,generation:2}}),
    value=>({...value,installation:{...value.installation,contentHash:'c'.repeat(64)}}),
    value=>({...value,requestId:'44444444-4444-4444-8444-444444444444'}),
    value=>({...value,expiresAt:value.expiresAt+1})
  ]){
    const h=pageHarness({...baiduScope,bindReply:value=>change(storageOrder(value))});await h.selectInstalled();
    await h.click(6);h.next();await flush();h.poll();await flush();
    assert.equal(h.sends.filter(msg=>msg.kind==='bind-preapproved-task').length,1);
    assert.equal(h.sends.filter(msg=>msg.kind==='execute').length,0);
    assert.match(h.nodes.find(node=>node.className==='status').textContent,/E_BRIDGE_CONTEXT/);
    h.page.dispose();
  }
});

test('P0 page releases a completed request on SPA navigation without adopting the new chat history',async()=>{
  const h=pageHarness();h.next();await flush();await h.click(2);
  assert.equal(h.sends.filter(msg=>msg.kind==='execute').length,1);
  h.win.location.href='https://chatgpt.com/c/discovery-next-12345678';
  h.snap.route='c/discovery-next-12345678';
  h.snap.users=[message('new-chat-u0')];h.snap.assistants=[message('new-chat-a0')];
  h.poll();await flush();h.poll();await flush();
  assert.equal(h.sends.filter(msg=>msg.kind==='adopt-task').length,1);
  assert.equal(h.buttons[4].disabled,false);
  h.intent.candidateId='p0-new-chat-candidate-456';
  h.submit('new-chat-u1');
  h.snap.users.push(message('new-chat-u1'));h.snap.assistants.push(message('new-chat-a1'));
  h.poll();await flush();
  assert.equal(h.sends.filter(msg=>msg.kind==='adopt-task').length,2);
  assert.equal(h.buttons[2].disabled,false);await h.click(2);
  assert.equal(h.sends.filter(msg=>msg.kind==='execute').length,2);h.page.dispose();
});

test('P0 page ignores a non-task continuation and preserves its completed result receipt',async()=>{
  const h=pageHarness();h.next();await flush();await h.click(2);
  const status=h.nodes.find(node=>node.className==='status');const receipt=status.textContent;
  // Result delivery calls the native button programmatically. It is not a
  // new user gesture and must preserve the original request's receipt.
  h.submit('result-user','click',{isTrusted:false});
  h.setNoCandidate(true);h.snap.users.push(message('result-user'));h.snap.assistants.push(message('result-continuation'));
  h.poll();await flush();
  assert.equal(h.sends.filter(msg=>msg.kind==='adopt-task').length,1);
  assert.equal(status.textContent,receipt);h.page.dispose();
});

test('a malformed preapproved candidate can be revoked without stopping a run that never started',async()=>{
  const h=pageHarness();await h.selectInstalled();await h.click(6);
  h.intent.protocol='malformed';h.next();await flush();
  assert.equal(h.sends.filter(row=>row.kind==='execute').length,0);
  await h.click(3);
  assert.equal(h.sends.filter(row=>row.kind==='cancel').length,0);
  assert.equal(h.sends.filter(row=>row.kind==='revoke-request').length,1);
  assert.match(h.nodes.find(node=>node.className==='status').textContent,/授权已撤销；不会执行/);
  assert.equal(h.buttons[6].disabled,false);h.page.dispose();
});

test('recognized command approves this chat once and subsequent changed parameters execute automatically',async()=>{
  const h=pageHarness({taskId:'custom.search',args:{query:'first'}});h.next();await flush();
  assert.equal(h.sends.filter(row=>row.kind==='execute').length,0);
  const approve=h.buttons.find(button=>button.textContent==='允许本聊天');
  assert.equal(approve.disabled,false);await approve.listeners.click({isTrusted:true});await flush();
  assert.equal(h.sends.filter(row=>row.kind==='execute').length,1);
  assert.equal(h.sends.filter(row=>row.kind==='authorize-task').length,0);
  h.intent.candidateId='second-chat-search';h.intent.args={query:'second'};
  h.next();await flush();
  assert.equal(h.sends.filter(row=>row.kind==='execute').length,2);
  const adopted=h.sends.filter(row=>row.kind==='adopt-task');
  assert.equal(adopted[0].conversationGrantId,undefined);
  assert.equal(adopted[1].conversationGrantId,'77777777-7777-4777-8777-777777777777');
  assert.deepEqual(JSON.parse(h.sends.filter(row=>row.kind==='execute')[1].candidateText).args,{query:'second'});
  h.page.dispose();
});
test('chat grant does not authorize a different target and navigation removes its local reuse',async()=>{
  const h=pageHarness();await h.selectInstalled();
  await h.buttons.find(button=>button.textContent==='允许本聊天').listeners.click({isTrusted:true});await flush();
  h.intent.targetUrl='https://httpbingo.org/another';h.next();await flush();
  assert.equal(h.sends.filter(row=>row.kind==='execute').length,0);
  assert.equal(h.sends.find(row=>row.kind==='adopt-task').conversationGrantId,undefined);
  h.win.location.href='https://chatgpt.com/c/another-grant-chat';h.poll();await flush();
  assert.equal(h.buttons.find(button=>button.textContent==='撤销本聊天授权').hidden,true);h.page.dispose();
});

test('manual adoption of an old command never spends a chat grant or executes automatically',async()=>{
  const h=pageHarness();await h.selectInstalled();await h.click(7);
  await h.click(4);
  assert.equal(h.sends.find(row=>row.kind==='adopt-task').conversationGrantId,undefined);
  assert.equal(h.sends.filter(row=>row.kind==='execute').length,0);
  assert.equal(h.buttons[2].disabled,false);await h.click(2);
  assert.equal(h.sends.filter(row=>row.kind==='execute').length,1);h.page.dispose();
});
test('unknown chat adoption freezes further allocations until explicit revocation is confirmed',async()=>{
  for(const failure of ['lost-ack','wrong-count']){
    const h=pageHarness({adoptReply:value=>{
      if(!value.conversationGrantId)return value;
      if(failure==='lost-ack')throw Object.assign(new Error('ACK lost'),{code:'E_BRIDGE_TRANSPORT'});
      return {...value,remainingRuns:value.remainingRuns-1};
    }});
    await h.selectInstalled();await h.click(7);h.next();await flush();
    assert.equal(h.sends.filter(row=>row.kind==='execute').length,0);
    for(let i=2;i<4;i++){
      h.intent.candidateId='unknown-next-'+i;
      h.snap.users.push(message('u'+i));h.snap.assistants.push(message('a'+i,JSON.stringify(h.intent)));
      h.poll();await flush();
    }
    assert.equal(h.sends.filter(row=>row.kind==='adopt-task'&&row.conversationGrantId).length,1,failure);
    assert.match(h.nodes.filter(node=>node.className==='hint').map(node=>node.textContent).join('\n'),/UNKNOWN|未知/);
    const revoke=h.buttons.find(button=>button.textContent==='撤销本聊天授权');
    assert.equal(revoke.disabled,false);await revoke.listeners.click({isTrusted:true});await flush();
    assert.equal(h.buttons[7].disabled,false);h.page.dispose();
  }
});
test('new complete command received during approval is retained and adopted exactly once after its ACK',async()=>{
  let release;const waiting=new Promise(resolve=>{release=resolve;});
  const h=pageHarness({grantReply:async value=>{await waiting;return value;}});
  await h.selectInstalled();const approval=h.click(7);await flush();
  h.next();await flush();assert.equal(h.sends.filter(row=>row.kind==='adopt-task').length,0);
  release();await approval;h.poll();await flush();h.poll();await flush();
  assert.equal(h.sends.filter(row=>row.kind==='adopt-task').length,1);
  assert.equal(h.sends.filter(row=>row.kind==='execute').length,1);h.page.dispose();
});
test('queued discovery is discarded if the command bytes or conversation changed while approval waited',async()=>{
  for(const change of ['bytes','navigation','incomplete']){
    let release;const waiting=new Promise(resolve=>{release=resolve;});
    const h=pageHarness({grantReply:async value=>{await waiting;return value;}});
    await h.selectInstalled();const approval=h.click(7);await flush();h.next();await flush();
    if(change==='bytes')h.snap.assistants.at(-1).textContent='changed after discovery';
    if(change==='navigation'){
      h.win.location.href='https://chatgpt.com/c/changed-while-approving';h.snap.route='c/changed-while-approving';
    }
    if(change==='incomplete'){h.snap.busy=true;h.snap.idle=false;h.snap.answerComplete=false;}
    release();await approval;h.poll();await flush();
    assert.equal(h.sends.filter(row=>row.kind==='adopt-task').length,0,change);
    assert.equal(h.sends.filter(row=>row.kind==='execute').length,0,change);h.page.dispose();
  }
});

test('UNKNOWN after an adoption ACK also blocks later polling of the restored candidate',async()=>{
  const h=pageHarness({adoptReply:value=>{h.setNoCandidate(true);return value;}});
  await h.selectInstalled();await h.click(7);h.next();await flush();
  assert.equal(h.sends.filter(row=>row.kind==='execute').length,0);
  h.setNoCandidate(false);h.poll();await flush();h.poll();await flush();
  assert.equal(h.sends.filter(row=>row.kind==='execute').length,0);
  assert.match(h.nodes.filter(node=>node.className==='hint').map(node=>node.textContent).join('\n'),/UNKNOWN/);
  h.page.dispose();
});
