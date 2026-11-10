import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PAGE_SOURCE_LIMIT} from '../../src/platform/source-budgets.js';
import {validateProgramDraft} from '../../src/ui/program-source.js';
import {digestUtf8} from '../../src/platform/protocol.js';
import {validatePageSource} from '../../src/scripting/user-scripts/page-bundle.js';
import {buildProgramProject} from '../../scripts/build-program-project.mjs';
import {buildPageInstallPackage} from '../../scripts/build-page-install-package.mjs';
import {programDraft} from '../fixtures/program-draft.mjs';

test('plain Page draft and executor enforce the same exact UTF-8 ceiling',async()=>{
  assert.equal(PAGE_SOURCE_LIMIT,128*1024);
  const draft=await programDraft('page-userscript');
  draft.sourceUtf8='/*'+'é'.repeat((PAGE_SOURCE_LIMIT-4)/2)+'*/';
  draft.build.byteLength=Buffer.byteLength(draft.sourceUtf8);draft.build.sourceHash=await digestUtf8(draft.sourceUtf8);
  assert.equal((await validateProgramDraft(draft)).build.byteLength,PAGE_SOURCE_LIMIT);
  await validatePageSource(draft.sourceUtf8);
  draft.sourceUtf8+='x';draft.build.byteLength++;draft.build.sourceHash=await digestUtf8(draft.sourceUtf8);
  await assert.rejects(validateProgramDraft(draft),{code:'E_LIMIT'});
  await assert.rejects(validatePageSource(draft.sourceUtf8),{code:'E_SOURCE'});
});
test('a Page above the former compiler ceiling reaches the existing fixed install format',async t=>{
  const root=await mkdtemp(join(tmpdir(),'page-source-budget-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'src'));
  await writeFile(join(root,'package.json'),JSON.stringify({name:'page-budget',version:'1.0.0',type:'module',private:true,description:'Bounded Page fixture',
    opendesk:{format:'opendesk.project.v1',id:'test.page-budget',runtimeKind:'page-userscript',sourceFormat:'esm',entry:'src/main.js',
      pageRules:{matches:['https://example.com/*'],excludeMatches:[],runAt:'document_idle',allFrames:false,world:'USER_SCRIPT'}}}));
  await writeFile(join(root,'src/main.js'),"export default function main(){return '"+'é'.repeat(51000)+"';}");
  const built=await buildProgramProject(root,{outputDirectory:join(root,'out')});
  const {readFile}=await import('node:fs/promises');
  const draft=await validateProgramDraft(JSON.parse(await readFile(join(root,'out',built.draftFile),'utf8')));
  assert.ok(draft.build.byteLength>100000&&draft.build.byteLength<=PAGE_SOURCE_LIMIT);
  const installed=await buildPageInstallPackage(draft,{revision:1,title:'Bounded Page'});
  assert.equal(installed.sourceUtf8,draft.sourceUtf8);assert.equal(installed.sourceHash,draft.build.sourceHash);
  const overhead=draft.build.byteLength-51000*2;
  const overflow="export default function main(){return '"+'é'.repeat(Math.ceil((PAGE_SOURCE_LIMIT-overhead+2)/2))+"';}";
  assert.ok(Buffer.byteLength(overflow)<=PAGE_SOURCE_LIMIT,'authoring remains valid while frozen output exceeds the ceiling');
  await writeFile(join(root,'src/main.js'),overflow);
  await assert.rejects(buildProgramProject(root,{memoryOnly:true}),{code:'E_SOURCE'});
  await writeFile(join(root,'src/main.js'),"export default function main(){return '"+'中'.repeat(44000)+"';}");
  await assert.rejects(buildProgramProject(root,{memoryOnly:true}),{code:'E_PROJECT_LIMIT'});
});
