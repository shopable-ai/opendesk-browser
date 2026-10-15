(function(){
'use strict';
// Full Bookmarks consumer only. This sandbox never talks to chrome.*, internal RPC,
// an owned-bookmark alias, or an untrusted bookmark cache.
const model=globalThis.BookmarkR2Model;
const FULL='browser.bookmarks.full';
const METHODS=Object.freeze(['getTree','get','search','create','update','move','remove',
  'prepareRemoveTree','removeTree','observe.start','observe.read','observe.stop']);
const named=method=>'browser.bookmarks.'+method;
const fail=(code,message)=>{throw Object.assign(new Error(message),{code})};
const stale=()=>fail('E_BOOKMARK_STALE','书签或子项在其他窗口发生变化，请刷新后重试');
const SESSION=/^[A-Za-z0-9_-]{16,160}$/;
const MAX_NODES=20000,MAX_PAGES=2048,MAX_TREE_CHARS=8000000;
function create(sdk){
  const method=key=>key.split('.').reduce((value,part)=>value?.[part],sdk?.bookmarks);
  async function probe(){
    if(!sdk?.capabilities?.list||!sdk?.capabilities?.getStatus||!sdk?.bookmarks)
      return {ready:false,code:'E_SDK_MISSING',reason:'已安装工具环境未提供正式 OpenDeskSDK.browser'};
    let rows;
    try{rows=await sdk.capabilities.list()}catch{
      return {ready:false,code:'E_SDK_STATUS',reason:'SDK 能力状态暂不可验证，不会读取书签'};
    }
    if(!Array.isArray(rows))
      return {ready:false,code:'E_SDK_STATUS',reason:'SDK 未提供可信的能力清单'};
    const missing=[],unapproved=[],unscoped=[],readingDenied=[];
    for(const name of METHODS){
      const op=named(name),row=rows.find(item=>item?.operation===op);
      if(!row||typeof method(name)!=='function'){missing.push(op);continue}
      if(!row.requiredCapabilities?.includes(FULL)){unscoped.push(op);continue}
      if(row.status?.callableNow!==true){
        const rowStatus={operation:op,reason:row.status?.reasonCode||'E_PERMISSION_REQUIRED'};
        // Authorization of a write/observer is not the prerequisite for reading
        // an already-granted tree; each action still rechecks its own status.
        if(name==='getTree')readingDenied.push(rowStatus);
        else unapproved.push(rowStatus);
      }
    }
    if(missing.length||unscoped.length||readingDenied.length)
      return {ready:false,code:missing.length||unscoped.length?
        'E_R11_BOOKMARKS_INCOMPLETE':'E_BOOKMARK_PERMISSION',reason:[
        missing.length?'缺少公开接口 '+missing.length+' 项':'',
        unscoped.length?'未绑定独立 Full Bookmarks 权限 '+unscoped.length+' 项':'',
        readingDenied.length?'当前读取权限未获批准':''
      ].filter(Boolean).join('；'),missing,unscoped,unapproved,readingDenied};
    return {ready:true,unapproved};
  }
  async function requireReady(operation){
    const gate=await probe();
    if(!gate.ready)fail(gate.code,gate.reason);
    if(operation){
      let status;
      try{status=await sdk.capabilities.getStatus({operation:named(operation)})}
      catch{fail('E_SDK_STATUS','完整书签权限状态不可核验，不会访问书签')}
      // probe() already verified independent Full scope in the complete
      // capability list; getStatus() deliberately sends only a small receipt.
      if(status.callableNow!==true)
        fail(status.reasonCode||'E_BOOKMARK_PERMISSION','完整书签访问权限未授予或已失效');
    }
  }
  async function load(){
    await requireReady('getTree');
    // R11 contract: one bounded snapshot, cursor pages, opaque snapshotRef.
    // A small complete Chrome-shaped getTree array is also acceptable.
    const first=await sdk.bookmarks.getTree({limit:80});
    if(Array.isArray(first)){
      const tree=model.bookmarkTree(first);
      await requireReady('getTree');
      return tree;
    }
    const all=[],seen=new Set(),cursors=new Set();
    let page=first,snapshotRef=null,chars=0;
    for(let count=0;count<MAX_PAGES;count++){
      if(!page||typeof page!=='object'||!Array.isArray(page.nodes)||
        !SESSION.test(page.snapshotRef||''))
        fail('E_BOOKMARK_RESPONSE','SDK 未提供完整、有界的书签树快照');
      if(snapshotRef===null)snapshotRef=page.snapshotRef;
      if(page.snapshotRef!==snapshotRef)stale();
      if(page.nodes.length>200)fail('E_LIMIT','书签页超过安全上限');
      for(const node of page.nodes){
        if(typeof node?.id!=='string'||!node.id||seen.has(node.id))stale();
        seen.add(node.id);all.push(node);
        chars+=JSON.stringify(node)?.length||0;
        if(all.length>MAX_NODES||chars>MAX_TREE_CHARS)
          fail('E_LIMIT','书签树超出客户端安全上限');
      }
      const cursor=page.nextCursor;
      if(cursor==null){
        if(!all.length)fail('E_BOOKMARK_RESPONSE','SDK 未返回有效的书签根节点');
        await requireReady('getTree');
        return model.bookmarkFlatTree(all,{snapshotRef});
      }
      if(typeof cursor!=='string'||!cursor||cursor.length>512||cursors.has(cursor)||
        page.nodes.length===0)fail('E_BOOKMARK_RESPONSE','书签分页游标无效或循环');
      cursors.add(cursor);
      await requireReady('getTree');
      page=await sdk.bookmarks.getTree({cursor,limit:80});
    }
    fail('E_LIMIT','书签分页次数超过安全上限');
  }
  async function currentNode(expected){
    const tree=await load();
    const item=model.editableNode(tree,String(expected?.id||''));
    if(!expected||model.nodeSignature(item)!==model.nodeSignature(expected))stale();
    return {item,tree};
  }
  async function createFolder({title,parentId}){
    const name=model.displayName(title),tree=await load();
    model.parentFolder(tree,parentId);await requireReady('create');
    return sdk.bookmarks.create({title:name,parentId});
  }
  async function createBookmark({title,url,parentId,sourcePage}){
    const name=model.displayName(title),target=model.asHttpUrl(url),tree=await load();
    model.parentFolder(tree,parentId);
    if(sourcePage){
      if(typeof sourcePage.documentRef!=='string'||!SESSION.test(sourcePage.documentRef)||
        typeof sourcePage.tabRef!=='string'||!SESSION.test(sourcePage.tabRef)||
        sourcePage.url!==target)
        fail('E_DOCUMENT_BINDING_REQUIRED','当前网页没有可信的 Tab/Document 绑定');
    }
    await requireReady('create');
    return sdk.bookmarks.create({title:name,url:target,parentId,
      ...(sourcePage?{sourcePage:{url:target,tabRef:sourcePage.tabRef,
        documentRef:sourcePage.documentRef}}:{})});
  }
  async function update({expected,title,url}){
    const {item}=await currentNode(expected);
    const changes={title:model.displayName(title)};
    if(!model.isFolder(item)&&url!==item.url)changes.url=model.asHttpUrl(url);
    await requireReady('update');
    // SDK single-object contract; the trusted Host must compare 'expected'
    // against the native node again immediately before modifying Chrome.
    return sdk.bookmarks.update({id:item.id,changes,expected:model.nodePrecondition(item)});
  }
  async function move({expected,parentId}){
    const {item,tree}=await currentNode(expected);
    model.parentFolder(tree,parentId);
    if(model.isFolder(item)&&model.isDescendant(tree,parentId,item.id))
      fail('E_SCHEMA','文件夹不能移动到自身或子目录');
    await requireReady('move');
    return sdk.bookmarks.move({id:item.id,destination:{parentId},
      expected:model.nodePrecondition(item)});
  }
  async function remove({expected,confirmed=false,expectedDescendantSignatures=null}){
    if(confirmed!==true)fail('E_CONFIRM','删除前必须获得用户明确确认');
    const {item,tree}=await currentNode(expected),precondition=model.nodePrecondition(item);
    if(model.isFolder(item)){
      const current=model.descendantSignatures(tree,item.id);
      if(!Array.isArray(expectedDescendantSignatures)||
        JSON.stringify(current)!==JSON.stringify([...expectedDescendantSignatures].sort()))stale();
      if(current.length){
        // No client-only getTree + removeTree TOCTOU. The R11 trusted Host must
        // bind this immutable tree snapshot to a short-lived, one-use ticket,
        // and compare the entire native subtree under its write guard.
        if(!SESSION.test(tree.snapshotRef||''))
          fail('E_R11_DELETE_GUARD_REQUIRED','SDK 未提供 Host 书签快照，拒绝删除非空文件夹');
        await requireReady('prepareRemoveTree');
        const prepared=await sdk.bookmarks.prepareRemoveTree({
          id:item.id,snapshotRef:tree.snapshotRef,expected:precondition,
          descendantCount:current.length
        });
        if(!SESSION.test(prepared?.ticket||'')||prepared?.targetId!==item.id||
          prepared?.descendantCount!==current.length||
          !Number.isFinite(prepared?.expiresAt)||prepared.expiresAt<=Date.now())
          fail('E_R11_DELETE_GUARD_REQUIRED','Host 未返回可核验的目录删除票据');
        await requireReady('removeTree');
        return sdk.bookmarks.removeTree({id:item.id,ticket:prepared.ticket});
      }
    }
    await requireReady('remove');
    return sdk.bookmarks.remove({id:item.id,expected:precondition});
  }
  async function watchStart(){
    await requireReady('observe.start');
    const row=await sdk.bookmarks.observe.start({maxEvents:100,durationMs:30000});
    if(!SESSION.test(row?.sessionRef||'')||typeof row?.cursor!=='string'||
      !Number.isFinite(row?.expiresAt)||row.expiresAt<=Date.now())
      fail('E_BOOKMARK_EVENT','SDK 未返回有效的有限期书签事件会话');
    return {sessionRef:row.sessionRef,cursor:row.cursor,expiresAt:row.expiresAt};
  }
  async function watchRead(session){
    if(!SESSION.test(session?.sessionRef||'')||typeof session.cursor!=='string')
      fail('E_BOOKMARK_EVENT','书签事件会话无效');
    await requireReady('observe.read');
    const data=await sdk.bookmarks.observe.read({
      sessionRef:session.sessionRef,cursor:session.cursor,limit:50
    });
    if(!Array.isArray(data?.events)||data.events.length>50||
      typeof data.nextCursor!=='string'||!Number.isFinite(data.expiresAt)||
      !Number.isSafeInteger(data.gapCount)||data.gapCount<0||
      !Number.isSafeInteger(data.droppedCount)||data.droppedCount<0)
      fail('E_BOOKMARK_EVENT','书签事件回执无效，必须重新同步书签树');
    if(data.gapCount>0||data.droppedCount>0)
      fail('E_BOOKMARK_EVENT_GAP','书签事件存在缺口，必须重新读取完整树');
    return {events:data.events,nextCursor:data.nextCursor,expiresAt:data.expiresAt};
  }
  async function watchStop(session){
    if(!SESSION.test(session?.sessionRef||''))return;
    // Cleanup may be denied after revocation; expiry/Host lifecycle still
    // bounds the old session. Never recover authority just to close it.
    await sdk?.bookmarks?.observe?.stop?.({sessionRef:session.sessionRef});
  }
  return Object.freeze({probe,load,createFolder,createBookmark,update,move,remove,
    watchStart,watchRead,watchStop});
}
globalThis.BookmarkR2Service=Object.freeze({create,FULL,METHODS});
})();