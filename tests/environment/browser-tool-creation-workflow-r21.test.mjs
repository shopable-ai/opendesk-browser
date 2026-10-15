// R2.1 uses the existing Node test runner and the existing product sources.
// This is a trace/checkpoint regression test, NOT a new workflow runner or
// evidence of model semantic accuracy / installed Chrome acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../../'+path,import.meta.url),'utf8');
const workstreamPath='docs/framework/workstreams/browser-tool-creation-workflow-r2-20261015.md';
const contractPath='docs/framework/browser-tool-creation-workflow.zh-CN.md';

function traceRows(content){
  return content.split('\n')
    .filter(line=>/^\| F-QN-\d{3} \|/.test(line))
    .map(line=>{
      const cells=line.split('|').slice(1,-1).map(s=>s.trim());
      if(cells.length!==6)throw Error('E_TRACE_COLUMNS');
      const [fid,sid,aid,ui,code,title]=cells;
      return {fid,sid,aid,ui:ui.split(',').map(s=>s.trim()),code,title};
    });
}
function validateRows(rows,{html,js,tests,workstream}){
  assert.equal(rows.length,7,'one existing Quick Notes leaf per original R2 F-ID');
  const ids=new Set();
  for(const [i,row] of rows.entries()){
    const n=String(i+1).padStart(3,'0');
    assert.equal(row.fid,'F-QN-'+n,'stable functional identity/order');
    assert.equal(row.sid,'S-QN-'+n,'scenario mapping must follow the accepted baseline');
    assert.equal(row.aid,'A-QN-'+n,'acceptance mapping must follow the accepted baseline');
    assert.ok(!ids.has(row.fid),'duplicate feature trace');
    ids.add(row.fid);
    assert.ok(workstream.split('\n').some(s=>s.startsWith('| '+row.fid+' |')),
      'feature trace missing from workstream');
    // Every traced leaf must refer to the original reasoning/acceptance table, not
    // just to this newer CODE/TEST cross reference.
    assert.ok(workstream.includes('| '+String.fromCharCode(96)+row.fid+String.fromCharCode(96)),
      row.fid+' must still exist in R2 reasoning/acceptance evidence');
    for(const id of row.ui){
      assert.match(id,/^[a-z][a-z0-9-]+$/);
      assert.ok(html.includes('id="'+id+'"'),row.fid+' missing real UI #'+id);
    }
    assert.match(row.code,/^[A-Za-z_$][A-Za-z0-9_$]*$/);
    assert.ok(new RegExp('\\b'+row.code+'\\b').test(js),row.fid+' missing real JS '+row.code);
    assert.ok(tests.includes("test('"+row.title+"'"),row.fid+' missing concrete Node assertion '+row.title);
  }
  return rows.length;
}
const stageNames=[
  '需求收集','场景推理','功能树','需求审核','HTML 预览',
  'UI 确认','源码开发','测试构建','原生验收','交付'
];

