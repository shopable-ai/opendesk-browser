// Maintainer action after the real Browser has installed and approved the pin.
// Provider credentials travel in memory over SSH stdin to a 0600 server file.
import {readFile,lstat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import https from 'node:https';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {readFixedDemoTaskPackage,taskPin,defaultTaskPackage} from './task-package.mjs';

const args=process.argv.slice(2);
const option=name=>{const i=args.indexOf('--'+name);return i<0?null:args[i+1];};
const executorId=option('executor'),loginFile=option('login-file'),expectedBindingId=option('replace-binding');
if(!executorId||!loginFile||!/^[-a-f0-9]{36}$/.test(executorId))
  throw Error('Usage: node examples/cloud-control/mac24dev-demo/bind-provider.mjs --executor <real-id> --login-file <private-json> [--package <reviewed-fixed-package>] [--replace-binding <current-binding-id>] [--allow-result]');
const root=resolve(new URL('../../..',import.meta.url).pathname);
async function privateJson(file){
  const s=await lstat(file);
  if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o777)!==0o600)throw Error('PRIVATE_FILE_MODE_REQUIRED');
  return JSON.parse(await readFile(file,'utf8'));
}
async function local(path,body,credential,base='http://127.0.0.1:43112'){
  const r=await fetch(base+path,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),
    headers:{'content-type':'application/json',...(credential?{authorization:credential}:{})},body:JSON.stringify(body)});
  const v=await r.json();if(!r.ok||v.error||v.code!==undefined&&v.code!==1000)throw Error('AUTHENTICATED_REQUEST_REJECTED');
  return v.code===1000?v.data:v;
}
const remoteScript=await readFile(new URL('./update-binding.py',import.meta.url),'utf8');
async function remote(binding){
  return new Promise((yes,no)=>{
    // Script is fixed; secrets and identifiers are never interpolated in shell.
    const encoded=Buffer.from(remoteScript).toString('base64');
    const command=`python3 -c 'import base64;exec(base64.b64decode("${encoded}"))'`;
    const p=spawn('/usr/bin/ssh',['-o','BatchMode=yes','-o','ConnectTimeout=10','mac24dev',command],{stdio:['pipe','pipe','pipe']});
    let output='';p.stdout.on('data',v=>{output+=v;if(output.length>1000)p.kill();});p.stderr.resume();
    const timeout=setTimeout(()=>p.kill(),15000);
    p.once('error',()=>{clearTimeout(timeout);no(Error('SERVER_BIND_FAILED'));});
    p.once('exit',code=>{clearTimeout(timeout);code===0?yes(output.trim()):no(Error('SERVER_BIND_FAILED_OR_ALREADY_BOUND'));});
    p.stdin.end(JSON.stringify(binding));
  });
}
// Validate the selected immutable package before login or issuing any Client.
const pkg=await readFixedDemoTaskPackage(option('package')?resolve(option('package')):defaultTaskPackage);
const pin=taskPin(pkg);
const login=await privateJson(resolve(loginFile));
const authenticated=await local('/app/user/login/loginSimple',{username:login.username,password:login.password},null,'http://127.0.0.1:38001');
const personResponse=await fetch('http://127.0.0.1:38001/app/user/info/person',{headers:{authorization:authenticated.token},redirect:'error'});
const person=await personResponse.json();if(person.code!==1000||person.data.id!==login.userId)throw Error('USER_MISMATCH');
const devices=await local('/app/operate/device/list',{},authenticated.token,'http://127.0.0.1:38001');
if(!devices.some(d=>d.id===login.deviceId))throw Error('OWNED_DEVICE_REQUIRED');
const bindingRequest={taskPin:pin,userId:person.data.id,deviceId:login.deviceId,expectedBindingId:expectedBindingId??null};
await remote({...bindingRequest,checkOnly:true});
const admin=await privateJson(resolve(root,'.local/cloud-control/admin.json'));
const observed=await local('/admin/state',{},'Bearer '+admin.adminToken);
if(observed.providerId!=='9c4f182d-7a5f-403d-9b4d-c2144ef35e5b'||!observed.executors[executorId])throw Error('REAL_PAIRED_EXECUTOR_REQUIRED');
const grant=await local('/admin/client-grant',{executorId,tasks:[pin],allowResult:args.includes('--allow-result')},'Bearer '+admin.adminToken);
try{
  const ca=await readFile(resolve(root,'.local/cloud-control/mac24dev-demo-cert.pem'));
  const scope=await new Promise((yes,no)=>{
    const q=https.request('https://127.0.0.1:43113/v1/client-scope',{method:'POST',ca,rejectUnauthorized:true,
      headers:{'content-type':'application/json',authorization:'Bearer '+grant.credential}},res=>{
      let text='';res.on('data',v=>{text+=v;if(text.length>65536)q.destroy();});
      res.on('end',()=>{try{if(res.statusCode!==200)throw Error();yes(JSON.parse(text));}catch{no(Error('SCOPE_CHECK_FAILED'));}});
      res.on('error',()=>no(Error('SCOPE_CHECK_FAILED')));
    });q.on('error',()=>no(Error('SCOPE_CHECK_FAILED')));q.setTimeout(8000,()=>q.destroy());q.end('{}');
  });
  if(scope.providerId!==observed.providerId||scope.executorId!==executorId||scope.clientId!==grant.clientId||!Array.isArray(scope.tasks)||scope.tasks.length!==1||Object.keys(pin).some(k=>scope.tasks[0][k]!==pin[k]))throw Error('FIXED_SCOPE_REQUIRED');
  const binding={bindingId:randomUUID(),userId:person.data.id,deviceId:login.deviceId,executorId,
    clientId:scope.clientId,grantId:scope.grantId,clientToken:grant.credential};
  await remote({...bindingRequest,binding});
  console.log(JSON.stringify({bound:true,bindingId:binding.bindingId,userId:binding.userId,deviceId:binding.deviceId,executorId,clientId:binding.clientId,taskId:pin.taskId,version:pin.version,allowResult:scope.allowResult}));
}catch(error){
  await local('/admin/client-revoke',{clientId:grant.clientId},'Bearer '+admin.adminToken).catch(()=>{});
  throw Error('BIND_FAILED_NEW_CLIENT_REVOKED_OR_REQUIRES_RECONCILIATION');
}
