import * as React from 'react';

// Cookie Value is deliberately an uncontrolled DOM input. React state, props,
// app snapshots and diagnostics never receive the sensitive value.
const pad=n=>String(n).padStart(2,'0');
const toLocal=seconds=>{
  if(!Number.isFinite(seconds))return '';
  const d=new Date(seconds*1000);
  if(Number.isNaN(d.getTime()))return '';
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+
    'T'+pad(d.getHours())+':'+pad(d.getMinutes());
};
const fromLocal=input=>{
  const ms=new Date(input).getTime();
  return Number.isFinite(ms)?Math.floor(ms/1000):NaN;
};
export default function CookieInlineEditor({row=null,target,disabled=false,
  readValue,onSave,onCancel,onDelete,onDirty}){
  const valueRef=React.useRef(null),revealedRef=React.useRef(null);
  const [valueEdited,setValueEdited]=React.useState(false);
  const [showValue,setShowValue]=React.useState(false);
  const [revealing,setRevealing]=React.useState(false);
  const [message,setMessage]=React.useState('');
  const [draft,setDraft]=React.useState(()=>({
    name:row?.name||'',domain:row?.domain||target?.hostname||'',
    path:row?.path||'/',hostOnly:row?.hostOnly!==false,
    secure:row?.secure??target?.origin?.startsWith('https:'),
    httpOnly:row?.httpOnly===true,sameSite:row?.sameSite||'lax',
    session:row?.session!==false,
    expiration:toLocal(row?.expirationDate),
    storeId:row?.storeId,partitionKey:row?.partitionKey
  }));
  const edited=!!row;
  React.useEffect(()=>()=>{if(valueRef.current)valueRef.current.value='';
    if(revealedRef.current)revealedRef.current.textContent='';
  },[row?.id,target?.url]);
  const update=(key,value)=>{setDraft(old=>({...old,[key]:value}));onDirty?.(true);};
  const dismissReveal=()=>{if(revealedRef.current)revealedRef.current.textContent='';
    if(revealedRef.current)revealedRef.current.hidden=true;};
  const reveal=async()=>{
    if(!row||!readValue)return;
    if(revealedRef.current&&!revealedRef.current.hidden){dismissReveal();return;}
    setRevealing(true);
    try{
      const value=await readValue(row.id);
      if(typeof value==='string'&&revealedRef.current){
        revealedRef.current.textContent=value;
        revealedRef.current.hidden=false;
      }else setMessage('敏感值不可用；请检查授权或刷新。');
    }finally{setRevealing(false);}
  };
  const submit=event=>{
    event.preventDefault();dismissReveal();setMessage('');
    const expiry=draft.session?undefined:fromLocal(draft.expiration);
    if(!draft.session&&(!Number.isFinite(expiry)||expiry<=Date.now()/1000)){
      setMessage('请填写未来的有效过期时间。');return;
    }
    onSave({...draft,expirationDate:expiry,
      value:valueRef.current?.value||''},{
      originalId:row?.id||null,valueEdited:!edited||valueEdited
    });
  };
  return <form className="cookie-inline-editor" onSubmit={submit}
    aria-label={edited?'编辑 Cookie '+row.name:'新建 Cookie'}>
    <div className="cookie-editor-grid">
      <label>名称 <input required maxLength={256} value={draft.name}
        disabled={disabled} onChange={e=>update('name',e.target.value)}/></label>
      <label>Cookie Value <input ref={valueRef} type={showValue?'text':'password'}
        autoComplete="off" maxLength={4096} disabled={disabled}
        placeholder={edited?'不修改则保留原值（需额外授权）':'输入值，允许空字符串'}
        onChange={()=>{setValueEdited(true);onDirty?.(true);}}/></label>
    </div>
    <div className="cookie-editor-actions">
      <button type="button" disabled={disabled}
        onClick={()=>setShowValue(x=>!x)} aria-pressed={showValue}>
        {showValue?'隐藏输入':'显示输入'}</button>
      {edited&&<button type="button" disabled={disabled||revealing}
        onClick={()=>void reveal()}>{revealing?'读取中…':'查看原值（需授权）'}</button>}
    </div>
    <output ref={revealedRef} className="cookie-sensitive-output" aria-label="临时敏感值"
      hidden/>
    <details className="cookie-editor-details">
      <summary>Cookie 属性与作用域</summary>
      <div className="cookie-editor-grid">
        <label>Domain <input value={draft.domain} disabled={disabled||edited}
          onChange={e=>update('domain',e.target.value)}/></label>
        <label>Path <input value={draft.path} disabled={disabled||edited}
          onChange={e=>update('path',e.target.value)}/></label>
        <label>SameSite <select value={draft.sameSite} disabled={disabled}
          onChange={e=>update('sameSite',e.target.value)}>
          <option value="unspecified">Unspecified</option>
          <option value="lax">Lax</option><option value="strict">Strict</option>
          <option value="no_restriction">None（要求 Secure）</option></select></label>
        <label><input type="checkbox" checked={draft.hostOnly} disabled={disabled||edited}
          onChange={e=>update('hostOnly',e.target.checked)}/> Host-only</label>
        <label><input type="checkbox" checked={draft.secure} disabled={disabled}
          onChange={e=>update('secure',e.target.checked)}/> Secure</label>
        <label><input type="checkbox" checked={draft.httpOnly} disabled={disabled}
          onChange={e=>update('httpOnly',e.target.checked)}/> HttpOnly</label>
        <label><input type="checkbox" checked={draft.session} disabled={disabled}
          onChange={e=>update('session',e.target.checked)}/> Session</label>
        {!draft.session&&<label>过期时间（本地）
          <input type="datetime-local" value={draft.expiration} disabled={disabled}
            onChange={e=>update('expiration',e.target.value)}/></label>}
      </div>
      <p className="cookie-editor-scope">Store: {draft.storeId||'当前 Store'} · Partition: {
        draft.partitionKey?.topLevelSite||'普通 Cookie'}</p>
      {edited&&<p className="cookie-editor-scope">已存在 Cookie 的 Domain、Path、Host-only、Store 与 Partition 不能在原条目中改变。更名时先写入新 Cookie 再删除旧名称。</p>}
    </details>
    {message&&<p role="alert" className="cookie-message error">{message}</p>}
    <div className="cookie-editor-actions">
      {edited&&<button type="button" className="danger" onClick={()=>onDelete?.(row.id)}
        disabled={disabled}>删除</button>}
      <span className="cookie-spacer"/>
      <button type="button" disabled={disabled} onClick={onCancel}>取消</button>
      <button className="primary" type="submit" disabled={disabled}>保存 Cookie</button>
    </div>
  </form>;
}
