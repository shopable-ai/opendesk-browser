// Negative readiness tests only. Never claim a real Chrome or Provider PASS.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

for(const mode of ['--smoke-preflight','--smoke']){
  test(mode+' rejects missing credentials before any native job or fixture',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'od-cloud-smoke-gate-'));
    try{
      const child=spawnSync(process.execPath,
        ['tests/cloud-control/native-double-task.mjs',mode],{
          cwd:resolve('.'),encoding:'utf8',timeout:10000,
          env:{...process.env,
            OPENDESK_CLOUD_NATIVE_CDP:'ws://127.0.0.1:9222/devtools/browser/unavailable',
            OPENDESK_CLOUD_NATIVE_HTTPS:'https://localhost:443/',
            OPENDESK_CLOUD_NATIVE_TOKEN_FILE:'',
            OPENDESK_CLOUD_NATIVE_ADMIN_FILE:'',
            OPENDESK_CLOUD_NATIVE_EVIDENCE:dir}
        });
      assert.equal(child.error,undefined,'Smoke readiness may not hang on missing credentials');
      assert.equal(child.status,1);
      assert.match(child.stderr,/NATIVE_READINESS_BLOCKED|CLOUD_DOUBLE_TASK_E2E_BLOCKED/);
      assert.doesNotMatch(child.stdout,/READY_FOR_SMOKE|CLOUD_SINGLE_TASK_SMOKE_PASS|CLOUD_DOUBLE_TASK_E2E_PASS/);
      const report=JSON.parse(await readFile(join(dir,'native-double-task-report.json'),'utf8'));
      assert.equal(report.status,mode==='--smoke-preflight'?'BLOCKED_ENV':'BLOCKED');
      assert.equal(report.stage,'config');
      assert.equal(report.error.code,'ERR_ASSERTION');
      assert.equal(report.fixture,undefined);
      assert.deepEqual(report.nativeEvidence,[]);
      assert.deepEqual(report.steps,[]);
    }finally{await rm(dir,{recursive:true,force:true});}
  });
}
