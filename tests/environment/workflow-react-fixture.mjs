// Test services only. The view, React component, compiler, validators and codec
// are production sources. No DOM facade or privileged browser is simulated.
import {createWorkflowView} from '../../src/ui/workflow/workflow-view.js';
import {emptyWorkflow} from '../../src/framework/workflow/contract.js';
import {WORKFLOW_OBSERVE_SOURCE} from '../../src/ui/workflow/observation.js';
import {encodeValue} from '../../src/platform/page-port/codec.js';
const fail=(code,message)=>Object.assign(new Error(message),{code});
const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
export const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
export async function workflowFixture(options={}) {
  const target={status:'available',windowId:7,tabId:9,frameId:0,documentId:'document-one',
    origin:'https://workflow.example',url:'https://workflow.example/demo'};
  const workflow=emptyWorkflow(target.origin,'12345678-1234-1234-1234-123456789abc');
  workflow.title='测试工作流';workflow.steps=options.steps||[{stepId:'one',op:'observe'}];
  const session=new Map([['opendesk.sidebar.workflow-draft.v1:7',workflow]]),local=new Map(),scripts=new Map();
  if(options.grant)session.set('opendesk.sidebar.workflow-draft.v1:7:observation',options.grant);
  const subscriptions={page:new Set(),run:new Set(),native:new Set(),permission:new Set()};
  const requests=[],starts=[],stops=[],owners=[];
  let snapshot=null,pending=null,sequence=0;
  const service={hold:Boolean(options.hold),fail:Boolean(options.fail),corrupt:false,corruptResult:false,beforeJournalRead:null};
  const storage=map=>({get:async keys=>keys===null?Object.fromEntries(map):Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key=>[key,map.get(key)])),
    set:async values=>{for(const [key,value] of Object.entries(values))map.set(key,structuredClone(value));}});
  const permissions=new Set(options.permission===false?[]:[target.origin+'/*']);
  const api={storage:{session:storage(session),local:storage(local)},permissions:{
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
      const runId='workflow-run-'+(++sequence),resultId='workflow-result-'+sequence;
      host.currentRun=runId;
      const source=options.source,sourceHash=source.kind==='saved'?source.contentHash:await hash(source.sourceUtf8);
      const revision={sourceHash,...(source.kind==='saved'?{scriptId:source.scriptId,revision:source.revision}:{})};
      const bound={windowId:7,tabId:9,frameId:0,documentId:options.target.documentId,url:options.target.expectedUrl,allowedOrigin:target.origin};
      const claim={runId,resultId,revision,target:bound};
      const isObservation=source.kind==='draft'&&source.sourceUtf8===WORKFLOW_OBSERVE_SOURCE;
      host.completion=new Promise(resolve=>{pending={resolve,claim,isObservation};});
      notify('run');if(!service.hold)queueMicrotask(()=>finish(service.fail?'failed':'completed'));
      return claim;
    },
    async stop(request) {
      stops.push(structuredClone(request));
      if(request.runId!==host.currentRun)throw fail('E_RUN_OWNER','wrong run');finish('stopped');
    },
  };
  function finish(state='completed') {
    if(!pending)return;
    const {claim,resolve,isObservation}=pending;pending=null;
    const observed={kind:'semantic-dom-summary',document:{
      documentId:claim.target.documentId,url:claim.target.url
    },nodes:[{role:'textbox',name:'姓名',text:'',state:{visible:true},
      locator:{kind:'role',value:'textbox',name:'姓名',exact:true}}],truncated:false};
    const result={runId:claim.runId,resultId:claim.resultId,state,revision:claim.revision,
      outcome:state==='completed'?{ok:true,valueWire:encodeValue(isObservation?observed:
        {message:'执行结果',count:1})}:
        {ok:false,error:{code:state==='stopped'?'E_CANCELLED':'E_FIXTURE',message:'可控错误'}}};
    snapshot={run:{...claim,state,workerRetired:true,retirementState:'released'},results:[result]};
    if(service.corruptResult)snapshot.results[0].resultId='different-result';
    host.currentRun=null;notify('run');
    resolve({runId:claim.runId,state,retirement:{state:'released'},result});
  }
  const client=options.client||{ready:Promise.resolve(),subscribeWorkflowAI:fn=>{subscriptions.native.add(fn);return ()=>subscriptions.native.delete(fn);},
    requestWorkflowAI:async method=>method==='ai.connection.read'?{nativeConnected:false,protocolAvailable:false,state:'NATIVE_PERMISSION_REQUIRED'}:
      {state:'DISCONNECTED',readyForTurn:false}};
  const currentPageTarget={windowId:7,snapshot:target,ready:Promise.resolve(),capture:()=>({...target}),
    revalidate:async captured=>{if(['windowId','tabId','frameId','documentId','url','origin'].some(key=>captured[key]!==target[key]))throw fail('E_DOCUMENT_STALE','网页已变化');},
    subscribe:fn=>{subscriptions.page.add(fn);return ()=>subscriptions.page.delete(fn);}};
  const view=createWorkflowView({api,client,host,currentPageTarget,onRunOwner:id=>owners.push(id)});
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
