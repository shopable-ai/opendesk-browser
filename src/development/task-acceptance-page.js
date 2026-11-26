import {createRunHost} from '../run-host.js';
import {createDeveloperView} from '../ui/develop-view.js';
import {createMyWorkbenchView} from '../ui/my-workbench-view.js';
import {createScriptEditor} from '../ui/script-editor.js';
import {ACCEPTANCE_PROTOCOL} from './task-acceptance-contract.js';
import {SIDEPANEL_DOCUMENT_PATH,toolDocumentIdentity} from '../tool-document-url.js';

// Separate transport, with no reconnect or fallback to the everyday Host Client.
export async function openTaskAcceptancePage({api,document,hostInstanceId,registrationId,revision,
  expectedWindowId,createTaskWorkbench,onNavigate,onDisconnect}){
  // This metadata comes only from the fixed native document, never task params.
  // Some Chromium hosts report SIDE_PANEL.windowId as -1; the background still
  // authenticates this exact document and checks the pinned window on every call.
  const ownUrl=document.location?.href;
  const route=toolDocumentIdentity(api.runtime.getURL(SIDEPANEL_DOCUMENT_PATH),ownUrl);
  const ownerError=()=>Object.assign(new Error('无法核对原生侧栏所属窗口'),{code:'E_OWNER'});
  if(!route||route.hasLocator||route.hostInstanceId!==hostInstanceId||
    !Number.isSafeInteger(expectedWindowId)||expectedWindowId<0)throw ownerError();
  async function readWindowProof(){
    let timer;
    const [nativeWindow,contexts]=await Promise.race([
      Promise.all([
        api.windows.getCurrent(),
        api.runtime.getContexts({contextTypes:['SIDE_PANEL'],documentUrls:[ownUrl]})
      ]),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(
        new Error('核对原生侧栏窗口超时，请重新打开离线验收'),{code:'E_OWNER_TIMEOUT'})),15000);})
    ]).finally(()=>clearTimeout(timer));
    const row=contexts?.length===1?contexts[0]:null;
    if(document.location?.href!==ownUrl||nativeWindow?.id!==expectedWindowId||nativeWindow.incognito||
      row?.contextType!=='SIDE_PANEL'||row.documentUrl!==ownUrl||row.incognito||row.frameId!==0||
      !row.contextId||!row.documentId||row.documentLifecycle&&row.documentLifecycle!=='active'||
      row.windowId!==-1&&row.windowId!==expectedWindowId)throw ownerError();
    return {windowId:expectedWindowId,contextId:row.contextId,documentId:row.documentId};
  }
  const windowProof=Object.freeze(await readWindowProof());
  async function recheckWindowProof(){
    const fresh=await readWindowProof();
    if(['windowId','contextId','documentId'].some(key=>fresh[key]!==windowProof[key]))throw ownerError();
  }
  const port=api.runtime.connect({name:ACCEPTANCE_PROTOCOL});
  const pending=new Map(),runEvents=new Set(),pages=new Set(),busyListeners=new Set();
  let sequence=0,closed=false,registration,identity,selectedPage,editor,host,workbench,posts=Promise.resolve();
  function closedError(){return Object.assign(new Error('离线验收会话已断开，未回退到日用数据'),{code:'E_HOST_CLOSED'});}
  function end(){
    if(closed)return;
    closed=true;
    for(const call of pending.values()){clearTimeout(call.timer);call.reject(closedError());}
    pending.clear();runEvents.clear();pages.clear();busyListeners.clear();session.clear();
    workbench?.dispose();editor?.dispose();developerView?.dispose();void host?.dispose();
  }
  function disconnect(){end();port.disconnect();}
  port.onDisconnect.addListener(()=>{if(closed)return;end();onDisconnect?.();});
  port.onMessage.addListener(message=>{
    if(closed)return;
    if(message?.event?.runId){for(const listener of runEvents)listener(message.event);return;}
    const call=pending.get(message?.id);
    if(!call)return;
    pending.delete(message.id);clearTimeout(call.timer);publishBusy();
    if(message.ok===true)call.resolve(message.data);
    else call.reject(Object.assign(new Error(message.error?.message??'离线服务请求失败'),message.error));
  });
  function send(type,payload){
    if(closed)return Promise.reject(closedError());
    return new Promise((resolve,reject)=>{
      const id=++sequence;
      const timer=setTimeout(()=>{disconnect();onDisconnect?.();},15000);
      pending.set(id,{resolve,reject,timer});
      publishBusy();
      // Keep protocol ids ordered while asynchronous native identity reads run.
      // Pending is registered first, so these reads also fence exit and timeout.
      posts=posts.then(async()=>{
        if(closed)return;
        await recheckWindowProof();
        if(!closed)port.postMessage({id,type,payload});
      }).catch(error=>{
        if(closed)return;
        const call=pending.get(id);
        if(call){pending.delete(id);clearTimeout(call.timer);call.reject(error);}
        disconnect();onDisconnect?.();
      });
    });
  }
  const request=(method,args={})=>send('request',{method,args});
  const subscribe=(set,fn)=>{set.add(fn);return()=>set.delete(fn);};
  const publishBusy=()=>{for(const listener of busyListeners)listener();};
  const session=new Map();
  let draftWrites=0;
  const ensureOpen=()=>{if(closed)throw closedError();};
  const sandboxPaths=new Set(['scripting/sandbox/sandbox.html','scripting/sandbox/worker-runtime.js','sidepanel.html']);
  const scopedApi=Object.freeze({runtime:Object.freeze({id:api.runtime.id,getURL:path=>{
    ensureOpen();if(!sandboxPaths.has(path))throw new Error('离线验收只允许读取固定沙箱入口');
    return api.runtime.getURL(path);
  }}),tabs:Object.freeze({onRemoved:Object.freeze({addListener(){},removeListener(){}})}),
  permissions:Object.freeze({contains:value=>send('permission',value),onAdded:{addListener(){},removeListener(){}},
    onRemoved:{addListener(){},removeListener(){}}}),
  storage:Object.freeze({session:Object.freeze({async get(key){ensureOpen();return {[key]:structuredClone(session.get(key))};},
    async set(values){ensureOpen();for(const [key,value] of Object.entries(values)){
      session.set(key,structuredClone(value));draftWrites++;
    }}})})});
  function setPage(page){
    ensureOpen();
    if(page?.status!=='available'||page.windowId!==identity.windowId||!page.documentId||
      new URL(page.url).origin!=='https://www.baidu.com')throw new Error('离线网页身份不符');
    selectedPage=Object.freeze({...page,frameId:0,origin:'https://www.baidu.com'});
    return selectedPage;
  }
  const currentPageTarget={get snapshot(){return selectedPage;},get ready(){return Promise.resolve(selectedPage);},
    capture(){ensureOpen();return selectedPage;},subscribe(fn){
      fn(selectedPage);return subscribe(pages,fn);
    },
    async revalidate(prior){
      const next=setPage(await send('page'));
      if(['windowId','tabId','documentId','url','origin','frameId'].some(key=>prior?.[key]!==next[key]))
        throw Object.assign(new Error('离线网页已变更'),{code:'E_DOCUMENT_STALE'});
      return next;
    }};
  let view='tasks',navigate,developerView;
  const busy=()=>!closed&&(pending.size>0||workbench?.busy===true||editor?.busy===true||
    host?.executionPending===true||Boolean(host?.currentRun));
  try{
    const opened=await send('open',{hostInstanceId,registrationId,revision,windowProof});
    ({registration,identity}=opened);
    if(identity.hostInstanceId!==hostInstanceId||identity.revision!==revision||!registration?.registrationId||
      identity.windowId!==windowProof.windowId||identity.contextId!==windowProof.contextId||
      identity.documentId!==windowProof.documentId)
      throw new Error('离线验收侧栏身份不符');
    setPage(opened.page);
    const client=Object.freeze({ready:Promise.resolve(registration),registration,hostInstanceId,request,
      controller:Object.freeze(Object.fromEntries(['listControllerScripts','getControllerScript','commitControllerScript',
        'startControllerRun','controllerOperation','stopControllerRun','finishControllerRun','snapshotControllerRun',
        'retireControllerTarget','fenceControllerAdmission'].map(method=>[method,args=>request(method,args)]))),
      subscribeRun:fn=>subscribe(runEvents,fn),resourceSnapshot:()=>({pending:pending.size})});
    developerView=createDeveloperView();
    // The pinned task uses page access only; do not inherit the general editor's
    // optional Cookie capability into this isolated draft.
    developerView.patch('script-allow-cookies',{checked:false});
    const myView=createMyWorkbenchView({document});
    host=createRunHost({api:scopedApi,client,document,templateModuleFactory:null});
    editor=createScriptEditor({client,api:scopedApi,currentPageTarget,sharedRunHost:host,document,
      view:developerView,browserCompilerEnabled:false});
    // External write and clipboard actions stay out of the acceptance surface.
    delete developerView.actions['script-copy-result'];
    workbench=createTaskWorkbench({client,host,currentPageTarget,api:scopedApi,document,developerView,myView,
      localCatalog:true,isPresentationActive:()=>!closed,
      importDraft:editor.importDraft,executionSource:editor.executionSource,
      observeManualAttempt:(requestId,phase)=>{void send('ui-attempt',{requestId,phase}).catch(()=>{});},
      reactNavigation:{ownsPages:true,connect(handler){navigate=handler;},
        select(next){view=next;onNavigate?.();}}});
    await workbench.ready;
    await recheckWindowProof();
    ensureOpen();
    return Object.freeze({identity,developerView,myView,get view(){return view;},
      navigate:next=>navigate(next),async inspect(){
        const record=await send('inspect');
        return {...record,draftStorage:{kind:'session-map',entries:session.size,committedWrites:draftWrites}};
      },
      subscribeBusy:fn=>subscribe(busyListeners,fn),getBusy:busy,
      async selectQuery(query){
        if(busy())throw new Error('请等待当前离线操作结算');
        const page=setPage(await send('select-query',{query}));
        for(const listener of pages)listener(page);
        return page;
      },get busy(){return busy();},disconnect});
  }catch(error){disconnect();throw error;}
}
