// Time Review browser permissions and durable tracking decisions belong to
// extension-owned controls, not the untrusted tool iframe. No JS dialog.
import {TIME_REVIEW_ID,TIME_REVIEW_CAPABILITY} from './policy.js';

export function createTimeReviewPermissionControls({api,doc,container,notice,runOperation}){
  let section=null,clearReview=null,busy=false,buttons=[];
  const say=(message,problem=false)=>notice(message,problem);
  const button=(id,label,action)=>{
    const node=doc.createElement('button');node.type='button';node.id=id;
    node.className='od-button od-button--secondary';node.textContent=label;
    node.addEventListener('click',action);buttons.push(node);return node;
  };
  const setBusy=value=>{busy=value;for(const item of buttons)item.disabled=value;};
  function operate(operation,payload,event){
    if(event?.isTrusted!==true){say('请主动点击工具设置里的操作按钮',true);return;}
    if(busy)return;
    setBusy(true);
    Promise.resolve().then(()=>runOperation(operation,payload,event))
      .then(()=>say(operation==='time.start'
        ?'已确认开始／恢复后台记录；统计仅保留在本机。'
        :'已清空本机时间统计。'))
      .catch(error=>say((error?.code||'E_TIME_REVIEW')+'：'+String(error?.message||error),true))
      .finally(()=>setBusy(false));
  }
  function render(tool,readOnly=false){
    const visible=!readOnly&&tool?.id===TIME_REVIEW_ID&&tool.capabilities.includes(TIME_REVIEW_CAPABILITY);
    if(!visible){
      if(section)section.hidden=true;
      if(clearReview)clearReview.hidden=true;
      return;
    }
    if(!section){
      section=doc.createElement('section');
      section.id='time-review-permission-settings';section.className='time-review-trusted-actions';
      const hint=doc.createElement('p');
      hint.textContent='时间回顾只在你明确开始后记录聚焦、非空闲网页的域名和时长；数据只保存在本机。开始与清空都由这里的受信任按钮操作，不会弹出网页确认框。';
      const grant=button('time-review-grant-idle','授权空闲检测',event=>{
        if(event?.isTrusted!==true){say('请主动点击授权空闲检测',true);return;}
        if(busy)return;
        setBusy(true);
        // Chrome's own permission request must be initiated from a real click.
        let result;
        try{result=api.permissions.request({permissions:['idle']});}
        catch(error){setBusy(false);say(error.message,true);return;}
        Promise.resolve(result).then(ok=>say(ok
          ?'空闲检测已授权；点击「开始／恢复记录」后才会记录。'
          :'浏览器未授予空闲检测；不会开始记录。',!ok))
          .catch(error=>say(error.message,true)).finally(()=>setBusy(false));
      });
      const revoke=button('time-review-revoke-idle','撤销空闲检测',event=>{
        if(event?.isTrusted!==true||busy)return;
        setBusy(true);
        Promise.resolve().then(()=>api.permissions.remove({permissions:['idle']}))
          .then(()=>say('已撤销空闲检测，后台停止记录；历史统计保留。'))
          .catch(error=>say(error.message,true)).finally(()=>setBusy(false));
      });
      const start=button('time-review-trusted-start','开始／恢复记录',event=>operate('time.start',{},event));
      const clear=button('time-review-clear-open','清空时间统计…',event=>{
        if(event?.isTrusted!==true||busy)return;
        clearReview.hidden=false;
        clearReview.scrollIntoView?.({block:'nearest'});
      });
      clearReview=doc.createElement('section');
      clearReview.id='time-review-inline-clear-review';
      clearReview.className='time-review-inline-clear-review';clearReview.hidden=true;
      const warning=doc.createElement('p');
      warning.textContent='确认清空所有本机时间统计？请先导出重要数据。清空不能自动撤销。';
      const approve=button('time-review-clear-approve','确认清空全部记录',event=>{
        if(event?.isTrusted!==true||busy)return;
        clearReview.hidden=true;operate('time.clear',{confirm:true},event);
      });
      const cancel=button('time-review-clear-cancel','取消',()=>{
        clearReview.hidden=true;
        clear.focus?.({preventScroll:true});
      });
      clearReview.append(warning,approve,cancel);
      section.append(hint,grant,revoke,start,clear,clearReview);
      container.append(section);
    }
    section.hidden=false;
  }
  return {render};
}
