// Read-only evidence for a genuinely installed extension in an owned Mac CFT.
// All product input belongs to native cua, never DOM mutation or privileged RPC.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {connect,evaluate} from './sidebar-native-session.mjs';
import {packageFingerprint} from '../../scripts/verify-package.mjs';

const out=path.resolve('docs/framework/evidence/extension-center-r41-01a13a66');
const label=process.argv[2];
if(!label||!/^[-a-z0-9]+$/.test(label))throw Error('A fresh lowercase evidence label is required');
await mkdir(out,{recursive:true});
const launch=JSON.parse(await readFile(path.resolve('.runtime/extension-center-r41-01a13a66/chrome-launch.json')));
const actual=execFileSync('/bin/ps',['-p',String(launch.pid),'-o','pid=,command='],{encoding:'utf8'});
if(!actual.includes('--use-mock-keychain')||!actual.includes('--user-data-dir='+launch.profile)||!actual.includes(launch.executable))throw Error('Owned CFT identity changed');
const [port,route]=(await readFile(path.join(launch.profile,'DevToolsActivePort'),'utf8')).trim().split('\n');
const client=await connect('ws://127.0.0.1:'+port+route);
const facts={label,observedAt:new Date().toISOString(),level:'INSTALLED_MAC_CHROME_READ_ONLY_OBSERVATION',launch,actualMainProcess:actual,observations:[]};
try{
  facts.browser=await client.send('Browser.getVersion');
  const targets=(await client.send('Target.getTargets')).targetInfos;
  facts.targets=targets;
  const worker=targets.find(t=>t.type==='service_worker'&&t.url.endsWith('/sw.js'));
  if(worker){
    facts.extensionId=worker.url.split('/')[2];
    const session=(await client.send('Target.attachToTarget',{targetId:worker.targetId,flatten:true})).sessionId;
    facts.extension=await evaluate(client,`(async()=>({manifest:chrome.runtime.getManifest(),contexts:await chrome.runtime.getContexts({}),permissions:await chrome.permissions.getAll(),storage:await chrome.storage.local.get(null)}))()`,session);
    facts.durable=await evaluate(client,`(async()=>{if(!(await indexedDB.databases()).some(x=>x.name==='opendesk-browser'))return null;const db=await new Promise((res,rej)=>{const r=indexedDB.open('opendesk-browser');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});try{const names=['frameworkKV','runs','results','commandJournal'].filter(n=>db.objectStoreNames.contains(n));const tx=db.transaction(names,'readonly');return Object.fromEntries(await Promise.all(names.map(n=>new Promise((res,rej)=>{const r=tx.objectStore(n).getAll();r.onsuccess=()=>res([n,r.result]);r.onerror=()=>rej(r.error)}))))}finally{db.close()}})()`,session);
  }
  const extension=launch.args.find(v=>v.startsWith('--load-extension='))?.slice('--load-extension='.length);
  if(extension){const p=await packageFingerprint(extension);facts.package={path:extension,packageHash:p.packageHash,files:p.files?.length};}
  for(const target of targets.filter(t=>['page','other','iframe'].includes(t.type)&&(/chrome-extension:/.test(t.url)||t.url.includes('43111/demo-form.html')))){
    const row={target};facts.observations.push(row);
    try{
      row.window=await client.send('Browser.getWindowForTarget',{targetId:target.targetId}).catch(error=>({error:String(error)}));
      const session=(await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
      row.state=await evaluate(client,`(()=>{const visible=n=>n.getClientRects().length>0&&getComputedStyle(n).visibility!=='hidden';const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};return {url:location.href,title:document.title,width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scrollWidth:document.documentElement.scrollWidth,dark:matchMedia('(prefers-color-scheme: dark)').matches,bodyText:document.body.innerText,focus:{id:document.activeElement?.id,tag:document.activeElement?.tagName,text:document.activeElement?.textContent?.slice(0,140)},workspaceScroll:document.querySelector('#workspace-content')?.scrollTop,tabs:[...document.querySelectorAll('[role=tab]')].filter(visible).map(n=>({text:n.textContent,selected:n.getAttribute('aria-selected'),rect:rect(n)})),extensions:[...document.querySelectorAll('[data-extension-id]')].map(n=>({id:n.dataset.extensionId,text:n.innerText,rect:rect(n)})),controls:[...document.querySelectorAll('button,input,select,textarea')].filter(visible).map(n=>({id:n.id,tag:n.tagName,type:n.type,label:n.getAttribute('aria-label')||n.title||n.labels?.[0]?.textContent||n.textContent,value:n.value,disabled:n.disabled,expanded:n.getAttribute('aria-expanded'),pressed:n.getAttribute('aria-pressed'),rect:rect(n)})),errors:[...document.querySelectorAll('[role=alert],[data-state=error]')].filter(visible).map(n=>n.textContent)};})()`,session);
      row.accessibility=await client.send('Accessibility.getFullAXTree',{},session).catch(error=>({error:String(error)}));
      const shot=await client.send('Page.captureScreenshot',{format:'png'},session);
      row.screenshot=label+'-'+target.targetId+'.png';
      await writeFile(path.join(out,row.screenshot),Buffer.from(shot.data,'base64'),{flag:'wx'});
    }catch(error){row.error=String(error);}
  }
}finally{client.close();}
await mkdir(out,{recursive:true});
await writeFile(path.join(out,label+'.json'),JSON.stringify(facts,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({label,extensionId:facts.extensionId,package:facts.package,contexts:facts.extension?.contexts,views:facts.observations.map(r=>({url:r.target.url,width:r.state?.width,text:r.state?.bodyText?.slice(0,500),focus:r.state?.focus,error:r.error}))}));
