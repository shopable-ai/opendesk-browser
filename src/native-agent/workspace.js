import {AGENT_CONFIG_PROTOCOL} from './protocol.js';
import {SIDEPANEL_DOCUMENT_PATH} from '../tool-document-url.js';
import {previewDocument,validatePreviewURL,displayPagePreview} from './file-preview.js';
import {createMemoryWorkspace,textSHA256} from './file-workspace-demo.js';
import {createWorkspaceChatEdit} from './workspace-chat-edit-ui.js';
import {sourceLabel,sourceName} from './source-label.js';
import {validateRequestPath} from './workspace-chat-request.js';
import {validateWorkspaceTreeListing,parentDirectoriesForFile,MAX_WORKSPACE_TREE_EXPANSIONS,MAX_WORKSPACE_TREE_REFRESH} from './workspace-file-tree.js';
import {createToolLivePreview} from './tool-live-preview.js';
import {consumeToolPreviewIntent} from '../ui/sidebar-tools/workspace-preview-intent.js';
import {createKnowledgeWorkspaceHandoff} from '../knowledge/workspace-handoff.js';
import {localizeLiteral,subscribeLocale,translate,formatFileSize,getLocale} from '../i18n/index.js';
import {isDirtyWorkspaceDraft as dirty,sameWorkspaceAuthority as sameAuthority,
  workspaceRecordKey,validateWorkspaceRead,createWorkspaceDraft,reconcileWorkspaceRead,
  verifyWorkspaceWriteReceipt,verifyWorkspaceWriteReadBack} from './workspace-domain.js';
import {createWorkspaceStore,projectWorkspaceState} from './workspace-store.js';

