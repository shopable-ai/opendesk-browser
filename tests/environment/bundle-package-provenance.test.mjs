import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {describeBundle} from '../../scripts/bundle-provenance.mjs';
import {PACKAGE_ENTRIES,PINNED_USER_SCRIPT_LIBRARIES,BUILD_POLICY} from '../../scripts/build-contract.mjs';
import {BUILTIN_CATALOG} from '../../src/libs/catalog.js';
import {BUILTIN_PACKAGE_RESOURCE_LIMIT} from '../../src/libs/runtime-contract.js';
import {PAGE_FRAMEWORK_RUNTIMES,PAGE_FRAMEWORK_RESOURCE_LIMIT} from '../../src/libs/page-frameworks/contract.js';

for(const mode of ['production','development'])test(mode+' actual fixed bundle module graph is tied to verified dist',async()=>{
  const evidence=process.env.OPENDESK_BUILD_EVIDENCE_DIR||'docs/framework/evidence/wxt/builds';
  const receipt=JSON.parse(await readFile(evidence+'/build-'+mode+'.json','utf8'));
  assert.deepEqual(receipt.bundleModules.map(row=>row.target).sort(),Object.keys(PACKAGE_ENTRIES).map(name=>name+'.js').sort());
  for(const row of receipt.bundleModules){
    const bytes=await readFile('dist/'+mode+'/'+row.target);
    assert.equal(row.bytes,bytes.length);
    assert.equal(row.sha256,createHash('sha256').update(bytes).digest('hex'));
    for(const module of row.modules.filter(module=>/^(docs\/contracts\/source-snapshots\/|examples\/|src\/vendor\/)/.test(module.path))){
      // Reuse the build boundary's exact target, source-blob and symlink checks.
      // Its only permitted inputs are the two reviewed Time Review UI files.
      const reviewed=describeBundle({chunk:{fileName:row.target,modules:{
        [resolve(module.path)]:{renderedLength:module.renderedLength,originalLength:module.originalLength}
      }},lock:{packages:{}}}).modules[0];
      assert.equal(module.reviewedFirstPartyBlob,reviewed.reviewedFirstPartyBlob,
        'receipt must retain the reviewed source identity: '+module.path);
    }
  }
  const sw=receipt.bundleModules.find(row=>row.target==='sw.js');
  for(const path of ['src/sw.js','src/environment.js','src/platform/protocol.js','src/platform/host/broker.js'])
    assert.ok(sw.modules.some(module=>module.path===path&&module.renderedLength>0),path);
  assert.ok(sw.modules.some(module=>module.npm?.name==='@wxt-dev/browser'));
  assert.equal(BUILD_POLICY.productionBytes,BUILTIN_PACKAGE_RESOURCE_LIMIT,
    'generated library resource byte cap drifted from runtime fetch limit');
  assert(PAGE_FRAMEWORK_RESOURCE_LIMIT<BUILTIN_PACKAGE_RESOURCE_LIMIT,
    'React/Vue have a separately enforced Page loader cap');
  const installedOptIn=Object.values(BUILTIN_CATALOG.libraries)
    .filter(row=>row.origin==='npm'&&!row.default);
  for(const library of installedOptIn){
    const own=receipt.bundleModules.find(row=>row.target===library.output);
    assert(own,'missing dedicated WXT asset for '+library.id);
    const wrapper='src/'+library.output;
    assert(own.modules.some(module=>module.path===wrapper&&module.renderedLength>0),
      'missing true source adapter in '+library.output);
    assert(own.modules.some(module=>module.npm?.name===library.npm),
      'missing real upstream npm implementation: '+library.id);
    for(const target of ['sw.js','libs/runtime/page-core.js',
      'scripting/sandbox/worker-runtime.js','ui/tool-shell.js']){
      const part=receipt.bundleModules.find(row=>row.target===target);
      assert(part,'missing fixed entry '+target);
      assert(!part.modules.some(module=>module.path===wrapper||module.npm?.name===library.npm),
        'optional '+library.id+' leaked into startup/default '+target);
    }
  }
  for(const framework of Object.values(PAGE_FRAMEWORK_RUNTIMES)){
    assert(receipt.report.files.some(file=>file.path===framework.output),
      'standalone React/Vue asset must ship separately');
    assert(!receipt.bundleModules.some(row=>row.modules.some(module=>module.path===framework.source)),
      'standalone framework was inadvertently duplicated in a WXT output: '+framework.id);
  }
  const jquery=await readFile('dist/'+mode+'/'+PINNED_USER_SCRIPT_LIBRARIES.jquery.output);
  assert.equal(createHash('sha256').update(jquery).digest('hex'),PINNED_USER_SCRIPT_LIBRARIES.jquery.sha256);
});
