import {mountSidebarApp} from '../main.tsx';
import {createWorkflowUIState} from '../../workflow/workflow-ui-state.js';
import {createDeveloperView} from '../../develop-view.js';
import {createMyWorkbenchView} from '../../my-workbench-view.js';
import {createSidebarToolsView} from '../../sidebar-tools-view.js';
import {createPreviewProviderSettings,bindPreviewSettingsViewport} from './shared-ai-preview.js';
import {appendWorkflowSuggestionDraft} from '../../conversation/draft-suggestion.js';
import {createWorkflowPreviewSimulation,PREVIEW_OPERATIONS,PREVIEW_LOCATORS} from './workflow-preview-model.js';

// PREVIEW_ADAPTER_NOT_NATIVE. Product JSX and shared Root own all DOM. Samples
// live only in memory: no Host, Provider, website or synthetic durable receipt.
const doc=document;
doc.documentElement.dataset.opendeskTab='workflow';
const get=id=>{const node=doc.getElementById(id);if(!node)throw Error('E_WORKFLOW_PREVIEW_MISSING:'+id);return node;};
const state=createWorkflowUIState(),control=state.control;
const stage=get('od-workflow-preview-stage');
const releaseSettingsViewport=bindPreviewSettingsViewport(stage);
const selectors={scenario:get('od-workflow-preview-scenario'),width:get('od-workflow-preview-width'),
 theme:get('od-workflow-preview-theme'),auto:get('od-workflow-preview-auto'),pausePlan:get('od-workflow-preview-pause-plan')};
