import {runQueue} from '../src/page/main.js';
import queueCss from '../assets/queue.css?raw';
import crown from '../assets/crown-premium.webp?inline';
import {FIXED_QUEUE_PROTOCOL,FIXED_QUEUE_TOOL_ID,fixedSendQueueOrigin} from '../../../src/scripting/user-scripts/fixed-send-queue.js';
import {SIDEBAR_TOOL_STORE} from '../../../src/ui/sidebar-tools/package.js';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../../src/ui/sidebar-tools/lifecycle.js';

const assets=Object.freeze({'assets/queue.css':{kind:'css',text:queueCss},
  'assets/crown-premium.webp':{kind:'image',url:crown}});
const existingQueue='[data-opendesk-ui-owner]:is([data-od-id="app.ai-send-queue.lifecycle"],'+
  '[data-od-id="opendesk.ai-send-queue.lifecycle"],[data-od-id="opendesk.chatgpt-send-queue.lifecycle"])';
const reload=()=>Object.assign(new Error('当前网页可能还有旧版队列。请先保留草稿并刷新对话页。'),
  {code:'E_APP_PAGE_RELOAD_REQUIRED'});
const initialized=new WeakSet();

export function initFixedSendQueue({api=globalThis.chrome,win=globalThis.window}={}){
  if(!win||win.top!==win||!api?.runtime?.id)return;
  const deepseek=win.location.origin==='https://chat.deepseek.com';
  if(!fixedSendQueueOrigin(win.location.href)&&!(deepseek&&win.location.pathname==='/'))return;
  const canAuthorize=()=>!!fixedSendQueueOrigin(win.location.href);
  const doc=win.document,runtimeId=api.runtime.id;
  if(initialized.has(doc))return;
  initialized.add(doc);
  let owner,handler,token,pending,epoch=0,paused=false,deepSeekHome=false;
  const current=(stamp,url)=>!paused&&api.runtime.id===runtimeId&&epoch===stamp&&win.location.href===url;
  const dispose=()=>{epoch++;owner?.destroy();owner=null;handler=null;token=null;deepSeekHome=false;};
  async function readGrant(previous){
    const url=win.location.href,stamp=epoch;
    const response=await api.runtime.sendMessage({protocol:FIXED_QUEUE_PROTOCOL,kind:'authorize',url,
      ...(previous?{token:previous}:{})});
    if(!current(stamp,url))throw Object.assign(new Error('网页或队列授权已改变，请重新检查'),{code:'E_DOCUMENT_STALE'});
    if(response?.ok!==true||typeof response.data?.token!=='string')throw Object.assign(
      new Error(response?.error?.message??'网页队列尚未确认授权'),{code:response?.error?.code??'E_PAGE_AUTHORIZATION'});
    return response.data;
  }
  async function authorize(){
    const stamp=epoch;
    if(!token||!owner?.active()||!canAuthorize()||deepseek&&win.location.pathname==='/'&&!deepSeekHome)return false;
    try{return (await readGrant(token)).token===token&&stamp===epoch&&owner?.active();}
    catch(error){
      if(stamp===epoch&&!['E_DOCUMENT_STALE','E_DEV_RELOADING'].includes(error.code))dispose();
      return false;
    }
  }
  function ensure(){
    if(paused)return Promise.reject(reload());
    if(!canAuthorize())return Promise.reject(Object.assign(new Error('请打开支持的对话页'),{code:'E_DOCUMENT_STALE'}));
    if(pending)return pending;
    const url=win.location.href,stamp=epoch;
    pending=(async()=>{
      if(owner?.active()&&handler){
        if(await authorize())return;
        throw Object.assign(new Error('队列或网页状态已改变，请重新检查'),{code:'E_PAGE_AUTHORIZATION'});
      }
      if(doc.querySelector(existingQueue))throw reload();
      const grant=await readGrant(null);
      if(!current(stamp,url)||doc.querySelector(existingQueue))throw reload();
      token=grant.token;deepSeekHome=grant.deepSeekHome===true;
      const result=await runQueue({assets,fixed:{authorize,deepSeekHome,own(ui){owner=ui;},bridge:{onRequest(callback){
        handler=callback;return ()=>{if(handler===callback)handler=null;};
      }}}});
      if(!current(stamp,url)||result?.status!=='active'||!owner?.active()||!handler){
        if(stamp===epoch)dispose();
        throw reload();
      }
    })().catch(error=>{if(stamp===epoch&&token)dispose();throw error;}).finally(()=>{pending=null;});
    return pending;
  }
  const wake=()=>void ensure().catch(()=>{});
  const onStorage=(changes,area)=>{
    if(area!=='local')return;
    const changed=(key,select)=>Object.hasOwn(changes,key)&&
      JSON.stringify(select(changes[key].oldValue))!==JSON.stringify(select(changes[key].newValue));
    if(changed(SIDEBAR_TOOL_STORE,value=>Array.isArray(value)?value.filter(row=>row?.id===FIXED_QUEUE_TOOL_ID):null)||
      changed(SIDEBAR_TOOL_ENABLE_STORE,value=>value?.[FIXED_QUEUE_TOOL_ID])||
      changed(TOOL_REVOCATION_EPOCHS_STORE,value=>value?.[FIXED_QUEUE_TOOL_ID])){
      dispose();
      if(pending)void pending.then(wake,wake);else wake();
    }
  };
  api.runtime.onMessage.addListener((message,sender,reply)=>{
    if(message?.protocol!==FIXED_QUEUE_PROTOCOL||message.kind!=='status')return false;
    if(sender?.id!==runtimeId||sender.tab!==undefined||sender.documentId!==undefined||message.url!==win.location.href)return false;
    const base=new URL(api.runtime.getURL('')),origin=base.protocol+'//'+base.host;
    const worker=api.runtime.getManifest().background?.service_worker;
    if(!worker||(sender.origin!==undefined&&sender.origin!==origin)||
      (sender.url===undefined?sender.origin!==origin:sender.url!==api.runtime.getURL(worker)))return false;
    void ensure().then(()=>{
      if(message.url!==win.location.href||!handler||!owner?.active())throw reload();
      return handler({operation:'queue.status',payload:{}});
    }).then(data=>reply({ok:true,data}),error=>reply({ok:false,code:error.code??'E_QUEUE_STATUS',message:error.message}));
    return true;
  });
  api.storage.onChanged.addListener(onStorage);
  if(deepseek){
    const onRoute=()=>{
      if(!canAuthorize()||owner?.active())return;
      // An earlier grant may still be settling for a different committed URL.
      if(pending)void pending.then(wake,wake);else wake();
    };
    if(win.navigation)win.navigation.addEventListener('currententrychange',onRoute);
    else win.addEventListener('popstate',onRoute);
  }
  win.addEventListener('pagehide',()=>{paused=true;dispose();});
  win.addEventListener('pageshow',()=>{paused=false;wake();});
  // Active work checks the grant before each poll; idle widgets periodically
  // retire as well if Chrome site access disappeared without a storage event.
  const timer=win.setInterval(()=>{
    if(api.runtime.id!==runtimeId){dispose();win.clearInterval(timer);return;}
    if(!paused&&owner?.active())void authorize();
  },5000);
  if(canAuthorize())wake();
}