test('R2.1 projects ten user stages onto the original nine engineering stages without a second runner',async()=>{
  const [contract,workflow]=await Promise.all([read(contractPath),read('src/framework/workflow/contract.js')]);
  const section=contract.slice(contract.indexOf('### 11.1'),contract.indexOf('### 11.2'));
  assert.ok(section.length>1000,'checkpoint section missing');
  for(const phase of stageNames){
    assert.ok(section.split('\n').some(s=>s.startsWith('| '+phase+' |')),phase+' lacks stage IO/retry gate');
  }
  assert.match(contract,/UNKNOWN_EFFECT/);
  assert.match(contract,/最后一个具有/);
  assert.match(contract,/升级|版本/);
  assert.match(contract,/SOURCE_WIRED/);
  assert.match(contract,/NOT_TESTED/);
  assert.match(contract,/原生验收.*R2-7b/);
  assert.match(workflow,/opendesk\.workflow\.v1/);
  for(const forbidden of ["'build'","'git.commit'","'install-tool'"]){
    assert.ok(!workflow.includes(forbidden),'page-operation workflow gained development authority');
  }
});
test('Quick Notes approved F/S/A leaves trace to real UI, JavaScript and existing behavioral tests',async()=>{
  const [w,html,js,tests,meta,preview,mock]=await Promise.all([
    read(workstreamPath),read('examples/sidebar-tools/quick-notes/src/index.html'),
    read('examples/sidebar-tools/quick-notes/src/main.js'),
    read('tests/environment/sidebar-quick-notes.test.mjs'),
    read('examples/sidebar-tools/quick-notes/tool.config.json'),
    read('scripts/preview/build-preview.mjs'),
    read('scripts/preview/quick-notes-mock.js')
  ]);
  assert.equal(validateRows(traceRows(w),{html,js,tests,workstream:w}),7);
  const cfg=JSON.parse(meta);
  assert.equal(cfg.id,'quick-notes','updates must preserve installed tool identity');
  assert.equal(cfg.version,'1.1.9','test baseline changed: rebase acceptance evidence');
  assert.deepEqual(cfg.capabilities,['storage.local','currentPage.read','tasks.open']);
  assert.match(js,/ifMatch:notesEtag/,'writes must retain optimistic concurrency');
  assert.match(js,/key:'note'/,'legacy storage migration path missing');
  assert.match(preview,/createSidebarToolPackage\(project\)/);
  assert.match(preview,/mock:true,installed:false,permissionsGranted:false/);
  assert.match(mock,/OFFLINE PREVIEW MOCK/);
  assert.match(mock,/禁止|不支持|never|Never/i);
  assert.ok(!mock.includes('chrome.storage'),'preview must not access real extension storage');
});
test('trace validator fails closed on missing UI, duplicate F-ID and invented source implementation',async()=>{
  const [w,html,js,tests]=await Promise.all([
    read(workstreamPath),read('examples/sidebar-tools/quick-notes/src/index.html'),
    read('examples/sidebar-tools/quick-notes/src/main.js'),
    read('tests/environment/sidebar-quick-notes.test.mjs')
  ]);
  const rows=traceRows(w);
  const context={html,js,tests,workstream:w};
  assert.throws(()=>validateRows(rows.map((r,i)=>i===0?{...r,ui:['invented-missing-control']}:r),context),/missing real UI/);
  assert.throws(()=>validateRows(rows.map((r,i)=>i===1?{...r,fid:rows[0].fid}:r),context),/stable functional identity|duplicate/);
  assert.throws(()=>validateRows(rows.map((r,i)=>i===2?{...r,code:'imaginaryCloudSync'}:r),context),/missing real JS/);
  assert.throws(()=>validateRows(rows.slice(1),context),/one existing Quick Notes leaf/);
});
test('the existing real-package offline preview chain is explicitly kept below native install acceptance',async()=>{
  const [w,ci,packer,preview,sourceLock]=await Promise.all([
    read(workstreamPath),read('.github/workflows/sidebar-preview-contract.yml'),
    read('scripts/build-sidebar-tool.mjs'),
    read('scripts/preview/build-preview.mjs'),
    read('scripts/preview/check-preview-contract.mjs')
  ]);
  assert.match(ci,/node scripts\/build-sidebar-tool\.mjs examples\/sidebar-tools\/quick-notes/);
  assert.match(ci,/node scripts\/tests\/sidebar-preview-runtime-chrome\.mjs/);
  assert.match(packer,/createSidebarToolPackage/);
  assert.match(preview,/sourceCommit:commit/);
  assert.match(sourceLock,/assertPreviewLock/);
  assert.match(w,/安装\/升级及用户数据读回=NOT_TESTED/);
  assert.match(w,/自动调 Skill 完整交付=NOT_IMPLEMENTED/);
  assert.match(w,/UNKNOWN_EFFECT|未知/);
});
