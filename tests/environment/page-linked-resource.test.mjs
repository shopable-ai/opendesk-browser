import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageBundle,validatePageSource,inspectPageSource,PAGE_BUNDLE_PREFIX,PAGE_BUNDLE_LIMITS} from '../../src/scripting/user-scripts/page-bundle.js';
import {validateProgramDraft} from '../../src/ui/program-source.js';
import {digestUtf8} from '../../src/platform/protocol.js';

const url='https://library.example.com/v1/index.js';
async function fixture(){
  const original='export default 7;';
  const pin={sha256:await digestUtf8(original),bytes:Buffer.byteLength(original)};
  const remoteLock={format:'opendesk.remote-lock.v2',profile:'page-library-v1',imports:{},modules:{[url]:pin}};
  const linked='// ==UserScript==\n// @opendesk-lib react\n// ==/UserScript==\n/*'+ 'x'.repeat(150000)+'*/\nasync function main(){return 7;}';
  const sourceUtf8=await createPageBundle(linked,{remoteImports:[url],remoteModules:[{url,...pin}],remoteLock});
  const file={path:'src/main.js',sourceUtf8:'export default function App(){return null;}'};file.sha256=await digestUtf8(file.sourceUtf8);
  return {sourceUtf8,linked,remoteLock,draft:{format:'opendesk.program-draft.v2',runtimeKind:'page-userscript',
    project:{id:'sample.linked-resource',version:'1.0.0',entry:'src/main.js',entryMode:'component'},
    build:{mode:'production',sourceHash:await digestUtf8(sourceUtf8),byteLength:Buffer.byteLength(sourceUtf8)},
    sourceUtf8,authoring:{files:[file],remoteLock}}};
}
function replaceDescriptor(source,change){
  const {descriptor,linked}=inspectPageSource(source);change(descriptor);
  return PAGE_BUNDLE_PREFIX+JSON.stringify(descriptor)+'\n'+linked;
}

test('versioned linked Page resource preserves the exact JS while ordinary Page and Controller limits stay unchanged',async()=>{
  const f=await fixture(),bundle=await validatePageSource(f.sourceUtf8);
  assert.equal(bundle.linked,f.linked);assert.equal(bundle.descriptor.world,'USER_SCRIPT');
  assert.equal(bundle.descriptor.linkedSha256,await digestUtf8(f.linked));
  assert.throws(()=>inspectPageSource(f.linked),{code:'E_SOURCE'});
  assert.equal((await validateProgramDraft(f.draft)).sourceUtf8,f.sourceUtf8);
  await assert.rejects(validateProgramDraft({...f.draft,runtimeKind:'controller'}),{code:'E_PROGRAM_DRAFT'});
  const legacy=structuredClone(f.draft);legacy.format='opendesk.program-draft.v1';delete legacy.authoring.remoteLock;
  await assert.rejects(validateProgramDraft(legacy),{code:'E_LIMIT'});
});

test('linked code tampering, source truncation and unsupported resource worlds fail before execution',async()=>{
  const f=await fixture();
  await assert.rejects(validatePageSource(f.sourceUtf8.replace('return 7','return 8')),{code:'E_PAGE_BUNDLE_HASH'});
  await assert.rejects(validatePageSource(f.sourceUtf8.slice(0,-1)),{code:'E_PAGE_BUNDLE'});
  for(const change of [d=>d.world='MAIN',d=>d.format='opendesk.page-linked-resource.v99',
    d=>d.linkedBytes=PAGE_BUNDLE_LIMITS.linkedBytes+1,d=>d.scriptURL=url,d=>d.producer='remote-compiler',
    d=>d.dependencies.roots[0].url='https://127.0.0.1/module.js'])
    await assert.rejects(validatePageSource(replaceDescriptor(f.sourceUtf8,change)));
});

test('JSON import binds source hash, fixed dependency lock and source snapshot independently',async()=>{
  const f=await fixture();
  for(const change of [d=>d.build.sourceHash='0'.repeat(64),d=>d.build.byteLength++,
    d=>d.authoring.remoteLock.modules[url].sha256='0'.repeat(64),d=>d.authoring.files[0].sourceUtf8+='\n',
    d=>d.authoring.remoteLock.imports={'other':'https://library.example.com/v2/index.js'}]){
    const invalid=structuredClone(f.draft);change(invalid);
    await assert.rejects(validateProgramDraft(invalid),{code:'E_PROGRAM_HASH'});
  }
  const checked=await validateProgramDraft(f.draft);
  f.draft.authoring.remoteLock.modules[url].sha256='f'.repeat(64);
  assert.notEqual(checked.authoring.remoteLock.modules[url].sha256,'f'.repeat(64));
  assert.ok(Object.isFrozen(checked.authoring.remoteLock.modules[url]));
});

test('dependency provenance cannot declare local addresses, excessive graphs, nested resources or oversized descriptors',async()=>{
  const f=await fixture();
  for(const change of [d=>d.dependencies.moduleCount=257,d=>d.dependencies.sourceBytes=2097153,
    d=>d.dependencies.roots.push(d.dependencies.roots[0]),d=>d.dependencies.roots[0].url+='?token=secret',
    d=>d.dependencies.lockSha256='not-a-hash'])
    await assert.rejects(validatePageSource(replaceDescriptor(f.sourceUtf8,change)));
  const row={url,sha256:await digestUtf8('export{}'),bytes:8};
  await assert.rejects(createPageBundle(f.sourceUtf8,{remoteModules:[row],remoteImports:[url],remoteLock:f.remoteLock}),{code:'E_PAGE_BUNDLE'});
  const descriptor=' '.repeat(PAGE_BUNDLE_LIMITS.descriptorBytes);
  await assert.rejects(validatePageSource(PAGE_BUNDLE_PREFIX+descriptor+'\nasync function main(){}'),{code:'E_PAGE_BUNDLE'});
});
