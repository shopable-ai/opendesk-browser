import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

// Cheap negative contracts only, NOT native Chrome acceptance. No mode may
// begin a Provider Job, fixture server or browser action without credentials.
for(const [mode,preflight] of [
  ['--smoke-preflight',true],
  ['--smoke',false],
  ['--preflight',true],
  [null,false]
]){
  test('native verifier rejects missing secrets before execution: '+(mode||'full-E2E'),async()=>{
    const dir=await mkdtemp(join(tmpdir(),'od-cloud-native-readiness-'));
    try{
      const args=['tests/cloud-control/native-double-task.mjs',...(mode?[mode]:[])];
      const result=spawnSync(process.execPath,args,{
        cwd:resolve('.'),encoding:'utf8',timeout:10000,
        env:{...process.env,
          OPENDESK_CLOUD_NATIVE_CDP:'ws://127.0.0.1:9222/devtools/browser/unavailable',
          OPENDESK_CLOUD_NATIVE_HTTPS:'https://localhost:443/',
          OPENDESK_CLOUD_NATIVE_TOKEN_FILE:'',
          OPENDESK_CLOUD_NATIVE_ADMIN_FILE:'',
          OPENDESK_CLOUD_NATIVE_EVIDENCE:dir}
      });
      assert.equal(result.error,undefined,'Verifier hung instead of rejecting absent secrets');
      assert.equal(result.status,1);
      assert.match(result.stderr,preflight?/NATIVE_READINESS_BLOCKED/:/CLOUD_DOUBLE_TASK_E2E_BLOCKED/);
      assert.doesNotMatch(result.stdout,
        /READY_FOR_SMOKE|READY_FOR_NATIVE_TEST|CLOUD_SINGLE_TASK_SMOKE_PASS|CLOUD_DOUBLE_TASK_E2E_PASS/);
      const report=JSON.parse(await readFile(join(dir,'native-double-task-report.json'),'utf8'));
      assert.equal(report.status,preflight?'BLOCKED_ENV':'BLOCKED');
      assert.equal(report.stage,'config');
      assert.equal(report.error.code,'ERR_ASSERTION');
      assert.equal(report.fixture,undefined);
      assert.deepEqual(report.nativeEvidence,[]);
      assert.deepEqual(report.steps,[]);
    }finally{
      await rm(dir,{recursive:true,force:true});
    }
  });
}
