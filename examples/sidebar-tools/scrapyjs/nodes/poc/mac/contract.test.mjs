import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {SCHEMA,validateReport,validateAllowedOrigin,isPrivateLanAddress} from './contract.mjs';

const origin='https://qa.example.org';
function makeReport(){
  const body=Buffer.from('<html>authorized QA fixture</html>');
  return {schema:SCHEMA,runId:randomUUID(),mode:'private',shared:false,origin,
    wifiIp:'198.51.100.10',cellularIp:'203.0.113.9',
    wifiNetworkHandle:'12345',cellularNetworkHandle:'67890',durationMs:1200,
    pages:[{url:origin+'/test-1',status:200,bytes:body.length,
      sha256:createHash('sha256').update(body).digest('hex'),bodyBase64:body.toString('base64')}]};
}
test('one private bounded page validates',()=>{
  assert.equal(validateReport(makeReport(),origin).pageCount,1);
});
test('only explicitly named public test origins',()=>{
  for(const bad of ['http://qa.example.org','https://localhost','https://10.0.0.2',
    'https://qa.example.org/x','https://not-configured.invalid'])
    assert.throws(()=>validateAllowedOrigin(bad));
});
test('reject shared mode and same Wi-Fi/Cellular IP',()=>{
  const r=makeReport();r.shared=true;assert.throws(()=>validateReport(r,origin),/non-private/);
  r.shared=false;r.cellularIp=r.wifiIp;assert.throws(()=>validateReport(r,origin),/egress/);
});
test('reject tampering and cross-origin results',()=>{
  const r=makeReport();r.pages[0].sha256='a'.repeat(64);
  assert.throws(()=>validateReport(r,origin),/differs/);
  const q=makeReport();q.pages[0].url='https://other.example.org/test-1';
  assert.throws(()=>validateReport(q,origin),/outside/);
});
test('reject more than 3 pages and extra properties',()=>{
  const r=makeReport();r.pages=[r.pages[0],r.pages[0],r.pages[0],r.pages[0]];
  assert.throws(()=>validateReport(r,origin),/1 to 3/);
  const q=makeReport();q.cookie='secret';
  assert.throws(()=>validateReport(q,origin),/Unreviewed/);
});
test('LAN filtering',()=>{
  for(const ip of ['192.168.1.45','10.1.2.3','172.20.1.1','::ffff:192.168.1.4','::1'])
    assert.equal(isPrivateLanAddress(ip),true,ip);
  for(const ip of ['8.8.8.8','172.32.0.1','203.0.113.22','2001:4860:4860::8888'])
    assert.equal(isPrivateLanAddress(ip),false,ip);
});
