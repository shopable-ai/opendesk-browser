import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectLibraries} from '../../scripts/libs-doctor.mjs';
import {BUILD_POLICY} from '../../scripts/build-contract.mjs';

test('R15.5 doctor differentiates source, package and actual Chrome acceptance',async()=>{
  const report=await inspectLibraries();
  assert.equal(report.format,'opendesk.libs-doctor.v1');
  assert.equal(report.libraries.length,4);
  assert.deepEqual(report.libraries.map(row=>row.id).sort(),['dayjs','jquery','lodash','myUtils']);
  const jq=report.libraries.find(row=>row.id==='jquery');
  assert.equal(jq.loading,'opt-in');
  assert.deepEqual(jq.worlds,['USER_SCRIPT']);
  const lodash=report.libraries.find(row=>row.id==='lodash');
  assert.equal(lodash.apiCoverage,'8-method subset');
  assert.equal(report.policy.configuredSwHardBytes,BUILD_POLICY.serviceWorkerProductionBytes);
  assert.equal(report.runtime,'RUNTIME_UNVERIFIED');
  assert.equal(report.native,'NATIVE_UNVERIFIED');
  assert.deepEqual(report.legacy.jquery.references,[],
    'A src/vendor jQuery consumer must be migrated before the duplicate file is removed');
  for(const mode of ['production','development'])
    assert(['PACKAGE_PASS','PACKAGE_FAIL','PACKAGE_UNVERIFIED'].includes(report.packages[mode].status));
});
