// Dev-only Preview + isolated HTTP harness. Never imported by product transport.
import {request as httpRequest,createServer} from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import {HistoryStore} from '../../ai-account-usage/history-store.mjs';
import {ServiceBindingStore} from '../../ai-account-usage/service-binding-store.mjs';
import {startManagementServer} from '../../ai-account-usage/web-server.mjs';
const root=dirname(fileURLToPath(import.meta.url));
const paths=new Set(['/opendesk/client/pair','/opendesk/client/pair-result','/opendesk/client/request']);
const fail=code=>Object.assign(Error(code),{code});
const send=(res,status,data)=>{res.statusCode=status;res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');res.end(JSON.stringify(data));};
export async function startIsolatedHttpPreview({port=43135,vite=true}={}){
 const directory=await mkdtemp(join(tmpdir(),'cookie-preview-isolated-'));
 let backend,server,closed=false,upstream=0;
 const audit=[];
 const close=async()=>{
  if(closed)return;closed=true;
  if(server)await (vite?server.close():new Promise(resolve=>server.close(resolve)));
  await backend?.close();await rm(directory,{recursive:true,force:true});
 };
 try{
  for(const file of ['index.html','app.js','app.css'])await writeFile(join(directory,file),'Synthetic preview only');
  const store=new HistoryStore({directory:join(directory,'history')});
  await store.register({alias:'synthetic_01',displayName:'隔离合成额度账号（非真实用量）'});
  const bindingStore=new ServiceBindingStore({directory:join(directory,'bindings')});
  backend=await startManagementServer({store,bindingStore,assetsDirectory:directory,
   service:{query:async()=>{upstream++;throw fail('UPSTREAM_FORBIDDEN');}}});
  const origin=backend.applicationPairing.origin;
  const rpc='/__isolated-http/'+randomBytes(24).toString('hex')+'/rpc';
  let previewOrigin;
  const forward=input=>new Promise((resolve,reject)=>{
   let url;try{url=new URL(input.url);}catch{reject(fail('E_PREVIEW_NETWORK_SCOPE'));return;}
   if(url.origin!==origin||url.username||url.password||url.search||url.hash||!paths.has(url.pathname)||input.method!=='POST'){
    reject(fail('E_PREVIEW_NETWORK_SCOPE'));return;
   }
   // Substitute DNS only. Preserve exact unique backend Host. Never forward
   // browser cookies, arbitrary headers, Origin, redirects or admin requests.
   const body=JSON.stringify(input.data);
   if(typeof body!=='string'||Buffer.byteLength(body)>16384){reject(fail('E_PREVIEW_BODY'));return;}
   const req=httpRequest({hostname:'127.0.0.1',port:url.port,path:url.pathname,method:'POST',
    headers:{host:url.host,'content-type':'application/json','content-length':Buffer.byteLength(body)}},res=>{
     const chunks=[];let size=0;
     res.on('data',chunk=>{size+=chunk.length;if(size>16384){req.destroy(fail('E_PREVIEW_RESPONSE'));return;}chunks.push(chunk);});
     res.on('end',()=>{try{const data=JSON.parse(Buffer.concat(chunks).toString());audit.push({path:url.pathname,status:res.statusCode});resolve({status:res.statusCode,data});}catch{reject(fail('E_PREVIEW_RESPONSE'));}});
    });
   req.setTimeout(11000,()=>req.destroy(fail('E_TIMEOUT')));req.on('error',reject);req.end(body);
  });
  const middleware=async(req,res,next)=>{
   if(!req.url?.startsWith('/__isolated-http/'))return next();
   if(req.headers.host!==new URL(previewOrigin).host||
     req.headers.origin&&req.headers.origin!==previewOrigin||
     req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))return send(res,403,{error:'E_PREVIEW_ORIGIN'});
   if(req.url==='/__isolated-http/config'&&req.method==='GET')return send(res,200,{origin,rpc});
   if(req.url!==rpc||req.method!=='POST')return send(res,404,{error:'E_PREVIEW_ROUTE'});
   if(req.headers['content-type']!=='application/json')return send(res,415,{error:'E_PREVIEW_BODY'});
   try{
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>20000){send(res,413,{error:'E_PREVIEW_BODY'});return;}chunks.push(chunk);}
    const input=JSON.parse(Buffer.concat(chunks).toString());
    if(!input||Object.keys(input).sort().join()!=='data,method,url')throw fail('E_PREVIEW_BODY');
    const result=await forward(input);send(res,result.status,result.data);
   }catch(error){send(res,error.code==='E_PREVIEW_NETWORK_SCOPE'?403:400,{error:error.code||'E_PREVIEW_BODY'});}
  };
  if(vite){
   const {createServer:createViteServer}=await import('vite');
   server=await createViteServer({configFile:join(root,'vite.config.mjs'),server:{host:'127.0.0.1',port,strictPort:true},
    plugins:[{name:'cookie-isolated-http-dev-only',configureServer(s){s.middlewares.use(middleware);}}]});
   await server.listen();previewOrigin='http://127.0.0.1:'+server.httpServer.address().port;
  }else{
   server=createServer((req,res)=>middleware(req,res,()=>send(res,404,{error:'NOT_FOUND'})));
   await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
   previewOrigin='http://127.0.0.1:'+server.address().port;
  }
  const pairingFile=join(directory,'application-pairing.json');
  await writeFile(pairingFile,JSON.stringify(backend.applicationPairing,null,2),{mode:0o600});
  return {url:previewOrigin+'/dev.html?isolatedHttp=1',origin,previewOrigin,rpc,pairingFile,
   applicationPairing:backend.applicationPairing,bindingStore,close,
   inspect:()=>({evidence:'Preview + isolated HTTP',upstream,audit:structuredClone(audit)})};
 }catch(error){await close();throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const harness=await startIsolatedHttpPreview({port:Number(process.env.COOKIE_ISOLATED_PREVIEW_PORT||43135)});
 // Intentionally print only a private local file path, never the one-time code.
 process.stdout.write(JSON.stringify({url:harness.url,backendOrigin:harness.origin,pairingFile:harness.pairingFile,evidence:'Preview + isolated HTTP'})+'\n');
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{void harness.close().then(()=>process.exit(0));});
}
