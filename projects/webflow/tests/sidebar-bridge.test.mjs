import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {initChatGPTFixedBridgePage} from '../../../src/native-agent/chatgpt-fixed-bridge-page.js';
const protocol='opendesk.chatgpt.bridge.r12.v1';
const url='https://chatgpt.com/c/sidebar-test-12345678';
function fixture({active=false,adoptError=false,adoptErrorCode='E_BUILTIN_VERSION_UNAVAILABLE',readError=false,persistentPending=false,background=false,sendHook,navigationAvailable=true,lookupFailure=false}={}){
 const {document,window}=parseHTML('<html><body></body></html>');let listener,poll;
 const events=new Map(),addEvent=document.addEventListener.bind(document);
 document.addEventListener=(type,handler,...rest)=>{events.set(type,handler);return addEvent(type,handler,...rest);};
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this._value??this.querySelector('option')?.value??'';},set(value){this._value=value;}});
 const navigationListeners=new Map();
 const navigation={currentEntry:{key:'fixture-current-entry'},addEventListener(type,fn){if(!navigationListeners.has(type))navigationListeners.set(type,new Set());navigationListeners.get(type).add(fn);},
  removeEventListener(type,fn){navigationListeners.get(type)?.delete(fn);}};
 const win={...(navigationAvailable?{navigation}:{}),location:{href:url,origin:'https://chatgpt.com'},setInterval(fn){poll=fn;return 1;},clearInterval(){},addEventListener(){},removeEventListener(){}};win.top=win;
 const sends=[],reloads=[],hostReads=[];win.document=document;win.location.reload=()=>reloads.push('reload');
 const intent={protocol:persistentPending||background?'webflow.task.intent.v1':'opendesk.task.intent.v1',candidateId:'sidebar-candidate',taskId:'baidu.search.top3',targetUrl:'https://www.baidu.com/',args:{query:'OpenDesk Browser',limit:3}};
 const installation={version:'1.1.1',manifestHash:'a'.repeat(64),contentHash:'b'.repeat(64),scriptId:'task:baidu.search.top3:1.1.1',revision:1,installationId:'original-install',generation:1};
 const prepared={requestId:'77777777-7777-4777-8777-777777777777',taskId:intent.taskId,targetUrl:intent.targetUrl,args:intent.args,installation,
  source:{tabId:9,documentId:'original-document',url},candidate:{text:JSON.stringify(intent),candidateId:intent.candidateId,turnKey:'turn',answerKey:'answer'}};
 const snapshot={ok:true,route:'c/sidebar-test-12345678',idle:true,busy:false,answerComplete:true,draft:'',rich:false,users:[],assistants:[]};
 snapshot.form=document.createElement('form');snapshot.editor={};snapshot.sendButton={disabled:false,getAttribute:()=>null};
 const api={runtime:{id:'extension',getURL:path=> 'chrome-extension://extension/'+(path||''),
  onMessage:{addListener(fn){listener=fn;},removeListener(){}},sendMessage:async message=>{
   if(message.kind==='list-tasks'){hostReads.push(message);if(lookupFailure)throw Error('No Side Panel receiver');return {ok:true,bridgeHostId:'reviewed-host',data:{tasks:[]}};}
   sends.push(message);
   if(sendHook){const result=sendHook(message);if(result!==undefined)return result;}
   if(adoptError&&message.kind==='adopt-task')return {ok:false,error:{code:adoptErrorCode,message:adoptErrorCode==='E_BRIDGE_REPLAY'?'候选已准入或结果未知，禁止重放':'runtime changed'}};
   return {ok:true,...(!background?{bridgeHostId:'reviewed-host'}:{}),data:message.kind==='auto-task'?{...prepared,pendingApproval:!background,...(background?{executionOwner:'background'}:{})}:message.kind==='adopt-task'?prepared:message.kind==='execute'?
    {runId:'original-run',resultId:'original-result',resultPreview:'OLD_RESULT',sent:true,aiReplyObserved:true}:{}};
  }}};
 const elements=[],create=document.createElement.bind(document);document.createElement=(...args)=>{const node=create(...args),add=node.addEventListener.bind(node);
  node.handlers=new Map();node.addEventListener=(type,fn,...rest)=>{node.handlers.set(type,fn);return add(type,fn,...rest);};
  elements.push(node);return node;};
 const page=initChatGPTFixedBridgePage({api,doc:document,win,site:{inspect:()=>active?snapshot:{ok:false}},
  readPage:()=>readError?{ok:false,error:{code:'E_CHAT_FORMAT',message:'没有任务协议'}}:({ok:true,turnKey:'turn',answerKey:'answer',blocks:[JSON.stringify(intent)]})});
 const sender={id:'extension',url:'chrome-extension://extension/sidepanel.html?hostInstanceId=real'};
 const receive=(message,from=sender)=>new Promise(resolve=>{
  const response=listener({protocol,sourceUrl:win.location.href,...message},from,resolve);
  if(response===false)queueMicrotask(()=>resolve(undefined));
 });
 return {page,receive,sends,hostReads,sender,win,snapshot,poll:()=>poll(),elements,prepared,api,document,reloads,
  navigationEvent:type=>{for(const fn of navigationListeners.get(type)||[])fn({type});},
  compose:()=>events.get('compositionstart')(),
  receiveSync:(message,reply)=>listener({protocol,sourceUrl:win.location.href,...message},sender,reply),
  submit:()=>events.get('click')({type:'click',isTrusted:true,button:0,target:snapshot.sendButton}),
  stop:trusted=>events.get('click')({type:'click',isTrusted:trusted,button:0,target:snapshot.stopButton})};
}
test('an adopted legacy candidate routes execution back to its exact responding Side Panel host',async()=>{
 const h=fixture({active:true});try{
  const view=(await h.receive({kind:'sidebar-control',requestId:null,action:'adopt'})).data;
  await h.receive({kind:'sidebar-control',requestId:view.requestId,action:'run'});
  for(let i=0;i<40;i++)await Promise.resolve();
  const runs=h.sends.filter(message=>message.kind==='execute');
  assert.equal(runs.length,1);assert.equal(runs[0].bridgeHostId,'reviewed-host');
  assert.equal(h.hostReads.length,1,'read-only Host selection precedes the first Ledger mutation');
  assert.equal(h.sends[0].bridgeHostId,'reviewed-host');
 }finally{h.page.dispose();}
});
test('a failed read-only Host lookup rejects before any candidate or grant is submitted',async()=>{
 const h=fixture({active:true,lookupFailure:true});try{
  const view=(await h.receive({kind:'sidebar-control',requestId:null,action:'adopt'})).data;
  assert.equal(h.hostReads.length,1);assert.equal(h.sends.length,0);
  assert.equal(view.requestId,null);assert.match(view.status,/E_BRIDGE_HOST/);
 }finally{h.page.dispose();}
});
test('page projection accepts only fixed trusted Side Panel messages and refuses stale requests or navigation',async()=>{
 const h=fixture();try{
  for(const sender of [{id:'other',url:h.sender.url},{...h.sender,tab:{id:9}},
   {...h.sender,url:'chrome-extension://extension/ui/tool.html?hostInstanceId=fake'},
   {...h.sender,url:h.sender.url+'&previewId=fake'},{...h.sender,url:h.sender.url+'&toolId=webflow'}])
   assert.equal(await h.receive({kind:'sidebar-read'},sender),undefined);
  const view=await h.receive({kind:'sidebar-read'});assert.equal(view.ok,true);assert.equal(view.data.requestId,null);
  assert.equal((await h.receive({kind:'sidebar-read',sourceUrl:url+'/other'})).ok,false);
  const stale=await h.receive({kind:'sidebar-control',requestId:'old-request',action:'run'});
  assert.equal(stale.error.code,'E_BRIDGE_CONTEXT');assert.equal(h.sends.length,0);
  const fields=await h.receive({kind:'sidebar-control',requestId:null,action:'fields',fields:{task:'baidu.search.top3',query:'OpenDesk Browser',target:'',args:'{}'}});
  assert.equal(fields.ok,true);assert.equal(fields.data.fields.query,'OpenDesk Browser');assert.equal(h.sends.length,0);
 }finally{h.page.dispose();}
});
test('background page accepts exact SW progress but gives it no trusted management control',async()=>{
 const h=fixture({active:true,background:true});try{
  const view=(await h.receive({kind:'sidebar-control',requestId:null,action:'adopt'})).data;
  assert.equal(h.sends.filter(row=>row.kind==='execute').length,0);
  assert.equal(h.hostReads.length,0,'SW-owned tasks do not depend on an open Side Panel Host');
  assert.equal(h.sends.filter(row=>row.kind==='background-ready').length,1);
  const progress={kind:'progress',requestId:view.requestId,mode:'auto',taskId:h.prepared.taskId,stage:'running',
   scriptId:h.prepared.installation.scriptId,revision:h.prepared.installation.revision,targetUrl:h.prepared.targetUrl,runId:'background-run'};
  for(const sender of [{id:'other'},{id:'extension',tab:{id:9}},
   {id:'extension',url:'chrome-extension://extension/fake.js'}])
   assert.equal(await h.receive(progress,sender),undefined);
  for(const sender of [{id:'extension'},{id:'extension',url:'chrome-extension://extension/sw.js'}]){
   assert.equal((await h.receive(progress,sender)).data.observed,true);
   assert.equal(await h.receive({kind:'sidebar-control',requestId:view.requestId,action:'cancel'},sender),undefined);
  }
  assert.equal((await h.receive({kind:'sidebar-read'})).data.runId,'background-run');
 }finally{h.page.dispose();}
});
test('pending Schema-supported candidate stays unexecuted through polling, then uses the same request after trusted approval',async()=>{
 const h=fixture({active:true,persistentPending:true});try{
  const view=(await h.receive({kind:'sidebar-control',requestId:null,action:'adopt'})).data;
  assert.ok(view.pendingAuto);assert.match(view.status,/待批准.*尚未执行/);
  assert.equal(view.actions.run,false);assert.equal(view.actions['approve-once'],false);
  for(let i=0;i<3;i++)h.poll();
  assert.equal(h.sends.filter(m=>m.kind==='execute').length,0);
  assert.match((await h.receive({kind:'sidebar-read'})).data.status,/待批准/);
  await h.receive({kind:'sidebar-control',requestId:view.requestId,action:'approve-range'});
  for(let i=0;i<40;i++)await Promise.resolve();
  const runs=h.sends.filter(m=>m.kind==='execute');assert.equal(runs.length,1);
  assert.equal(runs[0].requestId,view.requestId);assert.equal(runs[0].mode,'auto');
  assert.equal(runs[0].persistentAuto,true);
 }finally{h.page.dispose();}
});
test('cancelled pending candidate cannot be revived by a late approval command',async()=>{
 const h=fixture({active:true,persistentPending:true});try{
  const view=(await h.receive({kind:'sidebar-control',requestId:null,action:'adopt'})).data;
  await h.receive({kind:'sidebar-control',requestId:view.requestId,action:'cancel'});
  assert.equal((await h.receive({kind:'sidebar-control',requestId:view.requestId,action:'approve-range'})).ok,false);
  h.poll();assert.equal(h.sends.filter(m=>m.kind==='execute').length,0);
 }finally{h.page.dispose();}
});
test('a rejected candidate keeps its own scope without inventing a request or reverting to the manual example',async()=>{
 const h=fixture({active:true,adoptError:true});try{
  const rejected=await h.receive({kind:'sidebar-control',requestId:null,action:'adopt'});
  assert.equal(rejected.data.requestId,null);
  assert.equal(rejected.data.candidateId,'sidebar-candidate');
  assert.ok(rejected.data.status.includes('E_BUILTIN_VERSION_UNAVAILABLE'));
  assert.ok(rejected.data.selection.includes('baidu.search.top3'));
  assert.ok(rejected.data.selection.includes('https://www.baidu.com/'));
  assert.ok(!rejected.data.selection.includes('httpbingo'));
  h.win.location.href='https://chatgpt.com/c/other-conversation-12345678';
  h.snapshot.route='c/other-conversation-12345678';h.poll();
  const next=(await h.receive({kind:'sidebar-read'})).data;
  assert.equal(next.candidateId,null);assert.ok(!next.status.includes('E_BUILTIN'));
 }finally{h.page.dispose();}
});
test('a fresh native submission retires the previous completed result before any new Run exists',async()=>{
 const h=fixture({active:true});try{
  await h.receive({kind:'sidebar-control',requestId:null,action:'adopt'});
  await h.receive({kind:'sidebar-control',requestId:h.prepared.requestId,action:'run'});
  for(let i=0;i<40;i++)await Promise.resolve();
  assert.equal((await h.receive({kind:'sidebar-read'})).data.runId,'original-run');
  h.snapshot.draft='a fresh instruction';h.submit();h.snapshot.draft='';
  const next=(await h.receive({kind:'sidebar-read'})).data;
  assert.equal(next.requestId,null);assert.equal(next.runId,null);assert.equal(next.resultId,null);
  assert.ok(!next.resultPreview);
  assert.equal(h.sends.filter(message=>message.kind==='execute').length,1);
 }finally{h.page.dispose();}
});
test('changing conversations clears completed page results and keeps installed task metadata',async()=>{
 const h=fixture({active:true});try{
  const adopted=await h.receive({kind:'sidebar-control',requestId:null,action:'adopt'});
  assert.equal(adopted.data.requestId,h.prepared.requestId);
  await h.receive({kind:'sidebar-control',requestId:h.prepared.requestId,action:'run'});
  for(let i=0;i<40;i++)await Promise.resolve();
  assert.equal((await h.receive({kind:'sidebar-read'})).data.runId,'original-run');
  const result=h.elements.find(node=>node.getAttribute('aria-label')==='本次脚本返回值');
  assert.ok(result.textContent.includes('OLD_RESULT'));
  h.win.location.href='https://chatgpt.com/c/new-sidebar-test-12345678';
  h.snapshot.route='c/new-sidebar-test-12345678';h.poll();
  const next=(await h.receive({kind:'sidebar-read'})).data;
  assert.equal(next.requestId,null);assert.equal(next.runId,null);
  assert.ok(result.hidden);assert.equal(result.textContent,'');
  assert.ok(!next.resultPreview);assert.ok(!next.selection.includes('httpbingo'));
  assert.equal(next.selection,'');assert.ok(next.tasks.some(row=>row.label.includes('baidu.search.top3')));
 }finally{h.page.dispose();}
});

