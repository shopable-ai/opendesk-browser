// Independent local management session. The existing read API remains GET-only
// and its bearer secret never leaves this trusted process.
import {createServer} from 'node:http';
import {randomBytes, timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {startReadApi} from './read-api.mjs';

const headers = {'cache-control':'no-store','x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer', 'cross-origin-resource-policy':'same-origin',
  'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"};
const match = (a,b) => typeof a==='string' && Buffer.byteLength(a)===Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a),Buffer.from(b));
const reply=(res,status,data)=>{res.writeHead(status,{...headers,'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
// Provider attempts are business results, not evidence of HTTP success.
export const refreshHttpStatus = status => ({
  OK:200, AUTH_REQUIRED:424, IDENTITY_UNVERIFIED:422, RATE_LIMITED:429,
  SCHEMA_UNKNOWN:502, UNAVAILABLE:503
})[status] ?? 503;
async function input(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')) throw Error();
  let size=0;const chunks=[];
  for await(const part of req){size+=part.length;if(size>1024)throw Error();chunks.push(part);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
const pairingHTML = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>连接额度管理中心</title><body><h1>连接本机额度管理中心</h1><p id="status" role="status">正在建立本机会话…</p><a href="/">返回管理页</a><script src="/session.js" defer></script></body></html>';
const pairingJS = `(() => {
  const code = new URLSearchParams(location.hash.slice(1)).get('pair');
  history.replaceState(null, '', '/pair');
  if (!code) {document.querySelector('#status').textContent='请使用本机启动命令提供的完整连接链接。';return;}
  fetch('/session', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code})})
    .then(r=>{if(!r.ok)throw Error();location.replace('/');})
    .catch(()=>{document.querySelector('#status').textContent='连接链接已失效，请从本机启动终端重新连接。';});
})();`;

export async function startManagementServer({service,store,port=0,
  assetsDirectory=fileURLToPath(new URL('./web/dist/',import.meta.url)),clock=Date.now}={}) {
  if (!service || typeof service.query!=='function' || !Number.isInteger(port) || port<0 || port>65535)
    throw Error('E_MANAGEMENT_CONFIG');
  // Only these compiled assets are ever served; never filesystem/config routes.
  const assets = new Map();
  for (const [path,file,type] of [['/','index.html','text/html'],['/app.js','app.js','text/javascript'],['/app.css','app.css','text/css']])
    assets.set(path,{body:await readFile(join(assetsDirectory,file)),type});
  assets.set('/pair',{body:pairingHTML,type:'text/html'});
  assets.set('/session.js',{body:pairingJS,type:'text/javascript'});
  const reader = await startReadApi({store});
  let pairingCode=randomBytes(32).toString('hex');
  // Cookies are host-scoped, never port-scoped. A unique localhost subdomain
  // prevents this session being sent to unrelated numeric-loopback services.
  const hostname=`usage-${randomBytes(12).toString('hex')}.localhost`;
  const expires=clock()+5*60_000, session=randomBytes(32).toString('hex');
  let sessionExpires=0, busy=false;
  const server=createServer(async(req,res)=>{
    const origin=`http://${hostname}:${server.address()?.port}`;
    const cookieName=`od_usage_${server.address()?.port}`;
    if(req.headers.host!==new URL(origin).host)return reply(res,403,{error:'HOST_REJECTED'});
    if(req.headers.origin && req.headers.origin!==origin)return reply(res,403,{error:'ORIGIN_REJECTED'});
    if(req.headers['sec-fetch-site'] && !['same-origin','none'].includes(req.headers['sec-fetch-site']))
      return reply(res,403,{error:'SITE_REJECTED'});
    let url;
    try{url=new URL(req.url,origin);}catch{return reply(res,400,{error:'BAD_URL'});}
    if(url.origin!==origin || url.searchParams.has('token') || url.searchParams.has('secret'))
      return reply(res,400,{error:'BAD_URL'});
    try {
      if(req.method==='POST' && url.pathname==='/session') {
        if(req.headers.origin!==origin || url.search) return reply(res,403,{error:'ORIGIN_REQUIRED'});
        const body=await input(req);
        if(!pairingCode || clock()>expires || !body || Object.keys(body).join()!=='code' || !match(body.code,pairingCode))
          return reply(res,401,{error:'PAIRING_INVALID'});
        pairingCode=null;sessionExpires=clock()+8*3600_000;
        res.setHeader('set-cookie',`${cookieName}=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
        return reply(res,200,{connected:true});
      }
      if(req.method==='GET' && assets.has(url.pathname) && !url.search) {
        const asset=assets.get(url.pathname);
        res.writeHead(200,{...headers,'content-type':`${asset.type}; charset=utf-8`});res.end(asset.body);return;
      }
      const cookie=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${cookieName}=`))?.slice(cookieName.length+1);
      if(clock()>=sessionExpires || !match(cookie,session))return reply(res,401,{error:'SESSION_REQUIRED'});
      if(req.method==='GET' && /^\/api\/v1\/(accounts(?:\/[A-Za-z0-9_-]{3,48}(?:\/history)?)?|insights)$/.test(url.pathname)) {
        const response=await fetch(reader.url+url.pathname+url.search,{headers:{authorization:`Bearer ${reader.secret}`},redirect:'error',signal:AbortSignal.timeout(5000)});
        return reply(res,response.status,await response.json());
      }
      const refresh=/^\/api\/v1\/accounts\/([A-Za-z0-9_-]{3,48})\/refresh$/.exec(url.pathname);
      if(req.method==='POST' && refresh) {
        if(req.headers.origin!==origin || url.search)return reply(res,403,{error:'ORIGIN_REQUIRED'});
        const body=await input(req);
        if(!body || Array.isArray(body) || Object.keys(body).length)return reply(res,400,{error:'BAD_INPUT'});
        if(busy)return reply(res,409,{error:'REFRESH_IN_PROGRESS'});
        busy=true;
        try {
          const result=(await service.query({alias:refresh[1],operation:'refresh'})).results[0];
          if (!result?.account || result.account.alias !== refresh[1])
            return reply(res,result?.error==='E_ACCOUNT_UNKNOWN'?404:503,{error:'REFRESH_FAILED'});
          const observed = result.account.lastAttempt?.status;
          const valid = result.status === 'OK' && observed === 'OK';
          const status = valid ? 'OK' : observed && observed !== 'OK' ? observed : 'UNAVAILABLE';
          // Persisted, sanitized profile is included even on failure so the UI
          // can update lastAttempt without erasing lastSuccessAt or prior windows.
          return reply(res,refreshHttpStatus(status),{status,account:result.account,
            ...(valid ? {} : {error:'REFRESH_FAILED'})});
        }finally{busy=false;}
      }
      reply(res,404,{error:'NOT_FOUND'});
    }catch{reply(res,503,{error:'REQUEST_FAILED'});}
  });
  server.requestTimeout=15000;server.headersTimeout=5000;server.maxRequestsPerSocket=100;
  try {await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}
  catch(error){await reader.close();throw error;}
  return Object.freeze({url:`http://${hostname}:${server.address().port}/pair`,pairingCode,
    close:async()=>{await new Promise(resolve=>server.close(resolve));await reader.close();}});
}
