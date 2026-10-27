import * as React from 'react';
import {Button} from '@opendesk/ui';
import {CookieFormField,CookieValueField,CookieAdvancedFields,CookieExpirationField,CookieIcon,CookieIconButton} from './CookieEditorView.jsx';
import {localExpirationText,parseLocalExpiration} from '../domain/cookie-expiration.js';

// Cookie Value is deliberately an uncontrolled DOM input. React state, props,
// app snapshots and diagnostics never receive the sensitive value.
// Expiration converts from the user's local wall time to Unix seconds only
// after rejecting DST gaps and overlapping local times. Never infer a date.
export default function CookieInlineEditor({row=null,target,disabled=false,
  readValue,onSave,onCancel,onDelete,onDirty}){
  const valueRef=React.useRef(null),nameRef=React.useRef(null);
  // Raw Cookie values never enter React state, props or snapshots.
  const originalValueRef=React.useRef(null),valueEditedRef=React.useRef(false);
  const readGeneration=React.useRef(0),inputRevision=React.useRef(0);
  const readTimer=React.useRef(null),readValueRef=React.useRef(readValue);
  readValueRef.current=readValue;
  const [valueEdited,setValueEdited]=React.useState(false);
  // Only a presence flag is React state; the raw value remains in DOM/refs.
  const [valuePresent,setValuePresent]=React.useState(false);
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
    expiration:localExpirationText(row?.expirationDate),
    storeId:row?.storeId,partitionKey:row?.partitionKey
  }));
  const edited=!!row;
  const initial=React.useRef(draft);
  const comparable=input=>{
    const parsed=input.session?null:parseLocalExpiration(input.expiration);
    return JSON.stringify({...input,expiration:input.session?null:
      parsed.status==='valid'?parsed.seconds:input.expiration});
  };
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
      setValuePresent(value.length>0);
      setReadStatus('available');
      if(readTimer.current)clearTimeout(readTimer.current);
      readTimer.current=setTimeout(()=>{
        if(!alive)return;
        // Expire the original, never an unsaved user-entered value.
        originalValueRef.current=null;
        if(!valueEditedRef.current&&valueRef.current){
          valueRef.current.value='';setValuePresent(false);
        }
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
    setValuePresent(input.length>0);
    if(edited){
      const changed=originalValueRef.current===null||input!==originalValueRef.current;
      valueEditedRef.current=changed;setValueEdited(changed);
    }else setNewValueDirty(input.length>0);
    setMessage('');
  };
  const restoreValue=()=>{
    // Unknown or expired original value is not an empty original.
    if(originalValueRef.current===null)return;
    inputRevision.current++;readGeneration.current++;
    valueEditedRef.current=false;setValueEdited(false);
    if(valueRef.current)valueRef.current.value=originalValueRef.current;
    setValuePresent(originalValueRef.current.length>0);
    setMessage('');
    valueRef.current?.focus();
  };
  const clearValue=()=>{
    if(disabled||!valueRef.current?.value)return;
    // Clicking x changes the draft only; nothing is written until Save.
    inputRevision.current++;readGeneration.current++;
    valueRef.current.value='';
    setValuePresent(false);
    if(edited){
      const changed=originalValueRef.current===null||originalValueRef.current!=='';
      valueEditedRef.current=changed;setValueEdited(changed);
    }else setNewValueDirty(false);
    setMessage('');
    valueRef.current.focus();
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
    // Existing Chrome timestamps may contain fractional Unix seconds. When
    // the expiration field is unchanged, preserve that exact native value.
    const unchangedExpiry=edited&&row.session===false&&!draft.session&&
      Number.isFinite(row.expirationDate)&&
      draft.expiration===localExpirationText(row.expirationDate);
    const parsed=draft.session?null:parseLocalExpiration(draft.expiration);
    if(!draft.session&&!unchangedExpiry&&parsed.status!=='valid'){
      const explanation={
        ambiguous:'这段本地时间因夏令时切换重复出现，请选择其他时刻。',
        nonexistent:'这段本地时间不存在（可能因夏令时跳变），请重新选择。',
        invalid:'请输入有效的过期时间（设备本地时间）。'
      };
      setMessage(explanation[parsed.status]||explanation.invalid);return;
    }
    const expiry=draft.session?undefined:unchangedExpiry
      ?row.expirationDate:parsed.seconds;
    if(!draft.session&&(!Number.isFinite(expiry)||expiry<=Date.now()/1000)){
      setMessage('过期时间必须晚于现在，请选择将来的时间。');return;
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
      <strong>{edited?'编辑':'新建'}</strong>
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
        showClear={valuePresent} onClear={clearValue}
        placeholder={edited?(readStatus==='loading'?'正在读取原值…':
          readStatus==='expired'?'原值已隐藏':
          '留空保留原值'):'可为空'}/>
    </div>
    {edited&&(valueEdited||readStatus==='unavailable')&&
      <div className="cookie-value-restore value-controls">
        {valueEdited?<span>{valueRef.current?.value===''?'将写入空值':'将写入新值'}</span>:
          <span>未读取 · 留空保留</span>}
        {valueEdited&&originalValueRef.current!==null&&
          <CookieIconButton name="undo" label="恢复原值" className="cookie-value-undo"
            disabled={disabled} onClick={restoreValue}/>}
      </div>}
    <CookieExpirationField draft={draft} disabled={disabled}
      onChange={update} error={message}/>
    <CookieAdvancedFields draft={draft} existing={edited} disabled={disabled}
      onChange={update} error={message}/>
    {edited&&draft.name!==row.name&&<p className="editor-hint">
      更名先创建新项，再删除旧项。
    </p>}
    {message&&<p role="alert" className="cookie-message od-alert od-alert--error">{message}</p>}
    {discardConfirm&&<div className="discard-row" role="status">
      <span>放弃当前未保存修改？</span>
      <Button type="button" variant="secondary" onClick={()=>setDiscardConfirm(false)}>继续编辑</Button>
      <Button type="button" variant="secondary" onClick={()=>onCancel?.()}>放弃</Button>
    </div>}
    <div className="cookie-editor-actions">
      {edited&&<CookieIconButton name="trash" label="删除 Cookie" tone="danger"
        className="cookie-editor-icon-action" onClick={()=>onDelete?.(row.id)}
        disabled={disabled}/>}
      <span className="cookie-spacer"/>
      <CookieIconButton name="close" label="取消" disabled={disabled}
          onClick={requestClose}/>
      <Button variant="primary" type="button" onClick={submit}
        className="cookie-editor-save" disabled={disabled||(edited&&!dirty)}>
        <CookieIcon name="check"/>保存
      </Button>
    </div>
  </section>;
}