test('without a request, the sidebar explains drafts, native submission and unobserved history separately',async()=>{
 const h=fixture({active:true});try{
  h.snapshot.draft='pasted instruction';h.poll();
  assert.ok((await h.receive({kind:'sidebar-read'})).data.status.includes('尚未发送'));
  h.submit();h.snapshot.draft='';h.poll();
  assert.ok((await h.receive({kind:'sidebar-read'})).data.status.includes('等待同一新消息'));
  h.win.location.href='https://chatgpt.com/c/retained-history-12345678';
  h.snapshot.route='c/retained-history-12345678';
  h.snapshot.users=[{textContent:'old command',getAttribute:()=>null}];
  h.poll();
  assert.ok((await h.receive({kind:'sidebar-read'})).data.status.includes('未能绑定'));
  h.poll();
  const history=(await h.receive({kind:'sidebar-read'})).data;
  assert.equal(history.requestId,null);assert.ok(history.status.includes('未见证'));
  assert.ok(history.status.includes('正常发送新需求'));assert.equal(h.sends.length,0);
 }finally{h.page.dispose();}
});

test('an already admitted or unknown candidate stays unexecuted and points to the original request',async()=>{
 const h=fixture({active:true,adoptError:true,adoptErrorCode:'E_BRIDGE_REPLAY'});try{
  const rejected=(await h.receive({kind:'sidebar-control',requestId:null,action:'adopt'})).data;
  assert.equal(rejected.requestId,null);assert.equal(rejected.candidateId,'sidebar-candidate');
  assert.ok(rejected.status.includes('E_BRIDGE_REPLAY'));
  assert.ok(rejected.status.includes('查询或停止原请求'));assert.ok(rejected.status.includes('不要更换身份补跑'));
  h.poll();assert.ok((await h.receive({kind:'sidebar-read'})).data.status.includes('E_BRIDGE_REPLAY'));
  assert.equal(h.sends.filter(message=>message.kind==='execute').length,0);
 }finally{h.page.dispose();}
});


