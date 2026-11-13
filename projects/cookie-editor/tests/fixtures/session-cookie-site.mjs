// Loopback-only, synthetic Cookie fixture for the original Cookie Editor UI.
// It is not a login site or a share relay. No Chrome/Host APIs or real values.
import http from 'node:http';
import {appendFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const COOKIE_NAME='od_r31_local_01a18bd4';
export const VALUES=Object.freeze({a:'fiction-a-01a18bd4',b:'fiction-b-01a18c21'});
export function cookieState(header=''){
 const entries=String(header).split(';').map(part=>part.trim()).filter(part=>part.startsWith(COOKIE_NAME+'='));
 if(entries.length===0)return {state:'missing'};
 if(entries.length!==1)return {state:'unexpected'};
 const value=entries[0].slice(COOKIE_NAME.length+1);
 const state=Object.keys(VALUES).find(key=>VALUES[key]===value);
 return state?{state,value}:{state:'unexpected'};
}
export function createSessionCookieSite({host,seed,navigation=false,log=()=>{}}){
 if(typeof host!=='string'||!/^od-[a-z0-9-]{4,90}\.localhost$/.test(host)||!Object.hasOwn(VALUES,seed))
  throw Error('E_SYNTHETIC_SITE_CONFIG');
 let sequence=0;
 const readScript="fetch('/state',{cache:'no-store',credentials:'same-origin'}).then(r=>r.json()).then(s=>{document.getElementById('cookie-state').textContent=s.value||({missing:'尚无测试 Cookie',unexpected:'出现未核验数据，停止验收'}[s.state]||'读取未确认');}).catch(()=>{document.getElementById('cookie-state').textContent='读取未确认';});";
 const navigationScript=`
 let step=0;
 const report=()=>{document.getElementById('navigation-state').textContent='操作 '+step+' · '+location.pathname+location.search+location.hash;};
 document.getElementById('title').onclick=()=>{document.title='Cookie R2 标题 '+(++step);report();};
 document.getElementById('query').onclick=()=>{history.pushState({},'',location.pathname+'?step='+(++step));report();};
 document.getElementById('hash').onclick=()=>{location.hash='step-'+(++step);report();};
 document.getElementById('path').onclick=()=>{history.pushState({},'','/r2/'+(++step));report();};
 document.getElementById('rotate').onclick=()=>{fetch('/rotate',{method:'POST',credentials:'same-origin',redirect:'error'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(s=>{document.getElementById('cookie-state').textContent=s.value||'读取未确认';});};
 report();`;
 const script=readScript+(navigation?navigationScript:'');
 const controls=navigation?'<section aria-label="R2 导航验收"><button id="title">只改标题</button> <button id="query">改变 Query</button> <button id="hash">改变 Hash</button> <button id="path">SPA 下一路径</button> <button id="rotate">切换虚构 Cookie</button><p><output id="navigation-state" aria-live="polite"></output></p></section>':'';
 const page=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>OpenDesk Cookie 会话技术验收</title><style>body{font:16px system-ui;margin:32px;line-height:1.7}code{word-break:break-all}</style><h1>Cookie 会话技术验收</h1><p>仅使用获准的虚构 Cookie；本页没有登录或认证功能。</p><dl><dt>独立测试主机</dt><dd><code>${host}</code></dd><dt>Cookie 名称</dt><dd><code>${COOKIE_NAME}</code></dd><dt>浏览器发回的当前测试值</dt><dd><output id="cookie-state" aria-live="polite">正在读取 Cookie 回执…</output></dd></dl>${controls}<script src="/fixture.js"></script></html>`;
 const server=http.createServer((req,res)=>{
  res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');
  res.setHeader('referrer-policy','no-referrer');
  res.setHeader('content-security-policy',"default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
  const expected=host+':'+server.address().port;
  const pageRoute=req.url==='/'||(navigation&&/^\/(?:r2\/[0-9]{1,3})?(?:\?step=[0-9]{1,3})?$/.test(req.url));
  const rotation=navigation&&req.url==='/rotate'&&req.method==='POST';
  if(req.headers.host!==expected||(!rotation&&(req.method!=='GET'||
    !(pageRoute||['/state','/health','/fixture.js','/favicon.ico'].includes(req.url))))){
   res.writeHead(400,{'content-type':'text/plain; charset=utf-8'});res.end('E_SYNTHETIC_SITE_SCOPE');return;
  }
  const state=cookieState(req.headers.cookie);
  try{log({sequence:++sequence,at:new Date().toISOString(),method:req.method,path:req.url,cookieState:state.state});}catch{}
  if(rotation){
   if(!['a','b'].includes(state.state)){res.writeHead(409);res.end('E_SYNTHETIC_COOKIE_STATE');return;}
   const next=state.state==='a'?'b':'a';
   res.setHeader('set-cookie',`${COOKIE_NAME}=${VALUES[next]}; Path=/; HttpOnly; SameSite=Lax`);
   res.writeHead(200,{'content-type':'application/json; charset=utf-8'});
   res.end(JSON.stringify({state:next,value:VALUES[next],realLoginProof:false}));return;
  }
  if(pageRoute){
   // Seed only a missing fixture Cookie. A restored A on the receiver must
   // survive page refresh even when that server's initial seed was B.
   if(state.state==='missing')res.setHeader('set-cookie',`${COOKIE_NAME}=${VALUES[seed]}; Path=/; HttpOnly; SameSite=Lax`);
   res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(page);return;
  }
  if(req.url==='/fixture.js'){res.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});res.end(script);return;}
  if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}
  res.writeHead(200,{'content-type':'application/json; charset=utf-8'});
  res.end(JSON.stringify(req.url==='/health'
   ?{kind:'SYNTHETIC_COOKIE_FIXTURE',status:'ready',host,cookieName:COOKIE_NAME,realLoginProof:false}
   :{kind:'SYNTHETIC_COOKIE_FIXTURE',host,cookieName:COOKIE_NAME,...state,realLoginProof:false}));
 });
 return server;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const host=process.env.COOKIE_FIXTURE_HOST,seed=process.env.COOKIE_FIXTURE_SEED;
 const port=Number(process.env.COOKIE_FIXTURE_PORT||43113);
 if(!Number.isSafeInteger(port)||port<1024||port>65535)throw Error('E_SYNTHETIC_SITE_PORT');
 const file=process.env.COOKIE_FIXTURE_RECEIPTS;
 if(file)mkdirSync(dirname(resolve(file)),{recursive:true});
 const server=createSessionCookieSite({host,seed,navigation:process.env.COOKIE_FIXTURE_NAVIGATION==='1',log:record=>{if(file)appendFileSync(file,JSON.stringify(record)+'\n',{mode:0o600});}});
 server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({kind:'SYNTHETIC_COOKIE_FIXTURE',status:'ready',origin:`http://${host}:${port}`,seed,cookieName:COOKIE_NAME,pid:process.pid,realLoginProof:false})));
 process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
}
