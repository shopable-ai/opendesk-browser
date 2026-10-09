// Controlled real Mac Chrome session. Product actions use native UI; CDP here
// is limited to navigation, passive observation and launcher-owned shutdown.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createInterface} from 'node:readline';
import {launchChrome} from './k5-sdk-native-launcher.mjs';
import {connect,evaluate} from './sidebar-native-session.mjs';
import {packageFingerprint} from '../../scripts/verify-package.mjs';
const root=process.cwd(),directory=path.resolve(process.env.PAGE_LIFECYCLE_EVIDENCE_DIR||'evidence/page-lifecycle-r1-01a12158/native-01');
const sessionFile=path.join(directory,'session.json'),save=(name,value)=>writeFile(path.join(directory,name),JSON.stringify(value,null,2)+'\n');
async function start(){
  await mkdir(directory,{recursive:true});
  if(!process.env.PAGE_LIFECYCLE_CHROME_BINARY)throw Error('Explicit owned CFT binary required');
  const extension=path.resolve('dist/development');
  const browser=await launchChrome({root,binary:process.env.PAGE_LIFECYCLE_CHROME_BINARY,extension,headed:true,
    directory,label:'page-lifecycle',sameProfileRestart:true});
  let session,closing=false;
  async function shutdown(){
    if(closing)return;closing=true;
    try{const c=await connect(browser.endpoint);await c.send('Browser.close').catch(()=>{});c.close();}catch{}
    await browser.copyLog();await save('cleanup.json',await browser.stop());process.exit(0);
  }
  process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
  try{
    const client=await connect(browser.endpoint);
    const page=await client.send('Target.createTarget',{url:'http://127.0.0.1:43111/demo-form.html'});
    await client.send('Target.activateTarget',{targetId:page.targetId});
    let sw;for(let n=0;n<100&&!sw;n++){sw=(await client.send('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url.endsWith('/sw.js'));
      if(!sw)await new Promise(r=>setTimeout(r,100));}
    if(!sw)throw Error('Owned extension worker missing');
    session={...browser.metadata,endpoint:browser.endpoint,driverPid:process.pid,extension,extensionId:sw.url.split('/')[2],
      page:page.targetId,version:await client.send('Browser.getVersion'),package:await packageFingerprint(extension)};
    await save('session.json',session);client.close();console.log(JSON.stringify({sessionFile,pid:session.pid,extensionId:session.extensionId}));
  }catch(error){await save('start-error.json',{message:String(error)});await shutdown();}
  createInterface({input:process.stdin}).on('line',async line=>{
    if(line.trim()==='stop')return shutdown();
    if(line.trim()!=='restart')return;
    try{const c=await connect(browser.endpoint),closing=c.send('Browser.close').catch(()=>{}),next=await browser.restart();await closing;c.close();
      session={...session,...next.metadata,endpoint:next.endpoint,package:await packageFingerprint(extension)};
      await save('session.json',session);console.log(JSON.stringify({restarted:true,pid:session.pid,profile:session.profile}));
    }catch(error){await save('restart-error.json',{message:String(error)});console.error(error);}
  });
}
async function observe(label){
  if(!/^[a-zA-Z0-9_-]+$/.test(label||''))throw Error('Safe observation label required');
  const session=JSON.parse(await readFile(sessionFile,'utf8')),c=await connect(session.endpoint);
  try{
    const targets=(await c.send('Target.getTargets')).targetInfos,observations=[];
    for(const target of targets.filter(t=>['page','other','service_worker'].includes(t.type))){
      try{const id=(await c.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
        const state=await evaluate(c,target.type==='service_worker'?`(async()=>{
          const stores={};for(const d of await indexedDB.databases()){
            const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(d.name);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
            const rows={};for(const name of [...db.objectStoreNames])rows[name]=await new Promise((resolve,reject)=>{
              const q=db.transaction(name).objectStore(name).getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
            stores[d.name]=rows;db.close();}
          let scripts,worlds,scriptError;try{scripts=await chrome.userScripts.getScripts();worlds=await chrome.userScripts.getWorldConfigurations();}catch(e){scriptError=String(e);}
          const tabs=await chrome.tabs.query({}),frames=await Promise.all(tabs.map(async tab=>({tabId:tab.id,
            frames:await chrome.webNavigation.getAllFrames({tabId:tab.id}).catch(()=>[])})));
          return {contexts:await chrome.runtime.getContexts({}),tabs,frames,permissions:await chrome.permissions.getAll(),
            session:await chrome.storage.session.get(null),stores,scripts,worlds,scriptError};})()`:
          `(()=>{const visible=n=>Boolean(n.getClientRects().length);return {url:location.href,title:document.title,
            lifecycleA:document.querySelector('#page-lifecycle-A')?.textContent,lifecycleB:document.querySelector('#page-lifecycle-B')?.textContent,
            inputs:globalThis.__pageLifecycleNativeInputs,controls:[...document.querySelectorAll('[id],button')].filter(visible).map(n=>({id:n.id,
              text:n.textContent?.slice(0,3000),value:n.value,disabled:n.disabled,state:n.dataset.state})),width:innerWidth,height:innerHeight};})()`,id);
        observations.push({target,state});
        if(target.url.includes('/ui/tool.html')||target.url.includes('/demo-form.html')){
          const shot=await c.send('Page.captureScreenshot',{format:'png'},id);await writeFile(path.join(directory,label+'-'+target.targetId+'.png'),Buffer.from(shot.data,'base64'));
        }
      }catch(error){observations.push({target,error:String(error)});}
    }
    await save(label+'.json',{at:new Date().toISOString(),session,observations});
    console.log(JSON.stringify({label,observations:observations.map(o=>({type:o.target.type,url:o.target.url,error:o.error,
      lifecycleA:o.state?.lifecycleA,lifecycleB:o.state?.lifecycleB,scripts:o.state?.scripts?.length}))}));
  }finally{c.close();}
}
async function arm(){
  const s=JSON.parse(await readFile(sessionFile,'utf8')),c=await connect(s.endpoint);
  try{const targets=(await c.send('Target.getTargets')).targetInfos,target=targets.find(t=>t.url.includes('/ui/tool.html?hostInstanceId='));
    if(!target)throw Error('Live Sidebar required');const id=(await c.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
    await evaluate(c,`(()=>{if(globalThis.__pageLifecycleNativeInputs)return;globalThis.__pageLifecycleNativeInputs=[];
      for(const type of ['input','change','click'])document.addEventListener(type,e=>{
        if(!e.target.id?.startsWith('script-')&&!e.target.id?.startsWith('page-'))return;
        globalThis.__pageLifecycleNativeInputs.push({at:new Date().toISOString(),type,id:e.target.id,isTrusted:e.isTrusted,
          source:document.querySelector('#script-source')?.value,scriptId:document.querySelector('#script-id')?.value,
          revision:document.querySelector('#script-revision')?.value,selected:document.querySelector('#page-program-list')?.value});},true);})()`,id);
    console.log(JSON.stringify({armed:true,target:target.targetId}));
  }finally{c.close();}
}
if(process.argv[2]==='start')await start();else if(process.argv[2]==='observe')await observe(process.argv[3]);
else if(process.argv[2]==='arm')await arm();else throw Error('Use start | observe LABEL | arm');