test('a complete ordinary reply records no candidate without dispatching or retaining an old success',async()=>{
 const h=fixture({active:true,readError:true});try{
  h.snapshot.draft='只解释一下，不执行';h.submit();h.snapshot.draft='';
  const node=text=>({textContent:text,getAttribute:()=>null,compareDocumentPosition:()=>4});
  h.snapshot.users=[node('只解释一下，不执行')];h.snapshot.assistants=[node('这是普通回答')];
  h.poll();for(let i=0;i<20;i++)await Promise.resolve();h.poll();
  const view=(await h.receive({kind:'sidebar-read'})).data;
  assert.equal(view.requestId,null);assert.equal(view.runId,null);
  assert.match(view.status,/本条未执行/);assert.match(view.status,/没有.*候选/);
  assert.equal(h.sends.filter(m=>['auto-task','adopt-task','execute'].includes(m.kind)).length,0);
  h.snapshot.draft='请搜索';h.submit();h.snapshot.draft='';h.poll();
  assert.match((await h.receive({kind:'sidebar-read'})).data.status,/等待/);
 }finally{h.page.dispose();}
});
test('cancelled official reply stops waiting and never becomes a candidate',async()=>{
 const h=fixture({active:true,readError:true});try{
  h.snapshot.draft='请搜索';h.submit();h.snapshot.draft='';
  h.snapshot.users=[{textContent:'请搜索',getAttribute:()=>null}];
  h.snapshot.stopButton={};h.snapshot.replyState='cancelled';h.stop(true);h.poll();h.poll();
  const view=(await h.receive({kind:'sidebar-read'})).data;
  assert.match(view.status,/本条未执行/);assert.match(view.status,/停止/);
  assert.equal(view.requestId,null);assert.equal(h.sends.length,0);
 }finally{h.page.dispose();}
});


