import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {stageSidebarTool} from '../../scripts/stage-sidebar-tool.mjs';
import {validateSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fixture(compiled){
  const dir=await mkdtemp(join(tmpdir(),'opendesk-ui-stage-'));
  const files=compiled?{html:'src/root.html',css:'dist/tool.css',js:'dist/tool.js'}:
    {html:'src/root.html',css:'src/style.css',js:'src/main.js'};
  await mkdir(join(dir,'src'),{recursive:true});
  if(compiled)await mkdir(join(dir,'dist'),{recursive:true});
  for(const [file,content] of [[files.html,'<main>ready</main>'],
    [files.css,'.ready{color:blue}'],[files.js,'void 0;']])
    await writeFile(join(dir,file),content);
  await writeFile(join(dir,'tool.config.json'),JSON.stringify({
    id:'ui-test',version:'1.0.0',title:'Demo UI',
    description:'Source test',capabilities:[],files}));
  const ready=async()=>{
    const records={};
    for(const name of [files.css,files.js]){
      const bytes=await readFile(join(dir,name));
      records[name]={bytes:bytes.length,sha256:sha(bytes)};
    }
    await writeFile(join(dir,'dist/build-ready.json'),
      JSON.stringify({format:'opendesk.ui-build-ready.v1',buildId:'build-1',files:records}));
  };
  return {dir,files,ready};
}
test('pure HTML/CSS/JS staging is immutable, repeatable and non-installing',async t=>{
  const f=await fixture(false);t.after(()=>rm(f.dir,{recursive:true,force:true}));
  const a=await stageSidebarTool(f.dir),same=await stageSidebarTool(f.dir);
  assert.equal(a.output,same.output);
  assert.equal(a.sha256,same.sha256);
  assert.equal(a.installed,false);
  assert.equal(a.previewAuthorized,false);
  assert.equal(validateSidebarToolPackage(JSON.parse(await readFile(a.output,'utf8'))).id,'ui-test');
  await writeFile(join(f.dir,f.files.css),'.ready{color:red}');
  const b=await stageSidebarTool(f.dir);
  assert.notEqual(b.sha256,a.sha256);
  assert.match(await readFile(a.output,'utf8'),/color:blue/);
  assert.match(await readFile(b.output,'utf8'),/color:red/);
  await writeFile(a.output,'corrupted');
  await writeFile(join(f.dir,f.files.css),'.ready{color:blue}');
  await assert.rejects(stageSidebarTool(f.dir),/snapshot was replaced or corrupted/);
});
test('compiled JS/CSS must match the last successful complete build receipt',async t=>{
  const f=await fixture(true);t.after(()=>rm(f.dir,{recursive:true,force:true}));
  await assert.rejects(stageSidebarTool(f.dir),/required project file missing: dist\/build-ready\.json/);
  await f.ready();
  const a=await stageSidebarTool(f.dir);
  assert.equal(a.buildId,'build-1');
  await writeFile(join(f.dir,f.files.js),'void 1;');
  await assert.rejects(stageSidebarTool(f.dir),/changed since the last successful build/);
  assert.match(await readFile(a.output,'utf8'),/void 0;/);
  await f.ready();
  const b=await stageSidebarTool(f.dir);
  assert.notEqual(a.sha256,b.sha256);
});
test('invalid resource traversal is rejected before any file packaging',async t=>{
  const f=await fixture(false);t.after(()=>rm(f.dir,{recursive:true,force:true}));
  const meta=JSON.parse(await readFile(join(f.dir,'tool.config.json'),'utf8'));
  meta.files.js='../outside.js';
  await writeFile(join(f.dir,'tool.config.json'),JSON.stringify(meta));
  await assert.rejects(stageSidebarTool(f.dir),/invalid project-relative file path/);
});

test('staging exposes only bounded, content-addressed text chunks readable by existing Go Native',async t=>{
  const f=await fixture(false);t.after(()=>rm(f.dir,{recursive:true,force:true}));
  const record=await stageSidebarTool(f.dir);
  assert.equal(record.nativeLatest,'opendesk-tool-preview/ui-test/latest.json');
  const pointer=JSON.parse(await readFile(join(f.dir,record.nativeLatest),'utf8'));
  assert.equal(pointer.sha256,record.sha256);
  const manifest=JSON.parse(await readFile(join(f.dir,pointer.manifestPath),'utf8'));
  assert.equal(manifest.sha256,record.sha256);
  assert.equal(manifest.chunks.length,record.nativeChunks);
  let output=[];
  for(const [i,chunk] of manifest.chunks.entries()){
    assert.equal(chunk.path,'opendesk-tool-preview/ui-test/'+record.sha256+'/part-'+String(i).padStart(3,'0')+'.txt');
    const data=await readFile(join(f.dir,chunk.path),'utf8');
    assert.ok(Buffer.byteLength(data)<=32768);
    const decoded=Buffer.from(data,'base64');
    assert.equal(decoded.length,chunk.bytes);
    assert.equal(sha(decoded),chunk.sha256);
    output.push(decoded);
  }
  assert.equal(sha(Buffer.concat(output)),record.sha256);
});
