import * as React from 'react';
import {Button,IconButton} from '@opendesk/ui';
import {createInspection} from './page-inspection.js';

// Render bounded text candidates from the authorized target. Never render target
// HTML, load target assets, or treat this sandbox's DOM as the target document.
function PageAssistant({kind,fieldKey,disabled,scope,config,onOpenChange,onFeedback=()=>{},onUse}){
  const [open,setOpen]=React.useState(false),[selected,setSelected]=React.useState(null),[error,setError]=React.useState('');
  const [snapshot,setSnapshot]=React.useState(null);
  const [session]=React.useState(()=>createInspection(globalThis.ScrapyAppSdk.createSdk(
    (operation,payload)=>globalThis.OpenDeskTool.request(operation,payload)),setSnapshot));
  const state=snapshot||session.state;
  const dialog=React.useRef(null),trigger=React.useRef(null),composing=React.useRef(false),switching=React.useRef(false),applying=React.useRef(false);
  const identity=JSON.stringify({scope,config}),currentIdentity=React.useRef(identity),openedIdentity=React.useRef(identity);
  currentIdentity.current=identity;
  const fields=kind==='fields',choices=state.result?.choices||[];
  React.useEffect(()=>{onOpenChange(open||session.active());},[open,state.phase,onOpenChange,session]);
  React.useEffect(()=>{
    const timer=setInterval(()=>{if(session.active()&&session.state.clientRequestId)session.refresh();},800);
    return ()=>clearInterval(timer);
  },[session]);
  React.useLayoutEffect(()=>{
    if(open&&!dialog.current.open){dialog.current.showModal();dialog.current.querySelector('[data-close-picker]')?.focus();}
    else if(!open&&dialog.current.open){dialog.current.close();requestAnimationFrame(()=>{
      const target=trigger.current;const input=target?.closest('.rule-input-group')?.querySelector('input');(input||target)?.focus();
    });}
  },[open]);
  function begin(event,next=false){
    if(disabled||session.active())return;
    trigger.current=event.currentTarget;switching.current=next;openedIdentity.current=currentIdentity.current;
    setSelected(null);setError('');if(!next)setOpen(true);onOpenChange(true);
    session.begin({url:config.url,kind,container:scope?.container??config.itemConfig._listContainer??'',
      item:scope?.item??config.itemConfig._listItem??'',mode:next?'snapshot':'click'},openedIdentity.current);
  }
  async function use(index){
    if(applying.current||disabled)return;
    applying.current=true;
    try{
      const choice=await session.use(index,currentIdentity.current);
      if(currentIdentity.current!==openedIdentity.current)throw Error('配置已变化，请取消后重新点选');
      if(fields)onUse(choice.rule);
      else {onUse({container:choice.container,item:choice.item});onFeedback('已选中「'+choice.label+'」· '+choice.count+' 条记录');}
      switching.current=false;await session.close();setOpen(false);
    }catch(issue){setError(issue.message);onFeedback(issue.message);switching.current=false;}
    finally{applying.current=false;}
  }
  React.useEffect(()=>{
    if(!switching.current||state.phase!=='ready')return;
    const index=choices.findIndex(row=>row.container===(scope?.container||'').trim());
    if(!choices.length){onFeedback('没有符合当前列表项的列表，范围未更改。');switching.current=false;session.close();return;}
    if(choices.length===1&&index===0){onFeedback('当前只有一个可用列表，范围未更改。');switching.current=false;session.close();return;}
    use((index+1)%choices.length);
  },[state.phase,choices]);
  React.useEffect(()=>{if(switching.current&&state.phase==='error'){switching.current=false;onFeedback(state.error);}},[state.phase,state.error]);
  async function close(){
    switching.current=false;await session.close();
    if(!session.active())setOpen(false);
  }
  React.useEffect(()=>{if(state.cancelled&&state.phase==='closed')setOpen(false);},[state.phase,state.cancelled]);
  const label=fields?'点选生成选择器 '+(fieldKey||'新字段'):'点选列表容器';
  return <>
    {!fields&&<IconButton className="rule-input-icon scope-input-icon" label="切换列表容器" disabled={disabled||session.active()} onClick={event=>begin(event,true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4"/></svg></IconButton>}
    <IconButton className="rule-input-icon rule-pick-trigger" label={label} title="从真实网页内容中选择" disabled={disabled||session.active()} onClick={event=>begin(event)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5m6 0h5v5m0 6v5h-5M9 20H4v-5m6-5 8 3-4 1-1 4z"/></svg></IconButton>
    {!open&&session.active()&&<span className="secondary" role="status">{state.error||'正在读取网页列表…'}</span>}
    <dialog ref={dialog} className="rule-picker-dialog" aria-label={label} onCancel={event=>{event.preventDefault();if(!composing.current)close();}}
      onCompositionStartCapture={()=>{composing.current=true;}} onCompositionEndCapture={()=>{composing.current=false;}}
      onKeyDown={event=>{
        event.stopPropagation();if(event.nativeEvent.isComposing||event.nativeEvent.keyCode===229||composing.current)return;
        if(event.key==='Escape'){event.preventDefault();close();}
        if(event.key==='Tab'){
          const nodes=[...dialog.current.querySelectorAll('button:not(:disabled)')],first=nodes[0],last=nodes.at(-1),active=dialog.current.ownerDocument.activeElement;
          if(event.shiftKey&&active===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&active===last){event.preventDefault();first?.focus();}
        }
      }}>
      <div className="picker-heading"><h2>{fields?'选择要采集的网页内容':'选择网页列表'}</h2><IconButton data-close-picker label="关闭点选" onClick={close}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></IconButton></div>
      <div className="picker-body">
        <p className="picker-disclaimer">请在目标网页点击要采集的内容或列表。点选完成后可在这里核对内容并确认，表单输入不参与点选。</p>
        {state.phase!=='ready'&&<p role="status">{state.cancelled?'正在停止，等待原检查释放…':session.active()?'请到目标网页点击需要采集的内容…':state.error||'未取得网页内容'}</p>}
        {state.phase==='ready'&&!choices.length&&<p role="status">当前范围没有可用内容，请取消后检查列表范围。</p>}
        <div className="scope-sample">{choices.map((choice,index)=><Button base="aria" variant="quiet" className="scope-list-card page-choice" key={index} aria-pressed={selected===index} disabled={state.phase!=='ready'} onClick={()=>{setSelected(index);setError('');}}>
          <strong>{choice.label}</strong><span className="secondary">{fields?(choice.read==='text'?'文字':choice.read==='href'?'链接地址':'图片地址')+' · '+choice.total+' 条记录':choice.count+' 条记录'}</span>
          <span className="page-choice-samples">{choice.samples?.slice(0,3).map((sample,index)=><span key={index}>{typeof sample==='string'?sample:sample.value||'未找到内容'}</span>)}</span>
          {fields&&choice.status!=='pass'&&<span className="picker-warning">{choice.missing} 条缺失 · {choice.ambiguous} 条多匹配 · {choice.empty} 条空值</span>}
        </Button>)}</div>
        {selected!==null&&choices[selected]&&<details className="picker-advanced"><summary>查看生成的规则</summary><code>{fields?choices[selected].rule:choices[selected].container+' → '+choices[selected].item}</code></details>}
        {(error||state.error)&&<p className="picker-warning" role="alert">{error||state.error}</p>}
      </div>
      <div className="picker-footer"><div className="picker-footer-actions"><Button base="aria" variant="quiet" onClick={close}>取消</Button><Button base="aria" variant="secondary" disabled={disabled||state.phase!=='ready'||selected===null||(fields&&choices[selected]?.status!=='pass')} onClick={()=>use(selected)}>使用此{fields?'内容':'列表'}</Button></div></div>
    </dialog>
  </>;
}
export function RuleAssistant(props){return <PageAssistant {...props} kind="fields"/>;}
export function ListScopeAssistant(props){return <PageAssistant {...props} kind="lists"/>;}
