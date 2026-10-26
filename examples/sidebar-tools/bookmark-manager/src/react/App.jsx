/** @jsx h */
import React,{useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {Button as OpenDeskButton,IconButton as OpenDeskIconButton} from '../../../../../src/ui/react/components/ui/button.tsx';
import {bookmarkConversationContext} from '../../../../../src/ui/conversation/bookmark-actions.js';
import {runBookmarkAgentLoop} from '../../../../../src/ui/conversation/bookmark-agent-loop.js';
import {bookmarkEditorNavigation} from './navigation.js';
const model=globalThis.BookmarkR2Model;
const TREE_ROW_HEIGHT=44;
export const bookmarkConversationSamples=Object.freeze(['创建一个叫 AI 工具的文件夹，并把 https://example.com 收藏进去','把当前网页收藏到 AI 工具','找出 React 相关书签']);
function h(...args){return React.createElement(...args)}
const iconPaths={
 chat:<path d="M21 11.5c0 4.6-3.9 8.5-8.8 8.5a10 10 0 0 1-4.2-.9L3 21l1.5-4.5A8.1 8.1 0 0 1 3 11.5C3 7 7 3 12.2 3s8.8 4 8.8 8.5Z"/>,
 send:<><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,
 stop:<rect x="5" y="5" width="14" height="14" rx="2"/>,
 folder:<><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10H3z"/></>,
 link:<><path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1"/></>,
 chevron:<path d="m9 18 6-6-6-6"/>,
 more:<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
 copy:<><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
 plus:<path d="M12 5v14M5 12h14"/>,
 star:<path d="m12 2 3 6.3 7 1-5 4.9 1.2 7-6.2-3.3-6.2 3.3 1.2-7-5-4.9 7-1z"/>,
 refresh:<><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.8 9A7 7 0 0 1 18 7l2 5M4 12l2 5a7 7 0 0 0 12.2-2"/></>,
 edit:<><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z"/><path d="m14 7 3 3"/></>,
 trash:<><path d="M4 7h16M10 4h4M6 7l1 14h10l1-14M10 11v6M14 11v6"/></>,
 search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
 x:<path d="m5 5 14 14M19 5 5 19"/>,
 external:<><path d="M13 5h6v6M19 5l-9 9"/><path d="M19 13v6H5V5h6"/></>,
 alert:<><path d="m12 3 10 18H2z"/><path d="M12 9v5M12 17v.2"/></>,
};
function Icon({name,size=18}){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]||iconPaths.link}</svg>}
function Button(props){return <OpenDeskButton variant="primary" className="bm-button bm-button--primary" {...props}/>}
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
 const siblingRows=new Map();
 for(const row of rows){const id=row.node.parentId;if(!siblingRows.has(id))siblingRows.set(id,[]);siblingRows.get(id).push(row)}
 for(const group of siblingRows.values())group.forEach((row,i)=>{row.posinset=i+1;row.setsize=group.length});
 return rows;
}
function initialDraft(mode,kind,node,parentId){const title=mode==='edit'?node.title:'',url=mode==='edit'?(node.url||''):'',folder=mode==='edit'?node.parentId:parentId;return {mode,kind,id:node?.id||null,expected:node?{...node}:null,title,url,parentId:folder,initial:{title,url,parentId:folder}}}
function dirtyDraft(d){return Boolean(d&&(d.title!==d.initial.title||d.url!==d.initial.url||d.parentId!==d.initial.parentId))}
function humanError(error){const code=error?.code||'';if(code==='E_OUTCOME_UNKNOWN')return (error.partialWrite?'部分写入风险':'写入结果未知')+'：已停止重复提交。请刷新核对数据后再决定。';if(code==='E_GRANT_REVOKED'||code==='E_BOOKMARK_PERMISSION')return '书签访问权限失效，请在工具设置中核对授权后重新打开。';if(code==='E_BOOKMARK_STALE')return '该书签已被外部修改或删除。原草稿已保留，请核对后再处理。';return error?.message||'操作未完成，请重试。'}
function authorityDenied(error){return ['E_BOOKMARK_PERMISSION','E_GRANT_REVOKED','E_TOOL_CHANGED','E_TOOL_DISABLED'].includes(error?.code)}
// Existing imported Chrome bookmarks may contain chrome:, file:, data: or other
// schemes. Display those URLs as text, never navigate to them from a trusted UI.
function safeBookmarkHref(value){
 if(typeof value!=='string')return null;
 try{
  const target=new URL(value);
  return (target.protocol==='https:'||target.protocol==='http:')&&
   !target.username&&!target.password?target.href:null;
 }catch{return null;}
}
function descendants(tree,id){return model.descendantSignatures(tree,id).length}
function highlightSearchTitle(title,term){
 const q=term.trim();if(!q)return title;
 const at=title.toLocaleLowerCase().indexOf(q.toLocaleLowerCase());
 if(at<0)return title;
 return <>{title.slice(0,at)}<mark className="bm-search-highlight">{title.slice(at,at+q.length)}</mark>{title.slice(at+q.length)}</>;
}
function Tree({rows,expanded,searchActive,searchTerm,selectedId,activeId,setActiveId,onSelect,onFolder,onToggle,onMenu,onEdit,onScrollClose,scrollRef}){
 const [top,setTop]=useState(0),[height,setHeight]=useState(510);
 const rowHeight=TREE_ROW_HEIGHT,virtual=rows.length>120;
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
   else if(event.key==='Enter'||event.key===' '){if(isFolder(row.node))onFolder(row.node.id);else onSelect(row.node.id)}
   else if(event.key==='F2'){onEdit(row.node.id)}
   else if(event.key==='F10'&&event.shiftKey){const btn=scrollRef.current?.querySelector('[data-node-id="'+row.node.id+'"] .bm-row-more');if(btn)onMenu(row.node.id,btn)}
   else if(event.key==='Escape'){return} // document handles Escape for readonly preview or row menu
   else return;event.preventDefault();
 }
 return <div className="bm-tree-scroll" ref={scrollRef} onScroll={e=>{const el=e.currentTarget;setTop(el.scrollTop);const autoRevealScroll=onScrollClose(e);if(!autoRevealScroll&&virtual&&rows.length){const first=Math.max(0,Math.floor(el.scrollTop/rowHeight));const last=Math.min(rows.length-1,Math.floor((el.scrollTop+el.clientHeight-1)/rowHeight));if(activeRow<first||activeRow>last)setActiveId(rows[first]?.node.id||rows[0].node.id)}}} role="tree" aria-label="书签目录与书签" aria-activedescendant={displayed.length?'bm-treeitem-'+(displayed.some(r=>r.node.id===activeId)?activeId:displayed[0].node.id):undefined} tabIndex={0} onKeyDown={onKey} data-testid="bookmark-tree">
  {!rows.length?<div className="bm-empty">没有匹配的书签。试试其他关键词。</div>:
  <div className="bm-virtual-area" role="presentation" style={{height:virtual?rows.length*rowHeight:undefined}}>
   {displayed.map((row,i)=>{const node=row.node,folder=isFolder(node),open=expanded.has(node.id)||searchActive;
    const count=row.children.length;
    return <div key={node.id} id={'bm-treeitem-'+node.id} role="treeitem"
     aria-level={row.level} aria-posinset={row.posinset} aria-setsize={row.setsize} aria-selected={selectedId===node.id}
     aria-expanded={folder?open:undefined} title={node.title}
     className={'bm-tree-row'+(selectedId===node.id?' is-selected':'')+(activeId===node.id?' is-active':'')}
     style={{paddingInlineStart:Math.min(row.level-1,10)*15+7,...(virtual?{position:'absolute',top:(start+i)*rowHeight,left:0,right:0}:{})}}
     onClick={()=>{setActiveId(node.id);if(folder)onFolder(node.id);else onSelect(node.id);scrollRef.current?.focus()}} data-node-id={node.id}>
     <button className={'bm-disclosure'+(!folder?' is-placeholder':'')} type="button" tabIndex={-1}
       aria-label={folder?(searchActive?'搜索中已展开 '+node.title:open?'折叠 '+node.title:'展开 '+node.title):undefined} aria-expanded={folder?open:undefined} aria-hidden={!folder} disabled={searchActive||!folder}
       onClick={event=>{event.stopPropagation();if(folder&&!searchActive)onToggle(node.id)}}><Icon name="chevron" size={15}/></button>
     <span className={'bm-node-icon'+(folder?' bm-folder-icon':'')}><Icon name={folder?'folder':'link'} size={17}/></span>
     <span className="bm-node-title">{highlightSearchTitle(node.title,searchTerm)}</span>
     {folder&&<span className="bm-count" title={count+' 个直接子项'}>{count}</span>}
     <OpenDeskIconButton className="bm-row-more" label={'操作 '+node.title}
       onClick={event=>{event.stopPropagation();onMenu(node.id,event.currentTarget)}}><Icon name="more" size={17}/></OpenDeskIconButton>
    </div>})}
  </div>}
  <div className="bm-tree-preview-tail" aria-hidden="true"/>
 </div>
}
function FolderPicker({tree,value,onChange,onClose,currentId,disabled=false}){
 const [term,setTerm]=useState('');
 const folders=useMemo(()=>[...tree.byId.values()].filter(n=>isFolder(n)&&canTarget(tree,n)&&(!currentId||!model.isDescendant(tree,n.id,currentId))).filter(n=>(n.title+' '+folderLabel(tree,n.id)).toLocaleLowerCase().includes(term.trim().toLocaleLowerCase())),[tree,term,currentId]);
 return <div className="bm-picker" data-testid="folder-picker">
  <div className="bm-picker-head"><strong>选择目标文件夹</strong><OpenDeskIconButton className="bm-close" onClick={onClose} label="关闭文件夹选择"><Icon name="x" size={16}/></OpenDeskIconButton></div>
  <label className="bm-sr-only" htmlFor="bm-folder-search">搜索目标文件夹</label>
  <input id="bm-folder-search" autoFocus disabled={disabled} placeholder="搜索文件夹或路径" value={term} onChange={e=>setTerm(e.target.value)}/>
  <div className="bm-picker-list" role="group" aria-label="目标文件夹">
   {folders.map(folder=><button disabled={disabled} aria-current={value===folder.id||undefined} key={folder.id} type="button" className={'bm-picker-item'+(value===folder.id?' picked':'')} onClick={()=>{onChange(folder.id);onClose()}}>
    <Icon name="folder" size={16}/><span><b>{folder.title}</b><small>{folderLabel(tree,folder.parentId)}</small></span></button>)}
   {!folders.length&&<p className="bm-note">没有可用的目标文件夹</p>}
  </div><small className="bm-note">共 {folders.length} 个符合条件的目标 · 已排除自身、子目录及受保护节点</small>
 </div>
}
function Inspector({tree,node,draft,setDraft,onSave,onCancel,onOpenPicker,pickerOpen,setPickerOpen,busy,uncertain,error}){
 const clickableHref=node&&!isFolder(node)?safeBookmarkHref(node.url):null;
 return <section className={'bm-inspector'+(draft?' is-editing':'')+(!node&&!draft?' is-empty':'')} aria-label={draft?bookmarkEditorNavigation(draft).title:'书签详情'} data-testid="bookmark-inspector">
  <span id="bm-inspector-id" className="bm-sr-only">{node?.id||''}</span>
  {draft?<form className="bm-editor" onSubmit={e=>e.preventDefault()} onKeyDown={e=>{if(e.key==="Enter"&&!e.nativeEvent.isComposing&&["bm-edit-name","bm-edit-url"].includes(e.target.id)){e.preventDefault();onSave(e)}}} data-testid="bookmark-editor">
   <div className="bm-field"><label htmlFor="bm-edit-name">名称</label><input id="bm-edit-name" autoFocus disabled={busy} maxLength={256} required value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></div>
   {draft.kind==='bookmark'&&<div className="bm-field"><label htmlFor="bm-edit-url">网址</label><input id="bm-edit-url" type="url" required disabled={busy} maxLength={2048} value={draft.url} placeholder="https://example.com" onChange={e=>setDraft({...draft,url:e.target.value})}/></div>}
   <div className="bm-parent-line"><span className="bm-note">所在文件夹：</span><span className="bm-parent-path" title={folderLabel(tree,draft.parentId)}>{folderLabel(tree,draft.parentId)}</span><button type="button" className="bm-text-button" disabled={busy} aria-expanded={pickerOpen} onClick={()=>onOpenPicker(!pickerOpen)}>更改</button></div>
   {pickerOpen&&<FolderPicker tree={tree} disabled={busy} value={draft.parentId} currentId={draft.mode==='edit'&&draft.kind==='folder'?draft.id:null} onChange={id=>setDraft({...draft,parentId:id})} onClose={()=>setPickerOpen(false)}/>}
   <div className="bm-editor-actions"><Button type="button" data-testid="bookmark-save" onClick={onSave} disabled={busy||uncertain}>保存</Button><button type="button" className="bm-button" onClick={onCancel} disabled={busy}>取消</button></div>
   {error&&<p className="bm-sheet-error" role="alert">{error}</p>}
   {uncertain&&<p className="bm-warning">写入结果未知，已禁止重复保存。请先核对书签状态。</p>}
  </form>:
  node?<div className="bm-readonly">
   <div className="bm-detail-title" title={node.title}><Icon name={isFolder(node)?'folder':'link'} size={17}/><span>{node.title}</span></div>
   <div className="bm-detail-path" title={folderLabel(tree,node.parentId)}>{folderLabel(tree,node.parentId)}</div>
   {!isFolder(node)&&(clickableHref?
    <a className="bm-detail-url" href={clickableHref} target="_blank" rel="noopener noreferrer"
     aria-label={'打开网址：'+node.url} title={'在新标签页打开 '+node.url}>
     <span>{node.url}</span><Icon name="external" size={13}/>
    </a>:
    <span className="bm-detail-url bm-detail-url--disabled" title="该网址协议不支持直接打开">{node.url}</span>)}

  </div>:null}
 </section>
}

