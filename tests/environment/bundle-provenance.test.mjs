import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,mkdir,realpath,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {describeBundle,collectBundleEvidence,assertLibraryModuleBoundary,recordBuildFailure,trustedBookmarkStyle} from '../../scripts/bundle-provenance.mjs';
import {BUILTIN_CATALOG} from '../../src/libs/catalog.js';
const root='/repo';
test('fixed Bookmark CSS keeps its exact source pin after leaving the JS bundle',async t=>{
  const css=trustedBookmarkStyle();
  assert.match(css,/\.bm-app\{/);
  assert.doesNotMatch(css,/\/\*|url\s*\(/i);
  const project=await realpath(await mkdtemp(join(tmpdir(),'bookmark-style-pin-')));
  t.after(()=>rm(project,{recursive:true,force:true}));
  const path='examples/sidebar-tools/bookmark-manager/src/react/style.css',file=join(project,path);
  await mkdir(join(file,'..'),{recursive:true});
  const bytes=await readFile(resolve(path));
  await writeFile(file,bytes);
  assert.equal(trustedBookmarkStyle(project),css);
  await writeFile(file,Buffer.concat([bytes,Buffer.from('\n.bm-app{display:none}') ]));
  assert.throws(()=>trustedBookmarkStyle(project),/Trusted Bookmark React source changed/);
  await rm(file);await symlink(resolve(path),file);
  assert.throws(()=>trustedBookmarkStyle(project),/must not be a symlink/);
});
const chunk={fileName:'sw.js',modules:{
  '/repo/src/sw.js':{renderedLength:10,originalLength:20},
  '/repo/node_modules/@wxt-dev/browser/src/index.mjs':{renderedLength:5,originalLength:50},
  '/repo/src/unused.js':{renderedLength:0,originalLength:100}
}};
const lock={packages:{'node_modules/@wxt-dev/browser':{version:'1.0.0',resolved:'https://registry.example/pkg.tgz',integrity:'sha512-test'}}};
test('actual Rollup modules retain separate npm identity and zero-rendered evidence',()=>{
  const row=describeBundle({chunk,root,lock});
  assert.equal(row.target,'sw.js');assert.equal(row.modules.length,3);
  assert.equal(row.modules[0].npm.name,'@wxt-dev/browser');
  assert.equal(row.modules.find(row=>row.path==='src/unused.js').renderedLength,0);
  assert.match(row.note,/not final bytes/);
});
test('independent npm implementations stay in their own outputs and raw libraries are never bundled',()=>{
  for(const [path,owner] of [['src/libs/packages/lodash.js','libs/packages/lodash.js'],
    ['node_modules/lodash-es/get.js','libs/packages/lodash.js'],['node_modules/dayjs/dayjs.min.js','libs/packages/dayjs.js']]){
    assert.doesNotThrow(()=>assertLibraryModuleBoundary(owner,path));
    for(const target of ['sw.js','libs/runtime/page-core.js','scripting/sandbox/worker-runtime.js','ui/tool-shell.js'])
      assert.throws(()=>assertLibraryModuleBoundary(target,path),/implementation unexpectedly bundled/);
  }
  for(const row of Object.values(BUILTIN_CATALOG.libraries).filter(row=>!row.default&&row.origin==='npm')){
    assert.doesNotThrow(()=>assertLibraryModuleBoundary(row.output,'node_modules/'+row.npm+'/index.js',row.npm));
    assert.throws(()=>assertLibraryModuleBoundary('sw.js','node_modules/'+row.npm+'/index.js',row.npm),
      /implementation unexpectedly bundled/,'opt-in npm package must not enter the SW: '+row.id);
  }
  for(const path of ['src/libs/page-frameworks/react-19.2.0.js',
    'src/libs/page-frameworks/vue-3.5.22.js','node_modules/react/index.js',
    'node_modules/react-dom/client.js','node_modules/@vue/runtime-core/dist/runtime-core.esm-bundler.js'])
    assert.throws(()=>assertLibraryModuleBoundary('sw.js',path),/implementation unexpectedly bundled/);
  for(const path of ['src/libs/core.js','src/libs/catalog.js','src/libs/vendor/my-utils/1.0.0/index.js'])
    assert.throws(()=>assertLibraryModuleBoundary('sw.js',path),/implementation unexpectedly bundled/);
  assert.doesNotThrow(()=>assertLibraryModuleBoundary('sw.js','src/libs/runtime-contract.js'));
  assert.doesNotThrow(()=>assertLibraryModuleBoundary('scripting/sandbox/worker-runtime.js','src/libs/core.js'));
});
test('a failed oversized build preserves the offending graph separately from the last success',async t=>{
  const evidence=await mkdtemp(join(tmpdir(),'opendesk-failed-build-'));
  const directory=await mkdtemp(join(tmpdir(),'opendesk-failed-modules-'));
  t.after(()=>Promise.all([rm(evidence,{recursive:true,force:true}),rm(directory,{recursive:true,force:true})]));
  const prior='{"status":"passed","prior":"preserved"}\n';
  await writeFile(join(evidence,'build-production.json'),prior);
  await writeFile(join(directory,'sw.js.json'),JSON.stringify(describeBundle({chunk,root,lock})));
  const error=Object.assign(Error('over budget'),{target:'sw.js',bytes:328942,budgetBytes:327680});
  const wrapped=new Error('Failed to build sw',{cause:error});
  const path=await recordBuildFailure({directory,evidence,mode:'production',attemptId:'test-attempt',error:wrapped,sourceInputs:[{path:'src/sw.js',sha256:'b'.repeat(64)}]});
  const failed=JSON.parse(await readFile(path,'utf8'));
  assert.equal(failed.status,'failed');assert.equal(failed.packageVerified,false);
  assert.equal(failed.error.excessBytes,1262);assert.equal(failed.bundleModules[0].target,'sw.js');
  assert.equal(failed.error.message,'Failed to build sw');assert.equal(failed.error.causes[0].message,'over budget');
  assert.equal(failed.sourceInputs[0].path,'src/sw.js');
  assert.equal(await readFile(join(evidence,'build-production.json'),'utf8'),prior);
  assert.deepEqual(JSON.parse(await readFile(join(evidence,'build-production-latest.json'),'utf8')),
    {status:'failed',mode:'production',attemptId:'test-attempt',diagnostic:path});
});
test('partial diagnostic JSON and circular causes cannot leave a stale success marker',async t=>{
  const evidence=await mkdtemp(join(tmpdir(),'opendesk-partial-failure-'));
  const directory=await mkdtemp(join(tmpdir(),'opendesk-partial-modules-'));
  t.after(()=>Promise.all([rm(evidence,{recursive:true,force:true}),rm(directory,{recursive:true,force:true})]));
  await writeFile(join(evidence,'build-production-latest.json'),'{"status":"passed"}');
  await writeFile(join(directory,'sw.js.json'),'{"target":');
  const error=new Error('write interrupted');error.cause=error;
  const path=await recordBuildFailure({directory,evidence,mode:'production',error});
  const failed=JSON.parse(await readFile(path,'utf8'));
  assert.equal(failed.error.message,'write interrupted');assert.deepEqual(failed.bundleModules,[]);
  assert.equal(failed.diagnosticErrors[0].path,'sw.js.json');
  assert.equal(JSON.parse(await readFile(join(evidence,'build-production-latest.json'),'utf8')).status,'failed');
});
test('privileged entries reject historical, user project and standalone vendor modules',()=>{
  for(const path of ['examples/programs/sample/main.js','docs/contracts/source-snapshots/lib.js','src/vendor/jquery.js'])
    assert.throws(()=>describeBundle({chunk:{fileName:'sw.js',modules:{['/repo/'+path]:{}}},root,lock}),/cannot enter/);
  assert.throws(()=>describeBundle({chunk,root,lock:{packages:{}}}),/missing lock/);
});
test('receipt collection requires every fixed output and binds final verified hashes',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'r9-provenance-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  await assert.rejects(collectBundleEvidence(directory,['sw.js'],[]),/Incomplete/);
  await writeFile(join(directory,'sw.js.json'),JSON.stringify(describeBundle({chunk,root,lock})));
  const rows=await collectBundleEvidence(directory,['sw.js'],[{path:'sw.js',bytes:42,sha256:'a'.repeat(64)}]);
  assert.equal(rows[0].bytes,42);assert.equal(rows[0].sha256,'a'.repeat(64));
  await assert.rejects(collectBundleEvidence(directory,['sw.js'],[]),/does not match/);
});

test('reviewed Time Review markup and logic can enter only the pinned existing sidebar host',()=>{
  const inputs=[
    'examples/sidebar-tools/time-review/src/index.html',
    'examples/sidebar-tools/time-review/src/main.js'
  ];
  const approved={fileName:'ui/sidebar-tool-host.js',modules:Object.fromEntries(
    inputs.map(path=>[resolve(path),{renderedLength:12,originalLength:40}]))};
  const row=describeBundle({chunk:approved,lock:{packages:{}}});
  assert.equal(row.modules.length,2);
  for(const source of row.modules)
    assert.match(source.reviewedFirstPartyBlob,/^[0-9a-f]{40}$/);
  for(const target of ['sw.js','ui/tool-shell.js','scripting/sandbox/sandbox.js'])
    assert.throws(()=>describeBundle({chunk:{...approved,fileName:target},lock:{packages:{}}}),
      /cannot enter a privileged fixed bundle/);
  for(const path of ['examples/sidebar-tools/other/src/main.js',
    'examples/sidebar-tools/time-review/src/unsafe.js',
    'src/vendor/legacy.js','docs/contracts/source-snapshots/tool.js'])
    assert.throws(()=>describeBundle({chunk:{
      fileName:'ui/sidebar-tool-host.js',modules:{[resolve(path)]:{}}},lock:{packages:{}}}),
      /cannot enter a privileged fixed bundle/,
      'no path-prefix escape is permitted for '+path);
});

test('a modified Time Review source must not enter privileged fixed output under the old pin',async t=>{
  const project=await realpath(await mkdtemp(join(tmpdir(),'opendesk-compiled-review-')));
  t.after(()=>rm(project,{recursive:true,force:true}));
  const path='examples/sidebar-tools/time-review/src/index.html';
  const file=join(project,path);
  await mkdir(join(project,'examples/sidebar-tools/time-review/src'),{recursive:true});
  await writeFile(file,'<main>unreviewed markup</main>');
  assert.throws(()=>describeBundle({chunk:{
    fileName:'ui/sidebar-tool-host.js',modules:{[file]:{}}},root:project,lock:{packages:{}}}),
    /Trusted Time Review source changed/,
    'a native HTML/JS revision requires explicit source-blob re-review before build');
});
test('a symlink cannot substitute a pinned Time Review source in privileged output',async t=>{
  const project=await realpath(await mkdtemp(join(tmpdir(),'opendesk-compiled-symlink-')));
  t.after(()=>rm(project,{recursive:true,force:true}));
  const path='examples/sidebar-tools/time-review/src/index.html';
  const file=join(project,path);
  await mkdir(join(project,'examples/sidebar-tools/time-review/src'),{recursive:true});
  await symlink(resolve(path),file);
  assert.throws(()=>describeBundle({chunk:{
    fileName:'ui/sidebar-tool-host.js',modules:{[file]:{}}
  },root:project,lock:{packages:{}}}),/Trusted Time Review source must not be a symlink/);
});

test('R3.1 trusted Bookmark React compiles only four pinned first-party blobs into the existing tool-shell',()=>{
  const inputs=[
    'examples/sidebar-tools/bookmark-manager/src/model.js',
    'examples/sidebar-tools/bookmark-manager/src/service.js',
    'examples/sidebar-tools/bookmark-manager/src/react/App.jsx',
    'examples/sidebar-tools/bookmark-manager/src/react/style.css'
  ];
  const modules=Object.fromEntries(inputs.map(path=>[resolve(path),{renderedLength:42,originalLength:42}]));
  const compiled=describeBundle({chunk:{fileName:'ui/tool-shell.js',modules},lock:{packages:{}}});
  assert.equal(compiled.modules.length,inputs.length);
  for(const row of compiled.modules)assert.match(row.reviewedFirstPartyBlob,/^[0-9a-f]{40}$/);
  for(const target of ['sw.js','ui/sidebar-tool-host.js','scripting/sandbox/sandbox.js'])
    assert.throws(()=>describeBundle({chunk:{fileName:target,modules},lock:{packages:{}}}),
      /cannot enter a privileged fixed bundle/);
  for(const path of ['examples/sidebar-tools/bookmark-manager/src/main.js',
    'examples/sidebar-tools/bookmark-manager/preview/react/src/formal.jsx',
    'examples/sidebar-tools/bookmark-manager/preview/react/src/main.jsx',
    'examples/sidebar-tools/bookmark-manager/bookmark-manager.opendesk-tool.json'])
    assert.throws(()=>describeBundle({chunk:{
      fileName:'ui/tool-shell.js',modules:{[resolve(path)]:{renderedLength:1,originalLength:1}}
    },lock:{packages:{}}}),/cannot enter a privileged fixed bundle/,
    'installed, arbitrary, or non-audited tool code must not be privileged: '+path);
});
test('R3.1 modified trusted Bookmark App fails at build rather than silently executing new JSX',async t=>{
  const project=await realpath(await mkdtemp(join(tmpdir(),'opendesk-bookmark-pin-')));
  t.after(()=>rm(project,{recursive:true,force:true}));
  const path='examples/sidebar-tools/bookmark-manager/src/react/App.jsx';
  const file=join(project,path);
  await mkdir(join(project,'examples/sidebar-tools/bookmark-manager/src/react'),{recursive:true});
  await writeFile(file,'export default function Unexpected(){return null}');
  assert.throws(()=>describeBundle({chunk:{
    fileName:'ui/tool-shell.js',modules:{[file]:{renderedLength:8,originalLength:8}}
  },root:project,lock:{packages:{}}}),/Trusted Bookmark React source changed/);
});
test('R3.1 symlink substitution cannot bypass trusted Bookmark static pin',async t=>{
  const project=await realpath(await mkdtemp(join(tmpdir(),'opendesk-bookmark-symlink-')));
  t.after(()=>rm(project,{recursive:true,force:true}));
  const path='examples/sidebar-tools/bookmark-manager/src/model.js';
  const file=join(project,path);
  await mkdir(join(project,'examples/sidebar-tools/bookmark-manager/src'),{recursive:true});
  await symlink(resolve('src/ui/react/main.tsx'),file);
  assert.throws(()=>describeBundle({chunk:{
    fileName:'ui/tool-shell.js',modules:{[file]:{renderedLength:9,originalLength:9}}
  },root:project,lock:{packages:{}}}),/Trusted Bookmark React source must not be a symlink/);
});

test('AdBlock session fence is a fixed audited source and rejects byte drift',async t=>{
  const path='examples/sidebar-tools/adblock/trusted/dnr-session.js';
  const chunkFor=file=>({fileName:'sw.js',modules:{[file]:{renderedLength:1,originalLength:1}}});
  const accepted=describeBundle({chunk:chunkFor(resolve(path)),lock:{packages:{}}});
  assert.equal(accepted.modules[0].reviewedFirstPartyBlob,'d3e221eac17261a34751cb8ab035c622eb1b42a8');
  const project=await realpath(await mkdtemp(join(tmpdir(),'opendesk-adblock-session-pin-')));
  t.after(()=>rm(project,{recursive:true,force:true}));
  const file=join(project,path);
  await mkdir(join(project,'examples/sidebar-tools/adblock/trusted'),{recursive:true});
  await writeFile(file,(await readFile(resolve(path),'utf8'))+'\n// unreviewed drift\n');
  assert.throws(()=>describeBundle({chunk:chunkFor(file),root:project,lock:{packages:{}}}),
    /Trusted AdBlock source changed/);
});


test('R1.3 app-owned trusted background inputs require an exact reviewed Git blob',async t=>{
  const approved=[
    ['examples/sidebar-tools/ai-vip-share/trusted/provider-config.js','sw.js',
      'd09c57ef4bbc96f406bb2092feb9ff9b2465cf43'],
    ['examples/sidebar-tools/time-review/trusted/service.js','time-review/time-review-host.js',
      '3dfd773fa8cf38deeb23a5d5f9f56d0b27e11ff6']
  ];
  const make=(target,file,project=process.cwd())=>describeBundle({
    chunk:{fileName:target,modules:{[file]:{renderedLength:1,originalLength:1}}},
    root:project,lock:{packages:{}}
  });
  const project=await realpath(await mkdtemp(join(tmpdir(),'opendesk-app-owned-pin-')));
  t.after(()=>rm(project,{recursive:true,force:true}));
  for(const [source,target,pin] of approved){
    const row=make(target,resolve(source));
    assert.equal(row.modules[0].reviewedFirstPartyBlob,pin);
    assert.throws(()=>make('scripting/sandbox/worker-runtime.js',resolve(source)),/cannot enter/);
    const changed=join(project,source);
    await mkdir(join(changed,'..'),{recursive:true});
    await writeFile(changed,(await readFile(resolve(source),'utf8'))+'\\n// unsigned drift\\n');
    assert.throws(()=>make(target,changed,project),/Trusted app-owned source changed/);
  }
  for(const unknown of [
    'examples/sidebar-tools/ai-vip-share/trusted/remote-supplied.js',
    'examples/sidebar-tools/time-review/trusted/unsafe-background.js',
    'examples/programs/local-controller/src/main.js'
  ])assert.throws(()=>make('sw.js',resolve(unknown)),/cannot enter/);
});


test('Marketplace shares only the byte-pinned Prompt Shortcuts asset identity for uninstall cleanup',async ctx=>{
  const path='examples/sidebar-tools/prompt-shortcuts/trusted/asset-contract.js';
  const pin='86e95bff786e52efb9089f97126542430f39a716';
  const make=(target,root=process.cwd(),file=path)=>describeBundle({chunk:{fileName:target,
    modules:{[resolve(root,file)]:{renderedLength:1,originalLength:1}}},root,lock:{packages:{}}});
  for(const target of ['ui/marketplace.js','ui/sidebar-tool-host.js','agents/page-relay.js'])
    assert.equal(make(target).modules[0].reviewedFirstPartyBlob,pin);
  for(const target of ['sw.js','ui/tool-shell.js','marketplace/market-host.js','scripting/sandbox/sandbox.js'])
    assert.throws(()=>make(target),/cannot enter a privileged fixed bundle/);
  assert.throws(()=>make('ui/marketplace.js',process.cwd(),
    'examples/sidebar-tools/prompt-shortcuts/trusted/asset-host.js'),
    /cannot enter a privileged fixed bundle/);
  const root=await realpath(await mkdtemp(join(tmpdir(),'prompt-asset-cleanup-pin-')));
  ctx.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'examples/sidebar-tools/prompt-shortcuts/trusted'),{recursive:true});
  await writeFile(join(root,path),(await readFile(resolve(path),'utf8'))+'\n// unsigned change\n');
  assert.throws(()=>make('ui/marketplace.js',root),/Trusted Prompt Shortcuts source changed/);
});

