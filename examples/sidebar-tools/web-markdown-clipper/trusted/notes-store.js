import {sidebarToolStorageKey} from '../../../../src/ui/sidebar-tools/package.js';
import {writeVerifiedLocalValue} from '../../../../src/ui/sidebar-tools/storage-state.js';

// Same installed-tool namespace and existing "clips" value as 1.1.4.
// No cross-tool read, migration reset, or generic SDK quota relaxation.
export const CLIP_NOTES_OPERATIONS=Object.freeze([
  'clipNotes.list','clipNotes.get','clipNotes.save','clipNotes.edit','clipNotes.remove','clipNotes.backup'
]);
export const CLIP_NOTES_LIMITS=Object.freeze({
  bodyBytes:160000,totalBytes:4*1024*1024,maxNotes:1000
});
const encoder=new TextEncoder();
const bytes=value=>encoder.encode(typeof value==='string'?value:JSON.stringify(value)).byteLength;
const error=(code,message)=>Object.assign(new Error(message),{code});
const empty=()=>({version:1,items:[]});
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const titleOf=body=>[...String(body).trim().replace(/^#{1,6}\s*/,'').split(/\r?\n/)[0]]
  .slice(0,42).join('')||'新便签';
const idValid=id=>typeof id==='string'&&/^clip-[a-z0-9-]{8,90}$/.test(id);
export function clipSource(raw,{legacy=false}={}){
 if(!raw)return '';
 if(typeof raw!=='string'||bytes(raw)>1200)throw error('E_SOURCE','来源地址过长或无效');
 let u;try{u=new URL(raw);}catch{throw error('E_SOURCE','网页来源地址无效');}
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password)
  throw error('E_SOURCE','只能保存有效 HTTP(S) 网页来源');
 if(legacy)return u.href;
 u.hash='';
 for(const key of [...u.searchParams.keys()])
  if(/^(?:access[_-]?token|id[_-]?token|token|auth(?:orization)?|jwt|api[_-]?key|session(?:[_-]?id)?|secret|password|credential|oauth[_-]?code)$/i.test(key))
   u.searchParams.delete(key);
 return u.href.replace(/[()]/g,ch=>ch==='('?'%28':'%29');
}
export function readClipLibrary(value){
 if(value==null)return empty();
 if(!plain(value)||value.version!==1||!Array.isArray(value.items)||
    value.items.length>CLIP_NOTES_LIMITS.maxNotes||bytes(value)>CLIP_NOTES_LIMITS.totalBytes)
  throw error('E_STORAGE_CORRUPT','摘录数据异常，已停止写入以保护已有资料');
 const ids=new Set();
 const items=value.items.map(row=>{
  if(!plain(row)||!idValid(row.id)||ids.has(row.id)||
     !['note','clip'].includes(row.kind)||typeof row.body!=='string'||!row.body.trim()||
     bytes(row.body)>CLIP_NOTES_LIMITS.bodyBytes||
     typeof row.title!=='string'||bytes(row.title)>400||
     typeof row.source!=='string'||bytes(row.source)>1200||
     (row.kind==='note'&&row.source!=='')||
     typeof row.createdAt!=='string'||!Number.isFinite(Date.parse(row.createdAt))||
     typeof row.updatedAt!=='string'||!Number.isFinite(Date.parse(row.updatedAt))||
     (row.source&&clipSource(row.source,{legacy:true})!==row.source))
    throw error('E_STORAGE_CORRUPT','发现异常旧摘录，不会覆盖原有数据');
  ids.add(row.id);
  return {id:row.id,kind:row.kind,body:row.body,title:row.title,source:row.source,
   createdAt:row.createdAt,updatedAt:row.updatedAt};
 });
 return {version:1,items};
}
function candidate(payload){
 if(!plain(payload)||typeof payload.body!=='string'||!payload.body.trim())
  throw error('E_EMPTY','请输入要保存的 Markdown 正文');
 if(bytes(payload.body)>CLIP_NOTES_LIMITS.bodyBytes)
  throw error('E_BODY_LIMIT','单条正文最多 160,000 字节，请下载原文或拆分保存；不会截断');
 const kind=payload.kind==='note'?'note':'clip';
 const source=kind==='note'?'':clipSource(payload.source);
 if(kind==='clip'&&!source)throw error('E_SOURCE','没有可信网页来源，未保存');
 const title=typeof payload.title==='string'&&payload.title.trim()
  ?[...payload.title.trim()].slice(0,70).join(''):titleOf(payload.body);
 if(bytes(title)>400)throw error('E_TITLE','标题过长');
 return {kind,body:payload.body,title,source};
}
const summary=row=>({id:row.id,kind:row.kind,title:row.title,source:row.source,
 createdAt:row.createdAt,updatedAt:row.updatedAt,excerpt:row.body.slice(0,180),
 bodyBytes:bytes(row.body)});
function payloadOnly(value,keys){
 return plain(value)&&Object.keys(value).every(key=>keys.includes(key));
}
const checkId=id=>{if(!idValid(id))throw error('E_SCHEMA','摘录标识无效');return id;};
const checkMatch=async (etagFor,library,etag)=>{
 if(typeof etag!=='string'||!/^[a-f0-9]{64}$/.test(etag))
  throw error('E_SCHEMA','缺少经过校验的摘录版本');
 if(etag!==await etagFor(library))
  throw error('E_STORAGE_CONFLICT','摘录已在其他窗口更改，请刷新确认；原数据没有被覆盖');
};
export async function executeClipNotes({
 api,operation,toolId,payload={},authorize,etagFor,
 now=()=>new Date().toISOString(),newId=()=> 'clip-'+globalThis.crypto.randomUUID()
}={}){
 if(toolId!=='web-markdown-clipper'||!CLIP_NOTES_OPERATIONS.includes(operation)||
    typeof authorize!=='function'||typeof etagFor!=='function'||
    typeof api?.storage?.local?.get!=='function'||typeof api?.storage?.local?.set!=='function')
  throw error('E_TOOL_CONTEXT','只有已安装网页剪藏可以读取自己的摘录');
 const name=operation.slice('clipNotes.'.length);
 const fields={list:['query','offset'],get:['id'],save:['kind','body','title','source'],
  edit:['id','body','ifMatch'],remove:['id','ifMatch'],backup:[]};
 if(!payloadOnly(payload,fields[name]))throw error('E_SCHEMA','摘录请求字段无效');
 await authorize();
 const namespace=sidebarToolStorageKey(toolId);
 const stored=(await api.storage.local.get(namespace))[namespace]??{};
 if(!plain(stored))throw error('E_STORAGE_CORRUPT','工具数据异常，禁止覆盖');
 const library=readClipLibrary(stored.clips);
 await authorize();
 if(name==='list'){
  const query=payload.query??'',offset=payload.offset??0;
  if(typeof query!=='string'||query.length>100||!Number.isInteger(offset)||offset<0||offset>CLIP_NOTES_LIMITS.maxNotes)
   throw error('E_SCHEMA','搜索条件无效');
  const words=query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches=library.items.filter(row=>words.every(word=>
   [row.title,row.source,row.body].some(text=>text.toLocaleLowerCase().includes(word))))
   .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||b.createdAt.localeCompare(a.createdAt));
  const page=matches.slice(offset,offset+50);
  return {items:page.map(summary),total:library.items.length,matched:matches.length,
   nextOffset:offset+page.length<matches.length?offset+page.length:null,
   usedBytes:bytes(library),limits:CLIP_NOTES_LIMITS,etag:await etagFor(library)};
 }
 if(name==='get'){
  const row=library.items.find(item=>item.id===checkId(payload.id));
  if(!row)throw error('E_NOT_FOUND','摘录不存在，请刷新列表');
  return {item:row,etag:await etagFor(library)};
 }
 if(name==='backup'){
  const data=JSON.stringify({format:'opendesk.clipper-notes.backup.v1',
   exportedAt:now(),items:library.items},null,2)+'\n';
  const url='data:application/json;charset=utf-8,'+encodeURIComponent(data);
  await authorize();
  const downloadId=await api.downloads.download({
   url,filename:'web-clipper-notes.json',saveAs:true,conflictAction:'uniquify'
  });
  if(!Number.isInteger(downloadId))throw error('E_OUTCOME_UNKNOWN','备份下载未确认，请核对 Chrome 下载记录');
  try{await authorize();}catch{
   throw error('E_OUTCOME_UNKNOWN','备份可能已开始下载，请检查 Chrome 下载记录');
  }
  return {started:true,count:library.items.length};
 }
 let next,result;
 if(name==='save'){
  const wanted=candidate(payload);
  const duplicate=library.items.find(row=>wanted.kind==='clip'&&row.kind==='clip'&&
   row.source===wanted.source&&row.body===wanted.body);
  if(duplicate)return {id:duplicate.id,duplicate:true};
  if(library.items.length>=CLIP_NOTES_LIMITS.maxNotes)
   throw error('E_QUOTA','已达到 1000 条摘录上限，请先导出备份并整理');
  const id=newId(),at=now();
  if(!idValid(id)||library.items.some(row=>row.id===id))
   throw error('E_ID','新摘录标识冲突，请重试');
  const item={id,...wanted,createdAt:at,updatedAt:at};
  next={version:1,items:[...library.items,item]};
  result={id,duplicate:false};
 }else if(name==='edit'){
  const id=checkId(payload.id);
  await checkMatch(etagFor,library,payload.ifMatch);
  const old=library.items.find(row=>row.id===id);
  if(!old)throw error('E_NOT_FOUND','摘录已不存在');
  if(typeof payload.body!=='string'||!payload.body.trim())
   throw error('E_EMPTY','正文不能为空');
  if(bytes(payload.body)>CLIP_NOTES_LIMITS.bodyBytes)
   throw error('E_BODY_LIMIT','正文超过 160,000 字节，未截断或覆盖');
  if(old.body===payload.body)return {id,unchanged:true};
  const changed={...old,body:payload.body,updatedAt:now(),
   title:old.kind==='note'?titleOf(payload.body):old.title};
  next={version:1,items:library.items.map(row=>row.id===id?changed:row)};
  result={id,unchanged:false};
 }else{
  const id=checkId(payload.id);
  await checkMatch(etagFor,library,payload.ifMatch);
  if(!library.items.some(row=>row.id===id))throw error('E_NOT_FOUND','摘录已不存在');
  next={version:1,items:library.items.filter(row=>row.id!==id)};
  result={id,removed:true};
 }
 if(bytes(next)>CLIP_NOTES_LIMITS.totalBytes)
  throw error('E_QUOTA','我的摘录已达到 4 MiB 本地容量，请先导出备份再整理；正文未截断');
 await authorize();
 await writeVerifiedLocalValue(api,namespace,{...stored,clips:next},stored,'网页剪藏全文');
 try{await authorize();}catch{
  throw error('E_OUTCOME_UNKNOWN','摘录已写入，但当前工具授权发生变化；请重新打开核对结果');
 }
 return result;
}
