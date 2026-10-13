// Real Node process + local TLS Provider integration. These commands do not
// install Chrome or produce native Controller Worker evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {openProvider} from '../../scripts/cloud-control/provider.mjs';

const cli=fileURLToPath(new URL('../../scripts/cloud-control/cli.mjs',import.meta.url));
const formPath=fileURLToPath(new URL('../../examples/tasks/form-fill.v1.opendesk-task.json',import.meta.url));
const searchPath=fileURLToPath(new URL('../../examples/tasks/modern-search.v1.opendesk-task.json',import.meta.url));
const form=JSON.parse(await readFile(formPath,'utf8'));
const search=JSON.parse(await readFile(searchPath,'utf8'));
const pin=pkg=>({taskId:pkg.manifest.taskId,version:pkg.manifest.version,
  manifestHash:pkg.manifestHash,sourceHash:pkg.manifest.program.sourceHash});
const advertised=pkg=>({taskId:pkg.manifest.taskId,manifestHash:pkg.manifestHash,
  sourceHash:pkg.manifest.program.sourceHash});
async function local(port,path,body,credential){
  const r=await fetch('http://127.0.0.1:'+port+path,{method:'POST',
    headers:{'Content-Type':'application/json',...(credential?{Authorization:'Bearer '+credential}:{})},
    body:JSON.stringify(body)});
  const v=await r.json();
  if(!r.ok)throw Object.assign(new Error(v.error?.message),{code:v.error?.code});
  return v;
}

test('actual CLI registers two Task packages, writes restricted token, submits and queries two scoped jobs over HTTPS',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'opendesk-r52-cli-'));
  const certFile=join(directory,'public.pem'),keyFile=join(directory,'public.key'),
    tokenFile=join(directory,'client-token'),executorId=randomUUID();
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes',
    '-keyout',keyFile,'-out',certFile,'-days','1',
    '-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore'});
  const provider=await openProvider({directory,port:0,
    publicTls:{host:'127.0.0.1',port:0,keyFile,certFile}});
  const env={...process.env,NODE_EXTRA_CA_CERTS:certFile};
  const args=(command,extra=[])=>[cli,command,...extra];
  const run=(command,extra=[])=>JSON.parse(String(execFileSync(
    process.execPath,args(command,extra),{env,encoding:'utf8',maxBuffer:1024*1024})));
  try{
    const admin=JSON.parse(await readFile(provider.credentialFile,'utf8'));
    const paired=await local(provider.port,'/v1/pair',
      {executorId,pairingCode:admin.pairingCode});
    const grantId=randomUUID();
    await local(provider.port,'/v1/capabilities',{grantId,
      tasks:[advertised(form),advertised(search)]},paired.credential);
    const hostArgs=['--directory',directory,'--port',String(provider.port)];
    const registered=run('register',[...hostArgs,'--package',searchPath]);
    assert.equal(registered.task.taskId,search.manifest.taskId);
    const granted=run('client:grant',[...hostArgs,'--executor',executorId,
      '--packages',formPath+','+searchPath,
      '--allow-result','false','--token-out',tokenFile]);
    assert.equal(granted.executorId,executorId);
    assert.equal(granted.allowResult,false);
    assert.equal(granted.tasks.length,2);
    assert.equal(Object.hasOwn(granted,'credential'),false,
      'CLI must not print a bearer token in operator logs');
    const token=(await readFile(tokenFile,'utf8')).trim();
    assert.match(token,/^[a-f0-9]{64}$/);
    assert.equal((await stat(tokenFile)).mode&0o777,0o600);
    const remote=['--url','https://127.0.0.1:'+provider.publicPort+'/',
      '--token-file',tokenFile];
    const target=['--target','http://127.0.0.1:43111/demo-form.html'];
    const delivered=[
      run('submit:remote',[...remote,'--package',formPath,'--params',
        JSON.stringify({name:'Real CLI Form'}),...target,'--key','cli-form']),
      run('submit:remote',[...remote,'--package',searchPath,'--params',
        JSON.stringify({keyword:'Real CLI Search'}),...target,'--key','cli-search'])
    ];
    assert.match(delivered[0].jobId,/^[a-f0-9-]{36}$/);
    assert.notEqual(delivered[0].jobId,delivered[1].jobId);
    const statuses=delivered.map(v=>run('status:remote',[...remote,'--job',v.jobId]));
    for(let i=0;i<statuses.length;i++)
      assert.deepEqual(statuses[i],{jobId:delivered[i].jobId,state:'queued',
        receiptConfirmed:false},'No simulated Browser Result is counted');
    run('client:revoke',[...hostArgs,'--client',granted.clientId]);
    const denied=spawnSync(process.execPath,args('status:remote',
      [...remote,'--job',delivered[0].jobId]),{env,encoding:'utf8'});
    assert.equal(denied.status,1);
    assert.equal(JSON.parse(denied.stdout).error.code,'E_AUTH');
    const durable=JSON.parse(await readFile(join(directory,'state.json'),'utf8'));
    assert.equal(Object.keys(durable.jobs).length,2);
    assert.equal(Object.values(durable.jobs).every(j=>
      j.targetExecutorId===executorId&&j.targetGrantId===grantId),true);
    assert.equal(durable.jobs[delivered[0].jobId].receipt,undefined);
  }finally{
    await provider.close();
    await rm(directory,{force:true,recursive:true});
  }
});
