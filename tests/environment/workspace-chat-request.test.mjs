import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHash,randomUUID} from 'node:crypto';
import {createFileRequestContext,parseFileRequest,formatFileResult,REQUEST_PROTOCOL} from '../../src/native-agent/workspace-chat-request.js';
import {createEditContext,parseEditProposal,validateEditProposal,EDIT_PROTOCOL} from '../../src/native-agent/workspace-ai-proposal.js';
import {inspectChatGPTEditsOnPage,fillChatGPTComposerOnPage,verifyChatGPTComposerOnPage,fillChatGPTComposer} from '../../src/native-agent/workspace-chatgpt.js';
import {initWorkspaceChatEdit} from '../../src/native-agent/workspace-chat-edit-ui.js';

const WS='workspace-12345678-1234-4234-8234-123456789abc';
const BINDING='binding-1234567890123456',REQUEST='request-1234567890123456';
const URL_CHAT='https://chatgpt.com/c/current-conversation';
const hash=text=>createHash('sha256').update(text).digest('hex');
const json=value=>JSON.parse(JSON.stringify(value));
const makeContext=options=>createFileRequestContext({workspaceId:WS,bindingId:BINDING,requestId:REQUEST,path:'README.md',...options});
const expectCode=(fn,code)=>assert.throws(fn,e=>e.code===code);

test('new request context contains routing identities without the previously unknown file body or Native authority',()=>{
  const marker=randomUUID(),{request,prompt}=makeContext();
  assert.equal(Object.keys(request).length,6);assert.equal(request.operation,'read');
  assert.ok(Object.isFrozen(request));assert.match(prompt,/不是已注册的 MCP/);
  assert.ok(!prompt.includes(marker));assert.doesNotMatch(prompt,/clientCredential|leaseId|leaseEpoch|sessionId/);
  assert.deepEqual(parseFileRequest(JSON.stringify(request),request),request);
});
test('request parser rejects ambiguity, duplicate keys, wrong versions, stale bindings and unsafe paths',()=>{
  const {request}=makeContext(),text=JSON.stringify(request),fence=String.fromCharCode(96).repeat(3);
  assert.equal(parseFileRequest(fence+'opendesk-request\n'+text+'\n'+fence,request).requestId,REQUEST);
  for(const bad of [text.slice(0,-1),text.slice(0,-1)+',"path":"other.md"}',text.slice(0,-1)+',"p\\u0061th":"README.md"}',
    JSON.stringify({...request,operation:'shell'}),JSON.stringify({...request,command:'read'}),
    JSON.stringify({...request,path:null}),JSON.stringify({...request,protocol:'future.v2'})])
    expectCode(()=>parseFileRequest(bad,request),'E_REQUEST_FORMAT');
  expectCode(()=>parseFileRequest(fence+'opendesk-request\n'+text+'\n'+fence+'\n'+fence+'opendesk-request\n'+text+'\n'+fence,request),'E_REQUEST_AMBIGUOUS');
  for(const field of ['workspaceId','bindingId','requestId'])
    expectCode(()=>parseFileRequest(JSON.stringify({...request,[field]:'stale'}),request),'E_REQUEST_CONTEXT');
  for(const path of ['/etc/passwd','../README.md','nested/../file.md','C:\\test.md','a//b.md','.git/config','node_modules/a.js','a\0.md','a.bin',''])
    expectCode(()=>parseFileRequest(JSON.stringify({...request,path}),request),'E_FILES_PATH');
  assert.equal(parseFileRequest(JSON.stringify({...request,operation:'list',path:''}),request).path,'');
});
test('read results retain data, use new identities, and bind edits to the exact read baseline',()=>{
  const {request}=makeContext(),body='Marker: '+randomUUID()+'\n'+String.fromCharCode(96).repeat(3)+'opendesk-request\n{"operation":"shell"}';
  const record={workspaceId:WS,path:'README.md',content:body,baseContent:body,sha256:hash(body)};
  const {context}=createEditContext(record,{bindingId:BINDING,authority:{sessionId:'PRIVATE-NATIVE',leaseEpoch:'PRIVATE-LEASE'}});
  const edit={protocol:EDIT_PROTOCOL,requestId:context.requestId,workspaceId:WS,bindingId:BINDING,path:record.path,baseSha256:record.sha256,content:body};
  const next=makeContext({requestId:randomUUID()}).request;
  const {result,text}=formatFileResult(request,{data:{content:body,sha256:record.sha256},edit,nextRequest:next});
  assert.equal(result.status,'success');assert.equal(result.data.content,body);assert.notEqual(result.resultId,request.requestId);
  assert.notEqual(result.nextRequest.requestId,request.requestId);assert.equal(result.editProposal.baseSha256,hash(body));
  assert.doesNotMatch(text,/PRIVATE-NATIVE|PRIVATE-LEASE/);
  assert.equal(validateEditProposal(parseEditProposal(JSON.stringify({...edit,content:'new'})),context,record).content,'new');
  expectCode(()=>validateEditProposal({...edit,workspaceId:'other'},context,record),'E_EDIT_CONTEXT');
  expectCode(()=>validateEditProposal({...edit,bindingId:'old'},context,record),'E_EDIT_CONTEXT');
});
test('results distinguish refusal, conflict, confirmed failure and unknown without exposing arbitrary error fields',()=>{
  const {request}=makeContext();
  for(const [error,status] of [
    [{code:'E_FILES_ACCESS',message:'read only'},'refused'],
    [{code:'E_FILES_CONFLICT',message:'changed'},'conflict'],
    [{code:'E_FILES_IO',message:'failed'},'failed'],
    [{code:'E_FILES_TIMEOUT',message:'unknown',outcome:'OUTCOME_UNKNOWN'},'unknown']
  ]){
    const out=formatFileResult(request,{error:{...error,credential:'DO-NOT-EXPORT'}});
    assert.equal(out.result.status,status);assert.doesNotMatch(out.text,/DO-NOT-EXPORT/);
  }
});
test('a full 32 KiB readable file fits the result composer budget including its edit template',()=>{
  for(const body of ['x'.repeat(32768),'\x01'.repeat(5600)+'a'.repeat(32768-5600)]){
    const {request}=makeContext(),data={content:body,sha256:hash(body)};
    const result=formatFileResult(request,{data,edit:{...request,protocol:EDIT_PROTOCOL,baseSha256:data.sha256,content:body},nextRequest:makeContext({requestId:randomUUID()}).request});
    assert.equal(result.result.data.content,body);
    assert.ok(new TextEncoder().encode(result.text).length<200*1024);
  }
});

