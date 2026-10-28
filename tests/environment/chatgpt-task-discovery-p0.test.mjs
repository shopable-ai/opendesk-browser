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
test('P0 discovery does not mistake remounts or regeneration under an old user for a new task',()=>{
  const probe=createChatGPTTaskDiscovery(),snap=snapshot();probe.reset(snap);
  snap.users=snap.users.map(node=>message(node.getAttribute('data-message-id'),node.textContent));
  snap.assistants=snap.assistants.map(node=>message(node.getAttribute('data-message-id'),node.textContent));
  assert.equal(probe.observe(snap),null);
  snap.assistants=[message('regenerated','different candidate')];assert.equal(probe.observe(snap),null);
  snap.users=[message('unidentified-remount','u0')];snap.assistants=[message('old-answer')];
  assert.equal(probe.observe(snap),null);
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
  grantReply=value=>value,bindReply=value=>value}={}){
  const nodes=[],sends=[],events=new Map(),snap=snapshot();let poll;
  const element=tag=>{
    const node={tag,style:{},classList:{toggle(){}},listeners:{},setAttribute(){},append(){},remove(){},
      attachShadow:()=>element('shadow'),addEventListener(type,fn){this.listeners[type]=fn;}};
    nodes.push(node);return node;
  };
  const doc={getElementById:()=>null,createElement:element,body:element('body'),
    addEventListener:(type,fn)=>events.set(type,fn),removeEventListener:type=>events.delete(type)};
  snap.editor={ownerDocument:doc};snap.form={};
  const source={tabId:9,documentId:'document-discovery',url:'https://chatgpt.com/c/discovery-test-12345678'};
  const win={location:{href:source.url,origin:'https://chatgpt.com'},setInterval(fn){poll=fn;return 1;},
    clearInterval(){},addEventListener(){},removeEventListener(){}};win.top=win;
  const installation={version:'1.0.0',manifestHash:'a'.repeat(64),scriptId:`task:${taskId}:1.0.0`,
    revision:1,contentHash:'b'.repeat(64),installationId:'fixed-install',generation:1};
  const task={taskId,version:'1.0.0',installation,paramsSchema:{properties:{}},siteOrigins:[new URL(targetUrl).origin]};
  const intent={protocol:'opendesk.task.intent.v1',candidateId:'p0-new-candidate-123',taskId:task.taskId,
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
    if(msg.kind==='adopt-task')return {ok:true,data:prepared()};
    if(msg.kind==='execute')return {ok:true,data:{sent:true,aiReplyObserved:true,runId:'run-p0',resultId:'result-p0'}};
    if(msg.kind==='revoke-request')return {ok:true,data:{requestId:msg.requestId,revoked:true}};
    return {ok:true,data:{}};
  }}};
  const page=initChatGPTFixedBridgePage({api,doc,win,site:{inspect:()=>({...snap})},readPage:identity});
  const buttons=nodes.filter(node=>node.tag==='button');
  const click=async index=>{await buttons[index].listeners.click({isTrusted:true});await flush();};
  const next=()=>{snap.users.push(message('u1'));snap.assistants.push(message('a1',JSON.stringify(intent)));poll();};
  return {snap,sends,nodes,buttons,win,intent,poll:()=>poll(),next,click,page,events,
    setNoCandidate:value=>{noCandidate=value;},
    setGrantHook:fn=>{grantHook=fn;},async selectInstalled(){
      const select=nodes.find(node=>node.tag==='select');select.value='__installed__';await select.listeners.change();
      nodes.filter(node=>node.tag==='input')[1].value=intent.targetUrl;
      nodes.find(node=>node.tag==='textarea').value=JSON.stringify(intent.args);
    }};
}
test('P0 page automatically prepares a new five-field candidate and requires exactly one execute click',async()=>{
  const h=pageHarness();h.poll();assert.equal(h.sends.length,0);
  h.next();await flush();
  assert.equal(h.sends.filter(msg=>msg.kind==='adopt-task').length,1);
  assert.equal(h.sends.filter(msg=>msg.kind==='execute').length,0);
  assert.equal(h.buttons[2].disabled,false);
  await h.click(2);await h.click(2);h.poll();await flush();
  assert.equal(h.sends.filter(msg=>msg.kind==='execute').length,1);h.page.dispose();
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
