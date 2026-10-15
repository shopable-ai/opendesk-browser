import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {BROWSER_OPERATIONS} from '../../src/framework/sdk/browser-contract.js';
import {deriveBrowserBindingCatalog,deriveBrowserDirectBindings,deriveBrowserDeveloperSurface,
  syncBrowserBindings,syncBrowserDeveloperSurface} from '../../scripts/generate-browser-bindings.mjs';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {deriveBrowserDirectOperations} from '../../src/framework/sdk/browser-contract.js';
import {createApprovedBrowserBindings} from '../../src/framework/sdk/browser-bindings.js';
import {validateDirectBrowserValue} from '../../src/framework/sdk/browser-schemas.js';
import {createBrowserSdk} from '../../src/framework/sdk/browser.js';

const matrix=JSON.parse(await readFile(new URL('../../docs/api/browser-sdk-interface-matrix.json',import.meta.url),'utf8'));
const generated=JSON.parse(await readFile(new URL('../../docs/api/browser-sdk-binding-catalog.generated.json',import.meta.url),'utf8'));
const err=pattern=>error=>pattern.test(String(error?.message||error));

test('R11 all approved Chrome Binding descriptors are deterministic and derived, never permission grants',async()=>{
  const derived=deriveBrowserBindingCatalog(matrix);
  assert.deepEqual(generated,derived);
  assert.deepEqual(generated.counts,{approved:72,public:70,hostOnly:2});
  const nativeRows=new Map(matrix.nativeInterfaces.map(x=>[x.nativeApi,x]));
  let mapped=0;
  for(const binding of generated.bindings){
    assert.equal(binding.nativeSignatures.length,binding.nativeApis.length);
    for(const call of binding.nativeSignatures){
      const source=nativeRows.get(call.nativeApi);
      assert(source,'The Binding cannot fabricate a Chrome native method');
      assert.equal(call.kind,source.kind);
      assert.equal(call.signature,source.signature);
      assert.deepEqual(call.parameters,source.parameters??[]);
      assert.equal(call.returnType,source.returnType??null);
      mapped++;
    }
  }
  assert.equal(mapped,90,'Only currently approved native relationships are counted');
  const publicOps=generated.bindings.filter(x=>x.visibility==='APPROVED_TOOL_REGISTERED');
  assert.deepEqual(publicOps.map(x=>x.operation).sort(),Object.keys(BROWSER_OPERATIONS).sort());
  for(const desc of publicOps){
    const runtime=BROWSER_OPERATIONS[desc.operation];
    assert.deepEqual(desc.toolCapabilities,runtime.requiredCapabilities);
    assert.deepEqual(desc.chromePermissions,runtime.requiredChromePermissions);
    assert.equal(desc.maxRequestBytes,runtime.maxRequestBytes);
    assert.equal(desc.maxResponseBytes,runtime.maxResponseBytes);
    assert.equal(desc.userGesture,runtime.requiresUserGesture);
    assert.notEqual(desc.mode,'DENIED');
  }
  assert.deepEqual(generated.bindings.filter(x=>x.mode==='DENIED').map(x=>x.operation).sort(),[
    'browser.history.searchTrusted','browser.permissions.requestForTool'
  ]);
  const report=await syncBrowserBindings({check:true});
  assert.equal(report.ok,true);
  assert.equal(report.nativeChrome,'NOT_TESTED');
});

test('R11 generator rejects privilege drift, invented public Binding and unsafe Host-only exposure',()=>{
  const forged=structuredClone(matrix);
  forged.approvedOperations.find(x=>x.id==='browser.bookmarks.createOwned')
    .toolCapabilities=['browser.bookmarks.full'];
  assert.throws(()=>deriveBrowserBindingCatalog(forged),err(/security contract drift/));
  const opened=structuredClone(matrix);
  opened.approvedOperations.find(x=>x.id==='browser.history.searchTrusted').mappingKind='SCOPED';
  assert.throws(()=>deriveBrowserBindingCatalog(opened),err(/Trusted-only operation is not DENIED/));
  const unknown=structuredClone(matrix);
  unknown.approvedOperations.push({...unknown.approvedOperations.find(x=>x.id==='browser.tabs.create'),id:'browser.tabs.queryAll'});
  assert.throws(()=>deriveBrowserBindingCatalog(unknown),err(/visibility drift/));
});


test('R11.5 developer types/docs use one approved compiler for DIRECT and EXISTING_SERVICE',()=>{
  const result=deriveBrowserDeveloperSurface(matrix);
  assert.equal(result.publicCount,Object.keys(BROWSER_OPERATIONS).length);
  assert.match(result.types,/readonly detectLanguage: \(input: \{ readonly text: string; \}\) => Promise/);
  assert.match(result.types,/readonly keys: \(input\?: \{  \}\) => Promise/);
  assert.match(result.documentation,/OpenDeskSDK\.browser\.i18n\.detectLanguage/);
  assert.match(result.documentation,/OpenDeskSDK\.browser\.storage\.local\.keys/);
  assert.match(result.documentation,/Mode: EXISTING_SERVICE/);
  assert.doesNotMatch(result.types,/searchTrusted|requestForTool/);
  assert.doesNotMatch(result.documentation,/OpenDeskSDK\.browser\.history\.searchTrusted/);
});

