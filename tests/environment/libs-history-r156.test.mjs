import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {HISTORICAL_LIBRARY_SOURCES,HISTORICAL_DECISIONS_PATH,
 scanLibrarySourceLines,inspectHistoricalLibraryUsage} from '../../scripts/libs-history-audit.mjs';
const root='docs/contracts/source-snapshots/scrapyJsChrome';
async function fixture(run){
 const cwd=await mkdtemp(join(tmpdir(),'r156-libs-'));
 const put=async(path,data)=>{const f=join(cwd,path);await mkdir(dirname(f),{recursive:true});await writeFile(f,data);};
 const names=Object.values(HISTORICAL_LIBRARY_SOURCES);
 try{
  for(const [id,file] of Object.entries(HISTORICAL_LIBRARY_SOURCES))await put(root+'/assets/js/libs/'+file,'/* old '+id+' */');
  const entries=names.slice(0,6).map(s=>'assets/js/libs/'+s).concat(Array.from({length:11},(_,i)=>'assets/js/core/x'+i+'.js'));
  await put(root+'/background-sw.js','const BACKGROUND_SCRIPTS = '+JSON.stringify(entries)+';\nimportScripts(...BACKGROUND_SCRIPTS);');
  await put(root+'/manifest.json',JSON.stringify({content_scripts:[{js:['assets/js/libs/axios.min.js']}]}));
  await put(root+'/my-content-script.js',"appendScript(chrome.runtime.getURL('assets/js/libs/crypto-js.min.js'));\n// appendScript(chrome.runtime.getURL('assets/js/libs/cheerio.1.0.0.min.js'));\n");
  const rows=Object.entries(HISTORICAL_LIBRARY_SOURCES).map(([id,file])=>({id,file,decision:'UNVERIFIED',reason:'Historic dependencies require future review',currentEvidence:['test']})); 
  await put(HISTORICAL_DECISIONS_PATH,JSON.stringify({format:'opendesk.historical-library-decisions.r156.v1',rows}));
  await put('src/main.js',"export const today = new Date();\n");
  await run({cwd,put});
 }finally{await rm(cwd,{recursive:true,force:true});}
}
test('R15.6 inventories fifteen historical snapshots, 17 Background scripts and distinct worlds',async()=>{
 await fixture(async({cwd})=>{
  const r=await inspectHistoricalLibraryUsage({cwd});
  assert.equal(r.status,'SOURCE_PASS',r.issues.join('\n'));
  assert.equal(r.historicalAssetCount,15);
  assert.equal(r.historicalBackgroundEntries,17);
  assert(r.rows.find(x=>x.id==='axios').oldWorlds.some(x=>x.world==='BACKGROUND'));
  assert(r.rows.find(x=>x.id==='axios').oldWorlds.some(x=>x.world==='ISOLATED'));
  assert(r.rows.find(x=>x.id==='cryptojs').oldWorlds.some(x=>x.world==='MAIN'));
  assert(!r.rows.find(x=>x.id==='cheerio').oldWorlds.some(x=>x.world==='MAIN'));
 });
});
test('R15.6 reports live old paths with file lines and API differences without requiring legacy libs installed',async()=>{
 const source='// assets/js/libs/axios.min.js\nconst a="runtime/builtin-libraries/page-core.js";\n'+
  "const b='src/vendor/jquery-3.7.1.min.js';\n"+'const c=_.map([1],x=>x);\ndayjs.extend(plugin);';
 const hit=scanLibrarySourceLines('src/a.js',source);
 assert.deepEqual(hit.issues.map(x=>x.line),[2,3]);
 assert.deepEqual(hit.apiReviews.map(x=>x.method),['map','extend']);
 await fixture(async({cwd,put})=>{
  await put('src/main.js',source);
  const r=await inspectHistoricalLibraryUsage({cwd});
  assert.equal(r.status,'SOURCE_FAIL');
  assert(r.issues.some(x=>x.includes('src/main.js:2:')&&x.includes('OBSOLETE_BUILTIN_PATH')));
 });
});
test('R15.6 rejects missing historical decision, unapproved snapshot, and source symlink',async()=>{
 await fixture(async({cwd,put})=>{
  const file=join(cwd,HISTORICAL_DECISIONS_PATH),ledger=JSON.parse(await readFile(file));
  ledger.rows.pop();
  await put(HISTORICAL_DECISIONS_PATH,JSON.stringify(ledger));
  await put(root+'/assets/js/libs/unreviewed.js','bad');
  const r=await inspectHistoricalLibraryUsage({cwd});
  assert(r.issues.some(x=>x.includes('decision missing')));
  assert(r.issues.some(x=>x.includes('unreviewed historical file')));
 });
 await fixture(async({cwd})=>{
  await symlink(join(cwd,'src/main.js'),join(cwd,'src/bad.js'));
  const r=await inspectHistoricalLibraryUsage({cwd});
  assert(r.issues.some(x=>x.includes('src/bad.js:1:1 live source symlink forbidden')));
 });
});
