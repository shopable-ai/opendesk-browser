import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {transform} from 'esbuild';
import {parseHTML} from 'linkedom';
import * as React from 'react';
import {flushSync} from 'react-dom';
import * as contract from '../../src/framework/workflow/contract.js';
import {deriveWorkflowViewState} from '../../src/ui/workflow/view-state.js';
import {createWorkflowUIState} from '../../src/ui/workflow/workflow-ui-state.js';
import * as dataSharing from '../../src/ui/workflow/data-sharing.js';
import * as taskReviewHandoff from '../../src/ui/workflow/task-review-handoff.js';
import * as directExecution from '../../src/ui/workflow/direct-execution.js';
import * as agentLoop from '../../src/ui/workflow/agent-loop.js';
import * as segmentReplay from '../../src/ui/workflow/segment-replay.js';
import * as workflowReuse from '../../src/ui/workflow/workflow-reuse.js';
import * as installedTaskReuse from '../../src/ui/workflow/installed-task-reuse.js';
import * as taskContract from '../../src/platform/tasks/contract.js';
import * as promptActions from '../../src/ui/conversation/prompt-actions.js';
import {workflowObservationForModel,workflowObservationGrantMatches,workflowObservationRecipientId} from '../../src/ui/workflow/observation.js';
import {createSharedAIProviderRuntime} from '../../src/ui/ai/provider-runtime.js';
import {createConversationSession} from '../../src/ui/conversation/session.js';
import {appendWorkflowSuggestionDraft} from '../../src/ui/conversation/draft-suggestion.js';

