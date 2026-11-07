import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseHTML} from 'linkedom';
import {initChatGPTFixedBridgePage} from '../trusted/chatgpt-bridge-page.js';
import {createChatGPTFilesController,CHATGPT_FILES_PROTOCOL,CHATGPT_FILES_PAGE}
  from '../trusted/chatgpt-files-controller.js';
import {normalizeChatGPTFileHint,assertLockedChatGPTFileRequest,
  installChatGPTFileIntentGate,CHATGPT_FILE_INTENT_PROTOCOL} from '../trusted/chatgpt-file-intent-gate.js';
import {initChatGPTFileIntentPage} from '../trusted/chatgpt-file-intent-page.js';

const sourceUrl='https://chatgpt.com/c/abc12345-1234-1234-1234-abcdef123456';
const workspaceUrl='chrome-extension://test-extension/native-agent/workspace.html';
const pageSender={id:'test-extension',frameId:0,documentId:'document-a',
  url:sourceUrl,tab:{id:7,windowId:3,incognito:false}};
const workspaceSender={id:'test-extension',frameId:0,documentId:'document-w',
  url:workspaceUrl,tab:{id:51,windowId:3,incognito:false}};
function emitter(){
  const callbacks=new Set();
  return {addListener:fn=>callbacks.add(fn),removeListener:fn=>callbacks.delete(fn),
    emit(...args){for(const callback of callbacks)callback(...args);},
    get first(){return [...callbacks][0];}};
}
function setup(){
  const messages=emitter(),history=emitter(),committed=emitter(),removed=emitter();
  let created=0,now=1000,frameUrl=sourceUrl,frameDocument='document-a';
  const api={
    runtime:{id:'test-extension',getURL:path=>'chrome-extension://test-extension/'+path,
      onMessage:messages},
    tabs:{onRemoved:removed,
      async get(id){assert.equal(id,7);return {id,windowId:3,url:frameUrl,incognito:false};},
      async create(options){created++;assert.equal(options.url,workspaceUrl);
        assert.equal(options.windowId,3);assert.equal(options.openerTabId,7);
        return {id:51,windowId:3};}},
    webNavigation:{onCommitted:committed,onHistoryStateUpdated:history,
      async getFrame({tabId,frameId}){assert.equal(tabId,7);assert.equal(frameId,0);
        return {url:frameUrl,documentId:frameDocument,documentLifecycle:'active'};}}
  };
  const gate=installChatGPTFileIntentGate({api,clock:()=>now});
  async function call(kind,sender,extras={}){
    return new Promise(resolve=>{
      const handled=messages.first({protocol:CHATGPT_FILE_INTENT_PROTOCOL,kind,...extras},sender,resolve);
      assert.equal(handled,true);
    });
  }
  return {call,gate,history,committed,removed,
    created:()=>created,tick:ms=>{now+=ms;},navigate:url=>{frameUrl=url;},
    replaceDocument:id=>{frameDocument=id;}};
}

test('only relative .txt hints; the model cannot expand the reviewed file scope',()=>{
  assert.equal(normalizeChatGPTFileHint(''),'');
  assert.equal(normalizeChatGPTFileHint('folder/demo.txt'),'folder/demo.txt');
  for(const path of ['../secret.txt','/etc/passwd.txt','other.md','demo.txt/',' hidden.txt','demo.TXT',12]){
    assert.throws(()=>normalizeChatGPTFileHint(path),{code:'E_FILE_HINT'});
  }
  const reviewed={requestId:'req',bindingId:'binding',workspaceId:'workspace',operation:'read',path:'demo.txt'};
  assert.equal(assertLockedChatGPTFileRequest({...reviewed},reviewed).path,'demo.txt');
  for(const changes of [{path:'other.txt'},{operation:'list'},{workspaceId:'other'},{requestId:'replay'}]){
    assert.throws(()=>assertLockedChatGPTFileRequest({...reviewed,...changes},reviewed),{code:'E_FILE_SCOPE'});
  }
});

test('official main-document click opens Workspace but never creates Native authority',async()=>{
  const h=setup();
  try{
    const open=await h.call('open',pageSender,{pathHint:'demo.txt'});
    assert.deepEqual(open,{ok:true,data:{opened:true}});
    assert.equal(h.created(),1);
    const claimed=await h.call('claim',workspaceSender);
    assert.equal(claimed.ok,true);
    assert.equal(claimed.data.pathHint,'demo.txt');
    assert.equal(claimed.data.source.tabId,7);
    assert.equal(claimed.data.source.documentId,'document-a');
    assert.equal(claimed.data.source.url,sourceUrl);
    assert.equal(claimed.data.source.conversationId,'abc12345-1234-1234-1234-abcdef123456');
    assert.equal(claimed.data.requiresDisclosureConsent,true);
    assert.equal('workspaceId' in claimed.data,false);
    assert.equal('sessionId' in claimed.data,false);
    assert.equal('requestId' in claimed.data,false);
    assert.equal((await h.call('claim',workspaceSender)).error.code,'E_FILE_REPLAY');
  }finally{h.gate.dispose();}
});

test('page spoofing and page-provided grants are rejected before opening',async()=>{
  const h=setup();
  try{
    const spoof=await h.call('open',{...pageSender,id:'foreign'}, {pathHint:'demo.txt'});
    assert.equal(spoof.error.code,'E_FILE_SENDER');
    const grant=await h.call('open',pageSender,{pathHint:'demo.txt',workspaceId:'workspace-forged'});
    assert.equal(grant.error.code,'E_FILE_SCHEMA');
    assert.equal(h.created(),0);
    const wrongOwner=await h.call('claim',{...workspaceSender,url:sourceUrl});
    assert.equal(wrongOwner.error.code,'E_FILE_OWNER');
  }finally{h.gate.dispose();}
});

