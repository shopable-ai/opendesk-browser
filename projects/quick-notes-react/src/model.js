// Pure Quick Notes domain contract. No DOM, SDK or privileged host imports.
// The original Quick Notes 1.1.9 source is intentionally left untouched.
export const STORAGE_KEY='notes';
export const LEGACY_KEY='note';
export const MAX_NOTES=16;
export const ITEM_BYTES=8192;
const encoding=new TextEncoder();
export const itemBytes=value=>encoding.encode(JSON.stringify(value)).byteLength;
export const noteLabel=note=>note.text.trim().split('\n').find(Boolean)?.slice(0,22)||'未命名笔记';
export const validNote=note=>Boolean(note)&&typeof note==='object'&&!Array.isArray(note)&&
  typeof note.id==='string'&&typeof note.text==='string'&&note.text.length<=8192;
export const newNoteId=()=>String(Date.now())+'-'+Math.random().toString(36).slice(2,9);

export function recoverNotes(current,oldValue,makeId=newNoteId){
  if(typeof current?.etag!=='string'||!/^[0-9a-f]{64}$/.test(current.etag))
    throw Error('请更新并重新加载扩展以支持安全存储');
  const value=current.value;
  if(value!==null&&!Array.isArray(value))
    throw Error('数据格式无效，禁止覆盖');
  if(Array.isArray(value)&&(value.length>MAX_NOTES||!value.every(validNote)||
    new Set(value.map(note=>note.id)).size!==value.length))
    throw Error('数据格式无效，禁止覆盖');
  const legacyPending=typeof oldValue==='string'&&Boolean(oldValue);
  const upgrading=value===null&&legacyPending;
  const notes=upgrading?[{id:makeId(),text:oldValue,pageTitle:'',pageUrl:'',updatedAt:0}]:
    (value||[]).map(note=>({
      id:note.id,text:note.text,
      pageTitle:typeof note.pageTitle==='string'?note.pageTitle.slice(0,512):'',
      pageUrl:typeof note.pageUrl==='string'?note.pageUrl.slice(0,4096):'',
      updatedAt:typeof note.updatedAt==='number'?note.updatedAt:0
    }));
  return {notes,etag:current.etag,legacyPending,upgrading};
}

export function pageInfoFrom(result){
  const address=result?.status==='available'?String(result.url||''):'';
  return /^https?:\/\//i.test(address)
    ?{title:String(result.title||'未命名网页'),url:address}:null;
}

export function proposedSave({notes,selectedId,text,include,pageInfo,at=Date.now(),makeId=newNoteId}){
  if(!text.trim())throw Error('请输入笔记内容再保存。');
  const prior=notes.find(note=>note.id===selectedId);
  if(!prior&&notes.length>=MAX_NOTES)throw Error('最多保存 '+MAX_NOTES+' 条笔记。');
  if(include&&!pageInfo&&!prior?.pageUrl)
    throw Error('当前网页不可关联，请取消勾选后保存离线笔记。');
  const id=prior?.id||makeId();
  const note={id,text,pageTitle:include?(pageInfo?.title||prior?.pageTitle||''):'',
    pageUrl:include?(pageInfo?.url||prior?.pageUrl||''):'',updatedAt:at};
  const next=prior?notes.map(row=>row.id===id?note:row):[note,...notes];
  if(itemBytes(next)>ITEM_BYTES)
    throw Error('所有笔记共用一个 8 KiB 存储项，已超出上限；请精简或删除旧笔记。');
  return {id,next};
}
export const proposedDelete=(notes,id)=>notes.filter(row=>row.id!==id);
