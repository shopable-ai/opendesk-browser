// Time Review browser permissions and durable tracking decisions belong to
// extension-owned controls, not the untrusted tool iframe. No JS dialog.
import {TIME_REVIEW_ID,TIME_REVIEW_CAPABILITY,timeReviewSiteOrigin,requireTimeReviewSiteGrants} from './policy.js';
import {TIME_REVIEW_KEY} from './model.js';

export function createTimeReviewPermissionControls({api,doc,container,notice,runOperation}){
  let section=null,clearReview=null,minuteReview=null,siteReview=null,allReview=null,busy=false,buttons=[];
  let siteStatus=null,siteList=null,siteReviewHint=null,pendingSite=null;
  const say=(message,problem=false)=>notice(message,problem);
  const button=(id,label,action)=>{
    const node=doc.createElement('button');node.type='button';node.id=id;
    node.className='od-button od-button--secondary';node.textContent=label;
    node.addEventListener('click',action);buttons.push(node);return node;
  };
  const setBusy=value=>{busy=value;for(const item of buttons)item.disabled=value;};
  async function currentOrigin(){
    if(!api.windows?.getLastFocused||!api.tabs?.query)return null;
    const window=await api.windows.getLastFocused();
    if(!window?.focused||window.incognito||window.type!=='normal')return null;
    const tabs=await api.tabs.query({active:true,windowId:window.id});
    const tab=tabs?.length===1?tabs[0]:null;
    return !tab||tab.incognito||tab.pendingUrl?null:timeReviewSiteOrigin(tab.url);
  }
  function displaySiteGrants(value){
    if(!siteStatus||!siteList)return;
    const grants=requireTimeReviewSiteGrants(value);
    siteStatus.textContent=grants.allSites?'已单独同意：全部普通 HTTP(S) 网站':
      grants.origins.length?'已单独授权 '+grants.origins.length+' 个网站':'尚未授权任何网站；不会采集网站时间';
    siteList.replaceChildren();
    for(const origin of grants.origins){
      const line=doc.createElement('div');
      line.className='time-review-site-grant-row';
      const name=doc.createElement('span');name.textContent=origin;
      const revoke=doc.createElement('button');
      revoke.type='button';revoke.className='od-button od-button--secondary';
      revoke.textContent='撤销';revoke.setAttribute('aria-label','撤销 '+origin+' 的时间统计授权');
      revoke.addEventListener('click',event=>operate('time.siteGrant',{mode:'site',origin,allow:false},event));
      line.append(name,revoke);siteList.append(line);
    }
  }
  async function refreshSiteGrants(){
    if(!api.storage?.local?.get||!siteStatus)return;
    try{
      const saved=(await api.storage.local.get(TIME_REVIEW_KEY))[TIME_REVIEW_KEY];
      displaySiteGrants(saved?.siteGrants);
    }catch{siteStatus.textContent='网站授权记录不可读；无法确认采集范围';}
  }
  function operate(operation,payload,event){
    if(event?.isTrusted!==true){say('请主动点击工具设置里的操作按钮',true);return;}
    if(busy)return;
    setBusy(true);
    Promise.resolve().then(()=>runOperation(operation,payload,event))
      .then(result=>{
        if(operation==='time.siteGrant'){
          displaySiteGrants(result?.siteGrants);
          say('网站采集范围已更新；未授权的网站不会记录时间。');
        }else say(operation==='time.start'
          ?'已确认开始／恢复后台记录；统计仅保留在本机。'
          :operation==='time.minuteConsent'?(payload?.enabled
            ?'已开启未来有效活动的本机分钟明细。':'已关闭分钟明细并清除已保存的明细。')
          :'已清空本机时间统计。');
      })
      .catch(error=>say((error?.code||'E_TIME_REVIEW')+'：'+String(error?.message||error),true))
      .finally(()=>setBusy(false));
  }
  function render(tool,readOnly=false){
    const visible=!readOnly&&tool?.id===TIME_REVIEW_ID&&tool.capabilities.includes(TIME_REVIEW_CAPABILITY);
    if(!visible){
      if(section)section.hidden=true;
      if(clearReview)clearReview.hidden=true;
      if(minuteReview)minuteReview.hidden=true;
      if(siteReview)siteReview.hidden=true;
      if(allReview)allReview.hidden=true;
      pendingSite=null;
      return;
    }
    if(!section){
      section=doc.createElement('section');
      section.id='time-review-permission-settings';section.className='time-review-trusted-actions';
      const hint=doc.createElement('p');
      hint.textContent='安装工具不等于授权采集。先单独授权网站，再主动开始；只统计前台、非空闲网页的域名和时长。本机默认不上传。';
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
      const siteIntro=doc.createElement('p');
      siteIntro.textContent='网站采集授权：仅指定网站或明确同意全部普通网站。取消授权立即停止该范围的新检查点；旧合法统计保留。';
      siteStatus=doc.createElement('p');siteStatus.id='time-review-site-grants-status';
      siteStatus.textContent='正在读取已授权网站…';
      siteList=doc.createElement('div');siteList.id='time-review-site-grants-list';
      const reviewSite=button('time-review-site-current-open','授权当前网站…',async event=>{
        if(event?.isTrusted!==true||busy)return;
        try{
          const origin=await currentOrigin();
          if(!origin){say('请先切换到要授权的普通网站，再打开此设置',true);return;}
          pendingSite=origin;
          siteReviewHint.textContent='确认授权 '+origin+' 记录未来的前台非空闲时间？其他网站仍不记录。';
          siteReview.hidden=false;siteReview.scrollIntoView?.({block:'nearest'});
        }catch{say('无法确认当前网站；未授予权限',true);}
      });
      siteReview=doc.createElement('section');
      siteReview.id='time-review-site-confirm';siteReview.hidden=true;
      siteReview.className='time-review-inline-clear-review';
      siteReviewHint=doc.createElement('p');
      const approveSite=button('time-review-site-current-approve','确认授权该网站',async event=>{
        if(event?.isTrusted!==true||busy||!pendingSite)return;
        const chosen=pendingSite;
        if(await currentOrigin()!==chosen){
          siteReview.hidden=true;pendingSite=null;say('当前网站已切换；请重新审阅授权',true);return;
        }
        siteReview.hidden=true;pendingSite=null;
        operate('time.siteGrant',{mode:'site',origin:chosen,allow:true},event);
      });
      const cancelSite=button('time-review-site-current-cancel','取消',()=>{
        siteReview.hidden=true;pendingSite=null;
      });
      siteReview.append(siteReviewHint,approveSite,cancelSite);
      const reviewAll=button('time-review-site-all-open','授权全部普通网站…',event=>{
        if(event?.isTrusted!==true||busy)return;
        allReview.hidden=false;allReview.scrollIntoView?.({block:'nearest'});
      });
      allReview=doc.createElement('section');allReview.hidden=true;
      allReview.id='time-review-site-all-confirm';allReview.className='time-review-inline-clear-review';
      const allHint=doc.createElement('p');
      allHint.textContent='确认允许 Time Review 统计所有普通 HTTP(S) 网站（不包含隐身和浏览器内部页面）？此授权独立于 OpenDesk 扩展权限。';
      const allApprove=button('time-review-site-all-approve','我同意记录全部普通网站',event=>{
        if(event?.isTrusted!==true||busy)return;
        allReview.hidden=true;
        operate('time.siteGrant',{mode:'all',enabled:true},event);
      });
      const allCancel=button('time-review-site-all-cancel','取消',()=>{allReview.hidden=true;});
      allReview.append(allHint,allApprove,allCancel);
      const revokeAll=button('time-review-site-all-revoke','撤销全部网站授权',event=>{
        if(event?.isTrusted!==true||busy)return;
        siteReview.hidden=true;allReview.hidden=true;pendingSite=null;
        operate('time.siteGrant',{mode:'all',enabled:false},event);
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
      const minuteNotice=doc.createElement('p');
      minuteNotice.textContent='可选分钟明细：开启后只保存未来已经确认的活动日期、域名、分钟序号及毫秒；不保存标题、路径或网页内容。不根据历史日汇总补造分钟数据。';
      const minuteEnable=button('time-review-minute-enable','开启分钟明细',event=>{
        operate('time.minuteConsent',{enabled:true},event);
      });
      const minuteDisable=button('time-review-minute-disable','关闭并删除分钟明细…',event=>{
        if(event?.isTrusted!==true||busy)return;
        minuteReview.hidden=false;minuteReview.scrollIntoView?.({block:'nearest'});
      });
      minuteReview=doc.createElement('section');
      minuteReview.id='time-review-minute-delete-review';
      minuteReview.className='time-review-inline-clear-review';minuteReview.hidden=true;
      const minuteWarning=doc.createElement('p');
      minuteWarning.textContent='确认关闭未来分钟采集并永久删除已有分钟明细？网站日汇总与分类不受影响。';
      const minuteApprove=button('time-review-minute-delete-approve','确认关闭并删除',event=>{
        if(event?.isTrusted!==true||busy)return;
        minuteReview.hidden=true;
        operate('time.minuteConsent',{enabled:false},event);
      });
      const minuteCancel=button('time-review-minute-delete-cancel','取消',()=>{
        minuteReview.hidden=true;minuteDisable.focus?.({preventScroll:true});
      });
      minuteReview.append(minuteWarning,minuteApprove,minuteCancel);
      section.append(hint,grant,revoke,siteIntro,reviewSite,siteReview,reviewAll,allReview,
        revokeAll,siteStatus,siteList,start,clear,clearReview,
        minuteNotice,minuteEnable,minuteDisable,minuteReview);
      container.append(section);
    }
    section.hidden=false;
    void refreshSiteGrants();
  }
  return {render};
}