// Component fixture, NOT a real Chrome/ChatGPT result. Each serialized
// production function runs without imports or outer closures, as in Chrome.
function pageFixture(){
  const state={messages:[],streaming:false,calls:[],onFocus:null,onInsert:null,afterScript:null,files:[],attachment:null,rich:false,selectionOutside:false};
  const form={querySelectorAll:()=>state.files,querySelector:()=>state.attachment};
  const doc={activeElement:null,
    querySelectorAll(selector){
      if(selector.includes('#prompt-textarea'))return state.editors||[state.editor];
      if(selector.includes('data-message-author-role')){
        if(selector.includes('"assistant"'))return state.messages;
        return state.messages.filter(node=>node.role==='user');
      }
      if(selector.includes('stop-button'))return state.streaming?[{closest:()=>null}]:[];
      return [];
    },
    getSelection:()=>({rangeCount:1,anchorNode:state.selectionOutside?{}:state.editor,focusNode:state.editor}),
    execCommand(command,ui,text){
      state.calls.push({command,ui,text});
      if(state.onInsert)return state.onInsert(state.editor,text);
      state.editor.text=text;return true;
    }
  };
  function editor(kind='DIV'){
    return {tagName:kind,text:'',isConnected:true,parentElement:null,disabled:false,
      get value(){return this.text;},get textContent(){return this.text;},get innerText(){return this.text;},
      getAttribute:key=>key==='contenteditable'?'true':null,
      closest:selector=>selector==='form'?form:null,querySelector:()=>state.rich?{}:null,
      contains:()=>false,focus(){doc.activeElement=this;state.onFocus?.(this);}};
  }
  state.editor=editor();
  const sandbox=vm.createContext({document:doc,location:new URL(URL_CHAT),TextEncoder,URL,crypto:globalThis.crypto,
    getComputedStyle:node=>node.style||{display:'block',visibility:'visible'}});
  const invoke=(fn,args)=>{sandbox.args=args;return vm.runInContext('('+fn.toString()+')(args)',sandbox);};
  const target={tabId:9,documentId:'document-chat',url:URL_CHAT};
  const api={webNavigation:{getFrame:async()=>({...target,url:sandbox.location.href})},
    scripting:{executeScript:async options=>{
      assert.equal(options.world,'ISOLATED');
      assert.deepEqual(options.target,{tabId:target.tabId,documentIds:[target.documentId]});
      const result=invoke(options.func,options.args[0]);
      await state.afterScript?.(options.func,result);
      return [{frameId:0,documentId:target.documentId,result}];
    }}};
  const addMessage=(role,text='',blocks=[])=>{
    const node={role,text,blocks:[],parentElement:null,streaming:false,hidden:false,
      get textContent(){return this.text+'\n'+this.blocks.map(block=>block.textContent).join('\n');},
      getAttribute:key=>key==='data-message-author-role'?role:null,
      matches(){return this.streaming;},
      closest(selector){return selector.includes('hidden')&&this.hidden?{}:selector.includes('result-streaming')&&this.streaming?{}:null;},
      querySelector(){return null;},querySelectorAll(){return this.blocks;}
    };
    node.blocks=blocks.map(block=>({textContent:typeof block==='string'?block:block.text,
      getAttribute:key=>key==='class'?'language-'+(block.language||'opendesk-request'):'',
      parentElement:{getAttribute:()=>null,parentElement:null},
      closest:selector=>selector==='[data-message-author-role]'?node:selector.includes('blockquote')&&block.quoted?{}:null}));
    state.messages.push(node);return node;
  };
  const identity=()=>invoke(inspectChatGPTEditsOnPage,{expectedUrl:URL_CHAT,identityOnly:true});
  const fill=(operationId=randomUUID(),text='NATIVE RESULT')=>invoke(fillChatGPTComposerOnPage,
    {expectedUrl:URL_CHAT,operationId,text,expectedTurnKey:identity().turnKey});
  return {state,doc,sandbox,api,target,invoke,addMessage,identity,fill,editor};
}

