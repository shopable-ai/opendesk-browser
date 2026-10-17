import * as React from 'react';
// Trusted presentation; TaskWorkbench alone owns task identities, drafts,
// permissions, installation, params, execution, RunHost and results.
export function MyTaskCount({value=''}) {return <>{String(value)}</>;}
export function MyTaskDetail({value=''}) {return <>{String(value)}</>;}
export function MyTaskRows({rows=[],selectedId='',workspace=null,emptyText='',onSelect}) {
  const selectedGroup=React.useRef(null),fallback=React.useRef(null);
  // Relocate the SAME live form: never remount controls, lose undo/IME or
  // replace their original listeners and TaskWorkbench data ownership.
  React.useLayoutEffect(()=>{
    if(!workspace)return;
    const selected=selectedGroup.current,holder=selected||fallback.current;
    if(holder&&workspace.parentNode!==holder)holder.append(workspace);
    workspace.hidden=!selected;
  },[rows,selectedId,workspace]);
  return <>
    {rows.length===0&&<p className="task-search-empty">{emptyText}</p>}
    {rows.map(row=><div key={row.taskId}
      className={'task-card-group'+(row.taskId===selectedId?' selected':'')}
      ref={row.taskId===selectedId?selectedGroup:null}>
      <button type="button" className="task-card" data-task-id={row.taskId}
        aria-pressed={row.taskId===selectedId} aria-expanded={row.taskId===selectedId}
        aria-controls="task-selected-workspace"
        onClick={event=>{if(event.nativeEvent?.isTrusted)onSelect?.(row.taskId);}}>
        <span className="task-card-icon" aria-hidden="true">{String(row.title||row.taskId).slice(0,1).toUpperCase()}</span>
        <span className="task-card-copy"><strong>{row.title}</strong><small>{row.description}</small></span>
        <span className={'task-card-state'+(row.enabled?'':' off')}>{row.enabled?'':'已停用'}</span>
      </button>
    </div>)}
    <div ref={fallback} hidden aria-hidden="true"/>
  </>;
}
