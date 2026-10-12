import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {lockedRuntimeDependencies,createCliShrinkwrap} from '../../scripts/dev-package-dependencies.mjs';

const script=fileURLToPath(new URL('../../scripts/pack-opendesk-dev.mjs',import.meta.url));
test('standalone JSX compiler uses exactly the existing root-locked esbuild version',()=>{
  const pkg=JSON.parse(fs.readFileSync(new URL('../../packages/opendesk-dev/package.json',import.meta.url),'utf8'));
  const lock=JSON.parse(fs.readFileSync(new URL('../../package-lock.json',import.meta.url),'utf8'));
  assert.equal(pkg.dependencies.esbuild,lock.packages['node_modules/esbuild'].version);
  assert.equal(lockedRuntimeDependencies(lock,pkg.dependencies).has('esbuild'),true);
});
test('publishable CLI lock preserves required/transitive/optional versions and excludes unrelated dev tools',()=>{
  const pkg=JSON.parse(fs.readFileSync(new URL('../../packages/opendesk-dev/package.json',import.meta.url),'utf8'));
  const lock=JSON.parse(fs.readFileSync(new URL('../../package-lock.json',import.meta.url),'utf8'));
  const frozen=createCliShrinkwrap(lock,pkg);
  assert.equal(frozen.packages[''].name,pkg.name);
  assert.equal(frozen.packages['node_modules/esbuild'].version,'0.28.2');
  assert.ok(frozen.packages['node_modules/source-map']);
  assert.equal(frozen.packages['node_modules/vite'],undefined);
  assert.equal(frozen.packages['node_modules/esbuild'].dev,undefined);
  assert.ok(frozen.packages['node_modules/@esbuild/darwin-arm64'].integrity);
  assert.throws(()=>createCliShrinkwrap(lock,{...pkg,dependencies:{...pkg.dependencies,esbuild:'0.28.1'}}),/E_PACKAGE_LOCK_VERSION/);
});
test('runtime closure accepts existing transitive modules but does not borrow unrelated development dependencies',()=>{
  const lock={packages:{
    'node_modules/terser':{dependencies:{'source-map-support':'~0.5.20'}},
    'node_modules/source-map-support':{dependencies:{'source-map':'^0.6.0'}},
    'node_modules/source-map':{version:'0.6.1'},'node_modules/esbuild':{version:'0.28.2'},
    'node_modules/vite':{dependencies:{esbuild:'^0.28.2'}}}};
  const names=lockedRuntimeDependencies(lock,{terser:'5.34.1'});
  assert.equal(names.has('source-map'),true);assert.equal(names.has('esbuild'),false);
});
test('pack refuses existing output without deleting backups, including dangling symlink output',t=>{
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'odpack-')));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const stage=path.join(root,'candidate');fs.mkdirSync(stage);fs.writeFileSync(path.join(stage,'backup.txt'),'must survive');
  const run=out=>spawnSync(process.execPath,[script,'--out',out],{encoding:'utf8'});
  const existing=run(stage);assert.equal(existing.status,1);assert.match(existing.stderr,/E_PACKAGE_OUTPUT_EXISTS/);
  assert.equal(fs.readFileSync(path.join(stage,'backup.txt'),'utf8'),'must survive');
  const link=path.join(root,'dangling');fs.symlinkSync(path.join(root,'missing'),link);
  assert.match(run(link).stderr,/E_PACKAGE_OUTPUT_EXISTS/);assert.ok(fs.lstatSync(link).isSymbolicLink());
});
test('pack rejects a parent symlink before writing to its target',t=>{
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'odpack-')));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const target=path.join(root,'target');fs.mkdirSync(target);const link=path.join(root,'linked');fs.symlinkSync(target,link);
  const run=spawnSync(process.execPath,[script,'--out',path.join(link,'candidate')],{encoding:'utf8'});
  assert.equal(run.status,1);assert.match(run.stderr,/E_PACKAGE_OUTPUT_LINK/);assert.deepEqual(fs.readdirSync(target),[]);
});