const probe=(h,nonce='host-challenge-1')=>h.receive({kind:'sidebar-probe',nonce});
const refresh=(h,nonce='host-challenge-1')=>h.receive({kind:'sidebar-refresh',nonce,expiresAt:Date.now()+1000});
test('listener probe is a harmless authenticated read bound to source and Host challenge',async()=>{
 const h=fixture({active:true});try{
  const before=(await h.receive({kind:'sidebar-read'})).data;
  for(const sender of [{id:'other',url:h.sender.url},{...h.sender,tab:{id:9}},
   {...h.sender,url:'chrome-extension://extension/ui/tool.html?hostInstanceId=fake'},
   {...h.sender,url:h.sender.url+'&previewId=fake'},{...h.sender,url:h.sender.url+'&toolId=webflow'},
   {id:'extension'},{id:'extension',url:'chrome-extension://extension/sw.js'},
   {id:'extension',url:'chrome-extension://other/sidepanel.html?hostInstanceId=real'}]){
   assert.equal(await h.receive({kind:'sidebar-probe',nonce:'host-challenge-1'},sender),undefined);
   assert.equal(await h.receive({kind:'sidebar-refresh',nonce:'host-challenge-1'},sender),undefined);
  }
  for(const nonce of [undefined,null,'','   ',42,{}])
   assert.equal((await h.receive({kind:'sidebar-probe',nonce})).ok,false);
  assert.equal((await h.receive({kind:'sidebar-probe',nonce:'host-challenge-1',sourceUrl:url+'/other'})).ok,false);
  const response=await probe(h);
  assert.deepEqual(response,{ok:true,data:{url,nonce:'host-challenge-1',runtimeId:'extension',session:before,recovery:{allowed:true,reason:'idle'}}});
  assert.deepEqual((await h.receive({kind:'sidebar-read'})).data,before);
  assert.equal(h.sends.length,0);assert.equal(h.reloads.length,0);
 }finally{h.page.dispose();}
});
test('refresh requires latest safe probe from the same Side Panel, URL and live document',async()=>{
 const h=fixture({active:true});try{
  assert.equal((await refresh(h)).ok,false);
  await probe(h);await probe(h,'new-challenge');
  assert.equal((await refresh(h)).ok,false);
  await probe(h,'new-challenge');
  assert.equal((await h.receive({kind:'sidebar-refresh',nonce:'new-challenge',expiresAt:Date.now()+1000},{...h.sender,url:h.sender.url+'2'})).ok,false);
  await probe(h,'new-challenge');
  h.win.location.href=url+'/changed';
  assert.equal((await refresh(h,'new-challenge')).ok,false);
  assert.equal(h.reloads.length,0);assert.equal(h.sends.length,0);
 }finally{h.page.dispose();}
});
test('probe denies draft, generation, incomplete reply, rich/attachment, IME, context and composer ownership',async()=>{
 for(const mutate of [
  h=>{h.snapshot.draft='unsent';},h=>{h.snapshot.busy=true;},h=>{h.snapshot.idle=false;},
  h=>{h.snapshot.answerComplete=false;h.snapshot.assistants=[{}];},h=>{h.snapshot.ok=false;},
  h=>{h.snapshot.rich=true;},h=>h.compose(),
  h=>h.snapshot.form.setAttribute('data-opendesk-composer-owner','send-queue')
 ]){
  const h=fixture({active:true});try{
   await probe(h);mutate(h);
   const response=await probe(h);assert.equal(response.ok,true);assert.equal(response.data.recovery.allowed,false);
   assert.equal(typeof response.data.recovery.reason,'string');
   assert.equal((await refresh(h)).ok,false);assert.equal(h.reloads.length,0);assert.equal(h.sends.length,0);
  }finally{h.page.dispose();}
 }
});
test('empty newly opened chat is recoverable only with affirmative native idle evidence',async()=>{
 const h=fixture({active:true});try{
  h.win.location.href='https://chatgpt.com/';h.snapshot.route='new/';h.snapshot.answerComplete=false;
  assert.equal((await probe(h)).data.recovery.allowed,true);
  h.snapshot.users=[{}];assert.equal((await probe(h)).data.recovery.allowed,false);
 }finally{h.page.dispose();}
});
test('refresh revalidates mutations after probe, replies before one reload and fences further admissions',async()=>{
 for(const mutate of [h=>{h.snapshot.draft='new typing';},h=>{h.snapshot.busy=true;},h=>h.compose(),
  h=>h.snapshot.form.setAttribute('data-opendesk-composer-owner','other'),h=>{h.api.runtime.sendMessage=null;}]){
  const h=fixture({active:true});try{
   await probe(h);mutate(h);assert.equal((await refresh(h)).ok,false);assert.equal(h.reloads.length,0);
  }finally{h.page.dispose();}
 }
 const h=fixture({active:true});try{
  await probe(h);
  const order=[];h.win.location.reload=()=>{order.push('reload');assert.equal(h.sends.length,0);};
  h.receiveSync({kind:'sidebar-refresh',nonce:'host-challenge-1',expiresAt:Date.now()+1000},response=>{
   assert.deepEqual(response,{ok:true,data:{refreshing:true,nonce:'host-challenge-1'}});order.push('reply');
  });
  assert.deepEqual(order,['reply','reload']);
  assert.equal((await refresh(h)).ok,false);
  const response=await h.receive({kind:'sidebar-control',requestId:null,action:'adopt'});
  assert.equal(response.ok,false);h.poll();assert.equal(h.sends.length,0);
 }finally{h.page.dispose();}
});
test('unresolved pending admission and unknown adoption never authorize recovery',async()=>{
 for(const options of [{persistentPending:true},{background:true},{adoptError:true,adoptErrorCode:'E_BRIDGE_TRANSPORT'}]){
  const h=fixture({active:true,...options});try{
   await h.receive({kind:'sidebar-control',requestId:null,action:'adopt'});
   const count=h.sends.length;assert.equal((await probe(h)).data.recovery.allowed,false);
   assert.equal((await refresh(h)).ok,false);assert.equal(h.sends.length,count);assert.equal(h.reloads.length,0);
  }finally{h.page.dispose();}
 }
 let resolveAdopt;
 const h=fixture({active:true,sendHook:message=>message.kind==='adopt-task'?new Promise(resolve=>{resolveAdopt=resolve;}):undefined});
 try{
  await probe(h);
  const pending=h.receive({kind:'sidebar-control',requestId:null,action:'adopt'});
  assert.equal((await refresh(h)).ok,false);
  assert.equal((await probe(h)).data.recovery.allowed,false);
  resolveAdopt({ok:false,error:{code:'E_BRIDGE_TRANSPORT',message:'unknown'}});await pending;
  assert.equal((await probe(h)).data.recovery.allowed,false);assert.equal(h.reloads.length,0);
 }finally{h.page.dispose();}
});

