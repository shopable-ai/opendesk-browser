// OpenDesk Conversation: Bookmark Manager's bounded business adapter.
// Chrome Bookmarks and the existing admitted Service remain the only authority.
const fail=(code,message)=>Object.assign(new Error(message),{code});
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const types=new Set(['folder.create','folder.ensure','bookmark.create','bookmark.search','bookmark.move','bookmark.update']);
const fields=Object.freeze({
 'folder.create':['type','title','parent'],
  'folder.ensure':['type','title','parent'],
 'bookmark.create':['type','title','url','parent'],
 'bookmark.search':['type','query'],
 'bookmark.move':['type','target','parent'],
 'bookmark.update':['type','target','title']
});
const value=(v,max=256)=>typeof v==='string'&&v.trim()&&v.length<=max;
const noExtras=(row,keys)=>Object.keys(row).every(key=>keys.includes(key));

export function validateBookmarkPlan(plan){
 if(!plain(plan)||!noExtras(plan,['actions','question','complete']))
  throw fail('E_CONVERSATION_SCHEMA','AI 操作内容不符合书签协议');
 if(Object.hasOwn(plan,'complete')){
  if(!noExtras(plan,['complete'])||!Array.isArray(plan.complete)||
     plan.complete.length<1||plan.complete.length>4)
   throw fail('E_CONVERSATION_SCHEMA','完成声明必须包含 1–4 个可独立核实的条件');
  const shapes={
   'folder.exists':['kind','folder'],
   'bookmark.inFolder':['kind','folder','url'],
   'bookmark.title':['kind','target','title'],
   'bookmark.parent':['kind','target','folder'],
   'search.observed':['kind','query']
  };
  const checks=plan.complete.map(row=>{
   if(!plain(row)||!Object.hasOwn(shapes,row.kind)||!noExtras(row,shapes[row.kind]))
    throw fail('E_CONVERSATION_SCHEMA','不支持该完成核验条件');
   for(const key of shapes[row.kind].slice(1))
    if(!value(row[key],key==='url'?2048:256))
     throw fail('E_CONVERSATION_SCHEMA','完成核验条件缺少有效字段');
   if(row.kind==='bookmark.inFolder'&&row.url!=='$currentPage'){
    let url;try{url=new URL(row.url);}catch{}
    if(!url||!['https:','http:'].includes(url.protocol)||url.username||url.password)
     throw fail('E_CONVERSATION_SCHEMA','完成核验仅支持 HTTP(S) 地址');
   }
   return Object.freeze({...row});
  });
  return Object.freeze({complete:Object.freeze(checks),actions:[]});
 }
 if(value(plan.question,240)&&!Object.hasOwn(plan,'actions'))
  return Object.freeze({question:plan.question.trim(),actions:[]});
 if(!Array.isArray(plan.actions)||plan.actions.length<1||plan.actions.length>4||
    Object.hasOwn(plan,'question'))
  throw fail('E_CONVERSATION_SCHEMA','每次只允许 1–4 项明确操作，或提出一个问题');
 const actions=plan.actions.map(action=>{
  if(!plain(action)||!types.has(action.type)||!noExtras(action,fields[action.type]))
   throw fail('E_CONVERSATION_SCHEMA','模型提出了不受支持的书签操作');
  const normalized={...action};
  if(action.type==='bookmark.search'){
   if(!value(action.query,200))throw fail('E_CONVERSATION_SCHEMA','搜索词不能为空');
  }else if(action.type==='folder.create'||action.type==='folder.ensure'){
   if(!value(action.title)||action.parent!==undefined&&!value(action.parent))
    throw fail('E_CONVERSATION_SCHEMA','文件夹名称或目标无效');
  }else if(action.type==='bookmark.create'){
   if(!value(action.title)||!value(action.url,2048)||action.parent!==undefined&&!value(action.parent))
    throw fail('E_CONVERSATION_SCHEMA','书签名称、网址或文件夹无效');
   if(action.url!=='$currentPage'){
    let url;try{url=new URL(action.url);}catch{}
    if(!url||!['https:','http:'].includes(url.protocol)||url.username||url.password)
     throw fail('E_CONVERSATION_SCHEMA','仅允许普通 HTTP(S) 书签网址');
    normalized.url=url.href;
   }
  }else if(action.type==='bookmark.move'){
   if(!value(action.target)||!value(action.parent))
    throw fail('E_CONVERSATION_SCHEMA','移动操作缺少真实目标');
  }else if(!value(action.target)||!value(action.title))
   throw fail('E_CONVERSATION_SCHEMA','重命名操作缺少目标或名称');
  if(typeof normalized.title==='string')normalized.title=normalized.title.trim();
  return Object.freeze(normalized);
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
function availableNode(tree,node,parent=false){
 return node&&node.parentId!==null&&(parent?
  nodeFolder(node)&&node.unmodifiable!=='managed'&&node.folderType!=='managed'&&
   (!node.locked||tree.roots?.has(node.parentId)):!node.locked);
}
function resolveName(tree,name,folderOnly=false){
 const matches=[...tree.byId.values()].filter(node=>
  availableNode(tree,node,folderOnly)&&
  (node.title===name||pathOf(tree,node.id)===name));
 if(matches.length!==1)throw fail(matches.length?'E_BOOKMARK_AMBIGUOUS':'E_BOOKMARK_NOT_FOUND',
  matches.length?'存在多个「'+name+'」，请提供完整目录路径：'+
   matches.slice(0,5).map(node=>pathOf(tree,node.id)).join('；'):'未找到「'+name+'」，请先搜索或选择它');
 return matches[0];
}
function assertNode(tree,id,folder=false){
 const node=tree.byId.get(id);
 if(!availableNode(tree,node,folder))
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
const aborted=signal=>{
 if(!signal?.aborted)return;
 const revoked=signal.reason?.code==='E_MODEL_GRANT_REVOKED';
 throw Object.assign(fail(revoked?'E_MODEL_GRANT_REVOKED':'E_CANCELLED',
  revoked?'模型权限已撤销，未再发送新的书签操作':'已停止，未再发送新的书签操作'),
  {writeIssued:false});
};

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


// Completion is a fresh Service read, never a model-declared success receipt.
// All references are resolved against the actual tree and ambiguity is fail-closed.
export async function verifyBookmarkCompletion({checks,requiredChecks=[],service,context,refs={},signal,searched=new Set()}){
 const checked=validateBookmarkPlan({complete:checks});
 const required=requiredChecks.length?validateBookmarkPlan({complete:requiredChecks}).complete:[];
 const conditions=[...required,...checked.complete];
 aborted(signal);
 const tree=await service.load();aborted(signal);
 const missing=[];
 for(const check of conditions){
  let ok=false;
  try{
   if(check.kind==='folder.exists'){
    // Prefer the freshly Host-resolved folder ID when its title/path matches.
    // A second folder with the same name elsewhere must not invalidate a
    // correctly verified creation, nor can an invented model ID satisfy it.
    const recent=tree.byId.get(refs.folderId);
    ok=Boolean(availableNode(tree,recent,true)&&
      (check.folder==='$lastFolder'||check.folder===recent.title||
        check.folder===pathOf(tree,recent.id)));
    if(!ok)ok=Boolean(parentOf(tree,check.folder,context,refs));
   }
   if(check.kind==='bookmark.inFolder'){
    const parent=parentOf(tree,check.folder,context,refs);
    const source=check.url==='$currentPage'?context.pageContext:null;
    if(check.url==='$currentPage'&&
      (!source||source.status!=='available'||!source.tabRef||!source.documentRef))
     throw fail('E_DOCUMENT_BINDING_REQUIRED','当前网页身份已失效，请重新发起任务');
    let parsed;try{parsed=new URL(source?.url||check.url);}catch{}
    if(!parsed||!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)
     throw fail('E_CONVERSATION_SCHEMA','无法核实完成条件的网址');
    ok=[...tree.byId.values()].some(node=>node.parentId===parent.id&&node.url===parsed.href);
   }
   if(check.kind==='bookmark.title')ok=targetOf(tree,check.target,context,refs).title===check.title;
   if(check.kind==='bookmark.parent'){
    const node=targetOf(tree,check.target,context,refs);
    ok=node.parentId===parentOf(tree,check.folder,context,refs).id;
   }
   if(check.kind==='search.observed')ok=searched.has(check.query);
  }catch(error){
   if(!['E_BOOKMARK_NOT_FOUND','E_BOOKMARK_STALE'].includes(error?.code))throw error;
  }
  if(!ok)missing.push(check.kind);
 }
 const placement=conditions.find(check=>check.kind==='bookmark.inFolder');
 const label=placement&&!missing.length?
  parentOf(tree,placement.folder,context,refs).title:placement?.folder;
 const summary=placement?
  '已核实：'+(placement.url==='$currentPage'?'当前网页':'目标网址')+
   '已在「'+label+'」中。':'已完成，已重新读取 Chrome 书签核实。';
 return {complete:missing.length===0,reason:missing.length?
  '尚未满足：'+missing.join('、'):null,tree,summary};
}

// A fresh complete Chrome snapshot starts every turn. Every mutation gets its
// own post-write readback, and only verified IDs enter the next turn's context.
export async function executeBookmarkPlan({plan,service,context,refs={},expectedTree=null,signal,beforeWrite=()=>{},onStep=()=>{}}){
 const checked=validateBookmarkPlan(plan);
 if(checked.question)return {question:checked.question,refs,tree:null,messages:[]};
 aborted(signal);let tree=await service.load();aborted(signal);
 const nextRefs={folderId:refs.folderId||null,bookmarkId:refs.bookmarkId||null,
  matches:[...(refs.matches||[]).slice(0,12)]};
 const messages=[],observations=[],confirmedInTurn=new Set();
 // Compare the pre-AI visible snapshot with the fresh Service snapshot before
 // any referenced write. Verified writes in this turn are not external changes.
 const requireFresh=node=>{
  const prior=expectedTree?.byId?.get(node.id);
  if(expectedTree&&!confirmedInTurn.has(node.id)&&
    (!prior||prior.title!==node.title||prior.url!==node.url||prior.parentId!==node.parentId))
   throw fail('E_BOOKMARK_STALE','「'+(prior?.title||node.title)+'」已在其他窗口变化，请刷新并重新确认目标');
  return node;
 };
 for(const action of checked.actions){
  // A Stop between operations preserves the actual verified partial journal.
  // Never issue or replay a later mutation after cancellation.
  try{aborted(signal);}catch(error){throw Object.assign(error,{
   partial:[...messages],refs:{...nextRefs},writeIssued:false});}
  let issued=false,kind='',target=null,actual=null,uniqueGuard=null;
  const write=async(method,args)=>{
   // A model proposal alone cannot authorize a bookmark write. Recheck the
   // trusted Provider grant and instance immediately before EACH mutation.
   await beforeWrite({method,action});aborted(signal);
   issued=true;
   try{return await service[method](args,{signal,
    beforeWrite:async()=>{
     await beforeWrite({method,action});aborted(signal);
     // Final client-side conflict read, immediately before SDK dispatch.
     // Chrome has no atomic uniqueness primitive; external writers can still race.
     if(uniqueGuard){
      const fresh=await service.load();aborted(signal);
      const collision=[...fresh.byId.values()].some(node=>node.parentId===uniqueGuard.parentId&&
       (uniqueGuard.folder?nodeFolder(node)&&node.title===uniqueGuard.title:node.url===uniqueGuard.url));
      if(collision)throw fail('E_BOOKMARK_STALE','其他窗口刚刚创建了相同目标；已停止以避免重复写入，请刷新后继续');
     }
    }});}
   catch(error){if(error?.writeIssued===false)issued=false;throw error;}
  };
  try{
   if(action.type==='bookmark.search'){
    const term=action.query.toLocaleLowerCase();
    const matches=[...tree.byId.values()].filter(node=>
     node.parentId!==null&&((node.title||'')+' '+(node.url||'')).toLocaleLowerCase().includes(term)).slice(0,12);
    nextRefs.matches=matches.map(node=>node.id);
    const info=matches.length?matches.map((node,i)=>
     (i+1)+'. '+pathOf(tree,node.id)).join('\n'):'没有找到匹配的书签';
    const message='搜索「'+action.query+'」：'+info;
    observations.push({kind:'search',status:matches.length?'FOUND':'NOT_FOUND',
     query:action.query,matches:matches.map((node,i)=>({reference:'$search:'+(i+1),
      title:node.title,path:pathOf(tree,node.id),kind:nodeFolder(node)?'folder':'bookmark'}))});
    messages.push(message);onStep({message,tree,refs:{...nextRefs}});
    continue;
   }
   if(action.type==='folder.create'||action.type==='folder.ensure'){
    if(action.type==='folder.ensure'){tree=await service.load();aborted(signal);}
    const parent=requireFresh(parentOf(tree,action.parent,context,nextRefs));
    if(action.type==='folder.ensure'){
     const candidates=[...tree.byId.values()].filter(node=>
      node.parentId===parent.id&&nodeFolder(node)&&node.title===action.title);
     if(candidates.length>1)
      throw fail('E_BOOKMARK_AMBIGUOUS','目标目录下有多个同名文件夹「'+action.title+'」，请在书签树中选定具体文件夹后重试');
     if(candidates.length===1){
      tree=await service.load();aborted(signal);
      const node=tree.byId.get(candidates[0].id);
      if(!node||!nodeFolder(node)||node.title!==action.title||node.parentId!==parent.id)
       throw fail('E_BOOKMARK_STALE','文件夹在复用前发生变化，请刷新后重试');
      nextRefs.folderId=node.id;confirmedInTurn.add(node.id);
      const message='已复用文件夹「'+node.title+'」 · '+pathOf(tree,node.id);
      observations.push({kind:'folder',status:'VERIFIED_REUSED',title:node.title,path:pathOf(tree,node.id)});
      messages.push(message);onStep({message,tree,refs:{...nextRefs},id:node.id});
      continue;
     }
    }
    if(action.type==='folder.ensure')uniqueGuard={folder:true,parentId:parent.id,title:action.title};
    target=await write('createFolder',{title:action.title,parentId:parent.id});
    kind='folder';actual={id:target?.id,title:action.title,parentId:parent.id};
   }else if(action.type==='bookmark.create'){
    const parent=requireFresh(parentOf(tree,action.parent,context,nextRefs));
    const source=action.url==='$currentPage'?context.pageContext:null;
    if(action.url==='$currentPage'&&(!source||source.status!=='available'||
      !source.tabRef||!source.documentRef))
     throw fail('E_DOCUMENT_BINDING_REQUIRED','发送时的当前网页已失效，请重新发送');
    const title=action.title==='$pageTitle'?source?.title:action.title;
    if(!value(title))throw fail('E_CONVERSATION_SCHEMA','当前网页缺少有效标题');
    // Chrome/Service persist canonical HTTP(S) URLs. Compare readback to
    // the same normalized value (e.g. https://example.com/), never the
    // unnormalized source string that can falsely produce UNKNOWN.
    let url=source?.url||action.url;
    if(source){
     try{
      const parsed=new URL(url);
      if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)
       throw Error('invalid page URL');
      url=parsed.href;
     }catch{throw fail('E_DOCUMENT_BINDING_REQUIRED','当前网页不是可收藏的 HTTP(S) 页面');}
    }
    const existing=[...tree.byId.values()].filter(node=>node.parentId===parent.id&&node.url===url);
    if(existing.length){
     tree=await service.load();aborted(signal);
     const verified=existing.filter(node=>{
      const now=tree.byId.get(node.id);
      return now?.parentId===parent.id&&now?.url===url;
     });
     if(!verified.length)throw fail('E_BOOKMARK_STALE','目标书签在复用前发生变化，请重新搜索');
     nextRefs.bookmarkId=verified.length===1?verified[0].id:null;
     if(verified.length===1)confirmedInTurn.add(verified[0].id);
     const message='目标文件夹已收藏该网址，无需重复添加 · '+pathOf(tree,verified[0].id);
     observations.push({kind:'bookmark',status:'VERIFIED_REUSED',
      title:verified[0].title,path:pathOf(tree,verified[0].id)});
     messages.push(message);onStep({message,tree,refs:{...nextRefs},
      ...(verified.length===1?{id:verified[0].id}:{})});
     continue;
    }
    uniqueGuard={folder:false,parentId:parent.id,url};
    target=await write('createBookmark',{title,url,parentId:parent.id,
     ...(source?{sourcePage:{url,tabRef:source.tabRef,documentRef:source.documentRef}}:{})});
    kind='bookmark';actual={id:target?.id,title,url,parentId:parent.id};
   }else if(action.type==='bookmark.move'){
    const expected=requireFresh(targetOf(tree,action.target,context,nextRefs));
    const parent=requireFresh(parentOf(tree,action.parent,context,nextRefs));
    target=await write('move',{expected,parentId:parent.id});
    kind=nodeFolder(expected)?'folder':'bookmark';
    actual={id:expected.id,title:expected.title,url:expected.url,parentId:parent.id};
   }else if(action.type==='bookmark.update'){
    const expected=requireFresh(targetOf(tree,action.target,context,nextRefs));
    target=await write('update',{expected,title:action.title,url:expected.url});
    kind=nodeFolder(expected)?'folder':'bookmark';
    actual={id:expected.id,title:action.title,url:expected.url,parentId:expected.parentId};
   }
   if(!value(actual?.id,160))throw fail('E_OUTCOME_UNKNOWN','写入已发出，但未得到可以读回的节点 ID');
   tree=await service.load();
   const found=tree.byId.get(actual.id);
   if(!found||nodeFolder(found)!==(kind==='folder')||found.title!==actual.title||found.parentId!==actual.parentId||
     (kind==='bookmark'&&found.url!==actual.url))
    throw fail('E_OUTCOME_UNKNOWN','写入后读回与期望不一致；已停止后续修改');
   confirmedInTurn.add(found.id);
   if(action.type==='folder.create'||action.type==='folder.ensure')nextRefs.folderId=found.id;
   if(action.type==='bookmark.create')nextRefs.bookmarkId=found.id;
   if(action.type==='bookmark.move'||action.type==='bookmark.update'){
    if(kind==='folder')nextRefs.folderId=found.id;else nextRefs.bookmarkId=found.id;
   }
   const labels={'folder.create':'已创建文件夹','folder.ensure':'已创建文件夹','bookmark.create':'已收藏书签',
    'bookmark.move':'已移动','bookmark.update':'已重命名'};
   const message=labels[action.type]+'「'+found.title+'」 · '+pathOf(tree,found.id);
   observations.push({kind,status:'VERIFIED_WRITE',title:found.title,path:pathOf(tree,found.id)});
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
 return {messages,observations,tree,refs:nextRefs};
}
