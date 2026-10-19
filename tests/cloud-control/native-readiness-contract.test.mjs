import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

// A cheap negative contract, NOT native Chrome acceptance. Missing secrets
// must stop before a Provider Job, fixture server, or browser action exists.
test('native double-Task preflight rejects missing credentials without running E2E',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'od-cloud-native-readiness-'));
  try{
    const result=spawnSync(process.execPath,
      ['tests/cloud-control/native-double-task.mjs','--preflight'],{
        cwd:resolve('.'),encoding:'utf8',timeout:10000,
        env:{...process.env,OPENDESK_CLOUD_NATIVE_CDP:'ws://127.0.0.1:9222/devtools/browser/unavailable',
          OPENDESK_CLOUD_NATIVE_HTTPS:'https://localhost:443/',
          OPENDESK_CLOUD_NATIVE_TOKEN_FILE:'',
          OPENDESK_CLOUD_NATIVE_ADMIN_FILE:'',
          OPENDESK_CLOUD_NATIVE_EVIDENCE:dir}
      });
    assert.equal(result.error,undefined,'Preflight hung instead of rejecting an absent secret');
    assert.equal(result.status,1);
    assert.match(result.stderr,/NATIVE_READINESS_BLOCKED/);
    assert.doesNotMatch(result.stdout,/READY_FOR_NATIVE_TEST|CLOUD_DOUBLE_TASK_E2E_PASS/);
    const report=JSON.parse(await readFile(join(dir,'native-double-task-report.json'),'utf8'));
    assert.equal(report.status,'BLOCKED_ENV');
    assert.equal(report.stage,'config');
    assert.equal(report.error.code,'ERR_ASSERTION');
    assert.equal(report.fixture,undefined);
    assert.deepEqual(report.nativeEvidence,[]);
    assert.deepEqual(report.steps,[]);
  }finally{await rm(dir,{recursive:true,force:true});}
});
