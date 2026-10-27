import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../../'+path,import.meta.url),'utf8');

for(const job of ['sidebar-tool-contract-and-package','ai-vip-share-r5-candidate']){
  test(`legacy ${job} compiles AI VIP React before package-consuming tests`,async()=>{
    const workflow=await read('.github/workflows/sidebar-tools-r1.yml');
    const body=workflow.split(`\n  ${job}:\n`)[1]?.split(/\n  [\w-]+:\n/)[0];
    assert.ok(body,`missing job ${job}`);
    const build=body.indexOf('npm run build --prefix examples/sidebar-tools/ai-vip-share');
    const suite=body.search(/node --test[^\n]*tests\/environment\/ai-vip-share-r(?:2|5)/);
    assert.ok(build>=0,'fresh checkout needs AI VIP dist/tool.js and dist/tool.css');
    assert.ok(suite>build,'compile must succeed before the AI VIP package tests');
    assert.doesNotMatch(body.slice(build,suite),/continue-on-error:\s*true/);
  });
}

test('app CI retains the existing source-bound React browser preparation once',async()=>{
  const profile=JSON.parse(await read('examples/sidebar-tools/ai-vip-share/app.ci.json'));
  assert.equal(profile.kind,'react');
  assert.deepEqual(profile.afterBuild,['examples/sidebar-tools/ai-vip-share/tests/prepare-browser.mjs']);
  assert.deepEqual(profile.browser,['examples/sidebar-tools/ai-vip-share/preview/test-react-chromium.mjs']);
  const preparation=await read(profile.afterBuild[0]);
  assert.match(preparation,/'build:preview'/);
  assert.match(preparation,/result\.status!==0/);
});
