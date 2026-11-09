import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {launchDialogChrome} from '../scripts/trusted-dialog-cdp.mjs';


test('CDP launch requires an explicit Chrome binary',async()=>{
 await assert.rejects(launchDialogChrome(undefined,[]),/CHROME_BIN is required/);
});

test('missing executable fails the process and removes its isolated Profile',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ai-proxy-launch-test-'));
 try{
  const helper=new URL('../scripts/trusted-dialog-cdp.mjs',import.meta.url).href;
  const result=spawnSync(process.execPath,['--input-type=module','-e',
   `import {launchDialogChrome} from ${JSON.stringify(helper)}; await launchDialogChrome(${JSON.stringify(join(dir,'missing-chrome'))},[]);`],
   {encoding:'utf8',timeout:20000,env:{...process.env,TMPDIR:dir,TMP:dir,TEMP:dir}});
  assert.ifError(result.error);
  assert.equal(result.signal,null);
  assert.equal(result.status,1);
  assert.match(result.stderr,/ENOENT/);
  assert.deepEqual(await readdir(dir),[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('Chrome exiting before CDP discovery fails promptly and cleans its Profile',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ai-proxy-early-exit-test-'));
 try{
  const helper=new URL('../scripts/trusted-dialog-cdp.mjs',import.meta.url).href;
  // Node rejects Chrome flags: a portable early-exit executable fixture.
  const result=spawnSync(process.execPath,['--input-type=module','-e',
   `import {launchDialogChrome} from ${JSON.stringify(helper)}; await launchDialogChrome(process.execPath,[]);`],
   {encoding:'utf8',timeout:20000,env:{...process.env,TMPDIR:dir,TMP:dir,TEMP:dir}});
  assert.ifError(result.error);assert.equal(result.signal,null);assert.equal(result.status,1);
  assert.match(result.stderr,/Chrome exited before completion/);
  assert.deepEqual(await readdir(dir),[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});
