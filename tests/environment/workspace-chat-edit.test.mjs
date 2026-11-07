import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseHTML} from 'linkedom';
import {createEditContext,parseEditProposal,validateEditProposal,createEditReceipt,EDIT_PROTOCOL} from '../../src/native-agent/workspace-ai-proposal.js';
import {inspectChatGPTEditsOnPage,readChatGPTEdit,isChatGPTURL} from '../../src/native-agent/workspace-chatgpt.js';
import {createWorkspaceChatEdit} from '../../src/native-agent/workspace-chat-edit-ui.js';
import {createMemoryWorkspace,DEMO_WORKSPACE_ID} from '../../src/native-agent/file-workspace-demo.js';
import {createChatGPTFilesController} from '../../projects/webflow/trusted/chatgpt-files-controller.js';

const hash=text=>createHash('sha256').update(text).digest('hex');
const record=()=>({workspaceId:'trusted-workspace',path:'README.md',content:'# Original\n',baseContent:'# Original\n',sha256:hash('# Original\n')});
const contextFor=r=>createEditContext(r,{requestId:'request-0123456789abcdef',task:'修改标题'});
const envelope=(context,content='# Changed\n')=>({protocol:EDIT_PROTOCOL,requestId:context.requestId,path:context.path,baseSha256:context.baseSha256,content});
const code=(fn,expected)=>assert.throws(fn,error=>error.code===expected);

