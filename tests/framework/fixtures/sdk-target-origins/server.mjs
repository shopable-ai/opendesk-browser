import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

// A controlled fixture, not an extension runner or authority. It never opens a
// browser. All three listeners are loopback-only and have distinct exact origins.
export async function startSdkTargets({ports=[43110,43111,43112], log=()=>{}}={}) {
  if (!Array.isArray(ports) || ports.length!==3 || ports.some(p=>!Number.isInteger(p)||p<0||p>65535))
    throw new TypeError('Exactly three valid ports required');
  const runId=randomUUID(), servers=[], records=[], held=new Set(), origins={};
  const client=await readFile(new URL('./client.js',import.meta.url),'utf8');
  const prefix=`/${runId}`;
  const send=(res,status,value,type='application/json')=>{
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(status,{'content-type':`${type}; charset=utf-8`,'cache-control':'no-store','x-content-type-options':'nosniff'});
    res.end(type==='application/json'?JSON.stringify(value):value);
  };
  const snapshot=()=>({runId,origins:{...origins},counts:Object.fromEntries(['A','B','C'].map(role=>[role,records.filter(row=>row.role===role).length])),records:structuredClone(records),held:held.size});
  const release=()=>{const count=held.size;for(const item of held){held.delete(item);send(item.res,200,item.body);}return count;};
  async function close(){release();await Promise.all(servers.map(server=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})));}
  try {
    for (const [index,role] of ['A','B','C'].entries()) {
      const server=http.createServer((req,res)=>{
        // Reject arbitrary Host/DNS aliases and cross-site browser initiators.
        // This is fixture hardening, not a DNS-rebinding claim for the SDK.
        if (req.headers.host!==new URL(origins[role]).host || (req.headers.origin && req.headers.origin!==origins.A))
          return send(res,403,{error:'fixture host/origin refused'});
        const url=new URL(req.url,origins[role]);
        if (!url.pathname.startsWith(`${prefix}/`)) return send(res,404,{error:'wrong run'});
        const path=url.pathname.slice(prefix.length);
        if(role==='A' && path==='/release' && req.method==='POST' && !url.search) return send(res,200,{released:release()});
        if(req.method!=='GET') return send(res,405,{error:'GET only'});
        if(role==='A' && path==='/' && !url.search) return send(res,200,`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>OpenDesk SDK A/B/C</title><h1>精确文档 SDK 授权检查</h1><p>先打开扩展现有工具窗口，选择此 A 文档，勾选 network，只批准下方 B origin。不要批准 C。</p><pre id="scope"></pre><p>每次点击都是独立 SDK 调用；未知效果不自动重试。同 requestId 去重由 broker 回归检查，不以“双击”等同。</p><button data-probe="A">同源 A</button><button data-probe="B">已批准 B</button><button data-probe="C">未批准 C</button><button id="parallel">两个不同调用请求 B</button><button id="hold">请求 B 并暂停响应</button><button id="release">释放暂停响应</button><button id="counts">读取服务观察日志</button><p>暂停后可在扩展中撤权并重新批准，再释放响应，核对旧调用不能取得结果。取消本地调用不撤销服务已经观察到的请求。</p><pre id="result"></pre><pre id="observations"></pre><script src="${prefix}/client.js"></script></html>`,'text/html');
        if(role==='A' && path==='/client.js' && !url.search) return send(res,200,client,'text/javascript');
        if(role==='A' && path==='/counts' && !url.search) return send(res,200,snapshot());
        if(!['/probe','/hold'].includes(path) || [...url.searchParams.keys()].some(key=>key!=='case') || url.searchParams.getAll('case').length!==1)
          return send(res,404,{error:'unknown fixture route'});
        const caseId=url.searchParams.get('case');
        if(!/^[a-zA-Z0-9._-]{1,96}$/.test(caseId)) return send(res,400,{error:'invalid case'});
        if(records.length>=1000 || (path==='/hold' && held.size>=16)) return send(res,429,{error:'fixture budget exceeded'});
        const row={sequence:records.length+1,role,caseId,path,authorizationPresent:Boolean(req.headers.authorization),cookiePresent:Boolean(req.headers.cookie)};
        records.push(row);log({...row,runId});
        const body={runId,role,caseId,sequence:row.sequence,fixtureOnly:true};
        if(path==='/hold') {const item={res,body};held.add(item);res.once('close',()=>held.delete(item));return;}
        send(res,200,body);
      });
      servers.push(server);
      await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(ports[index],'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});
      origins[role]=`http://127.0.0.1:${server.address().port}`;
    }
    return {runId,origins,prefix,url:`${origins.A}${prefix}/`,snapshot,release,close};
  } catch(error) {await close();throw error;}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const fixture=await startSdkTargets({log:row=>console.log(JSON.stringify({event:'request-observed',...row}))});
  console.log(JSON.stringify({event:'fixture-ready',url:fixture.url,runId:fixture.runId,origins:fixture.origins}));
  for(const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>fixture.close().then(()=>{process.exitCode=0;}));
}
