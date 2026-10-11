import {officialToolFixture} from '../helpers/official-tools.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {initFileWorkspace} from '../../src/native-agent/workspace.js';
import {AGENT_CONFIG_PROTOCOL} from '../../src/native-agent/protocol.js';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {KNOWLEDGE_WORKSPACE_PREFIX,knowledgePackageHash} from '../../src/knowledge/policy.js';

const A='workspace-00000000-0000-4000-8000-000000000001';
const B='workspace-00000000-0000-4000-8000-000000000002';
const hash=text=>createHash('sha256').update(text).digest('hex');
const event=()=>{const listeners=new Set();return {addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),
  emit(...args){for(const fn of listeners)fn(...args);},get size(){return listeners.size;}};};
// Minimal DOM contract used by the real Workspace controller. This suite is
// component integration, not an extension sender or Chrome gesture attestation.
function documentFixture(){
  const nodes=new Map();
  let doc;
  class Element {
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.events=new Map();
      this.attrs={};this.value='';this.textContent='';this.disabled=false;this.hidden=false;
      this.classList={toggle(){},remove(){}};}
    set id(value){this.attrs.id=value;nodes.set(value,this);}get id(){return this.attrs.id;}
    set disabled(value){this._disabled=value;if(value&&doc?.activeElement===this)queueMicrotask(()=>{
      if(this.disabled&&doc?.activeElement===this)doc.activeElement=doc.body;
    });}
    get disabled(){return this._disabled;}
    get isConnected(){return true;}
    getClientRects(){return this.hidden?[]:[{}];}
    focus(){doc.activeElement=this;doc.dispatchEvent(new Event('focusin'));}
    setAttribute(key,value){this.attrs[key]=value;}removeAttribute(key){delete this.attrs[key];}
    append(...values){this.children.push(...values);}replaceChildren(...values){this.children=[...values];}
    addEventListener(type,fn){this.events.set(type,fn);}
    removeEventListener(type,fn){if(this.events.get(type)===fn)this.events.delete(type);}
    querySelectorAll(selector){
      const all=this.id==='file-workspace'?[...nodes.values()]:this.children;
      return all.filter(n=>n.tagName==='BUTTON'&&(!selector.includes('data-view')||n.dataset.view));
    }
    querySelector(selector){
      const suffix=selector.match(/data-path\$="([^"]+)"/)?.[1];
      return this.querySelectorAll(selector).find(n=>!suffix||n.dataset.path?.endsWith(suffix))||null;
    }
  }
  const html=readFileSync(new URL('../../src/native-agent/workspace.html',import.meta.url),'utf8');
  for(const match of html.matchAll(/<([a-z0-9-]+)\b[^>]*\bid="([^"]+)"[^>]*>/gi)){
    const el=new Element(match[1]);el.id=match[2];el.hidden=/\bhidden\b/.test(match[0]);
    const view=match[0].match(/data-view="([^"]+)"/);if(view)el.dataset.view=view[1];
  }
  doc=Object.assign(new EventTarget(),{getElementById:id=>nodes.get(id),createElement:tag=>new Element(tag),
    body:new Element('body'),hidden:false,hasFocus:()=>true});
  doc.activeElement=doc.body;
  return {doc,nodes,Option:function(text,value){const el=new Element('option');el.textContent=text;el.value=value;return el;}};
}
async function fixture(t,{noLease=false,knowledgeDraft=false}={}){
  const {doc,nodes,Option}=documentFixture(),prior={Option:globalThis.Option,location:globalThis.location,addEventListener:globalThis.addEventListener};
  globalThis.Option=Option;
  globalThis.location={href:'chrome-extension://'+'a'.repeat(32)+'/native-agent/workspace.html?workspaceId='+A};
  globalThis.addEventListener=()=>{};
  let state={connected:true,supported:true,sessionId:randomUUID(),devLeaseEpoch:1,maxContentBytes:32768};
  const row=id=>({workspaceId:id,sourceId:'source-'+(id===A?'a':'b').repeat(24),name:'同名目录',access:'read-write',
    accessReason:'temporary-cli',...(noLease?{}:{leaseEpoch:randomUUID()})});
  let rows=[row(A),row(B)],mixSession=false;
  const files=new Map([[A,'A real-content contract\n'],[B,'B separate content\n']]),calls=[],panels=[];
  const messages=event(),navigation=event(),committed=event(),removed=event(),target={tabId:8,documentId:'document-chat',url:'https://chatgpt.com/c/current'};
  const api={runtime:{id:'a'.repeat(32),onMessage:messages},storage:{local:{get:async()=>({}),set:async()=>{}}},
    tabs:{query:async()=>[{id:8,url:target.url,title:'Existing ChatGPT',active:true}],onRemoved:removed},
    webNavigation:{getFrame:async()=>({...target}),onHistoryStateUpdated:navigation,onCommitted:committed},
    scripting:{executeScript:async()=>[{frameId:0,documentId:target.documentId,result:{ok:true,url:target.url,turnKey:'turn-component',answerKey:'answer-component'}}]},
    sidePanel:{setOptions:async value=>panels.push(value),open:async value=>panels.push(value)}};
  const session={},created=new Map();
  if(knowledgeDraft){
    const pkg=await officialToolFixture('knowledge-inbox');
    const markdown='# 来自收件箱\n\n待创建的内容';
    session[KNOWLEDGE_WORKSPACE_PREFIX+777]={version:1,title:'本地知识草稿',filename:'knowledge.md',markdown,
      sha256:hash(markdown),packageHash:await knowledgePackageHash(pkg),expiresAt:Date.now()+600000};
    api.tabs.getCurrent=async()=>({id:777});
  api.storage.local.get=async keys=>Object.fromEntries(
   (Array.isArray(keys)?keys:[keys]).filter(key=>key===SIDEBAR_TOOL_STORE).map(key=>[key,[pkg]])
  );
    api.storage.session={get:async key=>({[key]:session[key]}),remove:async key=>{delete session[key];}};
    const previous=Object.getOwnPropertyDescriptor(globalThis.navigator,'locks');
    Object.defineProperty(globalThis.navigator,'locks',{configurable:true,value:{request:async(_name,work)=>work()}});
    t.after(()=>{if(previous)Object.defineProperty(globalThis.navigator,'locks',previous);else delete globalThis.navigator.locks;});
  }
  const client={demo:false,state:async()=>{
    const snapshot={...state};if(mixSession){mixSession=false;state={...state,sessionId:randomUUID()};}return snapshot;
  },request:async(method,params={},expected={})=>{
    calls.push({method,params:{...params},expected:{...expected}});
    if(expected.sessionId!==state.sessionId)throw {code:'E_FILES_SESSION',message:'session changed'};
    if(method==='workspaces.list')return {workspaces:rows.map(r=>({...r}))};
    const grant=rows.find(r=>r.workspaceId===params.workspaceId);
    if(!grant)throw {code:'E_FILES_ACCESS'};
    if(params.leaseEpoch!==(grant.leaseEpoch||''))throw {code:'E_FILES_SESSION'};
    if(method==='files.list')return {workspaceId:grant.workspaceId,path:params.path,entries:[{path:'README.md',name:'README.md',kind:'file'}],truncated:false};
    if(method==='files.read'){const content=created.get(grant.workspaceId+'\0'+params.path)??files.get(grant.workspaceId);return {workspaceId:grant.workspaceId,path:params.path,content,sha256:hash(content),bytes:Buffer.byteLength(content)};}
    if(method==='files.create'){
      const key=grant.workspaceId+'\0'+params.path;if(created.has(key)||params.path==='README.md')throw {code:'E_FILES_EXISTS'};
      created.set(key,params.content);return {saved:true,created:true,workspaceId:grant.workspaceId,path:params.path,sha256:hash(params.content)};
    }
    if(method==='files.write'){
      if(grant.access!=='read-write')throw {code:'E_FILES_ACCESS'};
      if(params.expectedSha256!==hash(files.get(grant.workspaceId)))throw {code:'E_FILES_CONFLICT'};
      files.set(grant.workspaceId,params.content);return {saved:true,workspaceId:grant.workspaceId,path:params.path,sha256:hash(params.content)};
    }
    throw Error('unexpected method '+method);
  }};
  const get=id=>{assert.ok(nodes.has(id),id);return nodes.get(id);};
  const settle=async()=>{
    const deadline=Date.now()+3000;
    do{await pause(2);if(!get('refresh-connection').disabled)return;}while(Date.now()<deadline);
    throw Error('Workspace did not settle: '+get('workspace-status').textContent);
  };
  const ui=initFileWorkspace({api,doc,client});t.after(()=>{ui.dispose();Object.assign(globalThis,prior);});
  await settle();
  return {doc,get,files,calls,panels,navigation,committed,removed,messages,ui,settle,session,created,
    get rows(){return rows;},set rows(value){rows=value;},get state(){return state;},set state(value){state=value;},
    mix(){mixSession=true;},
    async click(id){get(id).events.get('click')({isTrusted:true});await settle();},
    async select(id){get('workspace-picker').value=id;get('workspace-picker').events.get('change')();await settle();},
    edit(text){get('file-editor').value=text;get('file-editor').events.get('input')();},
    async openFile(){const button=get('file-list').querySelector('button[data-path$="README.md"]');assert.ok(button);button.events.get('click')();await settle();}
  };
}
test('Workspace restores focus lost to busy controls and respects focus moved during the operation',async t=>{
  const h=await fixture(t),refresh=h.get('refresh-connection'),save=h.get('save-file'),editor=h.get('file-editor');
  refresh.focus();await h.click('refresh-connection');
  assert.equal(h.doc.activeElement,refresh,'refresh must restore its temporarily disabled trigger');
  h.edit('explicitly saved draft');save.focus();await h.click('save-file');
  assert.equal(h.doc.activeElement,editor,'a completed Save is disabled, so focus returns to its editable draft');
  refresh.focus();refresh.events.get('click')();editor.focus();await h.settle();
  assert.equal(h.doc.activeElement,editor,'an async response must not take focus from another control');
  refresh.focus();refresh.events.get('click')();editor.focus();h.doc.activeElement=h.doc.body;await h.settle();
  assert.equal(h.doc.activeElement,h.doc.body,'moving focus away and back to BODY still cancels restoration');
  refresh.focus();refresh.events.get('click')();h.doc.hidden=true;h.doc.dispatchEvent(new Event('visibilitychange'));
  h.doc.hidden=false;await h.settle();
  assert.equal(h.doc.activeElement,h.doc.body,'leaving and returning to the document cancels restoration');
});

