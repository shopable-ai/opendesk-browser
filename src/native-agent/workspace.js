import {AGENT_CONFIG_PROTOCOL} from './protocol.js';
import {previewDocument,validatePreviewURL,displayPagePreview} from './file-preview.js';
import {createMemoryWorkspace,textSHA256} from './file-workspace-demo.js';

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
  client||=native?{demo:false,state:()=>bridge({type:'files.state'}),request:(method,params)=>bridge({type:'files.request',method,params})}:createMemoryWorkspace();
  const demo=!!client.demo,records=new Map(),targets=new Map(),workspaceAccess=new Map();
  let current=null,workspaceId='',directory='',busy=false,connected=false,view='preview',previewTimer,closed=false,creationPending=null;
  const status=(text,error=false)=>{const el=byId('workspace-status');el.textContent=text;el.classList.toggle('error',error);};
  const failure=e=>status((e.code?e.code+' · ':'')+(e.message||String(e)),true);
  const dirty=record=>!!record&&record.content!==record.baseContent;
  const writable=()=>current&&workspaceAccess.get(current.workspaceId)==='read-write';
  function controls(){
    for(const id of ['workspace-picker','refresh-connection','refresh-files','save-as-path'])byId(id).disabled=busy;
    for(const node of byId('file-list').querySelectorAll('button'))node.disabled=busy;
    byId('parent-directory').disabled=busy||!directory;
    byId('file-editor').disabled=busy||!current||!writable();
    byId('save-file').disabled=busy||!connected||!writable()||!dirty(current)||!!current?.unknown||!!current?.remote;
    for(const id of ['reload-file','copy-content','save-as'])byId(id).disabled=busy||!current;
    byId('save-as').disabled=busy||!connected||!writable()||!!creationPending;
    byId('check-created').hidden=!creationPending;byId('check-created').disabled=busy||!connected;
    byId('show-page-preview').disabled=busy||!current||demo||!targets.has(Number(byId('target-picker').value));
    for(const id of ['open-sidebar','open-workbench','remove-page-preview'])byId(id).disabled=demo||busy||!targets.has(Number(byId('target-picker').value));
    byId('draft-label').textContent=!current?'未打开文件':current.unknown?'保存结果待核对':current.remote?'磁盘版本已变化':dirty(current)?'有未保存的修改':'已保存';
    byId('draft-label').classList.toggle('dirty',dirty(current)||!!current?.unknown);
    byId('conflict-panel').hidden=!current?.remote;
    if(current?.remote)byId('disk-version').textContent=current.remote.content;
    if(current){const count=new TextEncoder().encode(current.content).length;
      byId('file-meta').textContent=count.toLocaleString()+' bytes · '+(current.sha256?.slice(0,10)||'')+(demo?' · 内存文件':' · 已授权目录')+(!writable()?' · 只读':'');}
  }
  async function operation(action){
    if(busy||closed)return;busy=true;controls();
    try{await action();}catch(e){failure(e);}finally{busy=false;controls();}
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
  async function readFile(ws,path){
    const data=validateRead(await client.request('files.read',{workspaceId:ws,path}),ws,path);
    if(await textSHA256(data.content)!==data.sha256)throw {code:'E_FILES_PROTOCOL',message:'文件内容与版本不一致，未替换草稿'};
    return data;
  }
  async function openFile(path){
    const ws=workspaceId,key=ws+'\0'+path;
    let record=records.get(key);
    if(!record){const data=await readFile(ws,path);record={...data,baseContent:data.content};records.set(key,record);}
    if(workspaceId===ws){showRecord(record);status(demo?'这是可编辑的内存演示文件。':'已从授权目录读取文件；尚未发送到 AI。');}
  }
  async function listDirectory(path=''){
    const ws=workspaceId,data=await client.request('files.list',{workspaceId:ws,path});
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
    await loadTargets();
    const state=await client.state();connected=!!state.connected;
    const label=byId('connection-label');label.textContent=demo?'交互演示':connected?'Native 已连接':state.nativeConnected&&!state.supported?'需更新 OpenDesk':'本机未连接';label.classList.toggle('ready',connected&&!demo);
    if(!connected){status(state.nativeConnected&&!state.supported?'已连接的 OpenDesk 尚不支持文件工作区。请更新原生程序。':'请先打开「本机连接设置」连接 OpenDesk，然后刷新。');return;}
    const data=await client.request('workspaces.list',{});
    if(!Array.isArray(data?.workspaces)||data.workspaces.length>32)throw {code:'E_FILES_PROTOCOL',message:'工作区列表无效'};
    const picker=byId('workspace-picker'),old=workspaceId;picker.replaceChildren();
    workspaceAccess.clear();
    for(const ws of data.workspaces){if(typeof ws.workspaceId==='string'&&typeof ws.name==='string'){
      workspaceAccess.set(ws.workspaceId,ws.access);picker.append(new Option(ws.name+(ws.access==='read-only'?'（只读）':''),ws.workspaceId));}}
    if(!picker.options.length){workspaceId='';connected=false;picker.append(new Option('尚无已授权目录',''));status('请先在本机 OpenDesk 授权一个工作目录，然后刷新连接。');return;}
    workspaceId=[...picker.options].some(o=>o.value===old)?old:picker.options[0].value;picker.value=workspaceId;
    if(current&&current.workspaceId!==workspaceId)current=null;
    await listDirectory(workspaceId===old?directory:'');
    if(!current){const file=data.workspaces.length&&byId('file-list').querySelector('button[data-path$="README.md"]')||byId('file-list').querySelector('button[data-path$=".md"]');
      if(file)await openFile(file.dataset.path);}
    status(demo?'可切换文件、编辑、保存并查看预览；演示不会访问本机磁盘。':'已连接。目录授权可复用，正常读取和保存无需重复授权。');
  }
  async function reread(){
    const record=current;if(!record)return;
    const disk=await readFile(record.workspaceId,record.path);
    if(dirty(record)&&disk.sha256===record.sha256){record.unknown=false;record.remote=null;status('磁盘仍为读取时的版本，当前草稿已保留。');return;}
    if(dirty(record)&&disk.content!==record.content){record.remote=disk;record.unknown=false;
      status('磁盘版本已读取。当前草稿保留，请比较版本，或另存为新文件。',true);
    }else{Object.assign(record,disk,{baseContent:disk.content,remote:null,unknown:false});
      if(current===record)showRecord(record);status('已重新读取并核对文件内容。');}
  }
  async function save(){
    const record=current;if(!record||record.remote||record.unknown||!dirty(record))return;
    const content=record.content;
    try{
      const result=await client.request('files.write',{workspaceId:record.workspaceId,path:record.path,content,expectedSha256:record.sha256});
      if(result?.saved!==true||result.workspaceId!==record.workspaceId||result.path!==record.path||result.sha256!==await textSHA256(content))
        throw {code:'E_FILES_PROTOCOL',message:'保存回执无法核对，请重读磁盘。',outcome:'OUTCOME_UNKNOWN'};
      // A write ACK is not sufficient to claim the current disk contents.
      record.unknown=true;
      const disk=await readFile(record.workspaceId,record.path);
      if(disk.content!==content||disk.sha256!==result.sha256){record.remote=disk;record.unknown=false;
        status('保存已收到回执，但磁盘内容随后发生变化。草稿已保留。',true);return;}
      Object.assign(record,disk,{baseContent:content,unknown:false,remote:null});
      if(current===record)showRecord(record);
      status(demo?'演示文件已保存到内存，并已读回核对。':'已保存到本地文件，并已读回核对。');
    }catch(e){
      if(e.code==='E_FILES_CONFLICT'){try{record.remote=await readFile(record.workspaceId,record.path);}catch{}
        status('文件已被其他编辑器修改。没有覆盖磁盘，当前草稿已保留。',true);
      }else{if(e.outcome==='OUTCOME_UNKNOWN'||record.unknown)record.unknown=true;throw e;}
    }
  }
  async function saveAs(){
    const record=current,path=byId('save-as-path').value.trim();if(!record||!path)throw new Error('请填写新文件的相对路径');
    const ws=record.workspaceId,content=record.content;
    let acknowledged=false,data;
    try{
      creationPending={workspaceId:ws,path,content};
      const ack=await client.request('files.create',{workspaceId:ws,path,content});
      if(ack?.saved!==true||ack.created!==true||ack.path!==path||ack.workspaceId!==ws||ack.sha256!==await textSHA256(content))
        throw {code:'E_FILES_PROTOCOL',message:'未能核对新文件回执。请刷新目录并重读；不会自动重试。',outcome:'OUTCOME_UNKNOWN'};
      acknowledged=true;
      data=await readFile(ws,path);if(data.content!==content)throw new Error('新文件已创建，但其内容随后发生变化，请重新读取');
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
    const data=await readFile(pending.workspaceId,pending.path);
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
  byId('demo-banner').hidden=!demo;
  if(demo){byId('open-settings').hidden=true;byId('target-picker').disabled=true;}
  byId('refresh-connection').addEventListener('click',()=>operation(refresh));
  byId('refresh-files').addEventListener('click',()=>operation(()=>listDirectory(directory)));
  byId('parent-directory').addEventListener('click',()=>operation(()=>listDirectory(directory.includes('/')?directory.slice(0,directory.lastIndexOf('/')):'')));
  byId('workspace-picker').addEventListener('change',()=>operation(async()=>{workspaceId=byId('workspace-picker').value;current=null;byId('file-title').textContent='打开一个文件';byId('file-editor').value='';byId('file-preview').removeAttribute('srcdoc');await listDirectory('');}));
  byId('target-picker').addEventListener('change',controls);
  byId('file-editor').addEventListener('input',()=>{if(!current||busy)return;current.content=byId('file-editor').value;controls();clearTimeout(previewTimer);previewTimer=setTimeout(renderPreview,200);});
  byId('save-file').addEventListener('click',()=>operation(save));
  byId('reload-file').addEventListener('click',()=>operation(reread));
  byId('save-as').addEventListener('click',()=>operation(saveAs));
  byId('check-created').addEventListener('click',()=>operation(checkCreated));
  byId('use-disk').addEventListener('click',()=>{if(!current?.remote||busy)return;const disk=current.remote;Object.assign(current,disk,{baseContent:disk.content,remote:null,unknown:false});showRecord(current);status('已明确采用磁盘版本。');});
  byId('copy-content').addEventListener('click',()=>{if(!current)return;const content=current.content;globalThis.navigator.clipboard.writeText(content).then(()=>status('内容已复制。你可以自行粘贴到 AI 对话。')).catch(failure);});
  for(const button of root.querySelectorAll('button[data-view]'))button.addEventListener('click',()=>chooseView(button.dataset.view));
  byId('show-page-preview').addEventListener('click',()=>operation(()=>pagePreview(false)));
  byId('remove-page-preview').addEventListener('click',()=>operation(()=>pagePreview(true)));
  byId('open-settings').addEventListener('click',()=>{if(native)api.runtime.openOptionsPage().catch(failure);});
  for(const [id,path] of [['open-sidebar','native-agent/workspace.html'],['open-workbench','ui/tool.html']])byId(id).addEventListener('click',event=>{
    if(!event.isTrusted||demo)return;
    const tabId=Number(byId('target-picker').value);if(!targets.has(tabId))return;
    api.sidePanel.setOptions({tabId,path,enabled:true}).then(()=>api.sidePanel.open({tabId})).then(()=>status(id==='open-sidebar'?'已在选中页面打开文件侧栏。':'已恢复该页面的工作台侧栏。')).catch(failure);
  });
  byId('connect-preview').addEventListener('click',()=>{try{const url=validatePreviewURL(byId('preview-url').value);byId('app-preview').src=url;status('预览地址：'+url+'。如果为空白，请确认服务已启动，或独立打开。');}catch(e){failure(e);}});
  byId('open-preview-tab').addEventListener('click',()=>{try{const url=validatePreviewURL(byId('preview-url').value);native?api.tabs.create({url}):globalThis.open(url,'_blank','noopener,noreferrer');}catch(e){failure(e);}});
  const unload=()=>{closed=true;clearTimeout(previewTimer);};globalThis.addEventListener('pagehide',unload,{once:true});
  controls();void operation(refresh);
  return {dispose:unload};
}
