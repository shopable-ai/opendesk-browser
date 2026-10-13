import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {BROWSER_OPERATIONS} from '../../src/framework/sdk/browser-contract.js';
test('four-layer browser ledger reconciles current Registry, candidate list, Cookie priority and acceptance',()=>{
 const run=spawnSync(process.execPath,['scripts/check-browser-framework-ledger.mjs','--check'],{
  cwd:process.cwd(),encoding:'utf8',timeout:30000
 });
 assert.equal(run.status,0,run.stderr||run.stdout);
 const result=JSON.parse(run.stdout.trim());
 assert.equal(result.ok,true);assert.equal(result.formal,Object.keys(BROWSER_OPERATIONS).length);
 const ledger=JSON.parse(readFileSync('docs/framework/workstreams/browser-framework-four-layer-ledger.json','utf8'));
 assert.equal(result.promoted,ledger.candidateCatalog.filter(row=>Object.hasOwn(BROWSER_OPERATIONS,row.id)).length);
 assert.equal(result.originalCandidates,114);assert.equal(result.pending,result.originalCandidates-result.promoted);
 assert.equal(result.cookieSdkFormal,Object.keys(BROWSER_OPERATIONS).filter(id=>id.startsWith('browser.cookies.')).length);
 assert.equal(result.cookieSdkFormal,11,'Cookies must be reflected in current formal ledger');assert.equal(result.cookieCandidates,10);
 const acceptance=JSON.parse(readFileSync('docs/framework/workstreams/browser-sdk-acceptance.json','utf8'));
 assert.equal(result.formalNativePass,acceptance.operations.filter(row=>row.nativeChrome.status==='PASS').length);
});
test('four-layer check rejects a missing operation and forged native acceptance without mutating evidence',()=>{
 const directory=mkdtempSync(join(tmpdir(),'browser-ledger-drift-'));
 const paths=['docs/framework/workstreams/browser-framework-four-layer-ledger.json',
  'docs/framework/workstreams/browser-sdk-acceptance.json','docs/api/browser-sdk-full-interface-inventory.zh-CN.md',
  'docs/api/browser-sdk-interface-matrix.json','docs/api/browser-framework-four-layer-ledger.zh-CN.md','manifest.json'];
 try{
  for(const path of paths){mkdirSync(dirname(join(directory,path)),{recursive:true});writeFileSync(join(directory,path),readFileSync(path));}
  const path=join(directory,paths[0]),original=readFileSync(path,'utf8'),ledger=JSON.parse(original);
  ledger.formal.pop();writeFileSync(path,JSON.stringify(ledger));
  const check=()=>spawnSync(process.execPath,[resolve('scripts/check-browser-framework-ledger.mjs'),'--check'],{cwd:directory,encoding:'utf8',timeout:30000});
  const missing=check();assert.equal(missing.status,1);assert.match(missing.stderr,/registered operations/);
  const forged=JSON.parse(original);forged.formal[0].layer4.macChrome='PASS';writeFileSync(path,JSON.stringify(forged));
  const denied=check();assert.equal(denied.status,1);assert.match(denied.stderr,/false acceptance/);
  assert.equal(JSON.parse(readFileSync(path,'utf8')).formal[0].layer4.macChrome,'PASS','check is read-only');
 }finally{rmSync(directory,{recursive:true,force:true});}
});
test('supplemental reference domains stay audit-only and Cookie is first priority',()=>{
 const data=JSON.parse(readFileSync('docs/framework/workstreams/browser-framework-four-layer-ledger.json','utf8'));
 assert.equal(data.firstPriority.name,'Cookies');
 assert(data.supplementalAudits.length>=20);
 assert(data.supplementalAudits.every(x=>x.layer3.status==='AUDIT_ONLY_NOT_REGISTERED'));
 assert.equal(new Set(data.candidateCatalog.map(x=>x.id)).size,114);
 assert.equal(data.candidateCatalog.filter(x=>x.id.startsWith('browser.cookies.')).length,10);
});
