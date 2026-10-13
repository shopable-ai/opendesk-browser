#!/usr/bin/env node
// Browser SDK acceptance guard: the registry is authoritative; the ledger never grants APIs.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BROWSER_OPERATIONS,normalizeBrowserOperation} from '../src/framework/sdk/browser-contract.js';
import {createBrowserSdk} from '../src/framework/sdk/browser.js';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const VALID=new Set(['PASS','FAIL','BLOCKED','NOT_TESTED']);
const FIELDS=['positiveTest','denialTest','nativeChrome'];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function inspectBrowserSdkLedger(data){
 const errors=[],keys=Object.keys(BROWSER_OPERATIONS),seen=new Set();
 if(data?.schemaVersion!=='opendesk.browser-sdk.acceptance.v1'||data.sourceOfTruth!=='src/framework/sdk/browser-contract.js')
  errors.push('wrong ledger version or source of truth');
 if(!Array.isArray(data?.operations))return [...errors,'missing operations'];
 if(data.operations.length!==keys.length)errors.push('API count mismatch');
 for(const row of data.operations){
  const id=row?.api,op=BROWSER_OPERATIONS[id];
  if(!op||seen.has(id)){errors.push('unknown/duplicate '+id);continue}
  seen.add(id);
  if(row.implementation!==op.implementation)errors.push(id+': false implementation');
  for(const [field,val] of [['apiVersion',op.apiVersion],['module',op.namespace],
    ['siteScope',op.siteScope],['chromePermissions',op.requiredChromePermissions],
    ['toolCapabilities',op.requiredCapabilities]])
   if(!same(row[field],val))errors.push(id+': metadata drift '+field);
  if(op.inputSchema?.type!=='object'||!['object','array'].includes(op.outputSchema?.type))
   errors.push(id+': typed contract missing');
  if(op.implementation==='IMPLEMENTED'&&(!row.hostImplementation||!row.sdkEntry))
   errors.push(id+': missing public Host or wrapper');
  if(op.implementation!=='IMPLEMENTED'&&row.sdkEntry!==null)errors.push(id+': unsafe public exposure');
  if(op.implementation==='NOT_EXPOSED'&&row.exposure!=='NOT_EXPOSED')errors.push(id+': excluded API exposed');
  for(const field of FIELDS){
   const check=row[field];
   if(!VALID.has(check?.status))errors.push(id+': invalid '+field);
   if(check?.status==='PASS'&&!check.evidence?.length)errors.push(id+': PASS without evidence');
  }
  if(row.callableNowVerification==='PASS'&&
    (op.implementation!=='IMPLEMENTED'||row.positiveTest.status!=='PASS'||row.denialTest.status!=='PASS'))
   errors.push(id+': unverified callableNow');
  if(op.implementation==='PLANNED'){
   try{normalizeBrowserOperation(id,{});errors.push(id+': PLANNED is executable')}
   catch(e){if(e?.code!=='E_SERVICE_UNSUPPORTED')errors.push(id+': wrong denial code')}
  }
 }
 for(const name of keys)if(!seen.has(name))errors.push('missing '+name);
 for(const gate of ['nodeTests','check','buildProduction','buildDevelopment','buildSize','verify','nativeChromeGui','nativeChromeWorker'])
  if(!VALID.has(data.candidateChecks?.[gate]?.status))errors.push('invalid candidate gate '+gate);
 for(const [name,v] of Object.entries(data.candidateChecks||{}))
  if(v.status==='PASS'&&!v.evidence?.length)errors.push(name+': unproven PASS');
 for(const phase of ['R1.3','R2','R3','R4']){
  if(!VALID.has(data.phases?.[phase]?.status))errors.push('missing phase '+phase);
  if(data.phases?.[phase]?.status==='PASS'&&Object.values(data.candidateChecks||{}).some(x=>x.status!=='PASS'))
   errors.push('premature phase PASS '+phase);
 }
 return errors;
}
export async function checkBrowserSdk({root=ROOT}={}){
 const data=JSON.parse(await readFile(resolve(root,'docs/framework/workstreams/browser-sdk-acceptance.json'),'utf8'));
 const errors=inspectBrowserSdkLedger(data);
 const md=await readFile(resolve(root,'docs/framework/workstreams/browser-sdk-status.md'),'utf8');
 const mark=String.fromCharCode(96);
 for(const row of data.operations){
  const expected='| '+mark+row.api+mark+' | '+row.implementation+' | '+row.exposure+' | '+
   row.positiveTest.status+' | '+row.denialTest.status+' | '+row.nativeChrome.status+' |';
  if(!md.includes(expected))errors.push('Markdown drift '+row.api);
 }
 // Only R1.3 public wrapper plumbing; this is never native acceptance.
 const sdk=createBrowserSdk({request:async()=>({ok:true})});
 const probes=[
  ()=>sdk.capabilities.list(),()=>sdk.capabilities.getStatus({operation:'browser.capabilities.list'}),
  ()=>sdk.contextMenu.getStatus(),()=>sdk.contextMenu.register({actionIds:['approved-action']}),
  ()=>sdk.contextMenu.unregister(),()=>sdk.launch.consume(),()=>sdk.page.getContext(),
  ()=>sdk.page.getSelection(),()=>sdk.clipboard.writeText('note'),
  ()=>sdk.downloads.text({text:'note',filename:'note.md'}),
  ()=>sdk.tabs.create({url:'https://example.org'}),()=>sdk.tabs.activateOwned({tabRef:'r'.repeat(32)}),
  ()=>sdk.tabs.getOwned({tabRef:'r'.repeat(32)}),()=>sdk.tabs.listOwned(),
  ()=>sdk.tabs.pinOwned({tabRef:'r'.repeat(32),pinned:true}),
  ()=>sdk.tabs.reloadOwned({tabRef:'r'.repeat(32)}),
  ()=>sdk.tabs.navigateOwned({tabRef:'r'.repeat(32),url:'https://example.org/next'}),
  ()=>sdk.tabs.removeOwned({tabRef:'r'.repeat(32)}),
  ()=>sdk.sidePanel.openSelf(),()=>sdk.network.request({method:'GET',url:'https://example.org'}),
  ()=>sdk.network.observe.start({tabRef:'r'.repeat(32),origins:['https://example.org']}),
  ()=>sdk.network.observe.getStatus({observationId:'r'.repeat(32)}),
  ()=>sdk.network.observe.stop({observationId:'r'.repeat(32)}),
  ()=>sdk.network.observe.export({observationId:'r'.repeat(32),format:'json'}),
  ()=>sdk.events.read({sessionRef:'r'.repeat(32)}),
  ()=>sdk.events.close({sessionRef:'r'.repeat(32)}),
  ()=>sdk.operations.getStatus({operationId:'r'.repeat(32)}),
  ()=>sdk.operations.cancel({operationId:'r'.repeat(32)}),
  ()=>sdk.screenshot.captureVisible({tabRef:'r'.repeat(32)})
 ];
 for(const probe of probes)try{await probe()}catch(e){errors.push('wrapper probe: '+(e.code||e.message))}
 const evidence=[];
 for(const op of data.operations)for(const field of FIELDS)evidence.push(op[field]);
 for(const v of Object.values(data.candidateChecks||{}))evidence.push(v);
 for(const gate of evidence)if(gate?.status==='PASS')for(const item of gate.evidence||[]){
  const path=item?.path;
  if(typeof path!=='string'||path.startsWith('/')||path.split('/').includes('..')||
   !(/^[a-f0-9]{64}$/.test(item.sha256||''))||!item.candidateSha||!item.caseId||!item.command||!item.environment){
   errors.push('Malformed PASS evidence');continue
  }
  const content=await readFile(resolve(root,path)).catch(()=>null);
  if(!content||createHash('sha256').update(content).digest('hex')!==item.sha256)errors.push('Evidence hash mismatch');
 }
 if(errors.length)throw new Error(errors.join('\n'));
 return {ok:true,operations:data.operations.length,states:data.summary.implementationCounts};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 checkBrowserSdk().then(x=>console.log(JSON.stringify(x)),e=>{
  console.error('Browser SDK coverage failed:\n'+e.message);process.exitCode=1;
 });
}
