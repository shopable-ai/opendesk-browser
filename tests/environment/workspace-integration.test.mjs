import {officialToolFixture} from '../helpers/official-tools.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {createWorkspaceController} from '../../src/native-agent/workspace.js';
import {createWorkspaceChatEdit} from '../../src/native-agent/workspace-chat-edit-ui.js';
import {AGENT_CONFIG_PROTOCOL} from '../../src/native-agent/protocol.js';
import {SIDEBAR_TOOL_STORE} from '../../src/ui/sidebar-tools/package.js';
import {KNOWLEDGE_WORKSPACE_PREFIX,knowledgePackageHash} from '../../src/knowledge/policy.js';

const A='workspace-00000000-0000-4000-8000-000000000001';
const B='workspace-00000000-0000-4000-8000-000000000002';
const hash=text=>createHash('sha256').update(text).digest('hex');
const event=()=>{const listeners=new Set();return {addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn),
  emit(...args){for(const fn of listeners)fn(...args);},get size(){return listeners.size;}};};
// Native file-service fixture only. The production controller has no document,
// element, focus or virtual DOM adapter; consumers observe immutable snapshots.
async function fixture(t,{noLease=false,knowledgeDraft=false,tree=false,invalidTree=false,previewTool='',previewSource='source-'+('a'.repeat(24)),toolSnapshot=false}={}){
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
  const session={},created=new Map(),previewTabs=[];
  const previewIntent=randomUUID();
  if(previewTool)session['opendesk.tool-workspace-preview.intent.v1:'+previewIntent]={sourceId:previewSource,toolId:previewTool==='auto'?null:previewTool,expiresAt:Date.now()+60000};
  if(toolSnapshot){
    for(const [workspace,id] of [[A,'live-tool'],[B,'second-tool']]){
    const tool={format:'opendesk.sidebar-tool.v1',id,version:'1.0.0',title:'Real source transport',description:'Read only',capabilities:[],html:'<main>Source</main>',css:'',js:'void 0;'};
    const raw=JSON.stringify(tool),sha256=hash(raw),prefix='opendesk-tool-preview/'+id,part=prefix+'/'+sha256+'/part-000.txt';
    const manifest=JSON.stringify({format:'opendesk.tool-snapshot.v1',id:tool.id,version:tool.version,sha256,bytes:Buffer.byteLength(raw),sourceFingerprint:hash('source'),buildId:null,chunks:[{path:part,sha256,bytes:Buffer.byteLength(raw)}]});
    const content={
      'tool.config.json':JSON.stringify({id:tool.id}),[part]:Buffer.from(raw).toString('base64'),
      [prefix+'/'+sha256+'/manifest-'+hash(manifest)+'.json']:manifest,
      [prefix+'/latest.json']:JSON.stringify({format:'opendesk.tool-preview-latest.v1',id:tool.id,version:tool.version,sha256,manifestPath:prefix+'/'+sha256+'/manifest-'+hash(manifest)+'.json',manifestSha256:hash(manifest),buildId:null}),
      [prefix+'/status.json']:JSON.stringify({format:'opendesk.tool-preview-status.v1',id:tool.id,state:'ready',sha256,updatedAt:Date.now(),message:''})};
    for(const [path,text] of Object.entries(content))created.set(workspace+'\0'+path,text);
    }
    api.runtime.getURL=path=>'chrome-extension://'+'a'.repeat(32)+'/'+path;
    api.tabs.create=async row=>{previewTabs.push(row);return {id:91};};
    api.storage.session={get:async key=>({[key]:session[key]}),set:async values=>Object.assign(session,values),remove:async key=>{delete session[key];}};
  }
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
  }
  const faults={},holds=new Map();
  function deferNext(method){
    let release,entered;
    const wait=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
    holds.set(method,{wait,entered});t.after(release);
    return {started,release};
  }
  const client={demo:false,state:async()=>{
    const snapshot={...state};if(mixSession){mixSession=false;state={...state,sessionId:randomUUID()};}return snapshot;
  },request:async(method,params={},expected={})=>{
    calls.push({method,params:{...params},expected:{...expected}});
    const hold=holds.get(method);
    if(hold){holds.delete(method);hold.entered();await hold.wait;}
    if(expected.sessionId!==state.sessionId)throw {code:'E_FILES_SESSION',message:'session changed'};
    if(method==='workspaces.list')return {workspaces:rows.map(r=>({...r}))};
    const grant=rows.find(r=>r.workspaceId===params.workspaceId);
    if(!grant)throw {code:'E_FILES_ACCESS'};
    if(params.leaseEpoch!==(grant.leaseEpoch||''))throw {code:'E_FILES_SESSION'};
    if(method==='files.list'){
      const entry=(name,path,kind)=>({name,path,kind});
      const entries=tree?(params.path===''?[
        entry('README.md','README.md','file'),entry('src','src','directory'),entry('docs','docs','directory')
      ]:params.path==='src'?[entry('app','src/app','directory'),entry('index.ts','src/index.ts','file')]:
        params.path==='src/app'?[entry('page.tsx','src/app/page.tsx','file')]:[]):[
        entry('README.md','README.md','file')];
      if(invalidTree&&params.path==='')entries.push(entry('outside.md','../outside.md','file'));
      return {workspaceId:grant.workspaceId,path:params.path,entries,truncated:false};
    }
    if(method==='files.read'){const content=created.get(grant.workspaceId+'\0'+params.path)??(tree&&params.path==='src/app/page.tsx'?'export default function Page() { return null; }\n':files.get(grant.workspaceId));return {workspaceId:grant.workspaceId,path:params.path,content,sha256:hash(content),bytes:Buffer.byteLength(content)}}
    if(method==='files.create'){
      const key=grant.workspaceId+'\0'+params.path;if(created.has(key)||params.path==='README.md')throw {code:'E_FILES_EXISTS'};
      if(grant.access!=='read-write')throw {code:'E_FILES_ACCESS'};
      created.set(key,params.content);
      if(faults.createUnknown){faults.createUnknown=false;throw {code:'E_FILES_DISCONNECTED',outcome:'OUTCOME_UNKNOWN'};}
      return {saved:true,created:true,workspaceId:grant.workspaceId,path:params.path,sha256:hash(params.content)};
    }
    if(method==='files.write'){
      if(grant.access!=='read-write')throw {code:'E_FILES_ACCESS'};
      if(params.expectedSha256!==hash(files.get(grant.workspaceId)))throw {code:'E_FILES_CONFLICT'};
      files.set(grant.workspaceId,params.content);
      if(faults.writeUnknown){faults.writeUnknown=false;throw {code:'E_FILES_DISCONNECTED',outcome:'OUTCOME_UNKNOWN'};}
      return {saved:true,workspaceId:grant.workspaceId,path:params.path,sha256:hash(params.content)};
    }
    throw Error('unexpected method '+method);
  }};
  let chatContract;
  const savedCalls=[];
  const controller=createWorkspaceController({api,client,
    createChatEdit(options){
      chatContract=options;
      const chat=createWorkspaceChatEdit(options);
      return {...chat,saved(record,committed){savedCalls.push({record,committed});return chat.saved(record,committed);}};
    },
    locationURL:'chrome-extension://'+'a'.repeat(32)+'/native-agent/workspace.html?'+(previewTool?'sourceId='+previewSource+'&previewIntent='+previewIntent:'workspaceId='+A),
    lockManager:{request:async(_name,work)=>work()}});
  t.after(()=>controller.dispose());
  await controller.ready;
  const snapshot=controller.getSnapshot,actions=controller.actions;
  const settle=async()=>{
    const deadline=Date.now()+3000;
    do{await pause(2);if(!snapshot().busy)return;}while(Date.now()<deadline);
    throw Error('Workspace did not settle: '+snapshot().status.text);
  };
  return {controller,snapshot,actions,files,calls,panels,navigation,committed,removed,messages,settle,session,created,faults,deferNext,chatContract,savedCalls,previewTabs,
    get rows(){return rows;},set rows(value){rows=value;},get state(){return state;},set state(value){state=value;},
    mix(){mixSession=true;},select:id=>actions.selectWorkspace(id),edit:actions.setDraft,openFile:(path='README.md')=>actions.read(path)};
}

