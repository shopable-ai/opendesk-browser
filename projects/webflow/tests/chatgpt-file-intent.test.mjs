import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseHTML} from 'linkedom';
import {initChatGPTFixedBridgePage} from '../trusted/chatgpt-bridge-page.js';
import {createChatGPTFilesController,CHATGPT_FILES_PROTOCOL,CHATGPT_FILES_PAGE}
  from '../trusted/chatgpt-files-controller.js';
import {normalizeChatGPTFileHint,assertLockedChatGPTFileRequest,
  installChatGPTFileIntentGate,CHATGPT_FILE_INTENT_PROTOCOL} from '../trusted/chatgpt-file-intent-gate.js';
import {installChatGPTFilesService} from '../trusted/chatgpt-files-service.js';
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
function setup({tab={},frame={}}={}){
  const messages=emitter(),history=emitter(),committed=emitter(),removed=emitter();
  let created=0,now=1000,frameUrl=sourceUrl,frameDocument='document-a';
  const api={
    runtime:{id:'test-extension',getURL:path=>'chrome-extension://test-extension/'+path,
      onMessage:messages},
    tabs:{onRemoved:removed,
      async get(id){assert.equal(id,7);return {id,windowId:3,url:frameUrl,incognito:false,...tab};},
      async create(options){created++;assert.equal(options.url,workspaceUrl);
        assert.equal(options.windowId,3);assert.equal(options.openerTabId,7);
        return {id:51,windowId:3};}},
    webNavigation:{onCommitted:committed,onHistoryStateUpdated:history,
      async getFrame({tabId,frameId}){assert.equal(tabId,7);assert.equal(frameId,0);
        return {url:frameUrl,documentId:frameDocument,documentLifecycle:'active',...frame};}}
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

test('same-document SPA from the official homepage opens and claims the live conversation',async()=>{
  const h=setup(),url='https://chatgpt.com/c/6af02448-0cb8-83ec-88bc-b8c6aa809310';
  try{
    h.navigate(url);
    h.history.emit({tabId:7,frameId:0});
    const sender={...pageSender,url:'https://chatgpt.com/'};
    assert.deepEqual(await h.call('open',sender,{pathHint:'demo.txt'}),{ok:true,data:{opened:true}});
    assert.equal(h.created(),1);
    const claimed=await h.call('claim',workspaceSender);
    assert.equal(claimed.ok,true);
    assert.deepEqual(claimed.data.source,{tabId:7,documentId:'document-a',url,
      conversationId:'6af02448-0cb8-83ec-88bc-b8c6aa809310',windowId:3});
    assert.equal(claimed.data.pathHint,'demo.txt');
    assert.equal((await h.call('claim',workspaceSender)).error.code,'E_FILE_REPLAY');
  }finally{h.gate.dispose();}
});

test('SPA admission preserves sender identity and live source checks',async t=>{
  const homepage={...pageSender,url:'https://chatgpt.com/'};
  const cases=[
    {name:'foreign extension',sender:{id:'foreign'},code:'E_FILE_SENDER'},
    {name:'child sender frame',sender:{frameId:1},code:'E_FILE_SENDER'},
    {name:'missing document',sender:{documentId:undefined},code:'E_FILE_SENDER'},
    {name:'stale document',sender:{documentId:'document-old'}},
    {name:'incognito sender',sender:{tab:{...pageSender.tab,incognito:true}},code:'E_FILE_SENDER'},
    {name:'missing sender tab',sender:{tab:undefined},code:'E_FILE_SENDER'},
    ...['https://example.com/','https://chatgpt.com.evil.test/',
      'http://chatgpt.com/','https://user:pass@chatgpt.com/','invalid'].map(url=>
      ({name:`untrusted sender ${url}`,sender:{url},code:'E_FILE_SENDER'})),
    {name:'live homepage',tab:{url:'https://chatgpt.com/'},frame:{url:'https://chatgpt.com/'}},
    {name:'live foreign origin',tab:{url:'https://example.com/c/abc12345'},frame:{url:'https://example.com/c/abc12345'}},
    {name:'replaced live document',frame:{documentId:'document-new'}},
    {name:'child live frame',frame:{frameId:1}},
    {name:'inactive live document',frame:{documentLifecycle:'cached'}},
    {name:'frame error',frame:{errorOccurred:true}},
    {name:'tab and frame disagree',tab:{url:'https://chatgpt.com/c/another'}},
    {name:'pending navigation',tab:{pendingUrl:'https://chatgpt.com/c/another'}},
    {name:'incognito live tab',tab:{incognito:true}},
    {name:'wrong live tab',tab:{id:8}},
    {name:'missing live window',tab:{windowId:undefined}}
  ];
  for(const item of cases)await t.test(item.name,async()=>{
    const h=setup(item);
    try{
      const result=await h.call('open',{...homepage,...item.sender});
      assert.equal(result.ok,false);
      assert.equal(result.error.code,item.code||'E_FILE_SOURCE');
      assert.equal(h.created(),0);
    }finally{h.gate.dispose();}
  });
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
    restore:nodes.find(node=>node.id==='opendesk-project-restore'),
    panel:nodes.find(node=>node.id==='opendesk-project-panel'),
    feedback:nodes.find(node=>node.id==='opendesk-project-feedback'),
    card:nodes.find(node=>node.tagName==='SECTION'&&node.classList.contains('card')),
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

// Exercise the original native-send/discovery fixture with actual reader DOM.
// The reader is called directly in ISOLATED in production, so bind its globals
// only for the lifetime of this fixture (never replace the reader with a spy).
async function withFixedConversation(reply,run){
  const h=conversationFixture(reply||(()=>({ok:true,data:{status:'completed',phase:'completed'}}))),saved=new Map();
  for(const key of ['document','location','__opendeskWorkspaceChatV1'])saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
  Object.defineProperty(globalThis,'document',{configurable:true,value:h.doc});
  Object.defineProperty(globalThis,'location',{configurable:true,get:()=>h.win.location});
  delete globalThis.__opendeskWorkspaceChatV1;
  const message=(role,text,id)=>{
    const node=h.doc.createElement('div');node.setAttribute('data-message-author-role',role);node.setAttribute('data-message-id',id);
    node.textContent=text;
    // linkedom's innerText collapses whitespace unlike the browser fixture's
    // explicit rendered content. Preserve the exact witnessed UTF-8 here.
    if(role==='user')Object.defineProperty(node,'innerText',{configurable:true,get:()=>node.textContent});
    if(role==='assistant'){
      if(text.startsWith('{"protocol"')){
        node.textContent='';const pre=h.doc.createElement('pre'),code=h.doc.createElement('code');
        code.className=text.includes('opendesk.workspace.edit.v1')?'language-opendesk-edit':'language-opendesk-request';
        code.textContent=text;pre.append(code);node.append(pre);
      }
      const actions=h.doc.createElement('div');actions.setAttribute('data-assistant-message-actions','');node.append(actions);
    }
    h.doc.body.append(node);return node;
  };
  h.snap.users=[message('user','history','u0')];h.snap.assistants=[message('assistant','history','a0')];
  let turnIndex=0;
  const submit=(text,answerText=text,renderedUserText=text)=>{
    h.snap.draft=text;h.emit('keydown',{key:'Enter',target:h.snap.editor});h.snap.draft='';
    turnIndex++;const user=message('user',renderedUserText,'u'+turnIndex),answer=message('assistant',answerText,'a'+turnIndex);
    h.snap.users.push(user);h.snap.assistants.push(answer);h.tick();return {user,answer};
  };
  try{await h.ready;await run({...h,submit});}
  finally{h.entry.dispose();for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
}
const fixedRead='  请原样回显：\n'+JSON.stringify({protocol:'opendesk.workspace.request.v1',requestId:'req-fixed',bindingId:'binding',workspaceId:'workspace',operation:'read',path:'demo.txt'})+'\n';
const fixedEdit='\n'+JSON.stringify({protocol:'opendesk.workspace.edit.v1',requestId:'edit-fixed',bindingId:'binding',workspaceId:'workspace',path:'demo.txt',baseSha256:'a'.repeat(64),content:'正文\n'})+'  ';
const digest=text=>createHash('sha256').update(text,'utf8').digest('hex');
for(const [name,text] of [['read',fixedRead],['edit',fixedEdit]])test('original bridge forwards witnessed fixed '+name+' through the shared reader',async()=>{
  await withFixedConversation(undefined,async h=>{
    const {answer}=h.submit(text);await settleFixed(h,()=>h.calls.length===1);
    assert.equal(h.calls.length,1,'fixed discovery must reach the existing transport: '+h.status.textContent);
    const event=h.calls[0];
    assert.deepEqual(Object.keys(event).sort(),['protocol','action','readerEpoch','turnKey','answerKey','userSha256','answerSha256'].sort());
    assert.equal(event.protocol,'opendesk.chatgpt.project.v1');assert.equal(event.action,'fixed-complete');
    assert.equal(typeof event.readerEpoch,'string');assert.ok(event.readerEpoch);
    assert.equal(event.userSha256,digest(text));assert.equal(event.answerSha256,digest(answer.textContent));
    assert.ok(event.turnKey);assert.ok(event.answerKey);
    h.tick();await h.settle();assert.equal(h.calls.length,1,'fixed events never wake a natural project');
  });
});

async function settleFixed(h,predicate){
  // WebCrypto runs outside the JS turn: neither two setImmediate callbacks nor
  // a fixed iteration count proves its completion under concurrent test load.
  const deadline=performance.now()+2000;
  while(!await predicate()){
    assert.equal(h.status.classList.contains('error'),false,
      'fixed fixture reached a terminal error before the expected state: '+h.status.textContent);
    assert.ok(performance.now()<deadline,
      'fixed fixture timed out after 2000ms waiting for the expected state: '+h.status.textContent);
    await h.settle();
  }
}
for(const status of ['not-accepted','accepted','in-flight','completed','unknown'])test('lost fixed ACK queries the same event before '+status,async()=>{
  let attempts=0;
  await withFixedConversation(message=>{
    if(message.action==='fixed-complete'&&++attempts===1)throw Error('lost ACK');
    return {ok:true,data:{status:message.action==='fixed-status'?status:'completed'}};
  },async h=>{
    h.submit(fixedRead);
    await settleFixed(h,()=>status==='not-accepted'?h.calls.length===3:h.calls.length===2);
    await h.settle();
    const first=h.calls[0];
    assert.deepEqual(h.calls[1],{...first,action:'fixed-status'});
    if(status==='not-accepted')assert.deepEqual(h.calls[2],first);
    h.tick();await h.settle();assert.equal(h.calls.length,status==='not-accepted'?3:2);
    if(status==='unknown')assert.match(h.status.textContent,/暂停/);
    assert.equal(h.calls.some(message=>['conversation','wake','start'].includes(message.action)),false);
  });
});

for(const data of [{},{status:'unknown'},{status:'not-accepted'},{status:'unrecognized'}])test('an unproven fixed ACK pauses visibly: '+JSON.stringify(data),async()=>{
  await withFixedConversation(()=>({ok:true,data}),async h=>{
    h.submit(fixedRead);await settleFixed(h,()=>/暂停/.test(h.status.textContent));
    h.tick();await h.settle();assert.equal(h.calls.length,1);
  });
});

test('a second transport failure pauses the fixed event without a third attempt',async()=>{
  await withFixedConversation(message=>{
    if(message.action==='fixed-complete')throw Error('lost ACK');
    return {ok:true,data:{status:'not-accepted'}};
  },async h=>{
    h.submit(fixedRead);await settleFixed(h,()=>/暂停/.test(h.status.textContent));
    h.tick();await h.settle();
    assert.deepEqual(h.calls.map(message=>message.action),['fixed-complete','fixed-status','fixed-complete']);
  });
});

for(const changed of ['user-text','answer-text','user-node','answer-node','epoch','url'])test('fixed retry rejects changed '+changed,async()=>{
  let release;
  await withFixedConversation(message=>{
    if(message.action==='fixed-complete')throw Error('lost ACK');
    if(message.action==='fixed-status')return new Promise(resolve=>{release=resolve;});
    return {ok:true,data:{phase:'paused'}};
  },async h=>{
    const {user,answer}=h.submit(fixedRead);
    await settleFixed(h,()=>typeof release==='function');
    if(changed==='user-text')user.textContent+=' ';
    if(changed==='answer-text')answer.firstChild.textContent+=' ';
    if(changed==='user-node')user.replaceWith(user.cloneNode(true));
    if(changed==='answer-node')answer.replaceWith(answer.cloneNode(true));
    if(changed==='epoch')delete globalThis.__opendeskWorkspaceChatV1;
    if(changed==='url')h.win.location=new URL('https://chatgpt.com/c/other');
    release({ok:true,data:{status:'not-accepted'}});await h.settle();await h.settle();
    h.tick();await h.settle();
    assert.equal(h.calls.filter(message=>message.action==='fixed-complete').length,1);
    assert.equal(h.calls.some(message=>message.action==='wake'),false);
    if(changed!=='url')assert.match(h.status.textContent,/暂停/);
  });
});

for(const stop of ['visible-stop','native-stop','disable','navigation','dispose'])test('fixed '+stop+' retires the witness and notifies original stop',async()=>{
  let release;
  await withFixedConversation(message=>message.action==='fixed-complete'?new Promise(resolve=>{release=resolve;}):{ok:true,data:{phase:'paused'}},async h=>{
    h.submit(fixedRead);await settleFixed(h,()=>typeof release==='function');
    if(stop==='visible-stop')h.stop.click();
    if(stop==='native-stop'){h.snap.stopButton={};h.emit('click',{target:h.snap.stopButton});}
    if(stop==='disable')h.preferences({enabled:false});
    if(stop==='navigation'){h.win.location=new URL('https://chatgpt.com/c/other');h.tick();}
    if(stop==='dispose')h.entry.dispose();
    await h.settle();
    assert.deepEqual(h.calls.map(message=>message.action),['fixed-complete','stop']);
    release({ok:true,data:{status:'accepted',phase:'accepted'}});await h.settle();h.tick();await h.settle();
    assert.deepEqual(h.calls.map(message=>message.action),['fixed-complete','stop']);
  });
});

test('fixed Stop before reply retires original discovery without dispatching the later answer',async()=>{
  await withFixedConversation(undefined,async h=>{
    h.snap.draft=fixedRead;h.emit('keydown',{key:'Enter',target:h.snap.editor});h.snap.draft='';
    h.stop.click();await h.settle();
    assert.deepEqual(h.calls,[{protocol:'opendesk.chatgpt.project.v1',action:'stop'}]);
    // Reusing historic nodes is not a new native send.
    h.snap.users.at(-1).textContent=fixedRead;h.snap.assistants.at(-1).textContent=fixedRead;
    h.tick();await h.settle();assert.equal(h.calls.length,1);
  });
});

test('fixed hashes exclude known assistant controls but retain body whitespace and ordinary buttons',async()=>{
  await withFixedConversation(undefined,async h=>{
    // Delay discovery until the complete answer has its rendered controls.
    h.snap.answerComplete=false;
    const {answer}=h.submit(fixedRead,fixedEdit);
    answer.querySelector('[data-assistant-message-actions]').textContent='Copy reply';
    const button=h.doc.createElement('button');button.textContent='body action';answer.append(button);
    h.snap.answerComplete=true;h.tick();
    await settleFixed(h,()=>h.calls.length===1);
    assert.equal(h.calls[0].answerSha256,digest(fixedEdit+'body action'));
    assert.equal(h.calls[0].userSha256,digest(fixedRead));
  });
});

for(const path of ['demo.txt','folder/demo.txt'])test('original bridge → installed service/controller → real reader stages edit and writes only after trusted approval: '+path,async()=>{
  const messages=emitter(),local={},session={},methods=[],fills=[];
  const owner={...workspaceSender,url:'chrome-extension://test-extension/'+CHATGPT_FILES_PAGE};
  const workspaceId='workspace-11111111-1111-1111-1111-111111111111';
  let service,content='safe original\n';
  const storage=rows=>({async get(key){return {[key]:structuredClone(rows[key])};},async set(value){Object.assign(rows,structuredClone(value));}});
  const call=(message,sender=pageSender)=>new Promise(resolve=>messages.emit(message,sender,resolve));
  const trusted=async(action,extra={})=>{
    const reply=await call({protocol:CHATGPT_FILES_PROTOCOL,action,...extra},owner);
    assert.equal(reply.ok,true,JSON.stringify(reply));return reply.data;
  };
  try{
    await withFixedConversation(message=>call(message),async h=>{
      const api={runtime:{id:'test-extension',getURL:path=>'chrome-extension://test-extension/'+path,onMessage:messages,
        async getContexts(){return [{documentId:owner.documentId,documentUrl:owner.url,tabId:owner.tab.id,frameId:0,incognito:false}];}},
        storage:{local:storage(local),session:{...storage(session),async setAccessLevel(value){assert.deepEqual(value,{accessLevel:'TRUSTED_CONTEXTS'});}}},
        tabs:{onRemoved:emitter(),async get(id){const sender=id===7?pageSender:owner;return {...sender.tab,url:sender.url};},
          async create(){return owner.tab;}},
        webNavigation:{onCommitted:emitter(),onHistoryStateUpdated:emitter(),
          async getFrame({tabId}){const sender=tabId===7?pageSender:owner;return {url:sender.url,documentId:sender.documentId,documentLifecycle:'active'};}},
        scripting:{async executeScript({func,args,target,world}){
          assert.equal(world,'ISOLATED');assert.deepEqual(target,{tabId:7,documentIds:[pageSender.documentId]});
          let result;
          if(func.name==='inspectChatGPTEditsOnPage')result=func(...args);
          else{
            assert.ok(['fillChatGPTComposerOnPage','verifyChatGPTComposerOnPage'].includes(func.name));
            if(func.name==='fillChatGPTComposerOnPage')fills.push(args[0]);
            result={ok:true,url:sourceUrl,filled:true,sent:false,readBackVerified:true};
          }
          return [{documentId:pageSender.documentId,frameId:0,result}];
        }}};
      const files={state:()=>({connected:true,sessionId:'native-session-123456',devLeaseEpoch:1}),
        async request(method,params,expected){
          expected.beforeDispatch?.();methods.push(method);
          if(method==='workspaces.list')return {workspaces:[{workspaceId,name:'fixture',access:'read-write',sourceId:'',leaseEpoch:''}]};
          assert.equal(params.workspaceId,workspaceId);assert.equal(params.path,path);
          if(method==='files.write'){
            assert.equal(params.expectedSha256,digest(content));content=params.content;
            return {workspaceId,path:params.path,saved:true,sha256:digest(content),bytes:Buffer.byteLength(content)};
          }
          assert.equal(method,'files.read');return {workspaceId,path:params.path,content,sha256:digest(content),bytes:Buffer.byteLength(content)};
        }};
      service=installChatGPTFilesService({api,files});
      assert.equal((await call({protocol:CHATGPT_FILE_INTENT_PROTOCOL,kind:'open',pathHint:'demo.txt'})).ok,true);
      assert.equal((await call({protocol:CHATGPT_FILE_INTENT_PROTOCOL,kind:'claim'},owner)).ok,true);
      const task='读取 "status" 字段，修改 **status**；保留 <tag> & [label]、`code`、~value~ 和 \\。\n仅此文件。';
      const prepared=await trusted('prepare',{workspaceId,path,operation:'read',allowEdit:true,task});
      assert.equal(methods.filter(method=>method==='files.read').length,0);
      const readText=JSON.stringify(prepared.request);
      // ChatGPT renders Markdown fences out of a sent user message. Exercise
      // the actual product prompt, not an idealized JSON-only submission.
      const renderedPrompt=prepared.prompt.replace(/^```[^\n]*\n?/gm,'')
        .replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g,'$1')
        .replace(/\*\*([^*]+)\*\*/g,'$1');
      assert.deepEqual(JSON.parse(prepared.prompt.slice(prepared.prompt.lastIndexOf('{'))),prepared.request);
      const taskStart=prepared.prompt.indexOf('任务说明（JSON 字符串）：')+'任务说明（JSON 字符串）：'.length;
      assert.equal(JSON.parse(prepared.prompt.slice(taskStart,prepared.prompt.indexOf('。请保留 JSON 转义',taskStart))),task);
      h.submit(prepared.prompt,readText,renderedPrompt);await settleFixed(h,()=>fills.length===1);
      await settleFixed(h,()=>h.calls.length===1&&/已读取/.test(h.status.textContent));
      assert.equal(methods.filter(method=>method==='files.read').length,1);
      assert.equal(methods.filter(method=>method==='files.write').length,0);
      const read=await trusted('state'),packet=JSON.parse(read.resultText.slice(read.resultText.indexOf('{')));
      assert.ok(packet.editProposal);assert.equal(read.delivery,'filled');
      assert.doesNotMatch(read.resultText,/[\r\n]/,'fixed result source must remain one paragraph through the official composer and user-message renderer');
      const editText=JSON.stringify({...packet.editProposal,content:'safe modified\n'});
      h.submit(read.resultText,editText);
      await settleFixed(h,()=>h.calls.length===2);
      let staged;
      await settleFixed(h,async()=>{staged=await trusted('state');return !!staged.proposal;});
      assert.ok(staged.proposal?.reviewId,JSON.stringify(staged));
      assert.equal(content,'safe original\n');assert.equal(methods.filter(method=>method==='files.write').length,0);
      h.tick();await h.settle();assert.equal(h.calls.length,2,'fixed page does not send project wake');
      const saved=await trusted('approve',{reviewId:staged.proposal.reviewId});
      assert.equal(content,'safe modified\n');assert.equal(methods.filter(method=>method==='files.write').length,1);
      assert.match(saved.resultText,/"saved":true/);assert.match(saved.resultText,/"readBackVerified":true/);
      await trusted('poll'); // Advance only the already accepted result-ready event.
      assert.equal(fills.length,2,'read result and verified write receipt each fill once');
      const duplicate=await call(h.calls[1]);assert.equal(duplicate.ok,true);
      assert.equal(methods.filter(method=>method==='files.write').length,1);assert.equal(fills.length,2);
    });
  }finally{service?.dispose();}
});

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
    assert.match(h.feedback.textContent,/E_FILE_HANDOFF/);
    assert.match(h.status.textContent,/恢复指引/);
    assert.match(h.feedback.textContent,/刷新/);
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
    assert.equal(h.start.disabled,false);assert.match(h.status.textContent,/连接已失效/);
    assert.doesNotMatch(h.status.textContent,/E_PROJECT_TASK|Extension context/);
    assert.match(h.feedback.textContent,/E_PROJECT_TASK.*Extension context invalidated/);
    assert.match(h.feedback.textContent,/先查看已有文件审阅页.*确未打开时.*保存原对话草稿后刷新/);
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
    assert.match(h.status.textContent,/连接已失效/);
    assert.match(h.feedback.textContent,/E_PROJECT_TASK.*Extension context invalidated/);
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
      assert.match(h.status.textContent,/任务回执未知/);
      assert.match(h.feedback.textContent,/E_PROJECT_LEASE.*租约已失效/);
      assert.equal(h.root.hidden,false,'unknown Stop must retain a reachable recovery entry without diagnostics');
      assert.equal(h.toggle.hidden,false);
      h.toggle.click();assert.equal(h.details.hidden,false);
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

test('stored diagnostic opt-in exposes only an entry until explicitly opened',async()=>{
  const calls=[],h=pageFixture(message=>{calls.push(message);},{preferences:{enabled:true,diagnosticsVisible:true}});
  try{
    await h.ready;
    assert.equal(h.root.hidden,false);
    assert.equal(h.panel.hidden,true,'stored opt-in must not expand developer forms into normal chat');
    assert.equal(h.restore.hidden,false);
    assert.equal(h.dismiss.hidden,false,'even the small entry can be dismissed');
    h.tick();await h.settle();assert.equal(h.panel.hidden,true);assert.deepEqual(calls,[]);
    h.restore.click(false);assert.equal(h.panel.hidden,true);
    h.restore.click();assert.equal(h.panel.hidden,false);assert.equal(h.diagnostic.open,false);
    h.dismiss.click();h.tick();assert.equal(h.root.hidden,true);assert.deepEqual(calls,[]);
  }finally{h.entry.dispose();}
});

test('closing diagnostics survives polling and unchanged preferences without dispatching file work',async()=>{
  const calls=[],h=pageFixture(message=>{calls.push(message);},{preferences:{enabled:true,diagnosticsVisible:true}});
  try{
    await h.ready;
    assert.equal(h.diagnostic.open,false,'diagnostics start collapsed');
    assert.equal(h.dismiss.getAttribute('aria-label'),'关闭项目文件面板');
    h.dismiss.click(false);assert.equal(h.root.hidden,false);
    h.dismiss.click();assert.equal(h.root.hidden,true);
    h.tick();h.preferences({enabled:true,diagnosticsVisible:true});await h.settle();
    assert.equal(h.root.hidden,true,'settings refresh must not undo a deliberate close');
    assert.deepEqual(calls,[]);
    h.preferences({enabled:true,diagnosticsVisible:false});
    h.preferences({enabled:true,diagnosticsVisible:true});
    assert.equal(h.root.hidden,false,'explicitly enabling diagnostics restores its entry');
    assert.equal(h.panel.hidden,true,'restoring the entry does not reopen advanced forms');
    assert.equal(h.diagnostic.open,false);
  }finally{h.entry.dispose();}
});

test('Escape closes only a trusted non-composing panel interaction',async()=>{
  const calls=[],h=pageFixture(message=>{calls.push(message);},{preferences:{enabled:true,diagnosticsVisible:true}});
  try{
    await h.ready;let prevented=0;
    const key=(isTrusted,isComposing)=>h.card.handlers.keydown({key:'Escape',isTrusted,isComposing,preventDefault(){prevented++;}});
    key(false,false);key(true,true);assert.equal(h.root.hidden,false);assert.equal(prevented,0);
    key(true,false);assert.equal(h.root.hidden,true);assert.equal(prevented,1);assert.deepEqual(calls,[]);
  }finally{h.entry.dispose();}
});

test('closing an active task preserves Stop and drafts in a compact strip until completion',async()=>{
  const h=conversationFixture(message=>({ok:true,data:{phase:message.action==='stop'?'stopped':'watching',message:'正在处理项目文件'}}));
  try{
    await h.ready;h.submit('读取当前项目 demo.txt，只读');await h.settle();
    h.task.value='保留手动任务草稿';h.prompt.value='保留提示词';
    const count=h.calls.length;
    h.dismiss.click();
    assert.equal(h.root.hidden,false);assert.equal(h.panel.hidden,true);assert.equal(h.stop.hidden,false);
    assert.equal(h.stop.disabled,false);assert.equal(h.restore.hidden,false);
    assert.equal(h.calls.length,count,'closing changes presentation only');
    h.restore.click();assert.equal(h.panel.hidden,false);
    assert.equal(h.task.value,'保留手动任务草稿');assert.equal(h.prompt.value,'保留提示词');
    h.dismiss.click();h.stop.click();await h.settle();h.tick();await h.settle();
    assert.equal(h.calls.at(-1).action,'stop');assert.equal(h.root.hidden,true);
  }finally{h.entry.dispose();}
});

test('closing a pending handoff does not revive the panel on a late failure or retry the request',async()=>{
  let reject;const calls=[];
  const h=pageFixture(message=>{calls.push(message);return new Promise((_resolve,fail)=>{reject=fail;});},
    {preferences:{enabled:true,diagnosticsVisible:true}});
  try{
    await h.ready;h.open.click();await h.settle();h.dismiss.click();
    reject(new Error('Extension context invalidated.'));await h.settle();h.tick();await h.settle();
    assert.equal(h.root.hidden,true);assert.equal(calls.length,1);
    assert.match(h.status.textContent,/连接已失效/);
    assert.doesNotMatch(h.status.textContent,/E_FILE_HANDOFF|Extension context/);
    assert.match(h.feedback.textContent,/E_FILE_HANDOFF.*Extension context invalidated/);
    assert.match(h.feedback.textContent,/已有文件审阅页/);
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
    const errors=h.notifications.filter(row=>row.options.message==='任务回执未知，请查看详情。');
    assert.equal(errors.length,2);assert.equal(h.calls.length,2);
    assert.match(h.feedback.textContent,/same failure/);
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
    const session={};
    const api={runtime:{id:'test-extension',getURL:path=>'chrome-extension://test-extension/'+path,
      async getContexts(){return [{documentId:owner.documentId,documentUrl:owner.url,tabId:owner.tab.id,frameId:0,incognito:false}];}},
      storage:{local:{async get(key){return {[key]:structuredClone(ledger[key])};},
        async set(value){Object.assign(ledger,structuredClone(value));}},
        session:{async setAccessLevel(value){assert.deepEqual(value,{accessLevel:'TRUSTED_CONTEXTS'});},
          async get(key){return {[key]:structuredClone(session[key])};},
          async set(value){Object.assign(session,structuredClone(value));}}},
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
