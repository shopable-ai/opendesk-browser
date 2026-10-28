// Node simulation only; these tests do not constitute Chrome/Native evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {initChatGPTFixedBridgePage} from '../../src/native-agent/chatgpt-fixed-bridge-page.js';
import {createChatGPTBridgeSite} from '../../src/native-agent/chatgpt-bridge-site.js';

const id='33333333-3333-4333-8333-333333333333';
const source={tabId:9,documentId:'document-cancel',url:'https://chatgpt.com/c/search-session-12345678'};
const candidate=JSON.stringify({protocol:'opendesk.task.request.v1',kind:'opendesk.task.request',
  version:1,requestId:id,taskId:'page.read.fixed',args:{}});
const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
function harness(overrides={}){
  const nodes=[],events=new Map(),sends=[];
  const element=tag=>{
    const attrs=new Map();
    const node={tag,style:{},classList:{toggle(){}},listeners:{},children:[],
      setAttribute(k,v){attrs.set(k,v);},getAttribute:k=>attrs.get(k),hasAttribute:k=>attrs.has(k),
      removeAttribute(k){attrs.delete(k);},
      append(...children){for(const child of children){this.children.push(child);child.parent=this;}},
      remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);},
      attachShadow:()=>element('shadow'),addEventListener(type,fn){this.listeners[type]=fn;}};
    nodes.push(node);return node;
  };
  const doc={getElementById:()=>null,createElement:element,body:element('body'),
    addEventListener(type,fn){if(!events.has(type))events.set(type,new Set());events.get(type).add(fn);},
    removeEventListener:(type,fn)=>events.get(type)?.delete(fn)};
  const messageNode=textContent=>({textContent,ownerDocument:doc,isConnected:true,querySelector:()=>null});
  let poll,onMessage,currentRequestId=id,currentScope={taskId:'page.read.fixed',args:{}};
  const win={location:{href:source.url,origin:'https://chatgpt.com'},
    setInterval(fn){poll=fn;return 1;},clearInterval(){},addEventListener(){},removeEventListener(){}};
  win.top=win;
  const editor={ownerDocument:doc,focus(){doc.activeElement=editor;}};
  const snap={ok:true,route:'c/search-session-12345678',editor,form:element('form'),idle:true,
    busy:false,answerComplete:true,draft:'',rich:false,users:[],assistants:[messageNode('candidate')]};
  const writes=[],commits=[];
  const site={inspect:()=>({...snap}),prepare(text){writes.push(text);snap.draft=text;
    return {ok:true,token:{before:{}}};},commit(token){commits.push(token);return {ok:true};},confirm:()=>true};
  const api={runtime:{id:'extid',getURL:()=>'chrome-extension://extid/',
    onMessage:{addListener(fn){onMessage=fn;},removeListener(){}},
    async sendMessage(message){
      sends.push(message);
      if(message.kind==='prepare')currentScope=Object.fromEntries(
        ['taskId','args','targetUrl','installation'].filter(key=>message[key]!==undefined).map(key=>[key,message[key]]));
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
  const page=initChatGPTFixedBridgePage({api,doc,win,site,readPage:overrides.readPage||(()=>({ok:true,
    turnKey:'turn-1',answerKey:'answer-1:0',blocks:[JSON.stringify({...JSON.parse(candidate),...currentScope,requestId:currentRequestId})]}))});
  const buttons=nodes.filter(x=>x.tag==='button');
  const status=nodes.find(x=>x.className==='status');
  const click=i=>{assert.ok(buttons[i],`button ${i} exists`);return buttons[i].listeners.click({isTrusted:true});};
  const prepare=async()=>{await click(0);snap.users=[...snap.users,messageNode(currentRequestId)];snap.draft='';};
  const deliver=(fields={})=>new Promise(resolve=>{
    assert.equal(onMessage({protocol:'opendesk.chatgpt.bridge.r12.v1',kind:'deliver',requestId:currentRequestId,
      sourceUrl:source.url,mode:'manual',turnKey:'turn-1',answerKey:'answer-1:0',
      runId:'run-1',resultId:'result-1',text:'real result',...fields},
    {id:'extid',url:'chrome-extension://extid/sidepanel.html?hostInstanceId=owner'},resolve),true);
  });
  return {page,api,sends,nodes,buttons,status,snap,site,win,writes,commits,click,prepare,deliver,messageNode,poll:()=>poll(),
    receive:(message,sender,reply=()=>{})=>onMessage(message,sender,reply)};
}

const installation={version:'1.0.0',manifestHash:'a'.repeat(64),scriptId:'task:custom.read:1.0.0',
  revision:1,contentHash:'b'.repeat(64),installationId:'installed-custom',generation:1};
const customTask={taskId:'custom.read',name:'读取文章',version:'1.0.0',description:'读取指定文章',
  siteOrigins:['https://example.com'],paramsSchema:{type:'object',additionalProperties:false,
    properties:{length:{type:'integer',default:200}},required:[]},installation};
const selectCustom=async h=>{
  const select=h.nodes.find(node=>node.tag==='select');select.value='__installed__';
  await select.listeners.change();
  const target=h.nodes.find(node=>node.type==='url');target.value='https://example.com/article';
  return {select,target,args:h.nodes.find(node=>node.tag==='textarea')};
};

test('installed script selection binds explicit target, normalized parameters and installation into the chat request',async()=>{
  const h=harness({'list-tasks':()=>({tasks:[customTask]}),
    'prepare-task':message=>({taskId:message.taskId,targetUrl:message.targetUrl,args:{length:200},installation}),
    prepare:message=>({requestId:id,source,taskId:message.taskId,args:message.args,
      targetUrl:message.targetUrl,installation:message.installation})});
  await selectCustom(h);await h.prepare();
  const prepared=h.sends.find(row=>row.kind==='prepare');
  assert.equal(prepared.taskId,'custom.read');assert.equal(prepared.targetUrl,'https://example.com/article');
  assert.deepEqual(prepared.args,{length:200});assert.deepEqual(prepared.installation,installation);
  assert.match(h.writes[0],/custom.read/);assert.ok(h.writes[0].includes('https:\\/\\/example.com\\/article'));
  const request=JSON.parse(h.writes[0].slice(h.writes[0].indexOf('{"protocol"')));
  assert.equal(request.targetUrl,'https://example.com/article');
  assert.equal(h.sends.filter(row=>row.kind==='execute').length,0);
  await h.click(1);assert.match(h.status.textContent,/尚未运行/);
  h.snap.answerComplete=false;h.poll();await flush();
  assert.equal(h.sends.filter(row=>row.kind==='execute').length,0);
  h.snap.answerComplete=true;h.poll();await flush();h.poll();await flush();
  assert.equal(h.sends.filter(row=>row.kind==='execute').length,1);h.page.dispose();
});

test('changed target during installed-script preflight never mints a nonce or writes a draft',async()=>{
  const checking=Promise.withResolvers();
  const h=harness({'list-tasks':()=>({tasks:[customTask]}),'prepare-task':()=>checking.promise});
  const {target}=await selectCustom(h);const prepare=h.click(0);await flush();
  target.value='https://example.com/changed';
  checking.resolve({taskId:'custom.read',targetUrl:'https://example.com/article',args:{length:200},installation});
  await prepare;
  assert.equal(h.sends.filter(row=>row.kind==='prepare').length,0);assert.equal(h.writes.length,0);
  assert.match(h.status.textContent,/发生变化/);h.page.dispose();
});

test('refreshing installed scripts uses the current version, schema and installation and removes unavailable selections',async()=>{
  const otherTask={...customTask,taskId:'removed.task',name:'已移除的脚本'};
  let tasks=[customTask,otherTask];
  const h=harness({'list-tasks':()=>({tasks}),
    'prepare-task':message=>({...message,args:message.args}),
    prepare:message=>({requestId:id,source,...message})});
  const {select}=await selectCustom(h);await h.prepare();
  assert.equal(h.writes.length,1,h.status.textContent);
  await h.click(2);await flush();
  assert.ok(h.sends.some(row=>row.kind==='execute'),h.status.textContent);
  const executed=JSON.parse(h.sends.find(row=>row.kind==='execute').candidateText);
  assert.deepEqual(executed.installation,installation);
  const currentInstallation={...installation,version:'1.1.0',scriptId:'task:custom.read:1.1.0',
    manifestHash:'c'.repeat(64),contentHash:'d'.repeat(64),generation:2};
  tasks=[{...customTask,version:'1.1.0',name:'新版文章脚本',installation:currentInstallation,
    paramsSchema:{...customTask.paramsSchema,properties:{length:{type:'integer',default:400}}}}];
  await selectCustom(h);
  assert.equal(select.children.filter(node=>node.value==='installed:custom.read').length,1);
  assert.equal(select.children.some(node=>node.value==='installed:removed.task'),false);
  assert.match(select.children.find(node=>node.value==='installed:custom.read').textContent,/新版文章脚本.*1\.1\.0/);
  assert.equal(h.nodes.find(node=>node.tag==='textarea').value,'{"length":400}');
  // Directory replacement must not rewrite the fixed scope of the first run.
  assert.deepEqual(executed.installation,installation);
  await h.prepare();
  const checked=h.sends.filter(row=>row.kind==='prepare-task').at(-1);
  assert.deepEqual(checked.installation,currentInstallation);assert.deepEqual(checked.args,{length:400});
  const prepared=h.sends.filter(row=>row.kind==='prepare').at(-1);
  assert.deepEqual(prepared.installation,currentInstallation);h.page.dispose();
});

test('visible progress accepts only the current trusted Host and cannot claim execution before admission',async()=>{
  const execution=Promise.withResolvers(),h=harness({execute:()=>execution.promise});
  await h.prepare();await h.click(1);
  const approved=h.status.textContent;assert.match(approved,/尚未运行/);
  const progress={protocol:'opendesk.chatgpt.bridge.r12.v1',kind:'progress',requestId:id,sourceUrl:source.url,
    mode:'auto',stage:'running',taskId:'page.read.fixed',scriptId:'task:page.read.fixed:1.0.0',
    revision:1,targetUrl:'https://httpbingo.org/html',runId:'run-real'};
  const sender={id:'extid',url:'chrome-extension://extid/sidepanel.html?hostInstanceId=owner'};
  h.receive(progress,sender);assert.equal(h.status.textContent,approved);
  h.poll();await flush();
  const before=h.status.textContent;
  h.receive(progress,{...sender,tab:{id:9}});assert.equal(h.status.textContent,before);
  h.receive({...progress,requestId:'other-request'},sender);assert.equal(h.status.textContent,before);
  h.receive(progress,sender);assert.match(h.status.textContent,/自动化已开始/);
  h.receive({...progress,stage:'validating'},sender);assert.match(h.status.textContent,/自动化已开始/);
  await h.click(3);const cancelled=h.status.textContent;
  h.receive(progress,sender);assert.equal(h.status.textContent,cancelled);
  execution.resolve({sent:true,aiReplyObserved:true});await flush();h.page.dispose();
});

test('missing Host receipt gives same-window guidance and never replays an attempted execute',async()=>{
  const h=harness();
  const send=h.api.runtime.sendMessage;
  h.api.runtime.sendMessage=async message=>{
    const reply=await send(message);
    return message.kind==='execute'?undefined:reply;
  };
  await h.prepare();await h.click(2);await flush();
  assert.match(h.status.textContent,/UNKNOWN/);
  assert.match(h.status.textContent,/同一窗口的 OpenDesk 侧栏保持打开/);
  assert.match(h.status.textContent,/不会自动重放/);
  await h.click(2);h.poll();await flush();
  assert.equal(h.sends.filter(x=>x.kind==='execute').length,1);
  assert.equal(h.commits.length,0);h.page.dispose();
});

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
  assert.equal(h.buttons[4].textContent,'采用对话任务');assert.equal(h.buttons[3].textContent,'停止/取消');
  assert.equal(h.sends.filter(x=>x.kind==='execute').length,0);
  assert.equal(h.sends.filter(x=>x.kind==='cancel').length,0);
  assert.deepEqual(h.sends.find(x=>x.kind==='revoke-request'),
    {protocol:'opendesk.chatgpt.bridge.r12.v1',kind:'revoke-request',requestId:id});
  assert.equal(h.snap.draft,'user draft');assert.equal(h.writes.length,1);h.page.dispose();
});

