// Static, audited first-party tool UI. Untrusted tool packages never enter this DOM.
import {createBookmarkService} from './service.js';
import {asHttpUrl,isFolder,isDescendant} from './model.js';
import {requestOptionalPluginPermissions} from '../platform/chrome/permission-gate.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const message=error=>String(error?.message||error||'操作失败').slice(0,280);

export function createBookmarkManager({api,doc,container,currentPageTarget}={}){
  // Optional Chrome APIs may not be exposed until permission is granted.
  if(!api?.permissions?.contains||!container?.addEventListener||!doc)return null;
  const service=createBookmarkService(api);
  const s={open:false,permission:false,tree:null,expanded:new Set(),folder:null,selection:null,
    mode:'tree',menu:null,search:'',draft:null,error:'',info:'',busy:false,revision:0};
  let unsub=null,disposed=false;
  const node=id=>s.tree?.byId.get(id);
  const folders=()=>s.tree?[...s.tree.byId.values()].filter(isFolder):[];
  const defaultFolder=()=>folders().find(x=>x.folderType==='other'&&!x.unmodifiable)?.id||
    folders().find(x=>x.folderType==='bookmarks-bar'&&!x.unmodifiable)?.id||
    folders().find(x=>x.parentId&&s.tree.roots.has(x.parentId)&&!x.unmodifiable)?.id||null;
  const selectedFolder=()=>node(s.folder)&&isFolder(node(s.folder))?s.folder:defaultFolder();
  const foldersList=(value,exclude)=>folders().filter(x=>!s.tree.roots.has(x.id)&&
    (!x.locked||s.tree.roots.has(x.parentId))&&(!exclude||!isDescendant(s.tree,x.id,exclude)))
    .map(x=>'<option value="'+esc(x.id)+'" '+(x.id===value?'selected':'')+'>'+esc(x.title||'未命名文件夹')+'</option>').join('');
  const toolbar=()=>'<div class="bm-toolbar"><button class="od-button bm-main" data-bm="save-current">☆ 收藏当前页</button>'+
    '<button class="od-button od-button--secondary" data-bm="new-bookmark">＋ 书签</button>'+
    '<button class="od-button od-button--secondary" data-bm="new-folder">＋ 文件夹</button></div>';
  const row=(item,level)=>{
    const folder=isFolder(item),opened=s.expanded.has(item.id),title=esc(item.title||'未命名');
    return '<div class="bm-node '+(s.folder===item.id?'bm-selected':'')+'" style="padding-left:'+Math.min(level,12)*12+'px">'+
      (folder?'<button class="bm-toggle" data-bm="toggle" data-id="'+esc(item.id)+'" aria-label="'+(opened?'折叠':'展开')+title+'" aria-expanded="'+opened+'">'+(opened?'▾':'▸')+'</button>':'<span class="bm-toggle bm-placeholder"></span>')+
      '<button class="bm-entry" data-bm="'+(folder?'folder':'detail')+'" data-id="'+esc(item.id)+'"><span aria-hidden="true">'+(folder?'▱':'🔖')+'</span><span class="bm-ellipsis">'+title+'</span></button>'+
      (folder?'<span class="bm-count">'+(s.tree.children.get(item.id)||[]).length+'</span>':'')+
      (item.locked?'':'<button class="bm-more" data-bm="menu" data-id="'+esc(item.id)+'" aria-label="管理'+title+'">···</button>')+'</div>'+
      (s.menu===item.id?'<div class="bm-node-menu"><button data-bm="edit" data-id="'+esc(item.id)+'">编辑</button><button data-bm="move" data-id="'+esc(item.id)+'">移动</button><button data-bm="delete" data-id="'+esc(item.id)+'">删除</button></div>':'');
  };
  function tree(){
    const rows=[],limit=200,term=s.search.toLocaleLowerCase().trim(),t=s.tree;
    if(term){
      for(const x of t.byId.values()){
        if(rows.length>=limit)break;
        if(!t.roots.has(x.id)&&((x.title||'')+' '+(x.url||'')).toLocaleLowerCase().includes(term))rows.push(row(x,0));
      }
    }else{
      const visit=(x,level)=>{
        if(rows.length>=limit)return;
        if(!t.roots.has(x.id))rows.push(row(x,level));
        if(!t.roots.has(x.id)&&!s.expanded.has(x.id))return;
        for(const id of t.children.get(x.id)||[]){const child=node(id);if(child)visit(child,level+1)}
      };
      for(const id of t.roots){const root=node(id);if(root)visit(root,-1)}
    }
    return '<label class="bm-search-label"><span class="visually-hidden">搜索书签或文件夹</span>'+
      '<input id="bookmark-manager-search" class="od-field bm-search" type="search" placeholder="搜索书签或文件夹…" value="'+esc(s.search)+'"></label>'+
      toolbar()+'<div class="bm-tree" role="tree" aria-label="Chrome 书签文件树">'+(rows.join('')||'<p class="bm-hint">没有匹配的书签或文件夹</p>')+'</div>'+
      (rows.length>=limit?'<p class="bm-hint">仅显示前 200 项，请搜索或折叠文件夹。</p>':'');
  }
  const back=title=>'<div class="bm-subhead"><button class="od-icon-button" data-bm="cancel" aria-label="返回书签树">‹</button><strong>'+title+'</strong></div>';
  function detail(){
    const x=node(s.selection);if(!x)return '<p class="bm-hint">所选书签已变化，请返回。</p>';
    return back('书签详情')+'<div class="bm-detail-title">'+esc(x.title)+'</div><div class="bm-detail-url">'+esc(x.url)+'</div>'+
      '<div class="bm-form-actions"><button class="od-button" data-bm="open-url">打开网页</button>'+
      (x.locked?'':'<button class="od-button od-button--secondary" data-bm="edit">编辑</button>'+
       '<button class="od-button od-button--secondary" data-bm="move">移动</button>'+
       '<button class="od-button od-button--danger" data-bm="delete">删除</button>')+'</div>';
  }
  function form(){
    const x=node(s.selection),isNew=s.mode.startsWith('new-');
    const folder=s.mode==='new-folder'||isFolder(x);
    if(!isNew&&!x)return '<p class="bm-hint">所选节点已不存在。</p>';
    if(s.mode==='delete'){
      const children=folder?[...s.tree.byId.keys()].filter(id=>id!==x.id&&isDescendant(s.tree,id,x.id)):[];
      return back('删除确认')+'<div class="bm-warning">确认删除「'+esc(x.title)+'」？'+
        (folder?'将同时删除 '+children.length+' 个子节点（含文件夹和书签）。':'')+
        '更改可能同步至其他设备。</div>'+
        (children.length?'<label class="bm-delete-check"><input type="checkbox" id="bookmark-manager-confirm-children"> 我了解文件夹内的所有内容也将删除</label>':'')+
        '<div class="bm-form-actions"><button class="od-button od-button--danger" data-bm="confirm-delete">确认删除</button>'+
        '<button class="od-button od-button--secondary" data-bm="cancel">取消</button></div>';
    }
    const opts=foldersList(s.draft?.parentId||(s.mode==='move'?x.parentId:selectedFolder()),
      s.mode==='move'&&folder?x.id:null);
    const controls=s.mode==='move'?'<label>移动到<select class="od-field" name="parentId" required>'+opts+'</select></label>':
      '<label>名称<input class="od-field" name="title" required maxlength="256" value="'+esc(s.draft?.title??(isNew?'':x.title))+'"></label>'+
      (folder?'':'<label>网址<input class="od-field" name="url" type="url" required value="'+esc(s.draft?.url??(isNew?'https://':x.url))+'"></label>')+
      (isNew?'<label>保存到<select class="od-field" name="parentId" required>'+opts+'</select></label>':'');
    const title=s.mode==='move'?'移动':isNew?'新建':'编辑';
    return back(title+(folder?'文件夹':'书签'))+'<form id="bookmark-manager-form" class="bm-form">'+controls+
      '<div class="bm-form-actions"><button class="od-button" type="submit">保存</button>'+
      '<button class="od-button od-button--secondary" type="button" data-bm="cancel">取消</button></div></form>';
  }
  function render(){
    if(!s.open||disposed)return;
    const notice=s.error?'<p role="alert" class="bm-notice bm-error">'+esc(s.error)+'</p>':
      s.info?'<p role="status" class="bm-notice">'+esc(s.info)+'</p>':'';
    const body=s.busy?'<p class="bm-hint">正在处理…</p>':
      !s.permission?'<div class="bm-consent"><p>需要 Chrome 书签权限才能管理现有书签。数据仅留在浏览器。</p>'+
        '<button class="od-button" data-bm="grant">授权访问书签</button></div>':
      !s.tree?'<p class="bm-hint">正在读取书签…</p>':
      s.mode==='tree'?tree():s.mode==='detail'?detail():form();
    container.innerHTML='<div class="bm-page-head od-toolbar od-page-head">'+
      '<button class="od-icon-button" data-bm="exit" aria-label="返回工具列表">‹</button>'+
      '<strong class="od-page-title">书签管理</strong></div>'+notice+body;
  }
  async function refresh(){
    const epoch=++s.revision;
    try{
      const granted=await service.hasPermission();if(!s.open||epoch!==s.revision)return;
      s.permission=granted===true;
      if(!s.permission){s.tree=null;s.mode='tree';render();return}
      const current=await service.load();if(!s.open||epoch!==s.revision)return;
      s.tree=current;s.error='';s.info='';
      if(!s.expanded.size)for(const x of current.byId.values())if(current.roots.has(x.parentId))s.expanded.add(x.id);
      render();
    }catch(e){if(s.open&&epoch===s.revision){s.tree=null;s.error=message(e);render()}}
  }
  async function mutation(operation){
    if(s.busy||!s.open)return;
    s.busy=true;s.error='';render();
    try{
      await operation();s.busy=false;s.mode='tree';s.selection=null;s.draft=null;await refresh();
      s.info='已更新 Chrome 书签';render();
    }catch(e){s.busy=false;s.error=message(e);render()}
  }
  function clicks(event){
    const btn=event.target.closest('[data-bm]');if(!btn||!container.contains(btn)||!s.open||disposed)return;
    const action=btn.dataset.bm,id=btn.dataset.id;
    if(action==='exit'){close();container.dispatchEvent(new CustomEvent('opendesk-bookmark-manager-back',{bubbles:true}));return}
    if(action==='grant'){
      // Native optional-permission prompt must start synchronously on the real click.
      let pending;try{pending=requestOptionalPluginPermissions({api,event,permissions:['bookmarks']})}
      catch(e){s.error=message(e);render();return}
      Promise.resolve(pending).then(refresh,e=>{s.error=message(e);render()});return;
    }
    if(s.busy||!s.permission||!s.tree)return;
    if(action==='cancel'){s.mode='tree';s.selection=null;s.menu=null;s.draft=null;s.error='';render();return}
    if(action==='toggle'){s.expanded.has(id)?s.expanded.delete(id):s.expanded.add(id);render();return}
    if(action==='folder'){s.folder=id;s.expanded.add(id);render();return}
    if(action==='menu'){s.menu=s.menu===id?null:id;render();return}
    if(action==='detail'){s.selection=id;s.mode='detail';render();return}
    if(action==='new-bookmark'||action==='new-folder'){s.mode=action;s.selection=null;s.draft=null;render();return}
    if(['edit','move','delete'].includes(action)){
      s.selection=id||s.selection;
      if(!node(s.selection)||node(s.selection).locked){s.error='Chrome 根目录或受管理书签不可修改';render();return}
      s.mode=action;s.menu=null;s.draft=null;render();return;
    }
    if(action==='open-url'){
      try{const url=asHttpUrl(node(s.selection)?.url);Promise.resolve(api.tabs.create({url})).catch(e=>{s.error=message(e);render()})}
      catch(e){s.error=message(e);render()}return;
    }
    if(action==='save-current'){
      const snapshot=currentPageTarget?.snapshot||{};let url;
      try{url=asHttpUrl(snapshot.url)}catch{s.error='请先选中普通网页';render();return}
      const existing=[...s.tree.byId.values()].find(x=>x.url===url);
      if(existing){s.selection=existing.id;s.mode='detail';s.info='该网址已收藏';render();return}
      const parentId=selectedFolder();if(!parentId){s.error='没有可写入的书签文件夹';render();return}
      void mutation(async()=>{
        if(typeof currentPageTarget?.revalidate==='function')await currentPageTarget.revalidate(snapshot);
        return service.createBookmark({title:snapshot.title||new URL(url).hostname,url,parentId});
      });return;
    }
    if(action==='confirm-delete'){
      const expected=node(s.selection);if(!expected)return;
      const expectedDescendantIds=isFolder(expected)?
        [...s.tree.byId.keys()].filter(x=>x!==expected.id&&isDescendant(s.tree,x,expected.id)):[];
      if(expectedDescendantIds.length&&!container.querySelector('#bookmark-manager-confirm-children')?.checked){
        s.error='请先确认删除文件夹内的全部内容';render();return;
      }
      void mutation(()=>service.remove({expected,confirmed:true,expectedDescendantIds}));
    }
  }
  function submits(event){
    if(event.target.id!=='bookmark-manager-form'||!s.tree||s.busy)return;
    event.preventDefault();
    const data=new FormData(event.target);
    const payload={title:data.get('title'),url:data.get('url'),parentId:data.get('parentId')};
    s.draft=payload;const expected=node(s.selection);
    if(s.mode==='new-bookmark')void mutation(()=>service.createBookmark(payload));
    if(s.mode==='new-folder')void mutation(()=>service.createFolder(payload));
    if(s.mode==='edit'&&expected)void mutation(()=>service.update({expected,...payload}));
    if(s.mode==='move'&&expected)void mutation(()=>service.move({expected,parentId:payload.parentId}));
  }
  function searchInput(event){
    if(event.target.id!=='bookmark-manager-search')return;
    s.search=event.target.value;const index=event.target.selectionStart;render();
    const input=container.querySelector('#bookmark-manager-search');input?.focus();input?.setSelectionRange(index,index);
  }
  function changed(kind){
    if(!s.open)return;
    if(kind==='permission'||s.mode==='tree'){void refresh();return;}
    s.info='书签在其他窗口可能已更新，保存前会重新检查';
  }
  function close(){s.open=false;s.revision++;container.hidden=true;unsub?.();unsub=null}
  container.addEventListener('click',clicks);
  container.addEventListener('submit',submits);
  container.addEventListener('input',searchInput);
  return Object.freeze({
    open(){if(disposed)return;s.open=true;container.hidden=false;unsub??=service.onChange(changed);render();void refresh()},
    close,isOpen:()=>s.open,
    dispose(){close();disposed=true;container.removeEventListener('click',clicks);container.removeEventListener('submit',submits);container.removeEventListener('input',searchInput)}
  });
}