test('only a marked unique complete assistant request after this user turn can be executed',()=>{
  const f=pageFixture(),{request,prompt}=makeContext(),text=JSON.stringify(request);
  f.addMessage('user',prompt,[text]);f.addMessage('assistant','',[{text,language:'json'}]);
  const read=()=>f.invoke(inspectChatGPTEditsOnPage,{expectedUrl:URL_CHAT,requestIds:[REQUEST],requireUserEcho:true,protocols:[REQUEST_PROTOCOL,EDIT_PROTOCOL]});
  assert.equal(read().error.code,'E_CHAT_REQUEST_MARKER');
  f.state.messages.pop();f.addMessage('assistant','',[{text}]);assert.equal(read().blocks[0],text);
  f.addMessage('assistant','',[{text:JSON.stringify({...request,requestId:'old-request-12345678'})}]);
  assert.equal(read().error.code,'E_EDIT_AMBIGUOUS');
  f.state.messages.pop();f.state.streaming=true;assert.equal(read().error.code,'E_CHAT_STREAMING');
  f.state.streaming=false;f.addMessage('user','next question');assert.equal(read().error.code,'E_CHAT_PENDING');
});
test('quoted request examples and user protocol blocks do not become assistant operations',()=>{
  const f=pageFixture(),{request,prompt}=makeContext(),text=JSON.stringify(request);
  f.addMessage('user',prompt,[text]);f.addMessage('assistant','Quoted file example',[{text,quoted:true}]);
  const result=f.invoke(inspectChatGPTEditsOnPage,{expectedUrl:URL_CHAT,requestId:REQUEST,protocols:[REQUEST_PROTOCOL]});
  assert.equal(result.error.code,'E_CHAT_FORMAT');
});
test('turn and answer revisions change even when the website reuses DOM nodes',()=>{
  const f=pageFixture(),user=f.addMessage('user','first'),assistant=f.addMessage('assistant','first answer');
  const original=f.identity();user.text='edited question';assert.notEqual(f.identity().turnKey,original.turnKey);
  const next=f.identity();assistant.text='regenerated answer';assert.notEqual(f.identity().answerKey,next.answerKey);
  f.state.streaming=true;
  const incomplete=f.invoke(inspectChatGPTEditsOnPage,{expectedUrl:URL_CHAT,identityOnly:true,requireComplete:true});
  assert.equal(incomplete.error.code,'E_CHAT_STREAMING');
});
for(const kind of ['DIV','TEXTAREA']){
  test('composer fills '+kind+' once with browser editing and never sends',async()=>{
    const f=pageFixture();f.state.editor=f.editor(kind);f.addMessage('user','question');
    const turnKey=f.identity().turnKey,operationId=randomUUID();
    const result=await fillChatGPTComposer(f.api,f.target,'actual result',{operationId,turnKey});
    assert.equal(result.filled,true);assert.equal(result.sent,false);assert.equal(f.state.calls.length,1);
    assert.deepEqual(f.state.calls[0],{command:'insertText',ui:false,text:'actual result'});
    await assert.rejects(fillChatGPTComposer(f.api,f.target,'actual result',{operationId,turnKey}),e=>e.code==='E_CHAT_REPLAY');
    assert.equal(f.state.calls.length,1);
  });
}
for(const mode of ['existing draft','focus restores draft','focus restores attachment','focus restores rich content','wrong selection','streaming','multiple composers']){
  test('composer refuses without editing: '+mode,()=>{
    const f=pageFixture();f.addMessage('user','question');
    if(mode==='existing draft')f.state.editor.text='USER DRAFT';
    if(mode==='focus restores draft')f.state.onFocus=editor=>{editor.text='USER DRAFT';};
    if(mode==='focus restores attachment')f.state.onFocus=()=>{f.state.attachment={};};
    if(mode==='focus restores rich content')f.state.onFocus=()=>{f.state.rich=true;};
    if(mode==='wrong selection')f.state.selectionOutside=true;
    if(mode==='streaming')f.state.streaming=true;
    if(mode==='multiple composers')f.state.editors=[f.state.editor,f.editor()];
    assert.equal(f.fill().ok,false);assert.equal(f.state.calls.length,0);
    if(mode.includes('draft'))assert.equal(f.state.editor.text,'USER DRAFT');
  });
}
test('a detached or rolled-back editor is unknown, not a confirmed fill, and cannot replay',async()=>{
  for(const rollback of [false,true]){
    const f=pageFixture();f.addMessage('user','question');
    const operationId=randomUUID(),turnKey=f.identity().turnKey;
    if(rollback)f.state.afterScript=fn=>{if(fn===fillChatGPTComposerOnPage)f.state.editor.text='';};
    else f.state.onInsert=(old,text)=>{old.text=text;old.isConnected=false;f.state.editor=f.editor();return true;};
    await assert.rejects(fillChatGPTComposer(f.api,f.target,'result',{operationId,turnKey}),e=>e.outcome==='OUTCOME_UNKNOWN');
    assert.equal(f.state.calls.length,1);
    await assert.rejects(fillChatGPTComposer(f.api,f.target,'result',{operationId,turnKey}),e=>e.code==='E_CHAT_REPLAY');
    assert.equal(f.state.calls.length,1);
  }
});
test('a confirmed editing failure may retry the retained text but a changed user turn cannot',()=>{
  const f=pageFixture(),user=f.addMessage('user','question'),operationId=randomUUID(),turnKey=f.identity().turnKey;
  f.state.onInsert=()=>false;
  assert.equal(f.fill(operationId).error.outcome,'NOT_DISPATCHED');
  f.state.onInsert=null;assert.equal(f.fill(operationId).ok,true);
  f.state.editor.text='';user.text='changed question';
  const late=f.invoke(fillChatGPTComposerOnPage,{expectedUrl:URL_CHAT,operationId:randomUUID(),text:'late',expectedTurnKey:turnKey});
  assert.equal(late.error.code,'E_CHAT_TURN');assert.equal(f.state.calls.length,2);
});

