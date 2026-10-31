import * as moduleApi from 'node:module';
import {randomUUID} from 'node:crypto';
import {realpathSync} from 'node:fs';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const repositoryRoot=fileURLToPath(new URL('../',import.meta.url));
const generationKey='opendeskBuildGeneration';
const stateKey=Symbol.for('opendesk.build-module-loader.v1');
function localModule(url,root){
  if(url.protocol!=='file:'||!/\.(?:js|mjs)$/.test(url.pathname))return false;
  const path=relative(root,fileURLToPath(url));
  return path!==''&&!isAbsolute(path)&&path!=='..'&&!path.startsWith('..'+sep)&&
    !path.split(sep).includes('node_modules');
}
function generations(){
  if(typeof moduleApi.registerHooks!=='function')
    throw new Error('Fresh build module loading requires Node.js 22.15+ or 24 with module.registerHooks; current: '+process.version);
  // Config evaluation may itself be versioned. Keep ONE resolver across all
  // helper instances, and scope every generation to its own repository root.
  if(globalThis[stateKey])return globalThis[stateKey];
  const roots=new Map();
  moduleApi.registerHooks({resolve(specifier,context,nextResolve){
    const result=nextResolve(specifier,context);
    if(!context.parentURL)return result;
    const parent=new URL(context.parentURL),generation=parent.searchParams.get(generationKey);
    const root=roots.get(generation);
    if(!root||!localModule(parent,root))return result;
    const target=new URL(result.url);
    if(!localModule(target,root))return result;
    target.searchParams.set(generationKey,generation);
    return {...result,url:target.href};
  }});
  globalThis[stateKey]=roots;return roots;
}

export function createBuildModuleLoader({fresh=false,root=repositoryRoot}={}){
  const actualRoot=realpathSync(root),base=pathToFileURL(resolve(actualRoot,'wxt.config.mjs'));
  const generation=fresh?randomUUID():null;
  if(fresh)generations().set(generation,actualRoot);
  return specifier=>{
    // Resolve symlinks before deciding whether an entry belongs to this graph.
    // This is native ESM import, not Jiti's cached/transformed import helper.
    const target=new URL(import.meta.resolve(new URL(specifier,base).href));
    if(fresh&&localModule(target,actualRoot))target.searchParams.set(generationKey,generation);
    return import(target.href);
  };
}
