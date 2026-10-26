// Build-source admission only; does not prove installation or native execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm,symlink,realpath} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {describeBundle} from '../../scripts/bundle-provenance.mjs';
import {FIXED_OUTPUTS} from '../../scripts/build-contract.mjs';

const project='examples/sidebar-tools/ai-knowledge-answers';
const reviewed={
  'src/model.js':'752b91ea8d98f7da10e9d8902e3629bef69df58c',
  'trusted/host.js':'02bdd31fdcb2292196c849bd0a4c13e9bde78c0c',
  'trusted/ai-request.js':'2228f1490904f99b47d087cc617015da57dce26f',
  'trusted/local-test-runtime.js':'2605e9d4825f3d95140a1eaccc73c1cc62ee6cda',
  'trusted/local-test-adapter.js':'fd56f20148aefe75cc2cc91187a831db0dbadcc1',
  'trusted/Workspace.jsx':'9fa5a0e47805bfbbd092dbab7f78bb346588058b',
  'trusted/workspace.css':'3f11650babfd3e1a490907b33e2f722bd97fa53d',
  'trusted/multi-intent.js':'82d4b49d194783e04844e36df78d757955e31378'
};
const examine=(path,{root=process.cwd(),target='ui/tool-shell.js'}={})=>
  describeBundle({root,lock:{packages:{}},chunk:{fileName:target,
    modules:{[resolve(root,project,path)+(path.endsWith('.css')?'?raw':'')]:
      {renderedLength:1,originalLength:1}}}}).modules[0];

test('Knowledge source review admits exactly eight fixed inputs to tool-shell only',()=>{
  const otherTargets=new Set(['sw.js',...Object.values(FIXED_OUTPUTS),'ui/unknown-host.js']);
  otherTargets.delete('ui/tool-shell.js');
  for(const [path,blob] of Object.entries(reviewed)){
    assert.equal(examine(path).reviewedFirstPartyBlob,blob,path);
    for(const target of otherTargets)
      assert.throws(()=>examine(path,{target}),/cannot enter a privileged fixed bundle/,path+' -> '+target);
  }
});

test('Knowledge source review does not admit package, sandbox, sibling or added trusted files',()=>{
  for(const path of ['src/main.js','src/index.html','ai-knowledge-answers.opendesk-tool.json',
    'trusted/extra.js','trusted/Workspace-copy.jsx','../another-tool/trusted/host.js'])
    assert.throws(()=>examine(path),/cannot enter a privileged fixed bundle/,path);
});

test('Knowledge source review rejects byte drift and symlinks for every approved input',async t=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'opendesk-knowledge-source-')));
  t.after(()=>rm(root,{recursive:true,force:true}));
  for(const [path,blob] of Object.entries(reviewed)){
    const file=resolve(root,project,path),bytes=await readFile(resolve(project,path));
    await mkdir(dirname(file),{recursive:true});await writeFile(file,bytes);
    assert.equal(examine(path,{root}).reviewedFirstPartyBlob,blob);
    await writeFile(file,Buffer.concat([bytes,Buffer.from('\n/* unreviewed drift */\n')]));
    assert.throws(()=>examine(path,{root}),/Trusted Knowledge source changed/,path);
    await rm(file);await symlink(resolve(project,path),file);
    assert.throws(()=>examine(path,{root}),/must not be a symlink/,path);
  }
});
