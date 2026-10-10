import {AGENT_CONFIG_PROTOCOL} from './protocol.js';
import {previewDocument,validatePreviewURL,displayPagePreview} from './file-preview.js';
import {createMemoryWorkspace,textSHA256} from './file-workspace-demo.js';
import {initWorkspaceChatEdit} from './workspace-chat-edit-ui.js';
import {sourceLabel,sourceName} from './source-label.js';
import {validateRequestPath} from './workspace-chat-request.js';

export function initFileWorkspace({api=globalThis.chrome,doc=globalThis.document,client}={}){
  const root=doc.getElementById('file-workspace');if(!root)return;
  const byId=id=>doc.getElementById(id);
  for(const [id,title,sandbox] of [['file-preview','文件静态预览',''],['app-preview','本机应用预览','allow-scripts allow-forms allow-same-origin']]){
    const frame=doc.createElement('iframe');frame.id=id;frame.title=title;frame.setAttribute('sandbox',sandbox);frame.referrerPolicy='no-referrer';
    byId(id+'-slot').append(frame);
  }
  const native=!!api?.runtime?.id;
  async function bridge(message){
    const response=await api.runtime.sendMessage({protocol:AGENT_CONFIG_PROTOCOL,...message});
    if(!response?.ok)throw response?.error||{code:'E_FILES_DISCONNECTED',message:'本机文件工作区未响应'};
    return response.data;
  }
  client||=native?{demo:false,state:()=>bridge({type:'files.state'}),request:(method,params,expected={})=>bridge({type:'files.request',method,params,...(expected.sessionId?{expectedSessionId:expected.sessionId}:{})})}:createMemoryWorkspace();
  const demo=!!client.demo,records=new Map(),targets=new Map(),workspaceAccess=new Map(),workspaceRows=new Map();
  const HISTORY_KEY='opendesk.workspace.display-cache.v1';
  const workspacePattern=/^workspace-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
  const query=new URL(globalThis.location?.href||'https://invalid.local/').searchParams;
  const requested=workspacePattern.test(query.get('workspaceId')||'')?query.get('workspaceId'):'';
  let pendingSource=/^source-[a-f0-9]{24}$/.test(query.get('sourceId')||'')?query.get('sourceId'):'';
  let current=null,workspaceId=requested,directory='',busy=false,connected=false,view='preview',previewTimer,closed=false,creationPending=null,chatEdit;
  let history=[],refreshGeneration=0,pendingRefresh=false,fileState={};
  const historyReady=(async()=>{
    if(demo)return;
    try{
      const saved=(await api.storage?.local?.get(HISTORY_KEY))?.[HISTORY_KEY];
      if(Array.isArray(saved?.workspaces)&&saved.workspaces.length<=32){
        history=saved.workspaces.filter(row=>workspacePattern.test(row.workspaceId)&&typeof row.name==='string'&&row.name.length<=160)
          .map(row=>({workspaceId:row.workspaceId,name:sourceName(row.name),sourceId:typeof row.sourceId==='string'?row.sourceId:'',access:row.access==='read-write'?'read-write':'read-only'}));
        if(!requested&&!pendingSource&&workspacePattern.test(saved.selection||''))workspaceId=saved.selection;
      }
    }catch{ /* Display history is optional, never permission. */ }
  })();
  const status=(text,error=false)=>{const el=byId('workspace-status');el.textContent=text;el.classList.toggle('error',error);};
  const failure=e=>status((e.code?e.code+' · ':'')+(e.message||String(e)),true);
  const dirty=record=>!!record&&record.content!==record.baseContent;
  const writable=()=>current&&workspaceAccess.get(current.workspaceId)==='read-write';
  const authorityFor=(ws=workspaceId)=>{
    const row=workspaceRows.get(ws);if(!connected||!row)return null;
    return Object.freeze({workspaceId:ws,sourceId:row.sourceId||'',leaseEpoch:row.leaseEpoch||'',
      sessionId:fileState.sessionId||(demo?'memory-demo-session':null),access:row.access,
      devLeaseEpoch:fileState.devLeaseEpoch===1?1:0});
  };
  const sameAuthority=(a,b)=>!!a&&!!b&&['workspaceId','sourceId','leaseEpoch','sessionId','access'].every(k=>a[k]===b[k]);
  const expected=authority=>authority?.sessionId?{sessionId:authority.sessionId}:{};
  const fileParams=(params,authority)=>({...params,...(authority?.devLeaseEpoch===1?{leaseEpoch:authority.leaseEpoch}:{})});
  async function assertAuthority(authority){
    if(closed||!sameAuthority(authority,authorityFor())||authority.workspaceId!==workspaceId)
      throw {code:'E_FILES_SESSION',message:'工作区、权限或连接代次已经变化，请重新读取并绑定。',outcome:'NOT_DISPATCHED'};
    if(demo)return;
    const state=await client.state();
    if(!state.connected||state.sessionId!==authority.sessionId)throw {code:'E_FILES_SESSION',message:'原 Native 连接已失效。',outcome:'NOT_DISPATCHED'};
    const data=await client.request('workspaces.list',{},expected(authority));
    const row=data?.workspaces?.find(row=>row.workspaceId===authority.workspaceId);
    if(!row||!sameAuthority(authority,{...row,sourceId:row.sourceId||'',leaseEpoch:row.leaseEpoch||'',sessionId:state.sessionId})||
      !sameAuthority(authority,authorityFor())||closed)
      throw {code:'E_FILES_SESSION',message:'原目录授权或 CLI 租约已失效，草稿与结果保留。',outcome:'NOT_DISPATCHED'};
  }
  async function assertSaveAuthority(record){
    if(!record||record.workspaceId!==workspaceId||!writable()||!connected)
      throw {code:'E_FILES_ACCESS',message:'当前目录未处于有效读写连接。',outcome:'NOT_DISPATCHED'};
    await assertAuthority(record.authority);
    await chatEdit?.beforeSave(record);
  }
  function controls(){
    const currentAuthority=current&&sameAuthority(current.authority,authorityFor(current.workspaceId));
    for(const id of ['refresh-connection','save-as-path'])byId(id).disabled=busy;
    byId('target-picker').disabled=busy||demo;
    byId('workspace-picker').disabled=busy||!connected;
    byId('workspace-access-note').hidden=!connected||workspaceAccess.get(workspaceId)!=='read-only';
    const reason=workspaceRows.get(workspaceId)?.accessReason;
    byId('workspace-access-reason').textContent=reason==='persistent-read-only'?'本目录已有明确的长期只读授权，CLI 默认读写不会升级它。':
      reason==='active-session'?'复用已在线会话的只读权限；重复启动不会修改原会话。':'当前 CLI 会话以只读模式接入，保存由 Native 拒绝。';
    byId('refresh-files').disabled=busy||!connected||!workspaceAccess.has(workspaceId);
    for(const node of byId('file-list').querySelectorAll('button'))node.disabled=busy||!connected;
    byId('parent-directory').disabled=busy||!connected||!directory;
    // Read-only Native grants limit disk writes, not the user's unsaved
    // in-memory draft. Do not mistake a read-only workspace for a read-only
    // text editor; Save/Save As remain authority-gated below.
    byId('file-editor').disabled=busy||!current;
    byId('save-file').disabled=busy||!connected||!writable()||!currentAuthority||current?.workspaceId!==workspaceId||!dirty(current)||!!current?.unknown||!!current?.remote;
    byId('reload-file').disabled=busy||!connected||!current||current.workspaceId!==workspaceId;
    byId('discard-file-draft').disabled=busy||!connected||!workspaceAccess.has(workspaceId)||current?.workspaceId!==workspaceId||!dirty(current);
    byId('copy-content').disabled=busy||!current;
    byId('save-as').disabled=busy||!connected||!writable()||!currentAuthority||current?.workspaceId!==workspaceId||!!creationPending;
    byId('check-created').hidden=!creationPending;byId('check-created').disabled=busy||!connected||
      creationPending?.workspaceId!==workspaceId||!sameAuthority(creationPending?.authority,authorityFor());
    byId('show-page-preview').disabled=busy||!connected||!current||demo||!targets.has(Number(byId('target-picker').value));
    for(const id of ['open-sidebar','open-workbench','remove-page-preview'])byId(id).disabled=demo||busy||!targets.has(Number(byId('target-picker').value));
    const recordOnline=connected&&workspaceAccess.has(current?.workspaceId);
    byId('draft-label').textContent=!current?'未打开文件':!recordOnline?'离线草稿 · 禁止磁盘操作':current.unknown?'保存结果待核对':!currentAuthority?'目录连接已变化 · 请重新读取':current.remote?'磁盘版本已变化':dirty(current)?'有未保存的修改':'已保存';
    byId('draft-label').classList.toggle('dirty',dirty(current)||!!current?.unknown);
    byId('conflict-panel').hidden=!current?.remote;
    if(current?.remote)byId('disk-version').textContent=current.remote.content;
    if(current){
      const count=new TextEncoder().encode(current.content).length;
      const owner=history.find(row=>row.workspaceId===current.workspaceId);
      const sameName=owner&&history.filter(row=>sourceName(row.name)===sourceName(owner.name)).length>1;
      const ownedBy=demo?'内存演示目录':owner?sourceLabel(owner,{duplicate:sameName}):'目录身份待连接核验';
      byId('file-meta').textContent=ownedBy+' / '+current.path+' · '+count.toLocaleString()+' bytes · '+
        (current.sha256?.slice(0,10)||'')+(recordOnline?' · 已核验目录':' · 离线草稿')+(!writable()?' · 只读':'');
    }
    byId('open-sidebar').disabled=byId('open-sidebar').disabled||!connected||!workspaceAccess.has(workspaceId);
    chatEdit?.controls({busy,connected:connected&&workspaceAccess.has(workspaceId)});
  }
  async function operation(action){
    if(busy||closed)return;busy=true;controls();
    try{await action();}catch(e){failure(e);}finally{
      busy=false;controls();
      if(pendingRefresh&&!closed){pendingRefresh=false;void operation(refresh);}
    }
  }
  function scheduleRefresh(){
    refreshGeneration++;
    if(busy){pendingRefresh=true;return;}
    void operation(refresh);
  }
  function populatePicker(rows,{offline=false}={}){
    const picker=byId('workspace-picker'),counts=new Map();
    for(const row of rows){const name=sourceName(row.name);counts.set(name,(counts.get(name)||0)+1);}
    picker.replaceChildren();
    if(pendingSource&&rows.length)picker.append(new Option('指定来源暂不可用，请明确选择目录',''));
    for(const row of rows)picker.append(new Option(sourceLabel(row,{offline,duplicate:counts.get(sourceName(row.name))>1})+
      (!offline&&row.access==='read-only'?'（只读）':''),row.workspaceId));
    if(!rows.length)picker.append(new Option(offline?'尚未连接本机':'尚无已接入目录',''));
    else if(!pendingSource&&!rows.some(row=>row.workspaceId===workspaceId)&&!workspaceId)workspaceId=rows[0].workspaceId;
    if(workspaceId&&!rows.some(row=>row.workspaceId===workspaceId))
      picker.append(new Option(sourceLabel(history.find(row=>row.workspaceId===workspaceId)||{name:'原工作区'},{offline:true}),workspaceId));
    picker.value=workspaceId||'';
  }
  function offline(message){
    connected=false;workspaceAccess.clear();workspaceRows.clear();fileState={};chatEdit?.invalidate('本机连接或授权已失效，旧请求和提案已停用，草稿保留。');directory='';
    byId('directory-name').textContent='/';
    byId('file-list').replaceChildren();
    populatePicker(history,{offline:true});
    byId('connection-label').textContent='尚未连接本机';
    byId('connection-label').classList.remove('ready');
    status(message);
    controls();
  }
  function renderPreview(){
    clearTimeout(previewTimer);if(!current)return;
    byId('file-preview').srcdoc=previewDocument(current.path,current.content,doc);
    byId('preview-kind').textContent=/\.(md|markdown)$/i.test(current.path)?'基础 Markdown':/\.html?$/i.test(current.path)?'静态 HTML · 无脚本':'源码文本 · 未执行';
  }
  function showRecord(record){
    current=record;byId('file-title').textContent=record.path;byId('file-editor').value=record.content;
    for(const node of byId('file-list').querySelectorAll('button'))node.classList.toggle('selected',node.dataset.path===record.path);
    renderPreview();controls();
  }
  function validateRead(data,ws,path){
    if(!data||data.workspaceId!==ws||data.path!==path||typeof data.content!=='string'||
      !/^[a-f0-9]{64}$/.test(data.sha256)||!Number.isSafeInteger(data.bytes)||data.bytes!==new TextEncoder().encode(data.content).length||data.bytes>32768)
      throw {code:'E_FILES_PROTOCOL',message:'文件响应格式不完整，未替换当前草稿'};
    return data;
  }
  async function readFile(ws,path,authority=authorityFor(ws)){
    if(!authority)throw {code:'E_FILES_SESSION',message:'目录当前不可用。',outcome:'NOT_DISPATCHED'};
    const data=validateRead(await client.request('files.read',fileParams({workspaceId:ws,path},authority),expected(authority)),ws,path);
    if(await textSHA256(data.content)!==data.sha256)throw {code:'E_FILES_PROTOCOL',message:'文件内容与版本不一致，未替换草稿'};
    if(!sameAuthority(authority,authorityFor(ws)))throw {code:'E_FILES_SESSION',message:'读取期间目录连接已变化，未更新草稿。'};
    return {...data,authority};
  }
  async function openFile(path){
    const ws=workspaceId,key=ws+'\0'+path,authority=authorityFor(ws);
    let record=records.get(key);
    if(!record){const data=await readFile(ws,path,authority);record={...data,baseContent:data.content};records.set(key,record);}
    if(workspaceId===ws){showRecord(record);status(demo?'这是可编辑的内存演示文件。':'已从授权目录读取文件；尚未发送到 AI。');}
  }
  async function listDirectory(path=''){
    const ws=workspaceId,authority=authorityFor(ws),data=await client.request('files.list',fileParams({workspaceId:ws,path},authority),expected(authority));
    if(workspaceId!==ws)return;
    if(data?.workspaceId!==ws||data.path!==path||!Array.isArray(data.entries)||data.entries.length>512)
      throw {code:'E_FILES_PROTOCOL',message:'目录列表格式不正确'};
    directory=path;byId('directory-name').textContent=path?'/'+path:'/';
    const list=byId('file-list');list.replaceChildren();
    for(const entry of data.entries){
      if(!entry||typeof entry.path!=='string'||typeof entry.name!=='string'||!['file','directory'].includes(entry.kind))continue;
      const button=doc.createElement('button');button.type='button';button.className='file-entry';button.dataset.path=entry.path;
      const icon=doc.createElement('span'),name=doc.createElement('span');
      icon.textContent=entry.kind==='directory'?'DIR':/\.(md|markdown)$/i.test(entry.name)?'MD':/\.html?$/i.test(entry.name)?'< >':'TXT';
      icon.setAttribute('aria-hidden','true');name.textContent=entry.name;button.append(icon,name);
      button.addEventListener('click',()=>operation(()=>entry.kind==='directory'?listDirectory(entry.path):openFile(entry.path)));list.append(button);
    }
    if(!data.entries.length){const p=doc.createElement('p');p.textContent='此目录暂无可用文本文件。';list.append(p);}
    if(data.truncated)status('目录条目已达上限，请进入更具体的目录。');
    if(current)for(const node of list.querySelectorAll('button'))node.classList.toggle('selected',node.dataset.path===current.path);
  }
  async function loadTargets(){
    if(demo){byId('target-picker').replaceChildren(new Option('扩展中可选择 ChatGPT 等网页',''));return;}
    const previous=byId('target-picker').value;targets.clear();
    const list=await api.tabs.query({currentWindow:true});
    const options=[];
    for(const tab of list){if(!Number.isInteger(tab.id)||!/^https?:\/\//.test(tab.url||''))continue;
      let frame;try{frame=await api.webNavigation.getFrame({tabId:tab.id,frameId:0});}catch{continue;}
      if(typeof frame?.documentId!=='string')continue;
      targets.set(tab.id,{tabId:tab.id,documentId:frame.documentId,url:frame.url});
      options.push(new Option(tab.title||frame.url,String(tab.id)));
    }
    byId('target-picker').replaceChildren(new Option('选择网页',''),...options);
    if(targets.has(Number(previous)))byId('target-picker').value=previous;
    else{const active=list.find(t=>t.active&&targets.has(t.id));if(active)byId('target-picker').value=String(active.id);}
  }
  async function refresh(){
    const ticket=refreshGeneration;
    await historyReady;
    if(ticket!==refreshGeneration||closed)return;
    let state;
    try{state=await client.state();}
    catch(error){if(ticket===refreshGeneration)offline('无法读取 Native 状态：'+(error.code||error.message||'连接失败'));return;}
    if(ticket!==refreshGeneration||closed)return;
    fileState=state;connected=!!state.connected;
    const label=byId('connection-label');
    label.textContent=demo?'交互演示':connected?'Native 已连接':state.nativeConnected&&!state.supported?'需更新 OpenDesk':'尚未连接本机';
    label.classList.toggle('ready',connected&&!demo);
    if(!connected){
      offline(state.nativeConnected&&!state.supported?'本机 OpenDesk 不支持文件工作区，请更新。':'本机尚未连接；历史目录仅用于展示，不能执行文件操作。');
      return;
    }
    let data;
    try{data=await client.request('workspaces.list',{},expected({sessionId:state.sessionId}));}
    catch(error){if(ticket===refreshGeneration)offline('工作区读取失败：'+(error.code||error.message||'连接已中断'));return;}
    if(ticket!==refreshGeneration||closed)return;
    if(!Array.isArray(data?.workspaces)||data.workspaces.length>32){
      offline('工作区列表无效，等待重新连接。');throw {code:'E_FILES_PROTOCOL',message:'工作区列表无效'};
    }
    const rows=data.workspaces.filter(row=>row&&workspacePattern.test(row.workspaceId)&&typeof row.name==='string'&&row.name.length<=160&&
      ['read-only','read-write'].includes(row.access)&&
      (row.leaseEpoch===undefined||typeof row.leaseEpoch==='string'&&/^[A-Za-z0-9._:-]{16,100}$/.test(row.leaseEpoch)));
    if(rows.length!==data.workspaces.length){
      offline('目录身份不符合协议，等待重新连接。');throw {code:'E_FILES_PROTOCOL',message:'目录身份不符合文件工作区协议'};
    }
    const old=workspaceId;
    if(pendingSource){const exact=rows.find(row=>row.sourceId===pendingSource);
      if(exact){workspaceId=exact.workspaceId;pendingSource='';}else workspaceId='';}
    workspaceAccess.clear();workspaceRows.clear();
    for(const row of rows){workspaceAccess.set(row.workspaceId,row.access);workspaceRows.set(row.workspaceId,row);}
    chatEdit?.authorityChanged();
    if(!pendingSource&&!workspaceId&&rows.length===1)workspaceId=rows[0].workspaceId;
    populatePicker(rows);
    if(pendingSource){
      directory='';byId('file-list').replaceChildren();byId('directory-name').textContent='/';
      status('指定来源目前不可用。等待其上线，或明确选择其他已接入目录。');return;
    }
    if(!rows.length){
      directory='';
      byId('file-list').replaceChildren();byId('directory-name').textContent='/';
      status(workspaceId?'原目录已离线，名称和草稿保留；不会自动切换到其他目录。':'Native 已连接，但尚无已接入目录。');return;
    }
    if(!rows.some(row=>row.workspaceId===workspaceId)){
      byId('file-list').replaceChildren();
      status('原工作区目前不可用。请明确选择其他已接入目录；草稿仍保留。');
      return;
    }
    if(!demo){
      history=[...rows.map(row=>({workspaceId:row.workspaceId,name:sourceName(row.name),sourceId:row.sourceId||'',access:row.access})),
        ...history.filter(old=>!rows.some(row=>row.workspaceId===old.workspaceId))].slice(0,32);
      api.storage?.local?.set({[HISTORY_KEY]:{workspaces:history,selection:workspaceId}}).catch(()=>{});
    }
    try{await loadTargets();}catch{targets.clear();}
    if(ticket!==refreshGeneration||closed)return;
    await listDirectory(workspaceId===old?directory:'');
    if(ticket!==refreshGeneration||closed)return;
    if(current&&current.workspaceId!==workspaceId&&!dirty(current))current=null;
    if(!current){
      const file=byId('file-list').querySelector('button[data-path$="README.md"]')||byId('file-list').querySelector('button[data-path$=".md"]');
      if(file)await openFile(file.dataset.path);
    }
    status(demo?'内存演示文件。':'本机已连接；文件工作区可用。保存或运行都需要明确操作。');
  }
  async function reread(){
    const record=current;if(!record)return;
    const disk=await readFile(record.workspaceId,record.path);
    if(dirty(record)&&disk.sha256===record.sha256){record.unknown=false;record.remote=null;record.authority=disk.authority;status('磁盘仍为读取时的版本，当前草稿已保留。');return;}
    if(dirty(record)&&disk.content!==record.content){record.remote=disk;record.unknown=false;
      status('磁盘版本已读取。当前草稿保留，请比较版本，或另存为新文件。',true);
    }else{Object.assign(record,disk,{baseContent:disk.content,remote:null,unknown:false});
      if(current===record)showRecord(record);status('已重新读取并核对文件内容。');}
  }
  async function save(){
    const record=current;if(!record||record.remote||record.unknown||!dirty(record))return;
    const content=record.content;
    await assertSaveAuthority(record);
    const authority=record.authority;
    try{
      const result=await client.request('files.write',fileParams({workspaceId:record.workspaceId,path:record.path,content,expectedSha256:record.sha256},authority),expected(authority));
      if(result?.saved!==true||result.workspaceId!==record.workspaceId||result.path!==record.path||result.sha256!==await textSHA256(content))
        throw {code:'E_FILES_PROTOCOL',message:'保存回执无法核对，请重读磁盘。',outcome:'OUTCOME_UNKNOWN'};
      // A write ACK is not sufficient to claim the current disk contents.
      record.unknown=true;
      const disk=await readFile(record.workspaceId,record.path,authority);
      if(disk.content!==content||disk.sha256!==result.sha256){record.remote=disk;record.unknown=false;
        status('保存已收到回执，但磁盘内容随后发生变化。草稿已保留。',true);return;}
      Object.assign(record,disk,{baseContent:content,unknown:false,remote:null});
      if(current===record)showRecord(record);
      await chatEdit?.saved(record);
      status(demo?'演示文件已保存到内存，并已读回核对。':'已保存到本地文件，并已读回核对。');
    }catch(e){
      if(e.code==='E_FILES_CONFLICT'){try{record.remote=await readFile(record.workspaceId,record.path);}catch{}
        status('文件已被其他编辑器修改。没有覆盖磁盘，当前草稿已保留。',true);
      }else{if(e.outcome==='OUTCOME_UNKNOWN'||record.unknown)record.unknown=true;throw e;}
    }
  }
  async function saveAs(){
    const record=current,path=byId('save-as-path').value.trim();if(!record||!path)throw new Error('请填写新文件的相对路径');
    await assertSaveAuthority(record);
    const ws=record.workspaceId,content=record.content,authority=record.authority;
    let acknowledged=false,data;
    try{
      creationPending={workspaceId:ws,path,content,authority};
      const ack=await client.request('files.create',fileParams({workspaceId:ws,path,content},authority),expected(authority));
      if(ack?.saved!==true||ack.created!==true||ack.path!==path||ack.workspaceId!==ws||ack.sha256!==await textSHA256(content))
        throw {code:'E_FILES_PROTOCOL',message:'未能核对新文件回执。请刷新目录并重读；不会自动重试。',outcome:'OUTCOME_UNKNOWN'};
      acknowledged=true;
      data=await readFile(ws,path,authority);if(data.content!==content)throw new Error('新文件已创建，但其内容随后发生变化，请重新读取');
    }catch(e){if(e.outcome==='OUTCOME_UNKNOWN'||acknowledged)status(acknowledged?'新文件已收到创建回执，但读回未完成。请点击「核对新文件」，不要重复创建。':'新文件创建结果未知。请点击「核对新文件」，不要重复创建。',true);
      else{creationPending=null;throw e;}return;}
    await showCreated(data,'新文件已创建并读回核对。');
  }
  async function showCreated(data,message){
    const record={...data,baseContent:data.content};records.set(data.workspaceId+'\0'+data.path,record);
    workspaceId=data.workspaceId;byId('workspace-picker').value=workspaceId;creationPending=null;
    showRecord(record);byId('save-as-path').value='';
    try{await listDirectory(data.path.includes('/')?data.path.slice(0,data.path.lastIndexOf('/')):'');status(message);}
    catch(e){status(message+' 目录刷新失败，请点击「刷新目录」。'+(e.message||String(e)),true);}
  }
  async function checkCreated(){
    const pending=creationPending;if(!pending)return;
    await assertAuthority(pending.authority);
    const data=await readFile(pending.workspaceId,pending.path,pending.authority);
    if(data.content!==pending.content){status('新文件存在，但内容与待保存草稿不同。原草稿仍保留，请从文件列表打开并核对。',true);return;}
    await showCreated(data,'新文件已读回，内容与草稿一致。');
  }
  async function pagePreview(remove=false){
    const target=targets.get(Number(byId('target-picker').value));if(!target||!remove&&!current)throw new Error('请选择目标网页');
    const html=remove?'':previewDocument(current.path,current.content,doc),title=current?.path||'';
    const frame=await api.webNavigation.getFrame({tabId:target.tabId,frameId:0});
    if(frame?.documentId!==target.documentId)throw new Error('目标网页已经导航。请刷新连接，重新选择页面。');
    await api.scripting.executeScript({target:{tabId:target.tabId,documentIds:[target.documentId]},world:'ISOLATED',func:displayPagePreview,args:[{html,title,remove}]});
    status(remove?'已移除当前网页中的预览。':'已在目标网页显示当前文件的静态预览。');
  }
  function chooseView(next){
    view=next;for(const b of root.querySelectorAll('[data-view]'))if(b.tagName==='BUTTON')b.setAttribute('aria-pressed',String(b.dataset.view===view));
    byId('file-surface').hidden=next==='app';byId('app-surface').hidden=next!=='app';
    if(next!=='app')byId('file-surface').dataset.view=next;
  }
  chatEdit=initWorkspaceChatEdit({api,doc,demo,getRecord:()=>connected&&workspaceAccess.has(workspaceId)&&current?.workspaceId===workspaceId?current:null,
    getTarget:()=>targets.get(Number(byId('target-picker').value)),getAuthority:()=>authorityFor(),assertAuthority,
    requestFile:async(request,authority)=>{
      await assertAuthority(authority);
      validateRequestPath(request.path,{directory:request.operation==='list'});
      if(request.operation==='list'){
        const data=await client.request('files.list',fileParams({workspaceId:workspaceId,path:request.path},authority),expected(authority));
        await assertAuthority(authority);
        if(data?.workspaceId!==workspaceId||data.path!==request.path||!Array.isArray(data.entries)||data.entries.length>128||typeof data.truncated!=='boolean')
          throw {code:'E_FILES_PROTOCOL',message:'Native 列表结果无法核对。'};
        for(const entry of data.entries){
          if(!entry||!['file','directory'].includes(entry.kind)||typeof entry.name!=='string'||entry.path!==(request.path?request.path+'/':'')+entry.name)
            throw {code:'E_FILES_PROTOCOL',message:'Native 列表条目身份无效。'};
          validateRequestPath(entry.path,{directory:entry.kind==='directory'});
        }
        return {data};
      }
      const ws=workspaceId,key=ws+'\0'+request.path,previous=records.get(key);
      if(previous&&(dirty(previous)||previous.unknown||previous.remote))throw {code:'E_EDIT_BASE',message:'该文件有未保存或待核对的草稿，请先处理。'};
      const disk=await readFile(ws,request.path,authority);
      await assertAuthority(authority);
      const record=previous||{};Object.assign(record,disk,{baseContent:disk.content,unknown:false,remote:null});
      records.set(key,record);showRecord(record);
      return {record,data:{workspaceId:ws,path:disk.path,sha256:disk.sha256,content:disk.content,bytes:disk.bytes}};
    },
    run:operation,isWritable:()=>writable()&&current?.workspaceId===workspaceId,
    readCurrent:async()=>{const record=current,ticket=refreshGeneration,authority=authorityFor();
      if(!connected||!workspaceAccess.has(workspaceId)||record?.workspaceId!==workspaceId)
        throw {code:'E_EDIT_BASE',message:'请先连接并明确选择当前文件所属的工作区。'};
      if(!record||dirty(record)||record.unknown||record.remote)throw {code:'E_EDIT_BASE',message:'请先保存或核对当前草稿。'};
      const disk=await readFile(record.workspaceId,record.path,authority);
      if(ticket!==refreshGeneration||current!==record||!connected||!workspaceAccess.has(workspaceId)||record.workspaceId!==workspaceId)
        throw {code:'E_EDIT_BASE',message:'读取期间工作区状态已变化，请等待刷新后重新生成上下文。'};
      Object.assign(record,disk,{baseContent:disk.content});showRecord(record);return record;},
    setDraft:(record,content)=>{record.content=content;showRecord(record);chooseView('split');}
  });
  byId('demo-banner').hidden=!demo;
  if(demo){byId('open-settings').hidden=true;byId('target-picker').disabled=true;}
  byId('refresh-connection').addEventListener('click',scheduleRefresh);
  byId('refresh-files').addEventListener('click',()=>operation(()=>listDirectory(directory)));
  byId('parent-directory').addEventListener('click',()=>operation(()=>listDirectory(directory.includes('/')?directory.slice(0,directory.lastIndexOf('/')):'')));
  byId('workspace-picker').addEventListener('change',()=>operation(async()=>{
    const selected=byId('workspace-picker').value;if(pendingSource&&!workspaceAccess.has(selected))return;
    chatEdit.invalidate('已切换工作区，旧请求和提案已失效，原草稿保留。');
    pendingSource='';workspaceId=selected;current=null;directory='';
    byId('file-title').textContent='打开一个文件';byId('file-editor').value='';
    byId('file-preview').removeAttribute('srcdoc');
    if(!demo)api.storage?.local?.set({[HISTORY_KEY]:{workspaces:history,selection:workspaceId}}).catch(()=>{});
    if(connected&&workspaceAccess.has(workspaceId))await listDirectory('');
  }));
  byId('target-picker').addEventListener('change',()=>{chatEdit.invalidate('已切换目标对话，旧请求和提案已失效。');controls();});
  byId('file-editor').addEventListener('input',()=>{if(!current||busy)return;current.content=byId('file-editor').value;controls();clearTimeout(previewTimer);previewTimer=setTimeout(renderPreview,200);});
  byId('save-file').addEventListener('click',()=>operation(save));
  byId('reload-file').addEventListener('click',()=>operation(reread));
  byId('discard-file-draft').addEventListener('click',()=>operation(async()=>{
    const record=current,ws=workspaceId;
    if(!record||record.workspaceId!==ws)throw {code:'E_FILES_SESSION',message:'请先选择草稿所属目录。'};
    const disk=await readFile(ws,record.path);
    if(current!==record||workspaceId!==ws)throw {code:'E_FILES_SESSION',message:'读取期间选择已变化，原草稿保留。'};
    Object.assign(record,disk,{baseContent:disk.content,remote:null,unknown:false});chatEdit.forgetRecord(record);showRecord(record);
    status('已明确丢弃草稿并重新读取磁盘；如需 AI 修改，请建立新的读取请求。');
  }));
  byId('save-as').addEventListener('click',()=>operation(saveAs));
  byId('check-created').addEventListener('click',()=>operation(checkCreated));
  byId('use-disk').addEventListener('click',()=>{if(!current?.remote||busy)return;const disk=current.remote;Object.assign(current,disk,{baseContent:disk.content,remote:null,unknown:false});chatEdit.forgetRecord(current);showRecord(current);status('已明确采用磁盘版本。');});
  byId('copy-content').addEventListener('click',()=>{if(!current)return;const content=current.content;globalThis.navigator.clipboard.writeText(content).then(()=>status('内容已复制。你可以自行粘贴到 AI 对话。')).catch(failure);});
  for(const button of root.querySelectorAll('button[data-view]'))button.addEventListener('click',()=>chooseView(button.dataset.view));
  byId('show-page-preview').addEventListener('click',()=>operation(()=>pagePreview(false)));
  byId('remove-page-preview').addEventListener('click',()=>operation(()=>pagePreview(true)));
  byId('open-settings').addEventListener('click',()=>{if(native)api.runtime.openOptionsPage().catch(failure);});
  for(const [id,path] of [['open-sidebar','native-agent/workspace.html'],['open-workbench','ui/tool.html']])byId(id).addEventListener('click',event=>{
    if(!event.isTrusted||demo)return;
    const tabId=Number(byId('target-picker').value);if(!targets.has(tabId))return;
    if(id==='open-sidebar'&&(!connected||!workspaceAccess.has(workspaceId)||!workspacePattern.test(workspaceId)))return;
    const panelPath=id==='open-sidebar'?path+'?workspaceId='+encodeURIComponent(workspaceId):path;
    api.sidePanel.setOptions({tabId,path:panelPath,enabled:true}).then(()=>api.sidePanel.open({tabId})).then(()=>status(id==='open-sidebar'?'已在选中页面打开文件侧栏。':'已恢复该页面的工作台侧栏。')).catch(failure);
  });
  byId('connect-preview').addEventListener('click',()=>{try{const url=validatePreviewURL(byId('preview-url').value);byId('app-preview').src=url;status('预览地址：'+url+'。如果为空白，请确认服务已启动，或独立打开。');}catch(e){failure(e);}});
  byId('open-preview-tab').addEventListener('click',()=>{try{const url=validatePreviewURL(byId('preview-url').value);native?api.tabs.create({url}):globalThis.open(url,'_blank','noopener,noreferrer');}catch(e){failure(e);}});
  const onNativeChange=(message,sender)=>{
    if(!demo&&message?.protocol===AGENT_CONFIG_PROTOCOL&&message.type==='files.changed'&&
      (!sender?.id||sender.id===api.runtime.id)){
      if(message.connected===false)offline('Native 已断开，操作能力已清除，草稿保留。');
      scheduleRefresh();
    }
  };
  const onNavigation=details=>{
    if(details.frameId===0&&details.tabId===Number(byId('target-picker').value)){
      chatEdit.invalidate('目标对话发生导航，旧请求和提案已失效。返回原对话也需要重新绑定。');
      scheduleRefresh();
    }
  };
  const onTabRemoved=tabId=>{
    if(tabId===Number(byId('target-picker').value)){chatEdit.invalidate('目标标签页已关闭。');targets.delete(tabId);byId('target-picker').value='';controls();}
  };
  if(native){
    api.runtime.onMessage?.addListener(onNativeChange);
    api.webNavigation.onHistoryStateUpdated?.addListener(onNavigation);
    api.webNavigation.onCommitted?.addListener(onNavigation);
    api.tabs.onRemoved?.addListener(onTabRemoved);
  }
  const unload=()=>{closed=true;chatEdit?.invalidate('工作区页面已关闭。');clearTimeout(previewTimer);
    if(native){api.runtime.onMessage?.removeListener?.(onNativeChange);
      api.webNavigation.onHistoryStateUpdated?.removeListener?.(onNavigation);
      api.webNavigation.onCommitted?.removeListener?.(onNavigation);
      api.tabs.onRemoved?.removeListener?.(onTabRemoved);}
  };
  globalThis.addEventListener('pagehide',unload,{once:true});
  controls();void operation(refresh);
  return {dispose:unload};
}
