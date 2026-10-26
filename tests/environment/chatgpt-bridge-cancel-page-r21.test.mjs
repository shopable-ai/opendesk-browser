// Node simulation only; these tests do not constitute Chrome/Native evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {initChatGPTFixedBridgePage} from '../../src/native-agent/chatgpt-fixed-bridge-page.js';

const id='33333333-3333-4333-8333-333333333333';
const source={tabId:9,documentId:'document-cancel',url:'https://chatgpt.com/c/search-session-12345678'};
const candidate=JSON.stringify({protocol:'opendesk.task.request.v1',kind:'opendesk.task.request',
  version:1,requestId:id,taskId:'page.read.fixed',args:{}});
const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
function harness(overrides={}){
  const nodes=[],events=new Map(),sends=[];
  const element=tag=>{
    const attrs=new Map();
    const node={tag,style:{},classList:{toggle(){}},listeners:{},
      setAttribute(k,v){attrs.set(k,v);},getAttribute:k=>attrs.get(k),hasAttribute:k=>attrs.has(k),
      removeAttribute(k){attrs.delete(k);},append(){},remove(){},
      attachShadow:()=>element('shadow'),addEventListener(type,fn){this.listeners[type]=fn;}};
    nodes.push(node);return node;
  };
  const doc={getElementById:()=>null,createElement:element,body:element('body'),
    addEventListener(type,fn){if(!events.has(type))events.set(type,new Set());events.get(type).add(fn);},
    removeEventListener:(type,fn)=>events.get(type)?.delete(fn)};
  let poll,onMessage,currentRequestId=id;
  const win={location:{href:source.url,origin:'https://chatgpt.com'},
    setInterval(fn){poll=fn;return 1;},clearInterval(){},addEventListener(){},removeEventListener(){}};
  win.top=win;
  const editor={ownerDocument:doc,focus(){doc.activeElement=editor;}};
  const snap={ok:true,route:'c/search-session-12345678',editor,form:element('form'),idle:true,
    busy:false,answerComplete:true,draft:'',rich:false,users:[],assistants:[{}]};
  const writes=[],commits=[];
  const site={inspect:()=>({...snap}),prepare(text){writes.push(text);snap.draft=text;
    return {ok:true,token:{before:{}}};},commit(token){commits.push(token);return {ok:true};},confirm:()=>true};
  const api={runtime:{id:'extid',getURL:()=>'chrome-extension://extid/',
    onMessage:{addListener(fn){onMessage=fn;},removeListener(){}},
    async sendMessage(message){
      sends.push(message);
      if(overrides[message.kind]){
        const data=await overrides[message.kind](message);
        if(message.kind==='prepare')currentRequestId=data.requestId;
        return {ok:true,data};
      }
      if(message.kind==='prepare')return {ok:true,data:{requestId:id,source}};
      if(message.kind==='revoke-request')return {ok:true,data:{requestId:id,revoked:true}};
      if(message.kind==='cancel')return {ok:true,data:{cancelled:true,runId:'run-1',
        executionState:'stop-requested',deliveryState:'cancelled'}};
      if(message.kind==='check-delivery')return {ok:true,data:{allowed:true}};
      return {ok:true,data:{}};
    }}};
  const page=initChatGPTFixedBridgePage({api,doc,win,site,readPage:()=>({ok:true,
    turnKey:'turn-1',answerKey:'answer-1:0',blocks:[JSON.stringify({...JSON.parse(candidate),requestId:currentRequestId})]})});
  const buttons=nodes.filter(x=>x.tag==='button');
  const status=nodes.find(x=>x.className==='status');
  const click=i=>{assert.ok(buttons[i],`button ${i} exists`);return buttons[i].listeners.click({isTrusted:true});};
  const prepare=async()=>{await click(0);snap.users=[...snap.users,{textContent:currentRequestId}];snap.draft='';};
  const deliver=(fields={})=>new Promise(resolve=>{
    assert.equal(onMessage({protocol:'opendesk.chatgpt.bridge.r12.v1',kind:'deliver',requestId:currentRequestId,
      sourceUrl:source.url,mode:'manual',turnKey:'turn-1',answerKey:'answer-1:0',
      runId:'run-1',resultId:'result-1',text:'real result',...fields},
    {id:'extid',url:'chrome-extension://extid/sidepanel.html?hostInstanceId=owner'},resolve),true);
  });
  return {page,sends,buttons,status,snap,site,win,writes,commits,click,prepare,deliver,poll:()=>poll()};
}