test('unused future admission still blocks refresh, and unknown conversation approval stays blocked after cancel',async()=>{
 let h;
 h=fixture({active:true,sendHook:message=>message.kind==='preapprove-next-task'?{ok:true,bridgeHostId:'reviewed-host',data:{...h.prepared,
  expiresAt:Date.now()+60000,baseline:{turnKey:'turn',answerKey:'answer'}}}:undefined});
 try{
  await h.receive({kind:'sidebar-control',requestId:null,action:'adopt'});
  await h.receive({kind:'sidebar-control',requestId:h.prepared.requestId,action:'cancel'});
  const future=await h.receive({kind:'sidebar-control',requestId:h.prepared.requestId,action:'preapprove'});
  assert.equal(future.ok,true);assert.match(future.data.status,/已预批准一次/);
  assert.equal((await probe(h)).data.recovery.reason,'unresolved-request');
  assert.equal((await refresh(h)).ok,false);
  assert.equal(h.sends.filter(m=>m.kind==='execute').length,0);
 }finally{h.page.dispose();}
 const unknown=fixture({active:true,sendHook:message=>message.kind==='approve-conversation-task'?
  {ok:false,error:{code:'E_BRIDGE_TRANSPORT',message:'unknown'}}:undefined});
 try{
  await unknown.receive({kind:'sidebar-control',requestId:null,action:'adopt'});
  const button=unknown.elements.find(node=>node.textContent==='允许本聊天');
  assert.ok(button);await button.handlers.get('click')({isTrusted:true});
  await unknown.receive({kind:'sidebar-control',requestId:unknown.prepared.requestId,action:'cancel'});
  assert.equal((await probe(unknown)).data.recovery.reason,'approval-unknown');
  assert.equal((await refresh(unknown)).ok,false);assert.equal(unknown.reloads.length,0);
  assert.equal(unknown.sends.filter(m=>m.kind==='execute').length,0);
 }finally{unknown.page.dispose();}
});