test('first-party Clipper full-text notes store is pinned exclusively to the original Sidebar Host',async ctx=>{
  const path='examples/sidebar-tools/web-markdown-clipper/trusted/notes-store.js';
  const pin='a801ebcf0b932cf4a9425588a8e2dbada0de3963';
  const make=(target,root=process.cwd(),source=path)=>describeBundle({chunk:{fileName:target,
    modules:{[resolve(root,source)]:{renderedLength:1,originalLength:1}}},root,lock:{packages:{}}});
  assert.equal(make('ui/sidebar-tool-host.js').modules[0].reviewedFirstPartyBlob,pin);
  for(const target of ['sw.js','ui/tool-shell.js','ui/marketplace.js','agents/page-relay.js',
    'scripting/sandbox/sandbox.js','scripting/sandbox/worker-runtime.js'])
    assert.throws(()=>make(target),/cannot enter a privileged fixed bundle/);
  assert.throws(()=>make('ui/sidebar-tool-host.js',process.cwd(),
    'examples/sidebar-tools/web-markdown-clipper/trusted/unreviewed.js'),
    /cannot enter a privileged fixed bundle/);
  const root=await realpath(await mkdtemp(join(tmpdir(),'clip-notes-pin-')));
  ctx.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'examples/sidebar-tools/web-markdown-clipper/trusted'),{recursive:true});
  await writeFile(join(root,path),(await readFile(resolve(path),'utf8'))+'\n// unsigned change\n');
  assert.throws(()=>make('ui/sidebar-tool-host.js',root),/Trusted Web Clipper source changed/);
});

