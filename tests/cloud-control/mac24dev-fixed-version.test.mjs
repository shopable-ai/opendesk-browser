import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,readdir,lstat,realpath,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {createTaskPackage} from '../../src/platform/tasks/contract.js';
import {readFixedDemoTaskPackage,taskPin} from '../../examples/cloud-control/mac24dev-demo/task-package.mjs';

const upgradeFile=new URL('../../examples/cloud-control/mac24dev-demo/form-fill.v1.0.1.opendesk-task.json',import.meta.url);
const revalidatedFile=new URL('../../examples/cloud-control/mac24dev-demo/form-fill.v1.0.2.opendesk-task.json',import.meta.url);
const updateFile=fileURLToPath(new URL('../../examples/cloud-control/mac24dev-demo/update-binding.py',import.meta.url));
const pkg=await readFixedDemoTaskPackage(upgradeFile),pin=taskPin(pkg);
const providerId='9c4f182d-7a5f-403d-9b4d-c2144ef35e5b';
const bind={bindingId:'binding-new',deviceId:10,userId:1,executorId:'executor-real-fixture',
  clientId:'client-new',grantId:'grant-new',clientToken:'component-only-credential-0123456789'};
const request={taskPin:pin,deviceId:10,userId:1,binding:bind};
const driver=`import importlib.util,json,sys
spec=importlib.util.spec_from_file_location('binding_maintenance',sys.argv[1])
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
try: print(json.dumps(module.update_binding(sys.argv[2],json.load(sys.stdin))))
except AssertionError as error: print(str(error),file=sys.stderr);sys.exit(1)
`;
async function update(directory,input){
  return new Promise((resolve,reject)=>{
    const p=spawn('python3',['-B','-c',driver,updateFile,directory],{stdio:['pipe','pipe','pipe']});
    let out='',err='';p.stdout.on('data',v=>out+=v);p.stderr.on('data',v=>err+=v);
    p.once('error',reject);p.once('exit',code=>code===0?resolve(JSON.parse(out)):reject(Error(err.trim())));
    p.stdin.end(JSON.stringify(input));
  });
}
async function fixture(t,bindings=[]){
  const root=await realpath(await mkdtemp(join(tmpdir(),'od-demo-version-'))),directory=join(root,'private');
  await mkdir(directory,{mode:0o700});
  const config={providerId,providerUrl:'https://127.0.0.1:43113/',providerCaFile:'/private/fixture-ca.pem',bindings};
  const file=join(directory,'opendesk-cloud-demo.json');await writeFile(file,JSON.stringify(config),{mode:0o600});
  t.after(()=>rm(root,{recursive:true,force:true}));return {directory,file,config};
}

test('upgrade is a separate exact candidate; unknown rehashed versions cannot become demo bindings',async t=>{
  const old=await readFixedDemoTaskPackage();
  assert.equal(old.manifestHash,'57598844f11f75d7566c5adeab283a3aaed0614d151590a6f34124e7abf3632a');
  assert.equal(pkg.sourceUtf8,await readFile(new URL('../../examples/cloud-control/mac24dev-demo/form-fill-upgrade.js',import.meta.url),'utf8'));
  assert.deepEqual(pkg.manifest.siteOrigins,old.manifest.siteOrigins);
  assert.deepEqual(pkg.manifest.permissions,old.manifest.permissions);
  assert.deepEqual(pkg.manifest.paramsSchema,old.manifest.paramsSchema);
  const f=await fixture(t),unknown=await createTaskPackage({...pkg.manifest,version:'1.0.3'},pkg.sourceUtf8);
  const file=join(f.directory,'unknown.json');await writeFile(file,JSON.stringify(unknown));
  await assert.rejects(readFixedDemoTaskPackage(file),/FIXED_DEMO_PACKAGE_REQUIRED/);
});

