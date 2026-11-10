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
    assert.equal(h.calls.length,1,'fixed discovery must reach the existing transport');
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
    assert.ok(performance.now()<deadline,
      'fixed fixture timed out waiting for real message/side-effect');
    await h.settle();
  }
}

for(const status of ['not-accepted','accepted','in-flight','completed'])test('lost fixed ACK queries the same event before '+status,async()=>{
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
    assert.equal(h.calls.some(message=>['conversation','wake','start'].includes(message.action)),false);
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
      await settleFixed(h,()=>h.calls.length===1&&fills.length===1);
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
    assert.equal(h.doc.getElementById('opendesk-chatgpt-files-entry'),null);
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
    assert.equal(h.doc.getElementById('opendesk-chatgpt-files-entry'),null);
  }finally{h.entry.dispose();}
});

test('conversation navigation clears the previous project receipt and a stopped send cannot resume',async()=>{
  const h=conversationFixture();
  try{
    await h.ready;
    h.submit('读取当前项目 demo.txt，只读');await h.settle();
    assert.equal(h.doc.getElementById('opendesk-chatgpt-files-entry'),null);
    h.win.location=new URL('https://chatgpt.com/c/other');h.snap.route='c/other';h.tick();
    assert.equal(h.doc.getElementById('opendesk-chatgpt-files-entry'),null);
    h.snap.draft='读取当前项目 demo.txt，只读';h.emit('click',{target:h.snap.sendButton});
    h.snap.stopButton={};h.emit('click',{target:h.snap.stopButton});h.snap.draft='';h.snap.users.push(turn('u2','读取当前项目 demo.txt，只读'));
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



test('headless adapter never mounts project file UI across idle, activity, completion, error and unknown',async()=>{
  for(const phase of ['watching','completed','failed','unknown']){
    const h=conversationFixture(()=>({ok:true,data:{phase,resultStatus:phase,
      resultText:'private test fixture file bytes',result:{status:phase}}}),
      {preferences:{enabled:true,diagnosticsVisible:true}});
    try{
      await h.ready;
      assert.equal(h.doc.querySelector('#opendesk-chatgpt-files-entry'),null);
      h.submit('读取当前项目 demo.txt，只读');await h.settle();h.tick();await h.settle();
      assert.equal(h.doc.querySelector('#opendesk-chatgpt-files-entry'),null);
      assert.deepEqual(h.notifications,[],'WebFlow project files must not use website toasts');
      assert.equal(h.calls.filter(call=>call.action==='conversation').length,1);
    }finally{h.entry.dispose();}
  }
});
test('diagnosticsVisible is backward-compatible but cannot re-enable floating controls',async()=>{
  const h=conversationFixture(undefined,{preferences:{enabled:true,diagnosticsVisible:true}});
  try{
    await h.ready;
    assert.equal(h.doc.querySelector('#opendesk-chatgpt-files-entry'),null);
    h.preferences({enabled:true,diagnosticsVisible:false});
    h.preferences({enabled:true,diagnosticsVisible:true});
    h.submit('读取当前项目 demo.txt，只读');await h.settle();
    assert.equal(h.calls.filter(x=>x.action==='conversation').length,1);
    assert.equal(h.doc.querySelector('#opendesk-chatgpt-files-entry'),null);
  }finally{h.entry.dispose();}
});
test('disable cancels a witnessed turn without restarting it on enable',async()=>{
  const h=conversationFixture(undefined,{preferences:{enabled:true,diagnosticsVisible:false}});
  try{
    await h.ready;
    h.snap.draft='修改当前项目 demo.txt 的状态';h.emit('keydown',{target:h.snap.editor,key:'Enter'});
    h.snap.draft='';
    h.preferences({enabled:false,diagnosticsVisible:true});
    h.preferences({enabled:true,diagnosticsVisible:false});
    h.snap.users.push(turn('u1','修改当前项目 demo.txt 的状态'));
    h.snap.assistants.push(turn('a1','complete'));h.tick();await h.settle();
    assert.deepEqual(h.calls,[],'old request must not be revived');
    assert.equal(h.doc.querySelector('#opendesk-chatgpt-files-entry'),null);
  }finally{h.entry.dispose();}
});
test('headless native Stop fences further wake without creating page controls',async()=>{
  const h=conversationFixture(message=>({ok:true,data:{phase:message.action==='stop'?'paused':'watching'}}));
  try{
    await h.ready;h.submit('修改当前项目 demo.txt 的状态');await h.settle();
    h.tick();await h.settle();
    h.snap.stopButton={};h.emit('click',{target:h.snap.stopButton});
    await h.settle();h.tick();await h.settle();
    assert.deepEqual(h.calls.map(x=>x.action),['conversation','wake','stop']);
    assert.equal(h.doc.querySelector('#opendesk-chatgpt-files-entry'),null);
  }finally{h.entry.dispose();}
});
test('unreliable fixed event status never starts a second fixed operation',async()=>{
  await withFixedConversation(message=>message.action==='fixed-complete'?
    (()=>{throw Error('lost fixed ACK')})():
    {ok:true,data:{status:'unknown'}},async h=>{
    h.submit(fixedRead);await settleFixed(h,()=>h.calls.length>=2);
    await h.settle();h.tick();await h.settle();
    assert.equal(h.calls.filter(x=>x.action==='fixed-complete').length,1);
    assert.equal(h.calls.filter(x=>x.action==='fixed-status').length,1);
    assert.equal(h.doc.querySelector('#opendesk-chatgpt-files-entry'),null);
  });
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
