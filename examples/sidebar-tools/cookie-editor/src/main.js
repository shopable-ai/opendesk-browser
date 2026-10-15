(() => {
'use strict';
const {root,request,setState}=globalThis.OpenDeskTool;
const E=id=>root.querySelector('#'+id),editor=E('editor-panel'),importer=E('import-panel'),confirm=E('confirm-panel');
// The browser panel and local workspace intentionally have separate data owners.
// Never substitute local cookies for Chrome reads or let a sandbox request grant access.
let data=null,epoch=0,dirty=false,busy=false,editing=null,pending=null,returnFocus=null;
let mode='browser',targetOverride='',targetPending=false,liveTarget=null,liveRows=[],liveState='idle',liveMessage='';
let expandedCookieKey=null,importPreview=null;
const liveSecrets=new Map();let observing=null,observeCursor='0',liveValueEdited=false,originalExpiryInput='';
let editorBaseline=null;
const browserSdk=()=>globalThis.OpenDeskSDK?.browser||null;
function parseTarget(input){
  if(typeof input!=='string'||input.length>2048||input.trim()!==input)throw new Error('请输入不超过 2048 字符的 HTTP(S) 网页地址');
  let url;try{url=new URL(input);}catch{throw new Error('请输入有效的 HTTP(S) 网页地址');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||
      !/^[a-z0-9.-]{1,253}$/i.test(url.hostname)||url.hostname.startsWith('.')||url.hostname.endsWith('.'))
    throw new Error('仅支持不含账号密码的普通 HTTP(S) 网站');
  // A path matters for native Cookie matching; never carry query/fragment tokens.
  return {hostname:url.hostname,origin:url.origin,url:url.origin+url.pathname};
}
function redactMetadata(rows){
  if(!Array.isArray(rows)||rows.length>500)throw new Error('SDK 返回了超出范围的 Cookie 列表');
  return rows.map(row=>{
    if(!row||typeof row!=='object'||Array.isArray(row)||
       typeof row.name!=='string'||typeof row.domain!=='string'||
       typeof row.path!=='string')throw new Error('SDK 返回的 Cookie 元数据无效');
    // Even if a faulty host returns value, discard it. A separate values grant
    // and a confirmed public result contract are prerequisites for disclosure.
    const {name,domain,path}=row;
    return {name,domain,path,hostOnly:row.hostOnly===true,secure:row.secure===true,
      httpOnly:row.httpOnly===true,sameSite:typeof row.sameSite==='string'?row.sameSite:'unspecified',
      session:row.session===true,expirationDate:Number.isFinite(row.expirationDate)?row.expirationDate:undefined,
      storeId:typeof row.storeId==='string'?row.storeId:undefined,
      partitionKey:row.partitionKey&&typeof row.partitionKey.topLevelSite==='string'?
        {topLevelSite:row.partitionKey.topLevelSite,
          ...(typeof row.partitionKey.hasCrossSiteAncestor==='boolean'?
            {hasCrossSiteAncestor:row.partitionKey.hasCrossSiteAncestor}:{})}:undefined,
      valueRedacted:true};
  });
}
const MAX_COOKIES=200,MAX_IMPORT=100,MAX_TEXT_BYTES=150000;
const shown=new Set();
const safeHost=value=>typeof value==='string'&&/^[a-z0-9.-]{1,253}$/i.test(value)&&!value.startsWith('.')&&!value.endsWith('.');
const stale=()=>new Error('此 Cookie 已改变，请刷新离线列表后重新操作。');
// CookiePartitionKey property order is not stable across native receipts,
 // JSON, or manually imported values. Compare semantic identity only.
const key=row=>JSON.stringify([row.name,row.domain,row.path,row.hostOnly===true,
  row.storeId??null,row.partitionKey?.topLevelSite??null,
  Boolean(row.partitionKey?.hasCrossSiteAncestor)]);
// A name change keeps the original scope. Chrome has no atomic rename.
const sameCookieScope=(a,b)=>a.domain===b.domain&&a.path===b.path&&
  a.hostOnly===b.hostOnly&&(a.storeId??null)===(b.storeId??null)&&
  (a.partitionKey?.topLevelSite??null)===(b.partitionKey?.topLevelSite??null)&&
  Boolean(a.partitionKey?.hasCrossSiteAncestor)===Boolean(b.partitionKey?.hasCrossSiteAncestor);
const sameCookieMetadata=(a,b)=>sameCookieScope(a,b)&&
  a.secure===b.secure&&a.httpOnly===b.httpOnly&&a.session===b.session&&
  a.sameSite===b.sameSite&&
  (a.expirationDate??null)===(b.expirationDate??null);
const sameNativeSlot=(a,b)=>a.name===b.name&&a.path===b.path&&
  a.domain.replace(/^\./,'').toLowerCase()===b.domain.replace(/^\./,'').toLowerCase()&&
  (a.storeId??null)===(b.storeId??null)&&
  (a.partitionKey?.topLevelSite??null)===(b.partitionKey?.topLevelSite??null)&&
  Boolean(a.partitionKey?.hasCrossSiteAncestor)===Boolean(b.partitionKey?.hasCrossSiteAncestor);
const status=(msg,type='info')=>{E('status').textContent=msg;E('status').dataset.state=type;E('status').hidden=!msg;};
const notify=()=>setState?.({dirty,busy});
const setBusy=value=>{
  busy=value;notify();
  for(const id of ['refresh','add','import-toggle','copy','download','clear','editor-save','import-apply','live-import-confirm','live-export-confirm'])
    E(id).disabled=value||(!data&&id!=='refresh')||(id==='clear'&&!data?.cookies?.length);
  // Lock target and mode controls while a Host operation remains unresolved.
  for(const id of ['target-url','apply-target','use-current','mode-browser','mode-offline'])
    E(id).disabled=value;
  for(const id of ['import-text','import-file','import-format','live-export-format','live-export-content'])
    E(id).disabled=value||(id==='live-export-format'&&E('live-export-content').value==='metadata');
  for(const button of root.querySelectorAll('.row-action,.cookie-row-trigger'))button.disabled=value;
  E('editor-delete').disabled=value;E('editor-reveal-value').disabled=value;
};
const clean=()=>{dirty=false;notify();};
// Dirty means an actual difference from the initial editor snapshot, not a focus,
// input or change event. Never capture hidden Chrome Cookie values here.
function editorSnapshot(){
  const session=E('cookie-session').checked;
  return {name:E('cookie-name').value,value:E('cookie-value').value,
    domain:E('cookie-domain').value,path:E('cookie-path').value,
    sameSite:E('cookie-same-site').value,hostOnly:E('cookie-host-only').checked,
    secure:E('cookie-secure').checked,httpOnly:E('cookie-http-only').checked,
    session,expiry:session?'':E('cookie-expiry').value,
    // For a redacted value, explicit input followed by clearing means 'write empty',
    // while untouched blank means 'preserve hidden old value'.
    valueIntent:mode==='browser'&&editing?.valueRedacted===true&&liveValueEdited===true};
}
function hasUnsavedChanges(){
  if(!editor.hidden){
    if(!editorBaseline)return false;
    const current=editorSnapshot();
    return Object.keys(current).some(field=>current[field]!==editorBaseline[field]);
  }
  // Formatting an empty import or opening its panel is not an unsaved draft.
  return !importer.hidden&&E('import-text').value.trim().length>0;
}
const mark=()=>{
  const next=hasUnsavedChanges();
  if(next!==dirty){dirty=next;notify();}
};
function blockBehindConfirmation(value){
  for(const id of ['browser-panel','cookie-content','editor-panel','import-panel'])E(id).inert=value;
  E('refresh').disabled=value;
}
function cancelConfirmation(){
  pending=null;confirm.hidden=true;
  blockBehindConfirmation(false);
  const node=returnFocus;returnFocus=null;if(node?.isConnected)node.focus();
}
function ask(message,label,callback){
  if(busy||pending)return;
  returnFocus=root.ownerDocument.activeElement;pending=callback;
  blockBehindConfirmation(true);
  E('confirm-message').textContent=message;
  const accept=E('confirm-accept');accept.textContent=label;
  // Do not style ordinary edits/imports as destructive deletions.
  if(/删除|清理|清空/.test(label)){
    accept.classList.add('danger-button');accept.classList.remove('primary');
  }else{
    accept.classList.remove('danger-button');accept.classList.add('primary');
  }
  confirm.hidden=false;E('confirm-cancel').focus();
}
function clearImportPreview(){
  importPreview=null;E('live-import-preview').hidden=true;
  E('live-import-preview').textContent='';E('live-import-confirm').hidden=true;
}
function dismiss(){
  if(busy)return;cancelConfirmation();
  // Close and discard sensitive input, not merely hide it in a detached form.
  scrubEditors();editor.classList.remove('cookie-inline');renderBrowser();
}
function guarded(action){
  if(busy||pending)return;
  mark(); // Recheck autofill and changes that did not emit a normal input event.
  if(!dirty){action();return;}
  ask('当前有未保存的 Cookie 编辑或导入内容，确定放弃？','放弃修改',()=>{clean();action();});
}
function renderBrowser(){
  const sdk=browserSdk(),available=!!liveTarget&&typeof sdk?.cookies?.getAll==='function';
  const hasRead=liveState==='ready';
  E('browser-panel').hidden=mode!=='browser';
  // Revocation, target changes and re-reads must never leave a disclosed
  // Cookie value inside an editable DOM tree retained for draft recovery.
  if(!hasRead||mode!=='browser'){
    E('editor-revealed-value').textContent='';
    E('editor-revealed-value').hidden=true;
    E('editor-reveal-value').hidden=true;
    E('editor-delete').hidden=true;
  }
  E('mode-browser').setAttribute('aria-pressed',String(mode==='browser'));
  E('mode-offline').setAttribute('aria-pressed',String(mode==='offline'));
  for(const [id,active] of [['mode-browser',mode==='browser'],['mode-offline',mode==='offline']]){
    if(active)E(id).classList.add('active');else E(id).classList.remove('active');
  }
  E('cookie-content').hidden=mode!=='offline';E('preview-banner').hidden=mode!=='offline';
  E('browser-state').hidden=hasRead;
  const heading=E('browser-state-heading'),detail=E('browser-state-detail');
  if(targetPending){
    heading.textContent='请先确认目标网页';detail.textContent='输入框地址尚未应用。点击「选择」后再读取，避免误操作原先的网站。';
  }else if(!liveTarget){
    heading.textContent='请选择网站';detail.textContent='打开普通网页，或展开「切换或选择网站」填写 HTTP(S) 地址。';
  }else if(!available){
    heading.textContent='无法连接 Chrome Cookie 服务';
    detail.textContent='请确认安装了最新 Cookie Editor 并已启用正式 Browser SDK；不会显示模拟 Cookie 数据。';
  }else if(liveState==='ready'){
    heading.textContent='已读取 Cookie';
    detail.textContent='已授权浏览器数据，敏感值默认隐藏。';
  }else if(liveState==='error'||liveState==='blocked'){
    heading.textContent=liveState==='blocked'?'需要浏览器 Cookie 授权':'浏览器读取失败';
    detail.textContent=liveMessage||'请在工具详情中检查能力与指定网站授权，然后重试。';
  }else{
    heading.textContent='正在检查此网站…';detail.textContent='检查 Cookie 读取授权。';
  }
  E('target-help').textContent=targetOverride?
    '已选择指定网址；读取仍需该网站授权，不要求与当前活动标签页相同。':
    '正在使用当前网页地址。选择网站不等于授权读取 Cookie。';
  E('live-new').disabled=busy||!hasRead||targetPending;
  for(const id of ['live-import','live-export','live-clear'])
    E(id).disabled=busy||!hasRead||targetPending;
  E('live-observe-start').disabled=busy||!hasRead||!!observing;
  for(const id of ['live-observe-read','live-observe-stop'])E(id).disabled=busy||!observing;
  E('live-toolbar').hidden=!hasRead;
  E('live-filters').hidden=!hasRead;
  E('browser-list-hint').hidden=!hasRead;
  E('site-grant-status').textContent=mode==='offline'?'离线':
    !liveTarget?'无网站':targetPending?'待确认':!available?'服务不可用':
    hasRead?'✓ 已授权':liveState==='blocked'?'未授权':
    liveState==='error'?'读取失败':'检查中';
  E('site-grant-status').dataset.state=hasRead&&mode==='browser'?'ready':'pending';
  E('site-pick').disabled=busy||mode!=='browser';
  E('live-filter-toggle').disabled=busy||!hasRead;
  for(const chip of root.querySelectorAll('[data-cookie-filter]')){
    const selected=chip.dataset.cookieFilter===E('live-filter').value;
    chip.classList.toggle('sel',selected);
    chip.setAttribute('aria-pressed',String(selected));
  }
  if(!E('live-export-panel').hidden)updateExportSummary();
  const term=E('live-search').value.trim().toLocaleLowerCase(),filter=E('live-filter').value||'all';
  const visible=liveRows.filter(row=>
    [row.name,row.domain,row.path].some(value=>value.toLocaleLowerCase().includes(term))&&
    (filter==='all'||(filter==='secure'&&row.secure)||(filter==='httpOnly'&&row.httpOnly)||
     (filter==='session'&&row.session)||(filter==='partitioned'&&row.partitionKey))||
    (!editor.hidden&&expandedCookieKey===key(row)));
  const order=E('live-sort').value||'name',byText=(a,b)=>String(a||'').localeCompare(String(b||''));
  visible.sort((a,b)=>order==='expiration'?
    (Number.isFinite(a.expirationDate)?a.expirationDate:Number.MAX_SAFE_INTEGER)-
    (Number.isFinite(b.expirationDate)?b.expirationDate:Number.MAX_SAFE_INTEGER)||
      byText(a.name,b.name):
    byText(a[order]??a.name,b[order]??b.name)||byText(a.name,b.name)||
      byText(a.domain,b.domain)||byText(a.path,b.path));
  E('live-count').textContent=hasRead?
    (visible.length===liveRows.length?'('+liveRows.length+')':'('+visible.length+'/'+liveRows.length+')'):'尚未读取';
  const list=E('live-cookie-list');list.replaceChildren();
  const recovery=E('browser-editor-slot');recovery.hidden=true;let inlineAttached=false;
  // Denied grants have a distinct error, never a misleading empty list.
  E('live-empty').hidden=!hasRead||visible.length>0;
  E('live-empty').textContent=hasRead?
    (liveRows.length?'没有匹配的 Cookie':'当前 URL 没有匹配的 Cookie。'):available?
    '正在检查网站 Cookie…':'无法读取 Cookie，请先在工具设置中授权该网站。';
  const doc=root.ownerDocument;
  // One real form, reparented into one selected browser Cookie.
  if(mode==='browser'&&!editor.hidden&&editing===null){
    const item=doc.createElement('div');item.className='cookie-row cookie-row-expanded';
    item.setAttribute('role','listitem');list.append(item);
    editor.classList.add('cookie-inline');item.append(editor);
  }
  for(const row of visible){
    const selected=mode==='browser'&&!editor.hidden&&expandedCookieKey===key(row);
    const writableHere=row.domain.replace(/^\./,'').toLowerCase()===liveTarget.hostname;
    const item=doc.createElement('div');item.className='cookie-row'+(selected?' cookie-row-expanded':'');
    item.setAttribute('role','listitem');
    const toggle=doc.createElement('button');toggle.type='button';toggle.className='cookie-row-trigger';
    toggle.setAttribute('aria-expanded',String(selected));
    toggle.setAttribute('aria-label',(selected?'收起':'展开编辑')+' Cookie '+row.name);
    if(selected)toggle.setAttribute('aria-controls','editor-panel');
    toggle.disabled=busy||!writableHere;
    if(!writableHere)toggle.title='请先切换至 '+row.domain+' 并取得写入权限';
    const name=doc.createElement('strong');name.className='cookie-row-name';
    name.textContent=row.name||'（空名称）';
    const meta=doc.createElement('span');meta.className='cookie-row-meta';
    meta.textContent=row.domain+row.path;
    const summary=doc.createElement('span');summary.className='cookie-row-title';
    summary.append(name,meta);
    const badgeText=row.partitionKey?'分区':row.httpOnly?'HttpOnly':
      row.secure?'Secure':row.session?'会话':'';
    const badge=doc.createElement('span');badge.className='cookie-row-tag';
    badge.textContent=badgeText;badge.hidden=!badgeText;
    const chev=doc.createElement('svg');chev.className='row-chevron';
    chev.setAttribute('viewBox','0 0 24 24');chev.setAttribute('aria-hidden','true');
    const path=doc.createElement('path');path.setAttribute('d','m6 9 6 6 6-6');
    path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');
    path.setAttribute('stroke-width','2');chev.append(path);
    toggle.append(summary,badge,chev);item.append(toggle);
    toggle.addEventListener('click',()=>guarded(()=>selected?dismiss():openEditor(row)));
    if(selected){
      const secret=liveSecrets.has(key(row)),reveal=E('editor-reveal-value');
      const valueNode=E('editor-revealed-value');
      reveal.hidden=false;reveal.textContent=secret?'隐藏':'显示值';
      reveal.setAttribute('aria-label',(secret?'隐藏':'显示')+' Cookie '+row.name+' 的敏感值');
      valueNode.hidden=!secret;valueNode.textContent=secret?liveSecrets.get(key(row)):'';
      E('editor-delete').hidden=false;
      E('editor-scope-note').textContent='身份：'+row.domain+row.path+
        (row.storeId?' · Store '+row.storeId:'')+
        (row.partitionKey?' · Partition '+row.partitionKey.topLevelSite:'')+
        '。修改时保留原有 Domain、Path、Store 和 Partition。';
      editor.classList.add('cookie-inline');item.append(editor);inlineAttached=true;
    }
    list.append(item);
  }
  // Authorization changes revoke old native metadata, but user input survives.
  if(mode==='browser'&&!editor.hidden&&editing!==null&&!inlineAttached){
    E('editor-revealed-value').textContent='';
    E('editor-revealed-value').hidden=true;
    E('editor-reveal-value').hidden=true;
    E('editor-delete').hidden=true;
    recovery.hidden=false;editor.classList.add('cookie-inline');recovery.append(editor);
  }
}
function render(){
  renderBrowser();
  const list=E('cookie-list');list.replaceChildren();
  E('cookie-count').textContent=(data?.cookies?.length||0)+' 条 Cookie';
  // Header always identifies the VISIBLE mode. In browser mode, never
  // mislabel an offline workspace as a Chrome website.
  const siteTitle=mode==='browser'?
    (liveTarget?.hostname||'尚未选择网站'):
    (data?.hostname?'离线 · '+data.hostname:'离线工作区');
  const siteUrl=mode==='browser'?(liveTarget?.url||''):(data?.origin||'');
  E('site-host').textContent=siteTitle;
  E('site-url').textContent=siteUrl;E('site-url').hidden=!siteUrl;
  const term=E('search').value.trim().toLocaleLowerCase();
  const rows=(data?.cookies||[]).filter(row=>[row.name,row.domain,row.path].some(v=>String(v||'').toLocaleLowerCase().includes(term)));
  E('empty-message').hidden=rows.length!==0;
  E('empty-message').textContent=!data?'正在准备本地工作区':
    term?'没有匹配的 Cookie':'离线工作区没有 Cookie，点击「新建」添加。';
  const doc=root.ownerDocument;
  for(const row of rows){
    const item=doc.createElement('div');item.className='cookie-row';item.setAttribute('role','listitem');
    const head=doc.createElement('div');head.className='cookie-row-head';
    const copy=doc.createElement('div');copy.className='cookie-row-title';
    const name=doc.createElement('strong');name.className='cookie-row-name';name.textContent=row.name;
    const meta=doc.createElement('span');meta.className='cookie-row-meta';
    meta.textContent=row.domain+row.path+' · '+(row.session?'会话':'持久')+
      (row.secure?' · Secure':'')+(row.httpOnly?' · HttpOnly':'')+(row.partitionKey?' · 分区':'');
    copy.append(name,meta);head.append(copy);
    const value=doc.createElement('div');value.className='cookie-row-value';
    value.textContent=shown.has(key(row))?row.value:'••••••••';
    const actions=doc.createElement('div');actions.className='cookie-row-actions';
    const button=(label,fn,danger=false)=>{
      const el=doc.createElement('button');el.type='button';el.className='row-action'+(danger?' delete':'');
      el.textContent=label;el.setAttribute('aria-label',label+' '+row.name);el.disabled=busy;
      el.addEventListener('click',fn);actions.append(el);
    };
    button(shown.has(key(row))?'隐藏值':'显示值',()=>{if(shown.has(key(row)))shown.delete(key(row));else shown.add(key(row));render();});
    button('编辑',()=>guarded(()=>openEditor(row)));
    button('删除',()=>guarded(()=>ask('仅删除离线工作区的 Cookie「'+row.name+'」，不会影响浏览器或网站登录。确认删除？','删除',()=>mutate('cookies.remove',{cookie:row},'已删除 Cookie。'))),true);
    item.append(head,value,actions);list.append(item);
  }
  for(const id of ['add','import-toggle','copy','download'])E(id).disabled=busy||!data;
  E('clear').disabled=busy||!data?.cookies.length;
}
function openEditor(row=null){
  if(!data||mode==='browser'&&(liveState!=='ready'||!liveTarget||targetPending))return;
  scrubEditors();
  editor.hidden=false;editing=row?structuredClone(row):null;
  expandedCookieKey=mode==='browser'&&row?key(row):null;
  if(mode==='offline'){
    editor.classList.remove('cookie-inline');E('offline-editor-slot').hidden=false;
    E('offline-editor-slot').append(editor);
  }else{E('offline-editor-slot').hidden=true;renderBrowser();}
  liveValueEdited=false;E('cookie-advanced').open=false;
  if(!row)E('editor-scope-note').textContent='新建 Cookie 默认属于当前网站；Store、Partition 由可信 Host 依据授权作用域确定。';
  E('editor-heading').textContent=(mode==='browser'?'真实 Chrome · ':'')+(row?'编辑 Cookie':'新建 Cookie');
  E('editor-help').textContent=mode==='browser'?
    '名称可以直接修改。重命名会先创建新 Cookie，再删除旧名称；未编辑值时保留旧值（需敏感值授权），明确编辑后清空会写入空值。其他身份字段保持不变。':
    '仅修改离线数据；名称可以直接修改，Domain、Path 和分区身份保持不变。';
  E('cookie-name').value=row?.name||'';E('cookie-value').value=row?.value||'';
  E('cookie-domain').value=row?.domain||data.hostname;E('cookie-path').value=row?.path||'/';
  E('cookie-same-site').value=row?.sameSite||'unspecified';
  E('cookie-host-only').checked=row?row.hostOnly:true;E('cookie-secure').checked=!!row?.secure;
  E('cookie-http-only').checked=!!row?.httpOnly;E('cookie-session').checked=row?row.session:true;
  E('expiry-field').hidden=E('cookie-session').checked;
  if(row?.expirationDate){
    const instant=new Date(row.expirationDate*1000);
    E('cookie-expiry').value=new Date(instant.getTime()-instant.getTimezoneOffset()*60000).toISOString().slice(0,19);
  }else E('cookie-expiry').value='';
  originalExpiryInput=E('cookie-expiry').value;
  E('cookie-name').readOnly=false;
  for(const id of ['cookie-domain','cookie-path'])E(id).readOnly=Boolean(row);
  E('cookie-host-only').disabled=Boolean(row);
  E('cookie-value').placeholder=mode==='browser'&&row?.valueRedacted===true?
    '留空将尝试保留旧值（需已有敏感值权限）':'输入 Cookie 值';
  editorBaseline=editorSnapshot();clean();E('cookie-name').focus();
}
function formCookie(){
  const expiry=E('cookie-expiry').value;
  return {name:E('cookie-name').value,value:E('cookie-value').value,
    domain:E('cookie-domain').value,path:E('cookie-path').value,
    hostOnly:E('cookie-host-only').checked,secure:E('cookie-secure').checked,
    httpOnly:E('cookie-http-only').checked,sameSite:E('cookie-same-site').value,
    session:E('cookie-session').checked,
    ...(!E('cookie-session').checked?{expirationDate:
      editing?.session===false&&expiry===originalExpiryInput?editing.expirationDate:
        expiry?new Date(expiry).getTime()/1000:NaN}:{}),
    ...(editing?.partitionKey?{partitionKey:editing.partitionKey}:{}),
    ...(editing?.storeId?{storeId:editing.storeId}:{})};
}
// Canonical local model used for import/export and later for a browser adapter.
function normalizeCookie(raw){
  if(!data||!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Cookie 记录无效');
  const name=raw.name,value=raw.value;
  const domain=String(raw.domain||data.hostname).trim().toLowerCase();
  const host=domain.replace(/^\./,'');
  const path=raw.path??'/';
  const hostOnly=typeof raw.hostOnly==='boolean'?raw.hostOnly:!domain.startsWith('.');
  if(typeof name!=='string'||!name||name.length>256||/[\s;=\x00-\x1f\x7f]/.test(name))
    throw new Error('Cookie 名称不可为空，不能包含空白、分号、等号或控制字符');
  if(typeof value!=='string'||value.length>4096||/[\r\n\x00]/.test(value))
    throw new Error('Cookie 值长度或字符不合法');
  if(!safeHost(host)||!(data.hostname===host||data.hostname.endsWith('.'+host))||
      (hostOnly&&host!==data.hostname))throw new Error('Cookie 域名必须属于当前网站，Host-only 不能跨主机');
  if(typeof path!=='string'||!path.startsWith('/')||path.length>1024||/[\r\n\x00]/.test(path))
    throw new Error('Cookie 路径必须以 / 开头，长度不超过 1024');
  const secure=raw.secure===true,httpOnly=raw.httpOnly===true;
  const sameSite=raw.sameSite||'unspecified';
  if(!['unspecified','lax','strict','no_restriction'].includes(sameSite)||
      (sameSite==='no_restriction'&&!secure))throw new Error('SameSite=None 必须同时使用 Secure');
  if((name.startsWith('__Secure-')&&!secure)||
      (name.startsWith('__Host-')&&(!secure||!hostOnly||path!=='/')))
    throw new Error('Cookie 前缀 __Secure- / __Host- 与安全属性不一致');
  const session=typeof raw.session==='boolean'?raw.session:!(Number(raw.expirationDate)>0);
  const expiration=Number(raw.expirationDate);
  if(!session&&(!Number.isFinite(expiration)||expiration<=Date.now()/1000||expiration>253402300799))
    throw new Error('持久 Cookie 需要有效的未来过期时间');
  let partitionKey;
  if(raw.partitionKey!==undefined){
    if(!raw.partitionKey||typeof raw.partitionKey!=='object'||Array.isArray(raw.partitionKey)||
        typeof raw.partitionKey.topLevelSite!=='string'||raw.partitionKey.topLevelSite.length>260)
      throw new Error('Cookie 分区键无效');
    partitionKey={topLevelSite:raw.partitionKey.topLevelSite};
    if(typeof raw.partitionKey.hasCrossSiteAncestor==='boolean')
      partitionKey.hasCrossSiteAncestor=raw.partitionKey.hasCrossSiteAncestor;
  }
  const cookie={name,value,domain,hostOnly,path,secure,httpOnly,sameSite,session,
    ...(!session?{expirationDate:expiration}:{}),
    ...(typeof raw.storeId==='string'&&raw.storeId.length<=80?{storeId:raw.storeId}:{}),
    ...(partitionKey?{partitionKey}:{})};
  return cookie;
}
function sortCookies(list){
  return [...list].sort((a,b)=>a.name.localeCompare(b.name)||a.domain.localeCompare(b.domain)||
    a.path.localeCompare(b.path));
}
function saveToList(list,row,previous=null){
  const next=normalizeCookie(row),id=key(next);
  const index=list.findIndex(item=>key(item)===(previous?key(previous):id));
  if(previous){
    if(index===-1||JSON.stringify(list[index])!==JSON.stringify(previous))throw stale();
    if(!sameCookieScope(next,previous))throw new Error('不能修改域名、路径、Store 或 Cookie 分区身份');
    if(list.some((item,i)=>i!==index&&key(item)===id))
      throw new Error('新名称与已有 Cookie 冲突，请使用其他名称');
  }else if(index!==-1)throw new Error('同身份 Cookie 已存在。请选择编辑，或通过导入进行覆盖。');
  const out=[...list];
  if(index<0)out.push(next);else out[index]=next;
  if(out.length>MAX_COOKIES)throw new Error('单一工作区最多 200 条 Cookie');
  return sortCookies(out);
}
async function refresh(){
  const id=++epoch,prior=data;
  shown.clear();liveSecrets.clear();observing=null;liveRows=[];liveState='idle';liveMessage='';setBusy(true);
  try{
    let target=null;
    if(targetOverride)target=parseTarget(targetOverride);
    else{
      try{
        const page=await request('currentPage.info');
        if(page?.status==='available')target=parseTarget(page.url);
      }catch{/* No current-page permission is not Cookie authorization. */}
    }
    if(id!==epoch)return;
    liveTarget=target;
    const host=target?.hostname||'';
    data=target?{hostname:host,origin:target.origin,url:target.url,
      cookies:prior?.hostname===host?prior.cookies:[]}:null;
    E('site-host').textContent=target?.hostname||'尚未选择网站';
    E('site-url').textContent=target?.url||'';E('site-url').hidden=!target;
    E('target-url').value=target?.url||'';targetPending=false;
    E('preview-banner').textContent='离线文件工具 · '+(target?
      '本地数据以 '+host+' 为校验范围，不读取或修改 Chrome Cookie。':
      '请返回浏览器模式，先选择 HTTP(S) 网站地址，再进入离线文件工具。')+
      ' 关闭工具后临时数据不保留。';
    status(mode==='offline'?'正在使用离线工作区；所有修改仅保存在临时内存。':'');
  }catch(error){if(id===epoch){liveState='error';liveMessage=String(error.message||error);status(liveMessage,'error');}}
  finally{if(id===epoch){
    setBusy(false);render();
    // Tool open / site change: read only if the existing grant still allows it.
    // The public SDK/Host performs the actual per-site authority checks.
    if(mode==='browser'&&liveTarget&&!targetPending&&typeof browserSdk()?.cookies?.getAll==='function')
      void readBrowserMetadata();
  }}
}

// Cookie Editor must not claim partitioned data is empty merely because the
// Chrome-style default getAll() returns unpartitioned cookies only.
// The public Host supplies ONLY the partition approved for this site/store;
// query both explicit scopes without permitting a tool-selected foreign key.
async function scopedLiveCookies(sdk,target,{includeValues=false,isCurrent=()=>true}={}){
  if(typeof sdk?.cookies?.getAll!=='function'||typeof sdk.cookies.getPartitionKey!=='function')
    throw new Error('正式 Browser SDK 缺少真实 Cookie 分区查询接口');
  const normal=await sdk.cookies.getAll({url:target.url,...(includeValues?{includeValues:true}:{})});
  if(!isCurrent())return null;
  if(!Array.isArray(normal))throw new Error('Host 的普通 Cookie 返回不是数组');
  const partition=await sdk.cookies.getPartitionKey({url:target.url});
  if(!isCurrent())return null;
  if(!partition?.partitionKey?.topLevelSite)throw new Error('无法确定已授权 Partition');
  const partitioned=await sdk.cookies.getAll({url:target.url,
    partitionKey:partition.partitionKey,...(includeValues?{includeValues:true}:{})});
  if(!isCurrent())return null;
  if(!Array.isArray(partitioned))throw new Error('Host 的分区 Cookie 返回不是数组');
  const combined=new Map();
  for(const row of [...normal,...partitioned]){
    if(!row||typeof row.name!=='string'||typeof row.domain!=='string'||typeof row.path!=='string')
      throw new Error('Host 返回了无效 Cookie 身份');
    const identity=key(row);
    if(combined.has(identity))throw new Error('Host 返回同一 Cookie 身份的重复记录，请刷新');
    combined.set(identity,row);
  }
  if(combined.size>100)throw new Error('所选网址 Cookie 总数超过 100 条，请缩小 Path 范围');
  return [...combined.values()];
}
async function readBrowserMetadata(){
  if(busy||pending||!liveTarget||targetPending)return;
  const sdk=browserSdk(),target=liveTarget,id=epoch;
  if(typeof sdk?.cookies?.getAll!=='function'){
    liveState='blocked';liveMessage='公开 Cookie SDK 尚未实现';render();return;
  }
  setBusy(true);liveSecrets.clear();liveRows=[];liveState='idle';render();
  try{
    const permission=await sdk.capabilities.getStatus({operation:'browser.cookies.getAll',url:target.url});
    if(!permission?.callableNow){
      if(id===epoch){liveState='blocked';liveMessage='尚未获得该网站的读取能力（'+
        String(permission?.reasonCode||'E_PERMISSION_REQUIRED').slice(0,80)+'）。请在工具详情中审阅网站授权。';}
      return;
    }
    if(id!==epoch||liveTarget?.url!==target.url||targetPending||mode!=='browser')return;
    // Only public tool SDK: never invoke chrome.cookies or private approve/execute.
    const result=await scopedLiveCookies(sdk,target,{
      isCurrent:()=>id===epoch&&liveTarget?.url===target.url&&!targetPending&&mode==='browser'});
    if(result===null)return;
    const rows=redactMetadata(result);
    if(id!==epoch||liveTarget?.url!==target.url||targetPending||mode!=='browser')return;
    liveRows=rows;liveState='ready';liveMessage='';
  }catch(error){
    if(id===epoch){liveRows=[];liveState='error';
      liveMessage='读取被拒绝或结果不确定（'+String(error.code||'E_COOKIE_READ').slice(0,60)+
        '）。检查安装、网站、Store 与授权后手动刷新，不会自动重试。';}
  }finally{if(id===epoch){setBusy(false);render();}}
}

function nativeInput(row){
  if(!liveTarget||row.domain.replace(/^\./,'').toLowerCase()!==liveTarget.hostname)
    throw new Error('当前 SDK 限定精确主机 Domain，请切换到该 Cookie 的所属主机');
  // A Cookie Path containing raw URL delimiters or unsupported characters
  // cannot be represented by the exact Chrome URL needed for readback/remove.
  const lookup=new URL(liveTarget.origin);lookup.pathname=row.path;
  if(lookup.pathname!==row.path)
    throw new Error('Cookie Path 无法无损映射为 Chrome URL，请使用标准 URL 编码的路径');
  return {url:lookup.href,name:row.name,value:row.value,path:row.path,
    ...(row.hostOnly?{}:{domain:row.domain}),secure:row.secure,httpOnly:row.httpOnly,
    sameSite:row.sameSite,...(row.session?{}:{expirationDate:row.expirationDate}),
    ...(row.storeId?{storeId:row.storeId}:{}),
    ...(row.partitionKey?{partitionKey:row.partitionKey}:{})};
}
function stillCurrent(id,target){
  return id===epoch&&mode==='browser'&&!targetPending&&liveTarget?.url===target.url;
}
async function revealBrowserValue(row){
  if(busy||pending||!liveTarget||mode!=='browser')return;
  const id=epoch,target=liveTarget,identity=key(row);
  if(liveSecrets.has(identity)){liveSecrets.delete(identity);render();return;}
  setBusy(true);
  try{
    const lookup=new URL(target.origin);lookup.pathname=row.path;
    if(lookup.pathname!==row.path)throw new Error('Cookie Path 无法精确查询');
    const receipt=await browserSdk().cookies.get({url:lookup.href,name:row.name,
      domain:row.domain,path:row.path,...(row.storeId?{storeId:row.storeId}:{}),
      ...(row.partitionKey?{partitionKey:row.partitionKey}:{}),includeValues:true});
    if(!stillCurrent(id,target))return;
    if(receipt?.cookie?.valueRedacted!==false||typeof receipt.cookie.value!=='string'||
       key(receipt.cookie)!==identity)
      throw new Error('敏感值授权不足，值未被读取');
    liveSecrets.set(identity,receipt.cookie.value);status('仅为选定 Cookie 显示当前敏感值。');
  }catch(e){if(stillCurrent(id,target))status('显示值被拒绝：'+(e.code||'E_COOKIE_VALUES')+' '+
    (['E_COOKIE_VALUES_REQUIRED','E_VALUES_REQUIRED','E_SITE_GRANT_REQUIRED'].includes(e.code)?
      '请打开上方“工具设置”，为当前网站开启“读取 Cookie 元数据”和“读取敏感值”，再点击显示值。':e.message),'error');}
  finally{if(id===epoch){setBusy(false);render();}}
}
async function saveBrowserCookie(){
  if(busy||pending||!liveTarget||liveState!=='ready')return;
  const id=epoch,target=liveTarget,old=editing;
  let row,options,renamed=false;
  try{
    row=normalizeCookie(formCookie());
    if(old&&!sameCookieScope(row,old))
      throw new Error('编辑不能改变 Domain、Path、Store 或 Partition；请另行新建');
    renamed=Boolean(old&&row.name!==old.name);
    options=nativeInput(row);
    if(!old||renamed)options.ifAbsent=true;
  }catch(e){status('Cookie 属性不合法：'+e.message,'error');return;}
  setBusy(true);let confirmed=false,newNameSaved=false;
  try{
    if(old){
      // Preflight the exact scope; never overwrite an existing new name.
      const route=new URL(target.origin);route.pathname=old.path;
      if(route.pathname!==old.path)throw new Error('原 Cookie Path 无法精确查询');
      const scope={url:route.href,...(old.storeId?{storeId:old.storeId}:{}),
        ...(old.partitionKey?{partitionKey:old.partitionKey}:{})};
      const current=await browserSdk().cookies.getAll(scope);
      if(!stillCurrent(id,target))return;
      if(!Array.isArray(current))throw new Error('Host 未返回可验证的 Cookie 列表');
      const original=redactMetadata(current).find(item=>key(item)===key(old));
      if(!original||!sameCookieMetadata(original,old))
        throw new Error('原 Cookie 属性已改变或消失，请刷新后再编辑');
      if(renamed&&current.some(item=>sameNativeSlot(item,row)))
        throw new Error('新名称已存在于相同 Domain/Path/Store/Partition；不会覆盖');
      if(old.valueRedacted===true&&!liveValueEdited){
        // A separate values grant is required to preserve a hidden value.
        // Never put it into the editor form or persisted draft state.
        let source;
        try{
          source=await browserSdk().cookies.get({url:route.href,name:old.name,
            domain:old.domain,path:old.path,...(old.storeId?{storeId:old.storeId}:{}),
            ...(old.partitionKey?{partitionKey:old.partitionKey}:{}),includeValues:true});
        }catch(error){
          if(!stillCurrent(id,target))return;
          throw Object.assign(new Error('保留旧值需在工具设置授权“读取敏感值”，或主动填写新值。'+
            String(error?.message||'')),{code:error?.code||'E_COOKIE_VALUES'});
        }
        if(!stillCurrent(id,target))return;
        if(!source?.cookie||key(source.cookie)!==key(old)||
           source.cookie.valueRedacted!==false||typeof source.cookie.value!=='string')
          throw new Error('旧 Cookie 值不可用；请授权敏感值或主动填写新值');
        row.value=source.cookie.value;options=nativeInput(row);
        if(renamed)options.ifAbsent=true;
      }
    }
    if(!stillCurrent(id,target))return;
    const receipt=await browserSdk().cookies.set(options);
    if(!stillCurrent(id,target))return;
    if(receipt?.saved!==true||receipt.verified!==true)
      throw Object.assign(new Error('Chrome 未确认写入，禁止直接重试'),{code:'E_OUTCOME_UNKNOWN'});
    if(renamed){
      newNameSaved=true;
      // Delete ONLY the old exact identity after the new one is verified.
      // If deletion fails, both names may exist; never blindly retry.
      const removed=await browserSdk().cookies.remove({url:target.url,name:old.name,
        domain:old.domain,path:old.path,...(old.storeId?{storeId:old.storeId}:{}),
        ...(old.partitionKey?{partitionKey:old.partitionKey}:{})});
      if(!stillCurrent(id,target))return;
      if(removed?.removed!==true||removed.verified!==true)
        throw Object.assign(new Error('旧 Cookie 删除未确认'),{code:'E_OUTCOME_UNKNOWN'});
    }
    confirmed=true;liveSecrets.clear();scrubEditors();
    status(renamed?'Chrome 已确认新名称写入且旧名称删除。正在刷新列表。':
      'Chrome 已确认保存。正在刷新列表。','success');
  }catch(e){if(stillCurrent(id,target)){
    if(newNameSaved){
      liveSecrets.clear();scrubEditors();
      status('新名称已由 Chrome 确认写入，但旧名称删除未确认（'+
        (e.code||'E_COOKIE_REMOVE')+'）：'+e.message+
        '。两条 Cookie 可能并存；请手动刷新核对，切勿盲目重试。','error');
    }else if(e.code==='E_CANCELLED')status('已取消保存，未写入 Cookie；输入已保留，可继续编辑。');
    else if(e.code==='E_COOKIE_CONFLICT')status('名称冲突（E_COOKIE_CONFLICT）：'+e.message+
      '。未写入 Cookie，输入已保留；请换一个名称或编辑已有记录。','error');
    else status('操作未完成或结果未知（'+(e.code||'E_COOKIE_SET')+
      '）：'+e.message+'。请手动刷新核对，切勿盲目重试。','error');
  }}
  finally{if(id===epoch){setBusy(false);render();}}
  if(confirmed&&stillCurrent(id,target))void readBrowserMetadata();
}
async function deleteBrowserCookie(row){
  if(busy||!liveTarget||mode!=='browser')return;
  const id=epoch,target=liveTarget;setBusy(true);let confirmed=false;
  try{
    const result=await browserSdk().cookies.remove({url:target.url,name:row.name,
      domain:row.domain,path:row.path,...(row.storeId?{storeId:row.storeId}:{}),
      ...(row.partitionKey?{partitionKey:row.partitionKey}:{})});
    if(!stillCurrent(id,target))return;
    if(result?.removed!==true||result.verified!==true)
      throw Object.assign(new Error('删除回执未核实'),{code:'E_OUTCOME_UNKNOWN'});
    confirmed=true;liveSecrets.delete(key(row));status('Chrome 已确认删除「'+row.name+'」。','success');
  }catch(e){if(stillCurrent(id,target)){
    if(e.code==='E_CANCELLED')status('已取消删除，未删除 Cookie。');
    else status('删除未确认（'+(e.code||'E_COOKIE_REMOVE')+
      '）：'+e.message+'。请核对实际 Cookie，勿重复删除。','error');
  }}
  finally{if(id===epoch){setBusy(false);render();}}
  if(confirmed&&stillCurrent(id,target))void readBrowserMetadata();
}
async function clearBrowserSite(){
  if(busy||pending||!liveTarget||targetPending)return;
  const id=epoch,target=liveTarget;setBusy(true);let count,previewRef;
  try{
    const preview=await browserSdk().cookies.clearSite({url:target.url,preview:true,maxCookies:50});
    if(!stillCurrent(id,target))return;
    count=preview?.matched;previewRef=preview?.previewRef;
    if(!Number.isSafeInteger(count)||count<0||count>50||
       typeof previewRef!=='string'||!/^[0-9a-f-]{36}$/i.test(previewRef))
      throw new Error('Host 未返回可绑定的真实 Cookie 清理预览回执');
    if(!count){status('所选 Store/Partition 下没有本主机 Host-only Cookie。');return;}
  }catch(e){if(stillCurrent(id,target))status('清理预览被拒绝：'+(e.code||'E_COOKIE_CLEAR')+' '+e.message,'error');return;}
  finally{if(id===epoch){setBusy(false);render();}}
  if(!stillCurrent(id,target)||!count)return;
  ask('将真实清理 '+target.hostname+' 的 '+count+
    ' 条 Host-only Cookie，仅限当前已授权 Store/Partition。不清理其他站点。确认？','确认安全清理',async()=>{
    if(!stillCurrent(id,target))return;
    setBusy(true);let confirmed=false;
    try{
      const result=await browserSdk().cookies.clearSite({url:target.url,previewRef,expectedCount:count,maxCookies:50});
      if(!result||result.preview!==false||result.scope!=='EXACT_HOST_HOST_ONLY'||
        result.matched!==count||!Number.isSafeInteger(result.removed)||
        !Number.isSafeInteger(result.remaining)||result.removed<0||result.removed>count||
        result.remaining<0||result.remaining>50)
        throw Object.assign(new Error('Chrome 批量清理回执不完整，请手动刷新核对'),{code:'E_OUTCOME_UNKNOWN'});
      confirmed=true;
      if(stillCurrent(id,target))status('Chrome 清理完成：删除 '+result.removed+
        ' 条，剩余 '+result.remaining+' 条。','success');
    }catch(e){if(stillCurrent(id,target))status('清理部分生效或失败（'+(e.code||'E_COOKIE_CLEAR')+
      '）：'+e.message+'。请重新预览，不要直接重试。','error');}
    finally{if(id===epoch){setBusy(false);render();}}
    if(confirmed&&stillCurrent(id,target))void readBrowserMetadata();
  });
}

async function observeBrowser(action){
  if(busy||!liveTarget||mode!=='browser'||targetPending)return;
  const id=epoch,target=liveTarget;setBusy(true);
  try{
    if(action==='start'){
      const state=await browserSdk().cookies.observe.start({url:target.url,durationMs:15000,maxEvents:40});
      if(!stillCurrent(id,target))return;
      observing=state;observeCursor='0';E('live-observe-events').replaceChildren();
      E('live-observe-status').textContent='Cookie 元数据观察已启动，最长 15 秒；无敏感值。';
    }else if(observing){
      const args={url:target.url,sessionRef:observing.sessionRef};
      if(action==='stop'){
        await browserSdk().cookies.observe.stop(args);
        if(!stillCurrent(id,target))return;
        observing=null;E('live-observe-status').textContent='已停止观察。';
      }else if(action==='read'){
        const response=await browserSdk().cookies.observe.read({...args,cursor:observeCursor,limit:40});
        if(!stillCurrent(id,target))return;
        observeCursor=response.nextCursor;
        const doc=root.ownerDocument;
        for(const event of response.events||[]){
          const row=doc.createElement('div');row.className='cookie-row';row.setAttribute('role','listitem');
          row.textContent=(event.removed?'删除':'变更')+' · '+event.name+' · '+event.domain+event.path;
          E('live-observe-events').append(row);
        }
        E('live-observe-status').textContent='本次读取 '+(response.events?.length??0)+
          ' 个变化，缺口 '+response.gapCount+'，缓冲丢弃 '+response.droppedCount+'；无 Cookie 值。';
      }
    }
  }catch(error){
    if(stillCurrent(id,target)){
      if(['E_SESSION_EXPIRED','E_GRANT_REVOKED','E_SITE_GRANT_REQUIRED'].includes(error.code))observing=null;
      E('live-observe-status').textContent='观察被拒绝或结束（'+(error.code||'E_COOKIE_OBSERVE')+
        '）：'+error.message;
    }
  }finally{if(id===epoch){setBusy(false);render();}}
}
async function exportBrowserCookies(){
  if(busy||pending||!liveTarget||liveState!=='ready'||targetPending)return;
  const metadata=E('live-export-content').value==='metadata',format=E('live-export-format').value;
  if(metadata&&format!=='json'){status('元数据清单只支持 JSON 格式。','error');return;}
  const id=epoch,target=liveTarget;setBusy(true);
  try{
    // Only a sensitive backup requests values. Metadata always redacts faulty responses.
    const rows=await scopedLiveCookies(browserSdk(),target,{
      includeValues:!metadata,isCurrent:()=>stillCurrent(id,target)});
    if(!stillCurrent(id,target)||rows===null)return;
    if(!Array.isArray(rows)||!rows.length)throw new Error('当前网站没有可导出 Cookie');
    let text,filename;
    if(metadata){
      const cookies=redactMetadata(rows).map(({valueRedacted,...safe})=>safe);
      text=JSON.stringify({kind:'opendesk.cookie-metadata.v1',origin:target.origin,
        generatedAt:new Date().toISOString(),restoreSupported:false,
        scope:'current-authorized-url-store-partition',cookies},null,2)+'\n';
      filename=target.hostname.slice(0,60)+'-cookie-metadata.json';
    }else{
      if(rows.some(row=>row.valueRedacted!==false||typeof row.value!=='string'))
        throw new Error('Host 未确认全部 Cookie 敏感值权限');
      text=exportText(format,rows);
      filename=target.hostname.slice(0,60)+'-chrome-cookies.'+(format==='json'?'json':'txt');
    }
    if(new Blob([text]).size>MAX_TEXT_BYTES)throw new Error('导出超过 150 KB 安全预算');
    await browserSdk().downloads.text({text,filename});
    if(stillCurrent(id,target))status(metadata?
      '已下载不含 Value 的 Cookie 元数据清单；此文件不能用于恢复 Cookie。':
      '已主动导出真实 Chrome Cookie（可能包含登录凭据），请妥善保管。','success');
  }catch(error){if(stillCurrent(id,target))status('真实导出被拒绝：'+(error.code||'E_COOKIE_EXPORT')+
    ' '+error.message,'error');}
  finally{if(id===epoch){setBusy(false);render();}}
}
function updateExportSummary(){
  const metadata=E('live-export-content').value==='metadata',select=E('live-export-format');
  if(metadata)select.value='json';
  select.disabled=busy||metadata;
  const format=select.value;
  E('live-export-target').textContent='目标：'+(liveTarget?.hostname||'未选择')+
    ' · 当前范围 '+liveRows.length+' 条（下载时重新读取）';
  E('live-export-sensitive').hidden=metadata;
  E('live-export-confirm').textContent=metadata?'下载元数据清单':'确认并下载';
  E('live-export-warning').textContent=metadata?
    '元数据清单不含 Value，无法恢复 Cookie 或登录，只需本站读取授权。':
    format==='json'?
    'JSON 仅包含当前 URL/Store/Partition 获准范围内字段，不是整个浏览器的完整备份。':
    format==='header'?
    'Cookie Header 只有名称和值，丢失 Domain、Path、Store、Partition、过期时间和安全属性；不能恢复。':
    'Netscape 丢失 Store、Partition、SameSite 等属性；分区 Cookie 会拒绝导出，不是完整备份。';
}
async function prepareLiveImport(){
  if(busy||pending||!liveTarget||liveState!=='ready'||targetPending)return;
  clearImportPreview();
  const target=liveTarget,id=epoch;let rows,created=0,replaced=0,scope,partition;
  setBusy(true);
  try{
    rows=parseImport(E('import-text').value,E('import-format').value);
    if(rows.length>10)throw new Error('真实浏览器每批最多 10 条');
    scope=await browserSdk().cookies.getCurrentStore({url:target.url});
    if(!stillCurrent(id,target))return;
    partition=await browserSdk().cookies.getPartitionKey({url:target.url});
    if(!stillCurrent(id,target))return;
    if(typeof scope?.storeId!=='string'||!partition?.partitionKey?.topLevelSite)
      throw new Error('Store/Partition 无法确定');
    rows=rows.map(row=>{
      if(row.storeId!==undefined&&row.storeId!==scope.storeId)throw new Error('Store 与授权不一致');
      if(row.partitionKey&&(row.partitionKey.topLevelSite!==partition.partitionKey.topLevelSite||
        Boolean(row.partitionKey.hasCrossSiteAncestor)!==
        Boolean(partition.partitionKey.hasCrossSiteAncestor)))
        throw new Error('Partition 与授权不一致');
      const selected={...row,storeId:scope.storeId};nativeInput(selected);return selected;
    });
    for(const row of rows){
      if(!stillCurrent(id,target))return;
      const route=new URL(target.origin);route.pathname=row.path;
      const found=await browserSdk().cookies.getAll({url:route.href,storeId:scope.storeId,
        ...(row.partitionKey?{partitionKey:row.partitionKey}:{})});
      if(!stillCurrent(id,target))return;
      if(!Array.isArray(found))throw new Error('Host 未确认预览');
      if(found.some(cookie=>key(cookie)===key(row)))replaced++;else created++;
    }
    if(!stillCurrent(id,target))return;
    // Memory-only, invalidated on file/text/format/site change and scrubbed after success.
    importPreview={epoch:id,url:target.url,source:E('import-text').value,
      format:E('import-format').value,storeId:scope.storeId,
      partitionKey:partition.partitionKey,count:rows.length,created,replaced};
    E('live-import-preview').textContent='目标：'+target.hostname+' · '+rows.length+
      ' 条 · 新增 '+created+' · 可能覆盖 '+replaced+
      '。尚未写入 Chrome；提交后每条需可信 Host 确认。';
    E('live-import-preview').hidden=false;E('live-import-confirm').hidden=false;
    status('预览已生成，请核对数量后确认。');
  }catch(error){if(stillCurrent(id,target))status('真实导入预检失败：'+
    (error.code||'E_COOKIE_IMPORT')+' '+error.message,'error');}
  finally{if(id===epoch){setBusy(false);render();}}
}
function confirmLiveImport(){
  const plan=importPreview,target=liveTarget;
  if(busy||pending||!plan||!target||!stillCurrent(plan.epoch,target)||
    plan.url!==target.url||plan.format!==E('import-format').value||
    plan.source!==E('import-text').value){
    clearImportPreview();status('网站或输入已改变，请重新预览。','error');return;
  }
  ask('向 '+target.hostname+' 导入 '+plan.count+' 条：新增 '+plan.created+
    '、可能覆盖 '+plan.replaced+'。逐条真实确认，不自动重试 UNKNOWN。继续？',
    '确认导入真实浏览器',async()=>{
    if(!stillCurrent(plan.epoch,target)||importPreview!==plan)return;
    let rows;
    try{
      rows=parseImport(E('import-text').value,E('import-format').value).map(row=>{
        if(row.storeId!==undefined&&row.storeId!==plan.storeId)throw new Error('Store 变化');
        if(row.partitionKey&&(row.partitionKey.topLevelSite!==plan.partitionKey.topLevelSite||
          Boolean(row.partitionKey.hasCrossSiteAncestor)!==
          Boolean(plan.partitionKey.hasCrossSiteAncestor)))throw new Error('Partition 变化');
        return {...row,storeId:plan.storeId};
      });
      if(rows.length!==plan.count)throw new Error('数量发生变化');
    }catch(error){clearImportPreview();status('导入计划已失效：'+error.message,'error');return;}
    clearImportPreview();let succeeded=0,failed=null,complete=false;setBusy(true);
    try{
      for(const row of rows){
        if(!stillCurrent(plan.epoch,target))break;
        let options;
        try{options=nativeInput(row);}catch(error){failed=error;break;}
        try{
          const receipt=await browserSdk().cookies.set(options);
          if(!stillCurrent(plan.epoch,target))break;
          if(receipt?.saved!==true||receipt.verified!==true)
            throw Object.assign(new Error('Chrome 回执未核实'),{code:'E_OUTCOME_UNKNOWN'});
          succeeded++;
        }catch(error){failed=error;break;}
      }
      if(stillCurrent(plan.epoch,target)){
        if(!failed&&succeeded===rows.length){
          complete=true;scrubEditors();status('Chrome 已确认导入 '+succeeded+' 条，正在刷新。','success');
        }else status('真实导入已确认 '+succeeded+'/'+rows.length+' 条；其余停止（'+
          (failed?.code||'E_COOKIE_IMPORT')+'）：'+String(failed?.message||'网站切换')+
          '。请检查实际 Cookie，不能盲目重试。','error');
      }
    }finally{if(plan.epoch===epoch){setBusy(false);render();}}
    if(complete&&stillCurrent(plan.epoch,target))void readBrowserMetadata();
  });
}
async function mutate(operation,payload,okText){
  if(!data||busy)return;
  const id=epoch;setBusy(true);
  try{
    let list=[...data.cookies],removed=0;
    if(operation==='cookies.save')list=saveToList(list,payload.cookie,payload.previous||null);
    else if(operation==='cookies.remove'){
      const index=list.findIndex(row=>key(row)===key(payload.cookie));
      if(index<0||JSON.stringify(list[index])!==JSON.stringify(payload.cookie))throw stale();
      list.splice(index,1);removed=1;
    }else if(operation==='cookies.clear'){
      if(payload.confirm!=='DELETE_PREVIEW')throw new Error('未确认清空');
      removed=list.length;list=[];
    }else throw new Error('本地操作不支持');
    if(id!==epoch)return;
    data={...data,cookies:sortCookies(list)};
    shown.clear();editor.hidden=true;importer.hidden=true;editing=null;clean();render();
    status(okText+(removed?' 共 '+removed+' 条。':'')+'（仅本地预览）','success');
  }catch(error){if(id===epoch)status('本地操作未执行：'+String(error.message||error),'error');}
  finally{if(id===epoch)setBusy(false);}
}
function exportText(format,source=null){
  const rows=source??data?.cookies;
  if(!Array.isArray(rows)||!rows.length)throw new Error('当前没有可导出的 Cookie');
  if(format==='json')return JSON.stringify(rows,null,2)+'\n';
  if(format==='header'){
    if(rows.some(row=>/[;\r\n\x00]/.test(row.name)||/[;\r\n\x00]/.test(row.value)))
      throw new Error('Cookie Header 无法无损表达该名称或值，请选择 JSON');
    return rows.map(row=>row.name+'='+row.value).join('; ')+'\n';
  }
  if(format==='netscape'){
    if(rows.some(row=>row.partitionKey))throw new Error('Netscape 不支持分区 Cookie，请使用 JSON 保留完整字段');
    if(rows.some(row=>[row.name,row.value,row.domain,row.path].some(value=>/[\t\r\n\x00]/.test(value))))
      throw new Error('Netscape 无法表示包含制表符或换行的字段，请使用 JSON');
    return '# Netscape HTTP Cookie File\n'+rows.map(row=>[
      (row.httpOnly?'#HttpOnly_':'')+row.domain,
      row.hostOnly?'FALSE':'TRUE',row.path,row.secure?'TRUE':'FALSE',
      row.session?'0':String(Math.floor(row.expirationDate)),
      row.name,row.value
    ].join('\t')).join('\n')+'\n';
  }
  throw new Error('请选择受支持的导出格式');
}
function parseImport(text,format){
  if(typeof text!=='string'||!text.trim()||new Blob([text]).size>MAX_TEXT_BYTES)
    throw new Error('请输入不超过 150 KB 的 Cookie 文本');
  let rows;
  const trimmed=text.trim();
  if(format==='auto'){
    if(trimmed.startsWith('[')||trimmed.startsWith('{'))format='json';
    else if(trimmed.split(/\r?\n/).some(line=>line.split('\t').length===7))format='netscape';
    else format='header';
  }
  if(format==='json'){
    const value=JSON.parse(text);
    if(Array.isArray(value))rows=value;
    else if(value?.cookies&&Array.isArray(value.cookies))rows=value.cookies;
    else if(value&&typeof value==='object'&&!Array.isArray(value)&&
      Object.values(value).every(v=>typeof v==='string')){
      rows=Object.entries(value).map(([name,value])=>({name,value}));
    }else throw new Error('JSON 需是 Cookie 数组、带 cookies 数组的对象或名称到字符串的字典');
  }else if(format==='header'){
    const input=trimmed.replace(/^Cookie:\s*/i,'');
    rows=input.split(';').map(v=>v.trim()).filter(Boolean).map(entry=>{
      const i=entry.indexOf('=');
      if(i<=0)throw new Error('Header 项必须为 name=value');
      return {name:entry.slice(0,i).trim(),value:entry.slice(i+1),domain:data.hostname,path:'/'};
    });
  }else if(format==='netscape'){
    rows=text.split(/\r?\n/).filter(v=>v.trim()&&(!v.startsWith('#')||v.startsWith('#HttpOnly_'))).map((line,index)=>{
      const c=line.split('\t');
      if(c.length!==7)throw new Error('Netscape 数据行必须为 7 个制表符分隔列（第 '+(index+1)+' 行）');
      if(!['TRUE','FALSE'].includes(c[1])||!['TRUE','FALSE'].includes(c[3]))
        throw new Error('Netscape 的子域和 Secure 列只能为 TRUE 或 FALSE');
      const domain=c[0].replace(/^#HttpOnly_/,'');
      const expires=Number(c[4]);
      if(!Number.isFinite(expires))throw new Error('Netscape 过期时间必须为 Unix 秒数');
      return {name:c[5],value:c[6],domain,path:c[2],hostOnly:c[1]==='FALSE',
        secure:c[3]==='TRUE',httpOnly:c[0].startsWith('#HttpOnly_'),
        session:expires===0,...(expires?{expirationDate:expires}:{})};
    });
  }else throw new Error('请选择支持的 Cookie 格式');
  if(!rows.length||rows.length>MAX_IMPORT)throw new Error('一次只允许导入 1–100 条 Cookie');
  const results=rows.map(normalizeCookie);
  const seen=new Set();
  for(const row of results){
    const id=key(row);
    if(seen.has(id))throw new Error('导入文件中有重复的 Cookie 身份，请先合并');
    seen.add(id);
  }
  return results;
}
function mergeImport(rows,original){
  const map=new Map(original.map(row=>[key(row),row]));
  let created=0,replaced=0;
  for(const row of rows){
    if(map.has(key(row)))replaced++;else created++;
    map.set(key(row),row);
  }
  if(map.size>MAX_COOKIES)throw new Error('合并后超过每个工作区 200 条限制');
  return {cookies:sortCookies([...map.values()]),created,replaced};
}
function prepareImport(){
  if(!data||busy)return;
  if(mode==='browser'){void prepareLiveImport();return;}
  try{
    const rows=parseImport(E('import-text').value,E('import-format').value);
    const plan=mergeImport(rows,data.cookies),boundEpoch=epoch,host=data.hostname;
    ask('即将导入 '+rows.length+' 条 Cookie：新增 '+plan.created+' 条，覆盖 '+plan.replaced+
      ' 条。只会更改本地临时工作区，不影响浏览器。确认导入？','确认导入',()=>{
      if(boundEpoch!==epoch||data?.hostname!==host){status('当前网页已变化，导入计划已失效。','error');return;}
      setBusy(true);
      try{
        data={...data,cookies:plan.cookies};shown.clear();importer.hidden=true;clean();render();
        status('本地导入完成：新增 '+plan.created+' 条，覆盖 '+plan.replaced+' 条。浏览器 Cookie 未改变。','success');
      }finally{setBusy(false);}
    });
  }catch(error){status('导入检查失败：'+String(error.message||error),'error');}
}
function scrubEditors(){
  E('cookie-value').value='';E('import-text').value='';E('import-file').value='';
  editing=null;editorBaseline=null;expandedCookieKey=null;liveValueEdited=false;dirty=false;
  E('editor-reveal-value').hidden=true;E('editor-revealed-value').hidden=true;
  E('editor-revealed-value').textContent='';E('editor-delete').hidden=true;
  editor.hidden=true;importer.hidden=true;E('browser-import-slot').hidden=true;
  E('offline-import-slot').hidden=true;E('offline-editor-slot').hidden=true;
  E('live-export-panel').hidden=true;E('browser-editor-slot').hidden=true;
  clearImportPreview();shown.clear();liveSecrets.clear();notify();
}
function changeMode(next){
  if(busy||pending||mode===next)return;
  guarded(()=>{
    scrubEditors();mode=next;liveSecrets.clear();observing=null;
    E('offline-tools').open=next==='offline';
    if(next==='browser')status('');
    if(next==='browser'&&liveTarget&&liveState!=='ready'&&!targetPending)void readBrowserMetadata();
    else status('离线工作区：新增、编辑、导入和清空均不影响真实 Chrome Cookie。');
    render();
  });
}
E('mode-browser').addEventListener('click',()=>changeMode('browser'));
E('mode-offline').addEventListener('click',()=>changeMode('offline'));
E('target-url').addEventListener('input',()=>{
  if(busy)return; // the field is disabled during live Host operations
  mark();
  if(dirty){E('target-url').value=liveTarget?.url||'';
    status('请先保存或取消未保存的 Cookie 内容，再切换网站。','error');return;}
  if(!editor.hidden||!importer.hidden||!E('live-export-panel').hidden)scrubEditors();
  const wasPending=targetPending;
  targetPending=E('target-url').value!==(liveTarget?.url||'');
  if(targetPending||wasPending){
    epoch++;liveRows=[];liveState='idle';liveSecrets.clear();observing=null;
  }
  render();
  if(wasPending&&!targetPending&&mode==='browser'&&liveTarget)
    void readBrowserMetadata();
});
E('apply-target').addEventListener('click',()=>guarded(()=>{
  try{
    const target=parseTarget(E('target-url').value);
    scrubEditors();targetOverride=target.url;targetPending=false;E('target-url').value=target.url;
    E('target-selector').open=false;data=null;void refresh();
  }catch(error){status('选择网站失败：'+String(error.message||error),'error');}
}));
E('use-current').addEventListener('click',()=>guarded(()=>{
  scrubEditors();targetOverride='';targetPending=false;E('target-selector').open=false;data=null;void refresh();
}));
function openImportPanel(){
  scrubEditors();
  const browser=mode==='browser',slot=E(browser?'browser-import-slot':'offline-import-slot');
  slot.append(importer);slot.hidden=false;
  E(browser?'offline-import-slot':'browser-import-slot').hidden=true;
  importer.hidden=false;clearImportPreview();clean();
  E('import-heading').textContent=browser?'导入真实 Chrome Cookie':'导入离线工作区';
  E('import-help').textContent=browser?
    '文件或粘贴内容先预览新增/覆盖；每批至多 10 条。每条写入经可信 Host 逐次确认。':
    '仅修改临时内存，每批至多 100 条，不影响 Chrome。';
  E('import-apply').textContent=browser?'预览导入':'确认导入';
  renderBrowser();E('import-text').focus();
}
E('live-new').addEventListener('click',()=>guarded(()=>openEditor()));
E('editor-reveal-value').addEventListener('click',()=>{
  if(busy||pending||mode!=='browser'||editor.hidden||editing===null)return;
  const row=liveRows.find(item=>key(item)===expandedCookieKey);
  if(row)void revealBrowserValue(row);
});
E('editor-delete').addEventListener('click',()=>{
  if(busy||pending||mode!=='browser'||editor.hidden||!editing)return;
  const row=liveRows.find(item=>key(item)===expandedCookieKey);
  if(!row||!sameCookieMetadata(row,editing)){
    status('Cookie 身份已变化，请先刷新并重新选择。','error');return;
  }
  guarded(()=>ask('真实删除「'+row.name+'」 · '+row.domain+
    row.path+'？仅处理精确身份。','确认删除',()=>deleteBrowserCookie(row)));
});
E('live-clear').addEventListener('click',()=>{void clearBrowserSite();});
E('live-import').addEventListener('click',()=>guarded(openImportPanel));
E('live-export').addEventListener('click',()=>guarded(()=>{
  scrubEditors();E('live-export-panel').hidden=false;updateExportSummary();renderBrowser();
  E('live-export-format').focus();
}));
for(const id of ['live-export-close','live-export-cancel'])
  E(id).addEventListener('click',()=>{E('live-export-panel').hidden=true;E('live-export').focus();});
E('live-export-format').addEventListener('change',updateExportSummary);
E('live-export-content').addEventListener('change',updateExportSummary);
E('live-export-confirm').addEventListener('click',()=>{
  const metadata=E('live-export-content').value==='metadata';
  ask('导出 '+(liveTarget?.hostname||'当前网站')+' Cookie：'+
    (metadata?'不含 Value 的 JSON 元数据清单，不可用于恢复':
      E('live-export-format').value+' 格式，包含可能用于登录的 Cookie Value')+
    '；仅本地下载，不自动上传。确认？',
    metadata?'确认下载清单':'确认下载 Cookie',()=>exportBrowserCookies());
});
E('live-import-confirm').addEventListener('click',confirmLiveImport);
E('live-observe-start').addEventListener('click',()=>{void observeBrowser('start');});
E('live-observe-read').addEventListener('click',()=>{void observeBrowser('read');});
E('live-observe-stop').addEventListener('click',()=>{void observeBrowser('stop');});
E('site-pick').addEventListener('click',()=>{
  if(busy||mode!=='browser')return;
  const picker=E('target-selector');picker.open=!picker.open;
  if(picker.open)E('target-url').focus();
});
E('live-filter-toggle').addEventListener('click',()=>{
  if(busy||liveState!=='ready')return;
  const choices=E('live-filter-advanced');choices.hidden=!choices.hidden;
  E('live-filter-toggle').setAttribute('aria-expanded',String(!choices.hidden));
  if(!choices.hidden)choices.querySelector?.('[data-cookie-filter]')?.focus?.();
});
E('live-filter-advanced').addEventListener('click',event=>{
  const chip=event.target?.closest?.('[data-cookie-filter]');
  if(!chip||busy||liveState!=='ready')return;
  E('live-filter').value=chip.dataset.cookieFilter;render();
});
E('live-search').addEventListener('input',render);
E('live-filter').addEventListener('change',render);
E('live-sort').addEventListener('change',render);
E('refresh').addEventListener('click',()=>guarded(()=>{
  scrubEditors();
  void refresh().catch(error=>status('刷新失败：'+String(error.message||error),'error'));
}));
E('search').addEventListener('input',render);
E('add').addEventListener('click',()=>guarded(()=>openEditor()));
E('import-toggle').addEventListener('click',()=>guarded(openImportPanel));
for(const id of ['editor-cancel','editor-close','import-cancel','import-close'])
  E(id).addEventListener('click',()=>guarded(dismiss));
E('cookie-session').addEventListener('change',()=>{E('expiry-field').hidden=E('cookie-session').checked;});
for(const id of ['input','change']){
  E('editor-form').addEventListener(id,mark);
  importer.addEventListener(id,()=>{mark();clearImportPreview();});
}
E('cookie-value').addEventListener('input',event=>{
  if(event?.isTrusted!==false&&mode==='browser'&&editing?.valueRedacted===true)
    liveValueEdited=true;
});
// Installed opaque sandboxes forbid native form submission, including submit
// events. Save through the actual button without relaxing allow-forms or CSP.
function saveEditor(){
  if(!data||busy)return;
  mark();
  if(editing&&!dirty){dismiss();status('Cookie 内容没有变化，无需写入。');return;}
  if(!E('editor-form').reportValidity())return;
  if(mode==='browser')void saveBrowserCookie();
  else void mutate('cookies.save',{cookie:formCookie(),
    ...(editing?{previous:editing}:{})},'Cookie 已保存。');
}
E('editor-form').addEventListener('invalid',event=>{
  // Fields inside a closed disclosure must become visible for correction.
  if(E('cookie-advanced').contains?.(event.target))E('cookie-advanced').open=true;
},true);
E('editor-save').addEventListener('click',saveEditor);
E('editor-form').addEventListener('submit',event=>{
  event.preventDefault();saveEditor();
});
E('clear').addEventListener('click',()=>guarded(()=>ask(
  '仅清空离线工作区的 '+data.cookies.length+' 条临时 Cookie，不会影响浏览器或网站登录。','清空离线数据',
  ()=>mutate('cookies.clear',{confirm:'DELETE_PREVIEW'},'已清空本地工作区。'))));
E('confirm-cancel').addEventListener('click',cancelConfirmation);
E('confirm-accept').addEventListener('click',()=>{const fn=pending;cancelConfirmation();if(fn)void fn();});
E('copy').addEventListener('click',async()=>{
  if(!data||busy||pending)return;const actionEpoch=epoch;let text='';
  try{
    text=exportText(E('export-format').value);
    if(!text.trim()||new Blob([text]).size>150000)throw new Error('导出为空或超过 150 KB');
    setBusy(true);await browserSdk().clipboard.writeText(text);
    if(actionEpoch===epoch)status('已复制；Cookie 可能包含登录凭据，请勿在不可信网站粘贴。','success');
  }catch(error){if(actionEpoch===epoch)status('复制失败：'+String(error.message||error),'error');}
  finally{if(actionEpoch===epoch)setBusy(false);text='';}
});
E('download').addEventListener('click',async()=>{
  if(!data||busy||pending)return;const actionEpoch=epoch;setBusy(true);
  try{
    const format=E('export-format').value,text=exportText(format);
    if(new Blob([text]).size>MAX_TEXT_BYTES)throw new Error('导出文件超过 150 KB');
    const host=data.hostname.replace(/[^a-z0-9.-]/gi,'_').slice(0,60);
    const filename=host+'-cookies.'+(format==='json'?'json':'txt');
    await browserSdk().downloads.text({text,filename});
    if(actionEpoch===epoch)status('已导出本地临时数据，请妥善保管。真实浏览器 Cookie 未被读取。','success');
  }catch(error){if(actionEpoch===epoch)status('导出失败：'+String(error.message||error),'error');}
  finally{if(actionEpoch===epoch)setBusy(false);}
});
E('import-file').addEventListener('change',async()=>{
  const file=E('import-file').files?.[0];if(!file)return;
  if(file.size>150000){status('文件超过 150 KB。','error');return;}
  try{
    const bound=epoch,text=await file.text();
    if(bound!==epoch)return;
    E('import-text').value=text;
    // A chosen import format takes precedence; auto mode sniffs the contents.
    clearImportPreview();mark();status('已载入本地文件，尚未合并数据。');
  }
  catch(error){status('读取文件失败：'+String(error.message||error),'error');}
});
E('import-apply').addEventListener('click',prepareImport);
root.addEventListener('keydown',event=>{
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='s'&&!editor.hidden){
    event.preventDefault();saveEditor();return;
  }
  if(confirm.hidden)return;
  if(event.key==='Escape'){event.preventDefault();cancelConfirmation();}
  if(event.key==='Tab'){
    event.preventDefault();const cancel=E('confirm-cancel'),ok=E('confirm-accept');
    (root.ownerDocument.activeElement===cancel?ok:cancel).focus();
  }
});
root.addEventListener('opendesk-cookie-grants-changed',()=>{
  mark();
  const wasBusy=busy,preserveDraft=!wasBusy&&dirty&&(!editor.hidden||!importer.hidden);
  liveSecrets.clear();observing=null;
  E('editor-revealed-value').textContent='';
  E('editor-revealed-value').hidden=true;
  E('editor-reveal-value').hidden=true;
  if(mode!=='browser'){render();return;}
  epoch++;liveRows=[];liveState='idle';liveMessage='';
  // Clear previously read native state; never silently discard unsaved input.
  if(preserveDraft)clearImportPreview();else scrubEditors();
  cancelConfirmation();setBusy(false);render();
  status(wasBusy?'授权在浏览器操作期间变化，结果可能未知；请核对 Chrome，勿自动重试。':
    preserveDraft?'网站授权变化：旧列表和值已清除，未保存输入已保留；重新核对后保存。':
    '网站 Cookie 授权已更新；敏感值与旧列表已清除，正在重新检查当前网站。');
  if(liveTarget&&!targetPending)void readBrowserMetadata();
});
root.addEventListener('opendesk-page-changed',()=>{
  const switchSite=()=>{
    // Invalidate every in-flight native receipt before any new target is read.
    epoch++;data=null;liveRows=[];busy=false;dirty=false;liveState='idle';
    shown.clear();liveSecrets.clear();observing=null;
    scrubEditors();cancelConfirmation();setBusy(false);render();void refresh();
  };
  if(busy){
    // A tab change during an outstanding Host mutation is NOT an ordinary
    // editable draft transition: the old write might already have committed.
    // Drop stale identity and secrets now; never replay the pending mutation.
    switchSite();
    status('网站已切换，上一项 Chrome 操作结果可能未知。请检查实际 Cookie，勿自动重试。','error');
    return;
  }
  // Reject stale confirmation callbacks after the tab/site identity changes.
  if(pending)cancelConfirmation();
  guarded(switchSite);
});
root.ownerDocument.defaultView?.addEventListener?.('pagehide',()=>{
  epoch++;liveRows=[];data=null;liveTarget=null;shown.clear();liveSecrets.clear();observing=null;scrubEditors();
},{once:true});
void refresh();
})();
