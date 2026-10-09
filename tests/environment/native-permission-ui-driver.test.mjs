import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {findOwnedChrome,MACOS_PERMISSION_SCRIPT} from '../helpers/native-permission-ui.mjs';
const scope={testPid:100,binary:'/CFT.app/Contents/MacOS/CFT',extension:'/repo/dist/production'};
const command=scope.binary+' --load-extension='+scope.extension+' --user-data-dir=/private/tmp/odbr-ABC123/browser-profile about:blank';
test('permission UI input is scoped to a unique descendant of the actual test process',()=>{
  assert.equal(findOwnedChrome('101 100 node test.mjs\n102 101 '+command,scope),102);
  assert.equal(findOwnedChrome('102 999 '+command,scope),undefined);
  assert.equal(findOwnedChrome('102 100 '+command.replace('production ','production-foreign '),scope),undefined);
  assert.equal(findOwnedChrome('102 100 '+command.replace('/private/tmp/odbr-ABC123/browser-profile','/Users/person/Profile'),scope),undefined);
});
test('ambiguous browser ownership never chooses the first process',()=>{
  assert.throws(()=>findOwnedChrome('102 100 '+command+'\n103 100 '+command,scope),/AMBIGUOUS/);
});
test('the real AppleScript compiles on macOS before any browser permission test',{skip:process.platform!=='darwin'},async t=>{
  const directory=await mkdtemp(join(tmpdir(),'opendesk-ax-compile-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const compiled=spawnSync('/usr/bin/osacompile',['-o',join(directory,'permission.scpt'),'-e',MACOS_PERMISSION_SCRIPT],
    {encoding:'utf8',timeout:10000});
  assert.equal(compiled.status,0,compiled.stderr||compiled.error?.message);
});
