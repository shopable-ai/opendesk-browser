(function(){
'use strict';
// Only the public SDK may talk to Chrome. No direct chrome.*, Host RPC,
// synthetic bookmark database, private permission prompt or remote endpoints.
const model=globalThis.BookmarkR2Model;
const FULL='browser.bookmarks.full';
const METHODS=Object.freeze(['getTree','get','search','create','update','move','remove','removeTree',
  'observe.start','observe.read','observe.stop']);
const named=method=>'browser.bookmarks.'+method;
const fail=(code,message)=>{const error=new Error(message);error.code=code;throw error};
const stale=()=>fail('E_BOOKMARK_STALE','书签在其他 Chrome 窗口发生变化，请刷新后重试');
function create(sdk){
  const method=key=>key.split('.').reduce((value,part)=>value?.[part],sdk?.bookmarks);
  async function probe(){
    if(!sdk?.capabilities?.list||!sdk?.capabilities?.getStatus||!sdk?.bookmarks)
      return {ready:false,code:'E_SDK_MISSING',reason:'已安装工具环境未提供正式 OpenDeskSDK.browser'};
    let rows;
    try{rows=await sdk.capabilities.list()}catch(error){
      return {ready:false,code:error?.code||'E_SDK_STATUS',reason:'SDK 能力状态暂不可验证，不会读取书签'};
    }
    if(!Array.isArray(rows))
      return {ready:false,code:'E_SDK_STATUS',reason:'SDK 未提供可信的能力清单'};
    const missing=[],unapproved=[],unscoped=[];
    for(const name of METHODS){
      const op=named(name),row=rows.find(item=>item?.operation===op);
      if(!row||typeof method(name)!=='function'){missing.push(op);continue}
      if(!row.requiredCapabilities?.includes(FULL)){unscoped.push(op);continue}
      if(row.status?.callableNow!==true)
        unapproved.push({operation:op,reason:row.status?.reasonCode||'E_PERMISSION_REQUIRED'});
    }
    if(missing.length||unscoped.length||unapproved.length){
      const summary=[
        missing.length?'缺少公开接口 '+missing.length+' 项':'',
        unscoped.length?'未绑定独立 Full Bookmarks 权限 '+unscoped.length+' 项':'',
        unapproved.length?'未授权或不可调用 '+unapproved.length+' 项':''
      ].filter(Boolean).join('；');
      return {ready:false,code:'E_R11_BOOKMARKS_INCOMPLETE',reason:summary||
        'Full Bookmarks SDK 尚未完成',missing,unscoped,unapproved};
    }
    return {ready:true};
  }
  async function requireReady(operation){
    const gate=await probe();
    if(!gate.ready)fail(gate.code,gate.reason);
    if(operation){
      const status=await sdk.capabilities.getStatus({operation:named(operation)});
      if(!status?.callableNow)fail(status?.reasonCode||'E_BOOKMARK_PERMISSION',
        '完整书签访问权限已失效或需要重新授权');
      if(!status.requiredCapabilities?.includes(FULL))
        fail('E_BOOKMARK_SCOPE','接口未绑定独立 Full Bookmarks 权限');
    }
  }
  async function load(){
    await requireReady('getTree');
    // Do not normalize an authorization error, null, or truncated data into [].
    const roots=await sdk.bookmarks.getTree();
    return model.bookmarkTree(roots);
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
  async function createBookmark({title,url,parentId}){
    const name=model.displayName(title),target=model.asHttpUrl(url),tree=await load();
    model.parentFolder(tree,parentId);await requireReady('create');
    return sdk.bookmarks.create({title:name,url:target,parentId});
  }
  async function update({expected,title,url}){
    const {item}=await currentNode(expected),changes={title:model.displayName(title)};
    if(!model.isFolder(item)&&url!==item.url)changes.url=model.asHttpUrl(url);
    await requireReady('update');
    // Same Chrome name/positional signature. R11 Host must independently
    // check the expected node snapshot immediately before the native write.
    return sdk.bookmarks.update(item.id,changes);
  }
  async function move({expected,parentId}){
    const {item,tree}=await currentNode(expected);
    model.parentFolder(tree,parentId);
    if(model.isFolder(item)&&model.isDescendant(tree,parentId,item.id))
      fail('E_SCHEMA','文件夹不能移动到自身或子目录');
    await requireReady('move');
    return sdk.bookmarks.move(item.id,{parentId});
  }
  async function remove({expected,confirmed=false,expectedDescendantSignatures=null}){
    if(confirmed!==true)fail('E_CONFIRM','删除前必须获得用户明确确认');
    const {item,tree}=await currentNode(expected);
    if(model.isFolder(item)){
      const current=model.descendantSignatures(tree,item.id);
      if(!Array.isArray(expectedDescendantSignatures)||
         JSON.stringify(current)!==JSON.stringify([...expectedDescendantSignatures].sort()))stale();
      // Browser getTree + removeTree is NOT an atomic CAS. Keep folder deletion
      // disabled until R11 defines its Host-side conditional delete ticket.
      fail('E_R11_DELETE_GUARD_REQUIRED','SDK R11 尚未提供文件夹删除的 Host 端并发校验；未执行删除');
    }
    await requireReady('remove');
    return sdk.bookmarks.remove(item.id);
  }
  return Object.freeze({probe,load,createFolder,createBookmark,update,move,remove,
    // R11 must supply an authorized, bounded events session before real watch.
    hasNativeChangeStream:false});
}
globalThis.BookmarkR2Service=Object.freeze({create,FULL,METHODS});
})();
