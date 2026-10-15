import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {load} from 'cheerio';
import * as contract from '../../src/framework/workflow/contract.js';
import {deriveWorkflowViewState} from '../../src/ui/workflow/view-state.js';
import * as dataSharing from '../../src/ui/workflow/data-sharing.js';
import * as taskReviewHandoff from '../../src/ui/workflow/task-review-handoff.js';
import * as directExecution from '../../src/ui/workflow/direct-execution.js';

// Component grade only: actual view + current HTML hierarchy, lightweight DOM,
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
  const [source,html]=await Promise.all([
    readFile(new URL('../../src/ui/workflow/workflow-view.js',import.meta.url),'utf8'),
    readFile(new URL('../../src/ui/tool.html',import.meta.url),'utf8')
  ]);
  const tick=()=>new Promise(resolve=>setImmediate(resolve));
  const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};

  class Element {
    constructor(tag,doc) {
      this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.parentElement=null;
      this.children=[];this.dataset={};this.attributes={};this.listeners=new Map();
      this.value='';this.className='';this.textContent='';this.hidden=false;
      this.open=false;this.checked=false;this._disabled=false;
    }
    get firstElementChild(){return this.children[0]||null;}
    get lastElementChild(){return this.children.at(-1)||null;}
    get disabled(){return this._disabled;}
    set disabled(value){this._disabled=value;if(value&&this.ownerDocument?.activeElement===this)this.ownerDocument.activeElement=this.ownerDocument.body;}
    contains(item){return this===item||this.children.some(child=>child.contains(item));}
    append(...items){for(const item of items){item.remove();item.parentElement=this;this.children.push(item);}}
    remove(){
      if(!this.parentElement)return;
      if(this.contains(this.ownerDocument.activeElement))this.ownerDocument.activeElement=this.ownerDocument.body;
      this.parentElement.children.splice(this.parentElement.children.indexOf(this),1);this.parentElement=null;
    }
    replaceChildren(...items){for(const child of [...this.children])child.remove();this.append(...items);}
    setAttribute(key,value){this.attributes[key]=String(value);}
    getAttribute(key){return this.attributes[key]??null;}
    matches(selector){
      if(selector==='[data-workflow-focus]')return Object.hasOwn(this.dataset,'workflowFocus');
      if(selector==='[data-workflow-param]')return Object.hasOwn(this.dataset,'workflowParam');
      if(selector==='summary')return this.tagName==='SUMMARY';
      if(selector==='details.workflow-step'||selector==='details.workflow-step[open]')
        return this.tagName==='DETAILS'&&this.className.split(' ').includes('workflow-step')&&(!selector.endsWith('[open]')||this.open);
      throw new Error('Unsupported fixture selector '+selector);
    }
    closest(selector){for(let item=this;item;item=item.parentElement)if(item.matches(selector))return item;return null;}
    querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    visible(){
      for(let item=this;item;item=item.parentElement){
        if(item.hidden)return false;
        const parent=item.parentElement;
        if(parent?.tagName==='DETAILS'&&!parent.open&&item.tagName!=='SUMMARY')return false;
      }
      return this.ownerDocument.body.contains(this);
    }
    focus(){if(!this.disabled&&this.visible())this.ownerDocument.activeElement=this;}
    addEventListener(name,fn){const group=this.listeners.get(name)||new Set();group.add(fn);this.listeners.set(name,group);}
    removeEventListener(name,fn){this.listeners.get(name)?.delete(fn);}
    fire(name,event={}){return Promise.all([...this.listeners.get(name)||[]].map(fn=>fn({target:this,isTrusted:true,...event})));}
    scrollIntoView(){}
  }

  function documentFixture() {
    const nodes=new Map(),doc={getElementById:id=>nodes.get(id),createElement:tag=>new Element(tag,doc)};
    doc.body=doc.createElement('body');doc.activeElement=doc.body;
    const $=load(html);
    const copy=(raw,parent)=>{
      if(raw.type!=='tag')return;
      const element=doc.createElement(raw.name);
      for(const [name,value] of Object.entries(raw.attribs)) {
        if(name==='id'){element.id=value;nodes.set(value,element);}
        else if(name==='class')element.className=value;
        else if(['hidden','open','checked','disabled'].includes(name))element[name]=true;
        else if(name==='value'||name==='type')element[name]=value;
      }
      parent.append(element);
      for(const child of raw.children||[])copy(child,element);
    };
    copy($('#workbench-workflow')[0],doc.body);
    copy($('#workflow-dock')[0],doc.body);
    // The fixture represents the selected Workflow tab, not its initial hidden tab.
    doc.getElementById('workbench-workflow').hidden=false;
    doc.getElementById('workflow-dock').hidden=false;
    doc.getElementById('workflow-ai-provider').value='local_codex';
    return doc;
  }

  async function make(t,{steps=[],approval=false,observeGate=null,storedGrant=null,
    sessionId='component-session',initialPermission=true,savedRecord=null,configureHost=null}={}) {
    const doc=documentFixture(),get=id=>doc.getElementById(id),draft=contract.emptyWorkflow('https://a.example',crypto.randomUUID());
    draft.steps=structuredClone(steps);
    const planGate=deferred(),approvalReady=deferred(),answers=[],observations=[];
    let plannerOptions,currentSessionId=sessionId;const compiled=[],sessionWrites=[];
    const proposal=workflow=>({...structuredClone(workflow),title:'Component proposal',steps:[{stepId:'proposed',op:'observe'}]});
    const planner={snapshot:()=>({sessionId:currentSessionId,state:'READY_FOR_TURN',readyForTurn:true}),
      probe:async()=>({state:'READY_FOR_TURN',readyForTurn:true}),
      async plan(options){
        plannerOptions=options;
        if(approval){
          const answer=options.onApproval({tool:'browser.observe'},
            {signal:options.signal,requestId:'component-observe'});
          approvalReady.resolve();answers.push(await answer);
        }
        await planGate.promise;
        return proposal(options.workflow);
      },cancel:async()=>{},close:async()=>{currentSessionId=null;},dispose(){},resume:async()=>{}};
    const observation={cancel:async()=>{},dispose:async()=>{},async observe(...args){
      observations.push(args);if(observeGate)await observeGate.promise;return {componentFixture:true};
    }};
    const bindings={
      '../../framework/workflow/contract.js':contract,
      '../../platform/tasks/contract.js':{checkParamsSchema:value=>value,createTaskPackage:()=>{throw new Error('No packaging in focus suite');}},
      '../../framework/workflow/compiler.js':{compileWorkflow:async workflow=>{compiled.push(structuredClone(workflow));return {workflow,sourceUtf8:'component fixture',sourceHash:'a'.repeat(64)};}},
      '../../environment.js':{permissionPattern:()=> 'https://a.example/*'},
      '../../platform/page-port/codec.js':{decodeValue:value=>value},
      '../task-run-diagnostics.js':{presentTaskValue:value=>({text:String(value)}),formatTaskError:String},
      '../run-value-format.js':{formatRunValue:String},
      './provider.js':{createWorkflowProviderFacade:({localPlanner})=>({
        async generateWorkflow(options){
          assert.equal(options.source,'local_codex','focus suite only simulates Native');
          return {proposal:await localPlanner.plan(options),metadata:{provider:'local_codex'}};
        }
      })},
      './view-state.js':{deriveWorkflowViewState},
      './data-sharing.js':dataSharing,
      './task-review-handoff.js':taskReviewHandoff,
      './direct-execution.js':directExecution,
      './local-codex.js':{createLocalCodexPlanner:()=>planner,describeLocalCodex:value=>({state:value.state,message:'Component fixture',ready:value.readyForTurn===true})},
      './observation.js':{createWorkflowObservation:()=>observation}
    };
    const context=vm.createContext({crypto,structuredClone,URL,AbortController,
      Option:class extends Element{constructor(text,value){super('option',doc);this.textContent=text;this.value=value;}}});
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
      client:{ready:Promise.resolve(),subscribeWorkflowAI:()=>()=>{}},
      host,
      currentPageTarget:{windowId:7,get snapshot(){return target;},ready:Promise.resolve(),capture:()=>({...target}),revalidate:async captured=>{
        if(['windowId','tabId','frameId','documentId','url','origin'].some(key=>captured[key]!==target[key]))
          throw Object.assign(new Error('stale target'),{code:'E_DOCUMENT_STALE'});
      },subscribe:fn=>{pageListeners.add(fn);return ()=>pageListeners.delete(fn);}}});
    t.after(()=>ui.dispose());await tick();await tick();
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
    const stepsNow=()=>get('workflow-steps').querySelectorAll('details.workflow-step');
    const control=(id,field)=>{
      const step=stepsNow().find(item=>item.dataset.stepId===id);
      assert.ok(step,'step exists '+id);step.open=true;
      return step.querySelectorAll('[data-workflow-focus]').find(item=>item.dataset.workflowFocus===field);
    };
    const click=async element=>{await element.fire('click');await tick();};
    const openCreation=async()=>{
      if(get('workflow-create-menu').hidden)await click(get('workflow-create-toggle'));
    };
    const clickNew=async()=>{await openCreation();await click(get('workflow-new'));};
    const focusNew=async()=>{await openCreation();get('workflow-new').focus();};
    const startPlan=async(request='Observe the page for component focus verification')=>{
      get('workflow-ai-request').value=request;
      const running=get('workflow-ai-plan').fire('click');await tick();
      return {running};
    };
    return {doc,get,ui,click,openCreation,clickNew,focusNew,control,stepsNow,startPlan,planGate,approvalReady,answers,observations,compiled,
      permissions,permissionRequests,sessionWrites,sessionStore,setPage,removePermission,host,savedKey,
      setSessionId:value=>{currentSessionId=value;},
      get plannerOptions(){return plannerOptions;}};
  }
  const fill=id=>({stepId:id,op:'fill',locatorKind:'css',selector:'#keyword',text:''});
  const observe=id=>({stepId:id,op:'observe'});
  const assertFocus=(fixture,element)=>{
    assert.equal(fixture.doc.activeElement,element);
    assert.ok(element.visible(),'focus destination must be visible');
    assert.equal(element.disabled,false,'focus destination must be enabled');
  };
  const grant=(overrides={})=>{
    const approvedAt=Date.now()-1000;
    return {sessionId:'component-session',origin:'https://a.example',scope:'semantic-dom-summary-v1',
      approvedAt,expiresAt:approvedAt+30*60*1000,...overrides};
  };

  test('component: current AI-only markup initializes Run and Save without a manual-start control',async t=>{
    const f=await make(t);
    assert.equal(f.get('workflow-manual-start'),undefined);
    assert.equal(f.get('workflow-run').listeners.has('click'),true);
    assert.equal(f.get('workflow-save').listeners.has('click'),true);
    assert.equal(f.get('workflow-ai-plan').disabled,false);
    assert.equal(f.get('workflow-ai-disclosure'),undefined);
    assert.match(await readFile('src/ui/tool.html','utf8'),/id="workflow-ai-plan"[^>]*aria-label="发送并执行浏览器任务"/);
  });

  test('component: one header Create menu is closed by Escape and restores visible focus',async t=>{
    const f=await make(t);
    assert.equal(f.get('workflow-create-menu').hidden,true);
    await f.openCreation();
    assert.equal(f.get('workflow-create-menu').hidden,false);
    assert.equal(f.get('workflow-create-toggle').getAttribute('aria-expanded'),'true');
    assertFocus(f,f.get('workflow-ai-new-session'));
    await f.get('workflow-editor').fire('keydown',{key:'Escape',preventDefault(){}});
    assert.equal(f.get('workflow-create-menu').hidden,true);
    assert.equal(f.get('workflow-create-toggle').getAttribute('aria-expanded'),'false');
    assertFocus(f,f.get('workflow-create-toggle'));
  });

  test('component: New conversation clears conversation but keeps current unsaved workflow and draft request',async t=>{
    const f=await make(t,{steps:[observe('one'),observe('two')]});
    const priorIds=f.stepsNow().map(item=>item.dataset.stepId);
    f.get('workflow-ai-transcript').append(f.doc.createElement('div'));
    f.get('workflow-ai-request').value='尚未发送的输入';
    await f.openCreation();
    await f.click(f.get('workflow-ai-new-session'));
    assert.equal(f.get('workflow-create-menu').hidden,true);
    assert.equal(f.get('workflow-ai-transcript').children.length,0);
    assert.deepEqual(f.stepsNow().map(item=>item.dataset.stepId),priorIds);
    assert.equal(f.get('workflow-ai-request').value,'尚未发送的输入');
    assertFocus(f,f.get('workflow-ai-request'));
  });

  test('component: action and locator changes preserve semantic select in the same expanded step',async t=>{
    const f=await make(t,{steps:[observe('one'),fill('two')]});
    let old=f.control('one','op');old.focus();old.value='fill';await old.fire('change');
    const next=f.control('one','op');assert.notEqual(next,old);assertFocus(f,next);
    assert.equal(next.value,'fill');assert.equal(f.stepsNow()[0].open,true);
    old=f.control('one','locatorKind');old.focus();old.value='role';await old.fire('change');
    assert.notEqual(f.control('one','locatorKind'),old);assertFocus(f,f.control('one','locatorKind'));
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
    assert.notEqual(f.control('one','text'),field);assertFocus(f,f.control('one','text'));
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

  test('component: model-added read without request intent stays blocked before compilation',async t=>{
    const f=await make(t);const {running}=await f.startPlan('Component planning request');
    f.planGate.resolve();await running;
    assert.equal(f.compiled.some(row=>row.steps.some(step=>step.stepId==='proposed')),false);
    assert.equal(f.stepsNow().length,0);
    assert.equal(f.get('workflow-ai-proposal').hidden,true);
  });

  for(const external of [false,true]) {
    test('component: direct planning keeps Apply hidden and '+(external?'preserves moved focus':'preserves stable request focus'),async t=>{
      const f=await make(t);f.get('workflow-ai-request').focus();const {running}=await f.startPlan();
      if(external)await f.focusNew();
      f.planGate.resolve();await running;
      assert.equal(f.get('workflow-ai-proposal').hidden,true);assert.equal(f.stepsNow()[0].dataset.stepId,'proposed');
      assert(f.compiled.some(row=>row.steps.some(step=>step.stepId==='proposed')));
      assertFocus(f,f.get(external?'workflow-new':'workflow-ai-request'));
    });
    for(const choice of ['cancel','discard'])test('component: new '+choice+' closes review '+(external?'without stealing focus':'with a visible destination'),async t=>{
      const f=await make(t,{steps:[observe('one')]});await f.clickNew();
      assertFocus(f,f.get('workflow-new-cancel'));
      const button=f.get('workflow-new-'+choice);button.focus();if(external)f.get('workflow-ai-request').focus();
      await f.click(button);assert.equal(f.get('workflow-new-review').hidden,true);
      assert.equal(f.stepsNow().length,choice==='discard'?0:1);
      assertFocus(f,f.get(external||choice==='discard'?'workflow-ai-request':'workflow-create-toggle'));
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
    assert.equal(f.get('workflow-ai-proposal').hidden,true);
  });

  test('component: permission removal for the approved site revokes grant and stops pending receipt, unrelated origin keeps it',async t=>{
    const gate=deferred(),f=await make(t,{approval:true,storedGrant:grant(),observeGate:gate});
    assert.match(f.get('workflow-observation-scope').textContent,/30 分钟有效/);
    await f.removePermission({origins:['https://elsewhere.example/*']});
    assert.match(f.get('workflow-observation-scope').textContent,/30 分钟有效/);
    const running=(await f.startPlan('Observe with existing grant before revoke')).running;
    await f.approvalReady.promise;await tick();
    await f.removePermission({origins:['https://a.example/*']});
    gate.resolve();
    f.planGate.resolve();await running;
    assert.equal(f.answers[0].decision,'deny');
    assert.match(f.get('workflow-observation-scope').textContent,/当前对话未授权/);
  });

  test('component: resolving navigation cancels pending observation but same-origin fresh document keeps stored grant',async t=>{
    let gate=deferred();
    const f=await make(t,{approval:true,storedGrant:grant(),observeGate:gate});
    assert.match(f.get('workflow-observation-scope').textContent,/30 分钟有效/);
    let {running}=await f.startPlan('Observe before document navigation');await f.approvalReady.promise;
    await f.setPage({status:'resolving',origin:undefined,documentId:undefined,url:'https://a.example/refreshing'});
    gate.resolve();
    f.planGate.resolve();await running;
    assert.equal(f.answers[0].decision,'deny');
    assert.equal(f.sessionStore.get('opendesk.sidebar.workflow-draft.v1:7:observation').origin,'https://a.example');
    await f.setPage({status:'available',origin:'https://a.example',documentId:'doc-10',url:'https://a.example/next'});
    assert.match(f.get('workflow-observation-scope').textContent,/30 分钟有效/);
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
    assert.equal(f.get('workflow-ai-proposal').hidden,true,'cancelled plan cannot publish a proposal');
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
    f.get('workflow-saved-list').value=f.savedKey;
    await f.click(f.get('workflow-load'));await tick();await tick();
    assert.match(f.get('workflow-status').textContent,/冻结版本 r3/);
    for(let n=1;n<=2;n++) {
      f.get('workflow-confirm-run').checked=true;
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
      assert.match(f.get('workflow-status').textContent,/脱离 AI 运行/);
    }
    assert.equal(starts.length,2);
    changed=true;f.get('workflow-confirm-run').checked=true;
    const refused=await f.get('workflow-run').fire('click');
    assert.equal(refused[0].ok,false);
    assert.equal(refused[0].error.code,'E_WORKFLOW_HASH');
    assert.equal(starts.length,2,'corrupt journal bytes must not reach RunHost');
  });
}
