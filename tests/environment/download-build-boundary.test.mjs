import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {rollup} from 'rollup';
import vm from 'node:vm';
import {createDownloadService} from '../../src/platform/downloads/index.js';

test('compiled modern download service drops legacy preparation while retaining reconciliation and source compatibility',async()=>{
  const flag=resolve('src/platform/template-runtime-contract.js');
  const input=resolve('src/platform/downloads/index.js');
  const bundle=await rollup({input,plugins:[{name:'production-template-boundary',
    transform(code,id){if(id===flag)return 'export const INCLUDE_DORMANT_TEMPLATE_RUNTIME=false;';}}]});
  let code;
  try{code=(await bundle.generate({format:'iife',name:'downloads'})).output[0].code;}
  finally{await bundle.close();}
  assert.doesNotMatch(code,/Nonempty bounded volumes required|async function prepareAttempts\(/);
  const context=vm.createContext({TextEncoder,TextDecoder,Uint8Array,crypto});
  vm.runInContext(code,context);
  const api={runtime:{id:'extension'},downloads:{}},storage={transaction:()=>assert.fail('Creating a service is not a write')};
  const source=createDownloadService({api,storage,assertHost:()=>{}});
  const compiled=context.downloads.createDownloadService({api,storage,assertHost:()=>{}});
  assert.equal(typeof source.prepareAttempts,'function');
  assert.equal(Object.hasOwn(compiled,'prepareAttempts'),false);
  for(const method of ['prepareArtifact','prepareAttempt','readArtifact','dispatchDownload','reconcileDownload',
    'handleCreated','handleChanged','reconcilePending','reconcileHostResources','recordResourceRelease'])
    assert.equal(typeof compiled[method],'function',method);
});
