// Negative offline fixtures only; never claim these mutations as native results.
import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const evidence=path.resolve('docs/framework/evidence/r131-acceptance-01a121da');
async function rejectMutation(name,mutate,expected){
  const temporary=await mkdtemp(path.join(tmpdir(),'r131-invalid-evidence-'));
  try{
    await cp(evidence,temporary,{recursive:true});
    const file=path.join(temporary,name),snapshot=JSON.parse(await readFile(file));
    mutate(snapshot);await writeFile(file,JSON.stringify(snapshot));
    const result=spawnSync(process.execPath,['tests/framework/r131-wxt-evidence.mjs',temporary],{encoding:'utf8'});
    assert.equal(result.status,1);assert.match(result.stderr,expected);
  }finally{await rm(temporary,{recursive:true,force:true});}
}
test('offline verifier refuses a matrix result from a different actual package',()=>rejectMutation(
  'native-development/r13-matrix.json',snapshot=>{snapshot.session.package.packageHash='0'.repeat(64);},/Actual package identity mismatch/));
test('offline verifier refuses unknown writes whose durable intent was removed',()=>rejectMutation(
  'native-production/unknown-check.json',snapshot=>{
    const runId=snapshot.pages.find(p=>p.state?.source).state.identity.split('：').at(-1);
    const operation=snapshot.native.stores['opendesk-browser'].commandJournal.find(r=>r.tag==='controller-operation'&&r.runId===runId);
    operation.nativeReceipts=operation.nativeReceipts.filter(r=>r.stage!=='locator.commitIntent');
  },/stages.includes\('locator.commitIntent'\)/));
test('offline verifier refuses rewriting the original cleanup failure as a pass',()=>rejectMutation(
  'native-development/cleanup.json',snapshot=>{snapshot.cleanupStatus='PASS';},/Original cleanup failure must remain preserved/));
