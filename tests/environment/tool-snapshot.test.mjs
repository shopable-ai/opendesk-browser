import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {stageSidebarTool} from '../../scripts/stage-sidebar-tool.mjs';
import {readToolSnapshot,previewStorageKey} from '../../src/native-agent/tool-snapshot.js';
const setup=async()=>{
  const root=await mkdtemp(join(tmpdir(),'opendesk-native-chunk-'));
  await mkdir(join(root,'src'));
  await writeFile(join(root,'tool.config.json'),JSON.stringify({
    id:'chunk-tool',version:'1.0.0',title:'Large Tool',description:'Native chunk fixture',
    capabilities:['storage.local'],files:{html:'src/root.html',css:'src/style.css',js:'src/main.js'}}));
  await writeFile(join(root,'src/root.html'),'<main>Native UI</main>');
  await writeFile(join(root,'src/style.css'),'main{padding:6px}');
  await writeFile(join(root,'src/main.js'),'const n="'+('x'.repeat(69000))+'";void n;');
  const report=await stageSidebarTool(root);
  const readText=path=>readFile(join(root,path),'utf8');
  return {root,report,readText};
};
test('Native 32 KiB chunk transport reconstructs one complete immutable UI package',async t=>{
  const f=await setup();t.after(()=>rm(f.root,{recursive:true,force:true}));
  const snapshot=await readToolSnapshot({toolId:'chunk-tool',readText:f.readText});
  assert.equal(snapshot.tool.id,'chunk-tool');
  assert.equal(snapshot.tool.version,'1.0.0');
  assert.ok(snapshot.chunks>=4,'fixture crosses the single Go files.read limit');
  assert.equal(snapshot.sha256,f.report.sha256);
  assert.equal(snapshot.bytes,(await readFile(f.report.output)).length);
  assert.equal(typeof previewStorageKey('00000000-0000-4000-8000-000000000001'),'string');
  assert.throws(()=>previewStorageKey('../unsafe'),/invalid preview/);
});
test('one corrupted native chunk cannot become executable or an installed package',async t=>{
  const f=await setup();t.after(()=>rm(f.root,{recursive:true,force:true}));
  const pointer=JSON.parse(await f.readText(f.report.nativeLatest));
  const manifest=JSON.parse(await f.readText(pointer.manifestPath));
  const path=manifest.chunks[1].path;
  const original=await f.readText(path);
  const tampered=original.slice(0,12)+(original[12]==='A'?'B':'A')+original.slice(13);
  await writeFile(join(f.root,path),tampered);
  await assert.rejects(readToolSnapshot({toolId:'chunk-tool',readText:f.readText}),/chunk changed during Native transfer/);
});
test('changed latest pointer during transfer invalidates the snapshot',async t=>{
  const f=await setup();t.after(()=>rm(f.root,{recursive:true,force:true}));
  let reads=0;
  const readText=async path=>{
    if(path===f.report.nativeLatest&&++reads===2)return (await f.readText(path)).replace('"version":"1.0.0"','"version":"1.0.1"');
    return f.readText(path);
  };
  await assert.rejects(readToolSnapshot({toolId:'chunk-tool',readText}),/latest pointer changed during transfer/);
});
test('wrong source tool ID fails before touching the disk',async t=>{
  let called=0;
  await assert.rejects(readToolSnapshot({toolId:'../unsafe',readText:()=>{called++;return '{}';}}),/invalid tool identity/);
  assert.equal(called,0);
});
