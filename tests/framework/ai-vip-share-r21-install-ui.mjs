// Real installed-tool checks for the frozen R2.1 candidate. No grant/storage
// injection, Provider substitute, synthetic DOM event or proxy mutation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const evidence=path.join(root,'docs/framework/workstreams/evidence/ai-vip-share-r21-01a13df4');
const bindingName=process.argv[2]||'snapshot-binding-r2.json';
assert(/^snapshot-binding-r\d+\.json$/.test(bindingName),'An explicit task source binding is required');
const binding=JSON.parse(fs.readFileSync(path.join(evidence,bindingName)));
assert(binding.snapshot.startsWith(path.join(root,'.runtime/ai-vip-share-r21-01a13df4/')),'Task snapshot required');
const candidate=path.join(binding.snapshot,'dist/production');
const runDir=path.join(evidence,'install-ui',new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(runDir,{recursive:true});
const write=(name,data)=>fs.writeFileSync(path.join(runDir,name),typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data,null,2)+'\n');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const report={status:'IN_PROGRESS',startedAt:new Date().toISOString(),layer:'INSTALLED_TOOL_PROVIDER_BLOCKED',cases:[],
  limits:['Frozen historical candidate only; not current combined main or F3/ZIP acceptance.',
    'Provider is absent. No proxy enable/disable, activation lease, proxy routing or recovery acceptance.',
    'No public Managed Proxy SDK approval; existing ai.access remains transitional.']};
