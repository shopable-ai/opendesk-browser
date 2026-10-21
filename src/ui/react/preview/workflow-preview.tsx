import {mountSidebarApp} from '../main.tsx';
import {createWorkflowUIState} from '../../workflow/workflow-ui-state.js';
import {createDeveloperView} from '../../develop-view.js';
import {createMyWorkbenchView} from '../../my-workbench-view.js';
import {createSidebarToolsView} from '../../sidebar-tools-view.js';

// PREVIEW_ADAPTER_NOT_NATIVE: the production SidebarAppShell/WorkflowPage owns
// the one React root. This adapter is presentation state only: no Host, Provider,
// Browser Authority, permission request, storage or synthetic execution receipt.
const doc=document;
doc.documentElement.dataset.opendeskTab='workflow';
const get=id=>{
  const node=doc.getElementById(id);
  if(!node)throw Error('E_WORKFLOW_PREVIEW_MISSING:'+id);
  return node;
};
const state=createWorkflowUIState(),control=state.control;
const stage=get('od-workflow-preview-stage');
const selectors={
  scenario:get('od-workflow-preview-scenario'),
  width:get('od-workflow-preview-width'),
  theme:get('od-workflow-preview-theme')
};
const scenes=Object.freeze({
  empty:[],
  conversation:[
    {id:'demo-user',speaker:'你',message:'填写姓名为“给我一个亿的项目”，读回并验证，不提交。'},
    {id:'demo-ai',speaker:'AI',message:'这是对话样式示例；未连接模型，也未操作当前网页。'}
  ],
  planning:[{id:'demo-planning',speaker:'AI',message:'预览规划中的界面，未请求模型。'}],
  running:[{id:'demo-running',speaker:'AI',message:'预览运行中的界面，未启动 RunHost。'}],
  success:[
    {id:'demo-success-user',speaker:'你',message:'修改输入框并读回。'},
    {id:'demo-success',speaker:'执行结果',message:'成功结果的展示示例；没有真实 DOM 读回。'}
  ],
  failure:[{id:'demo-failure',speaker:'系统',message:'演示：操作失败，未将结果当成成功。'}],
  unknown:[{id:'demo-unknown',speaker:'系统',message:'结果未知：核对目标网页后再操作，不自动重试。'}],
  approval:[{id:'demo-approval',speaker:'AI',message:'网页摘要授权界面预览；未读取或发送页面内容。'}],
  denied:[{id:'demo-denied',speaker:'系统',message:'演示：授权已拒绝，未执行网页读取。'}],
  disconnected:[{id:'demo-disconnected',speaker:'系统',message:'本机连接不可用，请在正式扩展中检查连接。'}],
  history:[],
  settings:[]
});
let scene='empty',messages=[],historyOpen=false,review=false,source='local_codex';
let lastHttps='custom_https';
const sample=x=>scenes[x].map(row=>({...row}));
const apply=()=>{
  const busy=scene==='planning',running=scene==='running';
  const result=['success','failure','unknown'].includes(scene);
  const local=source==='local_codex';
  const hasRows=messages.length>0;
  const edit=control('workflow-editor');
  edit.dataset.viewState=hasRows?'conversation':'empty';
  edit.dataset.historyOpen=String(historyOpen);
  control('workflow-chat-intro').hidden=hasRows||busy;
  control('workflow-ai-title').text='创建新工作流';
  control('workflow-intro-description').text='描述要自动执行的任务，或选择示例。';
  control('workflow-ai-progress').hidden=!busy;
  control('workflow-planning-indicator').hidden=!busy;
  control('workflow-planning-indicator').text=busy?'正在规划步骤…':'';
  control('workflow-ai-approval').hidden=scene!=='approval';
  control('workflow-ai-approval-title').text='允许本轮网页任务？';
  control('workflow-ai-approval-scope').text=scene==='approval'
    ?'当前仅为授权界面预览，不会实际发送网页摘要。':'';
  control('workflow-ai-plan').hidden=busy;
  control('workflow-ai-plan').disabled=busy;
  control('workflow-ai-cancel').hidden=!busy;
  control('workflow-new-review').hidden=!review;
  control('workflow-plan-panel').hidden=true;
  control('workflow-params-panel').hidden=true;
  control('workflow-manage-panel').hidden=true;
  control('workflow-result-panel').hidden=!result;
  control('workflow-output').text=scene==='success'
    ?'结果示例：已完成填写与读回（仅演示 UI，未实际执行）。'
    :scene==='failure'?'演示：任务失败，未核实网页写入结果。'
    :scene==='unknown'?'结果未知；请先检查当前网页，不要自动重试。':'尚未运行';
  control('workflow-technical').text='离线预览不产生 Run ID / Result ID / Revision。';
  control('workflow-status').hidden=!['failure','disconnected','denied'].includes(scene);
  control('workflow-status').text=scene==='failure'?'演示：任务失败。'
    :scene==='disconnected'?'本机连接未建立。'
    :scene==='denied'?'已拒绝本轮演示授权。':'';
  control('workflow-status').dataset.state=scene==='failure'?'error':'info';
  control('workflow-ai-provider').value=source;
  control('workflow-https-protocol').value=local?lastHttps:source;
  control('workflow-https-mode').hidden=local;
  control('workflow-local-settings').hidden=!local;
  control('workflow-custom-settings').hidden=local;
  control('workflow-local-status').text='未连接';
  control('workflow-local-status').title='本机连接未建立';
  control('workflow-local-status').dataset.state='DISCONNECTED';
  control('workflow-local-status-detail').text='请在正式安装的 OpenDesk 扩展中连接本机应用。';
  control('workflow-local-connect').disabled=true;
  control('workflow-local-connect').title='离线预览无法连接本机应用';
  control('workflow-local-connected').hidden=true;
  control('workflow-observation-revoke').disabled=true;
  control('workflow-observation-scope').text='网页摘要仅在正式任务经明确授权后发送。';
  control('workflow-provider-settings').open=scene==='settings'||control('workflow-provider-settings').open;
  state.patch({
    messages:messages.map(row=>({...row})),
    phase:busy?'planning':running?'running':'idle',
    lastRun:scene==='success'?'success':scene==='failure'?'failed':'none',
    progress:busy?[{state:'pending',text:'等待确认网页范围（预览）'}]:[],
    entryMode:'new-workflow',
    sourceName:local?'Codex':control('workflow-ai-model').value.trim(),
    hasSteps:false,steps:[],params:[],
    history:{open:historyOpen,rows:[],canResume:false,busy},
    header:{saved:false,busy,planning:busy,historyExpanded:historyOpen,
      sessionHint:'保留当前工作流'}
  });
};
function showScene(next,{keepRows=false}={}){
  if(!Object.hasOwn(scenes,next))return;
  scene=next;if(!keepRows)messages=sample(next);
  historyOpen=next==='history';review=false;
  control('workflow-provider-settings').open=next==='settings';
  selectors.scenario.value=next;
  apply();
}
function chooseProvider(next){
  if(!['local_codex','custom_https','cloud_responses'].includes(next))return;
  source=next;if(next!=='local_codex')lastHttps=next;
  apply();
}
function closeSettings(){
  control('workflow-provider-settings').open=false;
  if(scene==='settings')scene='empty';
  selectors.scenario.value=scene;
  apply();
}
const requireGesture=event=>event?.isTrusted===true;
const actions={
  onHistory(event){
    if(!requireGesture(event))return;
    historyOpen=!historyOpen;scene=historyOpen?'history':'empty';
    selectors.scenario.value=scene;apply();
  },
  onNewSession(event){
    if(!requireGesture(event))return;
    scene='empty';messages=[];historyOpen=false;review=false;
    selectors.scenario.value=scene;apply();state.setFocus('workflow-ai-request');
  },
  onNewWorkflow(event){
    if(!requireGesture(event))return;
    if(messages.length||control('workflow-ai-request').value.trim()){review=true;apply();}
    else actions.onNewSession(event);
  },
  input(id,value,event){
    if(!requireGesture(event))return;
    if(id==='workflow-https-protocol'){chooseProvider(value);return;}
    control(id).value=value;
    if(id==='workflow-ai-model'&&source!=='local_codex')apply();
  },
  click(id,event){
    if(!requireGesture(event))return;
    if(id==='workflow-provider-toggle'){
      control('workflow-provider-settings').open=true;apply();return;
    }
    if(id==='workflow-source-local'){chooseProvider('local_codex');return;}
    if(id==='workflow-source-https'){chooseProvider(lastHttps);return;}
    if(id==='workflow-new-cancel'){review=false;apply();state.setFocus('workflow-new');return;}
    if(id==='workflow-new-discard'){
      messages=[];control('workflow-ai-request').value='';review=false;
      showScene('empty');state.setFocus('workflow-ai-request');return;
    }
    if(id==='workflow-ai-plan'){
      const request=control('workflow-ai-request').value.trim();
      if(!request)return;
      control('workflow-ai-request').value='';
      messages=[...messages,{id:'preview-u-'+messages.length,speaker:'你',message:request},
        {id:'preview-a-'+messages.length,speaker:'系统',
          message:'离线预览未连接 Provider / RunHost，未执行浏览器任务。'}].slice(-24);
      showScene('conversation',{keepRows:true});state.setFocus('workflow-ai-request');return;
    }
    if(id==='workflow-ai-cancel'){
      messages=[...messages,{id:'preview-stop-'+messages.length,speaker:'系统',
        message:'已结束预览中的规划状态，未发生真实执行。'}];
      showScene('conversation',{keepRows:true});return;
    }
    if(id==='workflow-ai-approve'||id==='workflow-ai-deny'){
      messages=[...messages,{id:'preview-grant-'+messages.length,speaker:'系统',
        message:id==='workflow-ai-deny'?'预览中已拒绝授权，未读取网页。'
          :'授权按钮仅演示状态，不会发出真实网页摘要。'}];
      showScene('conversation',{keepRows:true});return;
    }
    if(id==='workflow-edit-details'){
      control('workflow-manage-panel').hidden=false;return;
    }
    if(id==='workflow-manage-close'){
      control('workflow-manage-panel').hidden=true;return;
    }
  },
  chooseExample(key,event){
    if(!requireGesture(event))return;
    control('workflow-ai-request').value={
      fill:'请填写表单并读回（预览不会执行）',read:'请只读提取网页信息（预览不会执行）',
      continue:'请继续修改上次填写内容',check:'请检查当前网页'
    }[key]||'';
    state.setFocus('workflow-ai-request');
  },
  closeSettings
};
const app=mountSidebarApp(doc,{debugEnabled:true,onNavigate:()=>false,
  developerView:createDeveloperView(),myView:createMyWorkbenchView(),
  toolView:createSidebarToolsView()});
app.connectWorkflowPage({...state,actions});
for(const button of doc.querySelectorAll('nav.workbench-nav button')){
  if(button.dataset.workbenchTab!=='workflow'){
    button.disabled=true;button.setAttribute('aria-disabled','true');
  }
}
selectors.scenario.addEventListener('change',event=>showScene(event.target.value));
selectors.width.addEventListener('change',event=>{
  const width=Number(event.target.value);
  if([320,360,400,440,520].includes(width))stage.style.width=width+'px';
});
selectors.theme.addEventListener('change',event=>{
  stage.dataset.previewTheme=event.target.value==='dark'?'dark':'light';
});
doc.documentElement.dataset.workflowPreviewReady='true';
Object.defineProperty(window,'__workflowPreviewInfo',{configurable:true,
  value:Object.freeze({sourceBound:true,native:false,provider:false,
    runHost:false,permission:false,realResult:false})});
showScene('empty');
window.addEventListener('pagehide',()=>{
  app.dispose();state.dispose();
  delete doc.documentElement.dataset.workflowPreviewReady;
  delete window.__workflowPreviewInfo;
},{once:true});
