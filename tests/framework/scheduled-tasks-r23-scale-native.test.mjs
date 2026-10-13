// Actual isolated Chrome storage performance, NOT installed-extension UI/effects.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {setTimeout as sleep} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {connect,evaluate} from './sidebar-native-session.mjs';

const ENABLED=process.env.SCHEDULE_NATIVE_SCALE==='1';
const OUT=path.resolve(process.env.SCHEDULE_NATIVE_OUT||'artifacts/scheduled-r23-scale');
const ROOT=process.cwd();
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function until(fn,name,ms=30000){
  const limit=Date.now()+ms;let reason='';
  while(Date.now()<limit){
    try{const result=await fn();if(result)return result;}
    catch(error){
      if(error?.fatal)throw error;
      reason=String(error);
    }
    await sleep(700);
  }
  throw Error(name+' timeout'+(reason?' ('+reason+')':''));
}

test('Chrome native IndexedDB: 1000 / 10000 / 100000 scheduled Fire histories',
  {skip:!ENABLED,timeout:1800000},async t=>{
  const platform=process.env.SCHEDULE_NATIVE_PLATFORM,bin=process.env.CHROME_BIN;
  assert.equal(process.platform,platform,'Must run in the declared real OS');
  assert(bin&&path.isAbsolute(bin)&&spawnSync(bin,['--version']).status===0,
    'Pinned Chrome for Testing binary is required');
  const noSandbox=process.env.SCHEDULE_NATIVE_CI_NO_SANDBOX==='1';
  if(noSandbox)assert(process.platform==='linux'&&process.env.GITHUB_ACTIONS==='true'&&
    process.env.CI==='true','--no-sandbox is permitted only in ephemeral Linux CI');
  const profile=await mkdtemp(path.join(tmpdir(),'opendesk-r23-scale-'));
  const clientCode=await readFile('tests/framework/scheduled-tasks-r23-scale-browser.js','utf8');
  const sourceSha256=Object.fromEntries(await Promise.all([
    'src/platform/storage/idb.js','src/platform/tasks/schedule-repository.js',
    'src/platform/tasks/schedule-service.js'
  ].map(async name=>[name,digest(await readFile(name))])));
  const report={status:'RUNNING',startedAt:new Date().toISOString(),
    gitSha:process.env.GITHUB_SHA??null,platform:process.platform,
    kind:'real Chrome IDB benchmark on temporary HTTP origin, synthetic MISSED fixtures',
    nativeChrome:true,installedWxtExtension:false,profileOwned:true,
    sourceSha256,stages:[],limitations:['No fabricated Run or Result',
      'HTTP fixture is NOT the installed MV3 extension profile',
      'Does not verify real product UI or physical 200% Chrome zoom']};
  let server,chrome,cdp,passed=false,chromeStderr='';
  t.after(async()=>{
    report.completedAt=new Date().toISOString();
    report.status=passed?'PASS':'FAIL_OR_BLOCKED';
    report.chromeStderrTail=chromeStderr.slice(-2400);
    if(cdp)await cdp.send('Browser.close').catch(()=>{});
    cdp?.close();
    if(chrome?.exitCode===null&&chrome?.signalCode===null)chrome.kill('SIGTERM');
    if(server){server.closeAllConnections?.();await new Promise(ok=>server.close(ok));}
    assert(path.basename(profile).startsWith('opendesk-r23-scale-'),'remove only owned disposable profile');
    await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:150});
    await mkdir(OUT,{recursive:true});
    await writeFile(path.join(OUT,'native-idb-scale-report.json'),JSON.stringify(report,null,2)+'\n');
  });
  server=createServer(async(req,res)=>{
    try{
      const url=new URL(req.url||'/', 'http://localhost').pathname;
      if(url==='/bench'){
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
        res.end('<!doctype html><meta charset="utf-8"><title>Isolated Chrome IDB benchmark</title>'+
          '<script type="module" src="/benchmark-client.js"></script>');return;
      }
      if(url==='/benchmark-client.js'){
        res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});
        res.end(clientCode);return;
      }
      if(!url.startsWith('/src/')||!url.endsWith('.js')){res.writeHead(404);res.end();return;}
      const filename=path.resolve(ROOT,'.'+url);
      if(!filename.startsWith(path.join(ROOT,'src')+path.sep)){
        res.writeHead(403);res.end();return;
      }
      res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});
      res.end(await readFile(filename));
    }catch(error){res.writeHead(500);res.end(String(error));}
  });
  await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok);});
  const origin='http://127.0.0.1:'+server.address().port;
  chrome=spawn(bin,['--headless=new','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--no-default-browser-check','--disable-background-networking',
    '--remote-allow-origins=*','--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0','--user-data-dir='+profile,
    ...(noSandbox?['--no-sandbox']:[]),'about:blank'],{stdio:['ignore','ignore','pipe']});
  chrome.stderr.on('data',data=>{chromeStderr=(chromeStderr+String(data)).slice(-8000);});
  report.chromePid=chrome.pid;
  const port=await until(async()=>{
    const lines=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8').catch(()=>'')).split('\n');
    const n=Number(lines[0]);return Number.isInteger(n)&&n>0?n:null;
  },'genuine Chrome DevTools endpoint',45000);
  const version=await(await fetch('http://127.0.0.1:'+port+'/json/version')).json();
  report.chromeVersion=version.Browser;
  cdp=await connect(version.webSocketDebuggerUrl);
  const target=await cdp.send('Target.createTarget',{url:origin+'/bench'});
  const session=(await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
  await cdp.send('Runtime.enable',{},session);
  await until(()=>evaluate(cdp,'window.scale?.ready===true',session),
    'actual browser import of production IDB and schedule repository modules',60000);
  for(const size of [1000,10000,100000]){
    await evaluate(cdp,'(window.scale.begin('+size+'),true)',session);
    const stage=await until(async()=>{
      const state=await evaluate(cdp,'window.scale.status',session);
      if(state?.phase==='error'){
        const error=new Error('Stage '+size+': '+state.error);
        error.fatal=true;throw error;
      }
      return state?.phase==='done'&&state.count===size?state.result:null;
    },size+' native records completion',720000);
    assert.equal(stage.count,size);
    assert.equal(stage.pendingCount,5);
    assert(stage.metrics.every(x=>x.p95Ms>=x.p50Ms&&Number.isFinite(x.p50Ms)));
    report.stages.push(stage);
    console.log('R23_IDB_NATIVE '+JSON.stringify({sha:report.gitSha,chrome:report.chromeVersion,
      platform:report.platform,records:size,seedMs:stage.seedMs,
      migrationMs:stage.migrationMs,deepPageMs:stage.deepPageMs,
      originUsageBytes:stage.originUsageBytes,originQuotaBytes:stage.originQuotaBytes,
      metrics:stage.metrics.map(x=>({name:x.label,p50Ms:x.p50Ms,p95Ms:x.p95Ms}))}));
  }
  await cdp.send('Page.reload',{ignoreCache:true},session);
  await until(()=>evaluate(cdp,
    'window.scale?.ready===true&&performance.getEntriesByType("navigation")[0]?.type==="reload"',session),
    'real page reload restores native IDB pending index',60000);
  report.reopened=await evaluate(cdp,'window.scale.probe()',session);
  assert.equal(report.reopened.pendingIds.length,5);
  assert.equal(report.reopened.historyCount,20);
  passed=true;
});
