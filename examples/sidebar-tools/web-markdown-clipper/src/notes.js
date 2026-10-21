(function(g){
'use strict';
// The trusted Host owns clipping limits, the legacy "clips" data and atomic
// mutations. The untrusted UI never reads or rewrites the whole 4 MiB library.
const BODY_LIMIT=160000,LIBRARY_LIMIT=4*1024*1024;
const bytes=value=>new TextEncoder().encode(value).byteLength;
const fail=(code,message)=>Object.assign(new Error(message),{code});
const titleOf=body=>[...String(body).trim().replace(/^#{1,6}\s*/,'').split(/\r?\n/)[0]].slice(0,42).join('')||'新便签';
const filename=title=>(String(title||'网页摘录').normalize('NFKC')
 .replace(/[\x00-\x1f\x7f\\/:*?"<>|]/g,'-').replace(/^[.\s]+|[.\s]+$/g,'').slice(0,60)||'web-clip')+'.md';

function createStore({request}){
 let busy=false,uncertain=false;
 const command=async(operation,payload)=>request('clipNotes.'+operation,payload);
 const guard=async work=>{
  if(busy)throw fail('E_BUSY','正在写入摘录，请勿重复操作');
  if(uncertain)throw fail('E_OUTCOME_UNKNOWN','上次写入结果未确认，请先刷新我的摘录');
  busy=true;
  try{return await work();}
  catch(error){
   if(['E_OUTCOME_UNKNOWN','E_TOOL_TIMEOUT'].includes(error?.code))uncertain=true;
   throw error;
  }finally{busy=false;}
 };
 const list=(query='',offset=0,kind='all')=>command('list',kind==='all'?{query,offset}:{query,offset,kind});
 const get=id=>command('get',{id});
 async function save(input){
  if(typeof input?.body!=='string'||!input.body.trim())throw fail('E_EMPTY','请输入要保存的文字');
  if(bytes(input.body)>BODY_LIMIT)throw fail('E_BODY_LIMIT','正文超过 160,000 字节，不会截断');
  return guard(async()=>{
   let response=null;
   try{
    response=await command('save',input);
    const confirmed=await get(response.id);
    if(!confirmed?.item||confirmed.item.body!==input.body||
       confirmed.item.kind!==(input.kind==='note'?'note':'clip')||
       (input.kind!=='note'&&!confirmed.item.source)||
       (input.title&&confirmed.item.title!==[...input.title.trim()].slice(0,70).join('')))
     throw fail('E_OUTCOME_UNKNOWN','写入后逐字段核对未通过，请刷新我的摘录');
    return {item:confirmed.item,etag:confirmed.etag,duplicate:response.duplicate===true};
   }catch(error){if(response)uncertain=true;throw error;}
  });
 }
 async function edit(id,etag,body){
  if(typeof body!=='string'||!body.trim())throw fail('E_EMPTY','正文不能为空');
  if(bytes(body)>BODY_LIMIT)throw fail('E_BODY_LIMIT','正文超过 160,000 字节，不会截断');
  return guard(async()=>{
   let response=null;
   try{
    response=await command('edit',{id,ifMatch:etag,body});
    const checked=await get(id);
    if(checked?.item?.body!==body)throw fail('E_OUTCOME_UNKNOWN','编辑读回不一致，请刷新核对');
    return {item:checked.item,etag:checked.etag,unchanged:response.unchanged===true};
   }catch(error){if(response)uncertain=true;throw error;}
  });
 }
 async function remove(id,etag){
  return guard(async()=>{
   const result=await command('remove',{id,ifMatch:etag});
   try{await get(id);}
   catch(error){
    if(error?.code==='E_NOT_FOUND')return result;
    uncertain=true;throw error;
   }
   uncertain=true;throw fail('E_OUTCOME_UNKNOWN','删除后仍能读到摘录，请刷新核对');
  });
 }
 async function recover(query='',offset=0,kind='all'){const result=await list(query,offset,kind);uncertain=false;return result;}
 const backup=()=>guard(()=>command('backup',{}));
 return {list,get,save,edit,remove,recover,backup,get uncertain(){return uncertain;}};
}
function create({root,request,sdk,onStatus,renderMarkdown,onSaveBusy}){
 const q=id=>root.querySelector('#'+id),doc=root.ownerDocument||document;
 const el=(tag,cls,text)=>{const n=doc.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const store=createStore({request});
 const hostedNavigation=typeof g.OpenDeskTool?.setNavigation==='function';
 if(hostedNavigation)(root.matches?.('.clip')?root:root.querySelector('.clip'))?.classList.add('clip-hosted');
 const empty=()=>({items:[],total:0,matched:0,usedBytes:0,etag:null,nextOffset:null});
 let data=empty(),recent=empty();
 let clip=null,reading=null,readerOrigin='library',editing=null,editingSource=null;
 let editorReturn='library',baseline='',busy=false,pendingDelete=null;
 let generation=0,recentGeneration=0,searchTimer=null,recentScroll=0,libraryScroll=0;
 const msg=(text,error=false)=>{
  q('clip-notes-status').textContent=text;
  q('clip-notes-status').dataset.error=String(error);
  if(!q('clip-home').hidden&&typeof onStatus==='function')onStatus(text,error);
 };
 const statusError=(e,prefix='')=>msg(prefix+String(e?.message||e),true);
 const dirty=()=>editing!==null&&q('clip-note-body').value!==baseline;
 const notify=()=>g.OpenDeskTool?.setState?.({dirty:dirty(),busy});
 const publishNavigation=()=>{
  if(!hostedNavigation)return;
  const page=editing?(editing.id?'edit':'new'):reading?'reader':
   q('clip-notes').hidden?'home':'library';
  g.OpenDeskTool.setNavigation({page});
 };
 const scrollParent=()=>doc.scrollingElement||doc.documentElement||root.parentElement||null;
 const scrollNow=()=>scrollParent()?.scrollTop||0;
 const restoreScroll=position=>{
  const run=()=>{const node=scrollParent();if(node)node.scrollTop=position;};
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else run();
 };
 const confirmHidden=()=>{if(pendingDelete?.panel)pendingDelete.panel.remove();pendingDelete=null;};
 const svgIcon=name=>{
  const ns='http://www.w3.org/2000/svg';
  const svg=doc.createElementNS(ns,'svg'),use=doc.createElementNS(ns,'use');
  svg.classList.add('clip-icon');
  svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
  use.setAttribute('href','#clip-i-'+name);svg.append(use);return svg;
 };
 const action=(icon,label,onClick,extra='')=>{
  const button=el('button','clip-icon-button '+extra);
  button.type='button';button.title=label;button.setAttribute('aria-label',label);
  button.append(svgIcon(icon));
  button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();onClick();});
  return button;
 };
 function setClip(next){
  clip=next;
  const large=next&&bytes(next.body)>BODY_LIMIT;
  q('clip-save').disabled=!next||busy||Boolean(large);
  q('clip-save').title=large?'超过 160,000 字节，请下载完整 Markdown':'完整保存到我的摘录';
  q('clip-save-explain').textContent=large
   ?'正文超过 160,000 字节，未截断；可下载完整 .md'
   :'完整保存到本机「我的摘录」；也可以复制或下载 .md';
 }
 function viewState(){
  const list=!editing&&!reading;
  q('clip-notes-head').hidden=!list;
  q('clip-note-list').hidden=!list;
  q('clip-notes-tools').hidden=!list;
  q('clip-notes-meta').hidden=!list;
  q('clip-note-more').hidden=!list||data.nextOffset===null;
  q('clip-note-reader').hidden=!reading||Boolean(editing);
  q('clip-note-editor').hidden=!editing;
  q('clip-note-new').hidden=!list;
  q('clip-notes').dataset.view=editing?'editing':reading?'reading':'list';
  publishNavigation();notify();
 }
 function cardCopy(item){
  // Read-only presentation: legacy stored page title/source remain unchanged.
  const raw=String(item.excerpt||''),lines=raw.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
  const line=lines.find(v=>!(/^(---|\.\.\.|title:|source:|url:|date:|https?:\/\/)/i.test(v)))||'';
  const content=line.replace(/^#{1,6}\s+/,'').replace(/^>\s*/,'')
   .replace(/^\[([^\]]+)\]\(https?:\/\/[^)]+\)\s*$/,'$1').trim();
  const headline=content||String(item.title||'').trim()||'摘录';
  const title=[...headline].slice(0,68).join('');
  const rest=line?raw.slice(raw.indexOf(line)+line.length).trim().replace(/^(---|\.\.\.)\s*/,'').trim():'';
  const excerpt=rest||(headline.length>68?headline.slice(68).trim():'');
  return {title,excerpt};
 }
 function renderCards(box,items,etag,origin){
  box.replaceChildren();
  if(!items.length){
   box.append(el('p','clip-empty',origin==='recent'?
    '还没有摘录。保存网页或新建便签后会显示在这里。':
    data.total?'没有找到匹配的摘录':'还没有摘录。提取网页后点击「保存摘录」，以后都能从这里找回。'));
   return;
  }
  for(const x of items){
   const card=el('article','clip-note-card'),open=el('button','clip-note-open');
   const copy=cardCopy(x);
   open.type='button';open.setAttribute('aria-label','阅读 '+copy.title);
   const title=el('span','clip-note-title',copy.title);
   const stamp=Number.isFinite(Date.parse(x.updatedAt))?new Date(x.updatedAt).toLocaleDateString('zh-CN'):'';
   const meta=el('span','clip-note-meta',(x.kind==='note'?'便签':'网页')+(stamp?' · '+stamp:''));
   const excerpt=el('span','clip-note-excerpt',copy.excerpt);
   open.append(title,excerpt,meta);
   open.addEventListener('click',()=>void openReader(x.id,origin));
   const actions=el('div','clip-note-buttons');
   actions.append(
    action('pencil','编辑 '+(x.title||'摘录'),()=>void editCard(x.id,origin)),
    action('trash-2','删除 '+(x.title||'摘录'),()=>confirmRemove(x.id,etag,card,origin),'clip-danger')
   );
   card.append(open,actions);box.append(card);
  }
 }
 function renderList(){
  q('clip-note-count').textContent=data.matched===data.total?
   data.total+' 条 · '+(data.usedBytes/1048576).toFixed(2)+' / 4 MiB':
   '匹配 '+data.matched+' / '+data.total+' 条';
  renderCards(q('clip-note-list'),data.items,data.etag,'library');
  viewState();
 }
 async function reload({append=false,recover=false}={}){
  const seq=++generation,query=q('clip-search').value.trim(),kind=q('clip-kind-filter').value||'all';
  const offset=append?data.items.length:0;
  const result=recover?await store.recover(query,offset,kind):await store.list(query,offset,kind);
  if(seq!==generation)return false;
  if(append&&data.etag!==result.etag)return reload({recover:true});
  data={...result,items:append?[...data.items,...result.items]:result.items};
  renderList();return true;
 }
 async function reloadRecent({recover=false}={}){
  const seq=++recentGeneration;
  const result=recover?await store.recover('',0):await store.list('',0);
  if(seq!==recentGeneration)return false;
  recent=result;
  q('clip-recent-count').textContent=String(recent.total);
  q('clip-my-notes').textContent='我的摘录 · '+recent.total;
  renderCards(q('clip-recent-list'),recent.items.slice(0,4),recent.etag,'recent');
  q('clip-recent-retry').hidden=true;
  return true;
 }
 function showHome({allowBusy=false}={}){
  if((busy&&!allowBusy)||dirty())return statusError(fail('E_DIRTY','请先保存或取消当前编辑'));
  if(!q('clip-notes').hidden&&data.nextOffset!==undefined&&
     q('clip-notes').dataset.view==='list')libraryScroll=scrollNow();
  confirmHidden();reading=null;editing=null;editingSource=null;baseline='';
  q('clip-note-body').value='';q('clip-note-unsaved').hidden=true;
  q('clip-home').hidden=false;q('clip-notes').hidden=true;
  viewState();restoreScroll(recentScroll);
 }
 async function showLibrary(){
  if(busy||dirty()){msg('请先保存或取消当前编辑',true);return;}
  if(!q('clip-home').hidden)recentScroll=scrollNow();
  confirmHidden();reading=null;editing=null;editingSource=null;baseline='';
  q('clip-note-body').value='';q('clip-note-unsaved').hidden=true;
  q('clip-home').hidden=true;q('clip-notes').hidden=false;
  viewState();
  try{
   const fresh=await reload({recover:true});
   if(!fresh)throw fail('E_OUTCOME_UNKNOWN','页面已切换，请重新打开我的摘录');
   msg('摘录保存在当前 Chrome 浏览器中；卸载前请导出备份');
   restoreScroll(libraryScroll);return true;
  }catch(error){statusError(error,'读取失败：');return false;}
 }
 function showList(){
  confirmHidden();reading=null;editing=null;editingSource=null;baseline='';
  q('clip-note-body').value='';q('clip-note-unsaved').hidden=true;
  q('clip-home').hidden=true;q('clip-notes').hidden=false;
  viewState();restoreScroll(libraryScroll);
 }
 function renderReader(){
  if(!reading)return;
  const {item}=reading;
  q('clip-note-read-title').textContent=item.title||titleOf(item.body);
  q('clip-note-read-meta').textContent=new Date(item.updatedAt).toLocaleString('zh-CN')+
   ' · '+(item.kind==='clip'?'网页摘录':'便签');
  const origin=q('clip-note-read-origin');origin.replaceChildren();
  if(item.source){
   const a=el('a','',item.source);
   a.href=item.source;a.target='_blank';a.rel='noopener noreferrer';origin.append(a);
  }else origin.textContent='手动便签';
  const area=q('clip-note-read-body');area.replaceChildren();
  if(typeof renderMarkdown==='function')renderMarkdown(item.body,area);
  else area.textContent=item.body;
  q('clip-home').hidden=true;q('clip-notes').hidden=false;
  viewState();
 }
 async function openReader(id,origin='library'){
  if(busy||dirty())return msg('请先保存或取消当前编辑',true);
  confirmHidden();
  if(origin==='recent')recentScroll=scrollNow();else libraryScroll=scrollNow();
  const seq=++generation;
  try{
   const result=await store.get(id);
   if(seq!==generation)return;
   reading=result;readerOrigin=origin;editing=null;
   renderReader();msg('已读取完整正文');
   q('clip-reader-content').scrollTop=0;
   q('clip-note-reader-back').setAttribute('aria-label',origin==='recent'?'返回最近摘录':'返回摘录列表');
   q('clip-note-reader-back').title=origin==='recent'?'返回最近摘录':'返回摘录列表';
   restoreScroll(0);
   if(hostedNavigation)q('clip-note-read-body').focus({preventScroll:true});
   else q('clip-note-reader-back').focus();
  }catch(error){statusError(error,'读取失败：');}
 }
 function backReader(){
  if(busy)return msg('操作仍在进行中，请勿切换',true);
  if(readerOrigin==='recent')showHome();else showList();
 }
 function openEditor(item=null,source=null,origin='library'){
  if(busy||dirty())return msg('请先保存或取消当前编辑',true);
  confirmHidden();
  editorReturn=origin;editingSource=source;
  editing=item?{id:item.id,kind:item.kind}:{id:null,kind:'note'};
  baseline=item?.body||'';
  q('clip-note-editor-title').textContent=item?'编辑摘录':'新建便签';
  q('clip-note-body').value=baseline;
  q('clip-note-origin').textContent=item?.source?'来源：'+item.source:'手动便签不关联网页来源';
  q('clip-note-unsaved').hidden=true;
  reading=origin==='reader'?source:null;
  q('clip-home').hidden=true;q('clip-notes').hidden=false;
  viewState();restoreScroll(0);q('clip-note-body').focus();
 }
 async function editCard(id,origin){
  if(busy||dirty())return msg('请先保存或取消当前编辑',true);
  if(origin==='recent')recentScroll=scrollNow();else libraryScroll=scrollNow();
  const seq=++generation;
  try{
   const source=await store.get(id);
   if(seq!==generation)return;
   openEditor(source.item,source,origin);
  }catch(error){statusError(error,'读取失败：');}
 }
 function discardEditor(){
  const where=editorReturn,source=editingSource;
  editing=null;editingSource=null;baseline='';
  q('clip-note-body').value='';q('clip-note-unsaved').hidden=true;
  if(where==='reader'&&source){reading=source;renderReader();}
  else if(where==='recent')showHome({allowBusy:true});
  else showList();
 }
 function cancelEditor(){
  if(busy)return msg('保存仍在进行，请勿取消',true);
  if(dirty()){
   q('clip-note-unsaved').hidden=false;
   msg('正文尚未保存，可继续编辑或放弃修改',true);
   q('clip-note-continue').focus();
   return;
  }
  discardEditor();
 }
 async function saveEditor(){
  if(busy||!editing)return;
  const body=q('clip-note-body').value;
  const original=editing,previous=editingSource,where=editorReturn;
  busy=true;notify();
  try{
   const response=original.id?
    await store.edit(original.id,previous.etag,body):
    await store.save({kind:'note',body});
   editing=null;editingSource=null;baseline='';
   q('clip-note-body').value='';q('clip-note-unsaved').hidden=true;
   if(where==='reader'&&original.id){
    reading={item:response.item,etag:response.etag};renderReader();
   }else if(where==='recent')showHome({allowBusy:true});
   else showList();
   let refreshFailed=false;
   try{await reloadRecent();await reload({recover:true});}catch{refreshFailed=true;}
   msg(refreshFailed?'保存已逐字段读回，但列表刷新失败，请手动刷新核对':
    response.unchanged?'内容没有变化':'已保存完整正文',refreshFailed);
  }catch(error){
   const uncertain=store.uncertain;
   msg((uncertain?'写入结果未知，请先重新核对摘录：':'保存失败：')+String(error?.message||error),true);
   q('clip-recent-retry').hidden=!uncertain;
  }finally{busy=false;notify();}
 }
 function confirmRemove(id,etag,container,origin){
  if(busy||dirty())return msg('请先保存或取消当前编辑',true);
  confirmHidden();
  const panel=el('div','clip-remove-confirm');
  panel.setAttribute('role','group');panel.setAttribute('aria-label','确认删除摘录');
  const prompt=el('span','','删除后不能恢复，确定删除？');
  const cancel=el('button','','取消'),yes=el('button','confirm-danger','删除');
  cancel.type='button';yes.type='button';
  cancel.addEventListener('click',()=>{confirmHidden();});
  yes.addEventListener('click',()=>{confirmHidden();void removeItem(id,etag,origin);});
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();cancel.click();}});
  panel.append(prompt,cancel,yes);
  container.append(panel);pendingDelete={panel};cancel.focus();
 }
 async function removeItem(id,etag,origin){
  if(busy||dirty())return msg('请先保存或取消当前编辑',true);
  busy=true;notify();
  try{
   await store.remove(id,etag);
   reading=null;editing=null;editingSource=null;
   let refreshFailed=false;
   try{await reloadRecent();await reload({recover:true});}catch{refreshFailed=true;}
   if(origin==='recent')showHome({allowBusy:true});else showList();
   msg(refreshFailed?'已删除，但列表刷新失败，请手动刷新确认':'已删除摘录',refreshFailed);
  }catch(error){
   msg((store.uncertain?'删除结果未知，请刷新核对：':'删除未确认：')+String(error?.message||error),true);
   q('clip-recent-retry').hidden=!store.uncertain;
  }finally{busy=false;notify();}
 }
 async function copyItem(){
  if(!reading||busy)return;const content=reading.item.body;
  try{const result=await sdk.clipboard.writeText(content);
   if(result?.copied!==true)throw Error('复制未确认');msg('完整 Markdown 已复制');
  }catch(error){statusError(error,'复制失败：');}
 }
 async function downloadItem(){
  if(!reading||busy)return;const item=reading.item;
  try{const result=await sdk.downloads.text({filename:filename(item.title),text:item.body});
   if(result?.started!==true)throw Error('下载未确认');msg('已请求下载完整 Markdown');
  }catch(error){statusError(error,'下载失败：');}
 }
 async function saveClip(){
  if(!clip||busy||bytes(clip.body)>BODY_LIMIT)return;
  const wanted=Object.freeze({body:clip.body,title:clip.title,source:clip.source});
  busy=true;setClip(clip);notify();onSaveBusy?.(true);
  try{
   const result=await store.save({...wanted,kind:'clip'});
   let refreshed=false;
   try{refreshed=await reloadRecent();}catch{/* Already saved; must never report storage failure. */}
   if(!refreshed)q('clip-recent-retry').hidden=false;
   const label=!refreshed?'已读回确认保存，但最近列表刷新失败，请核对':
    result.duplicate?'这条全文已存在，没有重复保存':'摘录已保存，最近列表已更新';
   onStatus?.(label,!refreshed);
  }catch(error){
   const uncertain=store.uncertain;
   q('clip-recent-retry').hidden=!uncertain;
   onStatus?.((uncertain?'保存结果未知，请先重新核对：':'保存失败：')+
    String(error?.message||error),true);
  }finally{busy=false;setClip(clip);notify();onSaveBusy?.(false);}
 }
 q('clip-my-notes').addEventListener('click',()=>void showLibrary());
 q('clip-view-all').addEventListener('click',()=>void showLibrary());
 q('clip-notes-back').addEventListener('click',showHome);
 q('clip-recent-new').addEventListener('click',()=>{
  recentScroll=scrollNow();openEditor(null,null,'recent');
 });
 q('clip-note-new').addEventListener('click',()=>openEditor(null,null,'library'));
 q('clip-note-editor-back').addEventListener('click',cancelEditor);
 q('clip-note-cancel').addEventListener('click',cancelEditor);
 q('clip-note-continue').addEventListener('click',()=>{q('clip-note-unsaved').hidden=true;q('clip-note-body').focus();});
 q('clip-note-discard').addEventListener('click',discardEditor);
 q('clip-note-body').addEventListener('input',()=>{
  q('clip-note-unsaved').hidden=true;notify();
 });
 q('clip-search').addEventListener('input',()=>{
  clearTimeout(searchTimer);searchTimer=setTimeout(()=>{
   void reload().catch(e=>statusError(e,'搜索失败：'));
  },180);
 });
 q('clip-kind-filter').addEventListener('change',()=>void reload().catch(e=>statusError(e,'筛选失败：')));
 q('clip-note-reload').addEventListener('click',()=>void Promise.all([reload({recover:true}),reloadRecent()])
  .then(()=>msg('已重新读取摘录')).catch(e=>statusError(e,'刷新失败：')));
 q('clip-note-more').addEventListener('click',()=>void reload({append:true}).catch(e=>statusError(e,'加载失败：')));
 q('clip-note-reader-back').addEventListener('click',backReader);
 q('clip-note-read-edit').addEventListener('click',()=>{
  if(reading)openEditor(reading.item,reading,'reader');
 });
 q('clip-note-read-copy').addEventListener('click',()=>void copyItem());
 q('clip-note-read-download').addEventListener('click',()=>void downloadItem());
 q('clip-note-read-remove').addEventListener('click',()=>{
  if(reading)confirmRemove(reading.item.id,reading.etag,q('clip-note-reader'),readerOrigin);
 });
 q('clip-note-save').addEventListener('click',()=>void saveEditor());
 q('clip-save').addEventListener('click',()=>void saveClip());
 q('clip-recent-retry').addEventListener('click',()=>void reloadRecent({recover:true})
  .then(()=>{msg('已重新核对全部摘录，请检查是否存在目标记录');})
  .catch(e=>statusError(e,'核对失败：')));
 q('clip-note-backup').addEventListener('click',async()=>{
  if(busy||dirty())return msg('请先保存或取消编辑',true);
  busy=true;notify();
  try{const result=await store.backup();
   if(result?.started!==true)throw Error('备份未确认');
   msg('已请求导出 '+result.count+' 条摘录；请核对 Chrome 下载记录');
  }catch(error){statusError(error,'备份下载未确认：');}
  finally{busy=false;notify();}
 });
 root.addEventListener?.('opendesk-tool-navigation',event=>{
  const intent=event.detail?.action;
  if(intent==='back'){
   if(editing)cancelEditor();
   else if(reading)backReader();
   else if(!q('clip-notes').hidden)showHome();
  }else if(intent==='primary'){
   if(editing)void saveEditor();
   else if(reading)openEditor(reading.item,reading,'reader');
   else if(!q('clip-notes').hidden)openEditor(null,null,'library');
  }
 });
 root.addEventListener?.('keydown',event=>{
  if(event.key==='Escape'&&pendingDelete){event.preventDefault();confirmHidden();}
 });
 doc.addEventListener?.('pointerdown',event=>{
  if(pendingDelete&&!pendingDelete.panel.contains(event.target))confirmHidden();
 });
 publishNavigation();
 void reloadRecent().catch(error=>msg('读取最近摘录失败：'+String(error.message||error),true));
 setClip(null);
 return {setClip,saveClip,showLibrary};
}

g.OpenDeskClipNotes=Object.freeze({create,createStore,bytes,bodyLimitBytes:BODY_LIMIT,limitBytes:LIBRARY_LIMIT});
})(globalThis);
