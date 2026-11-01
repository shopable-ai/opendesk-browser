import * as React from 'react';
import {Button,Textarea,SharedConversationFrame,SharedConversationDock,createConversationSession} from '@opendesk/ui';
import {instructions,prepareListProposal,changes,sameConfig} from './ai-config.js';
import {resolveAiReply} from './ai-actions.js';
import {createAiRequest,requireGeneration} from './ai-request.js';
import {createAiPending} from './ai-pending.js';

const format=value=>value===undefined?'（无）':JSON.stringify(value,null,2);
function Difference({row}){return <li><strong>{row.kind} · {row.key}</strong>{row.kind==='新增'||row.kind==='删除'
  ?<pre className="ai-change-value" aria-label={row.kind==='新增'?'新值':'原值'}>{format(row.kind==='新增'?row.after:row.before)}</pre>
  :row.kind!=='保留'&&<div className="ai-before-after"><div>原值<pre>{format(row.before)}</pre></div><div>新值<pre>{format(row.after)}</pre></div></div>}</li>;}

export default function AiPanel({open=true,state,captureStatus,savedRequestId,locked,pending,valid,onApply,onNavigate,onClose,onBusy,onDirty}){
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
  const [usePage,setUsePage]=React.useState(true);
  const [useConfig,setUseConfig]=React.useState(true);
  const [recipient,setRecipient]=React.useState(null);
  const [working,setWorking]=React.useState(false);
  const [draft,setDraft]=React.useState(null);
  const [error,setError]=React.useState('');
  const [notice,setNotice]=React.useState('');
  const [appliedRequestId,setAppliedRequestId]=React.useState(null);
  const [appliedConfig,setAppliedConfig]=React.useState(null);
  const [unknown,setUnknown]=React.useState(false);
  const [exporting,setExporting]=React.useState(false);
  const [requestContext,setRequestContext]=React.useState(null);
  const [pendingId,setPendingId]=React.useState(null);
  const [pendingReady,setPendingReady]=React.useState(false);
  const pendingIdentity=React.useMemo(()=>createAiPending((op,args)=>tool.request(op,args)),[tool]);
  const exportPending=React.useRef(false);
  const [processedInput,setProcessedInput]=React.useState('');
  const active=React.useRef(null),alive=React.useRef(true);
  const log=React.useRef(null);
  const review=React.useRef(null),revealedProposal=React.useRef(null);
  const followMessages=React.useRef(true),lastRows=React.useRef(conversation.rows);
  const [transcriptTarget,setTranscriptTarget]=React.useState(null);
  const [composerTarget,setComposerTarget]=React.useState(null);
  // Reveal a new proposal in this local scroller, without moving keyboard focus.
  // Reopening an already reviewed proposal preserves the reader's position.
  React.useLayoutEffect(()=>{
    const node=log.current;if(!open||!node)return;
    if(draft&&review.current&&revealedProposal.current!==draft.requestId){
      node.scrollTop+=review.current.getBoundingClientRect().top-node.getBoundingClientRect().top;
      revealedProposal.current=draft.requestId;
    }else if(lastRows.current!==conversation.rows&&followMessages.current){node.scrollTop=node.scrollHeight;}
    lastRows.current=conversation.rows;
  },[open,draft,conversation.rows]);
  const blocked=locked||pending||!valid;
  React.useEffect(()=>()=>chat.dispose(),[chat]);
  React.useEffect(()=>{alive.current=true;tool.request('ai.info',{}).then(info=>{if(alive.current)setRecipient(info);}).catch(e=>{if(alive.current)setError(e.message);});return()=>{alive.current=false;active.current?.cancel({release:false}).catch(()=>{});};},[tool]);
  React.useEffect(()=>{
    let current=true;
    pendingIdentity.read().then(({value})=>{if(!current)return;setPendingReady(true);if(value){setPendingId(value.requestId);setUnknown(true);busy(true);setNotice('存在未决原请求，请查询 / 停止原请求；不会重新发送。');}}).catch(e=>{if(current)setError(e.message);});
    return()=>{current=false;};
  },[pendingIdentity]);
  const inputKey=JSON.stringify({requirement,sample,usePage,useConfig});
  const latestContext=React.useRef(null),localOperation=React.useRef(null);
  latestContext.current={state,inputKey,blocked,unknown,pendingId,pendingReady,draft};
  function stillCurrent(snapshot){
    const latest=latestContext.current;
    return alive.current&&!latest.blocked&&!latest.unknown&&!latest.pendingId&&latest.pendingReady&&
      snapshot.input===latest.inputKey&&snapshot.epoch===latest.state.profileEpoch&&
      sameConfig(snapshot.base,latest.state.config)&&snapshot.page.url===latest.state.target?.url;
  }
  React.useEffect(()=>{onDirty(Boolean(draft)||(Boolean(requirement||sample)&&inputKey!==processedInput));},[requirement,sample,draft,inputKey,processedInput,onDirty]);
  function busy(value){setWorking(value);onBusy(value);}
  async function prepareList(){
    if(working||active.current||localOperation.current||unknown||!pendingReady||pendingId||blocked||!state.target||(draft&&!stale))return;
    const operation={},snapshot={base:structuredClone(state.config),epoch:state.profileEpoch,
      page:{title:state.target.title,url:state.target.url},input:inputKey,requestId:crypto.randomUUID(),source:'local-list'};
    let unresolved=false;
    localOperation.current=operation;busy(true);setError('');setNotice('');setDraft(null);setAppliedRequestId(null);
    try{
      const {value}=await pendingIdentity.read();
      if(!stillCurrent(snapshot)||localOperation.current!==operation)return;
      if(value){unresolved=true;setPendingId(value.requestId);setUnknown(true);setNotice('存在未决原请求，请查询 / 停止原请求；不会重新发送。');return;}
      const result=await prepareListProposal(snapshot.base,globalThis.ScrapyAppModel.validateConfig,snapshot.page.url,sample);
      if(!stillCurrent(snapshot)||localOperation.current!==operation)return;
      if(result.status!=='ready'){
        setError((result.diagnostics||[]).map(row=>row.message).join('；')||'无法准备列表，请检查完整字段和 HTML 样本。');return;
      }
      setDraft({...snapshot,config:result.config});
      setNotice('本地列表准备完成；请审阅差异后应用为未保存草稿。');
    }catch(e){if(stillCurrent(snapshot)&&localOperation.current===operation)setError(e.message);}
    finally{if(localOperation.current===operation){localOperation.current=null;if(alive.current&&!unresolved)busy(false);}}
  }
  async function generate(){
    if(working||active.current||localOperation.current||unknown||!pendingReady||pendingId||blocked||!recipient||!requirement.trim()||!state.target||(draft&&!stale))return;
    const id=crypto.randomUUID(),base=structuredClone(state.config),epoch=state.profileEpoch;
    const page={title:state.target.title,url:state.target.url};
    const context={page:usePage?page:{url:base.url},currentConfig:useConfig?base:{url:base.url},sample,previousError:error||state.error||''};
    const operation=createAiRequest((op,args)=>tool.request(op,args),{requestId:id,request:requirement.trim(),instructions,
      context},setRecipient,pendingIdentity);
    append('你',requirement.trim());
    setRequestContext(context);
    setPendingId(id);
    active.current=operation;busy(true);setUnknown(false);setDraft(null);setAppliedRequestId(null);setError('');setNotice('正在等待发送审阅与真实 AI 返回…');
    try{
      const result=await operation.run();
      if(!alive.current||active.current!==operation)return;
      if(!result){setNotice('原 AI 请求已结束；停止后返回的内容未应用。');return;}
      const reply=resolveAiReply(result.proposal,{base,expectedUrl:usePage?page.url:base.url,
        validate:globalThis.ScrapyAppModel.validateConfig,changes,hasSample:Boolean(sample.trim()),allowFullConfig:useConfig});
      if(reply.type!=='proposal'){
        append('助手',reply.message+(reply.missing.length?'\n需要补充：'+reply.missing.join('、'):'')+'\n（未修改配置，未执行采集。）');
        setProcessedInput(inputKey);setNotice('');return;
      }
      if(!reply.actions.length){
        append('助手','提案与当前配置没有差异；未修改配置，也未运行采集。');
        setProcessedInput(inputKey);setNotice('');return;
      }
      setDraft({config:reply.config,actions:reply.actions,warnings:reply.warnings,base,epoch,page,
        input:JSON.stringify({requirement,sample,usePage,useConfig}),requestId:id,
        generation:result.providerGeneration,metadata:result.metadata});
      append('助手','已生成 '+reply.actions.length+' 项受控配置变更：'+reply.actions.join('、')+
        '。请审阅并确认应用；规则尚未通过实际网页采集验证，也尚未保存或执行。');
      setNotice('');
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
    if(!draft||blocked||stale||working||active.current||localOperation.current||unknown||pendingId||!pendingReady)return;
    const proposal=draft,operation={};localOperation.current=operation;
    let unresolved=false;
    busy(true);
    try{
      if(proposal.source==='local-list'){
        const {value}=await pendingIdentity.read();
        if(!stillCurrent(proposal)||latestContext.current.draft!==proposal)return;
        if(value){unresolved=true;setPendingId(value.requestId);setUnknown(true);setNotice('存在未决原请求，请查询 / 停止原请求；不会应用配置。');return;}
      }else{
        const info=await tool.request('ai.info',{});
        if(requireGeneration(info.generation)!==requireGeneration(proposal.generation))throw Error('AI Provider 已变化，请重新生成。');
      }
      if(!stillCurrent(proposal)||latestContext.current.draft!==proposal)return;
      onApply(proposal.config,proposal.base,proposal.epoch,proposal.page,proposal.requestId);setAppliedRequestId(proposal.requestId);setAppliedConfig(structuredClone(proposal.config));setDraft(null);setProcessedInput(inputKey);setNotice('已应用为未保存草稿；请在采集配置中命名保存。采集仍需单独点击「开始采集」。');}
    catch(e){if(alive.current)setError(e.message);}finally{localOperation.current=null;if(alive.current&&!unresolved)busy(false);}
  }
  async function exportDraft(){if(exportPending.current)return;exportPending.current=true;setExporting(true);setError('');setNotice('');try{const r=await tool.request('browser.downloads.text',{text:JSON.stringify(draft.config,null,2),filename:'scrapyjs-ai-config.json'});if(r?.started!==true)throw Error('下载结果未知');setNotice('已请求下载配置 JSON，请在下载列表确认。');}catch(e){setNotice('');setError(e.message);}finally{exportPending.current=false;setExporting(false);}}
  const diff=draft?changes(draft.base,draft.config):null;
  const editingLocked=working&&!unknown;
  const previewContext=working&&requestContext?requestContext:{page:state.target?{title:state.target.title,url:state.target.url}:null,currentConfig:useConfig?state.config:{url:state.config.url},sample,previousError:error||state.error||''};
  const nextPage=editingLocked&&requestContext?requestContext.page:state.target;
  const appliedStale=Boolean(appliedRequestId&&appliedConfig&&!sameConfig(appliedConfig,state.config));
  const feedback=appliedStale?'应用后配置已被其他编辑修改，请核对当前规则再单独保存。':appliedRequestId&&savedRequestId===appliedRequestId?'此提案的配置已保存；采集仍需单独点击「开始采集」。':notice;
  const phase=unknown?'原请求待确认':working?'生成中':draft?(stale?'提案已过期':'待审阅'):appliedRequestId?(savedRequestId===appliedRequestId?'配置已保存':'待保存配置'):!state.target?'等待网页':'就绪';
  const composerHint=unknown?'原请求结果待确认，请查询或停止原请求。':working?'正在生成，可停止原请求。':blocked?'请先处理业务中的未应用编辑、无效配置或正在进行的操作。':!pendingReady?'正在读取原请求状态…':!recipient?'共享 AI 尚未就绪，请查看资料与诊断。':!state.target?'请先刷新当前网页信息。':'';
  const changedFields=diff?.fields.filter(row=>row.kind!=='保留')||[];
  const retainedFields=diff?.fields.filter(row=>row.kind==='保留')||[];
  const changeCount=changedFields.length+(diff?.listChanged?1:0)+(diff?.optionChanges.length||0);
  return <SharedConversationDock id="chat-ai-panel" className="ai-workspace" aria-label="AI 采集助手对话" open={open} onClose={onClose} expandedFeedback={Boolean(draft||error||unknown)}
    toolbar={<div className="ai-dock-heading"><h2 id="chat-ai-heading">AI 采集助手</h2><span id="ai-phase" role="status">{phase}</span></div>} onKeyDown={event=>{
    if(event.key==='Escape'&&!event.nativeEvent.isComposing&&event.nativeEvent.keyCode!==229){event.preventDefault();event.stopPropagation();onClose();}
  }}>
    <div className="ai-chat"><div className="ai-scroll" ref={log} onScroll={event=>{const node=event.currentTarget;followMessages.current=node.scrollHeight-node.clientHeight-node.scrollTop<32;}}>
    {pendingId&&<p id="chat-ai-request-status" role="status">未决 requestId：{pendingId} · 状态：{unknown?'unknown':'pending'}</p>}
    {state.clientRequestId&&<div id="chat-ai-capture-status" className="ai-capture-status" role="status">
      <strong>采集任务实际状态</strong>
      <p>{captureStatus||'正在等待采集任务的实际回执'}</p>
      <p className="secondary">宿主：{state.snapshot?.status||state.host||'未报告'} · 引擎：{state.result?.engine?.status||state.snapshot?.engineStatus||state.engine||'未报告'}</p>
      <p className="secondary">这里只显示原业务返回的状态；运行结束不等于已获得有效数据。完整结果请在「采集结果」核对。</p>
    </div>}
    {blocked&&<p className="od-note secondary">请先处理未应用的编辑、无效 JSON 或正在进行的配置/采集操作。</p>}
    <div ref={setTranscriptTarget} className="od-conversation-log ai-transcript" role="log" aria-live="polite" aria-label="对话及已核实操作结果"/>
    <p id="chat-ai-feedback" role="status" hidden={!feedback}>{feedback}</p><p role="alert" className="error" hidden={!error}>{error}</p>
    {unknown&&<Button base="aria" id="chat-ai-query-original" onClick={cancel}>查询 / 停止原请求</Button>}
    {draft&&<div id="chat-ai-review" ref={review} className="ai-review stack" aria-label="生成配置审阅">
      <div className="toolbar"><h2 className="od-page-title">{draft.source==='local-list'?'本地列表准备 · 审阅配置':'审阅配置'}</h2><span className="secondary">{changeCount} 项变更 · 尚未应用</span></div><p className="od-note secondary">目标：{draft.config.url}</p>
      {(draft.warnings||[]).map((message,index)=><p key={index} role="status" className="od-note secondary ai-unverified">{message}</p>)}
      <details id="ai-review-details" className="od-disclosure od-disclosure--flat">
        <summary>查看具体差异与完整 JSON（{changeCount} 项）</summary>
        <div className="disclosure-body">
      <ul className="ai-diff">{changedFields.map(row=><Difference key={row.key} row={row}/>)}{diff.listChanged&&<Difference row={{key:'列表选择器',kind:'修改',before:diff.listBefore,after:diff.listAfter}}/>}{diff.optionChanges.map(row=><Difference key={row.key} row={row}/>)}</ul>
      {retainedFields.length>0&&<details id="ai-retained-fields" className="od-disclosure od-disclosure--flat"><summary>保持不变的字段 · {retainedFields.length}</summary><ul className="ai-diff disclosure-body">{retainedFields.map(row=><Difference key={row.key} row={row}/>)}</ul></details>}
      <details id="chat-ai-json" className="od-disclosure od-disclosure--flat"><summary>生成的完整 JSON（只读）</summary><div className="disclosure-body"><label className="sr-only" htmlFor="chat-ai-config-preview">生成的完整 JSON</label><Textarea className="od-field scrapy-code" id="chat-ai-config-preview" rows={6} readOnly value={JSON.stringify(draft.config,null,2)}/></div></details>
        </div>
      </details>
      {stale&&<p role="alert" className="error">需求、资料、原配置或当前网页已变化，请重新生成；不会覆盖新草稿。</p>}
    </div>}
    <details id="ai-advanced" className="od-disclosure od-disclosure--flat"><summary>更多资料与诊断{sample?' · 含 HTML 样本':''}</summary><div className="disclosure-body">
    <details className="od-disclosure od-disclosure--flat ai-materials" open={!usePage||undefined}><summary>发送资料{usePage?' · 已包含当前网页':' · 不附加网页信息'}</summary><div className="disclosure-body">
    <fieldset className="ai-context" disabled={editingLocked}><legend>{editingLocked?'本次发送的资料':'下次待发送的资料'}</legend>
      <div className="related-note"><label className="check"><input type="checkbox" id="chat-ai-use-page" checked={usePage} onChange={e=>setUsePage(e.target.checked)}/>附上当前网页标题与网址</label>
      <p className="secondary ai-page-context" title={(nextPage?.title||'')+' · '+(nextPage?.url||'')}>{nextPage?.title||'请刷新当前网页'} · {nextPage?.url||''}</p></div>
      <label className="check"><input type="checkbox" id="chat-ai-use-config" checked={useConfig} onChange={e=>setUseConfig(e.target.checked)}/>附上当前配置与规则</label>
    </fieldset></div></details>
    <Button base="aria" id="chat-list-prepare" variant="outline" disabled={blocked||working||unknown||pendingId!==null||!pendingReady||!state.target||Boolean(draft&&!stale)} onClick={prepareList}>从完整字段准备列表</Button>

    <details className="od-disclosure od-disclosure--flat"><summary>可选 · 提供必要 HTML 样本</summary><div className="disclosure-body"><div className="od-form-field field"><label className="od-field-label" htmlFor="chat-ai-sample">只提供必要结构，移除密码、Token 和私人数据</label><Textarea className="od-field" id="chat-ai-sample" rows={5} maxLength={12000} disabled={editingLocked} value={sample} onChange={e=>setSample(e.target.value)}/></div><p className="od-note secondary">不会自动读取网页正文、Cookie 或表单值。</p></div></details>
    <details className="od-disclosure od-disclosure--flat"><summary>共享 AI · {recipient?[recipient.provider,recipient.model].filter(Boolean).join(' · '):'当前不可用'}</summary>
      <div className="disclosure-body"><p className="od-note secondary" id="chat-ai-recipient">接收方：{recipient?[recipient.provider,recipient.model,recipient.endpoint].filter(Boolean).join(' · '):'共享 Provider 未就绪。本地调试不开放真实 AI；推理仍需原安装授权。'}</p></div>
    </details>
    <details className="od-disclosure od-disclosure--flat"><summary>查看{working&&requestContext?'本次':'下次'}配置与错误资料</summary><div className="disclosure-body"><pre id="ai-context-preview">{JSON.stringify(previewContext,null,2)}</pre></div></details>
    {draft&&draft.source!=='local-list'&&<details className="od-disclosure od-disclosure--flat"><summary>AI 调用记录</summary><div className="disclosure-body"><pre>{JSON.stringify({requestId:draft.requestId,providerGeneration:draft.generation,metadata:draft.metadata},null,2)}</pre></div></details>}
    </div></details>
    </div>
    {draft&&<div className="toolbar ai-review-actions" role="group" aria-label="配置提案操作"><Button base="aria" id="chat-ai-apply" variant="secondary" disabled={blocked||working||unknown||pendingId!==null||!pendingReady||stale} onClick={apply}>应用为配置草稿</Button><Button base="aria" id="chat-ai-export" variant="outline" disabled={working||exporting} onClick={exportDraft}>导出生成配置</Button><Button base="aria" id="chat-ai-discard" variant="quiet" disabled={working} onClick={()=>{setDraft(null);setProcessedInput(inputKey);setNotice('已放弃生成草稿；需求和样本仍保留。');tool.root.querySelector('#ai-requirement')?.focus({preventScroll:true});}}>放弃生成草稿</Button></div>}
    {appliedRequestId&&!appliedStale&&!draft&&<div className="toolbar ai-review-actions" role="group" aria-label="已应用配置的后续操作">
      <Button base="aria" id="chat-ai-save" variant="secondary" disabled={working||unknown||!pendingReady} onClick={()=>onNavigate?.('save')}>保存配置</Button>
      <Button base="aria" id="chat-ai-run" variant="outline" disabled={working||unknown} onClick={()=>onNavigate?.('run')}>前往试采</Button>
      <Button base="aria" id="chat-ai-results" variant="quiet" disabled={working||unknown} onClick={()=>onNavigate?.('export')}>查看结果与导出</Button>
    </div>}
    <label className="od-field-label ai-input-label" htmlFor="ai-requirement"><span>采集需求 / 纠正要求{draft&&!stale?' · 修改需求可重新生成':''}</span>{composerHint&&<span id="ai-composer-hint" className="ai-composer-hint">{composerHint}</span>}</label><div className="ai-composer-target" ref={setComposerTarget}/>
      <SharedConversationFrame open={open} rows={conversation.rows} draft={requirement}
        focusOnOpen={true} autoScroll={false} splitTargets={true} transcriptTarget={transcriptTarget} composerTarget={composerTarget}
        busy={working&&!unknown} blocked={unknown||pendingId!==null||!pendingReady||blocked}
        inputDisabled={editingLocked} canSend={Boolean(recipient&&state.target&&(!draft||stale))}
        inputId="ai-requirement" inputLabel="" sendId="ai-generate" stopId="chat-ai-cancel"
        placeholder="例如：采集商品名称、价格与链接，最多三页…"
        emptyPrompt="描述想采集的字段或修改要求。AI 会结合已允许的资料提出可审阅的操作，不会自动采集。" onDraftChange={setRequirement}
        onSend={generate} onStop={cancel}
        />

    </div>
  </SharedConversationDock>;
}
