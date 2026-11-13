import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {request} from 'node:http';
import {createSessionCookieSite,COOKIE_NAME,VALUES} from './fixtures/session-cookie-site.mjs';
async function fixture(t,seed='b',navigation=false){
 const host='od-cookie-test.localhost',logs=[];
 const server=createSessionCookieSite({host,seed,navigation,log:row=>logs.push(row)});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));});
 const port=server.address().port;
 const get=(path,cookie,actualHost=host+':'+port,method='GET')=>new Promise((resolve,reject)=>{
  // Exercise real virtual-host HTTP routing; Fetch may normalize Host to its
  // URL host, so use the ordinary Node HTTP client for this wire-level fixture.
  const req=request({hostname:'127.0.0.1',port,path,method,headers:{host:actualHost,...(cookie?{cookie}:{})}},res=>{
   const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));
  });req.on('error',reject);req.end();
 });
 return {get,logs};
}
test('fixture seeds only its authorized Cookie and never overwrites a restored value on reload',async t=>{
 const f=await fixture(t);
 const initial=await f.get('/');assert.equal(initial.status,200);
 assert.equal(initial.headers.get('set-cookie'),`${COOKIE_NAME}=${VALUES.b}; Path=/; HttpOnly; SameSite=Lax`);
 for(const value of [VALUES.a,VALUES.b,'UNVERIFIED_PRIVATE_VALUE']){
  const response=await f.get('/',COOKIE_NAME+'='+value);
  assert.equal(response.status,200);assert.equal(response.headers.get('set-cookie'),null);
  assert.equal((await response.text()).includes(value),false,'page must use an independent browser Cookie receipt');
 }
 const readback=await(await f.get('/state',COOKIE_NAME+'='+VALUES.a)).json();
 assert.equal(readback.value,VALUES.a);assert.equal(readback.realLoginProof,false);
});
test('fixture never reflects unrelated or unverified Cookie values into responses or logs',async t=>{
 const f=await fixture(t);
 for(const cookie of ['token=UNAPPROVED_TOKEN; theme=UNAPPROVED_THEME',COOKIE_NAME+'=UNAPPROVED_TOKEN',COOKIE_NAME+'='+VALUES.a+'; '+COOKIE_NAME+'='+VALUES.b]){
  const response=await f.get('/state',cookie),data=await response.text();
  assert.equal(response.status,200);assert.doesNotMatch(data,/UNAPPROVED_TOKEN|UNAPPROVED_THEME/);
  assert.equal(JSON.parse(data).value,undefined);assert.equal(JSON.parse(data).realLoginProof,false);
 }
 assert.doesNotMatch(JSON.stringify(f.logs),/UNAPPROVED_TOKEN|UNAPPROVED_THEME|fiction-a|fiction-b/);
});
test('fixture rejects a different Host, arbitrary paths and non-loopback fixture names',async t=>{
 const f=await fixture(t);
 for(const [path,host] of [['/state','example.com'],['/arbitrary?token=UNAPPROVED_TOKEN',undefined]]){
  const response=await f.get(path,undefined,host);assert.equal(response.status,400);assert.equal(response.headers.get('set-cookie'),null);assert.doesNotMatch(await response.text(),/UNAPPROVED_TOKEN/);
 }
 assert.throws(()=>createSessionCookieSite({host:'example.com',seed:'a'}),/E_SYNTHETIC_SITE_CONFIG/);
});
test('opt-in R2 navigation only permits numbered paths and rotates the fictional Cookie',async t=>{
 const f=await fixture(t,'a',true);
 for(const path of ['/','/r2/20','/r2/20?step=21']){
  const response=await f.get(path,COOKIE_NAME+'='+VALUES.a);
  assert.equal(response.status,200);assert.match(await response.text(),/SPA 下一路径/);
  assert.equal(response.headers.get('set-cookie'),null);
 }
 for(const path of ['/r2/20?token=PRIVATE','/r2/evil','/rotate'])
  assert.equal((await f.get(path)).status,400);
 const rotated=await f.get('/rotate',COOKIE_NAME+'='+VALUES.a,undefined,'POST');
 assert.equal(rotated.status,200);
 assert.equal(rotated.headers.get('set-cookie'),`${COOKIE_NAME}=${VALUES.b}; Path=/; HttpOnly; SameSite=Lax`);
 assert.equal((await rotated.json()).value,VALUES.b);
 const unknown=await f.get('/rotate',COOKIE_NAME+'=PRIVATE',undefined,'POST');
 assert.equal(unknown.status,409);assert.equal(unknown.headers.get('set-cookie'),null);
 assert.doesNotMatch(JSON.stringify(f.logs),/PRIVATE|fiction-a|fiction-b/);
 const ordinary=await fixture(t);
 assert.equal((await ordinary.get('/rotate',COOKIE_NAME+'='+VALUES.a,undefined,'POST')).status,400);
});
