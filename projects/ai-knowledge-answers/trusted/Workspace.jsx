import * as React from 'react';

const labelStatus=status=>({
  OBSERVED:'已接收',RETRIEVING:'正在查知识',GENERATING_AI:'正在生成草稿',ANSWERED_FIXED:'固定答案待发送',
  RETRIEVED_ONLY:'可生成 AI 草稿',REVIEW_REQUIRED:'AI 草稿待审核',NO_MATCH:'没有匹配的知识',AMBIGUOUS:'来源冲突',
  INVALID_AI:'AI 草稿未通过来源校验',SENDING:'正在发送',CONFIRMED:'网页已确认发送',
  GREETING_ONLY:'欢迎回复待确认',COMPOSITE_REVIEW_REQUIRED:'回复待确认',
  MULTI_REVIEW_REQUIRED:'多项回答待审核',PARTIAL_REVIEW_REQUIRED:'部分问题待核实',
  HUMAN_REQUIRED:'需人工处理',CLARIFICATION_REQUIRED:'需要澄清',OVER_LIMIT:'问题过多',
  ERROR:'处理失败',UNKNOWN:'发送结果待核对',STALE:'已失效'
})[status]||String(status||'未知状态');

const needsReview=row=>['REVIEW_REQUIRED','GREETING_ONLY','COMPOSITE_REVIEW_REQUIRED',
  'MULTI_REVIEW_REQUIRED','PARTIAL_REVIEW_REQUIRED'].includes(row.status);

function ReplyEvidence({row}){
  if(!row.sourceIds?.length&&!row.parts?.length&&!row.replyMessageId)return null;
  return <details className="od-knowledge-disclosure">
    <summary>{row.replyMessageId?'知识依据与网页回执':'查看知识依据'}</summary>
    {row.parts?.map((part,index)=><div className="od-knowledge-source" key={index}>
      <strong>{part.question}</strong>
      <span>{part.status==='ANSWERED_FIXED'?'固定知识':labelStatus(part.status)} · {part.sourceIds?.join('、')||'无已确认来源'}</span>
    </div>)}
    {row.sourceIds?.length>0&&<p className="od-note">已确认来源编号：{row.sourceIds.join('、')}</p>}
    {row.replyMessageId&&<p className="od-note">网页回执：{row.replyMessageId}<br/>客户消息：{row.messageId}</p>}
  </details>;
}

function KnowledgeApproval({prepared,busy,approved,onApprove,onSend}){
  const modelCalled=prepared.lookup.status==='RETRIEVED_ONLY';
  return <section className="od-knowledge-card" aria-label="知识与数据审阅">
    <h3>{modelCalled?'审阅将发送给 AI 的资料':'查询知识结果'}</h3>
    <p className="od-knowledge-text">{prepared.question}</p>
    {prepared.scope&&<p className="od-note">适用条件：{prepared.scope}</p>}
    {modelCalled&&<p className="od-note">接收方：{prepared.recipient.model||prepared.recipient.provider} · {prepared.recipient.endpoint}</p>}
    {prepared.references.length>0&&<ul className="od-knowledge-references" aria-label="本轮命中的知识">
      {prepared.references.map(item=><li key={item.id}>
        <strong>{item.question}</strong><p>{item.answer}</p>
        {item.scope&&<span className="od-note">适用条件：{item.scope}</span>}
      </li>)}
    </ul>}
    {modelCalled&&<label className="od-knowledge-check"><input type="checkbox" checked={approved}
      disabled={busy} onChange={event=>onApprove(event.target.checked)}/>
      同意将本轮问题、适用条件和所列知识发送至该 AI
    </label>}
    <button className="od-button od-button--primary" type="button"
      disabled={busy||(modelCalled&&!approved)} onClick={onSend}>
      {modelCalled?'生成待审核草稿':'显示知识结果'}
    </button>
  </section>;
}

