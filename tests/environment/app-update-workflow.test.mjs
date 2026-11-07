import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdtemp,mkdir,writeFile,rm,symlink,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {decideSidebarAppUpdate,nextPatchVersion} from '../../scripts/app-update-plan.mjs';
import {resolveSidebarAppProject} from '../../scripts/app-update.mjs';
const app=(version='1.0.9')=>({id:'reading-toc',format:'opendesk.sidebar-tool.v1',version,capabilities:['page.toc']});

test('user app update: new, unchanged, patch, and explicitly versioned releases',()=>{
  assert.equal(decideSidebarAppUpdate({previous:null,proposed:app(),bytesEqual:false}).kind,'NEW_APP');
  assert.equal(decideSidebarAppUpdate({previous:app(),proposed:app(),bytesEqual:true}).kind,'ALREADY_CURRENT');
  assert.deepEqual(decideSidebarAppUpdate({previous:app(),proposed:app(),bytesEqual:false}),{kind:'BUMP_PATCH',version:'1.0.10'});
  assert.deepEqual(decideSidebarAppUpdate({previous:app(),proposed:app('1.1.0'),bytesEqual:false}),
    {kind:'READY_WITH_VERSION',version:'1.1.0'});
});
test('same ID updates never silently downgrade, swap format, or grant extra capabilities',()=>{
  assert.throws(()=>decideSidebarAppUpdate({previous:app(),proposed:app('1.0.8'),bytesEqual:false}),/E_APP_DOWNGRADE/);
  assert.throws(()=>decideSidebarAppUpdate({previous:app(),proposed:{...app(),id:'other'},bytesEqual:false}),/E_APP_IDENTITY/);
  assert.throws(()=>decideSidebarAppUpdate({previous:app(),proposed:{...app(),format:'opendesk.sidebar-tool.v2'},bytesEqual:false}),/E_APP_IDENTITY/);
  assert.throws(()=>decideSidebarAppUpdate({previous:app(),proposed:{...app(),capabilities:['page.toc','browser.cookies']},bytesEqual:false}),/E_APP_REVIEW_REQUIRED/);
});
test('patch increment uses exact version segments',()=>{
  assert.equal(nextPatchVersion('1.0.9'),'1.0.10');
  assert.equal(nextPatchVersion('0.0.999999999999999999'),'0.0.1000000000000000000');
  assert.throws(()=>nextPatchVersion('1.0'),/E_APP_VERSION/);
});

test('read-only CLI inspects the real Reading TOC without installing or modifying a package',()=>{
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const result=spawnSync(process.execPath,['scripts/app-update.mjs','reading-toc','--check'],
    {cwd:root,encoding:'utf8',timeout:15000});
  assert.equal(result.status,0,result.stderr);
  const report=JSON.parse(result.stdout);
  assert.equal(report.id,'reading-toc');
  assert.equal(report.installed,false);
  assert.equal(report.chrome,'NOT_TESTED');
});
test('CLI rejects app IDs that could escape their project directory',()=>{
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const result=spawnSync(process.execPath,['scripts/app-update.mjs','../outside','--check'],
    {cwd:root,encoding:'utf8',timeout:15000});
  assert.equal(result.status,1);
  assert.match(result.stderr,/E_APP_ID/);
});

// Existing update tests did not cover source ownership after a project move.
test('app updates find either source namespace by ID and reject duplicate owners',async t=>{
  const root=await mkdtemp(join(tmpdir(),'app-update-owner-'));
  // macOS may expose /var as a symlink; use the canonical root like the CLI.
  const sourceRoot=await realpath(root);
  t.after(()=>rm(root,{recursive:true,force:true}));
  for(const [namespace,id] of [['projects','moved-tool'],['examples/sidebar-tools','legacy-tool']]){
    const dir=join(sourceRoot,namespace,'directory-'+id);
    await mkdir(dir,{recursive:true});
    await writeFile(join(dir,'tool.config.json'),JSON.stringify({id}));
    assert.equal(await resolveSidebarAppProject(id,sourceRoot),dir);
  }
  const duplicate=join(sourceRoot,'examples/sidebar-tools','duplicate');
  await mkdir(duplicate);
  await writeFile(join(duplicate,'tool.config.json'),JSON.stringify({id:'moved-tool'}));
  await assert.rejects(resolveSidebarAppProject('moved-tool',sourceRoot),/E_APP_IDENTITY/);
  await assert.rejects(resolveSidebarAppProject('missing-tool',sourceRoot),/E_APP_NOT_FOUND/);
});

test('app source discovery refuses symlinked namespaces, projects and configs',async t=>{
  const root=await realpath(await mkdtemp(join(tmpdir(),'app-update-symlink-')));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const actual=join(root,'actual');
  await mkdir(actual);
  await writeFile(join(actual,'tool.config.json'),JSON.stringify({id:'moved-tool'}));
  await symlink(actual,join(root,'projects'));
  await assert.rejects(resolveSidebarAppProject('moved-tool',root),/E_APP_PATH/);
  await rm(join(root,'projects'));await mkdir(join(root,'projects'));
  await symlink(actual,join(root,'projects','moved-tool'));
  await assert.rejects(resolveSidebarAppProject('moved-tool',root),/E_APP_PATH/);
  await rm(join(root,'projects','moved-tool'));
  await mkdir(join(root,'projects','moved-tool'));
  await symlink(join(actual,'tool.config.json'),join(root,'projects','moved-tool','tool.config.json'));
  await assert.rejects(resolveSidebarAppProject('moved-tool',root),/E_APP_PATH/);
});
