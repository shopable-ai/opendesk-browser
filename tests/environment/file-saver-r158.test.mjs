import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {installPageFileSaver} from '../../src/libs/packages/file-saver.js';
import {BUILTIN_ABI,BUILTIN_RUNTIME_CATALOG as catalog} from '../../src/libs/runtime-contract.js';
import {pageSelectedPackagedLibrary,compileLockedPageSource} from '../../src/scripting/user-scripts/execution-source.js';
import {fakeBuiltinSource} from './builtin-support.mjs';
globalThis.crypto ||= webcrypto;
const digest=s=>createHash('sha256').update(s).digest('hex');

test('real FileSaver is Page-only, accepts Blob, but refuses remote URL/path',()=>{
  const scope={document:{},Blob};
  installPageFileSaver(scope);
  assert.equal(typeof scope.FileSaver.saveAs,'function');
  assert.throws(()=>scope.FileSaver.saveAs('https://example.com/x.txt','x.txt'),e=>e.code==='E_CONFIG_UNSUPPORTED');
  assert.throws(()=>scope.FileSaver.saveAs(new Blob(['x']),'../../evil.txt'),e=>e.code==='E_CONFIG_UNSUPPORTED');
  assert.throws(()=>scope.FileSaver.saveAs(new Blob(['x']),'test.csv',{autoBom:'true'}),e=>e.code==='E_CONFIG_UNSUPPORTED');
  assert.equal(Object.getOwnPropertyDescriptor(scope,'FileSaver').configurable,false);
  assert.throws(()=>installPageFileSaver(scope),e=>e.code==='E_BUILTIN_COLLISION');
  assert.throws(()=>installPageFileSaver({}),e=>e.code==='E_BUILTIN_WORLD');
  assert.equal(pageSelectedPackagedLibrary('// @opendesk-lib file-saver\nasync function main(){}'),'file-saver');
});
test('locked Page source pins FileSaver resource identity, byte hash and version',async()=>{
  const code='Object.defineProperty(globalThis,"FileSaver",{value:Object.freeze({saveAs:()=>42})});';
  const optionalSource={id:'fileSaver',version:'2.0.5',abi:BUILTIN_ABI,code,
    bytes:Buffer.byteLength(code),sha256:digest(code),catalogSha256:fakeBuiltinSource.catalogSha256};
  const sourceUtf8='// @opendesk-lib file-saver\nasync function main(){return FileSaver.saveAs()}';
  const compiled=await compileLockedPageSource({sourceUtf8,entryFormat:'async-main',
    builtinSource:fakeBuiltinSource,optionalSource});
  assert.equal(compiled.packagedOptionalId,'fileSaver');
  assert.equal(await vm.runInNewContext(compiled.js[0].code,{}),42);
  await assert.rejects(()=>compileLockedPageSource({sourceUtf8,entryFormat:'async-main',
    builtinSource:fakeBuiltinSource,optionalSource:{...optionalSource,code:code+'// tampered'}}),
    e=>e.code==='E_DEPENDENCY_HASH');
  await assert.rejects(()=>compileLockedPageSource({sourceUtf8,entryFormat:'async-main',
    builtinSource:fakeBuiltinSource}),e=>e.code==='E_BUILTIN_VERSION_UNAVAILABLE');
});
for(const mode of ['production','development']){
  test(mode+' fixed FileSaver bundle uses packaged resource SHA',async()=>{
    const root='dist/'+mode+'/',file=catalog.libraries.fileSaver.output;
    const code=await readFile(root+file,'utf8');
    const manifest=JSON.parse(await readFile(root+catalog.resourceManifest,'utf8'));
    const item=manifest.resources.find(row=>row.path===file);
    assert.equal(item.bytes,Buffer.byteLength(code));
    assert.equal(item.sha256,digest(code));
    assert.match(code,/^var\s+OpenDeskFileSaverBundle\s*=/);
    // file-saver chooses its browser adapter at module initialization.
    // Use a consistent minimal window/self/navigator realm; a bare Node VM
    // has no window and would incorrectly exercise an undefined upstream
    // environment rather than the packaged Chrome Page world.
    const scope=vm.createContext({
      document:{},Blob,
      navigator:{userAgent:'Mozilla/5.0 (Chrome VM fixture)'},
      HTMLAnchorElement:class HTMLAnchorElement {}
    });
    scope.window=scope;
    scope.self=scope;
    vm.runInContext(code,scope,{timeout:3000});
    assert.equal(typeof scope.FileSaver?.saveAs,'function');
    assert.equal(Object.getOwnPropertyDescriptor(scope,'FileSaver').writable,false);
  });
}
