import {emptyWorkflow,validateWorkflow,WORKFLOW_OPERATIONS,WORKFLOW_LOCATORS,validateWorkflowParams} from '../../framework/workflow/contract.js';
import {checkParamsSchema} from '../../platform/tasks/contract.js';
import {compileWorkflow} from '../../framework/workflow/compiler.js';
import {createTaskPackage} from '../../platform/tasks/contract.js';
import {permissionPattern} from '../../environment.js';
import {decodeValue} from '../../platform/page-port/codec.js';
import {presentTaskValue,formatTaskError} from '../task-run-diagnostics.js';
import {formatRunValue} from '../run-value-format.js';
import {requestWorkflowPlan} from './ai-plan.js';
import {deriveWorkflowViewState} from './view-state.js';
import {createLocalCodexPlanner,describeLocalCodex} from './local-codex.js';
import {createWorkflowObservation} from './observation.js';

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
function node(doc,tag,text,className) {
  const element=doc.createElement(tag);
  if(text!==undefined)element.textContent=text;
  if(className)element.className=className;
  return element;
}
function labelInput(doc,parent,label,value,onInput,options={}) {
  const wrapper=node(doc,'label',undefined,'workflow-field');
  wrapper.append(node(doc,'span',label));
  const input=node(doc,options.textarea?'textarea':'input');
  if(!options.textarea)input.type=options.type || 'text';
  input.value=String(value ?? '');
  if(options.placeholder)input.placeholder=options.placeholder;
  if(options.maxLength)input.maxLength=options.maxLength;
  input.addEventListener(options.onChange?'change':'input',()=>onInput(input.value));
  wrapper.append(input);parent.append(wrapper);
  return input;
}
function labelSelect(doc,parent,label,value,options,onInput) {
  const wrapper=node(doc,'label',undefined,'workflow-field');
  wrapper.append(node(doc,'span',label));
  const select=node(doc,'select');
  for(const [key,title] of options)select.append(new Option(title,key));
  select.value=value || options[0][0];
  select.addEventListener('change',()=>onInput(select.value));
  wrapper.append(select);parent.append(wrapper);return select;
}

