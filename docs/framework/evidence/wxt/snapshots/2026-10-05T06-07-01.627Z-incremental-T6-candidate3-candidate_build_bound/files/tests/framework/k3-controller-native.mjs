import {createServer} from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile,rm,readdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import webpack from 'webpack';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.join(root,'docs/framework/evidence/f2-controller-continuation',`native-${new Date().toISOString().replaceAll(':','-')}`);
const extension=path.join(output,'extension');await mkdir(extension,{recursive:true});
const requests=[],server=createServer((req,res)=>{
  requests.push({url:req.url,at:Date.now()});res.setHeader('content-type','text/html;charset=utf-8');
  const child=req.url==='/child',next=req.url==='/next';
  res.end(`<!doctype html><title>${child?'Child fixture':next?'Next fixture':'Top fixture'}</title><input id="input"><button id="button">Click</button>${child||next?'':'<iframe src="/child"></iframe>'}`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
const publicKey=generateKeyPairSync('rsa',{modulusLength:2048}).publicKey.export({format:'der',type:'spki'}),key=publicKey.toString('base64');
const extensionId=createHash('sha256').update(publicKey).digest('hex').slice(0,32).split('').map(ch=>String.fromCharCode(97+parseInt(ch,16))).join('');
const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
manifest.name='F2 controller product graph targeted proof';manifest.key=key;manifest.host_permissions=['http://127.0.0.1/*'];
await writeFile(path.join(extension,'manifest.json'),JSON.stringify(manifest,null,2));
await mkdir(path.join(extension,'ui'),{recursive:true});await mkdir(path.join(extension,'scripting/sandbox'),{recursive:true});
await writeFile(path.join(extension,'ui/fixture-config.js'),`globalThis.__controllerFixtureBase=${JSON.stringify(base)};`);
await writeFile(path.join(extension,'ui/tool.html'),'<!doctype html><meta charset="utf-8"><title>F2 controller proof</title><body><script src="fixture-config.js"></script><script src="tool-shell.js"></script></body>');
for(const file of ['ui/target-bootstrap.html','scripting/sandbox/sandbox.html'])await copyFile(path.join(root,'src',file),path.join(extension,file));
const require=createRequire(import.meta.url),configuration=require('../../webpack.config.cjs')('development');
configuration.context=root;configuration.entry['ui/tool-shell']='./tests/framework/k3-controller-native-page.js';
configuration.entry['scripting/packaged/page-session']='./src/scripting/packaged/page-session.js';
configuration.output={...configuration.output,path:extension,clean:false};configuration.devtool=false;configuration.performance=false;
await new Promise((resolve,reject)=>webpack(configuration,(error,stats)=>error||stats.hasErrors()?reject(error||new Error(stats.toString({all:false,errors:true}))):resolve()));
const source=[];
async function add(file){source.push({path:file,sha256:createHash('sha256').update(await readFile(path.join(root,file))).digest('hex')});}
async function walk(dir){for(const e of await readdir(path.join(root,dir),{withFileTypes:true})){const file=`${dir}/${e.name}`;if(e.isDirectory())await walk(file);else await add(file);}}
for(const file of ['manifest.json','webpack.config.cjs','src/run-host.js','src/sw.js','src/framework/context.js','src/framework/ChromePage.js'])await add(file);
for(const dir of ['src/platform','src/framework/control','src/scripting'])await walk(dir);
source.sort((a,b)=>a.path.localeCompare(b.path));await writeFile(path.join(output,'source-manifest.json'),JSON.stringify(source,null,2));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function connect(url,events=[]) {
  const socket=new WebSocket(url),pending=new Map();let seq=0;
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=({data})=>{const message=JSON.parse(data);if(message.method){events.push({...message,observedMonoMs:performance.now()});return;}
    const waiter=pending.get(message.id);if(!waiter)return;pending.delete(message.id);clearTimeout(waiter.timer);
    message.error?waiter.reject(new Error(JSON.stringify(message.error))):waiter.resolve(message.result);};
  return {send(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout '+method));},10000);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});},close(){for(const waiter of pending.values()){clearTimeout(waiter.timer);waiter.reject(new Error('CDP closed'));}pending.clear();socket.close();}};
}
const reports=[];
try {
  for(const label of (process.env.K3_CONTROLLER_CHROME?.split(',')||['138','154'])) {
    const version=label==='138'?'138.0.7204.183':'154.0.8037.92';
    const binary=path.join(root,`tests/.cache/m5-browsers/${version}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`);
    const own=path.join(output,label),profile=path.join(own,'profile');await mkdir(profile,{recursive:true});
    const browser=spawn(binary,['--headless=new','--use-mock-keychain','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0',
      `--user-data-dir=${profile}`,`--load-extension=${extension}`,`--disable-extensions-except=${extension}`,'about:blank'],{stdio:['ignore','pipe','pipe']});
    let stderr='',stdout='',browserClient,hostClient,report;const events=[];
    browser.stderr.on('data',bytes=>{stderr+=bytes;});browser.stdout.on('data',bytes=>{stdout+=bytes;});
    const exited=new Promise(resolve=>browser.once('exit',(code,signal)=>resolve({code,signal})));
    try {
      let endpoint;for(let i=0;i<200;i++){endpoint=stderr.match(/DevTools listening on (ws:\/\/\S+)/)?.[1];if(endpoint)break;await sleep(25);}if(!endpoint)throw new Error('No browser endpoint');
      browserClient=await connect(endpoint,events);const cdpVersion=await browserClient.send('Browser.getVersion');
      await browserClient.send('Target.setDiscoverTargets',{discover:true});
      const {targetId}=await browserClient.send('Target.createTarget',{url:'about:blank'});
      const {sessionId:hostSession}=await browserClient.send('Target.attachToTarget',{targetId,flatten:true});
      hostClient={send:(method,params)=>browserClient.send(method,params,hostSession),close(){}};
      await hostClient.send('Runtime.enable');await hostClient.send('Page.enable');
      await hostClient.send('Page.navigate',{url:`chrome-extension://${extensionId}/ui/tool.html`});
      const evaluate=async expression=>(await hostClient.send('Runtime.evaluate',{expression,returnByValue:true})).result.value;
      let probe,raw;for(let i=0;i<1000;i++){probe=await evaluate('globalThis.__controllerProbe');raw=await evaluate('globalThis.__k3ControllerReport');if(probe?.stage==='armbusy'||raw)break;await sleep(25);}
      const baselineWorkers=(await browserClient.send('Target.getTargets')).targetInfos.filter(t=>t.type==='worker');
      if(probe?.stage==='armbusy') {
        await browserClient.send('Tracing.start',{categories:'-*,__metadata,devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame',transferMode:'ReportEvents'});
        await evaluate('globalThis.__controllerArm()');
        for(let i=0;i<400;i++){probe=await evaluate('globalThis.__controllerProbe');if(probe?.stage==='busy')break;await sleep(25);}
      }
      let physical;
      if(probe?.stage==='busy') {
        const all=(await browserClient.send('Target.getTargets')).targetInfos;
        const candidates=all.filter(t=>t.type==='worker'&&!baselineWorkers.some(old=>old.targetId===t.targetId));
        const direct=candidates.filter(t=>t.url===probe.bound.identity.url);
        const exact=direct.length===1?direct:candidates.length===1&&!candidates[0].url?candidates:[];
        if(exact.length!==1||exact[0].attached)throw new Error('Busy Worker native target is ambiguous or inspector attached');
        const cpuBefore={monoMs:performance.now(),sample:await browserClient.send('SystemInfo.getProcessInfo')};await sleep(350);
        const cpuLoop={monoMs:performance.now(),sample:await browserClient.send('SystemInfo.getProcessInfo')};
        const triggerBefore=performance.now();await evaluate('globalThis.__controllerStop=true');
        for(let i=0;i<160;i++){probe=await evaluate('globalThis.__controllerProbe');if(probe.stage==='stopped')break;await sleep(25);}
        if(probe.stage!=='stopped')throw new Error('Busy Worker stop did not settle');
        const targetSamples=[],postCPU=[];
        while(performance.now()-triggerBefore<2700) {
          const sample={monoMs:performance.now(),targets:(await browserClient.send('Target.getTargets')).targetInfos};targetSamples.push(sample);
          if(!sample.targets.some(t=>t.targetId===exact[0].targetId))break;await sleep(100);
        }
        for(let i=0;i<3;i++){
          const sample=await browserClient.send('SystemInfo.getProcessInfo');
          const osPids=execFileSync('ps',['-axo','pid='],{encoding:'utf8'}).trim().split(/\s+/).map(Number);
          postCPU.push({monoMs:performance.now(),sample,osPids});if(i<2)await sleep(150);
        }
        await browserClient.send('Tracing.end');for(let i=0;i<1000&&!events.some(e=>e.method==='Tracing.tracingComplete');i++)await sleep(20);
        const trace=events.filter(e=>e.method==='Tracing.dataCollected').flatMap(e=>e.params.value);
        const causal=trace.find(e=>e.name==='TracingSessionIdForWorker'&&String(e.args?.data?.workerId).toUpperCase()===exact[0].targetId.toUpperCase()&&e.args?.data?.url===probe.bound.identity.url);
        const cpuFor=x=>x.sample.processInfo.find(p=>p.type==='renderer'&&p.id===causal?.pid)?.cpuTime??null;
        const loopCPU=causal&&cpuFor(cpuLoop)!==null&&cpuFor(cpuBefore)!==null?cpuFor(cpuLoop)-cpuFor(cpuBefore):null;
        const postDeltas=postCPU.slice(1).map((s,i)=>cpuFor(s)!==null&&cpuFor(postCPU[i])!==null?cpuFor(s)-cpuFor(postCPU[i]):null);
        const processExited=!!causal&&postCPU.every(s=>cpuFor(s)===null&&!s.osPids.includes(causal.pid));
        const cpuQuiescent=processExited||postDeltas.every(n=>n!==null&&n>=0&&n<0.03);
        const destroyed=events.find(e=>e.method==='Target.targetDestroyed'&&e.params.targetId===exact[0].targetId);
        const firstAbsent=targetSamples.find(s=>!s.targets.some(t=>t.targetId===exact[0].targetId));
        physical={exactTarget:exact[0],baselineWorkers,bound:probe.bound,association:direct.length===1?'native-url':'unique fresh target at private bound barrier; native URL empty',triggerBefore,probe,causalTrace:causal||null,cpuBefore,cpuLoop,loopCPU,postCPU,postDeltas,processExited,cpuQuiescent,targetSamples,destroyed,
          firstAbsent,inspectorAttached:false,passed:!!causal&&loopCPU>0.1&&cpuQuiescent&&!!destroyed&&destroyed.observedMonoMs-triggerBefore<=3000&&
            !!firstAbsent&&firstAbsent.monoMs-triggerBefore<=3000&&postCPU.at(-1).monoMs-triggerBefore<=3000};
        await writeFile(path.join(own,'native-trace.json'),JSON.stringify(trace));
        await writeFile(path.join(own,'observer-events.json'),JSON.stringify(events.filter(e=>e.method!=='Tracing.dataCollected')));
        await evaluate('globalThis.__controllerContinueRun()');
      } else {physical={passed:false,reason:'No busy Worker probe'};}
      for(let i=0;i<1200;i++){raw=await evaluate('globalThis.__k3ControllerReport');if(raw)break;await sleep(25);}if(!raw)throw new Error('No targeted product graph report');
      report={label,completeVersion:execFileSync(binary,['--version'],{encoding:'utf8'}).trim(),binarySha256:createHash('sha256').update(await readFile(binary)).digest('hex'),
        OS:{type:os.type(),release:os.release(),arch:os.arch()},extensionId,cdpVersion,targetId,browserPid:browser.pid,...raw,physical,
        scope:'Actual product SW/broker/authority/storage/client/RunHost/ctx/opaque sandbox/native driver. Fixture tool consumer and static localhost test permission. F2 targeted evidence only.',finalProductPassed:false};
    } catch(error) {report={label,error:{message:error.message,stack:error.stack},summary:{PASS:0,FAIL:1},finalProductPassed:false};}
    finally {
      hostClient?.close();if(browserClient){try{await browserClient.send('Browser.close');}catch{}browserClient.close();}else browser.kill('SIGTERM');
      let exit=await Promise.race([exited,sleep(5000).then(()=>null)]);if(!exit){browser.kill('SIGKILL');exit=await exited;}
      await writeFile(path.join(own,'stderr.txt'),stderr);await writeFile(path.join(own,'stdout.txt'),stdout);await rm(profile,{recursive:true,force:true});
      report.cleanup={browserExit:exit,browserPidAlive:(()=>{try{process.kill(browser.pid,0);return true;}catch{return false;}})(),ownedProfileRemoved:true};
    }
    await writeFile(path.join(own,'report.json'),JSON.stringify(report,null,2));reports.push(report);
    console.log(JSON.stringify({label,summary:report.summary,physicalPassed:report.physical?.passed,error:report.error,output:path.join(own,'report.json')}));
  }
} finally {await new Promise(resolve=>server.close(resolve));}
await writeFile(path.join(output,'summary.json'),JSON.stringify({reports:reports.map(r=>({label:r.label,summary:r.summary,physicalPassed:r.physical?.passed,error:r.error})),finalProductPassed:false,serverClosed:true},null,2));
if(reports.some(r=>r.summary.FAIL||!r.physical?.passed||r.cleanup.browserPidAlive))process.exitCode=1;
