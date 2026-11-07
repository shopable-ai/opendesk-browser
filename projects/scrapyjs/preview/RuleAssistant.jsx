// Offline row picker. The installable entry never imports this sample or adapter.
import * as React from 'react';
import {Button,IconButton} from '@opendesk/ui';
import {suggestSelector,probeRule} from './rule-selection.js';
import {sampleLists} from './rule-sample.js';
const thumb='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="44"><rect width="32" height="44" rx="3" fill="#e2e6eb"/><path d="M8 12h16M8 18h12" stroke="#6b7280"/></svg>');
export default function RuleAssistant({fieldKey,disabled,config,onOpenChange,onUse}){
  const list=sampleLists.find(row=>'#'+row.id===config.itemConfig._listContainer)||sampleLists[0],books=list.books;
  const [open,setOpen]=React.useState(false),[selected,setSelected]=React.useState(null),[read,setRead]=React.useState('text'),[report,setReport]=React.useState(null);
  const dialog=React.useRef(null),sample=React.useRef(null),trigger=React.useRef(null),composing=React.useRef(false),identity=React.useRef(null);
  const selector=selected?.selector||'',rule=selector+'::'+read;
  const restore=()=>requestAnimationFrame(()=>trigger.current?.closest('.rule-input-group')?.querySelector('input')?.focus());
  const close=()=>{setOpen(false);onOpenChange(false);restore();};
  React.useEffect(()=>()=>{if(identity.current)onOpenChange(false);},[onOpenChange]);
  React.useLayoutEffect(()=>{
    if(open&&!dialog.current.open){dialog.current.showModal();dialog.current.querySelector('[data-close-picker]').focus();}
    else if(!open&&dialog.current.open)dialog.current.close();
  },[open]);
  const begin=()=>{
    identity.current=JSON.stringify(config);setSelected(null);setReport(null);setRead('text');
    for(const node of sample.current?.querySelectorAll('[data-selected]')||[])node.removeAttribute('data-selected');
    setOpen(true);onOpenChange(true);
  };
  const inspect=(css,type)=>setReport(probeRule(sample.current,css+'::'+type,config.itemConfig._listContainer||'',config.itemConfig._listItem||''));
  const pick=event=>{
    event.preventDefault();
    const element=event.target.closest('a,img,.book-price');if(!element||!sample.current.contains(element))return;
    const css=suggestSelector(element,element.closest('li')),isImage=element.localName==='img';
    for(const node of sample.current.querySelectorAll('[data-selected]'))node.removeAttribute('data-selected');element.setAttribute('data-selected','true');
    const type=isImage?'data-src':'text';setRead(type);
    setSelected({selector:css,label:isImage?element.alt:element.textContent.trim(),image:isImage,link:element.hasAttribute('href')});inspect(css,type);
  };
  const use=()=>{
    if(disabled||report?.status!=='pass')return;
    if(identity.current!==JSON.stringify(config)){setReport({status:'error',error:'配置已变化，请取消后重新点选。'});return;}
    const result=probeRule(sample.current,rule,config.itemConfig._listContainer||'',config.itemConfig._listItem||'');
    if(result.status!=='pass'){setReport(result);return;}
    onUse(rule);close();
  };
  const issue=!report?'请点一下要采集的内容':report.error?'当前列表范围与示例不符，请返回调整列表范围。':report.missing?'有 '+report.missing+' 条记录没有这项内容，请换一个元素。':report.ambiguous?'一条记录选中了多项内容，请点选更具体的元素。':report.empty?'有 '+report.empty+' 条记录内容为空，请换一个元素。':'';
  return <>
    <IconButton ref={trigger} className="rule-input-icon rule-pick-trigger" label={'点选生成选择器 '+(fieldKey||'新字段')} title="从网页点选内容" disabled={disabled} onClick={begin}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5m6 0h5v5m0 6v5h-5M9 20H4v-5m6-5 8 3-4 1-1 4z"/></svg></IconButton>
    <dialog ref={dialog} className="rule-picker-dialog" aria-label={'为 '+(fieldKey||'新字段')+' 点选网页内容'} onCancel={event=>{event.preventDefault();if(!composing.current)close();}}
      onCompositionStartCapture={()=>{composing.current=true;}} onCompositionEndCapture={()=>{composing.current=false;}}
      onKeyDown={event=>{
        event.stopPropagation();if(event.nativeEvent.isComposing||event.nativeEvent.keyCode===229||composing.current)return;
        if(event.key==='Escape'){event.preventDefault();close();}
        if(event.key==='Tab'){
          const controls=[...dialog.current.querySelectorAll('button,a,[tabindex="0"],summary')].filter(el=>!el.disabled&&el.getClientRects().length),first=controls[0],last=controls.at(-1),active=dialog.current.ownerDocument.activeElement;
          if(event.shiftKey&&active===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&active===last){event.preventDefault();first?.focus();}
        }
      }}>
      {open&&<><div className="picker-heading"><h2>点一下要采集的内容</h2><IconButton data-close-picker label="关闭点选" onClick={close}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></IconButton></div>
      <div className="picker-body">
        <p className="picker-disclaimer">离线示例，未连接真实网页。选择的内容将填入「{fieldKey||'新字段'}」。</p>
        <div ref={sample} className="picker-sample" aria-label="可点选的示例网页" onClick={pick} onKeyDown={event=>{if(event.key===' '&&event.target.matches('[data-pickable]')){event.preventDefault();event.target.click();}}}>
          <div className="picker-site"><span>{list.label} · 示例网页</span><span>{books.length} 条记录</span></div>
          <ul id={list.id}>{books.map(([title,price,id],index)=><li key={id}><img className="book-cover" data-src={'/covers/'+id+'.jpg'} src={thumb} alt={title+'的封面'} aria-label={'点选封面 '+title} role="button" tabIndex={0} data-pickable="true" onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.click();}}/><div><a className="book-title" href={'/books/'+id} role="button" aria-label={'点选标题 '+title} data-pickable="true">{title}</a><span className="book-author">作者 {index+1}</span>{price&&<span className="book-price" role="button" aria-label={'点选价格 '+title} tabIndex={0} data-pickable="true" onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.click();}}>{price}</span>}</div></li>)}</ul>
        </div>
        {selected&&<>
          {(selected.link||selected.image)&&<div className="picker-read-options" role="group" aria-label="采集什么内容">{(selected.image?[['data-src','图片地址']]:[['text','文字'],['href','链接地址']]).map(([value,label])=><Button key={value} base="aria" variant={read===value?'secondary':'quiet'} aria-pressed={read===value} onClick={()=>{setRead(value);inspect(selector,value);}}>{label}</Button>)}</div>}
          <div className="picker-preview"><h3>将采集到</h3>{report?.rows&&<ol className="picker-values">{report.rows.map(row=><li key={row.index}><span className="secondary">{row.index}</span><code title={row.value}>{row.value||'未找到内容'}</code></li>)}</ol>}</div>
          <details className="picker-advanced"><summary>查看生成的规则</summary><code>{rule}</code>{selector.includes(':nth-')&&<p className="picker-warning">此内容依赖页面顺序，网页改版后需要重新点选。</p>}</details>
        </>}
      </div>
      <div className="picker-footer">{issue&&<p className={report?'picker-warning':'secondary'} role="status">{issue}</p>}<div className="picker-footer-actions"><Button base="aria" variant="quiet" onClick={close}>取消</Button><Button base="aria" data-use-picker variant="secondary" disabled={disabled||report?.status!=='pass'} onClick={use}>使用此内容</Button></div></div></>}
    </dialog>
  </>;
}