// This controller owns Native authority and drafts. React owns every UI node,
// focus transition and iframe. HTML sanitization is supplied by the UI owner.
export function createWorkspaceController({api=globalThis.chrome,client,
  renderPreviewDocument=(path,content)=>{
    if(/\.html?$/i.test(path))throw new Error('HTML 预览需要接入 renderPreviewDocument 安全渲染回调');
    return previewDocument(path,content,null);
  },copyText=text=>globalThis.navigator?.clipboard?.writeText(text),
  openExternal=(url)=>globalThis.open?.(url,'_blank','noopener,noreferrer'),
  locationURL=globalThis.location?.href||'https://invalid.local/',
  lockManager=globalThis.navigator?.locks,createChatEdit=createWorkspaceChatEdit,
  createKnowledgeHandoff=createKnowledgeWorkspaceHandoff}={}){
  const native=!!api?.runtime?.id;
  async function bridge(message){
    const response=await api.runtime.sendMessage({protocol:AGENT_CONFIG_PROTOCOL,...message});
    if(!response?.ok)throw response?.error||{code:'E_FILES_DISCONNECTED',message:'本机文件工作区未响应'};
    return response.data;
  }
  client||=native?{demo:false,state:()=>bridge({type:'files.state'}),request:(method,params,expected={})=>bridge({type:'files.request',method,params,...(expected.sessionId?{expectedSessionId:expected.sessionId}:{})})}:createMemoryWorkspace();
  const demo=!!client.demo,records=new Map(),targets=new Map(),workspaceAccess=new Map(),workspaceRows=new Map();
  const draftRevisions=new WeakMap();
  const draftRevision=record=>record?draftRevisions.get(record)||0:0;
  function editDraft(record,content){
    record.content=String(content);draftRevisions.set(record,draftRevision(record)+1);
  }
  const HISTORY_KEY='opendesk.workspace.display-cache.v1';
  const workspacePattern=/^workspace-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
  const query=new URL(locationURL).searchParams;
  const requested=workspacePattern.test(query.get('workspaceId')||'')?query.get('workspaceId'):'';
  let pendingSource=/^source-[a-f0-9]{24}$/.test(query.get('sourceId')||'')?query.get('sourceId'):'';
  const previewSource=pendingSource;
  const requestedPreviewIntent=query.get('previewIntent')||'';
  let requestedToolPreview='',pendingToolPreview=!!previewSource&&!!requestedPreviewIntent;
  let current=null,workspaceId=requested,busy=false,connected=false,view='preview',previewTimer,closed=false,creationPending=null,chatEdit;
  let history=[],refreshGeneration=0,pendingRefresh=false,fileState={};
  let treeFolders=new Map(),treeIdentity='',treeRevision=0;
  let resolveActionReview=null,actionReview=null,targetId='',saveAsPath='',previewURL='http://127.0.0.1:3000/';
  let previewHTML='',previewKind='',connectedPreviewURL='',toolStatus={text:'',error:false};
  let connectionLabel='',treeMessage='',knowledgeHandoff=null,stopKnowledge=null;
  let pickerRows=[],liveToolPreview=null;
  const store=createWorkspaceStore();
  // Non-modal, in-page choice. Operations waiting for a decision keep their
  // native authority/identity and revalidate before committing any side effect.
  function requestActionReview(message,button='继续'){
    if(resolveActionReview)return Promise.resolve(false);
    actionReview=Object.freeze({message,button});
    const decision=new Promise(resolve=>{resolveActionReview=resolve;});
    publishSnapshot();
    return decision;
  }
  function finishActionReview(accepted){
    const done=resolveActionReview;
    resolveActionReview=null;
    actionReview=null;publishSnapshot();
    done?.(accepted);
  }
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
  let lastStatus='',lastStatusError=false;
  function publishSnapshot(){
    const recordOnline=connected&&workspaceAccess.has(current?.workspaceId);
    const owner=history.find(row=>row.workspaceId===current?.workspaceId);
    const sameName=owner&&history.filter(row=>sourceName(row.name)===sourceName(owner.name)).length>1;
    const ownedBy=demo?'内存演示目录':owner?sourceLabel(owner,{duplicate:sameName}):'目录身份待连接核验';
    const fileMeta=current?ownedBy+' / '+current.path+' · '+formatFileSize(new TextEncoder().encode(current.content).length)+' · '+
      (current.sha256?.slice(0,10)||'')+(recordOnline?' · 已核验目录':' · 离线草稿')+(!writable()?' · 只读':''):translate('runtime.selectFile');
    const currentAuthority=current&&sameAuthority(current.authority,authorityFor(current.workspaceId));
    const draftLabel=current?.importedDraft?'待创建的知识草稿':current?.unknown?'保存结果未知，请重读':current?.remote?'磁盘版本已变化':
      current&&!recordOnline?'离线草稿':current&&!currentAuthority?'目录连接已变化 · 请重新读取':dirty(current)?'未保存草稿':current?'已与磁盘同步':'';
    const reason=workspaceRows.get(workspaceId)?.accessReason;
    const accessReason=reason==='persistent-read-only'?'本目录已有明确的长期只读授权，CLI 默认读写不会升级它。':
      reason==='active-session'?'复用已在线会话的只读权限；重复启动不会修改原会话。':'当前 CLI 会话以只读模式接入，保存由 Native 拒绝。';
    const canEdit=!closed&&!busy;
    const canFile=canEdit&&connected&&workspaceAccess.has(workspaceId);
    const canWrite=canFile&&writable()&&currentAuthority&&current?.workspaceId===workspaceId;
    const hasTarget=!demo&&targets.has(Number(targetId));
    store.publish(projectWorkspaceState({connected,busy,demo,workspaceId,rows:pickerRows,
      targets:[...targets.values()],targetId,current,treeFolders,view,
      status:localizeLiteral(lastStatus),statusError:lastStatusError,locale:getLocale(),
      access:workspaceAccess.get(workspaceId)||'none',creationPending,
      presentation:{connectionLabel:localizeLiteral(connectionLabel),fileTitle:current?.path.split('/').at(-1)||'打开一个文件',
        fileMeta,draftLabel:localizeLiteral(draftLabel),previewHTML,previewKind:localizeLiteral(previewKind),
        previewURL,connectedPreviewURL,saveAsPath,
        creationPending:creationPending?{workspaceId:creationPending.workspaceId,path:creationPending.path}:null,
        accessReason:localizeLiteral(accessReason),treeMessage,toolPreviewStatus:{text:localizeLiteral(toolStatus.text),error:toolStatus.error},
        actionReview:actionReview?{message:localizeLiteral(actionReview.message),button:localizeLiteral(actionReview.button)}:null,
        directoryName:current?.path.includes('/')?'/'+current.path.slice(0,current.path.lastIndexOf('/')):translate('workspace.rootDirectory'),
        pendingSource:!!pendingSource,knowledgeHandoff:knowledgeHandoff?.getSnapshot().pending||null},
      capabilities:{setDraft:!closed&&!!current,read:!!canFile,save:!!canWrite&&dirty(current)&&!current.unknown&&!current.remote&&!current.importedDraft,
        reread:!!canFile&&!!current&&current.workspaceId===workspaceId&&!current.importedDraft,
        discardDraft:!!canFile&&!!current&&current.workspaceId===workspaceId&&dirty(current)&&!current.importedDraft,
        saveAs:!!canWrite&&!creationPending,checkCreated:!!canFile&&!!creationCheckAuthority(),
        useDisk:canEdit&&current?.workspaceId===workspaceId&&sameAuthority(current?.remote?.authority,authorityFor()),
        refresh:canEdit,selectWorkspace:canEdit&&connected,setTarget:canEdit&&!demo,
        refreshTree:!!canFile,toggleDirectory:!!canFile,collapseTree:!!canFile&&[...treeFolders.entries()].some(([path,node])=>path&&node.expanded),
        pagePreview:canEdit&&connected&&!!current&&hasTarget,removePagePreview:canEdit&&hasTarget,
        copyContent:canEdit&&!!current,openSettings:canEdit&&native,
        openSidebar:canEdit&&hasTarget&&connected&&workspaceAccess.has(workspaceId),openWorkbench:canEdit&&hasTarget,
        previewTool:!!canFile&&!demo&&!!api?.storage?.session?.set&&!!api?.tabs?.create,
        importKnowledge:canEdit&&canImportKnowledge()&&!!knowledgeHandoff&&!knowledgeHandoff.getSnapshot().disabled}}));
  }
  const status=(text,error=false)=>{lastStatus=text;lastStatusError=error;publishSnapshot();};
  const toolPreviewStatus=(message,error=false)=>{toolStatus={text:message,error};publishSnapshot();};
  const failure=e=>status((e.code?e.code+' · ':'')+(e.message||String(e)),true);
  const writable=()=>current&&workspaceAccess.get(current.workspaceId)==='read-write';
  const authorityFor=(ws=workspaceId)=>{
    const row=workspaceRows.get(ws);if(!connected||!row)return null;
    return Object.freeze({workspaceId:ws,sourceId:row.sourceId||'',leaseEpoch:row.leaseEpoch||'',
      sessionId:fileState.sessionId||(demo?'memory-demo-session':null),access:row.access,
      devLeaseEpoch:fileState.devLeaseEpoch===1?1:0});
  };
  function creationCheckAuthority(){
    const authority=authorityFor();
    // An explicit check may read through a renewed grant for the same source.
    // It never repeats the create or transfers its outcome to another source.
    return creationPending&&authority&&creationPending.workspaceId===workspaceId&&
      creationPending.authority.sourceId===authority.sourceId?authority:null;
  }
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
    if(closed||current!==record||!sameAuthority(record.authority,authorityFor()))
      throw {code:'E_FILES_SESSION',message:'保存前目录或草稿身份已变化，未执行写入。',outcome:'NOT_DISPATCHED'};
  }
  function controls(){
    knowledgeHandoff?.controls();
    chatEdit?.update({busy,connected:connected&&workspaceAccess.has(workspaceId)});
    publishSnapshot();
  }
  async function operation(action){
    if(busy||closed)return;
    busy=true;controls();
    try{return await action();}catch(e){failure(e);}finally{
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
    const counts=new Map();
    for(const row of rows){const name=sourceName(row.name);counts.set(name,(counts.get(name)||0)+1);}
    pickerRows=rows.map(row=>({...row,offline,label:sourceLabel(row,{offline,duplicate:counts.get(sourceName(row.name))>1})+
      (!offline&&row.access==='read-only'?'（只读）':'')}));
    if(!pendingSource&&!rows.some(row=>row.workspaceId===workspaceId)&&!workspaceId&&rows.length)workspaceId=rows[0].workspaceId;
    if(workspaceId&&!rows.some(row=>row.workspaceId===workspaceId)){
      const row=history.find(row=>row.workspaceId===workspaceId)||{workspaceId,name:'原工作区'};
      pickerRows.push({...row,offline:true,label:sourceLabel(row,{offline:true})});
    }
  }
  function offline(message){
    void liveToolPreview?.stop();liveToolPreview=null;
    connected=false;workspaceAccess.clear();workspaceRows.clear();fileState={};
    toolPreviewStatus('本地工具来源离线；不能读取新的构建快照。',true);
    chatEdit?.invalidate('本机连接或授权已失效，旧请求和提案已停用，草稿保留。');resetFileTree();
    populatePicker(history,{offline:true});
    connectionLabel=translate('runtime.notConnected');
    status(message);
    controls();
  }
  function renderPreview(){
    clearTimeout(previewTimer);
    previewHTML='';previewKind='';
    if(current){
      previewKind=/\.(md|markdown)$/i.test(current.path)?'基础 Markdown':/\.html?$/i.test(current.path)?'静态 HTML · 无脚本':'源码文本 · 未执行';
      try{previewHTML=renderPreviewDocument(current.path,current.content);}
      catch(error){failure(error);}
    }
    publishSnapshot();
  }
  function showRecord(record){current=record;renderPreview();controls();}
  async function readFile(ws,path,authority=authorityFor(ws)){
    if(closed||!authority)throw {code:'E_FILES_SESSION',message:'目录当前不可用。',outcome:'NOT_DISPATCHED'};
    validateRequestPath(path);
    const data=validateWorkspaceRead(await client.request('files.read',fileParams({workspaceId:ws,path},authority),expected(authority)),ws,path);
    if(await textSHA256(data.content)!==data.sha256)throw {code:'E_FILES_PROTOCOL',message:'文件内容与版本不一致，未替换草稿'};
    if(closed||!sameAuthority(authority,authorityFor(ws)))throw {code:'E_FILES_SESSION',message:'读取期间目录连接已变化，未更新草稿。'};
    return {...data,authority};
  }
  async function openFile(path){
    if(!connected||!workspaceAccess.has(workspaceId))throw {code:'E_FILES_SESSION',message:'请先选择已连接的授权目录。',outcome:'NOT_DISPATCHED'};
    validateRequestPath(path);
    if(!await leaveImportedDraft())return;
    const ws=workspaceId,key=workspaceRecordKey(ws,path),authority=authorityFor(ws);
    let record=records.get(key);
    if(!record){
      const selected=current,revision=draftRevision(selected),data=await readFile(ws,path,authority);
      if(current!==selected||draftRevision(selected)!==revision)
        throw {code:'E_EDIT_BASE',message:'读取期间当前草稿已编辑，后续输入已保留。请再次选择要打开的文件。'};
      record=createWorkspaceDraft(data);records.set(key,record);
    }
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
    treeMessage='';
    publishSnapshot();
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
    const rootFolder=treeFolders.get('');
    if(!rootFolder){treeMessage='';publishSnapshot();return;}
    let visible=0,warnings=0;
    function visit(path){
      const folder=treeFolders.get(path);
      if(!folder?.expanded||!folder.entries)return;
      if(folder.truncated)warnings++;
      for(const entry of folder.entries){
        visible++;
        if(entry.kind==='directory'){
          if(!treeFolders.has(entry.path))treeFolders.set(entry.path,folderState());
          visit(entry.path);
        }
      }
    }
    visit('');
    const expanded=[...treeFolders.entries()].filter(([path,node])=>path&&node.expanded).length;
    treeMessage=rootFolder.entries===null?translate('runtime.loadingTree'):
      (visible?translate('runtime.treeVisible',{visible,expanded}):translate('runtime.emptyFolder'))+
      (warnings?translate('runtime.treePartial',{count:warnings}):'');
    publishSnapshot();
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
  }
  function collapseFileTree(){
    for(const [path,folder] of treeFolders)folder.expanded=path==='';
    renderFileTree();controls();
  }
  async function loadTargets(){
    if(demo)return;
    const previous=targetId,list=await api.tabs.query({currentWindow:true}),next=new Map();
    for(const tab of list){
      if(!Number.isInteger(tab.id)||!/^https?:\/\//.test(tab.url||''))continue;
      let frame;try{frame=await api.webNavigation.getFrame({tabId:tab.id,frameId:0});}catch{continue;}
      if(typeof frame?.documentId!=='string')continue;
      next.set(tab.id,{tabId:tab.id,documentId:frame.documentId,url:frame.url,title:tab.title||frame.url});
    }
    if(closed)return;
    const previousTarget=targets.get(Number(previous)),nextTarget=next.get(Number(previous));
    if(previousTarget&&(!nextTarget||previousTarget.documentId!==nextTarget.documentId||previousTarget.url!==nextTarget.url))
      chatEdit?.invalidate('目标网页或文档身份已变化，请重新绑定。');
    targets.clear();for(const [key,value] of next)targets.set(key,value);
    targetId=targets.has(Number(previous))?previous:String(list.find(t=>t.active&&targets.has(t.id))?.id||'');
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
    connectionLabel=demo?'交互演示':connected?'Native 已连接':state.nativeConnected&&!state.supported?'需更新 OpenDesk':'尚未连接本机';
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
      const files=[...treeFolders.values()].flatMap(folder=>folder.expanded?folder.entries||[]:[]).filter(entry=>entry.kind==='file');
      const file=files.find(entry=>entry.path.endsWith('README.md'))||files.find(entry=>entry.path.endsWith('.md'));
      if(file)await openFile(file.path);
    }
    status(demo?'内存演示文件。':'本机已连接；文件工作区可用。保存或运行都需要明确操作。');
    // The Develop action selects an already authorized exact source. A URL is
    // only a read-only UI intent; Native authority and the config are checked
    // again below, and no business action or installed grant is replayed.
    if(pendingToolPreview&&authorityFor()?.sourceId===previewSource){
      pendingToolPreview=false;
      const intent=await consumeToolPreviewIntent({api,id:requestedPreviewIntent,sourceId:previewSource,lockManager});
      requestedToolPreview=intent.toolId||'auto';
      await previewSidebarTool();
    }
  }
  async function previewSidebarTool(){
    if(demo||!connected||!workspaceAccess.has(workspaceId))
      throw {code:'E_FILES_SESSION',message:'请先选择已授权、在线的真实本地目录。'};
    const authority=authorityFor(),ws=workspaceId;
    if(!authority?.sourceId)throw {code:'E_FILES_SESSION',message:'目录来源未经过 Native 核验。'};
    toolPreviewStatus('正在从已授权目录读取、验证完整构建快照…');
    try{
      if(liveToolPreview?.preview){
        if(requestedToolPreview&&requestedToolPreview!=='auto'&&liveToolPreview.preview.toolId!==requestedToolPreview)
          throw {code:'E_TOOL_PREVIEW_ID',message:'当前预览与所选扩展不匹配，请重新绑定源码。'};
        await api.tabs.update(liveToolPreview.preview.tabId,{active:true});return;
      }
      await assertAuthority(authority);
      const info=await readFile(ws,'tool.config.json',authority);
      let config;try{config=JSON.parse(info.content);}
      catch{throw {code:'E_TOOL_SCHEMA',message:'tool.config.json 不是合法 JSON'};}
      const toolId=config?.id;
      if(requestedToolPreview&&requestedToolPreview!=='auto'&&toolId!==requestedToolPreview)
        throw {code:'E_TOOL_PREVIEW_ID',message:'所选源码的工具 ID 与已安装扩展不匹配；未打开预览，也未改变安装版。'};
      const preview=createToolLivePreview({api,toolId,workspaceId:ws,sourceId:authority.sourceId,
        nativeAuthority:Object.freeze({...authority}),lockManager,
        assertCurrent:()=>assertAuthority(authority),onStatus:toolPreviewStatus,readText:async path=>{
        if(closed||workspaceId!==ws||!sameAuthority(authority,authorityFor()))
          throw {code:'E_FILES_SESSION',message:'读取期间目录身份或授权已经变化'};
        return (await readFile(ws,path,authority)).content;
      }});
      liveToolPreview=preview;
      try{await preview.start();}catch(error){await preview.stop();if(liveToolPreview===preview)liveToolPreview=null;throw error;}
    }catch(error){
      toolPreviewStatus((error.code||'E_TOOL_PREVIEW')+' · '+String(error.message||error),true);
      throw error;
    }
  }
  async function reread(){
    const record=current;if(!record||record.importedDraft||record.workspaceId!==workspaceId)return;
    const revision=draftRevision(record);
    const disk=await readFile(record.workspaceId,record.path);
    const result=reconcileWorkspaceRead(record,disk,{preserveDraft:draftRevision(record)!==revision});
    Object.assign(record,result.record);
    if(result.kind==='unchanged'){
      status('磁盘仍为读取时的版本，当前草稿已保留。');return;
    }
    if(result.kind==='conflict'){
      status('磁盘版本已读取。当前草稿保留，请比较版本，或另存为新文件。',true);return;
    }
    if(current===record)showRecord(record);
    status('已重新读取并核对文件内容。');
  }
  async function save(){
    const record=current;if(!record||record.remote||record.unknown||record.importedDraft||!dirty(record))return;
    const content=record.content;
    await assertSaveAuthority(record);
    const authority=record.authority;
    try{
      const result=await client.request('files.write',fileParams({workspaceId:record.workspaceId,path:record.path,content,expectedSha256:record.sha256},authority),expected(authority));
      verifyWorkspaceWriteReceipt(result,{workspaceId:record.workspaceId,path:record.path,sha256:await textSHA256(content)});
      // A write ACK is not sufficient to claim the current disk contents.
      record.unknown=true;
      const disk=await readFile(record.workspaceId,record.path,authority);
      if(!verifyWorkspaceWriteReadBack(disk,{workspaceId:record.workspaceId,path:record.path,content,sha256:result.sha256})){record.remote=disk;record.unknown=false;
        status('保存已收到回执，但磁盘内容随后发生变化。草稿已保留。',true);return;}
      // The response proves the submitted bytes, not any later keystrokes.
      // Advance the disk baseline while retaining the latest in-memory draft.
      const latestContent=record.content;
      Object.assign(record,disk,{content:latestContent,baseContent:content,unknown:false,remote:null});
      const committed=Object.freeze({workspaceId:record.workspaceId,path:record.path,content,baseContent:content,
        sha256:disk.sha256,bytes:disk.bytes,unknown:false,remote:null,importedDraft:false});
      if(current===record)showRecord(record);
      await chatEdit?.saved(record,committed);
      status(dirty(record)?'保存时的版本已写入并读回核对；后续编辑仍是未保存草稿。':
        demo?'演示文件已保存到内存，并已读回核对。':'已保存到本地文件，并已读回核对。');
    }catch(e){
      if(e.code==='E_FILES_CONFLICT'){try{record.remote=await readFile(record.workspaceId,record.path);}catch{}
        status('文件已被其他编辑器修改。没有覆盖磁盘，当前草稿已保留。',true);
      }else{if(e.outcome==='OUTCOME_UNKNOWN'||record.unknown)record.unknown=true;throw e;}
    }
  }
  async function saveAs(newPath=null){
    if(creationPending)throw {code:'E_FILES_PENDING',message:'新文件创建结果尚待核对，请先核对新文件，不要重复创建。',outcome:'NOT_DISPATCHED'};
    const record=current,path=String(newPath??saveAsPath).trim();if(!record||!path)throw new Error('请填写新文件的相对路径');
    validateRequestPath(path);
    const content=record.content,revision=draftRevision(record);
    await assertSaveAuthority(record);
    const ws=record.workspaceId,authority=record.authority;
    let acknowledged=false,data;
    try{
      creationPending={workspaceId:ws,path,content,authority,sourceRecord:record,draftRevision:revision};
      const ack=await client.request('files.create',fileParams({workspaceId:ws,path,content},authority),expected(authority));
      verifyWorkspaceWriteReceipt(ack,{workspaceId:ws,path,sha256:await textSHA256(content),create:true});
      acknowledged=true;
      data=await readFile(ws,path,authority);if(!verifyWorkspaceWriteReadBack(data,{workspaceId:ws,path,content,sha256:ack.sha256}))throw new Error('新文件已创建，但其内容随后发生变化，请重新读取');
    }catch(e){if(e.outcome==='OUTCOME_UNKNOWN'||acknowledged)status(acknowledged?'新文件已收到创建回执，但读回未完成。请点击「核对新文件」，不要重复创建。':'新文件创建结果未知。请点击「核对新文件」，不要重复创建。',true);
      else{creationPending=null;throw e;}return;}
    await showCreated(data,'新文件已创建并读回核对。');
  }
  async function showCreated(data,message,{conflict=false}={}){
    const pending=creationPending,source=pending?.sourceRecord,revision=pending?.draftRevision;
    const edited=source&&draftRevision(source)!==revision;
    const record=createWorkspaceDraft(data);
    if(edited)record.content=source.content;
    else if(conflict)record.content=pending.content;
    if(conflict)record.remote=data;
    records.set(workspaceRecordKey(data.workspaceId,data.path),record);
    workspaceId=data.workspaceId;creationPending=null;
    saveAsPath='';showRecord(record);
    if(edited&&dirty(record))message+=' 后续编辑仍保留为未保存草稿。';
    try{await revealFileInTree(data.path);status(message,conflict);}
    catch(e){status(message+' 目录刷新失败，请点击「刷新目录」。'+(e.message||String(e)),true);}
  }
  async function checkCreated(){
    const pending=creationPending;if(!pending)return;
    const authority=creationCheckAuthority();
    if(!authority)throw {code:'E_FILES_SESSION',message:'目录当前不可用。',outcome:'NOT_DISPATCHED'};
    await assertAuthority(authority);
    const data=await readFile(pending.workspaceId,pending.path,authority);
    if(data.content!==pending.content){
      await showCreated(data,'磁盘版本已读取。当前草稿保留，请比较版本，或另存为新文件。',{conflict:true});return;
    }
    await showCreated(data,'新文件已读回，内容与草稿一致。');
  }
  async function pagePreview(remove=false){
    const target=targets.get(Number(targetId));if(!target||!remove&&!current)throw new Error('请选择目标网页');
    const html=remove?'':renderPreviewDocument(current.path,current.content),title=current?.path||'';
    const frame=await api.webNavigation.getFrame({tabId:target.tabId,frameId:0});
    if(closed||target!==targets.get(Number(targetId))||frame?.documentId!==target.documentId)throw new Error('目标网页已经导航或关闭。请刷新连接，重新选择页面。');
    await api.scripting.executeScript({target:{tabId:target.tabId,documentIds:[target.documentId]},world:'ISOLATED',func:displayPagePreview,args:[{html,title,remove}]});
    status(remove?'已移除当前网页中的预览。':'已在目标网页显示当前文件的静态预览。');
  }
  function chooseView(next){
    if(closed||!['preview','source','split','app'].includes(next))return;
    view=next;publishSnapshot();
  }
  chatEdit=createChatEdit({api,demo,getRecord:()=>connected&&workspaceAccess.has(workspaceId)&&current?.workspaceId===workspaceId?current:null,
    getTarget:()=>targets.get(Number(targetId)),getAuthority:()=>authorityFor(),assertAuthority,
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
      const ws=workspaceId,key=workspaceRecordKey(ws,request.path),previous=records.get(key);
      if(previous&&(dirty(previous)||previous.unknown||previous.remote))throw {code:'E_EDIT_BASE',message:'该文件有未保存或待核对的草稿，请先处理。'};
      const selected=current,revision=draftRevision(selected),previousRevision=draftRevision(previous);
      const disk=await readFile(ws,request.path,authority);
      await assertAuthority(authority);
      if(current!==selected||draftRevision(selected)!==revision||draftRevision(previous)!==previousRevision)
        throw {code:'E_EDIT_BASE',message:'读取期间草稿已编辑，后续输入已保留；请重新建立读取请求。'};
      const record=previous||{};Object.assign(record,disk,{baseContent:disk.content,unknown:false,remote:null});
      records.set(key,record);showRecord(record);
      return {record,data:{workspaceId:ws,path:disk.path,sha256:disk.sha256,content:disk.content,bytes:disk.bytes}};
    },
    run:operation,isWritable:()=>writable()&&current?.workspaceId===workspaceId,
    readCurrent:async()=>{const record=current,ticket=refreshGeneration,authority=authorityFor(),revision=draftRevision(record);
      if(!connected||!workspaceAccess.has(workspaceId)||record?.workspaceId!==workspaceId)
        throw {code:'E_EDIT_BASE',message:'请先连接并明确选择当前文件所属的工作区。'};
      if(!record||dirty(record)||record.unknown||record.remote)throw {code:'E_EDIT_BASE',message:'请先保存或核对当前草稿。'};
      const disk=await readFile(record.workspaceId,record.path,authority);
      if(ticket!==refreshGeneration||current!==record||!connected||!workspaceAccess.has(workspaceId)||record.workspaceId!==workspaceId)
        throw {code:'E_EDIT_BASE',message:'读取期间工作区状态已变化，请等待刷新后重新生成上下文。'};
      if(draftRevision(record)!==revision||dirty(record)||record.unknown||record.remote)
        throw {code:'E_EDIT_BASE',message:'读取期间草稿已编辑，后续输入已保留；请先保存或核对后重新生成上下文。'};
      Object.assign(record,disk,{baseContent:disk.content});showRecord(record);return record;},
    setDraft:(record,content)=>{
      if(closed||current!==record)throw {code:'E_EDIT_BASE',message:'草稿所属文件已变化，未采用修改。'};
      editDraft(record,content);showRecord(record);chooseView('split');
    }
  });
  async function selectWorkspace(selected){
    if(pendingSource&&!workspaceAccess.has(selected))return;
    if(!await leaveImportedDraft()||closed)return;
    await liveToolPreview?.stop();liveToolPreview=null;
    chatEdit.invalidate('已切换工作区，旧请求和提案已失效，原草稿保留。');
    pendingToolPreview=false;requestedToolPreview='';pendingSource='';workspaceId=selected;current=null;resetFileTree();renderPreview();
    toolPreviewStatus('已切换工作区；请再次明确点击以读取该目录的工具构建。');
    if(!demo)api.storage?.local?.set({[HISTORY_KEY]:{workspaces:history,selection:workspaceId}}).catch(()=>{});
    if(connected&&workspaceAccess.has(workspaceId))await refreshFileTree();
  }
  function updateDraftContent(value){
    if(!current||closed)return false;
    editDraft(current,value);controls();
    clearTimeout(previewTimer);previewTimer=setTimeout(()=>{if(!closed)renderPreview();},200);
    return true;
  }
  async function discardDraft(){
    const record=current,ws=workspaceId;
    if(!record||record.workspaceId!==ws||record.importedDraft)throw {code:'E_FILES_SESSION',message:'请先选择草稿所属目录。'};
    const revision=draftRevision(record);
    const disk=await readFile(ws,record.path);
    if(current!==record||workspaceId!==ws)throw {code:'E_FILES_SESSION',message:'读取期间选择已变化，原草稿保留。'};
    const edited=draftRevision(record)!==revision,content=edited?record.content:disk.content;
    Object.assign(record,disk,{content,baseContent:disk.content,remote:null,unknown:false});chatEdit.forgetRecord(record);showRecord(record);
    status(edited?'磁盘已读回核对；读取期间的新编辑已保留为草稿。':'已明确丢弃草稿并重新读取磁盘；如需 AI 修改，请建立新的读取请求。');
  }
  function useDisk(){
    if(!current?.remote||busy||closed||current.workspaceId!==workspaceId||
      !sameAuthority(current.remote.authority,authorityFor()))return;
    const disk=current.remote;Object.assign(current,disk,{baseContent:disk.content,remote:null,unknown:false});
    chatEdit.forgetRecord(current);showRecord(current);status('已明确采用磁盘版本。');
  }
  // Called directly from a React user event: do not insert an async boundary
  // before privileged UI calls that depend on transient browser activation.
  function openPanel(kind,event){
    if(!event?.isTrusted||demo||busy||closed)return;
    const tabId=Number(targetId);if(!targets.has(tabId))return;
    if(kind==='sidebar'&&(!connected||!workspaceAccess.has(workspaceId)||!workspacePattern.test(workspaceId)))return;
    const path=kind==='sidebar'?'native-agent/workspace.html?workspaceId='+encodeURIComponent(workspaceId):SIDEPANEL_DOCUMENT_PATH;
    try{
      const configured=api.sidePanel.setOptions({tabId,path,enabled:true});
      const opened=api.sidePanel.open({tabId});
      return Promise.all([configured,opened])
        .then(()=>status(kind==='sidebar'?'已在选中页面打开文件侧栏。':'已恢复该页面的工作台侧栏。')).catch(failure);
    }
    catch(error){failure(error);}
  }
  function copyContent(){
    if(!current||busy||closed)return;
    try{
      const copied=copyText(current.content);
      if(!copied)throw new Error('浏览器不允许复制，请手工选择文本。');
      return Promise.resolve(copied).then(()=>status('内容已复制。你可以自行粘贴到 AI 对话。')).catch(failure);
    }catch(error){failure(error);}
  }
  const onNativeChange=(message,sender)=>{
    if(!demo&&message?.protocol===AGENT_CONFIG_PROTOCOL&&message.type==='files.changed'&&
      (!sender?.id||sender.id===api.runtime.id)){
      if(message.connected===false)offline('Native 已断开，操作能力已清除，草稿保留。');
      scheduleRefresh();
    }
  };
  const onNavigation=details=>{
    if(details.frameId===0&&details.tabId===Number(targetId)){
      chatEdit.invalidate('目标对话发生导航，旧请求和提案已失效。返回原对话也需要重新绑定。');
      scheduleRefresh();
    }
  };
  const onTabRemoved=tabId=>{
    if(tabId===Number(targetId)){chatEdit.invalidate('目标标签页已关闭。');targets.delete(tabId);targetId='';controls();}
  };
  if(native){
    api.runtime.onMessage?.addListener(onNativeChange);
    api.webNavigation.onHistoryStateUpdated?.addListener(onNavigation);
    api.webNavigation.onCommitted?.addListener(onNavigation);
    api.tabs.onRemoved?.addListener(onTabRemoved);
  }
  async function importKnowledgeDraft(draft){
    let imported=false;
    await operation(async()=>{
      if(!await leaveImportedDraft())return;
      if(dirty(current)&&!current?.importedDraft){
        const previous=current;
        const accepted=await requestActionReview('当前文件有未保存修改。切换到知识草稿后，原文件草稿保留在本窗口。','切换到知识草稿');
        if(!accepted||closed||current!==previous)return;
      }
      const authority=authorityFor();await assertAuthority(authority);
      if(!canImportKnowledge())return;
      saveAsPath=draft.filename;
      showRecord({workspaceId,path:draft.filename,content:draft.markdown,baseContent:'',sha256:null,authority,importedDraft:true});
      chooseView('split');controls();
      status('知识草稿尚未写入磁盘；关闭页面不再弹窗提醒。请先创建新文件或复制内容。');
      imported=true;
    });
    return imported;
  }
  function canImportKnowledge(){return !closed&&!creationPending&&connected&&workspaceAccess.get(workspaceId)==='read-write';}
  knowledgeHandoff=createKnowledgeHandoff({api:demo?null:api,lockManager,
    canImport:()=>!busy&&canImportKnowledge(),onImport:importKnowledgeDraft,report:failure});
  stopKnowledge=knowledgeHandoff.subscribe(publishSnapshot);
  // Closing a browser tab does not show a JS-created beforeunload modal.
  // Explicit in-app switches still require the nonmodal draft choice above.
  const stopLocale=subscribeLocale(()=>{if(closed)return;controls();if(lastStatus)status(lastStatus,lastStatusError);renderFileTree();});
  const unload=()=>{
    if(closed)return;
    closed=true;void liveToolPreview?.stop();liveToolPreview=null;stopLocale();stopKnowledge?.();finishActionReview(false);knowledgeHandoff?.dispose();chatEdit?.dispose();clearTimeout(previewTimer);
    if(native){api.runtime.onMessage?.removeListener?.(onNativeChange);
      api.webNavigation.onHistoryStateUpdated?.removeListener?.(onNavigation);
      api.webNavigation.onCommitted?.removeListener?.(onNavigation);
      api.tabs.onRemoved?.removeListener?.(onTabRemoved);}
    store.dispose();
  };
  const actions=Object.freeze({
    setDraft:updateDraftContent,read:path=>operation(()=>openFile(path)),
    save:()=>operation(save),reread:()=>operation(reread),discardDraft:()=>operation(discardDraft),
    saveAs:path=>operation(()=>saveAs(path)),checkCreated:()=>operation(checkCreated),useDisk,
    refresh:()=>{if(closed)return;refreshGeneration++;if(busy){pendingRefresh=true;return;}return operation(refresh);},
    selectWorkspace:id=>operation(()=>selectWorkspace(String(id))),
    setTarget:id=>{if(busy||closed||demo)return;targetId=targets.has(Number(id))?String(id):'';chatEdit.invalidate('已切换目标对话，旧请求和提案已失效。');controls();},
    toggleDirectory:path=>operation(()=>toggleFileDirectory(path)),refreshTree:()=>operation(()=>refreshFileTree({expanded:true})),
    collapseTree:()=>{if(!busy&&!closed)collapseFileTree();},chooseView,
    setSaveAsPath:path=>{if(!busy&&!closed){saveAsPath=String(path);publishSnapshot();}},
    setPreviewURL:url=>{if(!closed){previewURL=String(url);publishSnapshot();}},
    connectPreview:()=>{if(closed)return;try{connectedPreviewURL=validatePreviewURL(previewURL);status('预览地址：'+connectedPreviewURL+'。如果为空白，请确认服务已启动，或独立打开。');}catch(error){failure(error);}},
    openPreview:()=>{if(closed)return;try{const url=validatePreviewURL(previewURL);return Promise.resolve(native?api.tabs.create({url}):openExternal(url)).catch(failure);}catch(error){failure(error);}},
    copyContent,pagePreview:(remove=false)=>operation(()=>pagePreview(remove)),
    openSettings:()=>{if(native&&!closed)try{return api.runtime.openOptionsPage().catch(failure);}catch(error){failure(error);}},
    openSidebar:event=>openPanel('sidebar',event),openWorkbench:event=>openPanel('workbench',event),
    previewTool:event=>{if(!event?.isTrusted||demo)return;return operation(previewSidebarTool);},
    confirmAction:()=>finishActionReview(true),cancelAction:()=>finishActionReview(false),importKnowledge:event=>knowledgeHandoff.importDraft(event)
  });
  controls();
  const ready=Promise.all([operation(refresh),knowledgeHandoff.ready]).then(()=>undefined);
  return Object.freeze({getSnapshot:store.getSnapshot,subscribe:store.subscribe,actions,ready,dispose:unload,chatEdit,knowledgeHandoff});
}
