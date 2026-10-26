import * as React from 'react';

const labelStatus=status=>({
  OBSERVED:'消息已接收',RETRIEVING:'正在检索',GENERATING_AI:'AI 生成中',ANSWERED_FIXED:'固定回答',RETRIEVED_ONLY:'待 AI 生成',
  REVIEW_REQUIRED:'AI 草稿待审核',NO_MATCH:'无匹配知识',AMBIGUOUS:'来源冲突',
  INVALID_AI:'AI 来源无效',SENDING:'网页发送中',CONFIRMED:'DOM 已确认',
  ERROR:'处理失败',UNKNOWN:'结果未知',STALE:'已失效'
})[status]||String(status||'未知状态');

export default function KnowledgeWorkspace({host,onOpenSettings}){
  const state=React.useSyncExternalStore(host.subscribe,host.snapshot,host.snapshot);
  const [question,setQuestion]=React.useState(''),[scope,setScope]=React.useState('');
  const [approved,setApproved]=React.useState(false);
  const [autoFixed,setAutoFixed]=React.useState(false);
  const [reviewFor,setReviewFor]=React.useState('');
  const [rechecking,setRechecking]=React.useState('');
  const [error,setError]=React.useState('');
  const prepared=state.prepared,test=state.test,records=test?.records||[];
  const running=test?.mode==='running',paused=test?.mode==='paused';
  const started=running||paused;
  const modelCalled=prepared?.lookup.status==='RETRIEVED_ONLY';
  const recipient=host.recipient();
  const guard=fn=>{
    try{const promise=fn();
      if(promise?.catch)void promise.catch(cause=>setError(String(cause?.message||cause)));}
    catch(cause){setError(String(cause?.message||cause));}
  };
  const reset=()=>{setApproved(false);setError('');host.clearPrepared();};
  const prepareManual=()=>{
    setApproved(false);setError('');
    guard(()=>host.prepare({question,scope}));
  };
  const prepareInbound=id=>{
    setApproved(false);setError('');
    guard(()=>host.prepareInbound(id));
  };
  const send=event=>{
    setError('');
    // The synchronous onClick retains the original isTrusted event for Provider permission.
    guard(()=>host.send({event:event.nativeEvent,approved}));
  };
  const sendPage=(event,messageId,reviewApproved=false)=>{
    setError('');
    guard(()=>host.sendToLocalPage({event:event.nativeEvent,messageId,reviewApproved}));
  };
  const reconcilePage=(event,messageId)=>{
    setError('');setRechecking(messageId);
    guard(async()=>{
      try{return await host.reconcileLocalPage({event:event.nativeEvent,messageId});}
      finally{setRechecking(current=>current===messageId?'':current);}
    });
  };
  return <div className="od-knowledge-workspace">
    <section className="od-knowledge-dashboard" aria-label="知识问答控制台">
      <div className="od-knowledge-title-row">
        <div><h2>本地测试</h2><p>客户消息 · 知识回复 · 网页回执</p></div>
        <button className="od-icon-button" type="button" aria-label="共享 AI 设置"
          title="共享 AI 设置" onClick={onOpenSettings}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15.4 21 16l-2 3.5-1.8-1A8 8 0 0 1 14 20l-.4 2h-3.2L10 20a8 8 0 0 1-3.2-1.5l-1.8 1L3 16l1.6-.6a8 8 0 0 1 0-3.5L3 11.2l2-3.5 1.8 1A8 8 0 0 1 10 7.2l.4-2h3.2l.4 2a8 8 0 0 1 3.2 1.5l1.8-1 2 3.5-1.6.7a8 8 0 0 1 0 3.5Z"/></svg></button>
      </div>
      <div className="od-knowledge-summary">
        <span className="od-knowledge-label">共享 AI</span>
        <strong>{recipient.model||recipient.provider||'未配置模型'}</strong>
        <span className="od-knowledge-label">已加载知识</span>
        <strong>{test?.knowledgeCount===null||test?.knowledgeCount===undefined?'连接后核对':test.knowledgeCount+' 条'}</strong>
        <span className="od-knowledge-label">测试网页</span>
        <strong>{started?(paused?'已暂停 · ':'监听中 · ')+(test.threadId.endsWith('01')?'会话 A':'会话 B'):test?.mode==='connecting'?'正在连接':'未连接'}</strong>
      </div>
      {!started&&<div className="od-knowledge-start">
        <p className="od-note">先打开本地客服测试页，再明确批准当前文档的 10 分钟监听。只处理本地消息，不会监听其他网站。</p>
        <label className="od-knowledge-check"><input type="checkbox" checked={autoFixed}
          onChange={event=>setAutoFixed(event.target.checked)}/>
          允许自动发送已核对的<strong>固定答案</strong>（仅本地测试页）
        </label>
        <button className="od-button od-button--primary" type="button" disabled={test?.mode==='connecting'}
          onClick={event=>{setError('');guard(()=>host.startLocalTest({event:event.nativeEvent,autoSendFixed:autoFixed}));}}>
          {test?.mode==='connecting'?'正在连接…':'批准并监听本地测试页'}
        </button>
      </div>}
      {started&&<div className="od-knowledge-session">
        <div className="od-knowledge-stats" aria-label="本地测试统计">
          <div><strong>{test.observed}</strong><span>收到客户消息</span></div>
          <div><strong>{test.confirmed}</strong><span>网页确认回复</span></div>
          <div><strong>{test.errors}</strong><span>异常 / 未知</span></div>
        </div>
        {!test.autoAI&&<div className="od-knowledge-auto-ai">
          <p className="od-note">额外批准后，定时到达的非精确问题可调用 <strong>{recipient.model||recipient.provider}</strong>（{recipient.endpoint}）生成草稿。
            只发送本轮命中的知识片段，最多 20 条、10 分钟；AI 草稿仍不自动发送。</p>
          <button type="button" className="od-button" disabled={paused||state.busy}
            onClick={event=>{setError('');guard(()=>host.approveLocalAI({event:event.nativeEvent}));}}>
            批准本地自动 AI 草稿生成
          </button>
        </div>}
        {test.autoAI&&<p className="od-note">已批准自动 AI 生成（仍需人工审核）。</p>}
        <div className="od-knowledge-actions">
          {running?<button type="button" className="od-button" onClick={()=>host.pauseLocalTest()}>暂停</button>:
            <button type="button" className="od-button" onClick={()=>host.resumeLocalTest()}>继续</button>}
          <button type="button" className="od-button" onClick={()=>host.stopLocalTest()}>停止测试</button>
        </div>
      </div>}
      <p className="od-note od-knowledge-session-note" role="status">{test?.message||'当前不是正式网站自动回复模式'}</p>
      <div className="od-knowledge-result-list" aria-label="客户消息处理结果">
        <div className="od-knowledge-section-head"><strong>客户消息</strong>
          <span>{records.length} 条 · 最近优先</span></div>
        {records.length===0&&<p className="od-knowledge-empty">
          {started?'请在本地聊天网页手动发送问题，或开启定时模拟。':'连接后，客户消息及可信来源会显示在这里。'}
        </p>}
        {[...records].reverse().map(row=><article key={row.messageId}
          className="od-knowledge-result" data-status={row.status}>
          <div className="od-knowledge-question"><strong>{row.question}</strong>
            <span>{labelStatus(row.status)}</span></div>
          <p className="od-knowledge-meta">{row.scope?'适用 '+row.scope+' · ':''}{row.message}</p>
          {row.sourceIds?.length>0&&<p className="od-knowledge-sources">来源：{row.sourceIds.join('、')}</p>}
          {row.answer&&<p className="od-knowledge-answer">{row.answer}</p>}
          {row.status==='CONFIRMED'&&row.replyMessageId&&
            <p className="od-knowledge-meta">网页已确认：{row.replyMessageId} · 回复客户消息：{row.messageId}</p>}
          {started&&row.status==='UNKNOWN'&&row.answer&&<div className="od-knowledge-review">
            <p className="od-note">网页发送结果尚不能确认。只能核对原网页，绝不再次发送。</p>
            <button type="button" className="od-button" disabled={state.busy||Boolean(rechecking)}
              onClick={event=>reconcilePage(event,row.messageId)}>
              {rechecking===row.messageId?'正在只读核对…':'只读核对网页回执'}
            </button>
          </div>}
          {started&&row.status==='RETRIEVED_ONLY'&&<button type="button" className="od-button"
            disabled={state.busy} onClick={()=>prepareInbound(row.messageId)}>使用共享 AI 生成草稿</button>}
          {started&&row.status==='ANSWERED_FIXED'&&<button type="button" className="od-button"
            disabled={state.busy||paused} onClick={event=>sendPage(event,row.messageId)}>确认发送固定答案</button>}
          {started&&row.status==='REVIEW_REQUIRED'&&<div className="od-knowledge-review">
            <label className="od-knowledge-check"><input type="checkbox" checked={reviewFor===row.messageId}
              onChange={event=>setReviewFor(event.target.checked?row.messageId:'')}/>
              我已核对这条 AI 草稿与引用条件，允许仅发送给本地测试客户
            </label>
            <button type="button" className="od-button" disabled={paused||state.busy||reviewFor!==row.messageId}
              onClick={event=>{sendPage(event,row.messageId,true);setReviewFor('');}}>人工确认发送</button>
          </div>}
        </article>)}
      </div>
    </section>
    <section className="od-knowledge-composer" aria-label="AI 问答准备与授权">
      <details className="od-knowledge-manual">
        <summary>手动询问知识库</summary>
        <div className="od-knowledge-manual-body">
          <label>问题<textarea className="od-field" aria-label="AI 问题" rows={2} maxLength={300}
            value={question} disabled={state.busy} onChange={event=>{reset();setQuestion(event.target.value);}}/></label>
          <label>适用条件<input className="od-field" aria-label="AI 适用条件" maxLength={60} value={scope}
            disabled={state.busy} onChange={event=>{reset();setScope(event.target.value);}}/></label>
          <button className="od-button" type="button" disabled={state.busy||!question.trim()}
            onClick={prepareManual}>准备知识</button>
        </div>
      </details>
      {prepared&&<div className="od-knowledge-prepared">
        <strong>{prepared.inboundId?'处理收到的客户消息':'手动回答'} · {prepared.question}</strong>
        <p className="od-note">{modelCalled?'这些命中知识将发送至共享 AI：':'无需 AI 推理 · 固定检索结果：'}
          {modelCalled&&' '+(prepared.recipient.model||prepared.recipient.provider)+' · '+prepared.recipient.endpoint}</p>
        <ul aria-label="将发送的知识">{prepared.references.map(item=><li key={item.id}>
          {item.question} [{item.id}]：{item.answer}{item.scope&&'（'+item.scope+'）'}</li>)}</ul>
        {modelCalled&&<label className="od-knowledge-check"><input type="checkbox" checked={approved}
          disabled={state.busy} onChange={event=>setApproved(event.target.checked)}/>
          同意将本轮问题、适用条件和列出的知识发送至上述 AI
        </label>}
        <button className="od-button od-button--primary" type="button"
          disabled={state.busy||(modelCalled&&!approved)} onClick={send}>
          {modelCalled?'真实调用 AI 并生成待审草稿':'显示知识结果'}
        </button>
      </div>}
      {state.busy&&<button className="od-button" type="button" onClick={()=>{
        guard(()=>host.cancel());}}>取消当前问答</button>}
      {(error||state.error)&&<p className="od-knowledge-error" role="alert">{error||state.error}</p>}
      {state.result&&<article className="od-knowledge-proposal" aria-label="知识回答" aria-live="polite">
        <strong>{state.result.modelCalled?'AI 草稿 · 严格人工审阅':'可信知识结果'}</strong>
        <p className="od-knowledge-answer">{state.result.answer||'没有可交付的确定回答，请人工核查。'}</p>
        <p className="od-note">{labelStatus(state.result.status)} · 来源：{state.result.sourceIds.join('、')||'无'}</p>
      </article>}
    </section>
    <details className="od-knowledge-data-manager">
      <summary>知识数据与导入</summary>
      <p>在下方原沙箱区域导入 JSON / CSV，所有读写仍使用原 Host 存储与 ETag 校验。</p>
      <div className="od-knowledge-frame-target" aria-label="知识数据导入与维护界面"/>
    </details>
  </div>;
}
