import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createHooks} from 'hookable';
import {mkdtemp,mkdir,readFile,writeFile,rm,stat,symlink,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {configureDevelopment,closeDevelopment,drainDevelopment} from '../../scripts/wxt-development.mjs';
import {buildOfficialTools,writeOfficialToolResources} from '../../scripts/build-official-tools.mjs';
import {buildSidebarTool,promoteSidebarToolPackage} from '../../scripts/build-sidebar-tool.mjs';
import {OFFICIAL_CATALOG_PATH,OFFICIAL_SOURCE_SCHEMA,OFFICIAL_SOURCE_REPOSITORY} from '../../src/sidebar-tools/official-catalog.js';
import {SDK_RESOURCE_PATHS} from '../../src/framework/sdk/resource-contract.js';
import {BUILTIN_RESOURCE_PATHS} from '../../src/libs/runtime-contract.js';
import {BROWSER_EDITION_RECORD,editionRecordText} from '../../scripts/browser-editions-r245.mjs';
import {resolveMarketChannel,marketExternalConnectable} from '../../scripts/market-channel.mjs';

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fixture(t,{starting=false,buildError}={}){
  const root=await mkdtemp(join(tmpdir(),'opendesk-official-update-'));
  const publicDir=join(root,'public'),outDir=join(root,'output');
  const write=async(path,bytes)=>{await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),bytes);};
  const source=JSON.parse(await readFile(new URL('../../manifest.json',import.meta.url),'utf8'));
  const manifest={...source,action:{...source.action,default_title:'打开 '+source.name}};
  const external=marketExternalConnectable(resolveMarketChannel({mode:'development'}));
  if(external)manifest.externally_connectable=external;else delete manifest.externally_connectable;
  await write('manifest.json',JSON.stringify(source));
  await write('output/manifest.json',JSON.stringify(manifest));
  await write('output/'+BROWSER_EDITION_RECORD,editionRecordText('standard'));
  const paths=[...new Set([...SDK_RESOURCE_PATHS,...BUILTIN_RESOURCE_PATHS])];
  for(const path of paths)await write('output/'+path,'fixture '+path);
  for(const id of ['alpha-tool','beta-tool']){
    const project='examples/sidebar-tools/'+id;
    await write(project+'/tool.config.json',JSON.stringify({id,version:'1.0.0',title:id,
      description:'Resource update fixture',capabilities:[],files:{html:'src/index.html',css:'src/style.css',js:'src/main.js'},assets:[]}));
    await write(project+'/src/index.html','<main>Fixture</main>');
    await write(project+'/src/style.css','main { color: green; }');
    await write(project+'/src/main.js','void 0;');
  }
  const catalog={schema:OFFICIAL_SOURCE_SCHEMA,sourceRepository:OFFICIAL_SOURCE_REPOSITORY,
    tools:[{id:'alpha-tool',project:'examples/sidebar-tools/alpha-tool',kind:'sidebar-tool',installationPolicy:'optional'}]};
  const saveCatalog=()=>write(OFFICIAL_CATALOG_PATH,JSON.stringify(catalog));
  await saveCatalog();
  const generated=await buildOfficialTools(publicDir,{root});await writeOfficialToolResources(generated,outDir);
  // Include unrelated resources under the same prefix: only generator-owned
  // catalog/package paths may be replaced, and WXT metadata must survive.
  const sandbox='sidebar-tools/sandbox.html';
  const staticPaths=['manifest.json',sandbox,'official-tools/diagnostic.txt',...paths];
  await write('output/'+sandbox,'<html>shared sandbox sentinel</html>');
  await write('output/official-tools/diagnostic.txt','unrelated');
  const staticAssets=staticPaths.map(fileName=>({type:'asset',fileName,customMetadata:{retain:true}}));
  const watched=[];
  const watcher=new EventEmitter();watcher.add=paths=>watched.push(...paths);watcher.close=async()=>{};
  let restarts=0;
  const errors=[];
  const output={manifest,steps:[],publicAssets:[...staticAssets,...[...generated.resources.keys()].map(fileName=>({type:'asset',fileName}))]};
  const server={watcher,currentOutput:starting?undefined:output,restart:async()=>{restarts++;}};
  const wxt={hooks:createHooks(),config:{root,publicDir,outDir},builder:{async build(){if(buildError)throw buildError;},async importEntrypoints(){}},logger:{info(){},error:error=>errors.push(String(error))}};
  configureDevelopment(wxt,server);
  t.after(async()=>{await closeDevelopment(wxt,server);await rm(root,{recursive:true,force:true});});
  if(!starting)await server.reloadExtension();assert.deepEqual(errors,[]);
  const marker=async()=>JSON.parse(await readFile(join(outDir,'development-update.json'),'utf8'));
  const flush=async()=>{await server.reloadExtension();await server.reloadExtension();};
  const change=(path,event='change')=>watcher.emit('all',event,join(root,path));
  const sandboxBefore=await stat(join(outDir,sandbox),{bigint:true});
  const assertIntact=async()=>{
    assert.equal(restarts,0);
    assert.equal(server.currentOutput,output);
    assert.equal(output.manifest,manifest);
    for(const asset of staticAssets)assert.equal(output.publicAssets.find(row=>row.fileName===asset.fileName),asset);
    const after=await stat(join(outDir,sandbox),{bigint:true});
    assert.equal(after.ino,sandboxBefore.ino);assert.equal(after.mtimeNs,sandboxBefore.mtimeNs);
    assert.equal(await readFile(join(outDir,sandbox),'utf8'),'<html>shared sandbox sentinel</html>');
  };
  const assertPublished=async()=>{
    const record=await marker();
    const release=JSON.parse(await readFile(join(outDir,OFFICIAL_CATALOG_PATH),'utf8'));
    const expected=[OFFICIAL_CATALOG_PATH,...release.apps.map(row=>row.packagePath)].sort();
    assert.deepEqual(output.publicAssets.filter(row=>row.fileName===OFFICIAL_CATALOG_PATH||row.fileName.endsWith('.opendesk-tool.json')).map(row=>row.fileName).sort(),expected);
    assert.equal(new Set(output.publicAssets.map(row=>row.fileName)).size,output.publicAssets.length);
    for(const fileName of expected){
      assert.equal(output.publicAssets.find(row=>row.fileName===fileName).type,'asset');
      assert.equal(record.files[fileName],digest(await readFile(join(outDir,fileName))));
    }
    assert.match(record.revision,/^[a-f0-9]{64}$/);
    assert.equal(record.revision,digest(JSON.stringify(record.files)));
    assert.deepEqual(errors,[]);await assertIntact();return record;
  };
  return {root,outDir,publicDir,write,catalog,saveCatalog,change,flush,marker,errors,output,server,wxt,generated,assertIntact,assertPublished,watched};
}

