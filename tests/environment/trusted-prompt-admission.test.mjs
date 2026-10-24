import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {serializeSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {officialPackagePath} from '../../src/sidebar-tools/official-catalog.js';
import {admitsTrustedPrompt,TRUSTED_PROMPT_VERSION,
  trustedPromptProvenanceChanged} from '../../src/ui/trusted-prompt-admission.js';

// Immutable, committed formal release; do not silently follow a promoted JSON.
const previous=JSON.parse(execFileSync('git',['show',
  '4a67583db:examples/sidebar-tools/prompt-shortcuts/prompt-shortcuts.opendesk-tool.json'],
  {cwd:new URL('../..',import.meta.url),encoding:'utf8'}));
const candidate=await createSidebarToolPackage('examples/sidebar-tools/prompt-shortcuts');
const id='prompt-shortcuts';
function releaseFor(tool){
  const bytes=Buffer.from(serializeSidebarToolPackage(tool));
  return {id:'opendesk/'+id,toolId:id,version:tool.version,
    packagePath:officialPackagePath(id),bytes:bytes.length,
    sha256:createHash('sha256').update(bytes).digest('hex')};
}
const currentRelease=releaseFor(candidate),previousRelease=releaseFor(previous);
const provenanceFor=release=>({[id]:{marketId:release.id,version:release.version,sha256:release.sha256}});
function argsFor(tool,release=currentRelease){
  return {tool,release,installed:[tool],provenance:provenanceFor(releaseFor(tool)),
    enableRecords:{[id]:true},epochs:{[id]:'installed-generation'},expectedEpoch:'installed-generation'};
}

test('committed 1.1.15 official installation survives the 1.1.16 source catalog',async()=>{
  assert.equal(previous.version,'1.1.15');
  assert.equal(previousRelease.bytes,136199);
  assert.equal(previousRelease.sha256,'4085c155d2d8dbac7b55cc5dcaea24229a3fb1d6cfb69431dad2ae5c0eb33ce0');
  assert.equal(candidate.version,TRUSTED_PROMPT_VERSION);
  assert.equal(await admitsTrustedPrompt(argsFor(previous)),true);
  assert.equal(await admitsTrustedPrompt(argsFor(previous,previousRelease)),true);
  assert.equal(await admitsTrustedPrompt(argsFor(candidate)),true);
});

for(const tool of [previous,candidate])test(tool.version+' admission retains source, installation and revocation guards',async()=>{
  const valid=argsFor(tool);
  const rejected=[
    ['manual import', {provenance:{}}],
    ['uninstalled', {installed:[]}],
    ['replaced installation', {installed:[{...tool,js:tool.js+'\nvoid 0;'}]}],
    ['disabled', {enableRecords:{[id]:false}}],
    ['stale epoch', {epochs:{[id]:'revoked-generation'}}],
    ['malformed epoch', {epochs:{[id]:42},expectedEpoch:42}],
    ['missing release', {release:undefined}],
    ['wrong publisher', {release:{...currentRelease,id:'other/'+id}}],
    ['wrong tool', {release:{...currentRelease,toolId:'other'}}],
    ['wrong official path', {release:{...currentRelease,packagePath:'imported.json'}}],
    ['unknown catalog version', {release:{...currentRelease,version:'1.1.14'}}],
    ['invalid catalog digest', {release:{...currentRelease,sha256:'invalid'}}],
    ['wrong provenance publisher', {provenance:{[id]:{...valid.provenance[id],marketId:'other/'+id}}}],
    ['wrong provenance digest', {provenance:{[id]:{...valid.provenance[id],sha256:'0'.repeat(64)}}}],
    ['extra provenance assertion', {provenance:{[id]:{...valid.provenance[id],trusted:true}}}],
    ['other release provenance', {provenance:provenanceFor(tool===previous?currentRelease:previousRelease)}]
  ];
  for(const [reason,overrides] of rejected)
    assert.equal(await admitsTrustedPrompt({...valid,...overrides}),false,reason);
  const changed={...tool,js:tool.js+'\nvoid 0;'};
  assert.equal(await admitsTrustedPrompt({...valid,tool:changed,installed:[changed]}),false,'same-version changed bytes');
  for(const version of ['1.1.14','1.1.17']){
    const changed={...tool,version};
    assert.equal(await admitsTrustedPrompt(argsFor(changed)),false,'unreviewed version '+version);
  }
});

test('legacy digest cannot be replaced by a self-consistent forged release and provenance',async()=>{
  const forged={...previous,js:previous.js+'\nvoid 0;'};
  assert.equal(await admitsTrustedPrompt(argsFor(forged,releaseFor(forged))),false);
  assert.equal(await admitsTrustedPrompt({...argsFor(previous),release:{...previousRelease,bytes:1}}),false);
});

test('both admitted versions retain provenance invalidation on upgrade, tampering and removal',()=>{
  for(const release of [previousRelease,currentRelease]){
    const value=provenanceFor(release);
    assert.equal(trustedPromptProvenanceChanged({oldValue:value,newValue:{...value,other:{}}}),false);
    assert.equal(trustedPromptProvenanceChanged({oldValue:value,newValue:{}}),true);
    assert.equal(trustedPromptProvenanceChanged({oldValue:value,newValue:provenanceFor({...release,sha256:'0'.repeat(64)})}),true);
  }
  assert.equal(trustedPromptProvenanceChanged({oldValue:provenanceFor(previousRelease),newValue:provenanceFor(currentRelease)}),true);
});
