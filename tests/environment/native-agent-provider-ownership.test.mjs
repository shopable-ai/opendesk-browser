import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

// Run with a short, private, fake HOME. Never inspect/mutate the user's actual
// NativeMessagingHosts manifest or active Chrome instance.
const installer=pathToFileURL(path.resolve('native-agent/install.mjs')).href;
const id='abcdefghijklmnopabcdefghijklmnop';
const tempRoot=process.platform==='darwin'?'/private/tmp':os.tmpdir();
function child(home,body) {
  return spawnSync(process.execPath,['--input-type=module','-e',body],{
    env:{...process.env,HOME:home,OPENDESK_NATIVE_INSTANCE:undefined},
    encoding:'utf8',timeout:15000
  });
}

test('Node setup and cleanup never overwrite Go-owned Host; legacy read-only provider can inspect it',t=>{
  if(!['darwin','linux'].includes(process.platform))return t.skip('Unix Native Host only');
  const home=fs.realpathSync(fs.mkdtempSync(path.join(tempRoot,'od-provider-')));
  t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
  const profile=path.join(home,'cft');fs.mkdirSync(profile);
  const executed=child(home,`
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import path from 'node:path';
    const m=await import(${JSON.stringify(installer)});
    const id=${JSON.stringify(id)};
    const registered=m.setup(id,'cft',${JSON.stringify(profile)});
    const info=JSON.parse(fs.readFileSync(m.INSTALL_FILE,'utf8'));
    assert.equal(info.provider,'node');
    const before=m.loadInstall();
    assert.equal(before.provider,'node');
    // Represent a Go takeover candidate in a completely isolated HOME.
    // Foreign provider's Node scripts must no longer be required for status.
    fs.writeFileSync(m.INSTALL_FILE,JSON.stringify({...info,provider:'opendesk',executable:'/usr/bin/true'}));
    fs.writeFileSync(registered.nativeHost,'Go-owned-native-launcher-fixture');
    for(const file of ['native-host.mjs','wire.mjs','locations.mjs','installation-root.mjs'])
      fs.unlinkSync(path.join(m.PRIVATE_DIR,file));
    const snapshot=new Map([m.INSTALL_FILE,registered.nativeHost,registered.manifest]
      .map(file=>[file,fs.readFileSync(file)]));
    assert.equal(m.loadInstall().provider,'opendesk');
    const status=m.doctor();
    assert.equal(status.installed,true,JSON.stringify(status));
    assert.equal(status.provider,'opendesk');
    assert.throws(()=>m.setup(id,'cft',${JSON.stringify(profile)}),{code:'E_PROVIDER_OWNERSHIP'});
    assert.throws(()=>m.cleanup(),{code:'E_PROVIDER_OWNERSHIP'});
    for(const [file,data] of snapshot)assert.deepEqual(fs.readFileSync(file),data,
      'Node action modified Go-owned file '+file);
    // Never overwrite a foreign orphan launcher if install metadata is absent.
    fs.unlinkSync(m.INSTALL_FILE);
    const launcherBefore=fs.readFileSync(registered.nativeHost);
    assert.throws(()=>m.setup(id,'cft',${JSON.stringify(profile)}),{code:'E_INSTALL_CONFLICT'});
    assert.deepEqual(fs.readFileSync(registered.nativeHost),launcherBefore);
  `);
  assert.equal(executed.status,0,`stderr=${executed.stderr}\nstdout=${executed.stdout}`);
});