test('Prompt Shortcuts OD rail bridge requires its reviewed SW blob and fixed outputs',async ctx=>{
  const path='examples/sidebar-tools/prompt-shortcuts/trusted/rail-open.js';
  const pin='5f0184b28abe5d8e03855f9c130d45faba807d1e';
  const make=(target,root=process.cwd())=>describeBundle({chunk:{fileName:target,
    modules:{[resolve(root,path)]:{renderedLength:1,originalLength:1}}},root,lock:{packages:{}}});
  for(const target of ['sw.js','agents/page-relay.js'])
    assert.equal(make(target).modules[0].reviewedFirstPartyBlob,pin);
  for(const target of ['ui/tool-shell.js','ui/sidebar-tool-host.js','scripting/sandbox/worker-runtime.js'])
    assert.throws(()=>make(target),/cannot enter a privileged fixed bundle/);
  const root=await realpath(await mkdtemp(join(tmpdir(),'prompt-rail-pin-')));
  ctx.after(()=>rm(root,{recursive:true,force:true}));
  const file=join(root,path);
  await mkdir(join(root,'examples/sidebar-tools/prompt-shortcuts/trusted'),{recursive:true});
  await writeFile(file,(await readFile(resolve(path),'utf8'))+'\n// unsigned edit\n');
  assert.throws(()=>make('sw.js',root),/Trusted Prompt Shortcuts source changed/);
});

