import * as React from 'react';
import {Button,IconButton,Input} from '@opendesk/ui';
import {fieldForm} from './editor.js';
import FieldOrder from './FieldOrder.jsx';

// Valid input updates the configuration draft immediately; App owns validation.
export default function RuleEditor({fields,form,pending,locked,error,invalidField,notice,
  editRow,newRow,editScope,cancel,remove,openJSON,removePending,confirmRemove,cancelRemove,Picker,ScopePicker,pickerLocked,onPickerOpenChange,config,onOrderChange,active}){
  const [scopeFeedback,setScopeFeedback]=React.useState('');
  const [moving,setMoving]=React.useState(false);
  React.useEffect(()=>{if(!pending)setScopeFeedback('');},[pending]);
  const blocked=locked||pending||removePending||moving;

  const row=(key,rule,index,isNew=false,handle=null)=>{
    const active=isNew||(!form.scopeOnly&&form.originalKey===key);
    const editable=isNew||Boolean(fieldForm(key,rule));
    const rowLocked=locked||removePending||moving||(pending&&!active);
    const name=active?form.key:key;
    const value=active?form.rule:(typeof rule==='string'?rule:JSON.stringify(rule));
    const prefix=active?'field':'rule-'+index;
    return <div className="rule-entry" key={index} data-field-key={key} data-editing={active&&pending}>
      <div className="rule-row">
        {handle||<span aria-hidden="true"/>}
        <Input id={prefix+'-key'} className="od-field" aria-label={isNew?'新字段名':'字段名 '+key} value={name} readOnly={!editable} disabled={rowLocked}
          aria-invalid={active&&invalidField==='field-key'} aria-describedby={active&&error?'field-error':undefined} autoComplete="off" spellCheck={false}
          onChange={event=>editRow(key,rule,{key:event.target.value},isNew)}/>
        <div className={'rule-input-group'+(editable?' has-rule-actions':'')}><Input id={prefix+'-rule'} className="od-field rule-value" aria-label={isNew?'新字段采集规则':'采集规则 '+key} value={value} readOnly={!editable} disabled={rowLocked}
          placeholder=".title::text" title={value} aria-invalid={active&&invalidField==='field-rule'} aria-describedby={active&&error?'field-error':'rule-syntax'} autoComplete="off" spellCheck={false}
          onChange={event=>editRow(key,rule,{rule:event.target.value},isNew)}/>
          {editable&&<div className="rule-input-actions">
            {value&&<IconButton className="rule-input-icon" label={isNew?'清空新字段采集规则':'清空采集规则 '+key} disabled={rowLocked} onClick={event=>{const input=event.currentTarget.closest('.rule-input-group').querySelector('input');editRow(key,rule,{rule:''},isNew);requestAnimationFrame(()=>input.focus());}}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg></IconButton>}
            {Picker&&<Picker fieldKey={name} disabled={pickerLocked||removePending||(pending&&!active)} config={config} onOpenChange={onPickerOpenChange} onUse={next=>editRow(key,rule,{rule:next},isNew)}/>}
          </div>}
        </div>
        {!editable?<IconButton label={'在 JSON 编辑字段 '+key} disabled={blocked} onClick={()=>openJSON(key)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16"/></svg></IconButton>:
          <IconButton id={active?'remove-field':'remove-field-'+index} label={isNew?'取消新增字段':'删除字段 '+key} disabled={isNew?locked:blocked} onClick={()=>isNew?cancel():remove(key,rule)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5"/></svg></IconButton>}
      </div>
      {active&&!pending&&error&&!removePending&&<p id="field-error" className="error" role="alert" tabIndex={-1}>{error}</p>}
      {active&&pending&&<div className="rule-edit-feedback">
        {error&&<p id="field-error" className="error" role="alert" tabIndex={-1}>{error}</p>}
      </div>}
    </div>;
  };
  return <section id="field-editor" className="inline-rules" aria-label="采集字段" onKeyDown={event=>{
    if(event.nativeEvent.isComposing||event.nativeEvent.keyCode===229)return;
    if(event.key==='Escape'&&pending&&!removePending&&!locked){event.preventDefault();event.stopPropagation();cancel();}
  }}>
    <div className="rule-column-head" aria-hidden="true"><span/><span>字段名</span><span>选择器 · 取值</span><span/></div>
    <FieldOrder id="field-list" keys={[...fields.map(([key])=>key),...(form.isNew?['']:[])]} onOrderChange={onOrderChange} locked={locked||pending||removePending||form.isNew} active={active} onMovingChange={setMoving}
      renderKey={(_,index)=>index} renderItem={(key,index,handle)=>key?row(key,fields.find(([name])=>name===key)[1],index,false,handle):row('','',index,true)}/>
    <div className="rule-add"><Button base="aria" id="new-field" variant="quiet" disabled={blocked} onClick={newRow}>＋ 添加字段</Button></div>
    <details className="rule-syntax"><summary>规则写法</summary><p id="rule-syntax" className="secondary">文本 <code>.title::text</code> · 链接 <code>a::href</code> · 图片 <code>img::src</code>。复杂规则使用行末 JSON 按钮编辑。</p></details>
    <details id="list-scope" className="rule-scope"><summary>列表范围<span className="secondary">{form.container||'可选'}{form.item?' → '+form.item:''}</span></summary>
      <fieldset>
        <label htmlFor="list-container">列表容器（可选）</label><div className={'rule-input-group'+(ScopePicker?' has-rule-actions scope-input-group':'')}><Input id="list-container" className="od-field" value={form.container} placeholder="可留空，例如 .book-list" aria-invalid={form.scopeOnly&&pending&&Boolean(error)} aria-describedby={form.scopeOnly&&error?'field-error':undefined} disabled={locked||removePending||(pending&&!form.scopeOnly)} onChange={event=>{setScopeFeedback('');editScope({container:event.target.value});}}/>
          {ScopePicker&&<div className="rule-input-actions scope-input-actions"><ScopePicker disabled={pickerLocked||removePending||(pending&&!form.scopeOnly)} scope={{container:form.container,item:form.item}} config={config} onOpenChange={onPickerOpenChange} onFeedback={setScopeFeedback} onUse={editScope}/></div>}
        </div>
        <label htmlFor="list-item">列表项</label><Input id="list-item" className="od-field" value={form.item} placeholder="例如 li" aria-invalid={form.scopeOnly&&pending&&Boolean(error)} aria-describedby={form.scopeOnly&&error?'field-error':undefined} disabled={locked||removePending||(pending&&!form.scopeOnly)} onChange={event=>{setScopeFeedback('');editScope({item:event.target.value});}}/>
      </fieldset>
      <p className="secondary">容器留空时，列表项按整页 CSS 匹配，例如 .book-list &gt; li；填写容器时只取其直接子项。两者留空按单页提取。</p>
      {scopeFeedback&&<p className="scope-feedback secondary" role="status">{scopeFeedback}</p>}
      {form.scopeOnly&&pending&&<div className="rule-edit-feedback">
        {error&&<p id="field-error" className="error" role="alert" tabIndex={-1}>{error}</p>}
      </div>}
    </details>
    {removePending&&<div className="confirmation" role="group" aria-label="确认删除字段">
      <p>确认删除字段「{form.originalKey}」？保存配置后才会写入存储。</p>
      <div className="toolbar"><Button base="aria" id="cancel-remove-field" disabled={locked} onClick={cancelRemove}>取消</Button><Button base="aria" variant="danger" disabled={locked} onClick={confirmRemove}>确认删除字段</Button></div>
    </div>}
    {!pending&&error&&!form.originalKey&&<p id="field-error" className="error" role="alert" tabIndex={-1}>{error}</p>}
    {notice&&<p id="field-edit-help" className="secondary" role="status">{notice}</p>}
  </section>;
}
