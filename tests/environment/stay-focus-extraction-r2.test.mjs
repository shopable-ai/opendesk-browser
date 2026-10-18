import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describeBundle} from '../../scripts/bundle-provenance.mjs';

const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const app='examples/sidebar-tools/stay-focus/';
const modules=["blocked.js","catalog.js","host-controls.js","lifecycle.js","model.js","page-notice.js","policy.js","rule-host.js","rule-ownership.js","service.js","tool-host.js"];
const resources=["blocked-always.html","blocked-quota.html","blocked-schedule.html","blocked-session.html","blocked.css"];

test('Stay Focus business code has exactly one app-owned trusted source',async()=>{
  for(const file of modules){
    const impl=read(app+'trusted/'+file);
    const shim=read('src/stay-focus/'+file);
    assert.ok(impl.length>100,'missing real app implementation: '+file);
    assert.equal(shim,
      "// Compatibility export only; Stay Focus business source is owned by its installable app.\n"+
      "export * from '../../examples/sidebar-tools/stay-focus/trusted/"+file+"';\n");
  }
  const newPolicy=await import('../../examples/sidebar-tools/stay-focus/trusted/policy.js');
  const oldPolicy=await import('../../src/stay-focus/policy.js');
  assert.strictEqual(newPolicy.focusPackageHash,oldPolicy.focusPackageHash);
  assert.equal(newPolicy.FOCUS_ID,'stay-focus');
  assert.equal(newPolicy.FOCUS_RULE_FIRST,730000);
  assert.equal(newPolicy.FOCUS_RULE_LAST,730199);
});
test('only reviewed UI files become an installable tool package, not privileged trusted code',()=>{
  const config=JSON.parse(read(app+'tool.config.json'));
  assert.equal(config.id,'stay-focus');
  assert.deepEqual(config.files,{html:'src/index.html',css:'src/style.css',js:'src/main.js'});
  assert.deepEqual(config.assets,[]);
  for(const file of Object.values(config.files))assert.ok(read(app+file).length>0);
  const catalog=JSON.parse(read('official-tools/catalog.json'));
  assert.equal(catalog.tools.filter(x=>x.id==='stay-focus').length,1);
  assert.equal(catalog.tools.find(x=>x.id==='stay-focus').project,'examples/sidebar-tools/stay-focus');
});
test('trusted entrypoints consume app-owned sources with stable Chrome restriction paths',()=>{
  for(const [path,name] of [
    ['src/sw.js','service.js'],
    ['src/entrypoints/stay-focus-controls.js','tool-host.js'],
    ['src/entrypoints/page-relay.js','page-notice.js'],
    ['src/entrypoints/blocked.js','blocked.js'],
    ['src/ui/sidebar-tools.js','policy.js'],
    ['src/ui/sidebar-tools/installation.js','lifecycle.js']
  ])assert.ok(read(path).includes('examples/sidebar-tools/stay-focus/trusted/'+name),path);
  const staging=read('scripts/prepare-public.mjs');
  assert.ok(staging.includes("'examples/sidebar-tools/stay-focus/trusted/blocked-'+reason+'.html'"));
  assert.ok(staging.includes("'examples/sidebar-tools/stay-focus/trusted/blocked.css'"));
  assert.ok(read('scripts/build-contract.mjs').includes("'./examples/sidebar-tools/stay-focus/trusted/blocked.js'"));
  for(const file of resources)assert.ok(read(app+'trusted/'+file).length>0);
  assert.ok(read('manifest.json').includes('stay-focus/blocked-quota.html'));
});
test('privileged service imports shared platform contracts rather than old product folders',()=>{
  const service=read(app+'trusted/service.js'),host=read(app+'trusted/tool-host.js');
  assert.match(service,/from '\.\.\/\.\.\/\.\.\/\.\.\/src\/sidebar-tools\/sender\.js'/);
  for(const content of [service,host]){
    assert.match(content,/from '\.\.\/\.\.\/\.\.\/\.\.\/src\/ui\/sidebar-tools\/package\.js'/);
    assert.doesNotMatch(content,/from '\.\.\/ui\/sidebar-tools\//);
  }
});

test('only pinned Stay Focus trusted module blobs enter fixed privileged outputs',()=>{
  const path=app+'trusted/policy.js',file=resolve(path);
  const graph=target=>describeBundle({chunk:{fileName:target,modules:{[file]:{
    originalLength:300,renderedLength:200}}},root:process.cwd(),lock:{packages:{}}});
  assert.match(graph('sw.js').modules[0].reviewedFirstPartyBlob,/^[a-f0-9]{40}$/);
  assert.match(graph('ui/stay-focus-controls.js').modules[0].reviewedFirstPartyBlob,/^[a-f0-9]{40}$/);
  assert.match(graph('knowledge/knowledge-host.js').modules[0].reviewedFirstPartyBlob,/^[a-f0-9]{40}$/);
  assert.throws(()=>graph('unregistered/custom.js'),/Historical\\/user\\/vendor code/);
  const untrusted=resolve('examples/sidebar-tools/quick-notes/src/main.js');
  assert.throws(()=>describeBundle({chunk:{fileName:'sw.js',modules:{[untrusted]:{
    originalLength:20,renderedLength:15}}},root:process.cwd(),lock:{packages:{}}}),
    /Historical\/user\/vendor code/);
});
