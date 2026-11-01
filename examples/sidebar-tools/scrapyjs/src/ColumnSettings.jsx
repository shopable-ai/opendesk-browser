import * as React from 'react';
import {Input} from '@opendesk/ui';

// Names are CSV-only metadata. Keys and order always come from the caller.
export default function ColumnSettings({keys,names={},onNamesChange,locked,idPrefix='csv'}){
  const baseline=React.useRef(null);
  const labels=keys.map(key=>(Object.hasOwn(names,key)?names[key].normalize('NFC').trim():'')||key);
  const duplicate=new Set(labels).size!==labels.length;
  function change(key,value){onNamesChange({...names,[key]:value});}
  return <div className="csv-header-editor">
    <div className="csv-name-head" aria-hidden="true"><span>原字段</span><span>显示名称</span></div>
    <div className="csv-name-list" role="group" aria-label="CSV 表头名称">{keys.map((key,index)=><div className="csv-name-row" key={key}>
      <label htmlFor={idPrefix+'-name-'+index}><code>{key}</code></label>
      <Input id={idPrefix+'-name-'+index} className="od-field" aria-label={key+' 显示名称'} value={Object.hasOwn(names,key)?names[key]:''} placeholder={key} maxLength={80} disabled={locked}
        onFocus={()=>{baseline.current={key,value:Object.hasOwn(names,key)?names[key]:''};}} onChange={event=>change(key,event.target.value)}
        onKeyDown={event=>{
          if(event.nativeEvent.isComposing||event.nativeEvent.keyCode===229)return;
          if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(baseline.current?.key===key)change(key,baseline.current.value);}
          if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}
        }}/>
    </div>)}</div>
    <p className="secondary">留空使用原字段名。</p>
    <div className="csv-header-preview" role="region" aria-label="CSV 表头预览" tabIndex={0}><table><caption>CSV 表头预览</caption><thead><tr>{labels.map((label,index)=><th scope="col" key={keys[index]}>{label}</th>)}</tr></thead></table></div>
    {duplicate&&<p className="error" role="alert">表头名称重复，请使用不同名称。</p>}
  </div>;
}