const providerSettings=createPreviewProviderSettings();
let lastHttps='custom_https';
let timer=null,timerPhase='',lastPhase='idle',disposed=false;
const simulation=createWorkflowPreviewSimulation(apply),s=simulation.s;
function cancelTimer(){if(timer!==null)clearTimeout(timer);timer=null;timerPhase='';}
function schedule(){
 const autoRun=s.phase==='idle'&&s.pendingAutoRun&&!selectors.pausePlan.checked;
 const delay=autoRun?3000:{searching:1000,planning:1600,waiting:1800,running:4500,stopping:1600,saving:1000}[s.phase];
 if(!selectors.auto.checked||!delay||s.confirmation){cancelTimer();return;}
 if(timer!==null&&timerPhase===s.phase)return;
 cancelTimer();timerPhase=s.phase;
 timer=setTimeout(()=>{timer=null;timerPhase='';if(autoRun)simulation.action('run');else simulation.advance();},delay);
}
function reveal(id){
 state.setFocus(id);
 requestAnimationFrame(()=>get(id)?.scrollIntoView({block:'nearest'}));
}
function apply(){
 if(disposed)return;
 const busy=s.phase!=='idle',planning=['searching','planning'].includes(s.phase);
 const executing=['waiting','running','stopping'].includes(s.phase);
 const unsafe=['unknown','partial','unverified'].includes(s.outcome);
 const edit=control('workflow-editor');
 edit.dataset.viewState=s.messages.length?'conversation':'empty';edit.dataset.historyOpen=String(s.historyOpen);
 control('workflow-display-title').text=s.title;
 control('workflow-ai-request').value=s.draft;
 control('workflow-ai-progress').hidden=!planning;
 control('workflow-planning-indicator').hidden=!planning;
 control('workflow-planning-indicator').text=planning?(s.phase==='searching'?'查找可复用程序…':'正在理解与规划…'):'';
 control('workflow-ai-plan').hidden=planning||executing;
 control('workflow-ai-plan').disabled=busy||s.sourceState!=='ready'||s.reviewPending||s.historyOpen;
 control('workflow-ai-cancel').hidden=!(planning||executing);
 // Offline gate decisions are presentation samples in the existing feedback
 // projection. They never call the production permission/Host entry points.
 control('workflow-ai-approval').hidden=true;control('workflow-run-review').hidden=true;
 control('workflow-plan-panel').hidden=!s.steps.length;
 control('workflow-params-panel').hidden=!s.params.length;
 control('workflow-manage-panel').hidden=!s.manageOpen;
 control('workflow-result-panel').hidden=!s.outcome;
 control('workflow-output').text=s.outcome?'离线样例状态：'+s.outcome+'；没有真实执行回执。':'尚未运行';
 control('workflow-technical').text='UI_PREVIEW_ONLY · 修订 '+s.revision+'；离线预览不产生 Run ID / Result ID / 源码哈希。未连接模型、Native 或网站。';
 control('workflow-run').hidden=executing||planning||s.historyOpen;
 control('workflow-run').text=s.savedKey&&!s.dirty?'再次运行此版本':'运行当前方案';
 control('workflow-run').disabled=busy||unsafe||Boolean(s.effectFence&&s.steps.some(step=>['fill','click','navigate'].includes(step.op)))||!s.siteMatches;
 control('workflow-save').hidden=executing||planning||s.historyOpen;
 control('workflow-save').disabled=busy||!s.dirty;
 control('workflow-stop').hidden=!executing;
 control('workflow-stop').disabled=s.phase==='stopping';control('workflow-stop').text=s.phase==='stopping'?'停止中…':s.phase==='waiting'?'执行前取消':'停止后续执行';
 control('workflow-status').hidden=!s.error&&!s.notice&&!s.effectFence;
 control('workflow-status').text=[...new Set([s.notice,s.error,s.effectFence?.message].filter(Boolean))].join(' · ');
 control('workflow-status').dataset.state=s.error||s.effectFence?'error':'info';
 control('workflow-title').value=s.title;control('workflow-site').value='https://workflow.example';
 for(const id of ['workflow-description','workflow-schema']){control(id).disabled=true;control(id).title='本离线预览不编辑此高级字段；正式产品保留原能力。';}
 control('workflow-site-note').text='内存样例网站；此 Preview 不访问它。';
 control('workflow-code-hash').text='离线预览不编译业务代码，不产生源码哈希。';
 control('workflow-candidate').disabled=s.dirty||s.bundled;control('workflow-open-code').disabled=true;
 control('workflow-local-status').text='未连接';control('workflow-local-connect').disabled=true;
 control('workflow-observation-revoke').disabled=true;
 selectors.scenario.value=s.scene;
 const bundled=s.bundled?s.rounds.slice(-1).filter(round=>round.bundled&&round.mode==='commerce').flatMap(round=>{const boundary=round.steps.findIndex(step=>step.stepId==='product');return [
  {index:1,origin:'workflow.example · 搜索页（样例）',steps:round.steps.slice(0,boundary<0?round.steps.length:boundary).map(step=>({op:PREVIEW_OPERATIONS.find(x=>x.value===step.op)?.label,target:step.roleName||step.selector}))},
  {index:2,origin:'workflow.example · 详情页（样例）',steps:round.steps.slice(boundary<0?round.steps.length:boundary).map(step=>({op:PREVIEW_OPERATIONS.find(x=>x.value===step.op)?.label,target:step.roleName||step.selector}))}
 ];}):[];
 state.patch({messages:s.messages,phase:planning?'planning':executing?'running':'idle',busy,
  lastRun:s.outcome==='success'?'success':s.outcome==='failure'?'failed':'none',
  progress:planning?[{state:'pending',text:s.phase==='searching'?'查询保存版本与已安装任务（样例）':'整理语义步骤；尚未执行（样例）'}]:[],
  hasSteps:Boolean(s.steps.length),steps:s.steps,params:s.params,operations:PREVIEW_OPERATIONS,locators:PREVIEW_LOCATORS,
  expandStepId:s.expandStepId,siteOrigin:'https://workflow.example',entryMode:'new-workflow',
  feedback:s.feedback?{...s.feedback,actions:s.feedback.actions.map(item=>({...item,disabled:item.disabled||item.id==='run'&&!s.siteMatches}))}:null,confirmation:s.confirmation,bundleSegments:bundled,
  bundleLabel:bundled.length?'以下是上一轮已记录的两段样例结果，按搜索页 → 详情页排列。下方编辑器展示本轮完整方案；修改后不会改写旧结果。':null,
  planLabel:`当前方案 · 第 ${s.round||1} 轮 / 修订 ${s.revision}${s.dirty?' · 未保存更改':''}。执行记录按轮次保留在对话中。`,
  sourceName:providerSettings.settingsSnapshot().source==='local_codex'?'Codex':'离线 HTTPS 样例',
  savedOptions:s.history.map(({key,fullTitle,savedText})=>({value:key,label:fullTitle+' · '+savedText})),
  history:{open:s.historyOpen,rows:s.history,canResume:false,busy},
  header:{saved:Boolean(s.savedKey),savedText:s.dirty?'未保存更改':'已保存',savedTitle:'仅保存在本页内存',
   busy,planning,historyExpanded:s.historyOpen,sessionHint:'新对话，保留当前工作流'}});
 const changedPhase=lastPhase!==s.phase;lastPhase=s.phase;
 if(changedPhase&&s.phase==='idle'&&s.feedback&&!s.confirmation)requestAnimationFrame(()=>{
  if(!doc.activeElement?.matches('textarea,input,select'))get('workflow-feedback').scrollIntoView({block:'nearest'});
 });
 schedule();
}
const requireGesture=event=>event?.isTrusted===true;
const focusAfterAction=id=>{
 if(['edit','params'].includes(id))reveal(id==='edit'?'workflow-plan-panel':'workflow-params-panel');
 else if(id==='modify')state.setFocus('workflow-ai-request');
 else if(id!=='history')reveal('workflow-feedback');
};
const actions={
 onHistory(event){if(!requireGesture(event))return;s.historyOpen=!s.historyOpen;apply();},
 onOpenSavedHistory(key,event){if(requireGesture(event))simulation.openHistory(key);},
 onNewSession(event){if(requireGesture(event)){simulation.newSession();if(!s.confirmation&&!s.historyOpen)state.setFocus('workflow-ai-request');}},
 onNewWorkflow(event){if(requireGesture(event))simulation.newWorkflow();},
 onFeedbackAction(id,event){if(!requireGesture(event))return;simulation.action(id);focusAfterAction(id);},
  onConfirmNavigation(event){if(requireGesture(event)){simulation.confirmNavigation();if(!s.historyOpen&&!s.messages.length)requestAnimationFrame(()=>state.setFocus('workflow-ai-request'));}},
 onCancelNavigation(){simulation.cancelNavigation();},
 input(id,value,event){
  if(!requireGesture(event))return;
  if(id==='workflow-ai-request'){simulation.setDraft(value);control(id).value=value;return;}
  control(id).value=value;
  if(id==='workflow-title')simulation.editTitle(value);
 },
 click(id,event){
  if(!requireGesture(event))return;
  if(id==='workflow-ai-plan'){if(simulation.send())reveal('workflow-feedback');return;}
  if(id==='workflow-ai-cancel'){simulation.action(['waiting','running','stopping'].includes(s.phase)?'stop':'cancel');reveal('workflow-feedback');return;}
  if(id==='workflow-run'){simulation.action('run');reveal('workflow-feedback');return;}
  if(id==='workflow-stop'){simulation.action('stop');reveal('workflow-feedback');return;}
  if(id==='workflow-save'){simulation.save();reveal('workflow-feedback');return;}
  if(id==='workflow-add-step'){simulation.addStep();return;}
  if(id==='workflow-add-param'){simulation.addParam(control('workflow-new-param-name').value.trim());return;}
  if(id==='workflow-edit-details'){s.manageOpen=true;apply();reveal('workflow-manage-panel');return;}
  if(id==='workflow-manage-close'){s.manageOpen=false;apply();reveal('workflow-edit-details');return;}
  if(id==='workflow-load'){simulation.openHistory(control('workflow-saved-list').value);return;}
  if(id==='workflow-refresh'){s.notice='内存版本列表已刷新 · 没有读取安装存储';apply();return;}
  if(id==='workflow-candidate'){simulation.action('handoff');reveal('workflow-feedback');return;}
  if(id==='workflow-source-https'){providerSettings.updateSettings({source:lastHttps});return;}
  if(id==='workflow-source-local'){providerSettings.updateSettings({source:'local_codex'});return;}
 },
 chooseExample(key,event,editDraft){
  if(!requireGesture(event))return;
  const instruction={fill:'请填写姓名为林小满，联系邮箱为 demo@example.test，读回核对，不提交。',
   read:'请只读提取文章标题和正文，检查内容不为空。',check:'请检查表单姓名是否为林小满，不提交。',continue:'请继续修改上次填写内容。'}[key];
  const outcome=appendWorkflowSuggestionDraft(s.draft,instruction);
  if(['filled','appended'].includes(outcome.kind)){editDraft?.(outcome);s.draft=outcome.value;control('workflow-ai-request').value=outcome.value;}
  state.setFocus('workflow-ai-request');return outcome;
 },
 editStep:simulation.editStep,moveStep:simulation.moveStep,removeStep:simulation.removeStep,
 setParam:simulation.setParam,removeParam:simulation.removeParam,parameterizeStep:simulation.parameterizeStep
};
const app=mountSidebarApp(doc,{debugEnabled:true,onNavigate:()=>false,
 developerView:createDeveloperView(),myView:createMyWorkbenchView(),toolView:createSidebarToolsView(),providerSettings});
