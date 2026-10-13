#!/usr/bin/env node
// Read-only design/source scope check. Does not grant Browser SDK permissions,
// fetch external code, or claim original Chromium source bytes/native Chrome PASS.
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BROWSER_OPERATIONS} from '../src/framework/sdk/browser-contract.js';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const PINNED_CHROMIUM_COMMIT='b5485910372708cd11d9a814a3e382fe8da57df3';
const KINDS=Object.freeze({NAMESPACE:163,METHOD:1255,EVENT:321,PROPERTY:91});
const VALID_VISIBILITY=new Set(['APPROVED_TOOL_REGISTERED','HOST_ONLY_TRUSTED_COOKIE_UI',
  'APPROVED_TOOL_PLANNED','BUILTIN_HOST_ONLY_DESIGN_APPROVED']);
const sha40=/^[0-9a-f]{40}$/;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sorted=a=>[...a].sort();

export function inspectBrowserSdkInterfaceMatrix(matrix,registered=Object.keys(BROWSER_OPERATIONS)){
 const errors=[];
 if(matrix?.schemaVersion!=='opendesk.browser-sdk.interface-matrix.v1'||
    matrix?.target?.sourceCommit!==PINNED_CHROMIUM_COMMIT||matrix?.target?.minChrome!==138)
   errors.push('Pinned Chromium source identity or contract version changed');
 if(!Array.isArray(matrix?.sourceFiles)||!Array.isArray(matrix?.nativeInterfaces)||
    !Array.isArray(matrix?.approvedOperations))return [...errors,'Missing matrix arrays'];
 const sources=new Map(),natives=new Map(),approvals=new Map();
 if(matrix.sourceFiles.length!==191)errors.push('Pinned source file count changed');
 for(const s of matrix.sourceFiles){
   if(!s||typeof s.path!=='string'||!sha40.test(s.gitBlobSha||'')||
      !Number.isSafeInteger(s.rowCount)||s.rowCount<0||sources.has(s.path))
     errors.push('Invalid or duplicate pinned source '+s?.path);
   else sources.set(s.path,s);
   if(!['PARSED','NO_PUBLIC_NAMESPACE_DEFINITION'].includes(s.parseStatus))
     errors.push('Missing source parser classification '+s.path);
 }
 const kindCounts=Object.fromEntries(Object.keys(KINDS).map(k=>[k,0]));
 const bucketCounts={},ids=new Set();
 for(const n of matrix.nativeInterfaces){
   if(!n||typeof n.nativeApi!=='string'||natives.has(n.nativeApi)||
      !Object.hasOwn(kindCounts,n.kind)||typeof n.bucket!=='string')
     {errors.push('Invalid/duplicate native API '+n?.nativeApi);continue}
   natives.set(n.nativeApi,n);kindCounts[n.kind]++;
   bucketCounts[n.bucket]=(bucketCounts[n.bucket]??0)+1;
   const origin=sources.get(n.source?.path);
   if(!origin||origin.gitBlobSha!==n.source.gitBlobSha)
     errors.push('Unpinned native source '+n.nativeApi);
   if(!Array.isArray(n.approvedOperationIds))errors.push('Missing native approval links '+n.nativeApi);
 }
 if(!same(kindCounts,KINDS))errors.push('Pinned native kinds/counts drift');
 if(!same(sorted(Object.keys(bucketCounts)),sorted(Object.keys(matrix.counts?.buckets??{})))||
   Object.keys(bucketCounts).some(k=>bucketCounts[k]!==matrix.counts.buckets[k]))
   errors.push('Native classification counts drift');
 if(matrix.nativeInterfaces.length!==1830||
    matrix.sourceFiles.reduce((sum,x)=>sum+(x.rowCount||0),0)!==1830)
   errors.push('Source rows are incomplete or duplicated');
 if(matrix.sourceFiles.filter(x=>x.parseStatus==='NO_PUBLIC_NAMESPACE_DEFINITION').length!==11)
   errors.push('Type/manifest-only source count drift');
 if(matrix.counts?.sourceFiles!==191||matrix.counts?.totalRows!==1830||
    matrix.counts?.parseErrors!==0||matrix.parseErrors?.length!==0||
    matrix.counts?.namespaces!==KINDS.NAMESPACE||
    matrix.counts?.methods!==KINDS.METHOD||matrix.counts?.events!==KINDS.EVENT||
    matrix.counts?.properties!==KINDS.PROPERTY)
   errors.push('Machine summary disagrees with pinned discovery');
 for(const a of matrix.approvedOperations){
   if(!a||typeof a.id!=='string'||ids.has(a.id)){errors.push('Duplicate approved operation '+a?.id);continue}
   ids.add(a.id);approvals.set(a.id,a);
   if(!VALID_VISIBILITY.has(a.visibility)||!a.inputSchema||!a.outputSchema||
      !Array.isArray(a.nativeApis)||!Array.isArray(a.toolCapabilities)||
      !Array.isArray(a.chromePermissions)||typeof a.phase!=='string')
     errors.push('Approved operation missing typed/safety contract '+a.id);
   for(const api of a.nativeApis){
     if(!natives.get(api)?.approvedOperationIds?.includes(a.id))
       errors.push('Missing reciprocal native mapping '+a.id+' -> '+api);
   }
 }
 for(const n of matrix.nativeInterfaces)for(const id of n.approvedOperationIds??[]){
   if(!approvals.get(id)?.nativeApis?.includes(n.nativeApi))
     errors.push('Native mapping admits an unknown operation '+n.nativeApi+' -> '+id);
 }
 const live=sorted(registered),allowed=sorted(matrix.approvedOperations.filter(x=>
    x.visibility==='APPROVED_TOOL_REGISTERED').map(x=>x.id));
 if(!same(live,allowed))errors.push('Runtime Browser SDK disagrees with approved registered operation list');
 // Check metadata used by the Host; descriptions of siteScope may remain richer.
 for(const op of registered){
   const row=approvals.get(op);
   if(!row){errors.push('Unapproved runtime operation '+op);continue}
   const actual=BROWSER_OPERATIONS[op];
   if(!actual)continue; // synthetic registry probes are rejected above
   if(!same(row.chromePermissions,actual.requiredChromePermissions))
     errors.push('Chrome permission drift '+op);
   if(!same(row.toolCapabilities,actual.requiredCapabilities))
     errors.push('Tool capability drift '+op);
 }
 for(const a of matrix.approvedOperations.filter(x=>x.visibility==='HOST_ONLY_TRUSTED_COOKIE_UI'))
   if(!a.id.startsWith('browser.cookies.')||registered.includes(a.id))
     errors.push('Trusted Cookie leaked into installed sandbox '+a.id);
 const approved=matrix.approvedOperations;
 const count=label=>approved.filter(x=>x.visibility===label).length;
 const counts=matrix.counts??{};
 for(const [name,value] of Object.entries({
   approvedOperations:approved.length,
   approvedRegistered:count('APPROVED_TOOL_REGISTERED'),
   approvedCookieHostOnly:count('HOST_ONLY_TRUSTED_COOKIE_UI'),
   approvedPlannedNew:count('APPROVED_TOOL_PLANNED')+count('BUILTIN_HOST_ONLY_DESIGN_APPROVED'),
   nativeMappedApproved:matrix.nativeInterfaces.filter(x=>x.approvedOperationIds?.length>0).length,
   approvedWithInputAndOutputSchemas:approved.filter(x=>x.inputSchema&&x.outputSchema).length
 }))if(counts[name]!==value)errors.push('Approved coverage count drift '+name);
 if(matrix.coverageAudit?.registeredOperations!==counts.approvedRegistered||
    matrix.coverageAudit?.trustedCookieHostOperations!==counts.approvedCookieHostOnly||
    matrix.coverageAudit?.approvedNewDesignOperations!==counts.approvedPlannedNew||
    matrix.coverageAudit?.approvedTotal!==counts.approvedOperations)
   errors.push('Coverage audit still uses a historical SDK denominator');
 return errors;
}
export async function checkBrowserSdkInterfaceMatrix(root=ROOT){
 const matrix=JSON.parse(await readFile(resolve(root,'docs/api/browser-sdk-interface-matrix.json'),'utf8'));
 const errors=inspectBrowserSdkInterfaceMatrix(matrix);
 if(errors.length)throw Error(errors.join('\n'));
 return {ok:true,sourceFiles:matrix.sourceFiles.length,
   nativeDiscovered:matrix.nativeInterfaces.length,approved:matrix.approvedOperations.length,
   callableRegistry:Object.keys(BROWSER_OPERATIONS).length,
   sourceHashMetadataChecked:true,upstreamSourceBytesReparsed:false,nativeChrome:'NOT_TESTED'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 checkBrowserSdkInterfaceMatrix().then(value=>console.log(JSON.stringify(value)),error=>{
   console.error('Browser SDK frozen matrix check failed:\n'+error.message);process.exitCode=1;
 });
}