test('Prompt Shortcuts jump uses one reviewed source only in the Page Relay',async ctx=>{
  const path='examples/programs/chatgpt-jump-top/src/conversation.js';
  const make=(target,root=process.cwd())=>describeBundle({chunk:{fileName:target,
    modules:{[resolve(root,path)]:{renderedLength:1,originalLength:1}}},root,lock:{packages:{}}});
  assert.equal(make('agents/page-relay.js').modules[0].reviewedFirstPartyBlob,
    'ea1dcb3114175c2b79e134df1794a1fdd93460c9');
  for(const target of ['sw.js','ui/sidebar-tool-host.js','ui/tool-shell.js'])
    assert.throws(()=>make(target),/cannot enter a privileged fixed bundle/);
  const root=await realpath(await mkdtemp(join(tmpdir(),'prompt-jump-pin-')));
  ctx.after(()=>rm(root,{recursive:true,force:true}));
  const file=join(root,path);
  await mkdir(join(root,'examples/programs/chatgpt-jump-top/src'),{recursive:true});
  await writeFile(file,(await readFile(resolve(path),'utf8'))+'\n// unreviewed edit\n');
  assert.throws(()=>make('agents/page-relay.js',root),/Trusted Prompt Shortcuts source changed/);
});

test('removed Prompt Shortcuts site bindings cannot regain privileged output admission',async ctx=>{
  const path='examples/sidebar-tools/prompt-shortcuts/trusted/conversation-sites.js';
  const make=(target,root=process.cwd())=>describeBundle({chunk:{fileName:target,
    modules:{[resolve(root,path)]:{renderedLength:1,originalLength:1}}},root,lock:{packages:{}}});
  const targets=['agents/page-relay.js','sw.js','ui/sidebar-tool-host.js','ui/tool-shell.js'];
  for(const target of targets)
    assert.throws(()=>make(target),/cannot enter a privileged fixed bundle/);
  const root=await realpath(await mkdtemp(join(tmpdir(),'prompt-site-pin-')));
  ctx.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'examples/sidebar-tools/prompt-shortcuts/trusted'),{recursive:true});
  await writeFile(join(root,path),'export const sites = [];\n');
  for(const target of targets)
    assert.throws(()=>make(target,root),/cannot enter a privileged fixed bundle/,
      'recreating the removed path must not restore approval: '+target);
});

