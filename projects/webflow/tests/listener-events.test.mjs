import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {initChatGPTFixedBridgePage} from '../trusted/chatgpt-bridge-page.js';

const url='https://chatgpt.com/c/listener-events-12345678';
const settle=async()=>{for(let n=0;n<8;n++)await new Promise(setImmediate);};

// Keep discovery/admission real; replace Chrome transport and native gesture
// delivery, which Node cannot supply. The interval is deliberately not fired.
function fixture({background=true,visiblePanel=false,sendHook}={}){
 const {document,window}=parseHTML('<html><body><main></main><form></form></body></html>');
 const docEvents=new Map(),winEvents=new Map(),sends=[];
 const add=document.addEventListener.bind(document);
 document.addEventListener=(type,fn,...rest)=>{
  const handlers=docEvents.get(type)||new Set();handlers.add(fn);docEvents.set(type,handlers);
  return add(type,fn,...rest);
 };
 const remove=document.removeEventListener.bind(document);
 document.removeEventListener=(type,fn,...rest)=>{docEvents.get(type)?.delete(fn);return remove(type,fn,...rest);};
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,
  get(){return this._value??this.querySelector('option')?.value??'';},set(value){this._value=value;}});
 let poll,listener,notify,inspections=0,turn=0;
 const win={location:{href:url,origin:'https://chatgpt.com'},document,
  MutationObserver:function(callback){notify=callback;return new window.MutationObserver(callback);},
  setInterval(fn){poll=fn;return 1;},clearInterval(){},
  addEventListener(type,fn){const handlers=winEvents.get(type)||new Set();handlers.add(fn);winEvents.set(type,handlers);},
  removeEventListener(type,fn){winEvents.get(type)?.delete(fn);}};win.top=win;
 const snapshot={ok:true,route:'c/listener-events-12345678',idle:true,busy:false,answerComplete:true,
  draft:'',rich:false,users:[],assistants:[],form:document.querySelector('form'),editor:document.createElement('textarea'),
  sendButton:{disabled:false,getAttribute:()=>null}};
 const intent={protocol:'webflow.task.intent.v1',candidateId:'wf-events-123456789012345678901234',
  taskId:'baidu.search.top3',targetUrl:'https://www.baidu.com/',args:{query:'OpenDesk Browser',limit:3}};
 const identity=()=>({ok:true,turnKey:snapshot.users.at(-1)?.getAttribute('data-message-id')??'turn',
  answerKey:snapshot.assistants.at(-1)?.getAttribute('data-message-id')??'answer',blocks:[JSON.stringify(intent)]});
 const prepared=message=>({requestId:'77777777-7777-4777-8777-'+String(turn).padStart(12,'0'),taskId:intent.taskId,
  targetUrl:intent.targetUrl,args:intent.args,source:{tabId:9,documentId:'events-document',url},
  installation:{version:'1.1.2',manifestHash:'a'.repeat(64),contentHash:'b'.repeat(64),
   scriptId:'task:baidu.search.top3:1.1.2',revision:1,installationId:'events-install',generation:1},
  candidate:{text:message.candidateText,candidateId:JSON.parse(message.candidateText).candidateId,
   turnKey:message.turnKey,answerKey:message.answerKey},
  ...(background?{executionOwner:'background'}:{})});
 const api={runtime:{id:'extension',getURL:path=>'chrome-extension://extension/'+(path||''),
  onMessage:{addListener(fn){listener=fn;},removeListener(){}},
  async sendMessage(message){
   sends.push(message);const result=sendHook?.(message);if(result!==undefined)return result;
   return {ok:true,data:message.kind==='auto-task'?prepared(message):message.kind==='check-delivery'?{allowed:true}:{}};
  }}};
 let resultText=null,resultUser=null;
 const resultObserved=Promise.withResolvers();
 snapshot.form.append(snapshot.editor);
 snapshot.editor.focus=()=>{document.activeElement=snapshot.editor;};
 const site={
  inspect(){inspections++;return {...snapshot,users:[...snapshot.users],assistants:[...snapshot.assistants]};},
  prepare(text){resultText=text;snapshot.draft=text;return {ok:true,token:{before:{}}};},
  commit(){
   resultUser=document.createElement('p');resultUser.setAttribute('data-message-id','result-user');
   resultUser.textContent=resultText;document.querySelector('main').append(resultUser);
   snapshot.users.push(resultUser);snapshot.draft='';return {ok:true};
  },
  confirm(){resultObserved.resolve();return resultUser!==null;}
 };
 const page=initChatGPTFixedBridgePage({api,doc:document,win,showLegacyPanel:visiblePanel,
  site,readPage:identity});
 const emit=(events,type,event={})=>{for(const fn of events.get(type)||[])fn({type,...event});};
 function reply({trusted=true,complete=true}={}){
  snapshot.draft='请搜索 OpenDesk Browser';
  emit(docEvents,'click',{isTrusted:trusted,button:0,target:snapshot.sendButton});snapshot.draft='';
  turn++;intent.candidateId='wf-events-'+String(turn).padStart(24,'0');
  const user=document.createElement('p'),answer=document.createElement('p');
  user.setAttribute('data-message-id','user-'+turn);answer.setAttribute('data-message-id','answer-'+turn);
  user.textContent='请搜索 OpenDesk Browser';answer.textContent=JSON.stringify(intent);
  document.querySelector('main').append(user,answer);
  snapshot.users.push(user);snapshot.assistants.push(answer);
  snapshot.busy=!complete;snapshot.idle=complete;snapshot.answerComplete=complete;
 }
 const receive=(message,sender={id:'extension',url:'chrome-extension://extension/sidepanel.html?hostInstanceId=real'})=>
  new Promise(resolve=>listener({protocol:'opendesk.chatgpt.bridge.r12.v1',sourceUrl:url,...message},sender,resolve));
 return {page,document,win,snapshot,sends,reply,receive,resultObserved:resultObserved.promise,
  poll:()=>poll(),inspections:()=>inspections,notify:records=>notify(records),
  emitDoc:(type,event)=>emit(docEvents,type,event),emitWin:(type,event)=>emit(winEvents,type,event),
  read:()=>receive({kind:'sidebar-read'})};
}

