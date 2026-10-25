import * as React from 'react';

export default function KnowledgeWorkspace({host,onOpenSettings}){
  const state=React.useSyncExternalStore(host.subscribe,host.snapshot,host.snapshot);
  const [question,setQuestion]=React.useState(''),[scope,setScope]=React.useState('');
  const [approved,setApproved]=React.useState(false),[error,setError]=React.useState('');
  const prepared=state.prepared;
  const reset=()=>{setApproved(false);setError('');host.invalidate('');};
  const prepare=()=>{setApproved(false);setError('');
    void host.prepare({question,scope}).catch(cause=>setError(cause.message));};
  const send=event=>{
    setError('');
    // No await, transition or scheduled callback before the Provider request.
    try{const pending=host.send({event:event.nativeEvent,approved});
      void pending.catch(cause=>setError(cause.message));}
    catch(cause){setError(cause.message);}
  };
  const invokesAI=prepared?.lookup.status==='RETRIEVED_ONLY';
  return <div className="od-knowledge-workspace">
    <section className="od-stack od-knowledge-ai" aria-label="可信知识 AI 问答">
      <div className="od-toolbar"><strong>知识 AI 问答</strong>
        <button className="od-button" type="button" onClick={onOpenSettings}>AI 设置</button></div>
      <label>问题<textarea className="od-field" aria-label="AI 问题" rows={2} maxLength={300}
        value={question} disabled={state.busy} onChange={event=>{reset();setQuestion(event.target.value);}}/></label>
      <label>适用条件<input className="od-field" aria-label="AI 适用条件" maxLength={60} value={scope}
        disabled={state.busy} onChange={event=>{reset();setScope(event.target.value);}}/></label>
      <button className="od-button" type="button" disabled={state.busy||!question.trim()} onClick={prepare}>准备知识</button>
      {prepared&&<div className="od-stack">
        <p className="od-note">{invokesAI?'将发送以下知识至':'本轮无需调用 AI：'} {invokesAI&&
          `${prepared.recipient.model} · ${prepared.recipient.endpoint}`}</p>
        <ul aria-label="将发送的知识">{prepared.references.map(item=><li key={item.id}>
          {item.question} [{item.id}]：{item.answer}{item.scope&&`（${item.scope}）`}</li>)}</ul>
        {invokesAI&&<label><input type="checkbox" checked={approved} disabled={state.busy}
          onChange={event=>setApproved(event.target.checked)}/>同意将问题、适用条件和上述知识发送给此 AI</label>}
        <button className="od-button od-button--primary" type="button" disabled={state.busy||(invokesAI&&!approved)}
          onClick={send}>{invokesAI?'发送并生成审阅答案':'查看知识结果'}</button>
      </div>}
      {state.busy&&<button className="od-button" type="button" onClick={()=>{
        void host.cancel().catch(cause=>setError(cause.message));}}>取消问答</button>}
      {(error||state.error)&&<p role="alert">{error||state.error}</p>}
      {state.result&&<article aria-label="知识回答" aria-live="polite">
        <strong>{state.result.modelCalled?'AI 草稿 · 需人工审阅':'知识查询结果'}</strong>
        <p>{state.result.question}</p>
        <p className="od-note">{state.result.status} · {state.result.sourceIds.join('、')||'没有可引用的知识'}</p>
      </article>}
    </section>
    <div className="od-knowledge-frame-target" aria-label="原知识管理界面"/>
  </div>;
}