test('R1.3 pinned shared Markdown converter can only enter the existing Page Relay',async ctx=>{
  const path='examples/shared/markdown/convert.js';
  const legacy='examples/sidebar-tools/web-markdown-clipper/trusted/convert.js';
  const make=(target,root=process.cwd())=>describeBundle({chunk:{fileName:target,
    modules:{[resolve(root,path)]:{renderedLength:20,originalLength:40}}},root,lock:{packages:{}}});
  const row=make('agents/page-relay.js');
  assert.equal(row.modules[0].path,path);
  assert.equal(row.modules[0].reviewedFirstPartyBlob,'58516382e28fc03b89b58371f9b905d89e05ae27');
  for(const target of ['sw.js','ui/tool-shell.js','ui/sidebar-tool-host.js','scripting/sandbox/worker-runtime.js'])
    assert.throws(()=>make(target),/cannot enter a privileged fixed bundle/,
      'shared converter must not cross the Page Relay boundary: '+target);
  assert.throws(()=>describeBundle({chunk:{fileName:'agents/page-relay.js',
    modules:{[resolve(legacy)]:{renderedLength:1,originalLength:1}}},lock:{packages:{}}}),
    /cannot enter a privileged fixed bundle/,
    'removed legacy Clipper path must never be treated as an approved source');
  const root=await realpath(await mkdtemp(join(tmpdir(),'shared-markdown-pin-')));
  ctx.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'examples/shared/markdown'),{recursive:true});
  await writeFile(join(root,path),(await readFile(resolve(path),'utf8'))+'\n// unsigned edit\n');
  assert.throws(()=>make('agents/page-relay.js',root),/Shared Markdown source changed/);
  assert.throws(()=>make('sw.js',root),/cannot enter a privileged fixed bundle/);
});

