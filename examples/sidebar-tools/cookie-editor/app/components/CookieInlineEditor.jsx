import * as React from 'react';
import {Button} from '@opendesk/ui';
import {CookieFormField,CookieValueField,CookieAdvancedFields} from './CookieEditorView.jsx';

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
  const valueRef=React.useRef(null),nameRef=React.useRef(null);
  // Raw Cookie values never enter React state, props or snapshots.
  const originalValueRef=React.useRef(null),valueEditedRef=React.useRef(false);
  const readGeneration=React.useRef(0),inputRevision=React.useRef(0);
  const readTimer=React.useRef(null),readValueRef=React.useRef(readValue);
  readValueRef.current=readValue;
  const [valueEdited,setValueEdited]=React.useState(false);
  const [newValueDirty,setNewValueDirty]=React.useState(false);
  const [readStatus,setReadStatus]=React.useState(row?'loading':'new');
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
  React.useEffect(()=>{
    if(!row||!readValueRef.current)return;
    let alive=true;
    const generation=++readGeneration.current;
    const revision=inputRevision.current;
    setReadStatus('loading');
    // A Host read is independently authorized. Null/denied never means ''.
    void Promise.resolve().then(()=>readValueRef.current(row.id)).then(value=>{
      if(!alive||generation!==readGeneration.current||revision!==inputRevision.current
        ||valueEditedRef.current||!valueRef.current)return;
      if(typeof value!=='string'){setReadStatus('unavailable');return;}
      originalValueRef.current=value;
      valueRef.current.value=value;
      setReadStatus('available');
      if(readTimer.current)clearTimeout(readTimer.current);
      readTimer.current=setTimeout(()=>{
        if(!alive)return;
        // Expire the original, never an unsaved user-entered value.
        originalValueRef.current=null;
        if(!valueEditedRef.current&&valueRef.current)valueRef.current.value='';
        setReadStatus('expired');
      },20000);
    }).catch(()=>{
      if(alive&&generation===readGeneration.current)setReadStatus('unavailable');
    });
    return ()=>{
      alive=false;
      readGeneration.current++;
      originalValueRef.current=null;
      valueEditedRef.current=false;
      if(readTimer.current)clearTimeout(readTimer.current);
      readTimer.current=null;
      if(valueRef.current)valueRef.current.value='';
    };
  },[row?.id,target?.url]);
  const update=(key,value)=>{setDraft(old=>({...old,[key]:value}));setMessage('');};
  const setInputEdited=()=>{
    // A late Host answer must never replace a newer keystroke.
    inputRevision.current++;
    readGeneration.current++;
    const input=valueRef.current?.value??'';
    if(edited){
      const changed=originalValueRef.current===null||input!==originalValueRef.current;
      valueEditedRef.current=changed;setValueEdited(changed);
    }else setNewValueDirty(input.length>0);
    setMessage('');
  };
  const restoreValue=()=>{
    inputRevision.current++;readGeneration.current++;
    valueEditedRef.current=false;setValueEdited(false);
    if(valueRef.current)valueRef.current.value=originalValueRef.current??'';
    setMessage('');
  };
  const clearValue=()=>{
    inputRevision.current++;readGeneration.current++;
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
    event?.preventDefault?.();
    if(disabled)return;
    if(!draft.name.trim()){
      setMessage('请输入 Cookie 名称。');nameRef.current?.focus();return;
    }
    setMessage('');
    const expiry=draft.session?undefined:fromLocal(draft.expiration);
    if(!draft.session&&(!Number.isFinite(expiry)||expiry<=Date.now()/1000)){
      setMessage('请填写未来的有效过期时间。');return;
    }
    onSave({...draft,expirationDate:expiry,
      value:valueRef.current?.value||''},{
      originalId:row?.id||null,valueEdited:!edited||valueEdited
    });
  };
  // Cookie attributes are not login credentials: remove the native form-submit
  // signal while retaining keyboard Enter-to-save for ordinary text inputs.
  return <section className="cookie-inline-editor inline-editor od-surface od-surface--padded"
    role="group" aria-label={edited?'编辑 Cookie '+row.name:'新建 Cookie'}
    onKeyDown={event=>{
      if(event.key==='Enter'&&!event.nativeEvent?.isComposing&&
        event.target.matches?.('input[type="text"]'))submit(event);
    }}>
    <div className="cookie-editor-heading editor-top">
      <strong>{edited?'编辑 Cookie':'新建 Cookie'}</strong>
      <span className="editor-top-right">
        {dirty&&<em className="cookie-dirty-note">未保存</em>}
      </span>
    </div>
    <div className="cookie-editor-grid cookie-editor-primary">
      <CookieFormField label="名称">
        <input ref={nameRef} id="opendesk-cookie-attribute-key" name="opendesk-cookie-attribute-key" type="text" autoComplete="off" autoCapitalize="off" spellCheck={false} className="od-field" aria-label="名称" aria-invalid={message.startsWith('请输入 Cookie 名称')||undefined} required maxLength={256}
          value={draft.name} disabled={disabled}
          onChange={e=>update('name',e.target.value)}/>
      </CookieFormField>
      <CookieValueField inputRef={valueRef} disabled={disabled} onChange={setInputEdited}
        placeholder={edited?(readStatus==='loading'?'正在读取原值…':
          readStatus==='expired'?'原值已自动隐藏 · 保存时重新读取':
          '未读取原值 · 可输入新值'):'输入 Cookie 值（可为空）'}/>
    </div>
    {edited&&<div className="cookie-value-restore value-controls">
      {valueEdited?<span>{valueRef.current?.value===''?'将写入空值':'将写入新值'}</span>:
        readStatus==='unavailable'?<span>原值未读取，留空代表保留</span>:null}
      <Button type="button" variant="secondary" className="inline-link"
        disabled={disabled} onClick={valueEdited?restoreValue:clearValue}>
        {valueEdited?'恢复原值':'清空值'}
      </Button>
    </div>}
    <CookieAdvancedFields draft={draft} existing={edited} disabled={disabled}
      onChange={update} error={message}/>
    {edited&&draft.name!==row.name&&<p className="editor-hint">
      更名将先新建并核实，再删除旧名称；失败时请刷新核对。
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
      <Button variant="primary" type="button" onClick={submit} disabled={disabled||(edited&&!dirty)}>保存 Cookie</Button>
    </div>
  </section>;
}
