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
  mode:'tree',menu:null,draft:null,busy:false,session:0,composing:false,
  watcher:null,watchEpoch:0,watchTimer:null};
const make=(tag,cls,value)=>{
  const el=document.createElement(tag);if(cls)el.className=cls;
  if(value!==undefined)el.textContent=value;return el;
};
const errorText=error=>String(error?.message||error||'操作失败').slice(0,280);
const authorityLost=error=>[
  'E_BOOKMARK_PERMISSION','E_GRANT_REVOKED','E_BOOKMARK_SCOPE',
  'E_CHROME_PERMISSION_REQUIRED','E_TOOL_CAPABILITY_REQUIRED',
  'E_R11_BOOKMARKS_INCOMPLETE','E_TOOL_DISABLED','E_CONTEXT'
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
const busy=value=>{
  s.busy=value;
  for(const button of root.querySelectorAll('button'))button.disabled=value;
};
function gate(text){
  endWatch();
  s.tree=null;s.selection=null;s.mode='tree';s.folder=null;s.menu=null;
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
  const el=make('button',cls,title);el.type='button';el.addEventListener('click',()=>onAction(action,id));
  return el;
};
function renderList(){
  const list=q('bm-list');list.replaceChildren();
  if(!s.tree)return;
  const {rows,total}=model.projectBookmarkRows(s.tree,{expanded:s.expanded,search:s.search,limit:s.limit});
  const frag=document.createDocumentFragment();
  for(const {item,level} of rows){
    const folder=isFolder(item),opened=s.expanded.has(item.id);
    const row=make('div','bm-row');row.dataset.selected=String(item.id===s.folder);
    row.setAttribute('role','treeitem');row.setAttribute('aria-level',String(Math.max(1,level+1)));
    if(folder)row.setAttribute('aria-expanded',String(opened));
    const indent=make('span');indent.style.width=Math.min(Math.max(level,0),6)*11+'px';
    indent.style.flex='none';indent.setAttribute('aria-hidden','true');row.append(indent);
    if(folder){
      const toggle=button(opened?'▾':'▸','toggle',item.id,'bm-toggle');
      toggle.setAttribute('aria-label',(opened?'折叠':'展开')+(item.title||'未命名文件夹'));
      row.append(toggle);
    }else row.append(make('span','bm-toggle'));
    const entry=button('',folder?'folder':'detail',item.id,'bm-entry');
    entry.append(make('span','',folder?'▱':'🔖'),make('span','',item.title||'未命名'));
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
  }
  if(!rows.length)frag.append(make('p','bm-help','没有匹配的书签或文件夹'));
  list.append(frag);
  q('bm-counter').textContent=total?('已显示 '+rows.length+' / '+total+' 项'):'';
  q('bm-more').hidden=rows.length>=total;
}
function renderForm(){
  const selected=node(s.selection),isNew=s.mode.startsWith('new-');
  if(!isNew&&!selected){s.mode='tree';render();return}
  const folder=s.mode==='new-folder'||isFolder(selected);
  const detail=s.mode==='detail',moving=s.mode==='move';
  const label=detail?'书签详情':moving?'移动':isNew?'新建':'编辑';
  q('bm-form-title').textContent=label+(folder?'文件夹':'书签');
  q('bm-name-row').hidden=moving;
  q('bm-url-row').hidden=moving||folder;
  q('bm-parent-row').hidden=detail||s.mode==='edit';
  const title=q('bm-name'),url=q('bm-url');
  title.value=s.draft?.title??(isNew?'':selected?.title||'');
  url.value=s.draft?.url??(isNew?'https://':selected?.url||'');
  title.readOnly=detail;url.readOnly=detail;
  if(!detail){
    const box=q('bm-parent');box.replaceChildren();
    const preferred=s.draft?.parentId||(moving?selected?.parentId:targetFolder());
    for(const item of folders()){
      if(moving&&folder&&model.isDescendant(s.tree,item.id,selected.id))continue;
      const option=make('option','',item.title||'未命名文件夹');
      option.value=item.id;option.selected=item.id===preferred;box.append(option);
    }
  }
  q('bm-save').hidden=detail;
  q('bm-detail-url').hidden=!detail;
  if(detail)q('bm-detail-url').textContent=selected?.url||'';
}
function renderDelete(){
  const item=node(s.selection);if(!item){s.mode='tree';render();return}
  const descendants=isFolder(item)?model.descendantSignatures(s.tree,item.id):[];
  q('bm-delete-desc').textContent='确认删除「'+(item.title||'未命名')+'」？'+
    (isFolder(item)?'将同时删除 '+descendants.length+' 个子项，可能同步至其他设备。':'该操作可能同步至其他设备。');
  q('bm-delete-children-row').hidden=!descendants.length;
  q('bm-delete-children').checked=false;
}
function render(){
  q('bm-explorer').hidden=s.mode!=='tree';
  q('bm-form-view').hidden=!['new-bookmark','new-folder','detail','edit','move'].includes(s.mode);
  q('bm-delete-view').hidden=s.mode!=='delete';
  if(s.mode==='tree'){q('bm-search').value=s.search;renderList()}
  else if(s.mode==='delete')renderDelete();
  else renderForm();
}
// The SDK owns bounded event sessions; no native bookmark listeners in the sandbox.
function rememberDraft(){
  if(!['new-bookmark','new-folder','edit','move'].includes(s.mode))return;
  s.draft={title:q('bm-name').value,url:q('bm-url').value,parentId:q('bm-parent').value};
}
function endWatch(){
  s.watchEpoch++;
  if(s.watchTimer!==null){clearTimeout(s.watchTimer);s.watchTimer=null}
  const old=s.watcher;s.watcher=null;
  if(old)void service.watchStop(old).catch(()=>{});
}
function scheduleWatch(epoch,delay=2500){
  if(epoch!==s.watchEpoch)return;
  s.watchTimer=setTimeout(()=>{s.watchTimer=null;void pollWatch(epoch)},delay);
}
async function pollWatch(epoch){
  if(epoch!==s.watchEpoch||!s.watcher||!s.tree)return;
  if(s.busy||s.composing){scheduleWatch(epoch);return}
  try{
    const result=await service.watchRead(s.watcher);
    if(epoch!==s.watchEpoch)return;
    s.watcher={...s.watcher,cursor:result.nextCursor,expiresAt:result.expiresAt};
    if(result.events.length||result.expiresAt<=Date.now()+4000){
      void refresh();return;
    }
    scheduleWatch(epoch);
  }catch(error){
    if(epoch!==s.watchEpoch)return;
    endWatch();
    if(authorityLost(error)){
      gate('完整书签 SDK 或授权已失效；请在可信扩展界面重新检查。');
      notice(errorText(error),true);
    }else if(error?.code==='E_BOOKMARK_EVENT_GAP'){
      void refresh();
    }else{
      notice('书签同步暂不可用：'+errorText(error),true);
      s.watchTimer=setTimeout(()=>{s.watchTimer=null;void refresh()},7000);
    }
  }
}
async function beginWatch(session){
  const epoch=++s.watchEpoch;
  try{
    const watcher=await service.watchStart();
    if(epoch!==s.watchEpoch||session!==s.session||!s.tree){
      void service.watchStop(watcher).catch(()=>{});return;
    }
    s.watcher=watcher;scheduleWatch(epoch);
  }catch(error){
    if(epoch!==s.watchEpoch)return;
    if(authorityLost(error)){
      gate('完整书签 SDK 或授权已失效；请在可信扩展界面重新检查。');
      notice(errorText(error),true);return;
    }
    notice('书签事件同步不可用，请手动刷新：'+errorText(error),true);
  }
}
async function refresh(){
  if(s.busy)return;
  rememberDraft();endWatch();
  const session=++s.session;
  notice('正在检查 SDK 与授权…');
  q('bm-refresh').disabled=true;
  try{
    const result=await service.probe();
    if(session!==s.session)return;
    if(!result.ready){
      gate(result.reason+(result.code==='E_R11_BOOKMARKS_INCOMPLETE'?
        '。必须先完成 SDK R11 Full Bookmarks 能力。':
        '。请在 OpenDesk 可信扩展界面审阅权限后重新检查。'));
      notice('当前不可读取或修改 Chrome 书签',true);
      return;
    }
    const tree=await service.load();
    if(session!==s.session)return;
    enable(tree);notice('');
    void beginWatch(session);
  }catch(error){
    if(session!==s.session)return;
    gate('读取失败：'+errorText(error)+'。检查权限后可重新尝试。');
    notice('无法读取 Chrome 书签',true);
  }finally{if(session===s.session)q('bm-refresh').disabled=false}
}
async function mutation(run){
  if(s.busy)return;
  const session=s.session;
  busy(true);notice('正在通过 SDK 核对 Chrome 原生书签…');
  try{
    await run();
    if(session!==s.session)return;
    s.mode='tree';s.selection=null;s.draft=null;s.menu=null;
    // Do not turn an unknown outcome into an automatic replay.
    busy(false);await refresh();
    if(s.tree&&!q('bm-workspace').hidden)notice('已更新 Chrome 书签');
  }catch(error){
    if(session!==s.session)return;
    busy(false);
    const unknown=['E_OUTCOME_UNKNOWN','E_EFFECT_UNKNOWN'].includes(error?.code);
    notice(errorText(error)+(unknown?'；写入结果未知，请检查 Chrome 数据后再操作，勿直接重试。':''),true);
    if(authorityLost(error))
      gate('完整书签 SDK 或授权已失效；请到可信扩展界面重新审阅。');
  }
}
function cancel(){
  s.mode='tree';s.selection=null;s.menu=null;s.draft=null;notice('');render();
  q('bm-search').focus({preventScroll:true});
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
    if(exists){s.selection=exists.id;s.mode='detail';render();notice('该网址已收藏');return}
    await mutation(async()=>{
      const current=await page.getContext();
      if(current?.status!=='available'||current?.url!==first.url||
        current?.documentRef!==first.documentRef||current?.tabRef!==first.tabRef)
        throw Object.assign(new Error('网页已发生变化，请重新点击收藏'),{code:'E_DOCUMENT_STALE'});
      return service.createBookmark({title:first.title||new URL(url).hostname,url,parentId,
        sourcePage:{url,tabRef:first.tabRef,documentRef:first.documentRef}});
    });
  }catch(error){notice(errorText(error),true)}
}
function onAction(action,id){
  if(s.busy||!s.tree)return;
  if(action==='toggle'){s.expanded.has(id)?s.expanded.delete(id):s.expanded.add(id);renderList();return}
  if(action==='folder'){
    s.expanded.add(id);
    if(isWritableFolder(node(id))){s.folder=id;notice('')}
    else{s.folder=null;notice('Chrome 系统或受管理目录不可修改，请选择普通文件夹')}
    renderList();return;
  }
  if(action==='menu'){s.menu=s.menu===id?null:id;renderList();return}
  if(action==='save-current'){void saveCurrent();return}
  if(action==='more'){s.limit+=200;renderList();return}
  if(action==='cancel'){cancel();return}
  if(action==='new-bookmark'||action==='new-folder'){
    s.mode=action;s.selection=null;s.draft=null;render();q('bm-name').focus();return;
  }
  const target=id||s.selection;
  if(!node(target)){notice('书签已变化，请刷新',true);return}
  if(action==='detail'){
    s.mode='detail';s.selection=target;s.menu=null;s.draft=null;render();q('bm-back').focus();return;
  }
  if(['edit','move','delete'].includes(action)){
    if(node(target).locked){notice('Chrome 系统根目录或受管理节点不可修改',true);return}
    s.mode=action;s.selection=target;s.menu=null;s.draft=null;render();
    if(action==='delete')q('bm-delete-confirm').focus();
    else (action==='move'?q('bm-parent'):q('bm-name')).focus();
  }
}
root.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&s.mode!=='tree'){event.preventDefault();cancel();return}
  if(event.key==='Escape'&&s.menu){const id=s.menu;s.menu=null;renderList();event.preventDefault();
    const menu=[...root.querySelectorAll('.bm-menu')].find(el=>el.getAttribute('aria-label')==='管理 '+(node(id)?.title||'未命名'));
    menu?.focus(); }
});
q('bm-refresh').addEventListener('click',()=>refresh());
q('bm-check').addEventListener('click',()=>refresh());
q('bm-more').addEventListener('click',()=>onAction('more'));
q('bm-current').addEventListener('click',()=>onAction('save-current'));
q('bm-new-bookmark').addEventListener('click',()=>onAction('new-bookmark'));
q('bm-new-folder').addEventListener('click',()=>onAction('new-folder'));
q('bm-back').addEventListener('click',cancel);
q('bm-cancel').addEventListener('click',cancel);
q('bm-delete-back').addEventListener('click',cancel);
q('bm-delete-cancel').addEventListener('click',cancel);
q('bm-search').addEventListener('compositionstart',()=>{s.composing=true});
q('bm-search').addEventListener('compositionend',()=>{s.composing=false;s.search=q('bm-search').value;s.limit=200;renderList()});
q('bm-search').addEventListener('input',event=>{
  if(event.isComposing||s.composing)return;
  s.search=event.target.value;s.limit=200;renderList();
});
q('bm-form').addEventListener('submit',event=>{
  event.preventDefault();
  if(s.busy||!s.tree||s.mode==='detail')return;
  const payload={title:q('bm-name').value,url:q('bm-url').value,parentId:q('bm-parent').value};
  const mode=s.mode,expected=node(s.selection);s.draft=payload;
  if(mode==='new-bookmark')void mutation(()=>service.createBookmark(payload));
  if(mode==='new-folder')void mutation(()=>service.createFolder(payload));
  if(mode==='edit'&&expected)void mutation(()=>service.update({expected,...payload}));
  if(mode==='move'&&expected)void mutation(()=>service.move({expected,parentId:payload.parentId}));
});
q('bm-delete-confirm').addEventListener('click',()=>{
  const expected=node(s.selection);if(!expected)return;
  const signatures=isFolder(expected)?model.descendantSignatures(s.tree,expected.id):[];
  if(signatures.length&&!q('bm-delete-children').checked){
    notice('请先确认删除整个文件夹和子项',true);return;
  }
  void mutation(()=>service.remove({expected,confirmed:true,expectedDescendantSignatures:signatures}));
});
globalThis.addEventListener?.('pagehide',endWatch,{once:true});
void refresh();
})();
