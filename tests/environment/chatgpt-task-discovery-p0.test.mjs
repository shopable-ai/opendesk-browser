// Component evidence, not real Chrome evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatGPTTaskDiscovery} from '../../src/native-agent/chatgpt-task-discovery.js';
import {initChatGPTFixedBridgePage} from '../../src/native-agent/chatgpt-fixed-bridge-page.js';

const message=(id,text=id)=>({textContent:text,getAttribute:key=>key==='data-message-id'?id:null,
  compareDocumentPosition:()=>4,isConnected:true});
const snapshot=()=>({ok:true,route:'c/discovery-test-12345678',users:[message('u0')],
  assistants:[message('a0')],idle:true,busy:false,answerComplete:true,draft:'',rich:false});
test('P0 discovery ignores initial complete replies and replies already streaming at attachment',()=>{
  for(const streaming of [false,true]){
    const probe=createChatGPTTaskDiscovery(),snap=snapshot();
    snap.busy=streaming;snap.idle=!streaming;snap.answerComplete=!streaming;probe.reset(snap);
    snap.busy=false;snap.idle=true;snap.answerComplete=true;
    assert.equal(probe.observe(snap),null);assert.equal(probe.observe(snap),null);
  }
});
test('P0 discovery waits across send/stream gaps and emits one new complete answer',()=>{
  const probe=createChatGPTTaskDiscovery(),snap=snapshot();probe.reset(snap);
  snap.users.push(message('u1'));assert.equal(probe.observe(snap),null);
  snap.assistants.push(message('a1','partial'));snap.busy=true;snap.idle=false;snap.answerComplete=false;
  assert.equal(probe.observe(snap),null);
  snap.assistants.at(-1).textContent='complete';snap.busy=false;snap.idle=true;snap.answerComplete=true;
  assert.equal(probe.observe(snap).answer,snap.assistants.at(-1));
  assert.equal(probe.observe(snap),null);
});
test('discovery refuses multiple new assistant replies for one new user turn',()=>{
  const probe=createChatGPTTaskDiscovery(),snap=snapshot();probe.reset(snap);
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
    snap.users.push(message('u1'));probe.observe(snap);
    older.textContent='hydrated historical answer';
    snap.assistants=[snap.assistants[1],remount?message('older-answer',older.textContent):older];
    assert.equal(probe.observe(snap),null,remount?'stable-ID remount':'same node');
  }
});
test('P0 discovery resets on SPA navigation and will only observe a later new user turn',()=>{
  const probe=createChatGPTTaskDiscovery(),snap=snapshot();probe.reset(snap);
  snap.users.push(message('u1'));probe.observe(snap);
  snap.route='c/another-conversation';snap.assistants.push(message('a1'));
  assert.equal(probe.observe(snap),null);assert.equal(probe.observe(snap),null);
  snap.users.push(message('u2'));snap.assistants.push(message('a2'));
  assert.equal(probe.observe(snap).user,snap.users.at(-1));
});

const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function pageHarness({taskId='page.read.fixed',args={},targetUrl='https://httpbingo.org/html',
  grantReply=value=>value,bindReply=value=>value,initialEmpty=false,
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
  const prepared=()=>({requestId:'33333333-3333-4333-8333-333333333333',source:{...source,url:win.location.href},...scope,
    candidate:{candidateId:intent.candidateId,text:JSON.stringify(intent),turnKey:identity().turnKey,answerKey:identity().answerKey}});
  let grant;
  const api={runtime:{id:'extid',onMessage:{addListener(){},removeListener(){}},async sendMessage(msg){
    sends.push(msg);
    if(msg.kind==='list-tasks')return {ok:true,data:{tasks:[task]}};
    if(msg.kind==='preapprove-next-task'){
      grant={...prepared(),candidate:undefined,baseline:{turnKey:identity().turnKey,answerKey:identity().answerKey},expiresAt:Date.now()+300000};
      grantHook();return {ok:true,data:grantReply(structuredClone(grant))};
    }
    if(msg.kind==='bind-preapproved-task')return {ok:true,data:bindReply({...prepared(),expiresAt:grant.expiresAt,baseline:grant.baseline})};
    if(msg.kind==='auto-task')return autoTaskReply({...prepared(),
      requestId:`55555555-5555-4555-8555-${String(++autoRequests).padStart(12,'0')}`,
      persistentAuto:true,expiresAt:Date.now()+600000});
    if(msg.kind==='adopt-task')return {ok:true,data:prepared()};
    if(msg.kind==='execute')return executeReply({ok:true,
      data:{sent:true,aiReplyObserved:true,runId:'run-p0',resultId:'result-p0'}},msg);
    if(msg.kind==='revoke-request')return {ok:true,data:{requestId:msg.requestId,revoked:true}};
    return {ok:true,data:{}};
  }}};
  const page=initChatGPTFixedBridgePage({api,doc,win,site:{inspect:()=>({...snap})},readPage:identity});
  const buttons=nodes.filter(node=>node.tag==='button');
  const click=async index=>{await buttons[index].listeners.click({isTrusted:true});await flush();};
  const next=()=>{const turn=++nextTurn;snap.users.push(message('u'+turn));
    snap.assistants.push(message('a'+turn,JSON.stringify(intent)));poll();};
  return {snap,sends,nodes,buttons,win,intent,poll:()=>poll(),next,click,page,events,windowEvents,intervals,emitWindow,
    setNoCandidate:value=>{noCandidate=value;},
    setGrantHook:fn=>{grantHook=fn;},async selectInstalled(){
      const select=nodes.find(node=>node.tag==='select');select.value='__installed__';await select.listeners.change();
      nodes.filter(node=>node.tag==='input')[1].value=intent.targetUrl;
      nodes.find(node=>node.tag==='textarea').value=JSON.stringify(intent.args);
    }};
}
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
test('P0 discovery keeps establishing history until staggered initial loading completes',async()=>{
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
  h.snap.users.push(message('new-chat-u1'));h.snap.assistants.push(message('new-chat-a1'));
  h.poll();await flush();
  assert.equal(h.sends.filter(msg=>msg.kind==='adopt-task').length,2);
  assert.equal(h.buttons[2].disabled,false);await h.click(2);
  assert.equal(h.sends.filter(msg=>msg.kind==='execute').length,2);h.page.dispose();
});

test('P0 page ignores a non-task continuation and preserves its completed result receipt',async()=>{
  const h=pageHarness();h.next();await flush();await h.click(2);
  const status=h.nodes.find(node=>node.className==='status');const receipt=status.textContent;
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
