import * as React from 'react';

export const INITIAL_STATUS={status:'idle',title:'正在连接网页…',message:''};

const PAGE_STATES={
  ready:{title:'队列已就绪',message:''},
  'new-conversation':{title:'已连接 ChatGPT',message:''},
  'composer-unavailable':{title:'输入框暂不可用',message:'等待网页加载完成后重试。'},
  stopped:{title:'队列已停止',message:'检查应用是否已停用。'}
};

function failed(error){
  const code=typeof error?.code==='string'?error.code:'';
  const detail=typeof error?.message==='string'?error.message:String(error??'未知错误');
  return {status:'error',title:'暂时无法连接网页',code,detail,
    message:code.includes('RELOAD_REQUIRED')?
      '请先保存草稿，等待发送、回复及其他当前操作完成后刷新网页。':
      '确认 ChatGPT 已加载、应用未停用且允许访问该网站后重试。'};
}

// One read at a time. Disposal fences both the next request and late replies.
export function createStatusCheck(request,publish){
  let active=true,pending=false,generation=0;
  return {
    async check(){
      if(!active||pending)return;
      pending=true;
      const current=++generation;
      const live=()=>active&&current===generation;
      publish({status:'pending',title:'正在连接网页…',message:''});
      try{
        const info=await request('currentPage.info',{});
        if(!live())return;
        if(info?.status==='unavailable'){
          publish({status:'unavailable',title:'未找到当前网页',message:info.message||'打开 ChatGPT 后重试。'});
          return;
        }
        let target;
        try{target=new URL(info?.url);}catch{throw Object.assign(Error('当前目标信息缺少有效 URL'),{code:'E_QUEUE_STATUS_TARGET'});}
        if(info?.status!=='available')throw Object.assign(Error('当前目标信息响应无效'),{code:'E_QUEUE_STATUS_TARGET'});
        if(target.origin!=='https://chatgpt.com'){
          publish({status:'unsupported',title:'请打开 ChatGPT',message:'切换到 ChatGPT 网页后重试。',target:target.hostname});
          return;
        }
        const result=await request('page.request',{operation:'queue.status',payload:{}});
        if(!live())return;
        if(!result||!Object.hasOwn(PAGE_STATES,result.status)||
          typeof result.version!=='string'||!/^\d+\.\d+\.\d+$/.test(result.version)||
          (result.reason!==undefined&&typeof result.reason!=='string'))
          throw Object.assign(Error('网页 queue.status 响应无效，尚未确认队列就绪'),{code:'E_QUEUE_STATUS_RESPONSE'});
        publish({status:result.status,...PAGE_STATES[result.status],version:result.version,detail:result.reason||''});
      }catch(error){
        if(live())publish(failed(error));
      }finally{
        if(live())pending=false;
      }
    },
    dispose(){active=false;generation++;}
  };
}

export default function App(){
  const [state,setState]=React.useState(INITIAL_STATUS);
  const checker=React.useRef(null);
  React.useEffect(()=>{
    const instance=createStatusCheck((operation,payload)=>{
      const bridge=globalThis.OpenDeskTool;
      if(typeof bridge?.request!=='function')
        throw Object.assign(Error('当前宿主未提供 OpenDeskTool.request'),{code:'E_QUEUE_STATUS_BRIDGE'});
      return bridge.request(operation,payload);
    },setState);
    checker.current=instance;
    void instance.check();
    return ()=>{
      instance.dispose();
      if(checker.current===instance)checker.current=null;
    };
  },[]);
  const pending=state.status==='idle'||state.status==='pending';
  const diagnostic=state.code||state.detail;
  return <main className="send-queue-app" aria-label="发送队列使用说明">
    <section className="send-queue-status" aria-label="网页状态" aria-busy={pending}>
      <div className="send-queue-status-row">
        <p className="send-queue-guide-title" role="status" aria-live="polite" aria-atomic="true">{state.title}</p>
        <button type="button" onClick={()=>{void checker.current?.check();}} disabled={pending}>
          重新检查
        </button>
      </div>
      {state.message&&<p>{state.message}</p>}
      {state.target&&<p>当前网页：{state.target}</p>}
      {diagnostic&&<details key={state.status} className="send-queue-detail">
        <summary>诊断详情</summary>
        {state.version&&<p>网页模块版本：{state.version}</p>}
        {state.code&&<p>错误码：{state.code}</p>}
        {state.detail&&<p>{state.detail}</p>}
      </details>}
    </section>
    <section className="send-queue-guide" aria-label="使用方法">
      <p className="send-queue-guide-title">在 ChatGPT 网页中使用</p>
      <p>输入消息后，点击皇冠或按 Ctrl + Enter 入队。</p>
    </section>
  </main>;
}
