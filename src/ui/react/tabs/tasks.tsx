import * as React from 'react';
import {ExtensionRowMenu} from './tools.tsx';
import {Button,IconButton} from '../components/ui/button.tsx';
export function TaskGlyph(){
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="m9 9 6 3-6 3Z"/></svg>;
}
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
  manageMode=false,onManage,onParametersOpen,renderWorkspace,workspace=null,visible=true}) {
  const [expandedTaskId,setExpandedTaskId]=React.useState(selectedId);
  const [menu,setMenu]=React.useState(null);
  const menuModel=React.useMemo(()=>menu?{...menu,onClose:restore=>{
    if(restore)menu.trigger?.focus({preventScroll:true});setMenu(null);
  }}:null,[menu]);
  React.useEffect(()=>{if(!visible||!rows.some(row=>row.taskId===menu?.taskId))setMenu(null);},[visible,rows,menu?.taskId]);
  const openParameters=(row,nativeEvent,trigger)=>{
    setMenu(null);setExpandedTaskId(row.taskId);
    trigger?.focus({preventScroll:true});
    onParametersOpen?.(row.taskId,nativeEvent,trigger);
  };
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
  return <div ref={rowsRef} className="task-browser">
    {rows.length===0&&<p className="task-search-empty">{emptyText}</p>}
    <div className="od-collection" hidden={rows.length===0}>
    {rows.map(row=><div key={row.taskId}
      className={'task-card-group od-collection-row'+(row.taskId===selectedId?' selected':'')}>
      <Button variant="quiet" className="task-card" data-task-id={row.taskId} title={row.title}
        aria-pressed={row.taskId===selectedId} aria-expanded={row.taskId===selectedId&&expanded}
        aria-controls="task-selected-workspace"
        onClick={event=>{
          if(!event.nativeEvent?.isTrusted)return;
          if(row.taskId===selectedId)setExpandedTaskId(current=>current===row.taskId?'':row.taskId);
          else {setExpandedTaskId(row.taskId);onSelect?.(row.taskId);}
        }}>
        <span className="task-card-icon"><TaskGlyph/></span>
        <span className="task-card-copy"><strong>{row.title}</strong>
          <small>{!row.enabled&&<span className="task-card-state off">已停用 · </span>}{row.description}</small>
          </span>
      </Button>
      <span className="task-card-actions">
      <IconButton id={row.taskId===selectedId?'task-parameters-open':undefined} className="task-card-run od-icon-button--quiet"
        label={'配置参数与准备运行「'+row.title+'」'} title="配置参数（运行需确认）" aria-haspopup="dialog" aria-controls="task-parameters-sheet"
        onClick={event=>openParameters(row,event.nativeEvent,event.currentTarget)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 10 7-10 7Z"/></svg>
      </IconButton>
      <IconButton className="task-card-manage od-icon-button--quiet"
        label={'管理「'+row.title+'」'} title="任务菜单" aria-haspopup="menu"
        aria-expanded={menu?.taskId===row.taskId} aria-controls="task-row-menu"
        onClick={event=>{
          const trigger=event.currentTarget;
          setMenu(menu?.taskId===row.taskId?null:{taskId:row.taskId,title:row.title,trigger,items:[
            {id:'run',label:'配置参数 / 准备运行',onClick:native=>openParameters(row,native,trigger)},
            {id:'manage',label:'管理任务',onClick:native=>{
              if(!native?.isTrusted)return;
              setExpandedTaskId(row.taskId);onManage?.(row.taskId);setMenu(null);
            }}]});
        }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5h.01M12 12h.01M12 19h.01" strokeWidth="3.5"/></svg>
      </IconButton>
      </span>
    </div>)}
    </div>
    <div hidden={!expanded} onFocusCapture={event=>{returnFocus.current=event.target;}}>
      {renderWorkspace?.({expanded})||(React.isValidElement(workspace)?workspace:null)}
    </div>
    {visible&&menuModel&&<ExtensionRowMenu id="task-row-menu" label={'任务菜单「'+menu.title+'」'} model={menuModel}/>}
  </div>;
}