test('homepage explains how to establish a conversation and never mints a request',async()=>{
  const h=harness();h.win.location.href='https://chatgpt.com/';h.poll();
  assert.equal(h.buttons[0].disabled,true);
  assert.match(h.status.textContent,/先在 ChatGPT 发送一条消息/);
  assert.match(h.status.textContent,/选择一个已有对话/);
  await h.click(0);
  assert.equal(h.sends.length,0);assert.equal(h.writes.length,0);
  assert.match(h.status.textContent,/尚未建立会话/);h.page.dispose();
});

test('SPA conversation creation enables prepare and leaving it restores guidance without writing',()=>{
  const h=harness();h.win.location.href='https://chatgpt.com/';h.poll();
  h.win.location.href=source.url;h.poll();
  assert.equal(h.buttons[0].disabled,false);
  assert.match(h.status.textContent,/先选择任务并建立请求/);
  h.win.location.href='https://chatgpt.com/plugins';h.poll();
  assert.equal(h.buttons[0].disabled,true);
  assert.match(h.status.textContent,/尚未建立会话/);
  assert.equal(h.sends.length,0);assert.equal(h.writes.length,0);h.page.dispose();
});

test('approved complete candidate cancelled before polling never executes or edits the draft',async()=>{
  const h=harness();await h.prepare();await h.click(1);
  h.snap.draft='user draft';await h.click(3);h.poll();h.click(2);await flush();
  assert.equal(h.buttons.length,4);assert.equal(h.buttons[3].textContent,'停止/取消');
  assert.equal(h.sends.filter(x=>x.kind==='execute').length,0);
  assert.equal(h.sends.filter(x=>x.kind==='cancel').length,0);
  assert.deepEqual(h.sends.find(x=>x.kind==='revoke-request'),
    {protocol:'opendesk.chatgpt.bridge.r12.v1',kind:'revoke-request',requestId:id});
  assert.equal(h.snap.draft,'user draft');assert.equal(h.writes.length,1);h.page.dispose();
});

test('late manual and auto authorizations cannot dispatch execute or overwrite cancellation',async()=>{
  for(const button of [1,2]){
    const authorization=Promise.withResolvers();
    const h=harness({authorize:()=>authorization.promise});await h.prepare();
    const approval=h.click(button);await flush();await h.click(3);
    assert.equal(h.buttons[0].disabled,true,'original pending operation retains its fence');
    const status=h.status.textContent;
    authorization.resolve({});await approval;await flush();h.poll();await flush();
    assert.equal(h.sends.filter(x=>x.kind==='execute').length,0);
    assert.equal(h.sends.filter(x=>x.kind==='cancel').length,0);
    assert.equal(h.status.textContent,status);h.page.dispose();
  }
});

test('execute cancellation sends Stop without waiting for revoke and rejects late deliver and success',async()=>{
  const execution=Promise.withResolvers(),revoke=Promise.withResolvers();
  const h=harness({execute:()=>execution.promise,'revoke-request':()=>revoke.promise});
  await h.prepare();h.click(2);await flush();const cancelling=h.click(3);await flush();
  const stop=h.sends.find(x=>x.kind==='cancel');
  assert.deepEqual(stop,{protocol:'opendesk.chatgpt.bridge.r12.v1',kind:'cancel',
    requestId:id,source,sourceUrl:source.url});
  assert.equal(h.buttons[0].disabled,true);
  assert.equal((await h.deliver()).ok,false);assert.equal(h.writes.length,1);
  revoke.resolve({requestId:id,revoked:true});await cancelling;
  assert.match(h.status.textContent,/运行 ID：run-1/);
  const status=h.status.textContent;
  execution.resolve({sent:true,aiReplyObserved:true});await flush();
  assert.equal(h.status.textContent,status);assert.equal(h.commits.length,0);h.page.dispose();
});

