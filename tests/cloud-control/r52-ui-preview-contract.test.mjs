import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(path,'utf8');
const proto='examples/ui/cloud-control-r5.2-preview.html';
const contract='docs/architecture/browser-framework/cloud-control-r5.2-ui-preview-contract.zh-CN.md';

test('Cloud UI preview is a single offline-only non-privileged HTML fixture',async()=>{
  const html=await read(proto);
  assert.match(html,/^<!doctype html>/i);
  assert.match(html,/<html lang="zh-CN">/);
  assert.equal((html.match(/<script\b/g)||[]).length,1);
  assert.equal((html.match(/<link\b[^>]*href="https?:\/\//g)||[]).length,0);
  assert.equal((html.match(/<script\b[^>]*src=/g)||[]).length,0);
  assert.match(html,/never calls Chrome APIs/i);
  assert.doesNotMatch(html,/\bchrome\.runtime\.|\bchrome\.tabs\.|\beval\s*\(/);
  assert.match(html,/UI REVIEW ONLY/i);
});

test('six named product states and all R27 narrow Side Panel widths exist',async()=>{
  const html=await read(proto);
  for(const mode of ['active','first','paired','running','offline','stale'])
    assert.match(html,new RegExp('data-scenario="'+mode+'"'),mode);
  for(const size of [300,320,360,420,520])
    assert.match(html,new RegExp('data-width="'+size+'"'),String(size));
  assert.match(html,/@media\(max-width:340px\)/);
  assert.match(html,/--space-2:8px/);
  assert.match(html,/--space-3:12px/);
  assert.match(html,/--space-4:16px/);
});

test('two independently pinned Task packages and all review actions appear in the prototype',async()=>{
  const [html,form,search]=await Promise.all([
    read(proto),read('examples/tasks/form-fill.v1.opendesk-task.json'),
    read('examples/tasks/modern-search.v1.opendesk-task.json')]);
  const a=JSON.parse(form),b=JSON.parse(search);
  assert.notEqual(a.manifest.taskId,b.manifest.taskId);
  assert.notEqual(a.manifest.program.sourceHash,b.manifest.program.sourceHash);
  for(const pkg of [a,b])for(const value of [pkg.manifest.taskId,pkg.manifest.program.sourceHash,
    pkg.manifest.siteOrigins[0]])assert.ok(html.includes(value),value);
  for(const action of ['pair-confirm','approve-confirm','stop-confirm','unpair-confirm',
    'review','history','settings','demo-reconnect'])
    assert.ok(html.includes("case '"+action+"'"),action);
});

test('consent and provider state have distinct security-visible concepts',async()=>{
  const html=await read(proto);
  assert.match(html,/逐项授权，默认不回传正文/);
  assert.match(html,/额外允许回传结果正文/);
  assert.match(html,/我另外同意/);
  assert.match(html,/结果待核对/);
  assert.match(html,/不会自动重试/);
  assert.match(html,/本地已停止，远端尚未确认/);
  assert.match(html,/不是任意脚本执行器/);
});

test('39 independently traceable UI functions and existing Authority API mapping',async()=>{
  const doc=await read(contract);
  const ids=[...doc.matchAll(/^\| ([A-F]\d{2}) \|/gm)].map(m=>m[1]);
  assert.equal(ids.length,39,ids.join(','));
  assert.equal(new Set(ids).size,39);
  for(const [prefix,expected] of [['A',7],['B',5],['C',9],['D',7],['E',5],['F',6]])
    assert.equal(ids.filter(s=>s.startsWith(prefix)).length,expected,prefix);
  for(const symbol of ['cloudPair','cloudApprove','cloudStatus','cloudObserve','cloudStop',
    'cloudUnpair','listTaskCatalog','remoteSuspension','RunHost','RESULT'])
    assert.ok(new RegExp(symbol,'i').test(doc),symbol);
  assert.match(doc,/NATIVE_PENDING/);
});
