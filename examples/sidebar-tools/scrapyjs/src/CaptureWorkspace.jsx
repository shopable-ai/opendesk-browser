import * as React from 'react';
import {Button} from '@opendesk/ui';
import AiPanel from './AiPanel.jsx';
import {createLocalRunnerClient,configKey,isRunSettled,previewCertified} from './local-runner-client.js';
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
function RunRecords({data,onPage,loading,error}){
  return <div className="runner-records" aria-busy={loading}>
    <p className="secondary" role="status">{loading?'正在读取原 run 的记录…':`共 ${data.total} 条 · 本页 ${data.records.length} 条`}</p>
    {error&&<p role="alert" className="error">{error}</p>}
    {!data.records.length&&!loading&&<p className="secondary">原 run 尚未返回记录。</p>}
    <ol start={data.offset+1}>{data.records.map((record,index)=><li key={data.offset+index}><details className="flat"><summary>记录 {data.offset+index+1}<span className="runner-record-teaser">{Object.values(record&&typeof record==='object'?record:{value:record}).slice(0,2).map(format).join(' · ')}</span></summary><pre tabIndex={0} aria-label={'记录 '+(data.offset+index+1)+' 完整 JSON'}>{JSON.stringify(record,null,2)}</pre></details></li>)}</ol>
    {data.total>50&&<nav className="toolbar" aria-label="原 run 记录分页"><Button disabled={loading||data.offset===0} onClick={()=>onPage(Math.max(0,data.offset-50))}>上一页</Button><span>第 {Math.floor(data.offset/50)+1} / {Math.ceil(data.total/50)} 页</span><Button disabled={loading||data.offset+50>=data.total} onClick={()=>onPage(data.offset+50)}>下一页</Button></nav>}
  </div>;
}

const noop=()=>{};
const stringify=value=>JSON.stringify(value,null,2);

