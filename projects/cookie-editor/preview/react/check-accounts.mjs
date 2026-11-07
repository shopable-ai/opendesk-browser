#!/usr/bin/env node
// A small selector around the existing Node and Chromium gates, not a second UI runner.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,rename,access} from 'node:fs/promises';
import {watch} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=fileURLToPath(new URL('.',import.meta.url)),repo=resolve(here,'../../../..');
const own='projects/cookie-editor/';
const format='opendesk.cookie-account-ui-check.v1';
const selection='^account layout spacing and receive return$';
const pattern='official shared design compiles|R3.2 approved HTML|preview mounts the actual App|sharing preview refuses|R3.2 market and account invite|R3.7 dev serves|account check reuse|only a successful current-source|account UI checks accept';
const nodeTests=['tests/environment/cookie-editor-react-design.test.mjs',
 own+'preview/react/preview.test.mjs',own+'tests/account-ui-check.test.mjs'];
const localChecks=[own+'preview/react/check-accounts.mjs',own+'preview/react/chromium.mjs',
 own+'preview/react/package.json',own+'preview/react/package-lock.json',
 own+'trusted/account-contract.js',...nodeTests];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const run=promisify(execFile);
export const checkKey=inputs=>digest(JSON.stringify(inputs));
export const canReuse=(receipt,key)=>receipt?.format===format&&receipt.status==='PASS'&&
 receipt.mode==='CURRENT_SOURCE_DEV'&&receipt.key===key;
