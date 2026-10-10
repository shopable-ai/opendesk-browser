import {cp,readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {watch} from 'node:fs';
import {STATIC_RESOURCES} from './prepare-public.mjs';
import {createSdkResourceManifest,SDK_RESOURCE_MANIFEST,createBuiltinResourceManifest,BUILTIN_RESOURCE_MANIFEST,verifyManifest} from './verify-package.mjs';

const marker='development-update.json';
const sessions=new WeakMap();
const sessionKey=Symbol.for('opendesk.development.session');
const restartKey=Symbol.for('opendesk.development.restarts');
export function configureDevelopmentRestarts(server,{root=process.cwd(),isClosing=()=>false,
  onError=error=>console.error('[OpenDesk dev] Restart failed; fix the source and save to retry.',error)}={}) {
  const restart=server.restart.bind(server);
  let pending=Promise.resolve(),recoveryWatcher,recoveryFiles;
  const protections=new Map();
  const clearRecovery=()=>{recoveryWatcher?.off('all',recover);recoveryWatcher=undefined;recoveryFiles?.close();recoveryFiles=undefined;};
  const recover=(event,file)=>{
    if(isClosing()||!['add','change','unlink'].includes(event))return;
    const path=relative(root,resolve(file));
    if(!path.startsWith('src/')&&!path.startsWith('scripts/')&&
      !['wxt.config.mjs','manifest.json','package.json','package-lock.json'].includes(path))return;
    clearRecovery();void server.restart();
  };
  const failed=error=>{
    onError(error);
    if(!isClosing()){
      clearRecovery();
      if(server.watcher.closed){
        // Config parsing may fail after WXT closes its old Vite watcher.
        recoveryFiles=watch(root,{recursive:true},(_event,file)=>{if(file)recover('change',resolve(root,String(file)));});
        recoveryFiles.on('error',onError);
      }else{recoveryWatcher=server.watcher;recoveryWatcher.on('all',recover);}
    }
  };
  const protectWatcher=()=>{
    const watcher=server.watcher;if(protections.has(watcher))return;
    const originalOn=watcher.on,originalOff=watcher.off,wrapped=new WeakMap();
    const on=function(event,listener){
      if(event!=='all')return originalOn.call(this,event,listener);
      const safe=(...args)=>{
        const reject=error=>{originalOff.call(watcher,'all',safe);failed(error);};
        try{return Promise.resolve(listener.apply(watcher,args)).catch(reject);}
        catch(error){reject(error);}
      };
      wrapped.set(listener,safe);return originalOn.call(this,event,safe);
    };
    const off=function(event,listener){return originalOff.call(this,event,event==='all'?(wrapped.get(listener)||listener):listener);};
    watcher.on=on;watcher.off=off;
    protections.set(watcher,()=>{if(watcher.on===on)watcher.on=originalOn;if(watcher.off===off)watcher.off=originalOff;});
  };
  const unprotectWatcher=watcher=>{protections.get(watcher)?.();protections.delete(watcher);};
  server.restart=()=>{
    if(isClosing())return pending;
    pending=pending.then(async()=>{
      if(isClosing())return;
      clearRecovery();
      try{await restart();}
      catch(error){failed(error);}
    });
    return pending;
  };
  const control={drain:()=>pending,stop:clearRecovery,protectWatcher,unprotectWatcher};
  server[restartKey]=control;return control;
}
export async function publishDevelopment(wxt,output) {
  // WXT can prerender during restart before custom hooks are registered.
  // Reapply the source policy before publishing a consumable revision.
  const source=JSON.parse(await readFile(resolve(wxt.config.root,'manifest.json'),'utf8'));
  const manifestPath=resolve(wxt.config.outDir,'manifest.json');
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  manifest.host_permissions=source.host_permissions;
  manifest.content_security_policy=source.content_security_policy;
  verifyManifest(manifest);
  await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  const paths=[...new Set(['manifest.json',...output.publicAssets.map(asset=>asset.fileName),
    ...output.steps.flatMap(step=>step.chunks.map(chunk=>chunk.fileName))])].sort();
  await writeFile(resolve(wxt.config.outDir,SDK_RESOURCE_MANIFEST),JSON.stringify(await createSdkResourceManifest(wxt.config.outDir),null,2)+'\n');
  // WXT serve has a different output lifecycle from scripts/build.mjs. Page
  // USER_SCRIPT loads this manifest before any user code; omitting it makes
  // npm run dev fail even while npm run build:dev produces a valid package.
  await writeFile(resolve(wxt.config.outDir,BUILTIN_RESOURCE_MANIFEST),JSON.stringify(await createBuiltinResourceManifest(wxt.config.outDir),null,2)+'\n');
  paths.push(SDK_RESOURCE_MANIFEST,BUILTIN_RESOURCE_MANIFEST);
  const files=Object.fromEntries(await Promise.all(paths.filter(path=>!path.endsWith('.map')).map(async path=>[
    path,createHash('sha256').update(await readFile(resolve(wxt.config.outDir,path))).digest('hex')])));
  const revision=createHash('sha256').update(JSON.stringify(files)).digest('hex');
  const record={protocol:'opendesk.development.v1',revision,files};
  const target=resolve(wxt.config.outDir,marker);
  await writeFile(target+'.tmp',JSON.stringify(record));await rename(target+'.tmp',target);
  wxt.logger.info(`[OpenDesk dev] Output ready ${revision.slice(0,12)}; browser applies updates only after its safety checks.`);
}
export function configureDevelopment(wxt,server) {
  if(sessions.has(server))return;
  // Native WXT watches Rollup moduleIds and serializes incremental entry builds.
  // Replace only reload requests: the default client cannot inspect RunHost.
  let publishing=Promise.resolve();
  const publish=()=>{const output=server.currentOutput;publishing=publishing.then(()=>publishDevelopment(wxt,output)).catch(error=>wxt.logger.error(error));return publishing;};
  server.reloadExtension=publish;server.reloadPage=publish;server.reloadContentScript=publish;
  const builder=wxt.builder,build=builder.build,importEntries=builder.importEntrypoints;
  const guardedBuild=async(...args)=>{await publishing;return build.apply(builder,args);};
  builder.build=guardedBuild;
  const guardedImport=async(...args)=>{
    try{return await importEntries.apply(builder,args);}
    catch(error){
      // Use our recoverable restart path instead of WXT's private,
      // unbounded syntax-fix watcher, which cannot be cancelled on stop.
      if(error instanceof SyntaxError&&error.code==='BABEL_PARSER_SYNTAX_ERROR')throw new Error(error.message,{cause:error});
      throw error;
    }
  };
  builder.importEntrypoints=guardedImport;
  const sources=new Map(Object.entries(STATIC_RESOURCES).map(([src,dest])=>[resolve(wxt.config.root,src),dest]));
  let copying=Promise.resolve(),accepting=true;
  const sync=(event,file)=>{
    if(!accepting)return;
    const dest=sources.get(resolve(file));if(!dest)return;
    if(event==='unlink'){wxt.logger.error(`[OpenDesk dev] Required resource removed: ${relative(wxt.config.root,file)}; restore it before updating.`);return;}
    copying=copying.then(async()=>{
      const target=resolve(wxt.config.publicDir,dest);await mkdir(dirname(target),{recursive:true});
      await cp(file,target);
      wxt.logger.info(`[OpenDesk dev] Static source changed: ${relative(wxt.config.root,file)}`);
      // Vite excludes .wxt/** from its filesystem watcher. Feed this mapped
      // public-file change to WXT's existing serialized incremental queue.
      server.watcher.emit('all','change',target);
    }).catch(error=>wxt.logger.error(error));
  };
  const watcher=server.watcher;watcher.add([...sources.keys()]);watcher.on('all',sync);
  // WXT's asynchronous file reloader is installed after server:started.
  // Keep its rejected metadata/build queue from escaping EventEmitter.
  server[restartKey]?.protectWatcher();
  const session={publication:()=>publishing,stopCopies:()=>{accepting=false;watcher.off('all',sync);},drain:async()=>{await copying;await publishing;},restore:()=>{if(builder.build===guardedBuild)builder.build=build;if(builder.importEntrypoints===guardedImport)builder.importEntrypoints=importEntries;}};
  sessions.set(server,session);server[sessionKey]=session;
}
export async function closeDevelopment(_wxt,server) {
  const session=server[sessionKey];session?.stopCopies();
  await session?.drain();
  session?.restore();delete server[sessionKey];
  server[restartKey]?.unprotectWatcher(server.watcher);
  sessions.delete(server);
}
export function waitDevelopmentPublication(wxt){return wxt.server?.[sessionKey]?.publication();}
export async function drainDevelopment(server) {
  // WXT's all-event listener returns its serialized queue promise. Stop new
  // filesystem events, then await that queue using an irrelevant sentinel.
  const watcher=server.watcher,session=server[sessionKey];
  session?.stopCopies();await session?.drain();
  const listeners=watcher.listeners('all');await watcher.close();
  for(const listener of listeners)await listener('change',resolve('.wxt/opendesk-development-drain'));
  await session?.drain();
}
