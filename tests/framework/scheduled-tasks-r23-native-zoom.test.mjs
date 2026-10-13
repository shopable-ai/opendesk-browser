// Real Chrome native tabs.setZoom + original scheduled runner UI acceptance.
// This is Chrome's actual page zoom, not CDP DeviceMetricsOverride.
// Dedicated TAB evidence; real Side Panel physical width remains separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {setTimeout as sleep} from 'node:timers/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {connect,evaluate} from './sidebar-native-session.mjs';
import {packageFingerprint} from '../../scripts/verify-package.mjs';

const RUN=process.env.SCHEDULE_NATIVE_ZOOM==='1';
const ROOT=process.cwd();
const OUT=path.resolve(process.env.SCHEDULE_NATIVE_OUT||'artifacts/r23-native-zoom');
const ext=path.resolve('dist/production');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const expr=sel=>'document.querySelector('+JSON.stringify(sel)+')';
async function until(fn,name,ms=30000){
  const deadline=Date.now()+ms;let error='';
  while(Date.now()<deadline){
    try{const row=await fn();if(row)return row;}catch(e){error=String(e);}
    await sleep(200);
  }
  throw Error(name+' not observed'+(error?': '+error:''));
}
async function click(client,session,selector){
  const box=await until(()=>evaluate(client,'(()=>{const e='+expr(selector)+
    ';if(!e||e.disabled||e.getClientRects().length===0)return null;'+
    'const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};})()',session),
  'native zoom click target '+selector);
  assert(box.w>=8&&box.h>=8,'real target is sufficiently visible');
  for(const type of ['mousePressed','mouseReleased'])
    await client.send('Input.dispatchMouseEvent',{
      type,x:box.x,y:box.y,button:'left',clickCount:1},session);
}
async function snapshot(client,session,label){
  const data=(await client.send('Page.captureScreenshot',{
    format:'png',captureBeyondViewport:false},session)).data;
  const bytes=Buffer.from(data,'base64');
  const filename=label+'.png';
  await writeFile(path.join(OUT,filename),bytes);
  return {filename,bytes:bytes.length,sha256:sha(bytes)};
}
test('actual installed Chrome runner zooms at 125%, 150%, 200% with keyboard and long text',
  {skip:!RUN,timeout:360000},async t=>{
  const binary=process.env.CHROME_BIN,expected=process.env.SCHEDULE_NATIVE_PLATFORM;
  assert.equal(process.platform,expected);
  assert(binary&&path.isAbsolute(binary)&&spawnSync(binary,['--version']).status===0);
  const noSandbox=process.env.SCHEDULE_NATIVE_CI_NO_SANDBOX==='1';
  if(noSandbox)assert(process.platform==='linux'&&process.env.GITHUB_ACTIONS==='true'&&
    process.env.CI==='true','sandbox escape only in owned Linux CI');
  const profile=await mkdtemp(path.join(tmpdir(),'opendesk-r23-native-zoom-'));
  const pkg=await packageFingerprint(ext);
  const report={status:'RUNNING',gitSha:process.env.GITHUB_SHA??null,startedAt:new Date().toISOString(),
    sourceSha256:sha(await readFile('src/ui/scheduled-task-workbench.js')),
    package:pkg,platform:process.platform,chromeBinary:binary,
    kind:'Actual Chrome tab zoom through chrome.tabs.setZoom, not CDP viewport emulation',
    zoom:[],cssViewportSimulations:[],screenshots:[],
    limitations:['Standalone scheduled-runner TAB, NOT physical Side Panel width resize',
      'No installed scheduled Task, Fire, Run or Result is fabricated',
      'Keyboard focus/long text is a targeted check, not a full accessibility audit',
      'CSS widths below use CDP device metrics on the genuine runner TAB, never physical Side Panel width']};
  let proc,client,passed=false,stderr='';
  await mkdir(OUT,{recursive:true});
  t.after(async()=>{
    report.completedAt=new Date().toISOString();
    report.status=passed?'PASS':'FAIL_OR_BLOCKED';report.stderrTail=stderr.slice(-2500);
    if(client)await client.send('Browser.close').catch(()=>{});
    client?.close();
    if(proc?.exitCode===null&&proc?.signalCode===null)proc.kill('SIGTERM');
    assert.equal(path.basename(profile).startsWith('opendesk-r23-native-zoom-'),true);
    await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:150});
    await writeFile(path.join(OUT,'native-zoom-report.json'),JSON.stringify(report,null,2)+'\n');
  });
  proc=spawn(binary,['--headless=new','--window-size=840,900',
    '--disable-gpu','--disable-dev-shm-usage','--no-first-run',
    '--no-default-browser-check','--disable-background-networking',
    '--remote-allow-origins=*','--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0','--user-data-dir='+profile,
    '--disable-extensions-except='+ext,'--load-extension='+ext,
    ...(noSandbox?['--no-sandbox']:[]),'about:blank'],{stdio:['ignore','ignore','pipe']});
  report.chromePid=proc.pid;
  proc.stderr.on('data',d=>{stderr=(stderr+String(d)).slice(-8000);});
  const port=await until(async()=>{
    const row=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8').catch(()=>'')).split('\n')[0];
    return Number(row)>0?Number(row):null;
  },'genuine Chrome debugger profile',45000);
  const version=await(await fetch('http://127.0.0.1:'+port+'/json/version')).json();
  report.chromeVersion=version.Browser;
  client=await connect(version.webSocketDebuggerUrl);
  const extensionId=await until(async()=>{
    const targets=(await client.send('Target.getTargets')).targetInfos;
    return targets.find(x=>x.type==='service_worker'&&x.url?.endsWith('/sw.js'))?.url?.split('/')[2];
  },'real installed WXT MV3 worker',45000);
  assert(/^[a-p]{32}$/.test(extensionId));
  report.extensionId=extensionId;
  const page=await client.send('Target.createTarget',{
    url:'chrome-extension://'+extensionId+'/ui/tool.html?scheduledRunner=1'});
  const session=(await client.send('Target.attachToTarget',{targetId:page.targetId,flatten:true})).sessionId;
  await client.send('Runtime.enable',{},session);await client.send('Page.enable',{},session);
  const runner=await until(async()=>{
    const data=await evaluate(client,'(()=>({surface:document.documentElement.dataset.opendeskSurface,'+
      'visible:!!document.querySelector("#scheduled-panel")&&!document.querySelector("#scheduled-panel").hidden,'+
      'runner:!!document.querySelector("#schedule-runner-view")&&!document.querySelector("#schedule-runner-view").hidden}))()',session);
    return data.surface==='scheduled-runner'&&data.visible&&data.runner?data:null;
  },'actual dedicated scheduled runner displays its product dashboard',35000);
  report.initial=runner;
  await client.send('Target.activateTarget',{targetId:page.targetId});
  await click(client,session,'#schedule-runner-manage');
  await click(client,session,'#schedule-create');
  assert.equal(await evaluate(client,'document.activeElement?.id',session),'schedule-title',
    'product create form must focus the title without injected DOM.focus');
  const longTitle='真实缩放测试的中文计划名称'.repeat(5);
  await client.send('Input.insertText',{text:longTitle},session);
  assert.equal(await evaluate(client,expr('#schedule-title')+'.value',session),longTitle,
    'trusted Chrome text input must reach existing product form');
  const longUrl='https://example.com/search?q='+('very-long-url-segment-'.repeat(36));
  await click(client,session,'#schedule-target');
  await client.send('Input.insertText',{text:longUrl},session);
  assert.equal(await evaluate(client,expr('#schedule-target')+'.value',session),longUrl);
  const tabId=await evaluate(client,
    'chrome.tabs.getCurrent().then(tab=>tab?.id??null)',session);
  assert(Number.isInteger(tabId)&&tabId>=0,'real runner TAB ID');
  report.tabId=tabId;
  for(const [label,zoom] of [['125',1.25],['150',1.5],['200',2]]){
    const factor=await evaluate(client,'chrome.tabs.setZoom('+tabId+','+zoom+
      ').then(()=>chrome.tabs.getZoom('+tabId+'))',session);
    assert(Math.abs(factor-zoom)<.001,'real Chrome tabs.getZoom must match '+zoom);
    await sleep(180);
    const state=await evaluate(client,'(()=>{const root=document.documentElement;'+
      'const nav=document.querySelector(".workbench-nav");'+
      'return {cssWidth:innerWidth,scrollWidth:root.scrollWidth,scale:devicePixelRatio,'+
      'runnerVisible:!document.querySelector("#scheduled-panel").hidden,'+
      'formVisible:!document.querySelector("#schedule-form").hidden,'+
      'navHidden:getComputedStyle(nav).display==="none",'+
      'title:document.querySelector("#schedule-title").value,'+
      'url:document.querySelector("#schedule-target").value,'+
      'focus:document.activeElement?.id||null};})()',session);
    assert.equal(state.runnerVisible,true);
    assert.equal(state.formVisible,true);
    assert.equal(state.navHidden,true,'standalone runner must isolate unrelated navigation');
    assert.equal(state.title,longTitle);
    assert.equal(state.url,longUrl);
    assert(state.scrollWidth<=state.cssWidth+1,'no horizontal overflow at actual '+label+'% browser zoom');
    const picture=await snapshot(client,session,'runner-real-zoom-'+label);
    report.screenshots.push(picture);
    report.zoom.push({requested:zoom,chromeGetZoom:factor,...state,screenshot:picture});
    console.log('SCHEDULE_R23_REAL_ZOOM '+JSON.stringify({
      gitSha:report.gitSha,platform:report.platform,chrome:report.chromeVersion,
      requested:zoom,chromeGetZoom:factor,cssWidth:state.cssWidth,
      scrollWidth:state.scrollWidth,dpr:state.scale,screenshot:picture}));
  }
  await click(client,session,'#schedule-title');
  assert.equal(await evaluate(client,'document.activeElement?.id',session),'schedule-title',
    'input remains pointer/keyboard-focusable at genuine 200%');
  await client.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9},session);
  await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9},session);
  const tabFocus=await evaluate(client,'document.activeElement?.id||null',session);
  assert(tabFocus&&tabFocus!=='schedule-title','native Tab must advance actual focus at 200%');
  report.keyboardFocus={from:'schedule-title',to:tabFocus,tabTrustedInput:true};
  await evaluate(client,'chrome.tabs.setZoom('+tabId+',1)',session);
  // Browser-installed extension markup at simulated CSS widths is a separate
  // evidence tier from the genuine tabs.setZoom measurements above. Never call
  // these actual Chrome Side Panel physical-width results.
  for(const width of [220,300,320,360,420,520]){
    await client.send('Emulation.setDeviceMetricsOverride',{
      width,height:820,deviceScaleFactor:1,mobile:false},session);
    await sleep(120);
    const layout=await evaluate(client,'(()=>{'+
      'const q=s=>document.querySelector(s);const box=s=>{const n=q(s);if(!n)return null;'+
      'const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};};'+
      'const label=q("label[for=schedule-title]");const range=document.createRange();'+
      'range.selectNodeContents(label.firstChild);'+
      'const fieldLabelGap=box("#schedule-title").top-range.getBoundingClientRect().bottom;'+
      'const titleToFieldGap=box("#schedule-title").top-box("#schedule-source-section-title").bottom;'+
      'const select=box("#schedule-task-select"),newScript=box("#schedule-new-script"),manage=box("#schedule-manage-tasks");'+
      'const search=box("#schedule-timezone-search"),zone=box("#schedule-timezone");'+
      'const doc=document.documentElement;return {width:innerWidth,scrollWidth:doc.scrollWidth,'+
      'formVisible:!q("#schedule-form").hidden,source:{select,newScript,manage},search,zone,'+
      'fieldLabelGap,titleToFieldGap,title:q("#schedule-title").value};})()',session);
    assert.equal(layout.formVisible,true);
    assert.equal(layout.title,longTitle,'preserve unsubmitted form draft at '+width+'px');
    assert(layout.scrollWidth<=layout.width+1,
      'no page horizontal scrolling in genuine extension TAB CSS viewport '+width);
    assert(layout.source.select.right<=layout.source.newScript.left+1,
      'source and create icon cannot overlap at '+width);
    assert(layout.source.newScript.right<=layout.source.manage.left+1,
      'both source actions must remain independent click regions at '+width);
    assert(layout.source.newScript.width>=33&&layout.source.manage.width>=33,
      'source action hit targets remain at least 34 CSS px at '+width);
    assert(layout.search&&layout.zone,'IANA search and native select remain present at '+width);
    assert(layout.fieldLabelGap>=6,
      'real label/control computed gap must be visible at '+width);
    const picture=await snapshot(client,session,'runner-css-viewport-'+width);
    report.screenshots.push(picture);
    report.cssViewportSimulations.push({...layout,viewportMethod:'CDP emulation on actual WXT runner tab',
      screenshot:picture});
  }
  // A real pointer navigation to installed Task management cannot drop the
  // form draft on return, even without a task already installed in this Profile.
  await client.send('Emulation.setDeviceMetricsOverride',{
    width:320,height:820,deviceScaleFactor:1,mobile:false},session);
  await click(client,session,'#schedule-manage-tasks');
  const managerShown=await evaluate(client,
    '!document.querySelector("#schedule-task-manager").hidden',session);
  assert.equal(managerShown,true,'native pointer opened the real installed Task manager');
  await click(client,session,'#schedule-manager-back');
  assert.equal(await evaluate(client,expr('#schedule-title')+'.value',session),longTitle,
    'installed Task manager roundtrip must preserve the unsaved title');
  report.managerReturn={cssViewport:320,source:'actual Chrome pointer',
    preservedDraft:true};
  await client.send('Emulation.clearDeviceMetricsOverride',{},session);
  passed=true;
});
