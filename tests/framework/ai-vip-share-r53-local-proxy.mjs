// Source-bound local development acceptance. Native input performs every install
// and proxy mutation; CDP observes state and drives real network navigation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const candidate=path.resolve(process.argv[2]||'.runtime/ai-vip-share-r53-01a13fda/candidate/dist/development');
const runDir=path.resolve(process.argv[3]||'.runtime/ai-vip-share-r53-01a13fda/chrome-'+Date.now());
fs.mkdirSync(runDir,{recursive:true});
const write=(name,data)=>fs.writeFileSync(path.join(runDir,name),typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data,null,2)+'\n');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const report={status:'IN_PROGRESS',startedAt:new Date().toISOString(),candidate,mode:'ISOLATED_DEVELOPMENT_LOCAL_ADAPTER',cases:[],network:[],limits:['Mock technical lease, not production member authorization.','Public Managed Proxy SDK remains unapproved.','Static verified build/F3/ZIP are separate gates.']};
const launcherPath='/Users/shopme/.codex/skills/chrome-testing-keychain/scripts/launch.py';
const checkerPath=path.join(path.dirname(launcherPath),'check_instance.py');
const helper=path.join(runDir,'native-input');
let launcher,meta,browser,side,worker,originalSide;
const sessions=[];
async function until(fn,label,ms=20000){
  const end=Date.now()+ms;let error;
  while(Date.now()<end){try{const value=await fn();if(value)return value;}catch(e){error=e;}await pause(100);}
  throw Error(label+(error?': '+error.message:''));
}
async function socket(url){
  const ws=new WebSocket(url),pending=new Map(),events=[];let id=0;
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  ws.addEventListener('message',event=>{const row=JSON.parse(String(event.data)),p=pending.get(row.id);if(p){pending.delete(row.id);clearTimeout(p.timer);row.error?p.reject(Error(JSON.stringify(row.error))):p.resolve(row.result);}else if(row.method)events.push(row);});
  const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const seq=++id,timer=setTimeout(()=>{pending.delete(seq);reject(Error('CDP timeout '+method));},30000);pending.set(seq,{resolve,reject,timer});ws.send(JSON.stringify({id:seq,method,params,...(sessionId?{sessionId}:{})}));});
  const client={call,events,close(){ws.close();for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('closed'));}pending.clear();}};sessions.push(client);return client;
}
async function read(target,expression){
  const r=await target.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
  return r.result?.value;
}
async function attach(targetId){
  const {sessionId}=await browser.call('Target.attachToTarget',{targetId,flatten:true});
  const target={targetId,sessionId,call:(method,params)=>browser.call(method,params,sessionId)};
  await target.call('Runtime.enable');return target;
}
function native(command,...args){
  execFileSync('/usr/bin/python3',[checkerPath,path.join(runDir,'launcher.json')],{timeout:10000});
  const result=execFileSync(helper,[String(meta.pid),command,...args],{encoding:'utf8',timeout:12000});
  fs.appendFileSync(path.join(runDir,'native-input.jsonl'),JSON.stringify({at:new Date().toISOString(),command,args,result})+'\n');return result;
}
const ax=()=>JSON.parse(native('dump'));
async function click(selector){
  const lookup=selector.startsWith('text:')?`[...document.querySelectorAll('button,a')].find(e=>e.textContent.trim()===${JSON.stringify(selector.slice(5))}&&e.getClientRects().length)`:`document.querySelector(${JSON.stringify(selector)})`;
  const expression=`(()=>{const e=${lookup};if(!e||e.disabled||!e.getClientRects().length)return null;const r=e.getBoundingClientRect();return {name:e.getAttribute('aria-label')||e.textContent.trim()||e.title,rect:{x:r.x,y:r.y,width:r.width,height:r.height},viewport:{width:innerWidth,height:innerHeight}};})()`;
  let info=await until(()=>read(side,expression),'Visible enabled control '+selector);
  let unchanged=0;
  for(let n=0;n<65&&(info.rect.y+info.rect.height/2<20||info.rect.y+info.rect.height/2>=info.viewport.height-20);n++){
    const before=info.rect.y;native('key',before<20?'up':'down');await pause(100);info=await read(side,expression);
    assert(info,'Control disappeared '+selector);unchanged=info.rect.y===before?unchanged+1:0;assert(unchanged<4,'Native scroll did not move '+selector);
  }
  // Let native keyboard scrolling settle before sampling AX coordinates.
  // An in-flight smooth scroll can otherwise move the button under the click.
  await pause(400);info=await read(side,expression);assert(info,'Settled visible control '+selector);
  const rows=ax();const controls=rows.filter(x=>['AXButton','AXRadioButton','AXCheckBox','AXPopUpButton','AXLink'].includes(x.role)&&x.enabled!==false&&x.size?.width>0&&x.size?.height>0&&[x.title,x.description].includes(info.name));
  let point;
  if(controls.length===1)point={x:controls[0].position.x+controls[0].size.width/2,y:controls[0].position.y+controls[0].size.height/2};
  else{const areas=rows.filter(x=>x.role==='AXWebArea'&&Math.abs(x.size?.width-info.viewport.width)<3&&Math.abs(x.size?.height-info.viewport.height)<3);assert.equal(areas.length,1,'Unique actual AXWebArea '+selector);point={x:areas[0].position.x+info.rect.x+info.rect.width/2,y:areas[0].position.y+info.rect.y+info.rect.height/2};}
  fs.appendFileSync(path.join(runDir,'clicks.jsonl'),JSON.stringify({at:new Date().toISOString(),selector,info,point})+'\n');
  native('click-at',String(point.x),String(point.y));await pause(150);
}
async function screenshot(name){const r=await side.call('Page.captureScreenshot',{format:'png'});write(name,Buffer.from(r.data,'base64'));}
const proxy=()=>read(worker,'chrome.proxy.settings.get({incognito:false})');
const storage=()=>read(worker,"chrome.storage.local.get(['opendesk.sidebar-tools.installed.v1','opendesk.sidebar-tools.revocation-epochs.v1','opendesk.ai-vip-share.state.v1'])");
async function check(name,fn){const row={name,startedAt:new Date().toISOString()};report.cases.push(row);try{row.evidence=await fn();row.status='PASS';}catch(e){row.status='FAIL';row.error=e.stack||String(e);throw e;}finally{write('report.json',report);console.log(row.status+' '+name);}}
async function localApi(route,body){const r=await fetch('http://127.0.0.1:7898'+route,{method:body?'POST':'GET',headers:{'X-OpenDesk-Local-Test':'1',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});assert(r.ok,await r.clone().text());return r.json();}
async function navigate(url){
  const {targetId}=await browser.call('Target.createTarget',{url:'about:blank'}),page=await attach(targetId);
  await page.call('Network.enable');const start=browser.events.length;
  let result;try{result=await page.call('Page.navigate',{url});}catch(e){result={errorText:e.message};}
  await pause(1200);
  const events=browser.events.slice(start).filter(x=>x.sessionId===page.sessionId&&x.method.startsWith('Network.')).map(x=>({method:x.method,params:x.method==='Network.responseReceived'?{type:x.params.type,response:{url:x.params.response.url,status:x.params.response.status,remoteIPAddress:x.params.response.remoteIPAddress,remotePort:x.params.response.remotePort,protocol:x.params.response.protocol}}:x.method==='Network.loadingFailed'?x.params:{requestId:x.params.requestId,type:x.params.type,url:x.params.request?.url}}));
  const row={url,result,events};report.network.push(row);write('network.json',report.network);await browser.call('Target.closeTarget',{targetId});return row;
}
try{
  assert.equal(execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim(),'main');
  report.sourceHead=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  report.packageFiles=Object.fromEntries(['manifest.json','sw.js','ui/sidebar-tool-host.js'].map(name=>[name,hash(fs.readFileSync(path.join(candidate,name)))]));
  const helperSource=path.join(root,'tests/framework/time-review-native-input.swift');
  report.helperSha256=hash(fs.readFileSync(helperSource));report.driverSha256=hash(fs.readFileSync(fileURLToPath(import.meta.url)));
  execFileSync('/usr/bin/swiftc',[helperSource,'-o',helper],{timeout:60000,stdio:'pipe'});
  const binary=path.join(root,'tests/.cache/m5-browsers/155.0.8059.39/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
  launcher=spawn('/usr/bin/python3',[launcherPath,'--executable',binary,'--report',path.join(runDir,'launcher.json'),'--','--remote-debugging-port=0','--load-extension='+candidate,'--disable-extensions-except='+candidate,'--log-net-log='+path.join(runDir,'netlog.json'),'--net-log-capture-mode=Default','--window-size=1200,900','about:blank'],{cwd:root,stdio:['ignore','pipe','pipe']});
  for(const [stream,name]of [[launcher.stdout,'launcher-stdout.log'],[launcher.stderr,'launcher-stderr.log']])stream.on('data',x=>fs.appendFileSync(path.join(runDir,name),x));
  meta=await until(()=>{try{return JSON.parse(fs.readFileSync(path.join(runDir,'launcher.json')));}catch{return null;}},'Owned launcher');
  const endpoint=await until(()=>{try{return fs.readFileSync(path.join(meta.profile,'DevToolsActivePort'),'utf8').trim().split('\n');}catch{return null;}},'Owned CDP');
  browser=await socket('ws://127.0.0.1:'+endpoint[0]+endpoint[1]);report.chrome=await browser.call('Browser.getVersion');
  const sw=await until(async()=>(await browser.call('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url.endsWith('/sw.js')),'Extension worker');
  report.extensionId=new URL(sw.url).host;worker=await attach(sw.targetId);
  await until(()=>read(worker,"typeof chrome==='object'&&typeof chrome.proxy?.settings?.get==='function'"),'Worker API initialized');
  report.proxyBefore=await proxy();report.storageBefore=await storage();
  report.webLock=await read(worker,"navigator.locks.request('opendesk.r53:probe',()=>({available:true,origin:location.origin}))");
  native('activate');
  await check('Actual native Side Panel, official review and install',async()=>{
    let rows=ax();let menu=rows.filter(x=>['AXButton','AXPopUpButton'].includes(x.role)&&/^(Extensions|扩展程序菜单|扩展程序|扩展)$/.test(x.description||x.title));
    assert.equal(menu.length,1);native('press',menu[0].description||menu[0].title);await pause(200);rows=ax();
    const action=rows.filter(x=>['AXButton','AXMenuItem'].includes(x.role)&&/OpenDesk Browser/.test(x.title+' '+x.description)&&!/(menu|菜单|Options|选项)/i.test(x.title+' '+x.description));assert.equal(action.length,1);native('press',action[0].title||action[0].description);
    const context=await until(async()=>(await read(worker,"chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']})")).find(x=>x.documentUrl?.includes('/ui/tool.html')),'Real Side Panel');
    const target=await until(async()=>(await browser.call('Target.getTargets')).targetInfos.find(x=>x.url===context.documentUrl),'Side target');side=originalSide=await attach(target.targetId);
    await pause(1000);await click('#tab-tools');
    await until(()=>read(side,"document.querySelector('#tab-tools')?.getAttribute('aria-selected')==='true'"),'Extensions tab selected');
    const before=new Set((await browser.call('Target.getTargets')).targetInfos.map(x=>x.targetId));await click('#extension-center-market');
    const market=await until(async()=>(await browser.call('Target.getTargets')).targetInfos.find(x=>!before.has(x.targetId)&&x.type==='page'&&x.url.includes('/ui/marketplace.html')),'Marketplace');side=await attach(market.targetId);
    const tool=JSON.parse(fs.readFileSync(path.join(candidate,'official-tools/ai-vip-share/ai-vip-share.opendesk-tool.json')));
    await click('a[href="#/apps/opendesk/ai-vip-share/versions/'+tool.version+'"]');await click('text:审阅并安装');await screenshot('review.png');await click('[data-market-action=confirm-install]');
    await until(async()=>((await storage())['opendesk.sidebar-tools.installed.v1']||[]).some(x=>x.id==='ai-vip-share'),'Installed registry');
    report.installed=await storage();assert.deepEqual(report.installed['opendesk.sidebar-tools.installed.v1'].find(x=>x.id==='ai-vip-share'),tool);
    side=originalSide;await browser.call('Target.activateTarget',{targetId:side.targetId});native('activate');
    await click('[data-extension-key="app:ai-vip-share"][data-extension-action=primary]');
    await until(()=>read(side,"!!document.querySelector('#ai-access-local-activate')&&!document.querySelector('#ai-access-local-activate').disabled"),'Trusted local activation');
    return {context,version:tool.version};
  });
  await check('Trusted activation obtains a real mock technical lease without enabling proxy',async()=>{
    await click('#ai-access-local-activate');await until(()=>read(side,"document.querySelector('#ai-access-toggle')?.disabled===false&&document.querySelector('#ai-access-toggle')?.textContent==='启用代理'"),'Activated');
    const saved=await storage();assert.equal(saved['opendesk.ai-vip-share.state.v1'].desired,false);assert(saved['opendesk.ai-vip-share.state.v1'].lease.leaseId.startsWith('fixture-'));assert.deepEqual(await proxy(),report.proxyBefore);await screenshot('activated.png');return saved;
  });
  await check('Trusted enable applies and reads back owned mandatory HTTP PAC',async()=>{
    await click('#ai-access-toggle');await until(()=>read(side,"document.querySelector('#ai-access-trusted-controls [role=status]')?.textContent==='代理已启用'"),'Chrome confirmed enabled');
    report.proxyEnabled=await proxy();assert.equal(report.proxyEnabled.levelOfControl,'controlled_by_this_extension');assert.equal(report.proxyEnabled.value.mode,'pac_script');assert.equal(report.proxyEnabled.value.pacScript.mandatory,true);assert.match(report.proxyEnabled.value.pacScript.data,/PROXY 127\.0\.0\.1:7897/);await screenshot('enabled.png');return report.proxyEnabled;
  });
  await check('Actual AI, subdomain, lookalike and ordinary network requests (NetLog verdict follows)',async()=>{
    for(const host of ['chatgpt.com','api.openai.com','claude.ai','gemini.google.com','www.perplexity.ai','chatgpt.com.evil.example','example.com'])await navigate('https://'+host+'/?r53='+crypto.randomUUID());
    return {requests:report.network.length,proof:'Network events plus final NetLog, not HTTP status alone'};
  });
  await browser.call('Target.activateTarget',{targetId:side.targetId});native('activate');
  await check('Worker restart keeps lease ownership and reconciles actual Chrome PAC',async()=>{
    await side.call('ServiceWorker.enable');await pause(200);
    const versions=browser.events.filter(x=>x.method==='ServiceWorker.workerVersionUpdated').flatMap(x=>x.params.versions);
    const version=versions.find(x=>x.scriptURL===sw.url);assert(version,'Actual extension Worker version');
    const before=await storage();await side.call('ServiceWorker.stopWorker',{versionId:version.versionId});await pause(300);
    await side.call('Page.reload');
    const next=await until(async()=>(await browser.call('Target.getTargets')).targetInfos.find(x=>x.type==='service_worker'&&x.url===sw.url&&x.targetId!==sw.targetId),'Replacement Worker');worker=await attach(next.targetId);
    await until(async()=>(await proxy()).levelOfControl==='controlled_by_this_extension','Reconciled PAC');assert.deepEqual((await storage())['opendesk.ai-vip-share.state.v1'].proxyOwner,before['opendesk.ai-vip-share.state.v1'].proxyOwner);return {beforeTarget:sw.targetId,afterTarget:next.targetId,proxy:await proxy()};
  });
  await check('Trusted STOP releases only own setting and restores the prior Chrome configuration',async()=>{
    await until(()=>read(side,"document.querySelector('#ai-access-toggle')?.textContent==='停用代理'"),'Stop after reload');await click('#ai-access-toggle');
    await until(async()=>(await storage())['opendesk.ai-vip-share.state.v1']?.releasePending===false&&!(await storage())['opendesk.ai-vip-share.state.v1']?.desired,'Durable stopped');
    report.proxyStopped=await proxy();assert.deepEqual(report.proxyStopped,report.proxyBefore);await screenshot('stopped.png');return report.proxyStopped;
  });
  await check('Real delayed verify and native STOP cannot commit a late ENABLE',async()=>{
    await localApi('/api/fixture/verify-delay',{delayMs:4000});await click('#ai-access-toggle');
    await until(async()=>(await localApi('/api/fixture/verify-delay')).verificationsInFlight>0,'Real delayed verification');await click('#ai-access-toggle');
    await until(()=>read(side,"document.querySelector('#ai-access-toggle')?.textContent==='启用代理'&&!document.querySelector('#ai-access-toggle')?.disabled"),'STOP completion',12000);
    await pause(300);assert.deepEqual(await proxy(),report.proxyBefore);const saved=(await storage())['opendesk.ai-vip-share.state.v1'];assert.equal(saved.desired,false);assert.equal(saved.releasePending,false);return {state:saved,proxy:await proxy()};
  });
  report.status='RUNTIME_PASS_NETWORK_REVIEW_PENDING';
}catch(error){report.status='PARTIAL';report.error=error.stack||String(error);console.error(report.error);process.exitCode=1;}
finally{
  if(side)try{await screenshot('final.png');write('final-dom.json',await read(side,"({text:document.body.innerText,tab:document.querySelector('#tab-tools')?.outerHTML})"));write('final-ax.json',ax());}catch{}
  if(browser)write('runtime-errors.json',browser.events.filter(x=>x.method==='Runtime.exceptionThrown'));
  // On failure, use the same genuine trusted STOP if available. Never inject
  // a proxy setting, lease or receipt to make cleanup appear successful.
  if(side&&worker)try{if((await storage())['opendesk.ai-vip-share.state.v1']?.desired){await browser.call('Target.activateTarget',{targetId:side.targetId});native('activate');await click('#ai-access-toggle');await until(async()=>(await proxy()).levelOfControl!=='controlled_by_this_extension','Cleanup STOP');}}catch(e){report.cleanupError=e.message;}
  if(worker)try{report.proxyAfter=await proxy();}catch{}
  try{await browser?.call('Browser.close');}catch{}
  for(const s of sessions)s.close();
  if(launcher){await until(()=>launcher.exitCode!==null||launcher.signalCode!==null,'Launcher exit',5000).catch(()=>launcher.kill('SIGTERM'));await until(()=>launcher.exitCode!==null||launcher.signalCode!==null,'Launcher cleanup',12000).catch(e=>{report.cleanupError=e.message;});}
  report.cleanup={launcherExit:launcher?.exitCode,profileRemoved:meta?!fs.existsSync(meta.profile):null};report.finishedAt=new Date().toISOString();write('report.json',report);console.log('EVIDENCE '+runDir);
}
