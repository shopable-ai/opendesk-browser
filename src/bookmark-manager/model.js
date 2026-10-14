// First-party Chrome bookmark tree projections. No network, SDK, or separate bookmark database.
export const BOOKMARK_PERMISSION=Object.freeze({permissions:['bookmarks']});
export const asHttpUrl=value=>{
  if(typeof value!=='string'||value.length>8192||value.trim()!==value)throw new TypeError('请输入有效的 HTTP(S) 网址');
  let result;try{result=new URL(value)}catch{throw new TypeError('请输入有效的 HTTP(S) 网址')}
  if(!['http:','https:'].includes(result.protocol)||result.username||result.password)
    throw new TypeError('只能收藏普通 HTTP(S) 网页');
  return result.href;
};
export const displayName=value=>{
  const name=String(value??'').trim();
  if(!name||name.length>256||/[\u0000-\u001f\u007f]/.test(name))throw new TypeError('名称不能为空，最多 256 个字符');
  return name;
};
export const bookmarkTree=roots=>{
  if(!Array.isArray(roots)||!roots.length)throw new Error('Chrome 未返回有效的书签树');
  const byId=new Map(),children=new Map(),rootIds=new Set();
  const walk=(node,parent=null,managedAncestor=false,depth=0)=>{
    if(depth>100||typeof node?.id!=='string'||byId.has(node.id))throw new Error('Chrome 书签树无效');
    const managed=managedAncestor||node.unmodifiable==='managed'||node.folderType==='managed';
    const value={...node,locked:managed||!parent||!parent.parentId,parentId:node.parentId??parent?.id??null};
    byId.set(node.id,value);
    if(!parent)rootIds.add(node.id);
    if(parent){const list=children.get(parent.id)||[];list.push(node.id);children.set(parent.id,list)}
    if(Array.isArray(node.children))node.children.forEach(child=>walk(child,value,managed,depth+1));
  };
  roots.forEach(node=>walk(node));
  return {roots:rootIds,byId,children};
};
// Project all reachable rows, but render only a bounded slice. Never hide later
// bookmarks permanently behind a fixed DOM cap; search traverses the whole tree.
export const projectBookmarkRows=(tree,{expanded=new Set(),search='',limit=200}={})=>{
  if(!Number.isSafeInteger(limit)||limit<1)throw new RangeError('书签显示数量无效');
  const rows=[];let total=0;
  const include=(item,level)=>{total++;if(rows.length<limit)rows.push({item,level})};
  const term=String(search).trim().toLocaleLowerCase();
  if(term){
    for(const item of tree.byId.values()){
      if(tree.roots.has(item.id))continue;
      if((String(item.title||'')+' '+String(item.url||'')).toLocaleLowerCase().includes(term))
        include(item,0);
    }
  }else{
    const visit=(id,level)=>{
      const item=tree.byId.get(id);if(!item)return;
      if(!tree.roots.has(id)){
        include(item,level);
        if(!expanded.has(id))return;
      }
      for(const childId of tree.children.get(id)||[])visit(childId,level+1);
    };
    for(const id of tree.roots)visit(id,-1);
  }
  return {rows,total};
};
export const isFolder=node=>Boolean(node&&!Object.hasOwn(node,'url'));
export const isDescendant=(tree,nodeId,ancestor)=>{
  let node=tree.byId.get(nodeId);const visited=new Set();
  while(node&&!visited.has(node.id)){
    if(node.id===ancestor)return true;
    visited.add(node.id);node=tree.byId.get(node.parentId);
  }
  return false;
};
export const editableNode=(tree,id,{folder=false}={})=>{
  const node=tree.byId.get(id);
  if(!node||node.locked)throw new Error('书签不存在或受 Chrome 管理策略保护');
  if(folder&&!isFolder(node))throw new Error('请选择文件夹');
  return node;
};
export const parentFolder=(tree,id)=>{
  const parent=tree.byId.get(id);
  if(!parent||!isFolder(parent)||tree.roots.has(parent.id)||parent.unmodifiable==='managed'||
    (parent.locked&&!tree.roots.has(parent.parentId)))
    throw new Error('目标文件夹不存在或受保护');
  return parent;
};
export const nodeSignature=node=>JSON.stringify([node?.id,node?.parentId,node?.title,node?.url??null,node?.unmodifiable??null]);