test('navigation and document replacement invalidate pending handoffs',async()=>{
  const h=setup();
  try{
    assert.equal((await h.call('open',pageSender)).ok,true);
    h.history.emit({tabId:7,frameId:0});
    assert.equal((await h.call('claim',workspaceSender)).error.code,'E_FILE_REPLAY');
    assert.equal((await h.call('open',pageSender)).ok,true);
    h.replaceDocument('document-new');
    assert.equal((await h.call('claim',workspaceSender)).error.code,'E_FILE_SOURCE');
  }finally{h.gate.dispose();}
});

test('expired handoffs fail closed and cannot be claimed twice',async()=>{
  const h=setup();
  try{
    assert.equal((await h.call('open',pageSender)).ok,true);
    h.tick(120_001);
    assert.equal((await h.call('claim',workspaceSender)).error.code,'E_FILE_EXPIRED');
    assert.equal((await h.call('claim',workspaceSender)).error.code,'E_FILE_REPLAY');
  }finally{h.gate.dispose();}
});

// A small DOM boundary for the actual entry handler; Chrome messaging is the
// external seam. No file service or trusted authority is installed in this page.
function pageFixture(sendMessage,{site,preferences,loadPreferences,toastFailure=false}={}){
  const nodes=[];
  const {document:doc,window}=parseHTML('<html><body></body></html>');
  Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,
    get(){return this._value??this.querySelector('option')?.value??'';},set(value){this._value=value;}});
  const create=doc.createElement.bind(doc);
  doc.createElement=(...args)=>{
    const node=create(...args),add=node.addEventListener.bind(node);node.handlers={};
    node.addEventListener=(type,fn,...rest)=>{node.handlers[type]=fn;return add(type,fn,...rest);};
    node.click=(isTrusted=true)=>node.handlers.click?.({isTrusted});nodes.push(node);return node;
  };
  const intervals=new Map();let period;
  const win={location:new URL(sourceUrl),setInterval(fn,ms){const id=intervals.size+1;intervals.set(id,fn);if(ms===2500)period=ms;return id;},clearInterval(id){intervals.delete(id);},
    addEventListener(){},removeEventListener(){}};
  win.top=win;
  const handlers=new Map();
  doc.addEventListener=(type,fn)=>{const set=handlers.get(type)||new Set();set.add(fn);handlers.set(type,set);};
  doc.removeEventListener=(type,fn)=>handlers.get(type)?.delete(fn);
  const changes=emitter();let savedPreferences=preferences;
  const api={runtime:{sendMessage,getURL:path=>'chrome-extension://test-extension/'+(path||''),onMessage:emitter()},
    storage:{local:{async get(key){return loadPreferences?loadPreferences(key):{[key]:savedPreferences};}},onChanged:changes}};
  const notifications=[];
  const notify=(options,action)=>{notifications.push({options,action});if(toastFailure)throw Error('toast unavailable');return {shown:action!=='dismiss'};};
  let adapter;
  const bridge=initChatGPTFixedBridgePage({api,doc,win,site:site||{inspect:()=>({ok:false})},
    createConversationAdapter:options=>{nodes.length=0;return adapter=initChatGPTFileIntentPage({...options,notify});}});
  const entry={...adapter,dispose:()=>bridge.dispose()};
  return {entry,ready:entry.ready,root:nodes.find(node=>node.id==='opendesk-chatgpt-files-entry'),
    notifications,
    diagnostic:nodes.find(node=>node.id==='opendesk-project-diagnostics'),
    details:nodes.find(node=>node.id==='opendesk-project-details'),
    toggle:nodes.find(node=>node.id==='opendesk-project-details-toggle'),
    dismiss:nodes.find(node=>node.id==='opendesk-project-dismiss'),
    preferences(value){savedPreferences=value;changes.emit({'opendesk.chatgpt.files.preferences.v1':{newValue:value}},'local');},
    open:nodes.find(node=>node.textContent==='审阅当前对话的文件请求'),
    task:nodes.find(node=>node.id==='opendesk-project-task'),
    start:nodes.find(node=>node.textContent==='处理项目任务'),
    stop:nodes.find(node=>node.textContent==='停止项目任务'),
    generate:nodes.find(node=>node.textContent==='生成任务提示词'),
    prompt:nodes.find(node=>node.id==='opendesk-project-prompt'),
    status:nodes.find(node=>node.className==='status'),
    receipt:nodes.find(node=>node.id==='opendesk-project-receipt'),
    doc,emit:(type,event)=>{for(const fn of handlers.get(type)||[])fn({type,isTrusted:true,button:0,...event});},
    win,tick:()=>{for(const fn of [...intervals.values()])fn();},period:()=>period,
    settle:()=>new Promise(resolve=>setImmediate(resolve))};
}

const turn=(id,text)=>({textContent:text,getAttribute:key=>key==='data-message-id'?id:null,
  compareDocumentPosition:()=>4});
function conversationFixture(reply,options={}){
  const editor={getAttribute(){return null;}},sendButton={getAttribute(){return null;}};
  const snap={ok:true,route:'c/abc12345-1234-1234-1234-abcdef123456',editor,sendButton,
    users:[turn('u0','history')],assistants:[turn('a0','history')],idle:true,busy:false,answerComplete:true,draft:'',rich:false};
  const calls=[],h=pageFixture(message=>{calls.push(message);return reply?.(message)||{ok:true,data:{phase:'completed',resultText:'Native actual bytes',resultStatus:'success'}};},
    {...options,site:{inspect:()=>snap}});
  h.doc.activeElement=editor;
  let index=0;
  const submit=(text,options={})=>{
    snap.draft=text;
    h.emit('keydown',{key:'Enter',target:editor,...options});
    snap.draft='';snap.users.push(turn('u'+(++index),text));snap.assistants.push(turn('a'+index,options.answerText||'complete answer'));
    h.tick();
  };
  return {...h,snap,calls,submit};
}

