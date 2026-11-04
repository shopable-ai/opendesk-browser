import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {serializeSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {officialPackagePath} from '../../src/sidebar-tools/official-catalog.js';
import {admitsTrustedPrompt} from '../../src/ui/trusted-prompt-admission.js';

// Immutable, committed formal release; do not silently follow a promoted JSON.
const previous=JSON.parse(execFileSync('git',['show',
  '4a67583db:examples/sidebar-tools/prompt-shortcuts/prompt-shortcuts.opendesk-tool.json'],
  {cwd:new URL('../..',import.meta.url),encoding:'utf8'}));
const intermediate=JSON.parse(execFileSync('git',['show',
  '3ece6811:examples/sidebar-tools/prompt-shortcuts/prompt-shortcuts.opendesk-tool.json'],
  {cwd:new URL('../..',import.meta.url),encoding:'utf8'}));
const lastOfficial=JSON.parse(execFileSync('git',['show',
  'fc738562:examples/sidebar-tools/prompt-shortcuts/prompt-shortcuts.opendesk-tool.json'],
  {cwd:new URL('../..',import.meta.url),encoding:'utf8'}));
const released118=JSON.parse(execFileSync('git',['show',
  '25edc1c1c:examples/sidebar-tools/prompt-shortcuts/prompt-shortcuts.opendesk-tool.json'],
  {cwd:new URL('../..',import.meta.url),encoding:'utf8'}));
const released119=JSON.parse(execFileSync('git',['show',
  'e6752699d:examples/sidebar-tools/prompt-shortcuts/prompt-shortcuts.opendesk-tool.json'],
  {cwd:new URL('../..',import.meta.url),encoding:'utf8'}));
const candidate=await createSidebarToolPackage('projects/prompt-shortcuts');
const id='prompt-shortcuts';
function releaseFor(tool){
  const bytes=Buffer.from(serializeSidebarToolPackage(tool));
  return {id:'opendesk/'+id,toolId:id,version:tool.version,
    packagePath:officialPackagePath(id),bytes:bytes.length,
    sha256:createHash('sha256').update(bytes).digest('hex')};
}
const currentRelease=releaseFor(candidate),previousRelease=releaseFor(previous),
  intermediateRelease=releaseFor(intermediate),lastOfficialRelease=releaseFor(lastOfficial),
  release118=releaseFor(released118),release119=releaseFor(released119);
const provenanceFor=release=>({[id]:{marketId:release.id,version:release.version,sha256:release.sha256}});
function argsFor(tool,release=currentRelease){
  return {tool,release,installed:[tool],provenance:provenanceFor(releaseFor(tool)),
    enableRecords:{[id]:true},epochs:{[id]:'installed-generation'},expectedEpoch:'installed-generation'};
}

test('Prompt admission preserves actual historical installations without a version gate',async()=>{
  assert.equal(previous.version,'1.1.15');
  assert.equal(previousRelease.bytes,136199);
  assert.equal(previousRelease.sha256,'4085c155d2d8dbac7b55cc5dcaea24229a3fb1d6cfb69431dad2ae5c0eb33ce0');
  assert.equal(intermediate.version,'1.1.16');
  assert.equal(intermediateRelease.bytes,142077);
  assert.equal(intermediateRelease.sha256,'f42d7acd013a727c8b3ab8b318d3cf77882686d468027b168647dcacf4df7787');
  assert.equal(lastOfficial.version,'1.1.17');
  assert.equal(lastOfficialRelease.bytes,138166);
  assert.equal(lastOfficialRelease.sha256,'724bda006e82ebc2f1c041cb5f15e537c186785c071d298b0750e37b56e57d09');
  assert.equal(released118.version,'1.1.18');
  assert.equal(release118.bytes,144295);
  assert.equal(release118.sha256,'7158d16bff8143bef8a6a4ebac54b0fecbf6dba364025ed192c27e397ed0d116');
  assert.equal(released119.version,'1.1.19');
  assert.equal(release119.bytes,143608);
  assert.equal(release119.sha256,'a041ded61a10f4c2b0b78918e77207f9723e8aa1388f5943302737fe23f97474');
  assert.equal(await admitsTrustedPrompt(argsFor(released119)),true);
  assert.equal(await admitsTrustedPrompt(argsFor(released119,release119)),true);
  assert.equal(await admitsTrustedPrompt(argsFor(released118)),true);
  assert.equal(await admitsTrustedPrompt(argsFor(released118,release118)),true);
  assert.equal(await admitsTrustedPrompt(argsFor(lastOfficial)),true);
  assert.equal(await admitsTrustedPrompt(argsFor(lastOfficial,lastOfficialRelease)),true);
  assert.equal(await admitsTrustedPrompt(argsFor(intermediate)),true);
  assert.equal(await admitsTrustedPrompt(argsFor(intermediate,intermediateRelease)),true);
  assert.equal(await admitsTrustedPrompt(argsFor(previous)),true);
  assert.equal(await admitsTrustedPrompt(argsFor(previous,previousRelease)),true);
  assert.equal(await admitsTrustedPrompt(argsFor(candidate)),true);
});

for(const tool of [previous,intermediate,lastOfficial,released118,released119,candidate])test(tool.version+' admission retains installation, capability and revocation guards',async()=>{
  const valid=argsFor(tool);
  const rejected=[
    ['uninstalled', {installed:[]}],
    ['replaced installation', {installed:[{...tool,js:tool.js+'\nvoid 0;'}]}],
    ['disabled', {enableRecords:{[id]:false}}],
    ['stale epoch', {epochs:{[id]:'revoked-generation'}}],
    ['malformed epoch', {epochs:{[id]:42},expectedEpoch:42}],
    ['duplicate installation', {installed:[tool,tool]}],
    ['duplicate same-ID packages', {installed:[tool,{...tool,js:tool.js+'\nvoid 0;'}]}],
    ['invalid package schema', {tool:{...tool,extra:true},installed:[{...tool,extra:true}]}],
    ['missing storage capability', {tool:{...tool,capabilities:[]},installed:[{...tool,capabilities:[]}]}],
    ['invalid enable map', {enableRecords:[]}],
    ['invalid enable value', {enableRecords:{[id]:'true'}}],
    ['missing expected epoch', {expectedEpoch:undefined}],
    ['invalid epoch map', {epochs:[]}],
    ['null epoch map', {epochs:null}],
    ['empty epoch', {epochs:{[id]:''},expectedEpoch:''}]

  ];
  for(const [reason,overrides] of rejected)
    assert.equal(await admitsTrustedPrompt({...valid,...overrides}),false,reason);
  const changed={...tool,js:tool.js+'\nvoid 0;'};
  assert.equal(await admitsTrustedPrompt({...valid,tool:changed,installed:[changed]}),true,'an actually installed local revision selects fixed code without executing its payload');
  for(const version of ['1.1.14','9.9.9']){
    const changed={...tool,version};
    assert.equal(await admitsTrustedPrompt(argsFor(changed)),true,'installed version is independent of the fixed component marker '+version);
  }
});

test('Prompt admission ignores unavailable or stale distribution metadata for local installs',async()=>{
  const valid=argsFor(candidate);
  for(const change of [
    {release:undefined,provenance:undefined},{release:null,provenance:{}},
    {release:{...currentRelease,id:'other/'+id,version:'0.0.1',sha256:'invalid',bytes:1}},
    {provenance:provenanceFor(previousRelease)},
    {provenance:{[id]:{marketId:'local',version:'0.0.1',extra:true}}},
    {epochs:{},expectedEpoch:null},{epochs:undefined,expectedEpoch:null}
  ])assert.equal(await admitsTrustedPrompt({...valid,...change}),true);
  const unreadable={...valid};
  for(const key of ['release','provenance'])Object.defineProperty(unreadable,key,{
    get(){throw new Error('distribution metadata must not be read');}
  });
  assert.equal(await admitsTrustedPrompt(unreadable),true);
  const local={...candidate,html:'<main>Custom prompts</main>',css:'',
    js:'throw new Error("installed JS must remain in the sandbox");'};
  assert.equal(await admitsTrustedPrompt({...valid,tool:local,installed:[local]}),true);
  assert.equal(await admitsTrustedPrompt(),false);
});
