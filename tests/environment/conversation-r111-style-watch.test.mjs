import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {cp,mkdir,mkdtemp,readFile,realpath,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {dirname,join} from 'node:path';
import {watch} from 'chokidar';
import {configureDevelopment,closeDevelopment} from '../../scripts/wxt-development.mjs';
import {trustedBookmarkStyle,trustedToolShellStyle} from '../../scripts/bundle-provenance.mjs';
import {SDK_RESOURCE_PATHS} from '../../src/framework/sdk/resource-contract.js';
import {BUILTIN_RESOURCE_PATHS} from '../../src/libs/runtime-contract.js';
import {BUILTIN_CATALOG} from '../../src/libs/catalog.js';
import {BROWSER_EDITION_RECORD,DEVELOPER_BROWSER_NAME,editionRecordText} from '../../scripts/browser-editions-r245.mjs';
import {resolveMarketChannel,marketExternalConnectable} from '../../scripts/market-channel.mjs';
import {OFFICIAL_CATALOG_PATH,OFFICIAL_SOURCE_SCHEMA,OFFICIAL_RELEASE_SCHEMA,
  OFFICIAL_SOURCE_REPOSITORY,officialPackagePath} from '../../src/sidebar-tools/official-catalog.js';

const shellSource='src/ui/tool-shell.css';
const bookmarkSource='examples/sidebar-tools/bookmark-manager/src/react/style.css';
const shellOutput='ui/tool-shell.css';
const pinError=/Trusted Bookmark React source changed; review and re-pin/;

function changed(watcher,file){
  return new Promise((resolve,reject)=>{
    const finish=error=>{
      clearTimeout(timeout);watcher.off('all',listener);
      if(error)reject(error);else resolve();
    };
    const listener=(event,path)=>{if(event==='change'&&path===file)finish();};
    const timeout=setTimeout(()=>finish(new Error('No filesystem change event: '+file)),5000);
    watcher.on('all',listener);
  });
}

async function fixture(t){
  const root=await realpath(await mkdtemp(join(tmpdir(),'opendesk-r111-style-watch-')));
  const publicDir=join(root,'public'),outDir=join(root,'dist');
  let cleanup=async()=>{};
  t.after(async()=>{await cleanup();await rm(root,{recursive:true,force:true});});
  const write=async(path,bytes)=>{
    const file=join(root,path);await mkdir(dirname(file),{recursive:true});await writeFile(file,bytes);
  };
  const bookmarkBytes=await readFile(new URL('../../'+bookmarkSource,import.meta.url));
  await write(bookmarkSource,bookmarkBytes);
  await write(shellSource,'.shell-fixture{color:navy}\n');
  await write('src/ui/sidepanel.html','<main>static fixture</main>');
  await write('public/'+shellOutput,trustedToolShellStyle(root));
  await write('dist/'+shellOutput,trustedToolShellStyle(root));

  // A small inert official project exercises officialToolInputs without a build.
  const id='style-fixture',project='examples/sidebar-tools/'+id;
  const metadata={id,version:'1.0.0',title:'Style fixture',description:'Watcher fixture',capabilities:[]};
  const files={html:'index.html',css:'style.css',js:'main.js'};
  await write(project+'/tool.config.json',JSON.stringify({...metadata,files}));
  await write(project+'/index.html','<main></main>');
  await write(project+'/style.css','');
  await write(project+'/main.js','void 0;');
  await write(OFFICIAL_CATALOG_PATH,JSON.stringify({schema:OFFICIAL_SOURCE_SCHEMA,
    sourceRepository:OFFICIAL_SOURCE_REPOSITORY,
    tools:[{id,project,kind:'sidebar-tool',installationPolicy:'optional'}]}));
  const bytes=Buffer.from(JSON.stringify({format:'opendesk.sidebar-tool.v1',...metadata,
    html:'<main></main>',css:'',js:'void 0;'}));
  await write('dist/'+officialPackagePath(id),bytes);
  await write('dist/'+OFFICIAL_CATALOG_PATH,JSON.stringify({schema:OFFICIAL_RELEASE_SCHEMA,
    sourceRepository:OFFICIAL_SOURCE_REPOSITORY,apps:[{id:'opendesk/'+id,toolId:id,
      kind:'sidebar-tool',installationPolicy:'optional',version:metadata.version,
      packageTitle:metadata.title,description:metadata.description,capabilities:[],
      packagePath:officialPackagePath(id),bytes:bytes.length,
      sha256:createHash('sha256').update(bytes).digest('hex')}]}));

  const manifest=JSON.parse(await readFile(new URL('../../manifest.json',import.meta.url)));
  await write('manifest.json',JSON.stringify(manifest));
  await write('dist/manifest.json',JSON.stringify({...manifest,name:DEVELOPER_BROWSER_NAME,
    action:{...manifest.action,default_title:'打开 '+DEVELOPER_BROWSER_NAME},
    externally_connectable:marketExternalConnectable(resolveMarketChannel({mode:'development'}))}));
  await write('dist/'+BROWSER_EDITION_RECORD,editionRecordText('developer'));
  const resources=[...new Set([...SDK_RESOURCE_PATHS,...BUILTIN_RESOURCE_PATHS])];
  for(const path of resources){
    const pinned=path===BUILTIN_CATALOG.bootstrap||path.startsWith('libs/vendor/');
    await write('dist/'+path,pinned?await readFile(new URL('../../src/'+path,import.meta.url)):
      'fixture '+path+' '.repeat(60));
  }

  // Use real file saves and the same all/change API consumed by WXT.
  const watcher=watch([],{ignoreInitial:true,atomic:false}),events=[],errors=[],infos=[];
  let mirrored=Promise.resolve();
  watcher.on('all',(event,path)=>{
    events.push({event,path});
    if(event==='change'&&path===join(publicDir,shellOutput))
      mirrored=mirrored.then(()=>cp(path,join(outDir,shellOutput)));
  });
  const wxt={config:{root,publicDir,outDir},builder:{async build(){},async importEntrypoints(){}},
    logger:{info:value=>infos.push(String(value)),error:value=>errors.push(String(value))}};
  const server={watcher,currentOutput:{publicAssets:[...resources,shellOutput].map(fileName=>({fileName})),steps:[]}};
  cleanup=async()=>{await watcher.close();await closeDevelopment(wxt,server);await mirrored;};
  const ready=once(watcher,'ready');configureDevelopment(wxt,server);await ready;
  const flush=async()=>{await server.reloadExtension();await mirrored;await server.reloadExtension();};
  const save=async(path,bytes)=>{
    // Native watchers coalesce writes within their short change throttle.
    await delay(100);
    const event=changed(watcher,join(root,path));await write(path,bytes);await event;await flush();
  };
  const marker=()=>readFile(join(outDir,'development-update.json'),'utf8');
  const output=()=>readFile(join(publicDir,shellOutput),'utf8');
  const styleEvents=()=>events.filter(row=>row.event==='change'&&row.path===join(publicDir,shellOutput)).length;
  const publications=()=>infos.filter(info=>info.includes('Output ready')).length;
  await flush();
  assert.deepEqual(errors,[],'fixture must publish successfully before testing failures');
  return {root,save,marker,output,styleEvents,publications,bookmarkBytes,errors};
}

function assertComposed(actual,shell,bookmark){
  assert.ok(actual===shell+'\n'+bookmark,'output must contain the current shell followed by the pinned bookmark CSS');
  assert.equal(actual.split('.bm-app{').length-1,1,'bookmark rules appear exactly once');
}

test('R111 consecutive shell saves retain exactly one pinned bookmark stylesheet through real watcher events',async t=>{
  const f=await fixture(t),bookmark=trustedBookmarkStyle(f.root);
  let previous=await f.marker();
  for(const color of ['red','green']){
    const shell='.shell-fixture{color:'+color+'}\n',events=f.styleEvents();
    await f.save(shellSource,shell);
    assertComposed(await f.output(),shell,bookmark);
    assert.equal(await readFile(join(f.root,'dist',shellOutput),'utf8'),await f.output());
    assert.ok(f.styleEvents()>events,'WXT receives the generated CSS change event');
    const current=await f.marker();assert.notEqual(current,previous);previous=current;
    const published=JSON.parse(current);
    assert.equal(published.files[shellOutput],createHash('sha256').update(await f.output()).digest('hex'));
  }
  assert.deepEqual(f.errors,[]);
});

test('R111 bookmark source drift fails closed before the official branch skips undeclared inputs and recovers after restore',async t=>{
  const f=await fixture(t),before=await f.marker(),style=await f.output(),events=f.styleEvents();
  const publications=f.publications();
  await f.save(bookmarkSource,Buffer.concat([f.bookmarkBytes,Buffer.from('\n.bm-app{display:none}\n')]));
  assert.ok(f.errors.some(error=>pinError.test(error)),'the direct bookmark event must validate its pin');
  assert.equal(await f.marker(),before,'pin drift cannot publish a revision');
  assert.equal(await f.output(),style,'pin drift cannot overwrite the last valid CSS');
  assert.equal(f.styleEvents(),events,'pin drift cannot notify WXT of publishable CSS');
  assert.equal(f.publications(),publications,'the publication guard must reject the failed composition');

  // Unrelated successful copies must not clear the composition failure.
  await f.save('src/ui/sidepanel.html','<main>unrelated static save</main>');
  assert.equal(await f.marker(),before);
  assert.equal(f.publications(),publications);
  assert.match(f.errors.at(-1),pinError);

  const shell='.shell-fixture{color:purple}\n';
  await f.save(shellSource,shell);
  assert.equal(await f.marker(),before,'saving the shell must also check the bookmark pin');
  assert.equal(await f.output(),style);
  assert.equal(f.styleEvents(),events);
  assert.equal(f.publications(),publications);
  assert.match(f.errors.at(-1),pinError);

  const errorCount=f.errors.length;
  await f.save(bookmarkSource,f.bookmarkBytes);
  assertComposed(await f.output(),shell,trustedBookmarkStyle(f.root));
  assert.ok(f.styleEvents()>events,'restoring the pinned input regenerates the fixed CSS');
  assert.notEqual(await f.marker(),before,'restoring the pin clears the shared CSS failure');
  assert.ok(f.publications()>publications);
  assert.equal(f.errors.length,errorCount,'a valid restore resumes publication without restarting');
});
