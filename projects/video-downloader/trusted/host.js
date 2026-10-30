import {MEDIA_ID,MEDIA_CAPABILITY,MEDIA_OPERATIONS,classifyMedia} from './policy.js';
import {readHls,publicMediaUrl,downloadHlsVod,validateVod,mediaError} from './stream.js';
import {inspectMediaSources} from './discovery.js';
const fail=(code,message)=>Object.assign(new Error(message),{code});
const sameDocument=(a,b)=>a?.tabId===b?.tabId&&a?.documentId===b?.documentId&&
  a?.url===b?.url&&a?.windowId===b?.windowId;
const isPlain=x=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const terminal=new Set(['complete','complete_unverified','interrupted','cancelled']);

const safeFilename=(format,clock)=>'opendesk-video-'+String(clock())+'.'+format;
export function createVideoDownloaderHost({api,currentPageTarget,fetcher=globalThis.fetch,
  uuid=()=>globalThis.crypto.randomUUID(),clock=()=>Date.now()}={}){
  let cache=new Map(),context=null,task=null,generation=0,scanAbort=null,checking=Promise.resolve();
  // A native call may already have caused a save even when its receipt is lost.
  // Navigation/Stop cannot clear that uncertainty and allow another save.
  const nativeSaves=new Set();
  const releaseBlob=row=>{
    if(row.blobUrl){URL.revokeObjectURL(row.blobUrl);row.blobUrl=null;}
    if(row.onChanged){api.downloads.onChanged?.removeListener(row.onChanged);row.onChanged=null;}
  };
  const settledNative=row=>{nativeSaves.delete(row);releaseBlob(row);};
  const watchNative=row=>{
    if(!api.downloads.onChanged?.addListener)return;
    row.onChanged=delta=>{
      if(delta.id===row.downloadId&&['complete','interrupted'].includes(delta.state?.current))settledNative(row);
    };
    api.downloads.onChanged.addListener(row.onChanged);
  };
  const refuseUnresolved=()=>{
    if([...nativeSaves].some(row=>row!==task||row.nativeUnknown||row.cancelUnknown))
      throw fail('E_OUTCOME_UNKNOWN','原下载结果未知，请先检查 Chrome 下载记录；不可重新下载');
  };
  const ensure=async(assertCurrent,assertInstalled)=>{
    assertCurrent();await assertInstalled();assertCurrent();
  };
  const recheck=(target,assertCurrent,assertInstalled)=>{
    // currentPageTarget intentionally supersedes concurrent observations. Keep
    // this Host's parallel segment/status checks from superseding one another.
    const result=checking.then(async()=>{
      await currentPageTarget.revalidate(target);
      const origin=new URL(target.origin);
      if(!await api.permissions.contains({origins:[origin.protocol+'//'+origin.hostname+'/*']}))
        throw fail('E_MEDIA_PERMISSION','Chrome 网站访问权限已撤销');
      await ensure(assertCurrent,assertInstalled);
    });
    checking=result.catch(()=>{});return result;
  };
  const cancel=async row=>{
    row.abort?.abort();
    if(!Number.isInteger(row.downloadId)){
      if(row.nativeUnknown)row.state='unknown';
      return;
    }
    try{
      await api.downloads.cancel(row.downloadId);
      const hits=await api.downloads.search({id:row.downloadId});
      if(hits?.some(data=>data.id===row.downloadId&&['complete','interrupted'].includes(data.state)))settledNative(row);
    }catch{row.cancelUnknown=true;row.state='unknown';}
  };
  function invalidate(){
    scanAbort?.abort();scanAbort=null;
    generation++;cache.clear();context=null;
    const old=task;task=null;
    if(old&&!terminal.has(old.state)){
      old.stopRequested=true;if(old.state!=='unknown')old.state='cancel_requested';
      void cancel(old);
    }
  }
  async function inspect(assertCurrent,assertInstalled){
    refuseUnresolved();
    if(task&&!['complete','complete_unverified','interrupted','cancelled'].includes(task.state))
      throw fail('E_MEDIA_BUSY','请先完成或停止当前下载');
    scanAbort?.abort();scanAbort=new AbortController();
    const scan=scanAbort;
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
        world:'ISOLATED',func:inspectMediaSources,args:[]
      });}catch{partial=true;continue;}
      const raw=rows?.find(x=>x.documentId===frame.documentId&&x.frameId===frame.frameId)?.result;
      const result=Array.isArray(raw)?raw:raw?.sources;
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
      let renditions=[];
      if(row.format==='hls'){
        const authorize=async url=>{
          scan.signal.throwIfAborted();
          await recheck(target,assertCurrent,assertInstalled);
          const origin=new URL(publicMediaUrl(url));
          if(!await api.permissions.contains({origins:[origin.protocol+'//'+origin.hostname+'/*']}))
            throw mediaError('E_MEDIA_PERMISSION');
          scan.signal.throwIfAborted();
        };
        const timer=setTimeout(()=>scan.abort(),15000);
        try{
          hls=await readHls(row.url,{fetcher,authorize,signal:scan.signal});
          entry.allowed=true;reason=null;
          if(hls.kind==='master'){
            const variants=[];
            for(const rendition of hls.variants.slice(0,8)){
              let info=null,variantUrl=null,ready=false;
              try{
                variantUrl=publicMediaUrl(rendition.uri,row.url);
                info=await readHls(variantUrl,{fetcher,authorize,signal:scan.signal});
                validateVod(info);
                ready=hls.encryption==='unknown'&&!hls.audio.some(x=>x.group===rendition.audioGroup&&x.external);
              }catch{}
              const variantId=uuid();
              if(ready)renditions.push({id:variantId,url:variantUrl,playlist:info});
              variants.push({id:variantId,ready,resolution:/^\d{1,5}x\d{1,5}$/.test(rendition.resolution||'')?rendition.resolution:null,bandwidth:rendition.bandwidth,
                segments:info?.segments??null,encryption:info?.encryption||'unknown',
                container:info?.container||'unknown'});
            }
            hls={...hls,variants};
          }else try{validateVod(hls);renditions=[{id:null,url:row.url,playlist:hls}];}catch{}
        }catch(error){note=String(error?.code||'E_HLS_METADATA_UNAVAILABLE');}
        finally{clearTimeout(timer);}
      }
      await recheck(target,assertCurrent,assertInstalled);
      if(ticket!==generation)throw fail('E_MEDIA_STALE','检测已被新操作取代');
      const downloadable=row.allowed&&['mp4','webm'].includes(row.format)||renditions.length>0;
      entry.renditions=renditions;
      if(!reason&&!downloadable)reason=row.format==='hls'?'hls-detected-only':'unsupported';
      fresh.set(id,entry);
      candidates.push({id,format:row.format,mode:downloadable?'ready':'detected_only',
        reason,note,hls:hls?{kind:hls.kind,encryption:hls.encryption,
          segments:hls.segments,container:hls.container,vod:hls.vod,
          audio:hls.audio.map(({group,language,name,external})=>({group,language,name,external})),
          variants:hls.variants,truncated:hls.truncated}:null});
    }
    context=target;cache=fresh;
    return {state:candidates.length?'available':'no-video',partial,candidates};
  }
  async function start(payload,assertCurrent,assertInstalled){
    if(!isPlain(payload)||Object.keys(payload).some(x=>!['candidateId','variantId'].includes(x))||
       typeof payload.candidateId!=='string'||payload.variantId!==undefined&&typeof payload.variantId!=='string')
      throw fail('E_SCHEMA','必须选择检测到的媒体');
    // A Stop during an asynchronous admission must prevent any future download call.
    const preflightTicket=generation;
    await ensure(assertCurrent,assertInstalled);
    refuseUnresolved();
    if(preflightTicket!==generation)throw fail('E_MEDIA_STOPPED','下载已停止，请重新检测');
    const selected=cache.get(payload.candidateId);
    if(!selected||!context||!sameDocument(context,selected.target))
      throw fail('E_MEDIA_STALE','媒体候选已失效，请重新检测');
    const rendition=selected.renditions?.find(x=>x.id===(payload.variantId??null));
    if(!selected.allowed||!['mp4','webm'].includes(selected.format)&&!rendition)
      throw fail('E_MEDIA_UNSUPPORTED','请选择已获来源权限的完整非加密 VOD');
    if(task&&!['complete','complete_unverified','interrupted','cancelled'].includes(task.state))
      throw fail('E_MEDIA_BUSY','已有下载任务，请先停止或完成');
    if(!api?.downloads?.download||!api?.downloads?.search||!api?.downloads?.cancel)
      throw fail('E_MEDIA_UNAVAILABLE','Chrome 原生下载能力不可用');
    const target=currentPageTarget.capture();
    if(!sameDocument(target,selected.target))
      throw fail('E_DOCUMENT_STALE','网页已变化，请重新检测');
    const row={taskId:uuid(),target,downloadId:null,stopRequested:false,abort:new AbortController(),
      state:'starting',cancelUnknown:false,blobUrl:null,nativeUnknown:false};
    task=row;cache.delete(payload.candidateId);const ticket=generation;
    try{await recheck(target,assertCurrent,assertInstalled);}
    catch(error){
      row.state='interrupted';row.stopRequested=true;
      throw error;
    }
    if(ticket!==generation||task!==row||row.stopRequested){
      row.state='cancelled';throw fail('E_MEDIA_STALE','下载启动前网页或工具已变化');
    }
    if(rendition){
      const alive=async url=>{
        if(ticket!==generation||task!==row||row.stopRequested)throw mediaError('E_MEDIA_STOPPED');
        await recheck(target,assertCurrent,assertInstalled);
        const origin=new URL(publicMediaUrl(url));
        if(!await api.permissions.contains({origins:[origin.protocol+'//'+origin.hostname+'/*']}))throw mediaError('E_MEDIA_PERMISSION');
        if(ticket!==generation||task!==row||row.stopRequested)throw mediaError('E_MEDIA_STOPPED');
      };
      row.state='segments';
      row.work=(async()=>{
        try{
          const result=await downloadHlsVod(rendition.url,rendition.playlist,{
            authorize:alive,fetcher,signal:row.abort.signal,onProgress:value=>{
              if(task===row&&!row.stopRequested){row.progress=value;row.state=value.phase;}
            }
          });
          await alive(rendition.url);
          row.integrity={segments:result.segments,bytes:result.bytes.length,sha256:result.sha256,
            duration:result.duration,format:result.format};
          row.blobUrl=URL.createObjectURL(new Blob([result.bytes],{type:result.mime}));
          await alive(rendition.url);row.state='saving';
          let id;
          nativeSaves.add(row);
          try{id=await api.downloads.download({url:row.blobUrl,
            filename:safeFilename(result.format,clock),saveAs:false,conflictAction:'uniquify'});}
          catch{row.nativeUnknown=true;row.state='unknown';row.error='E_OUTCOME_UNKNOWN';return;}
          if(!Number.isInteger(id)||id<0){row.nativeUnknown=true;row.state='unknown';row.error='E_OUTCOME_UNKNOWN';return;}
          row.downloadId=id;watchNative(row);
          // A late native receipt must be consumed even after Stop/uninstall.
          try{await alive(rendition.url);}catch{row.state='cancel_requested';await cancel(row);return;}
          row.state='started';
        }catch(error){
          row.abort.abort();row.state=row.stopRequested?'cancelled':'interrupted';
          row.error=/^E_[A-Z_]+$/.test(error?.code||'')?error.code:'E_MEDIA_STREAM';
          if(!nativeSaves.has(row))releaseBlob(row);
        }
      })();
      return {taskId:row.taskId,state:'segments',segmentsTotal:rendition.playlist.segments};
    }
    let downloadId;
    nativeSaves.add(row);
    try{
      downloadId=await api.downloads.download({
        url:selected.url,filename:safeFilename(selected.format,clock),
        saveAs:false,conflictAction:'uniquify'
      });
    }catch{
      row.nativeUnknown=true;row.state='unknown';
      throw fail('E_OUTCOME_UNKNOWN','Chrome 下载回执未知，请检查下载列表，不可自动重试');
    }
    if(!Number.isInteger(downloadId)||downloadId<0){
      row.nativeUnknown=true;row.state='unknown';
      throw fail('E_OUTCOME_UNKNOWN','Chrome 下载 ID 无法核对，不可自动重试');
    }
    row.downloadId=downloadId;watchNative(row);
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
    const row=task;
    await ensure(assertCurrent,assertInstalled);
    if(task!==row)throw fail('E_MEDIA_STALE','任务已失效');
    await recheck(row.target,assertCurrent,assertInstalled);
    if(task!==row)throw fail('E_MEDIA_STALE','任务已失效');
    if(!Number.isInteger(row.downloadId))
      return {taskId:row.taskId,...row.progress,state:row.state,error:row.error||null,playbackVerified:false};
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
    if(terminal.has(row.state))settledNative(row);
    return {taskId:row.taskId,downloadId:row.downloadId,state:row.state,
      bytesReceived:bytes,totalBytes:total,
      filePresent:data.exists===true,playbackVerified:false,stream:row.integrity||null,
      error:row.state==='interrupted'?String(data.error||'E_DOWNLOAD_INTERRUPTED').slice(0,80):null};
  }
  async function stop(payload,assertCurrent){
    if(!isPlain(payload)||Object.keys(payload).some(x=>x!=='taskId')||
      payload.taskId!==undefined&&typeof payload.taskId!=='string')
      throw fail('E_SCHEMA','停止参数无效');
    assertCurrent();
    if(payload.taskId!==undefined&&task?.taskId!==payload.taskId)
      throw fail('E_MEDIA_TASK','下载任务已变化');
    // Invalidate the start's preflight even when no taskId has been returned yet.
    generation++;scanAbort?.abort();cache.clear();context=null;
    if(!task){
      return {taskId:null,state:nativeSaves.size?'unknown':'cancel_requested',cancelUnknown:nativeSaves.size>0};
    }
    const row=task;row.stopRequested=true;
    if(!['complete','complete_unverified','interrupted','cancelled'].includes(row.state)){
      if(row.state!=='unknown')row.state='cancel_requested';await cancel(row);
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
