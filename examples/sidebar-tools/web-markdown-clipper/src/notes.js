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
 const list=(query='',offset=0)=>command('list',{query,offset});
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
 async function recover(query='',offset=0){const result=await list(query,offset);uncertain=false;return result;}
 const backup=()=>guard(()=>command('backup',{}));
 return {list,get,save,edit,remove,recover,backup,get uncertain(){return uncertain;}};
}
function create({root,request,sdk,onStatus,renderMarkdown}){
 const q=id=>root.querySelector('#'+id),doc=root.ownerDocument||document;
 const el=(tag,cls,text)=>{const node=doc.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
 const store=createStore({request});
 let data={items:[],total:0,usedBytes:0,etag:null,nextOffset:null};
 let clip=null,reading=null,editing=null,editingSource=null,baseline='',busy=false;
 let generation=0,searchTimer=null;
 const msg=(text,error=false)=>{q('clip-notes-status').textContent=text;q('clip-notes-status').dataset.error=String(error);};
 const dirty=()=>editing!==null&&q('clip-note-body').value!==baseline;
 const notify=()=>g.OpenDeskTool?.setState?.({dirty:dirty(),busy});
 const statusError=(error,prefix='')=>msg(prefix+String(error?.message||error),true);
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
  q('clip-note-list').hidden=!list;
  q('clip-notes-tools').hidden=!list;
  q('clip-notes-meta').hidden=!list;
  q('clip-note-more').hidden=!list||data.nextOffset===null;
  q('clip-note-reader').hidden=!reading||Boolean(editing);
  q('clip-note-editor').hidden=!editing;
  q('clip-note-new').hidden=!list;
  notify();
 }
 function renderList(){
  const box=q('clip-note-list');box.replaceChildren();
  q('clip-my-notes').textContent='我的摘录 · '+data.total;
  q('clip-note-count').textContent=data.total+' 条 · '+(data.usedBytes/1048576).toFixed(2)+' / 4 MiB';
  if(!data.items.length)box.append(el('p','clip-empty',data.total?'没有找到匹配的摘录':'还没有摘录。提取网页后点击「保存摘录」，以后都能从这里找回。'));
  for(const x of data.items){
   const card=el('article','clip-note-card');
   const open=el('button','clip-note-open',x.title||titleOf(x.excerpt));
   open.type='button';open.setAttribute('aria-label','阅读 '+(x.title||'摘录'));
   open.addEventListener('click',()=>void openReader(x.id));
   const stamp=new Date(x.updatedAt).toLocaleString('zh-CN');
   const meta=el('div','clip-note-meta',(x.source?new URL(x.source).hostname:'便签')+' · '+stamp);
   const excerpt=el('p','clip-note-excerpt',x.excerpt);
   const actions=el('div','clip-note-buttons'),remove=el('button','','删除');
   remove.type='button';remove.setAttribute('aria-label','删除 '+(x.title||'摘录'));
   remove.addEventListener('click',()=>void removeItem(x.id,data.etag));
   actions.append(remove);card.append(open,meta,excerpt,actions);box.append(card);
  }
  viewState();
 }
 async function reload({append=false,recover=false}={}){
  const seq=++generation,query=q('clip-search').value.trim();
  const offset=append?data.items.length:0;
  const result=recover?await store.recover(query,offset):await store.list(query,offset);
  if(seq!==generation)return false;
  if(append&&data.etag!==result.etag)return reload({recover:true});
  data={...result,items:append?[...data.items,...result.items]:result.items};
  renderList();return true;
 }
 function closeReading(){reading=null;editing=null;editingSource=null;baseline='';q('clip-note-body').value='';viewState();}
 function renderReader(){
  if(!reading)return;
  const {item}=reading;
  q('clip-note-read-title').textContent=item.title||titleOf(item.body);
  q('clip-note-read-meta').textContent=new Date(item.updatedAt).toLocaleString('zh-CN')+
   ' · '+(item.kind==='clip'?'网页摘录':'便签');
  const origin=q('clip-note-read-origin');origin.replaceChildren();
  if(item.source){
   const a=el('a','',item.source);a.href=item.source;a.target='_blank';a.rel='noopener noreferrer';origin.append(a);
  }else origin.textContent='手动便签';
  const area=q('clip-note-read-body');area.replaceChildren();
  if(typeof renderMarkdown==='function')renderMarkdown(item.body,area);
  else area.textContent=item.body;
  viewState();
 }
 async function openReader(id){
  if(busy||dirty())return msg('请先保存或取消当前编辑',true);
  const seq=++generation;
  try{
   const result=await store.get(id);
   if(seq!==generation)return;
   reading=result;editing=null;renderReader();msg('已读取完整正文');
   q('clip-note-reader-back').focus();
  }catch(error){statusError(error,'读取失败：');}
 }
 function openEditor(item=null){
  if(busy||dirty())return msg('请先保存或取消当前编辑',true);
  editingSource=reading;
  editing=item?{id:item.id,kind:item.kind}:{id:null,kind:'note'};
  baseline=item?.body||'';
  q('clip-note-editor-title').textContent=item?'编辑摘录':'新建便签';
  q('clip-note-body').value=baseline;
  q('clip-note-origin').textContent=item?.source?'来源：'+item.source:'手动便签不关联网页来源';
  if(!item)reading=null;
  viewState();q('clip-note-body').focus();
 }
 function cancelEditor(){
  editing=null;baseline='';q('clip-note-body').value='';
  reading=editingSource;editingSource=null;
  if(reading)renderReader();else viewState();
 }
 async function showLibrary(){
  if(dirty())return msg('请先保存或取消当前编辑',true);
  closeReading();q('clip-home').hidden=true;q('clip-notes').hidden=false;
  try{
   const fresh=await reload({recover:true});
   if(!fresh)throw fail('E_OUTCOME_UNKNOWN','页面已切换，请重新打开我的摘录');
   msg('摘录保存在当前 Chrome 浏览器中；卸载前请导出备份');
   return true;
  }catch(error){statusError(error,'读取失败：');return false;}
 }
 async function saveClip(){
  if(!clip||busy||bytes(clip.body)>BODY_LIMIT)return;
  busy=true;setClip(clip);notify();
  const wanted=clip;
  try{
   const result=await store.save({...wanted,kind:'clip'});
   // Keep the clipper home for recovery if the subsequent library read fails.
   if(!await showLibrary())throw fail('E_STORAGE_READ','保存已确认，但列表加载失败；请重新打开我的摘录核对');
   const label=result.duplicate?'已保存过此全文，没有重复创建':'完整文章已保存到「我的摘录」';
   msg(label);onStatus(label);
  }catch(error){onStatus(error.message||'保存结果未确认',true);}
  finally{busy=false;setClip(clip);notify();}
 }
 async function removeItem(id,etag){
  if(busy||dirty())return msg('请先保存或取消正在编辑的内容',true);
  busy=true;notify();
  try{await store.remove(id,etag);closeReading();await reload({recover:true});msg('已删除摘录');}
  catch(error){statusError(error,'删除未确认：');}
  finally{busy=false;notify();}
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
 q('clip-my-notes').addEventListener('click',()=>void showLibrary());
 q('clip-notes-back').addEventListener('click',()=>{
  if(busy||dirty())return msg('请先保存或取消当前编辑',true);
  closeReading();q('clip-notes').hidden=true;q('clip-home').hidden=false;
 });
 q('clip-note-new').addEventListener('click',()=>openEditor());
 q('clip-note-cancel').addEventListener('click',cancelEditor);
 q('clip-note-body').addEventListener('input',notify);
 q('clip-search').addEventListener('input',()=>{
  clearTimeout(searchTimer);searchTimer=setTimeout(()=>void reload().catch(e=>statusError(e,'搜索失败：')),180);
 });
 q('clip-note-reload').addEventListener('click',()=>void reload({recover:true}).then(()=>msg('已重新读取摘录')).catch(e=>statusError(e,'刷新失败：')));
 q('clip-note-more').addEventListener('click',()=>void reload({append:true}).catch(e=>statusError(e,'加载失败：')));
 q('clip-note-reader-back').addEventListener('click',()=>{closeReading();void reload().catch(e=>statusError(e,'刷新失败：'));});
 q('clip-note-read-edit').addEventListener('click',()=>{if(reading)openEditor(reading.item);});
 q('clip-note-read-copy').addEventListener('click',()=>void copyItem());
 q('clip-note-read-download').addEventListener('click',()=>void downloadItem());
 q('clip-note-read-remove').addEventListener('click',()=>{if(reading)void removeItem(reading.item.id,reading.etag);});
 q('clip-note-save').addEventListener('click',async()=>{
  if(busy||!editing)return;
  const body=q('clip-note-body').value,original=editing,previous=editingSource;
  busy=true;notify();
  try{
   const response=original.id?await store.edit(original.id,previous.etag,body):
    await store.save({kind:'note',body});
   cancelEditor();
   if(original.id){reading={item:response.item,etag:response.etag};renderReader();}
   await reload({recover:true});msg(response.unchanged?'内容没有变化':'已保存完整正文');
  }catch(error){statusError(error,'保存失败：');}
  finally{busy=false;notify();}
 });
 q('clip-save').addEventListener('click',()=>void saveClip());
 q('clip-note-backup').addEventListener('click',async()=>{
  if(busy||dirty())return msg('请先保存或取消编辑',true);
  busy=true;notify();
  try{const result=await store.backup();
   if(result?.started!==true)throw Error('备份未确认');
   msg('已请求导出 '+result.count+' 条摘录；请核对 Chrome 下载记录');
  }catch(error){statusError(error,'备份下载未确认：');}
  finally{busy=false;notify();}
 });
 void reload().catch(error=>msg('读取摘录失败：'+String(error.message||error),true));
 setClip(null);
 return {setClip,saveClip,showLibrary};
}
g.OpenDeskClipNotes=Object.freeze({create,createStore,bytes,bodyLimitBytes:BODY_LIMIT,limitBytes:LIBRARY_LIMIT});
})(globalThis);
