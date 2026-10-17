#!/usr/bin/env node
// CI-only smoke: Watch tracks source edits, restores candidate, protects index.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const file=join(here,'src/style.css');
const candidate=join(here,'.opendesk-preview/bookmark-react-candidate.html');
const official=join(here,'../index.html');
const [original,oldOfficial]=await Promise.all([readFile(file,'utf8'),readFile(official,'utf8')]);
const baseline=await readFile(candidate,'utf8');
const child=spawn(process.execPath,[join(here,'build-preview.mjs'),'--watch'],
 {cwd:here,stdio:['ignore','pipe','pipe']});
let stdout='',stderr='';
child.stdout.on('data',value=>{stdout+=String(value)});
child.stderr.on('data',value=>{stderr+=String(value)});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
async function until(check,label){
 for(let i=0;i<250;i++){
  if(child.exitCode!==null)throw Error('Watch exited '+child.exitCode+' '+stderr);
  if(await check())return;
  await sleep(100);
 }
 throw Error('R305_WATCH_SMOKE_TIMEOUT '+label+' '+stdout.slice(-1500)+' '+stderr.slice(-1500));
}
try{
 await until(()=>stdout.includes('R305_WATCH_READY'),'watch ready');
 await writeFile(file,original+'\n.bm-app{outline-offset:4px}\n');
 await until(async()=>{
  const value=await readFile(candidate,'utf8').catch(()=>null);
  return value!==null&&value!==baseline;
 },'CSS source change rebuilt candidate');
 await writeFile(file,original);
 await until(async()=>await readFile(candidate,'utf8')===baseline,'candidate restored');
 assert.equal(await readFile(official,'utf8'),oldOfficial,'Watch touched approved preview');
 console.log('R305_WATCH_REAL_SOURCE_CHANGE_AND_RESTORE_PASS');
}finally{
 await writeFile(file,original);
 child.kill('SIGINT');
 await new Promise(resolve=>{if(child.exitCode!==null)resolve();else{child.once('exit',resolve);setTimeout(resolve,1000).unref()}});
}
