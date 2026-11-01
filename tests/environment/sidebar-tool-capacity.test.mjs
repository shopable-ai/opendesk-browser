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
  description:'Large package',capabilities:[],html:'<main></main>',css:'',js:'void 0;'};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const limitError=error=>error.code==='E_TOOL_LIMIT';

test('main JS accepts large ASCII and multibyte source without a product byte cap',()=>{
  for(const js of [';'.repeat(2*1024*1024+1),'/*'+'界'.repeat(750000)+'*/']){
    assert.equal(validateSidebarToolPackage({...base,js}).js,js);
    assert.equal(validateSidebarToolPackage({...base,js:js+';'}).js,js+';');
  }
});
function fullPackage(id=base.id){
  const value={...base,id,format:'opendesk.sidebar-tool.v2',capabilities:['browser.storage','browser.scheduler'],
    requires:{browserSdk:'1.0.0'},contributes:{contextMenus:[]},js:';'.repeat(1100000),
    background:{kind:'opendesk.app-service.v1',js:';',sha256:'a'.repeat(64)}};
  value.background.js+=';'.repeat(2300000-Buffer.byteLength(serializeSidebarToolPackage(value)));
  value.background.sha256=sha(value.background.js);
  return value;
}
test('large packages and JSON escaping round-trip without a total byte cap',()=>{
  const value=fullPackage();
  assert.equal(encodeSidebarToolPackage(value).length,2300000);
  for(const candidate of [value,{...base,js:'"'.repeat(2200000)}])
    assert.deepEqual(validateSidebarToolPackage(JSON.parse(encodeSidebarToolPackage(candidate))),candidate);
});
test('compiled receipt accepts large source and still rejects excess source entries and changed provenance',async t=>{
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
    const bytes=Buffer.from(key==='js'?';'.repeat(2200000):base[key]);
    await writeFile(join(root,name),bytes);
    if(key!=='html')receipt.files[name]={bytes:bytes.length,sha256:sha(bytes)};
  }
  const save=()=>writeFile(join(root,'dist/build-ready.json'),JSON.stringify(receipt));
  await save();assert.equal((await createSidebarToolPackage(root)).js.length,2200000);
  receipt.sources=sources;await save();
  await assert.rejects(createSidebarToolPackage(root),/source receipt is invalid/);
  delete receipt.sources['source-64.js'];await save();
  await writeFile(join(root,'source-0.js'),'void 1;');
  await assert.rejects(createSidebarToolPackage(root),/source changed/);
  await writeFile(join(root,'source-0.js'),'void 0;');
  await writeFile(join(root,files.js),';'.repeat(2200001));
  await assert.rejects(createSidebarToolPackage(root),/bytes differ from their build receipt/);
});
test('Native reader transports a package above 2 MiB with <=32 KiB reads and verifies every chunk',async()=>{
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
  assert.equal((await readToolSnapshot({toolId:id,readText})).bytes,bytes.length);
  files.set(chunks[0].path,Buffer.alloc(chunks[0].bytes).toString('base64'));
  await assert.rejects(readToolSnapshot({toolId:id,readText}),/chunk changed/);
});
test('existing v1 installed package retains its canonical bytes',async()=>{
  const text=await readFile('projects/quick-notes/quick-notes.opendesk-tool.json','utf8');
  assert.equal(serializeSidebarToolPackage(JSON.parse(text)),text);
});

test('market byte reader accepts large releases and refuses bytes beyond their declared size',async()=>{
  const url='https://market.example/releases/package.json';
  const data=new Uint8Array(2300000);
  assert.equal((await marketResource(url,data.length,async()=>new Response(data))).byteLength,data.length);
  for(const response of [new Response(data,{headers:{'content-length':String(data.length+1)}}),
    new Response(new Uint8Array(data.length+1))])
    await assert.rejects(marketResource(url,data.length,async()=>response),limitError);
});
