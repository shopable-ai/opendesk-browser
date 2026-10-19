import * as React from 'react';
import {Button} from '@opendesk/ui';
import {CookieIcon,CookieFormField,CookieAdvancedFields} from './CookieEditorView.jsx';

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
  // Raw sensitive values may exist only in short-lived refs/DOM, never React state.
  const originalValueRef=React.useRef(null),valueEditedRef=React.useRef(false);
  const revealGeneration=React.useRef(0),revealTimer=React.useRef(null);
  const [valueEdited,setValueEdited]=React.useState(false);
  const [newValueDirty,setNewValueDirty]=React.useState(false);
  const [showValue,setShowValue]=React.useState(false);
  const [revealing,setRevealing]=React.useState(false);
  const [message,setMessage]=React.useState('');
  const [discardConfirm,setDiscardConfirm]=React.useState(false);
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
  React.useEffect(()=>()=> {
    // Outstanding Host value reads cannot resurrect secrets after unmount.
    revealGeneration.current++;
    originalValueRef.current=null;
    valueEditedRef.current=false;
    if(valueRef.current)valueRef.current.value='';
    if(revealedRef.current){revealedRef.current.textContent='';revealedRef.current.hidden=true;}
    if(revealTimer.current)clearTimeout(revealTimer.current);
  },[row?.id,target?.url]);
  const update=(key,value)=>{setDraft(old=>({...old,[key]:value}));setMessage('');};
  const dismissReveal=()=>{
    revealGeneration.current++;
    if(revealTimer.current)clearTimeout(revealTimer.current);
    revealTimer.current=null;
    // An unedited disclosed value must never persist in a hidden input.
    if(row&&!valueEditedRef.current&&valueRef.current)valueRef.current.value='';
    originalValueRef.current=null;
    if(revealedRef.current){revealedRef.current.textContent='';revealedRef.current.hidden=true;}
    setShowValue(false);setRevealing(false);
  };
  const reveal=async()=>{
    if(!row||!readValue)return;
    const sequence=++revealGeneration.current;
    setRevealing(true);
    try{
      const value=await readValue(row.id);
      if(sequence!==revealGeneration.current||!valueRef.current)return;
      if(typeof value==='string'){
        // Preview's in-place eye interaction, backed by a real, separately
        // authorized Host read. No Cookie value enters JSX props or state.
        originalValueRef.current=value;
        valueRef.current.value=value;
        setShowValue(true);
        if(revealTimer.current)clearTimeout(revealTimer.current);
        revealTimer.current=setTimeout(dismissReveal,20000);
      }else setMessage('敏感值不可用；请检查独立授权或刷新。');
    }catch{
      if(sequence===revealGeneration.current)
        setMessage('敏感值读取失败；请检查独立授权后再尝试。');
    }finally{
      if(sequence===revealGeneration.current)setRevealing(false);
    }
  };
  const toggleValue=()=>{
    if(showValue){dismissReveal();return;}
    if(edited&&!valueEditedRef.current){void reveal();return;}
    setShowValue(true);
  };
  const setInputEdited=()=>{
    if(revealing){revealGeneration.current++;setRevealing(false);}
    const value=valueRef.current?.value||'';
    if(edited){
      const changed=originalValueRef.current===null||value!==originalValueRef.current;
      valueEditedRef.current=changed;setValueEdited(changed);
    }else setNewValueDirty(Boolean(value));
    setMessage('');
  };
  const restoreValue=()=>{
    valueEditedRef.current=false;setValueEdited(false);
    dismissReveal();
    if(valueRef.current)valueRef.current.value='';
  };
  const clearValue=()=>{
    dismissReveal();
    if(valueRef.current)valueRef.current.value='';
    valueEditedRef.current=true;setValueEdited(true);
    setMessage('');
  };
  const requestClose=()=>{
    if(disabled)return;
    if(dirty){setDiscardConfirm(true);return;}
    onCancel?.();
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
  return <form className="cookie-inline-editor inline-editor od-surface od-surface--padded" onSubmit={submit}
    aria-label={edited?'编辑 Cookie '+row.name:'新建 Cookie'}>
    <div className="cookie-editor-heading editor-top">
      <strong>{edited?'编辑 Cookie':'新建 Cookie'}</strong>
      <span className="editor-top-right">
        {dirty&&<em className="cookie-dirty-note">未保存</em>}
        <Button type="button" className="od-icon-button cookie-editor-close" disabled={disabled}
          aria-label="关闭编辑" title="关闭编辑" onClick={requestClose}>×</Button>
      </span>
    </div>
    <div className="cookie-editor-grid cookie-editor-primary">
      <CookieFormField label="名称">
        <input id="cookie-name" className="od-field" aria-label="名称" required maxLength={256}
          value={draft.name} disabled={disabled}
          onChange={e=>update('name',e.target.value)}/>
      </CookieFormField>
      <CookieFormField label="值">
        <div className="cookie-value-inline value-input">
          <input id="cookie-sensitive-edit" aria-label="Cookie 值"
            className="od-field" ref={valueRef}
            data-cookie-secret-input="true" type={showValue?'text':'password'}
            autoComplete="off" maxLength={4096} disabled={disabled}
            placeholder={edited?'保留原值 · 点击眼睛查看':'输入值（可为空）'}
            onChange={setInputEdited}/>
          <Button type="button" className="od-icon-button cookie-value-toggle"
            disabled={disabled||revealing} aria-pressed={showValue}
            title={showValue?'隐藏 Cookie 值':edited&&!valueEdited?'读取并显示原值（需授权）':'显示输入'}
            aria-label={showValue?'隐藏 Cookie 值':edited&&!valueEdited?'读取并显示原值（需授权）':'显示输入'}
            onClick={toggleValue}>
            <CookieIcon name={showValue?'eyeoff':'eye'}/>
          </Button>
        </div>
      </CookieFormField>
    </div>
    {edited&&<div className="cookie-value-restore value-controls">
      {valueEdited?<span>{valueRef.current?.value===''?'将写入空值':'将写入新值'}</span>:null}
      <Button type="button" variant="secondary" className="inline-link"
        disabled={disabled} onClick={valueEdited?restoreValue:clearValue}>
        {valueEdited?'恢复原值':'清空值'}
      </Button>
    </div>}
    <output ref={revealedRef} data-cookie-secret-output="true"
      className="cookie-sensitive-output" aria-label="临时敏感值" hidden/>
    <CookieAdvancedFields draft={draft} existing={edited} disabled={disabled}
      onChange={update} error={message}/>
    {edited&&draft.name!==row.name&&<p className="editor-hint">
      名称变更不是原地覆盖：正式版先创建并核实新 Cookie，再删除旧名称；
      失败时两条可能并存。
    </p>}
    {message&&<p role="alert" className="cookie-message od-alert od-alert--error">{message}</p>}
    {discardConfirm&&<div className="discard-row" role="status">
      <span>放弃当前未保存修改？</span>
      <Button type="button" variant="secondary" onClick={()=>setDiscardConfirm(false)}>继续编辑</Button>
      <Button type="button" variant="secondary" onClick={()=>onCancel?.()}>放弃</Button>
    </div>}
    <div className="cookie-editor-actions">
      {edited&&<Button type="button" className="od-button--danger" onClick={()=>onDelete?.(row.id)}
        disabled={disabled}>删除</Button>}
      <span className="cookie-spacer"/>
      <Button type="button" disabled={disabled} onClick={requestClose}>取消</Button>
      <Button variant="primary" type="submit" disabled={disabled||(edited&&!dirty)}>保存 Cookie</Button>
    </div>
  </form>;
}