test('cancel awaiting its native receipt remains unsafe even though the local request is cancelled',async()=>{
 let resolveRevoke;
 const h=fixture({active:true,sendHook:message=>message.kind==='revoke-request'?
  new Promise(resolve=>{resolveRevoke=resolve;}):undefined});
 try{
  await h.receive({kind:'sidebar-control',requestId:null,action:'adopt'});
  const cancelling=h.receive({kind:'sidebar-control',requestId:h.prepared.requestId,action:'cancel'});
  const count=h.sends.length;
  assert.equal((await probe(h)).data.recovery.reason,'pending');
  assert.equal((await refresh(h)).ok,false);assert.equal(h.sends.length,count);assert.equal(h.reloads.length,0);
  resolveRevoke({ok:true,data:{requestId:h.prepared.requestId,revoked:true}});await cancelling;
 }finally{h.page.dispose();}
});

test('expired probe and a native submission after probing cannot refresh',async()=>{
 const h=fixture({active:true}),now=Date.now;
 try{
  let clock=now();Date.now=()=>clock;
  await probe(h);clock+=10001;
  assert.equal((await refresh(h)).ok,false);
  await probe(h);h.snapshot.draft='new native instruction';h.submit();h.snapshot.draft='';
  assert.equal((await refresh(h)).ok,false);assert.equal(h.reloads.length,0);assert.equal(h.sends.length,0);
 }finally{Date.now=now;h.page.dispose();}
});
test('throwing runtime identity never leaks ready or breaks closed listener handling',async()=>{
 const h=fixture({active:true});try{
  await probe(h);
  Object.defineProperty(h.api.runtime,'id',{get(){throw new Error('Extension context invalidated');}});
  assert.equal((await probe(h)).ok,false);
  assert.equal((await refresh(h)).ok,false);
  assert.equal(await h.receive({kind:'sidebar-read'}),undefined);
  h.page.dispose();assert.equal((await probe(h)).ok,false);
  assert.equal(h.sends.length,0);assert.equal(h.reloads.length,0);
 }finally{h.page.dispose();}
});

