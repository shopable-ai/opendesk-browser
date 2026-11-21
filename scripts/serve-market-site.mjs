import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {buildMarketSite,MARKET_HEADERS} from './build-market-site.mjs';
import {resolveMarketChannel} from './market-channel.mjs';
import {createMarketIndexResponder,readMarketSnapshotFile,MARKET_INDEX_FILE} from './market-index-response.mjs';
const channel=resolveMarketChannel({mode:'development'}),url=new URL(channel.origin);
let output=null;
const updatePublicKeys=process.env.OPENDESK_MARKET_UPDATE_KEYS_FILE?
  JSON.parse(await readMarketSnapshotFile(process.env.OPENDESK_MARKET_UPDATE_KEYS_FILE,{limit:65536})):{};
const indexResponse=createMarketIndexResponder({publicKeys:updatePublicKeys,
  readSnapshot:()=>{if(!output)throw Error('Market is building');return readMarketSnapshotFile(resolve(output,MARKET_INDEX_FILE));},
  allowOrigins:JSON.parse(process.env.OPENDESK_MARKET_INDEX_CORS_ORIGINS||'[]')});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8','.png':'image/png','.xml':'application/xml','.txt':'text/plain; charset=utf-8'};
const server=createServer(async(req,res)=>{
  try{
    const headers=new Headers();for(const [name,value] of Object.entries(req.headers))if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(', '):value);
    const index=await indexResponse(new Request(new URL(req.url,channel.origin),{method:req.method,headers}));
    if(index){res.writeHead(index.status,Object.fromEntries(index.headers));res.end(req.method==='HEAD'?undefined:Buffer.from(await index.arrayBuffer()));return;}
    if(!output){res.writeHead(503,MARKET_HEADERS);res.end('正在构建市场');return;}
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,MARKET_HEADERS);res.end();return;}
    const path=decodeURIComponent(new URL(req.url,channel.origin).pathname),candidate=resolve(output,'.'+path);
    if(!candidate.startsWith(output+'/')&&candidate!==output)throw Error('Invalid path');
    let file=candidate,code=200;
    try{if((await stat(file)).isDirectory())file=resolve(file,'index.html');await stat(file);}
    catch{file=resolve(output,'404.html');code=404;}
    const bytes=await readFile(file);res.writeHead(code,{...MARKET_HEADERS,'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(req.method==='HEAD'?undefined:bytes);
  }catch{res.writeHead(400,MARKET_HEADERS);res.end('请求地址无效');}
});
// Binding is the port-ownership check. EADDRINUSE never kills another process.
await new Promise((ok,fail)=>{server.once('error',fail);server.listen(Number(url.port),'127.0.0.1',ok);});
try{const built=await buildMarketSite({env:{...process.env,OPENDESK_MARKET_BUILD_MODE:'development'},
  projects:JSON.parse(process.env.OPENDESK_MARKET_PROJECTS||'[]')});output=built.output;
  console.log(JSON.stringify({...built,url:channel.origin,extension:'dist/development',note:'先构建并加载开发扩展；Ctrl+C 停止本服务。'}));
}catch(error){server.close();throw error;}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>process.exit(0)));
