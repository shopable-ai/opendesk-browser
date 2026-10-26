import {cp,readFile,writeFile,rename,mkdir,realpath,rm,lstat} from 'node:fs/promises';
import {trustedToolShellStyle} from './bundle-provenance.mjs';
import {resolve,dirname,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {watch} from 'node:fs';
import {STATIC_RESOURCES} from './prepare-public.mjs';
import {BROWSER_EDITION_RECORD,readEditionRecord} from './browser-editions-r245.mjs';
import {buildOfficialTools,officialToolInputs,writeOfficialToolResources} from './build-official-tools.mjs';
import {buildAdblockReact} from './build-adblock-react.mjs';
import {buildStayFocusReact} from './build-stay-focus-react.mjs';
import {buildCookieEditorReactIfOfficial} from './build-cookie-editor-react.mjs';
import {OFFICIAL_CATALOG_PATH,validateOfficialReleaseCatalog} from '../src/sidebar-tools/official-catalog.js';
import {WORKSPACE_STYLE_INPUTS,WORKSPACE_STYLE_DEST,compileWorkspaceStyle} from './build-workspace-style.mjs';
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
    if(!path.startsWith('src/')&&!path.startsWith('scripts/')&&!path.startsWith('official-tools/')&&
      !path.startsWith('examples/sidebar-tools/')&&
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
  const edition=readEditionRecord(await readFile(resolve(wxt.config.outDir,BROWSER_EDITION_RECORD),'utf8'));
  verifyManifest(manifest,{mode:'development',edition});
  await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  const official=validateOfficialReleaseCatalog(JSON.parse(await readFile(resolve(wxt.config.outDir,OFFICIAL_CATALOG_PATH),'utf8')));
  for(const row of official.apps){
    const bytes=await readFile(resolve(wxt.config.outDir,row.packagePath));
    if(bytes.length!==row.bytes||createHash('sha256').update(bytes).digest('hex')!==row.sha256)
      throw new Error('Official development release is incomplete: '+row.toolId);
  }
  const paths=[...new Set(['manifest.json',OFFICIAL_CATALOG_PATH,...official.apps.map(row=>row.packagePath),...output.publicAssets.map(asset=>asset.fileName),
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
  // server:started precedes internalBuild's outDir removal and public copy.
  // Wait for that existing build, never write resources into its empty window.
  let initialOutput=server.currentOutput,removeReadyHook,rejectReady;
  const ready=initialOutput?Promise.resolve():new Promise((resolveReady,reject)=>{
    rejectReady=reject;
    removeReadyHook=wxt.hooks.hook('build:done',(_wxt,output)=>{
      initialOutput=output;resolveReady();
    });
  });
  let publishing=Promise.resolve(),publicationGuard=()=>Promise.resolve();
  const publish=()=>{publishing=publishing.then(async()=>{await ready;await publicationGuard();return publishDevelopment(wxt,server.currentOutput||initialOutput);}).catch(error=>wxt.logger.error(error));return publishing;};
  server.reloadExtension=publish;server.reloadPage=publish;server.reloadContentScript=publish;
  const builder=wxt.builder,build=builder.build,importEntries=builder.importEntrypoints;
  const guardedBuild=async(...args)=>{if(server.currentOutput)await publishing;return build.apply(builder,args);};
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
  const styleSources=new Set(WORKSPACE_STYLE_INPUTS.map(path=>resolve(wxt.config.root,path)));
  // The authored catalog and declared tool sources replace checked-in JSON.
  const officialRoot=resolve(wxt.config.root,'official-tools');
  const toolRoot=resolve(wxt.config.root,'examples/sidebar-tools');
  let officialGeneration=0,catalogDirty=false,changeId=0;
  // Keep validated ownership across partial writer failures: its catalog rename
  // precedes stale-package removal, so disk alone cannot recover the old set.
  let officialOwned,ownershipError;
  const ownershipReady=ready.then(async()=>{
    const catalog=validateOfficialReleaseCatalog(JSON.parse(
      await readFile(resolve(wxt.config.outDir,OFFICIAL_CATALOG_PATH),'utf8')));
    officialOwned=new Set([OFFICIAL_CATALOG_PATH,...catalog.apps.map(row=>row.packagePath)]);
  }).catch(error=>{ownershipError=error;});
  const officialChanges=new Set(),copyErrors=new Map(),sourceVersions=new Map();
  let copying=Promise.resolve(),accepting=true;
  const sync=(event,file)=>{
    if(!accepting||!['add','change','unlink'].includes(event))return;
    const input=resolve(file),dest=sources.get(input),style=styleSources.has(input);
    // Generated AdBlock files are a consequence, never a watcher trigger.
    if(input.startsWith(resolve(toolRoot,'adblock/dist')+'/')||
      input.startsWith(resolve(toolRoot,'stay-focus/dist')+'/')||
      input.startsWith(resolve(toolRoot,'cookie-editor/dist')+'/'))return;
    const official=input===resolve(wxt.config.root,OFFICIAL_CATALOG_PATH)||input.startsWith(toolRoot+'/');
    if(!dest&&!style&&!official)return;
    const version=++changeId;sourceVersions.set(input,version);
    const errorKey=official?'official':input;
    if(event==='unlink'&&!official){
      const error=new Error('Required Workspace/static source removed: '+relative(wxt.config.root,file));
      copyErrors.set(input,error);wxt.logger.error('[OpenDesk dev] '+error.message);
      return;
    }
    // Failed compile must not publish a revision, but correcting the source
    // allows the next change to recover without restarting dev.
    let failureKey=errorKey;
    if(official)officialChanges.add(relative(wxt.config.root,input));
    if(input===resolve(wxt.config.root,OFFICIAL_CATALOG_PATH))catalogDirty=true;
    const generation=official?++officialGeneration:0;
    copying=copying.catch(()=>{}).then(async()=>{
      if(official){
        if(generation!==officialGeneration)return;
        const changes=[...officialChanges];officialChanges.clear();
        // This fixed CSS is not a declared tool-package input. Validate and
        // refresh it before the official branch can skip unrelated changes.
        if(changes.includes('examples/sidebar-tools/bookmark-manager/src/react/style.css')){
          failureKey=resolve(wxt.config.root,'src/ui/tool-shell.css');
          const target=resolve(wxt.config.publicDir,'ui/tool-shell.css');
          await mkdir(dirname(target),{recursive:true});
          await writeFile(target,trustedToolShellStyle(wxt.config.root));
          copyErrors.delete(failureKey);failureKey=errorKey;
          server.watcher.emit('all','change',target);
        }
        const adblockSourceChanged=changes.some(path=>
          /^examples\/sidebar-tools\/adblock\/(?:src\/|trusted\/(?:cosmetic-policy|policy)\.js$|vite\.config\.mjs$|tool\.config\.json$|package\.json$)/.test(path));
        if(adblockSourceChanged)await buildAdblockReact({log:false});
        const stayFocusSourceChanged=changes.some(path=>
          /^examples\/sidebar-tools\/stay-focus\/(?:src\/|vite\.config\.mjs$|tool\.config\.json$|package\.json$)/.test(path));
        if(stayFocusSourceChanged)await buildStayFocusReact({log:false});
        const cookieSourceChanged=changes.some(path=>
          /^examples\/sidebar-tools\/cookie-editor\/(?:app\/|src\/react\.css$|src\/root\.html$|vite\.config\.mjs$|tool\.config\.json$|package\.json$)/.test(path));
        const cookieReactBuilt=cookieSourceChanged&&
          Boolean(await buildCookieEditorReactIfOfficial({log:false}));
        const inputs=await officialToolInputs(wxt.config.root);
        // A JSX edit is intentionally absent from officialToolInputs(): only
        // compiled dist bytes are declared. Still publish the new package.
        if(!catalogDirty&&!adblockSourceChanged&&!stayFocusSourceChanged&&!cookieReactBuilt&&
          !changes.some(path=>inputs.includes(path)))return;
        await ready;await ownershipReady;
        let previous;
        try{previous=validateOfficialReleaseCatalog(JSON.parse(
          await readFile(resolve(wxt.config.outDir,OFFICIAL_CATALOG_PATH),'utf8')));}
        catch(error){
          if(error.code!=='ENOENT')throw error;
          if(!officialOwned)throw ownershipError||error;
        }
        const owned=new Set([...(officialOwned||[]),OFFICIAL_CATALOG_PATH,
          ...(previous?.apps||[]).map(row=>row.packagePath)]);
        // Retain the baseline even if generation/copy/cleanup fails below.
        officialOwned=owned;
        const generated=await buildOfficialTools(wxt.config.publicDir,{root:wxt.config.root});
        for(const path of generated.resources.keys())owned.add(path);
        // Copy complete packages first and catalog last, using the same queue
        // that gates revision publication. Never expose a failed half-build.
        await writeOfficialToolResources(generated,wxt.config.outDir);
        // A previous failed cleanup may already have replaced either catalog.
        // Retry only validated owned paths, with the writer's symlink guard.
        for(const directory of [wxt.config.publicDir,wxt.config.outDir]){
          const root=await realpath(directory);
          for(const path of owned){
            if(generated.resources.has(path))continue;
            const target=resolve(root,path);
            let parent;
            try{parent=await realpath(dirname(target));}
            catch(error){
              if(error.code!=='ENOENT')throw error;
              // An absent parent is already clean. A dangling symlink also
              // yields ENOENT, so check ancestors before treating it as absent.
              for(let path=dirname(target);path!==root;path=dirname(path)){
                try{if((await lstat(path)).isSymbolicLink())throw new Error('stale output directory is a symlink');}
                catch(error){if(error.code!=='ENOENT')throw error;}
              }
              continue;
            }
            if(parent!==dirname(target))throw new Error('stale output directory is a symlink');
            await rm(target,{force:true});
          }
        }
        // Preserve WXT metadata and every nonofficial asset, including sandbox.
        const output=server.currentOutput||initialOutput;
        const existing=new Map(output.publicAssets.map(asset=>[asset.fileName,asset]));
        output.publicAssets=[...output.publicAssets.filter(asset=>!owned.has(asset.fileName)),
          ...[...generated.resources.keys()].map(fileName=>existing.get(fileName)||{type:'asset',fileName})];
        officialOwned=new Set(generated.resources.keys());
        catalogDirty=false;copyErrors.delete(errorKey);
        void publish();
        return;
      }
      if(style){
        failureKey=WORKSPACE_STYLE_DEST;
        const result=await compileWorkspaceStyle(wxt.config.publicDir);
        copyErrors.delete(WORKSPACE_STYLE_DEST);
        wxt.logger.info('[OpenDesk dev] Workspace Tailwind compiled '+result.sha256.slice(0,12));
      }
      if(dest){
        failureKey=input;
        const target=resolve(wxt.config.publicDir,dest);
        await mkdir(dirname(target),{recursive:true});
        if(dest==='ui/tool-shell.css')await writeFile(target,trustedToolShellStyle(wxt.config.root));
        else await cp(file,target);
        wxt.logger.info('[OpenDesk dev] Static source changed: '+relative(wxt.config.root,file));
      }
      if(style)server.watcher.emit('all','change',resolve(wxt.config.publicDir,WORKSPACE_STYLE_DEST));
      if(dest)server.watcher.emit('all','change',resolve(wxt.config.publicDir,dest));
      if(sourceVersions.get(input)===version)copyErrors.delete(input);
    }).catch(error=>{
      copyErrors.set(failureKey,error);
      wxt.logger.error('[OpenDesk dev] Workspace/static publish failed: '+error.message);
    });
  };
  const watcher=server.watcher;
  const checkCopyErrors=()=>{if(copyErrors.size)throw copyErrors.values().next().value;};
  publicationGuard=async()=>{await copying;checkCopyErrors();};
  watcher.add([...new Set([...sources.keys(),...styleSources,officialRoot,toolRoot])]);watcher.on('all',sync);
  // WXT's asynchronous file reloader is installed after server:started.
  // Keep its rejected metadata/build queue from escaping EventEmitter.
  server[restartKey]?.protectWatcher();
  const session={publication:()=>publishing,stopCopies:()=>{accepting=false;watcher.off('all',sync);if(!initialOutput)rejectReady(new Error('Development stopped before initial output was ready'));},drain:async()=>{await copying;checkCopyErrors();await publishing;},restore:()=>{removeReadyHook?.();if(builder.build===guardedBuild)builder.build=build;if(builder.importEntrypoints===guardedImport)builder.importEntrypoints=importEntries;}};
  sessions.set(server,session);server[sessionKey]=session;
}
export async function closeDevelopment(wxt,server) {
  const session=server[sessionKey];session?.stopCopies();
  try{await session?.drain();}
  catch(error){wxt.logger?.error('[OpenDesk dev] Closing after a failed build: '+error.message);}
  finally{
    session?.restore();delete server[sessionKey];
    server[restartKey]?.unprotectWatcher(server.watcher);
    sessions.delete(server);
  }
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
