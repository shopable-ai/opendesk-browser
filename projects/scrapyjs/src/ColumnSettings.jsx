import * as React from 'react';
import {Input} from '@opendesk/ui';
import FieldOrder from './FieldOrder.jsx';

// Names are CSV-only metadata. Keys and order always come from the caller.
export default function ColumnSettings({keys,names={},onNamesChange,locked,idPrefix='csv',onOrderChange,onMovingChange,active=true}){
  const baseline=React.useRef(null);
  const sortable=Boolean(onOrderChange),nameLabel=sortable?'CSV 表头':'显示名称';
  const labels=keys.map(key=>(Object.hasOwn(names,key)?names[key].normalize('NFC').trim():'')||key);
  const duplicate=new Set(labels).size!==labels.length;
  function change(key,value){onNamesChange({...names,[key]:value});}
  const row=(key,index,handle)=><div className="csv-name-row" key={key}>
      {handle}
      <label htmlFor={idPrefix+'-name-'+index}><code>{key}</code></label>
      <Input id={idPrefix+'-name-'+index} className="od-field" aria-label={key+' '+nameLabel} value={Object.hasOwn(names,key)?names[key]:''} placeholder={key} maxLength={80} disabled={locked}
        onFocus={()=>{baseline.current={key,value:Object.hasOwn(names,key)?names[key]:''};}} onChange={event=>change(key,event.target.value)}
        onKeyDown={event=>{
          if(event.nativeEvent.isComposing||event.nativeEvent.keyCode===229)return;
          if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(baseline.current?.key===key)change(key,baseline.current.value);}
          if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}
        }}/>
    </div>;
  return <div className="csv-header-editor" data-sortable={sortable}>
    <div className="csv-name-head" aria-hidden="true">{sortable&&<span/>}<span>原字段</span><span>{nameLabel}</span></div>
    {sortable?<FieldOrder id={idPrefix+'-column-list'} keys={keys} label="调整 CSV 列顺序：" locked={locked} active={active} onOrderChange={onOrderChange} onMovingChange={onMovingChange} renderItem={row}/>:<div className="csv-name-list" role="group" aria-label="CSV 表头名称">{keys.map((key,index)=>row(key,index))}</div>}
    <p className="secondary">留空使用原字段名。</p>
    <div className="csv-header-preview" role="region" aria-label="CSV 表头预览" tabIndex={0}><table><caption>CSV 表头预览</caption><thead><tr>{labels.map((label,index)=><th scope="col" key={keys[index]}>{label}</th>)}</tr></thead></table></div>
    {duplicate&&<p className="error" role="alert">表头名称重复，请使用不同名称。</p>}
  </div>;
}
