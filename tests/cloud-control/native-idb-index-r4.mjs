// Native Chrome for Testing IDB microbench. REAL browser transaction/cursor,
// synthetic disposable data; never claim installed-extension Cloud Gate 4.
// All IO and browser state are owned by this CI job's isolated temp profile.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {connect} from '../framework/sidebar-native-session.mjs';

async function browserBenchmark(count){
  const {transact}=await import('/src/platform/storage/idb.js');
  const {createCloudHistoryIndex}=await import('/src/cloud-control/history-index.js');
  const name='opendesk-r4-idb-'+count+'-'+crypto.randomUUID();
  const open=indexedDB.open(name,2);
  open.onupgradeneeded=()=>open.result.createObjectStore('frameworkKV');
  const db=await new Promise((resolve,reject)=>{
    open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);
    open.onblocked=()=>reject(Error('IDB blocked'));
  });
  const namespace='tool:chrome-native-ephemeral',KV='frameworkKV';
  const metrics={allCalls:0,scanCalls:0,keysCalls:0};
  const storage={nativeCursorPaging:true,readOnly:false,
    transaction(names,mode,work){return transact(db,names,mode,tx=>work({
      ...tx,
      all(store){metrics.allCalls++;return tx.all(store);},
      scan(store,opts){metrics.scanCalls++;return tx.scan(store,opts);},
      keys(store,opts){metrics.keysCalls++;return tx.keys(store,opts);}
    }));}
  };
  const row=(i,state=i%7===0?'finished':'waiting')=>({
    tag:'cloud-request-v1',namespace,requestId:'cloud:'+String(i).padStart(8,'0'),
    createdAt:1700000000000+i,state,
    credential:'PRIVATE_BROWSER_PROBE',params:{token:'never-export'},
    assignment:{target:{url:'https://sensitive.example/secret'}}
  });
  try{
    for(let begin=0;begin<count;begin+=400){
      const end=Math.min(count,begin+400);
      await storage.transaction([KV],'readwrite',async tx=>{
        for(let i=begin;i<end;i++){
          const v=row(i);await tx.put(KV,v,'cloud:request:'+v.requestId);
        }
      });
    }
    const index=createCloudHistoryIndex({storage,namespace});
    const before=performance.now(),migration=await index.ensure();
    const migrateMs=performance.now()-before;
    if(!migration.migrated||migration.total!==count)
      throw Error('Wrong real IDB migration '+JSON.stringify(migration));
    const repeated=await index.ensure();
    if(repeated.migrated||repeated.total!==count)throw Error('Non-idempotent migration');
    const scanBefore=metrics.scanCalls,allBefore=metrics.allCalls,keysBefore=metrics.keysCalls;
    const queryStart=performance.now();
    const projected=await storage.transaction([KV],'readonly',tx=>index.page(tx,{
      limit:20,offset:Math.min(30,Math.floor(count*.2)),state:'waiting'}));
    const queryMs=performance.now()-queryStart;
    // Snapshot the single-page measurement BEFORE extra rollback checks,
    // which intentionally invoke their own independent cursors.
    const primaryScanCalls=metrics.scanCalls-scanBefore;
    const primaryAllCalls=metrics.allCalls-allBefore;
    const response=JSON.stringify({
      rows:projected.rows.map(r=>({state:r.state,createdAt:r.createdAt,
        retirementReleased:false,receiptConfirmed:false})),
      total:projected.total,matchingTotal:projected.matchingTotal,
      states:projected.states
    });
    const responseBytes=new TextEncoder().encode(response).byteLength;
    const expectedFinished=Math.floor((count-1)/7)+1;
    if(projected.total!==count||projected.matchingTotal!==count-expectedFinished||
      projected.rows.length!==20||projected.states.finished!==expectedFinished||
      metrics.scanCalls-scanBefore!==1||metrics.allCalls!==allBefore||
      metrics.keysCalls!==keysBefore||responseBytes>4500)
      throw Error('Native indexed cursor assertion '+JSON.stringify({projected,metrics,responseBytes}));
    const original=await storage.transaction([KV],'readonly',
      tx=>tx.get(KV,'cloud:request:cloud:00000001'));
    const previous=await storage.transaction([KV],'readonly',
      tx=>index.page(tx,{limit:1,state:'finished'}));
    let aborted=false;
    try{
      await storage.transaction([KV],'readwrite',async tx=>{
        await index.put(tx,{...original,state:'finished'});
        throw Error('INJECTED_NATIVE_TRANSACTION_ABORT');
      });
    }catch{aborted=true;}
    const restored=await storage.transaction([KV],'readonly',
      tx=>tx.get(KV,'cloud:request:cloud:00000001'));
    const still=await storage.transaction([KV],'readonly',
      tx=>index.page(tx,{limit:1,state:'finished'}));
    if(!aborted||restored.state!==original.state||
      still.matchingTotal!==previous.matchingTotal)
      throw Error('Real IDB version 2 transaction rollback failed');
    return {count,databaseVersion:db.version,authenticIDB:indexedDB instanceof IDBFactory,
      migrateMs:Math.round(migrateMs*100)/100,queryMs:Math.round(queryMs*100)/100,
      requestTotal:projected.total,matchingTotal:projected.matchingTotal,
      returnedRows:projected.rows.length,responseBytes,
      scanCalls:primaryScanCalls,clonedAllCalls:primaryAllCalls,
      rollbackVerified:true,heapUsedBytes:performance.memory?.usedJSHeapSize??null,
      userAgent:navigator.userAgent};
  }finally{
    db.close();
    await new Promise((resolve,reject)=>{
      const del=indexedDB.deleteDatabase(name);
      del.onsuccess=resolve;del.onerror=()=>reject(del.error);
    });
  }
}

