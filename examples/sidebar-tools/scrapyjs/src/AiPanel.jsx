import * as React from 'react';
import {Button,SharedConversationFrame,createConversationSession} from '@opendesk/ui';
import {localRunnerInstructions,parseProposal,changes,sameConfig} from './ai-config.js';
import {createAiRequest,requireGeneration} from './ai-request.js';
import {createAiPending} from './ai-pending.js';
import {createLocalRunnerClient,configKey,isRunSettled,previewCertified} from './local-runner-client.js';
import './local-runner.css';

const noop=()=>{};
const format=value=>value===undefined?'（无）':typeof value==='string'?value:JSON.stringify(value,null,2);
const statusNames={queued:'等待执行',running:'正在采集',stopping:'正在停止',completed:'采集完成',stopped:'已停止',failed:'采集失败',interrupted:'运行中断',unknown:'状态待确认'};
function Difference({row}){return <li><strong>{row.kind} · {row.key}</strong>{row.kind!=='保留'&&<div className="ai-before-after"><div>原值<pre>{format(row.before)}</pre></div><div>新值<pre>{format(row.after)}</pre></div></div>}</li>;}
function RunSummary({run}){
  const errors=Array.isArray(run.errors)?run.errors:run.errors?[run.errors]:[];
  return <div className="runner-summary">
    {run.simulated===true&&<p className="runner-simulation" role="note">纯模拟数据 · 未连接真实 AI 或采集服务</p>}
    <p className="runner-status" role="status">{statusNames[run.status]||run.status}{!isRunSettled(run)&&!['queued','running','unknown'].includes(run.status)?' · 等待原 worker 退出确认':''}</p>
    <dl className="runner-metrics"><div><dt>已访问页数</dt><dd>{run.pagesVisited??'—'}</dd></div><div><dt>记录数</dt><dd>{run.recordsCount??'—'}</dd></div></dl>
    <div><strong>返回字段</strong><p>{Array.isArray(run.fields)?run.fields.map(field=>typeof field==='string'?field:format(field)).join(' · ')||'尚无字段':format(run.fields)}</p></div>
    <details className="flat" open><summary>字段完整度</summary><dl className="runner-completeness" aria-label="字段完整度">{run.fields.map(field=>{const metric=run.completeness[field];return <div key={field}><dt>{field}</dt><dd>{Math.round(metric.ratio*10000)/100}% · {metric.nonEmpty} / {metric.total} 非空</dd></div>;})}</dl></details>
    <details className="flat" open={errors.length>0}><summary>错误 · {errors.length}</summary>{errors.length?<ul className="runner-error-list">{errors.map((error,index)=><li key={index}>{format(error)}</li>)}</ul>:<p className="secondary">服务未报告错误。</p>}</details>
    {run.stopReason&&<p className="secondary">停止原因：{format(run.stopReason)}</p>}
    <p className="secondary">原 run：{run.runId} · worker {run.workerExited===true?'已确认退出':'尚未确认退出'}</p>
  </div>;
}
function RunRecords({data,onPage,loading,error}){
  return <div className="runner-records" aria-busy={loading}>
    <p className="secondary" role="status">{loading?'正在读取原 run 的记录…':`共 ${data.total} 条 · 本页 ${data.records.length} 条`}</p>
    {error&&<p role="alert" className="error">{error}</p>}
    {!data.records.length&&!loading&&<p className="secondary">原 run 尚未返回记录。</p>}
    <ol start={data.offset+1}>{data.records.map((record,index)=><li key={data.offset+index}><details className="flat"><summary>记录 {data.offset+index+1}<span className="runner-record-teaser">{Object.values(record&&typeof record==='object'?record:{value:record}).slice(0,2).map(format).join(' · ')}</span></summary><pre tabIndex={0} aria-label={'记录 '+(data.offset+index+1)+' 完整 JSON'}>{JSON.stringify(record,null,2)}</pre></details></li>)}</ol>
    {data.total>50&&<nav className="toolbar" aria-label="原 run 记录分页"><Button disabled={loading||data.offset===0} onClick={()=>onPage(Math.max(0,data.offset-50))}>上一页</Button><span>第 {Math.floor(data.offset/50)+1} / {Math.ceil(data.total/50)} 页</span><Button disabled={loading||data.offset+50>=data.total} onClick={()=>onPage(data.offset+50)}>下一页</Button></nav>}
  </div>;
}

