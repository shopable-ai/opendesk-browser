import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,rm,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {validateSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';

const ROOT=resolve(new URL('../..',import.meta.url).pathname);
const makeId=()=> 'ci-fixture-'+randomBytes(4).toString('hex');
function cli(args,env={}){
  return spawnSync(process.execPath,['scripts/app-ci.mjs',...args],
    {cwd:ROOT,encoding:'utf8',env:{...process.env,...env},timeout:90000});
}
async function fixture(capabilities=[]){
  const name=makeId(),project=join(ROOT,'examples/sidebar-tools',name);
  await mkdir(project);
  const config={id:name,version:'1.0.0',title:'CI fixture',description:'Independent extension',
    capabilities,files:{html:'index.html',css:'style.css',js:'main.js'},assets:[]};
  await Promise.all([
    writeFile(join(project,'tool.config.json'),JSON.stringify(config)),
    writeFile(join(project,'index.html'),'<main id="app">Independent UI</main>'),
    writeFile(join(project,'style.css'),'#app{display:block}'),
    writeFile(join(project,'main.js'),'void 0;')
  ]);
  return {name,project};
}
test('a new ordinary App needs no YAML, Host hardcoding or catalog registration',async()=>{
  const x=await fixture(['storage.local']);
  try{
    const plan=cli(['plan'],{APP_CI_SELECTED:x.name,GITHUB_EVENT_NAME:'workflow_dispatch'});
    assert.equal(plan.status,0,plan.stderr);
    assert.deepEqual(JSON.parse(plan.stdout).selected,[x.name]);
    const built=cli(['build',x.name]);
    assert.equal(built.status,0,built.stderr);
    const candidate=JSON.parse(await readFile(
      join(ROOT,'artifacts/app-ci',x.name,'candidate.opendesk-tool.json'),'utf8'));
    assert.equal(validateSidebarToolPackage(candidate).id,x.name);
    const receipt=JSON.parse(await readFile(
      join(ROOT,'artifacts/app-ci',x.name,'candidate-receipt.json'),'utf8'));
    assert.equal(receipt.status,'BUILT_NOT_TESTED_NOT_RELEASED');
    assert.equal(receipt.version,'1.0.0');
    // Adding App-owned tests does not require editing YAML, shared code, or a profile.
    await mkdir(join(x.project,'tests'));
    const local=join(x.project,'tests','automatic.test.mjs');
    await writeFile(local,"import test from 'node:test'; test('auto',()=>{});");
    assert.equal(cli(['node',x.name]).status,0,'ordinary App and new owned test must pass');
    await writeFile(local,"import test from 'node:test'; test('fail-fast',()=>{throw Error('CI_DISCOVERY_PROOF');});");
    const caught=cli(['node',x.name]);
    assert.notEqual(caught.status,0,'a newly failing owned test must block publication');
    assert.match(caught.stdout+caught.stderr,/CI_DISCOVERY_PROOF/);
    await rm(local);

    assert.equal(cli(['inspect',x.name]).status,0,'no per-App workflow needed');
    // The fixture is absent from official catalog; its package still builds.
    const catalog=JSON.parse(await readFile(join(ROOT,'official-tools/catalog.json'),'utf8'));
    assert.ok(!JSON.stringify(catalog).includes(x.name));
  }finally{
    await rm(x.project,{recursive:true,force:true});
    await rm(join(ROOT,'artifacts/app-ci',x.name),{recursive:true,force:true});
  }
});
test('an unprofiled Chrome-privileged App fails closed rather than silently skipping native validation',async()=>{
  const x=await fixture(['adblock.control']);
  try{
    const r=cli(['plan'],{APP_CI_SELECTED:x.name,GITHUB_EVENT_NAME:'workflow_dispatch'});
    assert.notEqual(r.status,0);
    assert.match(r.stderr,/DNR capability requires/);
    await assert.rejects(access(join(ROOT,'artifacts/app-ci',x.name,'candidate-receipt.json')));
  }finally{
    await rm(x.project,{recursive:true,force:true});
    await rm(join(ROOT,'artifacts/app-ci',x.name),{recursive:true,force:true});
  }
});
