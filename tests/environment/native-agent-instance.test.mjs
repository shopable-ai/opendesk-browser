import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {installationRoot,assertInstalledRoot} from '../../native-agent/installation-root.mjs';

const installer=pathToFileURL(path.resolve('native-agent/install.mjs')).href;
const id='a'.repeat(32);
const tempRoot=process.platform==='darwin'?'/private/tmp':os.tmpdir();
function subprocess(home,instance,code){
  const env={...process.env,HOME:home};
  if(instance===undefined)delete env.OPENDESK_NATIVE_INSTANCE;else env.OPENDESK_NATIVE_INSTANCE=instance;
  return spawnSync(process.execPath,['--input-type=module','-e',code],{env,encoding:'utf8'});
}
test('isolated install and cleanup preserve the default Native installation and profile',t=>{
  const home=fs.realpathSync(fs.mkdtempSync(path.join(tempRoot,'od-ni-')));
  t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  const legacy=path.join(home,'.opendesk-browser','native-agent-r1');
  fs.mkdirSync(legacy,{recursive:true});fs.writeFileSync(path.join(legacy,'install.json'),'historical installation');
  const profile=path.join(home,'cft');fs.mkdirSync(profile);
  const result=subprocess(home,'test',`
    import assert from 'node:assert/strict';import fs from 'node:fs';import {pathToFileURL} from 'node:url';
    const m=await import(${JSON.stringify(installer)});
    assert.throws(()=>m.setup(${JSON.stringify(id)}),{code:'E_INSTALL_INSTANCE'});
    const installed=m.setup(${JSON.stringify(id)},'cft',${JSON.stringify(profile)});
    assert.equal(m.doctor().installed,true);
    const host=await import(pathToFileURL(m.PRIVATE_DIR+'/native-host.mjs'));
    // Installed location selects identity even when the incoming environment differs.
    process.env.OPENDESK_NATIVE_INSTANCE='other';
    const config=host.readInstalledConfiguration();assert.equal(config.installRoot,m.PRIVATE_DIR);
    assert.equal(config.extensionId,${JSON.stringify(id)});
    assert.ok(installed.manifest.startsWith(${JSON.stringify(profile)}+'/'));
    m.cleanup();assert.equal(fs.existsSync(installed.manifest),false);
  `);
  assert.equal(result.status,0,result.stderr);
  assert.equal(fs.readFileSync(path.join(legacy,'install.json'),'utf8'),'historical installation');
});
test('Native instance selection rejects paths and installed roots outside the private layout',()=>{
  for(const instance of ['', '../default','/tmp/agent','a/b','A','a'.repeat(33)])
    assert.throws(()=>installationRoot({home:'/users/test',instance}),{code:'E_INSTALL_INSTANCE'});
  assert.throws(()=>assertInstalledRoot('/tmp/native-agent-r1',{home:'/users/test'}),{code:'E_INSTALL_INVALID'});
  assert.doesNotThrow(()=>assertInstalledRoot('/users/test/.opendesk-browser/native-agent-r1',{home:'/users/test'}));
});
test('Native instance installation refuses a symbolic parent without modifying its target',t=>{
  const home=fs.realpathSync(fs.mkdtempSync(path.join(tempRoot,'od-ni-')));
  t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  const outside=path.join(home,'outside');fs.mkdirSync(outside);fs.mkdirSync(path.join(home,'.opendesk-browser'));
  fs.symlinkSync(outside,path.join(home,'.opendesk-browser','native-agent-instances'));
  const profile=path.join(home,'profile');fs.mkdirSync(profile);
  const result=subprocess(home,'test',`
    import assert from 'node:assert/strict';const m=await import(${JSON.stringify(installer)});
    assert.throws(()=>m.setup(${JSON.stringify(id)},'cft',${JSON.stringify(profile)}),{code:'E_INSTALL_SYMLINK'});
  `);
  assert.equal(result.status,0,result.stderr);assert.deepEqual(fs.readdirSync(outside),[]);
});