test('R1.3 Reading TOC model, overview, placement, page and view require audited Page Relay pins',async ctx=>{
  const names=['overview.js','model.js','placement.js','page.js','view.js'];
  const prefix='examples/sidebar-tools/reading-toc/trusted/';
  const make=(target,root=process.cwd(),list=names)=>describeBundle({chunk:{fileName:target,
    modules:Object.fromEntries(list.map(name=>[resolve(root,prefix+name),
      {renderedLength:20,originalLength:100}]))},root,lock:{packages:{}}});
  const row=make('agents/page-relay.js');
  assert.equal(row.modules.length,names.length);
  for(const item of row.modules)assert.match(item.reviewedFirstPartyBlob,/^[0-9a-f]{40}$/);
  for(const target of ['sw.js','ui/tool-shell.js','ui/sidebar-tool-host.js','scripting/sandbox/worker-runtime.js'])
    assert.throws(()=>make(target),/cannot enter a privileged fixed bundle/);
  const tmp=await realpath(await mkdtemp(join(tmpdir(),'reading-toc-source-pin-')));
  ctx.after(()=>rm(tmp,{recursive:true,force:true}));
  await mkdir(join(tmp,prefix),{recursive:true});
  for(const name of ['model.js','page.js','view.js']){
    const path=join(tmp,prefix,name),bytes=await readFile(resolve(prefix,name));
    await writeFile(path,bytes);
    assert.equal(make('agents/page-relay.js',tmp,[name]).modules[0].reviewedFirstPartyBlob,
      row.modules.find(item=>item.path===prefix+name).reviewedFirstPartyBlob);
    await writeFile(path,Buffer.concat([bytes,Buffer.from('\n// unsigned edit\n')]));
    assert.throws(()=>make('agents/page-relay.js',tmp,[name]),
      /Trusted Reading TOC source changed/);
    await rm(path);await symlink(resolve(prefix,name),path);
    assert.throws(()=>make('agents/page-relay.js',tmp,[name]),/must not be a symlink/);
  }
});

