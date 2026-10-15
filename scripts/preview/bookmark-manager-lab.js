/* PREVIEW SHELL ONLY: diagnostic controls stay outside the installed tool iframe. */
(()=>{'use strict';
const lab=document.getElementById('od-preview-bookmark-lab');
if(!lab)return;
const frame=document.getElementById('opendesk-preview-frame');
const feedback=document.getElementById('od-preview-bookmark-feedback');
const allowed=new Set([
  'write-fail','write-unknown','external-conflict','read-timeout',
  'extra-folders','external-delete','revoke','restore'
]);
let serial=0,pending=null;
lab.addEventListener('click',event=>{
  const button=event.target?.closest?.('button[data-bookmark-diagnostic]');
  if(!button||!lab.contains(button))return;
  const command=button.dataset.bookmarkDiagnostic;
  if(!allowed.has(command))return;
  if(!frame?.contentWindow){
    feedback.textContent='离线书签预览未加载，无法执行测试操作。';return;
  }
  // Opaque sandboxed srcdoc has no addressable origin. Only a predefined,
  // in-memory diagnostic command crosses this preview-only message boundary.
  const requestId=String(++serial);
  pending={command,requestId};
  feedback.textContent='已发送模拟操作，正在等待结果…';
  frame.contentWindow.postMessage({
    type:'opendesk.preview.bookmark.command.v1',command,requestId
  },'*');
});
window.addEventListener('message',event=>{
  if(event.source!==frame?.contentWindow||event.origin!=='null')return;
  const data=event.data;
  if(!data||data.type!=='opendesk.preview.bookmark.ack.v1'||!pending||
    data.command!==pending.command||data.requestId!==pending.requestId||
    !allowed.has(data.command)||typeof data.message!=='string')return;
  feedback.textContent=data.message.slice(0,240);
  pending=null;
});
frame?.addEventListener('load',()=>{
  pending=null;
  feedback.textContent='这里只会修改预览内存。操作结果请在书签预览中查看。';
});
})();
