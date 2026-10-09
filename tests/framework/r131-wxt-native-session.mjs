// Acceptance adapter for actual WXT packages. No product or business DOM writes.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';
import {launchChrome} from './k5-sdk-native-launcher.mjs';
import {connect, evaluate} from './sidebar-native-session.mjs';
import {packageFingerprint} from '../../scripts/verify-package.mjs';
import {createServer} from 'node:http';

const root = process.cwd();
const directory = path.resolve(process.env.R131_EVIDENCE_DIR || 'docs/framework/evidence/r131-acceptance-01a121da/native-production');
const save = async (label, value) => {
  await mkdir(directory, {recursive:true});
  await writeFile(path.join(directory, label + '.json'), JSON.stringify(value, null, 2) + '\n');
};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function serveFixture() {
  const fixture=await readFile(new URL('./fixtures/r13-locator.html',import.meta.url));
  const server=createServer((request,response)=>{response.setHeader('Content-Type','text/html; charset=utf-8');response.end(fixture);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const fixtureUrl=`http://127.0.0.1:${server.address().port}/r13-locator.html`;
  await save('fixture-server',{pid:process.pid,fixtureUrl});
  console.log(JSON.stringify({fixtureUrl}));
  process.on('SIGTERM',()=>server.close(()=>process.exit()));
  process.on('SIGINT',()=>server.close(()=>process.exit()));
}
async function start(mode = 'production') {
  if (!['production','development'].includes(mode)) throw Error('Invalid WXT mode');
  await mkdir(directory, {recursive:true});
  const extension = path.resolve('dist', mode);
  const binary = process.env.R131_CHROME_BINARY;
  if (!binary || !path.isAbsolute(binary)) throw Error('Explicit owned CFT binary required');
  const fixture=await readFile(new URL('./fixtures/r13-locator.html', import.meta.url));
  const server=createServer((request,response)=>{response.setHeader('Content-Type','text/html; charset=utf-8');response.end(fixture);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const fixtureUrl=`http://127.0.0.1:${server.address().port}/r13-locator.html`;
  let browser;
  try { browser = await launchChrome({root, binary, extension, headed:true, directory, label:'r131', sameProfileRestart:true}); }
  catch(error){ server.close(); throw error; }
  const client = await connect(browser.endpoint);
  let closing = false;
  async function shutdown() {
    if (closing) return;
    closing = true;
    // Close Chrome normally before signalling its ownership adapter. Sending
    // SIGINT to the entire process group can race the adapter's PID inspection.
    await client.send('Browser.close').catch(()=>{});
    client.close();
    await browser.copyLog();
    await save('cleanup', await browser.stop());
    server.close();
    process.exit();
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  try {
    const page = await client.send('Target.createTarget', {url:'http://127.0.0.1:43111/demo-form.html'});
    await client.send('Target.activateTarget', {targetId:page.targetId});
    let sw;
    for (let attempt=0; attempt<100 && !sw; attempt++) {
      sw = (await client.send('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker' && t.url.endsWith('/sw.js'));
      if (!sw) await pause(100);
    }
    if (!sw) throw Error('Actual WXT service worker missing');
    await save('session', {...browser.metadata, endpoint:browser.endpoint, driverPid:process.pid,
      page:page.targetId, extension, fixtureUrl, extensionId:sw.url.split('/')[2],
      version:await client.send('Browser.getVersion'), package:await packageFingerprint(extension)});
    console.log(JSON.stringify({ready:true, directory, pid:browser.metadata.pid, mode}));
  } catch(error) {
    await save('start-error', {message:String(error)});
    await shutdown();
  }
}
async function withSession(action) {
  const session = JSON.parse(await readFile(path.join(directory,'session.json')));
  const client = await connect(session.endpoint);
  try { await action(client, session); } finally { client.close(); }
}
async function snapshot(label) {
  await withSession(async (client, session) => {
    const targets = (await client.send('Target.getTargets')).targetInfos;
    const sw = targets.find(t=>t.type==='service_worker' && t.url.endsWith('/sw.js'));
    if (!sw) throw Error('Worker missing');
    const sid = (await client.send('Target.attachToTarget',{targetId:sw.targetId,flatten:true})).sessionId;
    const native = await evaluate(client, `(async()=>{
      const stores={};
      for(const d of await indexedDB.databases()){
        const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(d.name);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
        const values={};
        for(const name of [...db.objectStoreNames]) values[name]=await new Promise((resolve,reject)=>{const q=db.transaction(name).objectStore(name).getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
        stores[d.name]=values;db.close();
      }
      return {contexts:await chrome.runtime.getContexts({}),tabs:await chrome.tabs.query({}),permissions:await chrome.permissions.getAll(),manifest:chrome.runtime.getManifest(),stores};
    })()`,sid);
    const pages=[];
    for(const target of targets.filter(t=>['page','other'].includes(t.type) && !t.url.startsWith('chrome://'))){
      try{
        const id=(await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
        if(label==='arm')await evaluate(client,`(()=>{if(globalThis.__r131Inputs)return;globalThis.__r131Inputs=[];for(const type of ['input','change','click','submit'])document.addEventListener(type,e=>{globalThis.__r131Inputs.push({at:Date.now(),type,id:e.target.id,isTrusted:e.isTrusted,source:document.querySelector('#script-source')?.value,params:document.querySelector('#script-params')?.value,keyword:document.querySelector('#keyword')?.value,count:document.querySelector('#search-count')?.textContent})},true);})()`,id);
        const state=await evaluate(client,`({url:location.href,source:document.querySelector('#script-source')?.value,
          params:document.querySelector('#script-params')?.value,status:document.querySelector('#script-status')?.textContent,
          identity:document.querySelector('#script-task-id')?.textContent,target:document.querySelector('#script-running-target')?.textContent,
          result:document.querySelector('#script-result')?.textContent,keyword:document.querySelector('#keyword')?.value,
          count:document.querySelector('#search-count')?.textContent,searchResult:document.querySelector('#results')?.textContent,
          fixtureEvents:globalThis.r13FixtureEvents,fixture:{value:document.querySelector('#r13-keyword')?.value,checked:document.querySelector('#r13-consent')?.checked,region:document.querySelector('#r13-region')?.value,clicks:document.querySelector('#r13-out')?.dataset.clicks,answer:document.querySelector('#r13-out')?.textContent},
          inputs:globalThis.__r131Inputs,visibleControls:[...document.querySelectorAll('button,input,textarea,summary')].filter(n=>n.getBoundingClientRect().width&&n.getBoundingClientRect().height).map(n=>({id:n.id,text:n.textContent?.slice(0,100),disabled:n.disabled}))})`,id);
        pages.push({target,state});
      }catch(error){pages.push({target,error:String(error)});}
    }
    const packageNow=await packageFingerprint(session.extension);
    if(packageNow.packageHash!==session.package.packageHash)throw Error('Loaded package changed during acceptance');
    await save(label,{at:new Date().toISOString(),session,native,pages,targets});
    console.log(JSON.stringify({label,pages:pages.map(p=>({url:p.target.url,status:p.state?.status,identity:p.state?.identity,count:p.state?.count,result:p.state?.searchResult}))}));
  });
}
async function restartWorker() {
  await withSession(async (client, session) => {
    const targets=(await client.send('Target.getTargets')).targetInfos;
    const before=targets.find(t=>t.type==='service_worker' && t.url.endsWith('/sw.js'));
    const page=targets.find(t=>t.type==='page' && t.url==='about:blank');
    if(!before||!page)throw Error('Worker/control page missing');
    const id=(await client.send('Target.attachToTarget',{targetId:page.targetId,flatten:true})).sessionId;
    await client.send('ServiceWorker.enable',{},id);
    await client.send('ServiceWorker.stopAllWorkers',{},id);
    let stopped=false;
    for(let i=0;i<100;i++){
      if(!(await client.send('Target.getTargets')).targetInfos.some(t=>t.targetId===before.targetId)){stopped=true;break;}
      await pause(100);
    }
    if(!stopped)throw Error('Actual SW did not stop');
    await client.send('ServiceWorker.startWorker',{scopeURL:`chrome-extension://${session.extensionId}/`},id);
    let after;
    for(let i=0;i<100&&!after;i++){
      after=(await client.send('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url===before.url);
      if(!after)await pause(100);
    }
    if(!after||after.targetId===before.targetId)throw Error('New actual SW instance missing');
    await save('sw-restart',{at:new Date().toISOString(),before,after,packageHash:session.package.packageHash,stopped});
    console.log(JSON.stringify({swRestarted:true,before:before.targetId,after:after.targetId}));
  });
}
const [command,arg]=process.argv.slice(2);
if(command==='start')await start(arg);
else if(command==='serve-fixture')await serveFixture();
else if(command==='snapshot')await snapshot(arg || 'snapshot');
else if(command==='restart-sw')await restartWorker();
else throw Error('Use start production|development, snapshot label, restart-sw');
