import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runDevCli,loadGoInstall} from '../../native-agent/local-dev/dev-cli.mjs';
import {sourceLabel,sourceName} from '../../src/native-agent/source-label.js';

function output(){
  let text='',error='';
  return {stdout:{write:x=>{text+=x;}},stderr:{write:x=>{error+=x;}},
    get text(){return text},get error(){return error}};
}
test('help/version never read a Go installation, start the provider or touch directory',async()=>{
  const old=process.env.HOME;
  try{
    process.env.HOME='/missing/home-for-r17';
    const h=output();assert.equal(await runDevCli(['--help'],h),0);
    assert.match(h.text,/opendesk-dev/);
    assert.equal(h.error,'');
    const v=output();assert.equal(await runDevCli(['--version'],v),0);
    assert.match(v.text,/R17/);
    assert.equal(v.error,'');
    const invalid=output();assert.equal(await runDevCli(['--unexpected'],invalid),1);
    assert.match(invalid.error,/E_SCHEMA/);
  }finally{process.env.HOME=old;}
});
test('Go installation discovery accepts only paired private Go owner',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'opendesk-r17-install-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.chmodSync(dir,0o700);
  const root=path.join(dir,'.opendesk-browser','native-agent-r1');
  fs.mkdirSync(root,{recursive:true,mode:0o700});
  fs.chmodSync(path.dirname(root),0o700);
  const file=path.join(root,'install.json');
  const cfg={Provider:'opendesk',InstallRoot:root,SocketPath:path.join(root,'agent.sock'),
    ExtensionID:'abcdefghijklmnopabcdefghijklmnop',ClientCredential:'a'.repeat(64),Browser:'chrome'};
  fs.writeFileSync(file,JSON.stringify(cfg),{mode:0o600});
  assert.equal(loadGoInstall(dir).clientCredential,cfg.ClientCredential);
  fs.chmodSync(file,0o644);
  assert.throws(()=>loadGoInstall(dir),e=>e.code==='E_INSTALL_PERMISSIONS');
  fs.chmodSync(file,0o600);
  fs.writeFileSync(file,JSON.stringify({...cfg,Provider:'node'}));
  assert.throws(()=>loadGoInstall(dir),e=>e.code==='E_MIGRATION_REQUIRED');
});
test('online identity stays distinct from the display cache',()=>{
  assert.equal(sourceLabel({name:'同名目录',workspaceId:'workspace-aabb'},{offline:true}),
    '同名目录 · 离线（待连接核验）');
  assert.equal(sourceLabel({name:'同名目录',workspaceId:'workspace-aabb'},{duplicate:true}),
    '同名目录 · aabb');
  assert.equal(sourceName(''), '未命名目录');
  assert.equal(sourceName('破坏\u0000名称'),'未命名目录');
});
