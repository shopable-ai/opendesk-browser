// Independent local management session. The existing read API remains GET-only
// and its bearer secret never leaves this trusted process.
import {createServer} from 'node:http';
import {randomBytes, randomUUID, timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {startReadApi} from './read-api.mjs';
import {ServiceBindingStore, bindingError, exact} from './service-binding-store.mjs';
import {createServiceBindingService} from './service-binding.mjs';

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
async function input(req, limit=1024) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')) throw bindingError('BAD_INPUT');
  let size=0;const chunks=[];
  for await(const part of req){size+=part.length;if(size>limit)throw bindingError('INPUT_SIZE',413);chunks.push(part);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw bindingError('BAD_INPUT');}
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
  assetsDirectory=fileURLToPath(new URL('./web/dist/',import.meta.url)),clock=Date.now,bindingStore=new ServiceBindingStore()}={}) {
  if (!service || typeof service.query!=='function' || !Number.isInteger(port) || port<0 || port>65535)
    throw Error('E_MANAGEMENT_CONFIG');
  // Only these compiled assets are ever served; never filesystem/config routes.
  const assets = new Map();
  for (const [path,file,type] of [['/','index.html','text/html'],['/app.js','app.js','text/javascript'],['/app.css','app.css','text/css']])
    assets.set(path,{body:await readFile(join(assetsDirectory,file)),type});
  assets.set('/pair',{body:pairingHTML,type:'text/html'});
  assets.set('/session.js',{body:pairingJS,type:'text/javascript'});
  const reader = await startReadApi({store});
  const bindings=createServiceBindingService({store:bindingStore,clock});
  const clients=new Map(),opens=new Map(),resourceSessions=new Map();
  let closed=false;
  const getClient=secret=>{
    const client=clients.get(secret);
    if(closed||!client||clock()>=client.expiresAt)throw bindingError('TRUSTED_SESSION_REQUIRED',403);
    return client.context;
  };
  // Shared by HTTP and the authenticated, process-only Native adapter.
  async function bindingRequest(secret,{method,path,body}) {
    const context=getClient(secret);
    if(clients.get(secret).receiptOnly && !(method==='GET'&&/^\/opendesk\/v1\/operations\/[A-Za-z0-9_-]+$/.test(path)))
      throw bindingError('TRUSTED_SESSION_REQUIRED',403);
    if(method==='GET' && (path==='/opendesk/v1/accounts'||/^\/opendesk\/v1\/accounts\/[A-Za-z0-9_-]+\/usage$/.test(path))) {
      await bindings.request(context,{method:'GET',path:'/opendesk/v1/self'});
      const accounts=(await store.accounts()).filter(a=>context.resourceIds.includes(a.alias));
      if(path==='/opendesk/v1/accounts')return {accounts:accounts.map(a=>({remoteAccountId:a.alias,providerKey:'codex',displayName:a.displayName,verificationState:'UNVERIFIED'}))};
      const account=accounts.find(a=>a.alias===path.split('/')[4]);
      if(!account)throw bindingError('NOT_FOUND',404);
      return {remoteAccountId:account.alias,providerKey:'codex',sourceMode:account.lastAttempt?.mode??null,observedAt:account.lastSuccessAt,status:account.lastAttempt?.status??'UNKNOWN',account};
    }
    return bindings.request(context,{method,path,body});
  }
  let pairingCode=randomBytes(32).toString('hex');
  // Cookies are host-scoped, never port-scoped. A unique localhost subdomain
  // prevents this session being sent to unrelated numeric-loopback services.
  const hostname=`usage-${randomBytes(12).toString('hex')}.localhost`;
  const expires=clock()+5*60_000, session=randomBytes(32).toString('hex');
  let clientPairing;
  async function issueClientPairing(){
    const resourceIds=(await store.accounts()).map(a=>a.alias);
    if(resourceIds.length>64||new Set(resourceIds).size!==resourceIds.length)throw bindingError('BAD_INPUT');
    clientPairing={code:randomBytes(32).toString('hex'),expiresAt:clock()+5*60_000,resourceIds};
    return {code:clientPairing.code,origin:`http://${hostname}:${server.address().port}`,expiresAt:clientPairing.expiresAt};
  }
  const httpClients=new Set();
  // Process/session-local receipts: reserve before any asynchronous mutation.
  // Never evict a live receipt to make room for a new pairing.
  const pairReceipts=new Map();
  function prunePairReceipts(){for(const [key,row] of pairReceipts)if(clock()>=row.expiresAt)pairReceipts.delete(key);}
  function pairIdentity(body){
    if(['connectionId','operationId'].some(k=>typeof body[k]!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(body[k]))||
      typeof body.receiptKey!=='string'||!/^[a-f0-9]{64}$/.test(body.receiptKey))throw bindingError('BAD_INPUT');
  }
  async function clientRequest(body){
    exact(body,['session','method','path','body']);
    if(typeof body.session!=='string'||!httpClients.has(body.session))throw bindingError('TRUSTED_SESSION_REQUIRED',403);
    getClient(body.session);
    const {session:secret,method,path}=body;
    const known=typeof path==='string'&&(
      method==='GET'&&(/^(?:\/opendesk\/v1\/(?:self|accounts|sync-policy)|\/opendesk\/v1\/accounts-page\/(?:[1-9]|[1-5][0-9]|6[0-3])|\/opendesk\/v1\/accounts\/[A-Za-z0-9_-]+\/usage|\/opendesk\/v1\/operations\/[A-Za-z0-9_-]+)$/.test(path))||
      method==='POST'&&['/opendesk/v1/devices','/opendesk/v1/bindings','/opendesk/v1/policy-acceptances','/opendesk/v1/management-open'].includes(path)||
      method==='DELETE'&&/^\/opendesk\/v1\/(bindings|devices)\/[A-Za-z0-9_-]+$/.test(path));
    if(!known||method==='GET'&&Object.hasOwn(body,'body'))throw bindingError('BAD_INPUT');
    if(method!=='GET'&&(!body.body||typeof body.body!=='object'||Array.isArray(body.body)))throw bindingError('BAD_INPUT');
    if(path==='/opendesk/v1/management-open'){
      exact(body.body,['bindingId','remoteAccountId']);
      if(Object.keys(body.body).length!==0&&!(Object.keys(body.body).length===2&&typeof body.body.bindingId==='string'&&typeof body.body.remoteAccountId==='string'))throw bindingError('BAD_INPUT');
      const self=await bindingRequest(secret,{method:'GET',path:'/opendesk/v1/self'});
      return serviceBinding.createManagementOpen(secret,{...body.body,serviceInstanceId:bindings.serviceInstanceId,deviceId:self.deviceId});
    }
    try{
      const page=method==='GET'&&/^\/opendesk\/v1\/accounts-page\/(?:[1-9]|[1-5][0-9]|6[0-3])$/.test(path);
      const result=await bindingRequest(secret,{method,path:page?'/opendesk/v1/accounts':path,body:body.body});
      if(method==='GET'&&(path==='/opendesk/v1/accounts'||page)){
        const offset=page?Number(path.split('/').at(-1)):0;
        return {accounts:result.accounts.slice(offset,offset+16),nextCursor:offset+16<result.accounts.length?offset+16:null};
      }
      if(method==='GET'&&path==='/opendesk/v1/sync-policy'){
        // The app already owns its confirmed binding metadata. Avoid returning
        // every local origin/alias again just to review the desired policy.
        const {bindings:unused,...summary}=result;return summary;
      }
      if(method==='GET'&&/^\/opendesk\/v1\/accounts\/[A-Za-z0-9_-]+\/usage$/.test(path)){
        return {...result,account:{windows:result.account.windows}};
      }
      if(method==='DELETE'&&path.startsWith('/opendesk/v1/devices/'))serviceBinding.retainLocalClientReceipts(secret);
      return result;
    }catch(error){
      // A failed DELETE may have committed. Never retry it or leave resource
      // access live while the original operation is reconciled through GET.
      if(method==='DELETE')serviceBinding.retainLocalClientReceipts(secret);
      throw error;
    }
  }
  let sessionExpires=0, busy=false;
  const server=createServer(async(req,res)=>{
    const origin=`http://${hostname}:${server.address()?.port}`;
    const cookieName=`od_usage_${server.address()?.port}`;
    if(req.headers.host!==new URL(origin).host)return reply(res,403,{error:'HOST_REJECTED'});
    let url;
    try{url=new URL(req.url,origin);}catch{return reply(res,400,{error:'BAD_URL'});}
    if(url.origin!==origin || url.searchParams.has('token') || url.searchParams.has('secret'))
      return reply(res,400,{error:'BAD_URL'});
    // Only these application endpoints accept a real extension Origin. Host
    // checking above also protects no-Origin privileged SDK HTTP requests.
    if(['/opendesk/client/pair','/opendesk/client/pair-result','/opendesk/client/request'].includes(url.pathname)){
      if(req.headers.origin&&req.headers.origin!==origin&&!/^chrome-extension:\/\/[a-p]{32}$/.test(req.headers.origin))return reply(res,403,{error:'ORIGIN_REJECTED'});
      if(!req.headers.origin&&req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))return reply(res,403,{error:'SITE_REJECTED'});
      if(req.url!==url.pathname)return reply(res,400,{error:'BAD_URL'});
      if(req.method!=='POST')return reply(res,405,{error:'METHOD_REJECTED'});
      try{
        const body=await input(req,16384);
        if(url.pathname==='/opendesk/client/request'){
          const result=await clientRequest(body);
          // Do not truncate policy/binding state or emit a response the SDK
          // cannot receive. Mutation outcomes still require receipt lookup.
          if(Buffer.byteLength(JSON.stringify(result))>8192)throw bindingError('RESPONSE_TOO_LARGE',413);
          return reply(res,200,result);
        }
        prunePairReceipts();
        if(url.pathname==='/opendesk/client/pair-result'){
          exact(body,['receiptKey','connectionId','operationId']);
          if(Object.keys(body).length!==3)throw bindingError('BAD_INPUT');
          pairIdentity(body);
          const row=pairReceipts.get(body.receiptKey);
          if(!row||row.connectionId!==body.connectionId||row.operationId!==body.operationId||!row.receipt)
            return reply(res,404,{error:'RESULT_UNKNOWN'});
          return reply(res,200,row.receipt);
        }
        exact(body,['code','connectionId','label','operationId','receiptKey']);
        if(Object.keys(body).length!==5||typeof body.code!=='string'||typeof body.label!=='string'||!body.label.length||body.label.length>80||/[\x00-\x1f]/.test(body.label))throw bindingError('BAD_INPUT');
        pairIdentity(body);
        if([...pairReceipts.values()].some(row=>row.receiptKey===body.receiptKey||row.operationId===body.operationId||row.connectionId===body.connectionId&&row.receipt?.status!=='REJECTED'))
          throw bindingError('PAIRING_CONFLICT',409);
        if(pairReceipts.size>=128)throw bindingError('PAIRING_CAPACITY',503);
        const row={receiptKey:body.receiptKey,connectionId:body.connectionId,operationId:body.operationId,expiresAt:clock()+15*60_000,receipt:null};
        pairReceipts.set(body.receiptKey,row);
        if(!clientPairing||clock()>=clientPairing.expiresAt||!match(body.code,clientPairing.code)){
          row.receipt={operationId:body.operationId,status:'REJECTED',error:'PAIRING_INVALID'};
          return reply(res,401,{error:'PAIRING_INVALID'});
        }
        const {resourceIds}=clientPairing;clientPairing=null; // Consume before asynchronous work.
        const client=await serviceBinding.createLocalClient({connectionId:body.connectionId,installationId:randomUUID(),grantFamilyId:randomUUID(),userId:'local_http',resourceIds});
        try{
          const device=await bindingRequest(client.secret,{method:'POST',path:'/opendesk/v1/devices',body:{label:body.label,operationId:body.operationId}});
          httpClients.add(client.secret);
          const result={session:client.secret,expiresAt:client.expiresAt,serviceInstanceId:bindings.serviceInstanceId,device};
          row.receipt={operationId:body.operationId,status:'CONFIRMED',result};
          return reply(res,200,result);
        }catch(error){serviceBinding.revokeLocalClient(client.secret);throw error;}
      }catch(error){return reply(res,error.status??503,{error:error.status?error.code:'REQUEST_FAILED'});}
    }
    if(req.headers.origin && req.headers.origin!==origin)return reply(res,403,{error:'ORIGIN_REJECTED'});
    if(req.headers['sec-fetch-site'] && !['same-origin','none'].includes(req.headers['sec-fetch-site']))
      return reply(res,403,{error:'SITE_REJECTED'});
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
      if(req.method==='GET' && url.pathname==='/.well-known/opendesk-service' && !url.search)
        return reply(res,200,{productName:'Cookie Editor local usage',protocolVersion:1,serviceInstanceId:bindings.serviceInstanceId,
          authentication:'LOCAL_TRUSTED_PROCESS',capabilities:['usage:manual-binding','policy:metadata-state'],snapshotLimit:0,operationRetentionDays:30});
      if(req.method==='POST' && url.pathname==='/opendesk/open-session') {
        if(req.headers.origin!==origin||url.search)return reply(res,403,{error:'ORIGIN_REQUIRED'});
        const body=await input(req);exact(body,['code']);
        const pending=opens.get(body.code);opens.delete(body.code);
        if(!pending||clock()>=pending.expiresAt)return reply(res,401,{error:'OPEN_INVALID'});
        const context=getClient(pending.secret);
        const path=await bindings.managementPath(context,pending.target);
        getClient(pending.secret);
        if(clients.get(pending.secret).receiptOnly)throw bindingError('TRUSTED_SESSION_REQUIRED',403);
        const code=randomBytes(32).toString('hex');
        resourceSessions.set(code,{...pending,path,expiresAt:clock()+15*60_000});
        res.setHeader('set-cookie',`od_resource_${server.address().port}=${code}; HttpOnly; SameSite=Strict; Path=/; Max-Age=900`);
        return reply(res,200,{path});
      }
      if(url.pathname.startsWith('/opendesk/v1/')) {
        // A browser management cookie is NEVER a device credential. Native must
        // receive this per-instance capability over an authenticated secret channel.
        if(req.headers.origin)return reply(res,403,{error:'TRUSTED_PROCESS_REQUIRED'});
        const bearer=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization||'');
        if(!bearer)return reply(res,403,{error:'TRUSTED_PROCESS_REQUIRED'});
        getClient(bearer[1]);
        if(url.search)return reply(res,400,{error:'BAD_URL'});
        return reply(res,200,await bindingRequest(bearer[1],{method:req.method,path:url.pathname,
          body:['POST','DELETE'].includes(req.method)?await input(req,16384):undefined}));
      }
      if(req.method==='GET' && assets.has(url.pathname) && !url.search) {
        const asset=assets.get(url.pathname);
        res.writeHead(200,{...headers,'content-type':`${asset.type}; charset=utf-8`});res.end(asset.body);return;
      }
      const cookie=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${cookieName}=`))?.slice(cookieName.length+1);
      const adminSession=clock()<sessionExpires && match(cookie,session);
      const resourceCookie=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(`od_resource_${server.address().port}=`))?.split('=')[1];
      const isAdmin=adminSession&&!resourceCookie;
      if(req.method==='POST'&&url.pathname==='/opendesk/end-resource-session'){
        if(!adminSession||req.headers.origin!==origin||url.search)return reply(res,403,{error:'ADMIN_ORIGIN_REQUIRED'});
        const body=await input(req);exact(body,[]);
        resourceSessions.delete(resourceCookie);
        res.setHeader('set-cookie',`od_resource_${server.address().port}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
        return reply(res,200,{path:'/'});
      }
      const resourceSession=resourceSessions.get(resourceCookie);
      if(resourceCookie&&(!resourceSession||clock()>=resourceSession.expiresAt))return reply(res,401,{error:'RESOURCE_SESSION_EXPIRED'});
      let resourceContext=null;
      if(resourceSession && clock()<resourceSession.expiresAt){
        resourceContext=getClient(resourceSession.secret);
        if(clients.get(resourceSession.secret).receiptOnly)throw bindingError('TRUSTED_SESSION_REQUIRED',403);
        await bindings.managementPath(resourceContext,resourceSession.target);
      }
      const resourcePage=/^\/opendesk\/admin\/accounts\/[A-Za-z0-9_-]+$/.test(url.pathname)||url.pathname==='/opendesk/admin/sync';
      if(req.method==='GET' && resourcePage){
        // The public shell contains no data. Its one-shot fragment exchange is
        // verified before the application requests any resource.
        if(url.pathname==='/opendesk/admin/sync' && url.search && !/^\?device=[A-Za-z0-9_-]+$/.test(url.search))return reply(res,400,{error:'BAD_URL'});
        if(url.pathname!=='/opendesk/admin/sync'&&url.search)return reply(res,400,{error:'BAD_URL'});
        if(resourceContext && url.pathname+url.search!==resourceSession.path)return reply(res,403,{error:'RESOURCE_REJECTED'});
        if(isAdmin&&url.pathname.startsWith('/opendesk/admin/accounts/')){
          const alias=url.pathname.split('/').at(-1);
          if(!(await store.accounts()).some(a=>a.alias===alias))return reply(res,404,{error:'NOT_FOUND'});
        }
        if(isAdmin&&url.pathname==='/opendesk/admin/sync'&&url.search && !(await bindings.adminDevices()).some(d=>d.deviceId===url.searchParams.get('device')))
          return reply(res,404,{error:'NOT_FOUND'});
        const asset=assets.get('/');res.writeHead(200,{...headers,'content-type':'text/html; charset=utf-8'});res.end(asset.body.toString().replace('href="./app.css"','href="/app.css"').replace('src="./app.js"','src="/app.js"'));return;
      }
      if(!isAdmin&&!resourceContext)return reply(res,401,{error:'SESSION_REQUIRED'});
      if(url.pathname.startsWith('/opendesk/admin/api/')){
        if(!isAdmin){
          if(req.method==='GET'&&url.pathname==='/opendesk/admin/api/devices'&&!url.search && !resourceSession.target.bindingId)
            return reply(res,200,{devices:[await bindings.request(resourceContext,{method:'GET',path:'/opendesk/v1/sync-policy'})],readOnly:true});
          return reply(res,403,{error:'ADMIN_REQUIRED'});
        }
        if(req.method==='POST'&&url.pathname==='/opendesk/admin/api/client-pairing'){
          if(req.headers.origin!==origin||url.search)return reply(res,403,{error:'ORIGIN_REQUIRED'});
          const body=await input(req);exact(body,[]);
          return reply(res,200,await issueClientPairing());
        }
        const adminReceipt=/^\/opendesk\/admin\/api\/operations\/([A-Za-z0-9_-]+)$/.exec(url.pathname);
        if(req.method==='GET'&&adminReceipt && url.searchParams.size===1 && url.searchParams.has('device'))
          return reply(res,200,await bindings.adminOperation({deviceId:url.searchParams.get('device'),operationId:adminReceipt[1]}));
        if(req.method==='GET'&&url.pathname==='/opendesk/admin/api/devices'&&!url.search)
          return reply(res,200,{devices:await bindings.adminDevices(),readOnly:false});
        if(req.method==='POST'&&url.pathname==='/opendesk/admin/api/sync-policy'){
          if(req.headers.origin!==origin||url.search)return reply(res,403,{error:'ORIGIN_REQUIRED'});
          const body=await input(req,16384);exact(body,['deviceId','operationId','expectedRevision','scope']);
          const {deviceId,...change}=body;
          return reply(res,200,await bindings.saveDesiredPolicy({tenantId:'local',deviceId},change));
        }
        return reply(res,404,{error:'NOT_FOUND'});
      }
      if(!isAdmin){
        if(req.method!=='GET')return reply(res,403,{error:'RESOURCE_READ_ONLY'});
        const allowed=resourceSession.target.remoteAccountId;
        if(!allowed)return reply(res,403,{error:'RESOURCE_REJECTED'});
        if(url.pathname==='/api/v1/accounts'&&!url.search)
          return reply(res,200,{accounts:(await store.accounts()).filter(a=>a.alias===allowed)});
        if(![ `/api/v1/accounts/${allowed}`,`/api/v1/accounts/${allowed}/history`].includes(url.pathname))
          return reply(res,404,{error:'NOT_FOUND'});
      }
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
    }catch(error){reply(res,error.status??503,{error:error.status?error.code:'REQUEST_FAILED'});}
  });
  server.requestTimeout=15000;server.headersTimeout=5000;server.maxRequestsPerSocket=100;
  try {await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}
  catch(error){await reader.close();throw error;}
  const serviceBinding=Object.freeze({
    serviceInstanceId:bindings.serviceInstanceId,
    request:bindingRequest,
    // TRUSTED PROCESS ONLY. Caller must authenticate the existing Native channel
    // and derive installation/user/grant/resource IDs; never forward UI payloads.
    async createLocalClient(input){
      exact(input,['connectionId','installationId','userId','grantFamilyId','resourceIds']);
      if(closed)throw bindingError('SERVICE_CLOSED',503);
      const context=structuredClone({...input,tenantId:'local'});
      const known=(await store.accounts()).map(a=>a.alias);
      if(!Array.isArray(context.resourceIds)||context.resourceIds.some(id=>!known.includes(id)))throw bindingError('NOT_FOUND',404);
      // Context validation is performed before issuing any capability.
      if(['connectionId','installationId','userId','grantFamilyId'].some(k=>typeof context[k]!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(context[k])))throw bindingError('BAD_INPUT');
      const secret=randomBytes(32).toString('hex'),expiresAt=clock()+15*60_000;
      clients.set(secret,{context,expiresAt});
      return {origin:`http://${hostname}:${server.address().port}`,serviceInstanceId:bindings.serviceInstanceId,secret,expiresAt};
    },
    // PROCESS ONLY: possession on the authenticated transport may extend a known
    // capability even after expiry. Never recreate one, change its context, grant
    // or resourceIds, or revive revocation/transport retirement. HTTP cannot renew.
    // Return server-clock expiry only; callers need not compare different clocks.
    renewLocalClient(secret){
      const client=clients.get(secret);
      if(closed||!client)throw bindingError('TRUSTED_SESSION_REQUIRED',403);
      client.expiresAt=clock()+15*60_000;
      return {expiresAt:client.expiresAt};
    },
    // PROCESS ONLY: irreversible attenuation after uncertain DELETE. Keep the
    // original context solely for backend GET receipts (also after device revoke).
    // Expiry/renewal cannot restore management, account reads or mutations.
    retainLocalClientReceipts(secret){
      const client=clients.get(secret);
      if(closed||!client)throw bindingError('TRUSTED_SESSION_REQUIRED',403);
      client.receiptOnly=true;
      for(const [code,open] of opens)if(open.secret===secret)opens.delete(code);
      for(const [code,session] of resourceSessions)if(session.secret===secret)resourceSessions.delete(code);
    },
    async createManagementOpen(secret,target){
      const context=getClient(secret);
      if(clients.get(secret).receiptOnly)throw bindingError('TRUSTED_SESSION_REQUIRED',403);
      const path=await bindings.managementPath(context,target);
      getClient(secret);
      if(clients.get(secret).receiptOnly)throw bindingError('TRUSTED_SESSION_REQUIRED',403);
      const code=randomBytes(32).toString('hex'),expiresAt=clock()+60_000;
      opens.set(code,{secret,target:structuredClone(target),expiresAt});
      // Same one-time fragment contract as terminal pairing. Native or the
      // explicitly paired HTTP app may open this resource-scoped URL.
      return {url:`http://${hostname}:${server.address().port}${path}#open=${code}`,expiresAt};
    },
    revokeLocalClient(secret){
      clients.delete(secret);
      for(const [code,open] of opens)if(open.secret===secret)opens.delete(code);
    }
  });
  let applicationPairing;
  try{applicationPairing=await issueClientPairing();}catch(error){await new Promise(resolve=>server.close(resolve));await reader.close();throw error;}
  return Object.freeze({serviceBinding,url:`http://${hostname}:${server.address().port}/pair`,pairingCode,applicationPairing,
    close:async()=>{closed=true;clientPairing=null;pairReceipts.clear();httpClients.clear();clients.clear();opens.clear();resourceSessions.clear();await new Promise(resolve=>server.close(resolve));await reader.close();}});
}
