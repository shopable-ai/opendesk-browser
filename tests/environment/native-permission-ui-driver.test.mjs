import test from 'node:test';
import assert from 'node:assert/strict';
import {findOwnedChrome} from '../helpers/native-permission-ui.mjs';
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