test('late pre-send delivery permission cannot write or commit after cancellation',async()=>{
  const permission=Promise.withResolvers(),execution=Promise.withResolvers();
  const h=harness({execute:()=>execution.promise,'check-delivery':()=>permission.promise});
  await h.prepare();h.click(2);await flush();const delivery=h.deliver();await flush();
  await h.click(3);const status=h.status.textContent;
  permission.resolve({allowed:true});assert.equal((await delivery).ok,false);
  assert.equal(h.writes.length,1);assert.equal(h.commits.length,0);
  assert.equal(h.status.textContent,status);
  execution.resolve({sent:true});await flush();h.page.dispose();
});

test('cancel failure remains UNKNOWN despite late execute success',async()=>{
  const execution=Promise.withResolvers();
  const h=harness({execute:()=>execution.promise,cancel:()=>{throw Error('transport lost');}});
  await h.prepare();h.click(2);await flush();await h.click(3);
  assert.match(h.status.textContent,/UNKNOWN/);const status=h.status.textContent;
  execution.resolve({sent:true,aiReplyObserved:true});await flush();
  assert.equal(h.status.textContent,status);h.page.dispose();
});


test('native commit disables cancellation unless it explicitly reports no click was attempted',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  for(const retry of [false,true]){
    const execution=Promise.withResolvers();
    const h=harness({execute:()=>execution.promise});await h.prepare();h.click(2);await flush();
    let submittedDisabled;
    h.site.commit=token=>{h.commits.push(token);submittedDisabled=h.buttons[3].disabled;
      return {ok:false,retry,reason:'send outcome unknown'};};
    const delivery=h.deliver();await flush();
    t.mock.timers.tick(250);await flush();
    assert.equal(submittedDisabled,true,'fence is set synchronously before native commit');
    assert.equal(h.buttons[3].disabled,!retry);
    const writes=h.writes.length;
    await h.click(3);
    if(retry){
      assert.match(h.status.textContent,/UNKNOWN/);
      assert.equal(h.sends.filter(x=>x.kind==='cancel').length,1);
      t.mock.timers.tick(250);await flush();
    }else assert.equal(h.sends.filter(x=>x.kind==='cancel').length,0);
    assert.equal((await delivery).ok,false);
    assert.equal(h.commits.length,1);assert.equal(h.writes.length,writes);
    assert.equal(h.snap.draft,'real result','cancellation does not delete the result draft');
    assert.equal(h.snap.form.getAttribute('data-opendesk-composer-owner'),'chatgpt-fixed-bridge');
    execution.resolve({sent:false});await flush();h.page.dispose();
  }
});

test('late second delivery check cannot commit or delete an already written draft',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const execution=Promise.withResolvers(),permission=Promise.withResolvers();let checks=0;
  const h=harness({execute:()=>execution.promise,'check-delivery':()=>
    ++checks===1?{allowed:true}:permission.promise});
  await h.prepare();h.click(2);await flush();const delivery=h.deliver();await flush();
  assert.equal(h.snap.draft,'real result');
  t.mock.timers.tick(250);await flush();assert.equal(checks,2);
  await h.click(3);const status=h.status.textContent;
  permission.resolve({allowed:true});assert.equal((await delivery).ok,false);
  assert.equal(h.commits.length,0);assert.equal(h.snap.draft,'real result');
  assert.equal(h.status.textContent,status);
  execution.resolve({sent:true});await flush();h.page.dispose();
});

test('prepared revoke failure is UNKNOWN and untrusted clicks never cancel',async()=>{
  const h=harness({'revoke-request':()=>{throw Error('disk write failed');}});
  await h.prepare();
  await h.buttons[3].listeners.click({isTrusted:false});
  assert.equal(h.sends.filter(x=>x.kind==='revoke-request').length,0);
  await h.click(3);assert.match(h.status.textContent,/UNKNOWN/);
  h.click(2);h.poll();await flush();
  assert.equal(h.sends.filter(x=>x.kind==='execute'||x.kind==='cancel').length,0);
  assert.equal(h.writes.length,1);h.page.dispose();
});

