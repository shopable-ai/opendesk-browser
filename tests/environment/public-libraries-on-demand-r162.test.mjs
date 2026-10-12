// R16.2: A locally preinstalled asset is NOT an eager runtime dependency.
// Inspect actual loader fetch requests, not only catalog paths or source text.
// Node tests here do not impersonate a native Chrome resource receipt.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {
  BUILTIN_ABI,BUILTIN_RUNTIME_CATALOG,BUILTIN_RESOURCE_PATHS,
  BUILTIN_PACKAGE_RESOURCE_LIMIT
} from '../../src/libs/runtime-contract.js';
import {BUILTIN_CATALOG} from '../../src/libs/catalog.js';
import {
  loadBuiltinPageSource,loadBuiltinWorkerSource,loadPackagedOptionalPageLibrary,loadPackagedOptionalPageLibraries
} from '../../src/libs/loader.js';
import {loadPackagedPageFramework} from '../../src/libs/page-frameworks/loader.js';
import {PAGE_FRAMEWORK_RUNTIMES,PAGE_FRAMEWORK_RESOURCE_LIMIT} from '../../src/libs/page-frameworks/contract.js';
import {BUILD_POLICY} from '../../scripts/build-contract.mjs';

globalThis.crypto ||= webcrypto;
const sha=text=>createHash('sha256').update(text).digest('hex');
const base='chrome-extension://opendesk-library-fixture/';
const runtime={id:'opendesk-library-fixture',getURL:path=>base+path};
const optional=Object.values(BUILTIN_CATALOG.libraries)
  .filter(row=>!row.default&&row.worlds.includes('USER_SCRIPT'));

async function fixture(){
  const sources=new Map();
  for(const path of BUILTIN_RESOURCE_PATHS){
    const vendor=Object.values(BUILTIN_CATALOG.libraries).find(row=>row.origin==='vendor'&&row.output===path);
    let data;
    if(path===BUILTIN_CATALOG.bootstrap)data=await readFile('src/libs/runtime/bootstrap.js','utf8');
    else if(vendor)data=await readFile(vendor.source,'utf8');
    else data='// fixed-fixture resource '+path;
    sources.set(path,data);
  }
  const resources=BUILTIN_RESOURCE_PATHS.map(path=>{
    const code=sources.get(path);
    return {path,bytes:Buffer.byteLength(code),sha256:sha(code)};
  });
  const manifest={format:'opendesk.builtin-resources.v2',abi:BUILTIN_ABI,
    catalogSha256:sha(JSON.stringify(BUILTIN_RUNTIME_CATALOG)),resources};
  sources.set(BUILTIN_CATALOG.resourceManifest,JSON.stringify(manifest));
  const requests=[];
  const fetchImpl=async(url,options)=>{
    const path=url.startsWith(base)?url.slice(base.length):null;
    requests.push({path,url,options});
    return {ok:path!==null&&sources.has(path),url,redirected:false,
      text:async()=>sources.get(path)??''};
  };
  return {sources,manifest,requests,fetchImpl};
}
const expectedDefaults=world=>[
  BUILTIN_CATALOG.bootstrap,
  ...Object.values(BUILTIN_CATALOG.libraries)
    .filter(row=>row.default&&row.worlds.includes(world)).map(row=>row.output),
  world==='USER_SCRIPT'?BUILTIN_CATALOG.pageCore:BUILTIN_CATALOG.controllerCore
];

test('all optional libraries are absent from Page and Controller default fetches',async()=>{
  const f=await fixture();
  for(const world of ['USER_SCRIPT','CONTROLLER']){
    f.requests.length=0;
    const loader=world==='USER_SCRIPT'?loadBuiltinPageSource:loadBuiltinWorkerSource;
    const result=await loader({runtime,fetchImpl:f.fetchImpl});
    assert.equal(result.abi,BUILTIN_ABI);
    assert.deepEqual(f.requests.map(row=>row.path),
      [BUILTIN_CATALOG.resourceManifest,...expectedDefaults(world)]);
    assert(f.requests.every(({url,options})=>url.startsWith(base)&&
      options.cache==='no-store'&&options.credentials==='omit'));
    assert.equal(result.resources.length,expectedDefaults(world).length);
    for(const lib of optional)
      assert(!f.requests.some(row=>row.path===lib.output),'eager optional load '+lib.id);
    for(const fw of Object.values(PAGE_FRAMEWORK_RUNTIMES))
      assert(!f.requests.some(row=>row.path===fw.output),'eager framework load '+fw.id);
  }
});