export default function AiPanel({open=true,state,locked,pending,valid,onApply,onClose,onBusy=noop,onDirty=noop}){
  const tool=globalThis.OpenDeskTool;
  const [client]=React.useState(()=>createLocalRunnerClient((op,args)=>tool.request(op,args)));
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
  const [previewPages,setPreviewPages]=React.useState(3);
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
  const [runner,setRunner]=React.useState({run:null,pointer:null,ready:false});
  const [runnerBusy,setRunnerBusy]=React.useState(false);
  const [recovering,setRecovering]=React.useState(true);
  const [runnerError,setRunnerError]=React.useState('');
  const [previousPreview,setPreviousPreview]=React.useState(null);
  const [authorization,setAuthorization]=React.useState(null);
  const [confirming,setConfirming]=React.useState(false);
  const [confirmed,setConfirmed]=React.useState(false);
  const [records,setRecords]=React.useState({runId:null,records:[],total:0,offset:0});
  const [recordsLoading,setRecordsLoading]=React.useState(false);
  const [recordsError,setRecordsError]=React.useState('');
  const exportPending=React.useRef(false),runnerPending=React.useRef(false),recordSequence=React.useRef(0);
  const active=React.useRef(null),alive=React.useRef(true),previewContext=React.useRef(null);
  const panel=React.useRef(null),confirmationCheckbox=React.useRef(null);
  const targetTouched=React.useRef(false);
  const blocked=Boolean(locked||pending||!valid);
  const inputKey=configKey({requirement,correction,sample,usePage,useConfig,targetUrl,previewPages,inputRevision});
  const binding=configKey({inputKey,config:state.config,epoch:state.profileEpoch,target:state.target?.url||null});
  const latestBinding=React.useRef(binding);latestBinding.current=binding;
  const currentState=React.useRef(state);currentState.current=state;
  const runnerActive=Boolean(runner.pointer&&!isRunSettled(runner.run));
  const busy=working||runnerBusy||runnerActive||recovering;
  const foregroundBusy=working||runnerBusy;
  const previousError=JSON.stringify({ai:error||null,configuration:state.error||null,runner:runnerError||null,
    originalRun:runner.run?{runId:runner.run.runId,status:runner.run.status,errors:runner.run.errors,stopReason:runner.run.stopReason,
      pagesVisited:runner.run.pagesVisited,recordsCount:runner.run.recordsCount,completeness:runner.run.completeness}:null});
  let targetValid=false;
  try{const url=new URL(targetUrl);targetValid=['http:','https:'].includes(url.protocol)&&!url.username&&!url.password;}catch{}
  React.useEffect(()=>()=>chat.dispose(),[chat]);
  React.useEffect(()=>{
    let current=true;
    pendingIdentity.read().then(({value})=>{if(!current)return;setPendingReady(true);if(value){setPendingId(value.requestId);setUnknown(true);setWorking(true);setNotice('存在未决原请求，请查询 / 停止原请求；不会重新发送。');}}).catch(e=>{if(current)setError(e.message);});
    return()=>{current=false;};
  },[pendingIdentity]);
  React.useEffect(()=>{onBusy(foregroundBusy);},[foregroundBusy,onBusy]);
  React.useEffect(()=>{if(confirming)confirmationCheckbox.current?.focus();},[confirming]);
  React.useEffect(()=>{onDirty(Boolean(draft)||(Boolean(requirement||correction||sample||targetTouched.current)&&inputKey!==processedInput));},[requirement,correction,sample,draft,inputKey,processedInput,onDirty]);
  React.useEffect(()=>{
    if(previewContext.current&&previewContext.current.binding!==binding)previewContext.current.invalidated=true;
    setAuthorization(null);setConfirming(false);setConfirmed(false);
  },[binding]);
  React.useEffect(()=>{if(!targetTouched.current)setTargetUrl(state.target?.url||state.config.url);},[state.target?.url,state.config.url]);
  const syncRunner=React.useCallback(()=>{
    if(!alive.current)return;
    const run=client.snapshot,pointer=client.pointer;
    setRunner({run,pointer,ready:client.ready});
    const context=previewContext.current;
    if(previewCertified(run)&&context?.runnerRequestId===pointer?.requestId){
      setPreviousPreview(previous=>previous?.run.runId===run.runId?previous:{run,...context});
      if(!context.invalidated&&context.binding===latestBinding.current)setAuthorization({runId:run.runId,configHash:run.configHash,binding:context.binding,config:context.config,generation:context.generation});
    }
  },[client]);
  React.useEffect(()=>{
    alive.current=true;
    tool.request('ai.info',{}).then(info=>{if(alive.current)setRecipient(info);}).catch(e=>{if(alive.current)setError(e.message);});
    client.restore().catch(e=>{if(alive.current)setRunnerError(e.message);}).finally(()=>{syncRunner();if(alive.current)setRecovering(false);});
    return()=>{alive.current=false;active.current?.cancel({release:false}).catch(()=>{});};
  },[tool,client,syncRunner]);
  React.useEffect(()=>{
    if(!runnerActive)return;
    let disposed=false,reading=false;
    const tick=async()=>{
      if(disposed||reading||runnerPending.current)return;
      reading=true;
      try{await client.refresh();if(!disposed&&alive.current){setRunnerError('');syncRunner();}}
      catch(e){if(!disposed&&alive.current)setRunnerError(e.message);}
      finally{reading=false;}
    };
    const timer=setInterval(tick,1500);
    return()=>{disposed=true;clearInterval(timer);};
  },[runnerActive,client,syncRunner]);
  const readRecords=React.useCallback(async(offset=0)=>{
    const id=client.pointer?.runId;if(!id)return;
    const sequence=++recordSequence.current;
    setRecordsLoading(true);setRecordsError('');
    try{const result=await client.records(offset);if(alive.current&&sequence===recordSequence.current&&client.pointer?.runId===id){
      const data={runId:id,...result};setRecords(data);
      setPreviousPreview(previous=>previous?.run.runId===id?{...previous,records:data}:previous);
    }}
    catch(e){if(alive.current&&sequence===recordSequence.current)setRecordsError(e.message);}
    finally{if(alive.current&&sequence===recordSequence.current)setRecordsLoading(false);}
  },[client]);
  React.useEffect(()=>{
    if(!runner.run?.runId)return;
    readRecords(records.runId===runner.run.runId?records.offset:0);
  },[runner.run?.runId,runner.run?.recordsCount,runner.run?.status,readRecords]);
  function editInput(setter,value){setInputRevision(n=>n+1);setAuthorization(null);setConfirming(false);setConfirmed(false);setter(value);}
  function cancelConfirmation(){setConfirming(false);setConfirmed(false);panel.current?.querySelector('#runner-prepare-full')?.focus();}
  async function runAction(action){
    if(runnerPending.current)return;
    runnerPending.current=true;setRunnerBusy(true);setRunnerError('');
    try{await action();return true;}
    catch(e){if(alive.current)setRunnerError(e.message);return false;}
    finally{runnerPending.current=false;if(alive.current){syncRunner();setRunnerBusy(false);}}
  }
  async function generate(){
    if(active.current||working||unknown||!pendingReady||pendingId||runnerActive||runnerPending.current||blocked||!recipient||!requirement.trim()||!usePage||!targetValid)return;
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
      setNotice('AI 配置校验通过，正在以 '+previewPages+' 页上限进行真实试采；不会自动开始长任务。');
      const runnerRequestId=crypto.randomUUID();
      previewContext.current={...next,runnerRequestId};
      const started=await runAction(()=>client.start({requestId:runnerRequestId,mode:'preview',config,previewPages}));
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
  const certified=Boolean(authorization&&authorization.binding===binding&&draft&&!stale&&configKey(authorization.config)===configKey(draft.config));
  async function apply(){
    if(!draft||blocked||stale||working||unknown||pendingId||!pendingReady||runnerBusy)return;
    setWorking(true);setError('');
    try{const current=await tool.request('ai.info',{});if(requireGeneration(current.generation)!==requireGeneration(draft.generation))throw Error('AI Provider 已变化，请重新生成。');
      if(draft.binding!==latestBinding.current)throw Error('输入或原配置已变化，请重新生成。');
      onApply(draft.config,draft.base,draft.epoch,draft.page);setDraft(null);setAuthorization(null);setProcessedInput(inputKey);setNotice('已应用为未保存配置草稿；配置变更使试采认证失效。');}
    catch(e){setError(e.message);}finally{if(alive.current)setWorking(false);}
  }
  async function startFull(){
    if(!certified||!confirmed||blocked||busy)return;
    const approved=authorization;
    await runAction(async()=>{
      const info=await tool.request('ai.info',{});
      if(requireGeneration(info.generation)!==requireGeneration(approved.generation)){setAuthorization(null);throw Error('AI Provider 已变化，请重新试采。');}
      const current=currentState.current;
      if(approved.binding!==latestBinding.current||current.profileEpoch!==draft.epoch||!sameConfig(current.config,draft.base))throw Error('输入、目标或原配置已变化，请重新试采。');
      await client.start({requestId:crypto.randomUUID(),mode:'full',config:approved.config,previewPages,previewRunId:approved.runId,configHash:approved.configHash});
      if(alive.current){setConfirming(false);setConfirmed(false);setAuthorization(null);setNotice('长任务已由你确认启动；重开应用后将查询同一 run。');}
    });
  }
  async function exportRun(format){
    if(exportPending.current)return;exportPending.current=true;setExporting(true);setRunnerError('');
    try{const result=await client.export(format);if(result?.started!==true)throw Error('导出回执未确认；请先检查下载列表，勿自动重试。');if(alive.current)setNotice('已请求导出 '+format.toUpperCase()+'，请在下载列表确认。');}
    catch(e){if(alive.current)setRunnerError(e.message);}finally{exportPending.current=false;if(alive.current)setExporting(false);}
  }
  async function exportDraft(){
    if(exportPending.current||!draft)return;exportPending.current=true;setExporting(true);setError('');
    try{const result=await tool.request('browser.downloads.text',{text:JSON.stringify(draft.config,null,2),filename:'scrapyjs-ai-config.json'});if(result?.started!==true)throw Error('下载结果未知');if(alive.current)setNotice('已请求下载配置 JSON，请在下载列表确认。');}
    catch(e){if(alive.current)setError(e.message);}finally{exportPending.current=false;if(alive.current)setExporting(false);}
  }
  const diff=draft?changes(draft.base,draft.config):null;
  const displayedRecords=records.runId===runner.run?.runId?records:{records:[],total:runner.run?.recordsCount||0,offset:0};
  const editingLocked=working&&!unknown||runnerBusy;
  const displayedContext=working&&requestContext?requestContext:{page:{title:state.target?.title,url:targetUrl},
    currentConfig:useConfig?state.config:{url:targetUrl,itemConfig:{title:'.::text'}},sample,previousError};
  const nextPage=editingLocked&&requestContext?requestContext.page:{title:state.target?.title,url:targetUrl};
  return <section ref={panel} className="ai-workspace scrapy-local-runner" aria-labelledby="ai-heading">
    <div className="toolbar"><h2 id="ai-heading" tabIndex={-1}>AI 采集工作台</h2><Button id="close-ai" disabled={working||runnerBusy||recovering} onClick={onClose}>返回工作区</Button></div>
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
    <div className="runner-preview-actions"><label htmlFor="runner-preview-pages">试采页数<select id="runner-preview-pages" value={previewPages} disabled={editingLocked} onChange={e=>editInput(setPreviewPages,Number(e.target.value))}>{[1,2,3].map(n=><option key={n} value={n}>{n} 页{n===3?'（默认）':''}</option>)}</select></label>
      <p className="secondary">发送采集需求后，AI 生成并试采；长任务仍需单独确认。</p>
    </div>
    <div className="ai-chat" aria-label="AI 采集对话"><SharedConversationFrame open={open}
      rows={conversation.rows} draft={requirement} busy={working&&!unknown}
      blocked={unknown||pendingId!==null||!pendingReady||blocked||runnerBusy||runnerActive}
      inputDisabled={editingLocked} canSend={Boolean(recipient&&usePage&&targetValid)}
      inputId="ai-requirement" inputLabel="原始采集需求" maxLength={2800} sendId="ai-generate" stopId="ai-cancel"
      placeholder="例如：采集图书标题、作者、价格与详情链接。" emptyPrompt="描述需要生成或纠正的采集规则。"
      stopLabel="停止 AI 生成" onDraftChange={value=>editInput(setRequirement,value)} onSend={generate} onStop={cancel}/></div>
    {unknown&&<Button id="ai-cancel" onClick={cancel}>查询 / 停止原请求</Button>}
    {blocked&&<p className="secondary">请先处理未应用的编辑、无效 JSON 或原采集操作。</p>}
    <p role="status" id="runner-notice" hidden={!notice}>{notice}</p><p role="alert" id="ai-error" className="error" hidden={!error}>{error}</p>
    {draft&&<details className="ai-review flat"><summary>审阅 AI 配置与差异</summary><div className="stack" aria-label="生成配置审阅">
      <p className="secondary">目标：{draft.config.url}</p><ul className="ai-diff">{diff.fields.map(row=><Difference key={row.key} row={row}/>)}{diff.listChanged&&<Difference row={{key:'列表选择器',kind:'修改',before:diff.listBefore,after:diff.listAfter}}/>}{diff.optionChanges.map(row=><Difference key={row.key} row={row}/>)}</ul>
      <label htmlFor="ai-config-preview">生成的完整 JSON（只读）</label><textarea id="ai-config-preview" rows={10} readOnly value={JSON.stringify(draft.config,null,2)}/>
      {stale&&<p role="alert" className="error">输入、目标或原配置已变化，试采认证失效；保留原结果供比较。</p>}
      <div className="toolbar"><Button id="ai-apply" disabled={blocked||working||unknown||pendingId!==null||!pendingReady||runnerBusy||stale} onClick={apply}>应用为配置草稿</Button><Button id="ai-export" disabled={working||exporting} onClick={exportDraft}>导出生成配置</Button><Button disabled={working||runnerBusy} onClick={()=>{setDraft(null);setAuthorization(null);setProcessedInput(inputKey);setNotice('已放弃生成草稿；需求、原配置与运行记录仍保留。');}}>放弃生成草稿</Button></div>
      <details className="flat"><summary>AI 调用记录</summary><pre>{JSON.stringify({requestId:draft.requestId,providerGeneration:draft.generation,metadata:draft.metadata},null,2)}</pre></details>
    </div></details>}
    <section className="runner-card" aria-labelledby="runner-heading">
      <div className="toolbar"><h2 id="runner-heading">{runner.run?.mode==='full'?'长任务进度':'试采结果'}</h2><Button id="runner-recover" disabled={runnerBusy} onClick={()=>runAction(()=>client.restore())}>{runner.pointer?'查询原 run':'读取原 run'}</Button></div>
      <p id="runner-error" className="error" role="alert" hidden={!runnerError}>{runnerError}</p>
      {!runner.run&&<p className="secondary" role="status">{recovering?'正在读取已保存的运行指针…':runner.pointer?'正在按原 requestId 找回运行；不会重复创建。':!runner.ready?'运行指针读取失败；原工作区与 AI 配置草稿仍可使用。':'尚未试采。AI 返回有效配置后执行所选页数的试采。'}</p>}
      {runner.pointer&&!runner.run&&<p className="secondary">原 requestId：{runner.pointer.requestId}</p>}
      {runner.run&&<><RunSummary run={runner.run}/><RunRecords data={displayedRecords} loading={recordsLoading} error={recordsError} onPage={readRecords}/>
        <div className="toolbar"><Button id="runner-stop" variant="danger" disabled={!runnerActive||runnerBusy} onClick={()=>runAction(()=>client.stop())}>Stop · 停止原 run</Button><Button id="runner-export-jsonl" disabled={exporting} onClick={()=>exportRun('jsonl')}>导出 JSONL</Button><Button id="runner-export-csv" disabled={exporting} onClick={()=>exportRun('csv')}>导出 CSV</Button></div>
        <details className="flat"><summary>原 run 状态详情</summary><pre>{JSON.stringify(runner.run,null,2)}</pre></details>
      </>}
      <p id="runner-certification" role="status" className="secondary">{certified?'试采认证有效；请核对上方记录、字段完整度与错误，再确认长任务。':'长任务需要当前输入与配置对应的有效试采认证。'}</p>
      <Button id="runner-prepare-full" variant="primary" aria-expanded={confirming} aria-controls="runner-full-confirmation" disabled={!certified||blocked||busy} onClick={()=>{setConfirming(true);setConfirmed(false);}}>核对试采，准备长任务</Button>
      <div id="runner-full-confirmation" className="confirmation" role="group" aria-label="确认长任务" hidden={!confirming} onKeyDown={event=>{if(event.key==='Escape'&&!runnerBusy){event.preventDefault();event.stopPropagation();cancelConfirmation();}}}><p>将按已试采的配置运行：{authorization?.config.url}</p><p className="secondary">试采 run：{authorization?.runId}。长任务使用原配置的分页上限，试采页数不会替代原配置。</p><label className="check"><input ref={confirmationCheckbox} id="runner-confirm-result" type="checkbox" checked={confirmed} disabled={runnerBusy} onChange={e=>setConfirmed(e.target.checked)}/>我已核对试采记录、字段完整度和错误，确认开始。</label><div className="toolbar"><Button id="runner-start-full" variant="primary" disabled={!confirmed||!certified||blocked||busy} onClick={startFull}>确认并开始长任务</Button><Button id="runner-cancel-full" disabled={runnerBusy} onClick={cancelConfirmation}>取消</Button></div></div>
    </section>
    {previousPreview&&previousPreview.run.runId!==runner.run?.runId&&<details className="runner-card"><summary>保留的有效试采 · {previousPreview.run.runId}</summary><RunSummary run={previousPreview.run}/>
      {previousPreview.records&&<><p className="secondary">已保留 {previousPreview.records.records.length} 条原记录预览（共 {previousPreview.records.total} 条）。</p><pre>{JSON.stringify(previousPreview.records.records,null,2)}</pre></>}
      <p className="secondary">历史试采仅供对照；当前认证以上方状态为准。</p></details>}
  </section>;
}
