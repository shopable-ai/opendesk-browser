import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,readdir,lstat,realpath,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import {createTaskPackage} from '../../src/platform/tasks/contract.js';
import {readFixedDemoTaskPackage,taskPin} from '../../examples/cloud-control/mac24dev-demo/task-package.mjs';

const upgradeFile=new URL('../../examples/cloud-control/mac24dev-demo/form-fill.v1.0.1.opendesk-task.json',import.meta.url);
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
  const f=await fixture(t),unknown=await createTaskPackage({...pkg.manifest,version:'1.0.2'},pkg.sourceUtf8);
  const file=join(f.directory,'unknown.json');await writeFile(file,JSON.stringify(unknown));
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
