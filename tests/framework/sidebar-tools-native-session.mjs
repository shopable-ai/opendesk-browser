// Owned CFT session and read-only observations for Sidebar Tool R1 acceptance.
// UI installation/input/permission actions belong to native UI, never DOM mutations.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createInterface} from 'node:readline';
import {execFileSync} from 'node:child_process';
import {launchChrome} from './k5-sdk-native-launcher.mjs';
import {connect,evaluate} from './sidebar-native-session.mjs';
import {packageFingerprint} from '../../scripts/verify-package.mjs';

const root=process.cwd();
const directory=path.resolve(process.env.TOOL_EVIDENCE_DIR||'docs/framework/evidence/sidebar-tools-r1-mac-01a11fa4/native');
const sessionFile=path.join(directory,'session.json');
const save=(name,value)=>writeFile(path.join(directory,name),JSON.stringify(value,null,2)+'\n');
async function start(){
  await mkdir(directory,{recursive:true});
  const binary=path.resolve(process.env.TOOL_CHROME_BINARY||'tests/.cache/m5-browsers/155.0.8059.39/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  const extension=path.resolve('dist/production');
  const browser=await launchChrome({root,binary,extension,headed:true,directory,label:'tools-r1',sameProfileRestart:true});
  let client,session,closing=false;
  async function shutdown(){
    if(closing)return;closing=true;client?.close();
    try {
      const control=await connect(browser.endpoint);
      await control.send('Browser.close').catch(()=>{});control.close();
      const deadline=Date.now()+8000;
      while(Date.now()<deadline){
        try{process.kill(browser.metadata.pid,0);}catch(error){if(error.code==='ESRCH')break;throw error;}
        await new Promise(resolve=>setTimeout(resolve,100));
      }
    } catch(error){await save('shutdown-error.json',{message:String(error)});}
    await browser.copyLog();await save('cleanup.json',await browser.stop());process.exit();
  }
  process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
  try{
    client=await connect(browser.endpoint);
    const page=await client.send('Target.createTarget',{url:'http://127.0.0.1:43111/demo-form.html'});
    await client.send('Target.activateTarget',{targetId:page.targetId});
    let sw;const deadline=Date.now()+20000;
    while(!sw&&Date.now()<deadline){
      const targets=(await client.send('Target.getTargets')).targetInfos;
      sw=targets.find(t=>t.type==='service_worker'&&t.url.endsWith('/sw.js'));
      if(!sw)await new Promise(resolve=>setTimeout(resolve,100));
    }
    if(!sw)throw Error('Controlled extension worker missing');
    session={...browser.metadata,endpoint:browser.endpoint,driverPid:process.pid,page:page.targetId,
      extension,extensionId:sw.url.split('/')[2],version:await client.send('Browser.getVersion'),package:await packageFingerprint(extension)};
    await save('session.json',session);console.log(JSON.stringify({pid:session.pid,version:session.version,extensionId:session.extensionId}));
  }catch(error){await save('start-error.json',{message:String(error)});await shutdown();}
  finally{client?.close();}
  createInterface({input:process.stdin}).on('line',async line=>{
    if(line.trim()==='stop')return shutdown();
    const request=line.trim().match(/^restart(?: (400|600))?$/);
    if(!request)return;
    try{
      const old=await connect(browser.endpoint);const closing=old.send('Browser.close').catch(()=>{});
      if(request[1]){
        // The live launcher retains its exited child until restart() reaps it.
        // kill(pid,0) still succeeds for that zombie; ps distinguishes it from
        // a running browser. The launcher verifies exit code 0 on restart.
        const stillRunning=()=>{
          try{return !execFileSync('/bin/ps',['-p',String(browser.metadata.pid),'-o','stat='],{encoding:'utf8'}).trim().startsWith('Z');}
          catch(error){if(error.status===1)return false;throw error;}
        };
        const deadline=Date.now()+10000;
        while(stillRunning()&&Date.now()<deadline){
          await new Promise(resolve=>setTimeout(resolve,100));
        }
        if(stillRunning())throw Error('Owned browser still running; do not edit Preferences');
        const file=path.join(browser.metadata.profile,'Default','Preferences');
        const preferences=JSON.parse(await readFile(file,'utf8'));
        preferences.side_panel??={};preferences.side_panel.id_to_width??={};
        const previous=preferences.side_panel.id_to_width.kExtension;
        preferences.side_panel.id_to_width.kExtension=Number(request[1])+18;
        await writeFile(file,JSON.stringify(preferences));
        await save('width-preference.json',{requestedCssWidth:Number(request[1]),previous,value:Number(request[1])+18,profile:browser.metadata.profile,browserExited:true,method:'Owned-profile native Chrome preference; no product DOM change'});
      }
      const next=await browser.restart();await closing;old.close();
      Object.assign(session,next.metadata,{endpoint:next.endpoint,package:await packageFingerprint(extension)});await save('session.json',session);
      console.log(JSON.stringify({restarted:true,pid:session.pid,sameProfile:next.metadata.restartObserved.sameProfile}));
    }catch(error){await save('restart-error.json',{message:String(error)});console.error(error);}
  });
}
async function observe(label){
  if(!/^[a-zA-Z0-9_-]+$/.test(label||''))throw Error('Observation label required');
  const session=JSON.parse(await readFile(sessionFile,'utf8')),client=await connect(session.endpoint);
  try{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    const observations=[];
    for(const target of targets.filter(t=>['page','other','iframe','service_worker'].includes(t.type))){
      const id=(await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
      try{
        const state=await evaluate(client,target.type==='service_worker'
          ? `(async()=>({contexts:await chrome.runtime.getContexts({}),tabs:await chrome.tabs.query({}),tools:await chrome.storage.local.get(null)}))()`
          : `(()=>{const v=n=>Boolean(n.getClientRects().length);return {url:location.href,title:document.title,width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,iframeCount:document.querySelectorAll('iframe').length,chromeApis:{runtime:typeof globalThis.chrome?.runtime,tabs:typeof globalThis.chrome?.tabs,storage:typeof globalThis.chrome?.storage},controls:[...document.querySelectorAll('[id],button')].filter(v).map(n=>({id:n.id,text:n.textContent?.slice(0,200),value:n.value,disabled:n.disabled,rect:{x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y,width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height}})),images:[...document.images].map(n=>({complete:n.complete,naturalWidth:n.naturalWidth,src:n.src.slice(0,60)}))};})()`,id);
        observations.push({target,state});
        if(target.url.includes('/ui/tool.html')||target.url.includes('/sidebar-tools/sandbox.html')){
          const shot=await client.send('Page.captureScreenshot',{format:'png'},id);
          await writeFile(path.join(directory,label+'-'+target.targetId+'.png'),Buffer.from(shot.data,'base64'));
        }
      }catch(error){observations.push({target,error:String(error)});}
    }
    await save(label+'.json',{at:new Date().toISOString(),session,observations});
    console.log(JSON.stringify({label,targets:observations.map(x=>({type:x.target.type,url:x.target.url,width:x.state?.width,chromeApis:x.state?.chromeApis,error:x.error}))}));
  }finally{client.close();}
}
async function input(selector,text){
  const session=JSON.parse(await readFile(sessionFile,'utf8')),client=await connect(session.endpoint);
  try{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    const target=targets.find(t=>t.type==='iframe'&&t.url.includes('/sidebar-tools/sandbox.html'));
    if(!target)throw Error('Tool iframe missing');
    const id=(await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
    await evaluate(client,`(()=>{if(globalThis.__toolNativeInputs)return;globalThis.__toolNativeInputs=[];for(const type of ['input','click'])document.addEventListener(type,e=>globalThis.__toolNativeInputs.push({type,id:e.target.id,isTrusted:e.isTrusted}),true);})()`,id);
    const rect=await evaluate(client,`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled)throw Error('Control unavailable');const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`,id);
    await client.send('Input.dispatchMouseEvent',{type:'mousePressed',...rect,button:'left',clickCount:1},id);
    await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',...rect,button:'left',clickCount:1},id);
    if(text!==undefined){
      await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:4,commands:['selectAll']},id);
      await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:4},id);
      await client.send('Input.insertText',{text},id);
      const value=await evaluate(client,`document.querySelector(${JSON.stringify(selector)}).value`,id);
      if(value!==text)throw Error('Native input bytes differ');
    }
    const events=await evaluate(client,'globalThis.__toolNativeInputs',id);
    if(!events.length||events.some(event=>!event.isTrusted))throw Error('Untrusted UI input observed');
    await save('native-input-events.json',{target:target.targetId,events});
    console.log(JSON.stringify({nativeCdpInput:true,target:target.targetId,selector,textBytes:text===undefined?null:Buffer.byteLength(text)}));
  }finally{client.close();}
}
async function openDemo(){
  const session=JSON.parse(await readFile(sessionFile,'utf8')),client=await connect(session.endpoint);
  try{
    const page=await client.send('Target.createTarget',{url:'http://127.0.0.1:43111/demo-form.html'});
    await client.send('Target.activateTarget',{targetId:page.targetId});
    await save('demo-page.json',{at:new Date().toISOString(),page,session});
    console.log(JSON.stringify({page}));
  }finally{client.close();}
}
if(process.argv[2]==='start')await start();
else if(process.argv[2]==='page')await openDemo();
else if(process.argv[2]==='observe')await observe(process.argv[3]);
else if(process.argv[2]==='input')await input(process.argv[3],process.argv[4]);
else throw Error('Use start | page | observe LABEL | input SELECTOR [TEXT]');
