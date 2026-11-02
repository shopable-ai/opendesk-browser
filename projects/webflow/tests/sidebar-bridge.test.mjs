import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {initChatGPTFixedBridgePage} from '../../../src/native-agent/chatgpt-fixed-bridge-page.js';
const protocol='opendesk.chatgpt.bridge.r12.v1';
const url='https://chatgpt.com/c/sidebar-test-12345678';
function fixture({active=false,adoptError=false}={}){
 const {document,window}=parseHTML('<html><body></body></html>');let listener,poll;
 const events=new Map(),addEvent=document.addEventListener.bind(document);
 document.addEventListener=(type,handler,...rest)=>{events.set(type,handler);return addEvent(type,handler,...rest);};
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this._value??this.querySelector('option')?.value??'';},set(value){this._value=value;}});
 const win={location:{href:url,origin:'https://chatgpt.com'},setInterval(fn){poll=fn;return 1;},clearInterval(){},addEventListener(){},removeEventListener(){}};win.top=win;
 const sends=[];
 const intent={protocol:'opendesk.task.intent.v1',candidateId:'sidebar-candidate',taskId:'baidu.search.top3',targetUrl:'https://www.baidu.com/',args:{query:'OpenDesk Browser',limit:3}};
 const installation={version:'1.1.1',manifestHash:'a'.repeat(64),contentHash:'b'.repeat(64),scriptId:'task:baidu.search.top3:1.1.1',revision:1,installationId:'original-install',generation:1};
 const prepared={requestId:'77777777-7777-4777-8777-777777777777',taskId:intent.taskId,targetUrl:intent.targetUrl,args:intent.args,installation,
  source:{tabId:9,documentId:'original-document',url},candidate:{text:JSON.stringify(intent),candidateId:intent.candidateId,turnKey:'turn',answerKey:'answer'}};
 const snapshot={ok:true,route:'c/sidebar-test-12345678',idle:true,busy:false,answerComplete:true,draft:'',rich:false,users:[],assistants:[]};
 snapshot.editor={};snapshot.sendButton={disabled:false,getAttribute:()=>null};
 const api={runtime:{id:'extension',getURL:()=> 'chrome-extension://extension/',
  onMessage:{addListener(fn){listener=fn;},removeListener(){}},sendMessage:async message=>{
   sends.push(message);
   if(adoptError&&message.kind==='adopt-task')return {ok:false,error:{code:'E_BUILTIN_VERSION_UNAVAILABLE',message:'runtime changed'}};
   return {ok:true,data:message.kind==='adopt-task'?prepared:message.kind==='execute'?
    {runId:'original-run',resultId:'original-result',resultPreview:'OLD_RESULT',sent:true,aiReplyObserved:true}:{}};
  }}};
 const elements=[],create=document.createElement.bind(document);document.createElement=(...args)=>{const node=create(...args);elements.push(node);return node;};
 const page=initChatGPTFixedBridgePage({api,doc:document,win,site:{inspect:()=>active?snapshot:{ok:false}},
  readPage:()=>({ok:true,turnKey:'turn',answerKey:'answer',blocks:[JSON.stringify(intent)]})});
 const sender={id:'extension',url:'chrome-extension://extension/sidepanel.html?hostInstanceId=real'};
 const receive=(message,from=sender)=>new Promise(resolve=>{
  const response=listener({protocol,sourceUrl:win.location.href,...message},from,resolve);
  if(response===false)queueMicrotask(()=>resolve(undefined));
 });
 return {page,receive,sends,sender,win,snapshot,poll:()=>poll(),elements,prepared,
  submit:()=>events.get('click')({type:'click',isTrusted:true,button:0,target:snapshot.sendButton})};
}
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
  assert.ok(next.selection.includes('baidu.search.top3'));
 }finally{h.page.dispose();}
});