export function createWorkflowView({api=globalThis.chrome,document:doc=globalThis.document,
  client,host,currentPageTarget,onRunOwner=()=>{},openDeveloper=()=>{},openCatalog=()=>{}}) {
  const get=id=>doc.getElementById(id);
  const session=()=>Number.isSafeInteger(currentPageTarget?.windowId)
    ? SESSION_PREFIX + currentPageTarget.windowId:null;
  let disposed=false,busy=false,runId=null,revision=null,compileToken=0,compiled=null;
  let proposal=null,proposalBase=null,proposalSerial=null,touched=false,saveList=[],draftWrites=Promise.resolve();
  let phase='idle',lastRun='none',hasError=false;
  let planningGeneration=0,planningAbort=null,pendingApproval=null,localChecking=false;
  let localCapability={state:'UNKNOWN',readyForTurn:false},aiCleanup=Promise.resolve();
  let workflow=emptyWorkflow(currentPageTarget?.snapshot?.origin || '',crypto.randomUUID());
  const localPlanner=createLocalCodexPlanner({client});
  const listeners=[];
  const listen=(element,event,fn)=>{
    element.addEventListener(event,fn);listeners.push([element,event,fn]);
  };
  const status=(message,error=false)=>{
    if(disposed)return;
    hasError=Boolean(error);
    const element=get('workflow-status');
    element.textContent=message;
    element.dataset.state=error?'error':'info';
    element.hidden=!message;
    updatePresentation();
  };
  const currentOrigin=()=>currentPageTarget?.snapshot?.status==='available'
    ? currentPageTarget.snapshot.origin:null;
  const provider=()=>get('workflow-ai-provider').value;
  function appendChat(speaker,message) {
    if(disposed)return;
    const transcript=get('workflow-ai-transcript');
    const entry=node(doc,'div',undefined,'workflow-chat-entry');
    entry.dataset.speaker=speaker==='你'?'user':'assistant';
    entry.append(node(doc,'strong',speaker));
    entry.append(node(doc,'p',message));
    transcript.append(entry);
    while(transcript.children.length>21)transcript.firstElementChild.remove();
    transcript.scrollTop=transcript.scrollHeight;
    return entry.lastElementChild;
  }
  const snapshot=()=>structuredClone(workflow);
  const stable=()=>JSON.stringify(workflow);
  const matchesRevision=()=>revision && revision.sourceHash===compiled?.sourceHash &&
    JSON.stringify(revision.workflow)===stable();
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
    const hasActions=workflow.steps.some(step=>['click','fill'].includes(step.op));
    const hasParams=Object.keys(workflow.paramsSchema.properties).length>0;
    const transcript=get('workflow-ai-transcript');
    const hasMessages=Array.from(transcript.children).some(child=>child.dataset.speaker);
    const ready=provider()==='local_codex'?describeLocalCodex(localCapability).ready:
      provider()==='custom_https'&&Boolean(get('workflow-ai-key').value.trim() && get('workflow-ai-model').value.trim());
    const mode=deriveWorkflowViewState({phase,proposal:Boolean(proposal),hasSteps,
      saved:Boolean(matchesRevision()),lastRun,error:hasError,providerReady:ready});
    get('workflow-editor').dataset.viewState=mode;
    get('workflow-plan-panel').hidden=!hasSteps || Boolean(proposal);
    get('workflow-params-panel').hidden=!hasSteps || Boolean(proposal) || (!hasParams && !hasActions);
    get('workflow-run-consent').hidden=!hasActions;
    get('workflow-result-panel').hidden=!['success','failed'].includes(lastRun);
    get('workflow-chat-intro').hidden=hasSteps || hasMessages || Boolean(proposal) || phase==='planning';
    transcript.hidden=!hasMessages;
    get('workflow-planning-indicator').hidden=phase!=='planning';
    get('workflow-dock').dataset.empty=String(!hasSteps&&!runId);
    get('workflow-display-title').textContent=hasSteps && workflow.title!=='新工作流'
      ?workflow.title:'新工作流';
    const origin=currentOrigin(),warning=get('workflow-target-warning');
    const mismatch=hasSteps && (!origin || origin!==workflow.siteOrigin);
    warning.hidden=!mismatch;
    if(mismatch){
      let site='目标网站';
      try{site=new URL(workflow.siteOrigin).host;}catch{}
      warning.textContent=origin
        ?'当前网站不匹配，请打开 '+site+' 后运行。'
        :'请打开 '+site+' 后运行。';
    }
  }
  function updateButtons() {
    if(disposed)return;
    const runnable=Boolean(compiled && currentOrigin()===workflow.siteOrigin &&
      !busy && !host.executionPending && !host.currentRun);
    get('workflow-run').disabled=!runnable;
    get('workflow-save').disabled=busy || !compiled;
    get('workflow-candidate').disabled=busy || !matchesRevision();
    get('workflow-stop').disabled=!runId || host.currentRun!==runId;
    get('workflow-open-code').disabled=!compiled;
    get('workflow-ai-apply').disabled=!proposal || busy;
    get('workflow-ai-plan').disabled=busy||['manual','opendesk_cloud'].includes(provider());
    get('workflow-ai-plan').hidden=phase==='planning';
    get('workflow-ai-cancel').hidden=phase!=='planning';
    get('workflow-ai-new-session').hidden=!localPlanner.snapshot().sessionId;
    get('workflow-ai-new-session').disabled=busy;
    get('workflow-ai-resume').hidden=!localPlanner.snapshot().resumable;
    get('workflow-ai-resume').disabled=busy;
    const savedStatus=get('workflow-saved-state');
    savedStatus.hidden=!revision;
    if(revision){
      savedStatus.textContent=matchesRevision()?'已保存':'未保存更改';
      savedStatus.title='工作流版本 r'+revision.revision+
        (matchesRevision()?' · 源码哈希一致':' · 已修改但尚未保存');
    }
    updatePresentation();
  }
  async function updateCode() {
    const token=++compileToken;
    compiled=null;updateButtons();
    try {
      const result=await compileWorkflow(snapshot());
      if(disposed||token!==compileToken)return;
      compiled=result;get('workflow-code').textContent=result.sourceUtf8;
      get('workflow-code-hash').textContent='SHA-256：' + result.sourceHash;
    } catch(error) {
      if(disposed||token!==compileToken)return;
      get('workflow-code').textContent='尚不可编译：' + format(error);
      get('workflow-code-hash').textContent='';
    }
    updateButtons();
  }
  function edited() {
    touched=true;proposal=null;proposalBase=null;proposalSerial=null;get('workflow-ai-proposal').hidden=true;
    hasError=false;lastRun='none';
    get('workflow-status').hidden=true;get('workflow-status').textContent='';
    persistDraft();void updateCode();
  }
  function renderGeneral() {
    get('workflow-title').value=workflow.title;
    get('workflow-description').value=workflow.description;
    get('workflow-site').value=workflow.siteOrigin;
    get('workflow-schema').value=JSON.stringify(workflow.paramsSchema,null,2);
    get('workflow-site-note').textContent=currentOrigin()
      ? (currentOrigin()===workflow.siteOrigin?'匹配当前网页。只允许该 origin 的自动化。':
        '当前网页属于 ' + currentOrigin() + '；请打开原网站或新建工作流。')
      : '请打开 HTTP(S) 网页并等待主文档可用；不会使用历史网页作为目标。';
    get('workflow-confirm-run').checked=false;
  }
  function renderParams() {
    const parent=get('workflow-params'),prior={};
    for(const control of parent.querySelectorAll('[data-workflow-param]'))
      prior[control.dataset.workflowParam]=control.type==='checkbox'?control.checked:control.value;
    parent.replaceChildren();
    for(const [name,rule] of Object.entries(workflow.paramsSchema.properties)) {
      const wrapper=node(doc,'label',undefined,'workflow-field');
      wrapper.append(node(doc,'span',rule.title + (workflow.paramsSchema.required.includes(name)?' *':'')));
      const input=node(doc,rule.enum?'select':'input');
      input.dataset.workflowParam=name;
      if(rule.enum) {
        for(const choice of rule.enum)input.append(new Option(String(choice),String(choice)));
      }else if(rule.type==='boolean')input.type='checkbox';
      else if(['number','integer'].includes(rule.type)) {
        input.type='number';input.step=rule.type==='integer'?'1':'any';
      }else input.type='text';
      if(rule.type==='boolean')input.checked=prior[name] ?? rule.default ?? false;
      else input.value=prior[name] ?? (rule.default===undefined?'':String(rule.default));
      wrapper.append(input);
      const row=node(doc,'div',undefined,'workflow-param-row');
      const remove=node(doc,'button','移除');remove.type='button';
      remove.setAttribute('aria-label','移除参数 '+name);
      remove.addEventListener('click',()=>{
        const next=structuredClone(workflow.paramsSchema);
        delete next.properties[name];
        next.required=next.required.filter(value=>value!==name);
        workflow.paramsSchema=checkParamsSchema(next);
        get('workflow-schema').value=JSON.stringify(next,null,2);
        renderParams();edited();
        status('参数 '+name+' 已从草稿移除；如有步骤引用该参数，需要重新编辑才能编译');
      });
      row.append(wrapper,remove);parent.append(row);
    }
    get('workflow-params-empty').hidden=true;
  }
  function readParams() {
    const values={};
    for(const [name,rule] of Object.entries(workflow.paramsSchema.properties)) {
      const input=[...get('workflow-params').querySelectorAll('[data-workflow-param]')]
        .find(control=>control.dataset.workflowParam===name);
      if(!input)throw err('E_WORKFLOW_PARAMS','缺少参数 '+name);
      if(input.type==='checkbox')values[name]=input.checked;
      else if(input.value==='' && !workflow.paramsSchema.required.includes(name) &&
        rule.default===undefined)continue;
      else if(['integer','number'].includes(rule.type))values[name]=input.value===''?NaN:Number(input.value);
      else if(rule.enum)values[name]=rule.enum.find(choice=>String(choice)===input.value);
      else values[name]=input.value;
    }
    return validateWorkflowParams(workflow,values);
  }
  function renderSteps(expandStepId=null) {
    const parent=get('workflow-steps');
    const expanded=new Set(Array.from(parent.querySelectorAll('details.workflow-step[open]'))
      .map(item=>item.dataset.stepId));
    if(expandStepId)expanded.add(expandStepId);
    parent.replaceChildren();
    get('workflow-step-count').textContent=workflow.steps.length + ' 步';
    if(!workflow.steps.length)parent.append(node(doc,'p','暂无步骤。添加“观察页面”或“填写内容”开始创建。','hint'));
    workflow.steps.forEach((step,index)=>{
      const details=node(doc,'details',undefined,'workflow-step');
      details.dataset.stepId=step.stepId;
      details.open=expanded.has(step.stepId);
      const summaryText=()=>{
        const action=OP_LABELS[step.op]||step.op;
        if(step.op==='fill'&&step.param)return action+' · 参数 '+step.param;
        if(step.locatorKind==='role'&&step.roleName)return action+' · '+step.roleName;
        if(step.op==='navigate')return action+' · 同站页面';
        return action;
      };
      const summary=node(doc,'summary',(index+1)+'. '+summaryText());details.append(summary);
      const body=node(doc,'div',undefined,'workflow-step-body');
      const mark=()=>{summary.textContent=(index+1)+'. '+summaryText();edited();};
      labelSelect(doc,body,'动作',step.op,WORKFLOW_OPERATIONS.map(op=>[op,OP_LABELS[op]]),op=>{
        workflow.steps[index]=defaultStep(op);
        workflow.steps[index].stepId=step.stepId;
        if(op==='navigate')workflow.steps[index].url=workflow.siteOrigin+'/';
        renderSteps(step.stepId);edited();
      });
      if(['fill','click','wait','extract','assert'].includes(step.op)) {
        labelSelect(doc,body,'定位方法',step.locatorKind,WORKFLOW_LOCATORS.map(k=>[k,
          {css:'CSS 选择器',role:'ARIA 角色',label:'标签文字',text:'文本',testId:'Test ID'}[k]]),value=>{
          step.locatorKind=value;renderSteps(step.stepId);edited();
        });
        labelInput(doc,body,'目标元素',step.selector,value=>{step.selector=value;mark();},{maxLength:512});
        if(step.locatorKind==='role')labelInput(doc,body,'无障碍名称（可选）',
          step.roleName||'',value=>{step.roleName=value;mark();},{maxLength:200});
      }
      if(step.op==='navigate')labelInput(doc,body,'同站目标 URL',step.url||'',value=>{
        step.url=value;mark();
      },{maxLength:2000,placeholder:workflow.siteOrigin+'/'});
      if(step.op==='fill'){
        labelInput(doc,body,'参数名（有值时使用参数）',step.param||'',value=>{
          if(value){step.param=value;delete step.text;}
          else{delete step.param;step.text='';}
          edited();
        },{maxLength:40});
        labelInput(doc,body,'固定填写值（参数名留空时生效）',step.text??'',value=>{
          if(!step.param){step.text=value;edited();}
        },{maxLength:512});
      }
      if(['assert','confirm'].includes(step.op))
        labelInput(doc,body,step.op==='assert'?'预期包含文字':'确认事项',step.text||'',value=>{
          step.text=value;mark();
        },{maxLength:512});
      if(step.op==='wait')labelInput(doc,body,'最长等待毫秒（100–30000）',
        step.timeout??10000,value=>{step.timeout=Number(value);mark();},{type:'number',maxLength:5});
      const controls=node(doc,'div',undefined,'workflow-step-actions');
      for(const [caption,change] of [['↑',-1],['↓',1]]){
        const button=node(doc,'button',caption);button.type='button';
        button.setAttribute('aria-label',caption==='↑'?'上移第'+(index+1)+'步':'下移第'+(index+1)+'步');
        button.disabled=index+change<0||index+change>=workflow.steps.length;
        button.addEventListener('click',()=>{const target=index+change;
          [workflow.steps[index],workflow.steps[target]]=[workflow.steps[target],workflow.steps[index]];
          renderSteps(step.stepId);edited();
        });controls.append(button);
      }
      const remove=node(doc,'button','删除');remove.type='button';
      remove.addEventListener('click',()=>{workflow.steps.splice(index,1);renderSteps();edited();});
      controls.append(remove);body.append(controls);details.append(body);parent.append(details);
    });
  }
  function render() {
    renderGeneral();renderParams();renderSteps();
    void updateCode();updateButtons();
  }
  async function refreshSaved() {
    // Immutable revision records in existing extension chrome.storage.local; no second DB.
    const all=await api.storage.local.get(null);
    if(disposed)return;
    saveList=Object.entries(all).filter(([key,value])=>key.startsWith(STORAGE_PREFIX) &&
      value?.format==='opendesk.workflow-revision.v1' &&
      Number.isSafeInteger(value.revision)&&value.revision>0&&value.workflow?.workflowId)
      .map(([key,value])=>({key,...value})).sort((a,b)=>b.savedAt-a.savedAt || b.revision-a.revision);
    const select=get('workflow-saved-list'),prior=select.value;
    select.replaceChildren(new Option('选择已保存版本…',''));
    for(const item of saveList)select.append(new Option(
      item.workflow.title+' · r'+item.revision+' · '+item.workflow.siteOrigin,item.key));
    if(saveList.some(item=>item.key===prior))select.value=prior;
  }
  async function loadSaved() {
    const record=saveList.find(item=>item.key===get('workflow-saved-list').value);
    if(!record)throw err('E_WORKFLOW_REVISION','请选择已保存版本');
    if(busy)throw err('E_WORKFLOW_BUSY','请在当前操作结束后再打开历史版本');
    const clean=validateWorkflow(record.workflow);
    const compile=await compileWorkflow(clean);
    const saved=await host.controller.getControllerScript({scriptId:clean.workflowId,revision:record.revision});
    if(saved?.contentHash!==compile.sourceHash || saved.sourceUtf8!==compile.sourceUtf8 ||
      record.sourceHash!==compile.sourceHash)
      throw err('E_WORKFLOW_HASH','语义定义与持久 JavaScript 版本不一致，拒绝运行');
    void stopPlanning({close:true}).catch(()=>{});clearSendConsent();
    workflow=clean;
    revision=record;touched=true;proposal=null;proposalBase=null;proposalSerial=null;lastRun='none';hasError=false;
    get('workflow-ai-proposal').hidden=true;
    render();persistDraft();
    status('已打开冻结版本 r'+record.revision+'；运行不会调用 AI');
  }
  async function save() {
    if(busy||!compiled)return;
    const serial=stable(),frozen=snapshot();
    busy=true;updateButtons();
    try {
      const freeze=await compileWorkflow(frozen);
      const previous=revision?.workflow?.workflowId===freeze.workflow.workflowId?revision.revision:0;
      // Only the existing Controller revision journal can claim the executable bytes.
      if(serial!==stable())throw err('E_WORKFLOW_STALE','保存期间草稿已变化');
      const saved=await host.controller.commitControllerScript({scriptId:freeze.workflow.workflowId,
        expectedRevision:previous,sourceUtf8:freeze.sourceUtf8});
      if(saved.contentHash!==freeze.sourceHash)throw err('E_WORKFLOW_HASH','Controller 源码哈希不匹配');
      const record={format:'opendesk.workflow-revision.v1',workflow:freeze.workflow,
        revision:saved.revision,sourceHash:freeze.sourceHash,savedAt:Date.now()};
      const key=STORAGE_PREFIX+freeze.workflow.workflowId+':'+saved.revision;
      await api.storage.local.set({[key]:record});
      if(serial===stable())revision={...record,key};
      await refreshSaved();
      get('workflow-saved-list').value=key;
      status('已保存工作流 r'+saved.revision+' 与 JavaScript 源码哈希；未安装、未声称已验证');
    }catch(error){status(format(error),true);}
    finally{busy=false;updateButtons();}
  }
  function resultDisplay(runId,view) {
    const run=view?.run,result=view?.results?.find(row=>row.runId===runId);
    get('workflow-technical').textContent=JSON.stringify({
      runId,state:run?.state||'unknown',revision:run?.revision||null,
      resultId:result?.resultId||null,retirement:run?.retirementState||null},null,2);
    const raw=get('workflow-raw'),reveal=get('workflow-result-raw');
    raw.textContent='';reveal.hidden=true;reveal.open=false;
    if(!result){get('workflow-output').textContent='后台尚无可核对的 Durable Result；未知状态不得自动重放。';return false;}
    if(!result.outcome?.ok) {
      get('workflow-output').textContent=formatTaskError(result.outcome?.error||{code:'E_WORKFLOW_RUN'});
      return false;
    }
    try {
      const value=decodeValue(result.outcome.valueWire),presented=presentTaskValue(value);
      get('workflow-output').textContent=presented.text;
      if(presented.redacted||presented.truncated){
        raw.textContent=formatRunValue(value);reveal.hidden=false;
      }
      return true;
    }catch(error){get('workflow-output').textContent='持久结果解码失败：'+format(error);return false;}
  }
  function run(event) {
    if(!event.isTrusted||busy||host.executionPending||host.currentRun||!compiled)return;
    let captured,params,freeze,permission;
    try {
      freeze=compiled;captured=currentPageTarget.capture();
      if(captured.origin!==freeze.workflow.siteOrigin)
        throw err('E_WORKFLOW_ORIGIN','当前网页不属于工作流保存的网站');
      params=readParams();
      if(freeze.workflow.steps.some(step=>['click','fill'].includes(step.op)) &&
        !get('workflow-confirm-run').checked)
        throw err('E_WORKFLOW_CONSENT','请先检查步骤并勾选本次网页操作确认');
      permission=api.permissions.request({origins:[permissionPattern(captured.url)]});
    }catch(error){
      if(error?.code==='E_WORKFLOW_CONSENT') {
        get('workflow-params-panel').hidden=false;
        get('workflow-confirm-run').focus();
      }
      status(format(error),true);return;
    }
    get('workflow-confirm-run').checked=false;
    onRunOwner('pending');
    busy=true;phase='running';lastRun='running';hasError=false;
    get('workflow-output').textContent='尚无本次持久结果';
    status('已冻结源码、参数、页面和用户授权请求；准备通过现有 RunHost 执行');
    updateButtons();
    (async()=>{
      if(!await permission)throw err('E_PERMISSION','网站授权被拒绝；未运行');
      if(disposed)throw err('E_HOST_CLOSED','Sidebar 已关闭');
      await currentPageTarget.revalidate(captured);
      const saved=revision && revision.workflow.workflowId===freeze.workflow.workflowId &&
        revision.sourceHash===freeze.sourceHash &&
        JSON.stringify(revision.workflow)===JSON.stringify(freeze.workflow);
      const source=saved?
        {kind:'saved',scriptId:freeze.workflow.workflowId,revision:revision.revision,contentHash:revision.sourceHash}:
        {kind:'draft',sourceUtf8:freeze.sourceUtf8};
      const claim=await host.start({source,params,
        target:{mode:'borrowed',tabId:captured.tabId,frameId:0,documentId:captured.documentId,
          expectedUrl:captured.url,expectedWindowId:captured.windowId},deadlineAt:Date.now()+30000});
      runId=claim.runId;onRunOwner(runId);updateButtons();
      status('运行中 · '+runId+'；编辑草稿不会改变本次冻结版本');
      const completed=await host.completion;
      if(completed?.state==='paused_unknown'||completed?.pendingSettlement)
        status('执行或收尾状态未知，禁止自动重新执行。请检查历史与网页副作用。',true);
      else status(''); // Result panel owns confirmed completion feedback.
      const view=await host.controller.snapshotControllerRun({runId:claim.runId});
      if(!disposed) {
        const decoded=resultDisplay(claim.runId,view);
        const result=view?.results?.find(row=>row.runId===claim.runId);
        lastRun=completed?.state==='paused_unknown'||completed?.pendingSettlement||!result?.outcome?.ok||!decoded
          ?'failed':'success';
        if(lastRun==='failed' && !hasError)
          status('运行未成功或结果无法确认，请检查真实结果及页面效果；不会自动重试。',true);
      }
    })().catch(error=>{
      lastRun='failed';
      get('workflow-output').textContent=format(error)+'；失败不会自动重放';
      status(format(error)+'；失败不会自动重放',true);
    }).finally(()=>{
      busy=false;phase='idle';
      // The owning Stop remains visible if the durable slot is still held
      // (e.g. outcome/retirement unknown); never lend that Stop to Developer.
      if(!runId || host.currentRun!==runId){runId=null;onRunOwner(null);}
      if(!disposed)updateButtons();
    });
  }
  function stop(event) {
    if(!event.isTrusted||!runId||host.currentRun!==runId)return;
    const id=runId;get('workflow-stop').disabled=true;
    host.stop({controller:true,runId:id,reason:'E_CANCELLED'})
      .then(()=>status('已请求停止 '+id+'；已发生的网页副作用不会回滚'))
      .catch(error=>status(format(error)+'；停止结果待核对',true));
  }
  async function candidate() {
    if(busy||!revision||!matchesRevision())throw err('E_WORKFLOW_REVISION','先保存未修改的工作流版本');
    const frozen=revision;
    const manifest={format:'opendesk.task.v1',taskId:workflow.workflowId,
      version:'1.0.'+frozen.revision,title:workflow.title,
      description:workflow.description||'本地语义工作流',author:'OpenDesk Workflow',source:'local-workflow',
      siteOrigins:[workflow.siteOrigin],permissions:['page.automation'],entryFormat:'async-main',
      program:{revision:frozen.revision,sourceHash:frozen.sourceHash},paramsSchema:workflow.paramsSchema};
    const pkg=await createTaskPackage(manifest,compiled.sourceUtf8);
    if(!matchesRevision())throw err('E_WORKFLOW_STALE','创建候选期间工作流发生变化');
    await client.request('importTaskPackage',{package:pkg});
    status('已提交待验证 Task Candidate；必须在目录中用真实 runId 验证后才可安装');
    openCatalog();
  }
  function renderProposal(result) {
    const preview=get('workflow-ai-preview');preview.replaceChildren();
    for(const step of result.steps) {
      const item=node(doc,'li');
      item.append(node(doc,'strong',OP_LABELS[step.op]||step.op));
      const parts=[];
      if(step.op==='navigate') {
        const url=new URL(step.url);
        parts.push('同站路径 '+url.pathname+url.search+url.hash);
      }
      if(step.selector) {
        const names={css:'CSS',role:'角色',label:'标签',text:'文字',testId:'测试标识'};
        parts.push((names[step.locatorKind]||'定位')+' '+JSON.stringify(step.selector)+
          (step.roleName?' / 名称 '+JSON.stringify(step.roleName):''));
      }
      if(step.param)parts.push('使用参数 '+step.param);
      else if(step.op==='fill')parts.push('填写 '+JSON.stringify(step.text));
      if(step.op==='assert')parts.push('应包含 '+JSON.stringify(step.text));
      if(step.op==='wait')parts.push('等待上限 '+(step.timeout??10000)+' 毫秒');
      if(step.op==='observe')parts.push('读取已授权页面的结构与文字摘要');
      const hint=parts.join(' · ');
      item.append(node(doc,'span',hint.length>220?hint.slice(0,220)+'…':hint));
      if(hint.length>220) {
        const details=node(doc,'details');
        details.append(node(doc,'summary','查看完整定位和值'),node(doc,'span',hint));
        item.append(details);
      }
      preview.append(item);
    }
  }
  function openAISettings(focus='workflow-ai-provider') {
    get('workflow-provider-settings').open=true;
    get('workflow-provider-toggle').setAttribute('aria-expanded','true');
    get(focus).focus?.({preventScroll:true});
  }
  function clearSendConsent() {
    get('workflow-ai-consent').checked=false;
    get('workflow-ai-observe-consent').checked=false;
  }
  function renderProvider() {
    const selected=provider(),local=selected==='local_codex',custom=selected==='custom_https';
    get('workflow-local-settings').hidden=!local;
    get('workflow-custom-settings').hidden=!custom;
    get('workflow-ai-send-consent').hidden=!(local||custom);
    get('workflow-ai-consent-note').hidden=!(local||custom);
    get('workflow-provider-scope').textContent=local
      ?'本机 OpenDesk 管理 Codex Agent，模型推理可能联网，已同意的内容可能保存在 Codex 本机对话中。复用官方 CLI 登录，请勿填写 Codex 登录凭据。'
      :custom?'需求和步骤只发送到你填写的 HTTPS 接口。此来源生成单次计划提议。'
      :selected==='manual'?'直接添加和编辑步骤，运行及保存无需 AI。'
      :'OpenDesk 官方 AI 服务接口已预留，目前尚未开放。';
    updateLocalStatus();updateButtons();
  }
  function updateLocalStatus() {
    if(disposed)return;
    const state=describeLocalCodex(localCapability),element=get('workflow-local-status');
    element.textContent=localChecking?'正在检查 OpenDesk 与 Codex 的真实状态…':
      localCapability.connecting?'正在连接本机 OpenDesk…':state.message;
    element.dataset.state=state.state;
    get('workflow-local-refresh').disabled=localChecking;
    get('workflow-local-connect').disabled=localChecking||localCapability.nativeConnected===true||state.ready;
  }
  async function refreshLocal() {
    if(localChecking||disposed||provider()!=='local_codex')return;
    localChecking=true;updateLocalStatus();
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
  function stopPlanning({close=false,remember=false}={}) {
    const stoppedGeneration=++planningGeneration;
    if(close)localCapability={...localCapability,inferenceVerified:false};
    planningAbort?.abort(err('E_CANCELLED','AI 规划已停止'));
    planningAbort=null;
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
    get('workflow-ai-progress').hidden=true;
    if(!disposed)updateButtons();
    return aiCleanup;
  }
  function planningCurrent(epoch,serial,selected) {
    if(disposed||epoch!==planningGeneration||planningAbort?.signal.aborted)
      throw err('E_CANCELLED','AI 会话已停止或改变');
    if(serial!==stable()||selected!==provider())
      throw err('E_WORKFLOW_STALE','规划期间草稿或 AI 来源已改变，请重新发送');
  }
  function offerObservation(event,context,{epoch,serial,selected,captured}) {
    planningCurrent(epoch,serial,selected);
    return new Promise(resolve=>{
      const row={event,context,epoch,serial,selected,captured,settled:false,processing:false,
        settle(answer){
          if(row.settled)return;row.settled=true;
          context.signal.removeEventListener('abort',abort);
          if(pendingApproval===row){pendingApproval=null;get('workflow-ai-approval').hidden=true;}
          resolve(answer);
        }};
      const abort=()=>row.settle({decision:'deny'});
      context.signal.addEventListener('abort',abort,{once:true});
      if(context.signal.aborted){abort();return;}
      pendingApproval=row;
      get('workflow-ai-approval-title').textContent='允许读取当前网页摘要？';
      get('workflow-ai-approval-scope').textContent='Codex 请求读取 '+new URL(captured.url).host+
        ' 的网页结构、元素名称与文字摘要，并发送给本次模型。摘要可能包含页面上的敏感文字。只允许本次选中的文档；不包含截图。';
      get('workflow-ai-approve').disabled=false;get('workflow-ai-deny').disabled=false;
      get('workflow-ai-approval').hidden=false;
      get('workflow-ai-deny').focus?.({preventScroll:true});
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
      permission=api.permissions.request({origins:[permissionPattern(row.captured.url)]});
    }catch(error){row.settle({decision:'deny'});status(format(error),true);return;}
    row.processing=true;get('workflow-ai-approve').disabled=true;get('workflow-ai-deny').disabled=true;
    get('workflow-ai-approval-title').textContent='正在读取已批准的网页…';
    (async()=>{
      if(!await permission)throw err('E_AI_PERMISSION','网页授权被拒绝，未读取网页');
      planningCurrent(row.epoch,row.serial,row.selected);
      if(row.context.signal.aborted)throw err('E_CANCELLED','网页观察已停止');
      const receipt=await observation.observe(row.captured,{signal:row.context.signal,requestId:row.context.requestId});
      await currentPageTarget.revalidate(row.captured);
      if(!await api.permissions.contains({origins:[permissionPattern(row.captured.url)]}))
        throw err('E_PERMISSION','网站权限已撤销，未向 AI 发送观察结果');
      planningCurrent(row.epoch,row.serial,row.selected);
      if(row.context.signal.aborted)throw err('E_CANCELLED','网页观察已停止');
      row.settle({decision:'approve',result:receipt});
    })().catch(error=>{
      row.settle({decision:'deny'});
      if(!disposed&&row.epoch===planningGeneration)status(format(error),true);
    });
  }
  async function plan(event) {
    if(!event.isTrusted||busy)return;
    let permission=null,captured=null,frozen;
    try {
      const selected=provider(),request=get('workflow-ai-request').value.trim();
      if(!request)throw err('E_AI_REQUEST','先描述希望自动完成的任务');
      if(!['local_codex','custom_https'].includes(selected))throw err('E_AI_CONFIG','请选择本机 Codex 或自定义 HTTPS 接口');
      if(!get('workflow-ai-consent').checked)throw err('E_AI_CONSENT','请在 AI 设置中同意本次向模型发送的内容');
      frozen={selected,request,workflow:snapshot(),serial:stable(),
        consent:{model:true,workflow:true,observation:selected==='local_codex'&&get('workflow-ai-observe-consent').checked}};
      if(selected==='custom_https') {
        frozen.endpoint=get('workflow-ai-endpoint').value.trim();
        frozen.apiKey=get('workflow-ai-key').value;frozen.model=get('workflow-ai-model').value.trim();
        let url;try{url=new URL(frozen.endpoint);}catch{}
        if(!url||url.protocol!=='https:'||url.username||url.password||url.hash||!frozen.apiKey||!frozen.model)
          throw err('E_AI_CONFIG','请在 AI 设置中填写 HTTPS 接口、模型和本次会话 API Key');
        permission=api.permissions.request({origins:[permissionPattern(frozen.endpoint)]});
      } else if(frozen.consent.observation) {
        captured=currentPageTarget.capture();
        if(captured.origin!==frozen.workflow.siteOrigin)throw err('E_WORKFLOW_ORIGIN','请打开工作流对应网站后启用网页观察');
      }
    }catch(error){
      if(error?.code==='E_AI_CONFIG'||error?.code==='E_AI_CONSENT')openAISettings(
        error.code==='E_AI_CONSENT'?'workflow-ai-consent':provider()==='custom_https'?'workflow-ai-key':'workflow-ai-provider');
      else if(error?.code==='E_AI_REQUEST')get('workflow-ai-request').focus();
      status(format(error),true);return;
    }
    clearSendConsent();
    const epoch=++planningGeneration,abort=new AbortController();planningAbort=abort;
    busy=true;phase='planning';hasError=false;proposal=null;proposalBase=null;proposalSerial=null;
    get('workflow-ai-proposal').hidden=true;get('workflow-ai-progress').hidden=true;
    get('workflow-ai-progress').replaceChildren();
    get('workflow-planning-indicator').textContent=frozen.selected==='local_codex'
      ?'正在连接本机 Codex…':'正在请求所选 HTTPS 模型…';
    appendChat('你',frozen.request);status('');updateButtons();
    let stream='',streamNode=null;
    const progress=event=>{
      planningCurrent(epoch,frozen.serial,frozen.selected);
      const indicator=get('workflow-planning-indicator');
      if(event.type==='turn.started')indicator.textContent='Codex 正在规划…';
      if(event.type==='provider.retry')indicator.textContent='Codex 正在重新连接模型服务…';
      if(event.type==='message.delta'&&typeof event.text==='string') {
        stream=(stream+event.text).slice(-10000);
        if(!/^\s*(?:\{|\[|```)/.test(stream)&&stream.length<=2000) {
          streamNode ||= appendChat('Codex',stream);
          streamNode.textContent=stream;
        }else indicator.textContent='正在接收 Codex 的步骤提议…';
      }
      if(event.type==='message.completed'){stream='';streamNode=null;}
      if(event.type==='plan.updated'&&Array.isArray(event.plan)) {
        const list=get('workflow-ai-progress');list.replaceChildren();
        for(const item of event.plan.slice(0,8)) {
          if(typeof item?.step!=='string')continue;
          const entry=node(doc,'li',item.step.slice(0,250));
          entry.dataset.state=['completed','in_progress','pending'].includes(item.status)?item.status:'pending';
          list.append(entry);
        }
        list.hidden=!list.children.length;
      }
      if(event.type==='tool.request')indicator.textContent=frozen.consent.observation&&event.canApprove===true&&event.tool==='browser.observe'
        ?'Codex 请求查看网页，等待你的本次确认。':'本次工具请求不符合已授权范围，已拒绝。';
      if(event.type==='approval.required')appendChat('本机权限','本次工作流不允许命令行或文件操作，已拒绝该请求。');
      if(event.type==='client.session.restart')appendChat('对话状态',event.text);
    };
    try {
      await aiCleanup.catch(()=>{});planningCurrent(epoch,frozen.serial,frozen.selected);
      let result;
      if(frozen.selected==='local_codex') {
        if(!localPlanner.snapshot().sessionId||!describeLocalCodex(localCapability).ready) {
          localCapability=await localPlanner.probe();updateLocalStatus();
        }
        planningCurrent(epoch,frozen.serial,frozen.selected);
        const readiness=describeLocalCodex(localCapability);
        if(!readiness.ready){openAISettings('workflow-local-refresh');throw err(readiness.state,readiness.message);}
        const target=captured?Object.fromEntries(['windowId','tabId','frameId','documentId','url','origin'].map(key=>[key,captured[key]])):undefined;
        result=await localPlanner.plan({request:frozen.request,workflow:frozen.workflow,consent:frozen.consent,target,
          signal:abort.signal,onEvent:progress,onApproval:(event,context)=>offerObservation(event,context,
            {epoch,serial:frozen.serial,selected:frozen.selected,captured})});
        localCapability={...localCapability,inferenceVerified:localPlanner.snapshot().inferenceVerified};
      } else {
        if(!await permission)throw err('E_AI_PERMISSION','未授权访问模型网站');
        planningCurrent(epoch,frozen.serial,frozen.selected);
        result=await requestWorkflowPlan({endpoint:frozen.endpoint,apiKey:frozen.apiKey,model:frozen.model,
          request:frozen.request,workflow:frozen.workflow,signal:abort.signal});
      }
      planningCurrent(epoch,frozen.serial,frozen.selected);
      appendChat(frozen.selected==='local_codex'?'Codex 建议':'AI 建议',
        result.title+' · '+result.steps.length+' 个语义步骤（仍需检查并运行验证）');
      proposal=result;proposalBase=frozen.workflow.workflowId;proposalSerial=frozen.serial;
      renderProposal(result);get('workflow-ai-proposal').hidden=false;status('');
    }catch(error){if(!disposed&&epoch===planningGeneration)status(
      frozen.selected==='local_codex'?localFailure(error):format(error),true);}
    finally{
      if(epoch===planningGeneration){busy=false;phase='idle';planningAbort=null;pendingApproval?.settle({decision:'deny'});
        get('workflow-ai-progress').hidden=true;if(!disposed){updateLocalStatus();updateButtons();}}
    }
  }
  const observation=createWorkflowObservation({api,host,currentPageTarget,onRunOwner,
    onRunId:id=>{runId=id;if(!disposed)updateButtons();}});
  listen(get('workflow-history-toggle'),'click',()=>{
    const panel=get('workflow-manage-panel');
    panel.hidden=!panel.hidden;
    get('workflow-history-toggle').setAttribute('aria-expanded',String(!panel.hidden));
    if(!panel.hidden) {
      panel.scrollIntoView?.({block:'nearest'});
      get('workflow-saved-list').focus?.({preventScroll:true});
    }
  });
  listen(get('workflow-manage-close'),'click',()=>{
    get('workflow-manage-panel').hidden=true;
    get('workflow-history-toggle').setAttribute('aria-expanded','false');
    get('workflow-history-toggle').focus?.({preventScroll:true});
  });
  listen(get('workflow-provider-toggle'),'click',()=>{
    const settings=get('workflow-provider-settings');
    settings.open=!settings.open;
    get('workflow-provider-toggle').setAttribute('aria-expanded',String(settings.open));
    if(settings.open)get('workflow-ai-provider').focus?.({preventScroll:true});
  });
  listen(get('workflow-provider-settings'),'toggle',()=>{
    get('workflow-provider-toggle').setAttribute('aria-expanded',
      String(get('workflow-provider-settings').open));
    if(get('workflow-provider-settings').open)void refreshLocal();
  });
  listen(get('workflow-ai-provider'),'change',()=>{
    void stopPlanning({close:true}).catch(()=>{});clearSendConsent();
    proposal=null;proposalBase=null;proposalSerial=null;get('workflow-ai-proposal').hidden=true;
    renderProvider();if(get('workflow-provider-settings').open)void refreshLocal();
  });
  for(const id of ['workflow-ai-key','workflow-ai-model','workflow-ai-endpoint'])
    listen(get(id),'input',()=>{clearSendConsent();updateButtons();});
  listen(get('workflow-local-refresh'),'click',event=>{if(event.isTrusted)void refreshLocal();});
  listen(get('workflow-local-help'),'click',event=>{
    if(!event.isTrusted)return;
    void api.tabs.create({url:api.runtime.getURL('native-agent/settings.html')}).catch(error=>status(format(error),true));
  });
  listen(get('workflow-local-connect'),'click',event=>{
    if(!event.isTrusted||localChecking)return;
    // nativeMessaging permission is requested within the actual user gesture.
    let permission;
    try{permission=api.permissions.request({permissions:['nativeMessaging']});}
    catch(error){status(format(error),true);return;}
    localChecking=true;updateLocalStatus();
    (async()=>{
      if(!await permission)throw err('E_PERMISSION_REQUIRED','未允许浏览器连接本机 OpenDesk');
      if(disposed)return;
      localCapability=await client.requestWorkflowAI('ai.connection.enable');
      if(localCapability.nativeConnected&&localCapability.protocolAvailable)localCapability=await localPlanner.probe();
    })().catch(error=>{if(!disposed){localCapability={state:'NATIVE_PERMISSION_REQUIRED',readyForTurn:false};status(format(error),true);}})
      .finally(()=>{localChecking=false;if(!disposed){updateLocalStatus();updateButtons();}});
  });
  listen(get('workflow-ai-cancel'),'click',event=>{
    if(!event.isTrusted||phase!=='planning')return;
    const stopped=stopPlanning(),epoch=planningGeneration;
    void stopped.then(reply=>{
      if(!disposed&&epoch===planningGeneration)status(reply?.terminalStatus==='interrupted'
        ?'已确认本次 AI 回合中断；已发送给模型的内容无法撤回。'
        :reply?.state==='CLOSED'?'已结束旧 AI 会话；下次发送将开始新对话。'
        :reply?.terminalStatus?'本次 AI 回合已结束；已发送给模型的内容无法撤回。'
        :'AI 规划已停止；已发送给模型的内容无法撤回。');
    },error=>{if(!disposed&&epoch===planningGeneration)status(localFailure(error),true);});
  });
  listen(get('workflow-ai-approve'),'click',event=>answerObservation(event,true));
  listen(get('workflow-ai-deny'),'click',event=>answerObservation(event,false));
  listen(get('workflow-ai-new-session'),'click',event=>{
    if(!event.isTrusted||busy)return;
    clearSendConsent();get('workflow-ai-transcript').replaceChildren();
    proposal=null;proposalBase=null;proposalSerial=null;get('workflow-ai-proposal').hidden=true;
    const stopped=stopPlanning({close:true,remember:true}),epoch=planningGeneration;
    void stopped.then(()=>{
      if(disposed||epoch!==planningGeneration)return;updateButtons();status(localPlanner.snapshot().resumable
        ?'下次发送将开始新的 AI 对话；也可恢复本窗口刚结束的对话。'
        :'已结束本机对话。当前 Codex 版本不支持所需的受限恢复，下次发送将开始新对话。');
    },error=>{if(!disposed&&epoch===planningGeneration)status(localFailure(error),true);});
  });
  listen(get('workflow-ai-resume'),'click',event=>{
    if(!event.isTrusted||busy||provider()!=='local_codex')return;
    if(!get('workflow-ai-consent').checked){openAISettings('workflow-ai-consent');status('请先同意恢复本机模型会话，再点击恢复。',true);return;}
    const consent={model:true,workflow:true,observation:get('workflow-ai-observe-consent').checked};
    clearSendConsent();
    const epoch=++planningGeneration,serial=stable(),abort=new AbortController();planningAbort=abort;
    busy=true;phase='planning';get('workflow-planning-indicator').textContent='正在恢复本窗口的 Codex 对话…';updateButtons();
    (async()=>{
      await aiCleanup.catch(()=>{});planningCurrent(epoch,serial,'local_codex');
      await localPlanner.resume({consent,signal:abort.signal});
      planningCurrent(epoch,serial,'local_codex');
      status('已恢复本机对话。继续发送需求即可；本次恢复没有执行网页操作。');
    })().catch(error=>{if(!disposed&&epoch===planningGeneration)status(localFailure(error),true);})
      .finally(()=>{if(epoch===planningGeneration){busy=false;phase='idle';planningAbort=null;if(!disposed)updateButtons();}});
  });
  listen(get('workflow-manual-start'),'click',event=>{
    if(!event.isTrusted)return;
    if(busy||workflow.steps.length>=32)return;
    get('workflow-ai-provider').value='manual';void stopPlanning({close:true}).catch(()=>{});clearSendConsent();renderProvider();
    workflow.steps.push(defaultStep());
    renderSteps();edited();
    const last=get('workflow-steps').lastElementChild;
    if(last){last.open=true;last.querySelector('summary')?.focus?.({preventScroll:true});}
  });
  listen(get('workflow-new'),'click',event=>{
    if(!event.isTrusted||busy&&phase!=='planning')return;
    const dirty=Boolean(workflow.steps.length || proposal ||
      workflow.title!=='新工作流' || workflow.description) && !matchesRevision();
    if(dirty && !globalThis.confirm?.('当前工作流还有未保存的修改，确定新建吗？'))return;
    void stopPlanning({close:true}).catch(()=>{});clearSendConsent();
    workflow=emptyWorkflow(currentOrigin()||'',crypto.randomUUID());
    revision=null;touched=true;proposal=null;proposalBase=null;proposalSerial=null;lastRun='none';hasError=false;phase='idle';
    get('workflow-ai-transcript').replaceChildren();
    get('workflow-ai-proposal').hidden=true;
    get('workflow-manage-panel').hidden=true;
    get('workflow-history-toggle').setAttribute('aria-expanded','false');
    get('workflow-ai-request').value='';
    render();persistDraft();
    status('');
  });
  listen(get('workflow-title'),'input',event=>{workflow.title=event.target.value;edited();});
  listen(get('workflow-description'),'input',event=>{workflow.description=event.target.value;edited();});
  listen(get('workflow-add-step'),'click',()=>{
    if(workflow.steps.length>=32){status('最多 32 个步骤',true);return;}
    workflow.steps.push(defaultStep());renderSteps();edited();
    const last=get('workflow-steps').lastElementChild;
    if(last)last.open=true;
  });
  listen(get('workflow-add-param'),'click',()=>{
    try{
      const name=get('workflow-new-param-name').value.trim();
      if(!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(name) ||
        Object.hasOwn(workflow.paramsSchema.properties,name))
        throw err('E_WORKFLOW_PARAMS','请输入不重复的英文参数名，例如 keyword');
      const next=structuredClone(workflow.paramsSchema);
      next.properties[name]={type:'string',title:name,maxLength:512};
      next.required.push(name);
      workflow.paramsSchema=checkParamsSchema(next);
      get('workflow-new-param-name').value='';
      get('workflow-schema').value=JSON.stringify(next,null,2);
      renderParams();edited();
      status('已添加参数 '+name+'；在填写步骤中填写相同的参数名即可复用');
    }catch(error){status(format(error),true);}
  });
  listen(get('workflow-schema'),'change',event=>{
    try {
      const value=JSON.parse(event.target.value);
      checkParamsSchema(value);workflow.paramsSchema=value;renderParams();edited();
      status('参数定义已更新；请重新检查步骤中的参数引用');
    }catch(error){status('参数定义不合法：'+format(error),true);}
  });
  listen(get('workflow-save'),'click',()=>{void save();});
  listen(get('workflow-run'),'click',run);
  listen(get('workflow-stop'),'click',stop);
  listen(get('workflow-candidate'),'click',()=>{void candidate().catch(error=>status(format(error),true));});
  listen(get('workflow-open-code'),'click',()=>{
    if(!compiled)return;
    try {const applied=openDeveloper(compiled.sourceUtf8);
      Promise.resolve(applied).then(()=>status('代码已复制为独立开发草稿，改动不回写已保存工作流'))
        .catch(error=>status(format(error),true));
    }catch(error){status(format(error),true);}
  });
  listen(get('workflow-refresh'),'click',()=>{void refreshSaved().catch(error=>status(format(error),true));});
  listen(get('workflow-load'),'click',()=>{void loadSaved().catch(error=>status(format(error),true));});
  listen(get('workflow-ai-plan'),'click',plan);
  listen(get('workflow-ai-apply'),'click',event=>{
    if(!event.isTrusted||!proposal||proposalBase!==workflow.workflowId||busy)return;
    if(proposalSerial!==stable()) {status('草稿已改变，请重新生成并检查建议后再采用。',true);return;}
    workflow=structuredClone(proposal);proposal=null;proposalBase=null;proposalSerial=null;
    appendChat('系统','建议步骤已被你采用；可以继续提出修改需求或直接编辑。');
    get('workflow-ai-proposal').hidden=true;render();persistDraft();
    status('已采用 AI 语义步骤；定位仍待真实浏览器检查，保存与运行需要单独操作');
  });
  const unsubscribePage=currentPageTarget?.subscribe(next=>{
    if(disposed)return;
    if(!touched&&!workflow.siteOrigin&&next.status==='available') {
      workflow.siteOrigin=next.origin;render();persistDraft();
    }else{get('workflow-site-note').textContent=next.status==='available'
      ? (next.origin===workflow.siteOrigin?'当前网页符合工作流 origin':'网站不匹配；打开原网页或新建工作流')
      : next.message||'当前网页不可运行';updateButtons();}
  });
  const unsubscribeRun=host.subscribe(()=>{
    if(disposed)return;
    if(runId && host.currentRun!==runId && !busy){runId=null;onRunOwner(null);}
    updateButtons();
  });
  const unsubscribeNative=client.subscribeWorkflowAI?.(state=>{
    if(disposed||!state)return;
    if(state.nativeConnected===false||!state.protocolAvailable)localCapability=state;
    updateLocalStatus();updateButtons();
  });
  (async()=>{
    await currentPageTarget?.ready;
    const key=session();
    if(key){
      const saved=(await api.storage.session.get(key))[key];
      if(!touched&&saved?.format==='opendesk.workflow.v1' &&
        saved.workflowId?.startsWith('wf-') && JSON.stringify(saved).length<50000) {
        // Restored drafts are untrusted until compiler validation at run/save.
        workflow=structuredClone(saved);
        touched=true;render();
      }
    }
    await client.ready;
    await refreshSaved();
    if(!disposed)updateButtons();
  })().catch(error=>status(format(error),true));
  render();renderProvider();status('');
  return {dispose() {
    if(disposed)return;disposed=true;compileToken++;planningGeneration++;
    planningAbort?.abort(err('E_HOST_CLOSED','工作流窗口已关闭'));pendingApproval?.settle({decision:'deny'});
    localPlanner.dispose();void Promise.resolve(observation.dispose()).catch(()=>{});
    unsubscribePage?.();unsubscribeRun?.();unsubscribeNative?.();
    for(const [element,event,fn] of listeners)element.removeEventListener(event,fn);
    listeners.length=0;onRunOwner(null);
    // RunHost is owned and disposed by the existing ScriptEditor, not by this view.
  }};
}
