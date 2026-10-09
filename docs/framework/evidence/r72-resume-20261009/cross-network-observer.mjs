import {readFile,writeFile} from 'node:fs/promises';
const dir=new URL('./',import.meta.url);const launch=JSON.parse(await readFile(new URL('chrome-cross-launch.json',dir),'utf8'));
const port=(await readFile(launch.profile+'/DevToolsActivePort','utf8')).split('\n')[0];
const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const [kind='page',label='snapshot',file]=process.argv.slice(2);
const t=targets.find(t=>kind==='worker'?t.type==='service_worker':t.type==='page'&&(kind==='sidebar'?t.url.includes('/ui/tool.html'):kind==='catalog'?t.url.includes('hostInstanceId=0af48ad1-5c74-41aa-be3e-7f2afdb6e973'):t.url.startsWith('http://127.0.0.1:43111/demo-form.html')));if(!t)throw Error('own target missing');
const ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let seq=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.j(Error(JSON.stringify(m.error))):p.r(m.result);}};
const send=(method,params={})=>new Promise((r,j)=>{pending.set(++seq,{r,j});ws.send(JSON.stringify({id:seq,method,params}));});
const events=[];const original=ws.onmessage;ws.onmessage=e=>{original(e);const m=JSON.parse(e.data);if(m.method?.startsWith('Network.')){events.push({at:new Date().toISOString(),...m});writeFile(new URL('cross-network-events.json',dir),JSON.stringify({pid:launch.pid,targetId:t.id,events},null,2));}};await send('Network.enable');console.log('network observer ready');await new Promise(r=>setTimeout(r,45000));ws.close();
