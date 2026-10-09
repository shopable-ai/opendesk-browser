// The ONLY production transport for build-time HTTPS ESM downloads.
// DNS is resolved once, ALL answers must be public, and the chosen address is
// pinned to a fresh TLS connection with the original hostname/SNI validation.
// Do not replace this with fetch(url): fetch follows a second DNS resolution.
import {lookup as systemLookup} from 'node:dns/promises';
import {request as systemHttpsRequest} from 'node:https';
import {BlockList,isIP} from 'node:net';
import {checkServerIdentity} from 'node:tls';

const MAX_BYTES=128*1024;
const MAX_CONNECT_ATTEMPTS=4;
const CONNECT_FAILURES=new Set(['ECONNREFUSED','ENETUNREACH','EHOSTUNREACH']);
const BLOCKED_V4=[
  ['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],
  ['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],
  ['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],
  ['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],
  ['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]
];
const V4=new BlockList();
for(const [net,bits] of BLOCKED_V4)V4.addSubnet(net,bits,'ipv4');
const V6_GLOBAL=new BlockList();
V6_GLOBAL.addSubnet('2000::',3,'ipv6');
const V6_EXCLUDED=new BlockList();
for(const [net,bits] of [
  ['2001::',23], // IETF/special addresses, including Teredo and ORCHID
  ['2001:db8::',32], // documentation
  ['2002::',16], // 6to4, can tunnel private IPv4
  ['3fff::',20] // documentation
])V6_EXCLUDED.addSubnet(net,bits,'ipv6');

const remoteError=(code,message)=>Object.assign(new Error(message),{code,phase:'remote'});

export function isPublicRemoteAddress(address){
  if(typeof address!=='string'||address.includes('%'))return false;
  const family=isIP(address);
  if(family===4)return !V4.check(address,'ipv4');
  if(family===6)return V6_GLOBAL.check(address,'ipv6')&&!V6_EXCLUDED.check(address,'ipv6');
  return false;
}

function within(promise,ms){
  let timer;
  return Promise.race([
    promise,
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(remoteError('E_REMOTE_TIMEOUT',
      'HTTPS ESM DNS lookup exceeded the deadline')),ms);})
  ]).finally(()=>clearTimeout(timer));
}

async function resolveRemoteAddresses(hostname,{lookup=systemLookup,timeoutMs=10000}={}){
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)
    throw remoteError('E_REMOTE_TIMEOUT','HTTPS ESM deadline must be between 1 and 10000 ms');
  let records;
  try{records=await within(Promise.resolve().then(()=>
    lookup(hostname,{all:true,verbatim:true,family:0,hints:0})),timeoutMs);}
  catch(error){
    if(error.code==='E_REMOTE_TIMEOUT')throw error;
    throw remoteError('E_REMOTE_DNS','Cannot resolve HTTPS ESM host: '+hostname);
  }
  if(!Array.isArray(records)||records.length===0||records.length>32||
    !records.every(row=>row&&isIP(row.address)===row.family&&
      (row.family===4||row.family===6)&&isPublicRemoteAddress(row.address)))
    throw remoteError('E_REMOTE_DNS','HTTPS ESM DNS returned a nonpublic, mixed or invalid address set: '+hostname);
  // Validate the ENTIRE set before deduplication or limiting attempts. Copy it
  // so later mutation of the resolver's array cannot change the verified pins.
  const unique=[],seen=new BlockList();
  for(const {address,family} of records){
    const kind=family===4?'ipv4':'ipv6';
    if(seen.check(address,kind))continue;
    seen.addAddress(address,kind);unique.push(Object.freeze({address,family}));
  }
  return Object.freeze(unique);
}

export async function resolveRemoteAddress(hostname,options={}){
  return (await resolveRemoteAddresses(hostname,options))[0];
}

// Dependency injection is reserved for deterministic tests; ordinary builds
// always call node:https with pinned DNS and TLS certificate verification.
export async function fetchPinnedRemote(url,{
  lookup=systemLookup,httpsRequest=systemHttpsRequest,timeoutMs=10000
}={}){
  const target=new URL(url);
  if(target.protocol!=='https:'||target.username||target.password||target.port||
    target.hash||isIP(target.hostname.replace(/^\[|\]$/g,'')))
    throw remoteError('E_REMOTE_URL','Pinned transport requires a canonical HTTPS DNS URL');
  const started=performance.now();
  const addresses=await resolveRemoteAddresses(target.hostname,{lookup,timeoutMs});
  const deadline=started+timeoutMs,candidates=addresses.slice(0,MAX_CONNECT_ATTEMPTS);
  let lastError;
  for(const pinned of candidates){
    try{return await fetchPinnedAddress(target,pinned,httpsRequest,deadline);}
    catch(error){
      if(error.code!=='E_REMOTE_FETCH'||!error.retryableConnect)throw error;
      lastError=error;
    }
  }
  throw lastError;
}

// Only pre-connect TCP failures may move to another member of the SAME DNS
// snapshot. Each attempt has a fresh single-IP socket and the common deadline;
// TLS, peer, timeout, HTTP and body errors are terminal, never retry signals.
async function fetchPinnedAddress(target,pinned,httpsRequest,deadline){
  const url=target.href,remaining=Math.ceil(deadline-performance.now());
  if(remaining<=0)throw remoteError('E_REMOTE_TIMEOUT','HTTPS ESM request deadline expired');
  const identity=new BlockList();
  identity.addAddress(pinned.address,pinned.family===4?'ipv4':'ipv6');
  const peerMatches=socket=>{
    const remote=socket?.remoteAddress,kind=isIP(remote);
    return Boolean(remote&&kind&&identity.check(remote,kind===4?'ipv4':'ipv6'));
  };
  const controller=new AbortController(),signal=controller.signal;
  return new Promise((resolve,reject)=>{
    let request,response,settled=false,tcpConnected=false;
    const timer=setTimeout(()=>stop(remoteError('E_REMOTE_TIMEOUT','HTTPS ESM request deadline expired')),remaining);
    const finish=(error,bytes)=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      if(error)reject(error.code?.startsWith('E_REMOTE_')?error:
        remoteError(signal.aborted?'E_REMOTE_TIMEOUT':'E_REMOTE_FETCH',
          'Cannot fetch pinned HTTPS ESM '+url+': '+error.message));
      else resolve(bytes);
    };
    const stop=error=>{
      if(settled)return;
      finish(error);
      controller.abort();
      response?.destroy();
      request?.destroy();
    };
    const verifyTLS=socket=>{
      if(!peerMatches(socket))return remoteError('E_REMOTE_PEER','HTTPS ESM TLS peer IP changed');
      if(socket.encrypted!==true||socket.authorized!==true)
        return remoteError('E_REMOTE_TLS','HTTPS ESM requires an authenticated TLS peer');
    };
    try{
      request=httpsRequest(target,{
        method:'GET',agent:false, // never reuse a pooled socket from a different lookup
        autoSelectFamily:false,family:pinned.family,signal,timeout:remaining,maxHeaderSize:8192,
        rejectUnauthorized:true,servername:target.hostname,
        checkServerIdentity:(_hostname,cert)=>checkServerIdentity(target.hostname,cert),
        headers:{accept:'text/javascript,application/javascript,*/*;q=0.3',
          'accept-encoding':'identity'},
        lookup:(hostname,options,callback)=>{
          if(hostname!==target.hostname)return callback(remoteError('E_REMOTE_DNS','Unexpected DNS hostname'));
          if(options?.all)return callback(null,[pinned]);
          callback(null,pinned.address,pinned.family);
        }
      },incoming=>{
        response=incoming;
        if(settled){response.destroy();return;}
        const tlsError=verifyTLS(response.socket);
        if(tlsError){
          stop(tlsError);
          return;
        }
        if(response.statusCode!==200){
          stop(remoteError('E_REMOTE_FETCH','Remote ESM must return HTTP 200 without redirects'));
          return;
        }
        const mime=response.headers['content-type'];
        if(typeof mime!=='string'||!/^(?:text\/javascript|application\/javascript|application\/ecmascript|text\/ecmascript|text\/plain)(?:\s*;|$)/i.test(mime)){
          stop(remoteError('E_REMOTE_MIME','Remote ESM has an unsupported Content-Type'));
          return;
        }
        const encoding=response.headers['content-encoding'];
        if(encoding&&encoding!=='identity'){
          stop(remoteError('E_REMOTE_MIME','Remote ESM must use uncompressed identity bytes'));
          return;
        }
        const length=response.headers['content-length'];
        if(length!==undefined&&(!/^\d+$/.test(String(length))||Number(length)>MAX_BYTES)){
          stop(remoteError('E_REMOTE_LIMIT','Remote ESM declares an invalid or oversized body'));
          return;
        }
        const chunks=[];let size=0;
        response.on('data',chunk=>{
          if(settled)return;
          size+=chunk.length;
          if(size>MAX_BYTES){
            stop(remoteError('E_REMOTE_LIMIT','Remote ESM exceeds 128 KiB'));
            return;
          }
          chunks.push(chunk);
        });
        response.once('end',()=>{
          if(settled)return;
          const tlsError=verifyTLS(response.socket);
          if(tlsError){stop(tlsError);return;}
          if(size>MAX_BYTES){finish(remoteError('E_REMOTE_LIMIT','Remote ESM exceeds 128 KiB'));return;}
          if(!size){finish(remoteError('E_REMOTE_LIMIT','Empty remote ESM is not allowed'));return;}
          if(length!==undefined&&Number(length)!==size){
            finish(remoteError('E_REMOTE_FETCH','Remote ESM Content-Length mismatch'));return;
          }
          finish(null,Buffer.concat(chunks,size));
        });
        response.once('error',stop);
        response.once('aborted',()=>stop(remoteError('E_REMOTE_FETCH','Remote ESM response aborted')));
        response.once('close',()=>{
          if(!settled)stop(remoteError('E_REMOTE_FETCH','Remote ESM response closed before completion'));
        });
      });
      request.once('socket',socket=>{
        if(socket.remoteAddress&&!socket.connecting)tcpConnected=true;
        socket.once('connect',()=>{
          tcpConnected=true;
          if(!peerMatches(socket))stop(remoteError('E_REMOTE_PEER','HTTPS ESM socket IP changed'));
        });
        socket.once('secureConnect',()=>{
          tcpConnected=true;
          const tlsError=verifyTLS(socket);
          if(tlsError)stop(tlsError);
        });
      });
      request.once('timeout',()=>stop(remoteError('E_REMOTE_TIMEOUT','HTTPS ESM request timed out')));
      request.once('error',error=>{
        if(!tcpConnected&&!response&&error?.syscall==='connect'&&CONNECT_FAILURES.has(error.code)){
          stop(Object.assign(remoteError('E_REMOTE_FETCH',
            'Cannot connect pinned HTTPS ESM '+url+' at '+pinned.address+': '+error.message),
          {retryableConnect:true,cause:error}));
        }else stop(error);
      });
      request.end();
    }catch(error){stop(error);}
  });
}
