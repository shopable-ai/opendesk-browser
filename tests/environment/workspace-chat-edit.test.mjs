import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createEditContext,parseEditProposal,validateEditProposal,createEditReceipt,EDIT_PROTOCOL} from '../../src/native-agent/workspace-ai-proposal.js';
import {inspectChatGPTEditsOnPage,readChatGPTEdit,isChatGPTURL} from '../../src/native-agent/workspace-chatgpt.js';
import {createWorkspaceChatEdit} from '../../src/native-agent/workspace-chat-edit-ui.js';
import {createMemoryWorkspace,DEMO_WORKSPACE_ID} from '../../src/native-agent/file-workspace-demo.js';

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
