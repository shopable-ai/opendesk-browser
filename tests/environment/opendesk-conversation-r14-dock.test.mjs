import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(path,'utf8');
const bookmark='examples/sidebar-tools/bookmark-manager/';
const appPath=bookmark+'src/react/App.jsx';

function appConversationFixture(app,conversation,{draft=null,loop=async()=>({})}={}){
 const tree={byId:new Map([['1',{id:'1'}]])};
 const state={tree,draft,reads:0,writes:0,loops:0};
 const noop=()=>{};
 const env={tree,loading:false,selectedId:null,isFolder:()=>true,conversation,
  bookmarkConversationContext:()=>({}),sdk:{page:{getContext:async()=>null}},mode:'trusted',
  uncertainRef:{current:false},busyRef:{current:false},draftRef:{current:draft},
  activeRef:{current:true},authorityEpoch:{current:0},writeEpoch:{current:0},readEpoch:{current:0},
  interactionEpoch:{current:0},dockRef:{current:null},setBusy:noop,setLoading:noop,
  setTree:value=>{state.tree=value;},setDraft:value=>{state.draft=value;env.draftRef.current=value;},
  setUncertain:value=>{env.uncertainRef.current=value;},setError:noop,setNotice:noop,
  setSelectedId:noop,setPreviewOpen:noop,setMenu:noop,setPickerOpen:noop,setConfirmDiscard:noop,
  humanError:error=>error.message,
  service:{load:async()=>{state.reads++;return tree;},createFolder:async()=>{state.writes++;}},
  runBookmarkAgentLoop:async options=>{state.loops++;return loop(options,env);}};
 const bind=(from,to,prefix='')=>{
  const start=app.indexOf(from),end=app.indexOf(to,start+from.length);
  assert.ok(start>=0&&end>start,'find production App callback: '+from);
  return Function(...Object.keys(env),'return ('+prefix+app.slice(start+from.length,end)+');')(...Object.values(env));
 };
 env.authorityDenied=bind('function authorityDenied','\n// Existing imported Chrome bookmarks','function authorityDenied');
 env.revoke=bind(' const revoke=useCallback(',',[]);');
 const refresh=bind(' const load=useCallback(',',[service,revoke]);');
 const run=(signal=new AbortController().signal)=>{
  const start=app.indexOf(' async function runBookmarkConversation(');
  const end=app.indexOf('\n function setDraft(',start);
  assert.ok(start>=0&&end>start);
  const action=Function(...Object.keys(env),'return ('+app.slice(start,end)+');')(...Object.values(env));
  return action({request:'查找 React 书签',refs:{},signal,event:{isTrusted:true}});
 };
 return {state,env,run,refresh};
}

