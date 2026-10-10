// Native WXT serve filesystem observer, never a synthetic watcher stub.
// CI-only and OWNED CHECKOUT ONLY: this intentionally writes and restores
// src/ui/tool-shell.css. Do not run in a shared working tree or while another
// process owns dist/development.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';

const root=process.cwd();
const marker=resolve(root,'dist/development/development-update.json');
const cssSource=resolve(root,'src/ui/tool-shell.css');
const output=resolve(root,'dist/development/ui/tool-shell.css');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function observeMarker(){
  try{
    const row=JSON.parse(await readFile(marker,'utf8'));
    if(row?.protocol==='opendesk.development.v1'&&/^[a-f0-9]{64}$/.test(row.revision))
      return row;
  }catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
  return null;
}
async function waitFor(predicate,child,details,timeoutMs=110000){
  const end=Date.now()+timeoutMs;
  while(Date.now()<end){
    assert.equal(child.exitCode,null,'Development process exited before observed change: '+details());
    const result=await predicate();
    if(result)return result;
    await pause(200);
  }
  throw Error('WXT serve observation timed out: '+details());
}
async function assertOutput(row,paths){
  assert(row?.files&&typeof row.files==='object','Revision marker must enumerate built outputs');
  for(const path of paths){
    const sha=row.files[path];
    assert.match(sha||'',/^[a-f0-9]{64}$/,'Missing real output digest for '+path);
    const bytes=await readFile(resolve(root,'dist/development',path));
    assert.equal(digest(bytes),sha,'Disk byte hash differs from published revision for '+path);
  }
}
test('real npm run dev watches, recompiles and publishes the current extension bytes', {timeout:180000},async()=>{
  assert.equal(process.env.CI,'true','Never mutate an interactive or shared developer workspace');
  assert.equal(process.env.OPENDESK_R16_OWNED_CHECKOUT,'1','Explicit CI checkout ownership required');
  const original=await readFile(cssSource);
  let captured='',changed=false,child,exited=false;
  try{
    assert.equal(await observeMarker(),null,'Fresh checkout must not reuse another session development marker');
    child=spawn(process.execPath,['scripts/dev.mjs'],{
      cwd:root,env:{...process.env,OPENDESK_BUILD_MODE:'development'},stdio:['ignore','pipe','pipe']
    });
    const collect=chunk=>{captured=(captured+String(chunk)).slice(-12000);};
    child.stdout.on('data',collect);child.stderr.on('data',collect);
    child.on('exit',()=>{exited=true;});
    const initial=await waitFor(observeMarker,child,()=>captured);
    await assertOutput(initial,['sw.js','ui/tool-shell.css','framework/sdk-main.js',
      'agents/page-relay.js','runtime/builtin-libraries/page-core.js',
      'runtime/builtin-libraries/manifest.json']);
    const before=initial.files['ui/tool-shell.css'],revision=initial.revision;
    const stamp='/* R16-owned-CI-HMR-exact-byte-probe */';
    assert(!original.toString('utf8').includes(stamp),'Probe must not already exist in source');
    changed=true;await writeFile(cssSource,Buffer.concat([original,Buffer.from('\n'+stamp+'\n')]));
    const next=await waitFor(async()=>{
      const row=await observeMarker();
      return row?.revision!==revision&&row.files?.['ui/tool-shell.css']!==before?row:null;
    },child,()=>captured);
    await assertOutput(next,['sw.js','framework/sdk-main.js','ui/tool-shell.css',
      'runtime/builtin-libraries/manifest.json']);
    assert((await readFile(output,'utf8')).includes(stamp),'Rendered CSS must have new source bytes');
    assert.notEqual(next.revision,revision);
    assert.notEqual(next.files['ui/tool-shell.css'],before);
    console.log('WXT_LIVE_DEVELOPMENT_PASS',JSON.stringify({
      beforeRevision:revision,afterRevision:next.revision,
      beforeCssSha:before,afterCssSha:next.files['ui/tool-shell.css'],
      actualManifestSha:next.files['runtime/builtin-libraries/manifest.json'],
      sourceMutation:'owned CSS marker',status:'actual WXT serve bytes only; Chrome loaded code separately tested'
    }));
  }finally{
    // The only source mutation belongs to this dedicated CI checkout.
    if(changed)await writeFile(cssSource,original);
    if(child&&!exited){
      child.kill('SIGINT');
      const end=Date.now()+15000;
      while(!exited&&Date.now()<end)await pause(100);
      if(!exited)child.kill('SIGKILL'); // Only the tracked CI child PID; no wildcard process cleanup.
    }
    assert.deepEqual(await readFile(cssSource),original,'No test source mutation left behind');
  }
});
