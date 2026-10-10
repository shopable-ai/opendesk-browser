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
  let proposal=null,proposalBase=null,touched=false,saveList=[],draftWrites=Promise.resolve();
  let phase='idle',lastRun='none',hasError=false;
  let workflow=emptyWorkflow(currentPageTarget?.snapshot?.origin || '',crypto.randomUUID());
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
    const ready=Boolean(get('workflow-ai-key').value.trim() && get('workflow-ai-model').value.trim());
    const mode=deriveWorkflowViewState({phase,proposal:Boolean(proposal),hasSteps,
      saved:Boolean(matchesRevision()),lastRun,error:hasError,providerReady:ready});
    get('workflow-editor').dataset.viewState=mode;
    get('workflow-plan-panel').hidden=!hasSteps;
    get('workflow-params-panel').hidden=!hasSteps || (!hasParams && !hasActions);
    get('workflow-run-consent').hidden=!hasActions;
    get('workflow-result-panel').hidden=lastRun==='none';
    get('workflow-chat-intro').hidden=hasSteps || hasMessages || Boolean(proposal) || phase==='planning';
    transcript.hidden=!hasMessages;
    get('workflow-planning-indicator').hidden=phase!=='planning';
    get('workflow-dock').dataset.empty=String(!hasSteps);
    get('workflow-display-title').textContent=hasSteps && workflow.title!=='新工作流'
      ?workflow.title:'AI 工作流';
    const origin=currentOrigin();
    get('workflow-head-site').textContent=origin
      ?'当前网页 · '+new URL(origin).host:'打开 HTTP(S) 网页后可运行';
    get('workflow-provider-summary').textContent=ready?'已填写模型信息':'AI 未配置';
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
    get('workflow-ai-plan').disabled=busy;
    get('workflow-saved-state').textContent=revision?
      (matchesRevision()?'已保存 · r' + revision.revision:'已修改 · r' + revision.revision + ' 为旧版本'):'草稿 · 未安装';
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
    touched=true;proposal=null;proposalBase=null;get('workflow-ai-proposal').hidden=true;
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
    get('workflow-params-empty').hidden=parent.childElementCount>0;
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
  function renderSteps() {
    const parent=get('workflow-steps');parent.replaceChildren();
    get('workflow-step-count').textContent=workflow.steps.length + ' 步';
    if(!workflow.steps.length)parent.append(node(doc,'p','暂无步骤。添加“观察页面”或“填写内容”开始创建。','hint'));
    workflow.steps.forEach((step,index)=>{
      const details=node(doc,'details',undefined,'workflow-step');
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
        renderSteps();edited();
      });
      if(['fill','click','wait','extract','assert'].includes(step.op)) {
        labelSelect(doc,body,'定位方法',step.locatorKind,WORKFLOW_LOCATORS.map(k=>[k,
          {css:'CSS 选择器',role:'ARIA 角色',label:'标签文字',text:'文本',testId:'Test ID'}[k]]),value=>{
          step.locatorKind=value;renderSteps();edited();
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
          renderSteps();edited();
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
    const clean=validateWorkflow(record.workflow);
    const compile=await compileWorkflow(clean);
    const saved=await host.controller.getControllerScript({scriptId:clean.workflowId,revision:record.revision});
    if(saved?.contentHash!==compile.sourceHash || saved.sourceUtf8!==compile.sourceUtf8 ||
      record.sourceHash!==compile.sourceHash)
      throw err('E_WORKFLOW_HASH','语义定义与持久 JavaScript 版本不一致，拒绝运行');
    workflow=clean;
    revision=record;touched=true;proposal=null;proposalBase=null;lastRun='none';hasError=false;
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
    if(!result){get('workflow-output').textContent='后台尚无可核对的 Durable Result；未知状态不得自动重放。';return;}
    if(!result.outcome?.ok) {
      get('workflow-output').textContent=formatTaskError(result.outcome?.error||{code:'E_WORKFLOW_RUN'});
      return;
    }
    try {
      const value=decodeValue(result.outcome.valueWire),presented=presentTaskValue(value);
      get('workflow-output').textContent=presented.text;
      if(presented.redacted||presented.truncated){
        raw.textContent=formatRunValue(value);reveal.hidden=false;
      }
    }catch(error){get('workflow-output').textContent='持久结果解码失败：'+format(error);}
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
      else status('运行已交由 Controller 持久记录；结果以重新读取的 Durable Result 为准');
      const view=await host.controller.snapshotControllerRun({runId:claim.runId});
      if(!disposed) {
        resultDisplay(claim.runId,view);
        const result=view?.results?.find(row=>row.runId===claim.runId);
        lastRun=completed?.state==='paused_unknown'||completed?.pendingSettlement||!result?.outcome?.ok
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
    for(const [index,step] of result.steps.entries()) {
      const item=node(doc,'li');
      item.append(node(doc,'strong',OP_LABELS[step.op]||step.op));
      const hint=step.param?'使用参数 '+step.param:
        step.op==='navigate'?'在已授权的相同网站内跳转':
        step.locatorKind==='role' && step.roleName?step.roleName:
        step.selector?'定位元素（需实际网页检查）':'无网页写入操作';
      item.append(node(doc,'span',hint));preview.append(item);
    }
  }
  async function plan(event) {
    if(!event.isTrusted||busy)return;
    let permission,endpoint,request;
    try {
      endpoint=get('workflow-ai-endpoint').value.trim();
      request=get('workflow-ai-request').value.trim();
      if(!request)throw err('E_AI_REQUEST','先描述希望自动完成的任务');
      if(!get('workflow-ai-consent').checked)
        throw err('E_AI_CONSENT','先在 AI 设置中同意向模型服务发送需求和步骤');
      if(!get('workflow-ai-key').value)throw err('E_AI_CONFIG','请在 AI 设置中填写本次会话的 API Key');
      permission=api.permissions.request({origins:[permissionPattern(endpoint)]});
    }catch(error){
      if(error?.code==='E_AI_CONFIG'||error?.code==='E_AI_CONSENT'){
        get('workflow-provider-settings').open=true;
        get('workflow-provider-toggle').setAttribute('aria-expanded','true');
        (error.code==='E_AI_CONFIG'?get('workflow-ai-key'):get('workflow-ai-consent')).focus();
      }else if(error?.code==='E_AI_REQUEST')get('workflow-ai-request').focus();
      status(format(error),true);return;
    }
    busy=true;phase='planning';hasError=false;proposal=null;
    get('workflow-ai-proposal').hidden=true;
    updateButtons();
    const original=snapshot(),startSerial=stable();
    status('正在请求真实 AI Provider；没有配置时不会生成模拟规划');
    try {
      if(!await permission)throw err('E_AI_PERMISSION','未授权访问模型网站');
      const result=await requestWorkflowPlan({endpoint,
        apiKey:get('workflow-ai-key').value,model:get('workflow-ai-model').value.trim(),
        request,workflow:original});
      if(disposed)return;
      if(startSerial!==stable())throw err('E_WORKFLOW_STALE','AI 规划期间草稿已被修改，请重新发起规划');
      appendChat('你',request);
      appendChat('AI 建议',result.title+' · '+result.steps.length+' 个语义步骤（定位与副作用尚未经验证）');
      proposal=result;proposalBase=original.workflowId;
      renderProposal(result);
      get('workflow-ai-proposal').hidden=false;
      status('AI 已返回通过 Schema 校验的建议；未验证网页定位，需用户检查并明确采用');
    }catch(error){status(format(error),true);}
    finally{busy=false;phase='idle';updateButtons();}
  }
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
    if(settings.open)get('workflow-ai-key').focus?.({preventScroll:true});
  });
  listen(get('workflow-provider-settings'),'toggle',()=>{
    get('workflow-provider-toggle').setAttribute('aria-expanded',
      String(get('workflow-provider-settings').open));
  });
  listen(get('workflow-ai-key'),'input',updateButtons);
  listen(get('workflow-manual-start'),'click',()=>{
    if(busy||workflow.steps.length>=32)return;
    workflow.steps.push(defaultStep());
    renderSteps();edited();
    const last=get('workflow-steps').lastElementChild;
    if(last){last.open=true;last.querySelector('summary')?.focus?.({preventScroll:true});}
  });
  listen(get('workflow-new'),'click',()=>{
    if(busy)return;
    workflow=emptyWorkflow(currentOrigin()||'',crypto.randomUUID());
    revision=null;touched=true;proposal=null;proposalBase=null;lastRun='none';hasError=false;phase='idle';
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
  listen(get('workflow-ai-apply'),'click',()=>{
    if(!proposal||proposalBase!==workflow.workflowId||busy)return;
    workflow=structuredClone(proposal);proposal=null;proposalBase=null;
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
  render();status('');
  return {dispose() {
    if(disposed)return;disposed=true;compileToken++;
    unsubscribePage?.();unsubscribeRun?.();
    for(const [element,event,fn] of listeners)element.removeEventListener(event,fn);
    listeners.length=0;onRunOwner(null);
    // RunHost is owned and disposed by the existing ScriptEditor, not by this view.
  }};
}