test('preparing a replacement request disables cancellation of the old request',async()=>{
  const overrides={};const h=harness(overrides);await h.prepare();
  const prepared=Promise.withResolvers();h.snap.draft='';
  overrides.prepare=()=>prepared.promise;
  const preparation=h.click(0);
  assert.equal(h.buttons[3].disabled,true);
  await h.click(3);
  assert.equal(h.sends.filter(x=>x.kind==='revoke-request').length,0);
  prepared.resolve({requestId:id,source});await preparation;
  assert.equal(h.buttons[3].disabled,false);
  h.page.dispose();
});


test('confirmed manual delivery releases the composer for a different approved auto request exactly once',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const nextId='44444444-4444-4444-8444-444444444444';
  const deliveries=[],overrides={};const h=harness(overrides);
  t.after(()=>h.page.dispose());
  // Model only site observations; the page listener runs the real deliver path.
  h.site.prepare=(text,before)=>{h.writes.push(text);h.snap.draft=text;
    return {ok:true,token:{before}};};
  h.site.commit=token=>{
    h.commits.push(token);const text=h.snap.draft,answer={};
    const user={textContent:text,compareDocumentPosition:node=>node===answer?4:1};
    h.snap.draft='';h.snap.users=[...h.snap.users,user];
    h.snap.assistants=[...h.snap.assistants,answer];return {ok:true};
  };
  h.site.confirm=(before,text,current)=>current.users.length===before.users.length+1&&
    current.users.at(-1)?.textContent===text;
  overrides.execute=async message=>{
    const reply=await h.deliver({requestId:message.requestId,mode:message.mode,
      runId:'run-'+message.requestId,resultId:'result-'+message.requestId});
    deliveries.push(reply);return reply.data;
  };
  const finish=async()=>{await flush();for(const ms of [250,300,400]){
    t.mock.timers.tick(ms);await flush();}};
  await h.prepare();h.click(2);await finish();
  assert.deepEqual(deliveries,[{ok:true,data:{sent:true,userObserved:true,aiReplyObserved:true}}]);
  assert.equal(h.snap.form.hasAttribute('data-opendesk-composer-owner'),false);
  overrides.prepare=()=>({requestId:nextId,source});
  await h.prepare();await h.click(1);h.poll();await finish();
  assert.equal(deliveries.length,2);
  assert.deepEqual(deliveries[1],deliveries[0]);
  assert.deepEqual(h.sends.filter(x=>x.kind==='execute').map(x=>[x.requestId,x.mode]),
    [[id,'manual'],[nextId,'auto']]);
  assert.equal(h.commits.length,2);
  assert.deepEqual(h.commits.map(x=>x.before.draft),['','']);
  h.poll();h.click(2);await flush();
  assert.equal((await h.deliver({mode:'auto'})).ok,false);
  assert.equal(h.commits.length,2);assert.equal(h.writes.length,4);
});

test('a new request cannot clear or replace an UNKNOWN composer marker even after the draft becomes empty',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const nextId='44444444-4444-4444-8444-444444444444',overrides={};
  const h=harness(overrides);t.after(()=>h.page.dispose());
  const replies=[];
  overrides.execute=async message=>{const reply=await h.deliver({mode:message.mode});
    replies.push(reply);return reply.data;};
  h.site.commit=token=>{h.commits.push(token);return {ok:false,reason:'unknown native click'};};
  await h.prepare();h.click(2);await flush();t.mock.timers.tick(250);await flush();
  assert.equal(replies[0].error.code,'E_CHAT_DELIVERY_UNKNOWN');
  const marker='data-opendesk-composer-owner';
  assert.equal(h.snap.form.getAttribute(marker),'chatgpt-fixed-bridge');
  // Website clearing alone is not a user takeover or a confirmed delivery.
  h.snap.draft='';overrides.prepare=()=>({requestId:nextId,source});
  await h.prepare();await h.click(1);h.poll();await flush();
  assert.equal(replies.length,2);assert.equal(replies[1].error.code,'E_CHAT_DRAFT');
  assert.equal(h.snap.draft,'');assert.equal(h.writes.length,3);
  assert.equal(h.commits.length,1);
  assert.equal(h.snap.form.getAttribute(marker),'chatgpt-fixed-bridge');
});
