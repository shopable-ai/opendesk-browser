(function(g){
'use strict';
// A single ETag-protected value stores records and ordering atomically.
const KEY='clips',LIMIT=8192,BODY_LIMIT=2048,MAX_NOTES=64;
const bytes=v=>new TextEncoder().encode(typeof v==='string'?v:JSON.stringify(v)).length;
const fail=(code,message)=>Object.assign(new Error(message),{code});
const stable=v=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const empty=()=>({version:1,items:[]});
const titleOf=body=>[...String(body).trim().replace(/^#{1,6}\s*/,'').split(/\r?\n/)[0]].slice(0,42).join('')||'新便签';
function sourceOf(raw,{preserveLegacy=false}={}){
 if(!raw)return '';
 if(typeof raw!=='string'||bytes(raw)>1200)throw fail('E_SOURCE','来源地址过长或无效');
 let u;try{u=new URL(raw);}catch{throw fail('E_SOURCE','网页来源地址无效');}
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password)
  throw fail('E_SOURCE','只能保存有效 HTTP(S) 网页来源');
 // Normalize at the final storage boundary, including manual/other SDK callers.
 // Old 1.1.0 records must still load byte-for-byte; do not silently migrate
 // historical URLs during read or reject an otherwise valid existing library.
 if(preserveLegacy)return u.href;
 u.hash='';
 for(const key of [...u.searchParams.keys()]){
  if(/^(?:access[_-]?token|id[_-]?token|token|auth(?:orization)?|jwt|api[_-]?key|session(?:[_-]?id)?|secret|password|credential|oauth[_-]?code)$/i.test(key))
   u.searchParams.delete(key);
 }
 return u.href.replace(/[()]/g,ch=>ch==='('?'%28':'%29');
}
function normalize(value){
 if(value==null)return empty();
 if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1||
    !Array.isArray(value.items)||value.items.length>MAX_NOTES||bytes(value)>LIMIT)
   throw fail('E_STORAGE_CORRUPT','本地摘录数据无效；不会覆盖已有记录');
 const seen=new Set(),items=[];
 for(const x of value.items){
  if(!x||typeof x!=='object'||Array.isArray(x)||
     typeof x.id!=='string'||!/^clip-[a-z0-9-]{8,90}$/.test(x.id)||seen.has(x.id)||
     !['note','clip'].includes(x.kind)||typeof x.body!=='string'||!x.body.trim()||bytes(x.body)>BODY_LIMIT||
     typeof x.title!=='string'||bytes(x.title)>400||typeof x.source!=='string'||bytes(x.source)>1200||
     (x.kind==='note'&&x.source!=='')||
     typeof x.createdAt!=='string'||!Number.isFinite(Date.parse(x.createdAt))||
     typeof x.updatedAt!=='string'||!Number.isFinite(Date.parse(x.updatedAt))||
     (x.source&&sourceOf(x.source,{preserveLegacy:true})!==x.source))
    throw fail('E_STORAGE_CORRUPT','发现无效的旧摘录；不会覆盖已有记录');
  seen.add(x.id);
  items.push({id:x.id,kind:x.kind,body:x.body,title:x.title,source:x.source,
    createdAt:x.createdAt,updatedAt:x.updatedAt});
 }
 return {version:1,items};
}
function createStore({request,now=()=>new Date().toISOString(),
 newId=()=> 'clip-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12)}){
 let busy=false,uncertain=false;
 async function read(){
  const reply=await request('storage.get',{key:KEY,withEtag:true});
  if(!reply||!Object.hasOwn(reply,'value')||!/^[a-f0-9]{64}$/.test(reply.etag||''))
   throw fail('E_STORAGE_READ','本地存储未返回可信版本');
  return {data:normalize(reply.value),etag:reply.etag};
 }
 async function mutate(transform){
  if(busy)throw fail('E_BUSY','正在保存，请勿重复操作');
  if(uncertain)throw fail('E_OUTCOME_UNKNOWN','上次写入结果未确认，请先重新读取我的摘录');
  busy=true;
  try{
   for(let i=0;i<3;i++){
    const before=await read(),change=transform(before.data);
    if(!change.next)return change.result;
    if(bytes(change.next)>LIMIT)throw fail('E_QUOTA','摘录空间已满，请先备份或删除旧内容；不会截断正文');
    const next=normalize(change.next);
    if(bytes(next)>LIMIT)throw fail('E_QUOTA','摘录空间已满，请先备份或删除旧内容；不会截断正文');
    let problem=null;
    try{
     const reply=await request('storage.set',{key:KEY,value:next,ifMatch:before.etag});
     if(reply?.saved!==true||!/^[a-f0-9]{64}$/.test(reply.etag||''))
      throw fail('E_OUTCOME_UNKNOWN','保存回执不完整');
    }catch(error){problem=error;}
    if(problem?.code==='E_STORAGE_CONFLICT'&&i<2)continue;
    let checked=null;
    try{checked=await read();}catch{/* No read means unknown, never claim success. */}
    if(checked&&stable(checked.data)===stable(next))return change.result;
    if(problem?.code==='E_STORAGE_CONFLICT')throw fail('E_STORAGE_CONFLICT','其他窗口已修改摘录，请重新读取');
    if(['E_LIMIT','E_TOOL_DATA_LIMIT','E_HOST_STORAGE_QUOTA'].includes(problem?.code))
     throw fail('E_QUOTA','存储空间不足，请备份或删除旧内容');
    // The existing verified Host emits E_HOST_STORAGE_WRITE only after it
    // re-reads an unchanged previous value. A verified no-write is retryable.
    if(problem?.code==='E_HOST_STORAGE_WRITE'&&checked&&
       stable(checked.data)===stable(before.data))
     throw fail('E_STORAGE_WRITE','保存失败，已确认旧数据未变化；可以重试');
    uncertain=true;
    throw fail('E_OUTCOME_UNKNOWN','保存结果尚未确认，请重新读取核对后再操作');
   }
   throw fail('E_STORAGE_CONFLICT','其他窗口正在修改，请重新读取');
  }finally{busy=false;}
 }
 function candidate(input){
  if(typeof input?.body!=='string'||!input.body.trim())throw fail('E_EMPTY','请输入要保存的文字');
  if(bytes(input.body)>BODY_LIMIT)throw fail('E_BODY_LIMIT','短摘录最多 2 KB；完整文章请下载 .md，不会截断');
  const kind=input.kind==='note'?'note':'clip',source=kind==='note'?'':sourceOf(input.source);
  if(kind==='clip'&&!source)throw fail('E_SOURCE','没有可信的网页来源');
  const title=typeof input.title==='string'&&input.title.trim()
   ?[...input.title.trim()].slice(0,70).join(''):titleOf(input.body);
  return {kind,body:input.body,title,source};
 }
 async function save(input){
  const wanted=candidate(input),id=newId(),at=now();
  return mutate(data=>{
   const duplicate=data.items.find(x=>wanted.kind==='clip'&&x.kind==='clip'&&
      x.source===wanted.source&&x.body.trim()===wanted.body.trim());
   if(duplicate)return {next:null,result:{item:duplicate,duplicate:true}};
   if(data.items.length>=MAX_NOTES)throw fail('E_QUOTA','已达到短摘录数量上限，请先备份或删除旧内容');
   if(data.items.some(x=>x.id===id))throw fail('E_ID','新记录标识重复，请重试');
   const item={id,...wanted,createdAt:at,updatedAt:at};
   return {next:{version:1,items:[...data.items,item]},result:{item,duplicate:false}};
  });
 }
 async function edit(id,baseline,body){
  if(typeof body!=='string'||!body.trim())throw fail('E_EMPTY','正文不能为空');
  if(bytes(body)>BODY_LIMIT)throw fail('E_BODY_LIMIT','正文最多 2 KB，不会自动截断');
  const at=now();
  return mutate(data=>{
   const old=data.items.find(x=>x.id===id);
   if(!old)throw fail('E_NOT_FOUND','摘录已删除，请重新读取');
   if(stable(old)!==stable(baseline))throw fail('E_STORAGE_CONFLICT','其他窗口已修改这条摘录；没有覆盖新数据');
   if(old.body===body)return {next:null,result:{item:old,unchanged:true}};
   const item={...old,body,title:old.kind==='note'?titleOf(body):old.title,updatedAt:at};
   return {next:{version:1,items:data.items.map(x=>x.id===id?item:x)},result:{item,unchanged:false}};
  });
 }
 async function remove(id,baseline=null){
  return mutate(data=>{
   const current=data.items.find(x=>x.id===id);
   if(!current)return {next:null,result:{removed:false}};
   // A one-click delete must not remove a newer edit made in another panel.
   if(baseline&&stable(current)!==stable(baseline))
    throw fail('E_STORAGE_CONFLICT','另一窗口已经修改这条摘录，请刷新后再删除');
   return {next:{version:1,items:data.items.filter(x=>x.id!==id)},result:{removed:true}};
  });
 }
 async function recover(){const value=await read();uncertain=false;return value;}
 return {read,recover,save,edit,remove,get uncertain(){return uncertain;}};
}
function create({root,request,sdk,onStatus}){
 const q=id=>root.querySelector('#'+id),doc=root.ownerDocument||document;
 const el=(tag,cls,text)=>{const n=doc.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const store=createStore({request});
 let data=empty(),clip=null,editing=null,baseline='',busy=false,selected=null;
 const msg=(text,error=false)=>{q('clip-notes-status').textContent=text;q('clip-notes-status').dataset.error=String(error);};
 const dirty=()=>editing!==null&&q('clip-note-body').value!==baseline;
 const notify=()=>g.OpenDeskTool?.setState?.({dirty:dirty(),busy});
 async function reload(recover=false){
  const result=recover?await store.recover():await store.read();
  data=result.data;render();return result;
 }
 function setClip(next){
  if(clip?.source!==next?.source||clip?.body!==next?.body)selected=null;
  clip=next;
  const long=next&&bytes(next.body)>BODY_LIMIT;
  q('clip-save').disabled=!next||Boolean(long);
  q('clip-save').title=long?'超过 2 KB：请下载完整 Markdown':'将短摘录保存到浏览器本地';
  q('clip-save-explain').textContent=long?'内容超过短摘录上限，请使用「下载 .md」':'保存留在浏览器；复制进入剪贴板；下载生成文件';
  q('clip-view-saved').hidden=!selected;
 }
 function render(){
  const box=q('clip-note-list'),needle=q('clip-search').value.trim().toLocaleLowerCase();
  box.replaceChildren();
  const filtered=data.items.slice().reverse().filter(x=>[x.title,x.body,x.source]
    .some(s=>s.toLocaleLowerCase().includes(needle)));
  q('clip-note-count').textContent=data.items.length+' 条已保存';
  if(!filtered.length)box.append(el('p','clip-empty',data.items.length?'没有找到匹配的内容':'还没有摘录。可以新建便签，或在网页选中文字后保存。'));
  for(const x of filtered){
   const card=el('article','clip-note-card'),open=el('button','clip-note-open',x.title||titleOf(x.body));
   open.type='button';open.setAttribute('aria-label','打开 '+(x.title||'摘录'));
   open.addEventListener('click',()=>openEditor(x));
   const stamp=new Date(x.updatedAt).toLocaleString('zh-CN');
   const meta=el('div','clip-note-meta',(x.source?new URL(x.source).hostname:'便签')+' · '+stamp);
   const body=el('p','clip-note-excerpt',x.body),actions=el('div','clip-note-buttons');
   const copy=el('button','','复制'),remove=el('button','','删除');
   copy.type=remove.type='button';copy.setAttribute('aria-label','复制这条摘录');
   remove.setAttribute('aria-label','删除这条摘录');
   copy.addEventListener('click',async()=>{
    try{const result=await sdk.clipboard.writeText(x.body);
     if(result?.copied!==true)throw Error('复制未确认');msg('已复制');
    }catch(e){msg('复制未确认：'+String(e.message||e),true);}
   });
   remove.addEventListener('click',async()=>{
    if(busy)return;
    if(editing?.id===x.id&&dirty())return msg('请先保存或取消正在编辑的内容',true);
    busy=true;notify();
    try{await store.remove(x.id,x);if(editing?.id===x.id)closeEditor();
     await reload();msg('已删除摘录');}
    catch(e){msg(e.message||'删除结果未确认，请重新读取',true);}
    finally{busy=false;notify();}
   });
   actions.append(copy,remove);card.append(open,meta,body,actions);box.append(card);
  }
 }
 function openEditor(item=null){
  if(dirty())return msg('请先保存或取消当前编辑',true);
  editing=item?{...item}:{id:null,kind:'note',body:'',title:'',source:''};
  baseline=item?.body||'';
  q('clip-note-editor').hidden=false;
  q('clip-note-editor-title').textContent=item?'查看 / 修改摘录':'新建便签';
  q('clip-note-body').value=baseline;
  const origin=q('clip-note-origin');origin.replaceChildren();
  if(item?.source){const a=el('a','',item.source);a.href=item.source;a.target='_blank';a.rel='noopener noreferrer';origin.append(a);}
  else origin.textContent='手动便签不关联网页来源';
  q('clip-note-body').focus();notify();
 }
 function closeEditor(){editing=null;baseline='';q('clip-note-editor').hidden=true;q('clip-note-body').value='';notify();}
 async function showLibrary(id=null){
  if(dirty())return msg('请先保存或取消当前编辑',true);
  q('clip-home').hidden=true;q('clip-notes').hidden=false;
  try{await reload(true);msg('数据仅在本机浏览器保存；卸载前请导出备份');
   if(id){const found=data.items.find(x=>x.id===id);if(found)openEditor(found);}}
  catch(e){msg('读取失败：'+String(e.message||e),true);}
 }
 async function saveClip(){
  if(!clip||busy)return;
  busy=true;q('clip-save').disabled=true;notify();
  try{const result=await store.save({...clip,kind:'clip'});
   selected=result.item.id;await reload();
   onStatus(result.duplicate?'已保存过这段文字，没有重复创建':'已保存到「我的摘录」');
  }catch(e){onStatus(e.message||'保存结果未确认',true);}
  finally{busy=false;setClip(clip);notify();}
 }
 q('clip-my-notes').addEventListener('click',()=>showLibrary());
 q('clip-view-saved').addEventListener('click',()=>showLibrary(selected));
 q('clip-notes-back').addEventListener('click',()=>{
  if(dirty())return msg('请先保存或取消修改',true);
  q('clip-notes').hidden=true;q('clip-home').hidden=false;
 });
 q('clip-note-new').addEventListener('click',()=>openEditor());
 q('clip-note-cancel').addEventListener('click',closeEditor);
 q('clip-note-body').addEventListener('input',notify);
 q('clip-search').addEventListener('input',render);
 q('clip-note-reload').addEventListener('click',async()=>{
  if(dirty())return msg('请先保存或取消修改',true);
  try{await reload(true);msg('已重新读取本地摘录');}
  catch(e){msg('读取失败：'+String(e.message||e),true);}
 });
 q('clip-note-save').addEventListener('click',async()=>{
  if(busy||!editing)return;
  const body=q('clip-note-body').value,original=editing;
  busy=true;notify();
  try{const result=original.id?await store.edit(original.id,original,body):
    await store.save({body,kind:'note'});
   await reload();closeEditor();msg(result.unchanged?'内容没有变化':'已保存');}
  catch(e){msg(e.message||'保存结果未确认',true);}
  finally{busy=false;notify();}
 });
 q('clip-save').addEventListener('click',saveClip);
 q('clip-note-backup').addEventListener('click',async()=>{
  if(busy)return;
  if(dirty())return msg('请先保存或取消当前编辑，然后再备份',true);
  busy=true;notify();
  try{
   await reload(true); // Include other windows' latest confirmed records.
   const text=JSON.stringify({format:'opendesk.clipper-notes.backup.v1',
    exportedAt:new Date().toISOString(),items:data.items},null,2)+'\n';
   const result=await sdk.downloads.text({filename:'web-clipper-notes.json',text});
   if(result?.started!==true)throw Error('下载未确认');
   msg('已请求备份下载，请检查 Chrome 下载记录');
  }catch(e){msg('备份下载未确认：'+String(e.message||e),true);}
  finally{busy=false;notify();}
 });
 void reload().catch(e=>msg('读取本地摘录失败：'+String(e.message||e),true));
 setClip(null);
 return {setClip,saveClip,showLibrary};
}
g.OpenDeskClipNotes=Object.freeze({create,createStore,normalize,bytes,limitBytes:LIMIT,bodyLimitBytes:BODY_LIMIT});
})(globalThis);