test('normal native ChatGPT send starts a project task once and shows real inline receipt',async()=>{
  const h=conversationFixture();
  try{
    await h.ready;
    h.submit('读取当前项目 demo.txt，只读不修改');await h.settle();
    assert.deepEqual(h.calls,[{protocol:'opendesk.chatgpt.project.v1',action:'conversation',task:'读取当前项目 demo.txt，只读不修改'}]);
    assert.equal(h.receipt.textContent,'项目：（未提供）\n相对路径：（未提供）\nNative actual bytes');
    h.tick();await h.settle();assert.equal(h.calls.length,1);
  }finally{h.entry.dispose();}
});

for(const form of ['plain','escaped','prose-escaped','fixed-file-prompt'])test('a file demand with a '+form+' Task cannot also start file I/O',async()=>{
  const h=conversationFixture();
  try{
    await h.ready;
    let answerText=JSON.stringify({protocol:'webflow.task.intent.v1',candidateId:'wf-conflict',taskId:'file.read',targetUrl:'https://example.com/',args:{}});
    if(form!=='plain')answerText=answerText.replaceAll('.',String.raw`\u002e`);
    if(form==='prose-escaped')answerText='说明文字中的未配对引号 "\n'+answerText;
    h.submit(form==='fixed-file-prompt'?'只原样返回完整代码块：\n'+JSON.stringify({protocol:'opendesk.workspace.request.v1',requestId:'file-only'}):'读取当前项目 demo.txt，只读不修改',{answerText});
    await h.settle();h.tick();await h.settle();
    assert.equal(h.calls.length,0,'conflicting routes must stop before either transport');
    assert.match(h.status.textContent,/冲突/);
  }finally{h.entry.dispose();}
});

test('conversation navigation clears the previous project receipt and a stopped send cannot resume',async()=>{
  const h=conversationFixture();
  try{
    await h.ready;
    h.submit('读取当前项目 demo.txt，只读');await h.settle();
    assert.equal(h.receipt.hidden,false);
    h.win.location=new URL('https://chatgpt.com/c/other');h.snap.route='c/other';h.tick();
    assert.equal(h.receipt.hidden,true);assert.equal(h.receipt.textContent,'');
    h.snap.draft='读取当前项目 demo.txt，只读';h.emit('click',{target:h.snap.sendButton});
    h.stop.click();h.snap.draft='';h.snap.users.push(turn('u2','读取当前项目 demo.txt，只读'));
    h.snap.assistants.push(turn('a2','complete'));h.tick();await h.settle();
    assert.equal(h.calls.length,1,'stop before the answer must not dispatch any new file task');
  }finally{h.entry.dispose();}
});

test('native Stop during a pending project wake is retained before any further wake',async()=>{
  let release;
  const h=conversationFixture(message=>{
    if(message.action==='wake')return new Promise(resolve=>{release=resolve;});
    return {ok:true,data:{phase:message.action==='stop'?'paused':'watching'}};
  });
  try{
    await h.ready;
    h.submit('修改当前项目 demo.txt 的 status');await h.settle();
    h.tick();await h.settle();assert.equal(h.calls.at(-1).action,'wake');
    h.snap.stopButton={};h.emit('click',{target:h.snap.stopButton});
    release({ok:true,data:{phase:'watching'}});await h.settle();await h.settle();
    h.tick();await h.settle();
    assert.deepEqual(h.calls.map(message=>message.action),['conversation','wake','stop']);
  }finally{h.entry.dispose();}
});

test('history, unsent drafts, synthetic sends, IME, attachments and result packets never initiate a project',async()=>{
  for(const mode of ['history','draft','synthetic','ime','rich','result','ordinary']){
    const h=conversationFixture();
    try{
    await h.ready;
      const task='读取当前项目 demo.txt，只读';
      if(mode==='history'){h.snap.users.push(turn('history-user',task));h.snap.assistants.push(turn('history-answer','answer'));}
      else if(mode==='draft')h.snap.draft=task;
      else if(mode==='synthetic')h.submit(task,{isTrusted:false});
      else if(mode==='ime')h.submit(task,{isComposing:true});
      else if(mode==='rich'){h.snap.rich=true;h.submit(task);}
      else if(mode==='result')h.submit('OpenDesk 文件请求结果 opendesk.workspace.result.v1 读取 demo.txt');
      else h.submit('今天的天气如何');
      h.tick();await h.settle();assert.deepEqual(h.calls,[],mode);
    }finally{h.entry.dispose();}
  }
});

test('normal project send waits for the same complete answer and is cancelled on native Stop or navigation',async()=>{
  for(const mode of ['complete','stop','navigate','draft']){
    const h=conversationFixture();
    try{
    await h.ready;
      h.snap.busy=true; // Set busy after the witnessed gesture, before observation.
      h.snap.busy=false;h.snap.draft='修改当前项目 demo.txt 的 status';
      h.emit('click',{target:h.snap.sendButton});h.snap.draft='';
      h.snap.users.push(turn('u1','修改当前项目 demo.txt 的 status'));
      h.snap.assistants.push(turn('a1','partial'));h.snap.busy=true;h.snap.idle=false;h.snap.answerComplete=false;
      h.tick();await h.settle();assert.equal(h.calls.length,0);
      if(mode==='stop'){h.snap.stopButton={};h.emit('click',{target:h.snap.stopButton});}
      if(mode==='navigate'){h.win.location=new URL('https://chatgpt.com/c/other');h.snap.route='c/other';}
      h.snap.busy=false;h.snap.idle=true;h.snap.answerComplete=true;
      if(mode==='draft')h.snap.draft='user draft must stay';
      h.tick();await h.settle();
      assert.equal(h.calls.length,mode==='complete'||mode==='draft'?1:0,mode);
      assert.equal(h.snap.draft,mode==='draft'?'user draft must stay':'');
    }finally{h.entry.dispose();}
  }
});

