import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request as httpRequest} from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startManagementServer} from '../services/ai-account-usage/web-server.mjs';
import {HistoryStore} from '../services/ai-account-usage/history-store.mjs';
import {createLoopbackProxyRequest} from '../services/ai-account-usage/transport.mjs';

test('same-origin HttpOnly pairing hides read API secret; only explicit refresh calls service',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'usage-session-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  for(const file of ['index.html','app.js','app.css'])await writeFile(join(directory,file),'public asset');
  const store=new HistoryStore({directory:join(directory,'history')});
  await store.register({alias:'test_01',displayName:'Synthetic'});
  let calls=0,now=Date.now();
  const service={query:async input=>{calls++;assert.deepEqual(input,{alias:'test_01',operation:'refresh'});return {results:[{account:(await store.accounts())[0]}]};}};
  const server=await startManagementServer({store,service,assetsDirectory:directory,clock:()=>now});
  t.after(()=>server.close());
  const origin=new URL(server.url).origin;
  assert.match(new URL(server.url).hostname,/^usage-[a-f0-9]+\.localhost$/);
  const req=(path,options={})=>new Promise((resolve,reject)=>{
    const request=httpRequest({hostname:'127.0.0.1',port:new URL(server.url).port,path,method:options.method??'GET',
      headers:{host:new URL(server.url).host,...options.headers}},res=>{
        const chunks=[];res.on('data',part=>chunks.push(part));res.on('end',()=>{
          const body=Buffer.concat(chunks).toString();const responseHeaders=new Headers();
          for(const [key,value]of Object.entries(res.headers))responseHeaders.set(key,Array.isArray(value)?value.join(', '):value);
          resolve({status:res.statusCode,headers:responseHeaders,text:async()=>body,json:async()=>JSON.parse(body)});
        });
      });request.once('error',reject);request.end(options.body);
  });
  assert.equal((await req('/api/v1/accounts')).status,401);
  assert.equal((await req('/api/v1/accounts',{headers:{origin:'http://other.example'}})).status,403);
  assert.equal((await req('/api/v1/accounts',{headers:{host:'evil.example'}})).status,403);
  assert.equal((await req('/api/v1/accounts',{headers:{host:`127.0.0.1:${new URL(server.url).port}`}})).status,403);
  const publicBody=await (await req('/')).text();assert.ok(!publicBody.includes(server.pairingCode));
  const session=await req('/session',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({code:server.pairingCode})});
  assert.equal(session.status,200);const cookie=session.headers.get('set-cookie');
  assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);
  const replay=await req('/session',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({code:server.pairingCode})});assert.equal(replay.status,401);
  const h={cookie:cookie.split(';')[0]};
  const rows=await (await req('/api/v1/accounts',{headers:h})).json();
  assert.equal(rows.accounts[0].alias,'test_01');assert.equal(calls,0);
  assert.equal((await req('/api/v1/accounts/test_01/history',{headers:h})).status,200);assert.equal(calls,0);
  assert.equal((await req('/api/v1/accounts/test_01/refresh',{method:'POST',headers:{...h,'content-type':'application/json'},body:'{}'})).status,403);
  assert.equal((await req('/api/v1/accounts/test_01/refresh',{method:'POST',headers:{...h,origin,'content-type':'application/json'},body:'{"path":"/tmp/auth"}'})).status,400);
  const refresh=await req('/api/v1/accounts/test_01/refresh',{method:'POST',headers:{...h,origin,'content-type':'application/json'},body:'{}'});
  assert.equal(refresh.status,200);assert.equal(calls,1);
  assert.equal((await req('/api/v1/accounts?token=x',{headers:h})).status,400);
  assert.equal((await req('/authorized-sources.mjs',{headers:h})).status,404);
  assert.equal(refresh.headers.get('access-control-allow-origin'),null);
  now+=8*3600_000;assert.equal((await req('/api/v1/accounts',{headers:h})).status,401);
});
test('explicit proxy stays loopback and one CONNECT, non-200 stops before quota request',async t=>{
  for(const url of ['http://example.com:7897','http://localhost:7897','https://127.0.0.1:7897','http://user:pass@127.0.0.1:7897','http://127.0.0.1:7897/path'])assert.throws(()=>createLoopbackProxyRequest(url),/E_PROXY_CONFIG/);
  let calls=0;
  const proxy=createServer();
  proxy.on('connect',(req,socket)=>{calls++;assert.equal(req.url,'chatgpt.com:443');assert.equal(req.headers.authorization,undefined);socket.end('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');});
  await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>proxy.close(resolve)));
  const request=createLoopbackProxyRequest(`http://127.0.0.1:${proxy.address().port}`);
  await assert.rejects(request('https://other.example/',{method:'GET',timeoutMs:1000}),/E_TRANSPORT_TARGET/);assert.equal(calls,0);
  await assert.rejects(request('https://chatgpt.com/backend-api/wham/usage',{method:'GET',headers:{authorization:'Bearer SYNTHETIC'},timeoutMs:1000}),/E_PROXY_TRANSPORT/);
  assert.equal(calls,1);
});