test('closed listener explicitly rejects probe without claiming a connected session',async()=>{
 const h=fixture({active:true});
 await probe(h);h.page.dispose();
 const response=await probe(h);
 assert.equal(response.ok,false);assert.equal(response.error.code,'E_BRIDGE_CONTEXT');
 assert.match(response.error.message,/已关闭/);assert.equal(response.data,undefined);
 assert.equal((await refresh(h)).ok,false);assert.equal(h.reloads.length,0);assert.equal(h.sends.length,0);
});
test('invalid runtime or replaced document rejects probe instead of reporting connected',async()=>{
 for(const mutate of [h=>{h.api.runtime.id=undefined;},h=>{h.api.runtime.sendMessage=undefined;},
  h=>{h.api.runtime.getURL=()=>{throw new Error('Extension context invalidated');};},h=>{h.win.document={};}]){
  const h=fixture({active:true});try{
   await probe(h);mutate(h);const response=await probe(h);
   assert.equal(response.ok,false);assert.equal(response.error.code,'E_BRIDGE_CONTEXT');
   assert.ok(response.error.message.length>0);assert.equal(response.data,undefined);
   assert.equal((await refresh(h)).ok,false);assert.equal(h.reloads.length,0);assert.equal(h.sends.length,0);
  }finally{h.page.dispose();}
 }
});

