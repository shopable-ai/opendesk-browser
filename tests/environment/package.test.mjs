import test from 'node:test';
import assert from 'node:assert/strict';
import {access, mkdir, mkdtemp, cp, readFile, writeFile, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {BUILD_POLICY} from '../../scripts/build-contract.mjs';
import {verifyPackage} from '../../scripts/verify-package.mjs';

// These checks use the actual built package to detect regressions in the release scanner.
async function mutatedPackage(change, expectation) {
  // Reject stale/broken baselines before applying the mutation; the assertions below remain unchanged.
  await verifyPackage('dist/production');
  await mkdir('work/package-tests', {recursive: true});
  const root = await mkdtemp('work/package-tests/case-');
  try { await cp('dist/production', root, {recursive: true}); await change(root); let rejection;
    await assert.rejects(verifyPackage(root).catch(error => { rejection = error; throw error; }), expectation);
    console.log(JSON.stringify({kind: 'historical-package-mutation', expectedPattern: expectation.source, actualError: rejection.message})); }
  finally { await rm(root, {recursive: true, force: true}); }
}
test('final classic scanner rejects eval alias and function-constructor references', async () => {
  for (const addition of ['; const execute = eval; execute("1");', '; const Constructor = Function; Constructor("return 1")();']) {
    await mutatedPackage(async root => {
      const file = `${root}/agents/health.js`; await writeFile(file, (await readFile(file, 'utf8')) + addition);
    }, /Dynamic execution reference/);
  }
});
test('final package cannot omit a referenced local asset', async () => {
  await mutatedPackage(root => rm(`${root}/ui/tool-shell.css`), /ENOENT|Missing/);
  await mutatedPackage(root => rm(`${root}/ui/design-system.css`), /ENOENT|Missing/);
});
test('remote script and unexpected lazy chunk fail final package verification', async () => {
  await mutatedPackage(async root => {
    const file = `${root}/ui/tool.html`; await writeFile(file, (await readFile(file, 'utf8')).replace('src="tool-shell.js"', 'src="https://example.com/runtime.js"'));
  }, /Unsafe HTML/);
  await mutatedPackage(root => writeFile(`${root}/chunk.js`, 'void 0;'), /Unexpected JS/);
});
test('packaged design system rejects remote CSS imports',async()=>{
  await mutatedPackage(async root=>{
    const path=root+'/ui/design-system.css';
    await writeFile(path,(await readFile(path,'utf8'))+'\n@import "https://example.com/theme.css";\n');
  },/Unsafe CSS resources/);
});

test('final package requires tool HTML/CSS and manifest worker references', async () => {
  await mutatedPackage(root=>rm(`${root}/ui/tool.html`),/Missing|required|ENOENT/);
  await mutatedPackage(async root=>{const p=`${root}/manifest.json`;const manifest=JSON.parse(await readFile(p,'utf8'));manifest.background.service_worker='missing-worker.js';await writeFile(p,JSON.stringify(manifest));},/worker|entry|Missing/);
});

async function packageCopy(t,mode) {
  await verifyPackage(`dist/${mode}`,{mode});
  await mkdir('work/package-tests',{recursive:true});
  const directory=await mkdtemp('work/package-tests/mode-');
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const root=resolve(directory,'dist',mode);
  await cp(`dist/${mode}`,root,{recursive:true});
  return {directory:resolve(directory),root};
}
async function padScript(file,bytes) {
  const original=await readFile(file);
  assert(bytes-original.length>=5,'fixture must grow the actual script');
  await writeFile(file,Buffer.concat([original,Buffer.from('\n/*'+' '.repeat(bytes-original.length-5)+'*/')]));
}
test('explicit package modes, verifier CLI and production pack cannot accept a development artifact',async t=>{
  const {directory,root}=await packageCopy(t,'development');
  assert.equal((await verifyPackage('dist/production',{mode:'production'})).mode,'production');
  assert.equal((await verifyPackage(root,{mode:'development'})).mode,'development');
  await assert.rejects(verifyPackage(root,{mode:'production'}),/Package mode mismatch: expected production/);
  const cli=spawnSync(process.execPath,[resolve('scripts/verify-package.mjs'),root,'production'],{encoding:'utf8'});
  assert.notEqual(cli.status,0);assert.match(cli.stderr,/Package mode mismatch: expected production/);
  await cp(root,resolve(directory,'dist/production'),{recursive:true});
  const pack=spawnSync(process.execPath,[resolve('scripts/pack.mjs'),'production'],{cwd:directory,encoding:'utf8'});
  assert.notEqual(pack.status,0);assert.match(pack.stderr,/Package mode mismatch: expected production/);
  await assert.rejects(access(resolve(directory,'artifacts')),/ENOENT/);
  await assert.rejects(access(resolve(directory,'docs/framework/evidence/wxt/packages/pack-production.json')),/ENOENT/);
});
test('final production verification blocks a physically oversized SW before packing',async t=>{
  const {root}=await packageCopy(t,'production');
  await padScript(`${root}/sw.js`,BUILD_POLICY.productionBytes+1);
  await assert.rejects(verifyPackage(root,{mode:'production'}),/Packaged JS exceeds byte budget: sw.js/);
});
test('development retains its SW allowance while all other generated entries keep the production limit',async t=>{
  const {root}=await packageCopy(t,'development');
  await padScript(`${root}/sw.js`,BUILD_POLICY.developmentBytes-1);
  assert.equal((await verifyPackage(root,{mode:'development'})).mode,'development');
  await assert.rejects(verifyPackage(root,{mode:'production'}),/Package mode mismatch: expected production/);
  const other=await packageCopy(t,'development');
  await padScript(`${other.root}/agents/health.js`,BUILD_POLICY.productionBytes+1);
  await assert.rejects(verifyPackage(other.root,{mode:'development'}),/Packaged JS exceeds byte budget: agents\/health.js/);
  await writeFile(`${root}/sw.js`,(await readFile(`${root}/sw.js`)).toString()+'\n\n');
  await assert.rejects(verifyPackage(root,{mode:'development'}),/Packaged JS exceeds byte budget: sw.js/);
});
