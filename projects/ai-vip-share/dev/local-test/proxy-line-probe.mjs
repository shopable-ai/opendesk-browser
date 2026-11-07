#!/usr/bin/env node
// Explicit LOCAL-ONLY proxy line probe: validates transport and HTTPS TLS.
// Not a Chrome test, NOT a commercial Provider. No proxy credentials accepted.
import net from 'node:net';
import tls from 'node:tls';
import {pathToFileURL} from 'node:url';

const fail=(code,message)=>Object.assign(new Error(message),{code});
const timeout=Number(process.env.PROXY_PROBE_TIMEOUT_MS||8000);
const MAX_BYTES=8192;
const validTarget=(host,port)=>typeof host==='string'&&host.length>0&&host.length<=253&&
  /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host)&&
  Number.isInteger(port)&&port>=1&&port<=65535;
function waitBytes(socket,predicate){
  return new Promise((resolve,reject)=>{
    let buffer=Buffer.alloc(0);
    const cleanup=()=>{socket.off('data',data);socket.off('error',error);socket.off('close',close);};
    const error=e=>{cleanup();reject(fail('E_PROXY_NETWORK',String(e?.code||e?.message||e)));};
    const close=()=>{cleanup();reject(fail('E_PROXY_EOF','Proxy closed during protocol handshake'));};
    const data=part=>{
      buffer=Buffer.concat([buffer,part]);
      if(buffer.length>MAX_BYTES){cleanup();reject(fail('E_PROXY_PROTOCOL','Proxy reply exceeded 8 KB'));return;}
      try{const accepted=predicate(buffer);if(accepted){cleanup();resolve(buffer);}}
      catch(e){cleanup();reject(e);}
    };
    socket.on('data',data);socket.on('error',error);socket.on('close',close);
  });
}
async function greeting(socket){
  socket.write(Buffer.from([5,1,0]));
  const first=await waitBytes(socket,b=>b.length>=2);
  if(first[0]!==5||first[1]!==0||first.length!==2)
    throw fail('E_PROXY_SOCKS_AUTH','SOCKS5 no-auth negotiation failed');
}
async function socksConnect(socket,target,port){
  await greeting(socket);
  const domain=Buffer.from(target,'ascii');
  socket.write(Buffer.concat([Buffer.from([5,1,0,3,domain.length]),domain,
    Buffer.from([(port>>>8)&255,port&255])]));
  const reply=await waitBytes(socket,b=>{
    if(b.length<5)return false;
    if(b[0]!==5||b[1]!==0||b[2]!==0)
      throw fail('E_PROXY_SOCKS_CONNECT','SOCKS5 CONNECT returned a non-success reply');
    const size=b[3]===1?4:b[3]===4?16:b[3]===3?b[4]+1:null;
    if(size===null)throw fail('E_PROXY_SOCKS_REPLY','Unsupported SOCKS5 reply address');
    return b.length>=4+size+2;
  });
  if(reply[1]!==0)throw fail('E_PROXY_SOCKS_CONNECT','SOCKS5 CONNECT failed');
}
async function httpConnect(socket,target,port){
  socket.write('CONNECT '+target+':'+port+' HTTP/1.1\r\nHost: '+target+':'+port+
    '\r\nProxy-Connection: keep-alive\r\n\r\n');
  const reply=await waitBytes(socket,b=>b.includes(Buffer.from('\r\n\r\n')));
  const header=reply.toString('ascii',0,reply.indexOf('\r\n\r\n')+4);
  if(!/^HTTP\/1\.[01] 200(?:\s|\r)/.test(header))
    throw fail('E_PROXY_HTTP_CONNECT','HTTP CONNECT did not return 200');
}
export async function openProxyTunnel({kind='socks5',proxyHost='127.0.0.1',
  proxyPort=7897,target='example.com',targetPort=443}={}){
  if(!['socks5','http'].includes(kind)||proxyHost!=='127.0.0.1'||
     !validTarget(target,targetPort)||!Number.isInteger(proxyPort)||proxyPort<1||proxyPort>65535)
    throw fail('E_PROXY_INPUT','Only explicit 127.0.0.1 local proxy and safe targets are allowed');
  const socket=net.connect({host:proxyHost,port:proxyPort});
  socket.setTimeout(timeout,()=>socket.destroy(fail('E_PROXY_TIMEOUT','Proxy handshake timed out')));
  try{
    await new Promise((resolve,reject)=>{
      socket.once('connect',resolve);
      socket.once('error',reject);
    });
    if(kind==='socks5')await socksConnect(socket,target,targetPort);
    else await httpConnect(socket,target,targetPort);
    socket.setTimeout(0);
    return socket;
  }catch(error){socket.destroy();throw error;}
}
export async function verifyProxyHttps(options={}){
  const tunnel=await openProxyTunnel(options),target=options.target||'example.com';
  let secure;
  try{
    secure=tls.connect({socket:tunnel,servername:target,rejectUnauthorized:true});
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(fail('E_PROXY_TLS_TIMEOUT','HTTPS TLS timed out')),timeout);
      secure.once('secureConnect',()=>{clearTimeout(timer);resolve();});
      secure.once('error',error=>{clearTimeout(timer);reject(error);});
    });
    if(!secure.authorized)throw fail('E_PROXY_TLS','TLS authority could not be verified');
    return {ok:true,level:'PROXY_HANDSHAKE_PLUS_TLS',protocol:options.kind||'socks5',
      proxy:'127.0.0.1:'+(options.proxyPort??7897),target,chromeNative:'NOT_TESTED'};
  }finally{secure?.destroy();tunnel.destroy();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const arg=process.argv.slice(2),kind=arg.includes('--http')?'http':'socks5';
  const target=arg.find(x=>x.startsWith('--target='))?.slice(9)||'example.com';
  verifyProxyHttps({kind,target}).then(row=>console.log(JSON.stringify(row)),
    error=>{console.error(JSON.stringify({ok:false,protocol:kind,code:error.code||'E_PROXY_LINE',
      message:String(error.message).slice(0,180),chromeNative:'NOT_TESTED'}));process.exitCode=1;});
}
