// OpenDesk Conversation: Bookmark Manager's bounded business adapter.
// Chrome Bookmarks and the existing admitted Service remain the only authority.
const fail=(code,message)=>Object.assign(new Error(message),{code});
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const types=new Set(['folder.create','bookmark.create','bookmark.search','bookmark.move','bookmark.update']);
const fields=Object.freeze({
 'folder.create':['type','title','parent'],
 'bookmark.create':['type','title','url','parent'],
 'bookmark.search':['type','query'],
 'bookmark.move':['type','target','parent'],
 'bookmark.update':['type','target','title']
});
const value=(v,max=256)=>typeof v==='string'&&v.trim()&&v.length<=max;
const noExtras=(row,keys)=>Object.keys(row).every(key=>keys.includes(key));

export function validateBookmarkPlan(plan){
 if(!plain(plan)||!noExtras(plan,['actions','question']))
  throw fail('E_CONVERSATION_SCHEMA','AI 操作内容不符合书签协议');
 if(value(plan.question,240)&&!Object.hasOwn(plan,'actions'))
  return Object.freeze({question:plan.question.trim(),actions:[]});
 if(!Array.isArray(plan.actions)||plan.actions.length<1||plan.actions.length>4||
    Object.hasOwn(plan,'question'))
  throw fail('E_CONVERSATION_SCHEMA','每次只允许 1–4 项明确操作，或提出一个问题');
 const actions=plan.actions.map(action=>{
  if(!plain(action)||!types.has(action.type)||!noExtras(action,fields[action.type]))
   throw fail('E_CONVERSATION_SCHEMA','模型提出了不受支持的书签操作');
  if(action.type==='bookmark.search'){
   if(!value(action.query,200))throw fail('E_CONVERSATION_SCHEMA','搜索词不能为空');
  }else if(action.type==='folder.create'){
   if(!value(action.title)||action.parent!==undefined&&!value(action.parent))
    throw fail('E_CONVERSATION_SCHEMA','文件夹名称或目标无效');
  }else if(action.type==='bookmark.create'){
   if(!value(action.title)||!value(action.url,2048)||action.parent!==undefined&&!value(action.parent))
    throw fail('E_CONVERSATION_SCHEMA','书签名称、网址或文件夹无效');
   if(action.url!=='$currentPage'){
    let url;try{url=new URL(action.url);}catch{}
    if(!url||!['https:','http:'].includes(url.protocol)||url.username||url.password)
     throw fail('E_CONVERSATION_SCHEMA','仅允许普通 HTTP(S) 书签网址');
   }
  }else if(action.type==='bookmark.move'){
   if(!value(action.target)||!value(action.parent))
    throw fail('E_CONVERSATION_SCHEMA','移动操作缺少真实目标');
  }else if(!value(action.target)||!value(action.title))
   throw fail('E_CONVERSATION_SCHEMA','重命名操作缺少目标或名称');
  return Object.freeze({...action});
 });
 return Object.freeze({actions:Object.freeze(actions)});
}

