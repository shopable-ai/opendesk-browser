import {buildOfficialTools,writeOfficialToolResources,officialToolInputs} from '../../scripts/build-official-tools.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,mkdir,readFile,writeFile,rm,access,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import config from '../../wxt.config.mjs';
import * as development from '../../scripts/wxt-development.mjs';
import {SDK_RESOURCE_PATHS,SDK_RESOURCE_MANIFEST} from '../../src/framework/sdk/resource-contract.js';
import {BUILTIN_CATALOG} from '../../src/libs/catalog.js';
import {BUILTIN_RESOURCE_PATHS} from '../../src/libs/runtime-contract.js';
import {verifyManifest,verifyBuiltinResourceManifest} from '../../scripts/verify-package.mjs';
import {resolveMarketChannel,marketExternalConnectable} from '../../scripts/market-channel.mjs';
import {BROWSER_EDITION_RECORD,DEVELOPER_BROWSER_NAME,editionRecordText} from '../../scripts/browser-editions-r245.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const {configureDevelopmentRestarts,publishDevelopment}=development;
const developmentExternal=marketExternalConnectable(resolveMarketChannel({mode:'development'}));

async function officialDevelopmentFixture(t){
  const root=await mkdtemp(join(tmpdir(),'opendesk-official-dev-')),outDir=join(root,'dist'),publicDir=join(root,'public');
  const write=async(path,bytes)=>{await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),bytes);};
  const paths=[...new Set([...SDK_RESOURCE_PATHS,...BUILTIN_RESOURCE_PATHS])];
  for(const path of await officialToolInputs())await write(path,await readFile(new URL('../../'+path,import.meta.url)));
  const canonical=await readFile(new URL('../../manifest.json',import.meta.url));
  await write('manifest.json',canonical);
  await write('dist/manifest.json',JSON.stringify({...JSON.parse(canonical),name:DEVELOPER_BROWSER_NAME,externally_connectable:developmentExternal}));
  await write('dist/'+BROWSER_EDITION_RECORD,editionRecordText('developer'));
  for(const path of paths){
    const pinned=path===BUILTIN_CATALOG.bootstrap||path.startsWith('libs/vendor/');
    await write('dist/'+path,pinned?await readFile(new URL('../../src/'+path,import.meta.url)):'fixture '+path+' '.repeat(60));
  }
  const generated=await buildOfficialTools(publicDir,{root});await writeOfficialToolResources(generated,outDir);
  const watcher=new EventEmitter();watcher.add=()=>{};const errors=[],infos=[],restarts=[];
  const builder={async build(){},async importEntrypoints(){}},originalBuild=builder.build;
  const wxt={config:{root,outDir,publicDir},builder,logger:{info:x=>infos.push(String(x)),error:x=>errors.push(String(x))}};
  const server={watcher,currentOutput:{publicAssets:paths.map(fileName=>({fileName})),steps:[]},async restart(){
    // Observe the same input WXT rescans on restart; the production helper must
    // have already regenerated it before a restart is requested.
    restarts.push(JSON.parse(await readFile(join(publicDir,'official-tools/catalog.json'))));
  }};
  development.configureDevelopment(wxt,server);await server.reloadExtension();
  t.after(async()=>{await development.closeDevelopment(wxt,server);await rm(root,{recursive:true,force:true});});
  const change=(path,event='change')=>watcher.emit('all',event,join(root,path));
  const flush=async()=>{await server.reloadExtension();await server.reloadExtension();};
  const marker=()=>readFile(join(outDir,'development-update.json'),'utf8');
  return {root,outDir,publicDir,generated,write,change,flush,marker,server,wxt,errors,infos,restarts,originalBuild};
}

test('R4.5 dev coalesces official edits without losing them to README or starter events',async t=>{
  const f=await officialDevelopmentFixture(t),before=await f.marker();
  const path='examples/sidebar-tools/reading-toc/src/main.js',source=await readFile(join(f.root,path),'utf8');
  await f.write(path,source+'\nvoid "new official source";');f.change(path);
  f.change('examples/sidebar-tools/reading-toc/README.md');
  f.change('examples/sidebar-tools/react-starter/src/App.jsx');await f.flush();
  assert.notEqual(await f.marker(),before);
  const manifest=JSON.parse(await readFile(join(f.outDir,'official-tools/catalog.json')));
  assert.notEqual(manifest.apps[0].sha256,f.generated.catalog.apps[0].sha256);
  assert.deepEqual(f.errors,[]);
});

