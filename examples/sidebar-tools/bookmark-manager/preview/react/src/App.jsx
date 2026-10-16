import React,{useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import './style.css';

const model=globalThis.BookmarkR2Model;
const service=globalThis.BookmarkR2Service.create(globalThis.OpenDeskSDK.browser);
const iconPaths={
 folder:<><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10H3z"/></>,
 link:<><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1"/></>,
 chevron:<path d="m9 18 6-6-6-6"/>,
 more:<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
 plus:<path d="M12 5v14M5 12h14"/>,
 star:<path d="m12 2 3 6.3 7 1-5 4.9 1.2 7-6.2-3.3-6.2 3.3 1.2-7-5-4.9 7-1z"/>,
 refresh:<><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.8 9A7 7 0 0 1 18 7l2 5M4 12l2 5a7 7 0 0 0 12.2-2"/></>,
 edit:<><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z"/><path d="m14 7 3 3"/></>,
 trash:<><path d="M4 7h16M10 4h4M6 7l1 14h10l1-14M10 11v6M14 11v6"/></>,
 search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
 x:<path d="m5 5 14 14M19 5 5 19"/>,
 external:<><path d="M13 5h6v6M19 5l-9 9"/><path d="M19 13v6H5V5h6"/></>,
 alert:<><path d="m12 3 10 18H2z"/><path d="M12 9v5M12 17v.2"/></>,
 arrow:<path d="M4 12h16m-6-6 6 6-6 6"/>
};
function Icon({name,size=18}){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]||iconPaths.link}</svg>}
function Button({icon,children,kind='secondary',...props}){return <button type="button" className={'bm-button bm-button--'+kind} {...props}>{icon&&<Icon name={icon} size={16}/>}<span>{children}</span></button>}
function isFolder(node){return model.isFolder(node)}
function canTarget(tree,node){try{model.parentFolder(tree,node.id);return true}catch{return false}}
function folderLabel(tree,id){const parts=[];let current=tree?.byId.get(id),count=0;while(current&&count++<12){if(current.parentId!==null)parts.unshift(current.title);current=tree.byId.get(current.parentId)}return parts.join(' / ')||'书签栏'}
function filteredRows(tree,expanded,query){
 if(!tree)return[];
 const term=query.trim().toLocaleLowerCase(),keep=new Set();
 if(term){for(const node of tree.byId.values()){if((node.title+' '+(node.url||'')).toLocaleLowerCase().includes(term)){let p=node;while(p&&!keep.has(p.id)){keep.add(p.id);p=tree.byId.get(p.parentId)}}}}
 const rows=[],seen=new Set();
 function walk(id,depth){if(seen.has(id)||depth>100)return;seen.add(id);
  const node=tree.byId.get(id);if(!node)return;
  if(!tree.roots.has(id)){if(term&&!keep.has(id))return;rows.push({node,level:depth,children:tree.children.get(id)||[]});if(!isFolder(node))return;if(!term&&!expanded.has(id))return}
  for(const child of tree.children.get(id)||[])walk(child,depth+1);
 }
 for(const id of tree.roots)walk(id,0);
 return rows;
}
function initialDraft(mode,kind,node,parentId){const title=mode==='edit'?node.title:'',url=mode==='edit'?(node.url||''):'',folder=mode==='edit'?node.parentId:parentId;return {mode,kind,id:node?.id||null,expected:node?{...node}:null,title,url,parentId:folder,initial:{title,url,parentId:folder}}}
function dirtyDraft(d){return Boolean(d&&(d.title!==d.initial.title||d.url!==d.initial.url||d.parentId!==d.initial.parentId))}
function humanError(error){const code=error?.code||'';if(code==='E_OUTCOME_UNKNOWN')return '写入结果未知：已停止重复提交。请刷新核对数据后再决定。';if(code==='E_GRANT_REVOKED'||code==='E_BOOKMARK_PERMISSION')return '书签访问权限失效，请恢复模拟权限后刷新。';if(code==='E_BOOKMARK_STALE')return '该书签已被外部修改或删除。原草稿已保留，请核对后再处理。';return error?.message||'操作未完成，请重试。'}
function descendants(tree,id){return model.descendantSignatures(tree,id).length}
function Tree({rows,expanded,selectedId,activeId,setActiveId,onSelect,onToggle,onMenu,onScrollClose,scrollRef}){
 const [top,setTop]=useState(0),[height,setHeight]=useState(510);
 const rowHeight=42,virtual=rows.length>120;
 useLayoutEffect(()=>{const el=scrollRef.current;if(!el)return;const resize=()=>setHeight(el.clientHeight||510);resize();if(typeof ResizeObserver!=='undefined'){const ro=new ResizeObserver(resize);ro.observe(el);return()=>ro.disconnect()}},[scrollRef]);
 const start=virtual?Math.max(0,Math.floor(top/rowHeight)-6):0;
 const end=virtual?Math.min(rows.length,Math.ceil((top+height)/rowHeight)+6):rows.length;
 const displayed=rows.slice(start,end);
 const activeRow=rows.findIndex(r=>r.node.id===activeId);
 const selectActive=(i)=>{if(i<0||i>=rows.length)return;const id=rows[i].node.id;setActiveId(id);if(virtual){const el=scrollRef.current;if(el){const offset=i*rowHeight;if(offset<el.scrollTop)el.scrollTop=offset;else if(offset+rowHeight>el.scrollTop+el.clientHeight)el.scrollTop=offset+rowHeight-el.clientHeight;setTop(el.scrollTop)}}};
 function onKey(event){if(event.target!==event.currentTarget)return;let idx=activeRow>=0?activeRow:0;const row=rows[idx];if(!row)return;
   if(event.key==='ArrowDown')selectActive(Math.min(rows.length-1,idx+1));
   else if(event.key==='ArrowUp')selectActive(Math.max(0,idx-1));
   else if(event.key==='Home')selectActive(0);
   else if(event.key==='End')selectActive(rows.length-1);
   else if(event.key==='ArrowRight'){if(isFolder(row.node)){if(!expanded.has(row.node.id))onToggle(row.node.id);else if(idx+1<rows.length&&rows[idx+1].level>row.level)selectActive(idx+1)}}
   else if(event.key==='ArrowLeft'){if(isFolder(row.node)&&expanded.has(row.node.id))onToggle(row.node.id);else{let parent=row.node.parentId;const parentIndex=rows.findIndex(r=>r.node.id===parent);if(parentIndex>=0)selectActive(parentIndex)}}
   else if(event.key==='Enter'||event.key===' '){onSelect(row.node.id)}
   else if(event.key==='Escape'){event.currentTarget.blur()}
   else return;event.preventDefault();
 }
 return <div className="bm-tree-scroll" ref={scrollRef} onScroll={e=>{setTop(e.currentTarget.scrollTop);onScrollClose()}} role="tree" aria-label="书签目录与书签" aria-activedescendant={displayed.some(r=>r.node.id===activeId)?'bm-treeitem-'+activeId:undefined} tabIndex={0} onKeyDown={onKey} data-testid="bookmark-tree">
  {!rows.length?<div className="bm-empty">没有匹配的书签。试试其他关键词。</div>:
  <div className="bm-virtual-area" style={{height:virtual?rows.length*rowHeight:undefined}}>
   {displayed.map((row,i)=>{const node=row.node,folder=isFolder(node),open=expanded.has(node.id);
    const count=row.children.length;
    return <div key={node.id} id={'bm-treeitem-'+node.id} role="treeitem"
     aria-level={row.level} aria-selected={selectedId===node.id}
     aria-expanded={folder?open:undefined} title={node.title}
     className={'bm-tree-row'+(selectedId===node.id?' is-selected':'')+(activeId===node.id?' is-active':'')}
     style={{paddingInlineStart:Math.min(row.level-1,10)*15+7,...(virtual?{position:'absolute',top:(start+i)*rowHeight,left:0,right:0}:{})}}
     onClick={()=>{setActiveId(node.id);onSelect(node.id);scrollRef.current?.focus()}} data-node-id={node.id}>
     <button className={'bm-disclosure'+(!folder?' is-placeholder':'')} type="button" tabIndex={-1}
       aria-label={folder?(open?'折叠 '+node.title:'展开 '+node.title):undefined} aria-hidden={!folder}
       onClick={event=>{event.stopPropagation();if(folder)onToggle(node.id)}}><Icon name="chevron" size={15}/></button>
     <span className={'bm-node-icon'+(folder?' bm-folder-icon':'')}><Icon name={folder?'folder':'link'} size={17}/></span>
     <span className="bm-node-title">{node.title}</span>
     {folder&&<span className="bm-count" title={count+' 个直接子项'}>{count}</span>}
     <button className="bm-row-more" type="button" aria-label={'操作 '+node.title}
       onClick={event=>{event.stopPropagation();onMenu(node.id,event.currentTarget)}}><Icon name="more" size={17}/></button>
    </div>})}
  </div>}
 </div>
}
function FolderPicker({tree,value,onChange,onClose,currentId}){
 const [term,setTerm]=useState('');
 const folders=useMemo(()=>[...tree.byId.values()].filter(n=>isFolder(n)&&canTarget(tree,n)&&(!currentId||!model.isDescendant(tree,n.id,currentId))).filter(n=>(n.title+' '+folderLabel(tree,n.id)).toLocaleLowerCase().includes(term.trim().toLocaleLowerCase())),[tree,term,currentId]);
 return <div className="bm-picker" data-testid="folder-picker">
  <div className="bm-picker-head"><strong>选择目标文件夹</strong><button className="bm-close" onClick={onClose} type="button" aria-label="关闭文件夹选择"><Icon name="x" size={16}/></button></div>
  <label className="bm-sr-only" htmlFor="bm-folder-search">搜索目标文件夹</label>
  <input id="bm-folder-search" autoFocus placeholder="搜索文件夹或路径" value={term} onChange={e=>setTerm(e.target.value)}/>
  <div className="bm-picker-list" role="listbox" aria-label="目标文件夹">
   {folders.map(folder=><button role="option" aria-selected={value===folder.id} key={folder.id} type="button" className={'bm-picker-item'+(value===folder.id?' picked':'')} onClick={()=>{onChange(folder.id);onClose()}}>
    <Icon name="folder" size={16}/><span><b>{folder.title}</b><small>{folderLabel(tree,folder.parentId)}</small></span></button>)}
   {!folders.length&&<p className="bm-note">没有可用的目标文件夹</p>}
  </div><small className="bm-note">共 {folders.length} 个符合条件的目标 · 已排除自身、子目录及受保护节点</small>
 </div>
}
function Inspector({tree,node,draft,setDraft,onSave,onCancel,onOpenPicker,pickerOpen,setPickerOpen,busy,uncertain,error}){
 return <section className={'bm-inspector'+(draft?' is-editing':'')+(!node&&!draft?' is-empty':'')} aria-label={draft?'编辑书签':'书签详情'} data-testid="bookmark-inspector">
  <span id="bm-inspector-id" className="bm-sr-only">{node?.id||''}</span>
  {draft?<form className="bm-editor" onSubmit={e=>e.preventDefault()} onKeyDown={e=>{if(e.key==="Enter"&&!e.nativeEvent.isComposing&&["bm-edit-name","bm-edit-url"].includes(e.target.id)){e.preventDefault();onSave(e)}}} data-testid="bookmark-editor">
   <div className="bm-field"><label htmlFor="bm-edit-name">名称</label><input id="bm-edit-name" autoFocus maxLength={256} required value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></div>
   {draft.kind==='bookmark'&&<div className="bm-field"><label htmlFor="bm-edit-url">网址</label><input id="bm-edit-url" type="url" required maxLength={2048} value={draft.url} placeholder="https://example.com" onChange={e=>setDraft({...draft,url:e.target.value})}/></div>}
   <div className="bm-parent-line"><span className="bm-note">所在文件夹：</span><span className="bm-parent-path" title={folderLabel(tree,draft.parentId)}>{folderLabel(tree,draft.parentId)}</span><button type="button" className="bm-text-button" aria-expanded={pickerOpen} onClick={()=>onOpenPicker(!pickerOpen)}>更改</button></div>
   {pickerOpen&&<FolderPicker tree={tree} value={draft.parentId} currentId={draft.mode==='edit'&&draft.kind==='folder'?draft.id:null} onChange={id=>setDraft({...draft,parentId:id})} onClose={()=>setPickerOpen(false)}/>}
   <div className="bm-editor-actions"><Button type="button" data-testid="bookmark-save" onClick={onSave} kind="primary" icon="arrow" disabled={busy||uncertain}>保存</Button><button type="button" className="bm-button" onClick={onCancel}>取消</button></div>
   {error&&<p className="bm-sheet-error" role="alert">{error}</p>}
   {uncertain&&<p className="bm-warning">写入结果未知，已禁止重复保存。请先核对书签状态。</p>}
  </form>:
  node?<div className="bm-readonly">
   <div className="bm-detail-title" title={node.title}><Icon name={isFolder(node)?'folder':'link'} size={17}/><span>{node.title}</span></div>
   <div className="bm-detail-path" title={folderLabel(tree,node.parentId)}>{folderLabel(tree,node.parentId)}</div>
   {!isFolder(node)&&<a className="bm-detail-url" href={node.url} target="_blank" rel="noopener noreferrer" title={node.url}>{node.url}<Icon name="external" size={13}/></a>}

  </div>:<p className="bm-empty-detail">选择书签可以查看详情，点击「编辑」才会修改内容。</p>}
 </section>
}
function ActionMenu({state,onAction,onClose}){const menuRef=useRef(null);useEffect(()=>{menuRef.current?.querySelector('button')?.focus();const click=e=>{if(!menuRef.current?.contains(e.target))onClose()};const key=e=>{if(e.key==='Escape'){e.preventDefault();onClose()}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){const choices=[...menuRef.current?.querySelectorAll('button')||[]];const i=choices.indexOf(document.activeElement);choices[(i+(e.key==='ArrowDown'?1:choices.length-1))%choices.length]?.focus();e.preventDefault()}};document.addEventListener('pointerdown',click);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',click);document.removeEventListener('keydown',key)}},[onClose]);
 return <div ref={menuRef} className="bm-popover" role="menu" style={{top:state.top,left:state.left}} data-testid="action-menu">
   <button role="menuitem" onClick={()=>onAction('detail',state.id)}><Icon name="link" size={16}/>查看详情</button>
   {!state.locked&&<button role="menuitem" onClick={()=>onAction('edit',state.id)}><Icon name="edit" size={16}/>编辑</button>}
   {!state.locked&&<button role="menuitem" onClick={()=>onAction('move',state.id)}><Icon name="folder" size={16}/>移动到…</button>}
   {!state.locked&&<button role="menuitem" className="bm-destructive" onClick={()=>onAction('delete',state.id)}><Icon name="trash" size={16}/>删除</button>}
  </div>
}
function Sheet({title,onClose,children}){
 const ref=useRef(null),closeRef=useRef(onClose),origin=useRef(null);
 closeRef.current=onClose;
 useEffect(()=>{
  origin.current=document.activeElement;
  const region=ref.current;
  const field=region?.querySelector('[autofocus],input,button');
  (field||region)?.focus();
  const key=e=>{
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeRef.current();return}
   if(e.key!=='Tab'||!region)return;
   const items=[...region.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href],select:not(:disabled)')].filter(el=>el.getClientRects().length);
   if(!items.length)return;
   const first=items[0],last=items[items.length-1];
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
  };
  document.addEventListener('keydown',key,true);
  return()=>{
   document.removeEventListener('keydown',key,true);
   const target=origin.current;
   if(target?.isConnected)target.focus();
   else document.querySelector('.bm-tree-scroll')?.focus();
  };
 },[]);
 return <div className="bm-sheet-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)closeRef.current()}}>
  <section ref={ref} className="bm-sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} data-testid="bookmark-sheet">
   <header className="bm-sheet-header"><strong>{title}</strong><button className="bm-sheet-close" type="button" aria-label="关闭" onClick={onClose}><Icon name="x" size={17}/></button></header>
   {children}
  </section>
 </div>;
}
function Confirm({title,description,confirm,canConfirm=true,onConfirm,onCancel,danger=false}){
 const ref=useRef(null),origin=useRef(null);
 useEffect(()=>{
  origin.current=document.activeElement;
  ref.current?.querySelector('button')?.focus();
  return()=>{if(origin.current?.isConnected)origin.current.focus();else document.querySelector('.bm-tree-scroll')?.focus()};
 },[]);
 function keys(e){
  if(e.key==='Escape'){e.preventDefault();onCancel()}
  if(e.key==='Tab'){
   const buttons=[...ref.current.querySelectorAll('button:not(:disabled)')];
   const ix=buttons.indexOf(document.activeElement),next=e.shiftKey?(ix<=0?buttons.length-1:ix-1):(ix===buttons.length-1?0:ix+1);
   e.preventDefault();buttons[next]?.focus();
  }
 }
 return <div className="bm-scrim" role="presentation" onKeyDown={keys}>
  <div ref={ref} className="bm-dialog" role="alertdialog" aria-modal="true" aria-label={title} aria-describedby="bm-dialog-desc" data-testid="confirm-dialog">
   <h2>{title}</h2><p id="bm-dialog-desc">{description}</p>
   <div className="bm-dialog-actions">
    <button className="bm-button" type="button" onClick={onCancel}>取消</button>
    <button className={'bm-button '+(danger?'bm-button--danger':'bm-button--primary')} type="button" disabled={!canConfirm} onClick={onConfirm}>{confirm}</button>
   </div>
  </div>
 </div>;
}
export default function App(){
 const [tree,setTree]=useState(null),[expanded,setExpanded]=useState(new Set(['1','2','10','11'])),[query,setQuery]=useState(''),[selectedId,setSelectedId]=useState(null),[activeId,setActiveId]=useState('1'),[draft,setDraft]=useState(null),[pickerOpen,setPickerOpen]=useState(false),[detailOpen,setDetailOpen]=useState(false),[menu,setMenu]=useState(null),[confirmDelete,setConfirmDelete]=useState(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[uncertain,setUncertain]=useState(false);
 const scrollRef=useRef(null),readEpoch=useRef(0),activeRef=useRef(true),menuButtonRef=useRef(null);
 useEffect(()=>{activeRef.current=true;return()=>{activeRef.current=false;readEpoch.current++}},[]);
 const load=useCallback(async({initial=false}={})=>{const stamp=++readEpoch.current;setLoading(true);setError('');try{const next=await service.load();if(!activeRef.current||stamp!==readEpoch.current)return null;setTree(next);setLoading(false);setNotice('');return next}catch(ex){if(activeRef.current&&stamp===readEpoch.current){setLoading(false);setError(humanError(ex))}return null}},[]);
 useEffect(()=>{void load({initial:true})},[load]);
 const rows=useMemo(()=>filteredRows(tree,expanded,query),[tree,expanded,query]);
 const current=tree?.byId.get(selectedId)||null;
 const folders=useMemo(()=>tree?[...tree.byId.values()].filter(n=>isFolder(n)&&!n.locked&&!tree.roots.has(n.id)):[],[tree]);
 const closeMenu=useCallback(()=>{setMenu(null);menuButtonRef.current?.focus()},[]);
 function toggle(id){setExpanded(prev=>{const n=new Set(prev);if(n.has(id))n.delete(id);else n.add(id);return n})}
 function startEdit(node,{move=false}={}){if(!node||node.locked)return;setDraft(initialDraft('edit',isFolder(node)?'folder':'bookmark',node,node.parentId));setSelectedId(node.id);setDetailOpen(false);setPickerOpen(move);setUncertain(false)}
 function closeSheet(){setDraft(null);setDetailOpen(false);setPickerOpen(false);setError('');setUncertain(false)}
 function perform(action){
  setPickerOpen(false);setMenu(null);
  if(action.type==='select'){setSelectedId(action.id);setDraft(null);setDetailOpen(false)}
  else if(action.type==='detail'){setSelectedId(action.id);setDraft(null);setDetailOpen(true)}
  else if(action.type==='create'){const parent=(current&&isFolder(current)?current.id:current?.parentId)||'1';setDetailOpen(false);setDraft(initialDraft('create',action.kind,null,parent));setUncertain(false)}
  else if(action.type==='edit'){startEdit(tree.byId.get(action.id),{move:action.move})}
  else if(action.type==='cancel')closeSheet();
  else if(action.type==='delete'){setDetailOpen(false);prepareDelete(action.id)}
  else if(action.type==='currentPage')void fillCurrentPage();
 }
 // Explicit cancel means discard. No modal for unsaved drafts.
 function request(action){perform(action)}
 function select(id){setActiveId(id);if(draft)return;request({type:'select',id})}
 function prepareDelete(id){const node=tree?.byId.get(id);if(node&&!node.locked){setConfirmDelete({id,expected:{...node},descendantSignatures:isFolder(node)?model.descendantSignatures(tree,id):[],count:isFolder(node)?descendants(tree,id):0})}}
 function onMenu(id,button){setMenu(null);setSelectedId(id);setActiveId(id);menuButtonRef.current=button;const r=button.getBoundingClientRect();const max=window.innerWidth-190;setMenu({id,locked:Boolean(tree?.byId.get(id)?.locked),top:Math.max(8,Math.min(r.bottom+4,window.innerHeight-190)),left:Math.max(8,Math.min(r.right-182,max))})}
 function actionMenu(action,id){closeMenu();if(action==='detail')request({type:'detail',id});else if(action==='delete')request({type:'delete',id});else request({type:'edit',id,move:action==='move'})}
 async function save(e){globalThis.__bmReactSaveStage='submit-handler';e.preventDefault();if(!draft||busy||uncertain)return;
  let title,url;try{title=model.displayName(draft.title);url=draft.kind==='bookmark'?model.asHttpUrl(draft.url):undefined;model.parentFolder(tree,draft.parentId);
   if(draft.kind==='folder'&&draft.mode==='edit'&&model.isDescendant(tree,draft.parentId,draft.id))throw Error('文件夹不能移动到自身或子目录');
  }catch(ex){setError(humanError(ex));return}
  globalThis.__bmReactSaveStage='validated';setBusy(true);setError('');
  try{let result,expected=draft.expected;
   if(draft.mode==='create'){result=draft.kind==='folder'?await service.createFolder({title,parentId:draft.parentId}):await service.createBookmark({title,url,parentId:draft.parentId})}
   else{
    const moved=draft.parentId!==expected.parentId;
    if(moved){result=await service.move({expected,parentId:draft.parentId});expected=result}
    if(title!==expected.title||(draft.kind==='bookmark'&&url!==expected.url)){result=await service.update({expected,title,url});expected=result}
    if(!result)result=expected;
   }
   globalThis.__bmReactSaveStage='request-completed';const verified=await service.load(),actual=verified.byId.get(result.id);
   if(!actual||actual.title!==title||actual.parentId!==draft.parentId||(draft.kind==='bookmark'&&actual.url!==url))throw Object.assign(Error('数据写入后读回不一致；保留草稿并禁止盲目重试'),{code:'E_OUTCOME_UNKNOWN'});
   globalThis.__bmReactSaveStage='readback-ok';if(!activeRef.current)return;setTree(verified);setSelectedId(actual.id);setActiveId(actual.id);setDraft(null);setDetailOpen(false);setPickerOpen(false);setUncertain(false);setNotice('已保存');
  }catch(ex){globalThis.__bmReactSaveStage='error:'+(ex?.code||ex?.message||'unknown');if(activeRef.current){setError(humanError(ex));if(ex?.code==='E_OUTCOME_UNKNOWN')setUncertain(true)}}finally{if(activeRef.current)setBusy(false)}
 }
 async function removeConfirmed(){if(!confirmDelete||busy)return;setBusy(true);setError('');try{await service.remove({expected:confirmDelete.expected,confirmed:true,expectedDescendantSignatures:confirmDelete.descendantSignatures});const refreshed=await service.load();if(refreshed.byId.has(confirmDelete.id))throw Object.assign(Error('删除后仍发现目标，拒绝认定成功'),{code:'E_OUTCOME_UNKNOWN'});if(!activeRef.current)return;setTree(refreshed);if(selectedId===confirmDelete.id)setSelectedId(null);setConfirmDelete(null);setDraft(null);setDetailOpen(false);setNotice('已删除')}catch(ex){if(activeRef.current)setError(humanError(ex))}finally{if(activeRef.current)setBusy(false)}}
 function bookmarkCurrentPage(){void fillCurrentPage()}
 async function fillCurrentPage(){if(busy)return;try{const info=await globalThis.OpenDeskSDK.browser.page.getContext();if(info.status!=='available')throw Error('当前页不可用');const parent=(current&&isFolder(current)?current.id:current?.parentId)||'1';setDraft(initialDraft('create','bookmark',null,parent));setDraft(d=>({...d,title:info.title,url:info.url}));setNotice('已填写当前模拟网页，确认后再保存。')}catch(ex){setError(humanError(ex))}}
 return <div className="bm-app" data-react-bookmark="r3.0.2">
  <header className="bm-topbar"><div className="bm-heading"><strong className="bm-sr-only">书签管理</strong><span>{tree?tree.byId.size.toLocaleString('zh-CN'):'—'} 项</span></div><div className="bm-top-actions"><button title="收藏当前模拟网页" aria-label="收藏当前页" className="bm-icon-btn" type="button" onClick={bookmarkCurrentPage}><Icon name="star" size={17}/></button><button title="从 Mock 重新读取" aria-label="刷新书签" className="bm-icon-btn" type="button" onClick={()=>void load()} disabled={loading}><Icon name="refresh" size={17}/></button></div></header>
  <div className="bm-tools"><div className="bm-search-wrap"><Icon name="search" size={16}/><label className="bm-sr-only" htmlFor="bm-search">搜索名称、URL 或文件夹</label><input id="bm-search" value={query} placeholder="搜索书签、网址或文件夹" onChange={e=>setQuery(e.target.value)}/>{query&&<button aria-label="清空搜索" type="button" onClick={()=>setQuery('')}><Icon name="x" size={14}/></button>}</div><div className="bm-create-actions"><Button icon="plus" kind="primary" onClick={()=>request({type:'create',kind:'bookmark'})}>新建书签</Button><Button icon="folder" onClick={()=>request({type:'create',kind:'folder'})}>新建文件夹</Button></div></div>
  {error&&!draft&&<div className="bm-error" role="alert"><Icon name="alert" size={17}/><span>{error}</span><button type="button" onClick={()=>{setError('');void load()}}>刷新</button></div>}
  {notice&&<div className="bm-notice" role="status">{notice}</div>}
  <div className="bm-workspace"><section className="bm-explorer" aria-label="书签树">{query&&<div className="bm-tree-head"><span>搜索结果</span><small>{rows.filter(r=>((r.node.title+' '+(r.node.url||'')).toLocaleLowerCase()).includes(query.toLocaleLowerCase())).length} 条匹配</small></div>}
  {loading&&!tree?<div className="bm-loading" role="status">正在读取离线模拟书签…</div>:tree?<Tree rows={rows} expanded={expanded} selectedId={selectedId} activeId={activeId} setActiveId={setActiveId} onSelect={select} onToggle={toggle} onMenu={onMenu} onScrollClose={()=>setMenu(null)} scrollRef={scrollRef}/>:<div className="bm-empty">暂时无法读取书签。使用刷新重试。</div>}</section>
  </div>
  {tree&&(draft||detailOpen)&&<Sheet title={draft?(draft.mode==='create'?(draft.kind==='folder'?'新建文件夹':'新建书签'):'编辑'+(draft.kind==='folder'?'文件夹':'书签')):'书签详情'} onClose={closeSheet}>
    <Inspector tree={tree} node={current} draft={draft} setDraft={setDraft} onSave={save} onCancel={closeSheet} onOpenPicker={setPickerOpen} pickerOpen={pickerOpen} setPickerOpen={setPickerOpen} busy={busy} uncertain={uncertain} error={error}/>
  </Sheet>}
  {menu&&<ActionMenu state={menu} onAction={actionMenu} onClose={closeMenu}/>}
  {confirmDelete&&<Confirm title={confirmDelete.count?'删除文件夹及子项？':'确认删除书签？'} description={confirmDelete.count?'「'+confirmDelete.expected.title+'」及其 '+confirmDelete.count+' 个子项将被永久删除。':'确定删除「'+confirmDelete.expected.title+'」？'} confirm={busy?'正在删除…':confirmDelete.count?'删除文件夹':'删除书签'} danger canConfirm={!busy} onConfirm={()=>void removeConfirmed()} onCancel={()=>setConfirmDelete(null)}/>}
 </div>
}