test('R1.4 one trusted Root and one reusable bottom Dock, no new sandbox escalation',async()=>{
 const [host,shell,admission,component]=await Promise.all([
  read('src/ui/react/main.tsx'),read('src/ui/sidebar-tools.js'),
  read('src/ui/trusted-bookmark-admission.js'),
  read('src/ui/react/components/conversation.tsx')]);
 assert.equal((host.match(/createRoot\(/g)||[]).length,1,'one official React Root');
 assert.match(host,/createPortal\(<[\s\S]*?TrustedConversationWorkspace/);
 assert.match(host,/controller=\{bookmarkPilot\.runtime\.conversation\}/);
 assert.match(host,/import conversationDockCSS from '\.\/components\/conversation-dock\.css\?raw'/);
 assert.match(shell,/admittedNativeBookmark\(tool,frameRevocationEpoch\)\.then\(admitted=>/);
 assert.match(shell,/if\(!admitted\)\{\s*mountTool\(tool,\{forceSandbox:true\}\)/);
 assert.match(shell,/frame=doc\.createElement\('iframe'\)/,'sandbox fallback remains');
 assert.match(admission,/matchesOfficialRelease\(release,tool\)/);
 assert.match(admission,/expectedEpoch!==actualEpoch/);
 assert.match(component,/export function TrustedConversationWorkspace/);
 assert.match(host,/const scopedConversation=conversation\?Object\.freeze\(/);
 assert.match(host,/refs:\{folderId:null,bookmarkId:null,matches:\[\]\}/,
  'new mount discards previous executable bookmark references');
 assert.doesNotMatch(component,/BookmarkR2Service|executeBookmarkPlan|\.bookmarks\.|generateStructured\(/,
  'shared dock has no bookmark business/SDK/Provider implementation');
 assert.doesNotMatch(component,/\beval\(|new Function\(|createRoot\(/,'no execution engine/root in dock');
});

test('R1.4 original bookmark workspace and search never disappear with chat',async()=>{
 const [app,css,component]=await Promise.all([read(appPath),
  read('src/ui/react/components/conversation-dock.css'),read('src/ui/react/components/conversation.tsx')]);
 assert.match(app,/<div className="bm-tools">/);
 assert.match(app,/<div className="bm-workspace">/);
 assert.doesNotMatch(app,/hidden=\{chatOpen\}|className="bm-conversation"|id="bm-conversation"/);
 assert.doesNotMatch(app,/label="对话"[\s\S]*aria-controls="opendesk-conversation-dock"/);
 const toolHost=await read('src/ui/react/tabs/tool-host.tsx');
 assert.equal((toolHost.match(/<TrustedConversationHeaderSlot\/>/g)||[]).length,1,
  'ToolHost retains exactly one trusted Chat entry');
 assert.match(toolHost,/<TrustedConversationHeaderSlot\/>\s*<div className="sidebar-tool-header-more"/,
  'trusted Chat entry stays in the ToolHost toolbar beside the existing more menu');
 assert.match(toolHost,/<div id="sidebar-tool-more-menu"[\s\S]*?<ToolField as="button" type="button" id="sidebar-tool-remove"/,
  'uninstall stays in the ToolHost overflow menu');
 assert.match(await read('src/ui/react/components/conversation.tsx'),/createPortal\(/);
 assert.match(css,/\.od-conversation-business\{min-height:0;min-width:0;flex:1/);
 assert.match(css,/\.od-conversation-dock\{[^\n]*flex:none/);
 assert.match(css,/\.od-conversation-log\{min-height:0;flex:1 1 auto;overflow:auto/);
 assert.match(css,/\.od-conversation-composer\{display:grid/);
 assert.match(css,/--od-brand/);
 assert.match(css,/\.od-conversation-input\{grid-area:1\/1/,'composer textarea owns the same grid cell');
 assert.match(css,/\.od-conversation-action\{position:relative;z-index:1;grid-area:1\/1/,
  'Send and Stop align to the textarea, not to composer padding');
 assert.match(css,/\.od-conversation-dragbar\{[^\n]*flex:0 0 12px/,'visual splitter is slim');
 assert.match(css,/\.od-conversation-separator\{[^\n]*touch-action:none/,'slim visual splitter remains draggable');
 assert.doesNotMatch(css,/\.od-conversation-separator\{[^\n]*border-bottom/,'avoid doubled visual separator lines');
 assert.match(component,/IconButton as OpenDeskIconButton/,'reuse the canonical React icon button');
 assert.match(component,/label="发送"/);
  assert.match(component,/const submit=event=>\{\s*event\.preventDefault\(\)/,
   'the original trusted user Submit event owns the send guard');
  assert.match(component,/const composer=<form className="od-conversation-composer" onSubmit=\{submit\}>/,
   'the shared frame submits through the original form handler');
  assert.match(component,/type="submit" title="发送消息" label="发送"/,
   'the Send icon remains a native submit control without a duplicate click dispatcher');
  assert.match(component,/onSend\(event\)/,'trusted Send remains the only business dispatch');
 assert.match(component,/label="停止对话"/);
  assert.match(component,/onStop\(event\)/,'Stop delegates to the current consumer only');
 assert.doesNotMatch(css,/\.od-conversation-controls/,'no second action row');
});

test('R1.4 shared separator and edit draft coexistence retain keyboard access and input',async()=>{
 const [app,component,css]=await Promise.all([read(appPath),
  read('src/ui/react/components/conversation.tsx'),read(bookmark+'src/react/style.css')]);
 assert.match(component,/role="separator" tabIndex=\{0\}/);
 assert.match(component,/aria-valuemin=\{limits\.min\} aria-valuemax=\{limits\.max\}/);
 assert.match(component,/e\.key==='ArrowUp'/);
 assert.match(component,/e\.key==='ArrowDown'/);
 assert.match(component,/e\.key==='Home'/);
 assert.match(component,/e\.key==='End'/);
 assert.match(component,/onPointerDown=\{separatorDown\}/);
 assert.match(component,/event\.nativeEvent\?\.isComposing/);
  assert.match(component,/onCompositionStart=/);
  assert.match(component,/onCompositionEnd=/);
 assert.match(component,/event\.key==='Enter'&&!event\.shiftKey&&!event\.nativeEvent\?\.isComposing/);
  assert.match(component,/!composing\.current&&event\.nativeEvent\?\.keyCode!==229/);
 assert.match(component,/aria-label="收起对话"/);
 assert.match(component,/showSpeaker=\{false\}/,'shared transcript removes redundant visible speaker labels');
 assert.doesNotMatch(component,/od-conversation-samples|od-conversation-source/);
 assert.match(component,/controller\?\.saveSession/);
 assert.match(app,/hasDock=\{Boolean\(dock\)\}/);
 assert.match(app,/aria-modal=\{!hasDock\}/);
 assert.match(css,/\.bm-sheet-backdrop\[data-sharing="true"\]\{position:absolute;inset:0\}/);
 assert.doesNotMatch(app,/if\(draft\)\{setError\('请先完成或取消当前书签编辑/);
});

test('R1.4 Send pins bookmark IDs; writing blocks conflicting draft and follows verified steps',async()=>{
 const [app,actions,component]=await Promise.all([
  read(appPath),read('src/ui/conversation/bookmark-actions.js'),
  read('src/ui/react/components/conversation.tsx')]);
 assert.match(app,/const pinned=\{selectedId,currentFolderId:pinnedFolder,refs:/);
 assert.match(app,/bookmarkConversationContext\(tree,pinned\)/);
 assert.match(app,/conversation\.request\(\{request,context:publicContext,signal,event\}\)/);
 assert.match(app,/if\(draftRef\.current\|\|uncertainRef\.current\)/);
 assert.match(app,/runBookmarkAgentLoop\(\{\s*goal:request,initialProposal:initial\.proposal,service,context,refs:pinned\.refs/);
 assert.match(app,/expectedTree:tree,signal:authorization\?\.signal\|\|signal/);
 assert.match(app,/beforeWrite:authorization\?\.assertWrite&&beforeWrite/);
 assert.match(app,/if\(step\.tree\)setTree\(step\.tree\)/);
 assert.match(app,/onStep\?\.\(\{message:step\.message,refs:step\.refs\}\)/);
 assert.match(actions,/nextRefs\.folderId=found\.id/);
 assert.match(actions,/tree=await service\.load\(\)/);
 assert.match(actions,/if\(!found\|\|nodeFolder\(found\)/);
 assert.match(component,/onPhase:next=>\{if\(current\(\)\)\{phaseRef\.current=next;setPhase\(next\);\}\}/);
 assert.match(component,/const writeUnknown=ex\?\.code==='E_OUTCOME_UNKNOWN'\|\|ex\?\.writeIssued===true/);
 assert.match(component,/if\(writeUnknown\)setNeedsReview\(true\)/,
  'issued or uncertain writes still enter recovery review');
 assert.match(component,/if\(!unknown&&!ex\?\.partial\?\.length/);
 assert.match(component,/controller\?\.cancel\?\.\(\{signal\}\)/);
});

test('R1.4 App hands the loop its pinned page and authority, and guards late edit conflicts',async()=>{
 const app=await read(appPath),start=app.indexOf(' async function runBookmarkConversation(');
 const end=app.indexOf('\n function setDraft(',start);
 assert.ok(start>=0&&end>start,'exercise the production App adapter without mounting React');
 for(const conflict of [null,'draft','unknown']){
  const parent=new AbortController(),authority=new AbortController();
  const pageContext={url:'https://example.org/',tabRef:'real_tab_ref_123456',documentRef:'real_doc_ref_123456'};
  const refs={folderId:null,bookmarkId:null,matches:[]};
  let checks=0,releases=0,dispatches=0;
  const env={tree:{byId:new Map([['1',{id:'1'}]])},loading:false,
   uncertainRef:{current:false},busyRef:{current:false},draftRef:{current:null},
   activeRef:{current:true},authorityEpoch:{current:0},writeEpoch:{current:0},readEpoch:{current:0},
   interactionEpoch:{current:0},selectedId:null,service:{},mode:'trusted',
   isFolder:()=>true,bookmarkConversationContext:()=>({}),
   sdk:{page:{getContext:()=>pageContext}},setBusy:()=>{},setLoading:()=>{},
   authorityDenied:()=>false,
   conversation:{request:async()=>({proposal:{actions:[]},continueWith:async()=>({}),
    authorization:{signal:authority.signal,assertWrite:async()=>{checks++;},release:()=>{releases++;}}})},
   runBookmarkAgentLoop:async options=>{
    assert.equal(options.goal,'收藏当前网页');
    assert.equal(options.context.pageContext,pageContext,'use SDK page binding, not Provider data');
    assert.equal(options.signal,authority.signal,'revocation must reach the loop');
    assert.equal(options.expectedTree,env.tree);
    assert.deepEqual(options.refs,refs);
    assert.equal(env.busyRef.current,true,'task lock remains held while the loop runs');
    if(conflict==='draft')env.draftRef.current={title:'unsaved'};
    if(conflict==='unknown')env.uncertainRef.current=true;
    await options.beforeWrite();
    dispatches++;
    return {refs};
   }};
  const action=Function(...Object.keys(env),'return ('+app.slice(start,end)+');')(...Object.values(env));
  const pending=action({request:'收藏当前网页',refs,signal:parent.signal,event:{isTrusted:true}});
  if(conflict)await assert.rejects(pending,error=>error.code==='E_DRAFT_CONFLICT');
  else assert.deepEqual(await pending,{question:null,refs});
  assert.equal(dispatches,conflict?0:1);
  assert.equal(checks,conflict?0:1);
  assert.equal(releases,1,'release the original authority even when the write guard rejects');
  assert.equal(env.busyRef.current,false);
 }
});

test('R2.1.1 switching Provider during inference preserves bookmark data, draft and refresh',async t=>{
 const {createWorkflowView}=await import('../../src/ui/workflow/workflow-view.js');
 let resolveResponse,entered;
 const started=new Promise(resolve=>{entered=resolve;});
 const response=()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{
  content:'{"question":"请选择文件夹"}'}}]}),{status:200});
 let fetches=0;
 t.mock.method(globalThis,'fetch',()=>{
  if(++fetches>1)return Promise.resolve(response());
  entered();return new Promise(resolve=>{resolveResponse=resolve;});
 });
 const storage={get:async()=>({}),set:async()=>{}};
 const api={storage:{session:storage,local:storage},permissions:{request:async()=>true,contains:async()=>true,
  onRemoved:{addListener(){},removeListener(){}}}};
 const client={ready:Promise.resolve(),subscribeWorkflowAI:()=>()=>{},
  requestWorkflowAI:async()=>({nativeConnected:false,protocolAvailable:false})};
 const view=createWorkflowView({api,client,host:{subscribe:()=>()=>{},controller:{}},document:null});
 t.after(()=>{resolveResponse?.(response());view.dispose();});
 const input=(id,value,type='input')=>view.actions.input(id,value,{isTrusted:true},type);
 const choose=provider=>input('workflow-ai-provider',provider,'change');
 choose('custom_https');input('workflow-ai-endpoint','https://model.example/v1/chat/completions');
 input('workflow-ai-key','fixture-key');input('workflow-ai-model','fixture-model');
 const draft={title:'未保存的编辑'},app=await read(appPath);
 const f=appConversationFixture(app,view.conversation,{draft,
  loop:async options=>({question:options.initialProposal.question})});
 const tree=f.state.tree;
 const rejected=assert.rejects(f.run(),{code:'E_AI_CONTEXT_CHANGED'});
 await started;choose('local_codex');resolveResponse(response());await rejected;
 assert.equal(f.state.loops,0);assert.equal(f.state.writes,0);
 assert.equal(f.state.tree,tree);assert.equal(f.state.draft,draft);
 assert.equal(f.env.authorityEpoch.current,0);assert.equal(f.env.busyRef.current,false);
 assert.equal(await f.refresh(),tree);assert.equal(f.state.reads,1);
 choose('custom_https');
 assert.deepEqual(await f.run(),{question:'请选择文件夹',refs:undefined});
 assert.equal(f.state.writes,0,'old request never dispatches after a new round starts');
});

test('R2.1.1 nextProposal forwards the same task signal and options to the Provider continuation',async()=>{
 const task=new AbortController(),authority=new AbortController();
 const nextContext={progress:[{round:1}]},options={signal:task.signal};
 const proposal={question:'请选择文件夹'};let calls=0,releases=0;
 const conversation={request:async()=>({proposal:{},
  continueWith:async(context,received)=>{
   calls++;
   assert.equal(context,nextContext);
   assert.equal(received,options,'forward the original loop options object');
   assert.equal(received.signal,task.signal,'retain the task deadline AbortSignal');
   assert.notEqual(received.signal,authority.signal,'do not substitute the round authority signal');
   task.abort();assert.equal(received.signal.aborted,true);
   return proposal;
  },authorization:{signal:authority.signal,assertWrite:async()=>{},release:()=>{releases++;}}})};
 const f=appConversationFixture(await read(appPath),conversation,{loop:async loop=>{
  assert.equal(await loop.nextProposal(nextContext,options),proposal);
  return {};
 }});
 await f.run();
 assert.equal(calls,1);assert.equal(releases,1);assert.equal(f.state.writes,0);
});

for(const boundary of ['beforeWrite','nextAuthorization','continueWith']){
 test('R2.1.1 Provider '+boundary+' failure stops the round without revoking bookmarks',async()=>{
  const error=Object.assign(Error('AI conversation changed'),{code:'E_TOOL_CHANGED'});
  let releases=0;
  const conversation={request:async()=>({proposal:{},
   continueWith:async()=>{if(boundary==='continueWith')throw error;return {};},
   authorization:{signal:new AbortController().signal,
    assertWrite:async()=>{if(boundary!=='continueWith')throw error;},release:()=>{releases++;}}})};
  const f=appConversationFixture(await read(appPath),conversation,{loop:async(options,env)=>{
   if(boundary==='beforeWrite')await options.beforeWrite();
   else await options.nextProposal({});
   await env.service.createFolder();return {};
  }});
  const tree=f.state.tree;
  await assert.rejects(f.run(),failure=>failure.code==='E_AI_CONTEXT_CHANGED'&&failure.cause===error);
  assert.equal(f.state.writes,0);assert.equal(releases,1);
  assert.equal(f.state.tree,tree);assert.equal(f.env.authorityEpoch.current,0);
  assert.equal(await f.refresh(),tree);
 });
}

for(const code of ['E_TOOL_CHANGED','E_TOOL_DISABLED','E_GRANT_REVOKED','E_BOOKMARK_PERMISSION']){
 test('R2.1.1 bookmark Service lifecycle '+code+' still revokes the instance',async()=>{
  const failure=Object.assign(Error('Bookmark SDK denied this instance'),{code});
  let releases=0;
  const conversation={request:async()=>({proposal:{},continueWith:async()=>({}),
   authorization:{signal:new AbortController().signal,assertWrite:async()=>{},release:()=>{releases++;}}})};
  const f=appConversationFixture(await read(appPath),conversation,{draft:{title:'unsaved'},
   loop:async(options,env)=>{await env.service.load();await env.service.createFolder();return {};}});
  f.env.service.load=async()=>{throw failure;};
  await assert.rejects(f.run(),error=>error===failure);
  assert.equal(f.state.tree,null);assert.equal(f.state.draft,null);
  assert.equal(f.env.authorityEpoch.current,1);assert.equal(f.env.uncertainRef.current,true);
  assert.equal(f.state.writes,0);assert.equal(releases,1);
  assert.equal(await f.refresh(),null);assert.equal(f.state.reads,0);
 });
}

for(const code of ['E_CANCELLED','E_MODEL_GRANT_REVOKED']){
 test('R2.1.1 '+code+' still stops before business execution and preserves bookmark access',async()=>{
  const parent=new AbortController(),authority=new AbortController();
  const reason=Object.assign(Error(code),{code});let releases=0;
  const conversation={request:async()=>{
   (code==='E_CANCELLED'?parent:authority).abort(reason);
   return {proposal:{},continueWith:async()=>({}),authorization:{signal:authority.signal,
    assertWrite:async()=>{},release:()=>{releases++;}}};
  }};
  const draft={title:'unsaved'},f=appConversationFixture(await read(appPath),conversation,{draft});
  const tree=f.state.tree;
  await assert.rejects(f.run(parent.signal),{code});
  assert.equal(f.state.writes,0);assert.equal(f.state.loops,0);assert.equal(releases,1);
  assert.equal(f.state.tree,tree);assert.equal(f.state.draft,draft);
  assert.equal(f.env.authorityEpoch.current,0);assert.equal(f.env.busyRef.current,false);
 });
}

for(const change of ['unmount','instanceEpoch']){
 test('R2.1.1 '+change+' during authorization still denies the next write',async()=>{
  let entered,finish,releases=0;
  const started=new Promise(resolve=>{entered=resolve;}),pending=new Promise(resolve=>{finish=resolve;});
  const conversation={request:async()=>({proposal:{},continueWith:async()=>({}),
   authorization:{signal:new AbortController().signal,assertWrite:async()=>{entered();await pending;},
    release:()=>{releases++;}}})};
  const f=appConversationFixture(await read(appPath),conversation,{loop:async(options,env)=>{
   await options.beforeWrite();await env.service.createFolder();return {};
  }});
  const rejected=assert.rejects(f.run(),{code:'E_GRANT_REVOKED'});
  await started;
  if(change==='unmount')f.env.activeRef.current=false;
  else f.env.writeEpoch.current++;
  finish();await rejected;
  assert.equal(f.state.writes,0);assert.equal(releases,1);
 });
}

test('R1.4 preview reuses production App and shared Dock and labels Mock honestly',async()=>{
 const [preview,builder,main]=await Promise.all([
  read(bookmark+'preview/react/src/main.jsx'),
  read(bookmark+'preview/react/build-preview.mjs'),
  read('src/ui/react/main.tsx')]);
 assert.match(preview,/from '\.\.\/\.\.\/\.\.\/src\/react\/App\.jsx'/);
 assert.match(preview,/TrustedConversationWorkspace controller=\{conversation\} headerTarget=\{headerTarget\}/);
 assert.match(preview,/<App runtime=\{\{conversation\}\} mode="preview" dock=\{dock\}\/>/);
 assert.match(preview,/offline/);
 assert.doesNotMatch(preview,/离线演示（非真实 AI）|模拟书签读回（非 Chrome）|title="书签对话"/);
 assert.match(preview,/provider:'offline_fixture'/,'offline fixture identity is retained internally');
 assert.match(preview,/nativeVerified:false/,'fixture never claims installed/native behavior');
 assert.match(preview,/title="AI 对话" placeholder/);
 assert.match(builder,/join\(root,'src\/ui\/react\/components\/conversation-dock\.css'\)/);
 assert.match(main,/mode="trusted" runtime=\{bookmarkPilot\.runtime\}/);
 assert.match(main,/cancel:options=>conversation\.cancel\(options\)/,'Host must forward the exact Stop signal to the existing Workflow controller');
});

// Use the existing React + LinkeDOM approach, compiling only these two TSX
// modules in memory. No product build, browser, Provider or bookmark writes.
let dockReactModules;
async function dockReactFixture(t,{action,session={}}={}){
 const [{parseHTML},React]=await Promise.all([import('linkedom'),import('react')]);
 const {window,document}=parseHTML('<html><body><div id="mount"></div></body></html>');
 const previous={window:globalThis.window,document:globalThis.document,
  act:globalThis.IS_REACT_ACT_ENVIRONMENT};
 globalThis.window=window;globalThis.document=document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 document.oninput=null;
 if(!dockReactModules)dockReactModules=(async()=>{
  const {transform}=await import('esbuild');
  const compile=async(path,replacements)=>{
   const result=await transform(await read(path),{loader:'tsx',format:'esm',jsx:'transform'});
   let code=result.code;
   for(const [from,to] of Object.entries(replacements))
    code=code.replaceAll(JSON.stringify(from),JSON.stringify(to));
   return 'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
  };
  const button=await compile('src/ui/react/components/ui/button.tsx',{'react':import.meta.resolve('react')});
  return import(await compile('src/ui/react/components/conversation.tsx',{
   'react':import.meta.resolve('react'),'react-dom':import.meta.resolve('react-dom'),
   './ui/button.tsx':button}));
 })();
 const components=await dockReactModules;
 const {createRoot}=await import('react-dom/client');
 const root=createRoot(document.getElementById('mount'));
 const state={session:null,cancels:[],bridge:null};
 const controller={readSession:()=>({open:true,draft:'收藏当前网页',rows:[],...session}),
  saveSession:value=>{state.session=value;},request:()=>{},cancel:args=>{state.cancels.push(args);}};
 t.after(async()=>{
  await React.act(async()=>root.unmount());
  await new Promise(resolve=>setImmediate(resolve));
  globalThis.window=previous.window;globalThis.document=previous.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT=previous.act;
 });
 await React.act(async()=>root.render(React.createElement(components.TrustedConversationWorkspace,{
  controller,renderBusiness:bridge=>{
   state.bridge=bridge;bridge.adapterRef.current=action?{request:action}:null;return null;
  }})));
 const dispatch=async(selector,type)=>React.act(async()=>{
  const target=document.querySelector(selector);assert.ok(target,selector);
  target.dispatchEvent(new window.Event(type,{bubbles:true,cancelable:true}));
 });
 return {document,state,React,components,
  send:()=>dispatch('form','submit'),stop:()=>dispatch('[aria-label="停止对话"]','click')};
}

test('R2.1.1 failed Send has one live error, preserves history and restores the unsent draft',async t=>{
 const message='当前 Codex 尚未通过安全会话协议检查。';
 const history={id:'previous-error',speaker:'系统',message:'此前操作失败，记录保留。'};
 const f=await dockReactFixture(t,{session:{rows:[history]},action:async()=>{throw Error(message);}});
 await f.send();
 const log=f.document.querySelector('[role="log"]');
 assert.equal(log.getAttribute('aria-live'),'polite','the single error remains announced by the live transcript');
 assert.equal(log.textContent.split(message).length-1,1);
 assert.equal(f.document.querySelectorAll('[role="alert"]').length,0,'no second assertive announcement');
 assert.equal(f.document.querySelector('.od-conversation-feedback'),null,'no duplicate feedback panel');
 assert.equal(f.document.getElementById('mount').textContent.split(message).length-1,1);
 assert.deepEqual(f.state.session.rows[0],history);
 assert.deepEqual(f.state.session.rows.slice(1).map(row=>[row.speaker,row.message]),[
  ['你','收藏当前网页'],['系统',message]]);
 assert.equal(f.document.querySelector('textarea').value,'收藏当前网页');
 assert.equal(f.state.session.draft,'收藏当前网页');
 // A later identical failure is its own history entry, never deleted as a duplicate.
 await f.send();
 assert.equal(f.state.session.rows.filter(row=>row.message===message).length,2);
 assert.equal(f.document.querySelector('.od-conversation-feedback'),null);
});

test('R2.1.1 setError without a current system row retains its accessible feedback',async t=>{
 const message='当前扩展未连接可执行的可信 AI 业务能力。';
 for(const history of [[],[{id:'old',speaker:'系统',message},{id:'newer',speaker:'助手',message:'稍后再试。'}]]){
  await t.test(history.length?'older matching system row':'no system row',async child=>{
   const f=await dockReactFixture(child,{session:{rows:history}});
   await f.send();
   assert.equal(f.document.querySelector('[role="alert"]').textContent,message,
    'only the latest matching system entry may replace the current feedback');
   assert.equal(f.document.querySelectorAll('[role="alert"]').length,1);
   assert.deepEqual(f.state.session.rows,history,'setError alone does not invent or remove history');
   assert.equal(f.document.querySelector('textarea').value,'收藏当前网页');
  });
 }
});

test('R2.1.1 UNKNOWN keeps its reconciliation notice and blocks replay without duplicate error text',async t=>{
 const message='书签写入结果尚未核实。';
 const f=await dockReactFixture(t,{action:async()=>{
  throw Object.assign(Error(message),{code:'E_OUTCOME_UNKNOWN',writeIssued:true});
 }});
 await f.send();
 assert.equal(f.document.getElementById('mount').textContent.split(message).length-1,1);
 assert.equal(f.document.querySelectorAll('[role="alert"]').length,0);
 assert.match(f.document.querySelector('.od-conversation-feedback [role="status"]').textContent,/请先刷新并核对/);
 assert.equal(f.state.session.needsReview,true);
 assert.equal(f.document.querySelector('textarea').value,'','ambiguous writes are not restored for replay');
 assert.equal(f.document.querySelector('[aria-label="发送"]').disabled,true);
 await f.React.act(async()=>f.state.bridge.reconcile());
 assert.equal(f.document.querySelector('.od-conversation-feedback'),null);
 assert.equal(f.state.session.needsReview,false);
 assert.equal(f.state.session.rows.at(-1).message,message,'reconciliation retains the error history');
});

test('R2.1.1 Stop aborts the original request and records one live cancellation without restoring a replay',async t=>{
 let signal;
 const f=await dockReactFixture(t,{action:args=>new Promise((resolve,reject)=>{
  signal=args.signal;signal.addEventListener('abort',()=>reject(Object.assign(Error('cancelled'),{code:'E_CANCELLED'})),{once:true});
 })});
 await f.send();assert.equal(signal.aborted,false);
 await f.stop();
 const message='已停止后续操作；此前已核实的写入不会撤销。';
 assert.equal(signal.aborted,true);assert.equal(f.state.cancels.length,1);
 assert.equal(f.state.cancels[0].signal,signal);
 assert.equal(f.document.getElementById('mount').textContent.split(message).length-1,1);
 assert.equal(f.document.querySelector('.od-conversation-feedback'),null);
 assert.equal(f.state.session.rows.at(-1).message,message);
 assert.equal(f.document.querySelector('textarea').value,'');
 assert.equal(f.document.querySelector('[aria-label="停止对话"]'),null);
});

test('R2.1.1 shared transcript defaults retain visible speaker labels and original semantics',async t=>{
 const f=await dockReactFixture(t);
 const {renderToStaticMarkup}=await import('react-dom/server');
 const html=renderToStaticMarkup(f.React.createElement(f.components.ConversationTranscript,{
  rows:[{id:'other-task',speaker:'系统',message:'其他任务错误'}]}));
 assert.match(html,/<strong>系统<\/strong><p>其他任务错误<\/p>/);
 assert.doesNotMatch(html,/role="alert"|aria-live=/,'no new live announcements in other transcript consumers');
});