// Component grade only: real VM controller + real mounted WorkflowPage,
// stubbed compiler/planner/observation. No browser, native input or real AI.
// The ordinary Node test runner can also execute this file without VM flags.
if(!vm.SourceTextModule) {
  test('workflow focus component suite in isolated VM',()=>{
    const env={...process.env};delete env.NODE_TEST_CONTEXT;
    const result=spawnSync(process.execPath,['--experimental-vm-modules','--test',fileURLToPath(import.meta.url)],
      {encoding:'utf8',timeout:30000,env});
    assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
    assert.match(result.stdout,/component: action and locator changes/,'child must execute the component cases');
  });
} else {
  const source=await readFile(new URL('../../src/ui/workflow/workflow-view.js',import.meta.url),'utf8');
  const tick=async()=>{await new Promise(resolve=>setImmediate(resolve));flushSync(()=>{});};
  const waitFor=async(predicate)=>{
    const until=Date.now()+1000;
    while(!predicate()){assert.ok(Date.now()<until,'component state did not settle');await new Promise(resolve=>setTimeout(resolve,5));await tick();}
  };
  const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
  const compile=async(path,replacements={})=>{
    const result=await transform(await readFile(new URL(path,import.meta.url),'utf8'),
      {loader:'tsx',format:'esm',jsx:'transform'});
    let code=result.code;
    for(const [from,to] of Object.entries(replacements))code=code.replaceAll(JSON.stringify(from),JSON.stringify(to));
    return 'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
  };
  const imports={'react':import.meta.resolve('react'),'react-dom':import.meta.resolve('react-dom')};
  const button=await compile('../../src/ui/react/components/ui/button.tsx',imports);
  const conversation=await compile('../../src/ui/react/components/conversation.tsx',
    {...imports,'./ui/button.tsx':button});
  const providerSettings=await compile('../../src/ui/react/components/provider-settings.tsx',
    {...imports,'./ui/button.tsx':button});
  const {WorkflowPage}=await import(await compile('../../src/ui/react/tabs/workflow.tsx',
    {...imports,'../components/ui/button.tsx':button,'../components/conversation.tsx':conversation,
      '../components/provider-settings.tsx':providerSettings}));
  const initial=parseHTML('<html><body></body></html>');
  const original={window:globalThis.window,document:globalThis.document};
  globalThis.window=initial.window;globalThis.document=initial.document;
  initial.document.oninput=null; // React detects input support once, on import.
  const {createRoot}=await import('react-dom/client');
  globalThis.window=original.window||initial.window;globalThis.document=original.document;

  function documentFixture() {
    const {window,document:doc}=parseHTML('<html><body><main id="root"></main></body></html>');
    const activate=()=>{globalThis.window=window;globalThis.document=doc;};
    activate();doc.activeElement=doc.body;
    // Component-only DOM/platform shims. React renders all nodes and consumes
    // the real controller subscription; no fixture copies state into the DOM.
    const proto=window.HTMLElement.prototype;
    proto.visible=function(){
      if(!this.isConnected||this.closest('[hidden],[inert]'))return false;
      for(let item=this;item?.parentElement;item=item.parentElement)
        if(item.parentElement.tagName==='DETAILS'&&!item.parentElement.open&&item.tagName!=='SUMMARY')return false;
      return true;
    };
    proto.focus=function(){if(!this.disabled&&this.visible()){
      doc.activeElement=this;this.dispatchEvent(new window.Event('focusin',{bubbles:true}));
    }};
    proto.scrollIntoView=function(){};
    Object.defineProperties(proto,{
      inert:{configurable:true,get(){return this.hasAttribute('inert');},set(value){this.toggleAttribute('inert',Boolean(value));}},
      open:{configurable:true,get(){return this.hasAttribute('open');},set(value){this.toggleAttribute('open',Boolean(value));}}
    });
    Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,
      get(){return [...this.options].find(option=>option.selected)?.value||'';},
      set(value){for(const option of this.options)option.toggleAttribute('selected',option.value===String(value));}});
    const dispatched=new Map();
    proto.fire=async function(type,extra={}){
      activate();
      const event=new window.Event(type,{bubbles:true,cancelable:true});
      // Explicit component-test injection; never evidence of a Chrome gesture.
      Object.assign(event,{isTrusted:true,...extra});
      if(type==='click'&&this.disabled)return [];
      if(type==='input')this._valueTracker?.setValue('\0');
      dispatched.delete(this.id);
      flushSync(()=>{
        this.dispatchEvent(event);
        // LinkeDOM does not run a submit-button's browser default action.
        // Dispatch the same trusted submit event that a real user click
        // produces, through the production SharedConversationFrame form.
        if(type==='click'&&event.isTrusted&&this.tagName==='BUTTON'&&
          this.getAttribute('type')==='submit'&&!event.defaultPrevented){
          const form=this.closest('form');
          if(form){
            const submit=new window.Event('submit',{bubbles:true,cancelable:true});
            Object.assign(submit,{isTrusted:true});
            form.dispatchEvent(submit);
          }
        }
      });
      const result=dispatched.get(this.id);
      await tick();
      return [await result];
    };
    return {doc,activate,dispatched};
  }

  async function make(t,{steps=[],approval=false,observeGate=null,storedGrant=null,
    sessionId='component-session',initialPermission=true,savedRecord=null,configureHost=null,
    resumable=false,controllerOnly=false,probe=null,catalogReadGate=null,catalogFail=false}={}) {
    const dom=controllerOnly?null:documentFixture();
    const doc=dom?.doc||{getElementById:()=>null};
    const get=id=>doc.getElementById(id),draft=contract.emptyWorkflow('https://a.example',crypto.randomUUID());
    draft.steps=structuredClone(steps);
    const planGate=deferred(),approvalReady=deferred(),answers=[],observations=[];
    let plannerOptions,projection,currentSessionId=sessionId,resumeCalls=0,probeCalls=0,catalogReads=0;const compiled=[],sessionWrites=[];
    const proposal=workflow=>({...structuredClone(workflow),title:'Component proposal',steps:[{stepId:'proposed',op:'observe'}]});
    const planner={snapshot:()=>({sessionId:currentSessionId,state:'READY_FOR_TURN',readyForTurn:true,resumable}),
      probe:async()=>{probeCalls++;return probe?probe():{state:'READY_FOR_TURN',readyForTurn:true};},
      async plan(options){
        plannerOptions=options;
        if(approval){
          const answer=options.onApproval({tool:'browser.observe'},
            {signal:options.signal,requestId:'component-observe'});
          approvalReady.resolve();answers.push(await answer);
        }
        await planGate.promise;
        return proposal(options.workflow);
      },cancel:async()=>{},close:async()=>{currentSessionId=null;},dispose(){},resume:async()=>{resumeCalls++;}};
    const observation={cancel:async()=>{},dispose:async()=>{},async observe(...args){
      observations.push(args);if(observeGate)await observeGate.promise;return {componentFixture:true};
    }};
    const bindings={
      './workflow-ui-state.js':{createWorkflowUIState:()=>{projection=createWorkflowUIState();return projection;}},
      // Production modules share a realm. This VM-only component fixture
      // transfers UI-created params to the host realm before the same
      // strict validator checks the shape, values and defaults.
      '../../framework/workflow/contract.js':{...contract,
        validateWorkflowParams:(workflow,params)=>contract.validateWorkflowParams(
          workflow,structuredClone(params))},
      '../../platform/tasks/contract.js':{
        // Real parameter validation, with a host-realm clone for isolated VM objects.
        checkParamsSchema:value=>taskContract.checkParamsSchema(structuredClone(value)),
        validateTaskParams:(schema,params)=>taskContract.validateTaskParams(
          structuredClone(schema),structuredClone(params)),
        createTaskPackage:()=>{throw new Error('No packaging in focus suite');}
      },
      '../../framework/workflow/compiler.js':{compileWorkflow:async workflow=>{contract.validateWorkflow(workflow);compiled.push(structuredClone(workflow));return {workflow,sourceUtf8:'component fixture',sourceHash:'a'.repeat(64)};}},
      '../../environment.js':{permissionPattern:()=> 'https://a.example/*'},
      '../../platform/page-port/codec.js':{decodeValue:value=>value},
      '../task-run-diagnostics.js':{presentTaskValue:value=>({text:String(value)}),formatTaskError:String},
      '../run-value-format.js':{formatRunValue:String},
      // Link the actual shared Provider Runtime with injected fixture transport.
      // This exercises its real Lease / settings lifecycle; tests still never
      // impersonate Chrome, Native Host or a successful browser business effect.
      '../ai/provider-runtime.js':{createSharedAIProviderRuntime:options=>
        createSharedAIProviderRuntime({...options,
          client:{...options.client,
            requestWorkflowAI:options.client.requestWorkflowAI||(async()=>({state:'DISCONNECTED'}))},
          plannerFactory:()=>planner,
          facadeFactory:({localPlanner})=>({
            async generateWorkflow(options){
              assert.equal(options.source,'local_codex','focus suite simulates Native only');
              return {proposal:await localPlanner.plan(options),metadata:{provider:'local_codex'}};
            },
            generateStructured:async()=>{throw Error('Not used by Workflow focus suite');},
            probeCapabilities:async()=>({nativeConnected:false})
          })
        })},
      // Workflow is the sole subject of the focus harness. The production
      // neutral Session is linked directly, unrelated business adapters are
      // intentionally unmounted while the shared Provider Runtime is real.
      '../conversation/provider-consumer.js':{createBusinessConversation:()=>({dispose(){}})},
      '../conversation/session.js':{createConversationSession},
      '../conversation/draft-suggestion.js':{appendWorkflowSuggestionDraft},
      './view-state.js':{deriveWorkflowViewState},
      './data-sharing.js':dataSharing,
      './task-review-handoff.js':taskReviewHandoff,
      './direct-execution.js':directExecution,
      './agent-loop.js':agentLoop,
      './segment-replay.js':segmentReplay,
      './workflow-reuse.js':workflowReuse,
      './installed-task-reuse.js':installedTaskReuse,
      '../conversation/prompt-actions.js':promptActions,
      './local-codex.js':{createLocalCodexPlanner:()=>planner,describeLocalCodex:value=>({state:value.state,message:'Component fixture',ready:value.readyForTurn===true})},
      './observation.js':{createWorkflowObservation:()=>observation,
        workflowObservationForModel,workflowObservationGrantMatches,workflowObservationRecipientId}
    };
    const context=vm.createContext({crypto,structuredClone,URL,AbortController,setTimeout,clearTimeout});
    const module=new vm.SourceTextModule(source,{context,identifier:'workflow-view.component.js'});
    const modules=new Map();
    await module.link(specifier=>{
      assert.ok(Object.hasOwn(bindings,specifier),'unexpected view dependency '+specifier);
      if(!modules.has(specifier)) {
        const values=bindings[specifier];
        modules.set(specifier,new vm.SyntheticModule(Object.keys(values),function(){
          for(const [key,value] of Object.entries(values))this.setExport(key,value);
        },{context}));
      }
      return modules.get(specifier);
    });
    await module.evaluate();
    let target={windowId:7,tabId:9,frameId:0,documentId:'doc-9',url:'https://a.example/',origin:'https://a.example',status:'available'};
    const pageListeners=new Set(),permissionListeners=new Set(),permissions=new Set(initialPermission?['https://a.example/*']:[]);
    const permissionRequests=[];
    const sessionStore=new Map();
    sessionStore.set('opendesk.sidebar.workflow-draft.v1:7',draft);
    if(storedGrant)sessionStore.set('opendesk.sidebar.workflow-draft.v1:7:observation',storedGrant);
    const sessionGet=async key=>{
      const keys=Array.isArray(key)?key:[key];
      return Object.fromEntries(keys.map(item=>[item,sessionStore.get(item)]));
    };
    const sessionSet=async values=>{
      sessionWrites.push(structuredClone(values));
      for(const [key,value] of Object.entries(values))sessionStore.set(key,value);
    };
    const savedKey=savedRecord?'opendesk.sidebar.workflow.v1:'+
      savedRecord.workflow.workflowId+':'+savedRecord.revision:null;
    const api={storage:{session:{get:sessionGet,set:sessionSet},
      local:{get:async()=>savedRecord?{[savedKey]:savedRecord}:{},set:async()=>{}}},
      permissions:{request:async request=>{
        permissionRequests.push(structuredClone(request));
        for(const origin of request.origins||[])permissions.add(origin);
        return true;
      },contains:async request=>(request.origins||[]).every(origin=>permissions.has(origin)),
      onRemoved:{addListener:fn=>permissionListeners.add(fn),removeListener:fn=>permissionListeners.delete(fn)}}};
    const host={subscribe:()=>()=>{},currentRun:null,executionPending:false};
    configureHost?.(host);
    const ui=module.namespace.createWorkflowView({document:doc,api,
      client:{ready:Promise.resolve(),subscribeWorkflowAI:()=>()=>{},
        async request(method){
          if(method!=='listTaskCatalog')throw Object.assign(new Error('Unexpected Host method '+method),{code:'E_FIXTURE_HOST'});
          catalogReads++;
          if(catalogReads>1&&catalogReadGate)await catalogReadGate.promise;
          if(catalogReads>1&&catalogFail)
            throw Object.assign(new Error('Task Catalog unavailable'),{code:'E_TASK_CATALOG'});
          return {catalog:[],installed:[]};
        }},
      host,
      currentPageTarget:{windowId:7,get snapshot(){return target;},ready:Promise.resolve(),capture:()=>({...target}),revalidate:async captured=>{
        if(['windowId','tabId','frameId','documentId','url','origin'].some(key=>captured[key]!==target[key]))
          throw Object.assign(new Error('stale target'),{code:'E_DOCUMENT_STALE'});
      },subscribe:fn=>{pageListeners.add(fn);return ()=>pageListeners.delete(fn);}}});
    let root;
    if(dom){
      root=createRoot(doc.getElementById('root'));
      const controller={...ui,actions:{...ui.actions,click(id,...args){
        const result=ui.actions.click(id,...args);dom.dispatched.set(id,result);return result;
      }}};
      flushSync(()=>root.render(React.createElement(WorkflowPage,{controller,document:doc})));
    }
    t.after(()=>{
      if(dom){dom.activate();flushSync(()=>root.unmount());}
      ui.dispose();
      if(dom){globalThis.window=original.window||initial.window;globalThis.document=original.document;}
    });await tick();await tick();
    const setPage=async patch=>{
      target={...target,...patch};
      for(const fn of pageListeners)fn({...target});
      await tick();await tick();
    };
    const removePermission=async grant=>{
      for(const origin of grant.origins||[])permissions.delete(origin);
      for(const fn of permissionListeners)await fn(grant);
      await tick();await tick();
    };
    const stepsNow=()=>[...get('workflow-steps').querySelectorAll('details.workflow-step')];
    const control=(id,field)=>{
      const step=stepsNow().find(item=>item.dataset.stepId===id);
      assert.ok(step,'step exists '+id);
      flushSync(()=>{step.open=true;step.dispatchEvent(new dom.doc.defaultView.Event('toggle'));});
      return [...step.querySelectorAll('[data-workflow-focus]')].find(item=>item.dataset.workflowFocus===field);
    };
    const click=async element=>{await element.fire('click');await tick();};
    const openCreation=async()=>{get('workflow-ai-new-session').focus();};
    const clickNew=async()=>{await openCreation();await click(get('workflow-new'));};
    const focusNew=async()=>{await openCreation();get('workflow-new').focus();};
    const startPlan=async(request='Observe the page for component focus verification')=>{
      get('workflow-ai-request').value=request;await get('workflow-ai-request').fire('input');
      const running=get('workflow-ai-plan').fire('click');await tick();
      return {running};
    };
    return {doc,get,ui,click,openCreation,clickNew,focusNew,control,stepsNow,startPlan,planGate,approvalReady,answers,observations,compiled,
      permissions,permissionRequests,sessionWrites,sessionStore,setPage,removePermission,host,savedKey,
      setSessionId:value=>{currentSessionId=value;},get projection(){return projection;},
      get plannerOptions(){return plannerOptions;},get resumeCalls(){return resumeCalls;},get probeCalls(){return probeCalls;},get catalogReads(){return catalogReads;}};
  }
  const fill=id=>({stepId:id,op:'fill',locatorKind:'css',selector:'#keyword',text:''});
  const observe=id=>({stepId:id,op:'observe'});
  const assertFocus=(fixture,element)=>{
    const name=item=>item?.id||item?.dataset?.workflowFocus||item?.tagName||'none';
    assert.ok(fixture.doc.activeElement===element,
      'focus mismatch: expected '+name(element)+', got '+name(fixture.doc.activeElement));
    assert.ok(element.visible(),'focus destination must be visible');
    assert.equal(Boolean(element.disabled),false,'focus destination must be enabled');
  };
  const grant=(overrides={})=>{
    const approvedAt=Date.now()-1000;
    return {sessionId:'component-session',origin:'https://a.example',scope:'semantic-dom-summary-v1',
      approvedAt,expiresAt:approvedAt+30*60*1000,...overrides};
  };

  test('component: local check prevents a concurrent probe even with a stale enabled Send control',async t=>{
    const check=deferred(),probeErrors=[];let checking=false;
    const f=await make(t,{controllerOnly:true,sessionId:null,probe:async()=>{
      if(checking){probeErrors.push('E_BUSY');throw Object.assign(new Error('A planning turn is already active'),{code:'E_BUSY'});}
      checking=true;await check.promise;checking=false;
      return {state:'READY_FOR_TURN',readyForTurn:true};
    }});
    t.after(()=>check.resolve());
    const trusted={isTrusted:true},initialCompiles=f.compiled.length;
    f.ui.actions.input('workflow-ai-request','Component planning request',trusted);
    f.ui.actions.click('workflow-provider-toggle',trusted);
    f.ui.actions.closeSettings();
    // Exercise plan's admission guard independently of the disabled projection.
    f.projection.control('workflow-ai-plan').disabled=false;
    const running=f.ui.actions.click('workflow-ai-plan',trusted);await tick();
    assert.equal(f.probeCalls,1,'Send must not start a second probe while the settings probe is pending');
    assert.deepEqual(probeErrors,[],'no Native E_BUSY collision');
    assert.equal(f.plannerOptions,undefined);
    assert.equal(f.compiled.length,initialCompiles,'blocked Send must not compile a new workflow');
    check.resolve();await running;await tick();
  });

  for(const outcome of ['success','failure'])test('component: local check '+outcome+' restores Send after closing settings',async t=>{
    const check=deferred();let checks=0;
    const f=await make(t,{controllerOnly:true,sessionId:null,probe:async()=>{
      if(++checks===1){await check.promise;if(outcome==='failure')throw Object.assign(new Error('Offline'),{code:'E_DISCONNECTED'});}
      return {state:'READY_FOR_TURN',readyForTurn:true};
    }});
    t.after(()=>check.resolve());
    const trusted={isTrusted:true},control=id=>f.ui.getSnapshot().controls[id];
    f.ui.actions.input('workflow-ai-request','Component planning request',trusted);
    f.ui.actions.click('workflow-provider-toggle',trusted);await tick();
    assert.equal(control('workflow-local-refresh').disabled,true);
    assert.equal(control('workflow-ai-plan').disabled,true,'local check immediately disables Send');
    f.ui.actions.closeSettings();await tick();
    assert.equal(control('workflow-provider-settings').open,false);
    assert.equal(control('workflow-ai-plan').disabled,true,'closing settings must retain the pending check guard');
    await f.ui.actions.click('workflow-ai-plan',trusted);
    assert.equal(f.probeCalls,1);assert.equal(f.plannerOptions,undefined);
    check.resolve();await tick();await tick();
    assert.equal(control('workflow-local-refresh').disabled,false);
    assert.equal(control('workflow-ai-plan').disabled,false,'success and failure must both allow retry');
    await f.ui.actions.click('workflow-ai-plan',{isTrusted:false});await tick();
    assert.equal(f.probeCalls,1,'untrusted Send must not probe even when enabled');
    assert.equal(f.plannerOptions,undefined);
    const running=f.ui.actions.click('workflow-ai-plan',trusted);await tick();
    assert.equal(f.probeCalls,2,'trusted retry probes only after the settings check settled');
    assert.ok(f.plannerOptions,'trusted retry reaches the planner');
    f.planGate.resolve();await running;
  });

  for(const selected of ['custom_https','cloud_responses'])test('component: pending local check does not block '+selected+' Send',async t=>{
    const check=deferred(),f=await make(t,{controllerOnly:true,sessionId:null,probe:async()=>{
      await check.promise;return {state:'READY_FOR_TURN',readyForTurn:true};
    }});
    t.after(()=>check.resolve());
    const trusted={isTrusted:true},control=id=>f.ui.getSnapshot().controls[id];
    f.ui.actions.click('workflow-provider-toggle',trusted);
    f.ui.actions.click('workflow-source-https',trusted);
    if(selected==='cloud_responses')f.ui.actions.input('workflow-https-protocol',selected,
      {...trusted,target:{value:selected}},'change');
    for(const [id,value] of [['workflow-ai-endpoint','https://model.example/v1/responses'],
      ['workflow-ai-model','component-model'],['workflow-ai-key','component-key'],
      ['workflow-ai-request','Component HTTPS planning request']])f.ui.actions.input(id,value,trusted);
    f.ui.actions.closeSettings();await tick();
    assert.equal(control('workflow-local-refresh').disabled,true,'the unrelated local check is still pending');
    assert.equal(control('workflow-ai-provider').value,selected);
    assert.equal(control('workflow-ai-plan').disabled,false,'HTTPS Send remains available');
    const running=f.ui.actions.click('workflow-ai-plan',trusted);await tick();await tick();
    assert.equal(f.permissionRequests.length,0,
      'an awaited dual-source lookup must never request Chrome permissions outside a user gesture');
    await waitFor(()=>!control('workflow-run-review').hidden).catch(error=>{
      // Preserve dual-source permission assertions; expose Controller state
      // when the real route fails to open the trusted confirmation.
      const snapshot=f.ui.getSnapshot();
      throw new Error('HTTPS '+selected+' route never opened review: '+
        JSON.stringify({phase:snapshot.phase,catalogReads:f.catalogReads,
          provider:control('workflow-ai-provider').value,
          status:snapshot.controls['workflow-status']?.text,
          review:snapshot.controls['workflow-run-review']?.hidden,
          transcript:snapshot.messages?.at(-1)?.message}),{cause:error});
    });
    const confirming=f.ui.actions.click('workflow-run-review-confirm',trusted);
    await tick();await tick();
    assert.equal(f.permissionRequests.length,1,
      'missing HTTPS receiver permission is requested synchronously only on the second trusted Confirm click');
    await waitFor(()=>!control('workflow-ai-approval').hidden);
    assert.equal(control('workflow-ai-approval').hidden,false,'HTTPS Send still requires its own observation approval');
    assert.equal(f.probeCalls,1);assert.equal(f.plannerOptions,undefined);
    await f.ui.actions.click('workflow-ai-cancel',trusted);await confirming;await running;
    check.resolve();await tick();
    assert.equal(control('workflow-ai-plan').disabled,false);
  });

  test('component: trusted Send waits for installed Task Catalog before asking AI',async t=>{
    const gate=deferred(),f=await make(t,{controllerOnly:true,catalogReadGate:gate});
    t.after(()=>{gate.resolve();f.planGate.resolve();});
    await waitFor(()=>f.catalogReads===1);
    const trusted={isTrusted:true};
    f.ui.actions.input('workflow-ai-request','Observe page with no reusable program',trusted);
    const pending=f.ui.actions.click('workflow-ai-plan',trusted);
    await waitFor(()=>f.catalogReads===2);
    assert.equal(f.plannerOptions,undefined,'AI cannot skip pending Task Catalog');
    gate.resolve();
    await waitFor(()=>Boolean(f.plannerOptions));
    f.planGate.resolve();await pending;
  });

  test('component: Task Catalog failure does not become NO_MATCH or start Provider',async t=>{
    const f=await make(t,{controllerOnly:true,catalogFail:true});
    await waitFor(()=>f.catalogReads===1);
    const trusted={isTrusted:true};
    f.ui.actions.input('workflow-ai-request','Observe page with Catalog unavailable',trusted);
    await f.ui.actions.click('workflow-ai-plan',trusted);
    assert.equal(f.catalogReads,2);
    assert.equal(f.plannerOptions,undefined);
    assert.ok(f.ui.getSnapshot().messages.some(row=>/未执行|E_TASK_CATALOG/.test(row.message)));
  });

  test('component: current AI-only markup initializes Run and Save without a manual-start control',async t=>{
    const f=await make(t);
    assert.equal(f.get('workflow-manual-start'),null);
    assert.equal(f.get('workflow-run').disabled,true,'empty steps cannot run');
    assert.equal(f.get('workflow-save').disabled,true,'empty steps cannot save');
    assert.equal((await f.get('workflow-run').fire('click')).length,0);
    assert.equal((await f.get('workflow-save').fire('click')).length,0);
    assert.equal(f.compiled.length,0,'disabled actions cannot compile an empty workflow');
    assert.equal(f.get('workflow-ai-plan').disabled,true,
      'empty shared composer must not issue an empty Send');
    assert.equal(f.get('workflow-ai-disclosure'),null);
    assert.equal(f.get('workflow-ai-plan').getAttribute('aria-label'),'发送');
    f.get('workflow-ai-request').value='检查当前网页';
    await f.get('workflow-ai-request').fire('input');
    assert.equal(f.get('workflow-ai-plan').disabled,false,
      'a nonempty shared composer enables Send once ready');
  });

  test('component: three standalone workflow header actions preserve keyboard focus',async t=>{
    const f=await make(t);
    assert.equal(f.get('workflow-create-menu'),null);
    assert.equal(f.get('workflow-create-toggle'),null);
    for(const id of ['workflow-history-toggle','workflow-ai-new-session','workflow-new'])
      assert.ok(f.get(id),'missing standalone workflow action '+id);
    await f.openCreation();
    assertFocus(f,f.get('workflow-ai-new-session'));
    await f.get('workflow-editor').fire('keydown',{key:'Escape',preventDefault(){}});
    assertFocus(f,f.get('workflow-ai-new-session'));
  });

  test('component: active RunHost blocks history switching, Codex resume and new conversation',async t=>{
    // The installed React page consumes this Controller snapshot/actions API;
    // it no longer dispatches events into a retired #workflow-dock tree.
    const f=await make(t,{controllerOnly:true,resumable:true});
    const trusted={isTrusted:true},snapshot=()=>f.ui.getSnapshot();
    f.ui.actions.input('workflow-ai-request','保留未发送内容',trusted);
    await tick(); // React consumes the microtask-published immutable UI snapshot.
    for(const kind of ['currentRun','executionPending']){
      f.host.currentRun=kind==='currentRun'?'active-run':null;
      f.host.executionPending=kind==='executionPending';
      f.ui.actions.onHistory(trusted);
      assert.equal(snapshot().history.open,false,
        'active RunHost must not switch away from the current conversation');
      f.ui.actions.click('workflow-ai-resume',trusted);
      assert.equal(f.resumeCalls,0,
        'active RunHost must not resume a provider session');
      f.ui.actions.onNewSession(trusted);
      assert.equal(snapshot().controls['workflow-ai-request'].value,'保留未发送内容',
        'active RunHost must not discard an unsent draft');
      assert.equal(snapshot().history.open,false);
    }
    f.host.currentRun=null;f.host.executionPending=false;
    f.ui.actions.onHistory(trusted);
    await tick(); // Controller publishes an immutable snapshot on the next microtask.
    assert.equal(snapshot().history.open,true,
      'history may open again only after RunHost releases');
  });

  test('component: New conversation clears conversation but keeps current unsaved workflow and draft request',async t=>{
    const f=await make(t,{steps:[observe('one'),observe('two')]});
    const priorIds=f.stepsNow().map(item=>item.dataset.stepId);
    const {running}=await f.startPlan('Component planning request');
    f.planGate.resolve();await running;
    assert.ok(f.ui.getSnapshot().messages.length,'planning must create real transcript rows');
    f.get('workflow-ai-request').value='尚未发送的输入';await f.get('workflow-ai-request').fire('input');
    await f.openCreation();
    await f.click(f.get('workflow-ai-new-session'));
    assert.equal(f.get('workflow-ai-transcript').children.length,0);
    assert.deepEqual(f.stepsNow().map(item=>item.dataset.stepId),priorIds);
    assert.equal(f.get('workflow-ai-request').value,'尚未发送的输入');
    assertFocus(f,f.get('workflow-ai-request'));
  });

  test('component: action and locator changes preserve semantic select in the same expanded step',async t=>{
    const f=await make(t,{steps:[observe('one'),fill('two')]});
    let old=f.control('one','op');old.focus();old.value='fill';await old.fire('change');
    const next=f.control('one','op');assert.equal(next===old,true,'React preserves the keyed select');assertFocus(f,next);
    assert.equal(next.value,'fill');assert.equal(f.stepsNow()[0].open,true);
    old=f.control('one','locatorKind');old.focus();old.value='role';await old.fire('change');
    assert.equal(f.control('one','locatorKind')===old,true,'React preserves the keyed locator select');assertFocus(f,f.control('one','locatorKind'));
    assert.ok(f.control('one','roleName'));
  });

  test('component: moving follows step identity and enabled button, falling back to summary at the boundary',async t=>{
    const f=await make(t,{steps:['one','two','three','four'].map(observe)});
    const down=f.control('one','moveDown');down.focus();await f.click(down);
    assert.deepEqual(f.stepsNow().map(item=>item.dataset.stepId),['two','one','three','four']);
    assertFocus(f,f.control('one','moveDown'));
    const up=f.control('four','moveUp');up.focus();await f.click(up);
    assertFocus(f,f.control('four','moveUp'));
    const boundary=f.control('two','moveDown');boundary.focus();
    await f.click(boundary);await f.click(f.control('two','moveDown'));await f.click(f.control('two','moveDown'));
    assertFocus(f,f.stepsNow().at(-1).querySelector('summary'));
  });

  test('component: rebuilding preserves another step field or summary, without stealing external focus',async t=>{
    const f=await make(t,{steps:[fill('one'),observe('two'),observe('three')]});
    const field=f.control('one','text');field.focus();await f.click(f.control('three','moveUp'));
    assert.equal(f.control('one','text')===field,true,'React preserves the keyed text field');assertFocus(f,f.control('one','text'));
    const summary=f.stepsNow()[0].querySelector('summary');summary.focus();await f.click(f.control('two','moveUp'));
    assertFocus(f,f.stepsNow().find(item=>item.dataset.stepId==='one').querySelector('summary'));
    f.get('workflow-ai-request').focus();
    const op=f.control('one','op');op.value='click';await op.fire('change');assertFocus(f,f.get('workflow-ai-request'));
    await f.click(f.control('three','remove'));assertFocus(f,f.get('workflow-ai-request'));
  });

  test('component: deletion selects next, then previous summary, then the AI-only request field',async t=>{
    const f=await make(t,{steps:['one','two','three'].map(observe)});
    let button=f.control('two','remove');button.focus();await f.click(button);
    assertFocus(f,f.stepsNow().find(item=>item.dataset.stepId==='three').querySelector('summary'));
    button=f.control('three','remove');button.focus();await f.click(button);
    assertFocus(f,f.stepsNow()[0].querySelector('summary'));
    button=f.control('one','remove');button.focus();await f.click(button);
    assert.equal(f.stepsNow().length,0);assertFocus(f,f.get('workflow-ai-request'));
    assert.equal(f.get('workflow-plan-panel').hidden,true);
    assert.equal(f.get('workflow-add-step').visible(),false,'empty workflow has no manual creation entry');
  });

  test('component: a reordered focused step uses its current neighbour after deletion',async t=>{
    const f=await make(t,{steps:['one','two','three','four'].map(observe)});
    const remove=f.control('one','remove');remove.focus();
    f.ui.actions.moveStep('one',1);await tick();
    assertFocus(f,remove);
    await f.click(remove);
    assertFocus(f,f.stepsNow().find(item=>item.dataset.stepId==='three').querySelector('summary'));
  });

  test('component: a steps update does not reclaim a still usable control after explicit blur',async t=>{
    const f=await make(t,{steps:['one','two','three'].map(observe)});
    f.control('one','remove').focus();f.doc.body.focus();
    f.ui.actions.moveStep('two',1);await tick();
    assertFocus(f,f.doc.body);
  });

  test('component: model-added read without request intent stays blocked before compilation',async t=>{
    const f=await make(t);const {running}=await f.startPlan('Component planning request');
    f.planGate.resolve();await running;
    assert.equal(f.compiled.some(row=>row.steps.some(step=>step.stepId==='proposed')),false);
    assert.equal(f.stepsNow().length,0);
    assert.equal(f.get('workflow-ai-proposal'),null);
  });

  for(const external of [false,true]) {
    test('component: safe observed task starts original RunHost without second review '+(external?'after external focus':'from composer'),async t=>{
      const f=await make(t);let starts=0;
      f.host.start=async()=>{starts++;throw new Error('Component RunHost fixture has no durable result');};
      f.get('workflow-ai-request').focus();const {running}=await f.startPlan();
      if(external){await f.focusNew();assertFocus(f,f.get('workflow-new'));}
      f.planGate.resolve();await running;
      await waitFor(()=>starts===1);
      assert.equal(f.get('workflow-ai-proposal'),null);
      assert.equal(f.stepsNow()[0].dataset.stepId,'proposed');
      assert(f.compiled.some(row=>row.steps.some(step=>step.stepId==='proposed')));
      assert.equal(f.ui.getSnapshot().awaitingReview,false);
      assert.equal(f.get('workflow-run-review').hidden,true);
      assert.equal(starts,1,'Send should admit precisely one real RunHost path for safe steps');
      assert.equal(f.permissionRequests.length,0,'pre-granted safe execution must not request Chrome permission again');
      assertFocus(f,f.get(external?'workflow-new':'workflow-ai-request'));
    });
    for(const choice of ['cancel','discard'])test('component: new '+choice+' closes review '+(external?'without stealing focus':'with a visible destination'),async t=>{
      const f=await make(t,{steps:[observe('one')]});await f.clickNew();
      assertFocus(f,f.get('workflow-new-cancel'));
      const button=f.get('workflow-new-'+choice);button.focus();if(external)f.get('workflow-ai-request').focus();
      await f.click(button);assert.equal(f.get('workflow-new-review').hidden,true);
      assert.equal(f.stepsNow().length,choice==='discard'?0:1);
      assertFocus(f,f.get(external||choice==='discard'?'workflow-ai-request':'workflow-new'));
    });
    test('component: observation denial closes focused approval '+(external?'without stealing focus':'to stable request'),async t=>{
      const f=await make(t,{approval:true});const {running}=await f.startPlan();await f.approvalReady.promise;
      assertFocus(f,f.get('workflow-ai-deny'));if(external)await f.focusNew();
      await f.click(f.get('workflow-ai-deny'));assert.equal(f.get('workflow-ai-approval').hidden,true);
      assertFocus(f,f.get(external?'workflow-new':'workflow-ai-request'));
      f.planGate.resolve();await running;assert.equal(f.answers[0].decision,'deny');assert.equal(f.observations.length,0);
    });
  }

  test('component: clean New preserves an external keyboard destination',async t=>{
    const f=await make(t);f.get('workflow-ai-request').focus();await f.clickNew();
    assertFocus(f,f.get('workflow-ai-request'));assert.equal(f.get('workflow-new-review').hidden,true);
    assert.equal(f.get('workflow-plan-panel').hidden,true);
  });

  test('component: async approval moves before disabling, then preserves user-moved focus on settlement',async t=>{
    const gate=deferred(),f=await make(t,{approval:true,observeGate:gate});
    const {running}=await f.startPlan();await f.approvalReady.promise;
    f.get('workflow-ai-approve').focus();await f.click(f.get('workflow-ai-approve'));
    assert.equal(f.get('workflow-ai-approve').disabled,true);assertFocus(f,f.get('workflow-ai-request'));
    await f.focusNew();gate.resolve();await tick();await tick();
    assert.equal(f.get('workflow-ai-approval').hidden,true);assertFocus(f,f.get('workflow-new'));
    f.planGate.resolve();await running;assert.equal(f.answers[0].decision,'approve');assert.equal(f.observations.length,1);
  });

  test('component: valid exact session origin and scope reuses 30 minute observation grant without approval UI',async t=>{
    const f=await make(t,{approval:true,storedGrant:grant()});
    const {running}=await f.startPlan('Read this page with the existing grant');await f.approvalReady.promise;
    await tick();await tick();
    assert.equal(f.get('workflow-ai-approval').hidden,true);
    assert.equal(f.permissionRequests.length,0);
    assert.equal(f.observations.length,1);
    assert.equal(f.answers[0].decision,'approve');
    assert.equal(f.sessionWrites.some(row=>Object.keys(row).some(key=>key.endsWith(':observation'))),false);
    f.planGate.resolve();await running;
  });

  test('component: missing site permission requests Chrome only once from explicit approval and then remembers grant',async t=>{
    const f=await make(t,{approval:true,initialPermission:false});
    const {running}=await f.startPlan('Observe once and remember this task scope');await f.approvalReady.promise;
    assert.equal(f.get('workflow-ai-approval').hidden,false);
    assert.equal(f.permissionRequests.length,0,'showing the task approval is not a Chrome permission request');
    await f.click(f.get('workflow-ai-approve'));await tick();await tick();
    assert.deepEqual(f.permissionRequests,[{origins:['https://a.example/*']}]);
    assert.equal(f.answers[0].decision,'approve');
    assert.equal(f.observations.length,1);
    const persisted=f.sessionWrites.find(row=>row['opendesk.sidebar.workflow-draft.v1:7:observation']);
    assert.equal(persisted['opendesk.sidebar.workflow-draft.v1:7:observation'].origin,'https://a.example');
    assert.equal(persisted['opendesk.sidebar.workflow-draft.v1:7:observation'].scope,'semantic-dom-summary-v1');
    f.planGate.resolve();await running;
  });

  for(const [name,stored,options={}] of [
    ['expired grant',grant({approvedAt:Date.now()-30*60*1000-1000,expiresAt:Date.now()-1000}),{}],
    ['new session',grant({sessionId:'older-session'}),{}],
    ['new site',grant({origin:'https://b.example'}),{}],
    ['changed scope',grant({scope:'full-dom-v0'}),{}]
  ]) test('component: '+name+' requires a fresh observation approval',async t=>{
    const f=await make(t,{approval:true,storedGrant:stored});
    if(options.provider)f.get('workflow-ai-provider').value=options.provider;
    const {running}=await f.startPlan('Observe after grant mismatch');await f.approvalReady.promise;
    assert.equal(f.get('workflow-ai-approval').hidden,false);
    assert.equal(f.observations.length,0);
    await f.click(f.get('workflow-ai-deny'));
    f.planGate.resolve();await running;assert.equal(f.answers[0].decision,'deny');
  });

  test('component: Stop discards late observation receipt after approval has started',async t=>{
    const gate=deferred(),f=await make(t,{approval:true,observeGate:gate});
    const {running}=await f.startPlan('Observe then stop before receipt settles');await f.approvalReady.promise;
    await f.click(f.get('workflow-ai-approve'));
    assert.equal(f.observations.length,1);
    await f.click(f.get('workflow-ai-cancel'));
    gate.resolve();await tick();await tick();
    assert.equal(f.get('workflow-ai-approval').hidden,true);
    f.planGate.resolve();await running;
    assert.equal(f.answers[0].decision,'deny');
    assert.equal(f.get('workflow-ai-proposal'),null);
  });

  test('component: permission removal for the approved site revokes grant and stops pending receipt, unrelated origin keeps it',async t=>{
    const gate=deferred(),f=await make(t,{approval:true,storedGrant:grant(),observeGate:gate});
    assert.equal(f.ui.getSnapshot().controls['workflow-observation-scope']?.text,'网页摘要：已授权');
    await f.removePermission({origins:['https://elsewhere.example/*']});
    assert.equal(f.ui.getSnapshot().controls['workflow-observation-scope']?.text,'网页摘要：已授权');
    const running=(await f.startPlan('Observe with existing grant before revoke')).running;
    await f.approvalReady.promise;await tick();
    await f.removePermission({origins:['https://a.example/*']});
    gate.resolve();
    f.planGate.resolve();await running;
    assert.equal(f.answers[0].decision,'deny');
    assert.equal(f.ui.getSnapshot().controls['workflow-observation-scope']?.text,'网页摘要：使用前检查授权');
  });

  test('component: resolving navigation cancels pending observation but same-origin fresh document keeps stored grant',async t=>{
    let gate=deferred();
    const f=await make(t,{approval:true,storedGrant:grant(),observeGate:gate});
    assert.equal(f.ui.getSnapshot().controls['workflow-observation-scope']?.text,'网页摘要：已授权');
    let {running}=await f.startPlan('Observe before document navigation');await f.approvalReady.promise;
    await f.setPage({status:'resolving',origin:undefined,documentId:undefined,url:'https://a.example/refreshing'});
    gate.resolve();
    f.planGate.resolve();await running;
    assert.equal(f.answers[0].decision,'deny');
    assert.equal(f.sessionStore.get('opendesk.sidebar.workflow-draft.v1:7:observation').origin,'https://a.example');
    await f.setPage({status:'available',origin:'https://a.example',documentId:'doc-10',url:'https://a.example/next'});
    assert.equal(f.ui.getSnapshot().controls['workflow-observation-scope']?.text,'网页摘要：已授权');
    running=(await f.startPlan('Observe the fresh same-origin document')).running;await f.approvalReady.promise;
    await tick();await tick();
    assert.equal(f.get('workflow-ai-approval').hidden,true);
    assert.equal(f.observations.length,2);
    await running;
    assert.equal(f.answers[1].decision,'approve');
  });

  for(const external of [false,true])test('component: Stop settles pending approval '+(external?'without stealing focus':'to stable request'),async t=>{
    const f=await make(t,{approval:true});const {running}=await f.startPlan();await f.approvalReady.promise;
    if(external)await f.focusNew();await f.click(f.get('workflow-ai-cancel'));
    assert.equal(f.get('workflow-ai-approval').hidden,true);assertFocus(f,f.get(external?'workflow-new':'workflow-ai-request'));
    f.planGate.resolve();await running;assert.equal(f.answers[0].decision,'deny');assert.equal(f.observations.length,0);
    assert.equal(f.get('workflow-ai-proposal'),null,'cancelled plan cannot publish a proposal');
  });

  test('component: abort settles approval; untrusted approval clicks have no effect',async t=>{
    const f=await make(t,{approval:true});const {running}=await f.startPlan();await f.approvalReady.promise;
    await f.get('workflow-ai-deny').fire('click',{isTrusted:false});assert.equal(f.get('workflow-ai-approval').hidden,false);
    f.plannerOptions.signal.dispatchEvent(new Event('abort'));await tick();
    assert.equal(f.get('workflow-ai-approval').hidden,true);assertFocus(f,f.get('workflow-ai-request'));
    f.planGate.resolve();await running;assert.equal(f.answers[0].decision,'deny');
  });

  test('component: saved fill Revision replays twice without AI and refuses mutated journal bytes',async t=>{
    const hash='a'.repeat(64);
    const input={stepId:'keyword',op:'fill',locatorKind:'css',
      selector:'#keyword',text:'ai自动化第一选择'};
    const frozen=contract.emptyWorkflow('https://a.example','12345678-1234-1234-1234-123456789abc');
    frozen.steps=[input];
    const savedRecord={format:'opendesk.workflow-revision.v1',workflow:frozen,
      revision:3,sourceHash:hash,savedAt:Date.now(),verificationMode:'fill-readback'};
    const starts=[];let changed=false,snapshot;
    const revision={scriptId:frozen.workflowId,revision:3,sourceHash:hash};
    const boundTarget={windowId:7,tabId:9,frameId:0,documentId:'doc-9',
      url:'https://a.example/',allowedOrigin:'https://a.example'};
    const f=await make(t,{savedRecord,configureHost:host=>{
      host.controller={
        getControllerScript:async()=>({revision:3,contentHash:hash,
          sourceUtf8:changed?'unexpected bytes':'component fixture'}),
        snapshotControllerRun:async()=>snapshot
      };
      host.start=async options=>{
        const n=starts.push(options),runId='saved-run-'+n,resultId='saved-result-'+n;
        const result={runId,resultId,state:'completed',revision,outcome:{ok:true,
          valueWire:{keyword:{kind:'input-readback',matched:true,value:input.text}}}};
        snapshot={run:{runId,resultId,state:'completed',workerRetired:true,
          retirementState:'released',target:boundTarget,revision},results:[result]};
        host.completion=Promise.resolve({runId,state:'completed',
          retirement:{state:'released'},result});
        return {runId,resultId,target:boundTarget,revision};
      };
    }});
    f.get('workflow-saved-list').value=f.savedKey;await f.get('workflow-saved-list').fire('change');
    await f.click(f.get('workflow-load'));await tick();await tick();
    assert.match(f.get('workflow-status').textContent,/冻结版本 r3/);
    for(let n=1;n<=2;n++) {
      
      const response=await f.get('workflow-run').fire('click');
      assert.ok(response[0],'run click must return a result: '+f.get('workflow-status').textContent);
      assert.equal(response[0].ok,true);
      assert.equal(response[0].evidenceLevel,'BUSINESS_EFFECT_VERIFIED');
      assert.equal(response[0].runId,'saved-run-'+n);
      assert.equal(response[0].resultId,'saved-result-'+n);
      assert.equal(starts.at(-1).source.kind,'saved');
      assert.equal(starts.at(-1).source.scriptId,frozen.workflowId);
      assert.equal(starts.at(-1).source.revision,3);
      assert.equal(starts.at(-1).source.contentHash,hash);
      assert.equal(f.get('workflow-status').textContent,'浏览器操作回执已核对，网页最终业务效果仍待验证。');
      assert.equal(f.plannerOptions,undefined,'saved replay must not call AI');
      assert.equal(f.probeCalls,0,'saved replay must not probe Native AI');
    }
    assert.equal(starts.length,2);
    changed=true;
    const refused=await f.get('workflow-run').fire('click');
    assert.equal(refused[0].ok,false);
    assert.equal(refused[0].error.code,'E_WORKFLOW_HASH');
    assert.equal(starts.length,2,'corrupt journal bytes must not reach RunHost');
  });

  test('component: saved Run refuses revoked permission or replaced Document during journal read',async t=>{
    for(const mutation of ['permission','document'])await t.test(mutation,async t=>{
      const hash='a'.repeat(64);
      const frozen=contract.emptyWorkflow('https://a.example','12345678-1234-1234-1234-123456789abc');
      frozen.steps=[{stepId:'keyword',op:'fill',locatorKind:'css',
        selector:'#keyword',text:'OpenDesk'}];
      const savedRecord={format:'opendesk.workflow-revision.v1',workflow:frozen,
        revision:3,sourceHash:hash,savedAt:Date.now(),verificationMode:'fill-readback'};
      let fixture,reads=0,starts=0;
      const f=await make(t,{savedRecord,configureHost:host=>{
        host.controller={getControllerScript:async()=>{
          reads++;
          if(reads===2) {
            if(mutation==='permission')fixture.permissions.delete('https://a.example/*');
            else await fixture.setPage({documentId:'doc-replaced'});
          }
          return {revision:3,contentHash:hash,sourceUtf8:'component fixture'};
        }};
        host.start=async()=>{starts++;throw new Error('stale run must not be admitted');};
      }});
      fixture=f;f.get('workflow-saved-list').value=f.savedKey;await f.get('workflow-saved-list').fire('change');
      await f.click(f.get('workflow-load'));await tick();await tick();
      assert.match(f.get('workflow-status').textContent,/冻结版本 r3/);
      
      const response=await f.get('workflow-run').fire('click');
      assert.equal(reads,2);
      assert.equal(response[0]?.ok,false);
      assert.equal(response[0]?.error?.code,mutation==='permission'?'E_PERMISSION':'E_DOCUMENT_STALE');
      assert.equal(starts,0,'no RunHost admission after an invalidated grant or Document');
    });
  });

}
