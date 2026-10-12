import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {buildMarketSite,MARKET_HEADERS} from './build-market-site.mjs';
import {resolveMarketChannel} from './market-channel.mjs';
const channel=resolveMarketChannel({mode:'development'}),url=new URL(channel.origin);
let output=null;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8','.png':'image/png','.xml':'application/xml','.txt':'text/plain; charset=utf-8'};
const server=createServer(async(req,res)=>{
  try{
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
try{const built=await buildMarketSite({env:{...process.env,OPENDESK_MARKET_BUILD_MODE:'development'}});output=built.output;
  console.log(JSON.stringify({...built,url:channel.origin,extension:'dist/development',note:'先构建并加载开发扩展；Ctrl+C 停止本服务。'}));
}catch(error){server.close();throw error;}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close(()=>process.exit(0)));
