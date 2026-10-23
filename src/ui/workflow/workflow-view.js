import {createWorkflowUIState} from './workflow-ui-state.js';
import {selectSavedWorkflowRoute,naturalProductReply} from './workflow-reuse.js';
import {selectInstalledTaskRoute} from './installed-task-reuse.js';
import {emptyWorkflow,validateWorkflow,WORKFLOW_OPERATIONS,WORKFLOW_LOCATORS,validateWorkflowParams} from '../../framework/workflow/contract.js';
import {checkParamsSchema,validateTaskParams} from '../../platform/tasks/contract.js';
import {compileWorkflow} from '../../framework/workflow/compiler.js';
import {createTaskPackage} from '../../platform/tasks/contract.js';
import {permissionPattern} from '../../environment.js';
import {decodeValue} from '../../platform/page-port/codec.js';
import {presentTaskValue,formatTaskError} from '../task-run-diagnostics.js';
import {createSharedAIProviderRuntime} from '../ai/provider-runtime.js';
import {createBusinessConversation} from '../conversation/provider-consumer.js';
import {createConversationSession} from '../conversation/session.js';
import {deriveWorkflowViewState} from './view-state.js';
import {describeLocalCodex} from './local-codex.js';
import {createWorkflowObservation,workflowObservationForModel,workflowObservationGrantMatches,workflowObservationRecipientId} from './observation.js';
import {classifyWorkflowRunRisk,prepareDirectExecution,verifyDirectExecutionReceipt,directExecutionEvidenceLevel,verifyDirectFillReadbacks,verifySearchBusinessEffect,verifyOpenedLinkPage,verifySavedWorkflowRevision} from './direct-execution.js';
import {createTaskReviewHandoff,taskReviewHandoffKey} from './task-review-handoff.js';
import {createWorkflowAgentLoopGuard,classifyWorkflowAgentStop} from './agent-loop.js';
import {WORKFLOW_BUNDLE_FORMAT,replayParameterSchema,sealWorkflowBundle,
  verifyWorkflowBundle,verifyReplayBusinessEffect,assertLegacyReplayParameterScope,
  WORKFLOW_DYNAMIC_BUNDLE_FORMAT,inferDynamicReplayPlan,dynamicReplayIntent,
  simpleCommerceReplayGoal} from './segment-replay.js';

const STORAGE_PREFIX = 'opendesk.sidebar.workflow.v1:';
const SESSION_PREFIX = 'opendesk.sidebar.workflow-draft.v1:';
const OP_LABELS = {navigate:'打开同站网页',observe:'观察页面',fill:'填写内容',
  click:'点击元素',wait:'等待元素',extract:'提取文本',assert:'验证文本',confirm:'用户确认（暂不支持执行）'};