test('Workspace invalidates visible write controls when a previously writable grant is revoked or downgraded',async t=>{
  const h=await fixture(t);h.edit('keep this draft');
  h.rows[0].access='read-only';await h.click('save-file');
  assert.equal(h.get('save-file').disabled,true,'a rejected old authority must stop presenting Save as available');
  assert.equal(h.get('file-editor').value,'keep this draft');
  assert.equal(h.calls.filter(call=>call.method==='files.write').length,0);
  await h.click('refresh-connection');await h.click('discard-file-draft');
  h.rows[0].access='read-write';await h.click('refresh-connection');await h.click('reload-file');
  h.edit('keep after revoke');h.rows=[];await h.click('save-file');
  assert.equal(h.get('save-file').disabled,true);
  assert.equal(h.get('file-editor').value,'keep after revoke');
  assert.equal(h.calls.filter(call=>call.method==='files.write').length,0);
});

test('Workspace selection A is carried to the file sidebar by verified ID, and saving A cannot affect same-name B',async t=>{
  const h=await fixture(t);
  assert.equal(h.get('workspace-picker').value,A);assert.match(h.get('file-editor').value,/A real/);
  await h.click('open-sidebar');
  assert.deepEqual(h.panels[0],{tabId:8,path:'native-agent/workspace.html?workspaceId='+A,enabled:true});
  const originalB=h.files.get(B),initialHash=hash(h.files.get(A)),epoch=h.rows[0].leaseEpoch;
  h.edit('A edited only\n');await h.click('save-file');
  assert.equal(h.files.get(A),'A edited only\n');assert.equal(h.files.get(B),originalB);
  const write=h.calls.find(call=>call.method==='files.write');
  assert.equal(write.params.workspaceId,A);assert.equal(write.params.leaseEpoch,epoch);
  assert.equal(write.params.expectedSha256,initialHash);assert.equal(write.expected.sessionId,h.state.sessionId);
  assert.equal(h.calls.at(-1).method,'files.read','success requires a second file-service read');
  await h.select(B);await h.openFile();assert.equal(h.get('file-editor').value,originalB);
});
test('A to no online directories to B preserves A identity, label and draft until explicit selection',async t=>{
  const h=await fixture(t);h.edit('unsaved A');
  h.rows=[];await h.click('refresh-connection');
  assert.equal(h.get('workspace-picker').value,A);assert.equal(h.get('file-editor').value,'unsaved A');
  h.rows=[{workspaceId:B,sourceId:'source-'+'b'.repeat(24),name:'同名目录',access:'read-write',leaseEpoch:randomUUID()}];
  await h.click('refresh-connection');
  assert.equal(h.get('workspace-picker').value,A);assert.equal(h.get('file-editor').value,'unsaved A');
  assert.match(h.get('file-meta').textContent,/同名目录/);assert.match(h.get('draft-label').textContent,/离线草稿/);
  assert.equal(h.get('save-file').disabled,true);assert.equal(h.get('open-sidebar').disabled,true);
  assert.equal(h.calls.filter(call=>call.method==='files.read'&&call.params.workspaceId===B).length,0);
  await h.select(B);await h.openFile();assert.equal(h.get('file-editor').value,h.files.get(B));
});
test('same directory with a new lease cannot save a record read in the old lease, including explicit empty epoch',async t=>{
  const h=await fixture(t,{noLease:true});h.edit('stale draft');
  assert.equal(h.calls.find(call=>call.method==='files.read').params.leaseEpoch,'');
  h.rows[0]={...h.rows[0],leaseEpoch:randomUUID()};
  await h.click('refresh-connection');await h.click('save-file');
  assert.equal(h.calls.filter(call=>call.method==='files.write').length,0);
  assert.match(h.get('workspace-status').textContent,/E_FILES_SESSION/);
  assert.equal(h.get('file-editor').value,'stale draft');
});
test('a Native state/catalog session mismatch clears operation authority without mixing identities',async t=>{
  const h=await fixture(t);h.edit('retained');h.mix();await h.click('refresh-connection');
  assert.equal(h.get('save-file').disabled,true);assert.equal(h.get('file-editor').value,'retained');
  assert.match(h.get('workspace-status').textContent,/E_FILES_SESSION/);
});
test('SPA round trips and tab removal retire request bindings; disconnect clears authority immediately',async t=>{
  const h=await fixture(t);
  h.get('chat-request-path').value='README.md';await h.click('prepare-file-request');assert.ok(h.get('edit-context').value);
  h.navigation.emit({tabId:8,frameId:0,url:'https://chatgpt.com/c/other'});
  h.navigation.emit({tabId:8,frameId:0,url:'https://chatgpt.com/c/current'});await h.settle();
  assert.equal(h.get('edit-context').value,'');assert.equal(h.get('fill-chat-context').disabled,true);
  await h.click('prepare-file-request');assert.ok(h.get('edit-context').value);
  h.removed.emit(8);assert.equal(h.get('edit-context').value,'');assert.equal(h.get('target-picker').value,'');
  h.edit('offline retained');
  h.messages.emit({protocol:AGENT_CONFIG_PROTOCOL,type:'files.changed',connected:false},{id:'a'.repeat(32)});
  assert.equal(h.get('save-file').disabled,true);assert.equal(h.get('file-editor').value,'offline retained');
  h.state={...h.state,connected:false};await h.settle();
  h.ui.dispose();assert.equal(h.navigation.size,0);assert.equal(h.committed.size,0);assert.equal(h.removed.size,0);
});

