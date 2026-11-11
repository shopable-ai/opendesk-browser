/* Source-bound preview shell only; finite messages to the opaque mock iframe. */
(() => {
  'use strict';
  const controls=document.getElementById('fc-preview-controls');
  const frame=document.getElementById('opendesk-preview-frame');
  const feedback=document.getElementById('fc-preview-feedback');
  const allowed=new Set(['site-a','site-b','unavailable','refresh','fail-save','recover']);
  let serial=0,pending=null;
  controls.addEventListener('click',event=>{
    const button=event.target.closest('button[data-fc-preview]');
    if(!button||!controls.contains(button)||!allowed.has(button.dataset.fcPreview))return;
    const command=button.dataset.fcPreview,requestId=String(++serial);
    pending={command,requestId};
    feedback.textContent='等待离线模拟回执…';
    frame.contentWindow.postMessage({type:'opendesk.preview.free-copy.command.v1',command,requestId},'*');
  });
  window.addEventListener('message',event=>{
    const data=event.data;
    if(event.source!==frame.contentWindow||event.origin!=='null'||!pending||
      data?.type!=='opendesk.preview.free-copy.ack.v1'||data.command!==pending.command||
      data.requestId!==pending.requestId||typeof data.message!=='string')return;
    feedback.textContent=data.message.slice(0,240);pending=null;
  });
  frame.addEventListener('load',()=>{pending=null;feedback.textContent='模拟数据已重置；可以开始操作。';});
})();
