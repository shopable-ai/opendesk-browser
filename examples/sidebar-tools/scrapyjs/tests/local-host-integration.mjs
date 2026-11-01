// Real Python + Scrapling + HTTP through the production trusted transport.
// Chrome storage/installation are test doubles: this is NOT REAL_HOST/MAC_CHROME.
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {createLocalTaskBridge,revokeLocalTasks} from '../../../../src/platform/host/local-tasks.js';
import {createLocalRunnerClient} from '../src/local-runner-client.js';

const runner=resolve('examples/sidebar-tools/scrapyjs/local-runner');
const inputs=['src/platform/host/local-tasks.js','examples/sidebar-tools/scrapyjs/src/local-runner-client.js',
  ...['dsl.py','security.py','manager.py','worker.py','storage.py','service.py','__main__.py'].map(name=>'examples/sidebar-tools/scrapyjs/local-runner/scrapyjs_runner/'+name)];
const sourceHashes=async()=>Object.fromEntries(await Promise.all(inputs.map(async name=>[name,createHash('sha256').update(await readFile(name)).digest('hex')])));
const output=resolve('artifacts/scrapyjs/r17-local-host-integration.json');
const directory=await mkdtemp(join(tmpdir(),'scrapyjs-r17-'));
let pages=3,slow=false,hits=0;
const fixture=http.createServer(async(req,res)=>{
  if(req.url==='/robots.txt'){res.end('User-agent: *\nAllow: /\n');return;}
  const page=Number(new URL(req.url,'http://fixture').searchParams.get('page')||1);
  hits++;if(slow)await delay(180);
  res.setHeader('Content-Type','text/html;charset=utf-8');
  res.end(`<html><body><ul id="rows"><li><h2>图书 ${page}</h2><span data-price="${page}.50">价格</span></li></ul>${page<pages?`<a class="next" href="/?page=${page+1}">下一页</a>`:''}</body></html>`);
});
fixture.listen(0,'127.0.0.1');await once(fixture,'listening');
const scope='http://127.0.0.1:'+fixture.address().port;
const reserve=http.createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');
const port=reserve.address().port;await new Promise(done=>reserve.close(done));
const pair={format:'opendesk.local-task-credential.v1',endpoint:'http://127.0.0.1:'+port,secret:randomBytes(36).toString('base64url')};
const credential=join(directory,'pairing.json');await writeFile(credential,JSON.stringify(pair),{mode:0o600});
const extensionId='abcdefghijklmnopabcdefghijklmnop';
let process,log='';
async function startService(){
  process=spawn(join(runner,'.venv/bin/python'),['-m','scrapyjs_runner','--port',String(port),'--data-dir',join(directory,'data'),'--credential-file',credential,'--extension-origin','chrome-extension://'+extensionId,'--fixture-origin',scope],{cwd:runner,stdio:['ignore','pipe','pipe']});
  process.stdout.on('data',bytes=>{log+=bytes;});process.stderr.on('data',bytes=>{log+=bytes;});
  for(let i=0;i<200;i++){
    if(process.exitCode!==null)throw Error('Python service exited: '+log);
    try{const response=await fetch(pair.endpoint+'/health');if(response.ok)return response.json();}catch{}
    await delay(50);
  }
  throw Error('Service health timed out: '+log);
}
const values={};let revision=0,approvals=0;
const api={runtime:{id:extensionId},storage:{local:{async get(key){return {[key]:structuredClone(values[key])};},async set(value){Object.assign(values,structuredClone(value));},async remove(key){delete values[key];}}}};
let bridge;
const makeBridge=()=>createLocalTaskBridge({api,owner:'scrapyjs:r17-http-integration',toolId:'scrapyjs',assertAuthorized:async()=>{},confirm:async()=>{approvals++;return pair;},lock:work=>work()});
const request=async(operation,payload)=>{
  if(operation==='localTasks.request')return bridge.request(payload);
  if(operation==='storage.get')return {value:values[payload.key]??null,etag:String(revision)};
  if(operation==='storage.set'){
    assert.equal(payload.ifMatch,String(revision));values[payload.key]=structuredClone(payload.value);revision++;
    return {saved:true,etag:String(revision)};
  }
  throw Error('Unexpected SDK operation');
};
async function settled(client){
  for(let i=0;i<40;i++){const run=await client.refresh();if(run.workerExited)return run;await delay(800);}
  throw Error('Worker did not settle');
}
const report={level:'PYTHON_INTEGRATION',transport:'production Host adapter with test-double installation/storage',REAL_HOST:'NOT_TESTED',MAC_CHROME:'NOT_TESTED',AI_PROVIDER:'NOT_TESTED',previews:[],full:null,stop:null,reopen:null};
report.sources=await sourceHashes();
try{
  report.health=await startService();assert.equal(report.health.scraplingVersion,'0.5');
  bridge=makeBridge();let client=createLocalRunnerClient(request);await client.restore();
  const config={url:scope+'/?page=1',itemConfig:{_listContainer:'#rows',_listItem:'li',title:'h2::text',price:'span::data-price'},nextPageSelector:'a.next',maxPages:50};
  let preview;
  for(const previewPages of [1,2,3]){
    await client.start({requestId:randomUUID(),mode:'preview',config,previewPages});preview=await settled(client);
    assert.equal(preview.pagesVisited,previewPages);assert.equal(preview.recordsCount,previewPages);assert.equal(preview.previewPassed,true);
    const records=(await client.records()).records;
    assert.deepEqual(records,Array.from({length:previewPages},(_,i)=>({title:'图书 '+(i+1),price:(i+1)+'.50'})));
    report.previews.push({previewPages,runId:preview.runId,configHash:preview.configHash,pagesVisited:preview.pagesVisited,recordsCount:preview.recordsCount,workerExited:preview.workerExited,records});
  }
  await client.start({requestId:randomUUID(),mode:'full',config,previewRunId:preview.runId,configHash:preview.configHash});
  const full=await settled(client);assert.equal(full.configHash,preview.configHash);assert.equal(full.previewRunId,preview.runId);assert.equal(full.recordsCount,3);
  report.full={runId:full.runId,previewRunId:full.previewRunId,configHash:full.configHash,pagesVisited:full.pagesVisited,recordsCount:full.recordsCount};
  // Read the SAME durable run through brand-new adapter/client objects.
  bridge=makeBridge();client=createLocalRunnerClient(request);const restored=await client.restore();
  assert.equal(restored.runId,full.runId);report.reopen={sameRunId:restored.runId,approvals};assert.equal(approvals,1);
  const sessionResponse=await fetch(pair.endpoint+'/v1/session',{method:'POST',headers:{Authorization:'Bearer '+pair.secret,'Content-Type':'application/json'},body:JSON.stringify({owner:'scrapyjs:r17-http-integration',origin:'chrome-extension://'+extensionId,scope})});
  const session=await sessionResponse.json();
  for(const format of ['jsonl','csv']){
    const response=await fetch(pair.endpoint+'/v1/runs/'+full.runId+'/export?format='+format,{headers:{Authorization:'Bearer '+session.token}});
    assert.equal(response.status,200);const target=join(directory,'result.'+format);await writeFile(target,new Uint8Array(await response.arrayBuffer()));
    const text=await readFile(target,'utf8');assert.ok(text.includes('图书 3'));
    if(format==='jsonl')assert.deepEqual(text.trim().split('\n').map(line=>JSON.parse(line)),report.previews[2].records);
    report[format]={savedAndReadBack:true,bytes:Buffer.byteLength(text)};
  }
  pages=50;slow=true;
  await client.start({requestId:randomUUID(),mode:'full',config,previewRunId:preview.runId,configHash:preview.configHash});
  const stopId=client.pointer.runId;
  let secondValue=null,secondRevision=0;
  const secondClient=createLocalRunnerClient(async(operation,payload)=>{
    if(operation==='localTasks.request')return bridge.request(payload);
    if(operation==='storage.get')return {value:structuredClone(secondValue),etag:String(secondRevision)};
    if(operation==='storage.set'){
      assert.equal(payload.ifMatch,String(secondRevision));secondValue=structuredClone(payload.value);secondRevision++;
      return {saved:true,etag:String(secondRevision)};
    }
    throw Error('Unexpected secondary SDK operation');
  });
  await secondClient.restore();
  await assert.rejects(secondClient.start({requestId:randomUUID(),mode:'preview',config,previewPages:1}),error=>error.code==='E_LOCAL_NOT_CREATED');
  assert.equal(secondClient.pointer,null,'definite busy rejection restores the previous empty pointer');
  report.busyRejectRecovery={actualHttp409:true,pointerRestored:true,automaticRetry:false};
  for(let i=0;i<40;i++){const running=await client.refresh();if(running.pagesVisited>0||running.workerExited)break;await delay(250);}
  assert.ok(client.snapshot.pagesVisited>0,'stop needs a collected page: '+JSON.stringify({status:client.snapshot.status,reason:client.snapshot.stopReason,errors:client.snapshot.errors}));
  const stop=await client.stop();assert.equal(stop.runId,stopId);assert.equal(stop.workerExited,true);assert.equal(stop.status,'stopped');
  const after=hits;await delay(400);assert.equal(hits,after);
  report.stop={runId:stopId,status:stop.status,workerExited:true,requestsAfterStop:0,pagesVisited:stop.pagesVisited};
  await secondClient.start({requestId:randomUUID(),mode:'preview',config,previewPages:1});
  const retried=await settled(secondClient);assert.equal(retried.pagesVisited,1);
  report.busyRejectRecovery.explicitRetryRunId=retried.runId;
  process.kill('SIGTERM');await once(process,'exit');
  await startService();
  await assert.rejects(client.refresh(),error=>error.code==='E_LOCAL_SESSION');
  const afterRestart=await client.refresh();assert.equal(afterRestart.runId,stopId);assert.equal(approvals,1);
  report.hostSessionRestart={originalRunId:afterRestart.runId,renewedAfter401:true,repeatedApproval:false,replayedCreate:false};
  await revokeLocalTasks(api,'scrapyjs');report.revocation='confirmed';
  report.status='PASS';
}catch(error){report.status='FAIL';report.error={message:error.message,stack:error.stack};throw error;}
finally{
  if(process&&process.exitCode===null){process.kill('SIGTERM');await once(process,'exit');}
  await new Promise(done=>fixture.close(done));
  report.sourcesAfter=await sourceHashes();report.sourceStable=JSON.stringify(report.sources)===JSON.stringify(report.sourcesAfter);
  if(!report.sourceStable&&report.status==='PASS'){report.status='SOURCE_DRIFT';globalThis.process.exitCode=1;}
  await mkdir(resolve('artifacts/scrapyjs'),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,report:output,previews:report.previews.map(row=>({pages:row.pagesVisited,records:row.recordsCount})),stop:report.stop,approvals}));
}