const bin=process.env.CHROME_BIN;
assert(bin,'Pinned Chrome-for-Testing executable required');
const root=process.cwd();
const output=path.resolve(process.env.CLOUD_NATIVE_OUT||'artifacts/cloud-control-r4-idb-native');
const exception=process.platform==='linux'&&process.env.CI==='true'&&
  process.env.GITHUB_ACTIONS==='true'&&process.env.CLOUD_NATIVE_CI_NO_SANDBOX==='1';
const allowed=new Set(['/src/platform/storage/idb.js','/src/platform/protocol.js',
  '/src/platform/schema.js','/src/cloud-control/history-index.js']);
const profile=await mkdtemp(path.join(tmpdir(),'opendesk-cloud-r4-idb-'));
let server,child,client,stderr='';
try{
  server=createServer(async(req,res)=>{
    try{
      const url=new URL(req.url||'/','http://127.0.0.1');
      if(url.pathname==='/'){
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
        res.end('<!doctype html><meta charset="utf-8"><title>R4 native IDB</title>');return;
      }
      if(!allowed.has(url.pathname)){res.writeHead(404);res.end();return;}
      const bytes=await readFile(path.join(root,url.pathname.slice(1)));
      res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});
      res.end(bytes);
    }catch{res.writeHead(500);res.end('Fixture unavailable');}
  });
  await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const args=['--headless=new','--no-first-run','--no-default-browser-check',
    '--disable-sync','--disable-background-networking','--disable-extensions',
    '--remote-debugging-port=0','--user-data-dir='+profile,origin+'/'];
  if(exception)args.push('--no-sandbox');
  child=spawn(bin,args,{stdio:['ignore','ignore','pipe']});
  child.stderr.on('data',part=>{stderr=(stderr+String(part)).slice(-18000);});
  let ws;
  for(let i=0;i<240;i++){
    if(child.exitCode!==null)throw Error('Chrome exited '+child.exitCode+' '+stderr.slice(-1200));
    const content=await readFile(path.join(profile,'DevToolsActivePort'),'utf8').catch(()=>null);
    const [port,endpoint]=content?.trim().split('\n')||[];
    if(port&&endpoint){ws='ws://127.0.0.1:'+port+endpoint;break;}
    await sleep(125);
  }
  assert(ws,'Real Chrome DevToolsActivePort absent: '+stderr.slice(-2000));
  client=await connect(ws);
  const target=await client.send('Target.createTarget',{url:origin+'/'});
  const session=(await client.send('Target.attachToTarget',{
    targetId:target.targetId,flatten:true})).sessionId;
  await client.send('Runtime.enable',{},session);
  const browser=await client.send('Browser.getVersion');
  // Wait for the real page and its module origin; no fake DOM event is used.
  let ready=false;
  for(let i=0;i<100;i++){
    const observed=await client.send('Runtime.evaluate',{
      expression:'location.origin',returnByValue:true},session);
    if(observed.result?.value===origin){ready=true;break;}
    await sleep(100);
  }
  assert(ready,'Chrome page did not load fixture origin');
  const observations=[];
  for(const count of [100,1000,10000]){
    const reply=await client.send('Runtime.evaluate',{
      expression:'('+browserBenchmark.toString()+')('+count+')',
      awaitPromise:true,returnByValue:true
    },session,{timeoutMs:60000});
    if(reply.exceptionDetails||!reply.result?.value)
      throw Error('Chrome IDB '+count+' failed '+JSON.stringify(
        reply.exceptionDetails||reply.result).slice(0,1700));
    const actual=reply.result.value;
    assert.equal(actual.count,count);assert.equal(actual.authenticIDB,true);
    assert.equal(actual.returnedRows,20);assert.equal(actual.scanCalls,1);
    assert.equal(actual.clonedAllCalls,0);assert.equal(actual.rollbackVerified,true);
    observations.push(actual);
  }
  await mkdir(output,{recursive:true});
  const result={status:'NATIVE_IDB_COMPONENT_VERIFIED',
    qualification:'Real Linux Chrome IndexedDB only; not an installed extension or Cloud Gate 4',
    sourceSha:process.env.GITHUB_SHA||null,platform:process.platform,chrome:browser.product,
    profile:'ephemeral, removed after job',benchmarks:observations};
  await writeFile(path.join(output,'results.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
}catch(error){
  await mkdir(output,{recursive:true});
  await writeFile(path.join(output,'failure.json'),JSON.stringify({
    message:String(error),chromeStderr:stderr.slice(-5000),
    sourceSha:process.env.GITHUB_SHA||null,platform:process.platform},null,2)+'\n');
  throw error;
}finally{
  client?.close();
  if(child&&child.exitCode===null){
    child.kill('SIGTERM');
    await Promise.race([new Promise(resolve=>child.once('exit',resolve)),sleep(3500)]);
    if(child.exitCode===null)child.kill('SIGKILL');
  }
  await new Promise(resolve=>{if(server)server.close(resolve);else resolve();});
  await rm(profile,{recursive:true,force:true});
}