test('refresh requires a safe bounded dispatch deadline and consumes rejected challenges',async()=>{
 const originalNow=Date.now;let clock=originalNow();Date.now=()=>clock;
 try{
  for(const deadline of [undefined,null,'1000',NaN,Infinity,clock+0.5,clock,clock-1,clock+1001]){
   const h=fixture({active:true});try{
    await probe(h);
    const response=await h.receive({kind:'sidebar-refresh',nonce:'host-challenge-1',expiresAt:deadline});
    assert.equal(response.ok,false,String(deadline));assert.equal(h.reloads.length,0);
    assert.equal((await refresh(h)).ok,false,'invalid deadline consumes nonce');assert.equal(h.sends.length,0);
   }finally{h.page.dispose();}
  }
  const h=fixture({active:true});try{
   await probe(h);clock+=9500;
   assert.equal((await refresh(h)).ok,false,'dispatch deadline cannot exceed original probe TTL');
   assert.equal(h.reloads.length,0);
   await probe(h);assert.equal((await refresh(h)).ok,true,'one-second deadline is allowed');
   assert.equal(h.reloads.length,1);
  }finally{h.page.dispose();}
 }finally{Date.now=originalNow;}
});
test('late refresh dispatch after Host timeout cannot reload even within probe TTL',async()=>{
 const originalNow=Date.now;let clock=originalNow();Date.now=()=>clock;
 const h=fixture({active:true});try{
  await probe(h);
  const dispatch={kind:'sidebar-refresh',nonce:'host-challenge-1',expiresAt:clock+1000};
  clock+=2000; // Host RPC timed out and released its local refresh lock.
  const response=await h.receive(dispatch);assert.equal(response.ok,false);
  assert.equal((await refresh(h)).ok,false,'late dispatch consumed its original challenge');
  assert.equal(h.reloads.length,0);assert.equal(h.sends.length,0);
 }finally{Date.now=originalNow;h.page.dispose();}
});


test('unresolved native submissions deny a fresh refresh challenge before the new reply exists',async()=>{
 for(const stage of ['submitted','waiting-reply']){
  const h=fixture({active:true});try{
   const node=text=>({textContent:text,getAttribute:()=>null,compareDocumentPosition:()=>4});
   if(stage==='waiting-reply'){
    h.snapshot.users=[node('old instruction')];h.snapshot.assistants=[node('old complete answer')];
   }
   h.poll();h.snapshot.draft='new instruction';h.submit();h.snapshot.draft='';
   if(stage==='waiting-reply')h.snapshot.users.push(node('new instruction'));
   h.poll();
   const response=await probe(h);
   assert.equal(response.data.session.observation.stage,stage);
   assert.equal(response.data.recovery.allowed,false);
   assert.equal(response.data.recovery.reason,'pending');
   assert.equal((await refresh(h)).ok,false);
   assert.equal(h.reloads.length,0);assert.equal(h.sends.length,0);
  }finally{h.page.dispose();}
 }
});
test('navigation away and back consumes an earlier refresh challenge but a new idle probe can refresh',async()=>{
 const h=fixture({active:true});try{
  h.poll();assert.equal((await probe(h)).data.recovery.allowed,true);
  h.win.location.href='https://chatgpt.com/c/another-chat-12345678';
  h.snapshot.route='c/another-chat-12345678';h.poll();
  h.win.location.href=url;h.snapshot.route='c/sidebar-test-12345678';h.poll();
  assert.equal((await refresh(h)).ok,false);
  assert.equal(h.reloads.length,0);assert.equal(h.sends.length,0);
  assert.equal((await probe(h,'after-navigation')).data.recovery.allowed,true);
  assert.equal((await refresh(h,'after-navigation')).ok,true);
  assert.equal(h.reloads.length,1);assert.equal(h.sends.length,0);
 }finally{h.page.dispose();}
});

test('actual navigation events invalidate an old challenge during a fast round trip without polling',async()=>{
 for(const type of ['navigate','currententrychange']){
  const h=fixture({active:true});try{
   h.poll();assert.equal((await probe(h)).data.recovery.allowed,true);
   h.win.location.href='https://chatgpt.com/c/another-chat-12345678';
   h.snapshot.route='c/another-chat-12345678';h.navigationEvent(type);
   h.win.location.href=url;h.snapshot.route='c/sidebar-test-12345678';h.navigationEvent(type);
   assert.equal((await refresh(h)).ok,false);
   assert.equal(h.reloads.length,0);assert.equal(h.sends.length,0);
   assert.equal((await probe(h,'fresh-after-events')).data.recovery.allowed,true);
   assert.equal((await refresh(h,'fresh-after-events')).ok,true);
   assert.equal(h.reloads.length,1);assert.equal(h.sends.length,0);
  }finally{h.page.dispose();}
 }
});
test('missing native navigation observation denies refresh while preserving a read-only listener',async()=>{
 const h=fixture({active:true,navigationAvailable:false});try{
  const response=await probe(h);assert.equal(response.ok,true);
  assert.equal(response.data.recovery.allowed,false);
  assert.equal((await refresh(h)).ok,false);
  assert.equal(h.reloads.length,0);assert.equal(h.sends.length,0);
 }finally{h.page.dispose();}
});
