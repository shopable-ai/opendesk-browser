import * as React from 'react';

export const INITIAL_STATUS={status:'idle',title:'正在连接网页…',message:''};

const PAGE_STATES={
  ready:{title:'队列已就绪',message:''},
  stopped:{title:'队列已停止',message:'检查应用是否已停用。'}
};

const OPEN_CHAT={status:'unsupported',title:'请打开 ChatGPT、Gemini 或 DeepSeek 对话',message:''};
const RETRY_DELAYS=[350,800,1600,3200];

function siteName(url){
  if(url.username||url.password)return null;
  if(url.origin==='https://chatgpt.com')return 'ChatGPT';
  if(url.origin==='https://gemini.google.com'&&/^\/app(?:\/[a-z0-9_-]+)?\/?$/i.test(url.pathname))return 'Gemini';
  if(url.origin==='https://chat.deepseek.com'&&((url.pathname==='/'&&!url.search)||
    /^\/a\/chat\/s\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(url.pathname)))return 'DeepSeek';
  return null;
}

function pageState(status,site){
  if(status==='new-conversation')return {title:'已连接 '+site,message:''};
  if(status==='composer-unavailable')return {title:'输入框暂不可用',
    message:'请等待 '+site+' 加载完成；如尚未登录，登录并打开一条对话后，点「重新检查」。'};
  return Object.hasOwn(PAGE_STATES,status)?PAGE_STATES[status]:null;
}

function unavailableTarget(info){
  switch(info.reasonCode){
    case 'E_DOCUMENT_UNRESOLVED':
      return {status:'waiting-for-page',title:'正在等待网页加载',
        message:'网页就绪后会自动检查。如果页面已加载完成，也可手动检查。'};
    case 'E_WINDOW_UNAVAILABLE':
      return {status:'unavailable',title:'暂时无法确认浏览器窗口',
        message:'请在对话所在窗口打开侧栏，再重试。'};
    case 'E_INCOGNITO':
      return {...OPEN_CHAT,title:'请在普通窗口打开对话'};
    default:
      return OPEN_CHAT;
  }
}

function failed(error,site){
  const code=typeof error?.code==='string'?error.code:'';
  const detail=typeof error?.message==='string'?error.message:String(error??'未知错误');
  return {status:'error',title:'暂时无法连接网页',code,detail,
    message:code.includes('RELOAD_REQUIRED')||code==='E_QUEUE_STATUS_PENDING'?
      '请先保存草稿，等待发送、回复及其他当前操作完成后刷新网页。':
      '确认'+(site?' '+site+' ':'网页')+'已加载、应用未停用且允许访问该网站后重试。'};
}

// One read at a time; a page change invalidates even a successful late reply.
export function createStatusCheck(request,publish,root){
  let active=true,pending=false,generation=0,retries=0,timer;
  const clearRetry=()=>{clearTimeout(timer);timer=undefined;};
  const resetRetry=()=>{clearRetry();retries=0;};
  const scheduleRetry=()=>{
    if(!active||retries>=RETRY_DELAYS.length)return false;
    timer=setTimeout(()=>{timer=undefined;void check(true);},RETRY_DELAYS[retries++]);
    return true;
  };
  const onPageChanged=()=>{
    resetRetry();
    generation++;
    void check();
  };
  async function check(automatic=false){
      if(!active||pending)return;
      if(!automatic)resetRetry();
      pending=true;
      const current=++generation;
      const live=()=>active&&current===generation;
      let site;
      if(!automatic)publish({status:'pending',title:'正在连接网页…',message:''});
      try{
        const info=await request('currentPage.info',{});
        if(!live())return;
        if(info?.status==='unavailable'){
          const state=unavailableTarget(info);
          const waiting=state.status==='waiting-for-page';
          publish(waiting&&!scheduleRetry()?{...state,message:'请等网页加载完成后点「重新检查」。'}:state);
          return;
        }
        let target;
        try{target=new URL(info?.url);}catch{throw Object.assign(Error('当前目标信息缺少有效 URL'),{code:'E_QUEUE_STATUS_TARGET'});}
        if(info?.status!=='available')throw Object.assign(Error('当前目标信息响应无效'),{code:'E_QUEUE_STATUS_TARGET'});
        site=siteName(target);
        if(!site){
          publish(OPEN_CHAT);
          return;
        }
        const result=await request('page.request',{operation:'queue.status',payload:{}});
        if(!live())return;
        const state=typeof result?.status==='string'&&pageState(result.status,site);
        if(!state||
          typeof result.version!=='string'||!/^\d+\.\d+\.\d+$/.test(result.version)||
          (result.reason!==undefined&&typeof result.reason!=='string'))
          throw Object.assign(Error('网页 queue.status 响应无效，尚未确认队列就绪'),{code:'E_QUEUE_STATUS_RESPONSE'});
        publish({status:result.status,...state,version:result.version,detail:result.reason||''});
        if(result.status==='composer-unavailable')scheduleRetry();
      }catch(error){
        if(live()){
          // Only repeat the status read while the fixed listener is starting.
          if(['E_QUEUE_STATUS_PENDING','E_APP_PAGE_RELOAD_REQUIRED'].includes(error?.code)&&scheduleRetry())
            publish({status:'waiting-for-queue',title:'正在等待网页队列',message:'队列回应后会自动更新，也可以点「重新检查」。'});
          else publish(failed(error,site));
        }
      }finally{
        pending=false;
        if(active&&current!==generation)void check();
      }
  }
  const checker={
    check:()=>check(),
    dispose(){
      active=false;
      clearRetry();
      root?.removeEventListener('opendesk-page-changed',onPageChanged);
    }
  };
  root?.addEventListener('opendesk-page-changed',onPageChanged);
  return checker;
}

export default function App(){
  const [state,setState]=React.useState(INITIAL_STATUS);
  const checker=React.useRef(null);
  React.useEffect(()=>{
    const bridge=globalThis.OpenDeskTool;
    const instance=createStatusCheck((operation,payload)=>{
      if(typeof bridge?.request!=='function')
        throw Object.assign(Error('当前宿主未提供 OpenDeskTool.request'),{code:'E_QUEUE_STATUS_BRIDGE'});
      return bridge.request(operation,payload);
    },setState,bridge?.root);
    checker.current=instance;
    void instance.check();
    return ()=>{
      instance.dispose();
      if(checker.current===instance)checker.current=null;
    };
  },[]);
  const pending=state.status==='idle'||state.status==='pending';
  const diagnostic=state.code||state.detail;
  return <main className="send-queue-app" aria-label="发送队列">
    <section className="send-queue-status" aria-label="网页状态">
      <div className="send-queue-status-row">
        <p className="send-queue-status-title" role="status" aria-live="polite" aria-atomic="true">{state.title}</p>
        <button type="button" aria-disabled={pending} onClick={()=>{if(!pending)void checker.current?.check();}}>
          重新检查
        </button>
      </div>
      {state.message&&<p>{state.message}</p>}
      {diagnostic&&<details key={state.status} className="send-queue-detail">
        <summary>诊断详情</summary>
        {state.version&&<p>网页模块版本：{state.version}</p>}
        {state.code&&<p>错误码：{state.code}</p>}
        {state.detail&&<p>{state.detail}</p>}
      </details>}
    </section>
  </main>;
}