test('entry reports synchronous messaging failure instead of staying locked',async()=>{
  let calls=0;
  const h=pageFixture(()=>{calls++;throw new Error('Extension context invalidated.');});
  try{
    await h.ready;
    assert.doesNotThrow(()=>h.open.click());
    await h.settle();
    assert.equal(h.open.disabled,false);
    assert.match(h.status.textContent,/E_FILE_HANDOFF/);
    assert.match(h.status.textContent,/刷新/);
    assert.equal(calls,1); // No automatic retry of an uncertain handoff.
  }finally{h.entry.dispose();}
});

test('entry requires a trusted click and ignores duplicate clicks while opening',async()=>{
  let calls=0,reply;
  const h=pageFixture(message=>{
    calls++;
    assert.deepEqual(message,{protocol:CHATGPT_FILE_INTENT_PROTOCOL,kind:'open',pathHint:''});
    return new Promise(resolve=>{reply=resolve;});
  });
  try{
    await h.ready;
    h.open.click(false);await h.settle();assert.equal(calls,0);
    h.open.click();h.open.click();await h.settle();
    assert.equal(calls,1);assert.equal(h.open.disabled,true);
    reply({ok:true,data:{opened:true}});await h.settle();
    assert.equal(h.open.disabled,false);
    assert.match(h.status.textContent,/已打开/);
  }finally{h.entry.dispose();}
});

test('entry retirement before deferred messaging does not open a late review page',async()=>{
  let calls=0;
  const h=pageFixture(()=>{calls++;return {ok:true,data:{opened:true}};});
  await h.ready;h.open.click();h.entry.dispose();await h.settle();
  assert.equal(calls,0);
});

const projectProtocol='opendesk.chatgpt.project.v1';
test('two trusted project tasks with an existing grant never open settings',async()=>{
  const calls=[];
  const h=pageFixture(message=>{calls.push(message);return {ok:true,data:{needsConnection:false,message:'任务已处理',phase:'watching',delivery:'ready',observed:false}};});
  try{
    await h.ready;
    h.task.value='读取项目 README';h.start.click(false);await h.settle();assert.equal(calls.length,0);
    h.start.click();await h.settle();
    h.task.value='修改项目标题';h.start.click();await h.settle();
    assert.deepEqual(calls,[{protocol:projectProtocol,action:'start',task:'读取项目 README'},
      {protocol:projectProtocol,action:'start',task:'修改项目标题'}]);
    assert.match(h.status.textContent,/任务已处理/);
    assert.equal(h.root.hidden,false,'the task feedback remains visible without diagnostics');
  }finally{h.entry.dispose();}
});

test('only a start needing connection opens one trusted page, never a wake or duplicate click',async()=>{
  const calls=[];let resolveStart;
  const h=pageFixture(message=>{
    calls.push(message);
    if(message.action==='start')return new Promise(resolve=>{resolveStart=resolve;});
    return {ok:true,data:{needsConnection:true,phase:'watching',message:'等待连接'}};
  });
  try{
    await h.ready;
    h.task.value='打开当前项目说明';h.start.click();h.start.click();await h.settle();
    assert.equal(calls.length,1);
    resolveStart({ok:true,data:{needsConnection:true,phase:'watching',message:'首次连接'}});await h.settle();
    assert.deepEqual(calls[1],{protocol:CHATGPT_FILE_INTENT_PROTOCOL,kind:'open',pathHint:''});
    h.tick();await h.settle();h.tick();await h.settle();
    assert.equal(calls.filter(message=>message.kind==='open').length,1);
    assert.equal(calls.filter(message=>message.action==='wake').length,2);
    assert.equal(h.period(),2500);
  }finally{h.entry.dispose();}
});

test('pure task prompt generation and idle intervals send no messages',async()=>{
  const calls=[];const h=pageFixture(message=>{calls.push(message);});
  try{
    await h.ready;
    h.task.value='为项目增加本地搜索';h.generate.click();h.tick();await h.settle();
    assert.match(h.prompt.value,/为项目增加本地搜索/);
    assert.equal(h.prompt.readOnly,true);
    assert.doesNotMatch(h.prompt.value,/bindingId|requestId|workspaceId|opendesk[.-]/);
    assert.deepEqual(calls,[]);
    h.task.value=' ';h.start.click();await h.settle();assert.equal(calls.length,0);
  }finally{h.entry.dispose();}
});

test('trusted stop ends page wakes without sending ChatGPT messages',async()=>{
  const calls=[];const h=pageFixture(message=>{calls.push(message);return {ok:true,data:{phase:message.action==='stop'?'paused':'watching',message:'租约有效'}};});
  try{
    await h.ready;
    h.task.value='检查项目';h.start.click();await h.settle();
    h.stop.click(false);await h.settle();assert.equal(calls.length,1);
    h.tick();await h.settle();h.stop.click();await h.settle();h.tick();await h.settle();
    assert.deepEqual(calls.map(message=>message.action),['start','wake','stop']);
    assert.equal(h.stop.disabled,true);
  }finally{h.entry.dispose();}
});

test('navigation before the next interval cannot stop a different conversation task',async()=>{
  const calls=[];const h=pageFixture(message=>{calls.push(message);return {ok:true,data:{phase:'watching'}};});
  try{
    await h.ready;
    h.task.value='检查项目';h.start.click();await h.settle();
    h.win.location=new URL('https://chatgpt.com/c/different');
    h.stop.click();await h.settle();h.tick();await h.settle();
    assert.equal(calls.length,1);
    assert.equal(h.stop.disabled,true);
  }finally{h.entry.dispose();}
});

