import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,realpath,rm,symlink} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {describeBundle} from '../../scripts/bundle-provenance.mjs';

const reviewed=[
  ['examples/sidebar-tools/time-review/trusted/host-controls.js','6cb8a7e357a5a9f8011ae755dcbbbde6cde8578b'],
  ['examples/sidebar-tools/stay-focus/trusted/host-controls.js','65346648494b88fbf434a5a951769edba445c32e'],
  ['examples/sidebar-tools/stay-focus/trusted/service.js','8106c72e1009c662b8af7376a1aace51009ae198','sw.js'],
  ['examples/sidebar-tools/ai-vip-share/trusted/host-controls.js','d00a67b654d109ac854fbd0691f263daabf6f607']
];
const describe=(source,root=process.cwd(),target='ui/sidebar-tool-host.js')=>describeBundle({
  chunk:{fileName:target,modules:{[resolve(root,source)]:{originalLength:1,renderedLength:1}}},root,lock:{packages:{}}
});

test('R37 reviewed settings and Stay Focus service blobs match exact pins and only enter existing fixed outputs',()=>{
  for(const [source,pin,fixedTarget] of reviewed){
    assert.equal(describe(source,process.cwd(),fixedTarget).modules[0].reviewedFirstPartyBlob,pin);
    // Focus uses the existing shared fixed-output registry. The app-owned
    // Time/AI registry additionally excludes the scripting execution world.
    const targets=['unregistered/custom.js','libs/custom.js'];
    if(!source.includes('/stay-focus/'))targets.push('scripting/sandbox/worker-runtime.js');
    for(const target of targets)
      assert.throws(()=>describe(source,process.cwd(),target),/cannot enter/);
  }
});

test('R37 settings and Stay Focus service pins reject unsigned drift, symlinks and unlisted example sources',async t=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'r37-settings-pin-')));
  t.after(()=>rm(root,{recursive:true,force:true}));
  for(const [source,pin,fixedTarget] of reviewed){
    const file=resolve(root,source),bytes=await readFile(source);
    await mkdir(dirname(file),{recursive:true});
    await writeFile(file,bytes);
    assert.equal(describe(source,root,fixedTarget).modules[0].reviewedFirstPartyBlob,pin);
    await writeFile(file,Buffer.concat([bytes,Buffer.from('\n// unsigned drift\n')]));
    assert.throws(()=>describe(source,root,fixedTarget),/source changed/);
    await rm(file);await writeFile(file+'.actual',bytes);await symlink(file+'.actual',file);
    assert.throws(()=>describe(source,root,fixedTarget),/must not be a symlink/);
  }
  assert.throws(()=>describe('examples/sidebar-tools/quick-notes/src/main.js'),/cannot enter/);
});
