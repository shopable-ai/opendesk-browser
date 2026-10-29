// Core development smoke only. No snapshots/history/export or formal release claim.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline';
import {launchChrome} from '../../../../tests/framework/k5-sdk-native-launcher.mjs';
import {connect,evaluate} from '../../../../tests/framework/sidebar-native-session.mjs';
const root=process.cwd(),out=resolve('artifacts/sidebar-tools/browser-fingerprint/native-core/'+Date.now());
const args=process.argv.slice(2),headed=args.includes('--headed'),keepOpen=args.includes('--keep-open');
assert(args.every(arg=>['--headed','--keep-open'].includes(arg)),'Only --headed and --keep-open are supported');
assert(!keepOpen||headed,'--keep-open requires --headed');
await mkdir(out,{recursive:true});
const extension=resolve('dist/development');
const binary=resolve('tests/.cache/m5-browsers/154.0.8037.92/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const toolPackage=resolve('examples/sidebar-tools/browser-fingerprint/browser-fingerprint.opendesk-tool.json');
const pause=ms=>new Promise(ok=>setTimeout(ok,ms));
const until=async(fn,label)=>{let last;for(let i=0;i<120;i++){try{const result=await fn();if(result)return result;}catch(e){last=e;}await pause(150);}throw Error(label+' timed out '+(last?.message||''));};
const evidence={stage:'CORE_DEVELOPMENT',native:'NOT_TESTED',checks:[],extensionPath:extension,headed,keepOpen,formalAcceptance:'NOT_TESTED'};
let launched,c;
try{
 launched=await launchChrome({root,binary,extension,headed,directory:out,label:'fp-core'});
 await writeFile(join(out,'session.json'),JSON.stringify({driverPid:process.pid,endpoint:launched.endpoint,...launched.metadata,headed,keepOpen},null,2)+'\n');
 console.log(JSON.stringify({out,headed,pid:launched.metadata.pid,profile:launched.metadata.profile}));
 c=await connect(launched.endpoint);
 const attach=async targetId=>(await c.send('Target.attachToTarget',{targetId,flatten:true})).sessionId;
 if(headed){
  // Fresh headed CFT disables unpacked extensions unless its own visible
  // Developer Mode switch is on. Use that UI, never write Profile settings.
  const setup=await c.send('Target.createTarget',{url:'chrome://extensions/'}),setupSession=await attach(setup.targetId);
  const toggle="document.querySelector('extensions-manager')?.shadowRoot.querySelector('extensions-toolbar')?.shadowRoot.querySelector('#devMode')";
  const box=await until(()=>evaluate(c,`(()=>{const n=${toggle};if(!n)return null;const r=n.getBoundingClientRect();return {checked:n.getAttribute('aria-checked')==='true',x:r.x+r.width/2,y:r.y+r.height/2};})()`,setupSession),'CFT Developer Mode UI');
  if(!box.checked)for(const type of ['mousePressed','mouseReleased'])await c.send('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,x:box.x,y:box.y},setupSession);
  await until(()=>evaluate(c,`${toggle}?.getAttribute('aria-checked')==='true'`,setupSession),'CFT Developer Mode enabled');
  evidence.developerMode='ENABLED_THROUGH_CHROME_UI';
  evidence.loadedExtensions=await evaluate(c,"chrome.developerPrivate.getExtensionsInfo({includeDisabled:true,includeTerminated:true}).then(rows=>rows.map(({id,path,state})=>({id,path,state})))",setupSession);
  assert(evidence.loadedExtensions.some(row=>row.path===extension&&row.state==='ENABLED'),'enabled extension at daily development path');
  await c.send('Target.closeTarget',{targetId:setup.targetId});
 }
 const sw=await until(async()=>(await c.send('Target.getTargets')).targetInfos.find(t=>t.type==='service_worker'&&t.url.endsWith('/sw.js')),'extension service worker');
 evidence.extensionId=new URL(sw.url).host;evidence.browser=await c.send('Browser.getVersion');
 evidence.toolSha256=createHash('sha256').update(await readFile(toolPackage)).digest('hex');
 const target=await c.send('Target.createTarget',{url:'http://127.0.0.1:43111/demo-form.html'}),page=await attach(target.targetId);
 await until(()=>evaluate(c,"document.readyState==='complete'",page),'target loaded');
 const hostId=randomUUID();let hostTarget=await c.send('Target.createTarget',{url:'chrome-extension://'+evidence.extensionId+'/sidepanel.html?hostInstanceId='+hostId});let host=await attach(hostTarget.targetId);
 await c.send('Runtime.enable',{},host);
 const read=expr=>evaluate(c,expr,host);
 const click=async selector=>{
  const box=await read(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled)return null;n.scrollIntoView({block:'center'});const r=n.getBoundingClientRect();return r.width&&r.height?{x:r.x+r.width/2,y:r.y+r.height/2}:null;})()`);
  assert(box,'Visible enabled control '+selector);
  await c.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...box},host);
  await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...box},host);
 };
 await until(()=>read("document.readyState==='complete'&&document.body.innerText.length>50"),'trusted UI');
 if(headed)await read('chrome.windows.getCurrent().then(w=>chrome.windows.update(w.id,{focused:true}))');
 const ordinaryTarget=hostTarget.targetId;
 await c.send('Target.activateTarget',{targetId:target.targetId});
 await click('#catalog-open-dev-sidebar');
 hostTarget=await until(async()=>(await c.send('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&t.url.includes('/sidepanel.html')&&t.targetId!==ordinaryTarget),'actual Side Panel');
 host=await attach(hostTarget.targetId);
 await until(()=>read("!!document.querySelector('#tab-tools')?.getBoundingClientRect().height"),'React tabs');
 evidence.contexts=await read('chrome.runtime.getContexts({})');
 assert(evidence.contexts.some(row=>row.contextType==='SIDE_PANEL'),'actual Chrome Side Panel context');
 await click('#tab-tools');await click('#extension-center-more');await click('#extension-center-import');
 await until(()=>read("!!document.querySelector('#sidebar-tool-file')?.getBoundingClientRect().height"),'import control');
 await c.send('DOM.enable',{},host);
 const {root:dom}=await c.send('DOM.getDocument',{depth:-1,pierce:true},host);
 const {nodeId}=await c.send('DOM.querySelector',{nodeId:dom.nodeId,selector:'#sidebar-tool-file'},host);
 await c.send('DOM.setFileInputFiles',{nodeId,files:[toolPackage]},host);
 await until(()=>read("!!document.querySelector('#sidebar-tool-install')?.getBoundingClientRect().height&&!document.querySelector('#sidebar-tool-install').disabled"),'review ready');
 assert((await read('document.body.innerText')).includes('只读检测已授权当前网页'),'capability reviewed');
 await click('#sidebar-tool-install');
 const appSelector='[data-extension-key="app:browser-fingerprint"][data-extension-action="main"]';
 await until(()=>read(`!!document.querySelector(${JSON.stringify(appSelector)})`),'installed app');
 evidence.checks.push('REAL_INSTALL_REVIEW_PASS');
 await click(appSelector);
 const sandboxTarget=await until(async()=>(await c.send('Target.getTargets')).targetInfos.find(t=>t.type==='iframe'&&t.url.endsWith('/sidebar-tools/sandbox.html')),'sandbox');
 const sandbox=await attach(sandboxTarget.targetId),appRead=expr=>evaluate(c,expr,sandbox);
 const appClick=async()=>{
  const box=await appRead("(()=>{const n=document.querySelector('.fp-actions button');if(!n||n.disabled)return null;n.scrollIntoView({block:'center'});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()");assert(box);
  for(const type of ['mousePressed','mouseReleased'])await c.send('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...box},sandbox);
 };
 await until(()=>appRead("!!document.querySelector('.fp-actions button')&&!document.querySelector('.fp-actions button').disabled"),'Detect ready');
 await appClick();
 await until(()=>read("!!document.querySelector('#sidebar-tool-action-cancel')?.getBoundingClientRect().height"),'site review');
 await click('#sidebar-tool-action-cancel');
 await until(()=>appRead("!document.querySelector('.fp-actions button').disabled"),'cancel receipt');
 assert.equal(await appRead("document.querySelectorAll('.fp-status.fp-ok').length"),0);
 evidence.checks.push('SITE_DENIAL_NO_VALUES_PASS');
 await appClick();
 await until(()=>read("!!document.querySelector('#sidebar-tool-action-continue')?.getBoundingClientRect().height"),'second review');
 // Regression for the reproduced 8-second sandbox cutoff: approval remains
 // pending beyond that old deadline, while the native collector stays at 3s.
 await pause(8500);
 assert.equal(await appRead("document.querySelector('.fp-actions button').disabled"),true);
 await click('#sidebar-tool-action-continue');
 await until(()=>appRead("document.querySelector('.fp-notice')?.textContent.includes('已读取当前网页六项环境字段')"),'six real values');
 evidence.checks.push('REVIEW_BUDGET_AND_REAL_SIX_FIELDS_PASS');
 const observed=await appRead("[...document.querySelectorAll('.fp-field')].map(n=>({label:n.querySelector('strong').textContent,status:n.querySelector('.fp-status').textContent,value:n.querySelector('.fp-value').textContent,source:n.querySelector('.fp-source').textContent}))");
 const independent=await evaluate(c,"({userAgent:navigator.userAgent,languages:navigator.languages,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,viewport:{width:innerWidth,height:innerHeight},screen:{width:screen.width,height:screen.height},devicePixelRatio})",page);
 const names=['userAgent','languages','timeZone','viewport','screen','devicePixelRatio'];
 observed.slice(3).forEach((row,i)=>{if(typeof independent[names[i]]==='string')assert.equal(row.value,independent[names[i]]);else assert.deepEqual(JSON.parse(row.value),independent[names[i]]);assert(row.source.includes('MAIN'));});
 evidence.fields=observed;evidence.independentTargetValues=independent;
 evidence.checks.push('INDEPENDENT_TARGET_VALUE_MATCH_PASS');
 await appClick();await until(()=>appRead("document.querySelector('.fp-notice')?.textContent.includes('已读取当前网页六项环境字段')&&!document.querySelector('.fp-actions button').disabled"),'repeat detection');
 assert.equal(await read("!!document.querySelector('#sidebar-tool-action-continue')?.getBoundingClientRect().height"),false);
 evidence.checks.push('REPEAT_WITHOUT_SECOND_SITE_REVIEW_PASS');
 if(keepOpen){
  // Exercise one complete 60-second Host request window. A one-second pair
  // of identity/status polls used to consume all 120 requests and clear UI.
  const started=Date.now();
  for(let sample=0;sample<6;sample++){
   await pause(11000);
   assert.equal(await appRead("document.querySelectorAll('.fp-status.fp-ok').length"),9,'retained fields survive the Host request window');
   assert.equal(await appRead("document.querySelector('.fp-notice')?.textContent.includes('请求过于频繁')"),false);
  }
  evidence.retainedReadMs=Date.now()-started;
  evidence.checks.push('VISIBLE_RESULT_SURVIVES_RATE_WINDOW_PASS');
 }
 const shot=await c.send('Page.captureScreenshot',{captureBeyondViewport:true},host);
 await writeFile(join(out,'core-detection.png'),Buffer.from(shot.data,'base64'));
 await writeFile(join(out,'core-ui.txt'),await appRead('document.body.innerText'));
 await c.send('Page.navigate',{url:'http://127.0.0.1:43111/demo-form.html?fingerprint=next'},page);
 await until(()=>appRead("document.querySelectorAll('.fp-status.fp-ok').length===0"),'navigation clears old values');
 evidence.checks.push('NAVIGATION_CLEARS_OLD_VALUES_PASS');
 await until(()=>evaluate(c,"document.readyState==='complete'",page),'new target loaded');
 await appClick();await until(()=>appRead("document.querySelector('.fp-notice')?.textContent.includes('已读取当前网页六项环境字段')"),'new document detection');
 evidence.checks.push('NEW_DOCUMENT_DETECTION_PASS');
 const another=await c.send('Target.createTarget',{url:'http://127.0.0.1:43111/demo-form.html?fingerprint=another-tab'});
 await c.send('Target.activateTarget',{targetId:another.targetId});
 await until(()=>appRead("document.querySelectorAll('.fp-status.fp-ok').length===0"),'tab switch clears old values');
 evidence.checks.push('TAB_SWITCH_CLEARS_OLD_VALUES_PASS');
 if(keepOpen){
  await c.send('Target.activateTarget',{targetId:target.targetId});
  await pause(2700);
  await until(()=>appRead("!document.querySelector('.fp-actions button').disabled"),'retained target ready');
  await appClick();
  await until(()=>appRead("document.querySelector('.fp-notice')?.textContent.includes('已读取当前网页六项环境字段')&&!document.querySelector('.fp-actions button').disabled"),'retained visible result');
  await c.send('Target.closeTarget',{targetId:ordinaryTarget});
  await pause(2700);
  assert.equal(await appRead("document.querySelectorAll('.fp-status.fp-ok').length"),9,'retained result remains bound to the active target');
  evidence.retainedTarget={targetId:target.targetId,url:'http://127.0.0.1:43111/demo-form.html?fingerprint=next',sidePanelTargetId:hostTarget.targetId};
 }
 evidence.native='CORE_PASS';
 console.log(JSON.stringify({out,native:evidence.native,checks:evidence.checks,fields:evidence.fields}));
}catch(error){evidence.error=String(error?.stack||error);console.error(evidence.error);process.exitCode=1;}
finally{
 await writeFile(join(out,'result.json'),JSON.stringify(evidence,null,2)+'\n');
 c?.close();
 if(launched&&keepOpen){
  console.log(JSON.stringify({windowRetained:true,out,driverPid:process.pid,close:'Enter close or send SIGTERM to this driver; the original launcher owns cleanup.'}));
  await new Promise(done=>{
   const input=createInterface({input:process.stdin});
   const finish=()=>{input.close();process.off('SIGINT',finish);process.off('SIGTERM',finish);done();};
   input.on('line',line=>{if(line.trim()==='close')finish();});
   process.once('SIGINT',finish);process.once('SIGTERM',finish);
  });
 }
 if(launched){await launched.copyLog();await launched.stop();}
}
