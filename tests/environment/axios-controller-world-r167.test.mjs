// R16.7: opt-in Controller Axios genuinely executes from the shipped,
// hashed WXT resource. VM is L2 evidence; native CFT is separately recorded.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {BUILTIN_RUNTIME_CATALOG as catalog,BUILTIN_RESOURCE_PATHS} from '../../src/libs/runtime-contract.js';
import {loadBuiltinWorkerSource,loadPackagedOptionalControllerLibrary,
  controllerSelectedPackagedLibrary} from '../../src/libs/loader.js';
import {controllerProgramBody} from '../../src/scripting/sandbox/worker-runtime.js';
import {buildProgramProjectInMemory} from '../../scripts/build-program-project.mjs';

globalThis.crypto ||= webcrypto;
const sha=value=>createHash('sha256').update(value).digest('hex');
const root='chrome-extension://fixture-controller-libs/';
const runtime={id:'fixture-controller-libs',getURL:path=>root+path};
function fixture(mode){
  const calls=[];
  const fetchImpl=async url=>{
    const path=url.startsWith(root)?url.slice(root.length):null;
    calls.push(path);
    const bytes=path?await readFile('dist/'+mode+'/'+path,'utf8').catch(()=>null):null;
    return {ok:bytes!==null,url,redirected:false,text:async()=>bytes};
  };
  return {calls,fetchImpl};
}

test('Controller parser only accepts leading reviewed optional Axios, without implicit loading',()=>{
  assert.equal(controllerSelectedPackagedLibrary('async function main(){return 1;}'),null);
  assert.equal(controllerSelectedPackagedLibrary('// @opendesk-lib axios\nasync function main(){}'),'axios');
  assert.equal(controllerSelectedPackagedLibrary('// @opendesk-lib axios\n// @opendesk-lib axios\nasync function main(){}'),'axios');
  assert.equal(controllerSelectedPackagedLibrary('async function main(){}\n// @opendesk-lib axios'),null);
  for(const source of ['// @opendesk-lib lodash','// @opendesk-lib react',
    '// @opendesk-lib axios\n// @opendesk-lib vue'])
    assert.throws(()=>controllerSelectedPackagedLibrary(source),error=>error.code==='E_BUILTIN_DECLARATION');
});

for(const mode of ['production','development']){
  test(mode+' Controller default stays lean and opt-in Axios is locally hashed',async()=>{
    const f=fixture(mode),defaultAsset=await loadBuiltinWorkerSource({runtime,fetchImpl:f.fetchImpl});
    assert(!f.calls.includes(catalog.libraries.axios.output));
    assert.equal(defaultAsset.abi,catalog.abi);
    f.calls.length=0;
    const optional=await loadPackagedOptionalControllerLibrary('axios',{runtime,fetchImpl:f.fetchImpl});
    assert.equal(optional.version,catalog.libraries.axios.version);
    assert.equal(optional.catalogSha256,defaultAsset.catalogSha256);
    assert.equal(optional.sha256,sha(optional.code));
    assert.deepEqual(f.calls,[catalog.resourceManifest,catalog.libraries.axios.output]);
    await assert.rejects(loadPackagedOptionalControllerLibrary('cheerio',{runtime,fetchImpl:f.fetchImpl}),
      error=>error.code==='E_BUILTIN_DECLARATION');
    assert.deepEqual(f.calls,[catalog.resourceManifest,catalog.libraries.axios.output]);
    assert(!optional.code.includes('https://cdn.'),'Only local WXT code is executed');
  });
}

test('real shipped Axios initializes in opaque Controller AsyncBody and uses only admitted axiosx',async()=>{
  const f=fixture('production');
  const asset=await loadPackagedOptionalControllerLibrary('axios',{runtime,fetchImpl:f.fetchImpl});
  const scope=vm.createContext({URL,TextEncoder,TextDecoder});
  // No document, website window, native fetch or chrome APIs in this context.
  const AsyncBody=vm.runInContext('Object.getPrototypeOf(async function(){}).constructor',scope);
  const calls=[];
  const http=Object.fromEntries(['get','post','put','delete'].map(method=>[method,async(...args)=>{
    calls.push({method,args});
    if(args[0].includes('blocked'))throw Object.assign(new Error('Permission denied'),{code:'E_PERMISSION'});
    return {status:200,statusText:'OK',data:'{"ok":true}',headers:{'content-type':'application/json'}};
  }]));
  const source=asset.code+'\n;\n'+[
    'async function main(){',
    ' const api=axios.create({baseURL:"https://example.test/api/"});',
    ' const id=api.interceptors.request.use(c=>{c.headers.set("x-from-controller","yes");return c;});',
    ' const response=await api.get("status",{params:{key:"a b"}});',
    ' api.interceptors.request.eject(id);',
    ' let denial;try{await api.get("blocked")}catch(e){denial=e.code}',
    ' return {status:response.status,data:response.data,denial,get:typeof axios.get,globalPage:typeof globalThis.page};',
    '}'
  ].join('\n');
  const body=new AsyncBody('page','params','axiosx','AppStorage','AppLocal','storage',controllerProgramBody(source));
  const result=await body({}, {},http,undefined,undefined,undefined);
  assert.equal(result.status,200);
  assert.deepEqual(JSON.parse(JSON.stringify(result.data)),{ok:true});
  assert.equal(result.denial,'E_PERMISSION');
  assert.equal(result.get,'function');
  assert.equal(result.globalPage,'undefined');
  assert.equal(calls.length,2);
  assert.equal(calls[0].args[0],'https://example.test/api/status?key=a+b');
  assert.equal(calls[0].args[1].headers['x-from-controller'],'yes');
  assert.equal(vm.runInContext('typeof document',scope),'undefined');
});

test('Controller multi-file ESM JSON emits opt-in source and preserves zero-argument main()',async()=>{
  const source=await readFile('examples/programs/controller-axios-zero-arg/src/main.js','utf8');
  assert.match(source,/export default async function main\(\)/);
  const output=await buildProgramProjectInMemory('examples/programs/controller-axios-zero-arg',{mode:'production'});
  assert.equal(output.project.runtimeKind,'controller');
  assert.deepEqual(output.project.libraries,['axios']);
  assert.equal(controllerSelectedPackagedLibrary(output.sourceUtf8),'axios');
  assert(output.sourceUtf8.startsWith('// @opendesk-lib axios\n'));
  assert(!output.sourceUtf8.includes('main({page'));
});
