import * as React from 'react';
import {Button} from '@opendesk/ui';
import {instructions,parseProposal,changes,sameConfig} from './ai-config.js';
import {createAiRequest,requireGeneration} from './ai-request.js';

const format=value=>value===undefined?'（无）':JSON.stringify(value,null,2);
function Difference({row}){return <li><strong>{row.kind} · {row.key}</strong>{row.kind!=='保留'&&<div className="ai-before-after"><div>原值<pre>{format(row.before)}</pre></div><div>新值<pre>{format(row.after)}</pre></div></div>}</li>;}

export default function AiPanel({state,locked,pending,valid,onApply,onClose,onBusy,onDirty}){
  const tool=globalThis.OpenDeskTool;
  const [requirement,setRequirement]=React.useState('');
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
  const exportPending=React.useRef(false);
  const [processedInput,setProcessedInput]=React.useState('');
  const active=React.useRef(null),alive=React.useRef(true);
  const blocked=locked||pending||!valid;
  React.useEffect(()=>{alive.current=true;tool.request('ai.info',{}).then(info=>{if(alive.current)setRecipient(info);}).catch(e=>{if(alive.current)setError(e.message);});return()=>{alive.current=false;active.current?.cancel().catch(()=>{});};},[tool]);
  const inputKey=JSON.stringify({requirement,sample,usePage,useConfig});
  React.useEffect(()=>{onDirty(Boolean(draft)||(Boolean(requirement||sample)&&inputKey!==processedInput));},[requirement,sample,draft,inputKey,processedInput,onDirty]);
  function busy(value){setWorking(value);onBusy(value);}
  async function generate(){
    if(working||blocked||!requirement.trim()||!usePage||!state.target)return;
    const id=crypto.randomUUID(),base=structuredClone(state.config),epoch=state.profileEpoch;
    const page={title:state.target.title,url:state.target.url};
    const operation=createAiRequest((op,args)=>tool.request(op,args),{requestId:id,request:requirement.trim(),instructions,
      context:{page,currentConfig:useConfig?base:{url:page.url,itemConfig:{title:'.::text'}},sample,previousError:error||state.error||''}},setRecipient);
    active.current=operation;busy(true);setUnknown(false);setDraft(null);setError('');setNotice('正在等待发送审阅与真实 AI 返回…');
    try{
      const result=await operation.run();
      if(!alive.current||active.current!==operation)return;
      if(!result){setNotice('原 AI 请求已结束；停止后返回的内容未应用。');return;}
      const config=parseProposal(result.proposal,globalThis.ScrapyAppModel.validateConfig,page.url);
      setDraft({config,base,epoch,page,input:JSON.stringify({requirement,sample,usePage,useConfig}),requestId:id,generation:result.providerGeneration,metadata:result.metadata});
      setNotice('配置格式与目标校验通过；选择器将在单独开始采集时验证。');
    }catch(e){if(alive.current&&active.current===operation){setError(e.message);if(operation.unknown){setUnknown(true);setNotice('原请求结果未知，暂不允许重新生成。请查询 / 停止原请求；输入与原配置已保留。');return;}setNotice(e.code==='E_CANCELLED'?'本次发送已取消；输入与原配置已保留。':'生成或配置校验失败，需求、样本和原配置已保留。');}}
    finally{if(alive.current&&active.current===operation&&!operation.unknown){active.current=null;busy(false);}}
  }
  async function cancel(){
    if(!active.current)return;
    const operation=active.current;setNotice('正在停止原 AI 请求…');
    try{const reply=await operation.cancel();if(alive.current&&active.current===operation){if(['cancelled','completed','failed'].includes(reply.state)){active.current=null;busy(false);setUnknown(false);setNotice(reply.state==='cancelled'?'已确认停止原 AI 请求；未应用配置。':'原 AI 请求已结束；停止后内容未应用。');}else{setUnknown(true);setNotice('停止结果尚未确认，请查询 / 停止原请求；返回内容不会应用。');}}}
    catch(e){if(alive.current&&active.current===operation){setError(e.message);setUnknown(true);setNotice('停止结果尚未确认，请查询 / 停止原请求。');}}
  }
  const stale=draft&&(draft.input!==JSON.stringify({requirement,sample,usePage,useConfig})||draft.epoch!==state.profileEpoch||!sameConfig(draft.base,state.config)||draft.page.url!==state.target?.url);
  async function apply(){
    if(!draft||blocked||stale||working)return;
    busy(true);
    try{const current=await tool.request('ai.info',{});if(requireGeneration(current.generation)!==requireGeneration(draft.generation))throw Error('AI Provider 已变化，请重新生成。');
      onApply(draft.config,draft.base,draft.epoch,draft.page);setDraft(null);setProcessedInput(inputKey);setNotice('已应用为未保存草稿；返回工作区命名保存或导出，然后明确点击「开始采集」。');}
    catch(e){setError(e.message);}finally{busy(false);}
  }
  async function exportDraft(){if(exportPending.current)return;exportPending.current=true;setExporting(true);setError('');setNotice('');try{const r=await tool.request('browser.downloads.text',{text:JSON.stringify(draft.config,null,2),filename:'scrapyjs-ai-config.json'});if(r?.started!==true)throw Error('下载结果未知');setNotice('已请求下载配置 JSON，请在下载列表确认。');}catch(e){setNotice('');setError(e.message);}finally{exportPending.current=false;setExporting(false);}}
  const diff=draft?changes(draft.base,draft.config):null;
  return <section className="ai-workspace" aria-labelledby="ai-heading">
    <div className="toolbar"><h2 id="ai-heading" tabIndex={-1}>AI 配置助手</h2><Button id="close-ai" disabled={working} onClick={onClose}>返回工作区</Button></div>
    <p className="secondary">描述字段或修改要求，审阅生成的配置后应用。</p>
    <label htmlFor="ai-requirement">采集需求 / 纠正要求</label><textarea id="ai-requirement" rows={3} maxLength={3000} disabled={working} value={requirement} placeholder="例如：保留现有规则，增加作者和价格字段；只采集当前页。" onChange={e=>setRequirement(e.target.value)}/>
    <fieldset disabled={working}><legend>本次发送的资料</legend>
      <label className="check"><input type="checkbox" id="ai-use-page" checked={usePage} onChange={e=>setUsePage(e.target.checked)}/>当前网页标题与网址（必选）</label>
      <p className="secondary">{state.target?.title||'请刷新当前网页'} · {state.target?.url||''}</p>
      <label className="check"><input type="checkbox" id="ai-use-config" checked={useConfig} onChange={e=>setUseConfig(e.target.checked)}/>在当前配置基础上修改（发送完整规则）</label>
      <details className="flat"><summary>可选 · 提供必要 HTML 样本</summary><label htmlFor="ai-sample">只提供采集所需的结构，移除密码、Token 和私人数据</label><textarea id="ai-sample" rows={5} maxLength={12000} value={sample} onChange={e=>setSample(e.target.value)}/><p className="secondary">不会自动读取网页正文、Cookie 或表单值。</p></details>
    </fieldset>
    <details className="flat"><summary>查看本次配置与错误资料</summary><pre>{JSON.stringify({currentConfig:useConfig?state.config:{url:state.target?.url,itemConfig:{title:'.::text'}},previousError:error||state.error||''},null,2)}</pre></details>
    <p className="secondary" id="ai-recipient">接收方：{recipient?[recipient.provider,recipient.model,recipient.endpoint].filter(Boolean).join(' · '):'读取中'}</p>
    <div className="toolbar"><Button id="ai-generate" variant="primary" disabled={working||blocked||!requirement.trim()||!usePage||!state.target} onClick={generate}>{unknown?'原请求待确认':working?'生成中…':error?'纠正并重新生成':'生成配置草稿'}</Button><Button id="ai-cancel" disabled={!working||!active.current} onClick={cancel}>{unknown?'查询 / 停止原请求':'停止生成'}</Button></div>
    {blocked&&<p className="secondary">请先处理未应用的编辑、无效 JSON 或正在进行的配置/采集操作。</p>}
    <p role="status" hidden={!notice}>{notice}</p><p role="alert" className="error" hidden={!error}>{error}</p>
    {draft&&<div className="ai-review stack" aria-label="生成配置审阅">
      <h2>审阅配置</h2><p className="secondary">目标：{draft.config.url}</p>
      <ul className="ai-diff">{diff.fields.map(row=><Difference key={row.key} row={row}/>)}{diff.listChanged&&<Difference row={{key:'列表选择器',kind:'修改',before:diff.listBefore,after:diff.listAfter}}/>}{diff.optionChanges.map(row=><Difference key={row.key} row={row}/>)}</ul>
      <label htmlFor="ai-config-preview">生成的完整 JSON（只读）</label><textarea id="ai-config-preview" rows={10} readOnly value={JSON.stringify(draft.config,null,2)}/>
      {stale&&<p role="alert" className="error">需求、资料、原配置或当前网页已变化，请重新生成；不会覆盖新草稿。</p>}
      <div className="toolbar"><Button id="ai-apply" variant="primary" disabled={blocked||working||stale} onClick={apply}>应用为配置草稿</Button><Button id="ai-export" disabled={working||exporting} onClick={exportDraft}>导出生成配置</Button><Button disabled={working} onClick={()=>{setDraft(null);setProcessedInput(inputKey);setNotice('已放弃生成草稿；需求和样本仍保留。');}}>放弃生成草稿</Button></div>
      <details className="flat"><summary>AI 调用记录</summary><pre>{JSON.stringify({requestId:draft.requestId,providerGeneration:draft.generation,metadata:draft.metadata},null,2)}</pre></details>
    </div>}
  </section>;
}
