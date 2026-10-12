import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {openProvider} from './provider.mjs';
import {verifyTaskPackage} from '../../src/platform/tasks/contract.js';
const args=process.argv.slice(2),command=args.shift()||'provider';
const option=(name,fallback)=>{const i=args.indexOf('--'+name);return i<0?fallback:args[i+1];};
const directory=resolve(option('directory','.local/cloud-control')),port=Number(option('port','43112'));
if(command==='provider'){
  const provider=await openProvider({directory,port});console.log(JSON.stringify({providerId:provider.providerId,url:`http://127.0.0.1:${provider.port}`,directory,credentials:provider.credentialFile}));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>provider.close().then(()=>process.exit(0)));
}else{
  const credentials=JSON.parse(await readFile(resolve(directory,'admin.json'),'utf8'));let path,body;
  if(command==='seed:form'){path='seed';body={requestKey:option('key',randomUUID()),params:{name:option('name','Alice')},target:{mode:'owned',url:'http://127.0.0.1:43111/demo-form.html'}};}
  else if(command==='register'){
    const file=option('package',null);if(!file)throw Error('register requires --package path/to/verified.opendesk-task.json');
    const pkg=await verifyTaskPackage(JSON.parse(await readFile(resolve(file),'utf8')));
    path='register';body={manifest:pkg.manifest,manifestHash:pkg.manifestHash};
  }
  else if(command==='tasks'){path='tasks';body={};}
  else if(command==='seed'){
    const file=option('package',null);let pin;
    if(file){
      const pkg=await verifyTaskPackage(JSON.parse(await readFile(resolve(file),'utf8')));
      pin={taskId:pkg.manifest.taskId,version:pkg.manifest.version,
        manifestHash:pkg.manifestHash,sourceHash:pkg.manifest.program.sourceHash};
    }else pin={taskId:option('task',''),version:option('version',''),
      manifestHash:option('manifest-hash',''),sourceHash:option('source-hash','')};
    path='seed';body={requestKey:option('key',randomUUID()),...pin,
      params:JSON.parse(option('params','{}')),target:{mode:'owned',url:option('target','')}};
  }
  else if(command==='inspect'){path='state';body={};}
  else if(command==='cancel'){path='cancel';body={jobId:option('job','')};}
  else if(command==='fault'){path='fault';body={path:option('path','/v1/admission'),count:Number(option('count','1'))};}
  else if(command==='pairing'){console.log(JSON.stringify({providerId:JSON.parse(await readFile(resolve(directory,'state.json'),'utf8')).providerId,pairingCode:credentials.pairingCode}));process.exit(0);}
  else throw new Error('Unknown cloud command');
  const response=await fetch(`http://127.0.0.1:${port}/admin/${path}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+credentials.adminToken},body:JSON.stringify(body)});const value=await response.json();console.log(JSON.stringify(value,null,2));if(!response.ok)process.exitCode=1;
}