test('Develop preview intent opens only the exact authorized source and matching tool, without installation or writes',async t=>{
  const h=await fixture(t,{toolSnapshot:true,previewTool:'live-tool'});
  assert.equal(h.previewTabs.length,1);
  assert.match(h.previewTabs[0].url,/sidepanel.html\?previewId=/);
  assert.equal(h.calls.some(row=>['files.write','files.create'].includes(row.method)),false);
  assert.equal(Object.values(h.session).find(row=>row.format==='opendesk.tool-preview-session.v1').sourceId,'source-'+('a'.repeat(24)));
  await h.actions.refresh();assert.equal(h.previewTabs.length,1,'refresh does not reopen a preview');
});
test('Develop installed-tool mismatch refuses the handoff before loading a snapshot',async t=>{
  const h=await fixture(t,{toolSnapshot:true,previewTool:'other-tool'});
  assert.equal(h.previewTabs.length,0);
  assert.match(h.snapshot().presentation.toolPreviewStatus.text,/ID.*不匹配/);
  assert.equal(h.calls.some(row=>row.params.path?.endsWith('/latest.json')),false);
});
test('an unavailable requested preview source never falls back to a different authorized directory',async t=>{
  const h=await fixture(t,{toolSnapshot:true,previewTool:'auto',previewSource:'source-'+('c'.repeat(24))});
  assert.equal(h.previewTabs.length,0);
  await h.select(B);await h.actions.refresh();assert.equal(h.previewTabs.length,0);
  assert.equal(h.calls.some(row=>row.params.path==='tool.config.json'),false);
});
test('explicitly switching Workspace retires the prior installed-tool filter before opening the new tool',async t=>{
  const h=await fixture(t,{toolSnapshot:true,previewTool:'live-tool'});
  assert.equal(h.previewTabs.length,1);
  await h.select(B);assert.equal(h.previewTabs.length,1,'switching alone cannot run UI');
  await h.actions.previewTool({isTrusted:true});
  assert.equal(h.previewTabs.length,2);
  const next=Object.values(h.session).find(row=>row.format==='opendesk.tool-preview-session.v1');
  assert.equal(next.sourceId,'source-'+('b'.repeat(24)));assert.equal(next.tool.id,'second-tool');
});

