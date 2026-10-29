(function(){
'use strict';
// Direct R1.3 tree-model migration. Chrome IDs and managed markers are preserved.
// This is sandbox-only projection code, never an authority or a second DB.
const fail=message=>{throw new Error(message)};
const asHttpUrl=value=>{
  if(typeof value!=='string'||value.length>2048||value.trim()!==value)fail('请输入有效的 HTTP(S) 网址');
  let result;try{result=new URL(value)}catch{fail('请输入有效的 HTTP(S) 网址')}
  if(!['http:','https:'].includes(result.protocol)||result.username||result.password)fail('只能收藏普通 HTTP(S) 网页');
  return result.href;
};
const displayName=value=>{
  const name=String(value??'').trim();
  if(!name||name.length>256||/[\u0000-\u001f\u007f]/.test(name))fail('名称不能为空，最多 256 个字符');
  return name;
};
const bookmarkTree=(roots,{snapshotRef=null}={})=>{
  if(!Array.isArray(roots)||!roots.length)fail('Chrome 未返回有效的书签树；不能当作空树');
  if(roots.length!==1)fail('Chrome 书签树缺少唯一根节点');
  const byId=new Map(),children=new Map(),rootIds=new Set();
  const walk=(node,parent=null,managedAncestor=false,depth=0)=>{
    if(depth>100||byId.size>=20000||!node||typeof node!=='object'||
      Array.isArray(node)||typeof node.id!=='string'||!node.id||byId.has(node.id))
      fail('Chrome 书签树无效或超出展示安全上限');
    const folder=!Object.hasOwn(node,'url');
    if(parent){
      if(node.parentId!=null&&node.parentId!==parent.id)
        fail('Chrome 书签树父目录不一致');
    }else if(node.parentId!=null||!folder)fail('Chrome 书签根节点无效');
    // getTree must include each folder's children, including empty folders.
    // Never accept a partial hierarchy and silently omit user bookmarks.
    if(folder&&!Array.isArray(node.children))
      fail('Chrome 书签文件夹缺少完整子项');
    if(!folder&&(typeof node.url!=='string'||Object.hasOwn(node,'children')))
      fail('Chrome 书签节点类型无效');
    const managed=managedAncestor||node.unmodifiable==='managed'||node.folderType==='managed';
    const value={...node,locked:managed||!parent||!parent.parentId,parentId:node.parentId??parent?.id??null};
    byId.set(node.id,value);
    if(!parent)rootIds.add(node.id);
    if(parent){const list=children.get(parent.id)||[];list.push(node.id);children.set(parent.id,list)}
    if(folder)node.children.forEach(child=>walk(child,value,managed,depth+1));
  };
  roots.forEach(node=>walk(node));
  return {roots:rootIds,byId,children,snapshotRef};
};
// Assemble a Host-paginated flat snapshot without silently omitting any child,
// accepting a duplicate ID, or inventing roots from a truncated response.
const bookmarkFlatTree=(nodes,{snapshotRef}={})=>{
  if(!Array.isArray(nodes)||!nodes.length||nodes.length>20000||
    typeof snapshotRef!=='string'||!snapshotRef)fail('无效的 Chrome 书签快照');
  const byId=new Map(),roots=[];
  for(const source of nodes){
    if(!source||typeof source!=='object'||Array.isArray(source)||
      typeof source.id!=='string'||!source.id||byId.has(source.id)||
      Object.hasOwn(source,'children'))
      fail('分页书签数据包含重复或无效节点');
    if(source.parentId!=null&&typeof source.parentId!=='string')
      fail('分页书签父目录无效');
    const node={...source};
    if(!Object.hasOwn(node,'url'))node.children=[];
    byId.set(node.id,node);
  }
  for(const node of byId.values()){
    if(node.parentId==null){roots.push(node);continue}
    const parent=byId.get(node.parentId);
    if(!parent||!Array.isArray(parent.children))fail('分页书签缺少合法的父目录');
    parent.children.push(node);
  }
  if(roots.length!==1)fail('分页书签缺少唯一根节点');
  const visited=new Set();
  const visit=(node,active,depth)=>{
    if(active.has(node.id)||visited.has(node.id)||depth>100)
      fail('分页书签存在循环或过深目录');
    visited.add(node.id);active.add(node.id);
    for(const child of node.children||[])visit(child,active,depth+1);
    active.delete(node.id);
    if(Array.isArray(node.children))
      node.children.sort((a,b)=>(a.index??0)-(b.index??0));
  };
  for(const root of roots)visit(root,new Set(),0);
  if(visited.size!==nodes.length)fail('分页书签存在未连接节点');
  return bookmarkTree(roots,{snapshotRef});
};
const projectBookmarkRows=(tree,{expanded=new Set(),search='',limit=200}={})=>{
  if(!Number.isSafeInteger(limit)||limit<1)fail('书签显示数量无效');
  const rows=[];let total=0;
  const include=(item,level)=>{total++;if(rows.length<limit)rows.push({item,level})};
  const term=String(search).trim().toLocaleLowerCase();
  if(term){
    for(const item of tree.byId.values()){
      if(tree.roots.has(item.id))continue;
      if((String(item.title||'')+' '+String(item.url||'')).toLocaleLowerCase().includes(term))include(item,0);
    }
  }else{
    const visit=(id,level)=>{
      const item=tree.byId.get(id);if(!item)return;
      if(!tree.roots.has(id)){include(item,level);if(!expanded.has(id))return}
      for(const childId of tree.children.get(id)||[])visit(childId,level+1);
    };
    for(const id of tree.roots)visit(id,-1);
  }
  return {rows,total};
};
const isFolder=node=>Boolean(node&&!Object.hasOwn(node,'url'));
const isDescendant=(tree,nodeId,ancestor)=>{
  let node=tree.byId.get(nodeId);const visited=new Set();
  while(node&&!visited.has(node.id)){if(node.id===ancestor)return true;visited.add(node.id);node=tree.byId.get(node.parentId)}
  return false;
};
const editableNode=(tree,id,{folder=false}={})=>{
  const node=tree.byId.get(id);
  if(!node||node.locked)fail('书签不存在或受 Chrome 管理策略保护');
  if(folder&&!isFolder(node))fail('请选择文件夹');
  return node;
};
const parentFolder=(tree,id)=>{
  const parent=tree.byId.get(id);
  if(!parent||!isFolder(parent)||tree.roots.has(parent.id)||parent.unmodifiable==='managed'||
     parent.folderType==='managed'||(parent.locked&&!tree.roots.has(parent.parentId)))
    fail('目标文件夹不存在或受保护');
  return parent;
};
const nodePrecondition=node=>({
  id:node?.id,parentId:node?.parentId??null,index:node?.index??null,
  title:node?.title??'',url:node?.url??null,
  unmodifiable:node?.unmodifiable??null,folderType:node?.folderType??null
});
const nodeSignature=node=>JSON.stringify([
  node?.id,node?.parentId,node?.index??null,node?.title,node?.url??null,node?.unmodifiable??null,node?.folderType??null
]);
const descendantSignatures=(tree,folderId)=>[...tree.byId.values()]
  .filter(node=>node.id!==folderId&&isDescendant(tree,node.id,folderId))
  .map(node=>nodeSignature(node)).sort();
globalThis.BookmarkR2Model=Object.freeze({asHttpUrl,displayName,bookmarkTree,projectBookmarkRows,
  isFolder,isDescendant,editableNode,parentFolder,nodePrecondition,nodeSignature,descendantSignatures,bookmarkFlatTree});
})();
