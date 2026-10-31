import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {SIDEBAR_TOOL_LIMITS as limits} from '../../src/ui/sidebar-tools/limits.js';
import {validateSidebarToolPackage,serializeSidebarToolPackage} from '../../src/ui/sidebar-tools/package.js';
import {createSidebarToolPackage,encodeSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {marketResource} from '../../src/marketplace/distribution.js';
import {readToolSnapshot} from '../../src/native-agent/tool-snapshot.js';
const base={format:'opendesk.sidebar-tool.v1',id:'capacity-test',version:'1.0.0',title:'Capacity',
  description:'Bounded package',capabilities:[],html:'<main></main>',css:'',js:'void 0;'};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const limitError=error=>error.code==='E_TOOL_LIMIT';

test('main JS accepts 1 MiB UTF-8 and rejects one extra byte including multibyte source',()=>{
  for(const js of [';'.repeat(limits.js),'/*'+'界'.repeat((limits.js-4)/3)+'*/']){
    assert.equal(Buffer.byteLength(js),limits.js);
    assert.equal(validateSidebarToolPackage({...base,js}).js,js);
    assert.throws(()=>validateSidebarToolPackage({...base,js:js+';'}),limitError);
  }
});
function fullPackage(id=base.id){
  const value={...base,id,format:'opendesk.sidebar-tool.v2',capabilities:['browser.storage','browser.scheduler'],
    requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]},js:';'.repeat(limits.js),
    background:{kind:'opendesk.app-service.v1',js:';',sha256:'a'.repeat(64)}};
  value.background.js+=';'.repeat(limits.packageBytes-Buffer.byteLength(serializeSidebarToolPackage(value)));
  value.background.sha256=sha(value.background.js);
  return value;
}
test('canonical 2 MiB package encodes exactly; extra byte and JSON escaping overflow are refused',()=>{
  const value=fullPackage();
  assert.equal(encodeSidebarToolPackage(value).length,limits.packageBytes);
  assert.throws(()=>encodeSidebarToolPackage({...value,background:{...value.background,js:value.background.js+';'}}),/exceeds 2 MiB/);
  const compactPadding=limits.packageBytes-Buffer.byteLength(JSON.stringify(value));
  const atLimit={...value,background:{...value.background,js:value.background.js+';'.repeat(compactPadding)}};
  validateSidebarToolPackage(atLimit);
  assert.throws(()=>validateSidebarToolPackage({...atLimit,css:' '}),limitError);
  assert.throws(()=>validateSidebarToolPackage({...base,js:'"'.repeat(limits.js)}),limitError);
});
test('compiled receipt accepts 64 sources, rejects 65 and still rejects changed provenance and oversized JS',async t=>{
  const root=await mkdtemp(join(tmpdir(),'tool-capacity-'));t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(join(root,'dist'));
  const files={html:'root.html',css:'dist/tool.css',js:'dist/tool.js'};
  await writeFile(join(root,'tool.config.json'),JSON.stringify({id:base.id,version:base.version,title:base.title,description:base.description,capabilities:[],files}));
  const sources={};
  for(let i=0;i<limits.buildSourceFiles+1;i++){
    const name='source-'+i+'.js',bytes=Buffer.from('void 0;');
    await writeFile(join(root,name),bytes);sources[name]={bytes:bytes.length,sha256:sha(bytes)};
  }
  const receipt={format:'opendesk.ui-build-ready.v1',buildId:'capacity-fixture',files:{},sources:{...sources}};
  delete receipt.sources['source-64.js'];
  for(const [key,name] of Object.entries(files)){
    const bytes=Buffer.from(key==='js'?';'.repeat(limits.js):base[key]);
    await writeFile(join(root,name),bytes);
    if(key!=='html')receipt.files[name]={bytes:bytes.length,sha256:sha(bytes)};
  }
  const save=()=>writeFile(join(root,'dist/build-ready.json'),JSON.stringify(receipt));
  await save();assert.equal((await createSidebarToolPackage(root)).js.length,limits.js);
  receipt.sources=sources;await save();
  await assert.rejects(createSidebarToolPackage(root),/source receipt is invalid/);
  delete receipt.sources['source-64.js'];await save();
  await writeFile(join(root,'source-0.js'),'void 1;');
  await assert.rejects(createSidebarToolPackage(root),/source changed/);
  await writeFile(join(root,'source-0.js'),'void 0;');
  await writeFile(join(root,files.js),';'.repeat(limits.js+1));
  await assert.rejects(createSidebarToolPackage(root),/source file exceeds budget/);
});
test('Native reader transports 2 MiB with <=32 KiB reads and verifies every chunk',async()=>{
  const id='c'.repeat(40),bytes=encodeSidebarToolPackage(fullPackage(id)),digest=sha(bytes);
  const prefix='opendesk-tool-preview/'+id,files=new Map(),chunks=[];
  for(let start=0,index=0;start<bytes.length;start+=limits.nativeChunkBytes,index++){
    const part=bytes.subarray(start,start+limits.nativeChunkBytes),path=prefix+'/'+digest+'/part-'+String(index).padStart(3,'0')+'.txt';
    files.set(path,part.toString('base64'));chunks.push({path,sha256:sha(part),bytes:part.length});
  }
  const manifest=JSON.stringify({format:'opendesk.tool-snapshot.v1',id,version:base.version,sha256:digest,
    bytes:bytes.length,sourceFingerprint:'b'.repeat(64),buildId:null,chunks});
  const manifestSha256=sha(manifest),manifestPath=prefix+'/'+digest+'/manifest-'+manifestSha256+'.json';
  files.set(manifestPath,manifest);
  files.set(prefix+'/latest.json',JSON.stringify({format:'opendesk.tool-preview-latest.v1',id,version:base.version,sha256:digest,manifestPath,manifestSha256,buildId:null}));
  const readText=async path=>{const text=files.get(path);assert.ok(Buffer.byteLength(text)<=32768);return text;};
  assert.equal((await readToolSnapshot({toolId:id,readText})).bytes,limits.packageBytes);
  files.set(chunks[0].path,Buffer.alloc(chunks[0].bytes).toString('base64'));
  await assert.rejects(readToolSnapshot({toolId:id,readText}),/chunk changed/);
});
test('existing v1 installed package retains its canonical bytes',async()=>{
  const text=await readFile('projects/quick-notes/quick-notes.opendesk-tool.json','utf8');
  assert.equal(serializeSidebarToolPackage(JSON.parse(text)),text);
});

test('market package byte reader accepts 2 MiB and refuses excess advertised or streamed bytes',async()=>{
  const url='https://market.example/releases/package.json';
  const data=new Uint8Array(limits.packageBytes);
  assert.equal((await marketResource(url,limits.packageBytes,async()=>new Response(data))).byteLength,limits.packageBytes);
  for(const response of [new Response(data,{headers:{'content-length':String(limits.packageBytes+1)}}),
    new Response(new Uint8Array(limits.packageBytes+1))])
    await assert.rejects(marketResource(url,limits.packageBytes,async()=>response),limitError);
});
