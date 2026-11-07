// Explicit process-local CONNECT transport. Never discovers proxy settings,
// changes global agents, retries, refreshes auth or follows redirects.
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';

const TARGET = 'https://chatgpt.com/backend-api/wham/usage';
export function createLoopbackProxyRequest(proxyUrl) {
  let proxy;
  try { proxy = new URL(proxyUrl); } catch { throw Error('E_PROXY_CONFIG'); }
  if (proxy.protocol !== 'http:' || proxy.hostname !== '127.0.0.1' || !proxy.port ||
      proxy.username || proxy.password || proxy.pathname !== '/' || proxy.search || proxy.hash)
    throw Error('E_PROXY_CONFIG');
  return (url, {headers, method, timeoutMs}) => new Promise((resolve, reject) => {
    if (url !== TARGET || method !== 'GET' || !Number.isInteger(timeoutMs) || timeoutMs<1 || timeoutMs>10000)
      return reject(Error('E_TRANSPORT_TARGET'));
    let tunnel, secure, upstream, settled=false;
    const agent = new https.Agent({keepAlive:false, maxSockets:1});
    const cleanup = () => { clearTimeout(timer); tunnel?.destroy(); secure?.destroy(); agent.destroy(); };
    const fail = () => { cleanup(); connect.destroy(); upstream?.destroy(); if (!settled) {settled=true;reject(Error('E_PROXY_TRANSPORT'));} };
    const connect = http.request({hostname:'127.0.0.1',port:Number(proxy.port),method:'CONNECT',
      path:'chatgpt.com:443',agent:false,headers:{host:'chatgpt.com:443'},maxHeaderSize:16384});
    const timer = setTimeout(fail,timeoutMs);
    connect.once('error',fail);
    connect.once('response',fail);
    connect.once('connect',(res,socket,head)=>{
      tunnel=socket;
      if(res.statusCode!==200 || head.length) return fail();
      socket.once('error',fail);
      agent.createConnection = () => {
        secure=tls.connect({socket,servername:'chatgpt.com',rejectUnauthorized:true});
        secure.once('error',fail);
        return secure;
      };
      upstream=https.request(TARGET,{headers,method,agent,maxHeaderSize:16384},res=>{
        settled=true;
        res.once('close',cleanup);
        resolve({status:res.statusCode,headers:res.headers,body:res});
      });
      upstream.once('error',fail);
      upstream.end();
    });
    connect.end();
  });
}