export function validateDevUrl(value){
 const url=new URL(value);
 assert.ok(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&
  url.pathname==='/dev.html'&&!url.username&&!url.password&&!url.search&&!url.hash,
 'Use the existing loopback /dev.html preview');
 return url;
}
async function sourceReceipt(url){
 const response=await fetch(new URL('/dev-source.json',url),{signal:AbortSignal.timeout(10000)});
 assert.ok(response.ok,'Preview source receipt HTTP '+response.status);
 const value=await response.json();
 assert.equal(value.mode,'CURRENT_SOURCE_DEV');assert.equal(value.generatedHtmlUsed,false);
 assert.ok(value.inputs&&Object.keys(value.inputs).length>0,'Missing preview source inputs');
 for(const [path,hash] of Object.entries(value.inputs)){
  assert.ok(!path.startsWith('/')&&!path.split('/').includes('..'),'Invalid source path');
  assert.equal(digest(await readFile(join(repo,path))),hash,'Preview source drift: '+path);
 }
 assert.equal(checkKey(value.inputs),value.sourceHash,'Invalid preview source hash');
 return value;
}
async function execute(args){
 const result=await run(process.execPath,args,{cwd:repo,encoding:'utf8',timeout:60000,
  maxBuffer:2*1024*1024,env:process.env});
 process.stdout.write(result.stdout);process.stderr.write(result.stderr);
}
async function main(){
 const args=process.argv.slice(2),index=args.indexOf('--dev-url');
 assert.ok(args.every((arg,i)=>['--fresh','--watch','--dev-url'].includes(arg)||i===index+1&&index>=0),
  'Options: --fresh --watch --dev-url http://127.0.0.1:43134/dev.html');
 const url=validateDevUrl(index<0?'http://127.0.0.1:43134/dev.html':args[index+1]);
 const output=resolve(repo,'artifacts/cookie-editor-account-ui'),latest=join(output,'latest.json');
 let server;
 try{
  try{await sourceReceipt(url);}catch(error){
   if(index>=0||error.cause?.code!=='ECONNREFUSED')throw error;
   const {createServer}=await import('vite');
   server=await createServer({configFile:join(here,'vite.config.mjs'),logLevel:'warn'});
   await server.listen();await sourceReceipt(url);
  }
  if(!process.env.CHROME_BIN&&process.platform==='darwin'){
   const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
   await access(chrome);process.env.CHROME_BIN=chrome;
  }
  const {chromium}=await import('playwright');
  const chrome=process.env.CHROME_BIN||chromium.executablePath();
  const browser=(await run(chrome,['--version'],{encoding:'utf8',timeout:10000})).stdout.trim();
  await mkdir(output,{recursive:true});
  const save=async receipt=>{
   const temporary=latest+'.'+randomUUID()+'.new';
   await writeFile(temporary,JSON.stringify(receipt,null,2)+'\n');await rename(temporary,latest);
  };
  const once=async()=>{
   let key,runDir;
   try{
    const source=await sourceReceipt(url);
    const checks=Object.fromEntries(await Promise.all(localChecks.map(async path=>
     [path,digest(await readFile(join(repo,path)))])));
    key=checkKey({sourceHash:source.sourceHash,checks,browser,node:process.version,
     platform:process.platform+'-'+process.arch,selection,pattern,viewport:{width:380,height:880}});
    const prior=await readFile(latest,'utf8').then(JSON.parse).catch(()=>null);
    if(!args.includes('--fresh')&&canReuse(prior,key)){
     const intact=await Promise.all(Object.entries(prior.evidence||{}).map(async([path,hash])=>
      digest(await readFile(join(output,path)))===hash)).catch(()=>[]);
     if(intact.length>=2&&intact.every(Boolean)){
      console.log(JSON.stringify({status:'REUSED',completedAt:prior.completedAt,key,
       evidence:prior.runDir,note:'Prior Mock dev check; no new execution or native claim.'}));return;
     }
    }
    runDir=new Date().toISOString().replaceAll(':','-')+'-'+randomUUID().slice(0,8);
    const destination=join(output,runDir);await mkdir(destination,{recursive:true});
    await save({format,status:'RUNNING',mode:'CURRENT_SOURCE_DEV',key,runDir});
    await execute(['--test','--test-name-pattern='+pattern,...nodeTests]);
    await execute([join(here,'chromium.mjs'),destination,'--dev-url',url.href,'--test-match',selection]);
    const receipt=JSON.parse(await readFile(join(destination,'chromium-results.json'),'utf8'));
    assert.equal(receipt.status,'PASS');assert.deepEqual(receipt.tests,['account layout spacing and receive return']);
    assert.equal(receipt.sourceBefore.sourceHash,source.sourceHash);
    assert.equal((await sourceReceipt(url)).sourceHash,source.sourceHash,'Source changed during checks');
    for(const [path,hash] of Object.entries(checks))
     assert.equal(digest(await readFile(join(repo,path))),hash,'Check changed during run: '+path);
    const evidence=Object.fromEntries(await Promise.all(['chromium-results.json',...receipt.screenshots]
     .map(async path=>[runDir+'/'+path,digest(await readFile(join(destination,path)))])));
    await save({format,status:'PASS',mode:'CURRENT_SOURCE_DEV',key,runDir,evidence,
     completedAt:new Date().toISOString(),sourceHash:source.sourceHash,browser,
     native:'NOT_TESTED'});
    console.log(JSON.stringify({status:'PASS',key,evidence:destination,native:'NOT_TESTED'}));
   }catch(error){
    await save({format,status:'FAIL',mode:'CURRENT_SOURCE_DEV',key,runDir,
     completedAt:new Date().toISOString(),error:String(error.stderr||error)});
    throw error;
   }
  };
  if(!args.includes('--watch')){await once();return;}
  let running=false,pending=false,timer;
  const drain=async()=>{
   if(running){pending=true;return;}running=true;
   do{
    pending=false;
    try{await execute([fileURLToPath(import.meta.url),...args.filter(arg=>arg!=='--watch')]);}
    catch(error){console.error(String(error.stderr||error));}
   }while(pending);
   running=false;
  };
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>void drain(),400);};
  const source=await sourceReceipt(url);
  const known=new Set([...Object.keys(source.inputs),...localChecks].map(path=>join(repo,path)));
  const observed=new Map(await Promise.all([...known].map(async path=>[path,digest(await readFile(path))])));
  const changed=async path=>{
   const hash=await readFile(path).then(digest).catch(error=>{
    if(error.code==='EISDIR')return undefined;
    if(error.code==='ENOENT')return null;
    throw error;
   });
   if(hash===undefined||observed.get(path)===hash)return;
   observed.set(path,hash);schedule();
  };
  // Watch directories so editor atomic replacements do not retire file watches.
  // Content hashes suppress mtime-only events and events caused by reading evidence.
  const watchers=[...new Set([...known].map(dirname))].map(dir=>watch(dir,(_,name)=>{
   const path=name?join(dir,String(name)):null;
   if(path&&known.has(path))void changed(path).catch(console.error);
  }));
  for(const dir of [resolve(here,'../../app'),resolve(here,'../../src'),join(here,'src')])
   watchers.push(watch(dir,{recursive:true},(_,name)=>{
    if(name&&/\.(?:[cm]?js|jsx|css|html|json)$/.test(String(name)))
     void changed(join(dir,String(name))).catch(console.error);
   }));
  console.log('Watching Cookie Editor inputs; checks are serialized and reuse unchanged successful inputs.');
  await drain();
  await new Promise(done=>{
   const stop=()=>{clearTimeout(timer);watchers.forEach(w=>w.close());done();};
   process.once('SIGINT',stop);process.once('SIGTERM',stop);
  });
 }finally{await server?.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 await main();
