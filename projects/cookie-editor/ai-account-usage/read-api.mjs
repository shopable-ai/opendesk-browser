// Authenticated loopback JSON API for trusted local clients. Never receives
// provider Cookies or refresh input. No unauthenticated CORS or remote bind.
import {createServer} from 'node:http';
import {randomBytes, timingSafeEqual} from 'node:crypto';

const notCache = {'cache-control':'no-store','content-type':'application/json; charset=utf-8',
  'x-content-type-options':'nosniff','referrer-policy':'no-referrer',
  'content-security-policy':"default-src 'none'; frame-ancestors 'none'"};
const deny = (res,code,reason)=>{
  res.writeHead(code,notCache);
  res.end(JSON.stringify({error:reason}));
};
const secureMatch=(a,b)=>{
  if (typeof a!=='string' || Buffer.byteLength(a)!==Buffer.byteLength(b)) return false;
  return timingSafeEqual(Buffer.from(a),Buffer.from(b));
};

export async function startReadApi({store, port=0, secret=randomBytes(32).toString('hex')}={}) {
  if (!store || typeof store.accounts!=='function' || typeof store.history!=='function' ||
      typeof store.insights!=='function' || typeof secret!=='string' || secret.length < 32 ||
      !Number.isInteger(port) || port<0 || port>65535) throw new Error('E_API_CONFIG');
  const server=createServer(async(req,res)=>{
    // DNS rebinding defense: only numeric loopback Host and actual bound port.
    const actualPort=server.address()?.port;
    if (req.headers.host !== `127.0.0.1:${actualPort}`) return deny(res,403,'HOST_REJECTED');
    if (req.headers.origin && req.headers.origin !== `http://127.0.0.1:${actualPort}`)
      return deny(res,403,'ORIGIN_REJECTED');
    if (!secureMatch(req.headers.authorization?.replace(/^Bearer /,''),secret))
      return deny(res,401,'UNAUTHORIZED');
    if (req.method!=='GET') return deny(res,405,'READ_ONLY');
    let url;
    try {url=new URL(req.url,`http://127.0.0.1:${actualPort}`);}catch{return deny(res,400,'BAD_URL');}
    if (url.searchParams.has('token') || url.searchParams.has('secret'))
      return deny(res,400,'CREDENTIAL_IN_URL_REJECTED');
    try {
      let data;
      if (url.pathname==='/api/v1/accounts') data={accounts:await store.accounts()};
      else if (url.pathname==='/api/v1/insights') data={insights:await store.insights({
        cycles:url.searchParams.has('cycles')?Number(url.searchParams.get('cycles')):5,
        threshold:url.searchParams.has('threshold')?Number(url.searchParams.get('threshold')):80})};
      else if (/^\/api\/v1\/accounts\/[A-Za-z0-9_-]{3,48}$/.test(url.pathname)) {
        const alias=url.pathname.split('/').at(-1);
        const found=(await store.accounts()).find(x=>x.alias===alias);
        if (!found) return deny(res,404,'ACCOUNT_NOT_FOUND');
        data={account:found};
      } else {
        const match=/^\/api\/v1\/accounts\/([A-Za-z0-9_-]{3,48})\/history$/.exec(url.pathname);
        if (!match) return deny(res,404,'NOT_FOUND');
        data=await store.history(match[1],{
          limit:url.searchParams.has('limit')?Number(url.searchParams.get('limit')):100,
          windowKey:url.searchParams.get('windowKey')});
      }
      res.writeHead(200,notCache);
      res.end(JSON.stringify(data));
    } catch(error) {
      const known=error?.code==='E_ACCOUNT_UNKNOWN'?404:
        /^E_(LIMIT|WINDOW_KEY|INSIGHT_QUERY)$/.test(error?.code||'')?400:503;
      deny(res,known,known===404?'ACCOUNT_NOT_FOUND':known===400?'BAD_QUERY':'STORE_UNAVAILABLE');
    }
  });
  server.requestTimeout=5000;
  server.headersTimeout=5000;
  server.maxRequestsPerSocket=100;
  try {
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  } catch(error) {server.close();throw error;}
  return Object.freeze({url:`http://127.0.0.1:${server.address().port}`,secret,
    close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))});
}
