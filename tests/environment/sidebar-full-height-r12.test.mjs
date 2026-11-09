import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {checkSidebarToolProjectPackage} from '../../scripts/build-sidebar-tool.mjs';

const read=path=>readFile(new URL('../../'+path,import.meta.url),'utf8');

// The former official-ID/release eligibility and intrinsic-height source
// assertions were superseded by the universal sandbox canvas contract.
// Runtime coverage lives in sidebar-tools-host.test.mjs and
// sidebar-tool-layout-browser.test.mjs (real Host + opaque sandbox).

test('R1.2 BUILDER: checked-in standalone installers must match the current formal sources',async()=>{
  for(const id of ['web-markdown-clipper','prompt-shortcuts']){
    const base='examples/sidebar-tools/'+id;
    const cfg=JSON.parse(await read(base+'/tool.config.json'));
    const result=await checkSidebarToolProjectPackage(base);
    assert.equal(result.status,'PROJECT_PACKAGE_MATCH',id);
    assert.equal(result.version,cfg.version,id);
  }
});

test('R1.2 SOURCE_ONLY: working area changes bump formal official tool versions',async()=>{
  for(const id of [
    'markdown-workbench','knowledge-inbox','web-markdown-clipper','prompt-shortcuts'
  ]){
    const cfg=JSON.parse(await read('examples/sidebar-tools/'+id+'/tool.config.json'));
    assert.equal(cfg.id,id);
    assert.ok(typeof cfg.version==='string'&&cfg.version.split('.').length===3,id);
  }
});
