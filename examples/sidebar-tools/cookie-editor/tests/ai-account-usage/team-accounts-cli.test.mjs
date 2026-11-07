import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {request} from 'node:http';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';

test('manage --data-dir writes team metadata and receipts only to the isolated directory', {timeout:15000},async t=>{
  const directory=await mkdtemp(join(tmpdir(),'team-cli-')),owner=fileURLToPath(new URL('../../ai-account-usage/',import.meta.url));let child;
  t.after(async()=>{if(child&&child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill('SIGTERM');await exited;}await rm(directory,{recursive:true,force:true});});
  const config=join(directory,'accounts.json'),state=join(directory,'state');await writeFile(config,JSON.stringify({accounts:[]}));
  // Keep the actual environment unchanged. Node denies writes everywhere except
  // this temporary tree, including the real default personal data directory.
  child=spawn(process.execPath,['--permission',`--allow-fs-read=${owner}`,`--allow-fs-read=${directory}`,`--allow-fs-write=${directory}`,join(owner,'manage.mjs'),'serve','--config',config,'--data-dir',state],{cwd:directory,stdio:['ignore','pipe','pipe']});
  let stderr='',stdout='';child.stderr.on('data',b=>stderr+=b);
  const link=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('startup timeout: '+stderr)),5000);child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',()=>{clearTimeout(timer);reject(Error('startup exit: '+stderr));});child.stdout.on('data',b=>{stdout+=b;if(stdout.includes('\n')){clearTimeout(timer);resolve(new URL(stdout.split('\n')[0]));}});});
  const req=(path,{body,cookie}={})=>new Promise((resolve,reject)=>{const r=request({hostname:'127.0.0.1',port:link.port,path,method:body?'POST':'GET',headers:{host:link.host,...(cookie?{cookie}:{}),...(body?{origin:link.origin,'content-type':'application/json'}:{})}},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(text),headers:res.headers}));});r.on('error',reject);r.end(body?JSON.stringify(body):undefined);});
  const paired=await req('/session',{body:{code:new URLSearchParams(link.hash.slice(1)).get('pair')}});assert.equal(paired.status,200);const cookie=paired.headers['set-cookie'][0].split(';')[0];
  const body={operationId:'publish_isolated',accountId:'isolated',expectedVersion:0,displayName:'Isolated team',origin:'https://chatgpt.com',expiresAt:Date.now()+60000};
  const published=await req('/opendesk/admin/api/team-accounts',{body,cookie});assert.equal(published.status,200,JSON.stringify(published.data)+'; '+stderr);
  const receipt=await req('/opendesk/admin/api/team-operations/publish_isolated',{cookie});assert.equal(receipt.data.status,'CONFIRMED');assert.deepEqual(receipt.data.result,published.data);
  const stored=JSON.parse(await readFile(join(state,'team-accounts-v1.json'),'utf8'));assert.equal(stored.accounts[0].accountId,'isolated');assert.equal(stored.operations[0].operationId,'publish_isolated');
  assert.equal((await req('/opendesk/admin/api/team-accounts',{cookie})).data.accounts[0].accountId,'isolated');assert.equal(stderr,'');
});