test('R4.5 failed official edits block unrelated publication and recover after source restoration',async t=>{
  const f=await officialDevelopmentFixture(t),before=await f.marker();
  const path='examples/sidebar-tools/reading-toc/src/main.js',source=await readFile(join(f.root,path),'utf8');
  await f.write(path,'const = broken;');f.change(path);await f.flush();
  assert.equal(await f.marker(),before);assert(f.errors.some(x=>x.includes('syntax error')));
  await f.write('src/ui/tool.html','<main>unrelated static edit</main>');f.change('src/ui/tool.html');await f.flush();
  assert.equal(await f.marker(),before,'unrelated success cannot clear the failed official source');
  await rm(join(f.root,path));f.change(path,'unlink');await f.flush();assert.equal(await f.marker(),before);
  await f.write(path,source+'\nvoid "recovered";');f.change(path,'add');await f.flush();
  assert.notEqual(await f.marker(),before);
  const after=await f.marker();f.change('examples/sidebar-tools/reading-toc/README.md');await f.flush();
  assert.equal(await f.marker(),after);
});

test('R4.5 catalog structure stays dirty through failure until successful generation and restart',async t=>{
  const f=await officialDevelopmentFixture(t),path='examples/sidebar-tools/reading-toc/src/main.js';
  const source=await readFile(join(f.root,path),'utf8'),catalog=JSON.parse(await readFile(join(f.root,'official-tools/catalog.json')));
  const removed=catalog.tools.pop();await f.write('official-tools/catalog.json',JSON.stringify(catalog));
  await f.write(path,'const = broken;');f.change('official-tools/catalog.json');await f.flush();
  assert.equal(f.restarts.length,0);
  await f.write(path,source);f.change(path);await f.flush();await tick();
  assert.equal(f.restarts.length,1);assert.equal(f.restarts[0].apps.length,catalog.tools.length);
  await assert.rejects(access(join(f.publicDir,'official-tools',removed.id,removed.id+'.opendesk-tool.json')));
});

test('R4.5 failed dev closes cleanly and a new session can regenerate output without following file symlinks',async t=>{
  const f=await officialDevelopmentFixture(t),path='examples/sidebar-tools/reading-toc/src/main.js';
  const source=await readFile(join(f.root,path),'utf8');
  await f.write(path,'const = broken;');f.change(path);await f.flush();
  await development.closeDevelopment(f.wxt,f.server);
  assert.equal(f.server.watcher.listenerCount('all'),0);assert.equal(f.wxt.builder.build,f.originalBuild);
  await f.write(path,source+'\nvoid "after restart";');
  const target=join(f.outDir,f.generated.catalog.apps[0].packagePath),outside=join(f.root,'external.txt');
  await writeFile(outside,'must stay intact');await rm(target);await symlink(outside,target);
  development.configureDevelopment(f.wxt,f.server);f.change(path);await f.flush();
  assert.equal(await readFile(outside,'utf8'),'must stay intact');
  assert(JSON.parse(await readFile(target,'utf8')).js.includes('after restart'));
});