test('runtime revalidation uses a separate exact package and fresh grant without changing source or scope',async t=>{
  const revalidated=await readFixedDemoTaskPackage(revalidatedFile),nextPin=taskPin(revalidated);
  assert.equal(nextPin.version,'1.0.2');
  assert.equal(revalidated.sourceUtf8,pkg.sourceUtf8);
  assert.deepEqual({...revalidated.manifest,version:pkg.manifest.version},pkg.manifest);
  const previous={...bind,bindingId:'binding-old',clientId:'client-old',grantId:'grant-old'};
  const f=await fixture(t,[previous]);
  await writeFile(f.file,JSON.stringify({...f.config,taskPin:pin}));
  const before=await readFile(f.file,'utf8');
  const next={...request,taskPin:nextPin,expectedBindingId:previous.bindingId};
  await assert.rejects(update(f.directory,{...next,binding:{...bind,grantId:previous.grantId}}),/FRESH_VERSION_GRANT_REQUIRED/);
  await assert.rejects(update(f.directory,{...next,taskPin:{...nextPin,manifestHash:pin.manifestHash}}),/FIXED_PIN/);
  assert.equal(await readFile(f.file,'utf8'),before);
  assert.deepEqual(await update(f.directory,next),{bound:true,replaced:true});
  assert.deepEqual(JSON.parse(await readFile(f.file)).taskPin,nextPin);
  const changedSource=revalidated.sourceUtf8+'\n// changed\n';
  const tampered=await createTaskPackage({...revalidated.manifest,program:{...revalidated.manifest.program,
    sourceHash:createHash('sha256').update(changedSource).digest('hex')}},changedSource);
  const file=join(f.directory,'tampered.json');await writeFile(file,JSON.stringify(tampered));
  await assert.rejects(readFixedDemoTaskPackage(file),/FIXED_DEMO_PACKAGE_REQUIRED/);
});

test('upgrade fills the raw input once and refuses a wrong completion message',async()=>{
  for(const correct of [true,false]){
    const actions=[],name=' Alice ',page={
      locator:selector=>({fill:async value=>actions.push(['fill',selector,value]),
        textContent:async()=>correct?'已提交：Alice':'已提交：Other'}),
      click:async selector=>actions.push(['click',selector]),waitForSelector:async()=>{},
      url:async()=>'http://127.0.0.1:43111/demo-form.html',
    };
    const completion=runInNewContext(pkg.sourceUtf8+'\nmain()', {page,params:{name}});
    if(correct)assert.equal((await completion).ok,true);
    else await assert.rejects(completion,/E_FORM_READBACK/);
    assert.deepEqual(actions,[['fill','#name',name],['click','#submit']]);
  }
});

test('binding preflight is read-only; fixed pin is saved only with an explicit fresh binding',async t=>{
  const f=await fixture(t),before=await readFile(f.file,'utf8');
  assert.deepEqual(await update(f.directory,{...request,checkOnly:true}),{checked:true});
  assert.equal(await readFile(f.file,'utf8'),before);
  assert.deepEqual(await update(f.directory,request),{bound:true,replaced:false});
  const config=JSON.parse(await readFile(f.file));assert.deepEqual(config.taskPin,pin);assert.deepEqual(config.bindings,[bind]);
  assert.equal((await lstat(f.file)).mode&0o777,0o600);
});

test('replacement needs the exact previous binding; its private backup and new identity stay separate',async t=>{
  const previous={...bind,bindingId:'binding-old',clientId:'client-old',grantId:'grant-old'};
  const f=await fixture(t,[previous]),before=await readFile(f.file,'utf8');
  await assert.rejects(update(f.directory,request),/DEVICE_ALREADY_BOUND/);
  await assert.rejects(update(f.directory,{...request,expectedBindingId:'wrong'}),/BINDING_CHANGED/);
  assert.equal(await readFile(f.file,'utf8'),before);
  assert.deepEqual(await update(f.directory,{...request,expectedBindingId:previous.bindingId}),{bound:true,replaced:true});
  const backups=(await readdir(f.directory)).filter(name=>name.startsWith('cloud-demo-binding-before-'));
  assert.equal(backups.length,1);assert.equal(await readFile(join(f.directory,backups[0]),'utf8'),before);
  assert.equal((await lstat(join(f.directory,backups[0]))).mode&0o777,0o600);
});