test('shared visible-selection helper is pinned only into existing Page Relay',async t=>{
  const file='examples/shared/markdown/selection.js';
  const project=await realpath(await mkdtemp(join(tmpdir(),'opendesk-selection-pin-')));
  t.after(()=>rm(project,{recursive:true,force:true}));
  await mkdir(join(project,'examples/shared/markdown'),{recursive:true});
  const source=await readFile(file,'utf8');
  await writeFile(join(project,file),source);
  const make=target=>describeBundle({chunk:{fileName:target,modules:{
    [resolve(project,file)]:{renderedLength:1,originalLength:source.length}
  }},root:project,lock:{packages:{}}});
  assert.equal(make('agents/page-relay.js').modules[0].reviewedFirstPartyBlob,
    '747d1afe2cee9a745552a3a7ceb699d1af83b35b');
  for(const target of ['sw.js','ui/tool-shell.js','ui/sidebar-tool-host.js',
    'scripting/sandbox/worker-runtime.js','libs/runtime/page-core.js'])
    assert.throws(()=>make(target),/Historical\/user\/vendor code cannot enter/);
  await writeFile(join(project,file),source+'\n// changed');
  assert.throws(()=>make('agents/page-relay.js'),/Shared Markdown source changed/);
});

// R1.3: trusted bridge DOM code needs no independent-program admission exception.
test('fixed ChatGPT bridge uses src ownership without admitting independent queue code',()=>{
  const target='agents/chatgpt-fixed-bridge.js';
  const describe=path=>describeBundle({root,lock:{packages:{}},chunk:{fileName:target,
    modules:{[root+'/'+path]:{renderedLength:1,originalLength:1}}}});
  const row=describe('src/native-agent/chatgpt-bridge-site.js').modules[0];
  assert.equal(row.path,'src/native-agent/chatgpt-bridge-site.js');
  assert.equal(row.reviewedFirstPartyBlob,undefined);
  for(const path of ['examples/programs/chatgpt-send-queue/src/site.js',
    'examples/programs/chatgpt-send-queue/src/engine.js'])
    assert.throws(()=>describe(path),/cannot enter a privileged fixed bundle/);
});
