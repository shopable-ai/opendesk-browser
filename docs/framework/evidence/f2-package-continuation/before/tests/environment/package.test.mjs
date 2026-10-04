import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, cp, readFile, writeFile, rm} from 'node:fs/promises';
import {verifyPackage} from '../../scripts/verify-package.mjs';

// These checks use the actual built package to detect regressions in the release scanner.
async function mutatedPackage(change, expectation) {
  await mkdir('work/package-tests', {recursive: true});
  const root = await mkdtemp('work/package-tests/case-');
  try { await cp('dist/production', root, {recursive: true}); await change(root); await assert.rejects(verifyPackage(root), expectation); }
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
});
test('remote script and unexpected lazy chunk fail final package verification', async () => {
  await mutatedPackage(async root => {
    const file = `${root}/ui/tool.html`; await writeFile(file, (await readFile(file, 'utf8')).replace('src="tool-shell.js"', 'src="https://example.com/runtime.js"'));
  }, /Unsafe HTML/);
  await mutatedPackage(root => writeFile(`${root}/chunk.js`, 'void 0;'), /Unexpected JS/);
});
test('final package requires tool HTML/CSS and manifest worker references', async () => {
  await mutatedPackage(root=>rm(`${root}/ui/tool.html`),/Missing|required|ENOENT/);
  await mutatedPackage(async root=>{const p=`${root}/manifest.json`;const manifest=JSON.parse(await readFile(p,'utf8'));manifest.background.service_worker='missing-worker.js';await writeFile(p,JSON.stringify(manifest));},/worker|entry|Missing/);
});
