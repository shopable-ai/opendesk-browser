// Offline-only container adapter. The installable entry never imports it.
import * as React from 'react';
import {Button,IconButton} from '@opendesk/ui';
import {listContainerChoices} from './rule-selection.js';
import {sampleLists as lists} from './rule-sample.js';
export default function ListScopeAssistant({disabled,scope,config,onOpenChange,onFeedback,onUse}){
  const [open,setOpen]=React.useState(false),[choices,setChoices]=React.useState([]),[selected,setSelected]=React.useState(null),[error,setError]=React.useState('');
  const dialog=React.useRef(null),sample=React.useRef(null),trigger=React.useRef(null),identity=React.useRef(''),composing=React.useRef(false),opened=React.useRef(false);
  const fingerprint=()=>JSON.stringify({scope,config});
  const close=(used=false)=>{setOpen(false);opened.current=false;onOpenChange(false);requestAnimationFrame(()=>{
    const button=trigger.current;const target=used?button?.closest('.rule-input-group')?.querySelector('input'):button;target?.focus();
  });};
  React.useEffect(()=>()=>{if(opened.current)onOpenChange(false);},[onOpenChange]);
  React.useLayoutEffect(()=>{
    if(open&&!dialog.current.open){dialog.current.showModal();dialog.current.querySelector('[data-close-scope]').focus();}
    else if(!open&&dialog.current.open)dialog.current.close();
  },[open]);
  function begin(event){
    if(disabled)return;
    trigger.current=event.currentTarget;identity.current=fingerprint();setSelected(null);setError('');
    setChoices(listContainerChoices(sample.current,scope.item));setOpen(true);opened.current=true;onOpenChange(true);
  }
  // The offline adapter mirrors one-click next-container selection. A real
  // website adapter must invoke its authorized page API, never sandbox DOM.
  function switchList(){
    if(disabled)return;
    const available=listContainerChoices(sample.current,scope.item);
    if(!available.length){onFeedback('没有可切换的列表；请检查列表项，或使用点选。');return;}
    if(available.length===1&&available[0].container===scope.container.trim()){onFeedback('当前只有一个可用列表，范围未更改。');return;}
    const index=available.findIndex(row=>row.container===scope.container.trim()),next=available[(index+1)%available.length];
    onUse({container:next.container,item:next.item});onFeedback('已切换到「'+next.label+'」· '+next.count+' 条记录（离线示例）');
  }
  function use(){
    if(disabled||!selected)return;
    if(identity.current!==fingerprint()){setError('配置已变化，请取消后重新选择列表。');return;}
    const current=listContainerChoices(sample.current,scope.item).find(row=>row.container===selected.container);
    if(!current){setError('列表项未匹配，请取消后检查列表范围。');return;}
    onUse({container:current.container,item:current.item});onFeedback('已选中「'+current.label+'」· '+current.count+' 条记录（离线示例）');close(true);
  }
  function keyboard(event){
    event.stopPropagation();if(event.nativeEvent.isComposing||event.nativeEvent.keyCode===229||composing.current)return;
    if(event.key==='Escape'){event.preventDefault();close();}
    if(event.key==='Tab'){
      const controls=[...dialog.current.querySelectorAll('button:not(:disabled),[tabindex="0"],summary')].filter(el=>el.getClientRects().length),first=controls[0],last=controls.at(-1),active=dialog.current.ownerDocument.activeElement;
      if(event.shiftKey&&active===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&active===last){event.preventDefault();first?.focus();}
    }

  }
  return <>
    <IconButton className="rule-input-icon scope-input-icon" label="切换列表容器" title="切换列表容器" disabled={disabled} onClick={switchList}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/></svg></IconButton>
    <IconButton className="rule-input-icon scope-input-icon" label="点选列表容器" title="点选列表容器" disabled={disabled} onClick={begin}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5m6 0h5v5m0 6v5h-5M9 20H4v-5m6-5 8 3-4 1-1 4z"/></svg></IconButton>
    <dialog ref={dialog} className="rule-picker-dialog scope-picker-dialog" aria-label="点选列表容器" aria-describedby="scope-picker-description"
      onCancel={event=>{event.preventDefault();if(!composing.current)close();}} onKeyDown={keyboard}
      onCompositionStartCapture={()=>{composing.current=true;}} onCompositionEndCapture={()=>{composing.current=false;}}>
      <div className="picker-heading"><h2>点一下要采集的列表</h2><IconButton data-close-scope label="关闭列表选择" onClick={()=>close()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></IconButton></div>
      <div className="picker-body">
        <p id="scope-picker-description" className="picker-disclaimer">离线示例，未连接真实网页。选择后填入范围草稿，应用并保存后生效。</p>
        <div ref={sample} className="scope-sample" aria-label="可点选列表的示例网页">{lists.map(list=>{
          const choice=choices.find(row=>row.container==='#'+list.id);
          const choose=()=>{if(choice){setSelected(choice);setError('');}};
          return <div key={list.id} className="scope-list-card" data-selected={selected?.container==='#'+list.id} role="button" tabIndex={open&&choice?0:-1} aria-disabled={!choice} aria-pressed={selected?.container==='#'+list.id} aria-label={'点选列表 '+list.label+'，'+list.books.length+' 条记录'} onClick={choose} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose();}}}>
            <div className="scope-list-heading"><strong>{list.label}</strong><span>{list.books.length} 条记录</span></div>
            <ul id={list.id} aria-label={list.label}>{list.books.map(([title])=><li key={title}><span className="book-title">{title}</span></li>)}</ul>
          </div>;
        })}</div>
        {!choices.length&&<p className="picker-warning" role="status">列表项「{scope.item||'li'}」未匹配示例列表的直接子项。请取消后调整列表项，或手动输入容器。</p>}
        {selected&&<div className="scope-preview" role="status" aria-live="polite"><strong>将采集 {selected.count} 条记录</strong><ol>{selected.samples.map((text,index)=><li key={index}>{text}</li>)}</ol><details className="picker-advanced"><summary>查看列表规则</summary><code>{selected.container} → {selected.item}</code></details></div>}
      </div>
      <div className="picker-footer">{error&&<p className="picker-warning" role="alert">{error}</p>}<div className="picker-footer-actions"><Button base="aria" variant="quiet" onClick={()=>close()}>取消</Button><Button base="aria" variant="secondary" disabled={disabled||!selected||Boolean(error)} onClick={use}>使用此列表</Button></div></div>
    </dialog>
  </>;
}