app.connectWorkflowPage({...state,actions});
const unsubscribeSettings=providerSettings.subscribeSettings(()=>{
 const source=providerSettings.settingsSnapshot().source;if(source!=='local_codex')lastHttps=source;apply();
});
for(const button of doc.querySelectorAll('nav.workbench-nav button'))if(button.dataset.workbenchTab!=='workflow'){
 button.disabled=true;button.setAttribute('aria-disabled','true');
}
selectors.scenario.addEventListener('change',event=>{
 const next=event.target.value;
 simulation.navigate(()=>{cancelTimer();selectors.auto.checked=false;simulation.scene(next);if(next==='settings')app.openProviderSettings();});
 selectors.scenario.value=s.scene;
});
selectors.auto.addEventListener('change',schedule);
selectors.pausePlan.addEventListener('change',schedule);
selectors.width.addEventListener('change',event=>{const width=Number(event.target.value);
 if([320,360,400,420,440,520,640,768,960].includes(width))stage.style.width=width+'px';});
selectors.theme.addEventListener('change',event=>{stage.dataset.previewTheme=event.target.value==='dark'?'dark':'light';});
doc.documentElement.dataset.workflowPreviewReady='true';
Object.defineProperty(window,'__workflowPreviewInfo',{configurable:true,value:Object.freeze({sourceBound:true,native:false,provider:false,
 runHost:false,permission:false,realResult:false})});
simulation.scene('empty');
window.addEventListener('pagehide',()=>{
 disposed=true;cancelTimer();releaseSettingsViewport();unsubscribeSettings();app.dispose();state.dispose();providerSettings.dispose();
 delete doc.documentElement.dataset.workflowPreviewReady;delete window.__workflowPreviewInfo;
},{once:true});