test('knowledge handoff enters actual Workspace controller, guards unsaved switching and creates only by explicit action',async t=>{
  const prior=globalThis.confirm;t.after(()=>{globalThis.confirm=prior;});globalThis.confirm=()=>true;
  const h=await fixture(t,{knowledgeDraft:true});
  for(let i=0;i<20&&h.get('knowledge-handoff').hidden;i++)await pause(2);
  assert.equal(h.get('knowledge-handoff').hidden,false);
  await h.click('knowledge-handoff-import');
  for(let i=0;i<20&&!h.get('file-editor').value.includes('来自收件箱');i++)await pause(2);
  assert.match(h.get('file-editor').value,/来自收件箱/);
  assert.equal(h.get('save-file').disabled,true,'import never overwrites an existing file');
  assert.equal(h.calls.filter(call=>['files.write','files.create'].includes(call.method)).length,0);
  h.edit('# 已编辑的知识草稿\n\n保留我');globalThis.confirm=()=>false;
  await h.select(B);assert.equal(h.get('workspace-picker').value,A);
  await h.openFile();assert.match(h.get('file-editor').value,/保留我/);
  await h.click('save-as');
  assert.equal(h.created.get(A+'\0knowledge.md'),'# 已编辑的知识草稿\n\n保留我');
  const create=h.calls.findIndex(call=>call.method==='files.create');
  assert.equal(h.calls[create+1].method,'files.read','successful create requires readback');
  assert.equal(h.get('save-file').disabled,true,'newly created file is clean');
  await h.select(B);assert.equal(h.get('workspace-picker').value,B);
});


test('R5.1 Native Workspace does not request a Chrome beforeunload dialog for knowledge drafts',()=>{
  const source=readFileSync('src/native-agent/workspace.js','utf8');
  assert.doesNotMatch(source,/addEventListener\(['\"]beforeunload/);
  assert.doesNotMatch(source,/event\.returnValue\s*=/);
  assert.match(source,/关闭页面不再弹窗提醒/);
});