test('failed config parsing recovers through a source watcher after Vite closes its watcher',async()=>{
  const root=await mkdtemp(join(tmpdir(),'opendesk-config-recovery-'));let attempts=0,ready;
  const recovered=new Promise(resolve=>{ready=resolve;});
  const watcher=new EventEmitter();watcher.closed=true;
  const server={watcher,async restart(){if(++attempts===1)throw Error('Invalid WXT config');ready();}};
  const control=configureDevelopmentRestarts(server,{root,onError(){}});
  let timeout;
  try{
    await server.restart();await writeFile(join(root,'wxt.config.mjs'),'fixed config');
    await Promise.race([recovered,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Config recovery timed out')),3000);})]);
    await control.drain();assert.equal(attempts,2);
  }finally{clearTimeout(timeout);control.stop();await rm(root,{recursive:true,force:true});}
});

test('Babel entrypoint errors use cancellable development recovery instead of WXT syntax waiting',async()=>{
  const watcher=new EventEmitter();watcher.add=()=>{};
  const syntax=new SyntaxError('Invalid entrypoint');syntax.code='BABEL_PARSER_SYNTAX_ERROR';
  const importEntrypoints=async()=>{throw syntax;};
  const wxt={config:{root:'/project'},builder:{async build(){},importEntrypoints}};
  const server={watcher};
  development.configureDevelopment(wxt,server);
  try{await assert.rejects(wxt.builder.importEntrypoints(),error=>error.constructor===Error&&error.cause===syntax);}
  finally{await development.closeDevelopment(wxt,server);}
  assert.equal(wxt.builder.importEntrypoints,importEntrypoints);
});

test('failed configuration rebuild stays handled and retries only after a relevant source change',async()=>{
  const watcher=new EventEmitter(),errors=[];let attempts=0;
  const server={watcher,async restart(){if(++attempts===1)throw Error('Merge conflict marker encountered');}};
  const control=configureDevelopmentRestarts(server,{root:'/project',onError:error=>errors.push(error.message)});
  try{
    await server.restart();
    assert.deepEqual(errors,['Merge conflict marker encountered']);
    watcher.emit('all','change','/project/docs/contracts/source-snapshots/old/index.html');
    watcher.emit('all','change','/project/dist/development/sw.js');
    await tick();assert.equal(attempts,1);
    watcher.emit('all','change','/project/src/native-agent/settings.js');
    watcher.emit('all','change','/project/src/native-agent/settings.js');
    await control.drain();assert.equal(attempts,2);
    assert.equal(watcher.listenerCount('all'),0);
  }finally{control.stop();}
});

test('configuration restarts are serialized and shutdown skips queued restarts',async()=>{
  const watcher=new EventEmitter();let closing=false,attempts=0,finish;
  const server={watcher,async restart(){attempts++;await new Promise(resolve=>{finish=resolve;});}};
  const control=configureDevelopmentRestarts(server,{root:'/project',isClosing:()=>closing});
  const first=server.restart(),second=server.restart();
  await tick();assert.equal(attempts,1);
  closing=true;control.stop();finish();
  await Promise.all([first,second,control.drain()]);assert.equal(attempts,1);
  await server.restart();assert.equal(attempts,1);
});

test('entrypoint watcher rejection is handled and a corrected source starts a fresh build queue',async()=>{
  const watcher=new EventEmitter(),errors=[];let attempts=0;
  const server={watcher,async restart(){attempts++;}};
  const originalOn=watcher.on,originalOff=watcher.off;
  const control=configureDevelopmentRestarts(server,{root:'/project',onError:error=>errors.push(error.message)});
  try{
    control.protectWatcher();
    watcher.on('all',async()=>{throw Error('Entrypoint metadata syntax error');});
    watcher.emit('all','change','/project/src/entrypoints/settings.js');
    await tick();assert.deepEqual(errors,['Entrypoint metadata syntax error']);
    assert.equal(watcher.listenerCount('all'),1);
    watcher.emit('all','change','/project/src/entrypoints/settings.js');
    await control.drain();assert.equal(attempts,1);
  }finally{control.stop();control.unprotectWatcher(watcher);}
  assert.equal(watcher.on,originalOn);assert.equal(watcher.off,originalOff);
});

test('Vite base configuration disables HTML discovery even before development hooks register',()=>{
  const vite=config.vite();
  assert.deepEqual(vite.optimizeDeps,{noDiscovery:true,include:[],entries:[]});
});

test('development manifest policy survives WXT mutations of its configuration object',async()=>{
  const canonical=JSON.parse(await readFile(new URL('../../manifest.json',import.meta.url)));
  const original=structuredClone(config.manifest);
  try{
    config.manifest.host_permissions.push('http://localhost/*');
    config.manifest.content_security_policy.extension_pages+=' http://localhost:43119';
    const output=structuredClone(canonical);
    output.host_permissions.push('http://localhost/*');
    output.content_security_policy.extension_pages+=' http://localhost:43119';
    config.hooks['build:manifestGenerated']({config:{command:'serve'}},output);
    assert.deepEqual(output.host_permissions,canonical.host_permissions);
    assert.deepEqual(output.content_security_policy,canonical.content_security_policy);
  }finally{config.manifest.host_permissions=original.host_permissions;config.manifest.content_security_policy=original.content_security_policy;}
});

test('live publication restores manifest policy, publishes builtin hashes, and retains the marker after an incomplete build',async()=>{
  const root=await mkdtemp(join(tmpdir(),'opendesk-dev-publish-')),outDir=join(root,'dist');
  try{
    const canonical=JSON.parse(await readFile(new URL('../../manifest.json',import.meta.url)));
    await writeFile(join(root,'manifest.json'),JSON.stringify(canonical));
    const paths=[...new Set([...SDK_RESOURCE_PATHS,...BUILTIN_RESOURCE_PATHS])];
    for(const path of paths){
      await mkdir(dirname(join(outDir,path)),{recursive:true});
      const pinned=path===BUILTIN_CATALOG.bootstrap||path.startsWith('libs/vendor/');
      await writeFile(join(outDir,path),pinned?await readFile(new URL('../../src/'+path,import.meta.url)):'fixture '+path+' '.repeat(60));
    }
    const manifest=structuredClone(canonical);manifest.host_permissions.push('http://localhost/*');
    manifest.name=DEVELOPER_BROWSER_NAME;
    manifest.externally_connectable=structuredClone(developmentExternal);
    manifest.content_security_policy.extension_pages+=' http://localhost:43119';
    await writeFile(join(outDir,'manifest.json'),JSON.stringify(manifest));
    await mkdir(dirname(join(outDir,BROWSER_EDITION_RECORD)),{recursive:true});
    await writeFile(join(outDir,BROWSER_EDITION_RECORD),editionRecordText('developer'));
    await buildOfficialTools(outDir);
    const wxt={config:{root,outDir},logger:{info(){}}};
    const output={publicAssets:paths.filter(path=>!path.endsWith('.js')).map(fileName=>({fileName})),steps:[{chunks:paths.filter(path=>path.endsWith('.js')).map(fileName=>({fileName}))}]};
    await publishDevelopment(wxt,output);
    verifyManifest(JSON.parse(await readFile(join(outDir,'manifest.json'))),{mode:'development',edition:'developer'});
    await verifyBuiltinResourceManifest(outDir);
    const markerPath=join(outDir,'development-update.json'),before=await readFile(markerPath,'utf8');
    const row=JSON.parse(before);
    assert.match(row.files[SDK_RESOURCE_MANIFEST],/^[a-f0-9]{64}$/);
    assert.match(row.files[BUILTIN_CATALOG.resourceManifest],/^[a-f0-9]{64}$/);
    const published=await readFile(join(outDir,'manifest.json'),'utf8');
    await writeFile(join(outDir,'manifest.json'),JSON.stringify({...JSON.parse(published),
      externally_connectable:{matches:['https://unapproved.example/*']}}));
    await assert.rejects(publishDevelopment(wxt,output),/Unapproved market external origin/);
    assert.equal(await readFile(markerPath,'utf8'),before,'unknown origins cannot publish a new ready marker');
    await writeFile(join(outDir,'manifest.json'),published);
    await rm(join(outDir,BUILTIN_CATALOG.pageCore));
    await assert.rejects(publishDevelopment(wxt,output),error=>error.code==='ENOENT');
    assert.equal(await readFile(markerPath,'utf8'),before);
  }finally{await rm(root,{recursive:true,force:true});}
});


test('required Workspace source failures survive unrelated successful static copies',async()=>{
  const root=await mkdtemp(join(tmpdir(),'opendesk-dev-source-errors-')),outDir=join(root,'dist'),publicDir=join(root,'public');
  const watcher=new EventEmitter();watcher.add=()=>{};const infos=[],errors=[];
  const wxt={config:{root,outDir,publicDir},builder:{async build(){},async importEntrypoints(){}},logger:{info:value=>infos.push(value),error:value=>errors.push(String(value))}};
  const paths=[...new Set([...SDK_RESOURCE_PATHS,...BUILTIN_RESOURCE_PATHS])];
  const server={watcher,currentOutput:{publicAssets:paths.map(fileName=>({fileName})),steps:[]}};
  try{
    const canonical=await readFile(new URL('../../manifest.json',import.meta.url),'utf8');
    await writeFile(join(root,'manifest.json'),canonical);await mkdir(outDir);
    await writeFile(join(outDir,'manifest.json'),JSON.stringify({...JSON.parse(canonical),name:DEVELOPER_BROWSER_NAME,externally_connectable:developmentExternal}));
    await mkdir(dirname(join(outDir,BROWSER_EDITION_RECORD)),{recursive:true});
    await writeFile(join(outDir,BROWSER_EDITION_RECORD),editionRecordText('developer'));
    for(const path of paths){
      await mkdir(dirname(join(outDir,path)),{recursive:true});
      const pinned=path===BUILTIN_CATALOG.bootstrap||path.startsWith('libs/vendor/');
      await writeFile(join(outDir,path),pinned?await readFile(new URL('../../src/'+path,import.meta.url)):'fixture '+path+' '.repeat(60));
    }
    const unrelated=join(root,'src/ui/tool.html');await mkdir(dirname(unrelated),{recursive:true});await writeFile(unrelated,'valid static HTML');
    await buildOfficialTools(outDir);
    development.configureDevelopment(wxt,server);
    await server.reloadExtension();
    const marker=join(outDir,'development-update.json'),before=await readFile(marker,'utf8');
    watcher.emit('all','unlink',join(root,'src/native-agent/workspace.tailwind.css'));
    await server.reloadExtension();
    watcher.emit('all','change',unrelated);await server.reloadExtension();
    assert.equal(await readFile(marker,'utf8'),before);
    assert.equal(infos.filter(value=>value.includes('Output ready')).length,1,'Unrelated copy must not publish stale Workspace CSS');
    assert.match(errors.at(-1),/workspace\.tailwind\.css/);
    await development.closeDevelopment(wxt,server);
    assert.equal(watcher.listenerCount('all'),0,'failed build still releases its watcher');
  }finally{await rm(root,{recursive:true,force:true});}
});
