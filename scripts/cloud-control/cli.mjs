import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openProvider} from './provider.mjs';
import {verifyTaskPackage} from '../../src/platform/tasks/contract.js';
const args=process.argv.slice(2),command=args.shift()||'provider';
const option=(name,fallback)=>{const i=args.indexOf('--'+name);return i<0?fallback:args[i+1];};
const directory=resolve(option('directory','.local/cloud-control')),port=Number(option('port','43112'));
if(command==='provider'){
  const tlsPort=option('public-port',null),tlsKey=option('tls-key',null),tlsCert=option('tls-cert',null);
  if([tlsPort,tlsKey,tlsCert].some(Boolean)&&![tlsPort,tlsKey,tlsCert].every(Boolean))
    throw Error('HTTPS gateway needs --public-port, --tls-key and --tls-cert together');
  const publicTls=tlsPort?{port:Number(tlsPort),keyFile:tlsKey,certFile:tlsCert,
    host:option('public-host','127.0.0.1')}:null;
  const provider=await openProvider({directory,port,publicTls});
  console.log(JSON.stringify({providerId:provider.providerId,
    localAdminUrl:`http://127.0.0.1:${provider.port}`,
    httpsPort:provider.publicPort,httpsHost:publicTls?.host??null,
    directory,credentials:provider.credentialFile}));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>provider.close().then(()=>process.exit(0)));
}else if(command==='submit:remote'){
  const url=option('url',''),credentialPath=option('token-file',null),packagePath=option('package',null);
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||
    parsed.pathname!=='/'||!credentialPath||!packagePath)
    throw Error('HTTPS --url, --token-file and --package are required');
  const secret=(await readFile(resolve(credentialPath),'utf8')).trim();
  if(!/^[a-f0-9]{64}$/.test(secret))throw Error('Client token file must contain a 256-bit hex credential');
  const pkg=await verifyTaskPackage(JSON.parse(await readFile(resolve(packagePath),'utf8')));
  const body={requestKey:option('key',randomUUID()),
    taskId:pkg.manifest.taskId,version:pkg.manifest.version,
    manifestHash:pkg.manifestHash,sourceHash:pkg.manifest.program.sourceHash,
    params:JSON.parse(option('params','{}')),
    target:{mode:'owned',url:option('target','')}};
  const response=await fetch(url+'v1/submit',{method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+secret},
    body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(10000)});
  const value=await response.json();
  console.log(JSON.stringify(value,null,2));if(!response.ok)process.exitCode=1;
}else{
  const credentials=JSON.parse(await readFile(resolve(directory,'admin.json'),'utf8'));let path,body;
  if(command==='seed:form'){path='seed';body={requestKey:option('key',randomUUID()),targetExecutorId:option('executor',''),params:{name:option('name','Alice')},target:{mode:'owned',url:'http://127.0.0.1:43111/demo-form.html'}};}
  else if(command==='register'){
    const file=option('package',null);if(!file)throw Error('register requires --package path/to/verified.opendesk-task.json');
    const pkg=await verifyTaskPackage(JSON.parse(await readFile(resolve(file),'utf8')));
    path='register';body={manifest:pkg.manifest,manifestHash:pkg.manifestHash};
  }
  else if(command==='tasks'){path='tasks';body={};}
  else if(command==='executors'){path='executors';body={};}
  else if(command==='client:grant'){path='client-grant';body={executorId:option('executor','')};}
  else if(command==='client:revoke'){path='client-revoke';body={clientId:option('client','')};}
  else if(command==='client:list'){path='clients';body={};}
  else if(command==='seed'){
    const file=option('package',null);let pin;
    if(file){
      const pkg=await verifyTaskPackage(JSON.parse(await readFile(resolve(file),'utf8')));
      pin={taskId:pkg.manifest.taskId,version:pkg.manifest.version,
        manifestHash:pkg.manifestHash,sourceHash:pkg.manifest.program.sourceHash};
    }else pin={taskId:option('task',''),version:option('version',''),
      manifestHash:option('manifest-hash',''),sourceHash:option('source-hash','')};
    path='seed';body={requestKey:option('key',randomUUID()),targetExecutorId:option('executor',''),...pin,
      params:JSON.parse(option('params','{}')),target:{mode:'owned',url:option('target','')}};
  }
  else if(command==='inspect'){path='state';body={};}
  else if(command==='cancel'){path='cancel';body={jobId:option('job','')};}
  else if(command==='fault'){path='fault';body={path:option('path','/v1/admission'),count:Number(option('count','1'))};}
  else if(command==='pairing'){console.log(JSON.stringify({providerId:JSON.parse(await readFile(resolve(directory,'state.json'),'utf8')).providerId,pairingCode:credentials.pairingCode}));process.exit(0);}
  else throw new Error('Unknown cloud command');
  const response=await fetch(`http://127.0.0.1:${port}/admin/${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+credentials.adminToken},body:JSON.stringify(body)});const value=await response.json();console.log(JSON.stringify(value,null,2));if(!response.ok)process.exitCode=1;
}
