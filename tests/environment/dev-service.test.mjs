import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import config from '../../wxt.config.mjs';
import * as development from '../../scripts/wxt-development.mjs';
import {SDK_RESOURCE_PATHS,SDK_RESOURCE_MANIFEST} from '../../src/framework/sdk/resource-contract.js';
import {BUILTIN_CATALOG} from '../../src/runtime/builtin-libraries/catalog.js';
import {verifyManifest,verifyBuiltinResourceManifest} from '../../scripts/verify-package.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const {configureDevelopmentRestarts,publishDevelopment}=development;

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
    const paths=[...SDK_RESOURCE_PATHS,BUILTIN_CATALOG.pageCore,BUILTIN_CATALOG.controllerCore,...Object.values(BUILTIN_CATALOG.libraries).map(row=>row.licensePath)];
    for(const path of paths){await mkdir(dirname(join(outDir,path)),{recursive:true});await writeFile(join(outDir,path),'fixture '+path+' '.repeat(60));}
    const manifest=structuredClone(canonical);manifest.host_permissions.push('http://localhost/*');
    manifest.content_security_policy.extension_pages+=' http://localhost:43119';
    await writeFile(join(outDir,'manifest.json'),JSON.stringify(manifest));
    const wxt={config:{root,outDir},logger:{info(){}}};
    const output={publicAssets:paths.filter(path=>!path.endsWith('.js')).map(fileName=>({fileName})),steps:[{chunks:paths.filter(path=>path.endsWith('.js')).map(fileName=>({fileName}))}]};
    await publishDevelopment(wxt,output);
    verifyManifest(JSON.parse(await readFile(join(outDir,'manifest.json'))));
    await verifyBuiltinResourceManifest(outDir);
    const markerPath=join(outDir,'development-update.json'),before=await readFile(markerPath,'utf8');
    const row=JSON.parse(before);
    assert.match(row.files[SDK_RESOURCE_MANIFEST],/^[a-f0-9]{64}$/);
    assert.match(row.files[BUILTIN_CATALOG.resourceManifest],/^[a-f0-9]{64}$/);
    await rm(join(outDir,BUILTIN_CATALOG.pageCore));
    await assert.rejects(publishDevelopment(wxt,output),error=>error.code==='ENOENT');
    assert.equal(await readFile(markerPath,'utf8'),before);
  }finally{await rm(root,{recursive:true,force:true});}
});
