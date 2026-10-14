#!/usr/bin/env node
// Deterministic, non-authoritative projection of the APPROVED matrix.
// This is not a runtime permission catalog. Registry and trusted Host remain
// authoritative; native discovery alone never enables a sandbox operation.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BROWSER_OPERATIONS} from '../src/framework/sdk/browser-contract.js';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const SOURCE='docs/api/browser-sdk-interface-matrix.json';
const OUTPUT='docs/api/browser-sdk-binding-catalog.generated.json';
const MODES=Object.freeze({
  SCOPED:'SCOPED',COMPOSED:'CUSTOM',EXISTING_SERVICE:'CUSTOM',
  HOST_ONLY:'DENIED',DIRECT:'DIRECT'
});
const exact=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

export function deriveBrowserBindingCatalog(matrix,registry=BROWSER_OPERATIONS){
  if(matrix?.schemaVersion!=='opendesk.browser-sdk.interface-matrix.v1'||
     !Array.isArray(matrix.approvedOperations))throw Error('Pinned approved matrix missing');
  const rows=matrix.approvedOperations.map(row=>{
    const mode=MODES[row.mappingKind];
    if(!mode||typeof row.id!=='string'||!Array.isArray(row.nativeApis)||
       !Array.isArray(row.chromePermissions)||!Array.isArray(row.toolCapabilities)||
       !row.inputSchema||!row.outputSchema)throw Error('Invalid approved binding '+row.id);
    const publicSdk=row.visibility==='APPROVED_TOOL_REGISTERED';
    const runtime=Object.hasOwn(registry,row.id)?registry[row.id]:null;
    if(publicSdk!==Boolean(runtime))throw Error('Registered/approved visibility drift '+row.id);
    if(runtime&&(!exact(row.chromePermissions,runtime.requiredChromePermissions)||
       !exact(row.toolCapabilities,runtime.requiredCapabilities)||
       row.userGesture!==runtime.requiresUserGesture||
       row.maxRequestBytes!==runtime.maxRequestBytes||
       row.maxResponseBytes!==runtime.maxResponseBytes))
      throw Error('Approved binding security contract drift '+row.id);
    if(!publicSdk&&mode!=='DENIED')throw Error('Trusted-only operation is not DENIED '+row.id);
    if(publicSdk&&mode==='DENIED')throw Error('Public operation cannot be denied in matrix '+row.id);
    return {
      operation:row.id,visibility:row.visibility,mode,
      nativeApis:row.nativeApis,
      runtimeSchema:publicSdk?'src/framework/sdk/browser-schemas.js#'+row.id:null,
      chromePermissions:row.chromePermissions,
      toolCapabilities:row.toolCapabilities,
      supportedContexts:row.allowedWorlds,
      siteScope:row.siteScope,
      userGesture:row.userGesture,
      minChrome:row.support?.desktopChromeMinimum??null,
      maxRequestBytes:row.maxRequestBytes,
      maxResponseBytes:row.maxResponseBytes,
      lifecycle:row.lifecycle
    };
  }).sort((a,b)=>a.operation<b.operation?-1:a.operation>b.operation?1:0);
  const seen=new Set();
  for(const row of rows){
    if(seen.has(row.operation))throw Error('Duplicate approved binding '+row.operation);
    seen.add(row.operation);
  }
  if(rows.filter(x=>x.visibility==='APPROVED_TOOL_REGISTERED').length!==Object.keys(registry).length)
    throw Error('Public SDK binding count drift');
  return {
    schemaVersion:'opendesk.browser-sdk.bindings.generated.r11.v1',
    authoritativeSource:SOURCE,
    generationPolicy:'DERIVED_METADATA_ONLY_NOT_A_PERMISSION_GRANT',
    chromiumSourceCommit:matrix.target.sourceCommit,
    counts:{approved:rows.length,public:rows.filter(x=>x.visibility==='APPROVED_TOOL_REGISTERED').length,
      hostOnly:rows.filter(x=>x.mode==='DENIED').length},
    bindings:rows
  };
}
export async function syncBrowserBindings({root=ROOT,check=false}={}){
  const matrix=JSON.parse(await readFile(resolve(root,SOURCE),'utf8'));
  const generated=JSON.stringify(deriveBrowserBindingCatalog(matrix),null,2)+'\n';
  const filepath=resolve(root,OUTPUT);
  if(check){
    const existing=await readFile(filepath,'utf8').catch(()=>null);
    if(existing!==generated)throw Error('Browser Binding Catalog drift; regenerate from approved matrix');
  }else await writeFile(filepath,generated,'utf8');
  return {ok:true,check,source:SOURCE,output:OUTPUT,approved:matrix.approvedOperations.length,
    nativeChrome:'NOT_TESTED'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  syncBrowserBindings({check:process.argv.includes('--check')}).then(x=>
    console.log(JSON.stringify(x)),error=>{console.error(error.stack||error);process.exitCode=1;});
}
