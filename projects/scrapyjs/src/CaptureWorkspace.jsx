import * as React from 'react';
import {Button} from '@opendesk/ui';
import {createLocalRunnerClient,configKey,isRunSettled,previewCertified} from './local-runner-client.js';
import {doubanTrialConfig,DOUBAN_REQUIREMENT,validateLocalCapture} from './capture-trials.js';
import {captureTarget,captureRequirement,captureRuleSummary,captureInputIssues} from './capture-input.js';
import {createAiCapture} from './ai-capture.js';
import {createAiPending} from './ai-pending.js';
import {requireGeneration} from './ai-request.js';
import CaptureStructure from './CaptureStructure.jsx';
import './local-runner.css';

const format=value=>value===undefined?'（无）':typeof value==='string'?value:JSON.stringify(value,null,2);
const statusNames={queued:'等待执行',running:'正在采集',stopping:'正在停止',completed:'采集完成',stopped:'已停止',failed:'采集失败',interrupted:'运行中断',unknown:'状态待确认'};
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
function RunRecords({data,fields=[],onPage,loading,error}){
  return <div className="runner-records" aria-busy={loading}>
    <p className="secondary" role="status">{loading?'正在读取原 run 的记录…':`共 ${data.total} 条 · 本页 ${data.records.length} 条`}</p>
    {error&&<p role="alert" className="error">{error}</p>}
    {!data.records.length&&!loading&&<p className="secondary">原 run 尚未返回记录。</p>}
    {data.records.length>0&&<div className="runner-table"><table><caption>字段预览{fields.length>8?'（前 8 个字段）':''}</caption><thead><tr>{fields.slice(0,8).map(field=><th scope="col" key={field}>{field}</th>)}</tr></thead><tbody>{data.records.map((row,index)=><tr key={data.offset+index}>{fields.slice(0,8).map(field=><td key={field}>{format(row[field])}</td>)}</tr>)}</tbody></table></div>}
    <ol start={data.offset+1}>{data.records.map((record,index)=><li key={data.offset+index}><details className="flat"><summary>记录 {data.offset+index+1}<span className="runner-record-teaser">{Object.values(record&&typeof record==='object'?record:{value:record}).slice(0,2).map(format).join(' · ')}</span></summary><pre tabIndex={0} aria-label={'记录 '+(data.offset+index+1)+' 完整 JSON'}>{JSON.stringify(record,null,2)}</pre></details></li>)}</ol>
    {data.total>50&&<nav className="toolbar" aria-label="原 run 记录分页"><Button disabled={loading||data.offset===0} onClick={()=>onPage(Math.max(0,data.offset-50))}>上一页</Button><span>第 {Math.floor(data.offset/50)+1} / {Math.ceil(data.total/50)} 页</span><Button disabled={loading||data.offset+50>=data.total} onClick={()=>onPage(data.offset+50)}>下一页</Button></nav>}
  </div>;
}

const noop=()=>{};
const stringify=value=>JSON.stringify(value,null,2);

