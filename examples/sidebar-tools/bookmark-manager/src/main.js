(function(){
'use strict';
const tool=globalThis.OpenDeskTool;
const root=tool?.root;
if(!root)return;
const sdk=globalThis.OpenDeskSDK?.browser;
const model=globalThis.BookmarkR2Model;
const service=globalThis.BookmarkR2Service.create(sdk);
const q=id=>root.querySelector('#'+id);
const s={tree:null,expanded:new Set(),search:'',limit:200,folder:null,selection:null,
  mode:'tree',menu:null,draft:null,initialDraft:null,pending:null,conflict:false,conflictReviewed:false,
  reviewed:null,reviewedDescendants:null,saveNeedsReview:false,busy:false,session:0,composing:false,renderedSearch:null,
  watcher:null,watchEpoch:0,watchTimer:null,watchRetries:0,watchDirty:false};
const make=(tag,cls,value)=>{
  const el=document.createElement(tag);if(cls)el.className=cls;
  if(value!==undefined)el.textContent=value;return el;
};
const errorText=error=>String(error?.message||error||'操作失败').slice(0,280);
const authorityLost=error=>[
  'E_BOOKMARK_PERMISSION','E_GRANT_REVOKED','E_BOOKMARK_SCOPE',
  'E_CHROME_PERMISSION_REQUIRED','E_TOOL_CAPABILITY_REQUIRED',
  'E_R11_BOOKMARKS_INCOMPLETE','E_TOOL_DISABLED','E_CONTEXT',
  'E_SDK_MISSING','E_SDK_STATUS',
  'E_BOOKMARK_FULL_CONSENT_REQUIRED','E_TOOL_CHANGED','E_OWNER'
].includes(error?.code);
const notice=(message='',error=false)=>{
  const el=q('bm-notice');el.textContent=message;el.dataset.error=String(error);
};
const isFolder=model.isFolder;
const isWritableFolder=item=>Boolean(item&&isFolder(item)&&!s.tree?.roots.has(item.id)&&
  item.unmodifiable!=='managed'&&item.folderType!=='managed'&&
  (!item.locked||s.tree?.roots.has(item.parentId)));
const folders=()=>s.tree?[...s.tree.byId.values()].filter(isWritableFolder):[];
const defaultFolder=()=>folders().find(item=>item.folderType==='other')?.id||
  folders().find(item=>item.folderType==='bookmarks-bar')?.id||folders()[0]?.id||null;
const targetFolder=()=>isWritableFolder(s.tree?.byId.get(s.folder))?s.folder:defaultFolder();
const node=id=>s.tree?.byId.get(id);
const editingMode=()=>['new-bookmark','new-folder','edit','move'].includes(s.mode);
const inNarrow=()=>Boolean(globalThis.matchMedia?.('(max-width:739px)')?.matches);
function pathOf(id){
  const parts=[],seen=new Set();let current=node(id);
  while(current&&!s.tree.roots.has(current.id)&&!seen.has(current.id)){
    seen.add(current.id);parts.unshift(current.title||'未命名');
    current=node(current.parentId);
  }
  return parts.join(' / ');
}
const sameDraft=(a,b)=>Boolean(a&&b&&a.title===b.title&&a.url===b.url&&a.parentId===b.parentId);
function isDirty(){
  if(!editingMode())return false;
  rememberDraft();
  return !sameDraft(s.draft,s.initialDraft);
}
function focusSelected(){
  const target=[...root.querySelectorAll('.bm-entry')].find(el=>el.dataset?.nodeId===s.selection);
  (target||q('bm-search')).focus({preventScroll:true});
}
const busy=value=>{
  s.busy=value;
  for(const button of root.querySelectorAll('button'))button.disabled=value;
  if(!value){
    const locked=Boolean(node(s.selection)?.locked);
    for(const id of ['bm-inspector-edit','bm-inspector-move','bm-inspector-delete'])q(id).disabled=locked;
    q('bm-save').disabled=s.saveNeedsReview;
  }
};
function gate(text){
  // A late successful read must never resurrect sensitive data after revocation.
  s.session++;
  endWatch();
  const pane=q('bm-inspector');
  if(pane.parentNode&&pane.parentNode!==q('bm-workspace'))q('bm-workspace').append(pane);
  s.tree=null;s.reviewed=null;s.reviewedDescendants=null;s.draft=null;s.initialDraft=null;
  s.pending=null;s.conflict=false;s.conflictReviewed=false;s.saveNeedsReview=false;
  s.expanded.clear();s.search='';
  q('bm-list').replaceChildren();q('bm-parent').replaceChildren();
  q('bm-inspector').hidden=true;q('bm-total').textContent='';q('bm-form-error').textContent='';
  for(const id of ['bm-name','bm-url','bm-parent','bm-search','bm-folder-query'])q(id).value='';
  for(const id of ['bm-inspector-title','bm-inspector-parent','bm-inspector-url','bm-inspector-id','bm-conflict-summary'])q(id).textContent='';
  q('bm-draft-guard').hidden=true;q('bm-conflict-review').hidden=true;q('bm-adopt').hidden=true;
  q('bm-inline-slot').hidden=true;
  for(const id of ['bm-detail-url','bm-delete-desc','bm-counter'])q(id).textContent='';
  q('bm-delete-children').checked=false;
  busy(false);
  q('bm-refresh').disabled=false;s.selection=null;s.mode='tree';s.folder=null;s.menu=null;
  q('bm-workspace').hidden=true;q('bm-gate').hidden=false;
  q('bm-gate-reason').textContent=text;
}
function enable(tree){
  s.tree=tree;
  if(!s.expanded.size)for(const item of tree.byId.values())
    if(tree.roots.has(item.parentId))s.expanded.add(item.id);
  q('bm-gate').hidden=true;q('bm-workspace').hidden=false;
  render();
}
const button=(title,action,id,cls='bm-button')=>{
  const classes=cls==='bm-entry'?'od-button od-button--quiet bm-entry':
    cls==='bm-toggle'?'od-icon-button bm-toggle':
    cls==='bm-menu'?'od-icon-button bm-menu':
    cls.includes('bm-danger')?'od-button od-button--danger bm-button':
    'od-button od-button--secondary bm-button';
  const el=make('button',classes,title);el.type='button';el.addEventListener('click',()=>onAction(action,id));
  return el;
};
function renderList(){
  const list=q('bm-list'),pane=q('bm-inspector'),slot=q('bm-inline-slot');
  const previousScroll=s.renderedSearch===s.search?(list.scrollTop||0):0;
  // A row action rebuilds just the projected list. Restore the equivalent
  // real button so keyboard navigation does not fall back to document.body.
  const active=document.activeElement,row=active?.closest?.('.bm-row');
  const focusId=row?.querySelector('.bm-entry')?.dataset.nodeId;
  const focusClass=['bm-toggle','bm-entry','bm-menu'].find(name=>active?.classList?.contains(name));
  // The inspector is the SAME DOM component, not a second mobile editor.
  // Detach before replacing rows so no form value or input listener is destroyed.
  if(pane.parentNode&&pane.parentNode!==q('bm-workspace'))q('bm-workspace').append(pane);
  slot.hidden=true;list.replaceChildren();
  if(!s.tree)return;
  const {rows,total}=model.projectBookmarkRows(s.tree,{expanded:s.expanded,search:s.search,limit:s.limit});
  const frag=document.createDocumentFragment(),narrow=inNarrow();
  let placed=false;
  for(const {item,level} of rows){
    const folder=isFolder(item),opened=s.expanded.has(item.id);
    const row=make('div','bm-row');
    row.dataset.selected=String(item.id===s.selection||item.id===s.folder);
    row.setAttribute('role','listitem');
    const indent=make('span');indent.style.width=Math.min(Math.max(level,0),7)*10+'px';
    indent.style.flex='none';indent.setAttribute('aria-hidden','true');row.append(indent);
    if(folder){
      const toggle=button(opened?'⌄':'›','toggle',item.id,'bm-toggle');
      toggle.setAttribute('aria-label',(opened?'折叠':'展开')+(item.title||'未命名文件夹'));
      toggle.setAttribute('aria-expanded',String(opened));row.append(toggle);
    }else row.append(make('span','bm-toggle-placeholder'));
    const entry=button('',folder?'folder':'detail',item.id,'bm-entry');
    entry.dataset.nodeId=item.id;
    entry.setAttribute('aria-current',String(item.id===s.selection));
    entry.setAttribute('aria-label',(folder?'文件夹 ':'书签 ')+(item.title||'未命名')+
      (s.search?'，搜索结果':'，层级 '+Math.max(1,level+1)));
    entry.append(make('span','',folder?'▱':'↗'),make('span','',item.title||'未命名'));
    entry.title=item.title||'未命名';row.append(entry);
    if(folder)row.append(make('span','bm-count',String(s.tree.children.get(item.id)?.length||0)));
    if(!item.locked){
      const menu=button('···','menu',item.id,'bm-menu');
      menu.setAttribute('aria-label','管理 '+(item.title||'未命名'));
      menu.setAttribute('aria-expanded',String(s.menu===item.id));row.append(menu);
    }
    frag.append(row);
    if(s.menu===item.id){
      const actions=make('div','bm-menu-actions');
      actions.append(button('编辑','edit',item.id),button('移动','move',item.id),
        button('删除','delete',item.id,'bm-button bm-danger'));
      frag.append(actions);
    }
    if(narrow&&!s.mode.startsWith('new-')&&!pane.hidden&&s.selection===item.id){
      frag.append(pane);placed=true;
    }
  }
  if(!rows.length)frag.append(make('p','bm-help','没有匹配的书签或文件夹'));
  list.append(frag);
  if(focusId&&focusClass){
    const currentRow=[...list.querySelectorAll('.bm-row')].find(row=>
      row.querySelector('.bm-entry')?.dataset.nodeId===focusId);
    currentRow?.querySelector('.'+focusClass)?.focus({preventScroll:true});
  }
  if(narrow&&!pane.hidden&&!placed){
    slot.append(pane);slot.hidden=false;
  }
  list.scrollTop=previousScroll;
  s.renderedSearch=s.search;
  q('bm-counter').textContent=total?('已显示 '+rows.length+' / '+total+' 项'):'';
  q('bm-more').hidden=rows.length>=total;
  q('bm-total').textContent=s.tree.byId.size.toLocaleString('zh-CN')+' 项';
  q('bm-location').textContent=s.search?'全局搜索':'全部目录';
}
function renderInspector(){
  const item=node(s.selection);
  if(!item)return;
  q('bm-inspector-icon').textContent=isFolder(item)?'▱':'↗';
  q('bm-inspector-title').textContent=item.title||'未命名';
  q('bm-inspector-kind').textContent=isFolder(item)?
    '文件夹 · '+(s.tree.children.get(item.id)?.length||0)+' 个直接子项':'网页书签';
  q('bm-inspector-parent').textContent=pathOf(item.parentId)||'根目录';
  q('bm-read-url-row').hidden=isFolder(item);
  q('bm-inspector-url').textContent=item.url||'';
  q('bm-inspector-id').textContent=item.id;
  for(const id of ['bm-inspector-edit','bm-inspector-move','bm-inspector-delete'])
    q(id).disabled=Boolean(item.locked);
}
function renderFolderOptions(preferred){
  const select=q('bm-parent'),filter=q('bm-folder-query').value.trim().toLocaleLowerCase();
  const selected=preferred||select.value||s.draft?.parentId||targetFolder();
  const source=folders().filter(item=>!(s.mode==='move'||s.mode==='edit')||
    !isFolder(node(s.selection))||!model.isDescendant(s.tree,item.id,s.selection));
  const matches=source.filter(item=>!filter||pathOf(item.id).toLocaleLowerCase().includes(filter));
  select.replaceChildren();
  const displayed=matches.slice(0,120);
  for(const item of displayed){
    const option=make('option','',pathOf(item.id)||item.title||'未命名');
    option.value=item.id;option.selected=item.id===selected;select.append(option);
  }
  // A selected folder may also lie beyond the first 120 matching rows.
  // Keep it selectable while preserving the bounded DOM.
  if(selected&&source.some(item=>item.id===selected)&&!displayed.some(item=>item.id===selected)){
    const option=make('option','',pathOf(selected)+'（当前选择）');
    option.value=selected;option.selected=true;select.append(option);
  }
  if(selected&&source.some(item=>item.id===selected))select.value=selected;
  q('bm-folder-hint').textContent=matches.length>120?
    '匹配 '+matches.length+' 个文件夹，当前显示前 120 个；继续输入可缩小范围。':
    '匹配 '+matches.length+' 个可用文件夹 · 方向键可选择';
}
function renderForm(){
  const isNew=s.mode.startsWith('new-'),live=node(s.selection);
  const selected=live||s.reviewed;
  if(!isNew&&!selected){s.mode='tree';s.draft=null;render();return}
  if(!isNew&&!live){
    // An external delete must not silently throw away the user's local draft.
    // There is no longer a safe write target: review/copy, then explicitly cancel.
    s.saveNeedsReview=true;
    q('bm-form-error').textContent='原书签已在其他窗口删除。草稿仍保留，请复制需要的内容后取消；不能覆盖已删除项目。';
  }
  const folder=s.mode==='new-folder'||isFolder(selected),moving=s.mode==='move';
  q('bm-form-title').textContent=(moving?'移动':isNew?'新建':'编辑')+(folder?'文件夹':'书签');
  q('bm-name-row').hidden=moving;
  q('bm-url-row').hidden=moving||folder;
  q('bm-parent-row').hidden=false;
  const title=q('bm-name'),url=q('bm-url'),parent=q('bm-parent');
  const baseline={title:isNew?'':selected?.title||'',url:isNew&&!folder?'https://':selected?.url||'',
    parentId:isNew?targetFolder()||'':selected?.parentId||''};
  if(!s.initialDraft)s.initialDraft={...baseline};
  if(!s.draft)s.draft={...baseline};
  title.value=s.draft.title;url.value=s.draft.url;
  // Inapplicable URL fields MUST be disabled, not merely hidden, to avoid
  // invisible HTML type=url blocking folder/move saves.
  url.disabled=moving||folder;
  url.required=!url.disabled;
  title.disabled=moving;
  title.readOnly=false;url.readOnly=false;
  q('bm-folder-query').disabled=false;
  renderFolderOptions(s.draft.parentId);
  parent.disabled=false;
  q('bm-save').textContent=isNew?'创建':moving?'确认移动':'保存修改';
  q('bm-save').disabled=s.saveNeedsReview;
  q('bm-detail-url').hidden=true;
  q('bm-conflict-review').hidden=!s.conflict;
  q('bm-adopt').hidden=!s.conflictReviewed;
  if(s.conflict){
    const now=node(s.selection),was=s.reviewed;
    q('bm-conflict-summary').textContent=now?
      '原版本「'+(was?.title||'')+'」（'+(was?.url||'文件夹')+
      '）；Chrome 当前「'+(now.title||'')+'」（'+(now.url||'文件夹')+
      '）。草稿仍保留。请先重新读取并对比，再决定是否以最新版本为基线。':
      '原书签已不在当前树中；草稿仍保留，不能直接重试。';
  }
}
function renderDelete(){
  const item=node(s.selection);if(!item){s.mode='tree';render();return}
  const descendants=s.reviewedDescendants||[];
  q('bm-delete-desc').textContent='确认删除「'+(item.title||'未命名')+'」？'+
    (isFolder(item)?'将同时删除 '+descendants.length+' 个子项，可能同步至其他设备。':'该操作可能同步至其他设备。');
  q('bm-delete-children-row').hidden=!descendants.length;
  q('bm-delete-children').checked=false;
}
function render(){
  // Moving the same inspector between the narrow list and desktop column
  // must not discard a foreground input's cursor or keyboard focus.
  const active=document.activeElement;
  const restore=Boolean(active&&q('bm-inspector').contains?.(active));
  const from=restore&&typeof active.selectionStart==='number'?active.selectionStart:null;
  const to=restore&&typeof active.selectionEnd==='number'?active.selectionEnd:null;
  const showForm=editingMode(),isDelete=s.mode==='delete',isRead=s.mode==='tree';
  q('bm-explorer').hidden=false;
  q('bm-inspector').hidden=!(node(s.selection)||s.mode.startsWith('new-')||
    (editingMode()&&s.reviewed));
  q('bm-inspector-read').hidden=!isRead;
  q('bm-form-view').hidden=!showForm;
  q('bm-delete-view').hidden=!isDelete;
  q('bm-draft-guard').hidden=!s.pending;
  q('bm-search').value=s.search;
  if(isRead)renderInspector();
  else if(isDelete)renderDelete();
  else renderForm();
  renderList();
  if(restore&&active?.isConnected){
    active.focus({preventScroll:true});
    if(from!==null&&to!==null)active.setSelectionRange?.(from,to);
  }
}
// The SDK owns bounded event sessions; no native bookmark listeners in the sandbox.
function rememberDraft(){
  if(!['new-bookmark','new-folder','edit','move'].includes(s.mode))return;
  s.draft={title:q('bm-name').value,url:q('bm-url').value,parentId:q('bm-parent').value};
}
function endWatch(){
  s.watchEpoch++;s.watchDirty=false;
  if(s.watchTimer!==null){clearTimeout(s.watchTimer);s.watchTimer=null}
  const old=s.watcher;s.watcher=null;
  if(old)void service.watchStop(old).catch(()=>{});
}
function scheduleWatch(epoch,delay=2500){
  if(epoch!==s.watchEpoch)return;
  s.watchTimer=setTimeout(()=>{
    if(epoch!==s.watchEpoch)return;
    s.watchTimer=null;void pollWatch(epoch);
  },delay);
}
function recoverWatch(error){
  // Retry only read/observation transport or expired-session failures. A
  // gesture or permission denial must return to the existing trusted UI.
  const retry=['E_HOST_TIMEOUT','E_TIMEOUT','E_HOST_CLOSED','E_TOOL_RUNTIME_UNAVAILABLE',
    'E_TRANSPORT','E_SESSION_EXPIRED','E_BOOKMARK_EVENT_GAP'].includes(error?.code)&&s.watchRetries<3;
  notice('书签同步暂不可用：'+errorText(error)+(retry?'；稍后自动重试。':'；请手动刷新。'),true);
  if(!retry)return;
  s.watchRetries++;
  const epoch=s.watchEpoch;
  const resume=()=>{
    if(epoch!==s.watchEpoch)return;
    s.watchTimer=null;
    if(s.busy||s.composing){s.watchTimer=setTimeout(resume,7000);return}
    void refresh();
  };
  s.watchTimer=setTimeout(resume,7000);
}
async function rotateWatch(epoch){
  const old=s.watcher,watcher=await service.watchStart();
  if(epoch!==s.watchEpoch){void service.watchStop(watcher).catch(()=>{});return}
  // Overlap the two bounded sessions. Changes between the preceding read and
  // start belong to the old session; changes after start also reach the new.
  s.watcher=watcher;
  let changed=false,cursor=old;
  try{
    // The old session holds at most 100 events, read in pages of at most 50.
    // Any event invalidates the whole snapshot, including concurrent arrivals.
    for(let page=0;page<2;page++){
      const result=await service.watchRead(cursor);
      if(epoch!==s.watchEpoch)return;
      changed=changed||result.events.length>0;
      cursor={...cursor,cursor:result.nextCursor};
      if(result.events.length<50)break;
    }
  }finally{await service.watchStop(old).catch(()=>{})}
  if(epoch!==s.watchEpoch)return;
  const result=await service.watchRead(s.watcher);
  if(epoch!==s.watchEpoch)return;
  return {...result,changed};
}
async function pollWatch(epoch){
  if(epoch!==s.watchEpoch||!s.watcher||!s.tree)return;
  if(s.busy||s.composing){scheduleWatch(epoch);return}
  try{
    let result=await service.watchRead(s.watcher);
    if(epoch!==s.watchEpoch)return;
    s.watcher={...s.watcher,cursor:result.nextCursor,expiresAt:result.expiresAt};
    if(!result.events.length&&result.expiresAt<=Date.now()+4000){
      result=await rotateWatch(epoch);
      if(epoch!==s.watchEpoch||!result)return;
      s.watcher={...s.watcher,cursor:result.nextCursor,expiresAt:result.expiresAt};
    }
    s.watchRetries=0;
    s.watchDirty=s.watchDirty||result.events.length>0||Boolean(result.changed);
    if(s.watchDirty){
      if(s.busy||s.composing){scheduleWatch(epoch);return}
      void refresh();return;
    }
    scheduleWatch(epoch);
  }catch(error){
    if(epoch!==s.watchEpoch)return;
    endWatch();
    if(authorityLost(error)){
      gate('完整书签 SDK 或授权已失效；请在可信扩展界面重新检查。');
      notice(errorText(error),true);
    }else recoverWatch(error);
  }
}
async function beginWatch(session){
  const epoch=s.watchEpoch;
  try{
    const watcher=await service.watchStart();
    if(epoch!==s.watchEpoch||session!==s.session){
      void service.watchStop(watcher).catch(()=>{});return;
    }
    s.watcher=watcher;
  }catch(error){
    if(epoch!==s.watchEpoch)return;
    if(authorityLost(error))throw error;
    return error;
  }
}
async function refresh(manual=false){
  if(s.busy)return;
  if(manual)s.watchRetries=0;
  rememberDraft();endWatch();
  const session=++s.session,epoch=s.watchEpoch;
  notice('正在检查 SDK 与授权…');
  q('bm-refresh').disabled=true;
  try{
    const result=await service.probe();
    if(session!==s.session||epoch!==s.watchEpoch)return;
    if(!result.ready){
      gate(result.reason+(result.code==='E_R11_BOOKMARKS_INCOMPLETE'?
        '。必须先完成 SDK R11 Full Bookmarks 能力。':
        '。请在 OpenDesk 可信扩展界面审阅权限后重新检查。'));
      notice('当前不可读取或修改 Chrome 书签',true);
      return;
    }
    // Observe before reading: changes during a paginated snapshot remain in
    // this session and trigger another full sync instead of falling in a gap.
    const watchError=await beginWatch(session);
    if(session!==s.session||epoch!==s.watchEpoch)return;
    const tree=await service.load();
    if(session!==s.session||epoch!==s.watchEpoch)return;
    enable(tree);
    if(s.watcher){notice('');scheduleWatch(epoch,0)}
    else recoverWatch(watchError);
  }catch(error){
    if(session!==s.session||epoch!==s.watchEpoch)return;
    // Keep an authorized, already-loaded workspace and its unsaved draft when
    // a *known transient* read transport fails. Never do this on revocation,
    // unknown permission status, malformed snapshots or a new authorization.
    const transient=['E_HOST_TIMEOUT','E_TIMEOUT','E_HOST_CLOSED',
      'E_TOOL_RUNTIME_UNAVAILABLE','E_TRANSPORT','E_SESSION_EXPIRED',
      'E_BOOKMARK_EVENT_GAP'].includes(error?.code);
    if(s.tree&&transient){
      // The observation session started before the failed read remains bounded
      // and can still detect a later native change without granting authority.
      if(s.watcher)scheduleWatch(epoch);
      notice('刷新暂时失败，已保留当前列表与未保存草稿。请手动重试：'+errorText(error),true);
    }else{
      gate('读取失败：'+errorText(error)+'。检查权限后可重新尝试。');
      notice('无法读取 Chrome 书签',true);
    }
  }finally{if(session===s.session&&epoch===s.watchEpoch)q('bm-refresh').disabled=false}
}
function confirmedWrite(tree,receipt,expectation){
  if(!expectation)return true;
  const targetId=expectation.id||receipt?.id;
  if(typeof targetId!=='string'||!targetId)return false;
  const node=tree.byId.get(targetId);
  if(expectation.deleted)return !node;
  if(!node||node.title!==expectation.title&&expectation.title!==undefined||
    expectation.parentId!==undefined&&node.parentId!==expectation.parentId)return false;
  if(expectation.url!==undefined&&node.url!==expectation.url)return false;
  return true;
}
async function mutation(run,expectation=null){
  if(s.busy||s.saveNeedsReview)return;
  const session=s.session,original=s.reviewed;
  busy(true);notice('正在通过 SDK 核对 Chrome 原生书签…');
  let wrote=false;
  try{
    const receipt=await run();
    wrote=true;
    if(session!==s.session)return;
    const tree=await service.load();
    if(session!==s.session)return;
    // A resolved RPC alone is never confirmation of a native write.
    enable(tree);
    if(!confirmedWrite(tree,receipt,expectation)){
      s.saveNeedsReview=true;
      throw Object.assign(new Error('SDK 已返回，但刷新后未能核实目标变化；请先检查原生书签，勿重复提交'),
        {code:'E_WRITE_NOT_CONFIRMED'});
    }
    const confirmedId=expectation?.id||receipt?.id||null;
    s.mode='tree';
    s.selection=expectation?.deleted?(original?.parentId||null):
      confirmedId||s.selection;
    s.draft=null;s.initialDraft=null;s.reviewed=null;s.reviewedDescendants=null;
    s.saveNeedsReview=false;s.menu=null;s.pending=null;s.conflict=false;s.conflictReviewed=false;
    q('bm-form-error').textContent='';
    render();
    const outsideSearch=Boolean(s.search&&s.selection&&
      ![...root.querySelectorAll('.bm-entry')].some(entry=>entry.dataset.nodeId===s.selection));
    notice(outsideSearch?'已保存并确认原生结果；当前搜索未匹配该项目，清空搜索可在列表中查看。':
      '已更新并重新读取 Chrome 书签');
  }catch(error){
    if(session!==s.session)return;
    const unknown=wrote||['E_OUTCOME_UNKNOWN','E_EFFECT_UNKNOWN','E_WRITE_NOT_CONFIRMED'].includes(error?.code);
    s.saveNeedsReview=s.saveNeedsReview||unknown;
    const message=errorText(error)+(unknown&&error?.code!=='E_WRITE_NOT_CONFIRMED'?
      '；写入结果未知或暂无法核实，请检查 Chrome 数据后再操作，勿直接重试。':'');
    notice(message,true);
    if(editingMode()){
      q('bm-form-error').textContent=message;
      q('bm-save').disabled=s.saveNeedsReview;
      if(['E_BOOKMARK_STALE','E_CONFLICT','E_PRECONDITION'].includes(error?.code)){
        s.conflict=true;s.conflictReviewed=false;
        q('bm-conflict-review').hidden=false;q('bm-adopt').hidden=true;
        q('bm-conflict-summary').textContent='书签在编辑期间发生变化。点击「重新读取并对比」，草稿不会被覆盖。';
      }
    }
    if(authorityLost(error))
      gate('完整书签 SDK 或授权已失效；请到可信扩展界面重新审阅。');
  }finally{
    if(session===s.session){
      busy(false);
      if(s.saveNeedsReview)q('bm-save').disabled=true;
    }
  }
}
function cancel(){
  const selected=s.selection;
  s.mode='tree';s.menu=null;s.draft=null;s.initialDraft=null;s.reviewed=null;
  s.reviewedDescendants=null;s.saveNeedsReview=false;s.pending=null;
  s.conflict=false;s.conflictReviewed=false;
  q('bm-form-error').textContent='';notice('');
  s.selection=node(selected)?selected:null;
  render();focusSelected();
}
async function saveCurrent(){
  if(s.busy)return;
  const page=sdk?.page;
  if(typeof page?.getContext!=='function'){notice('缺少已授权的当前页 SDK 能力',true);return}
  let first;
  try{
    first=await page.getContext();
    // URL-only equality cannot prove that Chrome retained the same document.
    // R11 must return opaque refs that the trusted Host independently verifies.
    if(first?.status!=='available'||typeof first.tabRef!=='string'||
      !first.tabRef||typeof first.documentRef!=='string'||!first.documentRef)
      throw Object.assign(new Error('当前页 SDK 尚未提供可信 Tab/Document 绑定'),
        {code:'E_DOCUMENT_BINDING_REQUIRED'});
    const url=model.asHttpUrl(first.url),parentId=targetFolder();
    if(!parentId)throw new Error('没有可写入的书签文件夹');
    const exists=[...s.tree.byId.values()].find(item=>item.url===url);
    if(exists){s.selection=exists.id;s.mode='tree';render();notice('该网址已收藏');return}
    await mutation(async()=>{
      const current=await page.getContext();
      if(current?.status!=='available'||current?.url!==first.url||
        current?.documentRef!==first.documentRef||current?.tabRef!==first.tabRef)
        throw Object.assign(new Error('网页已发生变化，请重新点击收藏'),{code:'E_DOCUMENT_STALE'});
      return service.createBookmark({title:first.title||new URL(url).hostname,url,parentId,
        sourcePage:{url,tabRef:first.tabRef,documentRef:first.documentRef}});
    },{title:(first.title||new URL(url).hostname).trim(),url,parentId});
  }catch(error){notice(errorText(error),true)}
}
function onAction(action,id){
  if(s.busy||!s.tree)return;
  if(action==='toggle'){s.expanded.has(id)?s.expanded.delete(id):s.expanded.add(id);renderList();return}
  if(action==='menu'){s.menu=s.menu===id?null:id;renderList();return}
  if(action==='more'){s.limit+=200;renderList();return}
  if(action==='cancel'){cancel();return}
  const switching=['folder','detail','edit','move','delete','new-bookmark','new-folder','save-current'].includes(action);
  if(switching&&editingMode()&&
    !(s.selection===id&&(action==='edit'&&s.mode==='edit'||action==='move'&&s.mode==='move'))){
    if(isDirty()){
      s.pending={action,id};q('bm-draft-guard').hidden=false;
      q('bm-keep-draft').focus({preventScroll:true});return;
    }
    s.mode='tree';s.draft=null;s.initialDraft=null;s.reviewed=null;
    s.saveNeedsReview=false;s.conflict=false;s.conflictReviewed=false;
  }
  s.pending=null;q('bm-draft-guard').hidden=true;
  if(action==='save-current'){void saveCurrent();return}
  if(action==='folder'){
    s.expanded.add(id);
    if(isWritableFolder(node(id))){s.folder=id;notice('')}
    else{s.folder=null;notice('Chrome 系统或受管理目录不可修改，请选择普通文件夹')}
    s.selection=id;s.menu=null;render();
    if(inNarrow())q('bm-inspector').scrollIntoView?.({block:'nearest'});return;
  }
  if(action==='new-bookmark'||action==='new-folder'){
    s.mode=action;s.draft=null;s.initialDraft=null;s.reviewed=null;
    s.reviewedDescendants=null;s.saveNeedsReview=false;s.conflict=false;s.conflictReviewed=false;
    q('bm-folder-query').value='';q('bm-form-error').textContent='';
    render();q('bm-name').focus({preventScroll:true});return;
  }
  const target=id||s.selection;
  if(!node(target)){notice('书签已变化，请刷新',true);return}
  if(action==='detail'){
    s.mode='tree';s.selection=target;s.menu=null;s.draft=null;s.initialDraft=null;
    render();
    if(inNarrow())q('bm-inspector').scrollIntoView?.({block:'nearest'});return;
  }
  if(['edit','move','delete'].includes(action)){
    if(node(target).locked){notice('Chrome 系统根目录或受管理节点不可修改',true);return}
    q('bm-form-error').textContent='';s.saveNeedsReview=false;
    s.reviewed=Object.freeze({...node(target)});
    s.reviewedDescendants=action==='delete'&&isFolder(node(target))?
      model.descendantSignatures(s.tree,target):[];
    s.mode=action;s.selection=target;s.menu=null;s.draft=null;s.initialDraft=null;
    s.conflict=false;s.conflictReviewed=false;
    q('bm-folder-query').value='';
    render();
    if(action==='delete')q('bm-delete-confirm').focus({preventScroll:true});
    else (action==='move'?q('bm-folder-query'):q('bm-name')).focus({preventScroll:true});
    if(inNarrow())q('bm-inspector').scrollIntoView?.({block:'nearest'});
  }
}
root.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&s.pending){event.preventDefault();s.pending=null;q('bm-draft-guard').hidden=true;return}
  if(event.key==='Escape'&&s.mode!=='tree'){event.preventDefault();cancel();return}
  if(event.key==='F2'&&s.mode==='tree'&&s.selection&&!node(s.selection)?.locked){
    event.preventDefault();onAction('edit',s.selection);return
  }
  if(event.key==='Escape'&&s.menu){const id=s.menu;s.menu=null;renderList();event.preventDefault();
    const menu=[...root.querySelectorAll('.bm-menu')].find(el=>el.getAttribute('aria-label')==='管理 '+(node(id)?.title||'未命名'));
    menu?.focus(); }
});
q('bm-refresh').addEventListener('click',()=>refresh(true));
q('bm-check').addEventListener('click',()=>refresh(true));
q('bm-more').addEventListener('click',()=>onAction('more'));
q('bm-current').addEventListener('click',()=>onAction('save-current'));
q('bm-new-bookmark').addEventListener('click',()=>onAction('new-bookmark'));
q('bm-new-folder').addEventListener('click',()=>onAction('new-folder'));
q('bm-cancel').addEventListener('click',cancel);
q('bm-delete-cancel').addEventListener('click',cancel);
q('bm-keep-draft').addEventListener('click',()=>{
  s.pending=null;q('bm-draft-guard').hidden=true;
  (q('bm-name').disabled?q('bm-folder-query'):q('bm-name')).focus({preventScroll:true});
});
q('bm-discard-switch').addEventListener('click',()=>{
  const pending=s.pending;
  if(!pending)return;
  s.pending=null;s.mode='tree';s.draft=null;s.initialDraft=null;
  s.reviewed=null;s.reviewedDescendants=null;s.conflict=false;s.conflictReviewed=false;
  s.saveNeedsReview=false;q('bm-form-error').textContent='';
  onAction(pending.action,pending.id);
});
q('bm-folder-query').addEventListener('input',()=>{
  if(editingMode())renderFolderOptions(s.draft?.parentId);
});
q('bm-review').addEventListener('click',()=>{
  if(!s.conflict||s.busy)return;
  s.conflictReviewed=true;
  void refresh(true);
});
q('bm-adopt').addEventListener('click',()=>{
  if(!s.conflict||!s.conflictReviewed||!editingMode()||s.busy)return;
  const latest=node(s.selection);
  if(!latest||latest.locked||isFolder(latest)!==isFolder(s.reviewed)){
    notice('书签类型或权限已改变，不能以当前版本继续编辑',true);return;
  }
  s.reviewed=Object.freeze({...latest});
  s.conflict=false;s.conflictReviewed=false;s.saveNeedsReview=false;
  q('bm-conflict-review').hidden=true;q('bm-adopt').hidden=true;
  q('bm-form-error').textContent='';
  q('bm-save').disabled=false;
  notice('已由您确认最新 Chrome 版本；草稿保留，需再次点击保存才能写入');
});
for(const [id,action] of [['bm-inspector-edit','edit'],['bm-inspector-move','move'],['bm-inspector-delete','delete']]){
  q(id).addEventListener('click',()=>onAction(action,s.selection));
}
for(const id of ['bm-name','bm-url','bm-parent']){
  q(id).addEventListener(id==='bm-parent'?'change':'input',()=>{
    rememberDraft();
    if(!s.saveNeedsReview){
      q(id).removeAttribute?.('aria-invalid');
      q('bm-form-error').textContent='';
    }
  });
}
for(const [id,message] of [['bm-name','请输入有效的书签名称'],['bm-url','请输入完整的 HTTP(S) 网址'],['bm-parent','请选择可写入的目标文件夹']]){
  q(id).addEventListener('invalid',event=>{
    event.preventDefault();notice(message,true);
    q('bm-form-error').textContent=message;
    event.target.setAttribute('aria-invalid','true');
  });
}
q('bm-search').addEventListener('compositionstart',()=>{s.composing=true});
q('bm-search').addEventListener('compositionend',()=>{s.composing=false;s.search=q('bm-search').value;s.limit=200;renderList()});
q('bm-search').addEventListener('input',event=>{
  if(event.isComposing||s.composing)return;
  s.search=event.target.value;s.limit=200;renderList();
});
const submitChanges=event=>{
  event.preventDefault();
  if(s.busy||!s.tree||!editingMode())return;
  if(s.saveNeedsReview){notice('请先检查原生书签并重新进入编辑，禁止重复提交未知结果',true);return}
  q('bm-form-error').textContent='';
  for(const id of ['bm-name','bm-url','bm-parent'])q(id).removeAttribute?.('aria-invalid');
  const payload={title:q('bm-name').value,url:q('bm-url').value,parentId:q('bm-parent').value};
  const mode=s.mode,expected=s.reviewed;s.draft=payload;
  const normalTitle=mode==='move'?undefined:payload.title.trim();
  let expectedUrl;
  if(mode==='new-bookmark'||mode==='edit'&&expected?.url!==undefined){
    if(payload.url===expected?.url)expectedUrl=expected.url;
    else try{expectedUrl=model.asHttpUrl(payload.url)}catch{
      // Let the existing Service report the invalid URL through mutation().
    }
  }
  if(mode==='new-bookmark')void mutation(()=>service.createBookmark(payload),
    {title:normalTitle,url:expectedUrl,parentId:payload.parentId});
  if(mode==='new-folder')void mutation(()=>service.createFolder(payload),
    {title:normalTitle,parentId:payload.parentId});
  if(mode==='edit'&&expected){
    const titleChanged=normalTitle!==expected.title,
      urlChanged=expected.url!==undefined&&payload.url!==expected.url,
      parentChanged=payload.parentId!==expected.parentId;
    if(!titleChanged&&!urlChanged&&!parentChanged){
      cancel();notice('内容没有变化');return;
    }
    const run=async()=>{
      let receipt=null,updated=false,moveExpected=expected;
      try{
        if(titleChanged||urlChanged){
          receipt=await service.update({expected,...payload});updated=true;
        }
        if(parentChanged){
          if(updated){
            // Sequential SDK operations are not an atomic Chrome transaction.
            // Verify step one before binding a fresh Host precondition to step two.
            const intermediate=await service.load();
            const current=intermediate.byId.get(expected.id);
            if(!current||current.title!==normalTitle||
              (expectedUrl!==undefined&&current.url!==expectedUrl)||
              current.parentId!==expected.parentId)
              throw Object.assign(new Error('编辑第一步未核实，移动已取消；请检查 Chrome'),
                {code:'E_WRITE_NOT_CONFIRMED'});
            moveExpected=current;
          }
          receipt=await service.move({expected:moveExpected,parentId:payload.parentId});
        }
        return receipt;
      }catch(error){
        if(updated&&!authorityLost(error))
          throw Object.assign(new Error('名称/网址可能已修改，但移动未确认：'+errorText(error)),
            {code:'E_EFFECT_UNKNOWN'});
        throw error;
      }
    };
    void mutation(run,{id:expected.id,title:normalTitle,
      ...(expectedUrl!==undefined?{url:expectedUrl}:{}),parentId:payload.parentId});
  }
  if(mode==='move'&&expected)void mutation(()=>service.move({expected,parentId:payload.parentId}),
    {id:expected.id,parentId:payload.parentId});
};
q('bm-form').addEventListener('submit',submitChanges);
// Opaque tool frames deliberately omit iframe sandbox allow-forms. A native
// HTML form submit is therefore NOT the gesture transport; run the validated
// SDK action directly from the trusted user button/keyboard interaction.
function saveFromGesture(){
  const form=q('bm-form');
  if(typeof form.reportValidity==='function'&&!form.reportValidity())return;
  submitChanges({preventDefault(){}});
}
q('bm-save').addEventListener('click',saveFromGesture);
q('bm-form').addEventListener('keydown',event=>{
  if(event.key!=='Enter'||event.isComposing||event.target?.id==='bm-folder-query'||
     event.target?.tagName==='BUTTON')return;
  event.preventDefault();saveFromGesture();
});
q('bm-delete-confirm').addEventListener('click',()=>{
  const expected=s.reviewed;if(!expected||s.selection!==expected.id)return;
  const current=node(expected.id);
  if(!current||model.nodeSignature(current)!==model.nodeSignature(expected)){
    notice('书签已被外部修改，请取消并重新审阅删除内容',true);return;
  }
  const signatures=s.reviewedDescendants||[];
  if(isFolder(expected)&&JSON.stringify(model.descendantSignatures(s.tree,expected.id))!==JSON.stringify(signatures)){
    notice('文件夹子项发生变化，请取消并重新审阅',true);return;
  }
  if(signatures.length&&!q('bm-delete-children').checked){
    notice('请先确认删除整个文件夹和子项',true);return;
  }
  void mutation(()=>service.remove({expected,confirmed:true,expectedDescendantSignatures:signatures}),{id:expected.id,deleted:true});
});
globalThis.addEventListener?.('pagehide',endWatch,{once:true});
void refresh();
})();