function err(code,message) { return Object.assign(new Error(message),{code}); }
function format(error) { return (error?.code || 'E_WORKFLOW') + '：' + (error?.message || String(error)); }
function defaultStep(op = 'observe') {
  const step = {stepId:'step-' + crypto.randomUUID().slice(0,12),op};
  if (['fill','click','wait','extract','assert'].includes(op)) {
    step.locatorKind='css';step.selector='#keyword';
  }
  if (op === 'fill') step.text='';
  if (op === 'assert' || op === 'confirm') step.text='期望的文字';
  return step;
}
// Presentation only: describe effects only after RunHost and readback verification.
export function workflowExecutionFeedback({execution,workflow,params={},values}={}) {
  if(!execution?.ok)return '本次未能确认成功；不会自动重试。请检查真实网页与运行详情。';
  if(execution.readOnlyVerified===true)return '只读步骤已完成，已核对真实 RunHost 回执；没有修改网页。';
  if(execution.evidenceLevel!=='BUSINESS_EFFECT_VERIFIED')
    return '运行已结束。网页效果尚未确认，请检查当前网页；不会自动重复执行。';
  const effect=execution.effect;
  if(effect?.kind==='product-page')return '已打开商品详情，独立读回“'+effect.name+'”和页面标价 '+effect.price+'；以实际页面显示为准。';
  if(effect?.kind==='link-page')return '已打开目标结果，并在新网页独立读取标题“'+effect.title+'”。';
  if(effect?.kind==='search-results')
    return '搜索已完成，已核对出现 '+effect.visibleResultLinks+' 个新链接；结果是否相关仍需确认。';
  if(effect?.kind==='search-empty')return '搜索已完成，已核对页面显示“无结果”。';
  if(effect?.kind==='search-inline')return '搜索已完成，已核对页面出现与关键词对应的新结果；未确认服务器数据已提交。';
  if(execution.readbackVerified!==true||!verifyDirectFillReadbacks({workflow,params,values}))
    return '运行已结束。输入值尚未确认，请检查当前网页；不会自动重复执行。';
  const fills=workflow.steps.filter(step=>step.op==='fill');
  if(fills.length!==1)return '已填写 '+fills.length+' 个输入框，并逐项核对输入值一致；未确认服务器已提交。';
  const step=fills[0],value=values[step.stepId].value;
  const label=(step.locatorKind==='label'?step.selector:step.roleName)||'输入框';
  // Reuse the result preview's redaction and keep long/sensitive values out of chat.
  const sensitive=/密码|密钥|令牌|凭据|验证码/.test(label)||
    presentTaskValue({[label]:value}).redacted;
  const detail=!sensitive&&value.length<=80&&!/[\r\n]/.test(value)?'为“'+value+'”':'';
  return (detail?'已将“'+label+'”填写'+detail:'已填写“'+label+'”')+
    '，并核对输入值一致；未确认服务器已提交。';
}
export function createWorkflowView({api=globalThis.chrome,document:doc=globalThis.document,
  client,host,currentPageTarget,taskWorkbench=null,onRunOwner=()=>{},openDeveloper=()=>{},openCatalog=()=>{},
  reactUI=null,providerRuntime=null,openAIProviderSettings=null,
  hostInstanceId=client?.hostInstanceId||'standalone'}) {
  // Presentation snapshots only. Compiler, RunHost, revision journal and grants
  // below remain the sole business authority; React is the sole DOM owner.
  const ui=createWorkflowUIState();
  const control=ui.control;
  const get=id=>doc?.getElementById(id);
  const focus=(id)=>ui.setFocus(id);
  const writeWorkflowOutput=value=>{control('workflow-output').text=String(value);};
  // Audited first-party result adapter. It reports NO page text, URL,
  // step names or user input; the Host independently checks original Run/Result.
  const reportVerifiedWorkflowEffect=originalRunId=>{
    try{
      void Promise.resolve(api.runtime?.sendMessage?.({
        protocol:'opendesk.analytics.v1',kind:'event.workflow_verified',
        event:'workflow.business_effect_verified',toolId:'workflow',
        channel:'extension',runId:originalRunId
      })).catch(()=>{});
    }catch{/* Telemetry can never affect the user's Workflow. */}
  };
  const session=()=>Number.isSafeInteger(currentPageTarget?.windowId)
    ? SESSION_PREFIX + currentPageTarget.windowId:null;
  let disposed=false,busy=false,runId=null,revision=null,compileToken=0,compiled=null;
  let lastTrustedRun=null; // UI hint only, original Task Verify must validate the real receipt.
  let touched=false,saveList=[],draftWrites=Promise.resolve(),savedHistoryReady=false,historyReadEpoch=0;
  let directVerifiedSerial=null; // Verified fill source is the same byte sequence saved later.
  let phase='idle',lastRun='none',hasError=false,newReviewSignature=null,pendingRunReview=null,pendingAIReview=null;
  let autoExecutionPending=false; // No second Send while a pre-granted, safe AI run is being admitted.
  let historyOpen=false,newReviewReturnFocus=null;
  let pendingReuse=null,pendingNaturalPlanning=null,pendingBundleGrant=null,pendingInstalledGrant=null;
  let activeInstalledTaskId=null,installedStopRequested=false;
  let planningGeneration=0,planningAbort=null,planningTarget=null,pendingApproval=null,localChecking=false;
  let workflowAgent=null; // A task-scoped coordinator only; RunHost/Provider remain unique.
  let fullAgentDraft=null,selectedBundle=null; // Frozen segments, never another runtime.
  let observationApproval=null,planningObservation=null,approvalWrites=Promise.resolve();
  let localCapability={state:'UNKNOWN',readyForTurn:false},aiCleanup=Promise.resolve();
  let workflow=emptyWorkflow(currentPageTarget?.snapshot?.origin || '',crypto.randomUUID());
  // Official Shell owns the shared Runtime. The fallback keeps isolated legacy
  // unit fixtures operational without introducing a second production owner.
  const ownsProviderRuntime=!providerRuntime;
  const providers=providerRuntime||createSharedAIProviderRuntime({client,hostInstanceId});
  const workflowInstanceId='workflow-'+crypto.randomUUID();
  const workflowLease=providers.acquire({consumerId:'workflow',
    instanceId:workflowInstanceId,hostInstanceId});
  const workflowSession=createConversationSession({identity:{
    consumerId:'workflow',instanceId:workflowInstanceId,hostInstanceId},rowsLimit:21});
  // RunHost, authorization and script reuse remain in the Workflow Controller.
  let activeConversationRound=null;
  const beginConversationRound=signal=>{
    const round=workflowSession.begin({signal,
      providerGeneration:providers.configuration().generation});
    activeConversationRound=round;
    return round;
  };
  const finishConversationRound=round=>{
    round?.finish();
    if(activeConversationRound===round)activeConversationRound=null;
  };
  const retireConversationRound=()=>{
    workflowSession.cancel();
    if(activeConversationRound)finishConversationRound(activeConversationRound);
  };
  const localPlanner=workflowLease.planner;
  const workflowProviders=workflowLease.facade;
  // Memory-only, verified business context; never persist model credentials or page text.
  let verifiedTurnHistory=[],lastProviderTurn=null,verifiedContextTarget=null;
  const approvalKey=()=>session()?session()+':observation':null;
  function validObservationApproval(row) {
    const expectedSession=row?.selected==='local_codex'
      ?localPlanner.snapshot().sessionId:session();
    return Boolean(expectedSession&&row?.sessionId===expectedSession&&
      workflowObservationGrantMatches(observationApproval,row));
  }
  function persistObservationApproval() {
    const key=approvalKey(),value=observationApproval;if(!key)return;
    approvalWrites=approvalWrites.then(()=>api.storage.session.set({[key]:value})).catch(()=>{});
  }
  function renderObservationApproval() {
    const selected=provider();
    const active=selected==='local_codex'&&validObservationApproval({
      selected,sessionId:localPlanner.snapshot().sessionId,
      captured:{origin:currentOrigin()},recipientId:'local_codex',receiverPattern:null
    });
    control('workflow-observation-scope').text=selected==='local_codex'
      ?(active?'网页摘要：已授权':'网页摘要：使用前检查授权')
      :'网页摘要：同网站、对话及 AI 接收方的有效授权会自动复用。';
    control('workflow-observation-revoke').disabled=!observationApproval;
  }
  const bindings=new Map();
  const bind=(id,event,fn)=>bindings.set(id+':'+event,fn);
  function focusOutside(id,target='workflow-ai-request') {
    if(!disposed&&get(id)?.contains(doc?.activeElement))focus(target);
  }
  function hidePanel(id,target) {
    focusOutside(id,target);control(id).hidden=true;
  }
  const status=(message,error=false)=>{
    if(disposed)return;
    hasError=Boolean(error);
    const element=control('workflow-status');
    element.text=message;
    element.dataset.state=error?'error':'info';
    element.hidden=!message;
    updatePresentation();
  };
  function dismissNewReview(){
    newReviewSignature=null;
    hidePanel('workflow-new-review','workflow-new');
  }
  function dismissRunReview() {
    pendingRunReview=null;pendingAIReview=null;
    hidePanel('workflow-run-review','workflow-ai-request');
  }
  const currentOrigin=()=>currentPageTarget?.snapshot?.status==='available'
    ? currentPageTarget.snapshot.origin:null;
  const provider=()=>control('workflow-ai-provider').value;
  let synchronizingProvider=false;
  // The trusted Workflow settings UI edits shared memory-only configuration.
  // Provider and all other consumers never read Workflow DOM controls.
  function syncSharedProviderSettings(){
    if(synchronizingProvider)return;
    providers.configure({source:provider(),
      endpoint:control('workflow-ai-endpoint').value.trim(),
      model:control('workflow-ai-model').value.trim(),
      apiKey:control('workflow-ai-key').value});
  }
  let lastHttpsProvider='custom_https';
  let entryMode='new-workflow';
  const exampleRequests=Object.freeze({
    continue:'请继续修改刚才填写的内容，并读回确认。不要提交表单。',
    check:'请检查当前网页中的输入内容与重要信息，先报告检查结果，不要进行写入。',
    fill:'请将指定内容填入当前网页的目标表单，并读取输入框实际值进行验证，不要提交。',
    read:'请只读提取当前网页的主要内容并整理，不要修改网页或提交表单。'
  });
  const setConversationDraft=value=>{
    workflowSession.update({draft:String(value)});
    control('workflow-ai-request').value=workflowSession.getSnapshot().draft;
  };
  function clearChat() {
    workflowSession.update({rows:[]});
    ui.patch({messages:[]});
  }
  function appendChat(speaker,message) {
    if(disposed)return;
    const id=workflowSession.append(speaker,String(message));
    const paint=()=>ui.patch({messages:workflowSession.getSnapshot().rows.map(row=>({...row}))});
    paint();
    return {
      get text(){return workflowSession.getSnapshot().rows.find(row=>row.id===id)?.message||'';},
      set text(value){if(workflowSession.replaceMessage(id,String(value)))paint();}
    };
  }
  const snapshot=()=>structuredClone(workflow);
  const stable=()=>JSON.stringify(workflow);
  // A clean persisted definition must not become 'dirty' while the async
  // compiler has temporarily cleared its cache. Source identity is checked
  // separately on every actual RunHost admission and history load.
  const matchesSavedDefinition=()=>selectedBundle?
    JSON.stringify(selectedBundle.segments.at(-1)?.workflow)===stable():
    Boolean(revision&&JSON.stringify(revision.workflow)===stable());
  const matchesRevision=()=>matchesSavedDefinition()&&Boolean(selectedBundle?
    selectedBundle.segments.at(-1)?.sourceHash===compiled?.sourceHash:
    revision?.sourceHash===compiled?.sourceHash);
  function persistDraft() {
    const key=session();if(!key)return;
    const value=snapshot();
    if(JSON.stringify(value).length>50000)return;
    draftWrites=draftWrites.then(()=>api.storage.session.set({[key]:value}))
      .catch(()=>{}); // No secret API config is ever included in the draft.
  }
  function updatePresentation() {
    if(disposed)return;
    const hasSteps=workflow.steps.length>0;
    const hasParams=Object.keys((selectedBundle?.paramsSchema||workflow.paramsSchema).properties).length>0;
    const transcript=control('workflow-ai-transcript');
    const hasMessages=workflowSession.getSnapshot().rows.length>0;
    const ready=provider()==='local_codex'?describeLocalCodex(localCapability).ready:
      ['cloud_responses','custom_https'].includes(provider())&&
        Boolean(control('workflow-ai-key').value.trim() && control('workflow-ai-model').value.trim() &&
          control('workflow-ai-endpoint').value.trim());
    const mode=deriveWorkflowViewState({phase,proposal:Boolean(pendingAIReview),hasSteps,
      saved:Boolean(matchesRevision()),lastRun,error:hasError,providerReady:ready});
    control('workflow-editor').dataset.viewState=mode;
    control('workflow-plan-panel').hidden=!hasSteps;
    control('workflow-params-panel').hidden=!hasSteps || !hasParams;
    control('workflow-result-panel').hidden=!['success','failed'].includes(lastRun);
    control('workflow-chat-intro').hidden=hasMessages || phase==='planning' || (hasSteps && entryMode!=='new-chat');
    control('workflow-ai-title').text=entryMode==='new-chat'?'开始新对话':'创建新工作流';
    control('workflow-intro-description').text=entryMode==='new-chat'
      ?'保留当前工作流，可以继续提出下一步需求。'
      :'用一句话描述任务，或选择下方示例开始。';
    const segmentRows=selectedBundle?.segments||fullAgentDraft?.segments||[];
    ui.patch({entryMode,hasSteps,phase,lastRun,awaitingReview:Boolean(pendingAIReview),
      bundleSegments:segmentRows.map((part,index)=>({
        index:index+1,origin:part.workflow.siteOrigin,
        evidence:part.evidence.kind,
        steps:part.workflow.steps.map(step=>({
          op:OP_LABELS[step.op]||step.op,
          target:String(step.roleName||step.selector||'').slice(0,72)
        }))
      }))});
    transcript.hidden=!hasMessages;
    control('workflow-planning-indicator').hidden=phase!=='planning';
    control('workflow-dock').dataset.empty=String(!hasSteps&&!runId);
    control('workflow-display-title').text=historyOpen?'历史':
       hasSteps && workflow.title!=='新工作流'?workflow.title:'新工作流';
    const origin=currentOrigin(),warning=control('workflow-target-warning');
    const requiredOrigin=selectedBundle?.segments[0].workflow.siteOrigin||workflow.siteOrigin;
    const mismatch=hasSteps && (!origin || origin!==requiredOrigin);
    warning.hidden=!mismatch;
    if(mismatch){
      let site='目标网站';
      try{site=new URL(requiredOrigin).host;}catch{}
      warning.text=origin
        ?'当前网站不匹配，请打开 '+site+' 后运行。'
        :'请打开 '+site+' 后运行。';
    }
    renderObservationApproval();
  }
  function updateButtons() {
    if(disposed)return;
    // An active RunHost also owns the viewport, even after AI planning settles.
    const operationBusy=busy||autoExecutionPending||Boolean(workflowAgent)||Boolean(host.executionPending||host.currentRun);
    // Bundle replay recompiles and verifies every frozen revision at admission.
    // Do not disable Run while the last fragment's UI preview is compiling.
    const runnable=Boolean((compiled||selectedBundle) && currentOrigin()===(selectedBundle?.segments[0].workflow.siteOrigin||workflow.siteOrigin) &&
      !operationBusy && !historyOpen && !pendingAIReview);
    control('workflow-run').disabled=!runnable;
    control('workflow-save').disabled=busy || autoExecutionPending || !compiled || Boolean(selectedBundle);
    control('workflow-candidate').disabled=busy || autoExecutionPending || Boolean(selectedBundle) || !matchesRevision();
    control('workflow-stop').disabled=Boolean(workflowAgent)||(!activeInstalledTaskId&&(!runId||host.currentRun!==runId));
    control('workflow-stop').hidden=Boolean(workflowAgent);
    control('workflow-open-code').disabled=!compiled;
    control('workflow-ai-plan').disabled=!savedHistoryReady||busy||autoExecutionPending||Boolean(workflowAgent)||Boolean(pendingAIReview)||provider()==='opendesk_cloud'||
      (provider()==='local_codex'&&localChecking);
    control('workflow-ai-plan').hidden=phase==='planning'||Boolean(workflowAgent);
    control('workflow-ai-cancel').hidden=phase!=='planning'&&!workflowAgent;
    const sessionState=localPlanner.snapshot();
    const sessionHint=sessionState.sessionId&&localCapability.resumeSupported===false
      ?'新对话（结束后旧对话不可恢复）':'新对话（保留当前工作流）';
    control('workflow-ai-resume').hidden=provider()!=='local_codex'||!sessionState.resumable;
    control('workflow-ai-resume').disabled=operationBusy;
    const selected=provider();
    ui.patch({
      busy:operationBusy,
      sourceName:selected==='local_codex'?'本机 Codex':
        ['cloud_responses','custom_https'].includes(selected)?control('workflow-ai-model').value.trim():'',
      history:{open:historyOpen,busy:operationBusy,
        canResume:selected==='local_codex'&&Boolean(sessionState.resumable),
        rows:saveList.map(item=>({key:item.key,title:String(item.workflow.title||'未命名工作流'),
          fullTitle:String(item.workflow.title||'未命名工作流')+([WORKFLOW_BUNDLE_FORMAT,WORKFLOW_DYNAMIC_BUNDLE_FORMAT].includes(item.format)?' · 完整 '+item.segments.length+' 段':' · r'+item.revision),
          savedText:'r'+item.revision+' · '+(Number.isFinite(item.savedAt)?new Date(item.savedAt).toLocaleString('zh-CN'):'保存时间未知')}))},
      header:{saved:Boolean(revision||selectedBundle),
        savedText:selectedBundle?'完整 '+selectedBundle.segments.length+' 段已保存':
          revision?(matchesRevision()?'已保存':'未保存更改'):'',
        savedTitle:selectedBundle?'完整工作流 r'+selectedBundle.revision+' · '+selectedBundle.segments.length+' 段 · 分段哈希已冻结':
          revision?'工作流版本 r'+revision.revision+(matchesRevision()?' · 源码哈希一致':' · 已修改但尚未保存'):'',
        historyExpanded:historyOpen,busy:operationBusy,planning:phase==='planning',sessionHint}
    });
    updatePresentation();
  }
  async function updateCode() {
    const token=++compileToken;
    compiled=null;updateButtons();
    try {
      const result=await compileWorkflow(snapshot(),{verifyFill:directVerifiedSerial===stable()});
      if(disposed||token!==compileToken)return;
      compiled=result;control('workflow-code').text=result.sourceUtf8;
      control('workflow-code-hash').text='SHA-256：' + result.sourceHash;
    } catch(error) {
      if(disposed||token!==compileToken)return;
      control('workflow-code').text='尚不可编译：' + format(error);
      control('workflow-code-hash').text='';
    }
    updateButtons();
  }
  function edited() {
    if(selectedBundle)revision=null; // Editing detaches a copy; never rewrites a frozen bundle.
    selectedBundle=null;fullAgentDraft=null;
    dismissRunReview();
    dismissNewReview();
    touched=true;
    hasError=false;lastRun='none';
    control('workflow-status').hidden=true;control('workflow-status').text='';
    persistDraft();void updateCode();
  }
  function renderGeneral() {
    control('workflow-title').value=workflow.title;
    control('workflow-description').value=workflow.description;
    control('workflow-site').value=workflow.siteOrigin;
    control('workflow-schema').value=JSON.stringify(workflow.paramsSchema,null,2);
    control('workflow-site-note').text=currentOrigin()
      ? (currentOrigin()===workflow.siteOrigin?'匹配当前网页。只允许该 origin 的自动化。':
        '当前网页属于 ' + currentOrigin() + '；请打开原网站或新建工作流。')
      : '请打开 HTTP(S) 网页并等待主文档可用；不会使用历史网页作为目标。';
  }
  let paramValues={};
  function renderParams() {
    const next={};
    const schema=selectedBundle?.paramsSchema||workflow.paramsSchema;
    for(const [name,rule] of Object.entries(schema.properties))
      next[name]=paramValues[name]??rule.default??(rule.type==='boolean'?false:'');
    paramValues=next;
    ui.patch({params:Object.entries(schema.properties).map(([name,rule])=>({
      name,rule:{...rule},required:schema.required.includes(name),value:next[name]}))});
  }
  function readParams() {
    const values={};
    const schema=selectedBundle?.paramsSchema||workflow.paramsSchema;
    for(const [name,rule] of Object.entries(schema.properties)) {
      const value=paramValues[name];
      if(rule.type==='boolean')values[name]=Boolean(value);
      else if(value===''&&!schema.required.includes(name)&&rule.default===undefined)continue;
      else if(['integer','number'].includes(rule.type))values[name]=value===''?NaN:Number(value);
      else if(rule.enum)values[name]=rule.enum.find(choice=>String(choice)===String(value));
      else values[name]=value;
    }
    return validateTaskParams(schema,values);
  }
  function renderSteps(expandStepId=null) {
    ui.patch({steps:structuredClone(workflow.steps),siteOrigin:workflow.siteOrigin,
      ...(expandStepId?{expandStepId}:{}),operations:WORKFLOW_OPERATIONS.map(value=>({value,label:OP_LABELS[value]})),
      locators:WORKFLOW_LOCATORS.map(value=>({value,label:{css:'CSS 选择器',role:'ARIA 角色',label:'标签文字',text:'文本',testId:'Test ID'}[value]}))});
  }
  function render() {
    renderGeneral();renderParams();renderSteps();
    void updateCode();updateButtons();
  }
  async function refreshSaved() {
    // Until history is read, an empty in-memory cache is NOT evidence that
    // nothing can be reused. A later, superseded read cannot restore it.
    const epoch=++historyReadEpoch;
    savedHistoryReady=false;updateButtons();
    const all=await api.storage.local.get(null);
    if(disposed||epoch!==historyReadEpoch)return;
    saveList=Object.entries(all).filter(([key,value])=>key.startsWith(STORAGE_PREFIX) &&
      ['opendesk.workflow-revision.v1',WORKFLOW_BUNDLE_FORMAT,WORKFLOW_DYNAMIC_BUNDLE_FORMAT].includes(value?.format) &&
      Number.isSafeInteger(value.revision)&&value.revision>0&&value.workflow?.workflowId)
      .map(([key,value])=>({key,...value})).sort((a,b)=>b.savedAt-a.savedAt || b.revision-a.revision);
    const prior=control('workflow-saved-list').value;
    ui.patch({savedOptions:saveList.map(item=>({value:item.key,label:item.workflow.title+' · r'+item.revision+' · '+item.workflow.siteOrigin}))});
    if(!saveList.some(item=>item.key===prior))control('workflow-saved-list').value='';
    savedHistoryReady=true;updateButtons();
  }
  async function loadSaved() {
    const record=saveList.find(item=>item.key===control('workflow-saved-list').value);
    if(!record)throw err('E_WORKFLOW_REVISION','请选择已保存版本');
    if(busy||autoExecutionPending||host.executionPending||host.currentRun)
      throw err('E_WORKFLOW_BUSY','当前操作尚未完成，不能切换历史版本');
    const serialBefore=stable(),requestBefore=control('workflow-ai-request').value;
    if((Boolean(workflow.steps.length||workflow.title!=='新工作流'||workflow.description)
      && !matchesSavedDefinition())||requestBefore.trim())
      throw err('E_WORKFLOW_DIRTY','请先保存当前工作流，或确认新建后再打开历史版本');
    if([WORKFLOW_BUNDLE_FORMAT,WORKFLOW_DYNAMIC_BUNDLE_FORMAT].includes(record.format)) {
      // History list adds a presentation-only key; do not hash that field.
      const {key:historyKey,...frozenRecord}=record;
      const bundle=await verifyWorkflowBundle(frozenRecord);
      for(const segment of bundle.segments) {
        const freeze=await compileWorkflow(segment.workflow,{
          verifyFill:segment.verificationMode==='fill-readback'});
        const saved=await host.controller.getControllerScript({
          scriptId:segment.workflow.workflowId,revision:segment.revision});
        if(freeze.sourceHash!==segment.sourceHash||
          saved?.contentHash!==freeze.sourceHash||saved.sourceUtf8!==freeze.sourceUtf8)
          throw err('E_WORKFLOW_HASH','完整工作流存在源码不匹配的分段，拒绝打开');
      }
      if(disposed||busy||autoExecutionPending||host.executionPending||host.currentRun||
        serialBefore!==stable()||requestBefore!==control('workflow-ai-request').value)
        throw err('E_WORKFLOW_STALE','打开完整工作流期间页面或草稿已更改');
      void stopPlanning({close:true}).catch(()=>{});
      dismissRunReview();historyOpen=false;clearChat();
      verifiedTurnHistory=[];lastProviderTurn=null;observationApproval=null;
      persistObservationApproval();
      control('workflow-editor').dataset.historyOpen='false';
      setConversationDraft('');
      runId=null;onRunOwner(null);
      selectedBundle=bundle;fullAgentDraft=null;revision=null;
      workflow=structuredClone(bundle.segments.at(-1).workflow);paramValues={};
      directVerifiedSerial=bundle.segments.at(-1).verificationMode==='fill-readback'?stable():null;
      touched=true;lastRun='none';hasError=false;
      render();persistDraft();
      status('已打开完整 '+bundle.segments.length+' 段工作流 r1；运行不调用 AI，并重新验证每段权限和网页。');
      return;
    }
    const clean=validateWorkflow(record.workflow);
    if(record.verificationMode&&record.verificationMode!=='fill-readback')
      throw err('E_WORKFLOW_SCHEMA','保存版本使用了未知验证模式');
    const compile=await compileWorkflow(clean,{verifyFill:record.verificationMode==='fill-readback'});
    const saved=await host.controller.getControllerScript({scriptId:clean.workflowId,revision:record.revision});
    if(saved?.contentHash!==compile.sourceHash || saved.sourceUtf8!==compile.sourceUtf8 ||
      record.sourceHash!==compile.sourceHash)
      throw err('E_WORKFLOW_HASH','语义定义与持久 JavaScript 版本不一致，拒绝运行');
    if(disposed||busy||autoExecutionPending||host.executionPending||host.currentRun||
      serialBefore!==stable()||requestBefore!==control('workflow-ai-request').value)
      throw err('E_WORKFLOW_STALE','历史版本读取期间工作流已变化，已保留当前编辑内容');
    void stopPlanning({close:true}).catch(()=>{});
    dismissRunReview();
    verifiedTurnHistory=[];lastProviderTurn=null;
    observationApproval=null;persistObservationApproval();
    historyOpen=false;
    control('workflow-editor').dataset.historyOpen='false';
    clearChat();
    setConversationDraft('');
    runId=null;onRunOwner(null);
    workflow=clean;paramValues={};lastTrustedRun=null;
    directVerifiedSerial=record.verificationMode==='fill-readback'?stable():null;
    selectedBundle=null;fullAgentDraft=null;
    revision=record;touched=true;lastRun='none';hasError=false;
    render();persistDraft();
    status('已打开冻结版本 r'+record.revision+'；运行不会调用 AI');
  }
  async function saveAgentBundle() {
    const draft=fullAgentDraft;
    if(!draft||draft.tailSerial!==stable())
      throw err('E_WORKFLOW_STALE','完整任务完成后草稿已修改，不能保存旧证据');
    busy=true;updateButtons();
    try {
      const segments=[];
      for(let i=0;i<draft.segments.length;i++){
        if(draft!==fullAgentDraft||draft.tailSerial!==stable())
          throw err('E_WORKFLOW_STALE','分段保存期间草稿发生变化');
        const old=draft.segments[i],withId={...old.workflow,
          workflowId:draft.bundleId+'-s'+(i+1)};
        const freeze=await compileWorkflow(withId,{
          verifyFill:old.verificationMode==='fill-readback'});
        let head=null;
        try{head=await host.controller.getControllerScript({scriptId:withId.workflowId});}
        catch(error){if(error?.code!=='E_TOMBSTONE')throw error;}
        let saved;
        if(head?.contentHash===freeze.sourceHash&&head.sourceUtf8===freeze.sourceUtf8)
          saved={revision:head.revision,contentHash:head.contentHash};
        else if(!head)
          saved=await host.controller.commitControllerScript({
            scriptId:withId.workflowId,expectedRevision:0,sourceUtf8:freeze.sourceUtf8});
        else throw err('E_WORKFLOW_REVISION','分段脚本版本与本次成功任务不一致，拒绝覆盖');
        if(saved.contentHash!==freeze.sourceHash)
          throw err('E_WORKFLOW_HASH','Controller 返回的分段哈希不一致');
        if(freeze.sourceHash!==old.proof?.sourceHash)
          throw err('E_WORKFLOW_HASH','冻结 JavaScript 与真实已核验运行源码不一致');
        segments.push({workflow:freeze.workflow,entryUrl:old.entryUrl,
          revision:saved.revision,sourceHash:freeze.sourceHash,
          verificationMode:old.verificationMode,evidence:old.evidence,proof:old.proof});
      }
      const bindingPlan=inferDynamicReplayPlan({goal:draft.goal,segments});
      const record=await sealWorkflowBundle({
        format:bindingPlan?WORKFLOW_DYNAMIC_BUNDLE_FORMAT:WORKFLOW_BUNDLE_FORMAT,
        ...(bindingPlan?{bindingPlan}:{}),bundleId:draft.bundleId,revision:1,
        goal:draft.goal,title:draft.title,
        workflow:{workflowId:draft.bundleId,title:draft.title,
          siteOrigin:segments[0].workflow.siteOrigin},
        segments,paramsSchema:replayParameterSchema(segments)});
      if(draft!==fullAgentDraft||draft.tailSerial!==stable())
        throw err('E_WORKFLOW_STALE','保存结束前草稿已更改');
      const key=STORAGE_PREFIX+draft.bundleId+':1';
      await api.storage.local.set({[key]:record});
      selectedBundle=record;revision=null;fullAgentDraft=null;
      workflow=structuredClone(segments.at(-1).workflow);
      directVerifiedSerial=segments.at(-1).verificationMode==='fill-readback'?stable():null;
      render();persistDraft();await refreshSaved();
      control('workflow-saved-list').value=key;
      status('完整 '+segments.length+' 段 JavaScript 工作流已保存；每段有独立 Revision 和 sourceHash。');
    }catch(error){status(format(error),true);}
    finally{busy=false;updateButtons();}
  }
  async function save() {
    if(busy||autoExecutionPending||!compiled||selectedBundle)return;
    if(fullAgentDraft&&fullAgentDraft.tailSerial===stable())return saveAgentBundle();
    dismissRunReview();
    const serial=stable(),frozen=snapshot();
    busy=true;updateButtons();
    try {
      const verifyFill=directVerifiedSerial===serial;
      const freeze=await compileWorkflow(frozen,{verifyFill});
      const previous=revision?.workflow?.workflowId===freeze.workflow.workflowId?revision.revision:0;
      // Recover an exact already-committed Controller head when storage.local
      // failed after commit. Do not create a second Revision or overwrite an
      // unrelated concurrent head. The Controller journal remains the owner.
      if(serial!==stable())throw err('E_WORKFLOW_STALE','保存期间草稿已变化');
      let head=null;
      try{head=await host.controller.getControllerScript({scriptId:freeze.workflow.workflowId});}
      catch(error){if(error?.code!=='E_TOMBSTONE')throw error;}
      if(serial!==stable())throw err('E_WORKFLOW_STALE','保存期间草稿已变化');
      let saved;
      if(head?.sourceUtf8===freeze.sourceUtf8&&head.contentHash===freeze.sourceHash) {
        saved={revision:head.revision,contentHash:head.contentHash};
      }else{
        if((head?.revision||0)!==previous)
          throw err('E_WORKFLOW_REVISION','当前 Controller 已由其他版本更新；请检查历史版本后再保存');
        saved=await host.controller.commitControllerScript({scriptId:freeze.workflow.workflowId,
          expectedRevision:previous,sourceUtf8:freeze.sourceUtf8});
      }
      if(saved.contentHash!==freeze.sourceHash)throw err('E_WORKFLOW_HASH','Controller 源码哈希不匹配');
      const record={format:'opendesk.workflow-revision.v1',workflow:freeze.workflow,
        revision:saved.revision,sourceHash:freeze.sourceHash,savedAt:Date.now(),
        ...(verifyFill?{verificationMode:'fill-readback'}:{})};
      const key=STORAGE_PREFIX+freeze.workflow.workflowId+':'+saved.revision;
      await api.storage.local.set({[key]:record});
      if(serial===stable())revision={...record,key};
      await refreshSaved();
      control('workflow-saved-list').value=key;
      status('已保存工作流 r'+saved.revision+' 与 JavaScript 源码哈希；未安装、未声称已验证');
    }catch(error){status(format(error),true);}
    finally{busy=false;updateButtons();}
  }
  function resultDisplay(runId,view,{workflowId=workflow.workflowId,bundleId=null,bundleRevision=null}={}) {
    const run=view?.run,result=view?.results?.find(row=>row.runId===runId);
    control('workflow-technical').text=JSON.stringify({
      workflowId,bundleId,bundleRevision,
      modelSource:lastProviderTurn?.businessWorkflowId===workflow.workflowId?lastProviderTurn:null,
      runId,state:run?.state||'unknown',revision:run?.revision||null,
      resultId:result?.resultId||null,sourceHash:run?.revision?.sourceHash||null,
      resultSourceHash:result?.revision?.sourceHash||null,documentId:run?.target?.documentId||null,
      workerRetired:run?.workerRetired===true,retirement:run?.retirementState||null},null,2);
    const raw=control('workflow-raw'),reveal=control('workflow-result-raw');
    raw.text='';reveal.hidden=true;reveal.open=false;
    if(!result){writeWorkflowOutput('后台尚无可核对的 Durable Result；未知状态不得自动重放。');return false;}
    if(!result.outcome?.ok) {
      writeWorkflowOutput(formatTaskError(result.outcome?.error||{code:'E_WORKFLOW_RUN'}));
      return false;
    }
    try {
      const value=decodeValue(result.outcome.valueWire),presented=presentTaskValue(value);
      writeWorkflowOutput(presented.text);
      if(presented.redacted||presented.truncated){
        // The Controller retains original bytes. Do not expose omitted secrets through a disclosure.
        raw.text='原始值包含省略或脱敏内容；完整回执保留在现有 Controller 中。';
        reveal.hidden=false;
      }
      return true;
    }catch(error){writeWorkflowOutput('持久结果解码失败：'+format(error));return false;}
  }
  function run(event,prepared=null,approvedReview=null) {
    if((!prepared&&!event?.isTrusted)||((busy||autoExecutionPending)&&!prepared)||host.executionPending||host.currentRun||(!compiled&&!prepared))
      return Promise.resolve({ok:false,skipped:true});
    let captured,params,freeze,permission,runOrigins;
    try {
      freeze=prepared?.freeze||compiled;captured=prepared?.captured||currentPageTarget.capture();
      if(captured.origin!==freeze.workflow.siteOrigin)
        throw err('E_WORKFLOW_ORIGIN','当前网页不属于工作流保存的网站');
      params=prepared?prepared.params:readParams();
      // A standalone frozen dynamic-link revision may only use its original
      // checked link; a v2 replay instead supplies fresh Controller DOM proof.
      if(!prepared){
        const bound=freeze.workflow.steps.filter(step=>step.op==='click'&&step.linkGuard&&step.param);
        if(bound.length)params={...params,__odLinks:Object.fromEntries(bound.map(step=>[
          step.stepId,{href:step.linkGuard.href,name:step.linkGuard.name,
            origin:step.linkGuard.origin,sourceUrl:step.linkGuard.sourceUrl}]))};
      }
      if(freeze.workflow.steps.some(step=>step.linkGuard&&step.linkGuard.sourceUrl!==captured.url)&&!prepared?.dynamicReplay)
        throw err('E_DOCUMENT_STALE','已保存链接的入口网页已变化，不能使用旧链接证明');
      if(!prepared){
        const risk=classifyWorkflowRunRisk(freeze.workflow);
        if(risk.needsReview&&!approvedReview){
          // Freeze scope before showing the review. No Chrome grant or RunHost
          // request may occur until the user confirms this exact action.
          dismissRunReview();
          pendingRunReview={serial:stable(),sourceHash:freeze.sourceHash,
            revisionKey:revision?.key||null,revisionHash:revision?.sourceHash||null,
            captured:structuredClone(captured),paramsSerial:JSON.stringify(params)};
          control('workflow-run-review-scope').text=
            '将对 '+captured.origin+' 执行：'+risk.description+
            '。可能提交、跳转或更改网页数据，请核对影响对象。';
          control('workflow-run-review').hidden=false;
          focus('workflow-run-review-cancel');
          return Promise.resolve({ok:false,reviewRequired:true});
        }
        if(approvedReview){
          const fields=['windowId','tabId','frameId','documentId','url','origin'];
          const valid=risk.needsReview&&approvedReview===pendingRunReview&&
            approvedReview.serial===stable()&&approvedReview.sourceHash===freeze.sourceHash&&
            approvedReview.revisionKey===(revision?.key||null)&&
            approvedReview.revisionHash===(revision?.sourceHash||null)&&
            approvedReview.paramsSerial===JSON.stringify(params)&&
            fields.every(key=>approvedReview.captured[key]===captured[key]);
          dismissRunReview(); // One-time confirmation is consumed immediately.
          if(!valid)throw err('E_WORKFLOW_REVIEW_STALE','操作范围、版本、参数或网页已变化，请重新点击运行');
        }
      }
      // This remains the real user gesture for Chrome's separate site grant.
      const extra=(prepared?.linkGuard?[prepared.linkGuard]:
        freeze.workflow.steps.filter(step=>step.linkGuard).map(step=>step.linkGuard))
        .filter(link=>link.origin!==captured.origin)
        .map(link=>permissionPattern(link.url));
      runOrigins=[...new Set([permissionPattern(captured.url),...extra])];
      permission=prepared?.permission||api.permissions.request({origins:runOrigins});
    }catch(error){
      status(format(error),true);return Promise.resolve({ok:false,error});
    }
    lastTrustedRun=null; // Failed or unknown new attempts must not reuse an old success hint.
    onRunOwner('pending');
    busy=true;phase='running';lastRun='running';hasError=false;
    writeWorkflowOutput('尚无本次持久结果');
    control('workflow-technical').text='';
    status(prepared?'正在执行本次对话任务（现有 RunHost）…':'已冻结源码、参数、页面和用户授权请求；准备通过现有 RunHost 执行');
    updateButtons();
    return (async()=>{
      if(!await permission)throw err('E_PERMISSION','网站授权被拒绝；未运行');
      if(disposed)throw err('E_HOST_CLOSED','Sidebar 已关闭');
      await currentPageTarget.revalidate(captured);
      if(prepared&&!await api.permissions.contains({origins:runOrigins}))
        throw err('E_PERMISSION','运行前网站权限已撤销；未执行');
      prepared?.assertCurrent?.();
      const saved=revision && revision.workflow.workflowId===freeze.workflow.workflowId &&
        revision.sourceHash===freeze.sourceHash &&
        JSON.stringify(revision.workflow)===JSON.stringify(freeze.workflow);
      if(saved) {
        // A loaded UI record is not proof that the Controller journal still
        // contains the same immutable bytes at the moment of each replay.
        const current=await host.controller.getControllerScript({
          scriptId:freeze.workflow.workflowId,revision:revision.revision});
        if(current?.contentHash!==freeze.sourceHash||current.sourceUtf8!==freeze.sourceUtf8)
          throw err('E_WORKFLOW_HASH','保存版本源码已变化或不可读取，已在启动前拒绝复跑');
      }
      const replaySource=prepared?.savedSource||null;
      if(replaySource){
        if(replaySource.kind!=='saved'||replaySource.scriptId!==freeze.workflow.workflowId||
          replaySource.contentHash!==freeze.sourceHash)
          throw err('E_WORKFLOW_HASH','完整工作流运行源与当前分段不一致');
        const stored=await host.controller.getControllerScript({
          scriptId:replaySource.scriptId,revision:replaySource.revision});
        if(stored?.contentHash!==freeze.sourceHash||stored.sourceUtf8!==freeze.sourceUtf8)
          throw err('E_WORKFLOW_HASH','AI-off 分段源码与冻结 Revision 不一致');
      }
      const source=replaySource||(saved?
        {kind:'saved',scriptId:freeze.workflow.workflowId,revision:revision.revision,contentHash:revision.sourceHash}:
        {kind:'draft',sourceUtf8:freeze.sourceUtf8});
      // Reading the frozen Controller is asynchronous: website permission,
      // Document and even this AI turn can change after the first gate.
      // Do not submit a stale run to RunHost (which still owns admission).
      if(disposed||prepared?.signal?.aborted)throw err('E_CANCELLED','本次运行已停止，未启动');
      if(!await api.permissions.contains({origins:runOrigins}))
        throw err('E_PERMISSION','启动前网站或目标链接权限已撤销；未执行');
      await currentPageTarget.revalidate(captured);
      prepared?.assertCurrent?.();
      if(disposed||prepared?.signal?.aborted)throw err('E_CANCELLED','本次运行已停止，未启动');
      // Stop may race with host.start before it returns a runId.
      // Mark this boundary synchronously; abort prevents all later admissions.
      if(prepared?.agent)prepared.agent.startPending=true;
      let claim;
      try {
        claim=await host.start({source,params,
          target:{mode:'borrowed',tabId:captured.tabId,frameId:0,documentId:captured.documentId,
            expectedUrl:captured.url,expectedWindowId:captured.windowId},deadlineAt:Date.now()+30000});
      } finally {
        if(prepared?.agent)prepared.agent.startPending=false;
      }
      runId=claim.runId;
      if(prepared?.agent)prepared.agent.startedCount++;
      onRunOwner(runId);updateButtons();
      if(prepared?.signal?.aborted){
        await host.stop({controller:true,runId:claim.runId,reason:'E_CANCELLED'});
        throw err('E_CANCELLED','已停止，不重放');
      }
      status('正在运行；编辑草稿不会改变本次执行内容。');
      const completed=await host.completion;
      if(completed?.state==='paused_unknown'||completed?.pendingSettlement)
        status('执行或收尾状态未知，禁止自动重新执行。请检查历史与网页副作用。',true);
      else status(''); // Result panel owns confirmed completion feedback.
      const view=await host.controller.snapshotControllerRun({runId:claim.runId});
      const result=view?.results?.find(item=>item?.runId===claim.runId);
      if(!disposed) {
        const decoded=resultDisplay(claim.runId,view,{
          workflowId:freeze.workflow.workflowId,bundleId:prepared?.bundleId||null,
          bundleRevision:prepared?.bundleRevision||null});
        if(prepared) {
          let proof=null;
          try{proof=verifyDirectExecutionReceipt({claim,completed,view,sourceHash:freeze.sourceHash,target:captured});}
          catch(error){status(format(error),true);}
          lastRun=proof&&decoded?'success':'failed';
          let readbackVerified=false;
          if(lastRun==='success'&&prepared.hasReadback) {
            try{readbackVerified=verifyDirectFillReadbacks({workflow:freeze.workflow,params,
              values:decodeValue(result.outcome.valueWire)});}catch{}
            // For a standalone fill, the same original Document must still be
            // current. A search click may navigate *after* the fill readback,
            // so its previous Document cannot be revalidated as post-click.
            if(readbackVerified&&!prepared.hasUnprovenClick) {
              try {
                await currentPageTarget.revalidate(captured);
                readbackVerified=await api.permissions.contains({origins:[permissionPattern(captured.url)]});
              }catch{readbackVerified=false;}
            }
          }
          let effect=null,effectTarget=null;
          if(lastRun==='success'&&prepared.effectExpectation&&!prepared.signal?.aborted) {
            try {
              let resultTarget=null;
              // Search may navigate asynchronously or update the current DOM.
              // Stabilize only by bounded, read-only target discovery: never
              // repeat the click or borrow permission from the old Document.
              for(let attempt=0;attempt<7;attempt++){
                if(prepared.signal?.aborted)break;
                const next=await currentPageTarget.refresh();
                if(next.status==='available'&&next.origin===captured.origin&&
                  next.windowId===captured.windowId&&next.tabId===captured.tabId&&
                  next.frameId===0){
                  resultTarget=next;
                  if(next.documentId!==captured.documentId||next.url!==captured.url||
                    attempt>=1)break;
                }
                if(attempt!==6)await new Promise(resolve=>setTimeout(resolve,220));
              }
              if(resultTarget&&!prepared.signal?.aborted&&
                await api.permissions.contains({origins:[permissionPattern(resultTarget.url)]})) {
                // One new RunHost read, bound to the current authorized
                // Document. The prior click is NEVER dispatched again.
                const post=await observation.observe(resultTarget,{signal:prepared.signal,
                  requestId:'search-effect-'+crypto.randomUUID(),
                  request:prepared.effectExpectation.query});
                if(!disposed&&!prepared.signal?.aborted){
                  effect=verifySearchBusinessEffect({
                    expectation:prepared.effectExpectation,before:prepared.beforeObservation,
                    after:post,actionTarget:captured,resultTarget});
                  if(effect)effectTarget=structuredClone(resultTarget);
                }
              }
            }catch{ /* Observation is optional; never promote or replay unknown click effects. */ }
          }
          if(lastRun==='success'&&prepared.linkGuard&&!prepared.signal?.aborted) {
            try {
              let destination=null;
              // A click receipt cannot prove navigation. Refresh the *active*
              // main Document before performing one separately authorized read.
              for(let attempt=0;attempt<7;attempt++){
                const next=await currentPageTarget.refresh();
                if(next.status==='available'&&next.windowId===captured.windowId&&
                  next.tabId===captured.tabId&&next.frameId===0&&
                  next.documentId!==captured.documentId){destination=next;break;}
                if(attempt!==6)await new Promise(resolve=>setTimeout(resolve,220));
              }
              if(destination&&destination.origin===prepared.linkGuard.origin&&
                destination.url===prepared.linkGuard.url&&
                await api.permissions.contains({origins:[permissionPattern(destination.url)]})) {
                const post=await observation.observe(destination,{signal:prepared.signal,
                  requestId:'link-effect-'+crypto.randomUUID(),request:prepared.linkGuard.name});
                if(!disposed&&!prepared.signal?.aborted){
                  effect=verifyOpenedLinkPage({
                    linkGuard:prepared.linkGuard,after:post,
                    actionTarget:captured,resultTarget:destination});
                  if(effect)effectTarget=structuredClone(destination);
                }
              }
            }catch{ /* Unknown effects never authorize a repeat click or ungranted read. */ }
          }
          const evidenceLevel=directExecutionEvidenceLevel({
            receiptVerified:lastRun==='success',hasReadback:readbackVerified,
            hasUnprovenClick:prepared.hasUnprovenClick,
            searchEffectVerified:Boolean(effect&&effect.kind.startsWith('search-')),
            navigationEffectVerified:Boolean(effect&&['link-page','product-page'].includes(effect.kind))
          });
          if(lastRun==='success'&&evidenceLevel==='BUSINESS_EFFECT_VERIFIED'){
            lastTrustedRun={runId:claim.runId,sourceHash:freeze.sourceHash,siteOrigin:captured.origin};
            if(proof?.resultId)reportVerifiedWorkflowEffect(claim.runId);
          }
          if(lastRun==='failed' && !hasError)
            status('运行未成功或结果无法确认，请检查真实结果及页面效果；不会自动重试。',true);
          const readOnlyVerified=lastRun==='success'&&decoded&&
            !prepared.hasReadback&&!prepared.hasUnprovenClick&&
            freeze.workflow.steps.every(step=>['observe','extract','assert','wait'].includes(step.op));
          return {ok:lastRun==='success',runId:claim.runId,resultId:proof?.resultId||null,
            evidenceLevel,readbackVerified,readOnlyVerified,effect,effectTarget,
            readbackValues:readbackVerified?decodeValue(result.outcome.valueWire):null};
        }
        let receiptProof=null;
        try{receiptProof=verifyDirectExecutionReceipt({
          claim,completed,view,sourceHash:freeze.sourceHash,target:captured
        });}catch(error){status(format(error),true);}
        const frozenRevisionValid=source.kind!=='saved'||verifySavedWorkflowRevision({
          source,claim,completed,view,result
        });
        lastRun=completed?.state==='completed'&&completed?.retirement?.state==='released'&&
          !completed?.pendingSettlement&&result?.state==='completed'&&result?.outcome?.ok===true&&decoded&&
          result?.resultId===claim.resultId&&view?.run?.resultId===claim.resultId&&
          view?.run?.state==='completed'&&view.run.workerRetired===true&&
          view.run.retirementState==='released'&&receiptProof&&frozenRevisionValid?'success':'failed';
        if(lastRun==='success' && view?.run?.state==='completed' && view.run.workerRetired===true &&
          view.run.retirementState==='released' && view.run.runId===claim.runId &&
          view.run.target?.documentId===captured.documentId &&
          view.run.target?.allowedOrigin===captured.origin &&
          view.run.revision?.sourceHash===freeze.sourceHash &&
          result.revision?.sourceHash===freeze.sourceHash && result.runId===claim.runId)
          lastTrustedRun={runId:claim.runId,sourceHash:freeze.sourceHash,siteOrigin:captured.origin};
        let evidenceLevel=directExecutionEvidenceLevel({receiptVerified:lastRun==='success'});
        if(lastRun==='success') {
          let readbackVerified=false;
          const standaloneFill=directVerifiedSerial===JSON.stringify(freeze.workflow)&&
            freeze.workflow.steps.some(step=>step.op==='fill')&&
            !freeze.workflow.steps.some(step=>step.op==='click');
          if(standaloneFill) {
            try {
              readbackVerified=verifyDirectFillReadbacks({
                workflow:freeze.workflow,params,values:decodeValue(result.outcome.valueWire)});
              if(readbackVerified) {
                await currentPageTarget.revalidate(captured);
                readbackVerified=await api.permissions.contains({
                  origins:[permissionPattern(captured.url)]});
              }
            }catch { readbackVerified=false; }
          }
          evidenceLevel=directExecutionEvidenceLevel({
            receiptVerified:true,hasReadback:readbackVerified});
          if(evidenceLevel==='BUSINESS_EFFECT_VERIFIED'&&receiptProof?.resultId)
            reportVerifiedWorkflowEffect(claim.runId);
          lastTrustedRun={runId:claim.runId,sourceHash:freeze.sourceHash,siteOrigin:captured.origin};
          if(source.kind==='saved')status('固定 r'+source.revision+
            ' 已脱离 AI 运行（SHA-256：'+source.contentHash.slice(0,12)+'…）。'+
            (readbackVerified?'页面输入值已读回匹配，不代表服务器提交。':
              '运行回执已验证，页面业务效果待独立确认。'));
        }
        if(lastRun==='failed'&&!hasError)
          status('运行未成功或结果无法确认，请检查真实结果及页面效果；不会自动重试。',true);
        return {ok:lastRun==='success',runId:claim.runId,
          resultId:receiptProof?.resultId||null,evidenceLevel};
      }
    })().catch(error=>{
      lastRun='failed';
      // A late Host start/Stop settlement cannot overwrite the task-level
      // OUTCOME_UNKNOWN or STOP_REQUESTED result already shown to the user.
      if(!disposed&&!prepared?.agent?.stopping){
        writeWorkflowOutput(format(error)+'；失败不会自动重放');
        status(format(error)+'；失败不会自动重放',true);
      }
      return {ok:false,error};
    }).finally(()=>{
      busy=false;phase='idle';
      // The owning Stop remains visible if the durable slot is still held
      // (e.g. outcome/retirement unknown); never lend that Stop to Developer.
      if(!runId || host.currentRun!==runId){runId=null;onRunOwner(null);}
      if(!disposed)updateButtons();
    });
  }

  // Conversation wording is derived only from verified durable RunHost receipts
  // and independent DOM readback. A completed worker is not an observed business effect.
  function describeExecution(reply) {
    if(reply?.ok) {
      if(reply.readOnlyVerified)return '只读网页步骤和持久运行回执已完成验证。';
      if(reply.effect?.kind==='product-page')
        return '已在新 Document 独立核对商品名称与页面价格。';
      if(reply.effect?.kind==='link-page')
        return '已在新 Document 独立读回目标网页标题。';
      if(reply.effect?.kind==='search-results')
        return '搜索操作已执行，并独立读回与关键词关联的搜索结果状态及 '+
          reply.effect.visibleResultLinks+' 个新出现的可见链接；未验证结果相关性。';
      if(reply.effect?.kind==='search-empty')
        return '搜索操作已执行，已独立读回该关键词的无结果状态。';
      if(reply.effect?.kind==='search-inline')
        return '搜索操作已执行，已独立读回页面上的搜索完成状态及匹配关键词的结果文字。';
      if(reply.evidenceLevel==='BUSINESS_EFFECT_VERIFIED'&&reply.readbackVerified)
        return '已填写网页内容，并核对输入框读回值一致；不代表已提交至服务器。';
      return '浏览器操作回执已核对，网页最终业务效果仍待验证。';
    }
    if(reply?.error?.code==='E_CANCELLED')return '已停止后续操作；先前已经发生的网页变化不会自动回滚。';
    if(/UNKNOWN|TIMEOUT|SETTLEMENT/.test(reply?.error?.code||'')||!reply?.error)
      return '无法确认网页操作是否生效。为避免重复修改，本次不会自动重试。';
    return '本次任务未完成：'+String(reply.error.message||reply.error.code||'运行失败').slice(0,240)+'。没有自动重试。';
  }
  function reportExecution(reply,planned=null) {
    if(reply?.skipped||reply?.reviewRequired)return;
    const message=reply?.ok&&planned
      ?workflowExecutionFeedback({execution:reply,workflow:planned.freeze.workflow,
        params:planned.params,values:reply.readbackValues})
      :describeExecution(reply);
    if(planned&&reply?.ok&&(reply.evidenceLevel==='BUSINESS_EFFECT_VERIFIED'||reply.readOnlyVerified)) {
      verifiedTurnHistory=[...verifiedTurnHistory,{
        request:planned.request.slice(0,4000),outcome:'verified',
        readbackVerified:reply.readbackVerified===true,
        stepCount:planned.freeze.workflow.steps.length,
        effectKind:reply.effect?.kind||(reply.readOnlyVerified?'read-only':'input-readback'),
        ...(Number.isSafeInteger(reply.effect?.visibleResultLinks)
          ?{visibleResultLinks:reply.effect.visibleResultLinks}:{})
      }].slice(-4);
      verifiedContextTarget={windowId:planned.captured.windowId,
        tabId:planned.captured.tabId,origin:planned.captured.origin};
    }
    appendChat('执行结果',message);
    // Conversation owns the plain-language outcome; technical bytes stay folded.
    if(planned){writeWorkflowOutput(message);status(reply?.ok?'':message,!reply?.ok);}
    else status(message,!reply?.ok);
  }
  // The model never grants authority. Reuse the same frozen Controller and
  // RunHost call whether execution follows a safe Send or a Chrome grant gesture.
  function preparedAIExecution(planned,permission) {
    return {
      freeze:planned.freeze,captured:planned.captured,params:planned.params,
      permission,signal:planned.signal,hasReadback:planned.hasReadback,
      hasUnprovenClick:planned.hasUnprovenClick,
      beforeObservation:planned.beforeObservation,effectExpectation:planned.effectExpectation,
      linkGuard:planned.linkGuard,
      // Keep task ownership through the shared RunHost adapter, including
      // the asynchronous interval before host.start returns its runId.
      agent:planned.agent,
      assertCurrent:()=>{
        if(disposed||planned.serial!==stable()||planned.selected!==provider()||
          planned.epoch!==planningGeneration)
          throw err('E_WORKFLOW_REVIEW_STALE','步骤、参数或模型来源已变化，未执行');
      }
    };
  }

  // Promote only clearly bounded, independently admitted e-commerce steps.
  // The first AI-on run executes this SAME parameterized source, so saving it
  // never substitutes unexecuted replay JavaScript for an original proof.
  function promoteVerifiedReplayParameters(executable,admission,goal) {
    const params=structuredClone(admission.params);
    const intent=simpleCommerceReplayGoal(goal);
    if(!intent)return params;
    const props=executable.paramsSchema.properties,required=executable.paramsSchema.required;
    const query=admission.effectExpectation?.query;
    const fill=executable.steps.find(step=>step.op==='fill');
    if(typeof query==='string'&&query===intent.query&&/^[\p{L}\p{N} _.-]{2,120}$/u.test(query)&&
      fill&&!fill.param&&fill.text===query&&
      executable.steps.length===2&&!Object.hasOwn(props,'query')){
      props.query={type:'string',title:'搜索关键词',maxLength:120,default:query};
      required.push('query');fill.param='query';delete fill.text;params.query=query;
    }
    const guard=admission.linkGuard,click=executable.steps.find(step=>step.op==='click');
    if(guard&&guard.name===intent.productName&&click&&executable.steps.length===1&&!click.param&&
      !Object.hasOwn(props,'productName')&&
      /^[\p{L}\p{N}][\p{L}\p{N} _.-]{2,119}$/u.test(guard.name)){
      props.productName={type:'string',title:'目标商品名称',maxLength:120,default:guard.name};
      required.push('productName');click.param='productName';params.productName=guard.name;
      params.__odLinks={[click.stepId]:{
        href:guard.href,name:guard.name,origin:guard.origin,sourceUrl:guard.sourceUrl}};
    }
    checkParamsSchema(executable.paramsSchema);
    return params;
  }
  // One user's Send owns every round. A round is only an admitted fragment;
  // neither a model completion claim nor a successful Worker receipt can
  // bypass verification of the original goal.
  async function advanceWorkflowAgent(agent,previous,reply) {
    try {
      for(;;) {
        if(workflowAgent!==agent||agent.stopping)return;
        agent.guard.check();
        const verdict=agent.guard.verified({claim:previous.ticket,reply});
        // The journal is derived from durable RunHost + independent business
        // evidence, never from model plans or a completed Worker alone.
        if(['CONTINUE','COMPLETED'].includes(verdict.state)&&
          !agent.segments.some(part=>part.signature===previous.ticket.signature)) {
          const kind=reply.effect?.kind||
            (reply.readbackVerified?'input-readback':
              reply.readOnlyVerified?'read-only':null);
          if(!kind)throw err('E_WORKFLOW_EVIDENCE','缺少分段业务核验证据');
          const name=kind==='product-page'?reply.effect.name:
            kind==='link-page'?reply.effect.title:null;
          if(typeof reply.runId!=='string'||!reply.runId||
            typeof reply.resultId!=='string'||!reply.resultId)
            throw err('E_WORKFLOW_EVIDENCE','当前段未获得独立 RunHost 结果身份，不能纳入完整复跑');
          agent.segments.push({signature:previous.ticket.signature,
            workflow:structuredClone(previous.freeze.workflow),
            entryUrl:previous.captured.url,
            verificationMode:previous.freeze.workflow.steps.some(step=>step.op==='fill')
              ?'fill-readback':'none',
            evidence:{kind,...(name?{name}: {})},
            proof:{runId:reply.runId,resultId:reply.resultId,
              sourceHash:previous.freeze.sourceHash,
              origin:previous.captured.origin,documentId:previous.captured.documentId}});
        }
        if(verdict.state==='COMPLETED') {
          if(agent.segments.length>1)
            fullAgentDraft={bundleId:'wf-'+crypto.randomUUID(),
              goal:agent.goal,title:previous.freeze.workflow.title,
              segments:structuredClone(agent.segments),tailSerial:stable()};
          const multi=agent.guard.snapshot().rounds>1;
          finishWorkflowAgent(agent,'COMPLETED','已核对原始任务目标。'+
            (multi?'跨轮操作已分别核验；点击「保存」将冻结完整的多段 JavaScript 工作流，复跑仍须逐段确认网页和权限。':
              '可以保存此版本并在 AI 关闭时独立运行。'));
          return;
        }
        if(verdict.state!=='CONTINUE'){
          finishWorkflowAgent(agent,verdict.state,verdict.reason);
          return;
        }
        if(agent.guard.snapshot().remainingRounds<=0)
          throw err('E_AGENT_LIMIT','达到连续决策上限，部分目标尚未证实，已停止');
        // Rebind after any click/navigation. A new document never inherits an
        // old locator or grants a new origin. Same tab and approved origin only.
        phase='planning';busy=true;planningAbort=agent.controller;
        control('workflow-editor').dataset.agentState='OBSERVING';
        control('workflow-planning-indicator').text='正在读取最新网页以判断下一步…';
        updateButtons();
        const target=await currentPageTarget.refresh();
        agent.guard.check();
        if(target?.status!=='available'||target.frameId!==0||
          target.windowId!==agent.initialTarget.windowId||
          target.tabId!==agent.initialTarget.tabId||
          (target.origin!==agent.initialTarget.origin&&
           (target.origin!==agent.expectedNavigation?.origin||
            target.url!==agent.expectedNavigation?.url)))
          throw err('E_DOCUMENT_STALE','网页已切换到其他授权范围；不会自行扩大权限或重复点击');
        planningTarget=target;
        if(!await api.permissions.contains({origins:[permissionPattern(target.url)]}))
          throw err('E_PERMISSION','当前网页授权失效，停止后续操作');
        agent.guard.check();
        const recipientId=await workflowObservationRecipientId({
          selected:agent.selected,endpoint:agent.settings.endpoint,model:agent.settings.model});
        const receiverPattern=agent.selected==='local_codex'?null:permissionPattern(agent.settings.endpoint);
        const approval={selected:agent.selected,
          sessionId:agent.selected==='local_codex'?localPlanner.snapshot().sessionId:session(),
          captured:target,recipientId,receiverPattern};
        if(!validObservationApproval(approval))
          throw err('E_AI_APPROVAL','网页摘要授权已失效，请重新发送并授权，不再自动读取');
        if(receiverPattern&&!await api.permissions.contains({origins:[receiverPattern]}))
          throw err('E_AI_PERMISSION','AI 接收方权限已撤销，后续决策已停止');
        const receipt=await observation.observe(target,{signal:agent.controller.signal,
          requestId:'agent-observe-'+crypto.randomUUID(),request:agent.goal});
        await currentPageTarget.revalidate(target);
        agent.guard.check();
        planningObservation=receipt;
        agent.guard.observed({target,receipt,remaining:agent.goal});
        const serial=stable(),exactTarget=Object.fromEntries(
          ['windowId','tabId','frameId','documentId','url','origin'].map(key=>[key,target[key]]));
        const settings=agent.settings,source=agent.selected;
        // Each round is a new Document-bound fragment. The prior script's
        // siteOrigin/steps must not contaminate normalization on navigation.
        // Verified history is transmitted separately and carries no authority.
        const roundWorkflow={...snapshot(),siteOrigin:target.origin,steps:[]};
        const planArgs={source,workflow:roundWorkflow,target:exactTarget,
          observationReceipt:workflowObservationForModel(receipt),signal:agent.controller.signal,
          settings,history:verifiedTurnHistory,
          consent:{model:true,workflow:true,observation:true},
          onApproval:async(event,context)=>{
            // Native may ask for browser.observe after we already obtained
            // this round's independently verified, authorized RunHost receipt.
            // Reuse only the exact current Document; never issue a redundant
            // second RunHost observation or grant on a Provider callback.
            const same=event?.target&&
              ['windowId','tabId','frameId','documentId','url','origin']
                .every(key=>event.target[key]===target[key]);
            if(event?.tool!=='browser.observe'||event?.canApprove!==true||!same||
              context?.signal?.aborted||agent.controller.signal.aborted)
              return {decision:'deny'};
            agent.guard.check();
            await currentPageTarget.revalidate(target);
            agent.guard.check();
            if(!await api.permissions.contains({origins:[permissionPattern(target.url)]})||
              !validObservationApproval(approval))
              return {decision:'deny'};
            return {decision:'approve',result:workflowObservationForModel(receipt)};
          }};
        // Schema and incomplete-step failures precede any issued RunHost effect.
        // One bounded corrective model decision is permitted, not blind retries.
        let checked=null,lastPreflight=null;
        for(let attempt=0;attempt<2;attempt++){
          agent.guard.check();
          planningCurrent(agent.epoch,serial,source);
          const facts=agent.guard.snapshot().facts;
          const progress=('\n已由独立 RunHost 读回核验：'+facts.join('、')).slice(0,460)+
            '。只规划尚未完成的下一段；不得重放这些步骤，也不能改变原始目标、对象或禁止项。';
          const correction=attempt>0?'\n前一方案在执行前失败（'+
            lastPreflight.code+'）；仅纠正该错误，不增加动作。':'';
          const prompt=agent.goal.slice(0,Math.max(100,3990-progress.length-correction.length))+
            progress+correction;
          let proposed;
          try{
            if(++agent.modelDecisions>8)throw err('E_AGENT_LIMIT','已达到八次 AI 决策上限，停止重新规划');
            proposed=(await workflowProviders.generateWorkflow({...planArgs,request:prompt})).proposal;
            planningCurrent(agent.epoch,serial,source);
            const admission=prepareDirectExecution({
              request:agent.goal,workflow:proposed,target,observation:receipt,
              verifiedFacts:agent.guard.snapshot().facts});
            const executable=structuredClone(proposed);
            if(admission.linkGuard){
              const click=executable.steps.find(step=>step.op==='click');
              if(!click)throw err('E_AI_REVIEW_REQUIRED','缺少已核验链接点击');
              click.linkGuard=structuredClone(admission.linkGuard);
            }
            const runParams=promoteVerifiedReplayParameters(executable,admission,agent.goal);
            const freeze=await compileWorkflow(executable,{verifyFill:true});
            if(executable.steps.length>4)throw err('E_AGENT_SCHEMA','AI 每轮最多四步，请只提出接下来的必要动作');
            checked={executable,admission,freeze,runParams};break;
          }catch(error){
            const code=error?.code||'';
            if(attempt>0||!['E_WORKFLOW_SCHEMA','E_WORKFLOW_AI',
              'E_AI_MISSING_ACTION','E_AI_ASSERT_TARGET','E_AI_VALUE_NOT_GROUNDED',
              'E_AI_RESPONSE','E_AI_SCHEMA','E_AGENT_SCHEMA'].includes(code))throw error;
            lastPreflight=error;
            control('workflow-planning-indicator').text='步骤校验失败，正在进行唯一一次安全纠正…';
          }
        }
        if(!checked)throw err('E_AGENT_SCHEMA','模型未返回可执行的受限步骤');
        planningCurrent(agent.epoch,serial,source);
        if(!await api.permissions.contains({origins:[permissionPattern(target.url)]}))
          throw err('E_PERMISSION','步骤生成后网站权限已撤销');
        await currentPageTarget.revalidate(target);
        agent.guard.check();
        const {executable,admission,freeze,runParams}=checked;
        const ticket=agent.guard.claim({workflow:executable,target,observation:receipt,linkGuard:admission.linkGuard,params:runParams});
        // Only the current round is shown/editable/savable as a JavaScript
        // artifact. A multi-Document agent journal is not misrepresented as a
        // portable one-script replay.
        workflow=structuredClone(executable);touched=true;lastTrustedRun=null;
        directVerifiedSerial=stable();
        render();persistDraft();
        const next={
          epoch:agent.epoch,selected:source,request:agent.goal,serial:stable(),
          freeze,captured:structuredClone(target),params:structuredClone(runParams),
          hasReadback:admission.hasReadback,hasUnprovenClick:admission.hasUnprovenClick,
          beforeObservation:receipt,effectExpectation:admission.effectExpectation,
          linkGuard:admission.linkGuard,signal:agent.controller.signal,
          agent,ticket,continuation:true
        };
        agent.expectedNavigation=admission.linkGuard||null;
        const origins=[permissionPattern(target.url)];
        if(admission.linkGuard&&admission.linkGuard.origin!==target.origin)
          origins.push(permissionPattern(admission.linkGuard.url));
        const granted=await api.permissions.contains({origins:[...new Set(origins)]});
        agent.guard.check();
        if(!granted){
          // Only an actual trusted user click may obtain the missing Chrome
          // permission. Keep the exact frozen proposal; no synthetic gesture.
          pendingAIReview=next;
          control('workflow-run-review-scope').text=
            '下一步需要新增网站权限。确认后由 Chrome 原生授权，不会自动扩大范围。';
          control('workflow-run-review').hidden=false;
          appendChat('任务进展','已经核对前面的操作；下一步需要网站授权后继续。');
          phase='idle';busy=false;planningAbort=null;planningTarget=null;
          updateButtons();focus('workflow-run-review-confirm');return;
        }
        planningAbort=null;planningTarget=null;busy=false;phase='running';updateButtons();
        previous=next;
        reply=await executeAIAuto(next);
      }
    }catch(error){
      if(workflowAgent!==agent||agent.stopping)return;
      const code=error?.code||'E_AGENT';
      const question=workflowAgentQuestion(code);
      const state=code==='E_AGENT_NO_PROGRESS'?'NO_PROGRESS_STOPPED':
        code==='E_AGENT_LIMIT'?'LIMIT_REACHED':
        /UNKNOWN|TIMEOUT|SETTLEMENT/.test(code)?'OUTCOME_UNKNOWN':
        question?'ASK_USER':'BLOCKED';
      const guidance=question||(
        state==='OUTCOME_UNKNOWN'?'结果尚未核实，请检查网页，禁止自动重试。':
        '已保留之前核验成功的步骤，不会自动重放。');
      finishWorkflowAgent(agent,state,format(error)+'。'+guidance);
    }finally{
      if(workflowAgent===agent&&!agent.stopping){
        busy=false;phase='idle';planningAbort=null;planningTarget=null;updateButtons();
      }
    }
  }

  // Send is the user's task intent, not a Chrome permission gesture after an
  // asynchronous Provider turn. Auto-run ONLY when every required site grant
  // already exists. RunHost is still the sole execution and write authority.
  async function executeAIAuto(planned) {
    try {
      const current=currentPageTarget?.snapshot;
      const fields=['windowId','tabId','frameId','documentId','url','origin'];
      if(disposed||planned.epoch!==planningGeneration||planned.serial!==stable()||
        planned.selected!==provider()||!current||current.status!=='available'||
        fields.some(key=>current[key]!==planned.captured[key]))
        throw err('E_WORKFLOW_REVIEW_STALE','当前步骤、参数或网页已变化；未自动执行');
      const origins=[permissionPattern(planned.captured.url)];
      if(planned.linkGuard&&planned.linkGuard.origin!==planned.captured.origin)
        origins.push(permissionPattern(planned.linkGuard.url));
      if(!await api.permissions.contains({origins:[...new Set(origins)]}))
        throw err('E_PERMISSION','网站权限已撤销；不会自动申请或执行');
      if(disposed||planned.epoch!==planningGeneration||planned.serial!==stable()||
        planned.selected!==provider())
        throw err('E_WORKFLOW_REVIEW_STALE','任务已变化；未自动执行');
      autoExecutionPending=false;
      appendChat('对话状态','安全检查通过，正在执行 '+planned.freeze.workflow.steps.length+' 步…');
      const reply=await run(null,preparedAIExecution(planned,Promise.resolve(true)));
      if(!disposed&&!planned.signal?.aborted)reportExecution(reply,planned);
      if(!planned.continuation&&planned.agent===workflowAgent&&!planned.signal?.aborted)
        void advanceWorkflowAgent(planned.agent,planned,reply);
      return reply;
    }catch(error){
      if(!disposed){
        status(format(error)+'；不会自动重试',true);
        appendChat('执行结果','网页或权限已变化，本次未自动执行；请检查后重新发送。');
      }
      if(!planned.continuation&&planned.agent===workflowAgent)
        finishWorkflowAgent(planned.agent,'PARTIAL','执行未开始或已停止，未自动重试。');
      return {ok:false,error};
    }finally{
      autoExecutionPending=false;
      if(!disposed)updateButtons();
    }
  }
  // The explicit button remains only when an actual browser grant is missing.
  // The Chrome permissions.request call must occur synchronously in its gesture.
  function executeAIReview(event) {
    if(!event?.isTrusted||!pendingAIReview)return Promise.resolve({ok:false,skipped:true});
    const planned=pendingAIReview;
    const target=currentPageTarget?.snapshot;
    const identity=['windowId','tabId','frameId','documentId','url','origin'];
    if(planned.serial!==stable()||planned.selected!==provider()||
      planned.epoch!==planningGeneration||
      !target||target.status!=='available'||
      identity.some(key=>planned.captured[key]!==target[key])) {
      dismissRunReview();
      status('步骤、网页或模型来源已变化；旧确认已失效，请重新生成步骤。',true);
      return Promise.resolve({ok:false,skipped:true});
    }
    // This native click is the only Run gesture. Chrome may still request a
    // missing origin grant; already-granted origins do not need a product popup.
    let permission;
    try {
      const origins=[permissionPattern(planned.captured.url)];
      if(planned.linkGuard&&planned.linkGuard.origin!==planned.captured.origin)
        origins.push(permissionPattern(planned.linkGuard.url));
      permission=api.permissions.request({origins:[...new Set(origins)]});
    }
    catch(error){dismissRunReview();status(format(error),true);return Promise.resolve({ok:false,error});}
    dismissRunReview(); // consume before any asynchronous work or second click
    appendChat('对话状态','正在执行已确认的 '+planned.freeze.workflow.steps.length+' 步…');
    return run(event,preparedAIExecution(planned,permission)).then(reply=>{
      if(!disposed&&!planned.signal?.aborted)reportExecution(reply,planned);
      if(planned.agent===workflowAgent&&!planned.signal?.aborted)
        void advanceWorkflowAgent(planned.agent,planned,reply);
      return reply;
    });
  }
  // AI-off orchestration ONLY: existing Controller/Compiler/RunHost remain
  // the sole execution and permission authorities. Each saved fragment gets
  // a fresh Document observation and exact frozen-revision check.
  async function runSavedBundle(event,prepared=null) {
    if(!event?.isTrusted||(!selectedBundle&&!prepared?.bundle)||workflowAgent||
      busy||autoExecutionPending||host.executionPending||host.currentRun)
      return {ok:false,skipped:true};
    // Natural-language intent cannot be reused as a delayed permission gesture.
    const bundle=prepared?.bundle||selectedBundle,
      dynamic=bundle.format===WORKFLOW_DYNAMIC_BUNDLE_FORMAT;
    let params,initial,permission,runtimeGoal;
    try {
      params=prepared?validateTaskParams(bundle.paramsSchema,prepared.params):readParams();
      if(dynamic){
        const intent=dynamicReplayIntent(bundle,params);
        params=intent.values;runtimeGoal=intent.goal;
      }else{
        assertLegacyReplayParameterScope(bundle,params);
        runtimeGoal=bundle.goal;
      }
      initial=prepared?.captured||currentPageTarget.capture();
      if(initial.origin!==bundle.segments[0].workflow.siteOrigin||
        initial.url!==bundle.segments[0].entryUrl)
        throw err('E_DOCUMENT_STALE','请先打开完整工作流原始入口网页；不会从任意页面盲目复跑');
      // Chrome's grant request is started synchronously in this trusted click.
      // A later segment never requests a new origin outside a user gesture.
      const scopes=[...new Set(bundle.segments.map(part=>permissionPattern(part.entryUrl)))];
      permission=prepared?(prepared.permission||api.permissions.contains({origins:scopes})):
        api.permissions.request({origins:scopes});
    }catch(error){status(format(error),true);return {ok:false,error};}
    const epoch=++planningGeneration,abort=new AbortController();
    const agent={epoch,controller:abort,selected:'replay',goal:runtimeGoal,
      initialTarget:structuredClone(initial),startedCount:0,
      guard:createWorkflowAgentLoopGuard({goal:runtimeGoal,signal:abort.signal}),
      expectedNavigation:null,stopping:false};
    workflowAgent=agent;
    agent.deadline=setTimeout(()=>void stopWorkflowAgent('E_AGENT_LIMIT').catch(()=>{}),480000);
    control('workflow-editor').dataset.agentState='RUNNING';
    updateButtons();
    try {
      if(!await permission)throw err('E_PERMISSION','完整工作流所需网站权限未批准，尚未执行');
      agent.guard.check();
      await verifyWorkflowBundle(bundle);
      let previousNavigationDocument=null,verifiedEntry=null,lastEffect=null;
      for(let i=0;i<bundle.segments.length;i++){
        if(workflowAgent!==agent||agent.stopping||(!prepared&&selectedBundle!==bundle))
          throw err('E_CANCELLED','复跑已经停止或历史版本已改变');
        const segment=bundle.segments[i];
        const target=await currentPageTarget.refresh();
        agent.guard.check();
        const fromPrevious=dynamic&&i>0;
        const expected=fromPrevious?verifiedEntry:null;
        const targetFields=['windowId','tabId','frameId','documentId','url','origin'];
        if(target.status!=='available'||target.frameId!==0||
          target.windowId!==initial.windowId||target.tabId!==initial.tabId||
          target.origin!==segment.workflow.siteOrigin||
          (fromPrevious?(!expected||targetFields.some(key=>target[key]!==expected[key])):
            target.url!==segment.entryUrl)||
          previousNavigationDocument===target.documentId)
          throw err('E_DOCUMENT_STALE','第 '+(i+1)+' 段入口不是上一段独立核验的真实 Document，已停止');
        const scope=permissionPattern(target.url);
        if(!await api.permissions.contains({origins:[scope]}))
          throw err('E_PERMISSION','第 '+(i+1)+' 段网站权限已撤销，未执行');
        await currentPageTarget.revalidate(target);
        agent.guard.check();
        phase='planning';busy=true;updateButtons();
        const before=await observation.observe(target,{signal:abort.signal,
          requestId:'replay-observe-'+crypto.randomUUID(),request:runtimeGoal});
        await currentPageTarget.revalidate(target);
        agent.guard.check();
        agent.guard.observed({target,receipt:before,remaining:runtimeGoal});
        const stripped={...segment.workflow,steps:segment.workflow.steps.map(step=>{
          const clean={...step};delete clean.linkGuard;
          // Admission alone receives the newly requested product label, never
          // the persisted source. The frozen script uses param + DOM binding.
          if(clean.op==='click'&&clean.param){
            clean.roleName=String(params[clean.param]||'');delete clean.param;
          }
          return clean;
        })};
        const segmentParams=Object.fromEntries(
          Object.keys(segment.workflow.paramsSchema.properties).filter(key=>
            Object.hasOwn(params,key)).map(key=>[key,params[key]]));
        const admitted=prepareDirectExecution({
          request:runtimeGoal,workflow:stripped,target,observation:before,
          verifiedFacts:agent.guard.snapshot().facts,paramsOverride:segmentParams,
          allowBoundParameters:true});
        const clickStep=segment.workflow.steps.find(step=>step.linkGuard)||null;
        const frozenLink=clickStep?.linkGuard||null;
        if(dynamic&&frozenLink){
          const next=admitted.linkGuard,productName=params[bundle.bindingPlan.productParam];
          if(!next||next.name!==productName||next.origin!==bundle.bindingPlan.allowedOrigin||
            next.origin!==frozenLink.origin||next.sourceUrl!==target.url||
            !await api.permissions.contains({origins:[permissionPattern(next.url)]}))
            throw err('E_WORKFLOW_LINK','新商品链接未被当前 DOM 唯一验证或目标授权不一致');
        }else if(JSON.stringify(frozenLink)!==JSON.stringify(admitted.linkGuard||null))
          throw err('E_WORKFLOW_LINK','目标链接与冻结时不一致，AI 关闭时不能自行选择新链接');
        const freeze=await compileWorkflow(segment.workflow,{
          verifyFill:segment.verificationMode==='fill-readback'});
        if(freeze.sourceHash!==segment.sourceHash)
          throw err('E_WORKFLOW_HASH','第 '+(i+1)+' 段 JavaScript 内容已变化');
        const ticket=agent.guard.claim({workflow:segment.workflow,target,
          observation:before,linkGuard:admitted.linkGuard,params:segmentParams});
        // Private, ephemeral values come ONLY from this fresh RunHost DOM
        // receipt. They are not saved, exposed as editable parameters or AI.
        const boundParams=clickStep?.param&&admitted.linkGuard?
          {...segmentParams,__odLinks:{[clickStep.stepId]:{
            href:admitted.linkGuard.href,name:admitted.linkGuard.name,
            origin:admitted.linkGuard.origin,sourceUrl:admitted.linkGuard.sourceUrl}}}:
          segmentParams;
        if(admitted.linkGuard){
          agent.expectedNavigation=admitted.linkGuard;
          previousNavigationDocument=target.documentId;
        }else previousNavigationDocument=null;
        phase='running';busy=false;
        status((prepared?'正在复用已保存的固定 JavaScript':'AI 已关闭')+
          '：执行第 '+(i+1)+' / '+bundle.segments.length+' 段…');
        updateButtons();
        const reply=await run(null,{
          freeze,captured:structuredClone(target),params:boundParams,
          permission:Promise.resolve(true),signal:abort.signal,dynamicReplay:dynamic,
          hasReadback:admitted.hasReadback,
          hasUnprovenClick:admitted.hasUnprovenClick,
          beforeObservation:before,effectExpectation:admitted.effectExpectation,
          linkGuard:admitted.linkGuard,
          bundleId:bundle.bundleId,bundleRevision:bundle.revision,
          savedSource:{kind:'saved',scriptId:segment.workflow.workflowId,
            revision:segment.revision,contentHash:segment.sourceHash},
          agent,assertCurrent:()=>{
            if(workflowAgent!==agent||agent.stopping||abort.signal.aborted||
              (!prepared&&selectedBundle!==bundle))
              throw err('E_CANCELLED','完整复跑已停止或版本已更改');
          }
        });
        if(workflowAgent!==agent||agent.stopping)return {ok:false,stopped:true};
        const expectedEvidence=dynamic&&segment.evidence.kind==='product-page'?
          {...segment.evidence,name:params[bundle.bindingPlan.productParam]}:
          segment.evidence;
        if(!verifyReplayBusinessEffect(expectedEvidence,reply))
          throw err('E_WORKFLOW_EVIDENCE','第 '+(i+1)+' 段业务效果未独立核验，停止且绝不重复操作');
        lastEffect=reply.effect||null;
        if(dynamic&&i<bundle.segments.length-1){
          if(!reply.effectTarget||!['search-results','search-inline'].includes(reply.effect?.kind))
            throw err('E_WORKFLOW_EVIDENCE','未获得搜索后独立核验的网页入口，拒绝猜测导航');
          verifiedEntry=structuredClone(reply.effectTarget);
        }
        const verdict=agent.guard.verified({claim:ticket,reply});
        if(!['CONTINUE','COMPLETED'].includes(verdict.state))
          throw err('E_WORKFLOW_EVIDENCE',verdict.reason);
        if(verdict.state==='COMPLETED'&&i!==bundle.segments.length-1)
          throw err('E_WORKFLOW_NO_PROGRESS','原始目标已满足，拒绝执行多余分段');
        if(i===bundle.segments.length-1&&verdict.state!=='COMPLETED')
          throw err('E_WORKFLOW_EVIDENCE','完整复跑仍未满足原始任务全部目标');
      }
      finishWorkflowAgent(agent,'COMPLETED',(prepared?'已复用保存的固定 JavaScript：':'AI-off 完整 ')+bundle.segments.length+
        ' 段完成；每段 RunHost 回执和独立网页效果均已核对。');
      if(prepared&&lastEffect?.kind==='product-page')
        appendChat('执行结果','已搜索 '+params.query+'，打开 '+lastEffect.name+
          '，并独立核对商品名称与页面价格：'+lastEffect.price+'。');
      return {ok:true,segments:bundle.segments.length};
    }catch(error){
      if(workflowAgent===agent&&!agent.stopping){
        const code=error?.code||'E_WORKFLOW_REPLAY';
        const unknown=/(?:UNKNOWN|TIMEOUT|SETTLEMENT|DISCONNECT)/.test(code)||
          host.executionPending||Boolean(host.currentRun);
        finishWorkflowAgent(agent,unknown?'OUTCOME_UNKNOWN':'BLOCKED',
          format(error)+(unknown?'；网页操作结果未知，不得自动重放。':
            '；已完成的网页操作不会自动回滚，禁止盲目重试。'));
      }
      return {ok:false,error};
    }finally{
      if(workflowAgent===agent&&!agent.stopping)
        finishWorkflowAgent(agent,'BLOCKED','完整工作流未达到完成条件，已停止。');
    }
  }
  async function runManual(event,review=null) {
    if(selectedBundle&&!review)return runSavedBundle(event);
    const reply=await run(event,null,review);
    if(!disposed)reportExecution(reply);
    return reply;
  }
  function stop(event) {
    if(!event?.isTrusted)return;
    if(activeInstalledTaskId){
      // The request remains authoritative across the gap before start returns
      // a runId and while a separate read-only result observation is active.
      installedStopRequested=true;
      const taskId=activeInstalledTaskId;
      void Promise.resolve().then(()=>taskWorkbench.stopAgentTask({taskId,event}))
        .catch(error=>{
          if(error?.code==='E_RUN_NOT_ACTIVE'&&observation.activeRunId)
            return observation.cancel();
          throw error;
        }).then(()=>status('已禁止后续操作；正在核对本次执行是否已经产生网页变化。'))
        .catch(error=>status(format(error)+'；停止结果未知，不会自动重试',true));
      return;
    }
    if(!runId||host.currentRun!==runId)return;
    const id=runId;control('workflow-stop').disabled=true;
    host.stop({controller:true,runId:id,reason:'E_CANCELLED'})
      .then(()=>status('已请求停止 '+id+'；已发生的网页副作用不会回滚'))
      .catch(error=>status(format(error)+'；停止结果待核对',true));
  }
  async function candidate() {
    if(busy||autoExecutionPending||!revision||!matchesRevision())throw err('E_WORKFLOW_REVISION','先保存未修改的工作流版本');
    const frozen=revision;
    const manifest={format:'opendesk.task.v1',taskId:workflow.workflowId,
      version:'1.0.'+frozen.revision,title:workflow.title,
      description:workflow.description||'本地语义工作流',author:'OpenDesk Workflow',source:'local-workflow',
      siteOrigins:[workflow.siteOrigin],permissions:['page.automation'],entryFormat:'async-main',
      program:{revision:frozen.revision,sourceHash:frozen.sourceHash},paramsSchema:workflow.paramsSchema};
    const pkg=await createTaskPackage(manifest,compiled.sourceUtf8);
    if(!matchesRevision())throw err('E_WORKFLOW_STALE','创建候选期间工作流发生变化');
    const imported=await client.request('importTaskPackage',{package:pkg});
    if(imported?.taskId!==manifest.taskId || imported.version!==manifest.version ||
      imported.manifestHash!==pkg.manifestHash)
      throw err('E_TASK_IMPORT_IDENTITY','候选导入回执与刚才提交的固定版本不一致');
    // The one-shot session record is only a preselection hint. The full catalog
    // re-reads the Task registry and demands real Verify/Available/Install clicks.
    const key=taskReviewHandoffKey(currentPageTarget?.windowId);
    if(key && api.storage?.session){
      try {
        const handoff=createTaskReviewHandoff({windowId:currentPageTarget.windowId,
          taskId:manifest.taskId,version:manifest.version,manifestHash:pkg.manifestHash,
          sourceHash:frozen.sourceHash,siteOrigin:workflow.siteOrigin,
          runId:lastTrustedRun?.sourceHash===frozen.sourceHash &&
            lastTrustedRun.siteOrigin===workflow.siteOrigin?lastTrustedRun.runId:null});
        await api.storage.session.set({[key]:handoff});
      }catch(error){console.warn('Task review shortcut unavailable; manual review remains available',error);}
    }
    status('候选已提交。任务目录会按固定身份定位版本；有同版真实成功记录时预填运行 ID，仍须手动核对、设为可用并确认安装。');
    openCatalog();
  }
  const closeWorkflowSheet=()=>closeAISettings(false);
  function syncAISettings(){
    const opened=control('workflow-provider-settings').open;
    control('workflow-provider-toggle').expanded=String(opened);
    if(opened)void refreshLocal();
  }
  function openAISettings(focusId='workflow-source-local') {
    // The official ToolShell opens the sole global trusted settings sheet;
    // standalone fixtures retain their historical local controls.
    if(typeof openAIProviderSettings==='function'){openAIProviderSettings();return;}
    control('workflow-provider-settings').open=true;
    syncAISettings();
    focus(focusId);
  }
  function closeAISettings(restoreComposer=false) {
    control('workflow-provider-settings').open=false;
    syncAISettings();
    if(restoreComposer)focus('workflow-ai-request');
  }
  function renderProvider() {
    const selected=provider(),local=selected==='local_codex',cloud=selected==='cloud_responses';
    const custom=selected==='custom_https',external=cloud||custom;
    if(external)lastHttpsProvider=selected;
    control('workflow-source-local').pressed=String(local);
    control('workflow-source-https').pressed=String(external);
    control('workflow-https-mode').hidden=!external;
    control('workflow-https-protocol').value=lastHttpsProvider;
    control('workflow-local-settings').hidden=!local;
    control('workflow-custom-settings').hidden=!external;
    const endpoint=control('workflow-ai-endpoint');
    if(!synchronizingProvider&&cloud&&endpoint.value==='https://api.openai.com/v1/chat/completions')
      endpoint.value='https://api.openai.com/v1/responses';
    if(!synchronizingProvider&&custom&&endpoint.value==='https://api.openai.com/v1/responses')
      endpoint.value='https://api.openai.com/v1/chat/completions';
    control('workflow-ai-endpoint-label').text='接口地址';
    control('workflow-ai-endpoint').title=cloud?'Responses API 的 HTTPS 地址':'Chat Completions API 的 HTTPS 地址';
    control('workflow-provider-scope').text=local
      ?'Codex 在本机管理对话，模型推理可能联网；已同意的内容可能保存在 Codex 本机对话中。使用官方 CLI 登录，请勿填写 Codex 登录凭据。网页摘要按当前对话、网站与摘要范围授权，任务逐次绑定文档。'
      :cloud?'网页摘要仅在首次明确授权后发送至指定 Responses HTTPS 接口；有效授权限定当前对话、网站、接收方和 30 分钟，可撤销。store:false，不使用 previous_response_id。API Key 不保存。'
      :custom?'HTTPS Chat Completions 仅支持单轮 JSON 规划；网页摘要首次发送需授权，相同对话、网站及接收方的有效授权可复用。Locator 仍由本轮可信摘要校验。API Key 不保存。'
      :'OpenDesk 官方 AI 服务目前尚未开放。';
    syncSharedProviderSettings();
    updateLocalStatus();updateButtons();
  }
  function updateLocalStatus() {
    if(disposed)return;
    const state=describeLocalCodex(localCapability),element=control('workflow-local-status');
    const detail=localChecking?'正在检查本机连接…':
      localCapability.connecting?'正在连接 OpenDesk…':state.message;
    const compact={
      UNKNOWN:'待检查',NATIVE_PERMISSION_REQUIRED:'未连接',HOST_NOT_PAIRED:'未连接',
      NATIVE_CONNECTED:'正在检查 Codex',CODEX_MISSING:'未安装 Codex',
      CODEX_LOGIN_REQUIRED:'需登录 Codex',CODEX_UNSUPPORTED:'Codex 不兼容',
      CODEX_INITIALIZING:'正在初始化',READY_FOR_TURN:'Codex 已就绪',
      RATE_LIMITED:'额度受限',MODEL_UNAVAILABLE:'模型不可用',
      NETWORK_ERROR:'网络不可用',PROVIDER_ERROR:'请求失败',
      APPROVAL_REQUIRED:'等待授权',DISCONNECTED:'连接已断开',
      OUTCOME_UNKNOWN:'结果未知'
    };
    element.text=localChecking?'检查中…':
      localCapability.connecting?'连接中…':
        state.ready?'Codex 已就绪':compact[state.state]||'不可用';
    element.dataset.state=state.state;
    element.title=detail;
    control('workflow-local-status-detail').text=detail;
    control('workflow-local-refresh').disabled=localChecking;
    const connected=localCapability.nativeConnected===true;
    control('workflow-local-connected').hidden=!connected;
    const connect=control('workflow-local-connect');
    connect.hidden=localChecking||connected||state.ready;
    connect.disabled=localChecking;
  }
  async function refreshLocal() {
    if(localChecking||disposed||provider()!=='local_codex')return;
    localChecking=true;updateLocalStatus();updateButtons();
    try {const capability=await localPlanner.probe();if(!disposed)localCapability=capability;}
    catch(error){if(!disposed)localCapability={state:error.code||'DISCONNECTED',readyForTurn:false};}
    finally{localChecking=false;if(!disposed){updateLocalStatus();updateButtons();}}
  }
  function localFailure(error) {
    const states={E_RATE_LIMITED:'RATE_LIMITED',E_NETWORK:'NETWORK_ERROR',E_MODEL_UNAVAILABLE:'MODEL_UNAVAILABLE',
      E_CODEX_MISSING:'CODEX_MISSING',E_CODEX_LOGIN_REQUIRED:'CODEX_LOGIN_REQUIRED',E_CODEX_POLICY:'CODEX_UNSUPPORTED',
      E_CODEX_UNSUPPORTED:'CODEX_UNSUPPORTED',E_AI_PROTOCOL:'CODEX_UNSUPPORTED',
      E_DISCONNECTED:'DISCONNECTED',E_AI_DISCONNECTED:'DISCONNECTED',
      E_PROVIDER:'PROVIDER_ERROR',E_AI_PROVIDER:'PROVIDER_ERROR',
      E_OUTCOME_UNKNOWN:'OUTCOME_UNKNOWN',E_EFFECT_UNKNOWN:'OUTCOME_UNKNOWN',
      E_AI_OUTCOME_UNKNOWN:'OUTCOME_UNKNOWN',E_AI_TIMEOUT:'OUTCOME_UNKNOWN',E_TIMEOUT:'OUTCOME_UNKNOWN'};
    const state=states[error?.code];
    if(!state)return format(error);
    localCapability={...localCapability,state,reason:error.code,readyForTurn:false};
    updateLocalStatus();return describeLocalCodex(localCapability).message;
  }
  function workflowAgentQuestion(code) {
    if(code==='E_AI_VALUE_NOT_GROUNDED')
      return '请提供要填写的确切文字，并用引号标明？';
    if(code==='E_AI_MISSING_ACTION')
      return '请指出网页中要操作的搜索按钮或目标链接名称？';
    if(code==='E_AGENT_GOAL')
      return '请明确这次希望操作的唯一对象和目标？';
    return null;
  }
  function finishWorkflowAgent(agent,state,message) {
    if(workflowAgent!==agent)return;
    workflowAgent=null;
    clearTimeout(agent.deadline);
    if(disposed)return;
    control('workflow-editor').dataset.agentState=state;
    phase='idle';busy=false;
    if(message){appendChat('任务结果',message);status(message,state!=='COMPLETED'&&state!=='STOPPED');}
    updateButtons();
  }
  function stopWorkflowAgent(reason='E_CANCELLED') {
    const agent=workflowAgent;
    if(!agent)return Promise.resolve();
    if(agent.stopping)return agent.stopPromise||Promise.resolve();
    agent.stopping=true;
    agent.controller.abort(err(reason,'本次任务已请求停止，不再启动新的网页操作'));
    control('workflow-editor').dataset.agentState='STOP_REQUESTED';
    if(!disposed)status('正在停止当前任务；已发生的网页变化不会回滚，正在核对运行状态。');
    const activeId=runId&&host.currentRun===runId?runId:null;
    const observationId=observation.activeRunId;
    dismissRunReview();
    const pending=[Promise.resolve(stopPlanning())];
    if(activeId&&activeId!==observationId)
      pending.push(Promise.resolve().then(()=>host.stop({controller:true,runId:activeId,reason})));
    if(observationId)pending.push(Promise.resolve(observation.cancel()));
    agent.stopPromise=Promise.allSettled(pending).then(results=>{
      const state=classifyWorkflowAgentStop({
        stopRejected:results.some(result=>result.status==='rejected'),
        runActive:Boolean(activeId&&host.currentRun===activeId),
        startPending:Boolean(agent.startPending),
        executionPending:Boolean(host.executionPending),
        startedCount:agent.startedCount
      });
      const unknown=state==='OUTCOME_UNKNOWN';
      // Worker retirement uncertainty always outranks a timer classification.
      finishWorkflowAgent(agent,unknown?'OUTCOME_UNKNOWN':
        reason==='E_AGENT_LIMIT'?'LIMIT_REACHED':state,unknown
        ?'已禁止新操作，但运行或 Worker 收尾未核实；结果未知，请勿重放。'
        :state==='PARTIAL'?'已停止后续操作；此前已执行的步骤可能保留，请核对网页。'
          :'已停止本次任务，未启动后续网页操作。');
    });
    return agent.stopPromise;
  }
  function stopPlanning({close=false,remember=false}={}) {
    const stoppedGeneration=++planningGeneration;
    pendingReuse=null;pendingNaturalPlanning=null;pendingBundleGrant=null;pendingInstalledGrant=null;
    if(close)localCapability={...localCapability,inferenceVerified:false};
    planningAbort?.abort(err('E_CANCELLED','AI 规划已停止'));
    retireConversationRound();
    planningAbort=null;
    planningTarget=null;
    pendingApproval?.settle({decision:'deny'});
    void Promise.resolve(observation.cancel()).catch(error=>{
      if(!disposed&&planningGeneration===stoppedGeneration)status(format(error),true);
    });
    const native=localPlanner.snapshot();
    if(native.busy||native.sessionId||native.resumable) {
      // Closing takes priority over a pending interrupt/drain. Both methods
      // retain their cleanup Promise after the planner's active UI wait ends.
      aiCleanup=close?localPlanner.close({remember}):localPlanner.cancel();
      aiCleanup.catch(()=>{});
    }
    if(phase==='planning'){busy=false;phase='idle';}
    control('workflow-ai-progress').hidden=true;
    if(!disposed)updateButtons();
    return aiCleanup;
  }
  function planningCurrent(epoch,serial,selected) {
    if(disposed||epoch!==planningGeneration||planningAbort?.signal.aborted)
      throw err('E_CANCELLED','AI 会话已停止或改变');
    if(serial!==stable()||selected!==provider())
      throw err('E_WORKFLOW_STALE','规划期间草稿或 AI 来源已改变，请重新发送');
  }
  function offerObservation(event,context,{epoch,serial,selected,captured,request,recipientId,receiverPattern=null}) {
    planningCurrent(epoch,serial,selected);
    return new Promise(resolve=>{
      const row={event,context,epoch,serial,selected,captured,request,
        sessionId:selected==='local_codex'?localPlanner.snapshot().sessionId:session(),
        recipientId,receiverPattern,settled:false,processing:false,
        settle(answer){
          if(row.settled)return;row.settled=true;
          context.signal.removeEventListener('abort',abort);
          if(pendingApproval===row){pendingApproval=null;hidePanel('workflow-ai-approval');}
          resolve(answer);
        }};
      const abort=()=>row.settle({decision:'deny'});
      context.signal.addEventListener('abort',abort,{once:true});
      if(context.signal.aborted){abort();return;}
      pendingApproval=row;
      (async()=>{
        row.siteGranted=await api.permissions.contains({origins:[permissionPattern(captured.url)]});
        planningCurrent(epoch,serial,selected);
        if(row.settled||context.signal.aborted)return;
        if(row.siteGranted&&validObservationApproval(row)&&
          (selected==='local_codex'||await api.permissions.contains({origins:[receiverPattern]}))){
          await processObservation(row,Promise.resolve(true));return;
        }
        control('workflow-ai-approval-title').text='允许共享网页摘要？';
        control('workflow-ai-approval-scope').text='网站：'+captured.origin+
          (selected==='cloud_responses'?' → Cloud Responses ('+receiverPattern+')':
             selected==='custom_https'?' → HTTPS 接口 ('+receiverPattern+')':' → 本机 Codex')+
          '：最多 24 项结构、名称、相关文字，可能含敏感文字；无截图/完整 URL。任务：'+request+
          '。同网站、当前对话、接收方及摘要范围有效 30 分钟，可在 AI 设置撤销；每次仍绑定当前文档，不授予 AI 浏览器执行权限。外发后无法撤回。'+
          (row.siteGranted?'':'还需 Chrome 网站权限确认。');
        control('workflow-ai-approve').disabled=false;control('workflow-ai-deny').disabled=false;
        control('workflow-ai-approval').hidden=false;
        focus('workflow-ai-deny');
      })().catch(error=>{row.settle({decision:'deny'});if(!disposed)status(format(error),true);});
    });
  }
  function answerObservation(event,approved) {
    const row=pendingApproval;
    if(!event.isTrusted||!row||row.processing||row.context.signal.aborted)return;
    if(!approved){row.settle({decision:'deny'});return;}
    let permission;
    try {
      planningCurrent(row.epoch,row.serial,row.selected);
      const current=currentPageTarget.capture();
      if(['windowId','tabId','frameId','documentId','url','origin'].some(key=>current[key]!==row.captured[key]))
        throw err('E_DOCUMENT_STALE','网页已变化，请重新规划后确认读取');
      // A real click issues the website permission request synchronously. The
      // Agent's consent cannot stand in for this Chrome permission.
      permission=row.siteGranted?Promise.resolve(true):api.permissions.request({origins:[permissionPattern(row.captured.url)]});
    }catch(error){row.settle({decision:'deny'});status(format(error),true);return;}
    void processObservation(row,permission,true);
  }
  async function processObservation(row,permission,remember=false) {
    // Move focus before disabling the buttons; browsers can otherwise blur to body.
    focusOutside('workflow-ai-approval');
    row.processing=true;control('workflow-ai-approve').disabled=true;control('workflow-ai-deny').disabled=true;
    control('workflow-ai-approval-title').text='正在读取网页…';
    try{
      if(!await permission)throw err('E_AI_PERMISSION','网页授权被拒绝，未读取网页');
      planningCurrent(row.epoch,row.serial,row.selected);
      if(!remember&&!validObservationApproval(row))throw err('E_AI_APPROVAL','摘要授权已失效');
      if(row.context.signal.aborted)throw err('E_CANCELLED','网页观察已停止');
      const receipt=await observation.observe(row.captured,{signal:row.context.signal,requestId:row.context.requestId,request:row.request});
      await currentPageTarget.revalidate(row.captured);
      if(!await api.permissions.contains({origins:[permissionPattern(row.captured.url)]}))
        throw err('E_PERMISSION','网站权限已撤销，未向 AI 发送观察结果');
      planningCurrent(row.epoch,row.serial,row.selected);
      if(row.context.signal.aborted)throw err('E_CANCELLED','网页观察已停止');
      if(remember){
        const currentSession=row.selected==='local_codex'?localPlanner.snapshot().sessionId:session();
        if(!row.sessionId||row.sessionId!==currentSession||!row.recipientId)
          throw err('E_AI_APPROVAL','接收方或对话已变，未发摘要');
        const approvedAt=Date.now();
        observationApproval={provider:row.selected,sessionId:row.sessionId,
          origin:row.captured.origin,recipientId:row.recipientId,
          receiverPattern:row.receiverPattern,scope:'semantic-dom-summary-v1',
          approvedAt,expiresAt:approvedAt+30*60*1000};
        persistObservationApproval();renderObservationApproval();
      }else if(!validObservationApproval(row))throw err('E_AI_APPROVAL','授权失效，未发摘要');
      planningObservation=receipt;
      row.settle({decision:'approve',result:workflowObservationForModel(receipt)});
    }catch(error){
      row.settle({decision:'deny'});
      if(!disposed&&row.epoch===planningGeneration)status(format(error),true);
    }
  }
  async function plan(event,{pregranted=false}={}) {
    if(!event.isTrusted||busy||autoExecutionPending||host.executionPending||host.currentRun||
      pendingAIReview||(provider()==='local_codex'&&localChecking))return;
    dismissRunReview();
    let permission=null,captured=null,frozen,autoStart=null;
    try {
      const selected=provider(),request=control('workflow-ai-request').value.trim();
      if(!request)throw err('E_AI_REQUEST','先描述希望自动完成的任务');
      if(!['local_codex','custom_https','cloud_responses'].includes(selected))throw err('E_AI_CONFIG','请选择本机 Codex 或 HTTPS 模型来源');
      captured=currentPageTarget.capture();
      if(captured.frameId!==0||captured.origin!==workflow.siteOrigin)
        throw err('E_WORKFLOW_ORIGIN','请先打开目标网站，再发送要执行的浏览器任务');
      frozen={selected,request,workflow:snapshot(),serial:stable(),
        consent:{model:true,workflow:true,observation:true}};
      if(selected!=='local_codex') {
        frozen.endpoint=control('workflow-ai-endpoint').value.trim();
        frozen.apiKey=control('workflow-ai-key').value;frozen.model=control('workflow-ai-model').value.trim();
        let url;try{url=new URL(frozen.endpoint);}catch{}
        if(!url||url.protocol!=='https:'||url.username||url.password||url.hash||!frozen.apiKey||!frozen.model)
          throw err('E_AI_CONFIG','请在 AI 设置中填写 HTTPS 接口、模型和本次会话 API Key');
      }
      // The Send gesture is the one authority to request the website grant.
      // Later model output cannot generate a new Chrome permission gesture.
      const origins=[permissionPattern(captured.url)];
      if(selected!=='local_codex')origins.push(permissionPattern(frozen.endpoint));
      // The existing task approval supplies the real gesture for a missing site
      // grant. A local task with valid permission does not request it again.
      permission=selected==='local_codex'?Promise.resolve(true):
        pregranted?api.permissions.contains({origins:[...new Set(origins)]}):
          api.permissions.request({origins:[...new Set(origins)]});
    }catch(error){
      if(error?.code==='E_AI_CONFIG'){
        let field='workflow-source-local';
        if(provider()!=='local_codex'){
          let endpointValid=false;
          try{
            const url=new URL(control('workflow-ai-endpoint').value.trim());
            endpointValid=url.protocol==='https:'&&!url.username&&!url.password&&!url.hash;
          }catch{}
          field=!endpointValid?'workflow-ai-endpoint':
            !control('workflow-ai-model').value.trim()?'workflow-ai-model':
              'workflow-ai-key';
        }
        openAISettings(field);
      }
      else if(error?.code==='E_AI_REQUEST')focus('workflow-ai-request');
      status(format(error),true);return;
    }
    
    const epoch=++planningGeneration,abort=new AbortController();planningAbort=abort;planningTarget=captured;planningObservation=null;
    const conversationRound=beginConversationRound(abort.signal);
    fullAgentDraft=null;selectedBundle=null;
    const agent={epoch,controller:abort,selected:frozen.selected,goal:frozen.request,initialTarget:structuredClone(captured),startedCount:0,segments:[],
      settings:{endpoint:frozen.endpoint,apiKey:frozen.apiKey,model:frozen.model},modelDecisions:0,
      guard:createWorkflowAgentLoopGuard({goal:frozen.request,signal:abort.signal}),
      expectedNavigation:null,stopping:false};
    workflowAgent=agent;
    agent.deadline=setTimeout(()=>void stopWorkflowAgent('E_AGENT_LIMIT').catch(()=>{}),480000);
    control('workflow-editor').dataset.agentState='PLANNING';
    busy=true;phase='planning';hasError=false;
    control('workflow-ai-progress').hidden=true;
    ui.patch({progress:[]});
    control('workflow-planning-indicator').text=frozen.selected==='local_codex'
      ?'正在连接本机 Codex…':'正在请求所选 HTTPS 模型…';
    appendChat('你',frozen.request);status('');updateButtons();
    let stream='',streamNode=null;
    const progress=event=>{
      conversationRound.assertCurrent(providers.configuration().generation);
      planningCurrent(epoch,frozen.serial,frozen.selected);
      const indicator=control('workflow-planning-indicator');
      if(event.type==='turn.started')indicator.text='Codex 正在规划…';
      if(event.type==='provider.retry')indicator.text='Codex 正在重新连接模型服务…';
      if(event.type==='message.delta'&&typeof event.text==='string') {
        stream=(stream+event.text).slice(-10000);
        if(!/^\s*(?:\{|\[|```)/.test(stream)&&stream.length<=2000) {
          streamNode ||= appendChat('Codex',stream);
          streamNode.text=stream;
        }else indicator.text='正在接收 Codex 的步骤提议…';
      }
      if(event.type==='message.completed'){stream='';streamNode=null;}
      if(event.type==='plan.updated'&&Array.isArray(event.plan)) {
        const progress=event.plan.slice(0,8).filter(item=>typeof item?.step==='string')
          .map(item=>({text:item.step.slice(0,250),state:['completed','in_progress','pending'].includes(item.status)?item.status:'pending'}));
        ui.patch({progress});control('workflow-ai-progress').hidden=!progress.length;
      }
      if(event.type==='tool.request')indicator.text=frozen.consent.observation&&event.canApprove===true&&event.tool==='browser.observe'
        ?'正在使用本次发送所授权的网页摘要…':'本次工具请求不符合已授权范围，已拒绝。';
      if(event.type==='approval.required')appendChat('本机权限','本次工作流不允许命令行或文件操作，已拒绝该请求。');
      if(event.type==='client.session.restart')appendChat('对话状态',event.text);
    };
    try {
      await aiCleanup.catch(()=>{});planningCurrent(epoch,frozen.serial,frozen.selected);
      const recipientId=await workflowObservationRecipientId(frozen);
      const receiverPattern=frozen.selected==='local_codex'?null:permissionPattern(frozen.endpoint);
      planningCurrent(epoch,frozen.serial,frozen.selected);
      let planned;
      const exactTarget=Object.fromEntries(
        ['windowId','tabId','frameId','documentId','url','origin'].map(key=>[key,captured[key]]));
      if(frozen.selected==='local_codex') {
        if(!localPlanner.snapshot().sessionId||!describeLocalCodex(localCapability).ready) {
          localCapability=await localPlanner.probe();updateLocalStatus();
        }
        planningCurrent(epoch,frozen.serial,frozen.selected);
        const readiness=describeLocalCodex(localCapability);
        if(!readiness.ready){openAISettings('workflow-local-refresh');throw err(readiness.state,readiness.message);}
        // Native already requests a scoped observation through onApproval.
        // Do not make an extra read, duplicate consent or delay the first turn.
      } else {
        if(!await permission)throw err('E_AI_PERMISSION','未授权访问模型网站');
        planningCurrent(epoch,frozen.serial,frozen.selected);
        if(frozen.selected!=='local_codex') {
          // Both HTTPS transports require the current RunHost observation and
          // one-turn disclosure. Neither inherits Native session approval.
          const decision=await offerObservation(
            {type:'tool.request',tool:'browser.observe',canApprove:true},
            {signal:abort.signal,requestId:'cloud-'+crypto.randomUUID()},
            {epoch,serial:frozen.serial,selected:frozen.selected,captured,request:frozen.request,
              recipientId,receiverPattern});
          planningCurrent(epoch,frozen.serial,frozen.selected);
          if(decision?.decision!=='approve'||!decision.result)
            throw err('E_AI_APPROVAL','本轮 HTTPS 网页摘要未获得明确批准；未调用模型');
        }
      }
      if(frozen.selected!=='local_codex'&&
        (!validObservationApproval({selected:frozen.selected,sessionId:session(),captured,
          recipientId,receiverPattern})||
         !await api.permissions.contains({origins:[receiverPattern]})))
        throw err('E_AI_PERMISSION','网页摘要或模型接收方授权已撤销，未发送');
      let prepared,executable,freeze,preflightError=null;
      for(let correction=0;correction<2;correction++){
        // The first failed proposal has issued no Chrome operation. Only a
        // Schema/missing-action mistake may be corrected, at most once.
        planningCurrent(epoch,frozen.serial,frozen.selected);
        const nextRequest=correction===0?frozen.request:
          frozen.request.slice(0,3600)+'\n上一提议没有通过执行前检查（'+preflightError.code+
          '）。只修正步骤或定位，不得增加动作或扩大目标。';
        try{
          if(++agent.modelDecisions>8)throw err('E_AGENT_LIMIT','已达到八次 AI 决策上限，停止重新规划');
          planned=await workflowProviders.generateWorkflow({
            source:frozen.selected,request:nextRequest,workflow:frozen.workflow,
            target:exactTarget,observationReceipt:workflowObservationForModel(planningObservation),signal:abort.signal,
            settings:{endpoint:frozen.endpoint,apiKey:frozen.apiKey,model:frozen.model},
            history:verifiedTurnHistory,consent:frozen.consent,onEvent:progress,
            onApproval:(event,context)=>offerObservation(event,context,
              {epoch,serial:frozen.serial,selected:frozen.selected,captured,request:frozen.request,
                recipientId,receiverPattern})});
          planningCurrent(epoch,frozen.serial,frozen.selected);
          const result=planned.proposal;
          prepared=prepareDirectExecution({request:frozen.request,workflow:result,
            target:captured,observation:planningObservation});
          executable=structuredClone(result);
          if(prepared.linkGuard){
            const click=executable.steps.find(step=>step.op==='click');
            if(!click)throw err('E_AI_REVIEW_REQUIRED','链接确认缺少点击步骤');
            click.linkGuard=structuredClone(prepared.linkGuard);
          }
          freeze=await compileWorkflow(executable,{verifyFill:true});
          if(executable.steps.length>4)throw err('E_AGENT_SCHEMA','AI 每轮最多四步，请提出下一组必要动作');
          planningCurrent(epoch,frozen.serial,frozen.selected);
          lastProviderTurn={businessWorkflowId:frozen.workflow.workflowId,
            source:frozen.selected,metadata:structuredClone(planned.metadata)};
          if(control('workflow-provider-settings').open)closeAISettings();
          break;
        }catch(error){
          if(correction>0||!['E_WORKFLOW_SCHEMA','E_WORKFLOW_AI',
            'E_AI_MISSING_ACTION','E_AI_ASSERT_TARGET','E_AI_VALUE_NOT_GROUNDED',
            'E_AI_RESPONSE','E_AGENT_SCHEMA'].includes(error?.code))throw error;
          preflightError=error;
          control('workflow-planning-indicator').text=
            '计划格式有误，正在进行唯一一次安全纠正…';
        }
      }
      if(planningObservation)
        agent.guard.observed({target:captured,receipt:planningObservation,remaining:frozen.request});
      const ticket=agent.guard.claim({workflow:executable,target:captured,observation:planningObservation,linkGuard:prepared.linkGuard,params:prepared.params});
      agent.expectedNavigation=prepared.linkGuard||null;
      if(!await permission)throw err('E_PERMISSION','网站权限未授权，未执行浏览器操作');
      await currentPageTarget.revalidate(captured);
      if(!await api.permissions.contains({origins:[permissionPattern(captured.url)]}))
        throw err('E_PERMISSION','网站权限已撤销，本次没有执行');
      planningCurrent(epoch,frozen.serial,frozen.selected);
      // Keep the last committed Controller Revision as Save's optimistic base.
      // matchesRevision() still treats newly generated steps as unsaved.
      workflow=structuredClone(executable);touched=true;lastTrustedRun=null;
      directVerifiedSerial=stable();
      render();persistDraft();
      const executionSerial=stable();
      // The strict prepareDirectExecution() admission has already denied
      // unobserved, invented, sensitive and high-impact AI actions. Its allowed
      // search/link clicks do not inherit the generic manual-click review.
      // Never treat model output as a Chrome permission or User Activation.
      const plannedExecution={
        epoch,selected:frozen.selected,request:frozen.request,serial:executionSerial,
        freeze,captured:structuredClone(captured),params:structuredClone(prepared.params),
        hasReadback:prepared.hasReadback,hasUnprovenClick:prepared.hasUnprovenClick,
        beforeObservation:planningObservation,effectExpectation:prepared.effectExpectation,
        linkGuard:prepared.linkGuard,
        signal:abort.signal,agent,ticket,continuation:false
      };
      const origins=[permissionPattern(captured.url)];
      if(prepared.linkGuard&&prepared.linkGuard.origin!==captured.origin)
        origins.push(permissionPattern(prepared.linkGuard.url));
      const pregranted=await api.permissions.contains({origins:[...new Set(origins)]});
      // The approved proposal is now the live draft: the old pre-planning
      // serial is intentionally obsolete, but the newly frozen serial must
      // still match across this asynchronous permission read.
      if(disposed||epoch!==planningGeneration||provider()!==frozen.selected||
        stable()!==executionSerial)throw err('E_WORKFLOW_REVIEW_STALE','规划结果已变化，未自动执行');
      lastRun='none';
      if(pregranted){
        // Complete planning before launching the existing RunHost. The Send
        // gesture is sufficient task intent, but cannot grant fresh origins.
        autoExecutionPending=true;autoStart=plannedExecution;
        appendChat('Codex','已完成步骤和安全检查，将直接执行。');
        status('正在执行安全检查已通过的网页任务…');
      }else{
        // This is a *Chrome grant* gateway, not an unnecessary extra plan
        // approval. The next trusted button click requests only missing grants.
        pendingAIReview=plannedExecution;
        control('workflow-run-review-scope').text=
          '执行需要新增网站访问权限。点击「执行」将请求 Chrome 原生授权；'+
          '未授权不会操作网页。';
        control('workflow-run-review').hidden=false;
        appendChat('对话状态','步骤已准备好，需要授权网站后才能执行。');
        status('等待 Chrome 网站权限；尚未执行任何网页操作。');
        focus('workflow-run-review-confirm');
      }
      updateButtons();
    }catch(error){
      if(!disposed&&epoch===planningGeneration){
        const message=frozen.selected==='local_codex'?localFailure(error):format(error);
        const question=workflowAgentQuestion(error?.code);
        appendChat('执行结果',question
          ?'本次尚未修改网页：'+message+'。'+question
          :'本次任务未完成：'+message+'。不会自动重放。');
        status(message,true);
        finishWorkflowAgent(agent,question?'ASK_USER':'BLOCKED','');
      }
    }
    finally{
      finishConversationRound(conversationRound);
      if(epoch===planningGeneration){busy=false;phase='idle';planningAbort=null;planningTarget=null;pendingApproval?.settle({decision:'deny'});
        control('workflow-ai-progress').hidden=true;if(!disposed){updateLocalStatus();updateButtons();}
        if(autoStart&&!disposed)void executeAIAuto(autoStart);}
    }
  }
  const observation=createWorkflowObservation({api,host,currentPageTarget,onRunOwner,
    onRunId:id=>{runId=id;if(!disposed)updateButtons();}});
  const closeHistory=()=>{
    historyOpen=false;
    control('workflow-editor').dataset.historyOpen='false';
    updateButtons();
  };

  const sameTarget=(a,b)=>Boolean(a&&b&&b.status==='available'&&
    ['windowId','tabId','frameId','documentId','url','origin']
      .every(key=>a[key]===b[key]));
  function showRoutingGrant(message){
    control('workflow-run-review-scope').text=message;
    control('workflow-run-review').hidden=false;
    focus('workflow-run-review-confirm');updateButtons();
  }
  // Catalog is only a discovery snapshot: Host and the original TaskWorkbench
  // must independently revalidate the fixed install before RunHost admission.
  async function verifyInstalledCandidate(candidate){
    if(!taskWorkbench?.runInstalledForAgent)
      throw err('E_TASK_HOST','原有任务执行器不可用，未启动');
    const resolved=await client.request('resolveInstalledTask',{taskId:candidate.taskId});
    if(resolved?.taskId!==candidate.taskId||
      resolved.version!==candidate.expected.version||
      resolved.manifestHash!==candidate.expected.manifestHash||
      resolved.installationId!==candidate.expected.installationId||
      resolved.generation!==candidate.expected.generation||
      resolved.contentHash!==candidate.sourceHash||
      resolved.revision!==1||
      resolved.scriptId!=='task:'+candidate.taskId+':'+candidate.expected.version||
      resolved.manifest?.program?.revision!==candidate.revision||
      resolved.manifest?.program?.sourceHash!==candidate.sourceHash||
      JSON.stringify(resolved.manifest?.intent??null)!==JSON.stringify(candidate.intent??null))
      throw err('E_REVISION','已安装任务身份、Manifest、意图或冻结源码不一致');
    return resolved;
  }

  async function executeMatchedInstalled(event,prepared){
    const {candidate,captured,request}=prepared;
    installedStopRequested=false;
    try{
      if(!event?.isTrusted||disposed||activeInstalledTaskId||
        host.executionPending||host.currentRun)
        throw err('E_TASK_BUSY','当前 RunHost 已忙或不是用户可信操作');
      if(!sameTarget(captured,currentPageTarget.snapshot))
        throw err('E_DOCUMENT_STALE','当前网页已变化，不运行任务');
      // TaskWorkbench's requireChromePermissions only checks existing grants.
      // New permissions must be requested in the separate synchronous click.
      if(!await api.permissions.contains({origins:[permissionPattern(captured.url)]}))
        throw err('E_PERMISSION','网站权限已撤销，未启动任务');
      await currentPageTarget.revalidate(captured);
      // The shared TaskWorkbench may have an older display cache than the
      // fresh Send Catalog snapshot. Synchronize its sole installed list
      // before its existing pinned Run admission; never create another runner.
      await taskWorkbench.refresh();
      const resolved=await verifyInstalledCandidate(candidate);
      if(disposed||!sameTarget(captured,currentPageTarget.snapshot)||
        host.executionPending||host.currentRun)
        throw err('E_DOCUMENT_STALE','目标网页或执行槽已变化，不运行任务');
      const started=taskWorkbench.runInstalledForAgent({
        taskId:candidate.taskId,params:candidate.params,event,
        expected:candidate.expected});
      activeInstalledTaskId=candidate.taskId;
      busy=true;phase='running';lastRun='running';updateButtons();
      appendChat('你',request);
      appendChat('助手','找到已安装任务「'+candidate.title+'」，正在使用新参数执行原有 JavaScript。');
      const completed=await started;
      if(installedStopRequested)
        throw err('E_OUTCOME_UNKNOWN','已请求停止；此前提交的操作可能生效，不能报告完成或自动重放');
      const journal=await client.controller.snapshotControllerRun({runId:completed?.runId});
      const run=journal?.run||(journal?.runs||[]).find(row=>row.runId===completed?.runId);
      const result=(journal?.results||[]).find(row=>row.runId===completed?.runId);
      if(!completed?.runId||completed.version!==candidate.expected.version||
        completed.installationId!==candidate.expected.installationId||
        completed.completion?.state!=='completed'||
        completed.completion?.pendingSettlement||
        completed.completion?.retirement?.state!=='released'||
        completed.completion?.result?.outcome?.ok!==true||
        run?.runId!==completed.runId||run.state!=='completed'||
        run.workerRetired!==true||run.retirementState!=='released'||
        run.revision?.sourceHash!==candidate.sourceHash||
        run.revision?.scriptId!==resolved.scriptId||
        run.revision?.revision!==resolved.revision||
        run.target?.tabId!==captured.tabId||
        run.target?.documentId!==captured.documentId||
        run.target?.allowedOrigin!==captured.origin||
        result?.runId!==completed.runId||result.resultId!==run.resultId||
        result.revision?.scriptId!==resolved.scriptId||
        result.revision?.revision!==resolved.revision||
        result.revision?.sourceHash!==candidate.sourceHash||
        result.outcome?.ok!==true)
        throw err('E_OUTCOME_UNKNOWN','运行回执、固定源码或 Worker 收尾无法共同确认，不会重试');
      if(candidate.kind==='commerce'){
        const after=await currentPageTarget.refresh();
        if(after?.status!=='available'||after.windowId!==captured.windowId||
          after.tabId!==captured.tabId||after.frameId!==0||
          after.origin!==captured.origin||after.documentId===captured.documentId)
          throw err('E_WORKFLOW_EVIDENCE','尚未核验到商品详情新 Document，不能报告业务成功');
        const receipt=await observation.observe(after,{
          requestId:'task-reuse-'+crypto.randomUUID(),request:candidate.params.productName});
        const effect=verifyOpenedLinkPage({
          linkGuard:{origin:captured.origin,url:after.url,name:candidate.params.productName},
          after:receipt,actionTarget:captured,resultTarget:after});
        if(effect?.kind!=='product-page')
          throw err('E_WORKFLOW_EVIDENCE','商品名称或页面标价未独立核验，不能报告成功');
        lastRun='success';
        appendChat('执行结果','已搜索 '+candidate.params.query+'，打开 '+effect.name+
          '，并独立核对页面价格：'+effect.price+'。');
        status('已安装任务执行成功，持久回执和真实页面效果均已核验。');
        return {ok:true,runId:completed.runId,effect};
      }
      if(candidate.kind==='demo-search'){
        // A returned Task value is NOT proof that its click affected the page.
        // Reuse the existing RunHost-backed, read-only observation on the
        // current Document and require two independently visible DOM facts.
        const after=await currentPageTarget.refresh();
        if(!sameTarget(captured,after)||installedStopRequested)
          throw err('E_DOCUMENT_STALE','任务完成后页面已变化或收到停止请求，不能确认搜索结果');
        if(!await api.permissions.contains({origins:[permissionPattern(after.url)]}))
          throw err('E_PERMISSION','网站授权已撤销，未读取搜索结果');
        const keyword=candidate.params.keyword;
        const receipt=await observation.observe(after,{
          requestId:'installed-search-'+crypto.randomUUID(),
          request:'结果：'+keyword+' 提交次数：1'});
        if(installedStopRequested)
          throw err('E_OUTCOME_UNKNOWN','搜索结果读取时发生停止，不能报告成功');
        const visible=(receipt?.summary?.nodes||[])
          .filter(row=>row?.state?.visible===true)
          .flatMap(row=>[row.text,row.name]).filter(v=>typeof v==='string')
          .map(v=>v.trim());
        if(!visible.includes('结果：'+keyword)||!visible.includes('提交次数：1'))
          throw err('E_WORKFLOW_EVIDENCE','未从真实页面独立读到匹配的搜索结果和提交次数 1，不能报告业务成功');
        lastRun='success';
        appendChat('执行结果','已从当前页面独立读回“结果：'+keyword+'”及“提交次数：1”。');
        status('已安装任务复用成功；固定源码、RunHost 回执及页面结果已核验。');
        return {ok:true,runId:completed.runId,effect:{kind:'demo-search',keyword,submitCount:1}};
      }
      if(candidate.intent?.resultTexts?.length){
        // For newer, separately verified Task versions the immutable Manifest
        // can state exact post-run DOM facts with user-bound parameters. This
        // is a second RunHost-backed read, not the Task's own returned value.
        const after=await currentPageTarget.refresh();
        if(!sameTarget(captured,after)||installedStopRequested)
          throw err('E_DOCUMENT_STALE','任务结束后网页变化或收到停止请求，结果未知');
        if(!await api.permissions.contains({origins:[permissionPattern(after.url)]}))
          throw err('E_PERMISSION','网页授权已撤销，拒绝读取业务结果');
        const expectedTexts=candidate.intent.resultTexts.map(template=>
          template.replace(/\{([A-Za-z][A-Za-z0-9_]{0,39})\}/gu,(_,name)=>{
            if(!Object.hasOwn(candidate.params,name))
              throw err('E_PARAMS','缺少业务结果核验使用的动态参数');
            return String(candidate.params[name]);
          }));
        if(expectedTexts.some(value=>value.length>300))
          throw err('E_WORKFLOW_EVIDENCE','动态结果核验文本过长，拒绝猜测');
        const receipt=await observation.observe(after,{
          requestId:'installed-intent-'+crypto.randomUUID(),
          request:expectedTexts.join('；')});
        if(installedStopRequested)
          throw err('E_OUTCOME_UNKNOWN','独立读取结果时收到停止请求，不报告成功');
        if(receipt?.summary?.documentId!==after.documentId)
          throw err('E_WORKFLOW_EVIDENCE','页面结果来自错误的 Document');
        const visible=(receipt.summary.nodes||[])
          .filter(row=>row?.state?.visible===true)
          .flatMap(row=>[row.text,row.name])
          .filter(value=>typeof value==='string').map(value=>value.trim());
        if(!expectedTexts.every(value=>visible.includes(value)))
          throw err('E_WORKFLOW_EVIDENCE','独立网页读取未满足固定 Manifest 的业务结果断言，禁止报告成功或重试');
        lastRun='success';
        appendChat('执行结果','已从当前网页独立核对 '+expectedTexts.length+
          ' 项可见结果：'+expectedTexts.join('；')+'。这不代表服务器端事务已持久提交。');
        status('已安装任务固定源码及网页结果读取已核验；没有重新生成 JavaScript。');
        return {ok:true,runId:completed.runId,
          effect:{kind:'task-visible-readback',texts:expectedTexts}};
      }
      // An arbitrary task may return a value without proving web-side effects.
      lastRun='failed';
      appendChat('执行结果','持久 RunHost 回执已核对；该任务的业务效果仍待独立核验。');
      status('任务运行结束，但业务效果未独立确认；不会自动重试。',true);
      return {ok:false,receiptVerified:true,runId:completed.runId};
    }catch(error){
      lastRun='failed';
      if(!disposed){
        appendChat('执行结果','尚未核验成功：'+format(error)+
          '。不会自动重试，也不会交给 AI 重做已发生的操作。');
        status(format(error),true);
      }
      return {ok:false,error};
    }finally{
      activeInstalledTaskId=null;installedStopRequested=false;
      if(!disposed){busy=false;phase='idle';updateButtons();}
    }
  }

  // Exactly one entry for natural-language work: search frozen candidates
  // before asking the existing Provider to generate any new code.
  async function sendNaturalLanguage(event){
    if(!event?.isTrusted||disposed||busy||autoExecutionPending||workflowAgent||
      host.executionPending||host.currentRun||pendingAIReview||
      (provider()==='local_codex'&&localChecking))return;
    const original=control('workflow-ai-request').value.trim();
    if(!original){status('请描述希望完成的任务',true);focus('workflow-ai-request');return;}
    let target;
    try{target=currentPageTarget.capture();}
    catch(error){status(format(error),true);return;}
    // All candidate searches must finish before falling through to Provider.
    // A delayed Chrome permission request is NEVER attempted inside Send.
    const prior=pendingReuse;
    pendingReuse=null;pendingNaturalPlanning=null;pendingBundleGrant=null;pendingInstalledGrant=null;
    let request=original,chosenKey=null;
    if(prior&&sameTarget(prior.target,target)){
      const choice=original.match(/^(?:使用|选择)第([1-9][0-9]?)个(?:工作流)?[。.]?$/u);
      if(prior.kind==='choice'&&choice){
        chosenKey=prior.keys[Number(choice[1])-1];
        if(!chosenKey){status('候选序号无效，请明确选择。',true);return;}
        request=prior.request;
      }else if(prior.kind==='product'&&!/^(?:请)?(?:搜索|查找|检索)\s+/u.test(original)){
        const name=naturalProductReply(original);
        if(!name){status('请补充完整、明确的商品名称。',true);return;}
        chosenKey='workflow:'+prior.key;
        request='搜索 '+prior.query+'，打开 '+name+' 商品详情，核对名称和价格';
      }
    }
    const epoch=++planningGeneration,abort=new AbortController();
    const conversationRound=beginConversationRound(abort.signal);
    planningAbort=abort;planningTarget=target;phase='planning';busy=true;
    control('workflow-planning-indicator').text='正在查找可复用的 JavaScript 工作流…';
    updateButtons();
    const assertLive=()=>{
      conversationRound.assertCurrent(providers.configuration().generation);
      if(disposed||epoch!==planningGeneration||abort.signal.aborted||
        !sameTarget(target,currentPageTarget.snapshot)||host.executionPending||host.currentRun)
        throw err('E_WORKFLOW_STALE','网页或执行状态已变化，未启动新操作');
    };
    const release=()=>{
      finishConversationRound(conversationRound);
      if(disposed||epoch!==planningGeneration)return;
      planningAbort=null;planningTarget=null;busy=false;phase='idle';updateButtons();
    };
    try{
      await refreshSaved();assertLive();
      if(!savedHistoryReady)throw err('E_WORKFLOW_STALE','保存的工作流列表正在刷新，请重新发送');
      let match=selectSavedWorkflowRoute({request,target,records:saveList});
      // A failed Catalog RPC is not NO_MATCH: fail closed before AI or RunHost.
      const taskSnapshot=await client.request('listTaskCatalog',{});
      if(!Array.isArray(taskSnapshot?.catalog)||!Array.isArray(taskSnapshot?.installed))
        throw err('E_TASK_CATALOG','任务目录查询未完成，不能断言无可复用程序');
      assertLive();
      const installedRoute=selectInstalledTaskRoute({request,target,
        catalog:taskSnapshot.catalog,installed:taskSnapshot.installed});
      if(match.state==='BLOCKED')
        throw err(match.code,'保存工作流动态绑定不一致，禁止回退 AI 盲目重做');
      if(installedRoute.state==='BLOCKED')
        throw err(installedRoute.code,'已安装任务匹配但身份或版本无效，禁止盲目回退 AI');
      if(installedRoute.state==='LOADING')
        throw err('E_TASK_CATALOG','任务目录未加载，不能启动新 AI');
      const workflows=match.state==='AMBIGUOUS'?match.candidates:
        ['MATCH','MISSING_PRODUCT'].includes(match.state)?[match.record]:[];
      const tasks=installedRoute.state==='AMBIGUOUS'?installedRoute.candidates:
        installedRoute.state==='MATCH'?[installedRoute.candidate]:[];
      const options=[
        ...workflows.map(row=>({kind:'workflow',key:'workflow:'+row.key,title:row.title,row})),
        ...tasks.map(row=>({kind:'task',key:'task:'+row.taskId,title:row.title,row}))
      ];
      let selectedTask=null;
      if(chosenKey){
        const selected=options.find(row=>row.key===chosenKey);
        if(!selected)throw err('E_WORKFLOW_STALE','选择的程序已改变，请重新发送完整任务');
        if(selected.kind==='task'){selectedTask=selected.row;match={state:'AI'};}
        else match=match.params?{state:'MATCH',record:selected.row,params:match.params}:
          {state:'MISSING_PRODUCT',record:selected.row,query:match.query};
      }else if(options.length>1){
        pendingReuse={kind:'choice',request,target:structuredClone(target),
          keys:options.map(row=>row.key)};
        appendChat('你',original);
        appendChat('助手','找到多个可复用程序：'+options.map((row,i)=>
          (i+1)+'「'+row.title+'」'+(row.kind==='task'?'（已安装任务）':'（保存工作流）')).join('、')+
          '。请回复“使用第1个”等选择；尚未执行。');
        status('存在多个候选，需要明确选择。');return;
      }else if(tasks.length===1)selectedTask=tasks[0];
      if(selectedTask){
        const prepared={candidate:selectedTask,captured:structuredClone(target),request};
        await verifyInstalledCandidate(selectedTask);assertLive();
        const granted=await api.permissions.contains({origins:[permissionPattern(target.url)]});
        assertLive();
        if(!granted||selectedTask.sensitive){
          pendingInstalledGrant={...prepared,confirmInput:original,needsPermission:!granted};
          appendChat('你',original);
          appendChat('助手',!granted?'找到已安装任务，但需要当前网站授权。':
            '找到已安装任务，尚未证明其业务操作完全只读，执行前需要确认。');
          showRoutingGrant(!granted?'确认后申请当前网站权限，再执行原固定任务。':
            '确认执行已安装任务。已有权限不会重复申请。');
          return;
        }
        autoExecutionPending=true;
        release();
        return executeMatchedInstalled(event,prepared).finally(()=>{
          autoExecutionPending=false;if(!disposed)updateButtons();
        });
      }
      if(installedRoute.state==='MISSING_PARAMS'&&match.state==='AI'){
        const fields=[...new Set(installedRoute.candidates.flatMap(row=>row.fields))];
        appendChat('你',original);
        appendChat('助手','已找到相关任务，但缺少必要参数：'+(fields.join('、')||'参数格式有误')+
          '。请补充完整任务；尚未执行。');
        status('参数缺失或无效，尚未执行。');return;
      }
      if(match.state==='MISSING_PRODUCT'){
        pendingReuse={kind:'product',key:match.record.key,query:match.query,
          target:structuredClone(target)};
        appendChat('你',original);
        appendChat('助手','已找到商品搜索工作流。请告诉我要打开的商品完整名称；尚未执行。');
        status('还需要商品名称。');return;
      }
      if(match.state==='MATCH'){
        const {key,...record}=match.record;
        const bundle=await verifyWorkflowBundle(record);assertLive();
        // The Controller journal, not storage.local or the model, is the
        // authority for every Revision used by RunHost.
        for(const segment of bundle.segments){
          const freeze=await compileWorkflow(segment.workflow,{
            verifyFill:segment.verificationMode==='fill-readback'});
          const stored=await host.controller.getControllerScript({
            scriptId:segment.workflow.workflowId,revision:segment.revision});
          if(freeze.sourceHash!==segment.sourceHash||
            stored?.contentHash!==freeze.sourceHash||
            stored.sourceUtf8!==freeze.sourceUtf8)
            throw err('E_WORKFLOW_HASH','保存的 JavaScript、Revision 或源码哈希不一致');
          assertLive();
        }
        const scopes=[...new Set(bundle.segments.map(row=>permissionPattern(row.entryUrl)))];
        const granted=await api.permissions.contains({origins:scopes});assertLive();
        const prepared={bundle,params:match.params,
          captured:structuredClone(target),request};
        appendChat('你',original);
        appendChat('助手','已找到保存的「'+bundle.title+'」工作流，'+
          (granted?'正在使用新参数执行。':'使用新参数复跑前需要网站授权。'));
        if(!granted){
          pendingBundleGrant=prepared;
          status('当前站点尚未授权；未启动网页操作。');
          showRoutingGrant('固定工作流需要当前网站的 Chrome 授权。确认后继续使用冻结 JavaScript。');
          return;
        }
        release();
        return runSavedBundle(event,prepared);
      }
      // Both saved Workflow and installed Task candidates were checked.
      assertLive();
      const chosenProvider=provider();
      let scopes=[permissionPattern(target.url)],invalidSettings=false;
      if(chosenProvider!=='local_codex'){
        try{
          const endpoint=control('workflow-ai-endpoint').value.trim();
          const url=new URL(endpoint);
          if(url.protocol!=='https:'||url.username||url.password||url.hash)
            invalidSettings=true;
          else scopes.push(permissionPattern(endpoint));
        }catch{invalidSettings=true;}
      }
      const pregranted=chosenProvider==='local_codex'||invalidSettings||
        await api.permissions.contains({origins:[...new Set(scopes)]});
      assertLive();
      if(!pregranted){
        pendingNaturalPlanning={request,target:structuredClone(target),
          provider:chosenProvider,serial:stable()};
        status('未找到可复用的固定工作流；新 AI 规划需要 Chrome 授权。');
        showRoutingGrant('确认后申请必要的网站与 AI 接收方权限，再由现有 Provider 规划。');
        return;
      }
      release();
      return plan(event,{pregranted:true});
    }catch(error){
      if(!disposed&&epoch===planningGeneration&&!abort.signal.aborted){
        appendChat('执行结果','未执行：'+format(error)+'。不会自动生成替代代码重试。');
        status(format(error),true);
      }
    }finally{release();}
  }
  const onHistoryClick=event=>{
    if(!event.isTrusted||busy||autoExecutionPending||workflowAgent||
      host.executionPending||host.currentRun)return;
    dismissRunReview();
    historyOpen=!historyOpen;
    control('workflow-editor').dataset.historyOpen=String(historyOpen);
    if(historyOpen)control('workflow-manage-panel').hidden=true;
    updateButtons();
    focus(historyOpen?'workflow-history-panel':'workflow-ai-request');
  };
  bind('workflow-history-toggle','click',onHistoryClick);
  bind('workflow-manage-close','click',()=>{
    control('workflow-manage-panel').hidden=true;
    control('workflow-history-toggle').expanded='false';
    focus('workflow-edit-details');
    updateButtons();
  });
  bind('workflow-edit-details','click',event=>{
    if(!event.isTrusted)return;
    const panel=control('workflow-manage-panel');
    panel.hidden=!panel.hidden;
    if(!panel.hidden){

      focus('workflow-title');
    }else focus('workflow-edit-details');
    updateButtons();
  });
  bind('workflow-provider-toggle','click',event=>{
    if(!event.isTrusted)return;
    const settings=control('workflow-provider-settings');
    settings.open=!settings.open;
    syncAISettings();
    if(settings.open)focus(provider()==='local_codex'?'workflow-source-local':'workflow-source-https');
  });
  bind('workflow-provider-settings','toggle',()=>{
    syncAISettings();
    if(control('workflow-provider-settings').open)void refreshLocal();
  });
  const chooseSource=(next,event)=>{
    if(!event.isTrusted)return;
    const source=control('workflow-ai-provider');
    if(source.value===next)return;
    source.value=next;
    bindings.get('workflow-ai-provider:change')?.(event);
  };
  bind('workflow-source-local','click',event=>chooseSource('local_codex',event));
  bind('workflow-source-https','click',event=>chooseSource(lastHttpsProvider,event));
  bind('workflow-https-protocol','change',event=>chooseSource(event.target.value,event));
  bind('workflow-ai-provider','change',()=>{
    dismissRunReview();
    void (workflowAgent?stopWorkflowAgent('E_TOOL_CHANGED'):stopPlanning({close:true})).catch(()=>{});
    observationApproval=null;persistObservationApproval();
    verifiedTurnHistory=[];lastProviderTurn=null;
    renderProvider();if(control('workflow-provider-settings').open)void refreshLocal();
  });
  bind('workflow-observation-revoke','click',event=>{
    if(!event.isTrusted)return;
    observationApproval=null;persistObservationApproval();renderObservationApproval();
    void (workflowAgent?stopWorkflowAgent('E_PERMISSION'):stopPlanning()).catch(error=>status(format(error),true));
    if(!workflowAgent&&runId&&host.currentRun===runId)
      void host.stop({controller:true,runId,reason:'E_PERMISSION'}).catch(error=>status(format(error),true));
    status('已撤权并停止任务；模型已收内容无法撤回。');
  });
  for(const id of ['workflow-ai-key','workflow-ai-model','workflow-ai-endpoint'])
    bind(id,'input',()=>{
      // The recipient and request are frozen for a planning turn. Editing
      // the endpoint, model or credential retires any pending observation
      // approval instead of silently sending to a stale recipient.
      if(phase==='planning')void stopPlanning({close:true})
        .catch(error=>{if(!disposed)status(format(error),true);});
      observationApproval=null;persistObservationApproval();
      verifiedTurnHistory=[];lastProviderTurn=null;
      syncSharedProviderSettings();updateButtons();
    });
  bind('workflow-local-refresh','click',event=>{if(event.isTrusted)void refreshLocal();});
  bind('workflow-local-help','click',event=>{
    if(!event.isTrusted)return;
    void api.tabs.create({url:api.runtime.getURL('native-agent/settings.html')}).catch(error=>status(format(error),true));
  });
  bind('workflow-local-connect','click',event=>{
    if(!event.isTrusted||localChecking)return;
    // nativeMessaging permission is requested within the actual user gesture.
    let permission;
    try{permission=api.permissions.request({permissions:['nativeMessaging']});}
    catch(error){status(format(error),true);return;}
    localChecking=true;updateLocalStatus();updateButtons();
    (async()=>{
      if(!await permission)throw err('E_PERMISSION_REQUIRED','未允许浏览器连接本机 OpenDesk');
      if(disposed)return;
      localCapability=await client.requestWorkflowAI('ai.connection.enable');
      if(localCapability.nativeConnected&&localCapability.protocolAvailable)localCapability=await localPlanner.probe();
    })().catch(error=>{if(!disposed){localCapability={state:'NATIVE_PERMISSION_REQUIRED',readyForTurn:false};status(format(error),true);}})
      .finally(()=>{localChecking=false;if(!disposed){
        updateLocalStatus();updateButtons();
        if(describeLocalCodex(localCapability).ready)closeAISettings(true);
      }});
  });
  bind('workflow-ai-cancel','click',event=>{
    if(!event.isTrusted||(phase!=='planning'&&!workflowAgent))return;
    if(workflowAgent){void stopWorkflowAgent().catch(error=>status(format(error),true));return;}
    const stopped=stopPlanning(),epoch=planningGeneration;
    void stopped.then(reply=>{
      if(!disposed&&epoch===planningGeneration)status(reply?.terminalStatus==='interrupted'
        ?'已确认本次 AI 回合中断；已发送给模型的内容无法撤回。'
        :reply?.state==='CLOSED'?'已结束旧 AI 会话；下次发送将开始新对话。'
        :reply?.terminalStatus?'本次 AI 回合已结束；已发送给模型的内容无法撤回。'
        :'AI 规划已停止；已发送给模型的内容无法撤回。');
    },error=>{if(!disposed&&epoch===planningGeneration)status(localFailure(error),true);});
  });
  bind('workflow-ai-approve','click',event=>answerObservation(event,true));
  bind('workflow-ai-deny','click',event=>answerObservation(event,false));
  const onNewSessionClick=event=>{
    if(!event.isTrusted||busy||autoExecutionPending||workflowAgent||
      host.executionPending||host.currentRun)return;
    pendingReuse=null;pendingBundleGrant=null;pendingNaturalPlanning=null;
    dismissRunReview();closeHistory();
    observationApproval=null;persistObservationApproval();
    clearChat();entryMode='new-chat';updatePresentation();
    verifiedTurnHistory=[];lastProviderTurn=null;
    focus('workflow-ai-request');
    const stopped=stopPlanning({close:true,remember:true}),epoch=planningGeneration;
    void stopped.then(()=>{
      if(disposed||epoch!==planningGeneration)return;updateButtons();status('');
    },error=>{if(!disposed&&epoch===planningGeneration)status(localFailure(error),true);});
  };
  bind('workflow-ai-new-session','click',onNewSessionClick);
  // Only fill the trusted composer; examples never submit, request permissions,
  // start AI planning, or mutate any current page.
  const chooseExample=(key,event)=>{
    if(!event.isTrusted||busy||autoExecutionPending||host.executionPending||host.currentRun)return;
    if(!Object.hasOwn(exampleRequests,key))return;
    setConversationDraft(exampleRequests[key]);focus('workflow-ai-request');
    status('示例已填入输入框；不会自动发送或运行。');
  };
  const onResumeSessionClick=event=>{
    if(!event.isTrusted||busy||autoExecutionPending||host.executionPending||host.currentRun||provider()!=='local_codex')return;
    dismissRunReview();
    // This explicit action only resumes the selected local provider, not web observation.
    const consent={model:true,workflow:true,observation:false};
    
    const epoch=++planningGeneration,serial=stable(),abort=new AbortController();planningAbort=abort;
    busy=true;phase='planning';control('workflow-planning-indicator').text='正在恢复本窗口的 Codex 对话…';updateButtons();
    (async()=>{
      await aiCleanup.catch(()=>{});planningCurrent(epoch,serial,'local_codex');
      await localPlanner.resume({consent,signal:abort.signal});
      planningCurrent(epoch,serial,'local_codex');
      status('已恢复本机对话。继续发送需求即可；本次恢复没有执行网页操作。');
      closeHistory();
      focus('workflow-ai-request');
    })().catch(error=>{if(!disposed&&epoch===planningGeneration)status(localFailure(error),true);})
      .finally(()=>{if(epoch===planningGeneration){busy=false;phase='idle';planningAbort=null;if(!disposed)updateButtons();}});
  };
  bind('workflow-ai-resume','click',onResumeSessionClick);
  const onOpenSavedHistory=(key,event)=>{
    if(!event.isTrusted||busy||autoExecutionPending||host.executionPending||host.currentRun)return;
    const unsaved=(Boolean(workflow.steps.length||
      workflow.title!=='新工作流'||workflow.description)&&!matchesSavedDefinition())
      ||Boolean(control('workflow-ai-request').value.trim());
    if(unsaved){
      status('当前有未保存内容。请先保存，或通过「新工作流」确认放弃后再打开历史。',true);
      return;
    }
    control('workflow-saved-list').value=key;
    void loadSaved().then(()=>{if(!disposed){closeHistory();focus('workflow-ai-request');}})
      .catch(error=>status(format(error),true));
  };
  function commitNewWorkflow(){
    pendingReuse=null;pendingBundleGrant=null;pendingNaturalPlanning=null;
    dismissRunReview();
    dismissNewReview();
    closeHistory();
    void stopPlanning({close:true}).catch(()=>{});
    observationApproval=null;persistObservationApproval();
    verifiedTurnHistory=[];lastProviderTurn=null;
    lastTrustedRun=null;runId=null;onRunOwner(null);
    workflow=emptyWorkflow(currentOrigin()||'',crypto.randomUUID());paramValues={};directVerifiedSerial=null;
    selectedBundle=null;fullAgentDraft=null;
    revision=null;touched=true;lastRun='none';hasError=false;phase='idle';
    clearChat();entryMode='new-workflow';
    control('workflow-manage-panel').hidden=true;
    control('workflow-history-toggle').expanded='false';
    newReviewReturnFocus=null;
    setConversationDraft('');
    render();persistDraft();
    focus('workflow-ai-request');
    status('');
  }
  const workflowReviewSignature=()=>JSON.stringify([workflow,phase,control('workflow-ai-request').value]);
  const onNewWorkflowClick=event=>{
    if(!event.isTrusted||autoExecutionPending||busy&&phase!=='planning')return;
    dismissRunReview();
    if(host.executionPending||host.currentRun){
      status('当前网页任务仍在执行，请先停止或完成，再新建工作流。',true);return;
    }
    const dirty=(Boolean(workflow.steps.length ||
      workflow.title!=='新工作流' || workflow.description) && !matchesSavedDefinition())
      || Boolean(control('workflow-ai-request').value.trim());
    if(dirty){
      newReviewReturnFocus=historyOpen?'workflow-history-toggle':'workflow-new';
      newReviewSignature=workflowReviewSignature();
      control('workflow-new-review').hidden=false;
      status('请确认是否保留当前尚未保存的内容。');
      focus('workflow-new-cancel');
      return;
    }
    commitNewWorkflow();
  };
  bind('workflow-new','click',onNewWorkflowClick);
  bind('workflow-new-cancel','click',event=>{
    if(!event.isTrusted)return;
    const focusTarget=newReviewReturnFocus;
    const focusWasInsideReview=get('workflow-new-review')?.contains(doc?.activeElement);
    dismissNewReview();newReviewReturnFocus=null;status('草稿已保留。');
    // Restore the opening control only when closing an actively focused review.
    // Do not steal focus if the user moved to another field meanwhile.
    if(focusWasInsideReview&&focusTarget)focus(focusTarget);
  });
  bind('workflow-new-discard','click',event=>{
    if(!event.isTrusted||busy&&phase!=='planning'||newReviewSignature===null)return;
    if(newReviewSignature!==workflowReviewSignature()){
      dismissNewReview();status('草稿或规划状态已变化，请重新检查后再新建。',true);
      return;
    }
    commitNewWorkflow();
  });
  bind('workflow-title','input',event=>{workflow.title=event.target.value;edited();});
  bind('workflow-description','input',event=>{workflow.description=event.target.value;edited();});
  bind('workflow-add-step','click',()=>{
    if(workflow.steps.length>=32){status('最多 32 个步骤',true);return;}
    workflow.steps.push(defaultStep());renderSteps(workflow.steps.at(-1).stepId);edited();
  });
  bind('workflow-add-param','click',()=>{
    try{
      const name=control('workflow-new-param-name').value.trim();
      if(!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(name) ||
        Object.hasOwn(workflow.paramsSchema.properties,name))
        throw err('E_WORKFLOW_PARAMS','请输入不重复的英文参数名，例如 keyword');
      const next=structuredClone(workflow.paramsSchema);
      next.properties[name]={type:'string',title:name,maxLength:512};
      next.required.push(name);
      workflow.paramsSchema=checkParamsSchema(next);
      control('workflow-new-param-name').value='';
      control('workflow-schema').value=JSON.stringify(next,null,2);
      renderParams();edited();
      status('已添加参数 '+name+'；在填写步骤中填写相同的参数名即可复用');
    }catch(error){status(format(error),true);}
  });
  bind('workflow-schema','change',event=>{
    try {
      const value=JSON.parse(event.target.value);
      checkParamsSchema(value);workflow.paramsSchema=value;renderParams();edited();
      status('参数定义已更新；请重新检查步骤中的参数引用');
    }catch(error){status('参数定义不合法：'+format(error),true);}
  });
  bind('workflow-save','click',()=>save());
  bind('workflow-run','click',runManual);
  bind('workflow-run-review-confirm','click',event=>{
    if(!event.isTrusted)return Promise.resolve({ok:false,skipped:true});
    if(pendingInstalledGrant){
      const row=pendingInstalledGrant;pendingInstalledGrant=null;
      if(!sameTarget(row.captured,currentPageTarget.snapshot)||
        row.confirmInput!==control('workflow-ai-request').value.trim()){
        dismissRunReview();status('任务或网页已变化，请重新发送。',true);
        return Promise.resolve({ok:false,skipped:true});
      }
      let permission;
      try{
        // Chrome native permission dialog is invoked synchronously ONLY from
        // this separate actual trusted Confirm click, never after an await.
        permission=row.needsPermission?
          api.permissions.request({origins:[permissionPattern(row.captured.url)]}):
          Promise.resolve(true);
      }catch(error){status(format(error),true);return Promise.resolve({ok:false,error});}
      dismissRunReview();
      autoExecutionPending=true;updateButtons();
      return Promise.resolve(permission).then(approved=>{
        if(approved!==true)throw err('E_PERMISSION','网站授权未批准，未执行任务');
        if(!sameTarget(row.captured,currentPageTarget.snapshot))
          throw err('E_DOCUMENT_STALE','授权时网页已变化，不执行任务');
        return executeMatchedInstalled(event,row);
      }).catch(error=>{
        if(!disposed)status(format(error)+'；不会自动重试。',true);
        return {ok:false,error};
      }).finally(()=>{autoExecutionPending=false;if(!disposed)updateButtons();});
    }
    if(pendingBundleGrant){
      const row=pendingBundleGrant;pendingBundleGrant=null;
      if(!sameTarget(row.captured,currentPageTarget.snapshot)){
        dismissRunReview();status('网页已变化，授权确认已失效。',true);
        return Promise.resolve({ok:false,skipped:true});
      }
      const scopes=[...new Set(row.bundle.segments.map(s=>permissionPattern(s.entryUrl)))];
      // Only this fresh Confirm click may open Chrome permissions.request.
      let permission;
      try{permission=api.permissions.request({origins:scopes});}
      catch(error){status(format(error),true);return Promise.resolve({ok:false,error});}
      dismissRunReview();
      return runSavedBundle(event,{...row,permission});
    }
    if(pendingNaturalPlanning){
      const row=pendingNaturalPlanning;pendingNaturalPlanning=null;
      if(!sameTarget(row.target,currentPageTarget.snapshot)||
        row.provider!==provider()||row.serial!==stable()||
        row.request!==control('workflow-ai-request').value.trim()){
        dismissRunReview();status('任务或网页已经变化，请重新发送。',true);
        return Promise.resolve({ok:false,skipped:true});
      }
      dismissRunReview();
      return plan(event);
    }
    if(pendingAIReview)return executeAIReview(event);
    if(!pendingRunReview)return Promise.resolve({ok:false,skipped:true});
    return runManual(event,pendingRunReview);
  });
  bind('workflow-run-review-cancel','click',event=>{
    if(!event.isTrusted||(!pendingRunReview&&!pendingAIReview&&
      !pendingBundleGrant&&!pendingNaturalPlanning&&!pendingInstalledGrant))return;
    const wasAI=Boolean(pendingAIReview||pendingNaturalPlanning);
    pendingBundleGrant=null;pendingNaturalPlanning=null;pendingInstalledGrant=null;
    dismissRunReview();status('本次操作已取消，未执行。');
    if(wasAI)appendChat('对话状态','已取消本次操作，网页未因本次确认发生修改。');
  });
  bind('workflow-stop','click',stop);
  bind('workflow-candidate','click',()=>{void candidate().catch(error=>status(format(error),true));});
  bind('workflow-open-code','click',()=>{
    if(!compiled)return;
    try {const applied=openDeveloper(compiled.sourceUtf8);
      Promise.resolve(applied).then(()=>status('代码已复制为独立开发草稿，改动不回写已保存工作流'))
        .catch(error=>status(format(error),true));
    }catch(error){status(format(error),true);}
  });
  bind('workflow-refresh','click',()=>refreshSaved().catch(error=>status(format(error),true)));
  bind('workflow-load','click',()=>loadSaved().catch(error=>status(format(error),true)));
  bind('workflow-ai-plan','click',sendNaturalLanguage);
  const unsubscribePage=currentPageTarget?.subscribe(next=>{
    if(disposed)return;
    if(pendingReuse&&!sameTarget(pendingReuse.target,next))pendingReuse=null;
    if(pendingInstalledGrant&&!sameTarget(pendingInstalledGrant.captured,next))pendingInstalledGrant=null;
    if(pendingBundleGrant&&!sameTarget(pendingBundleGrant.captured,next)||
      pendingNaturalPlanning&&!sameTarget(pendingNaturalPlanning.target,next)){
      pendingBundleGrant=null;pendingNaturalPlanning=null;dismissRunReview();
    }
    if(workflowAgent&&next.status==='available'&&
      (next.windowId!==workflowAgent.initialTarget.windowId||
       next.tabId!==workflowAgent.initialTarget.tabId||
       (next.origin!==workflowAgent.initialTarget.origin&&
        next.origin!==workflowAgent.expectedNavigation?.origin)))
      void stopWorkflowAgent('E_DOCUMENT_STALE').catch(()=>{});
    const reviewTarget=pendingAIReview?.captured||pendingRunReview?.captured;
    if(reviewTarget&&(next.status!=='available'||
      ['windowId','tabId','frameId','documentId','url','origin']
        .some(key=>reviewTarget[key]!==next[key])))dismissRunReview();
    if(next.status==='available'&&
      (next.origin!==workflow.siteOrigin||verifiedContextTarget&&
        (next.origin!==verifiedContextTarget.origin||
         next.windowId!==verifiedContextTarget.windowId||
         next.tabId!==verifiedContextTarget.tabId))) {
      verifiedTurnHistory=[];verifiedContextTarget=null;
    }
    if(observationApproval&&next.status==='available'&&next.origin!==observationApproval.origin){
      observationApproval=null;persistObservationApproval();
    }
    if(planningTarget&&(['windowId','tabId','frameId','documentId','url','origin']
      .some(key=>next[key]!==planningTarget[key])||next.status!=='available'))
      void (workflowAgent?stopWorkflowAgent('E_DOCUMENT_STALE'):stopPlanning()).catch(error=>status(format(error),true));
    if(!touched&&!workflow.siteOrigin&&next.status==='available') {
      workflow.siteOrigin=next.origin;render();persistDraft();
    }else{control('workflow-site-note').text=next.status==='available'
      ? (next.origin===workflow.siteOrigin?'当前网页符合工作流 origin':'网站不匹配；打开原网页或新建工作流')
      : next.message||'当前网页不可运行';updateButtons();}
  });
  const unsubscribeRun=host.subscribe(()=>{
    if(disposed)return;
    if((pendingRunReview||pendingAIReview)&&(host.executionPending||host.currentRun))dismissRunReview();
    if(runId && host.currentRun!==runId && !busy){runId=null;onRunOwner(null);}
    updateButtons();
  });
  // The framework settings panel may update Provider configuration while this
  // Workflow tab is hidden. Mirror its generation into the legacy controls;
  // stale planning and observation grants must not survive a source switch.
  const unsubscribeProviderSettings=providers.subscribeSettings?.(()=>{
    if(disposed)return;
    const next=providers.configuration(),settings=next.settings;
    if(provider()===next.source &&
      control('workflow-ai-endpoint').value===settings.endpoint &&
      control('workflow-ai-model').value===settings.model &&
      control('workflow-ai-key').value===settings.apiKey)return;
    synchronizingProvider=true;
    try {
      control('workflow-ai-provider').value=next.source;
      control('workflow-ai-endpoint').value=settings.endpoint;
      control('workflow-ai-model').value=settings.model;
      control('workflow-ai-key').value=settings.apiKey;
      renderProvider();
    }finally{synchronizingProvider=false;}
    dismissRunReview();
    observationApproval=null;persistObservationApproval();
    verifiedTurnHistory=[];lastProviderTurn=null;
    void (workflowAgent?stopWorkflowAgent('E_TOOL_CHANGED'):stopPlanning({close:true}))
      .catch(error=>{if(!disposed)status(format(error),true);});
    updateButtons();
  });
  const unsubscribeNative=client.subscribeWorkflowAI?.(state=>{
    if(disposed||!state)return;
    if(state.nativeConnected===false||!state.protocolAvailable)localCapability=state;
    updateLocalStatus();updateButtons();
  });
  const removedPermissions=async grant=>{
    if(grant.origins?.length||grant.permissions?.length){
      if(pendingRunReview||pendingAIReview||pendingBundleGrant||pendingNaturalPlanning)
        dismissRunReview();
      pendingReuse=null;pendingBundleGrant=null;pendingNaturalPlanning=null;
    }
    // Each consumer now observes its own Provider grant and invalidates only
    // its own Lease, not another consumer's Native thread or authorization.
    if(workflowAgent&&(grant.origins?.length||grant.permissions?.includes('nativeMessaging'))){
      let stillGranted=false;
      try{stillGranted=await api.permissions.contains({
        origins:[permissionPattern(workflowAgent.initialTarget.url)]});}catch{}
      if(!stillGranted||workflowAgent.selected==='local_codex'&&grant.permissions?.includes('nativeMessaging'))
        void stopWorkflowAgent('E_PERMISSION').catch(()=>{});
    }
    if(!grant.origins?.length&&!grant.permissions?.includes('nativeMessaging'))return;
    const approval=observationApproval;
    if(!approval)return;
    let siteGranted=false,receiverGranted=false;
    try {
      siteGranted=await api.permissions.contains({origins:[permissionPattern(approval.origin+'/')]});
      receiverGranted=approval.provider&&approval.provider!=='local_codex'
        ?Boolean(approval.receiverPattern)&&await api.permissions.contains({origins:[approval.receiverPattern]})
        :!grant.permissions?.includes('nativeMessaging');
    }catch{/* Unknown permission state is not a grant. */}
    if(approval!==observationApproval||(siteGranted&&receiverGranted))return;
    observationApproval=null;persistObservationApproval();
    void stopPlanning().catch(error=>status(format(error),true));
    if(!disposed)renderObservationApproval();
  };
  api.permissions.onRemoved?.addListener(removedPermissions);
  // Another sidebar or installed revision can change local history without
  // this view saving it. Invalidate before any new natural-language dispatch.
  const savedStorageChanged=(changes,area)=>{
    if(disposed||area!=='local'||!Object.keys(changes||{}).some(key=>key.startsWith(STORAGE_PREFIX)))return;
    savedHistoryReady=false;updateButtons();
    void refreshSaved().catch(error=>{
      if(!disposed)status('保存的工作流刷新失败：'+format(error),true);
    });
  };
  api.storage.onChanged?.addListener(savedStorageChanged);
  (async()=>{
    await currentPageTarget?.ready;
    const key=session();
    if(key){
      const stored=await api.storage.session.get([key,approvalKey()]),saved=stored[key];
      observationApproval=stored[approvalKey()]||null;
      if(!touched&&saved?.format==='opendesk.workflow.v1' &&
        saved.workflowId?.startsWith('wf-') && JSON.stringify(saved).length<50000) {
        // Restored drafts are untrusted until compiler validation at run/save.
        workflow=structuredClone(saved);
        touched=true;render();
      }
    }
    await client.ready;
    await refreshSaved();
    // Both sources are primed at initial conversation mount. Send always
    // refreshes Catalog again before deciding NO_MATCH.
    const initialCatalog=await client.request('listTaskCatalog',{});
    if(!Array.isArray(initialCatalog?.catalog)||!Array.isArray(initialCatalog?.installed))
      throw err('E_TASK_CATALOG','任务目录初始化不完整');
    if(!disposed)updateButtons();
  })().catch(error=>status(format(error),true));
  render();renderProvider();syncAISettings();status('');
  const dispatch=(id,eventName,event)=>{
    if(disposed||control(id).disabled)return;
    return bindings.get(id+':'+eventName)?.(event);
  };
  const actions=Object.freeze({
    click:(id,event)=>dispatch(id,'click',event),
    input(id,value,event,eventName='input') {
      if(disposed)return;
      if(id==='workflow-ai-request')setConversationDraft(value);
      else control(id).value=String(value);
      return dispatch(id,eventName,event);
    },
    onHistory:onHistoryClick,onNewSession:onNewSessionClick,onNewWorkflow:onNewWorkflowClick,
    onResumeHistory:(_key,event)=>onResumeSessionClick(event),onOpenSavedHistory,
    openSettings:()=>{if(!disposed)openAISettings();},
    closeSettings:closeWorkflowSheet,chooseExample,
    setParam(name,value) {
      if(disposed||busy||autoExecutionPending||workflowAgent||
        host.executionPending||host.currentRun||!Object.hasOwn(paramValues,name))return;
      if(pendingAIReview||pendingRunReview){
        dismissRunReview();status('参数已变化，旧步骤确认已失效；请重新检查后运行。');
      }
      paramValues[name]=value;renderParams();
    },
    parameterizeStep(stepId) {
      if(disposed||busy||autoExecutionPending||workflowAgent||
        host.executionPending||host.currentRun)return;
      const step=workflow.steps.find(row=>row.stepId===stepId);
      if(!step||step.op!=='fill'||step.param||typeof step.text!=='string'||!step.text.trim())return;
      try {
        const schema=structuredClone(workflow.paramsSchema);
        const keys=Object.keys(schema.properties);
        if(keys.length>=16)throw err('E_WORKFLOW_PARAMS','当前已达到最多 16 个参数');
        const search=/(?:search|query|keyword|搜索|检索|查找)/i.test([step.selector,step.roleName,workflow.title].join(' '));
        const base=search?'keyword':'value';
        let name=base,index=2;
        while(Object.hasOwn(schema.properties,name))name=base+index++;
        const title=search?'搜索关键词':'填写内容';
        const secret=/(?:password|passwd|secret|credential|token|cookie|authorization|api.?key|验证码|密码|密钥|令牌|凭证|银行卡|身份证|支付)/i.test(
          [step.selector,step.roleName,step.text].join(' '));
        const original=step.text;
        schema.properties[name]={type:'string',title,maxLength:512,
          ...(!secret?{default:original}:{})};
        schema.required.push(name);
        checkParamsSchema(schema);
        // A parameter changes the source contract, but values at replay do not.
        step.param=name;delete step.text;
        workflow.paramsSchema=schema;
        paramValues[name]=secret?'':original;
        control('workflow-schema').value=JSON.stringify(schema,null,2);
        renderParams();renderSteps(stepId);edited();
        status('已创建参数「'+title+'」。今后运行只需修改参数，无需编辑 JavaScript。'+
          (secret?'敏感内容不会作为默认值保存。':''));
      }catch(error){status(format(error),true);}
    },
    removeParam(name) {
      if(disposed||busy||autoExecutionPending||workflowAgent||
        host.executionPending||host.currentRun||
        !Object.hasOwn(workflow.paramsSchema.properties,name))return;
      const next=structuredClone(workflow.paramsSchema);delete next.properties[name];
      next.required=next.required.filter(value=>value!==name);
      workflow.paramsSchema=checkParamsSchema(next);control('workflow-schema').value=JSON.stringify(next,null,2);
      renderParams();edited();status('参数 '+name+' 已从草稿移除；如有步骤引用该参数，需要重新编辑才能编译');
    },
    editStep(stepId,field,value) {
      if(disposed||busy||autoExecutionPending||workflowAgent||
        host.executionPending||host.currentRun)return;
      const index=workflow.steps.findIndex(step=>step.stepId===stepId);if(index<0)return;
      const step=workflow.steps[index];
      if(field==='op') {
        if(!WORKFLOW_OPERATIONS.includes(value))return;
        workflow.steps[index]={...defaultStep(value),stepId};
        if(value==='navigate')workflow.steps[index].url=workflow.siteOrigin+'/';
      }else if(field==='locatorKind') {
        if(!WORKFLOW_LOCATORS.includes(value))return;step.locatorKind=value;
      }else if(field==='param') {
        if(value){step.param=value;delete step.text;}else{delete step.param;step.text='';}
      }else if(field==='text'&&step.op==='fill'&&step.param)return;
      else if(['selector','roleName','url','text','timeout'].includes(field))step[field]=field==='timeout'?Number(value):value;
      else return;
      renderSteps();edited();
    },
    moveStep(stepId,delta) {
      if(disposed||![-1,1].includes(delta))return;
      const index=workflow.steps.findIndex(step=>step.stepId===stepId),target=index+delta;
      if(index<0||target<0||target>=workflow.steps.length)return;
      [workflow.steps[index],workflow.steps[target]]=[workflow.steps[target],workflow.steps[index]];
      renderSteps();edited();
    },
    removeStep(stepId) {
      if(disposed)return;
      workflow.steps=workflow.steps.filter(step=>step.stepId!==stepId);renderSteps();edited();
    },
  });
  // A trusted, already-admitted bookmark React portal can use this closure.
  // Secrets stay in WorkflowView's session-only controller fields.
  // Business Provider leases are now owned by the trusted Shell adapters.
  // Standalone historical unit clients retain a compatibility facade only.
  const conversation=ownsProviderRuntime?createBusinessConversation({
    providerRuntime:providers,api,hostInstanceId,consumerId:'bookmark',
    instanceId:'test-bookmark-'+crypto.randomUUID()}):null;
  const taskConversation=ownsProviderRuntime?createBusinessConversation({
    providerRuntime:providers,api,hostInstanceId,consumerId:'tasks',
    instanceId:'test-tasks-'+crypto.randomUUID()}):null;
  return {getSnapshot:ui.getSnapshot,subscribe:ui.subscribe,actions,conversation,taskConversation,
    dispose() {
    if(disposed)return;
    if(workflowAgent)void stopWorkflowAgent('E_HOST_CLOSED').catch(()=>{});
    pendingReuse=null;pendingBundleGrant=null;pendingNaturalPlanning=null;pendingInstalledGrant=null;
    dismissRunReview();disposed=true;compileToken++;planningGeneration++;
    conversation?.dispose();taskConversation?.dispose();
    planningAbort?.abort(err('E_HOST_CLOSED','工作流窗口已关闭'));pendingApproval?.settle({decision:'deny'});
    retireConversationRound();workflowSession.dispose();
    workflowLease.dispose();if(ownsProviderRuntime)providers.dispose();
    void Promise.resolve(observation.dispose()).catch(()=>{});
    unsubscribePage?.();unsubscribeRun?.();unsubscribeNative?.();
    unsubscribeProviderSettings?.();
    api.permissions.onRemoved?.removeListener(removedPermissions);
    api.storage.onChanged?.removeListener(savedStorageChanged);
    bindings.clear();ui.dispose();onRunOwner(null);
    // RunHost is owned and disposed by the existing ScriptEditor, not by this view.
  }};
}
