import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildProgramProject} from '../../scripts/build-program-project.mjs';
import {validateProgramDraft} from '../../src/ui/program-source.js';

for(const [framework,extension] of [['react','jsx'],['vue','vue']]){
  test('R24.3 '+framework+' real built component draft imports with frozen bytes',async()=>{
    const out=await mkdtemp(join(tmpdir(),'opendesk-r243-draft-'));
    try{
      await buildProgramProject('examples/programs/page-ui-'+framework,{mode:'production',outputDirectory:out});
      const draft=JSON.parse(await readFile(join(out,'program.opendesk-draft.json'),'utf8'));
      const result=await validateProgramDraft(draft);
      assert.equal(result.runtimeKind,'page-userscript');
      assert.equal(result.project.entryMode,'component');
      assert.equal(result.project.entry,'src/App.'+extension);
      assert.ok(result.authoring.files.some(f=>f.path===result.project.entry));
      assert.equal(result.build.sourceHash,draft.build.sourceHash);
      assert.match(result.sourceUtf8,new RegExp('// @opendesk-lib '+framework));
      const unknown=structuredClone(draft);unknown.project.newGrant=true;
      await assert.rejects(validateProgramDraft(unknown),{code:'E_PROGRAM_DRAFT'});
      const malformed=structuredClone(draft);malformed.project.entryMode='eval-main';
      await assert.rejects(validateProgramDraft(malformed),{code:'E_PROGRAM_DRAFT'});
      const controller=structuredClone(draft);controller.runtimeKind='controller';
      await assert.rejects(validateProgramDraft(controller),{code:'E_PROGRAM_DRAFT'});
      const wrong=structuredClone(draft);
      wrong.project.entry=framework==='react'?'src/App.vue':'src/App.jsx';
      await assert.rejects(validateProgramDraft(wrong),{code:'E_PROGRAM_DRAFT'});
      const mixed=structuredClone(draft);
      mixed.authoring.files[0].path=framework==='react'?'src/Extra.vue':'src/Extra.jsx';
      await assert.rejects(validateProgramDraft(mixed),e=>['E_PROGRAM_SOURCE','E_PROGRAM_HASH'].includes(e.code));
    }finally{await rm(out,{recursive:true,force:true});}
  });
}
test('R24.3 previous R24.2 async-main import remains accepted',async()=>{
  const old=JSON.parse(await readFile(
    'examples/import-ready/page-ui-react-direct.opendesk-draft.json','utf8'));
  assert.equal(old.project.entryMode,undefined);
  assert.equal((await validateProgramDraft(old)).project.entryMode,undefined);
  const forged=structuredClone(old);forged.project.entry='src/App.vue';
  await assert.rejects(validateProgramDraft(forged),{code:'E_PROGRAM_DRAFT'});
});
