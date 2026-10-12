#!/usr/bin/env node
// Documentation validation only. Do not import this into extension runtime.
import {readFile} from 'node:fs/promises';
import {BROWSER_OPERATIONS} from '../src/framework/sdk/browser-contract.js';
const read=path=>readFile(path,'utf8');
const fail=msg=>{throw Error('Four-layer Browser ledger drift: '+msg)};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function parseCandidates(md){
 const result=[];let current=null;
 for(const line of md.split(/\r?\n/)){
  const h=line.match(/^### (.+?) · (P[012]) · ([A-Z_]+)/);
  if(h){current={group:h[1],priority:h[2],trust:h[3]};continue}
  if(line.startsWith('### '))current=null;
  const item=line.match(/^- \x60OpenDeskSDK\.(browser\.[A-Za-z.]+)\(\)\x60/);
  if(item){if(!current)fail('candidate group missing '+item[1]);result.push({id:item[1],...current});}
 }
 return result;
}
async function main(){
 const [ledger,acceptance,inventory,manifest,human]=await Promise.all([
  read('docs/framework/workstreams/browser-framework-four-layer-ledger.json').then(JSON.parse),
  read('docs/framework/workstreams/browser-sdk-acceptance.json').then(JSON.parse),
  read('docs/api/browser-sdk-full-interface-inventory.zh-CN.md'),
  read('manifest.json').then(JSON.parse),read('docs/api/browser-framework-four-layer-ledger.zh-CN.md')
 ]);
 if(ledger.schemaVersion!=='opendesk.browser-framework.four-layer.v1'||ledger.readOnly!==true)fail('schema/authority');
 if(!equal(ledger.layers.map(x=>x.id),['layer1','layer2','layer3','layer4']))fail('four layers');
 if(Number(ledger.source.minChrome)!==Number(manifest.minimum_chrome_version))fail('Chrome version');
 const formal=Object.keys(BROWSER_OPERATIONS),proposals=parseCandidates(inventory);
 if(!equal(formal.slice().sort(),ledger.formal.map(x=>x.id).sort())||
  formal.length!==acceptance.operations.length)fail('registered operations');
 for(const operation of ledger.formal){
  const row=acceptance.operations.find(x=>x.api===operation.id),op=BROWSER_OPERATIONS[operation.id];
  if(!row||!op)fail('formal row missing '+operation.id);
  if(operation.layer3.status!==op.implementation||
   operation.layer3.exposure!==row.exposure||
   !equal(operation.layer3.capabilities,row.toolCapabilities)||
   !equal(operation.layer3.chromePermissions,row.chromePermissions)||
   operation.layer3.siteScope!==row.siteScope)fail('SDK metadata '+operation.id);
  if(operation.layer4.positive!==row.positiveTest.status||
   operation.layer4.denial!==row.denialTest.status||
   operation.layer4.macChrome!==row.nativeChrome.status||
   operation.layer4.callableNow!==row.callableNowVerification)fail('false acceptance '+operation.id);
 }
 if(proposals.length!==ledger.candidateCatalog.length||
    new Set(proposals.map(x=>x.id)).size!==proposals.length)fail('candidate total/duplicates');
 for(const candidate of proposals){
  const row=ledger.candidateCatalog.find(x=>x.id===candidate.id),promoted=formal.includes(candidate.id);
  if(!row||row.group!==candidate.group||row.priority!==candidate.priority||row.trust!==candidate.trust||
   row.layer3.status!==(promoted?'PROMOTED_TO_FORMAL':'PROPOSED_NOT_REGISTERED'))fail('candidate '+candidate.id);
  if(!promoted&&(row.layer4.macChrome!=='NOT_TESTED'||row.layer4.positive!=='NOT_TESTED'||row.layer4.denial!=='NOT_TESTED'))
   fail('candidate acceptance '+candidate.id);
  if(candidate.id.startsWith('browser.cookies.')&&!promoted&&
    (row.layer2.status!=='PARTIAL_DRIVER_ONLY'||row.trust!=='BUILTIN_TRUSTED'))fail('Cookie boundary '+candidate.id);
 }
 const promoted=proposals.filter(x=>formal.includes(x.id)),remaining=proposals.length-promoted.length;
 for(const g of ledger.candidateGroups){
  const group=proposals.filter(x=>x.group===g.name);
  if(group.length!==g.original||group.filter(x=>formal.includes(x.id)).length!==g.promoted||
     group.length-g.promoted!==g.pending)fail('group '+g.name);
 }
 const c={formal:formal.length,implemented:formal.filter(x=>BROWSER_OPERATIONS[x].implementation==='IMPLEMENTED').length,
  planned:formal.filter(x=>BROWSER_OPERATIONS[x].implementation==='PLANNED').length,
  notExposed:formal.filter(x=>BROWSER_OPERATIONS[x].implementation==='NOT_EXPOSED').length,
  candidateGroups:ledger.candidateGroups.length,originalCandidates:proposals.length,promoted:promoted.length,
  pending:remaining,uniqueNamedMethods:formal.length+remaining,
  cookieSdkFormal:formal.filter(x=>x.startsWith('browser.cookies.')).length,
  cookieCandidates:proposals.filter(x=>x.id.startsWith('browser.cookies.')).length,
  formalNativePass:acceptance.operations.filter(x=>x.nativeChrome.status==='PASS').length,
  supplementalAuditDomains:ledger.supplementalAudits.length};
 if(!equal(c,ledger.counts))fail('counts');
 if(ledger.firstPriority.name!=='Cookies'||ledger.firstPriority.items.length!==c.cookieCandidates)fail('Cookie priority');
 if(new Set(ledger.supplementalAudits.map(x=>x.id)).size!==ledger.supplementalAudits.length||
   ledger.supplementalAudits.some(x=>x.layer3.status!=='AUDIT_ONLY_NOT_REGISTERED'))fail('supplemental rights');
 if(!human.includes('Cookies 全部 10 项')||!human.includes('35 项正式')||
  !human.includes('原始 27 组'))fail('human-readable sections');
 console.log(JSON.stringify({ok:true,...c}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
