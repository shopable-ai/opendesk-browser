import * as React from 'react';
import {Button,SharedConversationFrame,createConversationSession} from '@opendesk/ui';
import {instructions,parseProposal,changes,sameConfig} from './ai-config.js';
import {createAiRequest,requireGeneration} from './ai-request.js';
import {createAiPending} from './ai-pending.js';

const format=value=>value===undefined?'（无）':JSON.stringify(value,null,2);
function Difference({row}){return <li><strong>{row.kind} · {row.key}</strong>{row.kind!=='保留'&&<div className="ai-before-after"><div>原值<pre>{format(row.before)}</pre></div><div>新值<pre>{format(row.after)}</pre></div></div>}</li>;}

export default function AiPanel({open=true,state,locked,pending,valid,onApply,onClose,onBusy,onDirty}){
  const tool=globalThis.OpenDeskTool;
  // This is the same presentation store used by Chat, scoped to this sandbox.
  // Its labels are UI identity only; ai.* remains the sole authority boundary.
  const [chat]=React.useState(()=>createConversationSession({identity:{consumerId:'scrapyjs-config',
    instanceId:crypto.randomUUID(),hostInstanceId:'sandbox-presentation'}}));
  const conversation=React.useSyncExternalStore(chat.subscribe,chat.getSnapshot);
  const requirement=conversation.draft;
  const setRequirement=value=>chat.update({draft:value});
  const append=(speaker,message)=>chat.append(speaker,message);
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
  const exportPending=React.useRef(false);
  const [processedInput,setProcessedInput]=React.useState('');
  const active=React.useRef(null),alive=React.useRef(true);
  const blocked=locked||pending||!valid;
  React.useEffect(()=>()=>chat.dispose(),[chat]);
  React.useEffect(()=>{alive.current=true;tool.request('ai.info',{}).then(info=>{if(alive.current)setRecipient(info);}).catch(e=>{if(alive.current)setError(e.message);});return()=>{alive.current=false;active.current?.cancel({release:false}).catch(()=>{});};},[tool]);
  React.useEffect(()=>{
    let current=true;
    pendingIdentity.read().then(({value})=>{if(!current)return;setPendingReady(true);if(value){setPendingId(value.requestId);setUnknown(true);busy(true);setNotice('存在未决原请求，请查询 / 停止原请求；不会重新发送。');}}).catch(e=>{if(current)setError(e.message);});
    return()=>{current=false;};
  },[pendingIdentity]);
  const inputKey=JSON.stringify({requirement,sample,usePage,useConfig});
  React.useEffect(()=>{onDirty(Boolean(draft)||(Boolean(requirement||sample)&&inputKey!==processedInput));},[requirement,sample,draft,inputKey,processedInput,onDirty]);
  function busy(value){setWorking(value);onBusy(value);}
  async function generate(){
    if(working||unknown||!pendingReady||pendingId||blocked||!recipient||!requirement.trim()||!usePage||!state.target)return;
    const id=crypto.randomUUID(),base=structuredClone(state.config),epoch=state.profileEpoch;
    const page={title:state.target.title,url:state.target.url};
    const context={page,currentConfig:useConfig?base:{url:page.url,itemConfig:{title:'.::text'}},sample,previousError:error||state.error||''};
    const operation=createAiRequest((op,args)=>tool.request(op,args),{requestId:id,request:requirement.trim(),instructions,
      context},setRecipient,pendingIdentity);
    append('你',requirement.trim());
    setRequestContext(context);
    setPendingId(id);
    active.current=operation;busy(true);setUnknown(false);setDraft(null);setError('');setNotice('正在等待发送审阅与真实 AI 返回…');
    try{
      const result=await operation.run();
      if(!alive.current||active.current!==operation)return;
      if(!result){setNotice('原 AI 请求已结束；停止后返回的内容未应用。');return;}
      const config=parseProposal(result.proposal,globalThis.ScrapyAppModel.validateConfig,page.url);
      setDraft({config,base,epoch,page,input:JSON.stringify({requirement,sample,usePage,useConfig}),requestId:id,generation:result.providerGeneration,metadata:result.metadata});
      const summary=changes(base,config).fields.filter(row=>row.kind!=='保留').map(row=>row.kind+' '+row.key).join('、');
      append('助手','配置提案已通过格式与目标校验'+(summary?'：'+summary:'')+'。请审阅完整差异后明确应用；尚未保存或采集。');
      setNotice('配置格式与目标校验通过；选择器将在单独开始采集时验证。');
    }catch(e){if(alive.current&&active.current===operation){setError(e.message);append('系统',e.message);if(operation.unknown){setUnknown(true);setNotice('原请求结果未知，暂不允许重新生成。可编辑下次需求；请查询 / 停止原请求。');
      if(!operation.dispatched){try{const {value}=await pendingIdentity.read();if(alive.current&&active.current===operation&&value&&value.requestId!==operation.id){active.current=null;setPendingId(value.requestId);}}catch{}}
      return;}setNotice(e.code==='E_CANCELLED'?'本次发送已取消；输入与原配置已保留。':'生成或配置校验失败，需求、样本和原配置已保留。');}}
    finally{if(alive.current&&active.current===operation&&!operation.unknown){active.current=null;setPendingId(null);busy(false);}}
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
          active.current=null;setPendingId(null);busy(false);setUnknown(false);append('系统','原 AI 请求已确认结束；停止后内容未应用。');setNotice(reply.state==='cancelled'?'已确认停止原 AI 请求；未应用配置。':'原 AI 请求已结束；停止后内容未应用。');
        }else{setUnknown(true);setNotice('停止结果尚未确认，请查询 / 停止原请求；返回内容不会应用。');}
      }
    }
    catch(e){if(alive.current&&active.current===operation){setError(e.message);setUnknown(true);setNotice('停止结果尚未确认，请查询 / 停止原请求。');}}
  }
  const stale=draft&&(draft.input!==JSON.stringify({requirement,sample,usePage,useConfig})||draft.epoch!==state.profileEpoch||!sameConfig(draft.base,state.config)||draft.page.url!==state.target?.url);
  async function apply(){
    if(!draft||blocked||stale||working||unknown||pendingId||!pendingReady)return;
    busy(true);
    try{const current=await tool.request('ai.info',{});if(requireGeneration(current.generation)!==requireGeneration(draft.generation))throw Error('AI Provider 已变化，请重新生成。');
      onApply(draft.config,draft.base,draft.epoch,draft.page);setDraft(null);setProcessedInput(inputKey);setNotice('已应用为未保存草稿；返回工作区命名保存或导出，然后明确点击「开始采集」。');}
    catch(e){setError(e.message);}finally{busy(false);}
  }
  async function exportDraft(){if(exportPending.current)return;exportPending.current=true;setExporting(true);setError('');setNotice('');try{const r=await tool.request('browser.downloads.text',{text:JSON.stringify(draft.config,null,2),filename:'scrapyjs-ai-config.json'});if(r?.started!==true)throw Error('下载结果未知');setNotice('已请求下载配置 JSON，请在下载列表确认。');}catch(e){setNotice('');setError(e.message);}finally{exportPending.current=false;setExporting(false);}}
  const diff=draft?changes(draft.base,draft.config):null;
  const editingLocked=working&&!unknown;
  const previewContext=working&&requestContext?requestContext:{page:state.target,currentConfig:useConfig?state.config:{url:state.target?.url,itemConfig:{title:'.::text'}},previousError:error||state.error||''};
  const nextPage=editingLocked&&requestContext?requestContext.page:state.target;
  return <section className="ai-workspace" aria-labelledby="ai-heading">
    <div className="toolbar"><h2 id="ai-heading" tabIndex={-1}>AI 配置助手</h2><Button id="close-ai" disabled={working} onClick={onClose}>返回工作区</Button></div>
    <p className="secondary">复用共享 AI 对话，生成的提案经审阅后应用，再命名保存。采集需要单独开始。</p>
    <details className="flat" open><summary>发送资料</summary><fieldset disabled={editingLocked}><legend>{editingLocked?'本次发送的资料':'下次待发送的资料'}</legend>
      <label className="check"><input type="checkbox" id="ai-use-page" checked={usePage} onChange={e=>setUsePage(e.target.checked)}/>当前网页标题与网址（必选）</label>
      <p className="secondary">{nextPage?.title||'请刷新当前网页'} · {nextPage?.url||''}</p>
      <label className="check"><input type="checkbox" id="ai-use-config" checked={useConfig} onChange={e=>setUseConfig(e.target.checked)}/>在当前配置基础上修改（发送完整规则）</label>
      <details className="flat"><summary>可选 · 提供必要 HTML 样本</summary><label htmlFor="ai-sample">只提供采集所需的结构，移除密码、Token 和私人数据</label><textarea id="ai-sample" rows={5} maxLength={12000} value={sample} onChange={e=>setSample(e.target.value)}/><p className="secondary">不会自动读取网页正文、Cookie 或表单值。</p></details>
    </fieldset></details>
    <details className="flat"><summary>查看{working&&requestContext?'本次':'下次'}配置与错误资料</summary><pre>{JSON.stringify(previewContext,null,2)}</pre></details>
    <details className="flat"><summary>共享 AI · {recipient?[recipient.provider,recipient.model].filter(Boolean).join(' · '):'当前不可用'}</summary>
      <p className="secondary" id="ai-recipient">接收方：{recipient?[recipient.provider,recipient.model,recipient.endpoint].filter(Boolean).join(' · '):'共享 Provider 未就绪。本地调试不开放真实 AI；推理仍需原安装授权。'}</p>
    </details>
    {pendingId&&<p id="ai-request-status" role="status">未决 requestId：{pendingId} · 状态：{unknown?'unknown':'pending'}</p>}
    {blocked&&<p className="secondary">请先处理未应用的编辑、无效 JSON 或正在进行的配置/采集操作。</p>}
    <div className="ai-chat" aria-label="AI 配置对话">
      <SharedConversationFrame open={open} rows={conversation.rows} draft={requirement}
        busy={working&&!unknown} blocked={unknown||pendingId!==null||!pendingReady||blocked}
        inputDisabled={editingLocked} canSend={Boolean(recipient&&usePage&&state.target)}
        inputId="ai-requirement" inputLabel="采集需求 / 纠正要求" sendId="ai-generate" stopId="ai-cancel"
        placeholder="例如：保留全部规则，增加与 title 相同的 column_title，只采当前页。"
        emptyPrompt="描述需要生成或修改的采集规则。" onDraftChange={setRequirement}
        onSend={generate} onStop={cancel}
        feedback={<><p role="status" hidden={!notice}>{notice}</p><p role="alert" className="error" hidden={!error}>{error}</p>
          {unknown&&<Button id="ai-cancel" onClick={cancel}>查询 / 停止原请求</Button>}</>}/>
    </div>
    {draft&&<div className="ai-review stack" aria-label="生成配置审阅">
      <h2>审阅配置</h2><p className="secondary">目标：{draft.config.url}</p>
      <ul className="ai-diff">{diff.fields.map(row=><Difference key={row.key} row={row}/>)}{diff.listChanged&&<Difference row={{key:'列表选择器',kind:'修改',before:diff.listBefore,after:diff.listAfter}}/>}{diff.optionChanges.map(row=><Difference key={row.key} row={row}/>)}</ul>
      <label htmlFor="ai-config-preview">生成的完整 JSON（只读）</label><textarea id="ai-config-preview" rows={10} readOnly value={JSON.stringify(draft.config,null,2)}/>
      {stale&&<p role="alert" className="error">需求、资料、原配置或当前网页已变化，请重新生成；不会覆盖新草稿。</p>}
      <div className="toolbar"><Button id="ai-apply" variant="primary" disabled={blocked||working||unknown||pendingId!==null||!pendingReady||stale} onClick={apply}>应用为配置草稿</Button><Button id="ai-export" disabled={working||exporting} onClick={exportDraft}>导出生成配置</Button><Button disabled={working} onClick={()=>{setDraft(null);setProcessedInput(inputKey);setNotice('已放弃生成草稿；需求和样本仍保留。');}}>放弃生成草稿</Button></div>
      <details className="flat"><summary>AI 调用记录</summary><pre>{JSON.stringify({requestId:draft.requestId,providerGeneration:draft.generation,metadata:draft.metadata},null,2)}</pre></details>
    </div>}
  </section>;
}