// One collection owner, shared by manual rules and the optional AI proposal adapter.
export default function CaptureWorkspace({open,assistantOpen,state,locked,pending,valid,onApply,onClose,onAssistantOpen,onAssistantClose,onBusy=noop,onDirty=noop,onAiBusy=noop,onAiDirty=noop,onAiGenerating=noop}){
  const tool=globalThis.OpenDeskTool;
  const [client]=React.useState(()=>createLocalRunnerClient((op,args)=>tool.request(op,args)));
  const [assistantActivated,setAssistantActivated]=React.useState(Boolean(assistantOpen));
  const [generating,setGenerating]=React.useState(false);
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
  const alive=React.useRef(true),previewContext=React.useRef(null);
  const panel=React.useRef(null),confirmationCheckbox=React.useRef(null);
  const text=configText??stringify(state.config);
  const binding=configKey({text,configRevision,previewPages,config:state.config,epoch:state.profileEpoch,target:state.target?.url||null});
  const latestBinding=React.useRef(binding);latestBinding.current=binding;
  const runnerActive=Boolean(runner.pointer&&!isRunSettled(runner.run));
  const blocked=Boolean(locked||pending||!valid);
  const busy=runnerBusy||runnerActive||recovering;
  const editingLocked=busy||generating;
  const invalidate=React.useCallback(()=>{
    if(previewContext.current)previewContext.current.invalidated=true;
    setAuthorization(null);setConfirming(false);setConfirmed(false);
  },[]);
  const invalidateAi=React.useCallback(()=>{if(previewContext.current?.source==='ai')invalidate();},[invalidate]);
  React.useEffect(()=>{invalidate();},[binding,invalidate]);
  React.useEffect(()=>{if(assistantOpen)setAssistantActivated(true);},[assistantOpen]);
  React.useEffect(()=>{onBusy(busy);},[busy,onBusy]);
  React.useEffect(()=>{onAiGenerating(generating);},[generating,onAiGenerating]);
  React.useEffect(()=>{onDirty(configText!==null);},[configText,onDirty]);
  React.useEffect(()=>{if(confirming)confirmationCheckbox.current?.focus();},[confirming]);
  const syncRunner=React.useCallback(()=>{
    if(!alive.current)return;
    const run=client.snapshot,pointer=client.pointer;
    setRunner({run,pointer,ready:client.ready});
    const context=previewContext.current;
    if(previewCertified(run)&&context?.runnerRequestId===pointer?.requestId){
      setPreviousPreview(previous=>previous?.run.runId===run.runId?previous:{run,...context});
      if(!context.invalidated&&context.binding===latestBinding.current)
        setAuthorization({runId:run.runId,configHash:run.configHash,binding:context.binding,config:context.config,previewPages:context.previewPages});
    }
  },[client]);
  React.useEffect(()=>{
    alive.current=true;
    client.restore().catch(e=>{if(alive.current)setRunnerError(e.message);}).finally(()=>{syncRunner();if(alive.current)setRecovering(false);});
    return()=>{alive.current=false;};
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
  async function startPreview(value,source='manual'){
    if(blocked||busy||(generating&&source==='manual')||runnerPending.current)return false;
    return runAction(async()=>{
      const config=globalThis.ScrapyAppModel.validateConfig(value??JSON.parse(text),{runtime:'local'});
      invalidate();
      const runnerRequestId=crypto.randomUUID();
      previewContext.current={source,config,binding:latestBinding.current,previewPages,runnerRequestId};
      await client.start({requestId:runnerRequestId,mode:'preview',config,previewPages});
      if(alive.current)setNotice('已按声明式配置试采；请核对记录和错误，再明确确认完整采集。');
    });
  }
  const certified=Boolean(authorization&&authorization.binding===binding&&!previewContext.current?.invalidated);
  function cancelConfirmation(){setConfirming(false);setConfirmed(false);panel.current?.querySelector('#runner-prepare-full')?.focus();}
  async function startFull(){
    if(!certified||!confirmed||blocked||busy||generating)return;
    const approved=authorization;
    await runAction(async()=>{
      if(approved.binding!==latestBinding.current||previewContext.current?.invalidated)throw Error('配置或目标已变化，请重新试采。');
      await client.start({requestId:crypto.randomUUID(),mode:'full',config:approved.config,previewPages:approved.previewPages,previewRunId:approved.runId,configHash:approved.configHash});
      if(alive.current){invalidate();setNotice('长任务已由你确认启动；重开应用后将查询同一 run。');}
    });
  }
  async function exportRun(format){
    if(exportPending.current)return;exportPending.current=true;setExporting(true);setRunnerError('');
    try{const result=await client.export(format);if(result?.started!==true)throw Error('导出回执未确认；请先检查下载列表，勿自动重试。');if(alive.current)setNotice('已请求导出 '+format.toUpperCase()+'，请在下载列表确认。');}
    catch(e){if(alive.current)setRunnerError(e.message);}finally{exportPending.current=false;if(alive.current)setExporting(false);}
  }
  const displayedRecords=records.runId===runner.run?.runId?records:{records:[],total:runner.run?.recordsCount||0,offset:0};
  return <section ref={panel} className="scrapy-local-runner" aria-labelledby="capture-heading">
    <div className="toolbar"><h2 id="capture-heading" tabIndex={-1}>本机采集</h2><Button id="close-local-runner" disabled={runnerBusy||generating} onClick={onClose}>返回工作区</Button></div>
    <p className="secondary">使用已保存或手填规则试采，核对后确认完整采集。</p>
    <details className="flat" open><summary>手动试采配置 JSON</summary><label htmlFor="runner-config">当前采集配置 · 本机分页上限 50 页</label><textarea id="runner-config" rows={10} disabled={editingLocked} value={text} onChange={e=>{invalidate();setConfigRevision(n=>n+1);setConfigText(e.target.value);}}/>
      <Button disabled={editingLocked} onClick={()=>{invalidate();setConfigRevision(n=>n+1);setConfigText(null);}}>使用工作区当前配置</Button>
    </details>
    <div className="runner-preview-actions"><label htmlFor="runner-preview-pages">试采页数<select id="runner-preview-pages" value={previewPages} disabled={editingLocked} onChange={e=>{invalidate();setPreviewPages(Number(e.target.value));}}>{[1,2,3].map(n=><option key={n} value={n}>{n} 页{n===3?'（默认）':''}</option>)}</select></label>
      <Button id="runner-start-preview" variant="primary" disabled={blocked||editingLocked} onClick={()=>startPreview()}>按当前配置试采</Button>
      <Button id="open-ai-assistant" disabled={runnerBusy} onClick={onAssistantOpen}>✧ AI 生成 / 纠正规则（可选）</Button>
    </div>
    {(assistantActivated||assistantOpen)&&<div hidden={!assistantOpen}><AiPanel open={open&&assistantOpen} state={state} locked={locked} pending={pending} valid={valid} onApply={onApply} onClose={onAssistantClose} onBusy={onAiBusy} onDirty={onAiDirty} onGenerating={setGenerating} onPreview={config=>startPreview(config,'ai')} onInvalidate={invalidateAi} runnerBusy={runnerBusy} runnerActive={runnerActive} runnerRun={runner.run} runnerError={runnerError}/></div>}
    {blocked&&<p className="secondary">请先处理未应用编辑、无效工作区配置或原浏览器采集操作。</p>}
    <p id="runner-notice" role="status" hidden={!notice}>{notice}</p>
    <section className="runner-card" aria-labelledby="runner-heading">
      <div className="toolbar"><h2 id="runner-heading">{runner.run?.mode==='full'?'长任务进度':'试采结果'}</h2><Button id="runner-recover" disabled={runnerBusy} onClick={()=>runAction(()=>client.restore())}>{runner.pointer?'查询原 run':'读取原 run'}</Button></div>
      <p id="runner-error" className="error" role="alert" hidden={!runnerError}>{runnerError}</p>
      {!runner.run&&<p className="secondary" role="status">{recovering?'正在读取已保存的运行指针…':runner.pointer?'正在按原 requestId 找回运行；不会重复创建。':!runner.ready?'运行指针读取失败，请读取原 run。':'尚未试采。可直接使用当前配置，无需 AI。'}</p>}
      {runner.pointer&&!runner.run&&<p className="secondary">原 requestId：{runner.pointer.requestId}</p>}
      {runner.run&&<><RunSummary run={runner.run}/><RunRecords data={displayedRecords} loading={recordsLoading} error={recordsError} onPage={readRecords}/>
        <div className="toolbar"><Button id="runner-stop" variant="danger" disabled={!runnerActive||runnerBusy} onClick={()=>runAction(()=>client.stop())}>Stop · 停止原 run</Button><Button id="runner-export-jsonl" disabled={exporting} onClick={()=>exportRun('jsonl')}>导出 JSONL</Button><Button id="runner-export-csv" disabled={exporting} onClick={()=>exportRun('csv')}>导出 CSV</Button></div>
        <details className="flat"><summary>原 run 状态详情</summary><pre>{JSON.stringify(runner.run,null,2)}</pre></details>
      </>}
      <p id="runner-certification" role="status" className="secondary">{certified?'试采认证有效；请核对记录、字段完整度与错误，再确认长任务。':'长任务需要当前配置对应的有效试采认证。'}</p>
      <Button id="runner-prepare-full" variant="primary" aria-expanded={confirming} aria-controls="runner-full-confirmation" disabled={!certified||blocked||busy||generating} onClick={()=>{setConfirming(true);setConfirmed(false);}}>核对试采，准备长任务</Button>
      <div id="runner-full-confirmation" className="confirmation" role="group" aria-label="确认长任务" hidden={!confirming} onKeyDown={event=>{if(event.key==='Escape'&&!runnerBusy){event.preventDefault();event.stopPropagation();cancelConfirmation();}}}><p>将按已试采的配置运行：{authorization?.config.url}</p><p className="secondary">试采 run：{authorization?.runId}。长任务使用原配置分页上限。</p><details><summary>确认使用的完整配置</summary><pre>{authorization?stringify(authorization.config):''}</pre></details><label className="check"><input ref={confirmationCheckbox} id="runner-confirm-result" type="checkbox" checked={confirmed} disabled={runnerBusy} onChange={e=>setConfirmed(e.target.checked)}/>我已核对试采记录、字段完整度和错误，确认开始。</label><div className="toolbar"><Button id="runner-start-full" variant="primary" disabled={!confirmed||!certified||blocked||busy||generating} onClick={startFull}>确认并开始长任务</Button><Button id="runner-cancel-full" disabled={runnerBusy} onClick={cancelConfirmation}>取消</Button></div></div>
    </section>
    {previousPreview&&previousPreview.run.runId!==runner.run?.runId&&<details className="runner-card"><summary>保留的有效试采 · {previousPreview.run.runId}</summary><RunSummary run={previousPreview.run}/>
      {previousPreview.records&&<pre>{stringify(previousPreview.records.records)}</pre>}<p className="secondary">历史试采仅供对照；当前认证以上方状态为准。</p></details>}
  </section>;
}