test('synchronous project messaging throw clears pending state and never retries',async()=>{
  let calls=0;const h=pageFixture(()=>{calls++;throw new Error('Extension context invalidated.');});
  try{
    await h.ready;
    h.task.value='检查项目';assert.doesNotThrow(()=>h.start.click());await h.settle();
    assert.equal(h.start.disabled,false);assert.match(h.status.textContent,/E_PROJECT_TASK/);
    h.tick();await h.settle();assert.equal(calls,1);
  }finally{h.entry.dispose();}
});

test('retired or navigated project start cannot open a late project connection page',async()=>{
  for(const retire of [h=>h.entry.dispose(),h=>{h.win.location=new URL('https://chatgpt.com/c/another');}]){
    const calls=[];let resolve;
    const h=pageFixture(message=>{calls.push(message);return new Promise(done=>{resolve=done;});});
    await h.ready;h.task.value='检查项目';h.start.click();await h.settle();retire(h);
    resolve({ok:true,data:{needsConnection:true,phase:'watching'}});await h.settle();h.tick();await h.settle();
    assert.equal(calls.length,1);h.entry.dispose();
  }
});

test('uncertain project handoff is attempted once and unlocks controls without retry',async()=>{
  const calls=[];
  const h=pageFixture(message=>{
    calls.push(message);
    if(message.kind==='open')throw new Error('Extension context invalidated.');
    return {ok:true,data:{needsConnection:true,phase:'watching'}};
  });
  try{
    await h.ready;
    h.task.value='检查项目';h.start.click();await h.settle();
    assert.equal(h.start.disabled,false);assert.equal(h.open.disabled,false);
    assert.match(h.status.textContent,/E_PROJECT_TASK/);
    h.tick();h.tick();await h.settle();
    assert.deepEqual(calls,[{protocol:projectProtocol,action:'start',task:'检查项目'},
      {protocol:CHATGPT_FILE_INTENT_PROTOCOL,kind:'open',pathHint:''}]);
  }finally{h.entry.dispose();}
});

test('synchronous wake or stop failures release pending state and disable automatic retries',async()=>{
  for(const action of ['wake','stop']){
    const calls=[];
    const h=pageFixture(message=>{
      calls.push(message);
      if(message.action===action)throw Object.assign(new Error('项目租约已失效'),{code:'E_PROJECT_LEASE'});
      return {ok:true,data:{phase:'watching',message:'等待项目结果'}};
    });
    try{
    await h.ready;
      h.task.value='检查项目';h.start.click();await h.settle();
      if(action==='wake')h.tick();else h.stop.click();
      await h.settle();
      assert.equal(h.start.disabled,false);assert.equal(h.open.disabled,false);
      assert.match(h.status.textContent,/E_PROJECT_LEASE.*租约已失效/);
      h.tick();h.tick();await h.settle();
      assert.deepEqual(calls.map(message=>message.action),['start',action]);
    }finally{h.entry.dispose();}
  }
});

test('observing the read result keeps waking until the project reaches its final phase',async()=>{
  const calls=[];
  const states=[
    {phase:'watching',observed:false,message:'等待读取结果'},
    {phase:'watching',observed:true,message:'读取结果已收到，等待模型提交修改'},
    {phase:'dispatching',observed:true,message:'正在保存修改'},
    {phase:'confirmed',observed:true,message:'已保存，等待最终回执'},
    {phase:'completed',observed:false,message:'项目任务已完成'}
  ];
  const h=pageFixture(message=>{calls.push(message);return {ok:true,data:states.shift()};});
  try{
    await h.ready;
    h.task.value='读取 README 后修改标题';h.start.click();await h.settle();
    h.tick();await h.settle();
    assert.match(h.status.textContent,/等待模型提交修改/);
    h.tick();await h.settle();
    assert.deepEqual(calls.map(message=>message.action),['start','wake','wake'],
      'observed read data does not complete a project still awaiting its write');
    assert.match(h.status.textContent,/正在保存修改/);
    h.tick();await h.settle();
    assert.match(h.status.textContent,/等待最终回执/);
    h.tick();await h.settle();
    assert.match(h.status.textContent,/项目任务已完成/);
    h.tick();await h.settle();
    assert.deepEqual(calls.map(message=>message.action),['start','wake','wake','wake','wake']);
  }finally{h.entry.dispose();}
});

test('a nonfinal start with observed read data remains active',async()=>{
  const calls=[];
  const h=pageFixture(message=>{
    calls.push(message);
    return {ok:true,data:{phase:'watching',observed:true,message:'等待写入提案'}};
  });
  try{
    await h.ready;
    h.task.value='继续修改项目文件';h.start.click();await h.settle();
    h.tick();await h.settle();
    assert.deepEqual(calls,[{protocol:projectProtocol,action:'start',task:'继续修改项目文件'},
      {protocol:projectProtocol,action:'wake'}]);
  }finally{h.entry.dispose();}
});

test('an explicit completed phase stops page wakes even when observed is false',async()=>{
  const calls=[];
  const h=pageFixture(message=>{
    calls.push(message);
    return {ok:true,data:{phase:'completed',observed:false,message:'项目任务已完成'}};
  });
  try{
    await h.ready;
    h.task.value='完成项目任务';h.start.click();await h.settle();
    h.tick();await h.settle();h.tick();await h.settle();
    assert.deepEqual(calls,[{protocol:projectProtocol,action:'start',task:'完成项目任务'}]);
    assert.match(h.status.textContent,/项目任务已完成/);
  }finally{h.entry.dispose();}
});


