// Build a private local preview input directory; never admit vendor code to
// the installed USER_SCRIPT and never publish these files as CI artifacts.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {copyFile,mkdir,mkdtemp,readFile,rename,rm,stat,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const exec=promisify(execFile);
const preview=dirname(fileURLToPath(import.meta.url));
const root=resolve(preview,'../../../..');
const snapshots=join(root,'docs/contracts/source-snapshots/scrapyJsChrome/www/lib/xmind');
const runtimeParent=join(preview,'.runtime');
export const PREVIEW_XMIND_RUNTIME_DIR=join(runtimeParent,'xmind');
const originals=[
  'polyfill-45b9836beb.min.js',
  'xmind-sdk.bundle.js',
  'snowbrush-2c2b5d62b5.js'
];
const error=(code,cause)=>Object.assign(new Error(code+(cause?.message?': '+cause.message:'')),{code,cause});

async function exists(path){
  try{await stat(path);return true;}
  catch(e){if(e.code==='ENOENT')return false;throw e;}
}
export async function prepareXmindPreviewAssets({verify}={}){
  if(typeof verify!=='function')throw error('E_XMIND_PREVIEW_VERIFIER_REQUIRED');
  // Reuse an existing verified cache. A corrupt or partial cache is never
  // silently overwritten, as that would conceal tampering or source changes.
  if(await exists(PREVIEW_XMIND_RUNTIME_DIR)){
    try{await verify(PREVIEW_XMIND_RUNTIME_DIR);return PREVIEW_XMIND_RUNTIME_DIR;}
    catch(e){throw error('E_XMIND_PREVIEW_CACHE_INVALID',e);}
  }
  await mkdir(runtimeParent,{recursive:true});
  const stage=await mkdtemp(join(runtimeParent,'.prepare-'));
  try{
    for(const name of originals){
      await copyFile(join(snapshots,name),join(stage,name));
    }
    // Acquisition happens only in the developer/CI preparation phase.
    // npm is version-pinned, scripts disabled; runtime never loads a CDN.
    try{
      await exec('npm',['pack','jszip@3.10.1','--pack-destination',stage,
        '--ignore-scripts','--silent'],{cwd:root,timeout:120000});
      const tarball=join(stage,'jszip-3.10.1.tgz');
      const {stdout}=await exec('tar',['-xOf',tarball,'package/dist/jszip.min.js'],
        {encoding:'buffer',maxBuffer:1024*1024,timeout:30000});
      await writeFile(join(stage,'jszip.min.js'),stdout);
      await rm(tarball,{force:true});
    }catch(e){throw error('E_XMIND_PREVIEW_JSZIP_UNAVAILABLE',e);}
    // Exact real bytes, size, SHA-256, Git blob and original order.
    const resources=await verify(stage);
    if(resources.size!==4)throw error('E_XMIND_PREVIEW_ASSETS_INCOMPLETE');
    await rename(stage,PREVIEW_XMIND_RUNTIME_DIR);
    return PREVIEW_XMIND_RUNTIME_DIR;
  }finally{
    await rm(stage,{recursive:true,force:true});
  }
}
async function cli(){
  const {verifyFixedXmindAssets}=await import('./serve.mjs');
  const dir=await prepareXmindPreviewAssets({verify:verifyFixedXmindAssets});
  console.log('REAL_XMIND_PREVIEW_ASSETS '+dir);
  console.log('FIXED_XMIND_RESOURCE_COUNT 4; preview-only, not approved for redistribution or installation');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  cli().catch(e=>{console.error(e.message);process.exitCode=1;});
}