test('Workspace is DOM-free and publishes busy transitions without owning elements or focus',async t=>{
  const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
  Object.defineProperty(globalThis,'document',{configurable:true,get(){throw Error('Controller touched document');}});
  t.after(()=>{if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;});
  const h=await fixture(t),states=[];
  assert.equal('doc' in h.controller,false);assert.equal('publish' in h.controller,false);
  assert.ok(h.snapshot().presentation.previewHTML.includes('A real-content contract'));
  const stop=h.controller.subscribe(()=>states.push(h.snapshot()));t.after(stop);
  await h.actions.refresh();h.edit('explicitly saved draft');await h.actions.save();
  assert.ok(states.some(state=>state.busy));assert.equal(h.snapshot().busy,false);
  assert.ok(states.every(state=>Object.isFrozen(state)&&Object.isFrozen(state.file)&&Object.isFrozen(state.presentation)));
  const source=readFileSync('src/native-agent/workspace.js','utf8');
  assert.doesNotMatch(source,/getElementById|querySelector|createElement|innerHTML|addEventListener|recoverControlFocus/);
  const revision=h.snapshot().revision;stop();await h.actions.refresh();
  assert.ok(h.snapshot().revision>revision);const count=states.length;h.actions.chooseView('source');assert.equal(states.length,count);
});

test('Workspace invalidates write capabilities when a previously writable grant is revoked or downgraded',async t=>{
  const h=await fixture(t);h.edit('keep this draft');
  h.rows[0].access='read-only';await h.actions.save();
  assert.equal(h.snapshot().capabilities.save,false);
  assert.equal(h.snapshot().file.content,'keep this draft');
  assert.equal(h.calls.filter(call=>call.method==='files.write').length,0);
  await h.actions.refresh();await h.actions.discardDraft();
  h.rows[0].access='read-write';await h.actions.refresh();await h.actions.reread();
  h.edit('keep after revoke');h.rows=[];await h.actions.save();
  assert.equal(h.snapshot().capabilities.save,false);assert.equal(h.snapshot().file.content,'keep after revoke');
  assert.equal(h.calls.filter(call=>call.method==='files.write').length,0);
});

test('Workspace selection A is carried to the file sidebar by verified ID, and saving A cannot affect same-name B',async t=>{
  const h=await fixture(t);
  assert.equal(h.snapshot().workspaceId,A);assert.match(h.snapshot().file.content,/A real/);
  assert.notEqual(h.snapshot().workspaces[0].label,h.snapshot().workspaces[1].label,'same-name directories need distinct labels');
  const opening=h.actions.openSidebar({isTrusted:true});
  assert.equal(h.panels.length,2,'both Chrome calls must enter synchronously while the user gesture is active');
  await opening;
  assert.deepEqual(h.panels[0],{tabId:8,path:'native-agent/workspace.html?workspaceId='+A,enabled:true});
  const originalB=h.files.get(B),initialHash=hash(h.files.get(A)),epoch=h.rows[0].leaseEpoch;
  h.edit('A edited only\n');await h.actions.save();
  assert.equal(h.files.get(A),'A edited only\n');assert.equal(h.files.get(B),originalB);
  const write=h.calls.find(call=>call.method==='files.write');
  assert.equal(write.params.workspaceId,A);assert.equal(write.params.leaseEpoch,epoch);
  assert.equal(write.params.expectedSha256,initialHash);assert.equal(write.expected.sessionId,h.state.sessionId);
  assert.equal(h.calls.at(-1).method,'files.read','success requires a second file-service read');
  await h.select(B);
  assert.equal(h.snapshot().file,null);assert.match(h.snapshot().presentation.fileMeta,/选择左侧文件/);
  assert.equal(h.snapshot().presentation.directoryName,'根目录');
  await h.openFile();assert.equal(h.snapshot().file.content,originalB);
});

test('R37 Workspace restores the root workbench through the same synchronous trusted gesture',async t=>{
  const h=await fixture(t);
  h.actions.openWorkbench({isTrusted:false});assert.deepEqual(h.panels,[]);
  const opening=h.actions.openWorkbench({isTrusted:true});
  assert.deepEqual(h.panels,[{tabId:8,path:'sidepanel.html',enabled:true},{tabId:8}]);
  await opening;
});

