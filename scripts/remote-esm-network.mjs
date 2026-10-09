// The ONLY production transport for build-time HTTPS ESM downloads.
// DNS is resolved once, ALL answers must be public, and the chosen address is
// pinned to a fresh TLS connection with the original hostname/SNI validation.
// Do not replace this with fetch(url): fetch follows a second DNS resolution.
import {lookup as systemLookup} from 'node:dns/promises';
import {request as systemHttpsRequest} from 'node:https';
import {BlockList,isIP} from 'node:net';

const MAX_BYTES=128*1024;
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

export async function resolveRemoteAddress(hostname,{lookup=systemLookup,timeoutMs=10000}={}){
  let records;
  try{records=await within(Promise.resolve().then(()=>
    lookup(hostname,{all:true,verbatim:true})),timeoutMs);}
  catch(error){
    if(error.code==='E_REMOTE_TIMEOUT')throw error;
    throw remoteError('E_REMOTE_DNS','Cannot resolve HTTPS ESM host: '+hostname);
  }
  if(!Array.isArray(records)||records.length===0||records.length>32||
    !records.every(row=>row&&isIP(row.address)===row.family&&
      (row.family===4||row.family===6)&&isPublicRemoteAddress(row.address)))
    throw remoteError('E_REMOTE_DNS','HTTPS ESM DNS returned a nonpublic, mixed or invalid address set: '+hostname);
  return Object.freeze({address:records[0].address,family:records[0].family});
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
  const started=Date.now();
  const pinned=await resolveRemoteAddress(target.hostname,{lookup,timeoutMs});
  const remaining=timeoutMs-(Date.now()-started);
  if(remaining<=0)throw remoteError('E_REMOTE_TIMEOUT','HTTPS ESM request deadline expired');
  const identity=new BlockList();
  identity.addAddress(pinned.address,pinned.family===4?'ipv4':'ipv6');
  const peerMatches=socket=>{
    const remote=socket?.remoteAddress,kind=isIP(remote);
    return Boolean(remote&&kind&&identity.check(remote,kind===4?'ipv4':'ipv6'));
  };
  const signal=AbortSignal.timeout(remaining);
  return new Promise((resolve,reject)=>{
    let request,settled=false;
    const finish=(error,bytes)=>{
      if(settled)return;
      settled=true;
      if(error)reject(error.code?.startsWith('E_REMOTE_')?error:
        remoteError(signal.aborted?'E_REMOTE_TIMEOUT':'E_REMOTE_FETCH',
          'Cannot fetch pinned HTTPS ESM '+url+': '+error.message));
      else resolve(bytes);
    };
    try{
      request=httpsRequest(target,{
        method:'GET',agent:false, // never reuse a pooled socket from a different lookup
        autoSelectFamily:false,signal,timeout:remaining,maxHeaderSize:8192,
        headers:{accept:'text/javascript,application/javascript,*/*;q=0.3',
          'accept-encoding':'identity'},
        lookup:(hostname,options,callback)=>{
          if(hostname!==target.hostname)return callback(remoteError('E_REMOTE_DNS','Unexpected DNS hostname'));
          callback(null,pinned.address,pinned.family);
        }
        // Default Node TLS SNI / certificate hostname validation is mandatory.
      },response=>{
        if(!peerMatches(response.socket)){
          request.destroy(remoteError('E_REMOTE_PEER','HTTPS ESM connected to a different IP'));
          return;
        }
        if(response.statusCode!==200){
          request.destroy(remoteError('E_REMOTE_FETCH','Remote ESM must return HTTP 200 without redirects'));
          return;
        }
        const mime=response.headers['content-type'];
        if(typeof mime!=='string'||!/^(?:text\/javascript|application\/javascript|application\/ecmascript|text\/ecmascript|text\/plain)(?:\s*;|$)/i.test(mime)){
          request.destroy(remoteError('E_REMOTE_MIME','Remote ESM has an unsupported Content-Type'));
          return;
        }
        const encoding=response.headers['content-encoding'];
        if(encoding&&encoding!=='identity'){
          request.destroy(remoteError('E_REMOTE_MIME','Remote ESM must use uncompressed identity bytes'));
          return;
        }
        const length=response.headers['content-length'];
        if(length!==undefined&&(!/^\d+$/.test(String(length))||Number(length)>MAX_BYTES)){
          request.destroy(remoteError('E_REMOTE_LIMIT','Remote ESM declares an invalid or oversized body'));
          return;
        }
        const chunks=[];let size=0;
        response.on('data',chunk=>{
          size+=chunk.length;
          if(size>MAX_BYTES){
            finish(remoteError('E_REMOTE_LIMIT','Remote ESM exceeds 128 KiB'));
            request.destroy();
            return;
          }
          chunks.push(chunk);
        });
        response.once('end',()=>{
          if(settled)return;
          if(size>MAX_BYTES){finish(remoteError('E_REMOTE_LIMIT','Remote ESM exceeds 128 KiB'));return;}
          if(!size){finish(remoteError('E_REMOTE_LIMIT','Empty remote ESM is not allowed'));return;}
          if(length!==undefined&&Number(length)!==size){
            finish(remoteError('E_REMOTE_FETCH','Remote ESM Content-Length mismatch'));return;
          }
          finish(null,Buffer.concat(chunks,size));
        });
        response.once('error',finish);
        response.once('aborted',()=>finish(remoteError('E_REMOTE_FETCH','Remote ESM response aborted')));
      });
      request.once('socket',socket=>{
        socket.once('connect',()=>{
          if(!peerMatches(socket))request.destroy(remoteError('E_REMOTE_PEER','HTTPS ESM socket IP changed'));
        });
        socket.once('secureConnect',()=>{
          if(!peerMatches(socket))request.destroy(remoteError('E_REMOTE_PEER','HTTPS ESM TLS peer IP changed'));
        });
      });
      request.once('timeout',()=>request.destroy(remoteError('E_REMOTE_TIMEOUT','HTTPS ESM request timed out')));
      request.once('error',finish);
      request.end();
    }catch(error){finish(error);}
  });
}
