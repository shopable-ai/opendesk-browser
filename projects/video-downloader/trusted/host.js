import {MEDIA_ID,MEDIA_CAPABILITY,MEDIA_OPERATIONS,classifyMedia} from './policy.js';
import {parseHlsPlaylist} from './hls.js';
const fail=(code,message)=>Object.assign(new Error(message),{code});
const sameDocument=(a,b)=>a?.tabId===b?.tabId&&a?.documentId===b?.documentId&&
  a?.url===b?.url&&a?.windowId===b?.windowId;
const isPlain=x=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;

// Fixed isolated-world function: only video/currentSrc/source attributes are read.
// No caller-provided selector, JavaScript, arbitrary resource URL or page HTML.
export function inspectVideoElements(){
  const results=[];
  for(const video of Array.from(document.querySelectorAll('video')).slice(0,24)){
    const playing=!video.paused&&!video.ended;
    const sources=[{url:video.currentSrc||'',mime:video.getAttribute('type')||''},
      {url:video.getAttribute('src')||'',mime:video.getAttribute('type')||''},
      ...Array.from(video.querySelectorAll('source')).slice(0,4).map(s=>({
        url:s.src||s.getAttribute('src')||'',mime:s.getAttribute('type')||''
      }))];
    for(const item of sources){
      try{
        const u=new URL(item.url,document.baseURI);
        if(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&u.href.length<=4096)
          results.push({url:u.href,mime:String(item.mime||'').slice(0,128),playing});
      }catch{}
      if(results.length>=48)return results;
    }
  }
  return results;
}
async function boundedPlaylist(url,fetcher,signal){
  const result=await fetcher(url,{credentials:'omit',redirect:'error',cache:'no-store',
    referrerPolicy:'no-referrer',signal});
  if(!result?.ok||result.redirected||result.url&&result.url!==url)
    throw fail('E_HLS_HTTP','播放列表不可读取（如 403、过期或跨源重定向）');
  const claimed=Number(result.headers?.get?.('content-length')||0);
  if(claimed>262144)throw fail('E_HLS_SIZE','播放列表超出读取上限');
  if(!result.body?.getReader)throw fail('E_HLS_STREAM','当前环境不支持受限流式读取');
  const reader=result.body.getReader(),parts=[];let bytes=0;
  try{
    for(;;){
      const next=await reader.read();if(next.done)break;
      bytes+=next.value.byteLength;
      if(bytes>262144){await reader.cancel();throw fail('E_HLS_SIZE','播放列表超出读取上限');}
      parts.push(next.value);
    }
  }finally{reader.releaseLock();}
  const output=new Uint8Array(bytes);let offset=0;
  for(const part of parts){output.set(part,offset);offset+=part.byteLength;}
  return parseHlsPlaylist(new TextDecoder('utf-8',{fatal:true}).decode(output));
}
const safeFilename=(format,clock)=>'opendesk-video-'+String(clock())+'.'+format;
export function createVideoDownloaderHost({api,currentPageTarget,fetcher=globalThis.fetch,
  uuid=()=>globalThis.crypto.randomUUID(),clock=()=>Date.now()}={}){
  let cache=new Map(),context=null,task=null,generation=0;
  const ensure=async(assertCurrent,assertInstalled)=>{
    assertCurrent();await assertInstalled();assertCurrent();
  };
  const recheck=async(target,assertCurrent,assertInstalled)=>{
    await currentPageTarget.revalidate(target);
    await ensure(assertCurrent,assertInstalled);
  };
  const cancel=async row=>{
    if(!Number.isInteger(row.downloadId))return;
    try{await api.downloads.cancel(row.downloadId);}
    catch{row.cancelUnknown=true;}
  };
  function invalidate(){
    generation++;cache.clear();context=null;
    const old=task;task=null;
    if(old&&old.state!=='complete'&&old.state!=='interrupted'){
      old.stopRequested=true;old.state='cancel_requested';
      void cancel(old);
    }
  }
  async function inspect(assertCurrent,assertInstalled){
    const ticket=++generation;cache.clear();context=null;
    await ensure(assertCurrent,assertInstalled);
    if(!api?.scripting?.executeScript||!api?.webNavigation?.getAllFrames||
       !api?.permissions?.contains||!currentPageTarget?.capture)
      throw fail('E_MEDIA_UNAVAILABLE','Chrome 媒体读取能力不可用');
    const target=currentPageTarget.capture();
    if(!target.origin)throw fail('E_MEDIA_TARGET','请选择普通 HTTP(S) 网页');
    // Chrome match patterns do not support ports. Document/candidate identity
    // remains exact-origin (including port), even though native site grants do not.
    const permissionOrigin=new URL(target.origin);
    const chromePattern=permissionOrigin.protocol+'//'+permissionOrigin.hostname+'/*';
    if(!await api.permissions.contains({origins:[chromePattern]}))
      throw fail('E_MEDIA_PERMISSION','Chrome 未授权当前网站');
    await recheck(target,assertCurrent,assertInstalled);
    const frames=await api.webNavigation.getAllFrames({tabId:target.tabId});
    const top=frames?.find(x=>x?.frameId===0);
    if(!top||top.documentId!==target.documentId||top.url!==target.url||
       top.errorOccurred||top.documentLifecycle&&top.documentLifecycle!=='active')
      throw fail('E_DOCUMENT_STALE','网页文档已切换');
    let partial=false;const unique=new Map();
    const eligible=frames.filter(row=>{
      if(row?.errorOccurred||row?.documentLifecycle&&row.documentLifecycle!=='active')return false;
      try{return new URL(row.url).origin===target.origin&&typeof row.documentId==='string';}
      catch{return false;}
    }).slice(0,8);
    partial=frames.length>eligible.length;
    for(const frame of eligible){
      await recheck(target,assertCurrent,assertInstalled);
      let rows;
      try{rows=await api.scripting.executeScript({
        target:{tabId:target.tabId,documentIds:[frame.documentId]},
        world:'ISOLATED',func:inspectVideoElements,args:[]
      });}catch{partial=true;continue;}
      const result=rows?.find(x=>x.documentId===frame.documentId&&x.frameId===frame.frameId)?.result;
      if(!Array.isArray(result)||result.length>48){partial=true;continue;}
      for(const item of result){
        const parsed=classifyMedia(item?.url,item?.mime||'',target.origin);
        if(parsed&&!unique.has(parsed.url)&&unique.size<48)
          unique.set(parsed.url,parsed);
      }
    }
    await recheck(target,assertCurrent,assertInstalled);
    const candidates=[];const fresh=new Map();
    for(const row of unique.values()){
      if(ticket!==generation)throw fail('E_MEDIA_STALE','检测已被新操作取代');
      const id=uuid(),entry={...row,id,target};
      let note='',hls=null,reason=row.reason;
      if(row.format==='hls'&&row.allowed){
        const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),3500);
        try{
          hls=await boundedPlaylist(row.url,fetcher,abort.signal);
          if(hls.kind==='master'){
            const variants=[];
            for(const rendition of hls.variants.slice(0,4)){
              let info=null;
              try{
                const u=new URL(rendition.uri,row.url);
                if(u.origin===target.origin&&!u.username&&!u.password){
                  info=await boundedPlaylist(u.href,fetcher,abort.signal);
                  if(info.kind!=='media')info=null;
                }
              }catch{}
              variants.push({resolution:rendition.resolution,bandwidth:rendition.bandwidth,
                segments:info?.segments??null,encryption:info?.encryption||'unknown',
                container:info?.container||'unknown'});
            }
            hls={...hls,variants};
          }
        }catch(error){note=String(error?.code||'E_HLS_METADATA_UNAVAILABLE');}
        finally{clearTimeout(timer);}
      }
      await recheck(target,assertCurrent,assertInstalled);
      if(ticket!==generation)throw fail('E_MEDIA_STALE','检测已被新操作取代');
      const downloadable=row.allowed&&['mp4','webm'].includes(row.format);
      if(!reason&&!downloadable)reason=row.format==='hls'?'hls-detected-only':'unsupported';
      fresh.set(id,entry);
      candidates.push({id,format:row.format,mode:downloadable?'ready':'detected_only',
        reason,note,hls:hls?{kind:hls.kind,encryption:hls.encryption,
          segments:hls.segments,container:hls.container,vod:hls.vod,
          audio:hls.audio,variants:hls.variants,truncated:hls.truncated}:null});
    }
    context=target;cache=fresh;
    return {state:candidates.length?'available':'no-video',partial,candidates};
  }
  async function start(payload,assertCurrent,assertInstalled){
    if(!isPlain(payload)||Object.keys(payload).sort().join(',')!=='candidateId'||
       typeof payload.candidateId!=='string')throw fail('E_SCHEMA','必须选择检测到的媒体');
    // A Stop during an asynchronous admission must prevent any future download call.
    const preflightTicket=generation;
    await ensure(assertCurrent,assertInstalled);
    if(preflightTicket!==generation)throw fail('E_MEDIA_STOPPED','下载已停止，请重新检测');
    const selected=cache.get(payload.candidateId);
    if(!selected||!context||!sameDocument(context,selected.target))
      throw fail('E_MEDIA_STALE','媒体候选已失效，请重新检测');
    if(!selected.allowed||!['mp4','webm'].includes(selected.format))
      throw fail('E_MEDIA_UNSUPPORTED','仅支持同源的直接 MP4/WebM 下载');
    if(task&&!['complete','complete_unverified','interrupted','cancelled'].includes(task.state))
      throw fail('E_MEDIA_BUSY','已有下载任务，请先停止或完成');
    if(!api?.downloads?.download||!api?.downloads?.search||!api?.downloads?.cancel)
      throw fail('E_MEDIA_UNAVAILABLE','Chrome 原生下载能力不可用');
    const target=currentPageTarget.capture();
    if(!sameDocument(target,selected.target))
      throw fail('E_DOCUMENT_STALE','网页已变化，请重新检测');
    const row={taskId:uuid(),target,downloadId:null,stopRequested:false,
      state:'starting',cancelUnknown:false};
    task=row;cache.delete(payload.candidateId);const ticket=generation;
    try{await recheck(target,assertCurrent,assertInstalled);}
    catch(error){
      row.state='interrupted';row.stopRequested=true;
      throw error;
    }
    if(ticket!==generation||task!==row||row.stopRequested){
      row.state='cancelled';throw fail('E_MEDIA_STALE','下载启动前网页或工具已变化');
    }
    let downloadId;
    try{
      downloadId=await api.downloads.download({
        url:selected.url,filename:safeFilename(selected.format,clock),
        saveAs:false,conflictAction:'uniquify'
      });
    }catch{
      row.state='unknown';
      throw fail('E_OUTCOME_UNKNOWN','Chrome 下载回执未知，请检查下载列表，不可自动重试');
    }
    if(!Number.isInteger(downloadId)||downloadId<0){
      row.state='unknown';
      throw fail('E_OUTCOME_UNKNOWN','Chrome 下载 ID 无法核对，不可自动重试');
    }
    row.downloadId=downloadId;
    if(ticket!==generation||task!==row||row.stopRequested){
      await cancel(row);
      throw fail('E_MEDIA_STOPPED','网页或应用已变化，已请求取消迟到的下载回执；请检查 Chrome 下载列表');
    }
    row.state='started';
    return {taskId:row.taskId,downloadId,state:'started'};
  }
  async function status(payload,assertCurrent,assertInstalled){
    if(!isPlain(payload)||Object.keys(payload).sort().join(',')!=='taskId'||
       typeof payload.taskId!=='string'||task?.taskId!==payload.taskId)
      throw fail('E_MEDIA_TASK','任务不存在或已经失效');
    await ensure(assertCurrent,assertInstalled);
    const row=task;
    await recheck(row.target,assertCurrent,assertInstalled);
    if(task!==row)throw fail('E_MEDIA_STALE','任务已失效');
    if(!Number.isInteger(row.downloadId))
      return {taskId:row.taskId,state:row.stopRequested?'cancel_requested':row.state};
    const hits=await api.downloads.search({id:row.downloadId});
    await recheck(row.target,assertCurrent,assertInstalled);
    if(task!==row)throw fail('E_MEDIA_STALE','任务已失效');
    const data=hits?.find(x=>x?.id===row.downloadId);
    if(!data){row.state='unknown';return {taskId:row.taskId,downloadId:row.downloadId,state:'unknown'};}
    const bytes=Math.max(0,Number(data.bytesReceived)||0);
    const total=Math.max(0,Number(data.totalBytes)||0);
    if(data.state==='complete')
      row.state=data.exists===true&&bytes>0?'complete':'complete_unverified';
    else if(data.state==='interrupted')
      row.state=row.stopRequested&&data.error==='USER_CANCELED'?'cancelled':'interrupted';
    else if(data.state==='in_progress')
      row.state=row.stopRequested?'cancel_requested':'in_progress';
    else row.state='unknown';
    return {taskId:row.taskId,downloadId:row.downloadId,state:row.state,
      bytesReceived:bytes,totalBytes:total,
      filePresent:data.exists===true,playbackVerified:false,
      error:row.state==='interrupted'?String(data.error||'E_DOWNLOAD_INTERRUPTED').slice(0,80):null};
  }
  async function stop(payload,assertCurrent){
    if(!isPlain(payload)||Object.keys(payload).some(x=>x!=='taskId')||
      payload.taskId!==undefined&&typeof payload.taskId!=='string')
      throw fail('E_SCHEMA','停止参数无效');
    assertCurrent();
    // Invalidate the start's preflight even when no taskId has been returned yet.
    generation++;cache.clear();context=null;
    if(!task){
      return {taskId:null,state:'cancel_requested',cancelUnknown:false};
    }
    if(payload.taskId!==undefined&&task.taskId!==payload.taskId)
      throw fail('E_MEDIA_TASK','下载任务已变化');
    const row=task;row.stopRequested=true;
    if(!['complete','complete_unverified','interrupted','cancelled'].includes(row.state)){
      row.state='cancel_requested';await cancel(row);
    }
    return {taskId:row.taskId,state:row.state,cancelUnknown:row.cancelUnknown};
  }
  return Object.freeze({invalidate,request:async({tool,operation,payload={},
    assertCurrent,assertInstalled})=>{
    if(tool?.id!==MEDIA_ID||!tool.capabilities?.includes(MEDIA_CAPABILITY)||
       !MEDIA_OPERATIONS.includes(operation))throw fail('E_MEDIA_CAPABILITY','未获视频下载可信权限');
    if(!isPlain(payload))throw fail('E_SCHEMA','媒体操作参数无效');
    if(operation==='media.detect'){
      if(Object.keys(payload).length)throw fail('E_SCHEMA','检测不接受自定义 URL 或脚本');
      return inspect(assertCurrent,assertInstalled);
    }
    if(operation==='media.start')return start(payload,assertCurrent,assertInstalled);
    if(operation==='media.status')return status(payload,assertCurrent,assertInstalled);
    return stop(payload,assertCurrent);
  }});
}