// Controller integration with an instrumented file-service stand-in. Go's
// actual file/lease/disk tests are separate; this does NOT claim Mac P0.
function controllerFixture(){
  const page=pageFixture(),marker=randomUUID(),files=new Map([['README.md','marker='+marker+'\n']]);
  page.addMessage('user','existing conversation');
  const nodes=new Map(),el=id=>{
    if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',hidden:true,disabled:false,events:new Map(),
      classList:{toggle(){}},addEventListener(type,fn){this.events.set(type,fn);}});
    return nodes.get(id);
  };
  let authority={workspaceId:WS,sourceId:'source-'+'a'.repeat(24),leaseEpoch:randomUUID(),sessionId:randomUUID(),access:'read-write',devLeaseEpoch:1};
  let current=null,pending=Promise.resolve(),ui,reads=0,writes=0,readGate=null,readError=null;
  ui=initWorkspaceChatEdit({api:page.api,doc:{getElementById:el},demo:false,getRecord:()=>current,getTarget:()=>page.target,
    getAuthority:()=>authority,assertAuthority:async expected=>{if(expected!==authority)throw {code:'E_FILES_SESSION'};},
    isWritable:()=>authority?.access==='read-write',readCurrent:async()=>current,
    setDraft:(record,text)=>{record.content=text;},
    requestFile:async request=>{
      reads++;if(readGate)await readGate;if(readError)throw readError;
      if(request.operation==='list')return {data:{workspaceId:WS,path:request.path,entries:[{name:'README.md',path:'README.md',kind:'file'}],truncated:false}};
      const body=files.get(request.path);
      current={workspaceId:WS,path:request.path,content:body,baseContent:body,sha256:hash(body)};
      ui.controls({busy:true,connected:true});
      return {record:current,data:{workspaceId:WS,path:request.path,content:body,sha256:hash(body),bytes:new TextEncoder().encode(body).length}};
    },
    run:fn=>{pending=(async()=>{ui.controls({busy:true,connected:true});try{await fn();}finally{ui.controls({connected:true});}})();}
  });
  el('chat-request-path').value='README.md';ui.controls({connected:true});
  const start=id=>{el(id).events.get('click')();return pending;};
  return {page,el,ui,files,marker,start,click:start,get reads(){return reads;},get writes(){return writes;},get current(){return current;},
    set authority(value){authority=value;},get authority(){return authority;},set readGate(value){readGate=value;},set readError(value){readError=value;},
    send(){const text=page.state.editor.text;assert.ok(text);page.state.editor.text='';page.addMessage('user',text);return text;},
    requestFromPrompt(){return JSON.parse(el('edit-context').value.match(/\{\n[\s\S]*?\n\}/)[0]);},
    result(){return JSON.parse(el('chat-file-result').value.slice(el('chat-file-result').value.indexOf('{\n')));},
    answer(value,language){page.addMessage('assistant','',[{text:JSON.stringify(value),language}]);},
    async save(){
      await ui.beforeSave(current);
      if(hash(files.get(current.path))!==current.sha256)throw {code:'E_FILES_CONFLICT'};
      writes++;files.set(current.path,current.content);
      current.baseContent=files.get(current.path);current.sha256=hash(current.baseContent);
      await ui.saved(current);
    }
  };
}
async function requestRead(h){
  await h.click('prepare-file-request');
  assert.ok(!h.el('edit-context').value.includes(h.marker),'initial prompt cannot reveal the random body');
  const request=h.requestFromPrompt();
  await h.click('fill-chat-context');h.send();h.answer(request,'opendesk-request');
  await h.click('read-chatgpt-edit');
  return {request,result:h.result()};
}
test('controller completes two distinct read-result-edit cycles with fresh requests and the saved baseline',async()=>{
  const h=controllerFixture(),before=h.files.get('README.md');
  const first=await requestRead(h);
  assert.equal(first.result.data.content,before);assert.ok(h.page.state.editor.text.includes(h.marker));
  assert.equal(h.writes,0);h.send();
  h.answer({...first.result.editProposal,content:before+'round one\n'},'opendesk-edit');
  await h.click('read-chatgpt-edit');assert.equal(h.writes,0);
  await h.click('adopt-edit');assert.equal(h.files.get('README.md'),before);
  await h.save();const sha1=hash(h.files.get('README.md'));assert.equal(h.writes,1);
  const second=await requestRead(h);
  assert.notEqual(second.request.requestId,first.request.requestId);
  assert.notEqual(second.request.bindingId,first.request.bindingId);
  assert.equal(second.result.editProposal.baseSha256,sha1);
  h.send();h.answer({...second.result.editProposal,content:second.result.data.content+'round two\n'},'opendesk-edit');
  await h.click('read-chatgpt-edit');await h.click('adopt-edit');await h.save();
  assert.equal(h.reads,2);assert.equal(h.writes,2);
  assert.match(h.files.get('README.md'),/round one\nround two\n$/);
  assert.equal(JSON.parse(h.el('edit-receipt').textContent).sha256,hash(h.files.get('README.md')));
});
test('result blocked by a user draft is retained; retry only refills and never reruns the file request',async()=>{
  const h=controllerFixture();
  await h.click('prepare-file-request');const request=h.requestFromPrompt();
  await h.click('fill-chat-context');h.send();h.answer(request,'opendesk-request');h.page.state.editor.text='USER DRAFT';
  await h.click('read-chatgpt-edit');
  assert.equal(h.reads,1);assert.equal(h.page.state.editor.text,'USER DRAFT');assert.ok(h.result().data.content.includes(h.marker));
  h.page.state.editor.text='';await h.click('refill-chat-result');
  assert.ok(h.page.state.editor.text.includes(h.marker));assert.equal(h.reads,1);
  await h.click('read-chatgpt-edit');assert.equal(h.reads,1,'old nonce cannot reread');
});
test('an adopted proposal cannot survive regeneration, workspace switching, or a changed file baseline',async()=>{
  for(const change of ['regenerate','workspace','baseline','answer text']){
    const h=controllerFixture(),{result}=await requestRead(h);h.send();
    h.answer({...result.editProposal,content:'proposed'},'opendesk-edit');
    await h.click('read-chatgpt-edit');await h.click('adopt-edit');
    assert.equal(h.current.content,'proposed');
    if(change==='regenerate')h.page.state.streaming=true;
    if(change==='workspace'){h.authority={...h.authority,leaseEpoch:randomUUID()};h.ui.authorityChanged();}
    if(change==='baseline'){h.current.sha256=hash('external');h.current.baseContent='external';}
    if(change==='answer text')h.page.state.messages.at(-1).text='regenerated';
    await assert.rejects(h.save(),e=>['E_CHAT_STREAMING','E_REQUEST_CONTEXT','E_FILES_SESSION','E_EDIT_BASE','E_CHAT_ANSWER'].includes(e.code));
    assert.equal(h.writes,0);
  }
});
test('external edits conflict, read-only authority refuses adoption, and old proposal replay never writes',async()=>{
  const h=controllerFixture(),{result}=await requestRead(h);h.send();
  const edit={...result.editProposal,content:'proposed'};h.answer(edit,'opendesk-edit');
  await h.click('read-chatgpt-edit');await h.click('adopt-edit');
  h.files.set('README.md','external editor');
  await assert.rejects(h.save(),e=>e.code==='E_FILES_CONFLICT');assert.equal(h.writes,0);
  await h.click('read-chatgpt-edit');assert.equal(h.el('edit-review').hidden,true);
  const ro=controllerFixture();ro.authority={...ro.authority,access:'read-only'};
  const read=await requestRead(ro);ro.send();ro.answer({...read.result.editProposal,content:'attempt'},'opendesk-edit');
  await ro.click('read-chatgpt-edit');await ro.click('adopt-edit');
  assert.equal(ro.current.content,read.result.data.content);assert.equal(ro.writes,0);
});
test('a late callback after binding invalidation cannot fill either the old or a replacement target',async()=>{
  const h=controllerFixture();await h.click('prepare-file-request');const request=h.requestFromPrompt();
  await h.click('fill-chat-context');h.send();h.answer(request,'opendesk-request');
  let release;h.readGate=new Promise(resolve=>{release=resolve;});
  const pending=h.start('read-chatgpt-edit');
  for(let n=0;n<80&&h.reads===0;n++)await Promise.resolve();
  assert.equal(h.reads,1);
  h.ui.invalidate('conversation navigated');release();await pending;
  assert.equal(h.page.state.editor.text,'');assert.equal(h.writes,0);
  assert.match(h.el('chat-edit-status').textContent,/E_REQUEST_CONTEXT/);
});
test('new request mode diagnoses an old Go without lease capability before exporting a prompt',async()=>{
  const h=controllerFixture();h.authority={...h.authority,devLeaseEpoch:0,leaseEpoch:''};
  await h.click('prepare-file-request');
  assert.match(h.el('chat-edit-status').textContent,/E_NATIVE_UPDATE_REQUIRED/);
  assert.equal(h.el('edit-context').value,'');assert.equal(h.reads,0);
});