test('lost binding response is reconciled by exact readback without replacing config or issuing a backup',async t=>{
  const f=await fixture(t);
  await update(f.directory,request);
  const before=await readFile(f.file,'utf8'),files=await readdir(f.directory);
  assert.deepEqual(await update(f.directory,{...request,verifyOnly:true}),{verified:true});
  for(const change of [
    b=>{b.clientId='other-client';},b=>{b.grantId='old-grant';},
    b=>{b.bindingId='other-binding';},b=>{b.clientToken='other-credential';},
  ]){
    const binding={...bind};change(binding);
    await assert.rejects(update(f.directory,{...request,binding,verifyOnly:true}),/BINDING_NOT_CONFIRMED/);
  }
  assert.equal(await readFile(f.file,'utf8'),before);
  assert.deepEqual(await readdir(f.directory),files);
});

test('pin tampering, same client reuse and changes to another device fail without replacing config',async t=>{
  const previous={...bind,bindingId:'binding-old',clientId:'client-old'};
  for(const input of [
    {...request,taskPin:{...pin,sourceHash:'e'.repeat(64)}},
    {...request,expectedBindingId:previous.bindingId,binding:{...bind,clientId:previous.clientId}},
    {...request,expectedBindingId:previous.bindingId},
  ]){
    const f=await fixture(t,[previous]),before=await readFile(f.file,'utf8');
    await assert.rejects(update(f.directory,input));assert.equal(await readFile(f.file,'utf8'),before);
  }
  const f=await fixture(t,[{...previous,deviceId:20}]),before=await readFile(f.file,'utf8');
  await assert.rejects(update(f.directory,request),/OTHER_DEVICE_PIN_CONFLICT/);
  assert.equal(await readFile(f.file,'utf8'),before);
});

