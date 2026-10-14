// Native permission prompts and destructive control originate only in the
// trusted Side Panel, never from the opaque-origin tool iframe.
import {FOCUS_ID,FOCUS_CAPABILITY} from './policy.js';
export function createStayFocusPermissionControls({api,doc,container,notice,runOperation}){
  let section=null,confirm=null,busy=false,buttons=[],grantButton=null,canGrant=false;
  const message=(text,error=false)=>notice(text,error);
  function createButton(id,label,handler){
    const node=doc.createElement('button');
    node.type='button';node.id=id;node.className='od-button od-button--secondary';
    node.textContent=label;node.addEventListener('click',handler);buttons.push(node);return node;
  }
  const setBusy=value=>{busy=value;buttons.forEach(node=>node.disabled=value||(node===grantButton&&!canGrant));};
  function operate(operation,payload,event){
    if(!event?.isTrusted||busy)return;
    setBusy(true);
    Promise.resolve().then(()=>runOperation(operation,payload,event))
      .then(()=>message(operation==='focus.enable'?'已开启本机专注限制。':
        operation==='focus.disable'?'已请求关闭限制，确认 Chrome 规则清理结果。':
        '本机 Stay Focus 记录已清空。'))
      .catch(error=>message((error?.code||'E_FOCUS')+'：'+String(error?.message||error),true))
      .finally(()=>setBusy(false));
  }
  function render(tool,readOnly=false,toolEnabled=false){
    const visible=!readOnly&&tool?.id===FOCUS_ID&&tool.capabilities.includes(FOCUS_CAPABILITY);
    canGrant=Boolean(visible&&toolEnabled);
    if(!visible){if(section)section.hidden=true;return;}
    if(!section){
      section=doc.createElement('section');section.id='stay-focus-trusted-settings';
      section.className='time-review-trusted-actions';
      const intro=doc.createElement('p');
      intro.textContent='首次授权并开启后，YouTube、TikTok、Instagram 等已识别娱乐网站默认共用每日 30 分钟，且可逐站暂停。授权前不会自动限制网站；计时和 Chrome 拦截均在本机完成。';
      const grant=createButton('stay-focus-enable-native','授权并开启每日娱乐总额度',event=>{
        if(!event?.isTrusted||busy||!canGrant)return;
        setBusy(true);
        // MUST call Chrome permission request synchronously in this real click.
        let approval;
        try{approval=api.permissions.request({permissions:['idle','declarativeNetRequestWithHostAccess']});}
        catch(error){setBusy(false);message(error.message,true);return;}
        Promise.resolve(approval).then(ok=>{
          if(!ok)throw new Error('未批准空闲检测或 DNR 权限，不会启动限制');
          return runOperation('focus.enable',{},event);
        }).then(()=>message('Stay Focus 已开启，受管娱乐网站共享每日总额度，Chrome 规则将按使用时间执行。'),
          error=>message((error.code||'E_FOCUS_PERMISSION')+'：'+error.message,true))
          .finally(()=>setBusy(false));
      });
      grantButton=grant;
      const stop=createButton('stay-focus-disable','停止所有 Stay Focus 限制',event=>
        operate('focus.disable',{},event));
      const openClear=createButton('stay-focus-clear-open','清空所有专注设置与记录…',event=>{
        if(!event?.isTrusted||busy)return;
        confirm.hidden=false;confirm.scrollIntoView?.({block:'nearest'});
      });
      confirm=doc.createElement('section');confirm.hidden=true;confirm.id='stay-focus-clear-confirm';
      confirm.className='time-review-inline-clear-review';
      const warning=doc.createElement('p');
      warning.textContent='确认删除全部 Stay Focus 网站清单、今日额度及时间段？此操作不会清除 Time Review 数据。';
      const approve=createButton('stay-focus-clear-approve','确认删除并解除限制',event=>{
        if(!event?.isTrusted||busy)return;
        confirm.hidden=true;operate('focus.clear',{confirm:true},event);
      });
      const cancel=createButton('stay-focus-clear-cancel','取消',event=>{
        if(!event?.isTrusted)return;confirm.hidden=true;openClear.focus?.({preventScroll:true});
      });
      confirm.append(warning,approve,cancel);
      section.append(intro,grant,stop,openClear,confirm);container.append(section);
    }
    section.hidden=false;
    grantButton.title=canGrant?'授权并开启本机限制':'请先在工具设置中启用 Stay Focus';
    setBusy(busy);
  }
  return {render};
}