test('official catalog data and declared source edits publish without restarting or touching sandbox',async t=>{
  const f=await fixture(t),before=await f.marker();
  f.catalog.tools[0].installationPolicy='preinstalled';await f.saveCatalog();
  f.change(OFFICIAL_CATALOG_PATH);await f.flush();
  const policy=await f.assertPublished();assert.notEqual(policy.revision,before.revision);
  const path='examples/sidebar-tools/alpha-tool/src/main.js';
  await f.write(path,'void "changed source";');f.change(path);
  f.change('examples/sidebar-tools/alpha-tool/README.md');await f.flush();
  assert.notEqual((await f.assertPublished()).revision,policy.revision);
});

async function promoteFixture(root,project){
  const candidate=join(root,'candidate.json');
  await buildSidebarTool(join(root,project),{out:candidate});
  await promoteSidebarToolPackage(join(root,project),{from:candidate});
}
test('project promotions publish exact package identity despite unrelated unfinished compilation and reject bad packages',async t=>{
  const f=await fixture(t);
  assert(f.watched.includes(join(f.root,'projects')),'real project promotions must be watched');
  const project='projects/video-speed-controller',id='video-speed-controller';
  const config={id,version:'1.2.1',title:id,description:'Promoted release',capabilities:['storage.local'],
    files:{html:'src/index.html',css:'src/style.css',js:'src/main.js'},assets:[]};
  await f.write(project+'/tool.config.json',JSON.stringify(config));
  await f.write(project+'/src/index.html','<main>Promoted</main>');
  await f.write(project+'/src/style.css','main { color: navy; }');
  await f.write(project+'/src/main.js','void 0;');
  const path=project+'/'+id+'.opendesk-tool.json';
  await promoteFixture(f.root,project);
  const other=f.catalog.tools[0];
  await promoteFixture(f.root,other.project);
  const draft=JSON.parse(await readFile(join(f.root,other.project,'tool.config.json'),'utf8'));
  draft.files.js='dist/tool.js';
  await f.write(other.project+'/tool.config.json',JSON.stringify(draft));
  f.catalog.tools.push({id,project,kind:'sidebar-tool',installationPolicy:'optional'});
  await f.saveCatalog();f.change(OFFICIAL_CATALOG_PATH);await f.flush();
  const first=await f.assertPublished();
  await f.write(project+'/tool.config.json',JSON.stringify({...config,files:{...config.files,js:'dist/tool.js'}}));
  f.change(project+'/tool.config.json');await f.flush();
  assert.deepEqual(await f.assertPublished(),first,'unfinished project source leaves promoted release unchanged');
  config.version='1.2.2';await f.write(project+'/tool.config.json',JSON.stringify(config));
  await promoteFixture(f.root,project);
  const bytes=await readFile(join(f.root,path));
  f.change(path);await f.flush();
  const next=await f.assertPublished();assert.notEqual(next.revision,first.revision);
  const catalog=JSON.parse(await readFile(join(f.outDir,OFFICIAL_CATALOG_PATH),'utf8'));
  const release=catalog.apps.find(row=>row.toolId===id);
  assert.equal(release.version,'1.2.2');assert.deepEqual(release.capabilities,config.capabilities);
  assert.equal(release.sha256,digest(bytes));assert.equal(release.bytes,bytes.length);
  await f.write(path,'{broken');f.change(path);await f.flush();
  assert.deepEqual(await f.marker(),next);assert(f.errors.length>0);
  for(const directory of [f.outDir,f.publicDir]){
    assert.deepEqual(await readFile(join(directory,release.packagePath)),bytes);
    assert.deepEqual(JSON.parse(await readFile(join(directory,OFFICIAL_CATALOG_PATH),'utf8')),catalog);
  }
  await f.write(path,bytes);f.errors.length=0;f.change(path);await f.flush();await f.assertPublished();
});

