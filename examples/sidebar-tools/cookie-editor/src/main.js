(() => {
'use strict';
const {root,request,setState}=globalThis.OpenDeskTool;
const E=id=>root.querySelector('#'+id),editor=E('editor-panel'),importer=E('import-panel'),confirm=E('confirm-panel');
// The browser panel and local workspace intentionally have separate data owners.
// Never substitute local cookies for Chrome reads or let a sandbox request grant access.
let data=null,epoch=0,dirty=false,busy=false,editing=null,pending=null,returnFocus=null;
let mode='browser',targetOverride='',liveTarget=null,liveRows=[],liveState='idle',liveMessage='';
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
        {topLevelSite:row.partitionKey.topLevelSite}:undefined,valueRedacted:true};
  });
}
const MAX_COOKIES=200,MAX_IMPORT=100,MAX_TEXT_BYTES=150000;
const shown=new Set();
const safeHost=value=>typeof value==='string'&&/^[a-z0-9.-]{1,253}$/i.test(value)&&!value.startsWith('.')&&!value.endsWith('.');
const stale=()=>new Error('此 Cookie 已改变，请刷新离线列表后重新操作。');
const key=row=>JSON.stringify([row.name,row.domain,row.path,row.hostOnly,row.storeId,row.partitionKey||null]);
const status=(msg,type='info')=>{E('status').textContent=msg;E('status').dataset.state=type;E('status').hidden=!msg;};
const notify=()=>setState?.({dirty,busy});
const setBusy=value=>{
  busy=value;notify();
  for(const id of ['refresh','add','import-toggle','copy','download','clear','editor-save','import-apply'])
    E(id).disabled=value||(!data&&id!=='refresh')||(id==='clear'&&!data?.cookies?.length);
  for(const button of root.querySelectorAll('.row-action'))button.disabled=value;
};
const clean=()=>{dirty=false;notify();};
const mark=()=>{dirty=true;notify();};
function blockBehindConfirmation(value){
  for(const id of ['cookie-content','editor-panel','import-panel'])E(id).inert=value;
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
  E('confirm-message').textContent=message;E('confirm-accept').textContent=label;
  confirm.hidden=false;E('confirm-cancel').focus();
}
function dismiss(){if(busy)return;cancelConfirmation();editor.hidden=true;importer.hidden=true;editing=null;clean();}
function guarded(action){
  if(busy||pending)return;
  if(!dirty){action();return;}
  ask('当前有未保存的 Cookie 编辑或导入内容，确定放弃？','放弃修改',()=>{clean();action();});
}
function renderBrowser(){
  const sdk=browserSdk(),available=!!liveTarget&&typeof sdk?.cookies?.getAll==='function';
  const hasRead=liveState==='ready';
  E('browser-panel').hidden=mode!=='browser';
  E('mode-browser').setAttribute('aria-pressed',String(mode==='browser'));
  E('mode-offline').setAttribute('aria-pressed',String(mode==='offline'));
  for(const [id,active] of [['mode-browser',mode==='browser'],['mode-offline',mode==='offline']]){
    if(active)E(id).classList.add('active');else E(id).classList.remove('active');
  }
  E('cookie-content').hidden=mode!=='offline';E('preview-banner').hidden=mode!=='offline';
  const heading=E('browser-state-heading'),detail=E('browser-state-detail');
  if(!liveTarget){
    heading.textContent='请选择网页';detail.textContent='打开普通网页并点击「当前页」，或输入指定 HTTP(S) 地址。';
  }else if(!available){
    heading.textContent='浏览器 Cookie SDK 尚未开放';
    detail.textContent='当前扩展尚未向已安装工具公开 browser.cookies.getAll 和对应网站授权。这里不会使用演示数据、私有 Host 或 chrome.cookies 冒充结果。可切换到离线工作区。';
  }else if(liveState==='ready'){
    heading.textContent='已读取当前地址匹配的 Cookie 元数据';
    detail.textContent='数据来自正式 SDK；Cookie 值仍被隐藏。独立值授权和写入操作尚未接通，不能在此修改浏览器 Cookie。';
  }else if(liveState==='error'||liveState==='blocked'){
    heading.textContent=liveState==='blocked'?'需要浏览器 Cookie 授权':'浏览器读取失败';
    detail.textContent=liveMessage||'请在工具详情中检查能力与指定网站授权，然后重试。';
  }else{
    heading.textContent='需要单独授权';detail.textContent='请先在工具详情中批准 Cookie 读取与目标网站，再点击「读取 Cookie」。仅选择网站不会自动授权。';
  }
  E('target-help').textContent=targetOverride?
    '已选择指定网址；读取权限由正式 SDK 按网站和 Cookie Store 判断，不要求与当前活动标签页相同。':
    '使用当前网页地址；切换网页后重新核对授权。选择网站不会自动批准权限。';
  E('read-live').disabled=busy||!available;
  E('live-count').textContent=hasRead?liveRows.length+' 条 URL 匹配的 Cookie':'尚未读取';
  E('live-filters').hidden=!hasRead;
  const term=E('live-search').value.trim().toLocaleLowerCase(),filter=E('live-filter').value||'all';
  const visible=liveRows.filter(row=>
    [row.name,row.domain,row.path].some(value=>value.toLocaleLowerCase().includes(term))&&
    (filter==='all'||(filter==='secure'&&row.secure)||(filter==='httpOnly'&&row.httpOnly)||
     (filter==='session'&&row.session)||(filter==='partitioned'&&row.partitionKey)));
  const list=E('live-cookie-list');list.replaceChildren();
  E('live-empty').hidden=visible.length>0;
  E('live-empty').textContent=hasRead?
    (liveRows.length?'没有匹配的 Cookie':'当前 URL 没有匹配的 Cookie。'):available?
    '尚未读取真实 Cookie。':'等待公开 SDK 和授权，不显示虚构 Cookie。';
  const doc=root.ownerDocument;
  for(const row of visible){
    const item=doc.createElement('div');item.className='cookie-row';item.setAttribute('role','listitem');
    const name=doc.createElement('strong');name.className='cookie-row-name';name.textContent=row.name||'（空名称）';
    const meta=doc.createElement('span');meta.className='cookie-row-meta';
    meta.textContent=row.domain+row.path+(row.hostOnly?' · Host-only':' · Domain')+
      (row.session?' · 会话':' · 持久')+(row.secure?' · Secure':'')+
      (row.httpOnly?' · HttpOnly':'')+(row.sameSite?' · SameSite '+row.sameSite:'')+
      (row.storeId?' · Store '+row.storeId:'')+
      (row.partitionKey?' · 分区 '+row.partitionKey.topLevelSite:'');
    const value=doc.createElement('div');value.className='cookie-row-value';
    value.textContent='•••••••• · 敏感值未读取';
    item.append(name,meta,value);list.append(item);
  }
}
function render(){
  renderBrowser();
  const list=E('cookie-list');list.replaceChildren();
  E('cookie-count').textContent=(data?.cookies?.length||0)+' 条 Cookie';
  E('site-host').textContent=data?.hostname||'本地 Cookie 工作区';
  E('site-url').textContent=data?.origin||'';E('site-url').hidden=!data;
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
  E('sample').hidden=!data||data.cookies.length>0;
  E('sample').disabled=busy;
}
function openEditor(row=null){
  if(!data)return;
  importer.hidden=true;editor.hidden=false;editing=row?structuredClone(row):null;
  E('editor-heading').textContent=row?'编辑 Cookie':'新建 Cookie';
  E('cookie-name').value=row?.name||'';E('cookie-value').value=row?.value||'';
  E('cookie-domain').value=row?.domain||data.hostname;E('cookie-path').value=row?.path||'/';
  E('cookie-same-site').value=row?.sameSite||'unspecified';
  E('cookie-host-only').checked=row?row.hostOnly:true;E('cookie-secure').checked=!!row?.secure;
  E('cookie-http-only').checked=!!row?.httpOnly;E('cookie-session').checked=row?row.session:true;
  E('expiry-field').hidden=E('cookie-session').checked;
  if(row?.expirationDate){
    const instant=new Date(row.expirationDate*1000);
    E('cookie-expiry').value=new Date(instant.getTime()-instant.getTimezoneOffset()*60000).toISOString().slice(0,16);
  }else E('cookie-expiry').value='';
  for(const id of ['cookie-name','cookie-domain','cookie-path'])E(id).readOnly=Boolean(row);
  E('cookie-host-only').disabled=Boolean(row);
  clean();E('cookie-name').focus();
}
function formCookie(){
  const expiry=E('cookie-expiry').value;
  return {name:E('cookie-name').value,value:E('cookie-value').value,
    domain:E('cookie-domain').value,path:E('cookie-path').value,
    hostOnly:E('cookie-host-only').checked,secure:E('cookie-secure').checked,
    httpOnly:E('cookie-http-only').checked,sameSite:E('cookie-same-site').value,
    session:E('cookie-session').checked,
    ...(!E('cookie-session').checked?{expirationDate:expiry?new Date(expiry).getTime()/1000:NaN}:{}),
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
    if(id!==key(previous))throw new Error('不能修改名称、域名、路径或 Cookie 分区身份');
  }else if(index!==-1)throw new Error('同身份 Cookie 已存在。请选择编辑，或通过导入进行覆盖。');
  const out=[...list];
  if(index<0)out.push(next);else out[index]=next;
  if(out.length>MAX_COOKIES)throw new Error('单一工作区最多 200 条 Cookie');
  return sortCookies(out);
}
async function refresh(){
  const id=++epoch,prior=data;
  shown.clear();liveRows=[];liveState='idle';liveMessage='';setBusy(true);
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
    const host=target?.hostname||'example.test';
    data={hostname:host,origin:target?.origin||'',url:target?.url||'',
      cookies:prior?.hostname===host?prior.cookies:[]};
    E('site-host').textContent=target?.hostname||'尚未选择网站';
    E('site-url').textContent=target?.url||'';E('site-url').hidden=!target;
    if(!targetOverride)E('target-url').value=target?.url||'';
    E('preview-banner').textContent='离线工作区 · '+(target?
      '仅用 '+host+' 作为临时数据校验范围，不读取或修改浏览器 Cookie。':
      '没有可用网页，使用 example.test 本地演示域名。')+' 关闭工具后数据不保留。';
    status(mode==='offline'?'正在使用离线工作区；所有修改仅保存在临时内存。':'');
  }catch(error){if(id===epoch){liveState='error';liveMessage=String(error.message||error);status(liveMessage,'error');}}
  finally{if(id===epoch){setBusy(false);render();}}
}
async function readBrowserMetadata(){
  if(busy||pending||!liveTarget)return;
  const sdk=browserSdk(),target=liveTarget,id=epoch;
  if(typeof sdk?.cookies?.getAll!=='function'){
    liveState='blocked';liveMessage='公开 Cookie SDK 尚未实现';render();return;
  }
  setBusy(true);liveRows=[];liveState='idle';render();
  try{
    const permission=await sdk.capabilities.getStatus({operation:'browser.cookies.getAll'});
    if(!permission?.callableNow){
      if(id===epoch){liveState='blocked';liveMessage='尚未获得该网站的读取能力（'+
        String(permission?.reasonCode||'E_PERMISSION_REQUIRED').slice(0,80)+'）。请在工具详情中审阅网站授权。';}
      return;
    }
    // Only public tool SDK: never invoke chrome.cookies or private approve/execute.
    const result=await sdk.cookies.getAll({url:target.url});
    const rows=redactMetadata(result);
    if(id!==epoch||liveTarget?.url!==target.url||mode!=='browser')return;
    liveRows=rows;liveState='ready';liveMessage='';
  }catch(error){
    if(id===epoch){liveRows=[];liveState='error';
      liveMessage='读取被拒绝或结果不确定（'+String(error.code||'E_COOKIE_READ').slice(0,60)+
        '）。检查安装、网站、Store 与授权后手动刷新，不会自动重试。';}
  }finally{if(id===epoch){setBusy(false);render();}}
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
function exportText(format){
  if(!data?.cookies?.length)throw new Error('当前工作区没有可以导出的 Cookie');
  const rows=data.cookies;
  if(format==='json')return JSON.stringify(rows,null,2)+'\n';
  if(format==='header')return rows.map(row=>row.name+'='+row.value).join('; ')+'\n';
  if(format==='netscape'){
    if(rows.some(row=>row.partitionKey))throw new Error('Netscape 不支持分区 Cookie，请使用 JSON 保留完整字段');
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
  editing=null;dirty=false;editor.hidden=true;importer.hidden=true;shown.clear();notify();
}
function changeMode(next){
  if(busy||pending||mode===next)return;
  guarded(()=>{
    scrubEditors();mode=next;
    if(next==='browser')status('');
    else status('离线工作区：新增、编辑、导入和清空均不影响真实 Chrome Cookie。');
    render();
  });
}
E('mode-browser').addEventListener('click',()=>changeMode('browser'));
E('mode-offline').addEventListener('click',()=>changeMode('offline'));
E('apply-target').addEventListener('click',()=>guarded(()=>{
  try{
    const target=parseTarget(E('target-url').value);
    scrubEditors();targetOverride=target.url;E('target-url').value=target.url;data=null;void refresh();
  }catch(error){status('选择网站失败：'+String(error.message||error),'error');}
}));
E('use-current').addEventListener('click',()=>guarded(()=>{
  scrubEditors();targetOverride='';data=null;void refresh();
}));
E('read-live').addEventListener('click',()=>{void readBrowserMetadata();});
E('live-search').addEventListener('input',render);
E('live-filter').addEventListener('change',render);
E('refresh').addEventListener('click',()=>guarded(()=>{scrubEditors();void refresh();}));
E('search').addEventListener('input',render);
E('add').addEventListener('click',()=>guarded(()=>openEditor()));
E('import-toggle').addEventListener('click',()=>guarded(()=>{
  editor.hidden=true;editing=null;importer.hidden=false;clean();E('import-text').focus();
}));
for(const id of ['editor-cancel','editor-close','import-cancel','import-close'])
  E(id).addEventListener('click',()=>guarded(dismiss));
E('cookie-session').addEventListener('change',()=>{E('expiry-field').hidden=E('cookie-session').checked;});
for(const id of ['input','change']){
  E('editor-form').addEventListener(id,mark);importer.addEventListener(id,mark);
}
E('editor-form').addEventListener('submit',event=>{
  event.preventDefault();if(data&&!busy)void mutate('cookies.save',{cookie:formCookie(),
    ...(editing?{previous:editing}:{})},'Cookie 已保存。');
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
    setBusy(true);await request('clipboard.writeText',{text});
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
    await request('file.download',{text,filename});
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
    if(/\.json$/i.test(file.name))E('import-format').value='json';
    mark();status('已载入本地文件，尚未合并数据。');
  }
  catch(error){status('读取文件失败：'+String(error.message||error),'error');}
});
E('import-apply').addEventListener('click',prepareImport);
E('sample').addEventListener('click',()=>{
  if(!data||busy||data.cookies.length)return;
  try{
    const rows=[
      normalizeCookie({name:'opendesk_demo',value:'local-preview-only',domain:data.hostname,path:'/',session:true}),
      normalizeCookie({name:'theme',value:'light',domain:data.hostname,path:'/',secure:false,sameSite:'lax',session:true})
    ];
    data={...data,cookies:sortCookies(rows)};render();
    status('已添加两条虚构示例 Cookie；未读取、未修改真实网页。','success');
  }catch(error){status('无法生成示例：'+String(error.message||error),'error');}
});
root.addEventListener('keydown',event=>{
  if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='s'&&!editor.hidden){
    event.preventDefault();E('editor-form').requestSubmit();return;
  }
  if(confirm.hidden)return;
  if(event.key==='Escape'){event.preventDefault();cancelConfirmation();}
  if(event.key==='Tab'){
    event.preventDefault();const cancel=E('confirm-cancel'),ok=E('confirm-accept');
    (root.ownerDocument.activeElement===cancel?ok:cancel).focus();
  }
});
root.addEventListener('opendesk-page-changed',()=>{
  epoch++;data=null;liveRows=[];busy=false;dirty=false;liveState='idle';shown.clear();
  scrubEditors();confirm.hidden=true;pending=null;blockBehindConfirmation(false);
  notify();render();void refresh();
});
root.ownerDocument.defaultView?.addEventListener?.('pagehide',()=>{
  epoch++;liveRows=[];data=null;liveTarget=null;shown.clear();scrubEditors();
},{once:true});
void refresh();
})();
