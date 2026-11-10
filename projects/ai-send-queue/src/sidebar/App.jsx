import * as React from 'react';

export const INITIAL_STATUS={status:'idle',title:'尚未检查网页状态',message:'打开侧栏后会检查一次；切换网页或处理问题后，可手动重新检查。'};

const PAGE_STATES={
  ready:{title:'网页队列已就绪',message:'网页已确认放置队列界面，可在原生输入框使用皇冠按钮或 Ctrl + Enter。'},
  'new-conversation':{title:'请先发送首条消息',message:'请先在 ChatGPT 原生发送首条消息，建立对话后即可加入队列。'},
  'composer-unavailable':{title:'网页输入框暂不可用',message:'等待 ChatGPT 网页和输入框加载完成，再手动检查。'},
  stopped:{title:'网页模块已停止',message:'当前不能使用队列。请检查应用是否被主动停用；需要刷新时，先保存草稿并等待当前操作完成，再正常刷新网页并检查。'}
};

function failed(error){
  const code=typeof error?.code==='string'?error.code:'';
  const detail=typeof error?.message==='string'?error.message:String(error??'未知错误');
  return {status:'error',title:'网页状态检查失败',code,detail,
    message:code.includes('RELOAD_REQUIRED')?
      '请先保存草稿，等待发送、回复及其他当前操作完成后，正常刷新网页，再手动检查。':
      '尚未确认网页模块运行或访问权限。请等待网页加载完成，检查应用是否被主动停用及已有站点访问是否可用，再手动检查。'};
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
      publish({status:'pending',title:'正在检查网页状态…',message:'正在核对当前目标和网页模块回执。'});
      try{
        const info=await request('currentPage.info',{});
        if(!live())return;
        if(info?.status==='unavailable'){
          publish({status:'unavailable',title:'当前目标不可用',message:info.message||'请切换到 ChatGPT 网页，加载完成后手动检查。'});
          return;
        }
        let target;
        try{target=new URL(info?.url);}catch{throw Object.assign(Error('当前目标信息缺少有效 URL'),{code:'E_QUEUE_STATUS_TARGET'});}
        if(info?.status!=='available')throw Object.assign(Error('当前目标信息响应无效'),{code:'E_QUEUE_STATUS_TARGET'});
        if(target.origin!=='https://chatgpt.com'){
          publish({status:'unsupported',title:'当前目标不支持',message:'仅支持 https://chatgpt.com 网页。请切换到 ChatGPT 后手动检查。',target:target.hostname});
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
  const pending=state.status==='pending';
  return <main className="send-queue-app" aria-label="发送队列使用说明">
    <section className="send-queue-status" aria-label="网页状态" aria-busy={pending}>
      <div role="status" aria-live="polite" aria-atomic="true">
        <p className="send-queue-guide-title">{state.title}</p>
        <p>{state.message}</p>
        {state.target&&<p>当前目标：{state.target}</p>}
        {state.version&&<p className="send-queue-meta">网页模块版本：{state.version}</p>}
        {state.code&&<p className="send-queue-detail">错误码：{state.code}</p>}
        {state.detail&&<p className="send-queue-detail">{state.detail}</p>}
      </div>
      <button type="button" onClick={()=>{void checker.current?.check();}} disabled={pending}>
        {pending?'正在检查…':'检查网页状态'}
      </button>
      <p className="send-queue-meta">状态仅代表本次检查；切换网页后请重新检查，不会自动轮询。</p>
    </section>
    <section className="send-queue-guide" aria-label="使用方法">
      <p className="send-queue-guide-title">在 ChatGPT 网页中使用</p>
      <p>首条消息请由 ChatGPT 原生发送。建立对话后，在消息输入框写好内容，点击皇冠按钮或按 Ctrl + Enter 加入发送队列。</p>
      <p>查看队列和操作消息都在网页中完成。</p>
    </section>
  </main>;
}
