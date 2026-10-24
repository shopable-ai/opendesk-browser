// Test services only. The view, React component, compiler, validators and codec
// are production sources. No DOM facade or privileged browser is simulated.
import {createWorkflowView} from '../../src/ui/workflow/workflow-view.js';
import {emptyWorkflow} from '../../src/framework/workflow/contract.js';
import {WORKFLOW_OBSERVE_SOURCE} from '../../src/ui/workflow/observation.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';
import {canonical} from '../../src/platform/protocol.js';
const fail=(code,message)=>Object.assign(new Error(message),{code});
const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
export const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
export async function workflowFixture(options={}) {
  const target={status:'available',windowId:7,tabId:9,frameId:0,documentId:'document-one',
    origin:'https://workflow.example',url:'https://workflow.example/demo',
    ...(options.target||{})};
  const workflow=emptyWorkflow(target.origin,'12345678-1234-1234-1234-123456789abc');
  workflow.title='测试工作流';workflow.steps=options.steps||[{stepId:'one',op:'observe'}];
  // Opt-in persisted stores let a second newly constructed conversation read
  // the same saved bundle and Controller revisions. Do not reuse a live View
  // or its transient in-memory execution state across the restart.
  const session=options.session||new Map([['opendesk.sidebar.workflow-draft.v1:7',workflow]]);
  const local=options.local||new Map(),scripts=options.scripts||new Map();
  if(options.grant)session.set('opendesk.sidebar.workflow-draft.v1:7:observation',options.grant);
  const subscriptions={page:new Set(),run:new Set(),native:new Set(),permission:new Set()};
  const requests=[],starts=[],stops=[],owners=[];
  let snapshot=null,pending=null,sequence=0;
  const service={hold:Boolean(options.hold),fail:Boolean(options.fail),corrupt:false,corruptResult:false,beforeJournalRead:null,
    holdActionStart:false,releaseActionStart:null,dropVerifiedBundleWrite:Boolean(options.dropVerifiedBundleWrite)};
  const storage=map=>({get:async keys=>keys===null?Object.fromEntries(map):Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,map.get(key)])),
    set:async values=>{for(const [key,value] of Object.entries(values))
      map.set(key,JSON.parse(canonical(value)));}});
  const permissions=new Set(options.permission===false?[]:[target.origin+'/*']);
  const localStorage=storage(local);
  // Simulate a storage transport that resolves SET without persisting the
  // immutable v2 Bundle. This is a failure injection only, never a fake PASS.
  const localSet=localStorage.set;
  localStorage.set=async values=>{
    if(service.dropVerifiedBundleWrite&&Object.values(values).some(row=>
      row?.format==='opendesk.workflow-segment-bundle.v2'))return;
    return localSet(values);
  };
  if(options.savedStorageGate){
    const originalRead=localStorage.get;
    localStorage.get=async keys=>{await options.savedStorageGate();return originalRead(keys);};
  }
  const api={storage:{session:storage(session),local:localStorage},permissions:{
    request:async request=>{requests.push(structuredClone(request));for(const origin of request.origins||[])permissions.add(origin);return true;},
    contains:async ({origins=[]})=>origins.every(origin=>permissions.has(origin)),
    onRemoved:{addListener:fn=>subscriptions.permission.add(fn),removeListener:fn=>subscriptions.permission.delete(fn)}},
    runtime:{getURL:path=>'chrome-extension://test/'+path},tabs:{create:async()=>({})}};
  const notify=kind=>{for(const listener of subscriptions[kind])listener();};
  const host={currentRun:null,executionPending:false,
    subscribe:fn=>{subscriptions.run.add(fn);return ()=>subscriptions.run.delete(fn);},
    controller:{
      async getControllerScript({scriptId,revision}) {
        if(service.beforeJournalRead)await service.beforeJournalRead();
        const row=scripts.get(scriptId+(revision?':'+revision:':head'));
        if(!row)return null;return {...row,sourceUtf8:service.corrupt?'changed journal bytes':row.sourceUtf8};
      },
      async commitControllerScript({scriptId,expectedRevision,sourceUtf8}) {
        const prior=scripts.get(scriptId+':head');
        if((prior?.revision||0)!==expectedRevision)throw fail('E_REVISION','revision conflict');
        const row={revision:expectedRevision+1,sourceUtf8,contentHash:await hash(sourceUtf8)};
        scripts.set(scriptId+':head',row);scripts.set(scriptId+':'+row.revision,row);return row;
      },snapshotControllerRun:async()=>structuredClone(snapshot),
    },
    async start(options) {
      starts.push(structuredClone(options));
      const source=options.source;
      const isObservation=source.kind==='draft'&&source.sourceUtf8===WORKFLOW_OBSERVE_SOURCE;
      // Simulate an admitted action whose RunHost.start response is delayed,
      // while the first, independently authorized observation still completes.
      const heldAction=service.holdActionStart&&!isObservation;
      if(heldAction)await new Promise(resolve=>{service.releaseActionStart=resolve;});
      const runId='workflow-run-'+(++sequence),resultId='workflow-result-'+sequence;
      host.currentRun=runId;
      const sourceHash=source.kind==='saved'?source.contentHash:await hash(source.sourceUtf8);
      const revision={sourceHash,...(source.kind==='saved'?{scriptId:source.scriptId,revision:source.revision}:{})};
      const bound={windowId:7,tabId:9,frameId:0,documentId:options.target.documentId,url:options.target.expectedUrl,allowedOrigin:target.origin,targetVersion:1};
      const claim={runId,resultId,revision,target:bound};
      host.completion=new Promise(resolve=>{pending={resolve,claim,isObservation,source,params:options.params};});
      notify('run');if(!service.hold&&!heldAction)queueMicrotask(()=>finish(service.fail?'failed':'completed'));
      return claim;
    },
    async stop(request) {
      stops.push(structuredClone(request));
      if(request.runId!==host.currentRun)throw fail('E_RUN_OWNER','wrong run');finish('stopped');
    },
  };
  function finish(state='completed') {
    if(!pending)return;
    const {claim,resolve,isObservation,source,params}=pending;pending=null;
    const observed=typeof options.observationResult==='function'
      ? options.observationResult({claim,source,params,target:{...target}})
      : {kind:'semantic-dom-summary',document:{
        documentId:claim.target.documentId,url:claim.target.url
      },nodes:[{role:'textbox',name:'姓名',text:'',state:{visible:true},
        locator:{kind:'role',value:'textbox',name:'姓名',exact:true}}],truncated:false};
    const result={runId:claim.runId,resultId:claim.resultId,state,revision:claim.revision,
      outcome:state==='completed'?{ok:true,valueWire:encodeValue(isObservation?observed:
        (typeof options.actionResult==='function'
          ?options.actionResult({source,params}):{message:'执行结果',count:1}))}:
        {ok:false,error:{code:state==='stopped'?'E_CANCELLED':'E_FIXTURE',message:'可控错误'}}};
    snapshot={run:{...claim,state,workerRetired:true,retirementState:'released'},results:[result]};
    if(service.corruptResult)snapshot.results[0].resultId='different-result';
    host.currentRun=null;notify('run');
    if(state==='completed'&&!isObservation&&typeof options.afterAction==='function') {
      options.afterAction({source,params,target,claim});
      const bytes=source.kind==='draft'?source.sourceUtf8:
        scripts.get(source.scriptId+':'+source.revision)?.sourceUtf8;
      // Model the real Authority's durable goto handoff. A DOM click never
      // gains this new-Document binding merely because the fixture navigated.
      if(bytes?.includes('await page.goto(')&&target.documentId!==claim.target.documentId)
        snapshot.run.target={...claim.target,documentId:target.documentId,url:target.url,
          allowedOrigin:target.origin,targetVersion:claim.target.targetVersion+1};
      for(const listener of subscriptions.page)listener({...target});
    }
    resolve({runId:claim.runId,state,retirement:{state:'released'},result});
  }
  // Always provide the production Host Client's mandatory discovery route.
  // Per-test custom provider clients override only what they explicitly test.
  // An explicitly failing request is never replaced, preserving fail-closed tests.
  const client={ready:Promise.resolve(),controller:host.controller,
    subscribeWorkflowAI:fn=>{subscriptions.native.add(fn);return ()=>subscriptions.native.delete(fn);},
    // Match the real Host Client's discovery and immutable task admission RPCs.
    request:async method=>method==='listTaskCatalog'?
      (options.taskCatalog||{catalog:[],installed:[]}):
      method==='resolveInstalledTask'&&options.resolveTask?options.resolveTask:
      Promise.reject(fail('E_FIXTURE_RPC','Unknown Host RPC: '+method)),
    requestWorkflowAI:async method=>method==='ai.connection.read'?{nativeConnected:false,protocolAvailable:false,state:'NATIVE_PERMISSION_REQUIRED'}:
      {state:'DISCONNECTED',readyForTurn:false},...(options.client||{})};
  const currentPageTarget={windowId:7,snapshot:target,ready:Promise.resolve(),capture:()=>({...target}),
    refresh:async()=>({...target}),
    revalidate:async captured=>{if(['windowId','tabId','frameId','documentId','url','origin'].some(key=>captured[key]!==target[key]))throw fail('E_DOCUMENT_STALE','网页已变化');},
    subscribe:fn=>{subscriptions.page.add(fn);return ()=>subscriptions.page.delete(fn);}};
  const taskWorkbench=typeof options.taskWorkbench==='function'?
    options.taskWorkbench({host,client,target}):options.taskWorkbench||null;
  const view=createWorkflowView({api,client,host,currentPageTarget,taskWorkbench,
    providerRuntime:options.providerRuntime,
    onRunOwner:id=>owners.push(id)});
  const event=(id,value,isTrusted=true)=>({isTrusted,target:{id,value},preventDefault(){}});
  const click=(id,isTrusted=true)=>view.actions.click(id,event(id,undefined,isTrusted));
  const input=(id,value,eventName='input')=>view.actions.input(id,value,event(id,value),eventName);
  await tick();await tick();
  return {view,host,service,session,local,scripts,subscriptions,starts,stops,requests,owners,target,permissions,
    click,input,finish,event,
    state:()=>view.getSnapshot(),
    setPage:async patch=>{Object.assign(target,patch);for(const fn of subscriptions.page)fn({...target});await tick();},
    revoke:async origins=>{for(const origin of origins)permissions.delete(origin);for(const fn of subscriptions.permission)await fn({origins});await tick();},
  };
}
