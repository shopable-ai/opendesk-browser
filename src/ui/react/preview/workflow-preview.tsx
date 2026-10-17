import * as React from 'react';
import {createPortal} from 'react-dom';
import {createRoot} from 'react-dom/client';
import {WorkflowHeader,WorkflowHistory,WorkflowSourceName,WorkflowTranscript,WorkflowSettingsSheet,WorkflowResultText} from '../tabs/workflow.tsx';

// PREVIEW_ADAPTER_NOT_NATIVE: official JSX/DOM, display-only scenarios.
// Never import WorkflowView, chrome.*, Browser SDK, RunHost or a Provider.
const doc=document;
const get=id=>{
  const node=doc.getElementById(id);
  if(!node)throw Error('E_WORKFLOW_PREVIEW_MISSING:'+id);
  return node;
};
const header=doc.querySelector('#workflow-editor .workflow-head-actions');
if(!header)throw Error('E_WORKFLOW_PREVIEW_HEADER');
const transcript=get('workflow-ai-transcript');
const settings=get('workflow-provider-settings');
const sheetHost=get('workflow-settings-react-host');
const historyHost=get('workflow-history-react-host');
const sourceHost=get('workflow-source-react-host');
header.replaceChildren();transcript.replaceChildren();
get('workflow-output').replaceChildren();
const samples=Object.freeze({
  empty:[],
  conversation:[
    {id:'c1',speaker:'你',message:'将姓名改为“给我一个亿的项目”，读回输入框，不提交。'},
    {id:'c2',speaker:'AI',message:'展示真实 React 对话组件；离线预览不读取网页、不执行任务。'}],
  planning:[{id:'p1',speaker:'AI',message:'整理语义步骤中（仅为界面状态演示）。'}],
  approval:[{id:'a1',speaker:'AI',message:'网页摘要需对本轮、指定接收方单独批准。'}],
  unknown:[{id:'u1',speaker:'AI',message:'结果状态未知；不得自动重试网页写入。'}],
  disconnected:[{id:'d1',speaker:'AI',message:'Native/Codex 未连接，正式扩展需真实探测。'}]
});