test('idle file UI is hidden by default and diagnostics display never changes file handling',async()=>{
  const h=conversationFixture();
  try{
    await h.ready;assert.equal(h.root.hidden,true);assert.equal(h.diagnostic.hidden,true);
    h.preferences({enabled:true,diagnosticsVisible:true});assert.equal(h.root.hidden,false);assert.equal(h.diagnostic.hidden,false);
    h.preferences({enabled:true,diagnosticsVisible:false});assert.equal(h.root.hidden,true);
    h.submit('读取当前项目 demo.txt，只读');await h.settle();
    assert.equal(h.calls.length,1);assert.equal(h.root.hidden,false);assert.equal(h.diagnostic.hidden,true);
    assert.equal(h.details.hidden,true,'receipt content is available on demand');
    h.dismiss.click();assert.equal(h.root.hidden,true);
  }finally{h.entry.dispose();}
});

test('disabled file processing and re-enable discard an in-progress witnessed turn without replay',async()=>{
  const h=conversationFixture();
  try{
    await h.ready;
    h.snap.draft='读取当前项目 demo.txt';h.emit('click',{target:h.snap.sendButton});
    h.preferences({enabled:false,diagnosticsVisible:false});
    h.snap.draft='';h.snap.users.push(turn('u1','读取当前项目 demo.txt'));h.snap.assistants.push(turn('a1','done'));
    h.tick();await h.settle();assert.equal(h.calls.length,0);
    h.submit('读取当前项目 demo.txt，只读');await h.settle();assert.equal(h.calls.length,0);
    h.preferences({enabled:true,diagnosticsVisible:false});h.tick();await h.settle();assert.equal(h.calls.length,0);
    h.submit('读取当前项目 demo.txt，再次只读');await h.settle();assert.equal(h.calls.length,1);
  }finally{h.entry.dispose();}
});

test('the visible file Stop remains usable during a pending dispatch and retains its stop request',async()=>{
  let release;const h=conversationFixture(message=>message.action==='conversation'?new Promise(resolve=>{release=resolve;}):{ok:true,data:{phase:'paused'}});
  try{
    await h.ready;h.submit('修改当前项目 demo.txt');await h.settle();
    assert.equal(h.root.hidden,false);assert.equal(h.stop.disabled,false);h.stop.click();
    release({ok:true,data:{phase:'watching'}});await h.settle();await h.settle();
    h.tick();await h.settle();assert.deepEqual(h.calls.map(x=>x.action),['conversation','stop']);
  }finally{h.entry.dispose();}
});

test('failure and unknown are visible terminal outcomes, while read success does not claim model delivery',async()=>{
  for(const status of ['success','error','unknown']){
    const h=conversationFixture(()=>({ok:true,data:{phase:'completed',resultStatus:status,result:{operation:'read',status,path:'demo.txt',
      data:status==='success'?{content:'actual bytes',sha256:'abc'}:null,
      error:status==='success'?null:{code:'E_IO',message:'disk error',outcome:status==='unknown'?'OUTCOME_UNKNOWN':'NOT_DISPATCHED'}}}}));
    try{
      await h.ready;h.submit('读取当前项目 demo.txt，只读');await h.settle();
      assert.equal(h.root.hidden,false);assert.match(h.status.textContent,status==='success'?/本机|未发送/:status==='unknown'?/未知/:/失败/);
      const notice=h.notifications.filter(row=>row.action!=='dismiss').at(-1).options;
      assert.equal(notice.duration,status==='success'?8000:0);
      assert.equal(notice.countdown,status==='success');
      assert.doesNotMatch(h.status.textContent,/已成功完成/);
    }finally{h.entry.dispose();}
  }
});

test('completed read receipts remain accessible without repeating file operations or exposing bytes in toast',async()=>{
  const packet={phase:'watching',projectConnection:{name:'示例项目'},resultPacketId:'read-new-1',result:{resultId:'read-new-1',operation:'read',status:'success',path:'docs/demo.txt',data:{content:'private long file bytes'}}};
  const h=conversationFixture(()=>({ok:true,data:packet}));
  try{
    await h.ready;h.submit('读取当前项目 demo.txt，只读');await h.settle();
    const notices=()=>h.notifications.filter(row=>row.action!=='dismiss');
    const count=notices().length;
    h.tick();await h.settle();h.tick();await h.settle();
    assert.equal(notices().length,count,'polling cannot reset a countdown or revive a dismissed notice');
    assert.ok(notices().every(row=>!row.options.message.includes('private long file bytes')));
    packet.phase='completed';h.tick();await h.settle();
    assert.equal(notices().length,count,'same packet reaching completed does not replace its notification');
    assert.equal(h.root.hidden,false);assert.equal(h.diagnostic.hidden,true);assert.equal(h.details.hidden,true);
    const calls=h.calls.length;
    h.toggle.click();assert.equal(h.details.hidden,false);assert.match(h.receipt.textContent,/项目：示例项目\n相对路径：docs\/demo\.txt/);assert.match(h.receipt.textContent,/private long file bytes/);
    h.toggle.click();assert.equal(h.details.hidden,true);
    h.dismiss.click();assert.equal(h.root.hidden,true);
    h.tick();await h.settle();assert.equal(h.root.hidden,true);assert.equal(h.calls.length,calls);
    h.preferences({enabled:true,diagnosticsVisible:true});
    assert.equal(h.root.hidden,false);assert.match(h.receipt.textContent,/private long file bytes/);
    assert.equal(notices().length,count,'diagnostics never reannounce old packets');
  }finally{h.entry.dispose();}
});

test('a completed status without a result does not keep the receipt entry visible',async()=>{
  const h=conversationFixture(()=>({ok:true,data:{phase:'completed',message:'普通状态'}}));
  try{
    await h.ready;h.submit('读取当前项目 demo.txt，只读');await h.settle();
    assert.equal(h.root.hidden,true);assert.equal(h.diagnostic.hidden,true);
  }finally{h.entry.dispose();}
});