test('view button follows this running identity and never chooses a target or restarts execution',async()=>{
  const execution=Promise.withResolvers();
  const h=harness({execute:()=>execution.promise,'show-execution-page':()=>({shown:true,runId:'run-real'})});
  const view=h.buttons.find(button=>button.textContent==='查看执行页面');
  assert.equal(view.disabled,true);await h.prepare();await h.click(2);await flush();
  const progress={protocol:'opendesk.chatgpt.bridge.r12.v1',kind:'progress',requestId:id,sourceUrl:source.url,
    mode:'manual',stage:'running',taskId:'page.read.fixed',runId:'run-real'};
  const sender={id:'extid',url:'chrome-extension://extid/sidepanel.html?hostInstanceId=owner'};
  h.receive(progress,sender);assert.equal(view.disabled,false);
  await view.listeners.click({isTrusted:false});assert.equal(h.sends.some(row=>row.kind==='show-execution-page'),false);
  await view.listeners.click({isTrusted:true});
  assert.deepEqual(h.sends.find(row=>row.kind==='show-execution-page'),{protocol:progress.protocol,
    kind:'show-execution-page',requestId:id,runId:'run-real',source,sourceUrl:source.url});
  h.receive({...progress,stage:'result-ready'},sender);assert.equal(view.disabled,true);
  execution.resolve({runId:'run-real',sent:true,aiReplyObserved:true});await flush();
  assert.equal(view.disabled,true);assert.equal(h.sends.filter(row=>row.kind==='execute').length,1);
  h.page.dispose();
});