test('R11.5 existing trusted service accepts generated Facade calls but denies lost authority',async()=>{
  const calls=[],owner={toolId:'installed-tool'};
  const bindings=createApprovedBrowserBindings({
    'storage.local':(input,context,operation)=>{
      calls.push({input,context,operation});return {keys:['settings']};
    }
  });
  let allowed=false;
  const sdk=createBrowserSdk({request:(operation,input)=>
    bindings.dispatch(operation,input,owner,{authorize:async()=>{
      if(!allowed)throw Object.assign(Error('denied'),{code:'E_TOOL_CAPABILITY_REQUIRED'});
    }})});
  await assert.rejects(sdk.storage.local.keys(),err(/denied/));
  assert.equal(calls.length,0);
  allowed=true;
  assert.deepEqual(await sdk.storage.local.keys(),{keys:['settings']});
  assert.deepEqual(calls,[{input:{},context:owner,operation:'browser.storage.local.keys'}]);
  assert.equal(bindings.has('browser.storage.local.nativeClearAll'),false);
  assert.equal(sdk.storage.local.nativeClearAll,undefined);
});

test('R11.5 test-only positional alias compiler does not grant a new Native API',async()=>{
  const approvedRow=matrix.approvedOperations.find(x=>x.id==='browser.i18n.detectLanguage');
  const fixtureRow=structuredClone(approvedRow);
  fixtureRow.inputSchema={type:'object',properties:{message:{type:'string',maxLength:4096}},
    required:['message'],additionalProperties:false};
  fixtureRow.argumentAliases={text:'message'};
  const fixture={...matrix,approvedOperations:[fixtureRow]};
  const [descriptor]=deriveBrowserDirectBindings(fixture);
  assert.deepEqual(descriptor.argumentAliases,{text:'message'});
  const registry={...BROWSER_OPERATIONS,...deriveBrowserDirectOperations([descriptor])};
  const called=[];
  const bindings=createApprovedBrowserBindings({},{
    registry,
    normalize:(_operation,input)=>validateDirectBrowserValue(input,fixtureRow.inputSchema),
    nativeDirect:{api:{i18n:{detectLanguage:async text=>{
      called.push(text);return {isReliable:true,languages:[]};
    }}},descriptors:[descriptor]}
  });
  const authorize=async(_op,_input,ctx)=>{
    if(!ctx?.allowed)throw Object.assign(Error('denied'),{code:'E_TOOL_CAPABILITY_REQUIRED'});
  };
  await assert.rejects(bindings.dispatch(approvedRow.id,{message:'hello'},{allowed:false},{authorize}),err(/denied/));
  assert.deepEqual(called,[]);
  assert.deepEqual(await bindings.dispatch(approvedRow.id,{message:'hello'},{allowed:true},{authorize}),
    {isReliable:true,languages:[]});
  assert.deepEqual(called,['hello']);
  await assert.rejects(bindings.dispatch(approvedRow.id,{text:'bypass'},{allowed:true},{authorize}),
    error=>error?.code==='E_SCHEMA');
  const unsafe=structuredClone(fixture);
  unsafe.approvedOperations[0].argumentAliases={text:'__proto__'};
  assert.throws(()=>deriveBrowserDirectBindings(unsafe),err(/DIRECT parameter/));
  assert(!matrix.approvedOperations.some(row=>row.argumentAliases),
    'No formal new mapping has been approved');
});


test('R11.5 real generator writes and rechecks deterministic developer types/docs',async()=>{
  const root=await mkdtemp(join(tmpdir(),'opendesk-sdk-proof-'));
  try{
    await mkdir(join(root,'docs/api'),{recursive:true});
    await writeFile(join(root,'docs/api/browser-sdk-interface-matrix.json'),JSON.stringify(matrix));
    const run=await syncBrowserDeveloperSurface({root});
    assert.equal(run.publicCount,Object.keys(BROWSER_OPERATIONS).length);
    const checked=await syncBrowserDeveloperSurface({root,check:true});
    assert.equal(checked.ok,true);
    assert.equal(checked.nativeChrome,'NOT_TESTED');
    const [dts,markdown]=await Promise.all([
      readFile(join(root,'docs/api/browser-sdk.developer.generated.d.ts'),'utf8'),
      readFile(join(root,'docs/api/browser-sdk.developer.generated.md'),'utf8')
    ]);
    assert.match(dts,/interface OpenDeskBrowserSdk/);
    assert.match(markdown,/OpenDeskSDK\.browser\.storage\.local\.keys/);
    await writeFile(join(root,'docs/api/browser-sdk.developer.generated.d.ts'),dts+'\n// drift');
    await assert.rejects(syncBrowserDeveloperSurface({root,check:true}),err(/drift/));
  }finally{
    await rm(root,{recursive:true,force:true});
  }
});