test('each explicit selection fetches only its own hashed code and manifest',async()=>{
  const f=await fixture();
  for(const lib of optional){
    f.requests.length=0;
    const result=await loadPackagedOptionalPageLibrary(lib.id,{runtime,fetchImpl:f.fetchImpl});
    assert.equal(result.id,lib.id);
    assert.equal(result.version,lib.version);
    assert.equal(result.code,f.sources.get(lib.output));
    assert.equal(result.sha256,sha(result.code));
    assert.deepEqual(f.requests.map(row=>row.path),
      [BUILTIN_CATALOG.resourceManifest,lib.output],
      'independent on-demand resource '+lib.id+' must not fetch other libraries');
  }
  f.requests.length=0;
  await assert.rejects(loadPackagedOptionalPageLibrary('not-reviewed',{runtime,fetchImpl:f.fetchImpl}),
    error=>error.code==='E_BUILTIN_DECLARATION');
  await assert.rejects(loadPackagedOptionalPageLibrary('lodash',{runtime,fetchImpl:f.fetchImpl}),
    error=>error.code==='E_BUILTIN_DECLARATION');
  assert.deepEqual(f.requests,[],'invalid opt-in cannot even fetch the manifest');

  const victim=optional.find(row=>row.origin==='npm');
  assert(victim);
  f.sources.set(victim.output,f.sources.get(victim.output)+'\n// mutated');
  await assert.rejects(loadPackagedOptionalPageLibrary(victim.id,{runtime,fetchImpl:f.fetchImpl}),
    error=>error.code==='E_BUILTIN_HASH');
});

test('React and ReactDOM share one pinned resource; Vue is independently lazy',async()=>{
  for(const id of ['react','vue']){
    const descriptor=PAGE_FRAMEWORK_RUNTIMES[id],code=await readFile(descriptor.source,'utf8');
    assert.equal(Buffer.byteLength(code),descriptor.bytes,'framework bytes drifted: '+id);
    assert.equal(sha(code),descriptor.sha256,'framework checksum drifted: '+id);
    const requested=[];
    const fetchImpl=async(url,options)=>{
      requested.push({url,options});
      return {ok:url===runtime.getURL(descriptor.output),url,redirected:false,
        text:async()=>code};
    };
    const loaded=await loadPackagedPageFramework(id,{runtime,fetchImpl});
    assert.equal(loaded.code,code);
    assert.deepEqual(requested.map(row=>row.url),[runtime.getURL(descriptor.output)]);
    assert.equal(requested[0].options.credentials,'omit');
    assert.equal(requested[0].options.cache,'no-store');
    assert(descriptor.bytes<PAGE_FRAMEWORK_RESOURCE_LIMIT);
  }
  await assert.rejects(loadPackagedPageFramework('react-dom',{runtime,fetchImpl:async()=>{throw Error('unexpected network')}}),
    error=>error.code==='E_PAGE_FRAMEWORK_UNKNOWN',
    'ReactDOM must not be a second independently downloaded runtime');
});

test('build and runtime caps match; only SW has its distinct larger budget',()=>{
  assert.equal(BUILTIN_PACKAGE_RESOURCE_LIMIT,BUILD_POLICY.productionBytes);
  assert(BUILD_POLICY.serviceWorkerProductionBytes>=BUILD_POLICY.productionBytes,
    'SW budget is independently configured and must not use the library cap');
  assert(BUILD_POLICY.developmentBytes>=BUILD_POLICY.serviceWorkerProductionBytes);
  assert(PAGE_FRAMEWORK_RESOURCE_LIMIT>=Math.max(
    ...Object.values(PAGE_FRAMEWORK_RUNTIMES).map(row=>row.bytes)),
    'the Page framework runtime limit must cover the actual fixed resources');
  assert.equal(BUILD_POLICY.splitChunks,false);
  assert.equal(BUILD_POLICY.runtimeChunk,false);
  assert.equal(BUILD_POLICY.formats[0],'iife');
});

// Multi selections share one manifest. No optional asset is eagerly loaded.
test('multi Page opt-ins fetch only selected SHA-verified code from one manifest',async()=>{
  const f=await fixture(),ids=['axios','queryString','cheerio'];
  const result=await loadPackagedOptionalPageLibraries(ids,{runtime,fetchImpl:f.fetchImpl});
  assert.deepEqual(result.map(item=>item.id),ids);
  assert.deepEqual(f.requests.map(item=>item.path),[
    BUILTIN_CATALOG.resourceManifest,...ids.map(id=>BUILTIN_CATALOG.libraries[id].output)
  ]);
  assert(result.every(item=>item.sha256===sha(item.code)&&item.abi===BUILTIN_ABI));
  f.requests.length=0;
  for(const bad of [[],['axios','axios'],['axios','lodash'],['missing']])
    await assert.rejects(loadPackagedOptionalPageLibraries(bad,{runtime,fetchImpl:f.fetchImpl}),
      error=>error.code==='E_BUILTIN_DECLARATION');
  assert.deepEqual(f.requests,[],'invalid declarations never load even the manifest');
  f.sources.set(BUILTIN_CATALOG.libraries.queryString.output,'// tampered');
  await assert.rejects(loadPackagedOptionalPageLibraries(ids,{runtime,fetchImpl:f.fetchImpl}),
    error=>error.code==='E_BUILTIN_HASH');
});
