import {BOOKMARK_PERMISSION,asHttpUrl,displayName,bookmarkTree,isFolder,isDescendant,
  editableNode,parentFolder,nodeSignature} from './model.js';

const requireGrant=async api=>{
  if(!api?.bookmarks?.getTree||await api.permissions?.contains(BOOKMARK_PERMISSION)!==true){
    const error=new Error('请先授权 Chrome 书签访问');error.code='E_BOOKMARK_PERMISSION';throw error;
  }
};
const stale=()=>{const error=new Error('书签在其他窗口发生变化，请刷新后重试');error.code='E_BOOKMARK_STALE';return error};

export function createBookmarkService(api){
  if(!api)throw new TypeError('Chrome API is required');
  const load=async()=>{
    await requireGrant(api);
    return bookmarkTree(await api.bookmarks.getTree());
  };
  const assertFresh=(tree,expected)=>{
    const node=editableNode(tree,String(expected?.id||''));
    if(!expected||nodeSignature(node)!==nodeSignature(expected))throw stale();
    return node;
  };
  return Object.freeze({
    hasPermission:()=>api.permissions?.contains(BOOKMARK_PERMISSION),
    load,
    async createFolder({title,parentId}){
      displayName(title);
      const tree=await load();parentFolder(tree,parentId);
      await requireGrant(api);
      return api.bookmarks.create({title:displayName(title),parentId});
    },
    async createBookmark({title,url,parentId}){
      const name=displayName(title),target=asHttpUrl(url);
      const tree=await load();parentFolder(tree,parentId);
      await requireGrant(api);
      return api.bookmarks.create({title:name,url:target,parentId});
    },
    async update({expected,title,url}){
      const tree=await load(),node=assertFresh(tree,expected);
      const changes={title:displayName(title)};
      // Preserve non-HTTP bookmarks when only their title changes; never rewrite them to arbitrary URLs.
      if(!isFolder(node)&&url!==node.url)changes.url=asHttpUrl(url);
      await requireGrant(api);
      return api.bookmarks.update(node.id,changes);
    },
    async move({expected,parentId}){
      const tree=await load(),node=assertFresh(tree,expected);
      parentFolder(tree,parentId);
      if(isFolder(node)&&isDescendant(tree,parentId,node.id))throw new Error('文件夹不能移动到自身或子目录');
      await requireGrant(api);
      return api.bookmarks.move(node.id,{parentId});
    },
    async remove({expected,confirmed=false,expectedDescendantIds=null}){
      if(confirmed!==true)throw new Error('删除需要确认');
      const tree=await load(),node=assertFresh(tree,expected);
      await requireGrant(api);
      if(isFolder(node)){
        // A folder may gain children in another window after confirmation. Fail closed on any subtree drift.
        const actual=[...tree.byId.keys()].filter(id=>id!==node.id&&isDescendant(tree,id,node.id)).sort();
        if(!Array.isArray(expectedDescendantIds)||JSON.stringify([...expectedDescendantIds].sort())!==JSON.stringify(actual))
          throw stale();
        return api.bookmarks.removeTree(node.id);
      }
      return api.bookmarks.remove(node.id);
    },
    onChange(callback){
      const events=['onCreated','onRemoved','onChanged','onMoved','onChildrenReordered','onImportEnded'];
      const active=[];
      for(const key of events){
        const emitter=api.bookmarks?.[key];
        if(!emitter?.addListener)continue;
        const listener=()=>callback('bookmark');emitter.addListener(listener);active.push([emitter,listener]);
      }
      const onPermission=()=>callback('permission');
      api.permissions?.onRemoved?.addListener(onPermission);
      return ()=>{
        for(const [emitter,listener] of active)emitter.removeListener?.(listener);
        api.permissions?.onRemoved?.removeListener(onPermission);
      };
    }
  });
}
