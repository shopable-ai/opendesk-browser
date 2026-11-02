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
  $('download-cancel').disabled=value||!downloadRef;
  $('schedule-cancel').disabled=value||!scheduleRef;
};
const safeUrl=()=>{
  const value=$('demo-url').value;
  let url;try{url=new URL(value);}catch{throw new Error('Demo URL must be valid HTTP(S)');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Demo URL must be credential-free HTTP(S)');
  return url.href;
};

const publicOperations=new Set();
const refPlaceholder='REPLACE_WITH_OWN_REF';
const exampleArgs=operation=>({
  'browser.i18n.detectLanguage':{text:'Hello, this is an OpenDesk language test.'},
  'browser.capabilities.getStatus':{operation:'browser.tabs.create'},
  'browser.contextMenu.register':{actionIds:['sdk-check']},
  'browser.clipboard.writeText':{text:'OpenDesk SDK test'},
  'browser.downloads.text':{text:'OpenDesk SDK test',filename:'sdk-test.txt'},
  'browser.downloads.download':{url:safeUrl(),filename:'sdk-test.html'},
  'browser.bookmarks.createOwned':{url:safeUrl(),title:'OpenDesk SDK test'},
  'browser.scheduler.create':{taskId:'REPLACE_WITH_INSTALLED_TASK_ID',revision:'1',schedule:{kind:'interval',expression:'1m'}},
  'browser.storage.local.get':{keys:['sdkTest']},
  'browser.storage.local.set':{items:{sdkTest:'ok'}},
  'browser.storage.local.remove':{keys:['sdkTest']},
  'browser.storage.local.clear':{confirm:true},
  'browser.tabs.create':{url:safeUrl()},
  'browser.tabs.activateOwned':{tabRef:refPlaceholder},
  'browser.tabs.getOwned':{tabRef:refPlaceholder},
  'browser.tabs.pinOwned':{tabRef:refPlaceholder,pinned:true},
  'browser.tabs.reloadOwned':{tabRef:refPlaceholder},
  'browser.tabs.navigateOwned':{tabRef:refPlaceholder,url:safeUrl()},
  'browser.tabs.removeOwned':{tabRef:refPlaceholder},
  'browser.network.request':{method:'GET',url:safeUrl()},
  'browser.network.observe.start':{tabRef:refPlaceholder,origins:[new URL(safeUrl()).origin]},
  'browser.network.observe.getStatus':{observationId:refPlaceholder},
  'browser.network.observe.stop':{observationId:refPlaceholder},
  'browser.network.observe.export':{observationId:refPlaceholder,format:'json'},
  'browser.events.read':{sessionRef:refPlaceholder},
  'browser.events.close':{sessionRef:refPlaceholder},
  'browser.screenshot.captureVisible':{tabRef:refPlaceholder},
  'browser.operations.getStatus':{operationId:refPlaceholder},
  'browser.operations.cancel':{operationId:refPlaceholder},
  'browser.bookmarks.removeOwned':{bookmarkRef:bookmarkRef||refPlaceholder},
  'browser.downloads.getOwned':{downloadRef:downloadRef||refPlaceholder},
  'browser.downloads.cancelOwned':{downloadRef:downloadRef||refPlaceholder},
  'browser.scheduler.cancelOwn':{scheduleRef:scheduleRef||refPlaceholder},
  'browser.cookies.get':{url:safeUrl(),name:'sdk_test'},
  'browser.cookies.getAll':{url:safeUrl()},
  'browser.cookies.set':{url:safeUrl(),name:'sdk_test',value:'test'},
  'browser.cookies.remove':{url:safeUrl(),name:'sdk_test',domain:'127.0.0.1',path:'/'},
  'browser.cookies.clearSite':{url:safeUrl(),preview:true},
  'browser.cookies.getCurrentStore':{url:safeUrl()},
  'browser.cookies.getPartitionKey':{url:safeUrl()},
  'browser.cookies.observe.start':{url:safeUrl()},
  'browser.cookies.observe.getStatus':{url:safeUrl(),sessionRef:refPlaceholder},
  'browser.cookies.observe.read':{url:safeUrl(),sessionRef:refPlaceholder},
  'browser.cookies.observe.stop':{url:safeUrl(),sessionRef:refPlaceholder}
})[operation]??{};
const redact=(value,depth=0)=>{
  if(depth>6)return '[depth limited]';
  if(Array.isArray(value))return value.slice(0,30).map(item=>redact(item,depth+1));
  if(value&&typeof value==='object')return Object.fromEntries(
    Object.entries(value).slice(0,50).map(([key,item])=>[key,
      /(?:value|text|selection|content|cookie|header|authorization|token|secret|password|url|title|body|data)/i.test(key)
        ?'[REDACTED]':redact(item,depth+1)]));
  return typeof value==='string'&&value.length>400?value.slice(0,400)+'…':value;
};
function loadExample(){
  $('contract-arguments').value=json(exampleArgs($('contract-operation').value));
}
function populateContracts(rows){
  const select=$('contract-operation');
  const prior=select.value;
  select.replaceChildren();
  publicOperations.clear();
  for(const row of rows){
    if(typeof row.operation!=='string'||!/^browser\.[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*$/.test(row.operation))continue;
    publicOperations.add(row.operation);
    const option=document.createElement('option');
    option.value=row.operation;
    option.textContent=row.operation+(row.status?.callableNow?' · callable':' · '+(row.status?.reasonCode||'check authorization'));
    select.appendChild(option);
  }
  select.value=publicOperations.has(prior)?prior:
    (publicOperations.has('browser.tabs.create')?'browser.tabs.create':rows[0]?.operation||'');
  $('contract-count').textContent=publicOperations.size+' public methods';
  loadExample();
}
async function runContract(){
  if(busy)return;
  const operation=$('contract-operation').value;
  setBusy(true);
  try{
    if(!publicOperations.has(operation))throw Object.assign(new Error('Not an approved public SDK operation'),{code:'E_OPERATION'});
    const args=JSON.parse($('contract-arguments').value);
    if(!args||typeof args!=='object'||Array.isArray(args))throw new Error('Input must be a JSON object');
    const sdk=browser();
    if(!sdk)throw Object.assign(new Error('Installed SDK unavailable'),{code:'E_CONTEXT'});
    let method=sdk;
    for(const key of operation.slice('browser.'.length).split('.'))method=method?.[key];
    if(typeof method!=='function')throw Object.assign(new Error('Public SDK method not found'),{code:'E_CONTEXT'});
    const calledAt=new Date().toISOString();
    // This is a real sandbox-to-SDK call, never a synthetic Host message.
    const receipt=await (operation==='browser.clipboard.writeText'?method(args.text):method(args));
    write('contract-output',{operation,calledAt,outcome:'SDK_RETURNED_NATIVE_NOT_VERIFIED',receipt:redact(receipt)});
    status(operation+' returned; verify native effect separately.','info');
  }catch(error){
    write('contract-output',{operation,outcome:'REJECTED',code:error?.code||'E_CALL',error:String(error?.message||error).slice(0,300)});
    status(operation+' rejected; check inputs and trusted permissions.','error');
  }finally{setBusy(false);}
}
$('contract-operation').addEventListener('change',loadExample);
$('contract-fill').addEventListener('click',loadExample);
$('contract-run').addEventListener('click',()=>runContract());

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
  populateContracts(rows);
  const wanted=['browser.bookmarks.createOwned','browser.bookmarks.removeOwned','browser.storage.local.set',
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
  const result=await sdk.bookmarks.createOwned({url:safeUrl(),title:'OpenDesk R10.6 demo'});
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
$('storage-clear').addEventListener('click',()=>run('Storage clear own','storage-output',async sdk=>{
  return sdk.storage.local.clear({confirm:true});
}));
$('download-start').addEventListener('click',()=>run('Download demo','download-output',async sdk=>{
  const result=await sdk.downloads.download({url:safeUrl(),filename:'opendesk-r106-demo-form.html'});
  downloadRef=result.downloadRef;$('download-ref').textContent=downloadRef;return result;
}));
$('download-status').addEventListener('click',()=>run('Download status','download-output',async sdk=>{
  return sdk.downloads.getOwned({downloadRef});
}));
$('download-cancel').addEventListener('click',()=>run('Download cancel','download-output',async sdk=>{
  return sdk.downloads.cancelOwned({downloadRef});
}));
$('download-list').addEventListener('click',()=>run('Download list own','download-output',async sdk=>{
  return sdk.downloads.listOwned();
}));
$('probe-bookmark').addEventListener('click',()=>run('Probe bookmark owner','probe-output',async sdk=>{
  return sdk.bookmarks.removeOwned({bookmarkRef:$('probe-reference').value.trim()});
}));
$('probe-download').addEventListener('click',()=>run('Probe download owner','probe-output',async sdk=>{
  return sdk.downloads.getOwned({downloadRef:$('probe-reference').value.trim()});
}));
$('probe-schedule').addEventListener('click',()=>run('Probe schedule owner','probe-output',async sdk=>{
  return sdk.scheduler.cancelOwn({scheduleRef:$('probe-reference').value.trim()});
}));
$('probe-boundaries').addEventListener('click',()=>run('Probe trusted boundary','probe-output',async sdk=>{
  let parentReadable=false;
  try{parentReadable=!!parent.document;}catch{}
  return {historyExposed:typeof sdk.history!=='undefined',permissionsExposed:typeof sdk.permissions!=='undefined',
    chromeRuntimeExposed:typeof globalThis.chrome?.runtime?.sendMessage==='function',parentReadable};
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