test('adding and removing official tools refreshes only owned public assets and publishes without ENOENT',async t=>{
  const f=await fixture(t),before=await f.marker();
  f.catalog.tools.push({id:'beta-tool',project:'examples/sidebar-tools/beta-tool',kind:'sidebar-tool',installationPolicy:'optional'});
  await f.saveCatalog();f.change(OFFICIAL_CATALOG_PATH,'add');await f.flush();
  const added=await f.assertPublished();assert.notEqual(added.revision,before.revision);
  const removed='official-tools/alpha-tool/alpha-tool.opendesk-tool.json';
  f.catalog.tools.shift();await f.saveCatalog();f.change(OFFICIAL_CATALOG_PATH);await f.flush();
  const after=await f.assertPublished();assert.notEqual(after.revision,added.revision);
  assert.equal(removed in after.files,false);
  assert.equal(f.output.publicAssets.some(row=>row.fileName===removed),false);
  for(const directory of [f.outDir,f.publicDir])await assert.rejects(readFile(join(directory,removed)),{code:'ENOENT'});
});

test('invalid catalog, unsafe source and output copy failures block publication and recover in the same queue',async t=>{
  const f=await fixture(t),before=await f.marker();
  await f.write(OFFICIAL_CATALOG_PATH,JSON.stringify({...f.catalog,sourceRepository:'https://untrusted.example'}));
  f.change(OFFICIAL_CATALOG_PATH);await f.flush();
  assert.deepEqual(await f.marker(),before);assert(f.errors.length>0);
  await f.saveCatalog();
  const path='examples/sidebar-tools/alpha-tool/src/main.js';
  await rm(join(f.root,path));await f.write('external.js','void 0;');
  await symlink(join(f.root,'external.js'),join(f.root,path));
  f.change(path);await f.flush();assert.deepEqual(await f.marker(),before);
  await rm(join(f.root,path));await f.write(path,'void "recovery";');
  // Fail the existing atomic output writer, after public generation succeeds.
  const target=join(f.outDir,'official-tools/alpha-tool');
  await rm(target,{recursive:true});await mkdir(join(f.root,'outside'));
  await symlink(join(f.root,'outside'),target);
  f.change(path);await f.flush();assert.deepEqual(await f.marker(),before);
  await f.server.reloadPage();assert.deepEqual(await f.marker(),before,'unrelated publish must stay blocked');
  await f.assertIntact();
  await rm(target);f.errors.length=0;f.change(path);await f.flush();
  assert.notEqual((await f.assertPublished()).revision,before.revision);
});