function Preview(){
  const [scene,setScene]=React.useState('empty');
  const [rows,setRows]=React.useState([]);
  const [width,setWidth]=React.useState(360);
  const [sheetOpen,setSheetOpen]=React.useState(false);
  const [history,setHistory]=React.useState(false);
  const [sourceName,setSourceName]=React.useState('Codex');
  const [review,setReview]=React.useState(false);
  const close=React.useCallback(()=>{
    settings.open=false;
    get('workflow-provider-toggle').setAttribute('aria-expanded','false');
    setSheetOpen(false);
  },[]);
  const choose=next=>{
    if(!Object.hasOwn(samples,next))return;
    setScene(next);setRows(samples[next].map(x=>({...x})));
    setHistory(false);setReview(false);close();
  };
  React.useLayoutEffect(()=>{get('od-workflow-preview-stage').style.width=width+'px';},[width]);
  React.useLayoutEffect(()=>{
    transcript.hidden=rows.length===0;
    get('workflow-chat-intro').hidden=rows.length>0;
    get('workflow-editor').dataset.viewState=rows.length?'conversation':'empty';
    const busy=scene==='planning';
    get('workflow-planning-indicator').hidden=!busy;
    if(busy)get('workflow-planning-indicator').textContent='✦ 示例规划中 · 未连接 Provider';
    get('workflow-ai-plan').hidden=busy;
    get('workflow-ai-cancel').hidden=!busy;
    const progress=get('workflow-ai-progress');
    progress.hidden=!busy;progress.replaceChildren();
    if(busy){const li=doc.createElement('li');li.textContent='示例：等待确认网页范围';progress.append(li);}
    const approval=get('workflow-ai-approval');
    approval.hidden=scene!=='approval';
    get('workflow-ai-approval-scope').textContent=scene==='approval'
      ?'本轮最多 24 项语义节点，仅发送给所选模型（离线示例；实际未发送）':'';
    get('workflow-new-review').hidden=!review;
    get('workflow-editor').dataset.historyOpen=String(history);
    get('workflow-manage-panel').hidden=true;
    get('workflow-result-panel').hidden=scene!=='unknown';
    if(scene==='unknown'){
      get('workflow-technical').textContent='无真实 RunId、ResultId 或 sourceHash。';
    }
    get('workflow-status').hidden=scene!=='disconnected';
    if(scene==='disconnected')get('workflow-status').textContent=
      '离线预览未连接 OpenDesk Native，不能确认 Codex 已就绪。';
  },[scene,rows,history,review]);
  React.useEffect(()=>{
    const provider=get('workflow-ai-provider');
    const sync=()=>{
      const local=provider.value==='local_codex';
      get('workflow-local-settings').hidden=!local;
      get('workflow-custom-settings').hidden=local;
      get('workflow-local-status').textContent='尚未连接 OpenDesk（离线预览，不探测）';
      setSourceName(local?'Codex':get('workflow-ai-model').value.trim());
      get('workflow-observation-scope').textContent=
        '仅演示页面结构；网页摘要授权不持久化、不自动批准。';
    };
    provider.addEventListener('change',sync);
    get('workflow-ai-model').addEventListener('input',sync);sync();
    get('workflow-local-connect').disabled=true;
    get('workflow-observation-revoke').disabled=true;
    const unsub=[];
    const on=(id,type,fn)=>{
      const node=get(id);node.addEventListener(type,fn);
      unsub.push(()=>node.removeEventListener(type,fn));
    };
    on('workflow-provider-toggle','click',event=>{
      if(!event.isTrusted)return;
      settings.open=true;
      get('workflow-provider-toggle').setAttribute('aria-expanded','true');
      setSheetOpen(true);
    });
    on('workflow-ai-plan','click',event=>{
      if(!event.isTrusted)return;
      const field=get('workflow-ai-request');
      const message=field.value.trim();if(!message)return;
      setScene('conversation');
      setRows(current=>[...current,{id:'q'+Date.now(),speaker:'你',message},
        {id:'r'+Date.now(),speaker:'AI',
          message:'这是离线 UI 展示，没有真实连接、权限授权或浏览器运行。'}]);
      field.value='';field.focus({preventScroll:true});
    });
    on('workflow-ai-cancel','click',()=>choose('conversation'));
    on('workflow-ai-deny','click',()=>{
      setScene('conversation');
      setRows(current=>[...current,{id:'deny'+Date.now(),speaker:'AI',
        message:'已拒绝；未发送网页摘要（预览）。'}]);
    });
    on('workflow-ai-approve','click',()=>{
      setScene('conversation');
      setRows(current=>[...current,{id:'grant'+Date.now(),speaker:'AI',
        message:'本轮批准交互示例，实际未发送数据或改变权限。'}]);
    });
    on('workflow-new-cancel','click',()=>setReview(false));
    on('workflow-new-discard','click',()=>{
      setReview(false);setHistory(false);setScene('empty');setRows([]);
      get('workflow-ai-request').value='';
    });
    on('workflow-edit-details','click',event=>{
      if(!event.isTrusted)return;
      setHistory(false);
      get('workflow-manage-panel').hidden=false;
    });
    on('workflow-manage-close','click',()=>{get('workflow-manage-panel').hidden=true;});
    doc.documentElement.dataset.workflowPreviewReady='true';
    Object.defineProperty(window,'__workflowPreviewInfo',{configurable:true,
      value:Object.freeze({sourceBound:true,native:false,provider:false,
        runHost:false,permission:false,realResult:false})});
    return ()=>{
      provider.removeEventListener('change',sync);
      get('workflow-ai-model').removeEventListener('input',sync);
      for(const fn of unsub)fn();
      delete doc.documentElement.dataset.workflowPreviewReady;
      delete window.__workflowPreviewInfo;
    };
  },[]);
  return <>
    {createPortal(<div className="od-workflow-preview-controls">
      <div className="od-workflow-preview-copy">
        <strong>正式 React 同源预览</strong>
        <span>离线 Preview Adapter · 不连接 Provider / Native / RunHost</span>
      </div>
      <label>界面状态
        <select data-preview-scenario value={scene}
          onChange={event=>choose(event.target.value)}>
          <option value="empty">空状态</option>
          <option value="conversation">对话</option>
          <option value="planning">规划中</option>
          <option value="approval">本轮授权</option>
          <option value="unknown">结果未知</option>
          <option value="disconnected">Native 断线</option>
        </select>
      </label>
      <label>宽度
        <select data-preview-width value={width}
          onChange={event=>setWidth(Number(event.target.value))}>
          <option value={360}>360px</option>
          <option value={420}>420px</option>
          <option value={520}>520px</option>
        </select>
      </label>
    </div>,get('od-workflow-preview-controls'))}
    {createPortal(<WorkflowHeader
      model={{saved:false,savedText:'',savedTitle:'',busy:scene==='planning',
        planning:scene==='planning',historyExpanded:history,sessionHint:'保留当前工作流'}}
      actions={{onHistory:()=>setHistory(value=>!value),
        onNewSession:()=>{setRows([]);setScene('empty');setHistory(false);},
        onNewWorkflow:()=>{
          if(rows.length||get('workflow-ai-request').value.trim())setReview(true);
          else {setRows([]);setScene('empty');setHistory(false);}
        }}}/>,header)}
    {createPortal(<WorkflowHistory model={{open:history,rows:[],canResume:false,busy:scene==='planning'}}
      actions={{}}/>,historyHost)}
    {createPortal(<WorkflowSourceName value={sourceName}/>,sourceHost)}
    {createPortal(<WorkflowTranscript rows={rows}/>,transcript)}
    {createPortal(<WorkflowResultText value={scene==='unknown'
      ?'UNKNOWN（模拟 UI 状态）— 未获得持久结果，不能重放。':'尚未运行'}/>,get('workflow-output'))}
    {createPortal(<WorkflowSettingsSheet open={sheetOpen} onClose={close}
      settings={settings} doc={doc}/>,sheetHost)}
  </>;
}
const root=createRoot(get('od-workflow-preview-root'));
root.render(<Preview/>);
window.addEventListener('pagehide',()=>root.unmount(),{once:true});
