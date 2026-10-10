// Read actual WXT-built files, not ESM modules, source fixtures or another
// bundler's output. This is a Node VM artifact regression, NOT a Chrome receipt.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {BUILTIN_ABI,BUILTIN_RUNTIME_CATALOG as catalog} from '../../src/libs/runtime-contract.js';
import {compileLockedPageSource} from '../../src/scripting/user-scripts/execution-source.js';

globalThis.crypto ||= webcrypto;
const digest=value=>createHash('sha256').update(value).digest('hex');
const assetNames=Object.freeze([
  catalog.bootstrap,
  catalog.libraries.lodash.output,
  catalog.libraries.dayjs.output,
  catalog.libraries.myUtils.output,
  catalog.pageCore
]);

for(const mode of ['production','development']){
  test(`real ${mode} WXT IIFEs do not preclaim dayjs or _ and execute a single Page compilation unit`,async()=>{
    const root=`dist/${mode}/`;
    const manifest=JSON.parse(await readFile(root+catalog.resourceManifest,'utf8'));
    assert.equal(manifest.abi,BUILTIN_ABI);
    assert.equal(manifest.catalogSha256,digest(JSON.stringify(catalog)));
    const bytes=await Promise.all(assetNames.map(path=>readFile(root+path,'utf8')));
    for(const [i,path] of assetNames.entries()){
      const actual=manifest.resources.find(row=>row.path===path);
      assert(actual,`Missing shipped hash for ${path}`);
      assert.equal(Buffer.byteLength(bytes[i]),actual.bytes,path+' byte drift');
      assert.equal(digest(bytes[i]),actual.sha256,path+' checksum drift');
    }
    // Vite's default library name for the entry 'dayjs' used to emit
    // 'var dayjs=...' at top level, which is hoisted across ScriptSource.code
    // and was incorrectly treated as a preexisting public API global.
    assert.doesNotMatch(bytes[2],/^var\s+dayjs\s*=/);
    assert.match(bytes[2],/^var\s+OpenDeskDayjsBundle\s*=/);
    assert.match(bytes[1],/^var\s+OpenDeskLodashBundle\s*=/);

    const scope=vm.createContext({console:{log(){},warn(){},error(){}}});
    for(const [i,path] of assetNames.entries()){
      if(i===4)break; // test the standalone packages before the final installer
      vm.runInContext(bytes[i],scope,{filename:path,timeout:3000});
    }
    for(const key of ['dayjs','_','OpenDeskLibs'])
      assert.equal(Object.hasOwn(scope,key),false,`WXT entry preclaimed reserved global ${key}`);
    vm.runInContext(bytes[4],scope,{filename:catalog.pageCore,timeout:3000});
    assert.equal(scope.OpenDeskLibs.abi,BUILTIN_ABI);
    assert.strictEqual(scope._,scope.OpenDeskLibs.lodash);
    assert.strictEqual(scope.dayjs,scope.OpenDeskLibs.dayjs);
    assert.equal(scope.OpenDeskLibs.myUtils.upper('hello'),'HELLO');
    for(const key of ['_','dayjs','OpenDeskLibs']){
      const row=Object.getOwnPropertyDescriptor(scope,key);
      assert.equal(row.writable,false);assert.equal(row.configurable,false);
    }
    const fixture='async function main(){return {upper:OpenDeskLibs.myUtils.upper("hello"),'+
      'words:_.words("Hello World").join("|"),date:dayjs("2026-10-10").format("YYYY-MM-DD")}}';
    const compiled=await compileLockedPageSource({
      sourceUtf8:fixture,entryFormat:'async-main',receiptNonce:'00000000-0000-4000-8000-000000000001',
      builtinSource:{code:bytes.join('\n;\n'),sha256:digest(bytes.join('\n;\n')),
        catalogSha256:manifest.catalogSha256,abi:BUILTIN_ABI}
    });
    // Isolate this second execution from the first-world inspection.
    const page=vm.createContext({console:{log(){},warn(){},error(){}}});
    const completion=await vm.runInContext(compiled.js[0].code,page,{timeout:3000});
    assert.equal(completion.ok,true);
    assert.deepEqual(JSON.parse(JSON.stringify(completion.value)),{
      upper:'HELLO',words:'Hello|World',date:'2026-10-10'
    });
    assert.equal(completion.format,'opendesk.page-preview-receipt.v1');
    assert.equal(page.OpenDeskLibs.abi,BUILTIN_ABI);
  });
}