export default function KnowledgeWorkspace({host,onOpenSettings}){
  const state=React.useSyncExternalStore(host.subscribe,host.snapshot,host.snapshot);
  const [view,setView]=React.useState('inbox');
  const [question,setQuestion]=React.useState(''),[scope,setScope]=React.useState('');
  const [approvedPreparation,setApprovedPreparation]=React.useState(null);
  const [autoFixed,setAutoFixed]=React.useState(false);
  const [messageId,setMessageId]=React.useState('');
  const [reviewed,setReviewed]=React.useState(null);
  const [rechecking,setRechecking]=React.useState('');
  const [error,setError]=React.useState('');
  const {prepared,test}=state;
  const records=test?.records||[];
  const running=test?.mode==='running',paused=test?.mode==='paused';
  const started=running||paused,connecting=test?.mode==='connecting';
  const row=records.find(record=>record.messageId===messageId)||records.at(-1);
  const recipient=host.recipient();
  const panelId=React.useId();
  const inboundPreparation=prepared?.inboundId&&row?.messageId===prepared.inboundId;
  const manualPreparation=prepared&&!prepared.inboundId;
  const canReview=row&&needsReview(row)&&Boolean(row.answer);
  const canSendFixed=row?.status==='ANSWERED_FIXED'&&Boolean(row.answer);
  const canReconcile=row?.status==='UNKNOWN'&&Boolean(row.answer)&&started;
  const showInboundApproval=inboundPreparation&&row.status==='RETRIEVED_ONLY'&&started&&!state.result;
  const actionToPrepare=row?.status==='RETRIEVED_ONLY'&&!showInboundApproval;
  const label=running?'监听中':paused?'已暂停':connecting?'正在连接':row?'监听已停止':'尚未连接';

  React.useEffect(()=>{
    // Keep the focused customer message stable when newer messages arrive.
    if(row?.messageId!==messageId)setMessageId(row?.messageId||'');
    if(reviewed&&(!running||reviewed!==row))setReviewed(null);
    if(approvedPreparation&&approvedPreparation!==prepared)setApprovedPreparation(null);
  },[row,messageId,reviewed,running,approvedPreparation,prepared]);

  const guard=action=>{
    try{
      const pending=action();
      if(pending?.catch)void pending.catch(cause=>setError(String(cause?.message||cause)));
    }catch(cause){setError(String(cause?.message||cause));}
  };
  const command=action=>{setError('');guard(action);};
  const changeView=next=>{
    if(next===view)return;
    setView(next);setReviewed(null);setApprovedPreparation(null);
  };
  const resetManual=()=>{setApprovedPreparation(null);setError('');if(manualPreparation)host.clearPrepared();};
  const sendKnowledge=event=>command(()=>{
    if(host.snapshot().prepared!==prepared)return;
    return host.send({event:event.nativeEvent,approved:approvedPreparation===prepared});
  });
  const sendPage=event=>command(()=>{
    const latest=host.snapshot();
    const reviewApproved=canReview&&reviewed===row;
    setReviewed(null);
    // Confirm the exact visible reply before handing the original click to the Host.
    if(latest.test?.mode!=='running'||!latest.test.records.includes(row)||(!canSendFixed&&!reviewApproved))return;
    return host.sendToLocalPage({event:event.nativeEvent,messageId:row.messageId,reviewApproved});
  });
  const reconcilePage=event=>{
    const nativeEvent=event.nativeEvent,currentId=row.messageId;
    setRechecking(currentId);
    command(async()=>{
      try{await host.reconcileLocalPage({event:nativeEvent,messageId:currentId});}
      finally{setRechecking(current=>current===currentId?'':current);}
    });
  };
  const approval=prepared&&<KnowledgeApproval prepared={prepared} busy={state.busy||(Boolean(inboundPreparation)&&paused)}
    approved={approvedPreparation===prepared} onApprove={checked=>setApprovedPreparation(checked?prepared:null)} onSend={sendKnowledge}/>;

  return <div className="od-knowledge-workspace">
    <div className="od-knowledge-bar">
      <nav className="od-knowledge-nav" aria-label="AI 客服工作区">
        {[['inbox','接待'],['library','知识库'],['manual','手动问答']].map(([id,text])=>
          <button key={id} type="button" className="od-button od-button--quiet"
            aria-current={view===id?'page':undefined} aria-controls={panelId+'-'+id} onClick={()=>changeView(id)}>{text}</button>)}
      </nav>
      <button className="od-icon-button od-icon-button--quiet" type="button" aria-label="AI 设置"
        title="AI 设置" onClick={onOpenSettings}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15.4 21 16l-2 3.5-1.8-1A8 8 0 0 1 14 20l-.4 2h-3.2L10 20a8 8 0 0 1-3.2-1.5l-1.8 1L3 16l1.6-.6a8 8 0 0 1 0-3.5L3 11.2l2-3.5 1.8 1A8 8 0 0 1 10 7.2l.4-2h3.2l.4 2a8 8 0 0 1 3.2 1.5l1.8-1 2 3.5-1.6.7a8 8 0 0 1 0 3.5Z"/></svg></button>
    </div>
    <div className="od-knowledge-connection">
      <div className="od-knowledge-connection-status" role="status">
        <span className="od-knowledge-state-dot" data-mode={test?.mode} aria-hidden="true"/>
        <span><strong>本地客服 · {label}</strong>{started&&test.autoSendFixed&&<small>固定答案可自动发送</small>}</span>
      </div>
      {started&&<div className="od-knowledge-actions">
        {running?<button type="button" className="od-button od-button--quiet" onClick={()=>{
          setReviewed(null);setApprovedPreparation(null);host.pauseLocalTest();}}>暂停</button>:
          <button type="button" className="od-button od-button--quiet" onClick={()=>host.resumeLocalTest()}>继续</button>}
        <button type="button" className="od-button od-button--quiet" onClick={()=>{
          setReviewed(null);setApprovedPreparation(null);host.stopLocalTest();}}>停止监听</button>
      </div>}
    </div>
    {(error||state.error)&&<p className="od-knowledge-error" role="alert">{error||state.error}</p>}
    {state.busy&&<div className="od-knowledge-progress">
      <span role="status">正在处理问答…</span>
      <button className="od-button od-button--quiet" type="button" onClick={()=>command(()=>host.cancel())}>取消当前问答</button>
    </div>}

    <section className="od-knowledge-inbox" id={panelId+'-inbox'} aria-label="客服接待" hidden={view!=='inbox'}>
      <div className="od-knowledge-scroll">
        {!started&&<section className="od-knowledge-card od-knowledge-connect" aria-label="监听授权">
          <h2>监听当前测试页</h2>
          <p className="od-note">先打开本地客服测试页。批准后，仅监听当前文档，最长 10 分钟、最多处理 20 条消息。</p>
          <label className="od-knowledge-check"><input type="checkbox" checked={autoFixed} disabled={connecting}
            onChange={event=>setAutoFixed(event.target.checked)}/>允许自动发送已核对的固定答案</label>
          <button className="od-button od-button--primary" type="button" disabled={connecting}
            onClick={event=>command(()=>host.startLocalTest({event:event.nativeEvent,autoSendFixed:autoFixed}))}>
            {connecting?'正在连接…':'批准并监听本地测试页'}
          </button>
        </section>}
        {test?.message&&test.message!=='未连接本地测试页'&&
          <p className="od-knowledge-session-note od-note" role="status">{test.message}</p>}
        {row?<>
          <label className="od-knowledge-message-picker">
            <span>客户消息 <small>{records.length} 条</small></span>
            <select className="od-field" value={row.messageId} onChange={event=>{
              setReviewed(null);setApprovedPreparation(null);setMessageId(event.target.value);
            }}>
              {[...records].reverse().map(item=><option key={item.messageId} value={item.messageId}>
                {labelStatus(item.status)} · {item.question}
              </option>)}
            </select>
          </label>
          <article className="od-knowledge-current" aria-label="当前客户消息及回复" key={row.messageId}>
            <section className="od-knowledge-customer" aria-label="客户原话">
              <h2>客户原话</h2>
              <p className="od-knowledge-text">{row.question}</p>
              {row.scope&&<p className="od-note">适用条件：{row.scope}</p>}
            </section>
            <section className="od-knowledge-card" data-status={row.status} aria-label="回复与处理状态">
              <div className="od-knowledge-reply-heading">
                <h2>{row.status==='CONFIRMED'?'已发送回复':row.answer?'回复建议':'处理进度'}</h2>
                <span className="od-knowledge-reply-status" role="status">{labelStatus(row.status)}</span>
              </div>
              {row.answer&&<p className="od-knowledge-text">{row.answer}</p>}
              {row.parts?.length>1&&<p className="od-knowledge-coverage">{row.answeredCount} 项有依据 · {row.reviewCount} 项待核实</p>}
              {row.message&&<p className="od-note">{row.message}</p>}
              <ReplyEvidence row={row}/>
            </section>
          </article>
          {showInboundApproval&&approval}
          {actionToPrepare&&inboundPreparation&&state.result&&
            <p className="od-note" role="status">{labelStatus(state.result.status)}。请人工核实。</p>}
        </>:started&&<div className="od-knowledge-empty">
          <h2>等待客户消息</h2>
          <p className="od-note">在测试页发送一条客户消息，回到这里查看知识依据与回复建议。</p>
        </div>}
        {started&&<details className="od-knowledge-disclosure od-knowledge-session-details">
          <summary>会话详情与自动草稿</summary>
          <dl className="od-knowledge-session-data">
            <dt>当前会话</dt><dd>{test.threadId}</dd>
            <dt>已读知识</dt><dd>{test.knowledgeCount==null?'尚未读取':test.knowledgeCount+' 条'}</dd>
            <dt>网页已确认</dt><dd>{test.confirmed} 条</dd>
            <dt>待排查</dt><dd>{test.errors} 条</dd>
          </dl>
          {test.autoAI?<p className="od-note">自动生成 AI 草稿已获批准，发送前须人工审核。</p>:
            <>
              <p className="od-note">批准后，非精确匹配的问题和本轮命中的知识会发送给 {recipient.model||recipient.provider||'共享 AI'}
                {recipient.endpoint?'（'+recipient.endpoint+'）':''}。仅限本次监听，草稿须人工审核。</p>
              <button type="button" className="od-button od-button--secondary" disabled={paused||state.busy}
                onClick={event=>command(()=>host.approveLocalAI({event:event.nativeEvent}))}>批准自动生成 AI 草稿</button>
            </>}
        </details>}
      </div>
      {started&&(canReconcile||canReview||canSendFixed||actionToPrepare)&&
        <footer className="od-knowledge-footer" aria-label="当前消息的处理操作">
          {canReconcile&&<>
            <p className="od-note">发送结果待确认。请核对原网页回执。</p>
            <button type="button" className="od-button od-button--secondary" disabled={state.busy||Boolean(rechecking)}
              onClick={reconcilePage}>{rechecking===row.messageId?'正在只读核对…':'只读核对网页回执'}</button>
          </>}
          {canReview&&<label className="od-knowledge-check"><input type="checkbox" disabled={!running||state.busy}
            checked={running&&reviewed===row} onChange={event=>setReviewed(event.target.checked?row:null)}/>
            已核对当前消息的回复、适用条件和待核实内容
          </label>}
          {(canReview||canSendFixed)&&<button type="button" className="od-button od-button--primary"
            disabled={!running||state.busy||(canReview&&reviewed!==row)} onClick={sendPage}>
            {canReview?'确认并发送回复':'确认并发送固定答案'}
          </button>}
          {actionToPrepare&&<button type="button" className="od-button od-button--primary"
            disabled={!running||state.busy} onClick={()=>{
              setApprovedPreparation(null);command(()=>host.prepareInbound(row.messageId));
            }}>准备 AI 草稿</button>}
        </footer>}
    </section>

    <section className="od-knowledge-scroll" id={panelId+'-manual'} aria-label="手动问答" hidden={view!=='manual'}>
      <form className="od-knowledge-card" onSubmit={event=>{
        event.preventDefault();setApprovedPreparation(null);command(()=>host.prepare({question,scope}));
      }}>
        <label className="od-knowledge-field">问题<textarea className="od-field" rows={3} maxLength={300}
          value={question} disabled={state.busy} onChange={event=>{resetManual();setQuestion(event.target.value);}}/></label>
        <label className="od-knowledge-field">适用条件（选填）<input className="od-field" maxLength={60} value={scope}
          disabled={state.busy} onChange={event=>{resetManual();setScope(event.target.value);}}/></label>
        <button className="od-button od-button--primary" type="submit" disabled={state.busy||!question.trim()}>准备知识</button>
      </form>
      {manualPreparation&&!state.result&&approval}
      {manualPreparation&&state.result&&<article className="od-knowledge-card" aria-label="知识回答" aria-live="polite">
        <h2>{state.result.modelCalled?'AI 草稿 · 待人工审核':'知识回答'}</h2>
        <p className="od-knowledge-text">{state.result.answer||'没有可用回答，请人工核查。'}</p>
        <p className="od-note">{labelStatus(state.result.status)} · 来源 {state.result.sourceIds.join('、')||'无'}</p>
        <button type="button" className="od-button od-button--secondary" disabled={state.busy}
          onClick={()=>{setApprovedPreparation(null);command(()=>host.prepare({question,scope}));}}>重新查询</button>
      </article>}
    </section>
    <section className="od-knowledge-library" id={panelId+'-library'} aria-label="知识库管理" hidden={view!=='library'}>
      <div className="od-knowledge-frame-target" aria-label="知识数据导入与维护界面"/>
    </section>
  </div>;
}
