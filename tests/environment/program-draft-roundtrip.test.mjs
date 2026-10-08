import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildProgramProject} from '../../scripts/build-program-project.mjs';
import {validateProgramDraft,PROGRAM_DRAFT_LIMIT} from '../../src/ui/program-source.js';
async function project(t) {
  const root=await mkdtemp(join(tmpdir(),'opendesk-draft-roundtrip-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await cp('examples/programs/page-heading',join(root,'project'),{recursive:true});
  return {root,input:join(root,'project')};
}
async function envelope(input,outputDirectory) {
  await buildProgramProject(input,{outputDirectory});
  return JSON.parse(await readFile(join(outputDirectory,'program.opendesk-draft.json'),'utf8'));
}
test('UTF-8 BOM in an authoring module survives build and draft import',async t=>{
  const {root,input}=await project(t),file=join(input,'src/describe.js');
  const original=await readFile(file);await writeFile(file,Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),original]));
  const draft=await envelope(input,join(root,'output'));
  await validateProgramDraft(draft);
  assert.equal(draft.authoring.files.find(row=>row.path==='src/describe.js').sourceUtf8.charCodeAt(0),0xfeff);
});
test('Page prerelease version matches the project and draft schema at import',async t=>{
  const {root,input}=await project(t),file=join(input,'package.json'),pkg=JSON.parse(await readFile(file,'utf8'));
  pkg.version='1.0.0-beta.1';await writeFile(file,JSON.stringify(pkg));
  const draft=await envelope(input,join(root,'output'));
  assert.equal((await validateProgramDraft(draft)).project.version,pkg.version);
  draft.project.version='01.0.0';await assert.rejects(validateProgramDraft(draft),{code:'E_PROGRAM_DRAFT'});
});
test('builder applies envelope budget to the bytes actually written for file import',async t=>{
  const {root,input}=await project(t),file=join(input,'src/main.js');
  const source=count=>'/*'+ '\u0001'.repeat(count)+'*/\nexport default async function main(){return 1;}\n';
  await writeFile(file,source(1));const small=await envelope(input,join(root,'small'));
  const compact=Buffer.byteLength(JSON.stringify(small)),pretty=Buffer.byteLength(JSON.stringify(small,null,2)+'\n');
  assert.ok(pretty>compact);
  const count=1+Math.floor((PROGRAM_DRAFT_LIMIT-compact)/6);
  const before={...small,authoring:{files:small.authoring.files.map(row=>({...row,sourceUtf8:source(count)}))}};
  assert.ok(Buffer.byteLength(JSON.stringify(before))<=PROGRAM_DRAFT_LIMIT);
  assert.ok(Buffer.byteLength(JSON.stringify(before,null,2)+'\n')>PROGRAM_DRAFT_LIMIT);
  await writeFile(file,source(count));
  await assert.rejects(buildProgramProject(input,{outputDirectory:join(root,'large')}),{code:'E_PROJECT_DRAFT_LIMIT'});
});