function pathOf(tree,id){
 const parts=[],seen=new Set();let node=tree.byId.get(id);
 while(node&&!seen.has(node.id)&&seen.size<100){
  seen.add(node.id);if(node.parentId!==null)parts.unshift(node.title);
  node=tree.byId.get(node.parentId);
 }
 return parts.join(' / ');
}
function nodeFolder(node){return node&&typeof node.url!=='string';}
function resolveName(tree,name,folderOnly=false){
 const matches=[...tree.byId.values()].filter(node=>
  (!folderOnly||nodeFolder(node))&&!node.locked&&node.parentId!==null&&
  (node.title===name||pathOf(tree,node.id)===name));
 if(matches.length!==1)throw fail(matches.length?'E_BOOKMARK_AMBIGUOUS':'E_BOOKMARK_NOT_FOUND',
  matches.length?'存在多个「'+name+'」，请提供完整目录路径：'+
   matches.slice(0,5).map(node=>pathOf(tree,node.id)).join('；'):'未找到「'+name+'」，请先搜索或选择它');
 return matches[0];
}
function assertNode(tree,id,folder=false){
 const node=tree.byId.get(id);
 if(!node||node.locked||node.parentId===null||(folder&&!nodeFolder(node)))
  throw fail('E_BOOKMARK_STALE','目标已删除、受保护或不再是可编辑的文件夹');
 return node;
}
function parentOf(tree,parent,context,refs){
 if(parent===undefined||parent==='$currentFolder')return assertNode(tree,context.currentFolderId,true);
 if(parent==='$lastFolder')return assertNode(tree,refs.folderId,true);
 if(parent==='$selected')return assertNode(tree,context.selectedId,true);
 if(parent.startsWith('$'))throw fail('E_BOOKMARK_REFERENCE','没有该文件夹引用，请明确选择目标');
 return resolveName(tree,parent,true);
}
function targetOf(tree,target,context,refs){
 if(target==='$selected')return assertNode(tree,context.selectedId);
 if(target==='$lastBookmark')return assertNode(tree,refs.bookmarkId);
 if(target==='$lastFolder')return assertNode(tree,refs.folderId);
 const match=/^\$search:([1-9]|1[0-2])$/.exec(target);
 if(match)return assertNode(tree,refs.matches?.[Number(match[1])-1]);
 if(target.startsWith('$'))throw fail('E_BOOKMARK_REFERENCE','无法核实该条书签引用');
 return resolveName(tree,target);
}
const aborted=signal=>{if(signal?.aborted)throw fail('E_CANCELLED','已停止，未再发送新的书签操作');};

export function bookmarkConversationContext(tree,{selectedId=null,currentFolderId=null,refs={}}={}){
 const selected=tree?.byId.get(selectedId);
 const current=tree?.byId.get(currentFolderId);
 return Object.freeze({
  selected:selected?{kind:nodeFolder(selected)?'folder':'bookmark',title:selected.title,path:pathOf(tree,selected.id)}:null,
  currentFolder:current?pathOf(tree,current.id):'书签栏',
  lastFolder:tree?.byId.get(refs.folderId)?.title||null,
  lastBookmark:tree?.byId.get(refs.bookmarkId)?.title||null,
  searchedResults:(refs.matches||[]).slice(0,12).map((id,i)=>{
   const node=tree?.byId.get(id);return node?{reference:'$search:'+(i+1),title:node.title,path:pathOf(tree,id)}:null;
  }).filter(Boolean)
 });
}

