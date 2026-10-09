import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawn} from 'node:child_process';import {createServer} from 'node:net';import {once} from 'node:events';
const moduleURL=new URL('../../scripts/development-lock.mjs',import.meta.url).href;
test('output guard rejects another writer and recovers after abrupt owner death',async()=>{
  const root=await mkdtemp(join(tmpdir(),'opendesk-output-guard-'));const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const code=`import {acquireDevelopmentLock} from ${JSON.stringify(moduleURL)};const release=await acquireDevelopmentLock('test',{port:${port}});console.log('LOCKED');process.on('SIGTERM',async()=>{await release();process.exit(0);});`;
  const launch=()=>spawn(process.execPath,['--input-type=module','-e',code],{cwd:root,stdio:['ignore','pipe','pipe']});let owner;
  const ready=child=>new Promise((resolve,reject)=>{child.stdout.once('data',data=>data.toString().includes('LOCKED')?resolve():reject(Error(String(data))));child.once('exit',exit=>reject(Error('Owner exited '+exit)));});
  try{
    owner=launch();await ready(owner);const contender=launch();let errors='';contender.stderr.on('data',data=>errors+=data);const [exit]=await once(contender,'exit');assert.notEqual(exit,0);assert.match(errors,/Output guard/);assert.equal(JSON.parse(await readFile(join(root,'.wxt/development.lock'))).pid,owner.pid);
    const dead=once(owner,'exit');owner.kill('SIGKILL');await dead;owner=launch();await ready(owner);assert.equal(JSON.parse(await readFile(join(root,'.wxt/development.lock'))).pid,owner.pid);
    const stopped=once(owner,'exit');owner.kill('SIGTERM');assert.equal((await stopped)[0],0);owner=undefined;await assert.rejects(readFile(join(root,'.wxt/development.lock')),error=>error.code==='ENOENT');
  }finally{if(owner){const exited=once(owner,'exit');owner.kill('SIGKILL');await exited;}await rm(root,{recursive:true,force:true});}
});
