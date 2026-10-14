#!/usr/bin/env node
// Browser SDK freeze check: one executable entry, not a second contract.
// Source discovery is NOT proof that every Chromium source has been reproduced.
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BROWSER_OPERATIONS} from '../src/framework/sdk/browser-contract.js';
import {createBrowserSdk} from '../src/framework/sdk/browser.js';
import {TRUSTED_COOKIE_OPERATIONS} from '../src/platform/chrome/browser-cookie-host.js';
import {checkBrowserSdkInterfaceMatrix} from './check-browser-sdk-interface-matrix.mjs';
import {syncNativeCatalog} from './sync-chrome-api-catalog.mjs';
import {syncBrowserBindings} from './generate-browser-bindings.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const stable=values=>[...values].sort();
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// Wrapper functions must track the authoritative operation registry. The
// composed network.watch convenience uses existing operations, not a new RPC.
export function inspectBrowserSdkWrapper(
  registry=BROWSER_OPERATIONS,
  sdk=createBrowserSdk({request:async()=>null})
){
  const found=new Set(),errors=[];
  function walk(value,path=[]){
    for(const [key,child] of Object.entries(value)){
      if(path.length===0&&key==='apiVersion')continue;
      const name=[...path,key].join('.');
      if(name==='network.watch')continue;
      if(typeof child==='function'){
        const operation='browser.'+name;
        if(found.has(operation))errors.push('Duplicate wrapper '+operation);
        found.add(operation);
      }else if(child&&typeof child==='object'&&!Array.isArray(child)){
        walk(child,[...path,key]);
      }else{
        errors.push('Unexpected public SDK field '+name);
      }
    }
  }
  walk(sdk);
  const registered=new Set(Object.keys(registry));
  for(const operation of registered)
    if(!found.has(operation))errors.push('Missing public wrapper '+operation);
  for(const operation of found)
    if(!registered.has(operation))errors.push('Unregistered public wrapper '+operation);
  return {errors,registered:registered.size,wrappers:found.size};
}

export async function checkBrowserSdkFreeze({root=ROOT}={}){
  const wrapper=inspectBrowserSdkWrapper();
  if(wrapper.errors.length)throw Error(wrapper.errors.join('\n'));
  const cookieRegistry=stable(Object.keys(BROWSER_OPERATIONS)
    .filter(name=>name.startsWith('browser.cookies.')));
  const cookieHost=stable(new Set(TRUSTED_COOKIE_OPERATIONS));
  if(!equal(cookieRegistry,cookieHost)||
     TRUSTED_COOKIE_OPERATIONS.length!==cookieHost.length)
    throw Error('Public Cookies registry and single Cookie Host disagree');
  const matrix=await checkBrowserSdkInterfaceMatrix(root);
  const bindings=await syncBrowserBindings({root,check:true});
  if(bindings.approved!==matrix.approved)
    throw Error('Generated Browser Bindings drift from the approved matrix');
  if(matrix.callableRegistry!==wrapper.registered)
    throw Error('Matrix checker and live registry disagree');
  // The existing catalog generator checks Git blob hashes for the eight
  // vendored JSON source files and byte-for-byte regenerated output.
  const catalog=await syncNativeCatalog({root,check:true});
  const source=JSON.parse(await readFile(
    resolve(root,'docs/api/chrome-native-api-sources.json'),'utf8'));
  if(!Array.isArray(source.files)||source.files.length===0)
    throw Error('Missing pinned Chromium JSON source files');
  // The 191-file JSON/WebIDL/IDL matrix is still only metadata checked by
  // the existing matrix checker. Do not claim full offline reproducibility.
  return {
    ok:true,registeredOperations:wrapper.registered,publicWrapperMethods:wrapper.wrappers,
    generatedBindingsChecked:true,
    cookieOperations:cookieRegistry.length,approvedOperations:matrix.approved,
    nativeDiscovered:matrix.nativeDiscovered,
    partialJsonSnapshot:{chromiumCommit:source.chromiumCommit,
      pinnedAndByteVerifiedFiles:source.files.length,catalog},
    fullMatrixSourceFiles:matrix.sourceFiles,
    fullMatrixBytesReparsed:false,
    sourceVerification:'PARTIAL_PINNED_JSON_ONLY',
    nativeChrome:'NOT_TESTED'
  };
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  checkBrowserSdkFreeze().then(result=>console.log(JSON.stringify(result)),
    error=>{console.error('Browser SDK freeze check failed:\n'+error.message);process.exitCode=1;});
}
