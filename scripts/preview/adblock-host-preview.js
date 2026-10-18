/* Offline confirmation overlay only. All product controls live in the
 * source-built React iframe; this outer shell never writes Chrome/DNR state. */
(()=>{
  'use strict';
  const byId=id=>document.getElementById(id),frame=byId('opendesk-preview-frame');
  if(!frame)return;
  const toolbarSettings=byId('sidebar-tool-settings-open');
  const dialog=byId('od-preview-adblock-restore-dialog');
  const title=byId('od-preview-adblock-restore-title');
  const description=byId('od-preview-adblock-restore-description');
  const accept=byId('od-preview-adblock-restore-accept');
  const cancel=byId('od-preview-adblock-restore-cancel');
  const feedback=byId('od-preview-adblock-feedback');
  const allowed=new Set(['adblock.enable','adblock.disable','adblock.site.set','adblock.site.restore']);
  let pending=null;
  const descriptions={
    'adblock.enable':'开启全局离线模拟过滤？',
    'adblock.disable':'关闭全局离线模拟过滤？',
    'adblock.site.set':'更改当前网站的离线模拟过滤？',
    'adblock.site.restore':'从离线模拟例外中恢复网站过滤？'
  };
  function note(message){feedback.textContent='仅离线模拟：'+message;}
  function respond(accepted){
    if(!pending)return;
    const current=pending;pending=null;if(dialog.open)dialog.close();
    frame.contentWindow?.postMessage({type:'opendesk.preview.adblock.review-decision',
      requestId:current.requestId,accepted},'*');
    note(accepted?'正在模拟应用并读取状态…':'已取消，模拟状态保持不变');
  }
  toolbarSettings?.addEventListener('click',()=>{
    frame.contentWindow?.postMessage({protocol:'opendesk.adblock.ui.v1',kind:'settings'},'*');
  });
  frame.addEventListener('load',()=>{if(pending)respond(false);});
  window.addEventListener('message',event=>{
    if(event.source!==frame.contentWindow||event.origin!=='null'||
      !event.data||typeof event.data!=='object')return;
    const msg=event.data;
    if(msg.type==='opendesk.preview.adblock.height'){
      if(Number.isInteger(msg.height)&&msg.height>=80&&msg.height<=4000)
        frame.style.height=Math.max(220,Math.min(1600,msg.height))+'px';
    }else if(msg.type==='opendesk.preview.adblock.review-request'){
      if(!Number.isSafeInteger(msg.requestId)||msg.requestId<1||
        !allowed.has(msg.operation)||pending)return;
      pending={requestId:msg.requestId,operation:msg.operation};
      title.textContent=descriptions[msg.operation];
      const host=typeof msg.payload?.host==='string'?msg.payload.host:'当前操作';
      description.textContent='本操作只更改此预览页面的内存状态（'+host+'）；没有真实 Chrome DNR 权限，也不会修改网络请求。';
      accept.textContent='确认模拟';
      dialog.showModal();cancel.focus();
    }else if(msg.type==='opendesk.preview.adblock.review-receipt'){
      if(!Number.isSafeInteger(msg.requestId)||!Array.isArray(msg.exceptions))return;
      note('模拟操作已完成，并由离线状态重新核对；真实 Chrome 未执行任何操作');
    }
  });
  cancel.addEventListener('click',()=>respond(false));
  accept.addEventListener('click',()=>respond(true));
  dialog.addEventListener('cancel',event=>{
    if(pending){event.preventDefault();respond(false);}
  });
})();