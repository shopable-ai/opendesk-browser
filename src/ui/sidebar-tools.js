import {SIDEBAR_TOOL_PROTOCOL,SIDEBAR_TOOL_STORE,MAX_INSTALLED_TOOLS,
  sidebarToolStorageKey,validateSidebarToolPackage} from './sidebar-tools/package.js';

// Trusted Side Panel shell for untrusted, opaque-origin UI documents.
// No user code, markup, or CSS is ever inserted into this extension document.
export function createSidebarTools({api=globalThis.chrome,doc=globalThis.document,
  currentPageTarget,taskWorkbench,lockManager=globalThis.navigator?.locks}) {
  const get=id=>doc.getElementById(id);
  const list=get('sidebar-tool-list'), listView=get('sidebar-tool-list-view');
  const empty=get('sidebar-tool-empty'), backButton=get('sidebar-tool-back');
  const display=get('sidebar-tool-display'), frameRoot=get('sidebar-tool-frame');
  const status=get('sidebar-tool-status'), fileInput=get('sidebar-tool-file');
  const importTrigger=get('sidebar-tool-import-trigger'), importPanel=get('sidebar-tool-import');
  const importClose=get('sidebar-tool-import-close'), preview=get('sidebar-tool-preview');
  const previewTitle=get('sidebar-tool-preview-title'), previewVersion=get('sidebar-tool-preview-version');
  const previewDescription=get('sidebar-tool-preview-description');
  const previewCapabilities=get('sidebar-tool-preview-capabilities'), previewFile=get('sidebar-tool-preview-file');
  const installButton=get('sidebar-tool-install'), removeButton=get('sidebar-tool-remove');
  const title=get('sidebar-tool-title');
  let installed=[], pending=null, active=null, frame=null, instance=null, disposed=false;
  let requestCount=0, busy=false, fileSelection=0;
  let visible=false, listRequested=false, selectedToolId=null;
  const listeners=[];
  const listen=(node,type,fn)=>{
    node.addEventListener(type,fn);
    listeners.push(()=>node.removeEventListener(type,fn));
  };
  const notice=(message,problem=false)=>{
    if(disposed)return;
    status.textContent=message;status.dataset.state=problem?'error':'info';
    status.hidden=!message;
  };
  const capabilities=Object.freeze({
    'storage.local':'保存此工具的数据',
    'currentPage.read':'读取当前网页标题和地址',
    'tasks.open':'打开已安装任务'
  });
  function clearImport() {
    fileSelection++;pending=null;
    fileInput.value='';preview.hidden=true;installButton.disabled=true;
  }
  function setImportOpen(open) {
    importPanel.hidden=!open;
    importTrigger.setAttribute('aria-expanded',String(open));
    if(!open)clearImport();
  }
  const sameInstance=(source,token)=>!disposed&&active&&frame&&frame.contentWindow===source&&instance===token;
  const toolById=id=>installed.find(row=>row.id===id);
  // chrome.storage may reorder object properties; compare the validated schema values.
  const samePackage=(a,b)=>['format','id','version','title','description','html','css','js']
    .every(name=>a[name]===b[name])&&JSON.stringify(a.capabilities)===JSON.stringify(b.capabilities);
  const locked=(name,work)=>{
    if(!lockManager?.request)throw new Error('当前浏览器无法安全协调工具存储');
    return lockManager.request('opendesk.sidebar-tools:'+name,work);
  };
  const assertSession=(source,token)=>{
    if(!sameInstance(source,token))throw new Error('工具界面已经切换');
  };
  function destroyFrame() {
    if(frame){frame.onload=null;frame.remove();frame=null;}
    instance=null;requestCount=0;
    frameRoot.replaceChildren();
  }
  function render() {
    if(disposed)return;
    list.replaceChildren();
    for(const row of installed) {
      const button=doc.createElement('button');
      button.type='button';button.className='sidebar-tool-item';button.title=row.description;
      const copy=doc.createElement('span');copy.className='sidebar-tool-item-copy';
      const heading=doc.createElement('strong');heading.textContent=row.title;
      const subtitle=doc.createElement('small');subtitle.textContent=row.description;
      copy.append(heading,subtitle);
      const version=doc.createElement('span');version.className='sidebar-tool-item-version';
      version.textContent='v'+row.version;
      const arrow=doc.createElement('span');arrow.textContent='›';arrow.setAttribute('aria-hidden','true');
      button.append(copy,version,arrow);
      button.addEventListener('click',()=>openTool(row.id));
      list.append(button);
    }
    empty.hidden=installed.length!==0;
    listView.hidden=Boolean(active);
    display.hidden=!active;
    title.textContent=active ? active.title+' · v'+active.version : '';
    removeButton.disabled=!active || busy;
    taskWorkbench.setToolActive?.(Boolean(visible && active));
    if(doc.documentElement?.dataset)doc.documentElement.dataset.opendeskTool=visible && active?'active':'list';
  }
  // Revoking a hidden iframe also revokes its session token and pending responses.
  function suspendTool() {destroyFrame();active=null;render();}
  function closeTool() {
    if(busy)return;
    listRequested=true;setImportOpen(false);suspendTool();
  }
  function openTool(id) {
    if(disposed||busy||!visible)return;
    const tool=toolById(id);
    if(!tool){notice('找不到已安装的工具',true);return;}
    destroyFrame();active=tool;selectedToolId=id;listRequested=false;
    instance=crypto.randomUUID();
    const token=instance;
    let initialized=false;
    frame=doc.createElement('iframe');
    frame.title=tool.title+'（独立受限界面）';
    frame.className='sidebar-tool-iframe';
    frame.referrerPolicy='no-referrer';
    frame.src=api.runtime.getURL('sidebar-tools/sandbox.html');
    frame.onload=()=>{
      if(!frame||!sameInstance(frame.contentWindow,token))return;
      if(initialized){
        listRequested=true;suspendTool();
        notice('工具页面发生导航，旧界面已关闭。',true);return;
      }
      initialized=true;
      frame.contentWindow.postMessage({
        protocol:SIDEBAR_TOOL_PROTOCOL,kind:'load',instance:token,tool},'*');
    };
    frameRoot.append(frame);render();notice('正在打开「'+tool.title+'」…');
  }
  function setVisible(next) {
    if(disposed)return;
    visible=Boolean(next);
    if(!visible){suspendTool();return;}
    if(!active && !listRequested && installed.length)
      openTool((toolById(selectedToolId)||installed[0]).id);
    else render();
  }
  async function dispatch(operation,payload,tool,source,token) {
    assertSession(source,token);
    if(!tool.capabilities.includes(operation.startsWith('storage.')?'storage.local':
       operation==='currentPage.info'?'currentPage.read':
       operation==='tasks.open'?'tasks.open':'__unapproved__'))
      throw new Error('此工具没有被批准使用该能力');
    return locked('tool:'+tool.id,async()=>{
      assertSession(source,token);
      const owned=(await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE];
      if(!admittedList(owned).some(row=>samePackage(row,tool)))
        throw new Error('工具已更新或卸载');
      assertSession(source,token);
      if(operation==='currentPage.info'){
        const target=currentPageTarget?.snapshot;
        return target?.status==='available'
          ?{status:'available',title:String(target.title||'').slice(0,512),url:String(target.url||'').slice(0,4096)}
          :{status:'unavailable',message:String(target?.message||'当前没有可用的普通网页').slice(0,250)};
      }
      if(operation==='tasks.open'){
        if(typeof payload?.taskId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,59}$/.test(payload.taskId))
          throw new Error('任务标识无效');
        const opened=taskWorkbench.focusInstalledTask(payload.taskId);
        if(!opened)throw new Error('该任务未安装或未启用');
        suspendTool();
        return {opened:true};
      }
      if(operation!=='storage.get'&&operation!=='storage.set')throw new Error('不支持此操作');
      const key=payload?.key;
      if(typeof key!=='string'||!/^[a-zA-Z][a-zA-Z0-9._-]{0,59}$/.test(key))
        throw new Error('存储字段名称无效');
      const namespace=sidebarToolStorageKey(tool.id);
      const stored=(await api.storage.local.get(namespace))[namespace]||{};
      if(!stored||typeof stored!=='object'||Array.isArray(stored))throw new Error('工具数据无效');
      if(operation==='storage.get')return {value:Object.hasOwn(stored,key)?stored[key]:null};
      let encoded;
      try{encoded=JSON.stringify(payload.value);}
      catch{throw new Error('只能保存可序列化数据');}
      if(typeof encoded!=='string'||new TextEncoder().encode(encoded).byteLength>8192)
        throw new Error('单项工具数据超过 8 KB');
      if(!sameInstance(source,token))throw new Error('工具界面已经切换');
      const next={...stored,[key]:JSON.parse(encoded)};
      if(Object.keys(next).length>32||new TextEncoder().encode(JSON.stringify(next)).byteLength>32768)
        throw new Error('工具数据超过 32 KB');
      await api.storage.local.set({[namespace]:next});
      return {saved:true};
    });
  }
  const queued=new Map();
  function onMessage(event) {
    // Sandbox pages have opaque origin; checking the claimed id/origin alone is insufficient.
    if(event.origin!=='null'||!sameInstance(event.source,event.data?.instance)||
       event.data?.protocol!==SIDEBAR_TOOL_PROTOCOL||event.data?.toolId!==active.id)return;
    const message=event.data;
    if(message.kind==='status'){
      notice(active.title+'：'+String(message.message||'').slice(0,240),message.state==='error');
      return;
    }
    if(message.kind!=='request'||typeof message.requestId!=='string'||message.requestId.length>32||
       typeof message.operation!=='string'||++requestCount>120)return;
    const token=instance,source=event.source,tool=active;
    let bytes;
    try{bytes=JSON.stringify(message).length;}catch{return;}
    if(bytes>12000)return;
    const reply=(ok,result,error)=>{
      if(sameInstance(source,token))source.postMessage({
        protocol:SIDEBAR_TOOL_PROTOCOL,kind:'response',instance:token,toolId:tool.id,
        requestId:message.requestId,ok,...(ok?{result}:{error:{message:String(error?.message||error).slice(0,250)}})
      },'*');
    };
    // Serialize mutations for each tool; concurrent set operations cannot overwrite each other.
    const previous=queued.get(tool.id)||Promise.resolve();
    const work=previous.catch(()=>{}).then(()=>dispatch(message.operation,message.payload,tool,source,token));
    if(message.operation==='storage.set')queued.set(tool.id,work);
    work.then(result=>reply(true,result),error=>reply(false,null,error));
    work.finally(()=>{if(queued.get(tool.id)===work)queued.delete(tool.id);}).catch(()=>{});
  }
  function admittedList(rows) {
    if(!Array.isArray(rows))return [];
    const seen=new Set();
    return rows.slice(0,MAX_INSTALLED_TOOLS).flatMap(row=>{
      try{
        const accepted=validateSidebarToolPackage(row);
        if(seen.has(accepted.id))return [];
        seen.add(accepted.id);return [accepted];
      }catch{return [];}
    });
  }
  // Other Side Panels may update/uninstall a tool. Revoke the old iframe immediately.
  const onToolStorageChanged=(changes,area)=>{
    if(disposed||area!=='local'||!Object.hasOwn(changes||{},SIDEBAR_TOOL_STORE))return;
    const fresh=admittedList(changes[SIDEBAR_TOOL_STORE]?.newValue);
    const selected=active&&fresh.find(row=>row.id===active.id);
    const invalidated=active&&(!selected||!samePackage(selected,active));
    if(invalidated){listRequested=true;suspendTool();}
    installed=fresh;
    if(selectedToolId && !toolById(selectedToolId)){selectedToolId=null;listRequested=true;}
    render();
    if(invalidated)notice('工具已在其他窗口更新或卸载，旧界面已关闭。',true);
  };
  if(api.storage.onChanged?.addListener){
    api.storage.onChanged.addListener(onToolStorageChanged);
    listeners.push(()=>api.storage.onChanged.removeListener(onToolStorageChanged));
  }
  async function loadInstalled() {
    const result=await api.storage.local.get(SIDEBAR_TOOL_STORE);
    if(disposed)return;
    installed=admittedList(result[SIDEBAR_TOOL_STORE]);
    if(visible&&!listRequested&&!active&&installed.length)
      openTool((toolById(selectedToolId)||installed[0]).id);
    else render();
  }
  async function chooseFile() {
    const selection=++fileSelection,file=fileInput.files?.[0];fileInput.value='';
    pending=null;installButton.disabled=true;preview.hidden=true;
    if(!file||disposed||busy)return;
    notice('');
    if(file.size>320000)throw new Error('工具包超过 320 KB');
    let packageValue;
    try{packageValue=validateSidebarToolPackage(JSON.parse(await file.text()));}
    catch(error){throw new Error(error instanceof SyntaxError?'文件不是有效的工具包 JSON':error.message);}
    if(disposed||selection!==fileSelection)return;
    pending=packageValue;
    previewTitle.textContent=pending.title;
    previewVersion.textContent='v'+pending.version;
    previewDescription.textContent=pending.description;
    previewCapabilities.textContent=pending.capabilities.length
      ?pending.capabilities.map(value=>capabilities[value]||value).join('、'):'无需额外能力';
    previewFile.textContent='文件：'+(file.name||'本地 JSON');
    installButton.textContent=installed.some(row=>row.id===pending.id)?'更新并打开':'安装并打开';
    preview.hidden=false;installButton.disabled=false;
  }
  async function install() {
    if(!pending||busy||disposed)return;
    busy=true;installButton.disabled=true;fileInput.disabled=true;importClose.disabled=true;
    let accepted=null;
    try{
      const candidate=validateSidebarToolPackage(pending);
      await locked('tool:'+candidate.id,()=>locked('catalog',async()=>{
        if(disposed)return;
        installed=admittedList((await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE]);
        const exists=toolById(candidate.id);
        if(!exists&&installed.length>=MAX_INSTALLED_TOOLS)
          throw new Error('最多安装 '+MAX_INSTALLED_TOOLS+' 个工具');
        const next=exists?installed.map(row=>row.id===candidate.id?candidate:row):[...installed,candidate];
        await api.storage.local.set({[SIDEBAR_TOOL_STORE]:next});
        installed=next;accepted=candidate;
      }));
    }finally{
      busy=false;fileInput.disabled=false;importClose.disabled=false;
      installButton.disabled=!pending;render();
    }
    if(!accepted||disposed)return;
    selectedToolId=accepted.id;listRequested=false;
    setImportOpen(false);
    if(visible)openTool(accepted.id);
    else render();
    notice('已安装并打开「'+accepted.title+'」');
  }
  async function remove() {
    if(!active||busy)return;
    const item=active;
    if(!globalThis.confirm('卸载「'+item.title+'」并删除此工具保存的数据？'))return;
    busy=true;
    try{
      // Close the sandbox before changing the permission/storage ownership.
      listRequested=true;suspendTool();
      await locked('tool:'+item.id,()=>locked('catalog',async()=>{
        installed=admittedList((await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE]);
        const next=installed.filter(row=>row.id!==item.id);
        await api.storage.local.set({[SIDEBAR_TOOL_STORE]:next});
        await api.storage.local.remove(sidebarToolStorageKey(item.id));
        installed=next;if(selectedToolId===item.id)selectedToolId=null;
        render();notice('已卸载「'+item.title+'」');
      }));
    }finally{busy=false;render();}
  }
  const action=(fn)=>()=>Promise.resolve().then(fn).catch(error=>notice(
    (error?.code||'E_TOOL')+'：'+String(error?.message||error).slice(0,240),true));
  setImportOpen(false);
  notice('');
  listen(importTrigger,'click',()=>{
    if(busy)return;
    setImportOpen(importPanel.hidden);notice('');
  });
  listen(importClose,'click',()=>{
    if(busy)return;
    setImportOpen(false);notice('');importTrigger.focus?.();
  });
  listen(fileInput,'change',action(chooseFile));
  listen(installButton,'click',action(install));
  listen(backButton,'click',()=>{closeTool();importTrigger.focus?.({preventScroll:true});});
  listen(removeButton,'click',action(remove));
  listen(window,'message',onMessage);
  loadInstalled().catch(error=>notice('工具列表读取失败：'+error.message,true));
  render();
  return Object.freeze({openTool,closeTool,setVisible,dispose(){
    if(disposed)return;
    destroyFrame();fileSelection++;disposed=true;visible=false;
    for(const release of listeners.splice(0))release();
    queued.clear();
  }});
}
