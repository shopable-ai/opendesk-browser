#!/usr/bin/env node
// Documentation validation only. Do not import this into extension runtime.
import {readFile,writeFile} from 'node:fs/promises';
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
function countsFor(ledger,acceptance,formal,proposals){
 const promoted=proposals.filter(x=>formal.includes(x.id)),remaining=proposals.length-promoted.length;
 return {formal:formal.length,implemented:formal.filter(x=>BROWSER_OPERATIONS[x].implementation==='IMPLEMENTED').length,
  planned:formal.filter(x=>BROWSER_OPERATIONS[x].implementation==='PLANNED').length,
  notExposed:formal.filter(x=>BROWSER_OPERATIONS[x].implementation==='NOT_EXPOSED').length,
  candidateGroups:ledger.candidateGroups.length,originalCandidates:proposals.length,promoted:promoted.length,
  pending:remaining,uniqueNamedMethods:formal.length+remaining,
  cookieSdkFormal:formal.filter(x=>x.startsWith('browser.cookies.')).length,
  cookieCandidates:proposals.filter(x=>x.id.startsWith('browser.cookies.')).length,
  formalNativePass:acceptance.operations.filter(x=>x.nativeChrome.status==='PASS').length,
  supplementalAuditDomains:ledger.supplementalAudits.length};
}
function currentSummary(c){
 return `<!-- browser-framework-current:start -->\n当前四层账本：${c.formal} 项正式 / ${c.implemented} 项 SOURCE_WIRED；Cookies ${c.cookieSdkFormal} 项；原始 ${c.candidateGroups} 组 ${c.originalCandidates} 候选中 ${c.promoted} 项同名晋级、${c.pending} 项未登记。同候选原生 PASS ${c.formalNativePass} 项；各项原始证据见正式验收账本，源码接线不提升 Node、Build 或 Native 状态。\n<!-- browser-framework-current:end -->`;
}
async function main(){
 const [ledger,acceptance,inventory,manifest,humanInput,matrix]=await Promise.all([
  read('docs/framework/workstreams/browser-framework-four-layer-ledger.json').then(JSON.parse),
  read('docs/framework/workstreams/browser-sdk-acceptance.json').then(JSON.parse),
  read('docs/api/browser-sdk-full-interface-inventory.zh-CN.md'),
  read('manifest.json').then(JSON.parse),read('docs/api/browser-framework-four-layer-ledger.zh-CN.md'),
  read('docs/api/browser-sdk-interface-matrix.json').then(JSON.parse)
 ]);
 if(ledger.schemaVersion!=='opendesk.browser-framework.four-layer.v1'||ledger.readOnly!==true)fail('schema/authority');
 if(!equal(ledger.layers.map(x=>x.id),['layer1','layer2','layer3','layer4']))fail('four layers');
 if(Number(ledger.source.minChrome)!==Number(manifest.minimum_chrome_version))fail('Chrome version');
 const formal=Object.keys(BROWSER_OPERATIONS),proposals=parseCandidates(inventory);
 const decisions=new Map((matrix.candidateExecutionDecisions??[]).map(row=>[row.id,row]));
 const pending=proposals.filter(row=>!formal.includes(row.id));
 if(decisions.size!==pending.length||(matrix.candidateExecutionDecisions??[]).length!==pending.length||
    pending.some(row=>!decisions.has(row.id)))fail('candidate execution decisions must cover each unregistered historical name');
 for(const row of decisions.values()){
   if(row.status!=='CANDIDATE'||!['DIRECT_CANDIDATE','SCOPED','COMPOSED','EXISTING_SERVICE','HOST_ONLY','DENIED'].includes(row.executionMode)||
      !row.reason||!row.nextStep||!row.owner||
      row.canonicalTarget&&!formal.includes(row.canonicalTarget))fail('invalid candidate execution decision '+row.id);
 }
 const executionFor=id=>formal.includes(id)?{status:'APPROVED',executionMode:matrix.approvedOperations.find(row=>row.id===id).mappingKind}:decisions.get(id);
 let human=humanInput;
 if(process.argv.includes('--write')){
  if(!equal(formal.slice().sort(),acceptance.operations.map(x=>x.api).sort()))fail('acceptance registry mismatch; repair the acceptance contract first');
  ledger.formal=formal.map(id=>{
   const row=acceptance.operations.find(x=>x.api===id),approved=matrix.approvedOperations.find(x=>x.id===id);
   const previous=ledger.formal.find(x=>x.id===id),candidate=proposals.find(x=>x.id===id);
   if(!approved||approved.visibility!=='APPROVED_TOOL_REGISTERED'||!row.hostImplementation)fail('unwired approved operation '+id);
   const files=[...new Set(row.hostImplementation.split(' → ').map(x=>x.split('#')[0].trim()))];
   return {id,inventory:'FORMAL',layer1:previous?.layer1??{api:approved.nativeApis.join(' + '),status:'CHROME_REFERENCE_NOT_NATIVE_PASS'},
    layer2:{status:'SOURCE_WIRED',files},layer3:{status:BROWSER_OPERATIONS[id].implementation,
     exposure:row.exposure,capabilities:row.toolCapabilities,chromePermissions:row.chromePermissions,siteScope:row.siteScope},
    layer4:{positive:row.positiveTest.status,denial:row.denialTest.status,macChrome:row.nativeChrome.status,
     callableNow:row.callableNowVerification,evidenceLedger:'docs/framework/workstreams/browser-sdk-acceptance.json'},
    candidateOrigin:candidate?.group??null};
  });
  for(const candidate of ledger.candidateCatalog){
   const current=ledger.formal.find(x=>x.id===candidate.id);
   candidate.layer3.status=current?'PROMOTED_TO_FORMAL':'PROPOSED_NOT_REGISTERED';
   candidate.execution=executionFor(candidate.id);
   if(current){candidate.layer2=current.layer2;candidate.layer4=current.layer4;}
  }
  for(const group of ledger.candidateGroups){
   group.promoted=proposals.filter(x=>x.group===group.name&&formal.includes(x.id)).length;
   group.pending=group.original-group.promoted;
  }
  ledger.counts=countsFor(ledger,acceptance,formal,proposals);
  const summary=currentSummary(ledger.counts),pattern=/<!-- browser-framework-current:start -->[\s\S]*?<!-- browser-framework-current:end -->/;
  human=pattern.test(human)?human.replace(pattern,summary):summary+'\n\n'+human;
 }
 if(!equal(formal.slice().sort(),ledger.formal.map(x=>x.id).sort())||
  formal.length!==acceptance.operations.length)fail('registered operations');
 for(const operation of ledger.formal){
  const row=acceptance.operations.find(x=>x.api===operation.id),op=BROWSER_OPERATIONS[operation.id];
  if(!row||!op)fail('formal row missing '+operation.id);
  if(operation.layer2.status!=='SOURCE_WIRED'||!Array.isArray(operation.layer2.files)||!operation.layer2.files.length)
    fail('registered operation lacks an actual Host implementation '+operation.id);
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
  if(!equal(row?.execution,executionFor(candidate.id)))fail('candidate execution classification drift '+candidate.id);
  if(!row||row.group!==candidate.group||row.priority!==candidate.priority||row.trust!==candidate.trust||
   row.layer3.status!==(promoted?'PROMOTED_TO_FORMAL':'PROPOSED_NOT_REGISTERED'))fail('candidate '+candidate.id);
  if(!promoted&&(row.layer4.macChrome!=='NOT_TESTED'||row.layer4.positive!=='NOT_TESTED'||row.layer4.denial!=='NOT_TESTED'))
   fail('candidate acceptance '+candidate.id);
  if(candidate.id.startsWith('browser.cookies.')){
   if(row.trust!=='BUILTIN_TRUSTED')fail('historical Cookie candidate trust '+candidate.id);
   if(promoted&&row.layer2.status!=='SOURCE_WIRED')fail('promoted Cookie must have a real Host '+candidate.id);
   if(!promoted&&row.layer2.status!=='PARTIAL_DRIVER_ONLY')fail('unimplemented Cookie candidate '+candidate.id);
  }
 }
 const promoted=proposals.filter(x=>formal.includes(x.id)),remaining=proposals.length-promoted.length;
 for(const g of ledger.candidateGroups){
  const group=proposals.filter(x=>x.group===g.name);
  if(group.length!==g.original||group.filter(x=>formal.includes(x.id)).length!==g.promoted||
     group.length-g.promoted!==g.pending)fail('group '+g.name);
 }
 const c=countsFor(ledger,acceptance,formal,proposals);
 if(!equal(c,ledger.counts))fail('counts');
 if(ledger.firstPriority.name!=='Cookies'||ledger.firstPriority.items.length!==c.cookieCandidates)fail('Cookie priority');
 if(new Set(ledger.supplementalAudits.map(x=>x.id)).size!==ledger.supplementalAudits.length||
   ledger.supplementalAudits.some(x=>x.layer3.status!=='AUDIT_ONLY_NOT_REGISTERED'))fail('supplemental rights');
 if(!human.includes(currentSummary(c))||!human.includes('Cookies 全部 10 项')||
  !human.includes('原始 27 组'))fail('human-readable sections');
 if(process.argv.includes('--write')){
  await writeFile('docs/framework/workstreams/browser-framework-four-layer-ledger.json',JSON.stringify(ledger,null,2)+'\n');
  await writeFile('docs/api/browser-framework-four-layer-ledger.zh-CN.md',human);
 }
 console.log(JSON.stringify({ok:true,...c}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
