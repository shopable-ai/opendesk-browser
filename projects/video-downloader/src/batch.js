// Loaded before main.js by the installed package.
const VideoDownloaderBatch=(()=>{
'use strict';
const terminal=new Set(['complete','complete_unverified','cancelled','interrupted']);
const stale=new Set(['E_TAB_REF_INVALID','E_DOCUMENT_STALE','E_MEDIA_STALE']);
const denied=new Set(['E_CAPABILITY','E_SITE_GRANT_REQUIRED','E_CHROME_PERMISSION_REQUIRED',
 'E_USER_GESTURE_REQUIRED','E_MEDIA_CAPABILITY','E_MEDIA_PERMISSION','E_MEDIA_TRUST',
 'E_TOOL_CAPABILITY_REQUIRED','E_SITE_PERMISSION_REVOKED','E_SITE_GRANT_UPDATED','E_CANCELLED']);
const encoder=new TextEncoder();
function parseLinks(input){
 const urls=[],seen=new Set(),invalid=[];
 let duplicates=0;
 for(const [index,line] of input.split(/\r?\n/).entries()){
  const value=line.trim();if(!value)continue;
  try{
   if(!/^https?:\/\//i.test(value)||/[\s\u0000-\u001f\u007f]/u.test(value))throw Error();
   const url=new URL(value);
   if(url.username||url.password||encoder.encode(value).length>2048||encoder.encode(url.href).length>2048)throw Error();
   if(seen.has(url.href)){duplicates++;continue;}
   seen.add(url.href);urls.push(url.href);
  }catch{invalid.push(index+1);}
 }
 return {urls,duplicates,invalid,overflow:urls.length>8};
}
function defaultName({title,url,index,number=1,count=1,clock=Date.now}={}){
 let stem=typeof title==='string'?title.trim():'';
 const safe=value=>value.replace(/%(?:25)*(?:2f|5c)|[\\/?*<>:"|\u0000-\u001f\u007f]+/giu,' ').replace(/^[.\s]+|[.\s]+$/gu,'');
 stem=safe(stem);
 if(!stem&&url){
  try{
   stem=new URL(url).pathname.split('/').filter(Boolean).at(-1)||'';
   try{stem=decodeURIComponent(stem);}catch{}
  }catch{}
  stem=safe(stem);
 }
 const prefix=index===undefined?'':String(index+1).padStart(3,'0')+'-';
 const suffix=count>1?'-'+number:'';
 let name=prefix,bytes=prefix.length+suffix.length;
 for(const character of stem||'opendesk-video-'+clock()){
  bytes+=encoder.encode(character).length;
  if(bytes>160)break;
  name+=character;
 }
 return name.trimEnd()+suffix;
}
function createQueue({request,launch,canOperate=()=>true,onChange=()=>{},
 wait=()=>new Promise(resolve=>setTimeout(resolve,350))}){
 const pages=[],jobs=[];
 let current=null,active=null,busy=false,paused=true,autoOpen=false,notice='',disposed=false,revision=0;
 const snapshot=()=>({pages,jobs,current,active,busy,paused,autoOpen,notice});
 const change=()=>{if(!disposed)onChange(snapshot());};
 const next=()=>pages.find(page=>page.state==='pending');
 const pending=()=>jobs.filter(job=>job.page===current&&job.state==='queued');
 const idle=()=>!disposed&&!busy&&!active&&canOperate();
 const donePage=page=>['complete','skipped'].includes(page.state);
 function note(message){notice=message;change();}
 function pause(message='队列已暂停，当前下载仍按原状态运行。'){paused=true;note(message);}
 function clearCandidates(page){
  page.candidates=[];
  for(const job of jobs)if(job.page===page&&job.state==='queued')job.state='stale';
 }
 function failPage(page,error,sideEffect=false){
  const code=error?.code;
  if(code==='E_TAB_REF_INVALID')page.ref=null;
  clearCandidates(page);
  page.state=denied.has(code)?'permission':stale.has(code)?'stale':
   sideEffect&&!['E_LIMIT','E_SCHEMA','E_CHROME_UNSUPPORTED'].includes(code)?'tab_unknown':'blocked';
  pause(page.state==='tab_unknown'?'标签页操作结果未知。请检查 Chrome 标签页；不要重发。':
   page.state==='permission'?'缺少浏览器标签页或网站授权。请完成 OpenDesk 的站点授权，再继续。':
   page.state==='stale'?'网页已关闭或文档已变化。请核对标签页后重新检测，或明确跳过。':
   code==='E_LIMIT'?'已达到 8 个工具标签页上限。请关闭已处理的工具标签页后再试。':
   code==='E_DOCUMENT_UNRESOLVED'?'网页尚未就绪。加载后请选择「激活并检测」。':
   '无法处理此网页：'+String(error?.message||error).slice(0,140));
 }
 function addLinks(input){
  const parsed=parseLinks(input);
  if(!idle()||pages.some(page=>!donePage(page))||!parsed.urls.length||parsed.overflow)return false;
  for(const url of parsed.urls)pages.push({url,index:pages.length,ref:null,candidates:[],count:0,title:'',state:'pending'});
  current=null;paused=true;note('已导入 '+parsed.urls.length+' 条网页。请选择「打开下一条网页」。');
  return true;
 }
 function pageChanged(){
  revision++;
  if(!current)return;
  if(current.state==='complete'&&!paused){pause('网页已切换。请手动打开下一条网页。');return;}
  if(!['ready','waiting'].includes(current.state))return;
  clearCandidates(current);current.state='stale';
  pause('当前网页已切换。请重新激活工具标签页并检测；原下载回执会保留。');
 }
 async function verify(page){
  const owned=await request('browser.tabs.getOwned',{tabRef:page.ref});
  if(owned?.tabRef!==page.ref||owned.url!==page.url)
   throw Object.assign(Error('标签页回执与请求不符'),{code:'E_TAB_REF_INVALID'});
 }
 async function verifyWhenReady(page){
  for(let attempt=0;!disposed;attempt++){
   try{await verify(page);return;}
   catch(error){if(error?.code!=='E_DOCUMENT_STALE'||attempt>=10)throw error;}
   await wait();
  }
 }
 async function inspect(page,activate){
  page.state='detecting';change();
  try{
   await verifyWhenReady(page);
   if(disposed)return;
   if(activate){
    try{
     const receipt=await request('browser.tabs.activateOwned',{tabRef:page.ref});
     if(receipt?.focused!==true)throw Error('没有标签页激活回执');
    }catch(error){failPage(page,error,true);return;}
    if(disposed)return;
    await verifyWhenReady(page);
   }
   if(disposed)return;
   let result,checkedRevision;
   // The Side Panel may still be receiving the active Document notification.
   // Retry only explicit Document readiness errors on this read. getOwned
   // pins the first Document and rejects a replacement, even at the same URL.
   for(let attempt=0;!disposed;attempt++){
    checkedRevision=revision;
    try{result=await request('media.detect',{tabRef:page.ref});break;}
    catch(error){if(!['E_DOCUMENT_STALE','E_DOCUMENT_UNRESOLVED'].includes(error?.code)||attempt>=5)throw error;}
    await wait();
    await verify(page);
   }
   if(disposed)return;
   if(checkedRevision!==revision)throw Object.assign(Error('检测期间页面已变化'),{code:'E_DOCUMENT_STALE'});
   if(!Array.isArray(result?.candidates))throw Error('媒体检测回执无效');
   page.title=typeof result.title==='string'?result.title:'';
   page.candidates=result.candidates;
   page.count=new Set(result.candidates.map(item=>item.videoKey??item.id)).size;
   page.state=result.candidates.some(item=>item.mode==='ready')?'ready':'waiting';
   pause(page.state==='ready'?'请选择要保存的视频与清晰度，再开始队列。':
    result.candidates.length?'已识别视频，但没有可下载的来源。请查看候选原因，或明确跳过。':
    '未发现可下载媒体。请在网页中正常播放视频后重新检测，或明确跳过。');
  }catch(error){if(!disposed)failPage(page,error);}
 }
 async function openNext(){
  if(!idle()||current&&!donePage(current))return;
  const page=next();if(!page)return;
  current=page;busy=true;paused=true;page.state='opening';note('正在打开第 '+(page.index+1)+' 条网页…');
  try{
   let created;
   try{
    created=await request('browser.tabs.create',{url:page.url});
    if(typeof created?.tabRef!=='string'||!created.tabRef)throw Error('没有可靠的工具标签页回执');
   }catch(error){if(!disposed)failPage(page,error,true);return;}
   if(disposed)return;
   page.ref=created.tabRef;
   await inspect(page,false);
  }finally{busy=false;change();}
 }
 async function redetect(){
  const page=current;
  if(!idle()||!page||!['ready','waiting','permission','stale','blocked'].includes(page.state))return;
  if(!page.ref){
   if(!['permission','blocked'].includes(page.state))return;
   page.state='pending';current=null;return openNext();
  }
  busy=true;clearCandidates(page);
  try{await inspect(page,true);}finally{busy=false;change();}
 }
 async function remove(page){
  if(!idle()||!pages.includes(page)||!donePage(page)||!page.ref||page.closeUnknown)return;
  busy=true;change();
  try{
   await verify(page);
   if(disposed)return;
   try{
    const result=await request('browser.tabs.removeOwned',{tabRef:page.ref});
    if(result?.closed!==true)throw Error('没有关闭回执');
    page.ref=null;note('工具打开的网页已关闭。');
   }catch(error){
    if(error?.code==='E_TAB_REF_INVALID')page.ref=null;
    else if(!stale.has(error?.code)&&!denied.has(error?.code))page.closeUnknown=true;
    note(page.closeUnknown?'关闭结果未知，请查看 Chrome 标签页；不要重发。':'无法关闭：'+String(error?.message||error).slice(0,120));
   }
  }catch(error){
   if(error?.code==='E_TAB_REF_INVALID')page.ref=null;
   note('此工具标签页无法核对：'+String(error?.message||error).slice(0,120));
  }finally{busy=false;change();}
 }
 function addJob({candidateId,variantId,filename,format,output,quality}){
  const page=current;
  if(!idle()||page?.state!=='ready')return false;
  const candidate=page.candidates.find(item=>item.id===candidateId&&item.mode==='ready');
  const videoKey=candidate?.videoKey??candidateId;
  if(!candidate||jobs.some(job=>job.page===page&&job.videoKey===videoKey&&job.state!=='stale'))return false;
  if(candidate.hls?.kind==='master'&&!candidate.hls.variants.some(variant=>variant.id===variantId&&variant.ready))return false;
  jobs.push({page,candidateId,variantId,videoKey,filename,format,output,quality,state:'queued',receipt:null});
  change();return true;
 }
 function rename(job,filename){
  if(!idle()||!jobs.includes(job)||job.page!==current||job.state!=='queued')return false;
  job.filename=filename;
  return true;
 }
 function skip(){
  if(!idle()||!current||donePage(current))return;
  clearCandidates(current);current.state='skipped';
  pause('已明确跳过当前网页。需要继续时，请打开下一条网页。');
 }
 function advance(){
  if(!idle()||paused||current?.state!=='ready')return;
  const job=pending()[0];
  if(!job){
   const selected=jobs.filter(row=>row.page===current&&row.state!=='stale');
   if(selected.length&&selected.every(row=>row.state==='complete')){
    current.state='complete';change();
    if(autoOpen)void openNext();
   }
   return;
  }
  active=job;job.state='starting';change();
  // The existing downloader owns the single start, status, and stop path.
  try{if(launch(job)!==true)throw Error('下载未提交');}
  catch(error){update(job,{state:'interrupted',error:String(error?.message||error)});}
 }
 function run(){
  if(!idle()||current?.state!=='ready'||!pending().length)return;
  paused=false;notice='';advance();
 }
 function update(job,receipt){
  if(disposed||job!==active||!receipt?.state)return;
  const wasUnknown=job.state==='unknown';
  job.receipt={...receipt};job.state=receipt.state;
  if(job.state==='unknown'){pause('下载结果未知。只可核对原任务，不可重新提交或推进。');return;}
  if(!terminal.has(job.state)){change();return;}
  if(job.state!=='complete'||wasUnknown)paused=true;
  active=null;
  if(job.state!=='complete')note(job.state==='complete_unverified'?'Chrome 已结束，但文件未核实。队列已暂停。':'下载未完成，队列已暂停。');
  else {
   const selected=jobs.filter(row=>row.page===current&&row.state!=='stale');
   if(current?.state==='ready'&&selected.every(row=>row.state==='complete'))current.state='complete';
   change();
  }
  if(!paused)queueMicrotask(()=>{
   if(paused)return;
   if(current?.state==='complete'&&autoOpen)void openNext();else advance();
  });
 }
 function setAutoOpen(value){autoOpen=value===true;change();}
 function dispose(){disposed=true;paused=true;}
 return {snapshot,addLinks,openNext,redetect,remove,addJob,rename,skip,run,pause,update,setAutoOpen,pageChanged,dispose};
}
return Object.freeze({parseLinks,defaultName,createQueue});
})();