// One collection owner, shared by manual rules and the optional AI proposal adapter.
export default function CaptureWorkspace({open,state,locked,pending,valid,onClose,onBusy=noop,onDirty=noop,onAiGenerating=noop,onAiBusy=noop,retiredRequest,onRequestRetired=noop}){
  const tool=globalThis.OpenDeskTool;
  const [client]=React.useState(()=>createLocalRunnerClient((op,args)=>tool.request(op,args)));
  const [generating,setGenerating]=React.useState(false);
  const [aiCapture]=React.useState(()=>createAiCapture({request:(op,args)=>tool.request(op,args),pending:createAiPending((op,args)=>tool.request(op,args)),validate:value=>validateLocalCapture(value,globalThis.ScrapyAppModel.validateConfig)}));
  const ai=React.useSyncExternalStore(aiCapture.subscribe,()=>aiCapture.snapshot);
  const [sample,setSample]=React.useState(''),[sampleUrl,setSampleUrl]=React.useState('');
  const [sampleBinding,setSampleBinding]=React.useState(null),[structureSource,setStructureSource]=React.useState(null);
  const [structureBusy,setStructureBusy]=React.useState(false);
  const [sampleRevision,setSampleRevision]=React.useState(0),[aiNotice,setAiNotice]=React.useState('');
  const [aiProposal,setAiProposal]=React.useState(null);
  const proposalValidity=React.useRef(null);
  const correctionCandidate=React.useRef(null);
  const [correctionBaseline,setCorrectionBaseline]=React.useState(null);
  const [urlDraft,setUrlDraft]=React.useState(null),[budgetDraft,setBudgetDraft]=React.useState(null);
  const [requirement,setRequirement]=React.useState(''),[correction,setCorrection]=React.useState('');
  const [ruleIntent,setRuleIntent]=React.useState('correct');
  const aiStarting=React.useRef(false);
  const [configText,setConfigText]=React.useState(null);
  const [configRevision,setConfigRevision]=React.useState(0);
  const [previewPages,setPreviewPages]=React.useState(3);
  const [runner,setRunner]=React.useState({run:null,pointer:null,ready:false});
  const [runnerBusy,setRunnerBusy]=React.useState(false);
  const [recovering,setRecovering]=React.useState(true);
  const [runnerError,setRunnerError]=React.useState('');
  const [notice,setNotice]=React.useState('');
  const [exporting,setExporting]=React.useState(false);
  const [previousPreview,setPreviousPreview]=React.useState(null);
  const [authorization,setAuthorization]=React.useState(null);
  const [confirming,setConfirming]=React.useState(false);
  const [confirmed,setConfirmed]=React.useState(false);
  const [records,setRecords]=React.useState({runId:null,records:[],total:0,offset:0});
  const [recordsLoading,setRecordsLoading]=React.useState(false);
  const [recordsError,setRecordsError]=React.useState('');
  const exportPending=React.useRef(false),runnerPending=React.useRef(false),recordSequence=React.useRef(0);
  const alive=React.useRef(true),previewContext=React.useRef(null),authorizationEpoch=React.useRef(0);
  const panel=React.useRef(null),confirmationCheckbox=React.useRef(null);
  const text=configText??stringify(state.config);
  let manualConfig;try{manualConfig=JSON.parse(text);}catch{}
  const captureUrl=urlDraft??manualConfig?.url??'',maxPages=budgetDraft??String(manualConfig?.maxPages??50);
  const inputIssues=captureInputIssues({url:captureUrl,maxPages,requirement,correction,intent:ruleIntent,previewPages});
  const aiInputsValid=Object.keys(inputIssues).length===0;
  const ruleScope=configKey({text,captureUrl,maxPages,config:state.config,epoch:state.profileEpoch,target:state.target?.url||null});
  const baselineCurrent=Boolean(correctionBaseline?.valid&&correctionBaseline.scope===ruleScope);
  const binding=configKey({text,configRevision,captureUrl,maxPages,requirement,correction,ruleIntent,previewPages,config:state.config,epoch:state.profileEpoch,target:state.target?.url||null,
    correctionBaseline:ruleIntent==='correct'&&baselineCurrent?{config:correctionBaseline.config,configHash:correctionBaseline.configHash,runId:correctionBaseline.runId}:null});
  const latestBinding=React.useRef(binding);latestBinding.current=binding;
  const currentSample=sampleBinding===binding?sample:'';
  const aiBinding=configKey({binding,sample:currentSample,sampleUrl,sampleRevision});
  const latestAiBinding=React.useRef(aiBinding);latestAiBinding.current=aiBinding;
  const runnerActive=Boolean(runner.pointer&&!isRunSettled(runner.run));
  const blocked=Boolean(locked||pending||!valid);
  const busy=runnerBusy||runnerActive||recovering||structureBusy;
  const editingLocked=busy||generating;
  const invalidate=React.useCallback(()=>{
    ++authorizationEpoch.current;
    if(previewContext.current)previewContext.current.invalidated=true;
    setAuthorization(null);setConfirming(false);setConfirmed(false);
  },[]);
  const staleProposal=React.useCallback((reason='输入已变化，请重新生成并试采。')=>{
    if(proposalValidity.current)proposalValidity.current.valid=false;
    setAiProposal(previous=>previous?{...previous,invalidated:true,invalidReason:reason}:previous);
  },[]);
  function editTask(setter,value){
    invalidate();staleProposal();setConfigRevision(n=>n+1);
    if([setConfigText,setUrlDraft,setBudgetDraft].includes(setter)){
      if(correctionCandidate.current)correctionCandidate.current.valid=false;
      setCorrectionBaseline(null);
    }else if((setter===setRuleIntent&&value==='correct')||(setter===setCorrection&&ruleIntent==='correct')){
      const candidate=correctionCandidate.current;
      if(candidate?.valid&&candidate.scope===ruleScope)setCorrectionBaseline(candidate);
    }
    setter(value);
  }
  function continueCorrection(){
    const candidate=correctionCandidate.current;
    if(!candidate?.valid||candidate.scope!==ruleScope)return;
    editTask(setRuleIntent,'correct');
  }
  function currentConfig(){
    const target=captureTarget(captureUrl,maxPages);
    return validateLocalCapture({...JSON.parse(text),...(urlDraft!==null?{url:target.url}:{}),
      ...(budgetDraft!==null?{maxPages:target.maxPages}:{})},globalThis.ScrapyAppModel.validateConfig);
  }
  // A retired execution proposal can remain data for a new correction. It
  // never restores preview/full authorization or replaces saved/manual rules.
  function correctionConfig(){
    return baselineCurrent?validateLocalCapture(correctionBaseline.config,globalThis.ScrapyAppModel.validateConfig):currentConfig();
  }
  function prepareStructure(){
    const target=captureTarget(captureUrl,maxPages);
    captureRequirement({requirement,correction,intent:ruleIntent,config:ruleIntent==='correct'?correctionConfig():null,target,previewPages});
    return {...target,previewPages};
  }
  function acceptStructure(row,inputBinding){
    if(!alive.current||latestBinding.current!==inputBinding)return;
    staleProposal();if(previewContext.current?.source==='ai')invalidate();
    setSample(row.sample);setSampleUrl(row.requestedUrl);setSampleBinding(inputBinding);
    setStructureSource(row);setSampleRevision(n=>n+1);
  }
  function assertCaptureCurrent(context){
    if(!alive.current||context.epoch!==authorizationEpoch.current||context.invalidated||context.binding!==latestBinding.current||
      (context.aiBinding&&(context.aiBinding!==latestAiBinding.current||!context.proposal?.validity.valid)))throw Error('采集输入、授权或界面已变化；未创建新任务，请重新试采。');
  }
  React.useEffect(()=>{invalidate();},[binding,invalidate]);
  React.useEffect(()=>{
    if(correctionCandidate.current&&correctionCandidate.current.scope!==ruleScope)correctionCandidate.current.valid=false;
    if(correctionBaseline&&correctionBaseline.scope!==ruleScope)setCorrectionBaseline(null);
  },[ruleScope,correctionBaseline]);
  React.useEffect(()=>{staleProposal();if(previewContext.current?.source==='ai')invalidate();},[aiBinding,staleProposal,invalidate]);
  React.useEffect(()=>{onBusy(busy);},[busy,onBusy]);
  React.useEffect(()=>{onAiGenerating(generating);},[generating,onAiGenerating]);
  React.useEffect(()=>{onDirty(configText!==null||urlDraft!==null||budgetDraft!==null||Boolean(requirement||correction||sample||aiProposal));},[configText,urlDraft,budgetDraft,requirement,correction,sample,aiProposal,onDirty]);
  React.useEffect(()=>{onAiBusy(ai.busy||ai.unknown);},[ai.busy,ai.unknown,onAiBusy]);
  React.useEffect(()=>{aiCapture.restore().catch(e=>{if(alive.current)setAiNotice(e.message);});return()=>aiCapture.dispose();},[aiCapture]);
  React.useEffect(()=>{
    if(ai.requestId!==retiredRequest?.requestId||!['cancelled','completed','failed'].includes(retiredRequest?.state))return;
    // Re-read the CAS row; restore refuses an active or cancelling local owner.
    aiCapture.restore().catch(e=>{if(alive.current)setAiNotice(e.message);});
  },[aiCapture,ai.requestId,retiredRequest]);
  React.useEffect(()=>{if(confirming)confirmationCheckbox.current?.focus();},[confirming]);
  const syncRunner=React.useCallback(()=>{
    if(!alive.current)return;
    const run=client.snapshot,pointer=client.pointer;
    setRunner({run,pointer,ready:client.ready});
    const context=previewContext.current;
    const contextCurrent=Boolean(context&&!context.invalidated&&context.binding===latestBinding.current&&(!context.aiBinding||context.aiBinding===latestAiBinding.current));
    // Empty/failed previews need correction most. Keep their validated rules
    // as data after an identity-matched terminal receipt, never as authority.
    if(contextCurrent&&context.source==='ai'&&context.runnerRequestId===pointer?.requestId&&run?.mode==='preview'&&isRunSettled(run)&&
      run.config&&configKey(run.config)===configKey(context.config))
      correctionCandidate.current={config:structuredClone(context.config),configHash:run.configHash,runId:run.runId,
        requestId:context.proposal.requestId,scope:context.ruleScope,valid:true};
    if(previewCertified(run)&&context?.runnerRequestId===pointer?.requestId){
      setPreviousPreview(previous=>previous?.run.runId===run.runId?previous:{run,...context});
      if(contextCurrent){
        setAuthorization({runId:run.runId,configHash:run.configHash,...context});
      }
    }
  },[client]);
  React.useEffect(()=>{
    alive.current=true;
    client.restore().catch(e=>{if(alive.current)setRunnerError(e.message);}).finally(()=>{syncRunner();if(alive.current)setRecovering(false);});
    return()=>{alive.current=false;++authorizationEpoch.current;};
  },[client,syncRunner]);
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
    if(runner.run?.runId)readRecords(records.runId===runner.run.runId?records.offset:0);
  },[runner.run?.runId,runner.run?.recordsCount,runner.run?.status,readRecords]);
  async function runAction(action){
    if(runnerPending.current)return false;
    runnerPending.current=true;setRunnerBusy(true);setRunnerError('');
    try{await action();return true;}
    catch(e){if(alive.current)setRunnerError(e.message);return false;}
    finally{runnerPending.current=false;if(alive.current){syncRunner();setRunnerBusy(false);}}
  }
  async function verifyProposal(proposal){
    try{
      if(!alive.current||!proposal?.validity.valid||proposal.invalidated||proposal.inputBinding!==latestAiBinding.current)throw Error('AI 提案输入或界面已变化，请重新生成并试采。');
      const info=await tool.request('ai.info',{});
      if(!alive.current)throw Error('采集界面已关闭，未创建新任务。');
      if(requireGeneration(info.generation)!==proposal.providerGeneration)throw Error('AI Provider 已变化，请重新生成并试采。');
      if(!proposal.validity.valid||proposal.inputBinding!==latestAiBinding.current)throw Error('AI 提案输入已变化，请重新生成并试采。');
    }catch(error){
      if(proposal)proposal.validity.valid=false;
      if(alive.current){
        setAiProposal(previous=>previous?.requestId===proposal?.requestId?{...previous,invalidated:true,invalidReason:error.message}:previous);
        if(previewContext.current?.proposal?.requestId===proposal?.requestId)invalidate();
      }
      throw error;
    }
  }
  // Only a delivered AI proposal depends on Provider identity. Manual work and
  // a restored unknown request never trigger Provider polling or cancellation.
  const proposalCurrent=Boolean(aiProposal?.validity.valid&&!aiProposal.invalidated&&aiProposal.inputBinding===aiBinding);
  React.useEffect(()=>{
    if(!proposalCurrent||ai.unknown||generating)return;
    let reading=false;
    const timer=setInterval(async()=>{
      if(reading)return;reading=true;
      try{await verifyProposal(aiProposal);}catch{}finally{reading=false;}
    },1500);
    return()=>clearInterval(timer);
  },[proposalCurrent,aiProposal,ai.unknown,generating]);
  async function startPreview(value,source='manual',pages=previewPages,proposal=null){
    if(blocked||busy||(generating&&source==='manual')||runnerPending.current)return false;
    return runAction(async()=>{
      const inputBinding=latestBinding.current;
      const preparing={binding:inputBinding,epoch:authorizationEpoch.current,
        ...(source==='ai'?{aiBinding:proposal?.inputBinding,proposal}:{})};
      assertCaptureCurrent(preparing);
      const config=value?validateLocalCapture(value,globalThis.ScrapyAppModel.validateConfig):currentConfig();
      if(source==='ai')await verifyProposal(proposal);
      assertCaptureCurrent(preparing);
      invalidate();
      const runnerRequestId=crypto.randomUUID();
      const context={source,config,binding:inputBinding,ruleScope,epoch:authorizationEpoch.current,previewPages:pages,runnerRequestId,
        ...(source==='ai'?{aiBinding:proposal.inputBinding,providerGeneration:proposal.providerGeneration,proposal}:{} )};
      previewContext.current=context;
      await client.start({requestId:runnerRequestId,mode:'preview',config,previewPages:pages,assertCurrent:()=>assertCaptureCurrent(context)});
      if(alive.current)setNotice('已按声明式配置试采；请核对记录和错误，再明确确认完整采集。');
    });
  }
  async function generatePreview(){
    if(aiStarting.current||blocked||busy||generating||ai.unknown||!ai.ready)return;
    aiStarting.current=true;setGenerating(true);setAiNotice('');
    invalidate();staleProposal('正在生成新提案，旧提案已失效。');
    const inputBinding=latestAiBinding.current;
    try{
      if(!currentSample)throw Error('请先读取当前网址与需求的网页结构，再生成规则。');
      const target=captureTarget(captureUrl,maxPages);
      const config=ruleIntent==='correct'?correctionConfig():null;
      const requestText=captureRequirement({requirement,correction,intent:ruleIntent,config,target,previewPages});
      const result=await aiCapture.generate({requestId:crypto.randomUUID(),requirement:requestText,targetUrl:target.url,
        context:{page:{url:target.url,title:state.target?.url===target.url?state.target.title:'用户指定公开列表'},sample:currentSample,sampleUrl,
          ...(structureSource&&sampleBinding===binding?{structureSource:Object.fromEntries(Object.entries(structureSource).filter(([key])=>key!=='sample'))}:{}),
          ...(config?{currentConfig:config}:{}),ruleIntent,budget:{maxPages:target.maxPages,previewPages},requirement,correction,
          previousError:JSON.stringify({ai:ai.error||null,configuration:state.error||null,runner:runnerError||null,originalRun:runner.run?{runId:runner.run.runId,status:runner.run.status,errors:runner.run.errors}:null})},
        assertCurrent:()=>{if(!alive.current||latestAiBinding.current!==inputBinding)throw Error('输入、原配置或目标已变化，提案未采用。');}});
      if(!result||!alive.current||inputBinding!==latestAiBinding.current)return;
      const validity={valid:true};proposalValidity.current=validity;
      const proposal={...result,inputBinding,invalidated:false,validity};setAiProposal(proposal);
      const started=await startPreview(result.config,'ai',previewPages,proposal);
      if(alive.current)setAiNotice(started?`AI 规则已校验并交给原采集链试采 ${previewPages} 页；未保存配置或启动 full。`:'AI 规则已保留；试采未确认，请查看原运行状态。');
    }catch(error){if(alive.current)setAiNotice(error.message);}
    finally{aiStarting.current=false;if(alive.current)setGenerating(false);}
  }
  async function cancelAi(){
    try{
      const reply=await aiCapture.cancel();
      if(alive.current){
        if(['cancelled','completed','failed'].includes(reply?.state)&&!aiCapture.snapshot.requestId&&!aiCapture.snapshot.unknown)onRequestRetired(reply);
        setAiNotice(reply?.state==='unknown'?'原 AI 请求结果仍为 unknown；不重新发送。':'原 AI 请求已确认结束；停止后的提案不采用。');
      }
    }
    catch(error){if(alive.current)setAiNotice(error.message);}
    finally{if(alive.current)setGenerating(false);}
  }
  const certified=Boolean(authorization&&authorization.binding===binding&&!previewContext.current?.invalidated&&
    (!authorization.aiBinding||(proposalCurrent&&authorization.aiBinding===aiBinding)));
  async function prepareFull(){
    if(!certified||blocked||busy||generating)return;
    const approved=authorization;
    try{
      assertCaptureCurrent(approved);
      if(approved.source==='ai')await verifyProposal(approved.proposal);
      assertCaptureCurrent(approved);
      setConfirming(true);setConfirmed(false);
    }catch(error){if(alive.current)setRunnerError(error.message);}
  }
  function cancelConfirmation(){setConfirming(false);setConfirmed(false);panel.current?.querySelector('#runner-prepare-full')?.focus();}
  async function startFull(){
    if(!certified||!confirmed||blocked||busy||generating)return;
    const approved=authorization;
    await runAction(async()=>{
      assertCaptureCurrent(approved);
      if(approved.source==='ai')await verifyProposal(approved.proposal);
      assertCaptureCurrent(approved);
      await client.start({requestId:crypto.randomUUID(),mode:'full',config:approved.config,previewPages:approved.previewPages,previewRunId:approved.runId,configHash:approved.configHash,assertCurrent:()=>assertCaptureCurrent(approved)});
      if(alive.current){invalidate();setNotice('长任务已由你确认启动；重开应用后将查询同一 run。');}
    });
  }
  async function exportRun(format){
    if(exportPending.current)return;exportPending.current=true;setExporting(true);setRunnerError('');
    try{const result=await client.export(format);if(result?.started!==true)throw Error('导出回执未确认；请先检查下载列表，勿自动重试。');if(alive.current)setNotice('已请求导出 '+format.toUpperCase()+'，请在下载列表确认。');}
    catch(e){if(alive.current)setRunnerError(e.message);}finally{exportPending.current=false;if(alive.current)setExporting(false);}
  }
  let summary,summaryError='';
  try{summary=captureRuleSummary(proposalCurrent?aiProposal.config:currentConfig());}catch(error){summaryError=error.message;}
  const displayedRecords=records.runId===runner.run?.runId?records:{records:[],total:runner.run?.recordsCount||0,offset:0};
  const nextStep=Object.values(inputIssues)[0]||(!currentSample.trim()?'如需 AI，请先读取当前网址的网页结构；已有规则可直接试采。':
    proposalCurrent?'请核对下方试采记录；需要调整时填写中文纠正意见。':'网页结构已就绪，可按需生成或纠正规则；发送前仍需审阅。');
  return <section ref={panel} className="scrapy-local-runner" aria-labelledby="capture-heading">
    <div className="toolbar"><h2 id="capture-heading" tabIndex={-1}>本机采集</h2><Button id="close-local-runner" disabled={runnerBusy||generating} onClick={onClose}>返回工作区</Button></div>
    <p className="secondary">填网址和采集需求，按需用 AI 生成或纠正规则；已有规则可直接试采。核对结果后才完整采集。</p>
    <div className="runner-inputs">
      <label htmlFor="capture-url">采集网址<input id="capture-url" type="url" autoComplete="off" value={captureUrl} disabled={editingLocked} aria-invalid={Boolean(inputIssues.url)} aria-describedby={inputIssues.url?'capture-url-error':undefined} onChange={e=>editTask(setUrlDraft,e.target.value)}/><span id="capture-url-error" className="error" hidden={!inputIssues.url}>{inputIssues.url}</span></label>
      <label htmlFor="capture-requirement">想采集什么<textarea id="capture-requirement" rows={3} maxLength={4000} placeholder="例如：采集书名、作者、价格和图书链接，缺失价格留空" value={requirement} disabled={editingLocked} aria-invalid={Boolean(inputIssues.requirement)} aria-describedby={inputIssues.requirement?'capture-requirement-error':undefined} onChange={e=>editTask(setRequirement,e.target.value)}/><span id="capture-requirement-error" className="error" hidden={!inputIssues.requirement}>{inputIssues.requirement}</span></label>
      <label htmlFor="capture-correction">这次要纠正什么（可选）<textarea id="capture-correction" rows={2} maxLength={2000} placeholder="例如：价格混入了推荐书目，只取当前条目；不要漏掉下一页" value={correction} disabled={editingLocked} aria-invalid={Boolean(inputIssues.correction)} aria-describedby={inputIssues.correction?'capture-correction-error':undefined} onChange={e=>editTask(setCorrection,e.target.value)}/><span id="capture-correction-error" className="error" hidden={!inputIssues.correction}>{inputIssues.correction}</span></label>
      <label htmlFor="capture-ai-mode">AI 如何处理需求<select id="capture-ai-mode" value={ruleIntent} disabled={editingLocked} onChange={e=>editTask(setRuleIntent,e.target.value)}><option value="correct">纠正现有规则 · 保留字段含义</option><option value="create">按中文需求生成新规则</option></select></label>
      <label htmlFor="capture-budget">完整采集最多页数<input id="capture-budget" type="number" min={1} max={50} step={1} value={maxPages} disabled={editingLocked} aria-invalid={Boolean(inputIssues.maxPages)} aria-describedby={inputIssues.maxPages?'capture-budget-error':undefined} onChange={e=>editTask(setBudgetDraft,e.target.value)}/><span id="capture-budget-error" className="error" hidden={!inputIssues.maxPages}>{inputIssues.maxPages}</span></label>
      <p className="secondary">中文输入只在 AI 审阅确认后用于生成规则。直接试采使用下方摘要规则，不会自动理解或应用新需求。</p>
    </div>
    <section id="capture-rule-summary" aria-label="当前规则摘要" className="runner-card">
      <strong>{proposalCurrent?'本次 AI 规则 · 尚未保存':'现有人工规则'}</strong>
      {summary?<><p>采集字段：{summary.fields.join(' · ')||'尚无字段'}</p><p className="secondary">{summary.pagination} · 完整采集最多 {summary.maxPages} 页 · 去重字段：{summary.dedupeKey}</p></>:<p className="error" role="alert">{summaryError}</p>}
      <p className="secondary">只解析静态 HTML；试采结果和错误才是规则是否可用的依据。</p>
    </section>
    {baselineCurrent&&ruleIntent==='correct'&&<section id="capture-correction-baseline" className="runner-card" aria-label="中文纠正基线">
      <strong>纠正刚试采的 AI 规则 · 尚未保存</strong>
      <p>采集字段：{captureRuleSummary(correctionBaseline.config).fields.join(' · ')}</p>
      <p className="secondary">本次纠正沿用这份规则；请填写纠正意见，再重新读取网页结构。</p>
      <details className="flat"><summary>基线来源</summary><p>试采 run：{correctionBaseline.runId}</p><p>配置摘要：{correctionBaseline.configHash}</p></details>
      <Button id="capture-workspace-correction" disabled={editingLocked} onClick={()=>{correctionCandidate.current=null;editTask(setCorrectionBaseline,null);}}>改用工作区规则纠正</Button>
    </section>}
    {correctionCandidate.current?.valid&&correctionCandidate.current.scope===ruleScope&&<Button id="capture-continue-correction" disabled={blocked||editingLocked} onClick={continueCorrection}>以本次 AI 规则继续纠正</Button>}
    <details className="flat"><summary>高级 · 人工配置 JSON</summary><label htmlFor="runner-config">原完整配置 · 不会覆盖已保存版本</label><textarea id="runner-config" rows={10} disabled={editingLocked} value={text} onChange={e=>{editTask(setConfigText,e.target.value);setUrlDraft(null);setBudgetDraft(null);}}/>
      <Button disabled={editingLocked} onClick={()=>{editTask(setConfigText,null);setUrlDraft(null);setBudgetDraft(null);}}>使用工作区当前配置</Button>
    </details>
    <details className="flat"><summary>豆瓣三页试采 · 公开列表</summary><p>{DOUBAN_REQUIREMENT}</p><p className="secondary">候选规则尚未实采核对；2026-10-31 robots 返回 403。服务会继续遵守 robots，不绕过访问拒绝；此操作不覆盖当前配置。</p><Button id="runner-trial-douban" disabled={blocked||editingLocked} onClick={()=>startPreview(doubanTrialConfig(),'douban',3)}>试采豆瓣 3 页</Button></details>
    <div className="runner-preview-actions"><label htmlFor="runner-preview-pages">试采页数<select id="runner-preview-pages" value={previewPages} disabled={editingLocked} onChange={e=>editTask(setPreviewPages,Number(e.target.value))}>{[1,2,3].map(n=><option key={n} value={n}>{n} 页{n===3?'（默认）':''}</option>)}</select></label>
      <Button id="runner-start-preview" variant="primary" disabled={blocked||editingLocked} onClick={()=>proposalCurrent?startPreview(aiProposal.config,'ai',previewPages,aiProposal):startPreview()}>按摘要规则试采</Button>
    </div>
    <CaptureStructure binding={binding} visible={open} disabled={blocked||runnerBusy||runnerActive||recovering||generating||!aiInputsValid} prepare={prepareStructure} onSample={acceptStructure} onBusy={setStructureBusy}/>
    <p id="capture-structure-source" className="secondary">{structureSource?(sampleBinding===binding?`结构来源：${structureSource.url} · ${structureSource.truncated?'有限样本，部分省略':'当前单页'}；读取结构不等于试采通过。`:'输入已变化，旧结构已失效；请重新读取网页结构。'):'尚未读取网页结构；已有规则可直接试采。'}</p>
    <p id="capture-next-step" role="status" className="secondary">{nextStep}</p>
    <div className="runner-preview-actions"><Button id="ai-trial" aria-describedby="capture-next-step" disabled={blocked||editingLocked||!ai.ready||ai.unknown||ai.busy||!aiInputsValid||!currentSample.trim()} onClick={generatePreview}>{ruleIntent==='create'?'AI 生成规则并试采':'AI 纠正规则并试采'}</Button>
      {ai.requestId&&<Button id="ai-cancel" onClick={cancelAi}>查询 / 停止原 AI 请求</Button>}
      {!ai.ready&&<Button id="ai-recover" onClick={()=>aiCapture.restore().catch(e=>setAiNotice(e.message))}>读取原 AI 身份</Button>}
    </div>
    <p className="secondary">先读取网页结构，再按需经原可信审阅发送 AI。真实 AI 生成规则与三页核对仍未验证。</p>
    <details className="flat"><summary>高级 · 结构样本与发送范围</summary><p className="secondary">仅发送当前目标、中文需求/纠正、预算、必要规则和获准样本，经原可信发送审阅。结构来自本机静态下载，不是登录后网页；不执行样本中的脚本。</p>
      <label htmlFor="ai-sample">当前目标的必要 HTML 结构</label><textarea id="ai-sample" rows={3} maxLength={12000} disabled={editingLocked} value={sample} onChange={e=>{staleProposal();if(previewContext.current?.source==='ai')invalidate();setSampleRevision(n=>n+1);setSample(e.target.value);setSampleBinding(binding);setStructureSource(null);try{setSampleUrl(captureTarget(captureUrl,maxPages).url);}catch{setSampleUrl('');}}}/>
      <p className="secondary">样本绑定目标：{sampleUrl||'尚未提供'}</p>{ai.context&&<details><summary>本次实际发送资料</summary><pre>{stringify(ai.context)}</pre></details>}
    </details>
    <p id="ai-status" role="status">{ai.unknown?'原 AI 请求 unknown：'+ai.requestId+'；仅围住 AI，手动采集仍可用。':aiNotice||ai.error}{ai.unknown&&aiNotice?' '+aiNotice:''}</p>
    {aiProposal&&<details id="ai-proposal" className="flat"><summary>AI 已校验规则{proposalCurrent?'':'（已失效，仅供对照）'}</summary>{!proposalCurrent&&<p role="status">{aiProposal.invalidReason||'输入已变化，请重新生成并试采。'}</p>}<pre>{stringify({config:aiProposal.config,requestId:aiProposal.requestId,providerGeneration:aiProposal.providerGeneration,metadata:aiProposal.metadata})}</pre></details>}
    {blocked&&<p className="secondary">请先处理未应用编辑、无效工作区配置或原浏览器采集操作。</p>}
    <p id="runner-notice" role="status" hidden={!notice}>{notice}</p>
    <section className="runner-card" aria-labelledby="runner-heading">
      <div className="toolbar"><h2 id="runner-heading">{runner.run?.mode==='full'?'长任务进度':'试采结果'}</h2><Button id="runner-recover" disabled={runnerBusy} onClick={()=>runAction(()=>client.restore())}>{runner.pointer?'查询原 run':'读取原 run'}</Button></div>
      <p id="runner-error" className="error" role="alert" hidden={!runnerError}>{runnerError}</p>
      {!runner.run&&<p className="secondary" role="status">{recovering?'正在读取已保存的运行指针…':runner.pointer?'正在按原 requestId 找回运行；不会重复创建。':!runner.ready?'运行指针读取失败，请读取原 run。':'尚未试采。可直接使用当前配置，无需 AI。'}</p>}
      {runner.pointer&&!runner.run&&<p className="secondary">原 requestId：{runner.pointer.requestId}</p>}
      {runner.run&&<><RunSummary run={runner.run}/><RunRecords fields={runner.run.fields} data={displayedRecords} loading={recordsLoading} error={recordsError} onPage={readRecords}/>
        <div className="toolbar"><Button id="runner-stop" variant="danger" disabled={!runnerActive||runnerBusy} onClick={()=>runAction(()=>client.stop())}>Stop · 停止原 run</Button><Button id="runner-export-jsonl" disabled={exporting} onClick={()=>exportRun('jsonl')}>导出 JSONL</Button><Button id="runner-export-csv" disabled={exporting} onClick={()=>exportRun('csv')}>导出 CSV</Button></div>
        <details className="flat"><summary>原 run 状态详情</summary><pre>{JSON.stringify(runner.run,null,2)}</pre></details>
      </>}
      <p id="runner-certification" role="status" className="secondary">{certified?'试采认证有效；请核对记录、字段完整度与错误，再确认长任务。':'长任务需要当前配置对应的有效试采认证。'}</p>
      <Button id="runner-prepare-full" variant="primary" aria-expanded={confirming} aria-controls="runner-full-confirmation" disabled={!certified||blocked||busy||generating} onClick={prepareFull}>核对试采，准备长任务</Button>
      <div id="runner-full-confirmation" className="confirmation" role="group" aria-label="确认长任务" hidden={!confirming} onKeyDown={event=>{if(event.key==='Escape'&&!runnerBusy){event.preventDefault();event.stopPropagation();cancelConfirmation();}}}><p>将按已试采的配置运行：{authorization?.config.url}</p><p className="secondary">试采 run：{authorization?.runId}。长任务使用原配置分页上限。</p><details><summary>确认使用的完整配置</summary><pre>{authorization?stringify(authorization.config):''}</pre></details><label className="check"><input ref={confirmationCheckbox} id="runner-confirm-result" type="checkbox" checked={confirmed} disabled={runnerBusy} onChange={e=>setConfirmed(e.target.checked)}/>我已核对试采记录、字段完整度和错误，确认开始。</label><div className="toolbar"><Button id="runner-start-full" variant="primary" disabled={!confirmed||!certified||blocked||busy||generating} onClick={startFull}>确认并开始长任务</Button><Button id="runner-cancel-full" disabled={runnerBusy} onClick={cancelConfirmation}>取消</Button></div></div>
    </section>
    {previousPreview&&previousPreview.run.runId!==runner.run?.runId&&<details className="runner-card"><summary>保留的有效试采 · {previousPreview.run.runId}</summary><RunSummary run={previousPreview.run}/>
      {previousPreview.records&&<pre>{stringify(previousPreview.records.records)}</pre>}<p className="secondary">历史试采仅供对照；当前认证以上方状态为准。</p></details>}
  </section>;
}
