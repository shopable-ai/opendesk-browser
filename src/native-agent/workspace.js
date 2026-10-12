import {AGENT_CONFIG_PROTOCOL} from './protocol.js';
import {previewDocument,validatePreviewURL,displayPagePreview} from './file-preview.js';
import {createMemoryWorkspace,textSHA256} from './file-workspace-demo.js';
import {initWorkspaceChatEdit} from './workspace-chat-edit-ui.js';
import {sourceLabel,sourceName} from './source-label.js';
import {recoverControlFocus} from './control-focus.js';
import {validateRequestPath} from './workspace-chat-request.js';
import {validateWorkspaceTreeListing,parentDirectoriesForFile,MAX_WORKSPACE_TREE_EXPANSIONS,MAX_WORKSPACE_TREE_REFRESH} from './workspace-file-tree.js';
import {createWorkspaceFileIcon,createWorkspaceTreeChevron} from './workspace-file-icons.js';
import {readToolSnapshot} from './tool-snapshot.js';
import {openPreviewSession} from '../ui/sidebar-tools/preview-session.js';
import {initKnowledgeWorkspaceHandoff} from '../knowledge/workspace-handoff.js';

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
  let current=null,workspaceId=requested,busy=false,connected=false,view='preview',previewTimer,closed=false,creationPending=null,chatEdit;
  let history=[],refreshGeneration=0,pendingRefresh=false,fileState={};
  let treeFolders=new Map(),treeIdentity='',treeRevision=0;
  let knowledgeHandoff=null,resolveActionReview=null;
  // Non-modal, in-page choice. Operations waiting for a decision keep their
  // native authority/identity and revalidate before committing any side effect.
  function requestActionReview(message,button='继续'){
    if(resolveActionReview)return Promise.resolve(false);
    const panel=byId('workspace-action-review');
    byId('workspace-action-summary').textContent=message;
    byId('workspace-action-continue').textContent=button;
    panel.hidden=false;panel.scrollIntoView?.({block:'nearest'});
    return new Promise(resolve=>{resolveActionReview=resolve;});
  }
  function finishActionReview(accepted){
    const done=resolveActionReview;
    resolveActionReview=null;
    byId('workspace-action-review').hidden=true;
    done?.(accepted);
  }
  byId('workspace-action-continue').addEventListener('click',()=>finishActionReview(true));
  byId('workspace-action-cancel').addEventListener('click',()=>finishActionReview(false));
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
  const toolPreviewStatus=(message,error=false)=>{
    const node=byId('preview-sidebar-tool-status');
    if(node){node.textContent=message;node.classList.toggle('error',error);}
  };
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
      !sameAuthority(authority,authorityFor())||closed){
      if(!closed&&sameAuthority(authority,authorityFor(authority.workspaceId))){
        workspaceAccess.delete(authority.workspaceId);workspaceRows.delete(authority.workspaceId);
      }
      throw {code:'E_FILES_SESSION',message:'原目录授权或 CLI 租约已失效，草稿与结果保留。',outcome:'NOT_DISPATCHED'};
    }
  }
  async function assertSaveAuthority(record){
    if(!record||record.workspaceId!==workspaceId||!writable()||!connected)
      throw {code:'E_FILES_ACCESS',message:'当前目录未处于有效读写连接。',outcome:'NOT_DISPATCHED'};
    await assertAuthority(record.authority);
    await chatEdit?.beforeSave(record);
  }
  function controls(){
    knowledgeHandoff?.controls();
    byId('file-workspace').setAttribute('aria-busy',String(busy));
    const currentAuthority=current&&sameAuthority(current.authority,authorityFor(current.workspaceId));
    for(const id of ['refresh-connection','save-as-path'])byId(id).disabled=busy;
    byId('target-picker').disabled=busy||demo;
    const previewTool=byId('preview-sidebar-tool');
    if(previewTool)previewTool.disabled=busy||demo||!connected||!workspaceAccess.has(workspaceId)||
      !api?.storage?.session?.set||!api?.tabs?.create;
    byId('workspace-picker').disabled=busy||!connected;
    byId('workspace-access-note').hidden=!connected||workspaceAccess.get(workspaceId)!=='read-only';
    const reason=workspaceRows.get(workspaceId)?.accessReason;
    byId('workspace-access-reason').textContent=reason==='persistent-read-only'?'本目录已有明确的长期只读授权，CLI 默认读写不会升级它。':
      reason==='active-session'?'复用已在线会话的只读权限；重复启动不会修改原会话。':'当前 CLI 会话以只读模式接入，保存由 Native 拒绝。';
    byId('refresh-files').disabled=busy||!connected||!workspaceAccess.has(workspaceId);
    for(const node of byId('file-list').querySelectorAll('button'))node.disabled=busy||!connected;
    byId('parent-directory').disabled=busy||!connected||![...treeFolders.entries()].some(([path,node])=>path&&node.expanded);
    // Read-only Native grants limit disk writes, not the user's unsaved
    // in-memory draft. Do not mistake a read-only workspace for a read-only
    // text editor; Save/Save As remain authority-gated below.
    byId('file-editor').disabled=busy||!current;
    byId('save-file').disabled=busy||!connected||!writable()||!currentAuthority||current?.workspaceId!==workspaceId||!dirty(current)||!!current?.unknown||!!current?.remote||!!current?.importedDraft;
    byId('reload-file').disabled=busy||!connected||!current||current.workspaceId!==workspaceId||!!current?.importedDraft;
    byId('discard-file-draft').disabled=busy||!connected||!workspaceAccess.has(workspaceId)||current?.workspaceId!==workspaceId||!dirty(current)||!!current?.importedDraft;
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
    }else{
      byId('file-meta').textContent='选择左侧文件，以查看预览或源码。';
    }
    byId('open-sidebar').disabled=byId('open-sidebar').disabled||!connected||!workspaceAccess.has(workspaceId);
    byId('file-title').title=current?.path||'打开一个文件';
    byId('file-meta').title=byId('file-meta').textContent;
    chatEdit?.controls({busy,connected:connected&&workspaceAccess.has(workspaceId)});
  }
  async function operation(action){
    if(busy||closed)return;
    const restoreFocus=recoverControlFocus(doc,byId('file-editor'));
    busy=true;controls();restoreFocus.disabled();
    try{await action();}catch(e){failure(e);}finally{
      busy=false;controls();
      restoreFocus.restore(!closed);
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
    toolPreviewStatus('本地工具来源离线；不能读取新的构建快照。',true);
    connected=false;workspaceAccess.clear();workspaceRows.clear();fileState={};chatEdit?.invalidate('本机连接或授权已失效，旧请求和提案已停用，草稿保留。');resetFileTree();
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
    current=record;byId('file-title').textContent=record.path.split('/').at(-1);byId('file-editor').value=record.content;
    for(const node of byId('file-list').querySelectorAll('button')){
      const selected=node.dataset.kind==='file'&&node.dataset.path===record.path;
      node.classList.toggle('selected',selected);node.setAttribute('aria-selected',String(selected));
    }
    const parent=record.path.includes('/')?record.path.slice(0,record.path.lastIndexOf('/')):'';
    byId('directory-name').textContent=parent?'/'+parent:'根目录';
    byId('directory-name').title=parent?'当前路径：/'+parent:'当前路径：根目录';
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
    if(!await leaveImportedDraft())return;
    const ws=workspaceId,key=ws+'\0'+path,authority=authorityFor(ws);
    let record=records.get(key);
    if(!record){const data=await readFile(ws,path,authority);record={...data,baseContent:data.content};records.set(key,record);}
    if(workspaceId===ws){showRecord(record);status(demo?'这是可编辑的内存演示文件。':'已从授权目录读取文件；尚未发送到 AI。');}
  }
  async function leaveImportedDraft(){
    if(!current?.importedDraft)return true;
    if(creationPending){
      status('新文件创建结果尚待核对。请先核对结果再切换，避免丢失草稿或误判磁盘写入。');
      return false;
    }
    const record=current,pending=creationPending;
    const message=pending
      ?'新文件创建结果仍需核对，离开不会撤销已发生的磁盘写入。继续将放弃当前窗口的知识草稿和待核对状态。'
      :'知识草稿尚未创建为文件。继续将放弃本窗口的未保存内容，建议先创建文件。';
    const allowed=await requestActionReview(message,'放弃草稿并继续');
    if(!allowed||closed||current!==record||creationPending!==pending)return false;
    if(pending)creationPending=null;
    return true;
  }
  // Tree state is bound to the current Native workspace + session + grant.
  // Visible nodes are only from validated files.list responses; expanding a
  // folder does NOT navigate away or request its siblings again.
  function resetFileTree(){
    treeFolders=new Map();treeIdentity='';treeRevision++;
    byId('file-list').replaceChildren();byId('directory-name').textContent='根目录';
    byId('directory-name').title='当前路径：根目录';
    byId('tree-message').textContent='';
  }
  const folderState=()=>({expanded:false,entries:null,truncated:false});
  function ensureFileTree(){
    const authority=authorityFor(),identity=authority?JSON.stringify(authority):'';
    if(!identity){resetFileTree();return null;}
    if(identity!==treeIdentity){
      resetFileTree();treeIdentity=identity;
      treeFolders.set('',{...folderState(),expanded:true});
    }
    return authority;
  }
  function renderFileTree(){
    const list=byId('file-list'),rootFolder=treeFolders.get('');
    if(!rootFolder){list.replaceChildren();byId('tree-message').textContent='';return;}
    const rows=[{path:'',name:'根目录',kind:'directory',depth:0,pos:1,size:1}],warnings=[];
    function visit(path,depth){
      const folder=treeFolders.get(path);
      if(!folder?.expanded||!folder.entries)return;
      if(folder.truncated)warnings.push('/'+path);
      for(const [index,entry] of folder.entries.entries()){
        rows.push({...entry,depth,pos:index+1,size:folder.entries.length});
        if(entry.kind==='directory'){
          if(!treeFolders.has(entry.path))treeFolders.set(entry.path,folderState());
          visit(entry.path,depth+1);
        }
      }
    }
    visit('',1);
    const previousFocus=doc.activeElement?.dataset?.path;
    const selected=rows.some(row=>row.kind==='file'&&row.path===current?.path&&current.workspaceId===workspaceId)
      ?current.path:'';
    const tabStop=rows.some(row=>row.path===previousFocus)?previousFocus:selected;
    const nodes=rows.map(row=>{
      const button=doc.createElement('button');button.type='button';button.className='file-entry';
      button.dataset.path=row.path;button.dataset.kind=row.kind;
      button.setAttribute('role','treeitem');button.setAttribute('aria-level',String(row.depth+1));
      button.setAttribute('aria-posinset',String(row.pos));button.setAttribute('aria-setsize',String(row.size));
      button.tabIndex=row.path===tabStop?0:-1;
      const isSelected=row.kind==='file'&&row.path===current?.path&&current.workspaceId===workspaceId;
      button.setAttribute('aria-selected',String(isSelected));button.classList.toggle('selected',isSelected);
      const folder=row.kind==='directory'?treeFolders.get(row.path):null;
      if(folder)button.setAttribute('aria-expanded',String(folder.expanded));
      button.title=row.path?'/'+row.path:'已授权目录';
      button.style?.setProperty('--tree-indent',String(Math.min(row.depth,16)*16+8)+'px');
      const caret=folder?createWorkspaceTreeChevron(doc,folder.expanded):doc.createElement('span');
      if(!folder){caret.className='tree-caret tree-caret-empty';caret.setAttribute('aria-hidden','true');}
      const icon=createWorkspaceFileIcon(doc,row.kind,row.name,!!folder?.expanded);
      const name=doc.createElement('span');name.className='file-name';name.textContent=row.name;
      button.append(caret,icon,name);
      if(folder?.truncated){
        const flag=doc.createElement('span');flag.className='tree-truncated';flag.textContent='部分';
        flag.title='Native 目录列表被截断，并非全部文件';button.append(flag);
      }
      button.addEventListener('click',()=>runTreeAction(row.path,()=>folder?toggleFileDirectory(row.path):openFile(row.path)));
      return button;
    });
    list.replaceChildren(...nodes);
    for(const button of nodes)button.disabled=busy||!connected;
    const expanded=[...treeFolders.entries()].filter(([path,node])=>path&&node.expanded).length;
    byId('tree-message').textContent=rootFolder.entries===null?'正在读取文件树…':
      (rows.length===1?'当前目录暂无可显示的文件。':(rows.length-1)+' 项可见 · '+expanded+' 个子目录展开')+
      (warnings.length?' · '+warnings.length+' 个目录仅显示部分条目':'');
  }
  async function loadFileFolder(path,authority,{force=false}={}){
    const folder=treeFolders.get(path);
    if(!folder||!authority||treeIdentity!==JSON.stringify(authority))
      throw {code:'E_FILES_SESSION',message:'目录树来源已发生变化；请重新刷新。'};
    if(folder.entries!==null&&!force)return;
    const revision=treeRevision,ws=authority.workspaceId;
    const data=await client.request('files.list',fileParams({workspaceId:ws,path},authority),expected(authority));
    if(closed||treeRevision!==revision||workspaceId!==ws||!connected||
      !sameAuthority(authority,authorityFor(ws)))
      throw {code:'E_FILES_SESSION',message:'目录读取期间连接或授权已变更，旧结果未应用。'};
    const checked=validateWorkspaceTreeListing(data,ws,path);
    folder.entries=checked.entries;folder.truncated=checked.truncated;
  }
  async function toggleFileDirectory(path){
    const authority=ensureFileTree(),folder=treeFolders.get(path);
    if(!authority||!folder)return;
    if(folder.expanded){folder.expanded=false;renderFileTree();return;}
    const opened=[...treeFolders.values()].filter(node=>node.expanded).length;
    if(opened>=MAX_WORKSPACE_TREE_EXPANSIONS){
      status('同时展开的目录较多。请先折叠不用的目录，再打开此目录。',true);return;
    }
    folder.expanded=true;renderFileTree();
    try{await loadFileFolder(path,authority);}
    catch(error){folder.expanded=false;renderFileTree();throw error;}
    renderFileTree();
  }
  async function refreshFileTree({expanded=false}={}){
    const authority=ensureFileTree();if(!authority)return;
    let paths=expanded?[...treeFolders.entries()].filter(([,node])=>node.expanded).map(([path])=>path):[''];
    paths=['',...paths.filter(path=>path!=='')];
    for(const path of paths.slice(0,MAX_WORKSPACE_TREE_REFRESH)){
      if(!treeFolders.has(path))continue;
      try{await loadFileFolder(path,authority,{force:true});}
      catch(error){if(path==='')throw error;status('子目录 /'+path+' 读取失败，已保留先前的文件树。',true);}
    }
    renderFileTree();
    if(paths.length>MAX_WORKSPACE_TREE_REFRESH)
      status('已刷新前 '+MAX_WORKSPACE_TREE_REFRESH+' 个展开目录；其他目录可折叠后重新展开读取。');
  }
  async function revealFileInTree(path){
    const authority=ensureFileTree();if(!authority)return;
    for(const parent of parentDirectoriesForFile(path)){
      if(!treeFolders.has(parent))treeFolders.set(parent,folderState());
      treeFolders.get(parent).expanded=true;
      await loadFileFolder(parent,authority,{force:true});
    }
    renderFileTree();
    for(const node of byId('file-list').querySelectorAll('button')){
      const selected=node.dataset.kind==='file'&&node.dataset.path===path;
      node.classList.toggle('selected',selected);node.setAttribute('aria-selected',String(selected));
    }
  }
  function collapseFileTree(){
    for(const [path,folder] of treeFolders)folder.expanded=path==='';
    renderFileTree();controls();
  }
  async function runTreeAction(path,action){
    const focused=doc.activeElement?.dataset?.path===path;
    await operation(action);
    if(!focused||closed||busy||!connected||doc.hidden||!doc.hasFocus?.()||
      ![doc.body,byId('file-editor')].includes(doc.activeElement))return;
    const buttons=[...byId('file-list').querySelectorAll('button')];
    const target=buttons.find(button=>button.dataset.path===path&&!button.disabled);
    if(target){for(const button of buttons)button.tabIndex=button===target?0:-1;target.focus({preventScroll:true});}
  }
  function fileTreeKeydown(event){
    const target=event.target;
    if(!['file','directory'].includes(target?.dataset?.kind))return;
    const buttons=[...byId('file-list').querySelectorAll('button')].filter(node=>node.dataset.kind);
    const index=buttons.indexOf(target);if(index<0)return;
    let next=null;
    if(event.key==='ArrowDown')next=buttons[Math.min(index+1,buttons.length-1)];
    else if(event.key==='ArrowUp')next=buttons[Math.max(0,index-1)];
    else if(event.key==='Home')next=buttons[0];
    else if(event.key==='End')next=buttons.at(-1);
    else if(event.key==='ArrowRight'&&target.dataset.kind==='directory'){
      if(target.getAttribute('aria-expanded')==='false'){
        event.preventDefault();void runTreeAction(target.dataset.path,()=>toggleFileDirectory(target.dataset.path));return;
      }
      if(buttons[index+1]?.dataset.path.startsWith(target.dataset.path?target.dataset.path+'/':''))
        next=buttons[index+1];
    }else if(event.key==='ArrowLeft'){
      if(target.dataset.kind==='directory'&&target.getAttribute('aria-expanded')==='true'&&target.dataset.path){
        event.preventDefault();void runTreeAction(target.dataset.path,()=>toggleFileDirectory(target.dataset.path));return;
      }
      const parent=target.dataset.path.includes('/')?
        target.dataset.path.slice(0,target.dataset.path.lastIndexOf('/')):'';
      next=buttons.find(node=>node.dataset.path===parent)||buttons[0];
    }
    if(next){event.preventDefault();for(const button of buttons)button.tabIndex=button===next?0:-1;next.focus({preventScroll:true});}
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
      resetFileTree();
      status('指定来源目前不可用。等待其上线，或明确选择其他已接入目录。');return;
    }
    if(!rows.length){
      resetFileTree();
      status(workspaceId?'原目录已离线，名称和草稿保留；不会自动切换到其他目录。':'Native 已连接，但尚无已接入目录。');return;
    }
    if(!rows.some(row=>row.workspaceId===workspaceId)){
      resetFileTree();
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
    await refreshFileTree({expanded:workspaceId===old});
    if(ticket!==refreshGeneration||closed)return;
    if(current&&current.workspaceId!==workspaceId&&!dirty(current))current=null;
    if(!current){
      const file=byId('file-list').querySelector('button[data-path$="README.md"]')||byId('file-list').querySelector('button[data-path$=".md"]');
      if(file)await openFile(file.dataset.path);
    }
    status(demo?'内存演示文件。':'本机已连接；文件工作区可用。保存或运行都需要明确操作。');
  }
  async function previewSidebarTool(){
    if(demo||!connected||!workspaceAccess.has(workspaceId))
      throw {code:'E_FILES_SESSION',message:'请先选择已授权、在线的真实本地目录。'};
    const authority=authorityFor(),ws=workspaceId;
    if(!authority?.sourceId)throw {code:'E_FILES_SESSION',message:'目录来源未经过 Native 核验。'};
    toolPreviewStatus('正在从已授权目录读取、验证完整构建快照…');
    try{
      await assertAuthority(authority);
      const info=await readFile(ws,'tool.config.json',authority);
      let config;try{config=JSON.parse(info.content);}
      catch{throw {code:'E_TOOL_SCHEMA',message:'tool.config.json 不是合法 JSON'};}
      const toolId=config?.id;
      const snapshot=await readToolSnapshot({toolId,readText:async path=>{
        if(closed||workspaceId!==ws||!sameAuthority(authority,authorityFor()))
          throw {code:'E_FILES_SESSION',message:'读取期间目录身份或授权已经变化'};
        return (await readFile(ws,path,authority)).content;
      }});
      await assertAuthority(authority);
      if(closed||workspaceId!==ws||!sameAuthority(authority,authorityFor()))
        throw {code:'E_FILES_SESSION',message:'读取完成前来源已切换'};
      await openPreviewSession({api,workspaceId:ws,sourceId:authority.sourceId,snapshot});
      toolPreviewStatus('只读预览已打开：'+snapshot.tool.title+' · 构建 '+String(snapshot.buildId||snapshot.sha256.slice(0,12))+
        '。此快照未安装，写入及自动化操作均被禁止。');
    }catch(error){
      toolPreviewStatus((error.code||'E_TOOL_PREVIEW')+' · '+String(error.message||error),true);
      throw error;
    }
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
    const record=current;if(!record||record.remote||record.unknown||record.importedDraft||!dirty(record))return;
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
    try{await revealFileInTree(data.path);status(message);}
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
      if(!await leaveImportedDraft())throw {code:'E_EDIT_BASE',message:'已保留尚未创建的知识草稿；本次未读取其他文件。',outcome:'NOT_DISPATCHED'};
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
  byId('preview-sidebar-tool')?.addEventListener('click',event=>{
    if(!event.isTrusted||demo)return;
    void operation(previewSidebarTool);
  });
  byId('refresh-files').addEventListener('click',()=>operation(()=>refreshFileTree({expanded:true})));
  byId('parent-directory').addEventListener('click',()=>{if(!busy)collapseFileTree();});
  byId('file-list').addEventListener('keydown',fileTreeKeydown);
  byId('workspace-picker').addEventListener('change',()=>operation(async()=>{
    const selected=byId('workspace-picker').value;if(pendingSource&&!workspaceAccess.has(selected))return;
    if(!await leaveImportedDraft()){byId('workspace-picker').value=workspaceId;return;}
    chatEdit.invalidate('已切换工作区，旧请求和提案已失效，原草稿保留。');
    pendingSource='';workspaceId=selected;current=null;resetFileTree();
    toolPreviewStatus('已切换工作区；请再次明确点击以读取该目录的工具构建。');
    byId('file-title').textContent='打开一个文件';byId('file-editor').value='';
    byId('file-preview').removeAttribute('srcdoc');
    if(!demo)api.storage?.local?.set({[HISTORY_KEY]:{workspaces:history,selection:workspaceId}}).catch(()=>{});
    if(connected&&workspaceAccess.has(workspaceId))await refreshFileTree();
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
  knowledgeHandoff=initKnowledgeWorkspaceHandoff({api:demo?null:api,doc,
    canImport:()=>!busy&&!creationPending&&connected&&workspaceAccess.get(workspaceId)==='read-write',report:failure,
    onImport:async draft=>{
      let imported=false;
      await operation(async()=>{
        if(!await leaveImportedDraft())return;
        if(dirty(current)&&!current?.importedDraft){
          const previous=current;
          const accepted=await requestActionReview('当前文件有未保存修改。切换到知识草稿后，原文件草稿保留在本窗口。','切换到知识草稿');
          if(!accepted||current!==previous)return;
        }
        const authority=authorityFor();await assertAuthority(authority);
        showRecord({workspaceId,path:draft.filename,content:draft.markdown,baseContent:'',sha256:null,
          authority,importedDraft:true});
        byId('save-as-path').value=draft.filename;chooseView('split');controls();
        status('知识草稿尚未写入磁盘；关闭页面不再弹窗提醒。请先创建新文件或复制内容。');
        imported=true;
      });
      return imported;
    }});
  // Closing a browser tab does not show a JS-created beforeunload modal.
  // Explicit in-app switches still require the nonmodal draft choice above.
  const unload=()=>{closed=true;finishActionReview(false);knowledgeHandoff?.dispose?.();chatEdit?.invalidate('工作区页面已关闭。');clearTimeout(previewTimer);
    if(native){api.runtime.onMessage?.removeListener?.(onNativeChange);
      api.webNavigation.onHistoryStateUpdated?.removeListener?.(onNavigation);
      api.webNavigation.onCommitted?.removeListener?.(onNavigation);
      api.tabs.onRemoved?.removeListener?.(onTabRemoved);}
  };
  globalThis.addEventListener('pagehide',unload,{once:true});
  controls();void operation(refresh);
  return {dispose:unload};
}