test('memory demo uses a Native-compatible opaque workspace identity throughout read and save',async()=>{
  const memory=createMemoryWorkspace(),{workspaces}=await memory.request('workspaces.list');
  const {workspaceId}=workspaces[0];
  assert.equal(workspaceId,DEMO_WORKSPACE_ID);
  assert.match(workspaceId,/^workspace-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  const before=await memory.request('files.read',{workspaceId,path:'README.md'});
  await memory.request('files.write',{workspaceId,path:before.path,expectedSha256:before.sha256,content:'Demo identity checked'});
  assert.equal((await memory.request('files.read',{workspaceId,path:before.path})).content,'Demo identity checked');
  await assert.rejects(memory.request('files.read',{workspaceId:'demo-workspace',path:before.path}),error=>error.code==='E_FILES_ACCESS');
});

test('context exports only a selected file and a versioned proposal, without workspace authority',()=>{
  const r=record(),{context,prompt}=contextFor(r);
  assert.equal(context.workspaceId,'trusted-workspace');assert.ok(Object.isFrozen(context));
  assert.match(prompt,/opendesk-edit/);assert.match(prompt,/README\.md/);assert.doesNotMatch(prompt,/trusted-workspace/);
  const parsed=parseEditProposal('说明\n```opendesk-edit\n'+JSON.stringify(envelope(context))+'\n```\n结束');
  const reviewed=validateEditProposal(parsed,context,r);
  assert.equal(reviewed.before,r.content);assert.equal(reviewed.content,'# Changed\n');assert.equal(r.content,'# Original\n');
});

test('proposal cannot redirect the path, version, request or workspace and cannot overwrite an edited draft',()=>{
  const r=record(),{context}=contextFor(r),valid=envelope(context);
  for(const change of [{requestId:'request-from-another-chat'},{path:'../other.md'},{path:'C:\\project\\x.md'},{baseSha256:'0'.repeat(64)}])
    code(()=>validateEditProposal(parseEditProposal(JSON.stringify({...valid,...change})),context,r),'E_EDIT_CONTEXT');
  for(const change of [{workspaceId:'other'},{path:'other.md'},{sha256:'f'.repeat(64)},{content:'unsaved user draft'},
    {baseContent:'other baseline'},{unknown:true},{remote:{content:'external'}}])
    code(()=>validateEditProposal(valid,context,{...r,...change}),'E_EDIT_BASE');
  code(()=>validateEditProposal(valid,null,r),'E_EDIT_CONTEXT');
  code(()=>createEditContext({...r,content:'draft'}),'E_EDIT_BASE');
});

test('strict text envelope rejects duplicate keys, unknown fields, truncated JSON and executable payload shapes',()=>{
  const {context}=contextFor(record()),valid=JSON.stringify(envelope(context));
  for(const bad of [valid.slice(0,-1),valid+',',valid.slice(0,-1)+',}',
    valid.slice(0,-1)+',"path":"other.md"}',valid.slice(0,-1)+',"p\\u0061th":"README.md"}',
    valid.slice(0,-1)+',"shell":"rm -rf x"}',valid.replace('"# Changed\\n"','null'),
    valid.replace('"# Changed\\n"','[]'),valid.replace('"# Changed\\n"','{"run":"x"}'),
    valid.replace('"# Changed\\n"','"\\uD800"'),valid.replace('"# Changed\\n"','"\\u0000"'),
    valid.replace('opendesk.workspace.edit.v1','unknown.v1')])code(()=>parseEditProposal(bad),'E_EDIT_FORMAT');
  code(()=>parseEditProposal('```opendesk-edit\n'+valid+'\n```\n```opendesk-edit\n'+valid+'\n```'),'E_EDIT_AMBIGUOUS');
  assert.equal(parseEditProposal(' \n'+valid+'\n ').content,'# Changed\n');
});

test('file limit uses UTF-8 bytes and empty replacement remains an explicit valid proposal',()=>{
  const r=record(),{context}=contextFor(r);
  const empty=validateEditProposal(parseEditProposal(JSON.stringify(envelope(context,''))),context,r);assert.equal(empty.bytes,0);
  assert.equal(parseEditProposal(JSON.stringify(envelope(context,'x'.repeat(32768)))).content.length,32768);
  code(()=>parseEditProposal(JSON.stringify(envelope(context,'中'.repeat(10923)))),'E_EDIT_LIMIT');
  code(()=>parseEditProposal(JSON.stringify(envelope(context,'x'.repeat(32769)))),'E_EDIT_LIMIT');
  code(()=>parseEditProposal('x'.repeat(205000)),'E_EDIT_LIMIT');
});

test('success receipt distinguishes memory mode and refuses unverified state',()=>{
  const r=record();assert.equal(JSON.parse(createEditReceipt(r,'request-123',{demo:true})).backend,'memory-only');
  assert.equal(JSON.parse(createEditReceipt(r,'request-123')).readBackVerified,true);
  for(const change of [{unknown:true},{content:'unsaved'},{remote:{}}])code(()=>createEditReceipt({...r,...change},'request-123'),'E_EDIT_RECEIPT');
});

function message(role,blocks=[],{streaming=false}={}){
  const node={parentElement:null,getAttribute:()=>role,closest:()=>null,
    matches:()=>streaming,querySelector:()=>null,querySelectorAll:()=>codes};
  const codes=blocks.map(text=>({textContent:text,closest:selector=>selector==='[data-message-author-role]'?node:null}));
  return node;
}
function pageFixture(t,messages,{stop=false,url='https://chatgpt.com/c/current'}={}){
  const oldDoc=globalThis.document,oldLoc=globalThis.location;
  globalThis.document={querySelectorAll:selector=>selector.includes('stop-button')?(stop?[{closest:()=>null}]:[]):messages};
  globalThis.location=new URL(url);
  t.after(()=>{globalThis.document=oldDoc;globalThis.location=oldLoc;});
  return args=>inspectChatGPTEditsOnPage({expectedUrl:'https://chatgpt.com/c/current',requestId:'request-0123456789abcdef',...args});
}

test('reader aggregates multiple assistant fragments after the latest user and ignores old or user code',t=>{
  const text=JSON.stringify(envelope(contextFor(record()).context));
  const read=pageFixture(t,[message('user',[text]),message('assistant',[text]),message('user',[text]),
    message('assistant',['unrelated explanation']),message('assistant',[text])]);
  assert.deepEqual(read().blocks,[text]);assert.equal(read().assistantFragments,2);
});

test('reader never falls back to an old answer while the latest user awaits a reply',t=>{
  const text=JSON.stringify(envelope(contextFor(record()).context));
  const read=pageFixture(t,[message('user'),message('assistant',[text]),message('user')]);
  assert.equal(read().error.code,'E_CHAT_PENDING');
});

function rolelessAnswerFixture(t){
  const {document}=parseHTML('<html><body><article data-talvt-turn-state="complete">'+
    '<section><h5 data-conversation-role="user">You said:</h5>'+
    '<div data-chatgpt-search-unit-key="fallback-turn-0:0:user" data-chatgpt-search-message-ids="f82ad299-6ddf-4e25-b3a4-f612b0333d61">request-0123456789abcdef</div></section>'+
    '<section id="answer-parent"><h6 data-conversation-role="assistant">ChatGPT said:</h6>'+
    '<div id="answer" data-chatgpt-search-message-ids="f82ad299-6ddf-4e25-b3a4-f612b0333d60">'+
    '<div data-code-block="true"><div data-markdown-copy="exclude"><div>opendesk-edit</div><button>Copy code</button></div>'+
    '<div data-code-block-source="true"><code><span></span></code></div></div></div></section></article></body></html>');
  const text=JSON.stringify(envelope(contextFor(record()).context));
  document.querySelector('code span').textContent=text;
  const previous={document:globalThis.document,location:globalThis.location,getComputedStyle:globalThis.getComputedStyle};
  globalThis.document=document;globalThis.location=new URL('https://chatgpt.com/c/current');
  globalThis.getComputedStyle=node=>node.style;
  t.after(()=>Object.assign(globalThis,previous));
  return {document,text,answer:document.querySelector('#answer'),parent:document.querySelector('#answer-parent'),
    read:options=>inspectChatGPTEditsOnPage({expectedUrl:location.href,requestId:'request-0123456789abcdef',
      requireUserEcho:true,fileRequest:true,...options})};
}

test('reader reads the actual single-UUID roleless assistant with a unique immediate-parent heading',t=>{
  const {read,text}=rolelessAnswerFixture(t),result=read();
  assert.equal(result.ok,true);assert.deepEqual(result.blocks,[text]);assert.equal(result.assistantFragments,1);
  assert.equal(read().answerKey,result.answerKey);
});

function readerControllerFixture(t,mutate){
  const dom=rolelessAnswerFixture(t),task='读取 isolated-test 项目的 demo.txt，只读取，不修改任何文件';
  dom.document.querySelector('[data-chatgpt-search-unit-key]').textContent=task;
  const source={tabId:7,windowId:3,documentId:'source-doc',url:location.href};
  const workspaceId='workspace-11111111-1111-1111-1111-111111111111';
  const ledger={'opendesk.chatgpt.files.grants.v1':{existing:{id:'existing',version:1,service:'https://chatgpt.com',
    sourceUrl:source.url,scope:'task-named-existing-text',operations:['read'],authority:{workspaceId,sourceId:''}}}};
  const counts={reads:0,writes:0,fills:0,inspections:0};
  let mutated=false;
  const api={runtime:{id:'extension'},storage:{local:{
    async get(key){return {[key]:ledger[key]};},async set(value){Object.assign(ledger,structuredClone(value));}}},
    tabs:{async get(){return {id:7,windowId:3,url:source.url};}},
    webNavigation:{async getFrame(){return {...source,frameId:0,documentLifecycle:'active'};}},
    scripting:{async executeScript({func,args,world}){
      assert.equal(world,'ISOLATED');assert.equal(func,inspectChatGPTEditsOnPage);counts.inspections++;
      // Exercise the serialized reader, as Chrome does, without module bindings.
      return [{frameId:0,documentId:source.documentId,result:(0,eval)('('+func.toString()+')')(args[0])}];
    }}};
  const files={state:()=>({connected:true,sessionId:'native-session-123456',devLeaseEpoch:1}),
    async request(method,params){
      if(method==='workspaces.list'){
        if(!mutated){mutated=true;mutate(dom);}
        return {workspaces:[{workspaceId,name:'isolated-test',access:'read-only',sourceId:'',leaseEpoch:''}]};
      }
      if(method==='files.read'){counts.reads++;const content='safe original\n';
        return {workspaceId,path:params.path,content,bytes:Buffer.byteLength(content),sha256:hash(content)};}
      if(method==='files.write')counts.writes++;
      throw Error('Unexpected Native request: '+method);
    }};
  const controller=createChatGPTFilesController({api,files,fillComposer:async()=>{counts.fills++;throw Error('Unexpected fill');}});
  t.after(()=>controller.dispose());
  return {...dom,counts,tick:()=>controller.tick(),start:()=>controller.conversationTask({task},
    {id:'extension',frameId:0,documentId:source.documentId,url:source.url,tab:{id:7,windowId:3}})};
}

test('actual reader/controller rejects an empty completed admission and never replays it after hydration',async t=>{
  const h=readerControllerFixture(t,()=>{});
  h.parent.querySelector('[data-conversation-role]').remove();h.answer.setAttribute('data-content-search-unit-key','new:assistant');
  h.answer.innerHTML='<h4 data-conversation-role="assistant">ChatGPT 说：<span>ChatGPT</span></h4>';
  await assert.rejects(h.start(),{code:'E_CHAT_INCOMPLETE',outcome:'NOT_DISPATCHED'});
  assert.equal(globalThis.__opendeskWorkspaceChatV1.answers?.has(h.answer)||false,false);
  h.answer.append('等待文件上下文');await h.tick();
  assert.equal(h.counts.reads,0);assert.equal(h.counts.writes,0);assert.equal(h.counts.fills,0);
});

test('actual reader/controller rejects body dehydration between admission and beginProject',async t=>{
  const h=readerControllerFixture(t,({answer})=>{
    answer.innerHTML='<h4 data-conversation-role="assistant">ChatGPT 说：<span>ChatGPT</span></h4>';
  });
  h.parent.querySelector('[data-conversation-role]').remove();h.answer.setAttribute('data-content-search-unit-key','new:assistant');
  await assert.rejects(h.start(),{code:'E_CHAT_INCOMPLETE',outcome:'NOT_DISPATCHED'});
  h.answer.append('等待文件上下文');await h.tick();
  assert.equal(h.counts.reads,0);assert.equal(h.counts.writes,0);assert.equal(h.counts.fills,0);
});

for(const mode of ['file','Task','beginProject','requireComplete'])test('serialized reader rejects completed heading-only '+mode+' before binding',t=>{
  const {read,answer,parent,document}=rolelessAnswerFixture(t);
  parent.querySelector('[data-conversation-role]').remove();
  answer.setAttribute('data-content-search-unit-key','new:assistant');
  answer.innerHTML='<h4 data-conversation-role="assistant">ChatGPT 说：<span>ChatGPT</span></h4>';
  const options={identityOnly:true,fileRequest:mode==='file',readUserMessage:true,
    taskIntent:mode==='Task',requireComplete:mode==='requireComplete'};
  assert.equal(read(options).error?.code,'E_CHAT_INCOMPLETE');
  assert.equal(globalThis.__opendeskWorkspaceChatV1.answers?.has(answer)||false,false);
  answer.insertAdjacentHTML('beforeend','<div data-assistant-message-actions><button>复制</button></div>');
  assert.equal(read(options).error?.code,'E_CHAT_INCOMPLETE');
  const body=document.createElement('div');body.textContent=' \n';answer.append(body);
  assert.equal(read(options).error?.code,'E_CHAT_INCOMPLETE');
  body.textContent='等待文件上下文';const hydrated=read(options);
  assert.equal(hydrated.ok,true);assert.match(hydrated.answerKey,/:0$/);
  assert.equal(globalThis.__opendeskWorkspaceChatV1.answers.get(answer).text,'ChatGPT 说：ChatGPT等待文件上下文');
  assert.equal(read(options).answerKey,hydrated.answerKey);
  body.textContent+=' ';assert.notEqual(read(options).answerKey,hydrated.answerKey,'substantive text remains exact');
  const beforeReplacement=read(options).answerKey;answer.replaceWith(answer.cloneNode(true));
  assert.notEqual(read(options).answerKey,beforeReplacement,'same-text replacement retains its identity fence');
});

for(const change of ['toolbar insertion','toolbar copied label','copy button insertion','code copied label']){
  test('actual reader/controller keeps the admitted body stable after '+change,async t=>{
    const h=readerControllerFixture(t,({answer,document})=>{
      if(change==='toolbar insertion'){
        const toolbar=document.createElement('div');toolbar.setAttribute('data-assistant-message-actions','');
        toolbar.innerHTML='<button>复制</button><button>赞</button>';answer.append(toolbar);
      }else if(change==='copy button insertion'){
        const button=document.createElement('button');button.setAttribute('data-testid','copy-turn-action-button');
        button.textContent='复制';answer.append(button);
      }else if(change==='toolbar copied label')answer.querySelector('[data-assistant-message-actions] button').textContent='已复制';
      else answer.querySelector('[data-markdown-copy="exclude"] button').textContent='已复制';
    });
    if(change==='toolbar copied label')h.answer.insertAdjacentHTML('beforeend',
      '<div data-assistant-message-actions><button>复制</button></div>');
    const before=h.read({identityOnly:true}).answerKey;
    await h.start();
    assert.equal(h.read({identityOnly:true}).answerKey,before);
    assert.deepEqual(h.read({requireUserEcho:false}).blocks,[h.text]);
    if(change==='code copied label')assert.equal(h.answer.querySelector('[data-markdown-copy="exclude"] button').textContent,'已复制');
    assert.equal(h.counts.reads,1);assert.equal(h.counts.writes,0);assert.equal(h.counts.fills,0);
    assert.ok(h.counts.inspections>=2);
  });
}

for(const change of ['prose','code','body button','language label','same-text replacement','streaming','toolbar streaming','Task in button','Task in toolbar']){
  test('actual reader/controller still rejects '+change+' before file I/O',async t=>{
    const h=readerControllerFixture(t,({answer,document})=>{
      if(change==='prose')answer.append('new prose outside the protocol block');
      if(change==='code')answer.querySelector('code span').textContent+=' ';
      if(change==='body button')answer.querySelector('#body-button').textContent='changed body';
      if(change==='language label')answer.querySelector('[data-markdown-copy="exclude"] div').textContent='opendesk-task';
      if(change==='same-text replacement')answer.replaceWith(answer.cloneNode(true));
      if(change==='streaming')document.querySelector('article').setAttribute('data-talvt-turn-state','streaming');
      if(change==='toolbar streaming')answer.insertAdjacentHTML('beforeend',
        '<div data-assistant-message-actions><span data-is-streaming="true">生成中</span></div>');
      if(change==='Task in button')answer.querySelector('#body-button').textContent='webflow.task.intent.v1';
      if(change==='Task in toolbar')answer.insertAdjacentHTML('beforeend',
        '<div data-assistant-message-actions><button>webflow.task.intent.v1</button></div>');
    });
    h.answer.insertAdjacentHTML('beforeend','<button id="body-button">body text</button>');
    const before=h.read({identityOnly:true}).answerKey;
    await assert.rejects(h.start(),{code:change.startsWith('Task in')?'E_CHAT_ROUTE':
      change.includes('streaming')?'E_CHAT_TURN':'E_CHAT_ANSWER',outcome:'NOT_DISPATCHED'});
    const after=h.read({identityOnly:true,readUserMessage:true});
    if(change.includes('streaming')){assert.equal(after.answerKey,null);assert.equal(after.answerComplete,false);
      assert.equal(h.read().error.code,'E_CHAT_STREAMING');}
    else if(change==='Task in toolbar')assert.equal(after.answerKey,before);
    else assert.notEqual(after.answerKey,before);
    if(change.startsWith('Task in'))assert.equal(after.taskIntentPresent,true);
    assert.equal(h.counts.reads,0);assert.equal(h.counts.writes,0);assert.equal(h.counts.fills,0);
  });
}

test('identity inspection reports deny-only Task presence without granting a file or Task route',t=>{
  const {read,answer,document}=rolelessAnswerFixture(t);
  const options={identityOnly:true,readUserMessage:true};
  assert.equal(read(options).taskIntentPresent,false);
  const conflict=document.createElement('div');conflict.textContent='webflow.task.intent.v1';answer.append(conflict);
  const mixed=read(options);
  assert.equal(mixed.ok,true);assert.equal(mixed.taskIntentPresent,true);
  assert.equal('blocks' in mixed,false);assert.equal('workspaceId' in mixed,false);
  conflict.textContent='opendesk.task.request.v1';assert.equal(read(options).taskIntentPresent,true);
  for(const protocol of ['webflow.task.intent.v1','opendesk.task.intent.v1','opendesk.task.request.v1']){
    conflict.textContent=JSON.stringify({protocol}).replaceAll('.',String.raw`\u002e`);
    assert.equal(read(options).taskIntentPresent,true,'escaped '+protocol+' must remain deny-only');
    conflict.textContent='块外引号 "\n'+conflict.textContent;
    assert.equal(read(options).taskIntentPresent,true,'unpaired prose quote cannot hide '+protocol);
  }
  conflict.remove();assert.equal(read(options).taskIntentPresent,false);
});

test('roleless answer still requires the newest user echo and positive completion',t=>{
  const {read,document}=rolelessAnswerFixture(t);
  document.querySelector('[data-chatgpt-search-unit-key]').textContent='different request';
  assert.equal(read().error.code,'E_CHAT_TURN');
  document.querySelector('[data-chatgpt-search-unit-key]').textContent='request-0123456789abcdef';
  const turn=document.querySelector('article');turn.setAttribute('data-talvt-turn-state','streaming');
  assert.equal(read().error.code,'E_CHAT_STREAMING');
  turn.removeAttribute('data-talvt-turn-state');assert.equal(read().error.code,'E_CHAT_INCOMPLETE');
});

test('newest pending modern user prevents reading an older UUID answer',t=>{
  const {read,document}=rolelessAnswerFixture(t);
  const user=document.createElement('div');user.setAttribute('data-chatgpt-search-unit-key','fallback-turn-1:0:user');
  user.textContent='request-0123456789abcdef';document.body.append(user);
  assert.equal(read().error.code,'E_CHAT_PENDING');
});

for(const kind of ['user heading','missing heading','multiple headings','hidden heading','nested heading',
  'broad turn heading','user marker','legacy user ancestor','multiple UUIDs','quoted','hidden','file data']){
  test('roleless candidate denies '+kind,t=>{
    const {read,document,answer,parent}=rolelessAnswerFixture(t),heading=parent.querySelector('[data-conversation-role]');
    if(kind==='user heading')heading.setAttribute('data-conversation-role','user');
    if(kind==='missing heading')heading.remove();
    if(kind==='multiple headings')parent.prepend(heading.cloneNode(true));
    if(kind==='hidden heading')heading.hidden=true;
    if(kind==='nested heading')answer.prepend(heading);
    if(kind==='broad turn heading')document.querySelector('article').prepend(heading);
    if(kind==='user marker')answer.setAttribute('data-chatgpt-search-unit-key','fallback-turn-0:1:user');
    if(kind==='legacy user ancestor')parent.setAttribute('data-message-author-role','user');
    if(kind==='multiple UUIDs')answer.setAttribute('data-chatgpt-search-message-ids',
      answer.getAttribute('data-chatgpt-search-message-ids')+' f82ad299-6ddf-4e25-b3a4-f612b0333d61');
    if(kind==='hidden')answer.style.display='none';
    if(kind==='file data')parent.setAttribute('data-opendesk-file-data','');
    if(kind==='quoted'){const quote=document.createElement('blockquote');parent.before(quote);quote.append(parent);}
    assert.equal(read().ok,false);
  });
}

for(const attrs of ['data-chatgpt-search-message-ids="f82ad299-6ddf-4e25-b3a4-f612b0333d62"',
  'data-message-author-role="assistant"','data-content-search-unit-key="nested:assistant"']){
  test('nested message wrapper cannot donate code or count as an extra UUID answer: '+attrs,t=>{
    const {read,document,answer,text}=rolelessAnswerFixture(t),nested=document.createElement('section');
    nested.innerHTML='<div '+attrs+'></div>';
    nested.lastElementChild.append(answer.querySelector('[data-code-block]'));answer.append(nested);
    assert.equal(read().error.code,'E_CHAT_FORMAT');
    const pre=document.createElement('pre');pre.innerHTML='<code class="language-opendesk-edit"></code>';
    pre.firstElementChild.textContent=text;answer.append(pre);
    const result=read();assert.equal(result.ok,true);assert.equal(result.assistantFragments,1);assert.deepEqual(result.blocks,[text]);
  });
}

test('UUID answer preserves unique block enforcement',t=>{
  const {read,answer}=rolelessAnswerFixture(t);
  answer.append(answer.firstElementChild.cloneNode(true));assert.equal(read().error.code,'E_EDIT_AMBIGUOUS');
});

test('one assistant heading cannot identify two sibling UUID wrappers',t=>{
  const {read,answer,parent}=rolelessAnswerFixture(t),sibling=answer.cloneNode(false);
  sibling.removeAttribute('id');sibling.setAttribute('data-chatgpt-search-message-ids','f82ad299-6ddf-4e25-b3a4-f612b0333d62');
  parent.append(sibling);assert.equal(read().ok,false);assert.equal(read({fileRequest:false}).ok,false);
});

test('reader rejects ambiguous proposals and incomplete streaming turns',t=>{
  const text=JSON.stringify(envelope(contextFor(record()).context)),messages=[message('user'),message('assistant',[text,text])];
  const read=pageFixture(t,messages);assert.equal(read().error.code,'E_EDIT_AMBIGUOUS');
  messages[1]=message('assistant',[text],{streaming:true});assert.equal(read().error.code,'E_CHAT_STREAMING');
});

test('visible stop control blocks reading, and URL binding detects SPA changes within the same document',t=>{
  const read=pageFixture(t,[message('user'),message('assistant')],{stop:true});
  assert.equal(read().error.code,'E_CHAT_STREAMING');
  globalThis.location=new URL('https://chatgpt.com/c/other');assert.equal(read().error.code,'E_CHAT_TARGET');
  assert.equal(isChatGPTURL('https://chatgpt.com.evil.test/c/current'),false);
  assert.equal(isChatGPTURL('https://user:pass@chatgpt.com/c/current'),false);
});

test('Chrome wrapper checks target before and after injection and keeps ISOLATED document targeting',async()=>{
  const target={tabId:5,documentId:'doc',url:'https://chatgpt.com/c/current'};let calls=0,script;
  const api={webNavigation:{getFrame:async()=>({...target,url:++calls===2?'https://chatgpt.com/c/other':target.url})},
    scripting:{executeScript:async options=>{script=options;return [{frameId:0,documentId:'doc',result:{ok:true,url:target.url,blocks:['{}']}}];}}};
  await assert.rejects(readChatGPTEdit(api,target,'request'),error=>error.code==='E_CHAT_TARGET');
  assert.equal(script.world,'ISOLATED');assert.deepEqual(script.target,{tabId:5,documentIds:['doc']});
  assert.deepEqual(Object.keys(script.args[0]).sort(),['expectedUrl','identityOnly','requestId']);
});

function controllerHarness({api,demo=true,target=null}={}){
  let current=record(),drafts=0,ui;
  ui=createWorkspaceChatEdit({api,demo,getRecord:()=>current,getTarget:()=>target,
    isWritable:()=>true,readCurrent:async()=>current,setDraft:(r,content)=>{drafts++;r.content=content;},
    run:async fn=>{ui.update({busy:true,connected:true});try{await fn();}finally{ui.update({busy:false,connected:true});}}});
  ui.update({connected:true});
  return {ui,state:()=>ui.getSnapshot(),get current(){return current;},set current(r){current=r;ui.update({connected:true});},get drafts(){return drafts;},
    answer(content='Changed'){const text=ui.getSnapshot().prompt.match(/```json\s+([\s\S]*?)\s+```/)[1];return JSON.stringify({...JSON.parse(text),content});}};
}

test('UI review has no write effect; adoption consumes context, keeps a draft, and receipt waits for verified save',async()=>{
  const h=controllerHarness();await h.ui.actions.prepareEdit();const answer=h.answer();h.ui.actions.setAnswer(answer);
  await h.ui.actions.review();assert.equal(h.drafts,0);assert.equal(h.current.content,'# Original\n');
  assert.equal(!h.state().proposal,false);assert.equal(h.state().proposalAfter,'Changed');
  await h.ui.actions.adopt();assert.equal(h.drafts,1);assert.equal(h.current.content,'Changed');
  assert.equal(h.current.baseContent,'# Original\n');assert.equal(!h.state().receipt,true);
  assert.equal(h.state().receipt,'');
  h.ui.actions.setAnswer(answer);await h.ui.actions.review();assert.match(h.state().status.text,/E_EDIT_CONTEXT/);assert.equal(h.drafts,1);
  h.current.baseContent=h.current.content;h.current.sha256=hash(h.current.content);await h.ui.saved(h.current);
  const receipt=JSON.parse(h.state().receipt);assert.equal(receipt.backend,'memory-only');assert.equal(receipt.sha256,hash('Changed'));
});

test('UI refuses to overwrite a draft changed while the answer was being prepared',async()=>{
  const h=controllerHarness();await h.ui.actions.prepareEdit();const answer=h.answer('AI changed');
  h.current.content='My unsaved text';h.ui.actions.setAnswer(answer);await h.ui.actions.review();
  assert.equal(h.current.content,'My unsaved text');assert.equal(h.drafts,0);assert.match(h.state().status.text,/E_EDIT_BASE/);
});

test('manual changes after adoption cannot be attributed to the original AI proposal receipt',async()=>{
  const h=controllerHarness();await h.ui.actions.prepareEdit();h.ui.actions.setAnswer(h.answer('AI text'));await h.ui.actions.review();await h.ui.actions.adopt();
  h.current.content='User revised text';h.current.baseContent=h.current.content;h.current.sha256=hash(h.current.content);
  await h.ui.saved(h.current);assert.equal(h.state().receipt,'');assert.match(h.state().status.text,/人工调整/);
});

test('switching files invalidates the exported context even when the user switches back',async()=>{
  const h=controllerHarness(),original=h.current;await h.ui.actions.prepareEdit();const answer=h.answer();
  h.current={...record(),path:'other.md'};h.current=original;
  h.ui.actions.setAnswer(answer);await h.ui.actions.review();assert.equal(h.drafts,0);assert.match(h.state().status.text,/E_EDIT_CONTEXT/);
});

test('malformed replacement import removes an earlier valid preview, and empty proposals are visibly labelled',async()=>{
  const h=controllerHarness();await h.ui.actions.prepareEdit();h.ui.actions.setAnswer(h.answer(''));await h.ui.actions.review();
  assert.equal(h.state().proposalAfter,'（将清空文件正文）');
  h.ui.actions.setAnswer('incomplete');await h.ui.actions.review();assert.equal(!h.state().proposal,true);
  await h.ui.actions.adopt();assert.equal(h.drafts,0);
});

test('failed repeat reads invalidate an earlier preview before streaming, ambiguous or changed-target errors',async()=>{
  const target={tabId:8,documentId:'doc-chat',url:'https://chatgpt.com/c/current'};let answer,errorCode;
  const api={webNavigation:{getFrame:async()=>({...target})},scripting:{executeScript:async({args})=>[
    {frameId:0,documentId:target.documentId,result:!args[0].identityOnly&&errorCode?{ok:false,error:{code:errorCode,message:'rejected'}}:
      {ok:true,url:target.url,...(!args[0].identityOnly?{blocks:[answer]}:{})}}]}};
  const h=controllerHarness({api,demo:false,target});await h.ui.actions.prepareEdit();answer=h.answer();
  for(const failure of ['E_CHAT_STREAMING','E_EDIT_AMBIGUOUS','E_CHAT_TARGET']){
    errorCode=null;await h.ui.actions.readChatGPT();assert.equal(!h.state().proposal,false);
    errorCode=failure;await h.ui.actions.readChatGPT();assert.equal(!h.state().proposal,true);
    assert.equal(!h.state().controls.adopt,true);await h.ui.actions.adopt();assert.equal(h.drafts,0);
  }
});

test('reader excludes CSS-hidden ancestors and detects ancestor streaming state',t=>{
  const text=JSON.stringify(envelope(contextFor(record()).context)),hidden=message('assistant',[text]);
  hidden.parentElement={parentElement:null,closest:()=>null,style:{display:'none'}};
  const visible=message('assistant',[text]),messages=[message('user'),hidden,visible];
  const previous=globalThis.getComputedStyle;globalThis.getComputedStyle=node=>node.style||{display:'block'};
  t.after(()=>{globalThis.getComputedStyle=previous;});
  const read=pageFixture(t,messages);assert.deepEqual(read().blocks,[text]);
  visible.closest=selector=>selector.includes('result-streaming')?{}:null;
  assert.equal(read().error.code,'E_CHAT_STREAMING');
});