// Run the actual maintenance entry with transport boundaries substituted. The
// remote updater itself is exercised above against real private fixture files.
async function bindingTransport({readbackFails=false,wrongScope=false}={}){
  const entry=new URL('../../examples/cloud-control/mac24dev-demo/bind-provider.mjs',import.meta.url);
  const source=(await readFile(entry,'utf8')).replace(/^import .+;$/gm,'')
    .replaceAll('import.meta.url',JSON.stringify(entry.href));
  const selected=await readFixedDemoTaskPackage(revalidatedFile),selectedPin=taskPin(selected);
  const executorId='460154c0-4cec-449a-8075-734d86f7f686';
  const calls=[],remoteCalls=[],output=[];
  let stored;
  const scope={providerId,executorId,clientId:'client-issued',grantId:'grant-issued',
    tasks:[selectedPin],allowResult:false};
  const context={URL,Buffer,JSON,Error,Object,Array,Promise,AbortSignal,resolve:join,
    randomUUID:()=> 'binding-issued',setTimeout,clearTimeout,
    process:{argv:['node','bind-provider.mjs','--executor',executorId,'--login-file','/private/login.json',
      '--package',fileURLToPath(revalidatedFile),'--replace-binding','binding-old']},
    lstat:async()=>({isFile:()=>true,isSymbolicLink:()=>false,mode:0o600}),
    readFile:async path=>String(path).endsWith('login.json')?JSON.stringify({username:'fixture',password:'fixture',userId:1,deviceId:10}):
      String(path).endsWith('admin.json')?JSON.stringify({adminToken:'fixture-admin'}):'fixture transport input',
    readFixedDemoTaskPackage:async()=>selected,taskPin,defaultTaskPackage:revalidatedFile,
    fetch:async(url,options={})=>{
      const path=new URL(url).pathname;calls.push(path);
      const data=path==='/app/user/login/loginSimple'?{code:1000,data:{token:'fixture-jwt'}}:
        path==='/app/user/info/person'?{code:1000,data:{id:1}}:
        path==='/app/operate/device/list'?{code:1000,data:[{id:10}]}:
        path==='/admin/state'?{providerId,executors:{[executorId]:{}}}:
        path==='/admin/client-grant'?{clientId:scope.clientId,credential:'fixture-client'}:{};
      return {ok:true,json:async()=>data};
    },
    https:{request:(_url,_options,onResponse)=>{
      const q=new EventEmitter();q.setTimeout=()=>{};q.destroy=()=>{};
      q.end=()=>queueMicrotask(()=>{
        const res=new EventEmitter();res.statusCode=200;onResponse(res);
        res.emit('data',JSON.stringify({...scope,executorId:wrongScope?'other-executor':executorId}));
        res.emit('end');
      });return q;
    }},
    spawn:()=>{
      const p=new EventEmitter();p.stdout=new EventEmitter();p.stderr=new EventEmitter();p.stderr.resume=()=>{};
      p.kill=()=>p.emit('exit',1);
      p.stdin={end:input=>queueMicrotask(()=>{
        const request=JSON.parse(input);remoteCalls.push(request);
        if(request.checkOnly){p.emit('exit',0);return;}
        if(request.verifyOnly){
          const exact=JSON.stringify(request.binding)===JSON.stringify(stored);
          p.emit('exit',readbackFails||!exact?1:0);return;
        }
        stored=request.binding;p.emit('exit',1); // Commit succeeded; SSH response was lost.
      })};return p;
    },
    console:{log:value=>output.push(JSON.parse(value))},
  };
  let error;
  try{await runInNewContext('(async()=>{'+source+'})()',context);}
  catch(caught){error=caught.message;}
  return {calls,remoteCalls,output,stored,error};
}

test('binding entry confirms a committed write after lost SSH response without revoking or writing twice',async()=>{
  const outcome=await bindingTransport();
  assert.equal(outcome.error,undefined);
  assert.equal(outcome.calls.filter(path=>path==='/admin/client-grant').length,1);
  assert.equal(outcome.calls.includes('/admin/client-revoke'),false);
  assert.equal(outcome.remoteCalls.filter(call=>!call.checkOnly&&!call.verifyOnly).length,1);
  assert.equal(outcome.remoteCalls.filter(call=>call.verifyOnly).length,1);
  assert.equal(outcome.output[0].bound,true);
  assert.equal(outcome.output[0].bindingId,outcome.stored.bindingId);
});

test('unconfirmed binding outcome preserves the original Client and reports unknown without a retry',async()=>{
  const outcome=await bindingTransport({readbackFails:true});
  assert.equal(outcome.error,'BIND_OUTCOME_UNKNOWN_RECONCILE_ORIGINAL_BINDING');
  assert.equal(outcome.calls.filter(path=>path==='/admin/client-grant').length,1);
  assert.equal(outcome.calls.includes('/admin/client-revoke'),false);
  assert.equal(outcome.remoteCalls.filter(call=>!call.checkOnly&&!call.verifyOnly).length,1);
  assert.deepEqual(outcome.output,[]);
});

test('scope failure before binding can revoke the unused new Client',async()=>{
  const outcome=await bindingTransport({wrongScope:true});
  assert.equal(outcome.error,'BIND_FAILED_NEW_CLIENT_REVOKED_OR_REQUIRES_RECONCILIATION');
  assert.equal(outcome.calls.filter(path=>path==='/admin/client-revoke').length,1);
  assert.equal(outcome.remoteCalls.length,1);
  assert.equal(outcome.remoteCalls[0].checkOnly,true);
  assert.equal(outcome.stored,undefined);
});
