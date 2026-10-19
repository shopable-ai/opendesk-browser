import * as React from 'react';
// Trusted presentation; TaskWorkbench alone owns task identities, drafts,
// permissions, installation, params, execution, RunHost and results.
export function MyTaskCount({value=''}) {return <>{String(value)}</>;}
export function MyTaskDetail({value=''}) {
  const facts=String(value).split('\n').filter(Boolean);
  return <div className="task-detail-facts">
    {facts.map((line,i)=>{
      const at=line.indexOf('：');
      return at<0?<p key={i}>{line}</p>:<div key={i} className="task-detail-fact">
        <span>{line.slice(0,at)}</span><strong>{line.slice(at+1)}</strong>
      </div>;
    })}
  </div>;
}
export function MyTaskRows({rows=[],selectedId='',emptyText='',onSelect,
  manageMode=false,onManage,renderWorkspace,workspace=null}) {
  const [expandedTaskId,setExpandedTaskId]=React.useState(selectedId);
  const previousSelection=React.useRef(selectedId);
  const rowsRef=React.useRef(null),returnFocus=React.useRef(null);
  React.useLayoutEffect(()=>{
    if(previousSelection.current!==selectedId){
      previousSelection.current=selectedId;setExpandedTaskId(selectedId);
    }
  },[selectedId]);
  React.useEffect(()=>{if(manageMode&&selectedId)setExpandedTaskId(selectedId);},[manageMode,selectedId]);
  const selected=rows.some(row=>row.taskId===selectedId),expanded=expandedTaskId===selectedId&&selected;
  // Keep ONE React workspace mounted across selection/filter/collapse, retaining
  // IME, form controls and disclosure state; only its visibility changes.
  React.useLayoutEffect(()=>{
    if(!expanded&&returnFocus.current){
      [...rowsRef.current?.querySelectorAll('[data-task-id]')||[]].find(node=>node.dataset.taskId===selectedId)?.focus({preventScroll:true});
      returnFocus.current=null;
    }
  },[expanded,selectedId]);
  return <div ref={rowsRef}>
    {rows.length===0&&<p className="task-search-empty">{emptyText}</p>}
    {rows.map(row=><div key={row.taskId}
      className={'task-card-group'+(row.taskId===selectedId?' selected':'')}
      data-management={manageMode?'true':undefined}>
      <button type="button" className="task-card" data-task-id={row.taskId}
        aria-pressed={row.taskId===selectedId} aria-expanded={row.taskId===selectedId&&expanded}
        aria-controls="task-selected-workspace"
        onClick={event=>{
          if(!event.nativeEvent?.isTrusted)return;
          if(row.taskId===selectedId)setExpandedTaskId(current=>current===row.taskId?'':row.taskId);
          else {setExpandedTaskId(row.taskId);onSelect?.(row.taskId);}
        }}>
        <span className="task-card-icon" aria-hidden="true">{String(row.title||row.taskId).slice(0,1).toUpperCase()}</span>
        <span className="task-card-copy"><strong>{row.title}</strong><small>{row.description}</small></span>
        <span className={'task-card-state'+(row.enabled?'':' off')}>{row.enabled?'':'已停用'}</span>
      </button>
      {manageMode&&<button type="button" className="task-card-manage od-icon-button"
        aria-label={'管理「'+row.title+'」'} title={'管理「'+row.title+'」'}
        onClick={event=>{
          if(!event.nativeEvent?.isTrusted)return;
          setExpandedTaskId(row.taskId);onManage?.(row.taskId);
        }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h9m6 0h1M4 17h1m6 0h9"/>
          <circle cx="16" cy="7" r="3"/><circle cx="8" cy="17" r="3"/></svg>
      </button>}
    </div>)}
    <div hidden={!expanded} onFocusCapture={event=>{returnFocus.current=event.target;}}>
      {renderWorkspace?.()||(React.isValidElement(workspace)?workspace:null)}
    </div>
  </div>;
}

export {MyTasksPage,MyTasksDock} from './my-page.tsx';
