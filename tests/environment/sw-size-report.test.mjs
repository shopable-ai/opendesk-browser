import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeSwEvidence} from '../../scripts/report-sw-size.mjs';
const fixture = () => ({mode:'production',status:'passed',
  report:{files:[{path:'sw.js',bytes:1234,sha256:'abc'}]},
  bundleModules:[{target:'sw.js',bytes:1234,sha256:'abc',modules:[
    {path:'src/platform/host/broker.js',renderedLength:100,originalLength:120},
    {path:'node_modules/demo/index.js',renderedLength:40,originalLength:60,npm:{name:'demo',version:'1.2.3'}}
  ]},{target:'agents/page-agent.js',bytes:100}]});
test('SW sizing uses physical minified output and labels rendered lengths accurately',()=>{
  const summary=summarizeSwEvidence(fixture(),1234);
  assert.equal(summary.sw.bytes,1234);
  assert.equal(summary.totalFixedJsBytes,1334);
  assert.equal(summary.modules.length,2);
  assert.equal(summary.groups[0].group,'platform/host');
  assert.match(summary.renderedLengthNote,/NOT an allocation/);
  assert.deepEqual(summary.modules[1].npm,{name:'demo',version:'1.2.3'});
});
test('reject stale, unverified or mismatched input rather than inventing module contribution',()=>{
  const old=fixture();delete old.bundleModules;assert.throws(()=>summarizeSwEvidence(old),/bundleModules/);
  const bad=fixture();assert.throws(()=>summarizeSwEvidence(bad,1235),/does not match/);
  bad.bundleModules[0].sha256='changed';assert.throws(()=>summarizeSwEvidence(bad,1234),/does not match/);
});
test('duplicate module attribution is rejected',()=>{
  const bad=fixture();bad.bundleModules[0].modules.push({...bad.bundleModules[0].modules[0]});
  assert.throws(()=>summarizeSwEvidence(bad,1234),/Duplicate module/);
});
