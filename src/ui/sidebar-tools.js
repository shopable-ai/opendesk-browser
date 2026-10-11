import {SIDEBAR_TOOL_PROTOCOL,SIDEBAR_TOOL_STORE,MAX_INSTALLED_TOOLS,
  sidebarToolStorageKey,validateSidebarToolPackage} from './sidebar-tools/package.js';
import {toolPageHref} from './sidebar-tools/navigation.js';
import {READING_TOC_SITE_STORE,READING_TOC_TOOL_ID,READING_TOC_PROTOCOL,TOC_CAPABILITY,
  websiteOrigin,grantedOrigins,changeTocGrant} from '../reading-toc/policy.js';
import {CLIP_SITE_STORE,CLIP_CAPABILITY,CLIP_PROTOCOL,CLIP_OPERATIONS,changeClipGrant} from '../page-clip/policy.js';

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
  const fileError=get('sidebar-tool-file-error'), updatePanel=get('sidebar-tool-update');
  const updateVersions=get('sidebar-tool-update-versions');
  const updateCapabilities=get('sidebar-tool-update-capabilities');
  const updateWarning=get('sidebar-tool-update-warning');
  const title=get('sidebar-tool-title'),openTabButton=get('sidebar-tool-open-tab');
  const readOnlyBanner=get('sidebar-tool-readonly-banner');
  const officialRow=get('sidebar-tool-official'),officialButton=get('sidebar-tool-official-install');
  const officialClipRow=get('sidebar-tool-official-clip'),officialClipButton=get('sidebar-tool-official-clip-install');
  let siteGrants={},siteEpoch=0,lastTocRead=0,expandedSiteTool='';
  let clipGrants={},clipSiteEpoch=0;
  let installed=[], pending=null, pendingBaseline=null, active=null, frame=null, instance=null, disposed=false, readOnlyPreview=false, previewDirty=false;
  let requestCount=0,requestWindow=Date.now(), busy=false, fileSelection=0, catalogEpoch=0;
  let visible=false,toolDirty=false,toolSaving=false;
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
    'tasks.open':'打开已安装任务',
    'page.toc':'读取已授权网站的目录、定位章节和显示网页目录',
    'page.clip':'按点击读取单独授权网站的正文或选区',
    'user.export':'复制文本或下载 Markdown 文件'
  });
  // Numeric version comparison without precision loss on large valid semver components.
  function versionOrder(a,b) {
    const left=a.split('.'),right=b.split('.');
    for(let i=0;i<3;i++){
      if(left[i].length!==right[i].length)return left[i].length>right[i].length?1:-1;
      if(left[i]!==right[i])return left[i]>right[i]?1:-1;
    }
    return 0;
  }
  const readableCapability=id=>capabilities[id]||id;
  const addedCapabilities=(next,prior)=>next.capabilities.filter(id=>!prior.capabilities.includes(id));
  function resetReview() {
    pending=null;pendingBaseline=null;
    preview.hidden=true;updatePanel.hidden=true;installButton.disabled=true;
  }
  function setFileError(message='') {
    fileError.textContent=message;fileError.hidden=!message;
    fileInput.setAttribute('aria-invalid',String(Boolean(message)));
  }
  function clearImport() {
    fileSelection++;resetReview();
    fileInput.value='';setFileError();
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
    toolDirty=false;toolSaving=false;
    if(frame){frame.onload=null;frame.remove();frame=null;}
    instance=null;requestCount=0;requestWindow=Date.now();lastTocRead=0;
    frameRoot.replaceChildren();
  }
  function render() {
    if(disposed)return;
    const focusedId=doc.activeElement?.dataset?.sidebarToolId;
    const focusedAction=doc.activeElement?.dataset?.sidebarToolAction;
    let restoreFocus=null;
    list.replaceChildren();
    for(const row of installed) {
      const button=doc.createElement('button');
      button.type='button';button.className='sidebar-tool-item';button.title=row.description;
      button.dataset.sidebarToolId=row.id;button.dataset.sidebarToolAction='open';
      const copy=doc.createElement('span');copy.className='sidebar-tool-item-copy';
      const heading=doc.createElement('strong');heading.textContent=row.title;
      const subtitle=doc.createElement('small');subtitle.textContent=row.description;
      copy.append(heading,subtitle);
      const version=doc.createElement('span');version.className='sidebar-tool-item-version';
      version.textContent='v'+row.version;
      const arrow=doc.createElement('span');arrow.className='sidebar-tool-item-open-icon';arrow.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 5h6v6m0-6-9 9M19 13v6H5V5h6"/></svg>';arrow.setAttribute('aria-hidden','true');
      button.setAttribute('aria-label','打开工具「'+row.title+'」');
      button.append(copy,version,arrow);
      button.addEventListener('click',()=>openTool(row.id));
      // Management must not require executing third-party code in a sandbox.
      const item=doc.createElement('div');
      item.className='sidebar-tool-row';item.dataset.sidebarToolId=row.id;
      const uninstall=doc.createElement('button');
      uninstall.type='button';uninstall.className='sidebar-tool-list-remove od-icon-button';
      uninstall.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 4h4m-8 3 1 13h10l1-13M10 11v5m4-5v5"/></svg>';uninstall.title='卸载「'+row.title+'」';
      uninstall.dataset.sidebarToolId=row.id;uninstall.dataset.sidebarToolAction='remove';
      uninstall.setAttribute('aria-label','卸载「'+row.title+'」并删除其数据');
      uninstall.disabled=busy;
      uninstall.addEventListener('click',action(()=>remove(row.id)));
      if(row.capabilities.includes(TOC_CAPABILITY)||row.capabilities.includes(CLIP_CAPABILITY)) {
        const isClip=row.capabilities.includes(CLIP_CAPABILITY);
        const grants=isClip?clipGrants:siteGrants;
        const origin=websiteOrigin(currentPageTarget?.snapshot?.url);
        const enabled=origin&&grantedOrigins(grants,row.id).includes(origin);
        const toggle=doc.createElement('button');toggle.type='button';
        toggle.className='sidebar-tool-site od-icon-button';toggle.dataset.enabled=String(Boolean(enabled));
        toggle.dataset.sidebarToolId=row.id;toggle.dataset.sidebarToolAction='site';
        toggle.textContent=enabled?'◉':'◎';
        toggle.title=enabled?(isClip?'撤销当前网站的剪藏权限':'停用当前网站的目录'):
          (isClip?'允许剪藏当前网站':'启用当前网站的目录');
        toggle.setAttribute('aria-label',toggle.title);
        toggle.disabled=busy||!origin;
        toggle.addEventListener('click',action(()=>isClip?toggleClipSite(row.id):toggleTocSite(row.id)));
        const origins=grantedOrigins(grants,row.id);
        const manage=doc.createElement('button');manage.type='button';
        manage.className='sidebar-tool-site-manage od-icon-button';
        manage.dataset.sidebarToolId=row.id;manage.dataset.sidebarToolAction='sites';
        manage.textContent='⋯';
        manage.title='管理已授权网站（'+origins.length+'）';
        manage.setAttribute('aria-label',manage.title);
        manage.setAttribute('aria-expanded',String(expandedSiteTool===row.id));
        manage.setAttribute('aria-controls','sidebar-tool-sites-'+row.id);
        manage.addEventListener('click',()=>{
          expandedSiteTool=expandedSiteTool===row.id?'':row.id;
          render();
        });
        item.append(button,toggle,manage,uninstall);
        const panel=doc.createElement('div');
        panel.id='sidebar-tool-sites-'+row.id;
        panel.className='sidebar-tool-site-panel';
        panel.hidden=expandedSiteTool!==row.id;
        if(origins.length===0){
          const emptySites=doc.createElement('span');
          emptySites.textContent='没有已授权的网站';
          panel.append(emptySites);
        }
        for(const site of origins){
          const entry=doc.createElement('div');entry.className='sidebar-tool-site-entry';
          const label=doc.createElement('span');
          label.textContent=site;label.title=site;
          const revoke=doc.createElement('button');
          revoke.type='button';revoke.className='sidebar-tool-site-revoke';
          revoke.textContent='撤销';
          revoke.setAttribute('aria-label','撤销 '+site+' 的'+(isClip?'剪藏':'目录')+'访问权限');
          revoke.title=revoke.getAttribute?.('aria-label')||'撤销网站权限';
          revoke.disabled=busy;
          revoke.addEventListener('click',action(()=>isClip?revokeClipOrigin(row.id,site):revokeTocOrigin(row.id,site)));
          entry.append(label,revoke);panel.append(entry);
        }
        item.append(panel);
      } else item.append(button,uninstall);
      const inTab=doc.createElement('button');
      inTab.type='button';inTab.className='sidebar-tool-list-tab od-icon-button';
      inTab.textContent='↗';inTab.title='在新标签页打开「'+row.title+'」';
      inTab.setAttribute('aria-label',inTab.title);
      inTab.dataset.sidebarToolId=row.id;inTab.dataset.sidebarToolAction='tab';
      inTab.disabled=busy;
      inTab.addEventListener('click',action(()=>openInTab(row.id)));
      item.append(inTab);
      if(row.id===focusedId)restoreFocus=focusedAction==='tab'?inTab:
        focusedAction==='remove'?uninstall:
        focusedAction==='sites'?[...item.children].find(node=>node.dataset?.sidebarToolAction==='sites')||button:button;
      list.append(item);
    }
    empty.hidden=installed.length!==0;
    if(officialRow)officialRow.hidden=installed.some(row=>row.id===READING_TOC_TOOL_ID);
    if(officialClipRow)officialClipRow.hidden=installed.some(row=>row.id==='web-markdown-clipper');
    listView.hidden=Boolean(active);
    display.hidden=!active;
    title.textContent=active ? active.title+(readOnlyPreview?' · 只读预览':'') : '';
    title.title=active?'v'+active.version:'';
    removeButton.title=readOnlyPreview?'只读预览尚未安装，不能卸载':active?'卸载「'+active.title+'」及其本地数据':'卸载工具';
    removeButton.setAttribute('aria-label',removeButton.title);
    removeButton.disabled=!active || busy || readOnlyPreview;
    if(openTabButton)openTabButton.disabled=!active||busy||readOnlyPreview;
    if(readOnlyBanner)readOnlyBanner.hidden=!readOnlyPreview;
    taskWorkbench.setToolActive?.(Boolean(visible && active));
    if(doc.documentElement?.dataset)doc.documentElement.dataset.opendeskTool=visible && active?'active':'list';
    if(restoreFocus && visible && !active)restoreFocus.focus?.({preventScroll:true});
  }
  function focusToolInList(id) {
    const item=[...list.children].find(node=>node.dataset?.sidebarToolId===id);
    (item?.children?.[0] || importTrigger).focus?.({preventScroll:true});
  }
  // Revoking a hidden iframe also revokes its session token and pending responses.
  function suspendTool() {destroyFrame();active=null;readOnlyPreview=false;previewDirty=false;render();}
  function closeTool() {
    if(busy||!canLeave())return false;
    setImportOpen(false);suspendTool();
    return true;
  }
  function canLeave() {
    if(toolSaving){notice('笔记正在保存或删除，请等待结果后再离开。',true);return false;}
    return !toolDirty||globalThis.confirm('当前工具有未保存的修改，确定放弃并离开吗？');
  }
  function mountTool(tool,{readOnly=false}={}) {
    destroyFrame();active=tool;readOnlyPreview=readOnly;previewDirty=false;
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
        suspendTool();
        notice('工具页面发生导航，旧界面已关闭。',true);return;
      }
      initialized=true;
      frame.contentWindow.postMessage({
        protocol:SIDEBAR_TOOL_PROTOCOL,kind:'load',instance:token,tool},'*');
    };
    frameRoot.append(frame);render();backButton.focus?.({preventScroll:true});
    notice(readOnly?'正在加载隔离只读预览（不会安装或保存）…':'正在打开「'+tool.title+'」…');
  }
  function openTool(id) {
    if(disposed||busy||!visible)return;
    if(active&&!canLeave())return;
    const tool=toolById(id);
    if(!tool){notice('找不到已安装的工具',true);return;}
    mountTool(tool);
  }
  function openReadOnlyPreview(value){
    if(disposed||busy||!visible)throw new Error('预览页面已经关闭或不可用');
    if(active&&!canLeave())return false;
    const tool=validateSidebarToolPackage(value);
    // Installed-tool ID collisions NEVER inherit installed rights in a preview.
    mountTool(tool,{readOnly:true});
  }
  async function openInTab(id=active?.id) {
    if(disposed||busy||!visible)return;
    const tool=toolById(id);
    if(!tool)throw new Error('工具未安装或已卸载');
    if(typeof api.tabs?.create!=='function')throw new Error('此环境不支持打开扩展标签页');
    await api.tabs.create({url:toolPageHref(api.runtime,tool.id)});
  }
  function setVisible(next) {
    if(disposed)return;
    if(!next&&visible&&!canLeave())return false;
    visible=Boolean(next);
    if(!visible){suspendTool();return;}
    // Entering the Tools tab only shows the list: an iframe requires an explicit Open.
    render();
  }
  async function dispatch(operation,payload,tool,source,token) {
    assertSession(source,token);
    if(readOnlyPreview){
      // Mock reads only. No Chrome storage or Native/Task invocation from code
      // under development, even when an installed tool shares this ID.
      if(operation==='storage.get'&&tool.capabilities.includes('storage.local')&&
        typeof payload?.key==='string'&&/^[a-zA-Z][a-zA-Z0-9._-]{0,59}$/.test(payload.key))
        return {value:null,preview:true};
      if(operation==='currentPage.info'&&tool.capabilities.includes('currentPage.read'))
        return {status:'unavailable',message:'只读开发预览没有绑定业务网页'};
      throw new Error('开发预览不允许真实写入、打开任务或控制网页');
    }
    if(!tool.capabilities.includes(operation.startsWith('storage.')?'storage.local':
       operation==='currentPage.info'?'currentPage.read':
       operation==='tasks.open'?'tasks.open':
       ['toc.snapshot','toc.navigate'].includes(operation)?TOC_CAPABILITY:
        CLIP_OPERATIONS.includes(operation)?CLIP_CAPABILITY:
        ['clipboard.writeText','file.download'].includes(operation)?'user.export':'__unapproved__'))
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
      if(operation==='toc.snapshot'||operation==='toc.navigate'){
        if(!currentPageTarget?.capture||!currentPageTarget?.revalidate||!api.tabs?.sendMessage)
          throw new Error('当前网页的目录服务不可用');
        const target=currentPageTarget.capture();
        const sites=(await api.storage.local.get(READING_TOC_SITE_STORE))[READING_TOC_SITE_STORE];
        if(!target.origin||!grantedOrigins(sites,tool.id).includes(target.origin))
          throw new Error('请在工具列表授权当前网站');
        let id,sourceId;
        if(operation==='toc.navigate'){
          id=payload?.id;sourceId=payload?.sourceId;
          if(typeof id!=='string'||!/^h-\d{1,8}$/.test(id)||
             typeof sourceId!=='string'||!/^s-\d{1,8}$/.test(sourceId))
            throw new Error('章节标识无效');
        }
        await currentPageTarget.revalidate(target);
        assertSession(source,token);
        const response=await api.tabs.sendMessage(target.tabId,{
          protocol:READING_TOC_PROTOCOL,operation,toolId:tool.id,expectedUrl:target.url,
          ...(id?{id,sourceId}:{})
        },{frameId:0,documentId:target.documentId});
        assertSession(source,token);
        await currentPageTarget.revalidate(target);
        if(!response?.ok)throw new Error(String(response?.error||'目录读取或跳转失败').slice(0,200));
        const data=response.data;
        if(!data||JSON.stringify(data).length>85000)throw new Error('目录数据超出大小限制');
        return data;
      }
      if(CLIP_OPERATIONS.includes(operation)){
        if(!currentPageTarget?.capture||!currentPageTarget?.revalidate||!api.tabs?.sendMessage)
          throw new Error('网页剪藏不可用');
        const target=currentPageTarget.capture();
        const grants=(await api.storage.local.get(CLIP_SITE_STORE))[CLIP_SITE_STORE];
        if(!target.origin||!grantedOrigins(grants,tool.id).includes(target.origin))
          throw new Error('请先在工具列表授权当前网站的剪藏权限');
        await currentPageTarget.revalidate(target);
        assertSession(source,token);
        const response=await api.tabs.sendMessage(target.tabId,{
          protocol:CLIP_PROTOCOL,operation,toolId:tool.id,expectedUrl:target.url
        },{frameId:0,documentId:target.documentId});
        assertSession(source,token);
        await currentPageTarget.revalidate(target);
        if(!response?.ok)throw new Error(String(response?.error||'剪藏失败').slice(0,200));
        const data=response.data;
        if(!data||typeof data.markdown!=='string'||typeof data.source!=='string'||
          new TextEncoder().encode(JSON.stringify(data)).length>160000)
          throw new Error('剪藏响应过大或格式无效');
        const latest=(await api.storage.local.get(CLIP_SITE_STORE))[CLIP_SITE_STORE];
        if(!grantedOrigins(latest,tool.id).includes(target.origin))
          throw new Error('网站剪藏授权已撤销');
        assertSession(source,token);return data;
      }
      if(operation==='clipboard.writeText'||operation==='file.download'){
        const value=payload?.text;
        if(typeof value!=='string'||!value||new TextEncoder().encode(value).length>150000)
          throw new Error('导出内容为空或超过 150 KB');
        if(operation==='clipboard.writeText'){
          if(!globalThis.navigator?.clipboard?.writeText)
            throw new Error('此环境不允许自动复制；请选中文本手动复制');
          await globalThis.navigator.clipboard.writeText(value);
          assertSession(source,token);return {copied:true};
        }
        if(!api.downloads?.download)throw new Error('下载服务不可用');
        const filename=payload?.filename;
        if(typeof filename!=='string'||filename.length>90||
          !/^[^\/\x00-\x1f:?*"<>|]+\.md$/i.test(filename)||filename.startsWith('.'))
          throw new Error('Markdown 下载文件名无效');
        const url='data:text/markdown;charset=utf-8,'+encodeURIComponent(value);
        const downloadId=await api.downloads.download({url,filename,saveAs:true,conflictAction:'uniquify'});
        assertSession(source,token);
        if(!Number.isInteger(downloadId))throw new Error('Chrome 未确认下载');
        return {downloadId};
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
      const current=Object.hasOwn(stored,key)?stored[key]:null;
      if(operation==='storage.get')return payload?.withEtag===true
        ?{value:current,etag:await etagFor(current)}:{value:current};
      let encoded;
      try{encoded=JSON.stringify(payload.value);}
      catch{throw new Error('只能保存可序列化数据');}
      if(typeof encoded!=='string'||new TextEncoder().encode(encoded).byteLength>8192)
        throw new Error('单项工具数据超过 8 KB');
      if(!sameInstance(source,token))throw new Error('工具界面已经切换');
      if(Object.hasOwn(payload||{},'ifMatch')){
        if(typeof payload.ifMatch!=='string'||!/^[a-f0-9]{64}$/.test(payload.ifMatch))
          throw new Error('存储版本参数无效');
        if(payload.ifMatch!==await etagFor(current))
          throw new Error('工具数据已在其他窗口修改，请重新打开确认');
      }
      const next={...stored,[key]:JSON.parse(encoded)};
      if(Object.keys(next).length>32||new TextEncoder().encode(JSON.stringify(next)).byteLength>32768)
        throw new Error('工具数据超过 32 KB');
      assertSession(source,token);
      await api.storage.local.set({[namespace]:next});
      return Object.hasOwn(payload||{},'ifMatch')
        ?{saved:true,etag:await etagFor(next[key])}:{saved:true};
    });
  }
  // Optional conditional writes are compared under the existing per-tool Web Lock.
  // No R1 tool-data schema or namespace changes are required.
  const etagFor=async value=>{
    // Chrome Storage may reorder object keys. Tokens describe values, not insertion order.
    const encoded=JSON.stringify(value,(_key,row)=>row&&typeof row==='object'&&!Array.isArray(row)
      ?Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]])):row);
    const digest=await globalThis.crypto.subtle.digest('SHA-256',
      new TextEncoder().encode(encoded));
    return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
  };
  const queued=new Map();
  function onMessage(event) {
    // Sandbox pages have opaque origin; checking the claimed id/origin alone is insufficient.
    if(event.origin!=='null'||!sameInstance(event.source,event.data?.instance)||
       event.data?.protocol!==SIDEBAR_TOOL_PROTOCOL||event.data?.toolId!==active.id)return;
    const message=event.data;
    if(message.kind==='status'){
      if(message.state==='ready')notice('');
      else if(message.state==='error')notice(active.title+'：'+String(message.message||'').slice(0,240),true);
      return;
    }
    if(message.kind==='dirty'){
      toolDirty=true;
      if(readOnlyPreview)previewDirty=true;
      return;
    }
    if(message.kind==='edit-state'){
      if(typeof message.dirty==='boolean'&&typeof message.busy==='boolean'){
        toolDirty=message.dirty;toolSaving=message.busy;
      }
      return;
    }
    if(message.kind==='resize'){
      // Only live frame, null origin, matching tool ID and session are accepted above.
      if(Number.isInteger(message.height)&&message.height>=80&&message.height<=4000)
        frame.style.height=Math.max(140,Math.min(1600,message.height))+'px';
      return;
    }
    if(message.kind!=='request'||typeof message.requestId!=='string'||message.requestId.length>32||
       typeof message.operation!=='string')return;
    if(message.operation==='toc.snapshot'){
      if(Date.now()-lastTocRead<1200)return;
      lastTocRead=Date.now();
    }
    const token=instance,source=event.source,tool=active;
    let bytes;
    try{bytes=JSON.stringify(message).length;}catch{return;}
    if(bytes>(['clipboard.writeText','file.download'].includes(message.operation)?160000:12000))return;
    const reply=(ok,result,error)=>{
      if(sameInstance(source,token))source.postMessage({
        protocol:SIDEBAR_TOOL_PROTOCOL,kind:'response',instance:token,toolId:tool.id,
        requestId:message.requestId,ok,...(ok?{result}:{error:{message:String(error?.message||error).slice(0,250)}})
      },'*');
    };
    if(message.operation!=='toc.snapshot'){
      if(Date.now()-requestWindow>=60000){requestCount=0;requestWindow=Date.now();}
      if(++requestCount>120){reply(false,null,new Error('工具请求过于频繁，请一分钟后重试'));return;}
    }
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
    if(disposed||area!=='local')return;
    if(Object.hasOwn(changes||{},READING_TOC_SITE_STORE)){
      siteEpoch++;siteGrants=changes[READING_TOC_SITE_STORE]?.newValue||{};render();
    }
    if(Object.hasOwn(changes||{},CLIP_SITE_STORE)){
      const change=changes[CLIP_SITE_STORE];
      clipSiteEpoch++;clipGrants=change?.newValue||{};
      // A revoked body-read grant also discards already visible content
      // in the active clipper iframe; never leave cached body text on screen.
      if(active?.capabilities.includes(CLIP_CAPABILITY)&&!readOnlyPreview){
        const oldOrigins=grantedOrigins(change?.oldValue||{},active.id);
        const newOrigins=grantedOrigins(clipGrants,active.id);
        if(oldOrigins.some(origin=>!newOrigins.includes(origin))){
          suspendTool();notice('网站剪藏授权已撤销；已关闭含正文的工具界面。',true);
        }
      }
      render();
    }
    if(!Object.hasOwn(changes||{},SIDEBAR_TOOL_STORE))return;
    catalogEpoch++;
    const fresh=admittedList(changes[SIDEBAR_TOOL_STORE]?.newValue);
    const selected=active&&fresh.find(row=>row.id===active.id);
    const invalidated=active&&!readOnlyPreview&&(!selected||!samePackage(selected,active));
    if(invalidated)suspendTool();
    installed=fresh;
    if(!busy && pending) {
      const current=toolById(pending.id);
      const stillReviewed=(!current&&!pendingBaseline) ||
        (current&&pendingBaseline&&samePackage(current,pendingBaseline));
      if(!stillReviewed){
        fileSelection++;resetReview();fileInput.value='';
        setFileError('已安装工具发生变化，请重新选择文件核对权限');
      }
    }
    render();
    if(invalidated){
      if(visible)importTrigger.focus?.({preventScroll:true});
      notice('工具已在其他窗口更新或卸载，旧界面已关闭。',true);
    }
  };
  if(api.storage.onChanged?.addListener){
    api.storage.onChanged.addListener(onToolStorageChanged);
    listeners.push(()=>api.storage.onChanged.removeListener(onToolStorageChanged));
  }
  async function loadInstalled() {
    const epoch=catalogEpoch;
    const result=await api.storage.local.get(SIDEBAR_TOOL_STORE);
    if(disposed||catalogEpoch!==epoch)return;
    installed=admittedList(result[SIDEBAR_TOOL_STORE]);
    render();
  }
  async function loadSites(){
    const epoch=siteEpoch;
    const result=await api.storage.local.get(READING_TOC_SITE_STORE);
    if(disposed||epoch!==siteEpoch)return;
    siteGrants=result[READING_TOC_SITE_STORE]||{};render();
  }
  async function loadClipSites(){
    const epoch=clipSiteEpoch;
    const stored=await api.storage.local.get(CLIP_SITE_STORE);
    if(disposed||epoch!==clipSiteEpoch)return;
    clipGrants=stored[CLIP_SITE_STORE]||{};render();
  }
  async function toggleClipSite(id){
    if(disposed||busy)return;
    const tool=toolById(id);
    if(!tool?.capabilities.includes(CLIP_CAPABILITY)||!currentPageTarget?.capture||!currentPageTarget?.revalidate)
      throw new Error('剪藏工具或网页不可用');
    const target=currentPageTarget.capture(),origin=websiteOrigin(target.url);
    if(!origin)throw new Error('当前网站不支持剪藏授权');
    const enabled=grantedOrigins(clipGrants,id).includes(origin);
    if(!enabled&&!globalThis.confirm('允许「'+tool.title+'」按你的操作读取 '+origin+' 的文章正文或选区？'))return;
    await locked('tool:'+id,()=>locked('catalog',async()=>{
      const current=admittedList((await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE]);
      if(!current.some(row=>samePackage(row,tool)))throw new Error('剪藏工具已变化');
      await currentPageTarget.revalidate(target);
      const saved=(await api.storage.local.get(CLIP_SITE_STORE))[CLIP_SITE_STORE]||{};
      if(grantedOrigins(saved,id).includes(origin)!==enabled)throw new Error('剪藏授权已在其他窗口改变');
      const next=changeClipGrant(saved,id,target.url,!enabled);
      await api.storage.local.set({[CLIP_SITE_STORE]:next});clipGrants=next;
    }));
    render();notice(enabled?'已撤销网站剪藏授权':'已授权当前网站剪藏');
  }
  async function revokeClipOrigin(id,origin){
    if(disposed||busy)return;
    const tool=toolById(id);
    if(!tool?.capabilities.includes(CLIP_CAPABILITY))throw new Error('剪藏工具已变化');
    await locked('tool:'+id,()=>locked('catalog',async()=>{
      const current=admittedList((await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE]);
      if(!current.some(row=>samePackage(row,tool)))throw new Error('剪藏工具已变化');
      const saved=(await api.storage.local.get(CLIP_SITE_STORE))[CLIP_SITE_STORE]||{};
      const next=changeClipGrant(saved,id,origin,false);
      await api.storage.local.set({[CLIP_SITE_STORE]:next});clipGrants=next;
    }));
    render();notice('已撤销 '+origin+' 的剪藏授权');
  }
  async function toggleTocSite(id){
    if(disposed||busy) return;
    const item=toolById(id);
    if(!item?.capabilities.includes(TOC_CAPABILITY)||!currentPageTarget?.capture||!currentPageTarget?.revalidate)
      throw new Error('目录工具或当前网页不可用');
    const target=currentPageTarget.capture(),origin=websiteOrigin(target.url);
    if(!origin)throw new Error('当前页面不支持目录授权');
    const wasEnabled=grantedOrigins(siteGrants,id).includes(origin);
    const enable=!wasEnabled;
    if(enable&&!globalThis.confirm('允许「'+item.title+'」读取 '+origin+' 的章节标题并显示网页目录？'))return;
    await locked('tool:'+id,()=>locked('catalog',async()=>{
      const fresh=admittedList((await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE]);
      if(!fresh.some(row=>samePackage(row,item)))throw new Error('工具安装状态已变化');
      await currentPageTarget.revalidate(target);
      const saved=(await api.storage.local.get(READING_TOC_SITE_STORE))[READING_TOC_SITE_STORE]||{};
      if(grantedOrigins(saved,id).includes(origin)!==wasEnabled)throw new Error('站点授权已被其他窗口更改');
      const next=changeTocGrant(saved,id,target.url,enable);
      await api.storage.local.set({[READING_TOC_SITE_STORE]:next});
      siteGrants=next;
    }));
    render();notice(enable?'已为当前网站启用目录':'已停用当前网站目录');
  }
  // Site revocation is independent of which website happens to be active.
  // It uses the same installation/catalog locks as TOC enable and uninstall,
  // so a stale or newly upgraded package cannot retain old site authority.
  async function revokeTocOrigin(id,origin){
    if(disposed||busy)return;
    const item=toolById(id);
    if(!item?.capabilities.includes(TOC_CAPABILITY))throw new Error('目录工具已变化');
    await locked('tool:'+id,()=>locked('catalog',async()=>{
      const current=admittedList((await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE]);
      if(!current.some(row=>samePackage(row,item)))throw new Error('工具安装状态已变化');
      const saved=(await api.storage.local.get(READING_TOC_SITE_STORE))[READING_TOC_SITE_STORE]||{};
      if(!grantedOrigins(saved,id).includes(origin))return;
      const next=changeTocGrant(saved,id,origin,false);
      await api.storage.local.set({[READING_TOC_SITE_STORE]:next});
      siteGrants=next;
    }));
    render();notice('已撤销 '+origin+' 的目录授权');
  }
  function reviewCandidate(candidate,sourceLabel){
    const previous=toolById(candidate.id);
    pending=candidate;pendingBaseline=previous?structuredClone(previous):null;
    previewTitle.textContent=candidate.title;
    previewVersion.textContent='v'+candidate.version;
    previewDescription.textContent=candidate.description;
    previewCapabilities.textContent=candidate.capabilities.length
      ?candidate.capabilities.map(readableCapability).join('、'):'无需额外能力';
    previewFile.textContent=sourceLabel;
    if(previous){
      const added=addedCapabilities(candidate,previous);
      const removed=previous.capabilities.filter(id=>!candidate.capabilities.includes(id));
      const change=versionOrder(candidate.version,previous.version);
      updatePanel.hidden=false;
      updateVersions.textContent='当前 v'+previous.version+' → 新 v'+candidate.version;
      updateCapabilities.textContent='新增能力：'+(added.map(readableCapability).join('、')||'无')+
        '；移除能力：'+(removed.map(readableCapability).join('、')||'无');
      const risks=[...(change<0?['版本回退']:[]),
        ...(added.length?['申请新增能力']:[]),
        ...(change===0&&!samePackage(candidate,previous)?['相同版本的内容发生变化']:[])];
      updateWarning.textContent=risks.length?'注意：'+risks.join('、')+'；更新时将再次确认。':'';
      updateWarning.hidden=!risks.length;
      const identical=samePackage(candidate,previous);
      installButton.textContent=identical?'已安装相同工具':'确认更新';
      installButton.disabled=identical;
    }else{installButton.textContent='确认安装';installButton.disabled=false;}
    preview.hidden=false;
  }
  async function chooseFile() {
    const selection=++fileSelection,file=fileInput.files?.[0];
    // Preserve the browser's selected filename; clearing .value here lies to the user.
    resetReview();setFileError();notice('');
    if(!file||disposed||busy)return;
    try{
      if(file.size>320000)throw new Error('工具包超过 320 KB');
      const candidate=validateSidebarToolPackage(JSON.parse(await file.text()));
      if(disposed||selection!==fileSelection)return;
      reviewCandidate(candidate,'文件：'+(file.name||'本地 JSON'));
    }catch(error){
      if(disposed||selection!==fileSelection)return;
      setFileError(error instanceof SyntaxError?'文件不是有效的工具包 JSON':String(error?.message||error));
    }
  }
  async function install() {
    if(!pending||busy||disposed||installButton.disabled)return;
    busy=true;installButton.disabled=true;fileInput.disabled=true;importClose.disabled=true;
    let accepted=null;
    try{
      const candidate=validateSidebarToolPackage(pending);
      await locked('tool:'+candidate.id,()=>locked('catalog',async()=>{
        if(disposed)return;
        installed=admittedList((await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE]);
        const exists=toolById(candidate.id);
        // Approval applies to the reviewed package, not a stale installed version.
        const sameBaseline=(!exists&&!pendingBaseline) ||
          (exists&&pendingBaseline&&samePackage(exists,pendingBaseline));
        if(!sameBaseline)throw new Error('工具安装状态已变化，请重新选择文件核对权限');
        if(!exists&&installed.length>=MAX_INSTALLED_TOOLS)
          throw new Error('最多安装 '+MAX_INSTALLED_TOOLS+' 个工具');
        if(exists) {
          const added=addedCapabilities(candidate,exists);
          const change=versionOrder(candidate.version,exists.version);
          const warnings=[...(change<0?['版本回退']:[]),
            ...(added.length?['新增能力：'+added.map(readableCapability).join('、')]:[]),
            ...(change===0&&!samePackage(candidate,exists)?['同版本内容变化']:[])];
          if(warnings.length && !globalThis.confirm('更新「'+candidate.title+'」包含'+warnings.join('；')+
            '。原工具数据会保留。确认更新吗？'))return;
          if(samePackage(candidate,exists))return;
        }
        // An interrupted uninstall may have left orphan data. A fresh install
        // must not inherit a previous installation's private namespace.
        if(!exists)await api.storage.local.remove(sidebarToolStorageKey(candidate.id));
        if(!exists||!candidate.capabilities.includes(TOC_CAPABILITY)){
          const sites=(await api.storage.local.get(READING_TOC_SITE_STORE))[READING_TOC_SITE_STORE]||{};
          if(Object.hasOwn(sites,candidate.id)){
            const next={...sites};delete next[candidate.id];
            await api.storage.local.set({[READING_TOC_SITE_STORE]:next});siteGrants=next;
          }
        }
        if(!exists||!candidate.capabilities.includes(CLIP_CAPABILITY)){
          const clip=(await api.storage.local.get(CLIP_SITE_STORE))[CLIP_SITE_STORE]||{};
          if(Object.hasOwn(clip,candidate.id)){
            const nextClip={...clip};delete nextClip[candidate.id];
            await api.storage.local.set({[CLIP_SITE_STORE]:nextClip});clipGrants=nextClip;
          }
        }
        const next=exists?installed.map(row=>row.id===candidate.id?candidate:row):[...installed,candidate];
        await api.storage.local.set({[SIDEBAR_TOOL_STORE]:next});
        installed=next;accepted=candidate;
      }));
    }catch(error){
      if(error?.message==='工具安装状态已变化，请重新选择文件核对权限'){
        clearImport();setFileError(error.message);return;
      }
      throw error;
    }finally{
      busy=false;fileInput.disabled=false;importClose.disabled=false;
      installButton.disabled=!pending;render();
    }
    if(!accepted||disposed)return;
    setImportOpen(false);render();focusToolInList(accepted.id);
    notice('已安装「'+accepted.title+'」。点击“打开”启动工具。');
  }
  async function remove(id=active?.id) {
    const item=toolById(id);
    if(!item||busy)return;
    const itemIndex=installed.findIndex(row=>row.id===item.id);
    if(!globalThis.confirm('卸载「'+item.title+'」并删除此工具保存的数据？'))return;
    busy=true;
    let removed=false;
    try{
      // A list removal never opens code; an active instance is revoked first.
      if(active?.id===item.id)suspendTool();
      await locked('tool:'+item.id,()=>locked('catalog',async()=>{
        installed=admittedList((await api.storage.local.get(SIDEBAR_TOOL_STORE))[SIDEBAR_TOOL_STORE]);
        const current=toolById(item.id);
        if(!current)return;
        if(!samePackage(current,item))throw new Error('工具已在其他窗口更新，请重新确认卸载');
        const sites=(await api.storage.local.get(READING_TOC_SITE_STORE))[READING_TOC_SITE_STORE]||{};
        if(Object.hasOwn(sites,item.id)){
          const nextSites={...sites};delete nextSites[item.id];
          await api.storage.local.set({[READING_TOC_SITE_STORE]:nextSites});siteGrants=nextSites;
        }
        const clip=(await api.storage.local.get(CLIP_SITE_STORE))[CLIP_SITE_STORE]||{};
        if(Object.hasOwn(clip,item.id)){
          const nextClip={...clip};delete nextClip[item.id];
          await api.storage.local.set({[CLIP_SITE_STORE]:nextClip});clipGrants=nextClip;
        }
        const next=installed.filter(row=>row.id!==item.id);
        await api.storage.local.set({[SIDEBAR_TOOL_STORE]:next});
        await api.storage.local.remove(sidebarToolStorageKey(item.id));
        installed=next;removed=true;
        render();notice('已卸载「'+item.title+'」');
      }));
    }finally{
      busy=false;render();
      if(removed&&visible)focusToolInList(installed[Math.min(itemIndex,installed.length-1)]?.id);
    }
  }
  const action=(fn)=>()=>Promise.resolve().then(fn).catch(error=>notice(
    (error?.code||'E_TOOL')+'：'+String(error?.message||error).slice(0,240),true));
  listen(globalThis.window,'beforeunload',event=>{
    if(!toolDirty&&!toolSaving)return;
    event.preventDefault();event.returnValue='';
  });
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
  listen(fileInput,'change',()=>chooseFile().catch(error=>setFileError(String(error?.message||error))));
  if(officialButton)listen(officialButton,'click',action(async()=>{
    if(busy)return;
    setImportOpen(true);clearImport();notice('');
    const selection=++fileSelection;
    const url=api.runtime.getURL('sidebar-tools/reading-toc.opendesk-tool.json');
    const response=await fetch(url);
    if(!response.ok)throw new Error('无法读取内置 TOC 工具包');
    const candidate=validateSidebarToolPackage(await response.json());
    if(candidate.id!==READING_TOC_TOOL_ID)throw new Error('内置工具身份错误');
    if(disposed||selection!==fileSelection)return;
    reviewCandidate(candidate,'来源：OpenDesk 内置工具');
  }));
  if(officialClipButton)listen(officialClipButton,'click',action(async()=>{
    if(busy)return;
    setImportOpen(true);clearImport();notice('');
    const selection=++fileSelection;
    const response=await fetch(api.runtime.getURL('sidebar-tools/web-markdown-clipper.opendesk-tool.json'));
    if(!response.ok)throw new Error('无法读取内置剪藏工具包');
    const candidate=validateSidebarToolPackage(await response.json());
    if(candidate.id!=='web-markdown-clipper')throw new Error('内置剪藏工具身份错误');
    if(disposed||selection!==fileSelection)return;
    reviewCandidate(candidate,'来源：OpenDesk 内置工具');
  }));
  listen(installButton,'click',action(install));
  listen(backButton,'click',()=>{
    if(busy)return;
    const id=active?.id;
    if(closeTool())focusToolInList(id);
  });
  listen(removeButton,'click',action(remove));
  if(openTabButton)listen(openTabButton,'click',action(()=>openInTab()));
  listen(window,'message',onMessage);
  const installedReady=loadInstalled().catch(error=>notice('工具列表读取失败：'+error.message,true));
  const sitesReady=loadSites().catch(error=>notice('网站授权读取失败：'+error.message,true));
  const clipSitesReady=loadClipSites().catch(error=>notice('剪藏授权读取失败：'+error.message,true));
  const ready=Promise.all([installedReady,sitesReady,clipSitesReady]);
  if(currentPageTarget?.subscribe){
    const unsubscribe=currentPageTarget.subscribe(()=>{
      render();
      if(frame&&active&&instance)frame.contentWindow?.postMessage({
        protocol:SIDEBAR_TOOL_PROTOCOL,kind:'page-changed',instance,toolId:active.id
      },'*');
    });
    listeners.push(unsubscribe);
  }
  render();
  return Object.freeze({ready,openTool,openReadOnlyPreview,isPreviewActive:()=>readOnlyPreview&&!!frame&&!!active,isPreviewDirty:()=>readOnlyPreview&&previewDirty,openInTab,closeTool,setVisible,dispose(){
    if(disposed)return;
    destroyFrame();fileSelection++;disposed=true;visible=false;
    for(const release of listeners.splice(0))release();
    queued.clear();
  }});
}
