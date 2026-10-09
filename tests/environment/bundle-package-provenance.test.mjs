import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PACKAGE_ENTRIES,PINNED_USER_SCRIPT_LIBRARIES} from '../../scripts/build-contract.mjs';

for(const mode of ['production','development'])test(mode+' actual fixed bundle module graph is tied to verified dist',async()=>{
  const evidence=process.env.OPENDESK_BUILD_EVIDENCE_DIR||'docs/framework/evidence/wxt/builds';
  const receipt=JSON.parse(await readFile(evidence+'/build-'+mode+'.json','utf8'));
  assert.deepEqual(receipt.bundleModules.map(row=>row.target).sort(),Object.keys(PACKAGE_ENTRIES).map(name=>name+'.js').sort());
  for(const row of receipt.bundleModules){
    const bytes=await readFile('dist/'+mode+'/'+row.target);
    assert.equal(row.bytes,bytes.length);
    assert.equal(row.sha256,createHash('sha256').update(bytes).digest('hex'));
    assert.ok(row.modules.every(module=>!/^(docs\/contracts\/source-snapshots\/|examples\/|src\/vendor\/)/.test(module.path)));
  }
  const sw=receipt.bundleModules.find(row=>row.target==='sw.js');
  for(const path of ['src/sw.js','src/environment.js','src/platform/protocol.js','src/platform/host/broker.js'])
    assert.ok(sw.modules.some(module=>module.path===path&&module.renderedLength>0),path);
  assert.ok(sw.modules.some(module=>module.npm?.name==='@wxt-dev/browser'));
  assert.ok(!sw.modules.some(module=>module.npm?.name==='lodash-es'||module.npm?.name==='jquery'));
  const jquery=await readFile('dist/'+mode+'/'+PINNED_USER_SCRIPT_LIBRARIES.jquery.output);
  assert.equal(createHash('sha256').update(jquery).digest('hex'),PINNED_USER_SCRIPT_LIBRARIES.jquery.sha256);
});