test('late view failure stays visible after completion and verified result preview belongs to the current request',async()=>{
  const execution=Promise.withResolvers(),viewing=Promise.withResolvers();
  const h=harness({execute:()=>execution.promise,'show-execution-page':()=>viewing.promise});
  await h.prepare();await h.click(2);await flush();
  const progress={protocol:'opendesk.chatgpt.bridge.r12.v1',kind:'progress',requestId:id,sourceUrl:source.url,
    mode:'manual',stage:'running',taskId:'page.read.fixed',runId:'run-real'};
  const sender={id:'extid',url:'chrome-extension://extid/sidepanel.html?hostInstanceId=owner'};
  h.receive(progress,sender);
  const view=h.buttons.find(button=>button.textContent==='查看执行页面');
  const pendingView=view.listeners.click({isTrusted:true});
  const result=h.nodes.find(node=>node.tag==='pre'&&node.getAttribute('aria-label')==='本次脚本返回值');
  h.receive({...progress,stage:'result-ready',requestId:'other-request',resultPreview:'wrong result'},sender);
  assert.equal(result.hidden,true);
  h.receive({...progress,stage:'result-ready',resultPreview:'<script>untrusted text</script>',resultId:'result-real'},sender);
  assert.match(result.textContent,/<script>untrusted text<\/script>/);
  execution.resolve({runId:'run-real',sent:true,aiReplyObserved:true,resultPreview:'verified result'});await flush();
  viewing.reject(Object.assign(new Error('执行页面已经导航'),{code:'E_BRIDGE_TARGET'}));await pendingView;
  assert.match(h.nodes.filter(node=>node.className==='status')[1].textContent,/E_BRIDGE_TARGET.*已经导航/);
  assert.match(h.status.textContent,/已完成，资源已释放/);
  assert.match(result.textContent,/verified result/);
  await h.prepare();assert.equal(result.hidden,true);h.page.dispose();
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


for(const evictHistory of [false,true])test(`confirmed manual delivery releases the composer for a different approved auto request exactly once (history eviction=${evictHistory})`,async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const nextId='44444444-4444-4444-8444-444444444444';
  const deliveries=[],overrides={};const h=harness(overrides);
  t.after(()=>h.page.dispose());
  if(evictHistory){
    h.snap.users=[h.messageNode('old user')];
    h.snap.assistants=[h.messageNode('old assistant'),...h.snap.assistants];
  }
  // Model only site observations; the page listener runs the real deliver path.
  h.site.prepare=(text,before)=>{h.writes.push(text);h.snap.draft=text;
    return {ok:true,token:{before:{...before,userTexts:before.users.map(node=>node.textContent)}}};};
  h.site.commit=token=>{
    h.commits.push(token);const text=h.snap.draft,answer=h.messageNode('新的中文续答');
    const user={...h.messageNode(text),compareDocumentPosition:node=>node===answer?4:1};
    h.snap.draft='';h.snap.users=[...h.snap.users,user];
    h.snap.assistants=[...h.snap.assistants,answer];
    if(evictHistory){h.snap.users=h.snap.users.slice(-2);h.snap.assistants=h.snap.assistants.slice(-2);}
    return {ok:true};
  };
  h.site.confirm=createChatGPTBridgeSite({doc:h.snap.editor.ownerDocument,win:h.win}).confirm;
  overrides.execute=async message=>{
    const reply=await h.deliver({requestId:message.requestId,mode:message.mode,
      runId:'run-'+message.requestId,resultId:'result-'+message.requestId});
    deliveries.push(reply);return reply.data;
  };
  const finish=async()=>{await flush();for(const ms of [250,300,400]){
    t.mock.timers.tick(ms);await flush();}};
  await h.prepare();h.click(2);await finish();
  assert.deepEqual(deliveries,[{ok:true,data:{sent:true,userObserved:true,aiReplyObserved:true}}]);
  assert.match(h.status.textContent,/真实结果已回传，官方 AI 已完成回复/);
  assert.equal(h.snap.form.hasAttribute('data-opendesk-composer-owner'),false);
  overrides.prepare=()=>({requestId:nextId,source});
  await h.prepare();await h.click(1);h.poll();await finish();
  assert.equal(deliveries.length,2);
  assert.deepEqual(deliveries[1],deliveries[0]);
  assert.match(h.status.textContent,/真实结果已回传，官方 AI 已完成回复/);
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

const intentText=JSON.stringify({protocol:'opendesk.task.intent.v1',candidateId:'candidate-custom-1',
  taskId:'custom.read',targetUrl:'https://example.com/article',args:{}});
function intentHarness(){
  let text=intentText;
  const h=harness({readPage:()=>({ok:true,turnKey:'turn-1',answerKey:'answer-1:0',blocks:[text]}),
    'adopt-task':()=>({requestId:id,source,taskId:'custom.read',args:{length:200},
      targetUrl:'https://example.com/article',installation,
      candidate:{candidateId:'candidate-custom-1',text:intentText,turnKey:'turn-1',answerKey:'answer-1:0'}})});
  return {...h,drift:()=>{text+=' ';}};
}
test('appended adoption button needs a trusted click and adopts without nonce echo, draft edits or execution',async()=>{
  const h=intentHarness();h.snap.users=[h.messageNode('请读取这篇文章')];h.snap.draft='existing user draft';
  await h.buttons[4].listeners.click({isTrusted:false});assert.equal(h.sends.length,0);
  await h.click(4);
  assert.deepEqual(h.buttons.slice(0,4).map(button=>button.textContent),
    ['建立请求','批准本次自动执行','执行','停止/取消']);
  assert.equal(h.sends.length,1);assert.equal(h.sends[0].kind,'adopt-task');
  assert.equal(h.writes.length,0);assert.equal(h.snap.draft,'existing user draft');
  assert.match(h.status.textContent,/已采用对话任务，尚未执行/);
  await h.click(2);await flush();
  assert.deepEqual(h.sends.map(row=>row.kind),['adopt-task','authorize-task','execute']);
  const execution=h.sends[2];assert.equal(execution.candidateText,intentText);
  assert.equal(execution.adoptedRequest.installation.scriptId,installation.scriptId);
  assert.deepEqual(execution.adoptedRequest.args,{length:200});
  const selection=h.nodes.find(node=>node.className==='selection');
  assert.match(selection.textContent,/本次任务：custom\.read @ 1\.0\.0/);
  assert.match(selection.textContent,/https:\/\/example\.com\/article/);
  assert.match(selection.textContent,/"length":200/);h.page.dispose();
});
test('adopted candidate drift blocks manual and auto approval before any execute',async()=>{
  for(const button of [1,2]){
    const h=intentHarness();await h.click(4);h.drift();await h.click(button);await flush();
    assert.deepEqual(h.sends.map(row=>row.kind),['adopt-task']);
    assert.match(h.status.textContent,/已改变/);assert.equal(h.writes.length,0);h.page.dispose();
  }
});
test('adopted auto approval stays separate from adoption and polling dispatches once',async()=>{
  const h=intentHarness();await h.click(4);assert.equal(h.sends.length,1);
  await h.click(1);assert.deepEqual(h.sends.map(row=>row.kind),['adopt-task','authorize-task']);
  h.poll();await flush();h.poll();await flush();
  assert.equal(h.sends.filter(row=>row.kind==='execute').length,1);h.page.dispose();
});
