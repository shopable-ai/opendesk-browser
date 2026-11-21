// One HTTP adapter for the existing static market and a future Payload root
// endpoint. It serves stored signed bytes, never CMS query results or drafts.
import {open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {verifySignedUpdateIndex,UPDATE_INDEX_PATH,MAX_UPDATE_INDEX_BYTES} from '../src/marketplace/update-index.js';

export {UPDATE_INDEX_PATH};
export const MARKET_INDEX_FILE=UPDATE_INDEX_PATH.slice(1);

export async function readMarketSnapshotFile(path,{limit=MAX_UPDATE_INDEX_BYTES}={}){
  const file=await open(path,'r');
  try{
    const info=await file.stat();
    if(!info.isFile()||info.size<1||info.size>limit)throw Error('Invalid market snapshot size');
    // One bounded read also catches an input which grows after stat().
    const bytes=Buffer.alloc(Math.min(info.size+1,limit+1));
    let length=0;
    while(length<bytes.length){
      const next=await file.read(bytes,length,bytes.length-length,length);
      if(!next.bytesRead)break;
      length+=next.bytesRead;
    }
    if(length!==info.size)throw Error('Market snapshot changed during read');
    return bytes.subarray(0,length);
  }finally{await file.close();}
}

function bounded(work,milliseconds){
  let timer;
  return Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(Error('Market snapshot deadline exceeded')),milliseconds);
  })]).finally(()=>clearTimeout(timer));
}
function corsHeaders(request,allowOrigins){
  const headers=new Headers({'Vary':'Origin','X-Content-Type-Options':'nosniff'});
  const origin=request.headers.get('origin');
  if(origin&&allowOrigins.includes(origin)){
    headers.set('Access-Control-Allow-Origin',origin);
    headers.set('Access-Control-Expose-Headers','ETag, Retry-After');
    if(request.method==='OPTIONS'){
      headers.set('Access-Control-Allow-Methods','GET, HEAD, OPTIONS');
      headers.set('Access-Control-Allow-Headers','If-None-Match');
      headers.set('Vary','Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
    }
  }
  return headers;
}
function errorResponse(status,code,message,headers,method,retryAfter){
  headers.set('Content-Type','application/json; charset=utf-8');
  headers.set('Cache-Control','no-store');
  if(retryAfter)headers.set('Retry-After',String(retryAfter));
  const bytes=JSON.stringify({error:{code,message}});
  return new Response(method==='HEAD'?null:bytes,{status,headers});
}

export function createMarketIndexResponder({readSnapshot,publicKeys,sourceId='opendesk-official',
  now=Date.now,allowOrigins=[],rateLimit=null,timeoutMs=5000}={}){
  if(!Array.isArray(allowOrigins)||allowOrigins.some(value=>typeof value!=='string'||!value||value==='*'))
    throw Error('Market index CORS requires explicit origins');
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>5000)throw Error('Invalid market index deadline');
  return async request=>{
    const url=new URL(request.url);
    // Own the API prefix (including invalid /index/), so it cannot become HTML
    // fallback or an implicit redirect in the existing static server.
    if(!url.pathname.startsWith('/api/market/v1/'))return null;
    const headers=corsHeaders(request,allowOrigins);
    if(url.pathname!==UPDATE_INDEX_PATH)
      return errorResponse(404,'CHANNEL_NOT_FOUND','Unknown market channel or index route.',headers,request.method);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(!['GET','HEAD'].includes(request.method)){
      headers.set('Allow','GET, HEAD, OPTIONS');
      return errorResponse(405,'BAD_REQUEST','Method not allowed.',headers,request.method);
    }
    try{
      return await bounded(async()=>{
        if(rateLimit){
          const limited=await rateLimit(request);
          if(limited){
            const retry=Number.isSafeInteger(limited.retryAfter)&&limited.retryAfter>0?Math.min(limited.retryAfter,3600):60;
            return errorResponse(429,'RATE_LIMITED','Market index rate limit exceeded.',headers,request.method,retry);
          }
        }
        if(typeof readSnapshot!=='function')throw Error('Snapshot is not configured');
        const bytes=await readSnapshot();
        if(!(bytes instanceof Uint8Array)||bytes.byteLength<1||bytes.byteLength>MAX_UPDATE_INDEX_BYTES)
          throw Error('Invalid stored snapshot bytes');
        // Verify on every response, including conditional requests. ETag is
        // only a byte cache validator and never extends signed validity.
        const current=typeof now==='function'?now():now;
        const verified=await verifySignedUpdateIndex(bytes,{sourceId,channel:'stable',publicKeys,now:current});
        if(Date.parse(verified.payload.expiresAt)<=(typeof now==='function'?now():now))throw Error('Snapshot expired while verifying');
        const etag='"'+createHash('sha256').update(bytes).digest('hex')+'"';
        headers.set('Content-Type','application/json; charset=utf-8');
        headers.set('Cache-Control','public, max-age=0, must-revalidate');
        headers.set('ETag',etag);
        const matches=(request.headers.get('if-none-match')||'').split(',').some(value=>value.trim()===etag||value.trim()==='W/'+etag||value.trim()==='*');
        if(matches)return new Response(null,{status:304,headers});
        headers.set('Content-Length',String(bytes.byteLength));
        return new Response(request.method==='HEAD'?null:bytes,{status:200,headers});
      },timeoutMs);
    }catch{
      return errorResponse(503,'INDEX_UNAVAILABLE','A complete valid signed market snapshot is not available.',headers,request.method,30);
    }
  };
}