test('A to no online directories to B preserves A identity, label and draft until explicit selection',async t=>{
  const h=await fixture(t);h.edit('unsaved A');h.rows=[];await h.actions.refresh();
  assert.equal(h.snapshot().workspaceId,A);assert.equal(h.snapshot().file.content,'unsaved A');
  h.rows=[{workspaceId:B,sourceId:'source-'+'b'.repeat(24),name:'同名目录',access:'read-write',leaseEpoch:randomUUID()}];
  await h.actions.refresh();
  assert.equal(h.snapshot().workspaceId,A);assert.equal(h.snapshot().file.content,'unsaved A');
  assert.match(h.snapshot().presentation.fileMeta,/同名目录/);assert.match(h.snapshot().presentation.draftLabel,/离线草稿/);
  assert.equal(h.snapshot().capabilities.save,false);assert.equal(h.snapshot().capabilities.openSidebar,false);
  assert.equal(h.calls.filter(call=>call.method==='files.read'&&call.params.workspaceId===B).length,0);
  await h.select(B);await h.openFile();assert.equal(h.snapshot().file.content,h.files.get(B));
});

test('same directory with a new lease cannot save a record read in the old lease, including explicit empty epoch',async t=>{
  const h=await fixture(t,{noLease:true});h.edit('stale draft');
  assert.equal(h.calls.find(call=>call.method==='files.read').params.leaseEpoch,'');
  h.rows[0]={...h.rows[0],leaseEpoch:randomUUID()};await h.actions.refresh();await h.actions.save();
  assert.equal(h.calls.filter(call=>call.method==='files.write').length,0);
  assert.match(h.snapshot().status.text,/E_FILES_SESSION/);assert.equal(h.snapshot().file.content,'stale draft');
});

test('a Native state/catalog session mismatch clears operation authority without mixing identities',async t=>{
  const h=await fixture(t);h.edit('retained');h.mix();await h.actions.refresh();
  assert.equal(h.snapshot().capabilities.save,false);assert.equal(h.snapshot().file.content,'retained');
  assert.match(h.snapshot().status.text,/E_FILES_SESSION/);
});

test('SPA round trips and tab removal retire request bindings; disconnect clears authority immediately',async t=>{
  const h=await fixture(t),chat=h.controller.chatEdit;
  chat.actions.setRequestPath('README.md');await chat.actions.prepareFileRequest();assert.ok(chat.getSnapshot().prompt);
  h.navigation.emit({tabId:8,frameId:0,url:'https://chatgpt.com/c/other'});
  h.navigation.emit({tabId:8,frameId:0,url:'https://chatgpt.com/c/current'});await h.settle();
  assert.equal(chat.getSnapshot().prompt,'');assert.equal(chat.getSnapshot().controls.fillContext,false);
  await chat.actions.prepareFileRequest();assert.ok(chat.getSnapshot().prompt);
  h.removed.emit(8);assert.equal(chat.getSnapshot().prompt,'');assert.equal(h.snapshot().targetId,'');
  h.edit('offline retained');
  h.messages.emit({protocol:AGENT_CONFIG_PROTOCOL,type:'files.changed',connected:false},{id:'a'.repeat(32)});
  assert.equal(h.snapshot().capabilities.save,false);assert.equal(h.snapshot().file.content,'offline retained');
  h.state={...h.state,connected:false};await h.settle();
  h.controller.dispose();assert.equal(h.navigation.size,0);assert.equal(h.committed.size,0);assert.equal(h.removed.size,0);assert.equal(h.messages.size,0);
});

test('knowledge handoff enters actual Workspace controller, guards unsaved switching and creates only by explicit action',async t=>{
  const prior=globalThis.confirm;t.after(()=>{globalThis.confirm=prior;});
  globalThis.confirm=()=>{throw Error('browser modal must never run');};
  const h=await fixture(t,{knowledgeDraft:true});
  assert.ok(h.controller.knowledgeHandoff.getSnapshot().pending);
  await h.actions.importKnowledge({isTrusted:true});
  assert.match(h.snapshot().file.content,/来自收件箱/);assert.equal(h.snapshot().capabilities.save,false);
  assert.equal(h.calls.filter(call=>['files.write','files.create'].includes(call.method)).length,0);
  assert.equal(h.controller.knowledgeHandoff.getSnapshot().pending,null);
  assert.equal(h.session[KNOWLEDGE_WORKSPACE_PREFIX+777],undefined,'handoff consumed once after import');
  h.edit('# 已编辑的知识草稿\n\n保留我');
  const switchPending=h.select(B);await pause(5);
  assert.ok(h.snapshot().presentation.actionReview);h.actions.cancelAction();await switchPending;
  assert.equal(h.snapshot().workspaceId,A);
  const opening=h.openFile();await pause(5);
  assert.ok(h.snapshot().presentation.actionReview);h.actions.cancelAction();await opening;
  assert.match(h.snapshot().file.content,/保留我/);
  await h.actions.saveAs();
  assert.equal(h.created.get(A+'\0knowledge.md'),'# 已编辑的知识草稿\n\n保留我');
  const create=h.calls.findIndex(call=>call.method==='files.create');assert.equal(h.calls[create+1].method,'files.read');
  assert.equal(h.snapshot().file.dirty,false);assert.equal(h.snapshot().capabilities.save,false);
  await h.select(B);assert.equal(h.snapshot().workspaceId,B);
});

