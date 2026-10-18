import * as React from 'react';
import {Button} from '@opendesk/ui';
import {CookieIcon} from './CookieEditorView.jsx';

// Cookie Value is deliberately an uncontrolled DOM input. React state, props,
// app snapshots and diagnostics never receive the sensitive value.
const pad=n=>String(n).padStart(2,'0');
const toLocal=seconds=>{
  if(!Number.isFinite(seconds))return '';
  const d=new Date(seconds*1000);
  if(Number.isNaN(d.getTime()))return '';
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+
    'T'+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds());
};
const fromLocal=input=>{
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(input||''))return NaN;
  const ms=new Date(input).getTime();
  const seconds=Math.floor(ms/1000);
  return Number.isFinite(ms)&&toLocal(seconds).slice(0,input.length)===input?seconds:NaN;
};
export default function CookieInlineEditor({row=null,target,disabled=false,
  readValue,onSave,onCancel,onDelete,onDirty}){
  const valueRef=React.useRef(null),revealedRef=React.useRef(null);
  const revealTimer=React.useRef(null);
  const [valueEdited,setValueEdited]=React.useState(false);
  const [newValueDirty,setNewValueDirty]=React.useState(false);
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
  const initial=React.useRef(draft);
  const comparable=input=>JSON.stringify({...input,
    expiration:input.session?null:Number.isFinite(fromLocal(input.expiration))
      ?fromLocal(input.expiration):input.expiration});
  const isDirty=()=>comparable(draft)!==comparable(initial.current)||
    (edited?valueEdited:newValueDirty);
  const dirty=isDirty();
  React.useEffect(()=>{onDirty?.(dirty);},[dirty,onDirty]);
  React.useEffect(()=>()=>{if(valueRef.current)valueRef.current.value='';
    if(revealedRef.current)revealedRef.current.textContent='';
    if(revealTimer.current)clearTimeout(revealTimer.current);
  },[row?.id,target?.url]);
  const update=(key,value)=>{setDraft(old=>({...old,[key]:value}));setMessage('');};
  const dismissReveal=()=>{
    if(revealTimer.current)clearTimeout(revealTimer.current);
    revealTimer.current=null;
    if(revealedRef.current){
      revealedRef.current.textContent='';
      revealedRef.current.hidden=true;
    }
    setShowValue(false);
  };
  const reveal=async()=>{
    if(!row||!readValue)return;
    if(revealedRef.current&&!revealedRef.current.hidden){dismissReveal();return;}
    setRevealing(true);
    try{
      const value=await readValue(row.id);
      if(typeof value==='string'&&revealedRef.current){
        revealedRef.current.textContent=value;
        revealedRef.current.hidden=false;
        setShowValue(true);
        if(revealTimer.current)clearTimeout(revealTimer.current);
        revealTimer.current=setTimeout(dismissReveal,20000);
      }else setMessage('敏感值不可用；请检查授权或刷新。');
    }finally{setRevealing(false);}
  };
  const toggleValue=()=>{
    if(revealedRef.current&&!revealedRef.current.hidden){dismissReveal();return;}
    if(edited&&!valueEdited){void reveal();return;}
    setShowValue(value=>!value);
  };
  const restoreValue=()=>{
    if(valueRef.current)valueRef.current.value='';
    setValueEdited(false);
    dismissReveal();
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
  return <form className="cookie-inline-editor od-surface od-surface--padded" onSubmit={submit}
    aria-label={edited?'编辑 Cookie '+row.name:'新建 Cookie'}>
    <div className="cookie-editor-heading"><strong>{edited?'编辑 Cookie':'新建 Cookie'}</strong>
      {dirty&&<span className="cookie-dirty-note">未保存</span>}</div>
    <div className="cookie-editor-grid cookie-editor-primary">
      <label>名称 <input className="od-field" required maxLength={256} value={draft.name}
        disabled={disabled} onChange={e=>update('name',e.target.value)}/></label>
      <div className="cookie-editor-value-field">
        <label htmlFor="cookie-sensitive-edit">值</label>
        <div className="cookie-value-inline">
          <input id="cookie-sensitive-edit" className="od-field" ref={valueRef}
            data-cookie-secret-input="true" type={showValue?'text':'password'}
            autoComplete="off" maxLength={4096} disabled={disabled}
            placeholder={edited?'留空保留旧值（可明确清空）':'允许输入空值'}
            onChange={()=>{
              setValueEdited(true);
              if(!edited)setNewValueDirty(Boolean(valueRef.current?.value));
            }}/>
          <Button type="button" className="od-icon-button cookie-value-toggle"
            disabled={disabled||revealing} aria-pressed={showValue}
            title={showValue?'隐藏 Cookie 值':edited&&!valueEdited?'读取并显示原值（需授权）':'显示输入'}
            aria-label={showValue?'隐藏 Cookie 值':edited&&!valueEdited?'读取并显示原值（需授权）':'显示输入'}
            onClick={toggleValue}>
            <CookieIcon name={showValue?'eyeoff':'eye'}/>
          </Button>
        </div>
      </div>
    </div>
    {edited&&valueEdited&&<div className="cookie-value-restore">
      <span>{valueRef.current?.value===''?'将明确写入空值':'将写入新值'}</span>
      <Button type="button" variant="secondary" disabled={disabled}
        onClick={restoreValue}>恢复保留旧值</Button>
    </div>}
    <output ref={revealedRef} data-cookie-secret-output="true"
      className="cookie-sensitive-output" aria-label="临时敏感值"
      hidden/>
    <details className="cookie-editor-details od-disclosure">
      <summary>Cookie 属性与作用域</summary>
      <div className="cookie-editor-grid">
        <label>Domain <input className="od-field" value={draft.domain} disabled={disabled||edited}
          onChange={e=>update('domain',e.target.value)}/></label>
        <label>Path <input className="od-field" value={draft.path} disabled={disabled||edited}
          onChange={e=>update('path',e.target.value)}/></label>
        <label>SameSite <select className="od-field" value={draft.sameSite} disabled={disabled}
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
          <input className="od-field" type="datetime-local" value={draft.expiration} disabled={disabled}
            onChange={e=>update('expiration',e.target.value)}/></label>}
      </div>
      <p className="cookie-editor-scope">Store: {draft.storeId||'当前 Store'} · Partition: {
        draft.partitionKey?.topLevelSite||'普通 Cookie'}</p>
      {edited&&<p className="cookie-editor-scope">已存在 Cookie 的 Domain、Path、Host-only、Store 与 Partition 不能在原条目中改变。更名时先写入新 Cookie 再删除旧名称。</p>}
    </details>
    {message&&<p role="alert" className="cookie-message od-alert od-alert--error">{message}</p>}
    <div className="cookie-editor-actions">
      {edited&&<Button type="button" className="od-button--danger" onClick={()=>onDelete?.(row.id)}
        disabled={disabled}>删除</Button>}
      <span className="cookie-spacer"/>
      <Button type="button" disabled={disabled} onClick={onCancel}>取消</Button>
      <Button variant="primary" type="submit" disabled={disabled||(edited&&!dirty)}>保存 Cookie</Button>
    </div>
  </form>;
}