function PreviewPane({tree,node,onClose,onEdit,onCopy}){
 const folder=isFolder(node),count=tree.children.get(node.id)?.length||0;
 const media=useMemo(()=>globalThis.matchMedia?.('(max-width:739px)'),[]);
 const [narrow,setNarrow]=useState(Boolean(media?.matches));
 useEffect(()=>{const change=()=>setNarrow(Boolean(media?.matches));change();media?.addEventListener('change',change);return()=>media?.removeEventListener('change',change)},[media]);
 const closeRef=useRef(null);
 useEffect(()=>{if(narrow)closeRef.current?.focus({preventScroll:true})},[narrow]);
 const onKeyDown=event=>{
  if(!narrow||event.key!=='Tab')return;
  const targets=[...event.currentTarget.querySelectorAll('button:not(:disabled),a[href]')];
  if(!targets.length)return;
  const first=targets[0],last=targets[targets.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
 };
 return <aside className="bm-preview-pane" role={narrow?'dialog':'complementary'}
  aria-modal={narrow?'true':undefined} aria-label="书签只读预览"
  data-testid="bookmark-preview" onKeyDown={onKeyDown}>
  <div className="bm-preview-head"><strong>详情</strong><OpenDeskIconButton ref={closeRef} className="bm-preview-close" label="关闭预览" onClick={onClose}><Icon name="x" size={16}/></OpenDeskIconButton></div>
  <div className="bm-preview-content" aria-live="polite"><Inspector tree={tree} node={node} draft={null}/></div>
  {folder&&<div className="bm-preview-count">{count} 个子项</div>}
  <div className="bm-preview-actions">
   {!folder&&<OpenDeskIconButton className="bm-preview-action" label="复制网址" onClick={()=>onCopy(node.url)}><Icon name="copy" size={17}/></OpenDeskIconButton>}
   {!node.locked&&<OpenDeskIconButton className="bm-preview-action" label="编辑" onClick={()=>onEdit(node.id)}><Icon name="edit" size={17}/></OpenDeskIconButton>}
  </div>
 </aside>
}
function ActionMenu({state,onAction,onClose}){const menuRef=useRef(null);useEffect(()=>{menuRef.current?.querySelector('button')?.focus();const click=e=>{if(!menuRef.current?.contains(e.target))onClose()};const key=e=>{if(e.key==='Escape'){e.preventDefault();onClose()}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){const choices=[...menuRef.current?.querySelectorAll('button')||[]];const i=choices.indexOf(document.activeElement);choices[(i+(e.key==='ArrowDown'?1:choices.length-1))%choices.length]?.focus();e.preventDefault()}};document.addEventListener('pointerdown',click);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',click);document.removeEventListener('keydown',key)}},[onClose]);
 return <div ref={menuRef} className="bm-popover" role="menu" style={{top:state.top,left:state.left}} data-testid="action-menu">
   <button role="menuitem" onClick={()=>onAction('detail',state.id)}><Icon name="link" size={16}/>查看详情</button>
   {!state.locked&&<button role="menuitem" onClick={()=>onAction('edit',state.id)}><Icon name="edit" size={16}/>编辑</button>}
   {!state.locked&&<button role="menuitem" onClick={()=>onAction('move',state.id)}><Icon name="folder" size={16}/>移动到…</button>}
   {!state.locked&&<button role="menuitem" className="bm-destructive" onClick={()=>onAction('delete',state.id)}><Icon name="trash" size={16}/>删除</button>}
  </div>
}
function Sheet({title,onClose,children,canClose=true,dismissOnBackdrop=true,hasDock=false}){
 const ref=useRef(null),closeRef=useRef(onClose),origin=useRef(null),canCloseRef=useRef(canClose);
 closeRef.current=onClose;canCloseRef.current=canClose;
 useEffect(()=>{
  origin.current=document.activeElement;
  const region=ref.current;
  const field=region?.querySelector('[autofocus],input,button');
  (field||region)?.focus();
  const key=e=>{
   if(document.querySelector('[data-testid="confirm-dialog"]'))return;
    if(hasDock&&!region?.contains(document.activeElement))return;
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(canCloseRef.current)closeRef.current();return}
   if(e.key!=='Tab'||!region||hasDock)return;
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
 },[hasDock]);
 return <div className="bm-sheet-backdrop" data-sharing={hasDock?'true':undefined} role="presentation" onMouseDown={e=>{if(dismissOnBackdrop&&canClose&&e.target===e.currentTarget)closeRef.current()}}>
  <section ref={ref} className="bm-sheet" role="dialog" aria-modal={!hasDock} aria-label={title} tabIndex={-1} data-testid="bookmark-sheet">
   <header className="bm-sheet-header"><strong>{title}</strong><OpenDeskIconButton className="bm-sheet-close" label="关闭" disabled={!canClose} onClick={onClose}><Icon name="x" size={17}/></OpenDeskIconButton></header>
   {children}
  </section>
 </div>;
}
function Confirm({title,description,confirm,cancelLabel='取消',canConfirm=true,onConfirm,onCancel,danger=false}){
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
    <button className="bm-button" type="button" onClick={onCancel}>{cancelLabel}</button>
    <button className={'bm-button '+(danger?'bm-button--danger':'bm-button--primary')} type="button" disabled={!canConfirm} onClick={onConfirm}>{confirm}</button>
   </div>
  </div>
 </div>;
}
export default function App({runtime=null,mode='preview',onStateChange=null,dock=null}={}){
 const sdk=runtime?.sdk??globalThis.OpenDeskSDK?.browser;
 const service=useMemo(()=>runtime?.service??globalThis.BookmarkR2Service.create(sdk),[runtime,sdk]);
 const [tree,setTree]=useState(null),[expanded,setExpanded]=useState(new Set(['1','2','10','11'])),[query,setQuery]=useState(''),[selectedId,setSelectedId]=useState(null),[activeId,setActiveId]=useState('1'),[draft,updateDraft]=useState(null),[pickerOpen,setPickerOpen]=useState(false),[previewOpen,setPreviewOpen]=useState(false),[menu,setMenu]=useState(null),[confirmDiscard,setConfirmDiscard]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[uncertain,setUncertain]=useState(false);
 const [revealTarget,setRevealTarget]=useState(null);
 const interactionEpoch=useRef(0),pendingAiReveal=useRef(null),ignoreAutoScrollTop=useRef(null),queryRef=useRef(query);
 queryRef.current=query;
 const scrollRef=useRef(null),pendingFolderReveal=useRef(null),readEpoch=useRef(0),writeEpoch=useRef(0),authorityEpoch=useRef(0),activeRef=useRef(true),menuButtonRef=useRef(null),busyRef=useRef(false),fillEpoch=useRef(0);


 const conversation=runtime?.conversation||null;
 const dockRef=useRef(dock);dockRef.current=dock;
 const draftRef=useRef(draft);draftRef.current=draft;
 const uncertainRef=useRef(uncertain);uncertainRef.current=uncertain;
 // The admitted App provides business capability; Host React alone owns Chat Dock UI.
 useLayoutEffect(()=>{
  const bridge=dock?.adapterRef;if(!bridge)return;
  const active={request:runBookmarkConversation};bridge.current=active;
  return()=>{if(bridge.current===active)bridge.current=null};
 });
 async function runBookmarkConversation({request,refs,signal,event,onStep,onPhase}){
  if(!conversation?.request)
   throw Object.assign(Error('当前是离线 React 预览，未连接真实 AI 或 Chrome 书签 Host。'),{code:'E_AI_UNAVAILABLE'});
  if(!tree||loading||uncertainRef.current||busyRef.current)
   throw Object.assign(Error(uncertainRef.current?'写入结果未知，请刷新并核对书签后再操作。':'请先读取完整书签或等待当前操作完成。'),{code:'E_BOOKMARK_BUSY'});
  // Bind one task to the selection, tool instance and user gesture at Send.
  const selected=tree.byId.get(selectedId);
  const pinnedFolder=(selected&&isFolder(selected)?selected.id:selected?.parentId)||
   (tree.byId.has('1')?'1':[...tree.byId.values()].find(n=>n.parentId!==null&&isFolder(n)&&!n.locked)?.id);
  const interactionAtSend=interactionEpoch.current;
  const pinned={selectedId,currentFolderId:pinnedFolder,refs:{
   folderId:refs?.folderId||null,bookmarkId:refs?.bookmarkId||null,matches:[...(refs?.matches||[])]}};
  const publicContext={...bookmarkConversationContext(tree,pinned),currentPageAvailable:true};
  // Page capture and Provider permission both start synchronously inside Send.
  let pagePromise;
  try{pagePromise=Promise.resolve(sdk?.page?.getContext?.()).catch(()=>null);}
  catch{pagePromise=Promise.resolve(null);}
  const taskSerial=++writeEpoch.current;readEpoch.current++;
  busyRef.current=true;setBusy(true);
  let authorization=null,releasePageWait=()=>{};
  const current=()=>activeRef.current&&!authorityEpoch.current&&taskSerial===writeEpoch.current;
  // Workflow conversation changes stop this AI round, not bookmark access.
  // SDK/tool lifecycle errors retain E_TOOL_CHANGED and still revoke below.
  const conversationFailure=error=>error?.code==='E_TOOL_CHANGED'?
   Object.assign(new Error(error.message),error,{code:'E_AI_CONTEXT_CHANGED',cause:error}):error;
  try{
   let initial;
   try{initial=await conversation.request({request,context:publicContext,signal,event});}
   catch(error){throw conversationFailure(error);}
   authorization=initial.authorization;
   if(mode==='trusted'&&(!authorization?.signal||
     typeof authorization.assertWrite!=='function'||
     typeof authorization.release!=='function'||typeof initial.continueWith!=='function'))
    throw Object.assign(Error('缺少持续任务权限与有效安装实例，拒绝执行'),{code:'E_MODEL_GRANT_REVOKED'});
   if(signal.aborted)throw Object.assign(Error('本轮已停止'),{code:'E_CANCELLED'});
   const pageSignal=authorization?.signal||signal;
   const pageContext=await new Promise((resolve,reject)=>{
    const abort=()=>reject(pageSignal.reason?.code?
     pageSignal.reason:Object.assign(Error('本轮已停止'),{code:'E_CANCELLED'}));
    if(pageSignal.aborted){abort();return;}
    pageSignal.addEventListener('abort',abort,{once:true});
    releasePageWait=()=>pageSignal.removeEventListener('abort',abort);
    pagePromise.then(resolve,reject);
   });
   releasePageWait();
   if(!current())
    throw Object.assign(Error('书签授权或安装实例已失效，后续步骤未执行。'),{code:'E_GRANT_REVOKED'});
   const context={...pinned,pageContext};
   const beforeWrite=async args=>{
    if(!current())throw Object.assign(Error('书签实例已切换，拒绝后续写入'),{code:'E_GRANT_REVOKED'});
    if(draftRef.current||uncertainRef.current)
     throw Object.assign(Error('存在未保存的编辑或未知结果；请先核对，再执行写入。'),{code:'E_DRAFT_CONFLICT'});
    try{await authorization?.assertWrite?.(args);}
    catch(error){throw conversationFailure(error);}
    if(!current())throw Object.assign(Error('书签实例已失效，拒绝后续写入'),{code:'E_GRANT_REVOKED'});
   };
   const result=await runBookmarkAgentLoop({
    goal:request,initialProposal:initial.proposal,service,context,refs:pinned.refs,
    expectedTree:tree,signal:authorization?.signal||signal,
    beforeWrite:authorization?.assertWrite&&beforeWrite,
    retryModel:conversation.source?.().provider!=='local_codex',
    nextProposal:async(nextContext,options)=>{
     try{
      await authorization?.assertWrite?.();
      if(!current())throw Object.assign(Error('书签实例已失效，未继续模型决策'),{code:'E_GRANT_REVOKED'});
      if(typeof initial.continueWith!=='function'&&mode!=='trusted')
       return {question:'离线预览已展示首轮结果；持续 AI 决策需要在正式扩展中连接 Provider。'};
      return await initial.continueWith(nextContext,options);
     }catch(error){throw conversationFailure(error);}
    },
    onPhase:phase=>{
     if(phase==='writing'&&draftRef.current)
      throw Object.assign(Error('存在未保存的编辑，请保存或取消编辑后再执行书签写入'),{code:'E_DRAFT_CONFLICT'});
     onPhase?.(phase);
    },
    onStep:step=>{
     if(!current())return;
     if(step.tree)setTree(step.tree);
     if(step.id){
      const node=step.tree?.byId.get(step.id);
      if(node){
       const mayReveal=interactionEpoch.current===interactionAtSend&&!queryRef.current.trim();
       pendingAiReveal.current=mayReveal?{id:node.id,epoch:interactionEpoch.current}:null;
       setRevealTarget(mayReveal?null:node.id);
       if(mayReveal)setExpanded(previous=>{
        const next=new Set(previous);let parent=step.tree.byId.get(node.parentId),depth=0;
        while(parent&&depth++<100){next.add(parent.id);parent=step.tree.byId.get(parent.parentId);}
        return next;
       });
      }
     }
     onStep?.({message:step.message,refs:step.refs});
    }
   });
   if(current()&&result.tree)setTree(result.tree);
   if(current()&&result.completed)onStep?.({message:result.summary,refs:result.refs});
   return {question:result.question||null,refs:result.refs};
  }catch(error){
   if(current()&&error?.code==='E_OUTCOME_UNKNOWN')setUncertain(true);
   if(current()&&authorityDenied(error))revoke();
   if(error?.refs)onStep?.({refs:error.refs});
   throw error;
  }finally{
   releasePageWait();authorization?.release?.();
   // The task, not each individual step, owns the UI write lock.
   if(taskSerial===writeEpoch.current){writeEpoch.current++;readEpoch.current++;}
   busyRef.current=false;
   if(activeRef.current){setBusy(false);setLoading(false);}
  }
 }

 function setDraft(value){fillEpoch.current++;draftRef.current=value;updateDraft(value)}
 useEffect(()=>{activeRef.current=true;return()=>{activeRef.current=false;readEpoch.current++;writeEpoch.current++;fillEpoch.current++}},[]);
 // Only an open editor sheet is a genuine child/Back target. Never infer
 // a Host route from a bookmark preview, selection, folder picker or menu.
 useEffect(()=>{
  onStateChange?.({dirty:dirtyDraft(draft),saving:busy,
   draft:draft?JSON.stringify({title:draft.title,url:draft.url,parentId:draft.parentId}).slice(0,8192):'',
   navigation:bookmarkEditorNavigation(draft),
   back:draft?()=>requestCloseSheet():null});
 },[onStateChange,draft,busy,uncertain]);
 const revoke=useCallback(()=>{
  authorityEpoch.current++;writeEpoch.current++;readEpoch.current++;
  setTree(null);setDraft(null);setSelectedId(null);setPreviewOpen(false);setMenu(null);
  setPickerOpen(false);setConfirmDiscard(false);setUncertain(true);setNotice('');setLoading(false);
  setError('完整书签访问已失效，请在工具设置中重新授权后打开。');
 },[]);
 const load=useCallback(async({initial=false,reconcileUnknown=false}={})=>{
  if(!activeRef.current||authorityEpoch.current)return null;
  const stamp=++readEpoch.current,write=writeEpoch.current;setLoading(true);setError('');
  try{
   const next=await service.load();
   if(!activeRef.current||authorityEpoch.current||stamp!==readEpoch.current)return null;
   if(write!==writeEpoch.current||busyRef.current){setLoading(false);return null}
   setTree(next);setLoading(false);if(reconcileUnknown){setUncertain(false);dockRef.current?.reconcile?.();}setNotice('');return next;
  }catch(ex){
   if(activeRef.current&&!authorityEpoch.current&&authorityDenied(ex))revoke();
   else if(activeRef.current&&!authorityEpoch.current&&stamp===readEpoch.current){setLoading(false);setError(humanError(ex))}
   return null;
  }
 },[service,revoke]);
 useEffect(()=>{if(mode!=='trusted')void load({initial:true})},[mode,load]);
 useEffect(()=>{
  if(mode!=='trusted')return;
  let closed=false,session=null,timer=null,needsSnapshot=true;
  async function stop(old){if(old)try{await service.watchStop(old)}catch{/* Host sessions are bounded by expiry. */}}
  async function poll(){
   if(closed||authorityEpoch.current)return;
   try{
    if(!session||Date.now()>session.expiresAt-5000){
     const old=session;session=null;await stop(old);if(closed||authorityEpoch.current)return;
     const next=await service.watchStart();if(closed){await stop(next);return}
     if(authorityEpoch.current){await stop(next);return}
     session=next;needsSnapshot=true;
    }
    // Observe before the first snapshot, including every session renewal.
    // Changes during pagination are then available via the same observer.
    if(needsSnapshot){
     const snapshot=await load({initial:true});
     if(closed)return;
     if(!snapshot)return; // Retry the failed snapshot without losing observation.
     needsSnapshot=false;
    }
    const result=await service.watchRead(session);
    if(closed||authorityEpoch.current)return;
    session={...session,cursor:result.nextCursor,expiresAt:result.expiresAt};
    if(result.events.length)await load().then(next=>{needsSnapshot=!next}); // Never clear an unknown write automatically.
   }catch(error){
    if(closed||authorityEpoch.current)return;
    const old=session;session=null;needsSnapshot=true;void stop(old);
    if(authorityDenied(error)){
     revoke();closed=true;
    }else if(error?.code==='E_BOOKMARK_EVENT_GAP'){
     // The cursor is no longer trustworthy: hide the stale tree and renew
     // observer -> complete snapshot on the next cycle, preserving any draft.
     readEpoch.current++;setTree(null);setPreviewOpen(false);setLoading(true);
    }else{
     setLoading(false);setError(humanError(error));
    }
   }finally{if(!closed&&!authorityEpoch.current)timer=setTimeout(()=>void poll(),2500)}
  }
  void poll();
  return()=>{closed=true;if(timer!==null)clearTimeout(timer);void stop(session);session=null;};
 },[mode,service,load]);
 useEffect(()=>{if(!notice||notice.startsWith('写入结果未知'))return;const timer=setTimeout(()=>setNotice(''),3300);return()=>clearTimeout(timer)},[notice]);
 const rows=useMemo(()=>filteredRows(tree,expanded,query),[tree,expanded,query]);
 useLayoutEffect(()=>{
  const id=pendingFolderReveal.current,scroller=scrollRef.current;
  if(!id||!scroller)return;
  const index=rows.findIndex(row=>row.node.id===id);
  if(index<0)return;
  pendingFolderReveal.current=null;
  scroller.scrollTop=Math.max(0,index*TREE_ROW_HEIGHT); // Position entered folder at the top, not amid unrelated sibling bookmarks.
 },[rows]);
 useLayoutEffect(()=>{
  const pending=pendingAiReveal.current,scroller=scrollRef.current;
  if(!pending||!scroller)return;
  if(interactionEpoch.current!==pending.epoch||queryRef.current.trim()){
   pendingAiReveal.current=null;setRevealTarget(pending.id);return;
  }
  const index=rows.findIndex(row=>row.node.id===pending.id);
  if(index<0){
   if(tree&&!tree.byId.has(pending.id))pendingAiReveal.current=null;
   return; // Wait until the verified node and its expanded ancestors render.
  }
  pendingAiReveal.current=null;
  scroller.scrollTop=Math.max(0,index*TREE_ROW_HEIGHT-Math.floor(scroller.clientHeight/3));
  ignoreAutoScrollTop.current=scroller.scrollTop;
  setActiveId(pending.id); // Focus remains where the user is typing.
 },[rows,query,tree]);
 const current=tree?.byId.get(selectedId)||null;
 function locateAiResult(){
  const id=revealTarget,node=tree?.byId.get(id);
  if(!node){setRevealTarget(null);setError('该书签已变化，请刷新后重新查找。');return;}
  interactionEpoch.current++;
  pendingAiReveal.current={id,epoch:interactionEpoch.current};
  setExpanded(previous=>{
   const next=new Set(previous);let parent=node,depth=0;
   while(parent&&depth++<100){next.add(parent.id);parent=tree.byId.get(parent.parentId);}
   return next;
  });
  if(queryRef.current.trim()){queryRef.current='';setQuery('');}
  setRevealTarget(null);
 }
 const previewNode=previewOpen&&!draft?current:null;
 const folders=useMemo(()=>tree?[...tree.byId.values()].filter(n=>isFolder(n)&&!n.locked&&!tree.roots.has(n.id)):[],[tree]);
 const closeMenu=useCallback(()=>{setMenu(null);menuButtonRef.current?.focus()},[]);
 useEffect(()=>{
  if(!previewOpen||draft||menu||confirmDiscard)return;
  const key=event=>{
   if(event.key!=='Escape'||event.defaultPrevented)return;
   event.preventDefault();setPreviewOpen(false);
   if(document.activeElement?.closest?.('[data-testid="bookmark-preview"]'))scrollRef.current?.focus({preventScroll:true});
  };
  document.addEventListener('keydown',key);
  return()=>document.removeEventListener('keydown',key);
 },[previewOpen,draft,menu,confirmDiscard]);
 function closePreview(){setPreviewOpen(false);scrollRef.current?.focus({preventScroll:true})}
 async function copyPreviewUrl(url){
  if(!url)return;
  let copied=false;
  try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);copied=true}}catch{}
  if(!copied){
   const prev=document.activeElement,el=document.createElement('textarea');
   el.value=url;el.setAttribute('readonly','');el.style.cssText='position:fixed;left:-9999px;top:0';
   document.body.appendChild(el);el.select();
   try{copied=document.execCommand('copy')}catch{}finally{el.remove();prev?.focus?.({preventScroll:true})}
  }
  setNotice(copied?'网址已复制':'无法自动复制，请选择网址手动复制');
 }
 function toggle(id){interactionEpoch.current++;if(expanded.has(id)&&tree){let node=tree.byId.get(activeId),limit=0;while(node&&limit++<100){if(node.parentId===id){setActiveId(id);break}node=tree.byId.get(node.parentId)}}setExpanded(prev=>{const n=new Set(prev);if(n.has(id))n.delete(id);else n.add(id);return n})}
 function startEdit(node,{move=false}={}){if(!node||node.locked)return;setDraft(initialDraft('edit',isFolder(node)?'folder':'bookmark',node,node.parentId));setSelectedId(node.id);setPickerOpen(move);setUncertain(false)}
 function closeSheet(){if(busy)return;if(uncertain)setNotice('写入结果未知，请先刷新核对书签。');setDraft(null);setPickerOpen(false);setError('')}
 function requestCloseSheet(){
  // Host Back is dispatched outside this React tree. Read the latest input
  // synchronously, even if the edit-state effect has not run after typing.
  if(busyRef.current)return;
  fillEpoch.current++;
  if(dirtyDraft(draftRef.current)||uncertainRef.current){
   setConfirmDiscard(true);return;
  }
  closeSheet();
 }
 function perform(action){
  setPickerOpen(false);setMenu(null);
  if(action.type==='select'){setSelectedId(action.id);setDraft(null);setPreviewOpen(true)}
  else if(action.type==='detail'){setSelectedId(action.id);setDraft(null);setPreviewOpen(true)}
  else if(action.type==='create'){const parent=(current&&isFolder(current)?current.id:current?.parentId)||'1';setPreviewOpen(false);setDraft(initialDraft('create',action.kind,null,parent));setUncertain(false)}
  else if(action.type==='edit'){startEdit(tree.byId.get(action.id),{move:action.move})}
  else if(action.type==='cancel')closeSheet();
  else if(action.type==='delete'){prepareDelete(action.id)}
  else if(action.type==='currentPage')void fillCurrentPage();
 }
 // Explicit cancel means discard. No modal for unsaved drafts.
 function request(action){interactionEpoch.current++;fillEpoch.current++;if(busyRef.current&&!['select','detail'].includes(action.type))return;if(uncertain&&['create','edit','delete','currentPage'].includes(action.type)){setError('上次写入结果未知，请先刷新核对后再继续。');return}perform(action)}
 function select(id){interactionEpoch.current++;setActiveId(id);if(draft)return;request({type:'select',id})}
 function changeSearch(value){
  interactionEpoch.current++;queryRef.current=value;
  setQuery(value);setPreviewOpen(false);setMenu(null);
  if(scrollRef.current)scrollRef.current.scrollTop=0;
 }
 function navigateFolder(id){
  const folder=tree?.byId.get(id);
  if(!folder||!isFolder(folder)||draft)return;
  interactionEpoch.current++;
  setActiveId(id);setSelectedId(id);setPreviewOpen(false);setMenu(null);
  if(query.trim()){
   // Search shows matching descendants plus context ancestors. Entering a
   // folder leaves the search results and reveals the real folder in the tree.
   const next=new Set(expanded);let node=folder,depth=0;
   while(node&&depth++<110){
    if(isFolder(node))next.add(node.id);
    node=tree.byId.get(node.parentId);
   }
   pendingFolderReveal.current=id;
   setExpanded(next);setQuery('');
  }else toggle(id);
 }
 function prepareDelete(id){
   const node=tree?.byId.get(id);
   if(!node||node.locked)return;
   // No second React confirmation. The trusted Host still demands the ONE
   // operation-bound deletion review, after Service and native guards.
   const target={id,expected:{...node},
     descendantSignatures:isFolder(node)?model.descendantSignatures(tree,id):[]};
   void removeConfirmed(target);
  }
 function onMenu(id,button){interactionEpoch.current++;setMenu(null);setSelectedId(id);setActiveId(id);menuButtonRef.current=button;const r=button.getBoundingClientRect();const max=window.innerWidth-190;setMenu({id,locked:Boolean(tree?.byId.get(id)?.locked),top:Math.max(8,Math.min(r.bottom+4,window.innerHeight-190)),left:Math.max(8,Math.min(r.right-182,max))})}
 function actionMenu(action,id){closeMenu();if(action==='detail')request({type:'detail',id});else if(action==='delete')request({type:'delete',id});else request({type:'edit',id,move:action==='move'})}
 async function save(e){if(mode==='trusted'&&!e.isTrusted)return;e.preventDefault();if(!draft||busy||busyRef.current||uncertain||authorityEpoch.current)return;
  let title,url;try{title=model.displayName(draft.title);url=draft.kind==='bookmark'?model.asHttpUrl(draft.url):undefined;model.parentFolder(tree,draft.parentId);
   if(draft.kind==='folder'&&draft.mode==='edit'&&model.isDescendant(tree,draft.parentId,draft.id))throw Error('文件夹不能移动到自身或子目录');
  }catch(ex){setError(humanError(ex));return}
  fillEpoch.current++;const write=++writeEpoch.current;readEpoch.current++;
  const current=()=>activeRef.current&&!authorityEpoch.current&&write===writeEpoch.current;
  busyRef.current=true;setBusy(true);setError('');
  let completedWrite=false;
   try{let result,expected=draft.expected;
   if(draft.mode==='create'){
    if(draft.kind==='folder')result=await service.createFolder({title,parentId:draft.parentId});
    else{
     const source=draft.sourcePage?.url===url?draft.sourcePage:null;
     if(source){
      const currentPage=await sdk.page.getContext();
      if(!current())return;
      if(currentPage?.status!=='available'||currentPage.url!==source.url||
        currentPage.tabRef!==source.tabRef||currentPage.documentRef!==source.documentRef)
        throw Object.assign(Error('当前网页已变化，请重新点击收藏当前页'),{code:'E_DOCUMENT_STALE'});
     }
     result=await service.createBookmark({title,url,parentId:draft.parentId,
      ...(source?{sourcePage:source}:{})});
    }
    completedWrite=true;
   }
   else{
    const moved=draft.parentId!==expected.parentId;
    if(moved){result=await service.move({expected,parentId:draft.parentId});if(!current())return;completedWrite=true;expected=result}
    if(title!==expected.title||(draft.kind==='bookmark'&&url!==expected.url)){result=await service.update({expected,title,url});if(!current())return;completedWrite=true;expected=result}
    if(!result)result=expected;
   }
   if(!current())return;
   const verified=await service.load();if(!current())return;
   const actual=verified.byId.get(result.id);
   if(!actual||actual.title!==title||actual.parentId!==draft.parentId||(draft.kind==='bookmark'&&actual.url!==url))throw Object.assign(Error('数据写入后读回不一致；保留草稿并禁止盲目重试'),{code:'E_OUTCOME_UNKNOWN'});
   if(!activeRef.current)return;setTree(verified);setSelectedId(actual.id);setActiveId(actual.id);setDraft(null);setPreviewOpen(true);setPickerOpen(false);setUncertain(false);setNotice('已保存');
  }catch(ex){if(current()){
   if(authorityDenied(ex))revoke();
   else{const outcome=completedWrite?Object.assign(Error('可能发生部分写入；须核对再操作'),{code:'E_OUTCOME_UNKNOWN',partialWrite:true,cause:ex}):ex;setError(humanError(outcome));if(outcome?.code==='E_OUTCOME_UNKNOWN')setUncertain(true)}
  }}finally{writeEpoch.current++;readEpoch.current++;busyRef.current=false;if(activeRef.current){setBusy(false);setLoading(false)}}
 }
 async function removeConfirmed(target){
   if(!target||busy||busyRef.current||uncertain||authorityEpoch.current)return;
   const write=++writeEpoch.current;readEpoch.current++;
   const current=()=>activeRef.current&&!authorityEpoch.current&&write===writeEpoch.current;
   busyRef.current=true;setBusy(true);setError('');
   let completedWrite=false;
   try{
    await service.remove({expected:target.expected,confirmed:true,
      expectedDescendantSignatures:target.descendantSignatures});
    if(!current())return;
    completedWrite=true;
    const refreshed=await service.load();
    if(!current())return;
    if(refreshed.byId.has(target.id))
      throw Object.assign(Error('删除后仍发现目标，拒绝认定成功'),{code:'E_OUTCOME_UNKNOWN'});
    if(!activeRef.current)return;
    setTree(refreshed);if(selectedId===target.id)setSelectedId(null);
    setActiveId(target.expected.parentId||[...refreshed.roots][0]);
    setDraft(null);setPreviewOpen(false);setNotice('已删除');
    scrollRef.current?.focus({preventScroll:true});
   }catch(ex){
    if(current()){
     if(authorityDenied(ex)){revoke();return}
     const unknown=completedWrite||ex?.code==='E_OUTCOME_UNKNOWN';
     setError(humanError(unknown?Object.assign(Error('删除结果未知，先刷新核对'),{code:'E_OUTCOME_UNKNOWN'}):ex));
     if(unknown)setUncertain(true);
    }
   }finally{writeEpoch.current++;readEpoch.current++;busyRef.current=false;if(activeRef.current){setBusy(false);setLoading(false)}}
  }
 function bookmarkCurrentPage(){request({type:'currentPage'})}
 async function fillCurrentPage(){if(busy)return;
  const stamp=++fillEpoch.current,isCurrent=()=>activeRef.current&&!authorityEpoch.current&&stamp===fillEpoch.current;
  try{
  const info=await sdk.page.getContext();if(!isCurrent())return;
  if(info.status!=='available')throw Error('当前页不可用');
  if(mode==='trusted'&&(!info.tabRef||!info.documentRef))
   throw Object.assign(Error('当前页缺少可信 Tab/Document 引用'),{code:'E_DOCUMENT_BINDING_REQUIRED'});
  const parent=(current&&isFolder(current)?current.id:current?.parentId)||'1';
  setDraft({...initialDraft('create','bookmark',null,parent),
   title:info.title,url:info.url,
   ...(info.tabRef&&info.documentRef?{sourcePage:{url:info.url,
    tabRef:info.tabRef,documentRef:info.documentRef}}:{})});
  setNotice('已填写当前网页，确认后再保存。');
 }catch(ex){if(isCurrent())setError(humanError(ex))}}
 return <div className="bm-app" data-react-bookmark="r3.0.4">
  <header className="bm-topbar" aria-busy={busy}><div className="bm-heading"><strong className="bm-sr-only">书签管理</strong><span>{tree?tree.byId.size.toLocaleString('zh-CN'):'—'} 项</span></div>
   <div className="bm-top-actions"><div className="bm-create-actions" aria-label="新建书签或文件夹">
    <OpenDeskIconButton label="新建书签" className="bm-icon-btn bm-icon-btn--primary" disabled={busy} onClick={()=>request({type:'create',kind:'bookmark'})}><Icon name="plus" size={18}/></OpenDeskIconButton>
    <OpenDeskIconButton label="新建文件夹" className="bm-icon-btn" disabled={busy} onClick={()=>request({type:'create',kind:'folder'})}><Icon name="folder" size={17}/></OpenDeskIconButton></div>
    <OpenDeskIconButton label="收藏当前页" className="bm-icon-btn" disabled={busy} onClick={bookmarkCurrentPage}><Icon name="star" size={17}/></OpenDeskIconButton>
    <OpenDeskIconButton label="刷新书签" className="bm-icon-btn" onClick={()=>void load({reconcileUnknown:true})} disabled={busy||loading}><Icon name="refresh" size={17}/></OpenDeskIconButton>
   </div></header>
  <div className="bm-tools"><div className="bm-search-wrap"><Icon name="search" size={16}/><label className="bm-sr-only" htmlFor="bm-search">搜索名称、URL 或文件夹</label><input id="bm-search" value={query} placeholder="搜索书签、网址或文件夹" onChange={e=>changeSearch(e.target.value)}/>{query&&<OpenDeskIconButton label="清空搜索" onClick={()=>{changeSearch('');document.getElementById('bm-search')?.focus()}}><Icon name="x" size={14}/></OpenDeskIconButton>}</div></div>
  {error&&!draft&&<div className="bm-error" role="alert"><Icon name="alert" size={17}/><span>{error}</span><button type="button" disabled={busy} onClick={()=>{setError('');void load({reconcileUnknown:true})}}>刷新</button></div>}
  {(busy||notice)&&<div className="bm-notice" role="status">{busy?'正在处理书签…':notice}</div>}
  {revealTarget&&tree?.byId.has(revealTarget)&&<div className="bm-ai-reveal" role="status">
   <span>{query.trim()?'AI 写入已核实，当前搜索可能隐藏新项目。':'AI 写入已核实，已保留你的浏览位置。'}</span>
   <button type="button" onClick={locateAiResult}>{query.trim()?'清除搜索并定位':'查看新项目'}</button>
  </div>}
  <div className="bm-workspace"><section className="bm-explorer" aria-label="书签树">{query&&<div className="bm-tree-head"><span>搜索结果</span><small>{rows.filter(r=>((r.node.title+' '+(r.node.url||'')).toLocaleLowerCase()).includes(query.toLocaleLowerCase())).length} 条匹配</small></div>}
  {loading&&!tree?<div className="bm-loading" role="status">正在读取书签…</div>:tree?<Tree rows={rows} expanded={expanded} selectedId={selectedId} activeId={activeId} setActiveId={id=>{interactionEpoch.current++;setActiveId(id)}} onSelect={select} onFolder={navigateFolder} onToggle={toggle} onMenu={onMenu} searchActive={Boolean(query.trim())} searchTerm={query} onEdit={id=>request({type:'edit',id})} onScrollClose={event=>{
  setMenu(null);
  const requested=ignoreAutoScrollTop.current;
  if(requested!==null&&Math.abs(event.currentTarget.scrollTop-requested)<1){
   ignoreAutoScrollTop.current=null;return true;
  }
  if(event.nativeEvent?.isTrusted)interactionEpoch.current++;
  return false;
 }} scrollRef={scrollRef}/>:<div className="bm-empty">暂时无法读取书签。使用刷新重试。</div>}</section>
  {previewNode&&<button type="button" tabIndex={-1} aria-hidden="true"
   className="bm-preview-backdrop" onClick={closePreview}/>}
  {previewNode&&<PreviewPane tree={tree} node={previewNode} onClose={closePreview} onEdit={id=>request({type:'edit',id})} onCopy={copyPreviewUrl}/>} 
  {tree&&draft&&<Sheet title={draft?(draft.mode==='create'?(draft.kind==='folder'?'新建文件夹':'新建书签'):'编辑'+(draft.kind==='folder'?'文件夹':'书签')):'书签详情'} onClose={requestCloseSheet} canClose={!busy} dismissOnBackdrop={!busy&&!dirtyDraft(draft)} hasDock={Boolean(dock)}>
    <Inspector tree={tree} node={current} draft={draft} setDraft={setDraft} onSave={save} onCancel={uncertain?requestCloseSheet:closeSheet} onOpenPicker={setPickerOpen} pickerOpen={pickerOpen} setPickerOpen={setPickerOpen} busy={busy} uncertain={uncertain} error={error}/>
  </Sheet>}
  </div>
  {menu&&<ActionMenu state={menu} onAction={actionMenu} onClose={closeMenu}/>}
  {confirmDiscard&&<Confirm title={uncertain?"写入结果未知，确定放弃草稿？":"放弃未保存的修改？"} description={uncertain?"无法确认上次保存是否生效。此操作仅放弃本地草稿，不会重试写入；请刷新核对数据。":"草稿尚未保存。可以继续编辑或明确放弃。"} cancelLabel="继续编辑" confirm={uncertain?"放弃草稿":"放弃修改"} danger onConfirm={()=>{setConfirmDiscard(false);closeSheet()}} onCancel={()=>setConfirmDiscard(false)}/>}
 </div>
}