test('R5.1 Native Workspace uses inline draft reminders without a browser unload modal',()=>{
  const source=readFileSync('src/native-agent/workspace.js','utf8');
  assert.doesNotMatch(source,/globalThis\.confirm\s*\(/);assert.doesNotMatch(source,/addEventListener\(['"]beforeunload/);
  assert.doesNotMatch(source,/event\.returnValue\s*=/);assert.match(source,/关闭页面不再弹窗提醒/);
});

test('R50 native workspace has an in-page decision and no browser confirm on unsaved draft',async t=>{
  const old=globalThis.confirm;t.after(()=>{globalThis.confirm=old;});globalThis.confirm=()=>{throw Error('native modal invoked');};
  const h=await fixture(t,{knowledgeDraft:true});assert.ok(h.controller.knowledgeHandoff.getSnapshot().pending);
  await h.actions.importKnowledge({isTrusted:true});assert.match(h.snapshot().file.content,/来自收件箱/);
  const attempt=h.select(B);await pause(5);
  assert.match(h.snapshot().presentation.actionReview.message,/尚未创建为文件/);
  h.actions.cancelAction();await attempt;
  assert.equal(h.snapshot().workspaceId,A);assert.match(h.snapshot().file.content,/来自收件箱/);
});

test('Workspace file tree keeps parents visible, loads branches on demand and preserves draft on refresh',async t=>{
  const h=await fixture(t,{tree:true}),find=path=>h.snapshot().tree.find(row=>row.path===path);
  assert.ok(find('README.md'));assert.ok(find('src'));assert.ok(find('docs'));assert.equal(find('src').expanded,false);
  assert.equal(h.calls.filter(call=>call.method==='files.list'&&call.params.path==='src').length,0);
  await h.actions.toggleDirectory('src');assert.ok(find('README.md'));assert.ok(find('src/app'));assert.ok(find('src/index.ts'));assert.equal(find('src').expanded,true);
  const listsBefore=h.calls.filter(call=>call.method==='files.list'&&call.params.path==='src').length;
  await h.actions.toggleDirectory('src');assert.equal(find('src/app'),undefined);assert.ok(find('README.md'));
  await h.actions.toggleDirectory('src');assert.equal(h.calls.filter(call=>call.method==='files.list'&&call.params.path==='src').length,listsBefore);
  await h.actions.toggleDirectory('src/app');assert.ok(find('src/app/page.tsx'));assert.ok(find('README.md'));
  await h.openFile('src/app/page.tsx');assert.match(h.snapshot().file.content,/export default/);
  assert.equal(h.snapshot().presentation.fileTitle,'page.tsx');assert.equal(h.snapshot().file.path,'src/app/page.tsx');
  assert.equal(h.snapshot().presentation.directoryName,'/src/app');
  h.edit('locally edited, not saved');await h.actions.refreshTree();
  assert.ok(find('src/app/page.tsx'));assert.equal(h.snapshot().file.content,'locally edited, not saved');
  assert.ok(h.calls.some(call=>call.method==='files.list'&&call.params.path==='src/app'));
  assert.equal(h.calls.filter(call=>call.method==='files.write').length,0);
  h.actions.collapseTree();assert.equal(find('src/app'),undefined);assert.ok(find('src'));assert.ok(find('README.md'));
});

test('Workspace file tree never publishes mismatched Native paths',async t=>{
  const h=await fixture(t,{tree:true,invalidTree:true});assert.match(h.snapshot().status.text,/E_FILES_PROTOCOL/);
  assert.equal(h.snapshot().tree.length,0);assert.equal(h.calls.filter(call=>call.method==='files.read').length,0);
});

test('Workspace file tree separates expansion state on workspace switch',async t=>{
  const h=await fixture(t,{tree:true}),find=path=>h.snapshot().tree.find(row=>row.path===path);
  await h.actions.toggleDirectory('src');assert.ok(find('src/app'));await h.select(B);
  assert.ok(find('src'));assert.equal(find('src/app'),undefined);assert.equal(find('src').expanded,false);
});

test('R23.1 observable Workspace snapshot mirrors real file operations without leaking Native credentials',async t=>{
  const h=await fixture(t),notifications=[];
  assert.equal(h.controller.getSnapshot,h.snapshot);assert.equal('publish' in h.controller,false);
  const stop=h.controller.subscribe(()=>notifications.push(h.snapshot().revision));t.after(stop);
  const ready=h.snapshot();assert.equal(ready.connected,true);assert.equal(ready.workspaceId,A);
  assert.equal(ready.file.path,'README.md');assert.equal(ready.file.dirty,false);
  assert.equal(JSON.stringify(ready).includes(h.state.sessionId),false);assert.equal(JSON.stringify(ready).includes(h.rows[0].leaseEpoch),false);
  assert.equal(h.actions.setDraft('Changed by controller action'),true);
  const edited=h.snapshot();assert.equal(edited.file.content,'Changed by controller action');assert.equal(edited.file.dirty,true);
  await h.actions.save();const saved=h.snapshot();
  assert.equal(saved.file.content,'Changed by controller action');assert.equal(saved.file.dirty,false);assert.equal(h.files.get(A),'Changed by controller action');
  h.actions.chooseView('split');assert.equal(h.snapshot().view,'split');assert.ok(notifications.length>=3);
});

test('unknown save is never replayed and is reconciled only by an explicit disk reread',async t=>{
  const h=await fixture(t);h.edit('write acknowledged only by later readback');h.faults.writeUnknown=true;
  await h.actions.save();assert.equal(h.snapshot().file.unknown,true);assert.equal(h.snapshot().file.dirty,true);
  const count=h.calls.filter(call=>call.method==='files.write').length;
  await h.actions.save();assert.equal(h.calls.filter(call=>call.method==='files.write').length,count);
  await h.actions.reread();assert.equal(h.snapshot().file.unknown,false);assert.equal(h.snapshot().file.dirty,false);
});

test('unknown create stays pending, blocks repeated create and requires checkCreated readback',async t=>{
  const h=await fixture(t);h.actions.setSaveAsPath('new.md');h.faults.createUnknown=true;
  await h.actions.saveAs();assert.equal(h.snapshot().creationPending.path,'new.md');assert.equal(h.snapshot().capabilities.saveAs,false);
  const count=h.calls.filter(call=>call.method==='files.create').length;
  await h.actions.saveAs('another.md');assert.equal(h.calls.filter(call=>call.method==='files.create').length,count);
  await h.actions.checkCreated();assert.equal(h.snapshot().creationPending,null);assert.equal(h.snapshot().file.path,'new.md');assert.equal(h.snapshot().file.dirty,false);
});

test('conflict preserves a draft until explicit disk adoption; switching away retains the original draft',async t=>{
  const h=await fixture(t);h.edit('my draft');await h.select(B);await h.openFile();await h.select(A);await h.openFile();
  assert.equal(h.snapshot().file.content,'my draft');h.files.set(A,'disk changed externally');await h.actions.save();
  assert.equal(h.snapshot().file.content,'my draft');assert.equal(h.snapshot().file.remote.content,'disk changed externally');
  assert.equal(h.files.get(A),'disk changed externally');h.actions.useDisk();assert.equal(h.snapshot().file.content,'disk changed externally');assert.equal(h.snapshot().file.dirty,false);
});

test('typing during a delayed save readback stays editable and cannot be overwritten by the saved bytes',async t=>{
  const h=await fixture(t);h.edit('content at Save click');
  const gate=h.deferNext('files.read'),saving=h.actions.save();await gate.started;
  assert.equal(h.snapshot().busy,true);assert.equal(h.snapshot().capabilities.setDraft,true);
  assert.equal(h.actions.setDraft('typed while Save awaits readback'),true);
  assert.equal(h.snapshot().file.content,'typed while Save awaits readback');gate.release();await saving;
  assert.equal(h.files.get(A),'content at Save click','only the explicit Save snapshot is written');
  assert.equal(h.snapshot().file.content,'typed while Save awaits readback');
  assert.equal(h.snapshot().file.baseContent,'content at Save click');assert.equal(h.snapshot().file.sha256,hash('content at Save click'));
  assert.equal(h.snapshot().file.dirty,true);assert.equal(h.snapshot().file.unknown,false);
  assert.equal(h.snapshot().capabilities.save,true);assert.match(h.snapshot().status.text,/后续编辑/);
  assert.equal(h.savedCalls[0].record.content,'typed while Save awaits readback');
  assert.equal(h.savedCalls[0].committed.content,'content at Save click');
  assert.equal(h.savedCalls[0].committed.sha256,hash('content at Save click'));
  assert.equal(Object.isFrozen(h.savedCalls[0].committed),true);
});

test('saveAs writes its submitted snapshot and carries subsequent typing into the new unsaved draft',async t=>{
  const h=await fixture(t);h.edit('content at Create click');
  const gate=h.deferNext('workspaces.list'),creating=h.actions.saveAs('created.md');await gate.started;
  h.edit('newer typing during create authority check');gate.release();await creating;
  assert.equal(h.created.get(A+'\0created.md'),'content at Create click');
  assert.equal(h.snapshot().file.path,'created.md');assert.equal(h.snapshot().file.content,'newer typing during create authority check');
  assert.equal(h.snapshot().file.baseContent,'content at Create click');assert.equal(h.snapshot().file.dirty,true);
});

test('checkCreated preserves later source draft edits while resolving an unknown create outcome',async t=>{
  const h=await fixture(t);h.edit('created snapshot');h.faults.createUnknown=true;await h.actions.saveAs('later.md');
  const gate=h.deferNext('files.read'),checking=h.actions.checkCreated();await gate.started;
  h.edit('new typing during create verification');gate.release();await checking;
  assert.equal(h.snapshot().creationPending,null);assert.equal(h.snapshot().file.path,'later.md');
  assert.equal(h.created.get(A+'\0later.md'),'created snapshot');assert.equal(h.snapshot().file.baseContent,'created snapshot');
  assert.equal(h.snapshot().file.content,'new typing during create verification');assert.equal(h.snapshot().file.dirty,true);
});

test('reread and explicit discard never replace keystrokes entered while the disk read is pending',async t=>{
  const h=await fixture(t),base=h.snapshot().file.content;
  h.files.set(A,'external disk change');
  const readingGate=h.deferNext('files.read'),reading=h.actions.reread();await readingGate.started;
  h.edit('typed during reread');readingGate.release();await reading;
  assert.equal(h.snapshot().file.content,'typed during reread');assert.equal(h.snapshot().file.baseContent,base);
  assert.equal(h.snapshot().file.remote.content,'external disk change');
  const discardGate=h.deferNext('files.read'),discarding=h.actions.discardDraft();await discardGate.started;
  h.edit('new input after Discard was clicked');discardGate.release();await discarding;
  assert.equal(h.snapshot().file.content,'new input after Discard was clicked');assert.equal(h.snapshot().file.baseContent,'external disk change');
  assert.equal(h.snapshot().file.remote,null);assert.equal(h.snapshot().file.dirty,true);
});

test('delayed AI context reads reject a newly edited draft instead of replacing it or publishing stale context',async t=>{
  const h=await fixture(t),chat=h.controller.chatEdit,base=h.snapshot().file.content;
  chat.actions.setTask('Summarize this file');
  const gate=h.deferNext('files.read'),preparing=chat.actions.prepareEdit();await gate.started;
  assert.equal(h.snapshot().capabilities.setDraft,true);h.edit('typed during AI context read');gate.release();await preparing;
  assert.equal(h.snapshot().file.content,'typed during AI context read');assert.equal(h.snapshot().file.baseContent,base);
  assert.equal(chat.getSnapshot().prompt,'');assert.match(chat.getSnapshot().status.text,/E_EDIT_BASE/);
  assert.equal(h.calls.filter(call=>call.method==='files.write').length,0);
});

test('opening another file does not replace a draft edited while its Native read is pending',async t=>{
  const h=await fixture(t,{tree:true}),gate=h.deferNext('files.read'),opening=h.actions.read('src/app/page.tsx');await gate.started;
  h.edit('continue editing the current file');gate.release();await opening;
  assert.equal(h.snapshot().file.path,'README.md');assert.equal(h.snapshot().file.content,'continue editing the current file');
  assert.match(h.snapshot().status.text,/E_EDIT_BASE/);assert.equal(h.calls.filter(call=>call.method==='files.write').length,0);
});

test('typing during the write itself preserves newer draft bytes while advancing only the committed baseline',async t=>{
  const h=await fixture(t);h.edit('submitted file bytes');
  const gate=h.deferNext('files.write'),saving=h.actions.save();await gate.started;
  h.edit('newer input while write is pending');gate.release();await saving;
  assert.equal(h.files.get(A),'submitted file bytes');assert.equal(h.snapshot().file.content,'newer input while write is pending');
  assert.equal(h.snapshot().file.baseContent,'submitted file bytes');assert.equal(h.snapshot().file.sha256,hash('submitted file bytes'));
  assert.equal(h.snapshot().file.dirty,true);assert.equal(h.savedCalls[0].committed.content,'submitted file bytes');
});

test('Chat file requests recheck the same record after awaiting Native and retain any new draft',async t=>{
  const h=await fixture(t),base=h.snapshot().file.content,gate=h.deferNext('files.read');
  const requesting=h.chatContract.run(()=>assert.rejects(
    h.chatContract.requestFile({operation:'read',path:'README.md'},h.chatContract.getAuthority()),{code:'E_EDIT_BASE'}));
  await gate.started;assert.equal(h.snapshot().busy,true);h.edit('typed during a Chat file request');gate.release();await requesting;
  assert.equal(h.snapshot().file.content,'typed during a Chat file request');assert.equal(h.snapshot().file.baseContent,base);
  assert.equal(h.snapshot().file.dirty,true);assert.equal(h.calls.filter(call=>call.method==='files.write').length,0);
});

test('clean records show changed lease or session identity until an explicit reread binds the current authority',async t=>{
  const h=await fixture(t);
  for(const change of ['lease','session']){
    assert.equal(h.snapshot().file.dirty,false);
    if(change==='lease')h.rows[0]={...h.rows[0],leaseEpoch:randomUUID()};
    else h.state={...h.state,sessionId:randomUUID()};
    await h.actions.refresh();assert.match(h.snapshot().presentation.draftLabel,/目录连接已变化/);
    assert.doesNotMatch(h.snapshot().presentation.draftLabel,/已与磁盘同步/);
    await h.actions.reread();assert.equal(h.snapshot().presentation.draftLabel,'已与磁盘同步');
  }
});

test('reread preserves an edit that returns to the old baseline while the disk has changed',async t=>{
  const h=await fixture(t),base=h.snapshot().file.content;
  h.edit('draft before reread');h.files.set(A,'external disk version');
  const gate=h.deferNext('files.read'),reading=h.actions.reread();await gate.started;
  h.edit(base);gate.release();await reading;
  assert.equal(h.snapshot().file.content,base);
  assert.equal(h.snapshot().file.remote.content,'external disk version');
  assert.equal(h.snapshot().capabilities.save,false);
});

test('explicit reread after reconnect allows a conflicting draft to be saved as a new file',async t=>{
  const h=await fixture(t);h.edit('my retained draft');h.files.set(A,'external disk version');
  h.rows[0]={...h.rows[0],leaseEpoch:randomUUID()};h.state={...h.state,sessionId:randomUUID()};
  await h.actions.refresh();assert.equal(h.snapshot().capabilities.saveAs,false);
  await h.actions.reread();assert.equal(h.snapshot().file.content,'my retained draft');
  assert.equal(h.snapshot().file.remote.content,'external disk version');
  assert.equal(h.snapshot().capabilities.save,false);assert.equal(h.snapshot().capabilities.saveAs,true);
  await h.actions.saveAs('recovered.md');
  assert.equal(h.created.get(A+'\0recovered.md'),'my retained draft');
  assert.equal(h.files.get(A),'external disk version');assert.equal(h.snapshot().file.dirty,false);
  assert.equal(h.calls.filter(call=>call.method==='files.write').length,0);
});

test('unknown create can be explicitly checked after reconnect without replaying the create',async t=>{
  const h=await fixture(t);h.edit('submitted creation');h.faults.createUnknown=true;
  await h.actions.saveAs('pending.md');h.edit('later draft');
  h.rows[0]={...h.rows[0],leaseEpoch:randomUUID()};h.state={...h.state,sessionId:randomUUID()};
  await h.actions.refresh();assert.equal(h.snapshot().capabilities.checkCreated,true);
  assert.equal(h.snapshot().creationPending.path,'pending.md');
  await h.actions.checkCreated();
  assert.equal(h.snapshot().creationPending,null);assert.equal(h.snapshot().file.path,'pending.md');
  assert.equal(h.snapshot().file.baseContent,'submitted creation');assert.equal(h.snapshot().file.content,'later draft');
  assert.equal(h.snapshot().file.dirty,true);assert.equal(h.calls.filter(call=>call.method==='files.create').length,1);
  const read=h.calls.filter(call=>call.method==='files.read').at(-1);
  assert.equal(read.expected.sessionId,h.state.sessionId);assert.equal(read.params.leaseEpoch,h.rows[0].leaseEpoch);
});

test('unknown create cannot be checked through a changed source with the same workspace display identity',async t=>{
  const h=await fixture(t);h.edit('submitted creation');h.faults.createUnknown=true;
  await h.actions.saveAs('pending.md');h.rows[0]={...h.rows[0],sourceId:'source-'+'c'.repeat(24)};
  await h.actions.refresh();assert.equal(h.snapshot().capabilities.checkCreated,false);
  const count=h.calls.filter(call=>call.method==='files.read').length;await h.actions.checkCreated();
  assert.equal(h.calls.filter(call=>call.method==='files.read').length,count);
  assert.equal(h.snapshot().creationPending.path,'pending.md');assert.equal(h.snapshot().file.content,'submitted creation');
});

test('a cached conflict from an old lease cannot replace the draft after reconnect',async t=>{
  const h=await fixture(t);h.edit('keep my draft');h.files.set(A,'old conflict version');await h.actions.save();
  assert.equal(h.snapshot().capabilities.useDisk,true);
  h.rows[0]={...h.rows[0],leaseEpoch:randomUUID()};await h.actions.refresh();
  assert.equal(h.snapshot().capabilities.useDisk,false);h.actions.useDisk();
  assert.equal(h.snapshot().file.content,'keep my draft');
  h.files.set(A,'current disk version');await h.actions.reread();
  assert.equal(h.snapshot().capabilities.useDisk,true);h.actions.useDisk();
  assert.equal(h.snapshot().file.content,'current disk version');assert.equal(h.snapshot().file.dirty,false);
});

test('checking a changed created file opens a recoverable conflict without discarding later edits or rewriting it',async t=>{
  const h=await fixture(t);h.edit('submitted creation');h.faults.createUnknown=true;
  await h.actions.saveAs('pending.md');h.created.set(A+'\0pending.md','externally changed created file');
  h.edit('later draft to retain');await h.actions.checkCreated();
  assert.equal(h.snapshot().creationPending,null);assert.equal(h.snapshot().file.path,'pending.md');
  assert.equal(h.snapshot().file.content,'later draft to retain');
  assert.equal(h.snapshot().file.remote.content,'externally changed created file');
  assert.equal(h.snapshot().capabilities.save,false);assert.equal(h.snapshot().capabilities.saveAs,true);
  assert.equal(h.calls.filter(call=>call.method==='files.create').length,1);
  await h.actions.saveAs('recovered.md');
  assert.equal(h.created.get(A+'\0recovered.md'),'later draft to retain');
  assert.equal(h.created.get(A+'\0pending.md'),'externally changed created file');
  assert.equal(h.calls.filter(call=>call.method==='files.write').length,0);
});