test('unverified writes remain persistent warnings and only a verified save announces success',async()=>{
  for(const verified of [false,true]){
    const h=conversationFixture(()=>({ok:true,data:{phase:'completed',result:{resultId:'write-new',operation:'write',status:'success',path:'demo.txt',data:{saved:true,readBackVerified:verified}}}}));
    try{
      await h.ready;h.submit('修改当前项目 demo.txt 的第二行');await h.settle();
      const notice=h.notifications.filter(row=>row.action!=='dismiss').at(-1).options;
      assert.equal(notice.duration,verified?8000:0);
      assert.equal(notice.variant,verified?'success':'warning');
      assert.equal(notice.message.includes('已保存'),verified);
    }finally{h.entry.dispose();}
  }
});

test('write receipt exposes local before, proposal and independent readback without inventing missing content',async()=>{
  const packet={phase:'completed',result:{resultId:'comparison',operation:'write',status:'success',path:'demo.txt',data:{saved:true,readBackVerified:true}},
    comparison:{before:'original <text>',proposed:'',readBack:'disk content'}};
  const h=conversationFixture(()=>({ok:true,data:packet}));
  try{
    await h.ready;h.submit('修改当前项目 demo.txt 的第二行');await h.settle();
    assert.equal(h.root.hidden,false);assert.equal(h.details.hidden,true);
    h.toggle.click();assert.equal(h.details.hidden,false);
    assert.match(h.receipt.textContent,/修改前：\noriginal <text>/);
    assert.match(h.receipt.textContent,/提案后：\n（空文件）/);
    assert.match(h.receipt.textContent,/独立读回：\ndisk content/);
    assert.ok(h.notifications.every(row=>!row.options.message?.includes('disk content')));
    h.dismiss.click();h.tick();await h.settle();assert.equal(h.root.hidden,true);
  }finally{h.entry.dispose();}
  delete packet.comparison;
  const missing=conversationFixture(()=>({ok:true,data:packet}));
  try{
    await missing.ready;missing.submit('修改当前项目 demo.txt 的第二行');await missing.settle();
    assert.match(missing.receipt.textContent,/项目：（未提供）\n相对路径：demo\.txt/);
    assert.match(missing.receipt.textContent,/独立读回：\n（未提供）/);
  }finally{missing.entry.dispose();}
});

test('reconciled unknown write labels current bytes without claiming the original receipt',async()=>{
  const h=conversationFixture(()=>({ok:true,data:{phase:'completed',result:{resultId:'reconciled',operation:'write',path:'demo.txt',status:'unknown',
    error:{code:'E_FILE_RECONCILED',message:'当前内容已匹配目标 SHA；原回执仍未知',outcome:'OUTCOME_UNKNOWN'}},
    comparison:{readBack:'actual disk bytes'}}}));
  try{
    await h.ready;h.submit('修改当前项目 demo.txt');await h.settle();
    h.toggle.click();assert.match(h.receipt.textContent,/当前读回（原回执仍未知）：\nactual disk bytes/);
    assert.match(h.receipt.textContent,/状态：结果未知/);
    assert.doesNotMatch(h.receipt.textContent,/独立读回通过：true|状态：成功/);
  }finally{h.entry.dispose();}
});

test('separate tasks notify the same ordinary error while never replaying either request',async()=>{
  const h=conversationFixture(()=>{throw new Error('same failure');});
  try{
    await h.ready;h.submit('读取当前项目 first.txt');await h.settle();
    h.submit('读取当前项目 second.txt');await h.settle();
    const errors=h.notifications.filter(row=>row.options.message?.includes('same failure'));
    assert.equal(errors.length,2);assert.equal(h.calls.length,2);
    h.tick();await h.settle();assert.equal(h.calls.length,2);
  }finally{h.entry.dispose();}
});

test('toast failure never replays file actions; disposal dismisses only the owned notification',async()=>{
  const h=conversationFixture(undefined,{toastFailure:true});
  await h.ready;h.submit('读取当前项目 demo.txt，只读');await h.settle();
  h.tick();await h.settle();assert.equal(h.calls.length,1);
  assert.equal(h.root.hidden,false,'unavailable notification retains a fixed fallback for the real receipt');
  h.entry.dispose();assert.equal(h.notifications.at(-1).action,'dismiss');
  assert.equal(h.notifications.at(-1).options.id,'chatgpt-files');
});

test('stored disabled state is restored before gestures and a stale initial read cannot override a newer setting',async()=>{
  const h=conversationFixture(undefined,{preferences:{enabled:false,diagnosticsVisible:true}});
  try{
    h.submit('读取当前项目 demo.txt，只读');await h.ready;await h.settle();assert.equal(h.calls.length,0);
    assert.equal(h.diagnostic.hidden,false);
    h.preferences({enabled:true,diagnosticsVisible:false});h.tick();await h.settle();assert.equal(h.calls.length,0);
    h.submit('读取当前项目 demo.txt，新的请求');await h.settle();assert.equal(h.calls.length,1);
  }finally{h.entry.dispose();}
  const next=conversationFixture(undefined,{preferences:{enabled:true,diagnosticsVisible:true}});
  try{
    next.preferences({enabled:false,diagnosticsVisible:false});await next.ready;
    next.submit('读取当前项目 demo.txt，只读');await next.settle();assert.equal(next.calls.length,0);assert.equal(next.root.hidden,true);
  }finally{next.entry.dispose();}
});

test('malformed preference changes stop admission and never overwrite a user draft',async()=>{
  const h=conversationFixture();
  try{
    await h.ready;h.snap.draft='已有草稿，不应覆盖';
    assert.doesNotThrow(()=>h.preferences({enabled:'true'}));
    h.tick();await h.settle();assert.equal(h.snap.draft,'已有草稿，不应覆盖');
    h.submit('读取当前项目 demo.txt，只读');await h.settle();assert.equal(h.calls.length,0);
    assert.equal(h.root.hidden,true);assert.match(h.notifications.at(-1).options.message,/设置无效/);
  }finally{h.entry.dispose();}
});

