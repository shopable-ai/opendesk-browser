import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,realpath,rm,symlink} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {describeBundle} from '../../scripts/bundle-provenance.mjs';

const reviewed=[
  ['examples/sidebar-tools/time-review/trusted/host-controls.js','6cb8a7e357a5a9f8011ae755dcbbbde6cde8578b'],
  ['examples/sidebar-tools/stay-focus/trusted/host-controls.js','3f4c938e7591861333eb17eb41c6e54ca21ced79'],
  ['examples/sidebar-tools/ai-vip-share/trusted/host-controls.js','d00a67b654d109ac854fbd0691f263daabf6f607']
];
const describe=(source,root=process.cwd(),target='ui/sidebar-tool-host.js')=>describeBundle({
  chunk:{fileName:target,modules:{[resolve(root,source)]:{originalLength:1,renderedLength:1}}},root,lock:{packages:{}}
});

test('R37 reviewed settings blobs match exact pins and only enter existing fixed outputs',()=>{
  for(const [source,pin] of reviewed){
    assert.equal(describe(source).modules[0].reviewedFirstPartyBlob,pin);
    // Focus uses the existing shared fixed-output registry. The app-owned
    // Time/AI registry additionally excludes the scripting execution world.
    const targets=['unregistered/custom.js','libs/custom.js'];
    if(!source.includes('/stay-focus/'))targets.push('scripting/sandbox/worker-runtime.js');
    for(const target of targets)
      assert.throws(()=>describe(source,process.cwd(),target),/cannot enter/);
  }
});

test('R37 settings pin rejects unsigned drift, symlinks and unlisted example sources',async t=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'r37-settings-pin-')));
  t.after(()=>rm(root,{recursive:true,force:true}));
  for(const [source] of reviewed){
    const file=resolve(root,source),bytes=await readFile(source);
    await mkdir(dirname(file),{recursive:true});
    await writeFile(file,Buffer.concat([bytes,Buffer.from('\n// unsigned drift\n')]));
    assert.throws(()=>describe(source,root),/source changed/);
    await rm(file);await writeFile(file+'.actual',bytes);await symlink(file+'.actual',file);
    assert.throws(()=>describe(source,root),/must not be a symlink/);
  }
  assert.throws(()=>describe('examples/sidebar-tools/quick-notes/src/main.js'),/cannot enter/);
});
