import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,appendFileSync,rmSync,symlinkSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {describeBundle} from '../../scripts/bundle-provenance.mjs';

const paths=['stay-focus','ai-vip-share'].map(id=>`examples/sidebar-tools/${id}/trusted/react-controls.tsx`);
const describe=(root,path,target)=>describeBundle({root,lock:{packages:{}},chunk:{fileName:target,
  modules:{[resolve(root,path)]:{originalLength:100,renderedLength:80}}}});
for(const path of paths){
  test(`${path}: exact static UI source enters only the existing Side Panel bundle`,()=>{
    assert.match(describe(process.cwd(),path,'ui/tool-shell.js').modules[0].reviewedFirstPartyBlob,/^[a-f0-9]{40}$/);
    for(const target of ['sw.js','ui/sidebar-tool-host.js','sidebar-tools/bridge.js','cloud-control/runner.js','unregistered/custom.js'])
      assert.throws(()=>describe(process.cwd(),path,target),/Historical\/user\/vendor code/);
  });
  test(`${path}: changed or symlinked UI cannot acquire trusted admission`,()=>{
    const root=realpathSync(mkdtempSync(resolve(tmpdir(),'od-app-controls-')));
    try{
      const file=resolve(root,path);mkdirSync(dirname(file),{recursive:true});
      copyFileSync(resolve(path),file);appendFileSync(file,'\n// unreviewed drift\n');
      assert.throws(()=>describe(root,path,'ui/tool-shell.js'),/review and re-pin/);
      rmSync(file);symlinkSync(resolve(path),file);
      assert.throws(()=>describe(root,path,'ui/tool-shell.js'),/must not be a symlink/);
    }finally{rmSync(root,{recursive:true,force:true});}
  });
}
