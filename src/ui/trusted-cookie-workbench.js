// Native extension UI only. Never forward Cookie values to installed tool iframes,
// Page SDK, drafts, diagnostics, background logs or persistent storage.
import {BROWSER_HOST_PROTOCOL} from '../framework/sdk/browser-contract.js';

const error=(code,message)=>Object.assign(new Error(message||code),{code});
const cookieKey=row=>JSON.stringify([row.name,row.domain,row.path,row.storeId,row.partitionKey??null]);
export function createTrustedCookieWorkbench({
  api=globalThis.chrome,currentPageTarget,doc=globalThis.document,hostInstanceId
}={}){
  const panel=doc?.getElementById?.('trusted-cookie-panel');
  const readButton=doc?.getElementById?.('trusted-cookie-read');
  const rowsNode=doc?.getElementById?.('trusted-cookie-rows');
  const statusNode=doc?.getElementById?.('trusted-cookie-status');
  const targetNode=doc?.getElementById?.('trusted-cookie-target');
  const nameNode=doc?.getElementById?.('trusted-cookie-name');
  const valueNode=doc?.getElementById?.('trusted-cookie-value');
  const pathNode=doc?.getElementById?.('trusted-cookie-path');
  const saveButton=doc?.getElementById?.('trusted-cookie-save');
  const watchStart=doc?.getElementById?.('trusted-cookie-watch-start');
  const watchStatusButton=doc?.getElementById?.('trusted-cookie-watch-status-button');
  const watchRead=doc?.getElementById?.('trusted-cookie-watch-read');
  const watchStop=doc?.getElementById?.('trusted-cookie-watch-stop');
  const watchStatusNode=doc?.getElementById?.('trusted-cookie-watch-status');
  const watchEventsNode=doc?.getElementById?.('trusted-cookie-watch-events');
  if(!panel||!readButton||!rowsNode||!statusNode||!targetNode||!nameNode||!valueNode||!pathNode||!saveButton||
     !watchStart||!watchStatusButton||!watchRead||!watchStop||!watchStatusNode||!watchEventsNode)
    return Object.freeze({dispose(){}});
  let disposed=false,busy=false,rows=[],documentRef=null,lastKnownTarget=null,pending=null,generation=0;
  let watchSession=null;
  const listeners=[],rowListeners=[],subscriptions=[];
  const listenRow=(node,name,fn)=>{node.addEventListener(name,fn);rowListeners.push(()=>node.removeEventListener?.(name,fn));};
  const listen=(node,name,fn)=>{node.addEventListener(name,fn);listeners.push(()=>node.removeEventListener?.(name,fn));};
  const setStatus=value=>{statusNode.textContent=value;};
  const clearList=()=>{
    for(const off of rowListeners.splice(0))off();
    rows=[];rowsNode.replaceChildren();
  };
  const clearPending=()=>{pending=null;saveButton.textContent='写入 Cookie';};
  const syncWatchControls=()=>{
    const active=Boolean(watchSession);
    watchStart.disabled=busy||active;
    watchStatusButton.disabled=busy||!active;
    watchRead.disabled=busy||!active;
    watchStop.disabled=busy||!active;
  };
  const clearWatch=(message='未监听。')=>{
    watchSession=null;
    watchEventsNode.replaceChildren();
    watchStatusNode.textContent=message;
    syncWatchControls();
  };
  const reset=(message='选择已打开的网页并点击读取；默认隐藏 Cookie 值。')=>{
    documentRef=null;generation++;clearPending();clearList();clearWatch();valueNode.value='';setStatus(message);
  };
  const targetShape=target=>Object.freeze({
    tabId:target.tabId,windowId:target.windowId,
    documentId:target.documentId,url:target.url,origin:target.origin
  });
  const same=(a,b)=>Boolean(a&&b&&['tabId','windowId','documentId','url','origin'].every(key=>a[key]===b[key]));
  const visible=()=>!disposed&&panel.open;
  const page=async()=>{
    await currentPageTarget.ready;
    const captured=currentPageTarget.capture();
    await currentPageTarget.revalidate(captured);
    return targetShape(captured);
  };
  const send=async payload=>{
    const response=await api.runtime.sendMessage({
      protocol:BROWSER_HOST_PROTOCOL,kind:'host',hostInstanceId,...payload
    });
    if(!response?.ok)throw error(String(response?.error?.code||'E_BROWSER'),
      String(response?.error?.message||'Browser Host rejected operation'));
    return response.data;
  };
  async function trusted(op,args,target){
    const receipt=await send({operation:'browser.cookies.approve',targetOperation:op,
      targetArgs:args,document:target});
    if(typeof receipt?.approvalRef!=='string')throw error('E_BROWSER','Cookie approval receipt missing');
    // Revalidate selection between approval and execution; once effect starts
    // never silently retry a Chrome write after an unknown outcome.
    const latest=await page();
    if(!same(latest,target))throw error('E_DOCUMENT_CHANGED');
    return send({operation:'browser.cookies.execute',approvalRef:receipt.approvalRef});
  }
  const codeMessage=err=>{
    const code=String(err?.code||'E_BROWSER');
    return ({
      E_DOCUMENT_CHANGED:'网页已切换；操作取消，请重新选择并点击读取',
      E_DOCUMENT_STALE:'网页已切换；操作取消',
      E_CHROME_PERMISSION_REQUIRED:'Chrome Cookie 或当前网站权限不足；请先在网站权限中恢复访问',
      E_OUTCOME_UNKNOWN:'结果未知，未自动重试；请手动重新读取核对',
      E_COOKIE_NOT_FOUND:'Cookie 已不存在，请重新读取',
      E_COOKIE_AMBIGUOUS:'存在同名但 Path 或分区不同的 Cookie；请先读取完整列表，选择精确条目',
      E_COOKIE_STORE:'当前网页没有可确认的唯一 Cookie 存储区',
      E_LIMIT:'匹配 Cookie 太多，已拒绝超量读取',
      E_USER_GESTURE_REQUIRED:'操作批准已过期；请重新点击操作',
      E_BROWSER:'浏览器未能完成 Cookie 操作'
    })[code]||('操作未完成（'+code.slice(0,65)+'），未自动重试');
  };
  function updateTarget(state){
    const current=state?.status==='available'?targetShape(state):null;
    // A pending two-click WRITE must be tied to the document already shown,
    // even if the user never fetched a Cookie list on that document.
    if(!current||lastKnownTarget&&!same(current,lastKnownTarget)||
       documentRef&&!same(current,documentRef))
      reset('网页或文档已变化；敏感数据已清除，请重新读取。');
    lastKnownTarget=current;
    targetNode.textContent=current?.origin??'尚未选择 HTTP(S) 网页';
  }
  const unsubscribe=currentPageTarget.subscribe(updateTarget);
  subscriptions.push(unsubscribe);
  function render(){
    for(const off of rowListeners.splice(0))off();
    rowsNode.replaceChildren();
    if(!rows.length){const p=doc.createElement('p');p.className='hint';p.textContent='当前 URL 没有匹配的 Cookie。';rowsNode.append(p);return;}
    for(const cookie of rows){
      const item=doc.createElement('div');item.className='trusted-cookie-item';
      const details=doc.createElement('div');details.className='trusted-cookie-item-copy';
      const head=doc.createElement('strong');head.textContent=cookie.name||'（空名称）';
      const meta=doc.createElement('small');meta.textContent=
        [cookie.domain||'',cookie.path||'/',cookie.httpOnly?'HttpOnly':'',cookie.secure?'Secure':''].filter(Boolean).join(' · ');
      const secret=doc.createElement('code');secret.textContent='••••••';secret.className='trusted-cookie-value';
      details.append(head,meta,secret);
      const controls=doc.createElement('div');controls.className='trusted-cookie-item-actions';
      const show=doc.createElement('button');show.type='button';show.className='od-button od-button--secondary';
      show.textContent='显示';show.setAttribute('aria-label','显示当前 Cookie 值（敏感信息）');
      const del=doc.createElement('button');del.type='button';del.className='od-button od-button--secondary';
      del.textContent='删除';del.setAttribute('aria-label','删除当前 Cookie');
      let revealed=false;
      listenRow(show,'click',event=>{
        if(!event.isTrusted||disposed)return;
        revealed=!revealed;secret.textContent=revealed?cookie.value:'••••••';
        show.textContent=revealed?'隐藏':'显示';
      });
      listenRow(del,'click',event=>{
        if(!event.isTrusted||disposed||busy)return;
        const key=cookieKey(cookie);
        if(!pending||pending.kind!=='remove'||pending.key!==key){
          clearPending();pending={kind:'remove',key};
          del.textContent='确认删除';
          setStatus('再次点击“确认删除”以删除这一条 Cookie；操作不能撤销。');
          return;
        }
        clearPending();del.textContent='删除';
        void execute('browser.cookies.remove',{
          name:cookie.name,domain:cookie.domain,path:cookie.path,
          storeId:cookie.storeId,...(cookie.partitionKey?{partitionKey:cookie.partitionKey}:{})
        },'已提交删除。请重新点击读取以确认最新状态。');
      });
      controls.append(show,del);item.append(details,controls);rowsNode.append(item);
    }
  }
  async function execute(op,args,success){
    if(disposed||busy||!visible())return;
    busy=true;readButton.disabled=true;saveButton.disabled=true;
    const started=++generation;
    try{
      const target=await page();
      if(disposed||started!==generation)return;
      const result=await trusted(op,args,target);
      if(disposed||started!==generation)return;
      if(op==='browser.cookies.getAll'){
        if(!Array.isArray(result?.cookies))throw error('E_BROWSER','Invalid Cookie read result');
        documentRef=target;
        // Retain secrets in this trusted document only while the visible page
        // and exact document are unchanged. Do not store, export or log.
        rows=result.cookies;render();
        setStatus('读取 '+rows.length+' 条匹配当前 URL 的 Cookie；未覆盖同站其他路径或所有分区。');
      }else{
        reset(success);valueNode.value='';
      }
    }catch(err){if(!disposed&&started===generation){reset(codeMessage(err));}}
    finally{busy=false;readButton.disabled=false;saveButton.disabled=false;}
  }
  // An installed tool never sees these Host-only observation handles or events.
  // The trusted Side Panel requires an explicit user click for every action.
  async function watchAction(kind){
    if(disposed||busy||!visible())return;
    busy=true;
    readButton.disabled=true;saveButton.disabled=true;syncWatchControls();
    const started=++generation;
    try{
      const target=await page();
      if(disposed||started!==generation)return;
      const previous=watchSession;
      if(kind!=='start'&&(!previous||!same(previous.target,target)))
        throw error('E_SESSION_EXPIRED','Cookie observation is no longer bound to this document');
      const op='browser.cookies.observe.'+kind;
      const args=kind==='start'?{durationMs:15000,maxEvents:40}:
        kind==='read'?{sessionRef:previous.sessionRef,cursor:previous.cursor,limit:40}:
          {sessionRef:previous.sessionRef};
      const receipt=await trusted(op,args,target);
      if(disposed||started!==generation)return;
      if(kind==='start'){
        if(typeof receipt?.sessionRef!=='string'||!Number.isFinite(receipt.expiresAt)||
           receipt.status!=='running')throw error('E_BROWSER','Invalid Cookie observer receipt');
        watchSession={sessionRef:receipt.sessionRef,target,cursor:'0',expiresAt:receipt.expiresAt};
        watchEventsNode.replaceChildren();
        watchStatusNode.textContent='已开始监听当前网页 Cookie 变化，最多 15 秒。';
      }else if(kind==='getStatus'){
        if(receipt?.sessionRef!==previous.sessionRef||receipt.status!=='running')
          throw error('E_SESSION_EXPIRED');
        watchStatusNode.textContent='监听中 · 缓存 '+receipt.bufferedCount+' 条 · 丢弃 '+
          receipt.droppedCount+' 条（尚未读取事件）。';
      }else if(kind==='read'){
        if(receipt?.sessionRef!==previous.sessionRef||!Array.isArray(receipt.events)||
           receipt.events.length>40||typeof receipt.nextCursor!=='string')
          throw error('E_BROWSER','Invalid bounded Cookie event read');
        previous.cursor=receipt.nextCursor;
        for(const item of receipt.events){
          // Never render event.value, Cookie payloads, arbitrary JSON or HTML.
          const row=doc.createElement('div');
          row.className='trusted-cookie-watch-event';
          row.textContent=(item.removed?'删除':'更新')+' · '+
            String(item.name||'').slice(0,256)+' · '+
            String(item.domain||'').slice(0,256)+
            String(item.path||'').slice(0,512)+' · '+
            String(item.cause||'').slice(0,40);
          watchEventsNode.append(row);
        }
        while(watchEventsNode.children?.length>40)watchEventsNode.firstElementChild?.remove();
        watchStatusNode.textContent='读取 '+receipt.events.length+' 条变化；'+
          '累计丢弃 '+receipt.droppedCount+' 条，游标缺口 '+receipt.gapCount+
          ' 条。事件不含 Cookie 值。';
      }else if(kind==='stop'){
        if(receipt?.stopped!==true)throw error('E_BROWSER','Cookie observer stop not confirmed');
        clearWatch('已停止监听，会话和已显示事件已从此界面清除。');
      }
    }catch(cause){
      if(!disposed&&started===generation)clearWatch('监听未继续：'+codeMessage(cause));
    }finally{
      busy=false;readButton.disabled=false;saveButton.disabled=false;syncWatchControls();
    }
  }
  for(const [node,kind] of [[watchStart,'start'],[watchStatusButton,'getStatus'],
    [watchRead,'read'],[watchStop,'stop']])
    listen(node,'click',event=>{if(event.isTrusted&&!busy)void watchAction(kind);});
  listen(readButton,'click',event=>{
    if(!event.isTrusted||busy)return;
    clearPending();void execute('browser.cookies.getAll',{},'');
  });
  listen(saveButton,'click',event=>{
    if(!event.isTrusted||disposed||busy)return;
    const name=nameNode.value,value=valueNode.value,path=pathNode.value||'/';
    if(!name||name.length>256||value.length>4096||!path.startsWith('/')||path.length>512){
      setStatus('请输入不超过 256 字的名称、4096 字的值，以及以 / 开头的路径。');return;
    }
    const fingerprint=JSON.stringify([name,value,path]);
    if(!pending||pending.kind!=='set'||pending.fingerprint!==fingerprint){
      pending={kind:'set',fingerprint};
      saveButton.textContent='确认写入';setStatus('再次点击“确认写入”，将修改当前网页的 Cookie。');return;
    }
    clearPending();
    void execute('browser.cookies.set',{cookie:{name,value,path,
      secure:currentPageTarget.snapshot?.origin?.startsWith('https://')===true,sameSite:'lax'}},'Cookie 写入已提交。请重新点击读取以确认。');
  });
  listen(nameNode,'input',clearPending);
  listen(valueNode,'input',clearPending);
  listen(pathNode,'input',clearPending);
  listen(panel,'toggle',()=>{
    if(!panel.open)reset('已关闭 Cookie 管理；敏感值已从此界面清除。');
  });
  return Object.freeze({dispose(){
    if(disposed)return;disposed=true;generation++;clearPending();clearList();clearWatch();valueNode.value='';
    for(const unsubscribe of subscriptions)unsubscribe();
    for(const off of listeners)off();
  }});
}
