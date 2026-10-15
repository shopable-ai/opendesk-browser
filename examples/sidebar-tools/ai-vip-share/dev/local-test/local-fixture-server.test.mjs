import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {randomUUID} from 'node:crypto';
import {createLocalFixture} from './local-fixture-server.mjs';
const {server,pac}=createLocalFixture();
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const addr=`http://127.0.0.1:${server.address().port}`;
const api=async(path,method='GET',data,headers={})=>{
  const r=await fetch(addr+path,{method,headers:{'X-OpenDesk-Local-Test':'1',...(data?{'Content-Type':'application/json'}:{}),...headers},
    ...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,data:await r.json()};
};
test.after(()=>server.close());
test('health is loopback only, mock mode is explicit',async()=>{
  const r=await fetch(addr+'/health');const data=await r.json();
  assert.equal(data.ok,true);assert.equal(data.proxyPort,7897);
  assert.equal(data.browserReleaseIntegration,false);
});
test('PAC only routes approved AI hosts, not lookalikes',()=>{
  const sandbox={dnsDomainIs:(host,domain)=>host.endsWith(domain)};
  runInNewContext(pac+'\nthis.route=FindProxyForURL;',sandbox);
  for(const host of ['chatgpt.com','api.openai.com','claude.ai','gemini.google.com','www.perplexity.ai'])
    assert.equal(sandbox.route('https://'+host,host),'PROXY 127.0.0.1:7897',host);
  for(const host of ['badchatgpt.com','chatgpt.com.attacker.invalid','example.com'])
    assert.equal(sandbox.route('https://'+host,host),'DIRECT',host);
  assert(!pac.includes('PROXY 127.0.0.1:7897; DIRECT'));
});
test('basic member, preview, redemption and immutable idempotency',async()=>{
  const first=await api('/api/member');assert.equal(first.data.account.id,'local-fixture-account');
  const p=await api('/api/preview','POST',{code:'DEMO-VIP-01'});
  assert.equal(p.status,200);assert.equal(p.data.accountId,first.data.account.id);
  const key=randomUUID();
  const post={previewId:p.data.previewId,accountId:first.data.account.id,idempotencyKey:key};
  const redeemed=await api('/api/redeem','POST',post);
  assert.equal(redeemed.data.status,'redeemed');
  const again=await api('/api/redeem','POST',post);
  assert.equal(again.data.redemptionId,redeemed.data.redemptionId);
  const list=await api('/api/member');assert.equal(list.data.redemptions.length,1);
  const status=await api('/api/status','POST',{accountId:post.accountId,idempotencyKey:key});
  assert.equal(status.data.redemptionId,redeemed.data.redemptionId);
  const wrong=await api('/api/redeem','POST',{...post,previewId:randomUUID()});
  assert.equal(wrong.status,409);
  const missing=await api('/api/status','POST',{accountId:post.accountId,idempotencyKey:randomUUID()});
  assert.equal(missing.data.status,'unknown');
});
test('lost acknowledgement still has one authoritative receipt',async()=>{
  const p=await api('/api/preview','POST',{code:'DEMO-VIP-01'});
  const key=randomUUID(), accountId=p.data.accountId;
  const result=await api('/api/redeem','POST',{previewId:p.data.previewId,accountId,idempotencyKey:key},{'X-Fixture-Drop-Ack':'1'});
  assert.equal(result.status,504);
  const lookup=await api('/api/status','POST',{accountId,idempotencyKey:key});
  assert.equal(lookup.data.status,'redeemed');
  assert.equal(lookup.data.idempotencyKey,key);
});
test('pending and authoritative final rejection never grant member entitlements',async()=>{
  for(const [outcome,expected] of [['pending','pending'],['final-rejected','rejected']]){
    const p=await api('/api/preview','POST',{code:'DEMO-VIP-01'});
    const idempotencyKey=randomUUID();
    const row=await api('/api/redeem','POST',{
      previewId:p.data.previewId,accountId:p.data.accountId,idempotencyKey
    },{'X-Fixture-Outcome':outcome});
    assert.equal(row.data.status,expected);
    const status=await api('/api/status','POST',{accountId:p.data.accountId,idempotencyKey});
    assert.equal(status.data.status,expected);
    if(expected==='rejected')assert.equal(status.data.final,true);
    const list=await api('/api/member');
    assert(!list.data.redemptions.some(r=>r.idempotencyKey===idempotencyKey));
  }
});
test('proxy activation fixture returns schema only, not an actual local proxy host',async()=>{
  const a=await api('/api/activate','POST',{deviceId:'local-demo-device',code:'DEMO-VIP-01'});
  assert.equal(a.status,200);assert.equal(a.data.endpoint.host,'proxy.fixture.test');
  assert.equal(a.data.endpoint.scheme,'socks5');
  const v=await api('/api/verify','POST',{deviceId:'local-demo-device',leaseId:a.data.leaseId});
  assert.equal(v.data.active,true);assert.equal(v.data.lease.leaseId,a.data.leaseId);
});
test('mutating API refuses cross-site Origin and missing local test header',async()=>{
  const noHeader=await fetch(addr+'/api/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  assert.equal(noHeader.status,403);
  const origin=await fetch(addr+'/api/preview',{method:'POST',headers:{Origin:'https://attacker.invalid','X-OpenDesk-Local-Test':'1','Content-Type':'application/json'},body:'{}'});
  assert.equal(origin.status,403);
});