// A fresh complete Chrome snapshot starts every turn. Every mutation gets its
// own post-write readback, and only verified IDs enter the next turn's context.
export async function executeBookmarkPlan({plan,service,context,refs={},expectedTree=null,signal,onStep=()=>{}}){
 const checked=validateBookmarkPlan(plan);
 if(checked.question)return {question:checked.question,refs,tree:null,messages:[]};
 let tree=await service.load();aborted(signal);
 const nextRefs={folderId:refs.folderId||null,bookmarkId:refs.bookmarkId||null,
  matches:[...(refs.matches||[]).slice(0,12)]};
 const messages=[],confirmedInTurn=new Set();
 // Compare the pre-AI visible snapshot with the fresh Service snapshot before
 // any referenced write. Verified writes in this turn are not external changes.
 const requireFresh=node=>{
  const prior=expectedTree?.byId?.get(node.id);
  if(prior&&!confirmedInTurn.has(node.id)&&
    (prior.title!==node.title||prior.url!==node.url||prior.parentId!==node.parentId))
   throw fail('E_BOOKMARK_STALE','「'+prior.title+'」已在其他窗口变化，请刷新并重新确认目标');
  return node;
 };
 for(const action of checked.actions){
  // A Stop between operations preserves the actual verified partial journal.
  // Never issue or replay a later mutation after cancellation.
  if(signal?.aborted)throw Object.assign(fail('E_CANCELLED','已停止，未再发送新的书签操作'),{
   partial:[...messages],refs:{...nextRefs},writeIssued:false});
  let issued=false,kind='',target=null,actual=null;
  try{
   if(action.type==='bookmark.search'){
    const term=action.query.toLocaleLowerCase();
    const matches=[...tree.byId.values()].filter(node=>
     node.parentId!==null&&((node.title||'')+' '+(node.url||'')).toLocaleLowerCase().includes(term)).slice(0,12);
    nextRefs.matches=matches.map(node=>node.id);
    const info=matches.length?matches.map((node,i)=>
     (i+1)+'. '+pathOf(tree,node.id)).join('\n'):'没有找到匹配的书签';
    const message='搜索「'+action.query+'」：'+info;
    messages.push(message);onStep({message,tree,refs:{...nextRefs}});
    continue;
   }
   if(action.type==='folder.create'){
    const parent=requireFresh(parentOf(tree,action.parent,context,nextRefs));
    issued=true;target=await service.createFolder({title:action.title,parentId:parent.id});
    kind='folder';actual={id:target?.id,title:action.title,parentId:parent.id};
   }else if(action.type==='bookmark.create'){
    const parent=requireFresh(parentOf(tree,action.parent,context,nextRefs));
    const source=action.url==='$currentPage'?context.pageContext:null;
    if(action.url==='$currentPage'&&(!source||source.status!=='available'||
      !source.tabRef||!source.documentRef))
     throw fail('E_DOCUMENT_BINDING_REQUIRED','发送时的当前网页已失效，请重新发送');
    const title=action.title==='$pageTitle'?source?.title:action.title;
    if(!value(title))throw fail('E_CONVERSATION_SCHEMA','当前网页缺少有效标题');
    const url=source?.url||action.url;
    issued=true;target=await service.createBookmark({title,url,parentId:parent.id,
     ...(source?{sourcePage:{url,tabRef:source.tabRef,documentRef:source.documentRef}}:{})});
    kind='bookmark';actual={id:target?.id,title,url,parentId:parent.id};
   }else if(action.type==='bookmark.move'){
    const expected=requireFresh(targetOf(tree,action.target,context,nextRefs));
    const parent=requireFresh(parentOf(tree,action.parent,context,nextRefs));
    issued=true;target=await service.move({expected,parentId:parent.id});
    kind=nodeFolder(expected)?'folder':'bookmark';
    actual={id:expected.id,title:expected.title,url:expected.url,parentId:parent.id};
   }else if(action.type==='bookmark.update'){
    const expected=requireFresh(targetOf(tree,action.target,context,nextRefs));
    issued=true;target=await service.update({expected,title:action.title,url:expected.url});
    kind=nodeFolder(expected)?'folder':'bookmark';
    actual={id:expected.id,title:action.title,url:expected.url,parentId:expected.parentId};
   }
   if(!value(actual?.id,160))throw fail('E_OUTCOME_UNKNOWN','写入已发出，但未得到可以读回的节点 ID');
   tree=await service.load();
   const found=tree.byId.get(actual.id);
   if(!found||found.title!==actual.title||found.parentId!==actual.parentId||
     (kind==='bookmark'&&found.url!==actual.url))
    throw fail('E_OUTCOME_UNKNOWN','写入后读回与期望不一致；已停止后续修改');
   confirmedInTurn.add(found.id);
   if(action.type==='folder.create')nextRefs.folderId=found.id;
   if(action.type==='bookmark.create')nextRefs.bookmarkId=found.id;
   if(action.type==='bookmark.move'||action.type==='bookmark.update'){
    if(kind==='folder')nextRefs.folderId=found.id;else nextRefs.bookmarkId=found.id;
   }
   const labels={'folder.create':'已创建文件夹','bookmark.create':'已收藏书签',
    'bookmark.move':'已移动','bookmark.update':'已重命名'};
   const message=labels[action.type]+'「'+found.title+'」 · '+pathOf(tree,found.id);
   messages.push(message);onStep({message,tree,refs:{...nextRefs},id:found.id});
  }catch(error){
   const code=issued?'E_OUTCOME_UNKNOWN':error?.code||'E_BOOKMARK';
   const message=issued?'写入结果尚未得到完整确认，已停止后续操作；请刷新书签核对。':
    String(error?.message||'操作失败');
   throw Object.assign(fail(code,message),{
    cause:error,partial:messages,refs:{...nextRefs},writeIssued:issued
   });
  }
 }
 return {messages,tree,refs:nextRefs};
}