let launcher,meta,browser,side,worker;
let originalSide;
const sessions=[];
const helper=path.join(runDir,'native-input');
const launcherPath='/Users/shopme/.codex/skills/chrome-testing-keychain/scripts/launch.py';
const checkerPath=path.join(path.dirname(launcherPath),'check_instance.py');
async function until(fn,label,ms=15000){
  const end=Date.now()+ms;let error;
  while(Date.now()<end){try{const value=await fn();if(value)return value;}catch(e){error=e;}await pause(100);}
  throw Error(label+(error?': '+error.message:''));
}
async function socket(url){
  const ws=new WebSocket(url),pending=new Map();let id=0;
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  ws.addEventListener('message',event=>{const row=JSON.parse(String(event.data)),p=pending.get(row.id);if(p){pending.delete(row.id);clearTimeout(p.timer);row.error?p.reject(Error(JSON.stringify(row.error))):p.resolve(row.result);}});
  const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const seq=++id,timer=setTimeout(()=>{pending.delete(seq);reject(Error('CDP timeout '+method));},15000);pending.set(seq,{resolve,reject,timer});ws.send(JSON.stringify({id:seq,method,params,...(sessionId?{sessionId}:{})}));});
  const client={call,close(){ws.close();for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('closed'));}pending.clear();}};sessions.push(client);return client;
}
async function read(target,expression){
  const r=await target.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
  return r.result?.value;
}
async function attach(targetId){
  const {sessionId}=await browser.call('Target.attachToTarget',{targetId,flatten:true});
  const target={call:(method,params)=>browser.call(method,params,sessionId)};
  await target.call('Runtime.enable');return target;
}
function native(command,...args){
  execFileSync('/usr/bin/python3',[checkerPath,path.join(runDir,'launcher.json')],{timeout:10000});
  try{
    const result=execFileSync(helper,[String(meta.pid),command,...args],{encoding:'utf8',timeout:12000});
    fs.appendFileSync(path.join(runDir,'native-input.jsonl'),JSON.stringify({at:new Date().toISOString(),command,args,result})+'\n');return result;
  }catch(error){fs.appendFileSync(path.join(runDir,'native-input.jsonl'),JSON.stringify({at:new Date().toISOString(),command,args,status:error.status,stdout:String(error.stdout||''),stderr:String(error.stderr||'')})+'\n');throw error;}
}
function ax(){return JSON.parse(native('dump'));}
async function click(selector){
  const lookup=selector.startsWith('text:')?`[...document.querySelectorAll('button,a')].find(e=>e.textContent.trim()===${JSON.stringify(selector.slice(5))}&&e.getClientRects().length)`:`document.querySelector(${JSON.stringify(selector)})`;
  const expression=`(()=>{const e=${lookup};if(!e||e.disabled||!e.getClientRects().length)return null;const r=e.getBoundingClientRect();return {name:e.getAttribute('aria-label')||e.textContent.trim()||e.title,rect:{x:r.x,y:r.y,width:r.width,height:r.height},viewport:{width:innerWidth,height:innerHeight},title:document.title};})()`;
  let info=await read(side,expression);
  assert(info,'Visible enabled control required: '+selector);
  let unchanged=0;
  for(let n=0;n<65&&(info.rect.y+info.rect.height/2<20||info.rect.y+info.rect.height/2>=info.viewport.height-20);n++){
    const before=info.rect.y;native('key',before<20?'up':'down');await pause(180);info=await read(side,expression);
    assert(info,'Control disappeared while scrolling: '+selector);unchanged=info.rect.y===before?unchanged+1:0;
    assert(unchanged<4,'Native scroll did not move target: '+selector);
  }
  await pause(200);info=await read(side,expression);
  assert(info.rect.y+info.rect.height/2>=0&&info.rect.y+info.rect.height/2<info.viewport.height,'Control remains outside actual viewport: '+selector);
  const rows=ax();write('ax-before-'+report.cases.length+'.json',rows);
  const controls=rows.filter(x=>['AXButton','AXRadioButton','AXCheckBox','AXPopUpButton','AXLink'].includes(x.role)&&x.enabled!==false&&x.size?.width>0&&x.size?.height>0&&[x.title,x.description].includes(info.name));
  let point;
  if(controls.length===1)point={x:controls[0].position.x+controls[0].size.width/2,y:controls[0].position.y+controls[0].size.height/2};
  else{
    const areas=rows.filter(x=>x.role==='AXWebArea'&&Math.abs(x.size?.width-info.viewport.width)<3&&Math.abs(x.size?.height-info.viewport.height)<3);
    assert.equal(areas.length,1,'Unique actual Side Panel AXWebArea required for '+selector);
    point={x:areas[0].position.x+info.rect.x+info.rect.width/2,y:areas[0].position.y+info.rect.y+info.rect.height/2};
  }
  fs.appendFileSync(path.join(runDir,'click-observations.jsonl'),JSON.stringify({selector,info,point})+'\n');
  native('click-at',String(point.x),String(point.y));await pause(150);
}
async function test(name,fn){
  const row={name,startedAt:new Date().toISOString()};report.cases.push(row);
  try{row.evidence=await fn();row.status='PASS';}catch(e){row.status='FAIL';row.error=e.stack||String(e);throw e;}
  finally{row.finishedAt=new Date().toISOString();write('report.json',report);console.log(row.status+' '+name);}
}
async function screenshot(name){const r=await side.call('Page.captureScreenshot',{format:'png'});write(name,Buffer.from(r.data,'base64'));}
function contrast(fg,bg){
  const luminance=value=>{const c=value.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>x/255).map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4);return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722;};
  const a=luminance(fg),b=luminance(bg);return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
}
const storage=()=>read(worker,"chrome.storage.local.get(['opendesk.sidebar-tools.installed.v1','opendesk.sidebar-tools.revocation-epochs.v1','opendesk.sidebar-tools.enabled.v1','opendesk.ai-vip-share.state.v1','opendesk.ai-access.state.v1'])");
async function reviewFromMarket(){
  const before=new Set((await browser.call('Target.getTargets')).targetInfos.map(x=>x.targetId));
  await click('#extension-center-market');
  const target=await until(async()=>(await browser.call('Target.getTargets')).targetInfos.find(x=>!before.has(x.targetId)&&x.type==='page'&&x.url.startsWith('chrome-extension://'+report.extensionId+'/ui/marketplace.html')),'Actual trusted marketplace');
  side=await attach(target.targetId);
  const entry='a[href="#/apps/opendesk/ai-vip-share/versions/1.0.1"]';
  await until(()=>read(side,'!!document.querySelector('+JSON.stringify(entry)+')'),'Actual AI Catalog link');
  await click(entry);await until(()=>read(side,"location.hash==='#/apps/opendesk/ai-vip-share/versions/1.0.1'"),'Actual AI detail navigation');
  await until(()=>read(side,"[...document.querySelectorAll('button')].some(x=>x.textContent==='审阅并安装'&&!x.disabled)"),'Actual install review action');
  await click('text:审阅并安装');
  await until(()=>read(side,"!!document.querySelector('[data-market-action=confirm-install]')"),'Actual package review');
  assert(await read(side,"document.querySelector('.review')?.textContent?.includes('AI VIP Share')"));
}
try{
  const snapshot=path.resolve(candidate,'../..');
  for(const input of binding.overlay)assert.equal(hash(fs.readFileSync(path.join(snapshot,input.path))),input.sha256,'Frozen input '+input.path);
  const {verifyPackage}=await import(pathToFileURL(path.join(snapshot,'scripts/verify-package.mjs')).href);
  process.chdir(snapshot);
  const verified=await verifyPackage(candidate,{mode:'production'});
  assert.equal(verified.packageHash,binding.productPackageHash||'ce2cf417c4d80dd7152bf585804d65ea1ba7a08632e87218953a29f65c36654b');
  report.candidate={path:candidate,packageHash:verified.packageHash,sourceBinding:bindingName};
  report.driverSha256=hash(fs.readFileSync(fileURLToPath(import.meta.url)));
  write('driver-source.mjs',fs.readFileSync(fileURLToPath(import.meta.url)));
  const helperSource=path.join(root,'tests/framework/time-review-native-input.swift');
  report.nativeHelper={path:helperSource,sha256:hash(fs.readFileSync(helperSource))};
  execFileSync('/usr/bin/swiftc',[helperSource,'-o',helper],{timeout:60000,stdio:'pipe'});
  const binary=path.join(root,'tests/.cache/m5-browsers/155.0.8059.39/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  const args=[launcherPath,'--executable',binary,'--report',path.join(runDir,'launcher.json'),'--','--remote-debugging-port=0','--load-extension='+candidate,'--disable-extensions-except='+candidate,'--window-size=1200,900','about:blank'];
  launcher=spawn('/usr/bin/python3',args,{cwd:root,stdio:['ignore','pipe','pipe']});
  launcher.stdout.on('data',x=>fs.appendFileSync(path.join(runDir,'launcher-stdout.log'),x));launcher.stderr.on('data',x=>fs.appendFileSync(path.join(runDir,'launcher-stderr.log'),x));
  meta=await until(()=>{try{return JSON.parse(fs.readFileSync(path.join(runDir,'launcher.json')));}catch{return null;}},'Owned launcher');
  assert(meta.args.includes('--use-mock-keychain')&&meta.args.includes('--password-store=basic'));
  report.instanceCheck=execFileSync('/usr/bin/python3',[checkerPath,path.join(runDir,'launcher.json')],{encoding:'utf8'});
  const endpoint=await until(()=>{try{return fs.readFileSync(path.join(meta.profile,'DevToolsActivePort'),'utf8').trim().split('\n');}catch{return null;}},'Owned CDP');
  browser=await socket('ws://127.0.0.1:'+endpoint[0]+endpoint[1]);report.chromeVersion=await browser.call('Browser.getVersion');
  const sw=await until(async()=>(await browser.call('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url.endsWith('/sw.js')),'Actual extension worker');
  report.extensionId=new URL(sw.url).host;worker=await attach(sw.targetId);
  await until(()=>read(worker,"typeof chrome==='object'&&typeof chrome.proxy?.settings?.get==='function'"),'Worker extension APIs initialized');
  report.proxyBefore=await read(worker,"chrome.proxy.settings.get({incognito:false})");
  report.storageBefore=await storage();
  native('activate');
  await test('Open actual Side Panel from native extension action',async()=>{
    let rows=ax();write('ax-launch.json',rows);
    const extensions=rows.filter(x=>['AXButton','AXPopUpButton'].includes(x.role)&&/^(Extensions|扩展程序菜单|扩展程序|扩展)$/.test(x.description||x.title));
    assert.equal(extensions.length,1,'Unique native Extensions button');
    native('press',extensions[0].description||extensions[0].title);await pause(200);
    rows=ax();write('ax-extensions-menu.json',rows);
    const action=rows.filter(x=>['AXButton','AXMenuItem'].includes(x.role)&&/OpenDesk Browser/.test(x.title+' '+x.description)&&!/(menu|菜单|Options|选项)/i.test(x.title+' '+x.description));
    assert.equal(action.length,1,'Unique actual OpenDesk action');
    native('press',action[0].title||action[0].description);
    const context=await until(async()=>(await read(worker,"chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']})")).find(x=>x.documentUrl?.includes('/ui/tool.html')),'Real SIDE_PANEL context');
    const target=await until(async()=>(await browser.call('Target.getTargets')).targetInfos.find(x=>x.url===context.documentUrl),'Side Panel target');
    side=await attach(target.targetId);originalSide=side;await until(()=>read(side,"!!document.querySelector('#tab-tools')"),'Side Panel ready');
    await screenshot('side-panel-open.png');return {context,targetId:target.targetId};
  });
  await test('Review optional tool through actual Catalog',async()=>{
    await click('#tab-tools');
    await reviewFromMarket();
    await screenshot('install-review.png');return {reviewed:true};
  });
  await test('Install reviewed bytes with a fresh recorded identity',async()=>{
    await click('[data-market-action=confirm-install]');
    await until(async()=>((await storage())['opendesk.sidebar-tools.installed.v1']||[]).some(x=>x.id==='ai-vip-share'),'Verified installed registry');
    report.installedStorage=await storage();
    const expected=JSON.parse(fs.readFileSync(path.join(candidate,'official-tools/ai-vip-share/ai-vip-share.opendesk-tool.json')));
    assert.deepEqual(report.installedStorage['opendesk.sidebar-tools.installed.v1'].find(x=>x.id==='ai-vip-share'),expected);
    side=originalSide;
    const open='[data-extension-key="app:ai-vip-share"][data-extension-action=primary]';
    await until(()=>read(side,'!!document.querySelector('+JSON.stringify(open)+')'),'Actual installed extension row');
    await click(open);
    await until(()=>read(side,"!document.querySelector('#ai-access-trusted-controls')?.hidden&&document.querySelector('#ai-access-status')?.textContent?.includes('不可用')"),'Real Provider failure status');
    const state=await read(side,"({status:document.querySelector('#ai-access-status').textContent,action:document.querySelector('#ai-access-toggle').textContent,disabled:document.querySelector('#ai-access-toggle').disabled,activationHidden:document.querySelector('#ai-access-activation').hidden,live:document.querySelector('#ai-access-status').getAttribute('aria-live')})");
    assert(state.disabled);assert.equal(state.action,'启用代理');assert.equal(state.live,'polite');
    await screenshot('provider-blocked.png');return state;
  });
  await test('Actual opaque sandbox exposes status without extension runtime',async()=>{
    const frame=await until(async()=>(await browser.call('Target.getTargets')).targetInfos.find(x=>x.type==='iframe'&&x.url.includes('/sidebar-tools/sandbox.html')),'Installed opaque sandbox');
    const tool=await attach(frame.targetId);
    const state=await until(()=>read(tool,"(()=>{const h=document.querySelector('#ai-access-help');return h&&h.textContent!=='请使用上方的可信开关控制代理。'?{text:h.textContent,role:h.getAttribute('role'),live:h.getAttribute('aria-live'),runtimeId:globalThis.chrome?.runtime?.id||null,origin:origin}:null})()"),'Actual sandbox status response');
    assert.equal(state.runtimeId,null);assert.equal(state.origin,'null');assert.equal(state.role,'status');assert.equal(state.live,'polite');assert.match(state.text,/不可用/);return state;
  });
  for(const theme of ['light','dark'])for(const width of [300,320,360,420,520]){
    await test('Provider failure UI CSS viewport '+width+' '+theme,async()=>{
      await side.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]});
      await side.call('Emulation.setDeviceMetricsOverride',{width,height:765,deviceScaleFactor:2,mobile:false});await pause(100);
      const state=await read(side,"(()=>{const s=document.querySelector('#ai-access-status'),a=document.querySelector('#ai-access-toggle'),r=s.getBoundingClientRect(),b=a.getBoundingClientRect();return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,background:getComputedStyle(document.documentElement).getPropertyValue('--od-bg').trim(),dark:matchMedia('(prefers-color-scheme:dark)').matches,status:s.textContent,statusRect:{x:r.x,right:r.right,bottom:r.bottom},buttonRect:{x:b.x,right:b.right,bottom:b.bottom},buttonCount:document.querySelectorAll('#ai-access-toggle').length,disabled:a.disabled}})()");
      assert.equal(state.width,width);assert.equal(state.dark,theme==='dark');assert(state.scrollWidth<=width+1,'Document horizontal overflow');assert(state.statusRect.x>=0&&state.statusRect.right<=width+1);assert(state.buttonRect.x>=0&&state.buttonRect.right<=width+1);assert(state.statusRect.bottom<=state.height&&state.buttonRect.bottom<=state.height);assert.equal(state.buttonCount,1);assert(state.disabled);
      await screenshot('failure-'+width+'-'+theme+'.png');return {...state,measurement:'Browser CSS viewport emulation; not physical Side Panel width or zoom acceptance'};
    }).catch(()=>{});
  }
  await side.call('Emulation.clearDeviceMetricsOverride').catch(()=>{});
  await side.call('Emulation.setEmulatedMedia',{features:[]}).catch(()=>{});
  for(const theme of ['light','dark'])await test('Critical status text contrast '+theme,async()=>{
    await side.call('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]});
    const colors=await read(side,"['#ai-access-status','#ai-access-trusted-controls strong'].map(selector=>{const e=document.querySelector(selector);let parent=e,background;while(parent){const b=getComputedStyle(parent).backgroundColor;if(b!=='rgba(0, 0, 0, 0)'&&b!=='transparent'){background=b;break;}parent=parent.parentElement;}return {selector,text:e.textContent,foreground:getComputedStyle(e).color,background};})");
    const measured=colors.map(x=>({...x,ratio:contrast(x.foreground,x.background)}));write('contrast-'+theme+'.json',measured);await screenshot('contrast-'+theme+'.png');
    for(const x of measured)assert(x.ratio>=4.5,x.selector+' contrast '+x.ratio+' below 4.5');return measured;
  }).catch(()=>{});
  await side.call('Emulation.setEmulatedMedia',{features:[]}).catch(()=>{});
  await test('Native keyboard focus and disabled proxy control',async()=>{
    const rows=[];for(let i=0;i<12;i++){native('key','tab');await pause(30);rows.push(await read(side,"(()=>{const e=document.activeElement;return {hasFocus:document.hasFocus(),id:e?.id,tag:e?.tagName,disabled:e?.disabled||false,label:e?.getAttribute('aria-label')||e?.textContent?.trim().slice(0,90)}})()"));}
    assert(rows.some(x=>x.hasFocus&&x.id&&x.tag==='BUTTON'),'Native Tab must reach a real Side Panel button');assert(!rows.some(x=>x.id==='ai-access-toggle'),'Disabled proxy button must not enter Tab order');return rows;
  });
  await test('Disable and re-enable unactivated tool without proxy changes',async()=>{
    await click('#sidebar-tool-enable');
    await until(async()=>(await storage())['opendesk.sidebar-tools.enabled.v1']?.['ai-vip-share']===false,'Actual disabled record');
    report.disabledStorage=await storage();
    assert.deepEqual(await read(worker,"chrome.proxy.settings.get({incognito:false})"),report.proxyBefore);
    await click('#sidebar-tool-enable');
    await until(async()=>(await storage())['opendesk.sidebar-tools.enabled.v1']?.['ai-vip-share']===true,'Actual enabled record');
    report.reenabledStorage=await storage();await screenshot('tool-reenabled-settings.png');
    return {disabled:report.disabledStorage['opendesk.sidebar-tools.enabled.v1']['ai-vip-share'],enabled:report.reenabledStorage['opendesk.sidebar-tools.enabled.v1']['ai-vip-share']};
  });
  await test('Uninstall with visible confirmation cleans only this tool',async()=>{
    await click('#sidebar-tool-remove');await until(()=>read(side,"!document.querySelector('#sidebar-tool-inline-remove').hidden"),'Visible uninstall review');await screenshot('uninstall-review.png');
    await click('#sidebar-tool-inline-remove-confirm');
    await until(async()=>!((await storage())['opendesk.sidebar-tools.installed.v1']||[]).some(x=>x.id==='ai-vip-share'),'Actual removal');
    report.uninstalledStorage=await storage();
    assert.equal(report.uninstalledStorage['opendesk.ai-vip-share.state.v1'],undefined);assert.equal(report.uninstalledStorage['opendesk.ai-access.state.v1'],undefined);
    const before=report.installedStorage['opendesk.sidebar-tools.installed.v1'].filter(x=>x.id!=='ai-vip-share');assert.deepEqual(report.uninstalledStorage['opendesk.sidebar-tools.installed.v1'],before);
    assert.deepEqual(await read(worker,"chrome.proxy.settings.get({incognito:false})"),report.proxyBefore);
    const alarms=await read(worker,"chrome.alarms.getAll()");assert(!alarms.some(x=>['opendesk.ai-vip-share.lease-check.v1','opendesk.ai-access.lease-check.v1'].includes(x.name)));return {remainingTools:before.map(x=>x.id),proxyUnchanged:true,aiAlarmsAbsent:true};
  });
  await test('Reinstall same fixed bytes has an epoch distinct from retired requests',async()=>{
    await click('#tab-tools');await reviewFromMarket();await click('[data-market-action=confirm-install]');
    await until(async()=>((await storage())['opendesk.sidebar-tools.installed.v1']||[]).some(x=>x.id==='ai-vip-share'),'Actual reinstall');
    report.reinstalledStorage=await storage();
    const installed=report.reinstalledStorage['opendesk.sidebar-tools.installed.v1'].find(x=>x.id==='ai-vip-share');assert.deepEqual(installed,JSON.parse(fs.readFileSync(path.join(candidate,'official-tools/ai-vip-share/ai-vip-share.opendesk-tool.json'))));
    const old=report.reenabledStorage['opendesk.sidebar-tools.revocation-epochs.v1']?.['ai-vip-share']??null,next=report.reinstalledStorage['opendesk.sidebar-tools.revocation-epochs.v1']?.['ai-vip-share']??null;
    assert.equal(typeof next,'string');assert.notEqual(next,old);assert.equal(report.reinstalledStorage['opendesk.ai-vip-share.state.v1'],undefined);assert.equal(report.reinstalledStorage['opendesk.ai-access.state.v1'],undefined);
    side=originalSide;return {oldEpoch:old,newEpoch:next,packageIdentical:true,activationStateAbsent:true};
  });
  report.proxyAfter=await read(worker,"chrome.proxy.settings.get({incognito:false})");assert.deepEqual(report.proxyAfter,report.proxyBefore,'Installing/viewing blocked tool must not change proxy');
  report.status=report.cases.some(x=>x.status==='FAIL')?'PARTIAL':'SCOPED_PASS';report.remaining=['Actual activation and active-proxy lifecycle not exercised; missing Provider/public SDK.','CSS viewport emulation is not physical panel resizing or zoom acceptance.','Current combined main, independent eight-dimension scores, F3/ZIP remain unaccepted.'];
}catch(error){report.status='PARTIAL';report.error=error.stack||String(error);console.error(report.error);process.exitCode=1;}
finally{
  if(side)await screenshot('final.png').catch(()=>{});
  try{await browser?.call('Browser.close');}catch{}
  for(const s of sessions)s.close();
  if(launcher){await until(()=>launcher.exitCode!==null||launcher.signalCode!==null,'Owned launcher exit',5000).catch(()=>launcher.kill('SIGTERM'));await until(()=>launcher.exitCode!==null||launcher.signalCode!==null,'Owned launcher cleanup',12000).catch(e=>{report.cleanupError=e.message;});}
  report.cleanup={launcherExit:launcher?.exitCode,launcherSignal:launcher?.signalCode,profileRemoved:meta?!fs.existsSync(meta.profile):null};
  report.boundInputsStillMatch=binding.overlay.every(x=>hash(fs.readFileSync(path.join(binding.snapshot,x.path)))===x.sha256);
  report.finishedAt=new Date().toISOString();write('report.json',report);
  console.log('EVIDENCE '+runDir);
}