test('a malformed change invalidates a pending initial preference read and its late error',async()=>{
  for(const fail of [false,true]){
    let resolve,reject;
    const h=conversationFixture(undefined,{loadPreferences:()=>new Promise((yes,no)=>{resolve=yes;reject=no;})});
    try{
      await h.settle();h.preferences({enabled:'broken'});
      if(fail)reject(new Error('stale read failure'));else resolve({'opendesk.chatgpt.files.preferences.v1':{enabled:true,diagnosticsVisible:true}});
      await h.ready;h.submit('读取当前项目 demo.txt，只读');await h.settle();
      assert.equal(h.calls.length,0);assert.match(h.status.textContent,/设置无效/);assert.equal(h.diagnostic.hidden,true);
    }finally{h.entry.dispose();}
  }
});

test('project Stop fences a valid pending edit across background ticks and controller restart',async t=>{
  for(const stop of [false,true])await t.test(stop?'stopped':'live control',async()=>{
    const workspaceId='workspace-11111111-1111-1111-1111-111111111111';
    const ledger={},calls=[];
    let content='safe original\n',answer='',turnKey='turn-1',observed=false;
    const sha=value=>createHash('sha256').update(value).digest('hex');
    const owner={...workspaceSender,url:'chrome-extension://test-extension/'+CHATGPT_FILES_PAGE};
    const source={tabId:7,windowId:3,documentId:pageSender.documentId,url:sourceUrl};
    const api={runtime:{id:'test-extension',getURL:path=>'chrome-extension://test-extension/'+path},
      storage:{local:{async get(key){return {[key]:structuredClone(ledger[key])};},
        async set(value){Object.assign(ledger,structuredClone(value));}}},
      tabs:{async get(){return {...pageSender.tab,url:sourceUrl};}},
      webNavigation:{async getFrame(){return {url:sourceUrl,documentId:source.documentId,documentLifecycle:'active'};}}};
    const files={state:()=>({connected:true,sessionId:'native-session-123456',devLeaseEpoch:1}),
      async request(method,params){
        calls.push(method);
        if(method==='workspaces.list')return {workspaces:[{workspaceId,name:'stop-project',access:'read-write',sourceId:'',leaseEpoch:''}]};
        assert.equal(params.workspaceId,workspaceId);assert.equal(params.path,'demo.txt');
        if(method==='files.write'){
          assert.equal(params.expectedSha256,sha(content));content=params.content;
          return {workspaceId,path:params.path,saved:true,sha256:sha(content),bytes:Buffer.byteLength(content)};
        }
        assert.equal(method,'files.read');
        return {workspaceId,path:params.path,content,sha256:sha(content),bytes:Buffer.byteLength(content)};
      }};
    const options={api,files,readAnswer:async()=>({url:sourceUrl,turnKey,answerKey:'answer-1',
      answerComplete:true,resultObserved:observed,blocks:[answer]}),fillComposer:async()=>({filled:true,sent:false})};
    let controller=createChatGPTFilesController(options);
    try{
      await controller.claim({source,workspaceTab:owner.tab},owner);
      await controller.projectTask({task:'修改 stop-project 项目的 demo.txt，将内容改为 safe modified'},pageSender);
      const active=await controller.handle({protocol:CHATGPT_FILES_PROTOCOL,action:'connect-project',workspaceId},owner);
      assert.equal(active.delivery,'filled');assert.equal(calls.filter(method=>method==='files.read').length,1);
      const result=JSON.parse(active.resultText.slice(active.resultText.indexOf('{')));
      assert.ok(result.editProposal,'a real read must supply the pending edit identity');
      answer=JSON.stringify({...result.editProposal,content:'safe modified\n'});turnKey='turn-2';observed=true;
      assert.equal(calls.filter(method=>method==='files.write').length,0);
      if(stop){
        const paused=await controller.projectStop(pageSender);
        assert.equal(paused.automation.phase,'paused');assert.equal(paused.automation.active,false);
      }
      const before=calls.length;
      await controller.tick();await controller.tick();
      if(stop){
        assert.deepEqual(calls.slice(before),[],'Stop prevents new file dispatch, including reads');
        controller.dispose();controller=createChatGPTFilesController(options);
        await controller.tick();await controller.tick();
        assert.deepEqual(calls.slice(before),[],'restoring a stopped task cannot revive file effects');
        assert.equal(content,'safe original\n');
        assert.equal((await controller.projectStatus(pageSender)).automation.phase,'paused');
      }else{
        assert.equal(content,'safe modified\n','the same eligible edit writes without Stop');
        assert.equal(calls.filter(method=>method==='files.write').length,1);
      }
    }finally{controller.dispose();}
  });
});


test('page local prompt generation remains available during a pending project start',async()=>{
  const calls=[];let release;
  const h=pageFixture(message=>{
    calls.push(message);return new Promise(resolve=>{release=resolve;});
  });
  try{
    await h.ready;
    h.task.value='检查项目';h.start.click();await h.settle();
    assert.equal(h.start.disabled,true);assert.equal(typeof release,'function');
    h.task.value='只整理任务描述，不派发第二个任务';h.generate.click();await h.settle();
    assert.equal(h.generate.disabled,false);
    assert.match(h.prompt.value,/只整理任务描述，不派发第二个任务/);
    assert.deepEqual(calls,[{protocol:projectProtocol,action:'start',task:'检查项目'}]);
    release({ok:true,data:{phase:'completed'}});await h.settle();h.tick();await h.settle();
    assert.match(h.prompt.value,/只整理任务描述，不派发第二个任务/);
    assert.equal(calls.length,1);
  }finally{h.entry.dispose();}
});
