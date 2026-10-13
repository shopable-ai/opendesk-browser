(() => {
'use strict';
const {root,setState}=globalThis.OpenDeskTool;
const $=id=>root.querySelector('#'+id);
const browser=()=>globalThis.OpenDeskSDK?.browser;
let busy=false,bookmarkRef='',downloadRef='',scheduleRef='';
const json=value=>JSON.stringify(value,null,2);
const status=(message,state='info')=>{const node=$('status');node.textContent=message;node.dataset.state=state;};
const write=(id,value)=>{$(id).textContent=typeof value==='string'?value:json(value);};
const setBusy=value=>{
  busy=value;setState?.({busy,dirty:false});
  for(const button of root.querySelectorAll('button'))button.disabled=value;
  $('bookmark-remove').disabled=value||!bookmarkRef;
  $('download-status').disabled=value||!downloadRef;
  $('schedule-cancel').disabled=value||!scheduleRef;
};
const safeUrl=()=>{
  const value=$('demo-url').value;
  let url;try{url=new URL(value);}catch{throw new Error('Demo URL must be valid HTTP(S)');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Demo URL must be credential-free HTTP(S)');
  return url.href;
};
async function run(label,outputId,fn){
  if(busy)return;
  const sdk=browser();
  if(!sdk){status('OpenDeskSDK.browser is unavailable in this installed tool context.','error');return;}
  setBusy(true);status(label+' pending...');
  try{
    const result=await fn(sdk);
    write(outputId,result);
    status(label+' complete.','success');
  }catch(error){
    write(outputId,{error:String(error?.message||error),code:error?.code});
    status(label+' failed: '+String(error?.message||error),'error');
  }finally{setBusy(false);}
}
async function refreshCapabilities(){
  const sdk=browser();
  if(!sdk){$('sdk-state').textContent='SDK unavailable';$('target-status').textContent='blocked';return;}
  const rows=await sdk.capabilities.list();
  const wanted=['browser.bookmarks.create','browser.bookmarks.removeOwned','browser.storage.local.set',
    'browser.storage.local.get','browser.downloads.download','browser.downloads.getOwned',
    'browser.scheduler.create','browser.scheduler.listOwn','browser.scheduler.cancelOwn'];
  const summary=Object.fromEntries(wanted.map(operation=>{
    const row=rows.find(item=>item.operation===operation);
    return [operation,row?.status?.callableNow===true?'callable':row?.status?.reasonCode||row?.exposure||'missing'];
  }));
  $('sdk-state').textContent='SDK ready · '+rows.length+' operations';
  $('target-status').textContent='ready';
  write('storage-output',{capabilities:summary});
}
$('refresh-capabilities').addEventListener('click',()=>run('Capabilities','storage-output',async sdk=>{
  const rows=await sdk.capabilities.list();
  return {apiVersion:sdk.apiVersion,total:rows.length,operations:rows.map(row=>({
    operation:row.operation,callableNow:row.status?.callableNow,reasonCode:row.status?.reasonCode
  }))};
}));
$('bookmark-create').addEventListener('click',()=>run('Bookmark create','bookmarks-output',async sdk=>{
  const result=await sdk.bookmarks.create({url:safeUrl(),title:'OpenDesk R10.6 demo'});
  bookmarkRef=result.bookmarkRef;$('bookmark-ref').textContent=bookmarkRef;return result;
}));
$('bookmark-remove').addEventListener('click',()=>run('Bookmark remove','bookmarks-output',async sdk=>{
  const ref=bookmarkRef;
  const result=await sdk.bookmarks.removeOwned({bookmarkRef:ref});
  if(result.removed){bookmarkRef='';$('bookmark-ref').textContent='removed';}
  return {...result,bookmarkRef:ref};
}));
$('storage-write').addEventListener('click',()=>run('Storage write','storage-output',async sdk=>{
  const key=$('storage-key').value.trim(),value=$('storage-value').value;
  const result=await sdk.storage.local.set({items:{[key]:{value,at:new Date().toISOString()}}});
  $('storage-status').textContent='saved';return result;
}));
$('storage-read').addEventListener('click',()=>run('Storage read','storage-output',async sdk=>{
  const key=$('storage-key').value.trim();
  const result=await sdk.storage.local.get({keys:[key]});
  $('storage-status').textContent=Object.hasOwn(result.items,key)?'readback':'missing';
  return result;
}));
$('storage-remove').addEventListener('click',()=>run('Storage remove','storage-output',async sdk=>{
  const key=$('storage-key').value.trim();
  const result=await sdk.storage.local.remove({keys:[key]});
  $('storage-status').textContent='removed';return result;
}));
$('download-start').addEventListener('click',()=>run('Download demo','download-output',async sdk=>{
  const result=await sdk.downloads.download({url:safeUrl(),filename:'opendesk-r106-demo-form.html'});
  downloadRef=result.downloadRef;$('download-ref').textContent=downloadRef;return result;
}));
$('download-status').addEventListener('click',()=>run('Download status','download-output',async sdk=>{
  return sdk.downloads.getOwned({downloadRef});
}));
$('schedule-create').addEventListener('click',()=>run('Schedule create','scheduler-output',async sdk=>{
  const taskId=$('task-id').value.trim(),revision=$('task-revision').value.trim();
  const result=await sdk.scheduler.create({taskId,revision,schedule:{kind:'interval',expression:'1m'}});
  scheduleRef=result.scheduleRef;$('schedule-ref').textContent=scheduleRef;return result;
}));
$('schedule-list').addEventListener('click',()=>run('Schedule list','scheduler-output',async sdk=>{
  return sdk.scheduler.listOwn();
}));
$('schedule-cancel').addEventListener('click',()=>run('Schedule cancel','scheduler-output',async sdk=>{
  const ref=scheduleRef;
  const result=await sdk.scheduler.cancelOwn({scheduleRef:ref});
  if(result.cancelled){scheduleRef='';$('schedule-ref').textContent='cancelled';}
  return {...result,scheduleRef:ref};
}));
refreshCapabilities().catch(error=>status(String(error?.message||error),'error'));
setBusy(false);
})();
