import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createValueCodec} from '../../../../src/platform/page-port/codec.js';
const root='/Users/shopme/Documents/workspace/opendesk-browser';
const out=`${root}/docs/framework/evidence/f2-shared-codec`;
const owned=['src/platform/page-port/codec.js','src/framework/control/value.js','src/scripting/user-scripts/page-evaluator.js','tests/framework/k2-shared-codec.test.mjs'];
const originals=['tests/framework/k2-codec.test.mjs','tests/framework/k3-page-evaluator.test.mjs','tests/framework/k3-context.test.mjs','tests/framework/k3-native-driver.test.mjs','tests/framework/k3-controller-authority.test.mjs'];
async function hashes(files){const result=[];for(const path of files){const bytes=await readFile(`${root}/${path}`);result.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}return result;}
const commands=[
  {name:'targeted',args:['--test','--test-reporter=tap',...owned.filter(path=>path.endsWith('.test.mjs')),...originals]},
  {name:'syntax',args:['--check','src/platform/page-port/codec.js']},
  {name:'syntax-control',args:['--check','src/framework/control/value.js']},
  {name:'syntax-generated',args:['--check','src/scripting/user-scripts/page-evaluator.js']},
  {name:'source-check',program:'npm',args:['run','check']}
];
const checks=[];
for(const command of commands){
  const before=await hashes([...owned,...originals]);
  const run=spawnSync(command.program||process.execPath,command.args,{cwd:root,encoding:'utf8',timeout:60000});
  const after=await hashes([...owned,...originals]);
  const log=`${command.name}.log`;await writeFile(`${out}/${log}`,(run.stdout||'')+(run.stderr||''));
  const drift=before.filter((file,index)=>JSON.stringify(file)!==JSON.stringify(after[index]));
  checks.push({command:[command.program||'node',...command.args].join(' '),cwd:root,exit:run.status,signal:run.signal,error:run.error?.message,log,before,after,drift});
  console.log(JSON.stringify({check:command.name,exit:run.status,sourceDrift:drift.length,log}));
}
const sourceFiles=await hashes(owned);
const report={at:new Date().toISOString(),requestedModel:'gpt-6.1-sol',requestedEffort:'xhigh',resolvedModel:'unknown',resolvedEffort:'unknown',sourceFiles,
  factorySourceSha256:createHash('sha256').update(createValueCodec.toString()).digest('hex'),checks,
  originalRed:JSON.parse(await readFile(`${out}/original-red.json`,'utf8')),
  foreignRealmRegression:{mainOriginalRed:'main-depth-original-9fail.tap',ownOriginalRed:'foreign-wire-red.log',ownOriginalRedExit:1,fixtureReturnsRawVMResult:true,originalAuthorityAssertionsUnchanged:true},
  readyForMainIntegration:checks.every(check=>check.exit===0&&check.drift.length===0),
  scopeFrozen:true,productPackageRebuilt:false,packageHashFrozen:false,nativeBrowsersLaunched:0,
  nativeOpaqueWorkerPassed:false,nativeUserScriptsPassed:false,
  nativeFollowup:'Main global launcher: same-source dual product packages and actual opaque Worker/userScripts qualification required.',
  F3:false,original603:false};
await writeFile(`${out}/verification.json`,JSON.stringify(report,null,2)+'\n');
if(!report.readyForMainIntegration)process.exitCode=1;
