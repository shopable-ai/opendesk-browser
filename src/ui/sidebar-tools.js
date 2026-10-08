import {SIDEBAR_TOOL_PROTOCOL,SIDEBAR_TOOL_STORE,MAX_INSTALLED_TOOLS,
  sidebarToolStorageKey,validateSidebarToolPackage} from './sidebar-tools/package.js';

// Trusted Side Panel shell for untrusted, opaque-origin UI documents.
// No user code, markup, or CSS is ever inserted into this extension document.
export function createSidebarTools({api=globalThis.chrome,doc=globalThis.document,
  currentPageTarget,taskWorkbench}) {
  const get=id=>doc.getElementById(id);
  const list=get('sidebar-tool-tabs'), taskSurface=doc.querySelector('#workbench-tasks .tasks-surface');
  const display=get('sidebar-tool-display'), frameRoot=get('sidebar-tool-frame');
  const status=get('sidebar-tool-status'), fileInput=get('sidebar-tool-file');
  const installButton=get('sidebar-tool-install'), removeButton=get('sidebar-tool-remove');
  const title=get('sidebar-tool-title');
  let installed=[], pending=null, active=null, frame=null, instance=null, disposed=false;
  let requestCount=0, busy=false;
  const listeners=[];
  const listen=(node,type,fn)=>{
    node.addEventListener(type,fn);
    listeners.push(()=>node.removeEventListener(type,fn));
  };
  const notice=(message,problem=false)=>{
    if(disposed)return;
    status.textContent=message;status.dataset.state=problem?'error':'info';
  };
  const sameInstance=(source,token)=>!disposed&&active&&frame&&frame.contentWindow===source&&instance===token;
  const toolById=id=>installed.find(row=>row.id===id);
  function destroyFrame() {
    if(frame){frame.onload=null;frame.remove();frame=null;}
    instance=null;requestCount=0;
    frameRoot.replaceChildren();
  }
  function render() {
    if(disposed)return;
    list.replaceChildren();
    const taskButton=doc.createElement('button');
    taskButton.type='button';taskButton.textContent='任务';
    taskButton.setAttribute('role','tab');taskButton.setAttribute('aria-selected',String(!active));
    taskButton.addEventListener('click',()=>closeTool());
    list.append(taskButton);
    for(const row of installed) {
      const button=doc.createElement('button');
      button.type='button';button.textContent=row.title;button.title=row.description;
      button.setAttribute('role','tab');button.setAttribute('aria-selected',String(active?.id===row.id));
      button.addEventListener('click',()=>openTool(row.id));
      list.append(button);
    }
    display.hidden=!active;taskSurface.hidden=!!active;
    title.textContent=active ? active.title+' · v'+active.version : '';
    removeButton.disabled=!active || busy;
    if(doc.documentElement?.dataset)doc.documentElement.dataset.opendeskTool=active?'active':'tasks';
  }
  function closeTool() {
    destroyFrame();active=null;render();
  }
  function openTool(id) {
    if(disposed)return;
    const tool=toolById(id);
    if(!tool){notice('找不到已安装的工具',true);return;}
    destroyFrame();
    active=tool;instance=crypto.randomUUID();
    const token=instance;
    frame=doc.createElement('iframe');
    frame.title=tool.title+'（独立受限界面）';
    frame.className='sidebar-tool-iframe';
    frame.referrerPolicy='no-referrer';
    frame.src=api.runtime.getURL('sidebar-tools/sandbox.html');
    frame.onload=()=>{
      if(sameInstance(frame.contentWindow,token)) frame.contentWindow.postMessage({
        protocol:SIDEBAR_TOOL_PROTOCOL,kind:'load',instance:token,tool},'*');
    };
    frameRoot.append(frame);render();notice('正在打开「'+tool.title+'」…');
  }
  async function dispatch(operation,payload,tool,source,token) {
    if(!tool.capabilities.includes(operation.startsWith('storage.')?'storage.local':
       operation==='currentPage.info'?'currentPage.read':
       operation==='tasks.open'?'tasks.open':'__unapproved__'))
      throw new Error('此工具没有被批准使用该能力');
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
      closeTool();
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
    const invalidated=active&&(!selected||JSON.stringify(selected)!==JSON.stringify(active));
    if(invalidated)closeTool();
    installed=fresh;render();
    if(invalidated)notice('当前工具已在其他窗口更新或卸载，旧界面已关闭。');
  };
  if(api.storage.onChanged?.addListener){
    api.storage.onChanged.addListener(onToolStorageChanged);
    listeners.push(()=>api.storage.onChanged.removeListener(onToolStorageChanged));
  }
  async function loadInstalled() {
    const result=await api.storage.local.get(SIDEBAR_TOOL_STORE);
    if(disposed)return;
    installed=admittedList(result[SIDEBAR_TOOL_STORE]);
    render();
  }
  async function chooseFile() {
    const file=fileInput.files?.[0];fileInput.value='';
    pending=null;installButton.disabled=true;
    if(!file)return;
    if(file.size>320000)throw new Error('工具包超过 320 KB');
    const packageValue=validateSidebarToolPackage(JSON.parse(await file.text()));
    if(disposed)return;
    pending=packageValue;installButton.disabled=false;
    notice('待安装：'+pending.title+' · v'+pending.version+'；申请能力：'+
      (pending.capabilities.join('、')||'无')+'。导入不自动运行，点击「确认安装」后仍需打开工具。');
  }
  async function install() {
    if(!pending||busy||disposed)return;
    busy=true;installButton.disabled=true;
    try{
      const candidate=validateSidebarToolPackage(pending);
      const exists=toolById(candidate.id);
      if(!exists&&installed.length>=MAX_INSTALLED_TOOLS)throw new Error('最多安装 '+MAX_INSTALLED_TOOLS+' 个工具');
      const next=exists?installed.map(row=>row.id===candidate.id?candidate:row):[...installed,candidate];
      await api.storage.local.set({[SIDEBAR_TOOL_STORE]:next});
      installed=next;pending=null;closeTool();
      notice('已安装「'+candidate.title+'」；点击工具选项卡后运行其界面。');
    }finally{busy=false;installButton.disabled=!pending;render();}
  }
  async function remove() {
    if(!active||busy)return;
    const item=active;
    if(!globalThis.confirm('卸载「'+item.title+'」并删除此工具保存的数据？'))return;
    busy=true;
    try{
      const next=installed.filter(row=>row.id!==item.id);
      // Close the sandbox before changing the permission/storage ownership.
      closeTool();
      await api.storage.local.set({[SIDEBAR_TOOL_STORE]:next});
      await api.storage.local.remove(sidebarToolStorageKey(item.id));
      installed=next;render();notice('已卸载「'+item.title+'」');
    }finally{busy=false;render();}
  }
  const action=(fn)=>()=>Promise.resolve().then(fn).catch(error=>notice(
    (error?.code||'E_TOOL')+'：'+String(error?.message||error).slice(0,240),true));
  listen(fileInput,'change',action(chooseFile));
  listen(installButton,'click',action(install));
  listen(removeButton,'click',action(remove));
  listen(window,'message',onMessage);
  loadInstalled().catch(error=>notice('工具列表读取失败：'+error.message,true));
  render();
  return Object.freeze({openTool,closeTool,dispose(){
    if(disposed)return;
    destroyFrame();disposed=true;
    for(const release of listeners.splice(0))release();
    queued.clear();
  }});
}