test('official changes during initial WXT output clearing wait for its build and recover without another edit',async t=>{
  const f=await fixture(t,{starting:true});
  // server:started has registered the watcher but internalBuild has not copied
  // public assets or assigned currentOutput yet. Its catalog is absent.
  await rm(join(f.outDir,OFFICIAL_CATALOG_PATH));
  f.catalog.tools[0].installationPolicy='preinstalled';await f.saveCatalog();
  f.change(OFFICIAL_CATALOG_PATH);
  const publication=f.server.reloadExtension();
  await new Promise(resolve=>setImmediate(resolve));
  // The original builder must still be callable while publication waits.
  await f.wxt.builder.build();
  assert.deepEqual(f.errors,[]);
  await assert.rejects(readFile(join(f.outDir,OFFICIAL_CATALOG_PATH)),{code:'ENOENT'});
  // Finish the original WXT public copy, then its actual completion hook.
  await writeOfficialToolResources(f.generated,f.outDir);
  await f.wxt.hooks.callHook('build:done',f.wxt,f.output);
  f.server.currentOutput=f.output;
  await publication;await f.flush();
  await f.assertPublished();
  assert.equal(JSON.parse(await readFile(join(f.outDir,OFFICIAL_CATALOG_PATH),'utf8')).apps[0].installationPolicy,'preinstalled');
  // After successful ownership capture, a transient missing catalog is also
  // recoverable; errors other than ENOENT must still block publication.
  await rm(join(f.outDir,OFFICIAL_CATALOG_PATH));
  f.change(OFFICIAL_CATALOG_PATH);await f.flush();await f.assertPublished();
});

for(const removeParent of [false,true])test('cleanup failure after catalog replacement recovers with '+(removeParent?'missing parent':'old package retained'),async t=>{
  const f=await fixture(t),before=await f.marker();
  const stale='official-tools/alpha-tool/alpha-tool.opendesk-tool.json';
  // Keep the actual old package outside output, reached via a symlink parent.
  // The writer writes the new catalog, then rejects this stale-path cleanup.
  const directory=join(f.outDir,'official-tools/alpha-tool');
  const retained=join(f.root,'retained-alpha');
  await rename(directory,retained);await symlink(retained,directory);
  f.catalog.tools=[{id:'beta-tool',project:'examples/sidebar-tools/beta-tool',kind:'sidebar-tool',installationPolicy:'optional'}];
  await f.saveCatalog();f.change(OFFICIAL_CATALOG_PATH);await f.flush();
  const disk=JSON.parse(await readFile(join(f.outDir,OFFICIAL_CATALOG_PATH),'utf8'));
  assert.deepEqual(disk.apps.map(row=>row.toolId),['beta-tool'],'new catalog was committed before cleanup failed');
  assert.equal((await stat(join(f.outDir,stale))).isFile(),true,'old package still exists');
  assert.equal(f.output.publicAssets.some(row=>row.fileName===stale),true,'inventory has not committed');
  assert(f.errors.some(error=>error.includes('symlink')));
  assert.deepEqual(await f.marker(),before);
  await f.server.reloadPage();assert.deepEqual(await f.marker(),before);
  await f.assertIntact();
  // Fix only the filesystem obstruction; retry the same watcher queue against
  // the already-new disk catalog, with the old real package still present.
  await rm(directory);
  if(removeParent)await rm(retained,{recursive:true});else await rename(retained,directory);
  f.errors.length=0;f.change(OFFICIAL_CATALOG_PATH);await f.flush();
  assert.notEqual((await f.assertPublished()).revision,before.revision);
  for(const root of [f.publicDir,f.outDir])await assert.rejects(readFile(join(root,stale)),{code:'ENOENT'});
});


for(const failedBuild of [false,true])test('initial readiness releases drain after '+(failedBuild?'build failure':'stop before build:done'),{timeout:2000},async t=>{
  const failure=new Error('initial build fixture failed');
  const f=await fixture(t,{starting:true,buildError:failedBuild?failure:undefined});
  const build=f.wxt.builder.build;
  f.change(OFFICIAL_CATALOG_PATH);
  const publication=f.server.reloadExtension();
  if(failedBuild)await assert.rejects(f.wxt.builder.build(),error=>error===failure);
  // The real dev launcher drains after bootstrap failure, before server.stop.
  await assert.rejects(drainDevelopment(f.server),/stopped before initial output was ready/);
  await publication;await closeDevelopment(f.wxt,f.server);
  assert.notEqual(f.wxt.builder.build,build,'builder guard was restored');
  assert.equal(f.server.watcher.listenerCount('all'),0);
  await assert.rejects(readFile(join(f.outDir,'development-update.json')),{code:'ENOENT'});
});