test('a complete witnessed reply reaches background admission from DOM changes without an interval or refresh',async()=>{
 const h=fixture();try{
  h.reply();await settle();
  assert.equal(h.sends.filter(row=>row.kind==='auto-task').length,1);
  assert.equal(h.sends.filter(row=>row.kind==='background-ready').length,1);
  for(let n=0;n<10;n++)h.document.querySelector('main').append(' ');
  await settle();h.poll();await settle();
  assert.equal(h.sends.filter(row=>row.kind==='auto-task').length,1,'events and fallback cannot replay admission');
 }finally{h.page.dispose();}
});

test('streaming mutations and untrusted sends cannot admit; completion can admit the witnessed turn once',async()=>{
 for(const trusted of [false,true]){
  const h=fixture();try{
   h.reply({trusted,complete:false});await settle();assert.equal(h.sends.length,0);
   h.snapshot.busy=false;h.snapshot.idle=true;h.snapshot.answerComplete=true;
   h.snapshot.assistants[0].setAttribute('data-talvt-turn-state','complete');await settle();
   assert.equal(h.sends.filter(row=>row.kind==='auto-task').length,trusted?1:0);
  }finally{h.page.dispose();}
 }
});

test('the existing Side Panel execution owner also consumes an event-driven candidate only once',async()=>{
 const h=fixture({background:false});try{
  h.reply();await settle();
  assert.equal(h.sends.filter(row=>row.kind==='auto-task').length,1);
  assert.equal(h.sends.filter(row=>row.kind==='execute').length,1);
  assert.equal(h.sends.filter(row=>row.kind==='background-ready').length,0);
  h.emitWin('focus');h.poll();await settle();
  assert.equal(h.sends.filter(row=>row.kind==='execute').length,1);
 }finally{h.page.dispose();}
});

for(const outcome of ['completed','unknown'])
test('a deferred event resumes after the original execute ACK only when it is '+outcome,async()=>{
 const ack=Promise.withResolvers();let executions=0;
 const h=fixture({background:false,sendHook:message=>{
  if(message.kind==='execute'&&++executions===1)return ack.promise;
 }});try{
  h.reply();await settle();h.reply();await settle();
  assert.equal(h.sends.filter(row=>row.kind==='auto-task').length,1);
  ack.resolve(outcome==='completed'?{ok:true,data:{sent:true,runId:'first-run',resultId:'first-result'}}:
   {ok:false,error:{code:'E_BRIDGE_OUTCOME_UNKNOWN',message:'first execution ACK unknown'}});
  await settle();
  assert.equal(h.sends.filter(row=>row.kind==='auto-task').length,outcome==='completed'?2:1);
  assert.equal(h.sends.filter(row=>row.kind==='execute').length,outcome==='completed'?2:1);
 }finally{h.page.dispose();}
});

test('background delivery settlement wakes a complete deferred turn without waiting for the interval',async()=>{
 const h=fixture();try{
  h.reply();await settle();
  const first=h.sends.find(row=>row.kind==='auto-task'),view=(await h.read()).data;
  const delivering=h.receive({kind:'deliver',mode:'auto',requestId:view.requestId,runId:'first-run',resultId:'first-result',
   turnKey:first.turnKey,answerKey:first.answerKey,text:'real durable result'},
   {id:'extension',url:'chrome-extension://extension/sw.js'});
  await h.resultObserved;
  h.reply();await settle();
  assert.equal(h.sends.filter(row=>row.kind==='auto-task').length,1,'delivery still owns the request');
  assert.equal((await delivering).ok,true);await settle();
  assert.equal(h.sends.filter(row=>row.kind==='auto-task').length,2);
  assert.equal(h.sends.filter(row=>row.kind==='background-ready').length,2);
 }finally{h.page.dispose();}
});

test('input property changes update the current draft without a DOM mutation or interval',async()=>{
 const h=fixture();try{
  h.snapshot.draft='尚未发送的新需求';h.emitDoc('input');await settle();
  assert.match((await h.read()).data.status,/尚未发送/);assert.equal(h.sends.length,0);
 }finally{h.page.dispose();}
});

test('body replacement keeps observing the new composer document',async()=>{
 const h=fixture();try{
  const body=h.document.createElement('body');body.innerHTML='<main></main><form></form>';
  h.document.body.replaceWith(body);h.snapshot.form=body.querySelector('form');await settle();
  h.reply();await settle();assert.equal(h.sends.filter(row=>row.kind==='auto-task').length,1);
 }finally{h.page.dispose();}
});

test('a queued event cannot admit after disposal and bridge-owned changes do not feed observation',async()=>{
 const h=fixture({visiblePanel:true});try{
  const before=h.inspections();
  // Linkedom reports the observed HTML root as childList.target for subtree
  // edits. Supply the browser's actual target shape for this exclusion check.
  h.notify([{target:h.document.querySelector('[data-opendesk-ui-owner]')}]);await settle();
  assert.equal(h.inspections(),before);
  h.reply();h.page.dispose();await settle();h.emitDoc('input');h.emitWin('focus');await settle();
  assert.equal(h.sends.length,0);
 }finally{h.page.dispose();}
});
