import test from 'node:test';
import assert from 'node:assert/strict';
import {makeReading,snapshotFromReading,sameRuntimeTarget,compareSnapshots,reportJson,FIELD_DEFINITIONS} from '../src/model.js';
const ctx={status:'available',url:'https://qa.example.test/pay?token=secret',
  title:'订单页',tabRef:'owned-tab',documentRef:'owned-document'};
const reading=(raw=ctx,id='a')=>makeReading(raw,{id,at:'2026-10-27T14:00:00Z'});
test('collect only real Host page fields, never infer environmental data',()=>{
  const r=reading(),s=snapshotFromReading(r);
  assert.equal(s.completeness,'partial');
  assert.equal(s.fields.length,FIELD_DEFINITIONS.length);
  assert.equal(s.fields[0].value,'https://qa.example.test');
  assert.ok(s.fields.slice(3).every(x=>x.status==='not_exposed'&&x.value===null));
  assert.ok(!JSON.stringify(s).includes('secret'));
  assert.ok(!JSON.stringify(s).includes('owned-document'));
});
test('document reference and URL are mandatory to protect a save from staleness',()=>{
  assert.equal(sameRuntimeTarget(reading(),ctx),true);
  assert.equal(sameRuntimeTarget(reading(),{...ctx,documentRef:'different'}),false);
  assert.equal(sameRuntimeTarget(reading(),{...ctx,url:'https://qa.example.test/other'}),false);
  assert.equal(sameRuntimeTarget(reading({...ctx,documentRef:undefined}),ctx),false);
  assert.throws(()=>reading({...ctx,url:'chrome://settings'}),/HTTP/);
});
test('compare unknown vs equal, preserve partial report caveat',()=>{
  const a=snapshotFromReading(reading());
  const b=snapshotFromReading(reading({...ctx,title:'新标题'},'b'));
  const diff=compareSnapshots(a,b);
  assert.equal(diff.find(row=>row.key==='origin').state,'same');
  assert.equal(diff.find(row=>row.key==='title').state,'changed');
  assert.equal(diff.find(row=>row.key==='userAgent').state,'unverifiable');
  const report=JSON.parse(reportJson(a,b,'2026-10-27T14:20:00Z'));
  assert.equal(report.comparison.length,FIELD_DEFINITIONS.length);
  assert.match(report.caveat,/PARTIAL/);
});
test('forged environment field cannot enter saved A snapshots',()=>{
  const s=snapshotFromReading(reading());s.fields[3].status='available';s.fields[3].value='fake';
  assert.throws(()=>reportJson(s),/非法或未经授权/);
});
