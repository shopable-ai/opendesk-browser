import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
for(const framework of ['react','vue']){
  test('R24.3 '+framework+' build:program uses original compiler without invoking a manual framework build',async()=>{
    const root=resolve('examples/programs/page-ui-'+framework);
    const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
    assert.equal(pkg.opendesk.entryMode,'component');
    assert.equal(pkg.scripts['build:program'],'node ../../../scripts/build-program-project.mjs .');
    assert.equal(pkg.scripts['build:framework'],'vite build','maintainer-only pinned runtime build retained');
    const destination=await mkdtemp(join(tmpdir(),'opendesk-build-command-r243-'));
    try{
      const {stdout}=await exec(process.execPath,['../../../scripts/build-program-project.mjs','.',
        '--mode','production','--out',destination],{cwd:root,timeout:60000,maxBuffer:512*1024});
      const artifact=JSON.parse(stdout);
      assert.equal(artifact.entryMode,'component');
      assert.equal(artifact.entry,framework==='react'?'src/App.jsx':'src/App.vue');
      assert.equal(artifact.sourceBytes<100000,true);
      const draft=JSON.parse(await readFile(join(destination,'program.opendesk-draft.json'),'utf8'));
      assert.equal(draft.project.entryMode,'component');
      assert.match(draft.sourceUtf8,new RegExp('// @opendesk-lib '+framework));
    }finally{await rm(destination,{recursive:true,force:true});}
  });
}
