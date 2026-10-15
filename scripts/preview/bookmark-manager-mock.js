/* OPAQUE OFFLINE BOOKMARKS MOCK: only in-memory nodes, never real Chrome or native Host. */
(()=>{'use strict';
const root=document.getElementById('tool-root');
const scenario=globalThis.__opendeskPreviewScenario;
if(!root||!['success','empty','error','loading','permission-denied','untrusted'].includes(scenario))
  throw Error('E_PREVIEW_MOCK: invalid scenario');
const fail=(code,message)=>{throw Object.assign(new Error('[离线模拟] '+message),{code})};
const clone=x=>JSON.parse(JSON.stringify(x));
const sessionRef='preview-bookmark-session-0123456789';
const snapshotRef='preview-bookmark-snapshot-0123456789';
let serial=3000,records=new Map(),tickets=new Map();
let revoked=false,nextWriteFailure=null;
if(typeof document.createElement==='function'&&typeof root.before==='function'){
const previewLab=document.createElement('details');
previewLab.className='od-disclosure';
const summary=document.createElement('summary');
summary.textContent='预览实验台 · 仅模拟，不属于正式工具';
previewLab.append(summary);
const toolsRow=document.createElement('div');
toolsRow.className='od-toolbar';
toolsRow.style.flexWrap='wrap';
const labMessage=document.createElement('p');
labMessage.className='od-note';labMessage.setAttribute('role','status');
const diagnostic=(label,handler)=>{
  const button=document.createElement('button');
  button.type='button';button.className='od-button od-button--secondary';
  button.textContent=label;button.addEventListener('click',handler);
  toolsRow.append(button);
};
diagnostic('下一次写入失败',()=>{
  nextWriteFailure='E_PREVIEW_SAVE_FAIL';
  labMessage.textContent='下次保存会在写入前失败，草稿应保留。';
});
diagnostic('下一次写入结果未知',()=>{
  nextWriteFailure='E_OUTCOME_UNKNOWN';
  labMessage.textContent='下次写入模拟未知结果；不得自动重试。';
});
diagnostic('模拟外部冲突',()=>{
  const id=root.querySelector('#bm-inspector-id')?.textContent?.trim()||'100';
  const row=records.get(id);
  if(!row){labMessage.textContent='请先选中已有书签再模拟冲突。';return}
  row.title+='（由另一窗口修改）';
  labMessage.textContent='已在 Mock 原始记录中修改 '+id+'；保存旧草稿应遭拒绝。';
});
diagnostic('模拟撤销权限',()=>{
  revoked=true;labMessage.textContent='Mock 权限已撤销，请点击正式界面的刷新按钮验证清除。';
});
diagnostic('恢复模拟权限',()=>{
  revoked=false;nextWriteFailure=null;
  labMessage.textContent='Mock 已恢复；请在正式界面重新检查权限。';
});
previewLab.append(toolsRow,labMessage);
root.before(previewLab);
}
function beforeWrite(){
  if(revoked)fail('E_GRANT_REVOKED','模拟书签权限已经撤销');
  if(nextWriteFailure){
    const code=nextWriteFailure;nextWriteFailure=null;
    fail(code,code==='E_OUTCOME_UNKNOWN'?'模拟写入结果未知':'模拟保存失败，尚未写入');
  }
}
const push=(id,title,parentId,url)=>records.set(id,{id,title,...(parentId?{parentId}:{}),
  ...(url!==undefined?{url}:{}),index:0});
push('0','root',null);push('1','书签栏','0');push('2','其他书签','0');
if(scenario!=='empty'){
  push('10','设计资料','1');push('11','产品研究','2');
  push('100',scenario==='untrusted'?'<img src=x onerror=alert(1)>':'OpenDesk 产品资料','10','https://example.org/preview');
  push('101','工具文档','11','https://example.org/docs');
  for(let i=0;i<2152;i++)push(String(i+500),'模拟书签 '+String(i+1).padStart(4,'0'),
    i%2?'11':'10','https://example.org/items/'+i);
}
function check(){if(revoked)fail('E_GRANT_REVOKED','模拟书签权限已经撤销');
  if(scenario==='loading')return new Promise(()=>{});
  if(scenario==='permission-denied')fail('E_BOOKMARK_PERMISSION','未授予 Full Bookmarks 模拟权限');
  if(scenario==='error')fail('E_PREVIEW_SIMULATED','模拟读取失败');
  return null}
const names=['getTree','get','search','create','update','move','remove',
 'prepareRemoveTree','removeTree','observe.start','observe.read','observe.stop'];
const ops=Object.freeze(names.map(name=>({operation:'browser.bookmarks.'+name,
  requiredCapabilities:['browser.bookmarks.full'],status:{callableNow:scenario!=='permission-denied',
    ...(scenario==='permission-denied'?{reasonCode:'E_BOOKMARK_PERMISSION'}:{})}})));
function compare(row,expected){if(!row||!expected||row.id!==expected.id)return false;
 for(const k of ['parentId','index','title','url','unmodifiable','folderType']){
  if((row[k]??null)!==(expected[k]??null))return false;
 }return true;}
function descendants(id){const all=[];const visit=key=>{for(const row of records.values())if(row.parentId===key){all.push(row);visit(row.id)}};visit(id);return all}
const writeRow=(id,input)=>{const old=records.get(id);if(!old)fail('E_BOOKMARK_STALE','原书签不存在');return old}
const bookmarks={
 async getTree({cursor,limit=100}={}){const wait=check();if(wait)return wait;
  const offset=cursor?Number(cursor):0,all=[...records.values()];
  if(!Number.isSafeInteger(offset)||offset<0||offset>all.length)
    fail('E_BOOKMARK_RESPONSE','非法分页游标');
  const nodes=all.slice(offset,offset+Math.min(limit,100)).map(clone);
  return {nodes,snapshotRef,nextCursor:offset+nodes.length<all.length?String(offset+nodes.length):null};
 },
 async get({id}){await check();return records.has(id)?[clone(records.get(id))]:[]},
 async search({query}){await check();return [...records.values()].filter(row=>row.title.includes(query)).map(clone)},
 async create(data){await check();beforeWrite();if(!records.has(data.parentId))fail('E_SCHEMA','目录不存在');
   const id=String(++serial);push(id,data.title,data.parentId,data.url);return clone(records.get(id))},
 async update({id,changes,expected}){await check();beforeWrite();const old=writeRow(id);
  if(!compare(old,expected))fail('E_BOOKMARK_STALE','已发生外部修改');
  if(changes.title!==undefined)old.title=changes.title;
  if(changes.url!==undefined)old.url=changes.url;
  return clone(old)},
 async move({id,destination,expected}){await check();beforeWrite();const old=writeRow(id);
  if(!compare(old,expected))fail('E_BOOKMARK_STALE','已发生外部修改');
  if(!records.has(destination.parentId))fail('E_SCHEMA','目标目录不存在');
  old.parentId=destination.parentId;return clone(old)},
 async remove({id,expected}){await check();beforeWrite();const old=writeRow(id);
  if(!compare(old,expected)||descendants(id).length)fail('E_BOOKMARK_STALE','目录存在未审阅的修改');
  records.delete(id);return {removed:true}},
 async prepareRemoveTree({id,expected,descendantCount,snapshotRef:ref}){
   await check();if(ref!==snapshotRef||!compare(records.get(id),expected)||
      descendants(id).length!==descendantCount)fail('E_BOOKMARK_STALE','子树内容已变');
   const ticket='preview-delete-ticket-'+String(++serial);
   tickets.set(ticket,{id,descendantCount,expiresAt:Date.now()+10000});
   return {ticket,targetId:id,descendantCount,expiresAt:Date.now()+10000}
 },
 async removeTree({id,ticket}){await check();beforeWrite();const permit=tickets.get(ticket);
   tickets.delete(ticket);if(!permit||permit.id!==id||permit.expiresAt<Date.now()||
     descendants(id).length!==permit.descendantCount)
     fail('E_BOOKMARK_STALE','目录删除凭据失效');
   for(const child of descendants(id))records.delete(child.id);
   records.delete(id);return {removed:true}
 },
 observe:{
  async start(){await check();return {sessionRef,cursor:'0',expiresAt:Date.now()+30000}},
  async read(){await check();return {events:[],nextCursor:'0',expiresAt:Date.now()+30000,
    gapCount:0,droppedCount:0}},
  async stop(){return {stopped:true}}
 }
};
const browser=Object.freeze({
 capabilities:Object.freeze({
  async list(){return clone(ops)},
  async getStatus({operation}){return clone(ops.find(row=>row.operation===operation)?.status||
    {callableNow:false,reasonCode:'E_PREVIEW_MOCK'})}
 }),
 bookmarks:Object.freeze(bookmarks),
 page:Object.freeze({async getContext(){return {status:'available',title:'模拟当前页',
   url:'https://example.org/current-page',tabRef:'preview-tab-ref-0123456789',
   documentRef:'preview-document-ref-0123456789'}}})
});
Object.defineProperty(globalThis,'OpenDeskTool',{value:Object.freeze({root,setState:()=>{}})});
Object.defineProperty(globalThis,'OpenDeskSDK',{value:Object.freeze({browser})});
// This mock belongs ONLY to the preview iframe. It does not request Chrome,
// access storage, send network requests, or impersonate a real installation.
})();