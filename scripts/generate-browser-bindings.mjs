#!/usr/bin/env node
// Deterministic, non-authoritative projection of the APPROVED matrix.
// This is not a runtime permission catalog. Registry and trusted Host remain
// authoritative; native discovery alone never enables a sandbox operation.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BROWSER_OPERATIONS,deriveBrowserDirectOperations,
  deriveBrowserScopedOperations} from '../src/framework/sdk/browser-contract.js';
import {renderBrowserDeveloperArtifacts} from './browser-sdk-developer.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const SOURCE='docs/api/browser-sdk-interface-matrix.json';
const OUTPUT='docs/api/browser-sdk-binding-catalog.generated.json';
const DIRECT_OUTPUT='src/framework/sdk/browser-direct.generated.js';
const SERVICE_OUTPUT='src/framework/sdk/browser-services.generated.js';
const MODES=Object.freeze({
  SCOPED:'SCOPED',COMPOSED:'CUSTOM',EXISTING_SERVICE:'CUSTOM',
  HOST_ONLY:'DENIED',DIRECT:'DIRECT'
});
const exact=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

export function deriveBrowserBindingCatalog(matrix,registry=BROWSER_OPERATIONS){
  if(matrix?.schemaVersion!=='opendesk.browser-sdk.interface-matrix.v1'||
     !Array.isArray(matrix.approvedOperations))throw Error('Pinned approved matrix missing');
  // Bootstrap newly approved DIRECT entries from the matrix before checking
  // public counts. Never require hand-editing the generated Registry first.
  const additions=deriveBrowserDirectBindings(matrix,registry)
    .filter(row=>!Object.hasOwn(registry,row.operation));
  const services=deriveBrowserScopedServiceBindings(matrix)
    .filter(row=>!Object.hasOwn(registry,row.operation));
  registry={...registry,...deriveBrowserScopedOperations(services),
    ...deriveBrowserDirectOperations(additions)};
  const nativeByName=new Map((matrix.nativeInterfaces??[]).map(row=>[row.nativeApi,row]));
  const rows=matrix.approvedOperations.map(row=>{
    const mode=MODES[row.mappingKind];
    if(!mode||typeof row.id!=='string'||!Array.isArray(row.nativeApis)||
       !Array.isArray(row.chromePermissions)||!Array.isArray(row.toolCapabilities)||
       !row.inputSchema||!row.outputSchema)throw Error('Invalid approved binding '+row.id);
    const publicSdk=row.visibility==='APPROVED_TOOL_REGISTERED';
    const runtime=Object.hasOwn(registry,row.id)?registry[row.id]:null;
    // Newly approved DIRECT methods are generated into the runtime Registry
    // from this very matrix, not hand-added before the generator can run.
    if(publicSdk!==Boolean(runtime)&&!(publicSdk&&mode==='DIRECT'&&!runtime))
      throw Error('Registered/approved visibility drift '+row.id);
    if(runtime&&(!exact(row.chromePermissions,runtime.requiredChromePermissions)||
       !exact(row.toolCapabilities,runtime.requiredCapabilities)||
       row.userGesture!==runtime.requiresUserGesture||
       row.maxRequestBytes!==runtime.maxRequestBytes||
       row.maxResponseBytes!==runtime.maxResponseBytes))
      throw Error('Approved binding security contract drift '+row.id);
    if(runtime&&row.compiledBinding==='TRUSTED_SERVICE'&&(
       row.effectClass!==runtime.effectClass||row.riskLevel!==runtime.riskLevel||
       row.siteScope!==runtime.siteScope||row.lifecycle!==runtime.lifecycle||
       !exact(row.inputSchema,runtime.inputSchema)||
       !exact(row.outputSchema,runtime.outputSchema)))
      throw Error('Approved trusted-service schema/effect drift '+row.id);
    if(!publicSdk&&mode!=='DENIED')throw Error('Trusted-only operation is not DENIED '+row.id);
    if(publicSdk&&mode==='DENIED')throw Error('Public operation cannot be denied in matrix '+row.id);
    return {
      operation:row.id,visibility:row.visibility,mode,
      nativeApis:row.nativeApis,
      // Exact Chrome names and positional signatures are derived from pinned
      // Chromium schema rows; never hand-maintain per-method Host wrappers.
      nativeSignatures:row.nativeApis.map(nativeApi=>{
        const item=nativeByName.get(nativeApi);
        if(!item)throw Error('Approved operation has an unknown Chromium mapping: '+row.id);
        return {nativeApi,kind:item.kind,signature:item.signature,
          parameters:item.parameters??[],returnType:item.returnType??null};
      }),
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
// Compile only DIRECT operations already approved in the same pinned matrix.
// Every other Chrome discovery/SCOPED/CUSTOM/HOST_ONLY remains non-executable
// through native name mapping, irrespective of name similarity.
export function deriveBrowserDirectBindings(matrix,registry=BROWSER_OPERATIONS){
  if(!Array.isArray(matrix?.approvedOperations)||!Array.isArray(matrix?.nativeInterfaces))
    throw Error('Pinned Native discovery or approval entries missing');
  const source=new Map(matrix.nativeInterfaces.map(row=>[row.nativeApi,row]));
  const approved=[];
  for(const row of matrix.approvedOperations){
    if(row.mappingKind!=='DIRECT')continue;
    const runtime=Object.hasOwn(registry,row.id)?registry[row.id]:null;
    if(row.visibility!=='APPROVED_TOOL_REGISTERED'||
       runtime&&(
         runtime.effectClass!=='read'||runtime.siteScope!=='none'||runtime.requiresUserGesture||
         !exact(row.chromePermissions,runtime.requiredChromePermissions)||
         !exact(row.toolCapabilities,runtime.requiredCapabilities)
       )||
       row.effectClass!=='read'||row.userGesture||row.siteScope!=='none'||
       row.allowedWorlds?.length!==1||row.allowedWorlds[0]!=='sidebar-tool'||
       row.nativeApis?.length!==1||
       row.nativeApis[0]!=='chrome.'+row.id.slice('browser.'.length)&&
         !source.get(row.nativeApis[0])?.approvedOperationIds?.includes(row.id)||
       row.inputSchema?.type!=='object'||row.inputSchema.additionalProperties!==false||
       !['object','array'].includes(row.outputSchema?.type)||
       !Array.isArray(row.chromePermissions)||!Array.isArray(row.toolCapabilities)||
       !Number.isInteger(row.maxRequestBytes)||row.maxRequestBytes<1||
       !Number.isInteger(row.maxResponseBytes)||row.maxResponseBytes<1)
      throw Error('DIRECT operation has an unsafe native/authority contract: '+row.id);
    const native=source.get(row.nativeApis[0]);
    if(native?.kind!=='METHOD'||!native.returnType?.startsWith('Promise<')||
       !native.approvedOperationIds?.includes(row.id)||
       !Array.isArray(native.parameters)||native.parameters.length>4)
      throw Error('DIRECT operation lacks a pinned Promise method: '+row.id);
    const aliases=row.argumentAliases??{};
    if(!aliases||typeof aliases!=='object'||Array.isArray(aliases)||
       Object.getPrototypeOf(aliases)!==Object.prototype||
       Object.keys(aliases).some(key=>!native.parameters.some(p=>p.name===key)))
      throw Error('Unsafe DIRECT argument aliases: '+row.id);
    const params=native.parameters.map(param=>{
      if(typeof param?.name!=='string'||!/^[A-Za-z][A-Za-z0-9]*$/.test(param.name)||
         typeof param.optional!=='boolean'||typeof param.type!=='string')
        throw Error('Invalid Native parameter: '+row.id);
      const type=param.type.startsWith('$ref:')?'object':param.type;
      if(!['object','array','integer','number','string','boolean'].includes(type))
        throw Error('DIRECT API needs a special parameter adapter: '+row.id);
      const sdkName=Object.hasOwn(aliases,param.name)?aliases[param.name]:param.name;
      if(typeof sdkName!=='string'||!/^[A-Za-z][A-Za-z0-9]*$/.test(sdkName)||
         ['constructor','prototype','__proto__'].includes(sdkName)||
         type!=='object'&&!Object.hasOwn(row.inputSchema.properties??{},sdkName)||
         type!=='object'&&!param.optional&&!row.inputSchema.required?.includes(sdkName))
        throw Error('DIRECT parameter not represented by SDK schema: '+row.id);
      if(Object.hasOwn(aliases,param.name)&&
         (type==='object'||row.inputSchema.properties[sdkName]?.type!==type))
        throw Error('DIRECT alias requires an exact scalar type: '+row.id);
      return {name:param.name,type,optional:param.optional};
    });
    if(params.length===1&&params[0].type==='object'&&
       row.inputSchema.type!=='object')throw Error('DIRECT object argument mismatch: '+row.id);
    if(params.some(p=>p.type==='object')&&
       !(params.length===1&&params[0].type==='object'))
      throw Error('DIRECT API with mixed object arguments needs custom mapping: '+row.id);
    approved.push({
      operation:row.id,mode:'DIRECT',nativeApi:row.nativeApis[0],parameters:params,
      ...(Object.keys(aliases).length?{argumentAliases:{...aliases}}:{}),
      requiredCapabilities:row.toolCapabilities,requiredChromePermissions:row.chromePermissions,
      supportedContexts:row.allowedWorlds,requiresUserGesture:false,siteScope:'none',
      effectClass:'read',riskLevel:'low',lifecycle:row.lifecycle??'request',
      maxRequestBytes:row.maxRequestBytes,maxResponseBytes:row.maxResponseBytes,
      inputSchema:row.inputSchema,outputSchema:row.outputSchema,
      minChrome:row.support?.desktopChromeMinimum??null
    });
  }
  return approved.sort((a,b)=>a.operation.localeCompare(b.operation,'en'));
}

/**
 * Compile explicit SCOPED / EXISTING_SERVICE approvals as Registry + Schema
 * metadata. Never compile a raw Chrome call: the existing Host must already
 * supply an audited namespace service with a matching own method.
 */
export function deriveBrowserScopedServiceBindings(matrix){
  if(matrix?.schemaVersion!=='opendesk.browser-sdk.interface-matrix.v1'||
     !Array.isArray(matrix.approvedOperations)||!Array.isArray(matrix.nativeInterfaces))
    throw Error('Pinned approved scoped-service matrix missing');
  const source=new Map(matrix.nativeInterfaces.map(row=>[row.nativeApi,row]));
  const names=new Set(),out=[];
  const safePart=part=>typeof part==='string'&&/^[A-Za-z][A-Za-z0-9]*$/.test(part)&&
    !['constructor','prototype','__proto__'].includes(part);
  for(const row of matrix.approvedOperations){
    if(row.compiledBinding===undefined)continue;
    if(row.compiledBinding!=='TRUSTED_SERVICE'||
       !['SCOPED','EXISTING_SERVICE'].includes(row.mappingKind)||
       row.visibility!=='APPROVED_TOOL_REGISTERED'||
       typeof row.id!=='string'||!row.id.startsWith('browser.')||
       !row.id.slice('browser.'.length).split('.').every(safePart)||
       row.allowedWorlds?.length!==1||row.allowedWorlds[0]!=='sidebar-tool'||
       !['read','write'].includes(row.effectClass)||
       !['low','medium','high','critical'].includes(row.riskLevel)||
       typeof row.siteScope!=='string'||row.siteScope==='none'||
       !Array.isArray(row.chromePermissions)||!Array.isArray(row.toolCapabilities)||
       !Array.isArray(row.nativeApis)||row.nativeApis.length===0||
       !Number.isSafeInteger(row.maxRequestBytes)||row.maxRequestBytes<1||
       !Number.isSafeInteger(row.maxResponseBytes)||row.maxResponseBytes<1||
       typeof row.lifecycle!=='string'||row.lifecycle.length<1||row.lifecycle.length>160||
       row.inputSchema?.type!=='object'||row.inputSchema.additionalProperties!==false||
       !Array.isArray(row.inputSchema.required)||!row.inputSchema.properties||
       !['object','array'].includes(row.outputSchema?.type)||
       names.has(row.id))
      throw Error('Unsafe compiled trusted service contract: '+row.id);
    names.add(row.id);
    if(row.nativeApis.some(api=>source.get(api)?.kind!=='METHOD'||
       !source.get(api)?.approvedOperationIds?.includes(row.id)))
      throw Error('Registered/approved visibility drift '+row.id);
    out.push({
      operation:row.id,mode:'TRUSTED_SERVICE',mappingKind:row.mappingKind,
      requiredCapabilities:row.toolCapabilities,requiredChromePermissions:row.chromePermissions,
      supportedContexts:row.allowedWorlds,requiresUserGesture:row.userGesture,
      siteScope:row.siteScope,effectClass:row.effectClass,riskLevel:row.riskLevel,
      lifecycle:row.lifecycle,maxRequestBytes:row.maxRequestBytes,
      maxResponseBytes:row.maxResponseBytes,inputSchema:row.inputSchema,
      outputSchema:row.outputSchema,minChrome:row.support?.desktopChromeMinimum??null
    });
  }
  return out.sort((a,b)=>a.operation.localeCompare(b.operation,'en'));
}
export function renderBrowserScopedServiceModule(descriptors){
  return '// Generated from the pinned approved Browser SDK matrix. Do not edit.\n'+
    '// Trusted-service metadata only; original Host/Driver remains authoritative.\n'+
    'export const APPROVED_BROWSER_SCOPED_BINDINGS=Object.freeze('+
    JSON.stringify(descriptors,null,2)+');\n';
}
export function renderBrowserDirectModule(descriptors){
  const encoded=JSON.stringify(descriptors,null,2);
  return '// Generated from the pinned, approved Browser SDK matrix. Do not edit.\n'+
    '// Runtime import is a finite allowlist, not a Chrome RPC surface.\n'+
    'export const APPROVED_BROWSER_DIRECT_BINDINGS=Object.freeze('+encoded+');\n';
}


// Developer-only derived artifacts: existing approved matrix + existing live
// Registry feed the same pipeline as compiled DIRECT runtime bindings.
// They are NOT another Registry and are never bundled in the service worker.
export function deriveBrowserDeveloperSurface(matrix,registry=BROWSER_OPERATIONS){
  const catalog=deriveBrowserBindingCatalog(matrix,registry);
  const additions=deriveBrowserDirectBindings(matrix,registry)
    .filter(row=>!Object.hasOwn(registry,row.operation));
  const services=deriveBrowserScopedServiceBindings(matrix)
    .filter(row=>!Object.hasOwn(registry,row.operation));
  return renderBrowserDeveloperArtifacts(catalog,
    {...registry,...deriveBrowserScopedOperations(services),
      ...deriveBrowserDirectOperations(additions)},matrix.approvedOperations);
}
export async function syncBrowserDeveloperSurface({root=ROOT,check=false}={}){
  const matrix=JSON.parse(await readFile(resolve(root,SOURCE),'utf8'));
  const result=deriveBrowserDeveloperSurface(matrix);
  const typesPath=resolve(root,'docs/api/browser-sdk.developer.generated.d.ts');
  const docsPath=resolve(root,'docs/api/browser-sdk.developer.generated.md');
  if(check){
    const [types,documentation]=await Promise.all([
      readFile(typesPath,'utf8').catch(()=>null),
      readFile(docsPath,'utf8').catch(()=>null)
    ]);
    if(types!==result.types||documentation!==result.documentation)
      throw Error('Developer SDK types/docs drift; regenerate with --developer');
  }else{
    await Promise.all([
      writeFile(typesPath,result.types,'utf8'),
      writeFile(docsPath,result.documentation,'utf8')
    ]);
  }
  return {ok:true,publicCount:result.publicCount,check,
    typesOutput:'docs/api/browser-sdk.developer.generated.d.ts',
    docsOutput:'docs/api/browser-sdk.developer.generated.md',nativeChrome:'NOT_TESTED'};
}

export async function syncBrowserBindings({root=ROOT,check=false}={}){
  const matrix=JSON.parse(await readFile(resolve(root,SOURCE),'utf8'));
  const generated=JSON.stringify(deriveBrowserBindingCatalog(matrix),null,2)+'\n';
  const filepath=resolve(root,OUTPUT);
  const direct=deriveBrowserDirectBindings(matrix);
  const services=deriveBrowserScopedServiceBindings(matrix);
  const directSource=renderBrowserDirectModule(direct),directPath=resolve(root,DIRECT_OUTPUT);
  const serviceSource=renderBrowserScopedServiceModule(services),servicePath=resolve(root,SERVICE_OUTPUT);
  if(check){
    const [existing,native,scoped]=await Promise.all([
      readFile(filepath,'utf8').catch(()=>null),
      readFile(directPath,'utf8').catch(()=>null),
      readFile(servicePath,'utf8').catch(()=>null)
    ]);
    if(existing!==generated)throw Error('Browser Binding Catalog drift; regenerate from approved matrix');
    if(native!==directSource)throw Error('Native DIRECT runtime allowlist drift; regenerate from approved matrix');
    if(scoped!==serviceSource)throw Error('Trusted-service runtime metadata drift; regenerate from approved matrix');
  }else{
    await Promise.all([writeFile(filepath,generated,'utf8'),
      writeFile(directPath,directSource,'utf8'),writeFile(servicePath,serviceSource,'utf8')]);
  }
  return {ok:true,check,source:SOURCE,output:OUTPUT,directOutput:DIRECT_OUTPUT,
    scopedOutput:SERVICE_OUTPUT,approved:matrix.approvedOperations.length,
    direct:direct.length,scoped:services.length,nativeChrome:'NOT_TESTED'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  (process.argv.includes('--developer')||process.argv.includes('--check-developer')
    ?syncBrowserDeveloperSurface({check:process.argv.includes('--check-developer')})
    :syncBrowserBindings({check:process.argv.includes('--check')})).then(x=>
    console.log(JSON.stringify(x)),error=>{console.error(error.stack||error);process.exitCode=1;});
}
