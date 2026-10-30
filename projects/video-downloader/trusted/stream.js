// Fixed first-party transport. No API in this file is exposed to the sandbox.
import {parseHlsPlaylist} from './hls.js';
import {remuxTsToMp4} from './remux.js';
export const STREAM_LIMITS=Object.freeze({manifestBytes:262144,segmentBytes:8388608,
  totalBytes:134217728,concurrency:3,timeoutMs:15000,maxDuration:1800});
export const mediaError=(code)=>Object.assign(new Error(code),{code});
export function publicMediaUrl(value,base){
  if(typeof value!=='string'||!value||value.length>4096||/[\\\x00-\x20\x7f]/.test(value)||/%(?:00|0a|0d|2f|5c)/i.test(value))
    throw mediaError('E_MEDIA_URL');
  let u;try{u=new URL(value,base);}catch{throw mediaError('E_MEDIA_URL');}
  const host=u.hostname.replace(/^\[|\]$/g,'').toLowerCase();
  // Block literals (including IPv6/mapped IPv4), local names and ambiguous DNS
  // forms. Chrome still enforces the actual site grant; DNS rebinding is not
  // claimed to be detected by this URL-only browser boundary.
  if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.hash||
     u.port||host.includes(':')||/^\d+(?:\.\d+)*$/.test(host)||
     !host.includes('.')||host.endsWith('.')||
     /(?:^|\.)(?:localhost|local|internal|test|invalid|onion)$/.test(host))
    throw mediaError('E_MEDIA_ORIGIN');
  return u.href;
}
export async function readMediaBytes(url,{fetcher=globalThis.fetch,signal,authorize,
  maxBytes=STREAM_LIMITS.segmentBytes,timeoutMs=STREAM_LIMITS.timeoutMs,onBytes=()=>{},onResponse=()=>{},manifest=false}={}){
  url=publicMediaUrl(url);
  if(typeof authorize!=='function')throw mediaError('E_MEDIA_PERMISSION');
  signal?.throwIfAborted();await authorize(url);signal?.throwIfAborted();
  const abort=new AbortController();
  const stop=()=>abort.abort(signal.reason);
  signal?.addEventListener('abort',stop,{once:true});
  if(signal?.aborted)stop();
  const timer=setTimeout(()=>abort.abort(mediaError('E_MEDIA_TIMEOUT')),timeoutMs);
  let reader,complete=false;
  try{
    const response=await fetcher(url,{credentials:'omit',redirect:'error',cache:'no-store',
      referrerPolicy:'no-referrer',signal:abort.signal});
    abort.signal.throwIfAborted();await authorize(url);abort.signal.throwIfAborted();
    if(response?.status!==200||response.redirected||response.url&&response.url!==url)
      throw mediaError(manifest?'E_HLS_HTTP':'E_MEDIA_HTTP');
    const encoding=response.headers?.get('content-encoding');
    const rawLength=response.headers?.get('content-length');
    const length=rawLength===null||rawLength===undefined?null:Number(rawLength);
    if(length!==null&&(!Number.isSafeInteger(length)||length<=0||length>maxBytes))throw mediaError('E_MEDIA_SIZE');
    const mime=(response.headers?.get('content-type')||'').toLowerCase();
    if(/(?:text\/html|application\/(?:json|problem\+json))/.test(mime))throw mediaError('E_MEDIA_CONTENT');
    onResponse({status:response.status,contentLength:length,mime:mime.slice(0,100)});
    if(!response.body?.getReader)throw mediaError('E_MEDIA_BODY');
    reader=response.body.getReader();const parts=[];let size=0;
    for(;;){
      abort.signal.throwIfAborted();
      // Race even a custom reader against abort. A late body can never be saved.
      const next=await new Promise((resolve,reject)=>{
        const cancel=()=>reject(abort.signal.reason||mediaError('E_MEDIA_STOPPED'));
        abort.signal.addEventListener('abort',cancel,{once:true});
        if(abort.signal.aborted){cancel();return;}
        reader.read().then(resolve,reject).finally(()=>abort.signal.removeEventListener('abort',cancel));
      });
      if(next.done)break;
      if(!(next.value instanceof Uint8Array))throw mediaError('E_MEDIA_BODY');
      size+=next.value.byteLength;
      if(size>maxBytes)throw mediaError('E_MEDIA_SIZE');
      onBytes(next.value.byteLength);parts.push(next.value);
    }
    abort.signal.throwIfAborted();await authorize(url);abort.signal.throwIfAborted();
    if(!size||length!==null&&(!encoding||encoding==='identity')&&length!==size)
      throw mediaError('E_MEDIA_TRUNCATED');
    const output=new Uint8Array(size);let offset=0;
    for(const part of parts){output.set(part,offset);offset+=part.byteLength;}
    complete=true;return output;
  }catch(error){
    // Never leak a signed URL from native fetch error messages.
    if(abort.signal.aborted)throw mediaError(signal?.aborted?'E_MEDIA_STOPPED':'E_MEDIA_TIMEOUT');
    throw mediaError(/^E_[A-Z_]+$/.test(error?.code||'')?error.code:'E_MEDIA_NETWORK');
  }finally{
    clearTimeout(timer);signal?.removeEventListener('abort',stop);
    if(!complete&&reader)void reader.cancel().catch(()=>{});
    try{reader?.releaseLock();}catch{}
  }
}
export async function readHls(url,options){
  const bytes=await readMediaBytes(url,{...options,maxBytes:STREAM_LIMITS.manifestBytes,manifest:true});
  try{return parseHlsPlaylist(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch(error){throw mediaError(/^E_HLS_[A-Z_]+$/.test(error.message)?error.message:'E_HLS_INVALID');}
}
export function validateVod(playlist){
  if(playlist.kind!=='media'||!playlist.vod||!playlist.segments||
    playlist.encryption!=='clear'||playlist.unsupported.length||playlist.duration>STREAM_LIMITS.maxDuration)
    throw mediaError('E_HLS_UNSUPPORTED');
  return playlist;
}
export function validateTs(bytes){
  if(bytes.length<188||bytes.length%188!==0)throw mediaError('E_MEDIA_TS');
  for(let offset=0;offset<bytes.length;offset+=188){
    if(bytes[offset]!==0x47||bytes[offset+1]&0x80||bytes[offset+3]&0xc0)
      throw mediaError('E_MEDIA_TS');
  }
}
export function mp4Boxes(bytes){
  const boxes=[];let offset=0;const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  while(offset<bytes.length){
    if(bytes.length-offset<8)throw mediaError('E_MEDIA_MP4');
    const size=view.getUint32(offset),type=String.fromCharCode(...bytes.subarray(offset+4,offset+8));
    // Large/zero-sized boxes are unnecessary in the bounded small VOD slice.
    if(size<8||offset+size>bytes.length)throw mediaError('E_MEDIA_MP4');
    boxes.push(type);offset+=size;
  }
  return boxes;
}
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
export async function downloadHlsVod(url,playlist,{signal,authorize,fetcher=globalThis.fetch,
  onProgress=()=>{},limits={}}={}){
  validateVod(playlist);url=publicMediaUrl(url);
  // Callers may lower budgets in tests; they cannot raise the shipped bounds.
  const budget={...STREAM_LIMITS};
  for(const key of ['segmentBytes','totalBytes','concurrency','timeoutMs']){
    if(limits[key]!==undefined){
      if(!Number.isSafeInteger(limits[key])||limits[key]<1||limits[key]>budget[key])throw mediaError('E_MEDIA_LIMIT');
      budget[key]=limits[key];
    }
  }
  const controller=new AbortController(),abort=()=>controller.abort();
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  let total=0,completed=0,index=0,firstError=null,init=null;
  const parts=new Array(playlist.segments),integrity=new Array(playlist.segments);
  const progress=()=>onProgress({phase:'segments',segmentsCompleted:completed,
    segmentsTotal:parts.length,bytesReceived:total,totalBytes:0});
  const sources=new Map([[new URL(url).origin,url]]);
  const authorizeSources=async()=>{for(const source of sources.values()){
    controller.signal.throwIfAborted();await authorize(source);controller.signal.throwIfAborted();
  }};
  const options={fetcher,authorize,signal:controller.signal,maxBytes:budget.segmentBytes,timeoutMs:budget.timeoutMs,
    onBytes:count=>{total+=count;if(total>budget.totalBytes)throw mediaError('E_MEDIA_TOTAL_SIZE');progress();}};
  try{
  for(const uri of [playlist.init,...playlist.segmentList.map(s=>s.uri)].filter(Boolean)){
    const source=publicMediaUrl(uri,url);sources.set(new URL(source).origin,source);
  }
    if(playlist.container==='fmp4'){
      if(!playlist.init)throw mediaError('E_MEDIA_MP4');
      init=await readMediaBytes(publicMediaUrl(playlist.init,url),options);
      const boxes=mp4Boxes(init);
      if(!boxes.includes('ftyp')||!boxes.includes('moov'))throw mediaError('E_MEDIA_MP4');
    }
    const workers=Array.from({length:Math.min(budget.concurrency,parts.length)},async()=>{
      try{
        for(;;){
          controller.signal.throwIfAborted();const i=index++;if(i>=parts.length)return;
          const segment=playlist.segmentList[i],source=publicMediaUrl(segment.uri,url);
          let response;
          const bytes=await readMediaBytes(source,{...options,onResponse:value=>{response=value;}});
          if(playlist.container==='ts')validateTs(bytes);
          else{
            const boxes=mp4Boxes(bytes);
            if(!boxes.includes('moof')||!boxes.includes('mdat')||boxes.includes('moov'))throw mediaError('E_MEDIA_MP4');
          }
          const digest=await sha(bytes);controller.signal.throwIfAborted();
          integrity[i]={index:i,bytes:bytes.length,sha256:digest,duration:segment.duration,...response};
          parts[i]=bytes;completed++;progress();
        }
      }catch(error){firstError??=error;controller.abort();}
    });
    await Promise.all(workers);
    if(firstError)throw firstError;
    controller.signal.throwIfAborted();
    if(parts.some(row=>!row)||completed!==playlist.segments)throw mediaError('E_MEDIA_INCOMPLETE');
    let output;
    if(playlist.container==='ts'){
      output=await remuxTsToMp4(parts,{signal:controller.signal,codecs:playlist.codecs,
        assertAuthorized:authorizeSources,onProgress:value=>onProgress({phase:'remuxing',
          segmentsCompleted:completed,segmentsTotal:completed,bytesReceived:total,
          remuxBytes:value.processedBytes,remuxTotalBytes:value.totalBytes})});
    }else{
      onProgress({phase:'assembling',segmentsCompleted:completed,segmentsTotal:completed,bytesReceived:total,totalBytes:total});
      output=new Uint8Array(total);let offset=0;
      if(init){output.set(init,offset);offset+=init.length;}
      for(const part of parts){output.set(part,offset);offset+=part.length;}
    }
    controller.signal.throwIfAborted();await authorizeSources();controller.signal.throwIfAborted();
    return {bytes:output,format:'mp4',mime:'video/mp4',
      segments:completed,duration:playlist.duration,integrity,sha256:await sha(output),playbackVerified:false};
  }catch(error){throw mediaError(/^E_[A-Z_]+$/.test(error?.code||'')?error.code:'E_MEDIA_STOPPED');}
  finally{controller.abort();signal?.removeEventListener('abort',abort);parts.fill(null);}
}
