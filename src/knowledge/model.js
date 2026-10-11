import {KNOWLEDGE_LIMITS,captureSource,knowledgeDigest} from './policy.js';

export const KNOWLEDGE_KINDS=Object.freeze(['inbox','idea','draft','archived']);
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const problem=message=>{throw new Error(message);};
function validRecord(row){
  return plain(row)&&typeof row.id==='string'&&/^[a-f0-9]{64}$/.test(row.id)&&typeof row.contentHash==='string'&&/^[a-f0-9]{64}$/.test(row.contentHash)&&
    typeof row.markdown==='string'&&Boolean(row.markdown.trim())&&new TextEncoder().encode(row.markdown).length<=KNOWLEDGE_LIMITS.recordBytes&&
    typeof row.title==='string'&&Boolean(row.title.trim())&&row.title.length<=160&&
    Array.isArray(row.tags)&&row.tags.length<=12&&row.tags.every(tag=>typeof tag==='string'&&tag.length<=30&&Boolean(tag.trim()))&&
    typeof row.note==='string'&&row.note.length<=4000&&typeof row.question==='string'&&row.question.length<=2000&&
    (row.draft===null||typeof row.draft==='string'&&new TextEncoder().encode(row.draft).length<=KNOWLEDGE_LIMITS.recordBytes)&&
    typeof row.questionTruncated==='boolean'&&typeof row.messageId==='string'&&/^[a-zA-Z0-9_-]{0,100}$/.test(row.messageId)&&
    (['reply','selection'].includes(row.mode)||row.mode==='manual')&&KNOWLEDGE_KINDS.includes(row.kind)&&
    Number.isSafeInteger(row.revision)&&row.revision>0&&Number.isSafeInteger(row.imageCount)&&row.imageCount>=0&&row.imageCount<=100&&
    typeof row.source==='string'&&(row.mode==='manual'?
      row.source===''&&row.messageId===''&&row.question===''&&!row.questionTruncated&&row.imageCount===0:
      captureSource(row.source)===row.source)&&typeof row.createdAt==='string'&&Number.isFinite(Date.parse(row.createdAt))&&
    typeof row.updatedAt==='string'&&Number.isFinite(Date.parse(row.updatedAt));
}
export function emptyKnowledgeStore(){return {version:1,records:[]};}
export function readKnowledgeStore(value){
  if(value===undefined)return emptyKnowledgeStore();
  const storedBytes=bytes(value);
  // Early v1 captures had no editable draft. Migrate only that absent field;
  // malformed existing values must still stop writes rather than erase data.
  if(plain(value)&&Array.isArray(value.records))value={...value,records:value.records.map(row=>
    plain(row)&&!Object.hasOwn(row,'draft')?{...row,draft:null}:row)};
  if(!plain(value)||value.version!==1||!Array.isArray(value.records)||value.records.length>KNOWLEDGE_LIMITS.records||
      storedBytes>KNOWLEDGE_LIMITS.totalBytes||new Set(value.records.map(row=>row?.id)).size!==value.records.length||
      !value.records.every(validRecord))
    problem('收件箱数据无效，已停止写入以保护原数据');
  return structuredClone(value);
}
function short(value,max,label){
  if(typeof value!=='string'||value.length>max||/\u0000/.test(value))problem(label+'无效或过长');
  return value;
}
function normalizeTags(tags){
  if(!Array.isArray(tags)||tags.length>12||tags.some(tag=>typeof tag!=='string'||!tag.trim()||tag.length>30))
    problem('最多 12 个标签，每个不超过 30 字');
  return [...new Set(tags.map(tag=>tag.trim()))];
}
// Manual notes have no page URL or capture grant. Only the trusted extension
// service chooses the random nonce; sandbox callers cannot forge a source.
export async function normalizeManualRecord(payload,now=new Date().toISOString(),nonce=globalThis.crypto.randomUUID()){
  if(!plain(payload))problem('新建知识内容无效');
  const title=short(payload.title,160,'标题').trim();
  if(!title)problem('标题不能为空');
  const markdown=short(payload.markdown,150000,'正文');
  if(!markdown.trim()||new TextEncoder().encode(markdown).length>KNOWLEDGE_LIMITS.recordBytes)
    problem('单条正文为空或超过 150 KB');
  if(!KNOWLEDGE_KINDS.includes(payload.kind))problem('分类无效');
  const tags=normalizeTags(payload.tags);
  const note=short(payload.note,4000,'备注');
  const contentHash=await knowledgeDigest(markdown);
  const id=await knowledgeDigest('manual:'+nonce);
  return {id,source:'',messageId:'',mode:'manual',title,markdown,contentHash,
    kind:payload.kind,tags,note,draft:null,revision:1,question:'',questionTruncated:false,
    imageCount:0,createdAt:now,updatedAt:now};
}
export async function normalizeCapture(payload,source,now=new Date().toISOString()){
  if(!plain(payload)||!captureSource(source))problem('知识来源无效');
  const markdown=short(payload.markdown,150000,'正文');
  if(!markdown.trim()||new TextEncoder().encode(markdown).length>KNOWLEDGE_LIMITS.recordBytes)problem('单条正文为空或超过 150 KB');
  const title=short(payload.title,160,'标题').trim()||'未命名回答';
  const messageId=short(payload.messageId||'',100,'消息标识');
  if(messageId&&!/^[a-zA-Z0-9_-]+$/.test(messageId))problem('消息标识无效');
  const mode=payload.mode==='selection'?'selection':'reply';
  const canonical=captureSource(source);
  const contentHash=await knowledgeDigest(markdown);
  const id=await knowledgeDigest(JSON.stringify([canonical,messageId,mode,contentHash]));
  const kind=KNOWLEDGE_KINDS.includes(payload.kind)?payload.kind:'inbox';
  return {id,source:canonical,messageId,mode,title,markdown,contentHash,kind,tags:[],note:'',draft:null,revision:1,
    question:short(payload.question||'',2000,'对应提问'),questionTruncated:payload.questionTruncated===true,
    imageCount:Number.isSafeInteger(payload.imageCount)?Math.max(0,Math.min(payload.imageCount,100)):0,
    createdAt:now,updatedAt:now};
}
export function addKnowledgeRecord(store,record){
  const prior=store.records.find(row=>row.id===record.id);
  if(prior)return {store,record:prior,duplicate:true};
  const next={version:1,records:[record,...store.records]};
  if(next.records.length>KNOWLEDGE_LIMITS.records||bytes(next)>KNOWLEDGE_LIMITS.totalBytes)
    problem('收件箱已满（200 条 / 4 MiB），请先备份并删除部分记录');
  return {store:next,record,duplicate:false};
}
export function updateKnowledgeRecord(store,payload,now=new Date().toISOString()){
  const old=store.records.find(row=>row.id===payload?.id);
  if(!old)problem('记录已不存在，请刷新');
  if(payload.ifRevision!==old.revision)problem('记录已在其他窗口修改，请刷新后核对；本次没有覆盖');
  if(!KNOWLEDGE_KINDS.includes(payload.kind))problem('分类无效');
  const title=short(payload.title,160,'标题').trim();
  if(!title)problem('标题不能为空');
  const note=short(payload.note,4000,'备注');
  const draft=Object.hasOwn(payload,'draft')?payload.draft:old.draft;
  if(draft!==null&&(typeof draft!=='string'||!draft.trim()||new TextEncoder().encode(draft).length>KNOWLEDGE_LIMITS.recordBytes))problem('草稿为空或超过 150 KB');
  const tags=normalizeTags(payload.tags);
  // Captured original stays immutable. Personal edits live in title/note/tags.
  const record={...old,title,note,tags,draft,kind:payload.kind,updatedAt:now,revision:old.revision+1};
  const next={version:1,records:store.records.map(row=>row.id===old.id?record:row)};
  if(bytes(next)>KNOWLEDGE_LIMITS.totalBytes)problem('收件箱已满，请先备份或精简备注');
  return {store:next,record};
}
export function listKnowledge(store,{query='',kind='all'}={}){
  if(typeof query!=='string'||query.length>100||!['all',...KNOWLEDGE_KINDS].includes(kind))problem('筛选条件无效');
  const words=query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const records=store.records.filter(row=>(kind==='all'||kind===row.kind)&&words.every(word=>
    [row.title,row.markdown,row.draft||'',row.question,row.note,...row.tags].join('\n').toLocaleLowerCase().includes(word)))
    .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).map(({markdown,draft,note,question,...row})=>({...row,hasDraft:draft!==null,excerpt:(draft??markdown).slice(0,140)}));
  return {records,total:store.records.length,bytes:bytes(store),limits:KNOWLEDGE_LIMITS};
}
export function knowledgeMarkdown(record){
  const meta=record.mode==='manual'?{title:record.title,created_at:record.createdAt,created_by:'manual',
    kind:record.kind,tags:record.tags,edited_draft:record.draft!==null}:
    {title:record.title,source:record.source,message_id:record.messageId,captured_at:record.createdAt,
      kind:record.kind,tags:record.tags,edited_draft:record.draft!==null};
  return '---\n'+Object.entries(meta).map(([key,value])=>key+': '+JSON.stringify(value)).join('\n')+
    '\n---\n\n'+(record.note?'## 我的备注\n\n'+record.note+'\n\n':'')+
    (record.question?'## 对应提问'+(record.questionTruncated?'（节选）':'')+'\n\n'+record.question+'\n\n':'')+
    (record.draft??record.markdown)+(record.source?'\n\n来源：'+record.source:'')+'\n';
}
export function knowledgeFilename(title){
  return (String(title).normalize('NFKC').replace(/[\x00-\x1f\x7f\\/:*?"<>|]/g,'-').replace(/^[.\s]+|[.\s]+$/g,'').slice(0,60)||'chatgpt-answer')+'.md';
}
