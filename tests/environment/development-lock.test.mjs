import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawn,execFile,spawnSync} from 'node:child_process';import {createServer} from 'node:net';import {once} from 'node:events';import {promisify} from 'node:util';
const moduleURL=new URL('../../scripts/development-lock.mjs',import.meta.url).href;
import {outputGuardPort} from '../../scripts/development-lock.mjs';
test('independent output roots can select a guard port without changing the default',()=>{
  assert.equal(outputGuardPort('43121'),43121);
  for(const value of ['', '0', '-1', '65536', '43121junk', '1.5'])
    assert.throws(()=>outputGuardPort(value),/must be a port/);
});

const runFile=promisify(execFile);
const hasLsof=spawnSync('lsof',['-v']).status===0;
async function developmentFixture(t,kind='development') {
  const root=await mkdtemp(join(tmpdir(),'opendesk-duplicate-dev-'));
  let owner;
  const stopOwner=async()=>{
    if(owner&&owner.exitCode===null&&owner.signalCode===null){
      const exited=once(owner,'exit');owner.kill('SIGTERM');await exited;
    }
  };
  t.after(async()=>{
    await stopOwner();
    await rm(root,{recursive:true,force:true});
  });
  const scripts=join(root,'scripts');await mkdir(scripts);
  for(const name of ['dev.mjs','development-lock.mjs'])
    await copyFile(new URL('../../scripts/'+name,import.meta.url),join(scripts,name));
  const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');
  const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const code=`import {acquireDevelopmentLock} from ${JSON.stringify(moduleURL)};
    const release=await acquireDevelopmentLock(${JSON.stringify(kind)},{port:${port}});
    process.on('SIGTERM',async()=>{await release();process.exit(0);});console.log('LOCKED');`;
  owner=spawn(process.execPath,['--input-type=module','-e',code],{cwd:root,stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{
    let errors='';owner.stderr.on('data',data=>errors+=data);
    owner.stdout.once('data',data=>String(data).includes('LOCKED')?resolve():reject(Error(String(data))));
    owner.once('exit',exit=>reject(Error('Owner exited '+exit+': '+errors)));
  });
  const lockPath=join(root,'.wxt/development.lock');
  const launch=async({path=process.env.PATH,build=false}={})=>{
    const args=build?['--input-type=module','-e',
      `import {acquireDevelopmentLock} from ${JSON.stringify(moduleURL)};await acquireDevelopmentLock('build',{port:${port}});`]:[join(scripts,'dev.mjs')];
    try{return {...await runFile(process.execPath,args,{cwd:root,
      env:{...process.env,PATH:path,OPENDESK_OUTPUT_GUARD_PORT:String(port)},timeout:5000}),code:0};}
    catch(error){if(typeof error.code!=='number')throw error;return error;}
  };
  return {root,owner,lockPath,launch,stopOwner};
}

test('repeated dev reuses a verified owner without loading WXT or touching its output',
  {skip:!hasLsof},async t=>{
    const f=await developmentFixture(t),before=await readFile(f.lockPath,'utf8');
    const output=join(f.root,'dist/development');await mkdir(output,{recursive:true});
    const marker=join(output,'development-update.json');await writeFile(marker,'existing revision');
    const result=await f.launch();
    assert.equal(result.code,0,result.stderr);assert.equal(result.stderr,'');
    assert.match(result.stdout,new RegExp(`Already running — PID ${f.owner.pid}`));
    assert.match(result.stdout,/Check the original terminal.*build readiness/);
    assert.doesNotMatch(result.stdout,/Stopped;|Preparing complete extension|RUNNING/);
    assert.equal(await readFile(f.lockPath,'utf8'),before);
    assert.equal(await readFile(marker,'utf8'),'existing revision');
    process.kill(f.owner.pid,0);
  });

test('builds still refuse an existing dev writer and dev still refuses a build writer',
  {skip:!hasLsof},async t=>{
    const dev=await developmentFixture(t),before=await readFile(dev.lockPath,'utf8');
    const buildAttempt=await dev.launch({build:true});
    assert.notEqual(buildAttempt.code,0);assert.match(buildAttempt.stderr,/Output guard/);
    assert.equal(await readFile(dev.lockPath,'utf8'),before);
    const build=await developmentFixture(t,'build'),buildLock=await readFile(build.lockPath,'utf8');
    const devAttempt=await build.launch();
    assert.equal(devAttempt.code,1);assert.match(devAttempt.stderr,new RegExp(`PID ${build.owner.pid} \\(build\\)`));
    assert.doesNotMatch(devAttempt.stdout,/Already running|Stopped;/);
    assert.equal(await readFile(build.lockPath,'utf8'),buildLock);
  });

test('unverified listeners and stale or foreign ownership never become successful dev reuse',async t=>{
  const f=await developmentFixture(t),original=JSON.parse(await readFile(f.lockPath,'utf8'));
  for(const lock of [original,{...original,pid:process.pid},{...original,root:join(f.root,'other')},null]){
    if(lock)await writeFile(f.lockPath,JSON.stringify(lock));else await rm(f.lockPath);
    const before=lock?await readFile(f.lockPath,'utf8'):null;
    const result=await f.launch(lock===original?{path:f.root}:{});
    assert.equal(result.code,1);assert.match(result.stderr,/Output guard/);
    assert.doesNotMatch(result.stdout,/Already running|Stopped;/);
    if(lock)assert.equal(await readFile(f.lockPath,'utf8'),before);
    else await assert.rejects(readFile(f.lockPath),error=>error.code==='ENOENT');
    process.kill(f.owner.pid,0);
  }
});

test('fresh dev releases its output guard when compiler loading fails',async t=>{
  const f=await developmentFixture(t);await f.stopOwner();
  // This fixture deliberately has no compiler modules: a fresh invocation
  // must fail visibly and release ownership so the next attempt can recover.
  for(let attempt=0;attempt<2;attempt++){
    const result=await f.launch();
    assert.equal(result.code,1);assert.match(result.stderr,/ERR_MODULE_NOT_FOUND/);
    assert.match(result.stdout,/Stopped; output kept/);
    assert.doesNotMatch(result.stdout,/Already running/);
    await assert.rejects(readFile(f.lockPath),error=>error.code==='ENOENT');
  }
});
test('output guard rejects another writer and recovers after abrupt owner death',async()=>{
  const root=await mkdtemp(join(tmpdir(),'opendesk-output-guard-'));const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const code=`import {acquireDevelopmentLock} from ${JSON.stringify(moduleURL)};const release=await acquireDevelopmentLock('test',{port:${port}});process.on('SIGTERM',async()=>{await release();process.exit(0);});console.log('LOCKED');`;
  const launch=()=>spawn(process.execPath,['--input-type=module','-e',code],{cwd:root,stdio:['ignore','pipe','pipe']});let owner;
  const ready=child=>new Promise((resolve,reject)=>{child.stdout.once('data',data=>data.toString().includes('LOCKED')?resolve():reject(Error(String(data))));child.once('exit',exit=>reject(Error('Owner exited '+exit)));});
  try{
    owner=launch();await ready(owner);const contender=launch();let errors='';contender.stderr.on('data',data=>errors+=data);const [exit]=await once(contender,'exit');assert.notEqual(exit,0);assert.match(errors,/Output guard/);assert.equal(JSON.parse(await readFile(join(root,'.wxt/development.lock'))).pid,owner.pid);
    const dead=once(owner,'exit');owner.kill('SIGKILL');await dead;owner=launch();await ready(owner);assert.equal(JSON.parse(await readFile(join(root,'.wxt/development.lock'))).pid,owner.pid);
    const stopped=once(owner,'exit');owner.kill('SIGTERM');assert.equal((await stopped)[0],0);owner=undefined;await assert.rejects(readFile(join(root,'.wxt/development.lock')),error=>error.code==='ENOENT');
  }finally{if(owner?.pid&&owner.exitCode===null&&owner.signalCode===null){const exited=once(owner,'exit');owner.kill('SIGKILL');await exited;}await rm(root,{recursive:true,force:true});}
});
