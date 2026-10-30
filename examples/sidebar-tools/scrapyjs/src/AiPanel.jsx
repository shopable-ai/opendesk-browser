import * as React from 'react';
import {Button,SharedConversationFrame,createConversationSession} from '@opendesk/ui';
import {localRunnerInstructions,parseProposal,changes,sameConfig} from './ai-config.js';
import {createAiRequest,requireGeneration} from './ai-request.js';
import {createAiPending} from './ai-pending.js';
import {configKey} from './local-runner-client.js';
import './local-runner.css';

const noop=()=>{};
const format=value=>value===undefined?'（无）':typeof value==='string'?value:JSON.stringify(value,null,2);
function Difference({row}){return <li><strong>{row.kind} · {row.key}</strong>{row.kind!=='保留'&&<div className="ai-before-after"><div>原值<pre>{format(row.before)}</pre></div><div>新值<pre>{format(row.after)}</pre></div></div>}</li>;}
export default function AiPanel({open=true,state,locked,pending,valid,onApply,onClose,onBusy=noop,onDirty=noop,onGenerating=noop,onPreview=async()=>false,onInvalidate=noop,runnerBusy=false,runnerActive=false,runnerRun=null,runnerError=''}){
  const tool=globalThis.OpenDeskTool;
  const [chat]=React.useState(()=>createConversationSession({identity:{consumerId:'scrapyjs-config',
    instanceId:crypto.randomUUID(),hostInstanceId:'sandbox-presentation'}}));
  const conversation=React.useSyncExternalStore(chat.subscribe,chat.getSnapshot);
  const requirement=conversation.draft;
  const setRequirement=value=>chat.update({draft:value});
  const append=(speaker,message)=>chat.append(speaker,message);
  const [correction,setCorrection]=React.useState('');
  const [targetUrl,setTargetUrl]=React.useState(()=>state.target?.url||state.config.url);
  const [inputRevision,setInputRevision]=React.useState(0);
  const [sample,setSample]=React.useState('');
  const [usePage,setUsePage]=React.useState(false);
  const [useConfig,setUseConfig]=React.useState(true);
  const [recipient,setRecipient]=React.useState(null);
  const [working,setWorking]=React.useState(false);
  const [draft,setDraft]=React.useState(null);
  const [error,setError]=React.useState('');
  const [notice,setNotice]=React.useState('');
  const [unknown,setUnknown]=React.useState(false);
  const [exporting,setExporting]=React.useState(false);
  const [requestContext,setRequestContext]=React.useState(null);
  const [pendingId,setPendingId]=React.useState(null);
  const [pendingReady,setPendingReady]=React.useState(false);
  const pendingIdentity=React.useMemo(()=>createAiPending((op,args)=>tool.request(op,args)),[tool]);
  const [processedInput,setProcessedInput]=React.useState('');
  const exportPending=React.useRef(false);
  const active=React.useRef(null),alive=React.useRef(true);
  const targetTouched=React.useRef(false);
  const blocked=Boolean(locked||pending||!valid);
  const inputKey=configKey({requirement,correction,sample,usePage,useConfig,targetUrl,inputRevision});
  const binding=configKey({inputKey,config:state.config,epoch:state.profileEpoch,target:state.target?.url||null});
  const latestBinding=React.useRef(binding);latestBinding.current=binding;
  const foregroundBusy=working;
  const previousError=JSON.stringify({ai:error||null,configuration:state.error||null,runner:runnerError||null,
    originalRun:runnerRun?{runId:runnerRun.runId,status:runnerRun.status,errors:runnerRun.errors,stopReason:runnerRun.stopReason,
      pagesVisited:runnerRun.pagesVisited,recordsCount:runnerRun.recordsCount,completeness:runnerRun.completeness}:null});
  let targetValid=false;
  try{const url=new URL(targetUrl);targetValid=['http:','https:'].includes(url.protocol)&&!url.username&&!url.password;}catch{}
  React.useEffect(()=>()=>chat.dispose(),[chat]);
  React.useEffect(()=>{
    let current=true;
    pendingIdentity.read().then(({value})=>{if(!current)return;setPendingReady(true);if(value){setPendingId(value.requestId);setUnknown(true);setWorking(true);setNotice('存在未决原请求，请查询 / 停止原请求；不会重新发送。');}}).catch(e=>{if(current)setError(e.message);});
    return()=>{current=false;};
  },[pendingIdentity]);
  React.useEffect(()=>{onBusy(foregroundBusy);},[foregroundBusy,onBusy]);
  React.useEffect(()=>{onGenerating(working&&!unknown);},[working,unknown,onGenerating]);
  React.useEffect(()=>{onDirty(Boolean(draft)||(Boolean(requirement||correction||sample||targetTouched.current)&&inputKey!==processedInput));},[requirement,correction,sample,draft,inputKey,processedInput,onDirty]);
  React.useEffect(()=>{onInvalidate();},[binding,onInvalidate]);
  React.useEffect(()=>{if(!targetTouched.current)setTargetUrl(state.target?.url||state.config.url);},[state.target?.url,state.config.url]);
  React.useEffect(()=>{
    alive.current=true;
    tool.request('ai.info',{}).then(info=>{if(alive.current)setRecipient(info);}).catch(e=>{if(alive.current)setError(e.message);});
    return()=>{alive.current=false;active.current?.cancel({release:false}).catch(()=>{});};
  },[tool]);
  function editInput(setter,value){setInputRevision(n=>n+1);onInvalidate();setter(value);}
  async function generate(){
    if(active.current||working||unknown||!pendingReady||pendingId||runnerActive||runnerBusy||blocked||!recipient||!requirement.trim()||!usePage||!targetValid)return;
    const id=crypto.randomUUID(),base=structuredClone(state.config),epoch=state.profileEpoch;
    const page={title:state.target?.url===targetUrl?state.target.title:'用户指定目标',url:new URL(targetUrl).href};
    const generationInput=binding;
    const context={page,currentConfig:useConfig?base:{url:page.url,itemConfig:{title:'.::text'}},sample,previousError};
    const operation=createAiRequest((op,args)=>tool.request(op,args),{requestId:id,
      request:requirement.trim()+(correction.trim()?'\n\n本次纠正（保留以上原始需求）：\n'+correction.trim():''),instructions:localRunnerInstructions,
      context},setRecipient,pendingIdentity);
    append('你',requirement.trim()+(correction.trim()?'\n\n本次纠正：'+correction.trim():''));
    setRequestContext(context);setPendingId(id);
    active.current=operation;setWorking(true);setUnknown(false);setError('');setNotice('正在等待可信发送审阅与真实 AI 返回…');
    try{
      const result=await operation.run();
      if(!alive.current||active.current!==operation)return;
      if(!result){setNotice('原 AI 请求已结束；停止后返回的内容未应用。');return;}
      const config=parseProposal(result.proposal,value=>globalThis.ScrapyAppModel.validateConfig(value,{runtime:'local'}),page.url);
      if(generationInput!==latestBinding.current){setNotice('生成期间输入、原配置或网页已变化，返回内容未应用；原试采仍保留。');return;}
      // onApply's page is the captured workspace target used by its existing stale guard.
      // The user-entered target belongs to the proposal and the AI context, not that guard.
      const sourcePage={url:state.target?.url,title:state.target?.title};
      const next={config,base,epoch,page:sourcePage,input:inputKey,binding:generationInput,requestId:id,generation:result.providerGeneration,metadata:result.metadata};
      setDraft(next);
      const summary=changes(base,config).fields.filter(row=>row.kind!=='保留').map(row=>row.kind+' '+row.key).join('、');
      append('助手','配置提案已通过格式与目标校验'+(summary?'：'+summary:'')+'。正在进行所选页数的试采；尚未保存或启动长任务。');
      setNotice('AI 配置校验通过，正在交给采集工作区试采；不会自动开始长任务。');
      const started=await onPreview(config);
      if(alive.current&&!started)setNotice('AI 配置草稿已保留；试采未确认，请查看运行错误。仍可审阅并应用配置草稿。');
    }catch(e){if(alive.current&&active.current===operation){setError(e.message);append('系统',e.message);if(operation.unknown){setUnknown(true);setNotice('原 AI 请求结果未知，暂不允许重新生成。请查询 / 停止原请求；有效试采与已有配置已保留。');
      if(!operation.dispatched){try{const {value}=await pendingIdentity.read();if(alive.current&&active.current===operation&&value&&value.requestId!==operation.id){active.current=null;setPendingId(value.requestId);}}catch{}}
      return;}setNotice(e.code==='E_CANCELLED'?'本次发送已取消；输入、有效试采与原配置已保留。':'生成或配置校验失败；输入、有效试采与原配置已保留。');}}
    finally{if(alive.current&&active.current===operation&&!operation.unknown){active.current=null;setPendingId(null);setWorking(false);}}
  }
  async function cancel(){
    if(!active.current&&!pendingId)return;
    const operation=active.current;setNotice('正在停止原 AI 请求…');
    try{
      const reply=operation?await operation.cancel():await tool.request('ai.cancel',{requestId:pendingId});
      if(!operation&&(reply?.requestId!==pendingId||!['cancelled','completed','failed','unknown'].includes(reply.state)))throw Error('停止回执身份或状态无效，原请求仍在等待确认。');
      if(alive.current&&active.current===operation){
        if(operation&&!operation.dispatched&&!operation.settled){setNotice('已请求取消准备；等待原运行结束，未解除围栏。');return;}
        if(['cancelled','completed','failed'].includes(reply.state)){
          if(!operation)await pendingIdentity.clear(pendingId);
          if(!alive.current||active.current!==operation)return;
          active.current=null;setPendingId(null);setWorking(false);setUnknown(false);append('系统','原 AI 请求已确认结束；停止后内容未应用。');setNotice(reply.state==='cancelled'?'已确认停止原 AI 请求；未应用配置。':'原 AI 请求已结束；停止后内容未应用。');
        }else{setUnknown(true);setNotice('停止结果尚未确认，请查询 / 停止原请求；返回内容不会应用。');}
      }
    }
    catch(e){if(alive.current&&active.current===operation){setError(e.message);setUnknown(true);setNotice('停止结果尚未确认，请查询 / 停止原请求。');}}
  }
  const stale=Boolean(draft&&(draft.binding!==binding||draft.epoch!==state.profileEpoch||!sameConfig(draft.base,state.config)));
  async function apply(){
    if(!draft||blocked||stale||working||unknown||pendingId||!pendingReady||runnerBusy)return;
    setWorking(true);setError('');
    try{const current=await tool.request('ai.info',{});if(requireGeneration(current.generation)!==requireGeneration(draft.generation))throw Error('AI Provider 已变化，请重新生成。');
      if(draft.binding!==latestBinding.current)throw Error('输入或原配置已变化，请重新生成。');
      onApply(draft.config,draft.base,draft.epoch,draft.page);setDraft(null);onInvalidate();setProcessedInput(inputKey);setNotice('已应用为未保存配置草稿；配置变更使试采认证失效。');}
    catch(e){setError(e.message);}finally{if(alive.current)setWorking(false);}
  }
  async function exportDraft(){
    if(exportPending.current||!draft)return;exportPending.current=true;setExporting(true);setError('');
    try{const result=await tool.request('browser.downloads.text',{text:JSON.stringify(draft.config,null,2),filename:'scrapyjs-ai-config.json'});if(result?.started!==true)throw Error('下载结果未知');if(alive.current)setNotice('已请求下载配置 JSON，请在下载列表确认。');}
    catch(e){if(alive.current)setError(e.message);}finally{exportPending.current=false;if(alive.current)setExporting(false);}
  }
  const diff=draft?changes(draft.base,draft.config):null;
  const editingLocked=working&&!unknown||runnerBusy;
  const displayedContext=working&&requestContext?requestContext:{page:{title:state.target?.title,url:targetUrl},
    currentConfig:useConfig?state.config:{url:targetUrl,itemConfig:{title:'.::text'}},sample,previousError};
  const nextPage=editingLocked&&requestContext?requestContext.page:{title:state.target?.title,url:targetUrl};
  return <section className="ai-workspace scrapy-local-runner" aria-labelledby="ai-heading">
    <div className="toolbar"><h2 id="ai-heading" tabIndex={-1}>AI 采集工作台</h2><Button id="close-ai" disabled={working&&!unknown||runnerBusy} onClick={onClose}>收起 AI 助手</Button></div>
    <p className="secondary">描述需求 → 审阅 AI 发送资料 → 试采 → 核对结果并确认长任务。</p>
    <div className="runner-inputs">
      <label htmlFor="ai-correction">独立纠正要求（保留原始需求）</label><textarea id="ai-correction" rows={2} maxLength={900} disabled={editingLocked} value={correction} placeholder="根据试采结果补充，例如：价格为空，请纠正选择器。" onChange={e=>editInput(setCorrection,e.target.value)}/>
      <label htmlFor="ai-target-url">目标 URL</label><input id="ai-target-url" type="url" autoComplete="off" value={targetUrl} disabled={editingLocked} aria-invalid={!targetValid} onChange={e=>{targetTouched.current=true;editInput(setTargetUrl,e.target.value);}}/>
    </div>
    <fieldset disabled={editingLocked}><legend>{editingLocked?'本次发送的资料':'下次待发送的资料'} · 发送前由可信 Host 审阅</legend>
      <label className="check"><input type="checkbox" id="ai-use-page" checked={usePage} onChange={e=>editInput(setUsePage,e.target.checked)}/>目标网址与页面标题（必选）</label>
      <p className="secondary">{nextPage?.title||'用户指定目标'} · {nextPage?.url||''}</p>
      <label className="check"><input type="checkbox" id="ai-use-config" checked={useConfig} onChange={e=>editInput(setUseConfig,e.target.checked)}/>发送当前完整配置，保留未要求修改的规则</label>
      <details className="flat"><summary>可选 · 提供必要 HTML 样本</summary><label htmlFor="ai-sample">仅提供必要结构，移除密码、Token 和私人数据</label><textarea id="ai-sample" rows={5} maxLength={12000} value={sample} onChange={e=>editInput(setSample,e.target.value)}/><p className="secondary">不会自动读取正文、Cookie 或表单值。</p></details>
    </fieldset>
    <details className="flat"><summary>查看{working&&requestContext?'本次':'下次'}配置与错误资料</summary><pre>{JSON.stringify(displayedContext,null,2)}</pre></details>
    <p className="secondary" id="ai-recipient">接收方：{recipient?[recipient.provider,recipient.model,recipient.endpoint].filter(Boolean).join(' · '):'读取中'}</p>
    {pendingId&&<p id="ai-request-status" role="status">未决 requestId：{pendingId} · 状态：{unknown?'unknown':'pending'}</p>}
    <div className="ai-chat" aria-label="AI 采集对话"><SharedConversationFrame open={open}
      rows={conversation.rows} draft={requirement} busy={working&&!unknown}
      blocked={unknown||pendingId!==null||!pendingReady||blocked||runnerBusy||runnerActive}
      inputDisabled={editingLocked} canSend={Boolean(recipient&&usePage&&targetValid)}
      inputId="ai-requirement" inputLabel="原始采集需求" maxLength={2800} sendId="ai-generate" stopId="ai-cancel"
      placeholder="例如：采集图书标题、作者、价格与详情链接。" emptyPrompt="描述需要生成或纠正的采集规则。"
      stopLabel="停止 AI 生成" onDraftChange={value=>editInput(setRequirement,value)} onSend={generate} onStop={cancel}/></div>
    {unknown&&<Button id="ai-cancel" onClick={cancel}>查询 / 停止原请求</Button>}
    {blocked&&<p className="secondary">请先处理未应用的编辑、无效 JSON 或原采集操作。</p>}
    <p role="status" id="ai-notice" hidden={!notice}>{notice}</p><p role="alert" id="ai-error" className="error" hidden={!error}>{error}</p>
    {draft&&<details className="ai-review flat"><summary>审阅 AI 配置与差异</summary><div className="stack" aria-label="生成配置审阅">
      <p className="secondary">目标：{draft.config.url}</p><ul className="ai-diff">{diff.fields.map(row=><Difference key={row.key} row={row}/>)}{diff.listChanged&&<Difference row={{key:'列表选择器',kind:'修改',before:diff.listBefore,after:diff.listAfter}}/>}{diff.optionChanges.map(row=><Difference key={row.key} row={row}/>)}</ul>
      <label htmlFor="ai-config-preview">生成的完整 JSON（只读）</label><textarea id="ai-config-preview" rows={10} readOnly value={JSON.stringify(draft.config,null,2)}/>
      {stale&&<p role="alert" className="error">输入、目标或原配置已变化，试采认证失效；保留原结果供比较。</p>}
      <div className="toolbar"><Button id="ai-apply" disabled={blocked||working||unknown||pendingId!==null||!pendingReady||runnerBusy||stale} onClick={apply}>应用为配置草稿</Button><Button id="ai-export" disabled={working||exporting} onClick={exportDraft}>导出生成配置</Button><Button disabled={working||runnerBusy} onClick={()=>{setDraft(null);onInvalidate();setProcessedInput(inputKey);setNotice('已放弃生成草稿；需求、原配置与运行记录仍保留。');}}>放弃生成草稿</Button></div>
      <details className="flat"><summary>AI 调用记录</summary><pre>{JSON.stringify({requestId:draft.requestId,providerGeneration:draft.generation,metadata:draft.metadata},null,2)}</pre></details>
    </div></details>}
  </section>;
}
