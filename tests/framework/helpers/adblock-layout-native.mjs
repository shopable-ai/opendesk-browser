/**
 * AdBlock P0-4: explicit entry only; importing never opens Chrome or writes files.
 *
 * await runAdblockLayoutNative({client, hostSession: sid, reactSession: react,
 *   evaluate, click, clickSandbox, screenshot, until, report, nativeEnvironment});
 * Existing runner signatures are used unchanged. screenshot writes to the owning
 * runner's evidence directory; the runner must persist report in its finally.
 * Include this file's SHA in that report's verification inputs.
 *
 * Exported adapter prototype (NOT_TESTED; not automatically selected) uses the existing browserSessions PID, real Side Panel
 * splitter via r251's owned Swift input, and a same-origin existing Chrome tab's
 * tabs.setZoom/getZoom. It creates no tab/browser. Optional zoomSession/zoomTabId
 * select the runner's launcher tab (uid). chromePid overrides the report PID.
 * Extension-tab hosts use Browser.setWindowBounds and are labelled accordingly.
 * Native owner must explicitly pass nativeEnvironment; adapter integration is unfinished:
 *   read() -> {backingScaleFactor, ...native measurements/receipts}
 *   apply({width, zoom}) -> {widthMethod:'native-splitter', zoomMethod:string,
 *     evidence: native input receipts}. Width is actual iframe CSS innerWidth at
 *     EACH requested zoom, not window width or screenshot device pixels.
 *   restore(original) -> restoration receipt (throw if restoration is unknown).
 * Zoom method must describe real Chrome zoom, not deviceScaleFactor/page scale.
 * read's native backingScaleFactor independently checks iframe DPR/zoom.
 * Unreachable geometry may throw code E_ADBLOCK_LAYOUT_UNREACHABLE; other adapter
 * errors stop further native input. All paths attempt restoration.
 *
 * No adapter, missing native access or unreachable geometry: current installed UI only;
 * unproved matrix cells stay NOT_TESTED. Never convert browser/screen limits to PASS.
 * Theme is explicitly CDP prefers-color-scheme, not an OS appearance claim.
 * restoreMedia may contain {host:{features:[]}, react:{features:[]}} for existing
 * overrides; by default the owning runner declares there was no prior override.
 * No filter toggle, restore/delete/picker, installation, or permission action is
 * activated. Tab/Shift+Tab and Enter activate only product navigation buttons.
 * This is bounded DOM/AX/contrast evidence, not a six-dimension score or a full
 * screen reader, pixel comparison, permission, DNR, lifecycle or release verdict.
 */

import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {MANUAL_COSMETIC_CASES} from '../../../scripts/verify-adblock-native-release.mjs';

// React Aria owns an internal native input. aria-label may be forwarded to that
// input or retained on its label; neither the thumb nor aria-checked is state.
export function adblockSwitchSelector(label) {
  const name=JSON.stringify(label);
  return `[data-slot="switch"]:has(input[role="switch"][aria-label=${name}]),`+
    `[data-slot="switch"][aria-label=${name}]:has(input[role="switch"])`;
}

export async function runAdblockChromeZoom200({client,hostSession,reactSession,evaluate,until,screenshot}) {
  const ev=(session,code)=>evaluate(client,session,code);
  const tab=await ev(hostSession,'chrome.tabs.getCurrent()');
  assert.ok(Number.isSafeInteger(tab?.id),'zoom requires an actual owned Chrome tab');
  const baseline=await ev(hostSession,'chrome.tabs.getZoom('+tab.id+')');
  const read=async()=>({getZoom:await ev(hostSession,'chrome.tabs.getZoom('+tab.id+')'),
    host:await ev(hostSession,'({url:location.href,dpr:devicePixelRatio,width:innerWidth,height:innerHeight})'),
    tool:await ev(reactSession,`(()=>{const root=document.querySelector('.adblock-app');
      if(!root)throw Error('installed tool absent');return {url:location.href,dpr:devicePixelRatio,
        width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,
        root:root.getBoundingClientRect().toJSON(),text:root.textContent,
        controls:[...root.querySelectorAll('button,input')].map(n=>({tag:n.tagName,
          label:n.getAttribute('aria-label'),rect:n.getBoundingClientRect().toJSON()}))};})()`)});
  const receipt={status:'RUNNING',surface:'INSTALLED_TOOL_IN_EXTENSION_TAB',method:'chrome.tabs.setZoom/getZoom',tabId:tab.id,
    before:await read()};
  try{
    await ev(hostSession,'chrome.tabs.setZoom('+tab.id+',2)');
    await until(async()=>{
      const value=await read();return Math.abs(value.getZoom-2)<.001&&
        Math.abs(value.tool.dpr/receipt.before.tool.dpr-2/baseline)<.025;
    },'Chrome 200% page zoom reaches actual installed iframe DPR');
    receipt.at200=await read();
    receipt.screenshot=await screenshot(client,hostSession,'closeout-real-chrome-page-zoom-200');
    assert.ok(receipt.at200.tool.scrollWidth<=receipt.at200.tool.width+1,'installed tool no horizontal page overflow at real Chrome 200%');
    receipt.status='PASS';return receipt;
  }catch(error){receipt.status='FAIL';receipt.error=String(error.stack||error);error.zoomEvidence=receipt;throw error;}
  finally{
    await ev(hostSession,'chrome.tabs.setZoom('+tab.id+','+baseline+')');
    await until(async()=>{const v=await read();return Math.abs(v.getZoom-baseline)<.001&&
      Math.abs(v.tool.dpr-receipt.before.tool.dpr)<.025;},'original Chrome zoom and tool DPR restored');
    receipt.restored=await read();
    receipt.restoredScreenshot=await screenshot(client,hostSession,'closeout-real-chrome-page-zoom-restored');
  }
}

export function assertAdblockManualStep(name,step,{host,selector}) {
  assert.ok(MANUAL_COSMETIC_CASES.includes(name),'declared release manual step');
  if(name==='upgrade'){
    const stateKey='opendesk.adblock.state.v1',cosmeticKey='opendesk.adblock.cosmetic.v1';
    for(const phase of ['before','after']){
      const snapshot=step[phase],runtime=step.runtime?.[phase];
      assert.ok(Number.isSafeInteger(snapshot?.tabId)&&snapshot.tabId>0);
      assert.ok(snapshot.documentId);assert.equal(new URL(snapshot.url).hostname,host);
      assert.ok(['http:','https:'].includes(new URL(snapshot.url).protocol));
      assert.equal(snapshot.targetPresent,true);assert.equal(snapshot.targetHidden,false);
      for(const key of [stateKey,cosmeticKey])assert.ok(snapshot.storageReadKeys?.includes(key));
      assert.equal(snapshot.storage?.[stateKey]?.enabled,true);
      assert.ok(snapshot.storage[stateKey].exceptions?.length>0);
      assert.ok(runtime?.extensionId&&runtime.profile&&runtime.root);
      for(const key of ['artifactPackageHash','installedPackageHash'])assert.match(runtime[key],/^[a-f0-9]{64}$/);
    }
    assert.equal(Object.hasOwn(step.before.storage,cosmeticKey),false,'1.2.1 has no manual rules');
    if(Object.hasOwn(step.after.storage,cosmeticKey))assert.deepEqual(step.after.storage[cosmeticKey],{version:1,entries:[]});
    assert.equal(step.before.storage[stateKey].approvedHash,step.runtime.before.installedPackageHash);
    assert.deepEqual(step.after.storage[stateKey],{...step.before.storage[stateKey],approvedHash:step.runtime.after.installedPackageHash});
    assert.equal(step.fromVersion,'1.2.1');assert.equal(step.toVersion,'1.2.3');
    for(const phase of ['before','after'])assert.equal(step.runtime[phase].installedVersion,step[phase==='before'?'fromVersion':'toVersion']);
    for(const key of ['extensionId','profile','root'])assert.equal(step.runtime.after[key],step.runtime.before[key]);
    for(const key of ['artifactPackageHash','installedPackageHash'])assert.notEqual(step.runtime.after[key],step.runtime.before[key]);
    assert.ok(step.screenshots?.before&&step.screenshots?.after);
    assert.notEqual(step.screenshots.before,step.screenshots.after);return;
  }
  const saved=(snapshot,phase)=>{
    assert.ok(snapshot&&Number.isSafeInteger(snapshot.tabId)&&snapshot.tabId>0,'Chrome tab identity');
    assert.ok(typeof snapshot.documentId==='string'&&snapshot.documentId,'Chrome document identity');
    const url=new URL(snapshot.url);assert.ok(['http:','https:'].includes(url.protocol));
    const state=snapshot.storage?.['opendesk.adblock.cosmetic.v1'];
    if(name==='uninstall'&&phase==='after'){
      assert.ok(snapshot.storageReadKeys?.includes('opendesk.adblock.cosmetic.v1'),'uninstall explicitly queried cosmetic storage');
      assert.ok(snapshot.storage&&typeof snapshot.storage==='object');
      assert.equal(Object.hasOwn(snapshot.storage,'opendesk.adblock.cosmetic.v1'),false,'uninstall deletes cosmetic key');
      return false;
    }
    assert.equal(state?.version,1,'actual persisted cosmetic schema required');
    assert.ok(Array.isArray(state.entries));
    return state.entries.some(row=>row.host===host&&row.selector===selector);
  };
  const initial=!['pick','cancel'].includes(name),final=!['cancel','restore','uninstall'].includes(name);
  assert.equal(saved(step.before,'before'),initial,name+' initial rule');
  assert.equal(saved(step.after,'after'),final,name+' final rule');
  assert.equal(new URL(step.before.url).hostname,host);
  if(name==='siteIsolation')assert.notEqual(new URL(step.after.url).hostname,host);
  else assert.equal(new URL(step.after.url).hostname,host);
  assert.equal(step.before.targetPresent,name!=='dynamic');assert.equal(step.after.targetPresent,true);
  assert.equal(step.before.targetHidden,initial&&name!=='dynamic');
  assert.equal(step.after.targetHidden,['pick','reload','reopen','dynamic','upgrade'].includes(name));
  const key='opendesk.adblock.cosmetic.v1';
  if(name==='pick')assert.deepEqual(step.after.storage[key].entries,
    [...step.before.storage[key].entries,{host,selector}].sort((a,b)=>a.host.localeCompare(b.host)||a.selector.localeCompare(b.selector)));
  else if(name==='restore')assert.deepEqual(step.after.storage[key].entries,
    step.before.storage[key].entries.filter(row=>row.host!==host||row.selector!==selector));
  else if(name!=='uninstall')assert.deepEqual(step.after.storage[key],step.before.storage[key],name+' preserves rules');
  if(['reload','reopen'].includes(name))assert.notEqual(step.before.documentId,step.after.documentId);
  if(name==='reopen')assert.notEqual(step.before.tabId,step.after.tabId);
  if(['pick','cancel','restore'].includes(name)){
    assert.equal(step.input?.isTrusted,true);assert.ok(['pointerdown','keydown'].includes(step.input.type));
  }
  if(name==='upgrade'){assert.equal(step.fromVersion,'1.2.1');assert.equal(step.toVersion,'1.2.3');}
  assert.ok(step.screenshots?.before&&step.screenshots?.after);
  assert.notEqual(step.screenshots.before,step.screenshots.after);
}

/** Explicit, owned-CFT development closeout. Does not claim the full release gate.
 * All writes use installed UI/SDK -> existing Host; extension CDP is readback.
 * Original runner remains available for the other native/security scenarios.
 */
export async function runAdblockCloseoutNative(ctx) {
  let {client:c,hostSession:sid,launcherSession:uid}=ctx;
  const {evaluate,click,clickSandbox,
    screenshot,until,attach,attachActualReact,reactSwitch,requestReactReview,
    approveReactReview,reloadFixture,mousePage,mouseClick,probe,getOwned,
    report,preserve,packageHash}=ctx;
  const STORE='opendesk.adblock.state.v1',COSMETIC='opendesk.adblock.cosmetic.v1';
  const INSTALLED='opendesk.sidebar-tools.installed.v1',EPOCH='opendesk.sidebar-tools.revocation-epochs.v1';
  const ENABLED='opendesk.sidebar-tools.enabled.v1',host=new URL(ctx.manualUrl).hostname,selector='#manual-ad-slot';
  const manual={schemaVersion:1,status:'NOT_TESTED',host,selector,
    steps:Object.fromEntries(MANUAL_COSMETIC_CASES.map(name=>[name,{status:'NOT_TESTED'}])),
    ...Object.fromEntries(['candidate','artifactPackageHash','extensionId','packageSHA256','driverSHA256'].map(key=>[key,report[key]]))};
  report.cases={...report.cases,manualCosmetic:manual};
  report.manualCosmetic='NOT_TESTED';
  report.closeout.requiredReleaseCoverage='INCOMPLETE';
  let react,pageSession,pageTarget,pageMouse;
  const ev=(session,code)=>evaluate(c,session,code);
  const storageReadKeys=[STORE,COSMETIC,INSTALLED,EPOCH,ENABLED];
  const storage=()=>ev(uid,'chrome.storage.local.get('+JSON.stringify(storageReadKeys)+')');
  const shot=async(session,name)=>{const value=await screenshot(c,session,'closeout-'+name);report.screenshots.push(value);return value.file;};
  const installed='[data-extension-key="app:adblock"][data-extension-action="main"]';
  const rowMore='[data-extension-key="app:adblock"][data-extension-action="more"]';
  const label=text=>'button[aria-label='+JSON.stringify(text)+']';
  const save=async()=>{
    const statuses=MANUAL_COSMETIC_CASES.map(name=>manual.steps[name]?.status);
    manual.status=statuses.includes('FAIL')?'FAIL':statuses.every(value=>value==='PASS')?'PASS':'NOT_TESTED';
    report.manualCosmetic=manual.status;
    const {evidence,...record}=manual;
    manual.evidence=await preserve('manual-cosmetic-release.json',JSON.stringify(record,null,2)+'\n');
  };
  const openTool=async(hostSession=sid)=>{
    await until(()=>ev(hostSession,'(()=>{const b=document.querySelector('+JSON.stringify(installed)+');'+
      'return b&&!b.disabled&&b.getAttribute("aria-label")==="打开「广告拦截」"})()'),'installed AdBlock ready');
    await click(c,hostSession,installed);const session=await attachActualReact(c,hostSession);
    await ev(session,`(()=>{globalThis.__adblockCloseoutInputs=[];
      document.addEventListener('pointerdown',e=>globalThis.__adblockCloseoutInputs.push({
        type:e.type,isTrusted:e.isTrusted,at:Date.now(),label:e.target.closest('button')?.getAttribute('aria-label'),
        text:e.target.closest('button')?.textContent}),true);})()`);
    return session;
  };
  const ui=async(selector)=>{
    const start=await ev(react,'globalThis.__adblockCloseoutInputs.length');
    await clickSandbox(c,sid,react,selector);
    return until(()=>ev(react,'globalThis.__adblockCloseoutInputs.slice('+start+').find(e=>e.isTrusted)'),
      'trusted installed UI pointerdown');
  };
  const textButton=async(text)=>{
    const index=await ev(react,'[...document.querySelectorAll("button")].findIndex(b=>b.textContent.trim()==='+JSON.stringify(text)+')');
    assert.ok(index>=0,'installed UI button '+text);
    // Selector uses the actual DOM ordinal, with no text/event mutation.
    const buttons=await ev(react,'[...document.querySelectorAll("button")].map(b=>b.outerHTML)');
    const selector=await ev(react,'(()=>{const b=[...document.querySelectorAll("button")]['+index+'];'+
      'const parts=[];for(let n=b;n&&n!==document.documentElement;n=n.parentElement){'+
      'parts.unshift(n.tagName.toLowerCase()+":nth-child("+([...n.parentElement.children].indexOf(n)+1)+")");}return parts.join(" > ");})()');
    assert.ok(buttons[index]);return ui(selector);
  };
  const overview=async()=>{
    const onOverview=()=>ev(react,
      'document.querySelector(".adblock-control-row strong")?.textContent==="全局保护"');
    if(await onOverview())return;
    await until(()=>ev(sid,
      'document.querySelector("#sidebar-tool-back")?.getAttribute("aria-label")==="返回上一级"'),
      'trusted Host exposes nested AdBlock Back');
    await click(c,sid,'#sidebar-tool-back');
    await until(onOverview,'installed AdBlock returns to overview');
  };
  const rules=async()=>{
    await overview();
    const copy=await until(()=>ev(react,'[...document.querySelectorAll("button")].find(b=>/^已屏蔽 \\d+ 处/.test(b.textContent.trim()))?.textContent.trim()'),'manual list button');
    await textButton(copy);
    await until(()=>ev(react,'!!document.querySelector(".adblock-page-head")'),'manual list mounted');
  };
  const fixture=async(url)=>{
    const target=await c.send('Target.createTarget',{url});
    const session=await attach(c,target.targetId),mouse=await mousePage(target.targetId);
    await until(()=>ev(session,'!!document.querySelector("#manual-normal")'),'real HTTP manual fixture');
    await mouse.bringToFront();return {target,session,mouse};
  };
  const useFixture=async(url)=>{
    const value=await fixture(url);pageTarget=value.target;pageSession=value.session;pageMouse=value.mouse;
    return value;
  };
  const dom=()=>ev(pageSession,`(()=>{const n=document.querySelector(${JSON.stringify(selector)}),s=n&&getComputedStyle(n);
    return {url:location.href,targetPresent:!!n,targetHidden:!!n&&(s.display==='none'||s.visibility==='hidden'),
      normalVisible:document.querySelector('#manual-normal').getBoundingClientRect().height>0,
      marker:!!document.querySelector('[data-opendesk-adblock-picker-ui]'),dpr:devicePixelRatio,
      events:window.manualFixtureEvents};})()`);
  const visible=hidden=>until(async()=>{const value=await dom();
    return value.targetPresent&&value.targetHidden===hidden&&value.normalVisible?value:null;},'real page hidden='+hidden);
  const snapshot=async(name,phase)=>{
    const state=await dom(),saved=await storage();
    const identity=await ev(uid,`(async()=>{const tabs=(await chrome.tabs.query({url:${JSON.stringify(state.url)}}))
      .filter(t=>t.url===${JSON.stringify(state.url)});if(tabs.length!==1)throw Error('ambiguous fixture tab');
      const frame=await chrome.webNavigation.getFrame({tabId:tabs[0].id,frameId:0});
      return {url:frame.url,tabId:tabs[0].id,documentId:frame.documentId};})()`);
    assert.equal(identity.url,state.url);
    return {value:{...identity,targetPresent:state.targetPresent,targetHidden:state.targetHidden,
      storage:saved,storageReadKeys:[...storageReadKeys],dom:state},
      screenshot:await shot(pageSession,name+'-'+phase)};
  };
  const step=async(name,job,extra={})=>{
    const row=manual.steps[name]={status:'RUNNING',...extra};
    try{
      const before=await snapshot(name,'before');row.before=before.value;row.screenshots={before:before.screenshot};
      Object.assign(row,await job());
      const after=await snapshot(name,'after');row.after=after.value;row.screenshots.after=after.screenshot;
      assertAdblockManualStep(name,row,manual);row.status='PASS';
    }catch(error){row.status='FAIL';row.error=String(error.stack||error);throw error;}
    finally{await save();}
  };
  const upload=async(file,bytes,version)=>{
    await click(c,sid,'#tab-tools');
    // Public import toolbar opens the same trusted installer for both versions.
    await click(c,sid,'#extension-center-more');
    await click(c,sid,'#extension-center-import');
    await until(()=>ev(sid,'document.querySelector("#sidebar-tool-import")?.hidden===false'),'trusted local import');
    await c.send('Page.setInterceptFileChooserDialog',{enabled:true},sid);
    try{
      const start=c.events.length;await click(c,sid,'#sidebar-tool-file');
      const chooser=await until(()=>c.events.slice(start).find(e=>e.sessionId===sid&&e.method==='Page.fileChooserOpened'),'real Chrome file chooser');
      await c.send('DOM.setFileInputFiles',{files:[file],backendNodeId:chooser.params.backendNodeId},sid);
    }finally{await c.send('Page.setInterceptFileChooserDialog',{enabled:false},sid);}
    await until(()=>ev(sid,'document.querySelector("#sidebar-tool-preview")?.hidden===false'),'package review visible');
    const review=await ev(sid,'document.querySelector("#sidebar-tool-preview").textContent');
    assert.ok(review.includes(version),'review exact package version');
    await shot(sid,'install-'+version+'-review');await click(c,sid,'#sidebar-tool-install');
    const expected=await packageHash(JSON.parse(bytes));
    const state=await until(async()=>{
      const error=await ev(sid,'document.querySelector("#sidebar-tool-file-error")?.textContent.trim()');
      if(error)return {error,storage:await storage()};
      const s=await storage(),tool=s[INSTALLED]?.find(t=>t.id==='adblock');
      return tool?.version===version&&await packageHash(tool)===expected?{storage:s,tool,packageHash:expected}:null;
    },'unique installer committed exact '+version+' package');
    if(state.error){
      const failure={version,file,error:state.error,storage:state.storage,
        screenshot:await shot(sid,'install-'+version+'-rejected')};
      report.closeout.installerFailure=failure;
      await preserve('installer-'+version+'-rejected.json',JSON.stringify(failure,null,2)+'\n');
      throw Error('Unique installer rejected '+version+': '+state.error);
    }
    return {version,packageHash:state.packageHash,epoch:state.storage[EPOCH]?.adblock??null,review,
      fileChooser:'trusted pointer + Page.fileChooserOpened + DOM.setFileInputFiles'};
  };
  const change=async(name,on,copy)=>{
    await overview();await pageMouse.bringToFront();
    const expectedHost=new URL((await dom()).url).hostname;
    await until(()=>ev(react,'document.querySelector(".adblock-host")?.textContent.trim()==='+JSON.stringify(expectedHost)),
      'switch review bound to active exact hostname');
    await until(async()=>{const value=await reactSwitch(c,react,name);return value&&!value.disabled;},name+' ready');
    const before=await reactSwitch(c,react,name);
    if(before.on===on)return;
    await requestReactReview(c,sid,react,adblockSwitchSelector(name),copy);await approveReactReview(c,sid);
    await until(async()=>{const value=await reactSwitch(c,react,name);return value?.on===on;},name+' changed');
    await until(async()=>{const value=await getOwned(c,uid);
      return name==='全局广告拦截'?value.state?.enabled===on:
        Array.isArray(value.state?.exceptions)&&value.state.exceptions.includes(expectedHost)===!on;
    },name+' independently persisted Chrome state');
  };
  const enable=()=>change('全局广告拦截',true,'开启全局过滤');
  const picker=async()=>{
    await overview();await pageMouse.bringToFront();
    await until(()=>ev(react,'document.querySelector(".adblock-host")?.textContent.trim()==='+JSON.stringify(host)),'picker exact host');
    await ui(label('在当前网页中点击选择要隐藏的元素'));
    await until(()=>ev(react,'!!document.querySelector(".adblock-pick-panel")'),'picker acknowledgement');
  };
  const toggleTool=async(expected)=>{
    await click(c,sid,rowMore);
    await until(()=>ev(sid,'document.querySelector("#extension-center-row-menu [data-ec-context-action=toggle]")?.textContent.includes('+JSON.stringify(expected)+')'),'management toggle '+expected);
    await click(c,sid,'#extension-center-row-menu [data-ec-context-action="toggle"]');
  };
  const leaveTool=async()=>{
    await click(c,sid,'#sidebar-tool-back');
    const route=await until(()=>ev(sid,`(()=>{
      const review=document.querySelector('#sidebar-tool-action-review');
      if(review&&!review.hidden)return {review:true,text:review.textContent};
      const row=document.querySelector(${JSON.stringify(rowMore)});
      return row?.getBoundingClientRect().height>0?{review:false}:null;})()`),'real return or draft protection');
    if(route.review){
      assert.ok(route.text.includes('未保存内容'),'only explicit unsaved-draft exit review accepted');
      const before=await storage();
      await shot(sid,'draft-exit-review');await click(c,sid,'#sidebar-tool-action-cancel');
      assert.equal(await ev(react,'!!document.querySelector(".adblock-app")'),true,'cancel retains installed UI');
      assert.deepEqual((await storage())[COSMETIC],before[COSMETIC],'cancel preserves saved rules');
      await click(c,sid,'#sidebar-tool-back');
      await until(()=>ev(sid,'document.querySelector("#sidebar-tool-action-review")?.hidden===false'),'second deliberate draft exit review');
      await click(c,sid,'#sidebar-tool-action-continue');
      report.closeout.unsavedDraftExit={review:route.text,cancelRetainedUi:true,cancelPreservedStorage:true,
        confirmation:'real Chrome pointer input through existing Host review'};
    }
  };
  try{
    const permission=await ev(uid,'chrome.permissions.contains({permissions:["declarativeNetRequestWithHostAccess"]})');
    assert.equal(permission,true);report.nativePermission='PASS';
    if(ctx.candidateOnly){
      manual.steps.upgrade={status:'NOT_TESTED',reason:'Candidate-only diagnostics; old package installation blocked in separate raw receipt'};
      report.closeout.candidateInstalled=await upload(ctx.candidatePackage,ctx.candidateBytes,'1.2.3');
    }else report.closeout.oldInstalled=await upload(ctx.oldPackage,ctx.oldBytes,'1.2.1');
    react=await openTool();
    await useFixture(ctx.manualOtherUrl);await enable();
    await change('当前网站广告过滤',false,'关闭 127.0.0.1 的广告过滤');
    await until(async()=>(await storage())[STORE]?.exceptions?.includes('127.0.0.1'),'old UI exception persisted');
    await c.send('Target.closeTarget',{targetId:pageTarget.targetId});
    await useFixture(ctx.manualUrl);await pageMouse.bringToFront();
    await until(()=>ev(react,'document.querySelector(".adblock-host")?.textContent.trim()==='+JSON.stringify(host)),'old UI exact historical host');
    report.closeout.historicalSetup={method:'installed-UI-global-switch-and-site-exception',
      oldPickerUi:false,storage:await storage(),dom:await dom()};
    if(!ctx.candidateOnly){await step('upgrade',async()=>{
      assert.ok(ctx.upgradeRuntime,'real 1.2.1 runtime required before complete artifact upgrade');
      const before=await storage();assert.equal(Object.hasOwn(before,COSMETIC),false);
      const oldIdentity={...ctx.runtimeIdentity(),installedVersion:'1.2.1',
        installedPackageHash:report.closeout.oldInstalled.packageHash};
      const next=await ctx.upgradeRuntime();({client:c,hostSession:sid,launcherSession:uid}=next);
      const preserved=await storage();
      assert.deepEqual(preserved[STORE],before[STORE],'whole extension upgrade preserves old intent before tool update');
      assert.equal(preserved[INSTALLED].find(t=>t.id==='adblock')?.version,'1.2.1','no uninstall/reinstall during runtime upgrade');
      report.closeout.candidateInstalled=await upload(ctx.candidatePackage,ctx.candidateBytes,'1.2.3');
      react=await openTool();await useFixture(ctx.manualUrl);await pageMouse.bringToFront();await visible(false);
      const after=await storage();assert.deepEqual(after[STORE],{...before[STORE],
        approvedHash:report.closeout.candidateInstalled.packageHash},'upgrade preserves choice and exceptions with current package approval');
      assert.equal(after[INSTALLED].filter(t=>t.id==='adblock').length,1,'same tool ID without uninstall');
      return {historySetup:report.closeout.historicalSetup.method,runtime:{before:oldIdentity,
        after:{...ctx.runtimeIdentity(),installedVersion:'1.2.3',installedPackageHash:report.closeout.candidateInstalled.packageHash}}};
    },{fromVersion:'1.2.1',toVersion:'1.2.3'});
    report.upgrade='PASS';}
    const identity=report.closeout.candidateInstalled;
    report.installedIdentity={version:identity.version,packageHash:identity.packageHash,epoch:identity.epoch};
    const loadedManifest=await ev(uid,'chrome.runtime.getManifest()');
    assert.equal(loadedManifest.version,ctx.manifest.version);assert.equal(loadedManifest.name,ctx.manifest.name);
    report.packageIdentity={root:report.root,loadedManifestMatched:true,
      manifestVersion:loadedManifest.version,manifestName:loadedManifest.name,
      ...Object.fromEntries(['artifactPackageHash','swSHA256','manifestSHA256','packageSHA256'].map(k=>[k,report[k]])),
      installedPackageHash:identity.packageHash};
    // The first manual rule belongs to 1.2.3. Never seed storage or call an API
    // that the real historical release did not implement.
    const initial=await snapshot('first-pick','before');
    await picker();await pageMouse.bringToFront();await pageMouse.locator(selector).hover();
    await until(()=>ev(pageSession,'!!document.querySelector("[data-opendesk-adblock-picker]")'),'real page picker outline');
    const selected=await mouseClick(pageMouse,selector);await visible(true);
    await until(async()=>(await storage())[COSMETIC]?.entries.some(row=>row.host===host&&row.selector===selector),'first selection persisted');
    const picked=await snapshot('first-pick','after');
    assert.equal(selected.event.isTrusted,true);
    assert.deepEqual(picked.value.storage[COSMETIC],{version:1,entries:[{host,selector}]});
    report.closeout.firstPick={before:initial.value,after:picked.value,input:selected,
      screenshots:{before:initial.screenshot,after:picked.screenshot}};
    await step('reload',async()=>{await reloadFixture(c,pageSession,'first selected rule refresh');await visible(true);});
    await step('reopen',async()=>{await c.send('Target.closeTarget',{targetId:pageTarget.targetId});await useFixture(ctx.manualUrl);await visible(true);});
    await rules();
    const beforeIcons=await storage(),icons={status:'RUNNING',steps:{}};report.closeout.icons=icons;
    await ui(label('定位网页元素：'+selector));
    const located=await until(async()=>{const v=await dom();return v.marker&&!v.targetHidden?v:null;},'locate reveals and outlines actual target');
    icons.steps.locate={dom:located,screenshot:await shot(pageSession,'icon-locate')};await visible(true);
    await ui(label('临时显示：'+selector));icons.steps.display={dom:await visible(false),screenshot:await shot(pageSession,'icon-display')};
    await ui(label('重新隐藏：'+selector));icons.steps.hide={dom:await visible(true),screenshot:await shot(pageSession,'icon-hide')};
    assert.deepEqual((await storage())[COSMETIC],beforeIcons[COSMETIC],'locate/display/hide retain persistent rules');
    const edit=async(from,to)=>{
      await ui(label('编辑屏蔽规则：'+from));
      await until(()=>ev(react,'document.activeElement===document.querySelector("#adblock-selector-input")'),'edit autofocus');
      const focus=()=>ev(react,'({activeTag:document.activeElement?.tagName,activeId:document.activeElement?.id,'+
        'focusedInput:document.activeElement===document.querySelector("#adblock-selector-input"),'+
        'value:document.querySelector("#adblock-selector-input")?.value})');
      const firstFocus=await focus();
      await ui(label('编辑屏蔽规则：'+from));
      await until(()=>ev(react,'document.activeElement===document.querySelector("#adblock-selector-input")'),'repeated same-rule edit autofocus');
      (icons.steps.editFocus??=[]).push({selector:from,firstFocus,repeatedFocus:await focus(),
        screenshot:await shot(sid,'edit-focus-'+icons.steps.editFocus.length)});
      await ui('#adblock-selector-input');
      await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:4,commands:['selectAll']},sid);
      await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:4},sid);
      await c.send('Input.insertText',{text:to},sid);await textButton('检查匹配 · 高亮');
      await until(()=>ev(react,'[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="保存修改"&&!b.disabled)'),'checked edit can save');
      await textButton('保存修改');
      await until(()=>ev(sid,'document.querySelector("#sidebar-tool-action-review")?.hidden===false'),'edit trusted save review');
      await approveReactReview(c,sid);
      await until(async()=>(await storage())[COSMETIC]?.entries.some(r=>r.host===host&&r.selector===to),'edited rule independently persisted');
      await visible(true);
    };
    await edit(selector,'.ad-banner');
    icons.steps.edit={storage:await storage(),screenshot:await shot(sid,'icon-edit-saved')};
    await reloadFixture(c,pageSession,'edited rule refresh');await visible(true);
    const editedTab=pageTarget.targetId;await c.send('Target.closeTarget',{targetId:editedTab});
    await useFixture(ctx.manualUrl);await visible(true);
    icons.steps.refreshReopen={storage:await storage(),dom:await dom(),screenshot:await shot(pageSession,'edited-refresh-reopen')};
    await edit('.ad-banner',selector);
    await step('restore',async()=>{const input=await ui(label('永久删除屏蔽规则：'+selector));await visible(false);return {input};});
    icons.steps.delete=manual.steps.restore;icons.status='PASS';
    if(ctx.coreOnly){
      const protectedRequest=await probe(c,pageSession,ctx.adUrl());
      assert.equal(protectedRequest.success,false);
      assert.equal(protectedRequest.network.errorText,'net::ERR_BLOCKED_BY_CLIENT');
      const own={pageSession,pageTarget,pageMouse};
      await useFixture(ctx.manualOtherUrl);
      const exceptionRequest=await probe(c,pageSession,ctx.adUrl());assert.equal(exceptionRequest.success,true);
      await c.send('Target.closeTarget',{targetId:pageTarget.targetId});({pageSession,pageTarget,pageMouse}=own);
      report.core={status:'PASS',scope:'1.2.1 global/settings upgrade; 1.2.3 picker, refresh/reopen and rule actions',
        releaseReady:false,upgrade:manual.steps.upgrade.status,firstPick:true,
        refresh:manual.steps.reload.status,reopen:manual.steps.reopen.status,icons:icons.status,
        migratedNetwork:{status:'PASS',protectedRequest,exceptionRequest}};
      await save();return;
    }
    await step('cancel',async()=>{await picker();const input=await textButton('取消选择');await visible(false);return {input};});
    await step('pick',async()=>{
      await picker();await pageMouse.bringToFront();await pageMouse.locator(selector).hover();
      await until(()=>ev(pageSession,'!!document.querySelector("[data-opendesk-adblock-picker]")'),'real page picker overlay');
      await mouseClick(pageMouse,selector);await visible(true);
      await until(async()=>(await storage())[COSMETIC]?.entries.some(row=>row.host===host&&row.selector===selector),
        'selected rule committed after immediate optimistic hiding');
      const input=(await dom()).events.findLast(e=>e.type==='pointerdown'&&e.target==='manual-ad-slot');
      return {input};
    });
    await step('reload',async()=>{await reloadFixture(c,pageSession,'manual rule page reload');await visible(true);});
    await step('reopen',async()=>{await c.send('Target.closeTarget',{targetId:pageTarget.targetId});await useFixture(ctx.manualUrl);await visible(true);});
    await mouseClick(pageMouse,'#manual-remove');
    await until(async()=>!(await dom()).targetPresent,'fixture user removes dynamic target');
    await step('dynamic',async()=>{await mouseClick(pageMouse,'#manual-insert');await visible(true);});
    const own={pageSession,pageTarget,pageMouse};
    await step('siteIsolation',async()=>{
      await useFixture(ctx.manualOtherUrl);await visible(false);
      // The A exception is deliberate; additionally prove B can be protected.
      await change('当前网站广告过滤',true,'恢复 127.0.0.1 的广告过滤');await visible(false);
      const request=await probe(c,pageSession,ctx.adUrl());assert.equal(request.success,false);assert.equal(request.network.errorText,'net::ERR_BLOCKED_BY_CLIENT');
      report.closeout.AB={B:request};
      await change('当前网站广告过滤',false,'关闭 127.0.0.1 的广告过滤');
      await reloadFixture(c,pageSession,'A exception takes effect on a new document');
      const allowed=await probe(c,pageSession,ctx.adUrl());assert.equal(allowed.success,true);report.closeout.AB.A=allowed;
    });
    await c.send('Target.closeTarget',{targetId:pageTarget.targetId});({pageSession,pageTarget,pageMouse}=own);
    await pageMouse.bringToFront();
    // A real installed tool in the owned extension tab is a Chrome page-zoom
    // target. The Side Panel is not assumed to inherit tabs.setZoom.
    const zoomUrl=await ev(uid,'chrome.runtime.getURL("sidepanel.html?toolId=adblock")');
    const zoomTarget=await c.send('Target.createTarget',{url:zoomUrl});
    const zoomHost=await attach(c,zoomTarget.targetId),zoomReact=await attachActualReact(c,zoomHost);
    await c.send('Page.bringToFront',{},zoomHost);
    report.closeout.chromeZoom200=await runAdblockChromeZoom200({client:c,hostSession:zoomHost,
      reactSession:zoomReact,evaluate,until,screenshot:async(client,session,name)=>{
        const value=await screenshot(client,session,name);report.screenshots.push(value);return value;
      }});
    await c.send('Target.closeTarget',{targetId:zoomTarget.targetId});
    await pageMouse.bringToFront();
    await step('globalOff',async()=>{await change('全局广告拦截',false,'关闭全局过滤');await visible(false);});
    await enable();await visible(true);
    await step('siteException',async()=>{await change('当前网站广告过滤',false,'关闭 '+host+' 的广告过滤');await visible(false);});
    await change('当前网站广告过滤',true,'恢复 '+host+' 的广告过滤');await visible(true);
    for(const name of ['disable','revocation']){
      await step(name,async()=>{
        const before=await storage();await leaveTool();await toggleTool('停用');
        await until(async()=>(await getOwned(c,uid)).owned.length===0,'disabled tool releases owned Chrome DNR');await visible(false);
        const after=await storage();assert.equal(after[ENABLED]?.adblock,false);
        assert.notEqual(after[EPOCH]?.adblock,before[EPOCH]?.adblock,'installed authority epoch revoked');
        return {revocationScope:'installed-tool-authority-epoch',beforeEpoch:before[EPOCH]?.adblock,afterEpoch:after[EPOCH]?.adblock};
      });
      await toggleTool('启用');react=await openTool();await pageMouse.bringToFront();await enable();await visible(true);
    }
    await step('uninstall',async()=>{
      await click(c,sid,'#sidebar-tool-remove');
      await until(()=>ev(sid,'document.querySelector("#sidebar-tool-inline-remove-confirm")?.hidden===false'),'unique installer uninstall confirmation');
      await click(c,sid,'#sidebar-tool-inline-remove-confirm');
      await until(async()=>!(await storage())[INSTALLED]?.some(t=>t.id==='adblock'),'tool removed by real Host');await visible(false);
    });
    await save();
  }catch(error){
    report.closeout.error=String(error.stack||error);
    if(error.zoomEvidence)report.closeout.chromeZoom200=error.zoomEvidence;
    throw error;
  }
  finally{await save();}
}

const execute = promisify(execFile);
const nativeInput = fileURLToPath(new URL('../r251-visual-native-input.swift',import.meta.url));

export const ADBLOCK_LAYOUT_MATRIX = Object.freeze(
  [320, 360, 400, 440].flatMap(width => ['light', 'dark'].flatMap(theme =>
    [1, 2].map(zoom => Object.freeze({width, theme, zoom})))));

// WCAG sRGB luminance. Callers supply already composited, opaque RGB channels.
export function contrastRatio(foreground, background) {
  const luminance = rgb => rgb.slice(0,3).reduce((sum, channel, i) => {
    const value = channel / 255;
    return sum + [.2126, .7152, .0722][i] *
      (value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  }, 0);
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

const backSelector = '#sidebar-tool-back';
const settingsSelector = '#sidebar-tool-settings-open';
const summarize = values => values.includes('FAIL') ? 'FAIL' :
  values.length && values.every(x => x === 'PASS') ? 'PASS' : 'NOT_TESTED';
const near = (a, b, tolerance) => Number.isFinite(a) && Math.abs(a - b) <= tolerance;
const issue = message => Object.assign(new Error(message), {code: 'E_ADBLOCK_LAYOUT_UNREACHABLE'});

/** Real window/zoom adapter. No emulated metrics, new targets or Chrome launch. */
export function createAdblockLayoutEnvironment(ctx) {
  const {client,hostSession,reactSession,evaluate,until} = ctx;
  let state,detached=false;
  const readDOM = () => evaluate(client,hostSession,`(async()=>{
    const contexts=await chrome.runtime.getContexts({contextTypes:['SIDE_PANEL'],documentUrls:[location.href]});
    const tab=await chrome.tabs.getCurrent();
    return {url:location.href,timeOrigin:performance.timeOrigin,dpr:devicePixelRatio,width:innerWidth,
      surface:contexts.length===1?'SIDE_PANEL':'EXTENSION_TAB',tabId:tab?.id};})()`);
  const frame = () => evaluate(client,reactSession,'({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})');
  async function native(command,...args) {
    if(!state?.pid) throw issue('Owned CFT PID absent; native Side Panel splitter cannot be controlled');
    const current=await readDOM();
    if(current.url!==state.host.url||current.timeOrigin!==state.host.timeOrigin)
      throw Error('Native input stopped: original host document changed');
    try {
      const reply=await execute('/usr/bin/swift',[nativeInput,String(state.pid),command,state.host.url,...args.map(String)],
        {timeout:45000,maxBuffer:1024*1024});
      const receipt=JSON.parse(reply.stdout.trim());
      if(receipt.status!=='CONTROLLED'||receipt.pid!==state.pid||receipt.url!==state.host.url)
        throw Error('Owned native input receipt mismatch');
      return receipt;
    } catch(error) {throw issue('Native '+command+' unavailable: '+(error.stdout?.trim()||error.message));}
  }
  async function initialize() {
    if(state) return;
    const host=await readDOM();
    const info=(await client.send('Target.getTargetInfo',{},hostSession)).targetInfo;
    const window=await client.send('Browser.getWindowForTarget',{targetId:info.targetId});
    state={host,window,targetId:info.targetId,pid:ctx.chromePid||ctx.report?.browserSessions?.at(-1)?.pid};
    state.zoomSession=ctx.zoomSession;
    if(!state.zoomSession) {
      if(host.surface==='EXTENSION_TAB') state.zoomSession=hostSession;
      else {
        const targets=(await client.send('Target.getTargets')).targetInfos;
        const target=targets.find(x=>x.type==='page'&&x.targetId!==info.targetId&&
          x.url.startsWith(new URL(host.url).origin+'/'));
        if(!target) throw issue('No existing same-extension tab for real Chrome tabs.setZoom');
        state.zoomSession=(await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
        state.ownsZoomSession=true;
        await client.send('Runtime.enable',{},state.zoomSession);
      }
    }
    const tab=await evaluate(client,state.zoomSession,'chrome.tabs.getCurrent()');
    if(!Number.isInteger(tab?.id)||(ctx.zoomTabId!=null&&ctx.zoomTabId!==tab.id)||
        !tab.url?.startsWith(new URL(host.url).origin+'/'))
      throw issue('Zoom launcher is not an existing tab of this extension');
    state.tabId=tab.id;
    state.originalTabZoom=await evaluate(client,state.zoomSession,'chrome.tabs.getZoom('+tab.id+')');
    state.initialFrame=await frame();
  }
  async function setZoom(factor) {
    const expression='(async()=>{const before=await chrome.tabs.getZoom('+state.tabId+');'+
      'await chrome.tabs.setZoom('+state.tabId+','+factor+');'+
      'return {before,after:await chrome.tabs.getZoom('+state.tabId+'),tabId:'+state.tabId+'};})()';
    const receipt=await evaluate(client,state.zoomSession,expression);
    if(!near(receipt.after,factor,.005)) throw issue('Chrome getZoom did not confirm '+factor);
    await client.send('Page.bringToFront',{},hostSession);
    return {method:'chrome.tabs.setZoom/getZoom (same extension origin)',...receipt};
  }
  async function read() {
    await initialize();
    const host=await readDOM(), ui=await frame();
    if(host.surface==='SIDE_PANEL') {
      const observation=await native('inspect');
      return {backingScaleFactor:observation.screen.backingScaleFactor,native:observation,host,iframe:ui,
        browserZoomFactor:ui.dpr/observation.screen.backingScaleFactor,window:state.window};
    }
    const tabZoom=await evaluate(client,hostSession,'chrome.tabs.getZoom('+host.tabId+')');
    return {backingScaleFactor:host.dpr/tabZoom,browserZoomFactor:tabZoom,host,iframe:ui,
      window:state.window,measurement:'actual extension-tab getZoom and document DPR; no Side Panel width claim'};
  }
  async function resize(width,zoom) {
    const receipts=[];
    for(let attempt=0;attempt<4;attempt++) {
      const current=await frame();
      if(near(current.width,width,1)) return receipts;
      const delta=(width-current.width)*zoom;
      if(state.host.surface==='SIDE_PANEL') {
        receipts.push(await native('activate'));
        const host=await readDOM();
        receipts.push(await native('drag',delta,host.width,zoom));
      } else {
        const before=await client.send('Browser.getWindowBounds',{windowId:state.window.windowId});
        const bounds={width:Math.max(100,Math.round(before.bounds.width+delta)),windowState:'normal'};
        // Chromium requires normalizing state separately from geometry.
        if(before.bounds.windowState!=='normal')
          await client.send('Browser.setWindowBounds',{windowId:state.window.windowId,bounds:{windowState:'normal'}});
        await client.send('Browser.setWindowBounds',{windowId:state.window.windowId,bounds:{width:bounds.width}});
        receipts.push({method:'Browser.setWindowBounds',before:before.bounds,requested:bounds});
      }
      await until(async()=>{const next=await frame();return next.width!==current.width&&next;},
        'Actual installed iframe changes after native width input',2500).catch(error=>
          receipts.push({unconfirmed:String(error.message||error)}));
    }
    if(!near((await frame()).width,width,1)) {
      const error=issue('Actual '+state.host.surface+' iframe CSS width '+width+' is unreachable (native minimum/screen/splitter)');
      error.evidence=receipts;throw error;
    }
    return receipts;
  }
  return {
    read,
    async apply({width,zoom}) {
      const original=await read();
      const zoomReceipt=await setZoom(zoom);
      try {
        await until(async()=>near((await frame()).dpr/original.backingScaleFactor,zoom,.025),
          'Chrome zoom reaches the actual installed iframe',3000);
      } catch(error) {
        const unavailable=issue('Real tabs.setZoom='+zoom+' did not reach '+state.host.surface+' iframe DPR');
        unavailable.evidence={zoomReceipt,actual:await frame(),backingScaleFactor:original.backingScaleFactor};
        throw unavailable;
      }
      const widthReceipts=await resize(width,zoom);
      return {widthMethod:state.host.surface==='SIDE_PANEL'?'native-splitter':'browser-window-bounds',
        zoomMethod:zoomReceipt.method,evidence:{zoomReceipt,widthReceipts},surface:state.host.surface};
    },
    async restore(original) {
      try {
        if(!state?.tabId) return null;
        const zoomReceipt=await setZoom(state.originalTabZoom);
        const bounds=state.window.bounds;
        await client.send('Browser.setWindowBounds',{windowId:state.window.windowId,bounds:{windowState:'normal'}});
        await client.send('Browser.setWindowBounds',{windowId:state.window.windowId,
          bounds:{left:bounds.left,top:bounds.top,width:bounds.width,height:bounds.height}});
        const observed=await read();
        const widthReceipts=await resize(original.iframe.width,observed.browserZoomFactor);
        if(bounds.windowState!=='normal')
          await client.send('Browser.setWindowBounds',{windowId:state.window.windowId,bounds:{windowState:bounds.windowState}});
        return {zoomReceipt,widthReceipts,window:await client.send('Browser.getWindowBounds',{windowId:state.window.windowId})};
      } finally {
        if(state?.ownsZoomSession&&!detached) {
          await client.send('Target.detachFromTarget',{sessionId:state.zoomSession});detached=true;
        }
      }
    },
  };
}

// Serialized into the REAL installed iframe. Reads only: no styles, DOM, SDK
// methods, focus(), click(), scrollIntoView(), synthetic events or state seeding.
function inspectUI(ratio) {
  const app = document.querySelector('.adblock-app');
  if (!app) return {mounted: false};
  const rect = el => {
    const r = el.getBoundingClientRect();
    return {x:r.x, y:r.y, left:r.left, top:r.top, right:r.right, bottom:r.bottom,
      width:r.width, height:r.height};
  };
  const key = el => {
    const parts = [];
    for (let n = el; n && n !== app; n = n.parentElement) {
      const index = [...n.parentElement.children].filter(x => x.tagName === n.tagName).indexOf(n) + 1;
      parts.unshift(n.localName + ':nth-of-type(' + index + ')');
    }
    return '.adblock-app > ' + parts.join(' > ');
  };
  const owner = el => el.closest('[data-slot="switch"]') || el;
  const rendered = el => {
    if (!el || el.closest('[hidden],[inert]')) return false;
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility !== 'visible' || Number(s.opacity) === 0) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const color = value => {
    // Unsupported wide gamut/gradients are NOT_TESTED, never a white fallback.
    const m = value.match(/^rgba?\(([^)]+)\)$/);
    if (!m) return null;
    const channels = m[1].replaceAll(',', ' ').replace('/', ' ').trim().split(/\s+/).map(Number);
    if (channels.some(x => !Number.isFinite(x)) || channels.length < 3) return null;
    return [...channels.slice(0,3), channels[3] ?? 1];
  };
  const over = (fg, bg) => {
    const alpha = fg[3] + bg[3] * (1 - fg[3]);
    return [...fg.slice(0,3).map((c,i) => alpha ?
      (c * fg[3] + bg[i] * bg[3] * (1 - fg[3])) / alpha : 0), alpha];
  };
  const background = el => {
    const layers = [];
    let opaque = false;
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage !== 'none' || Number(s.opacity) !== 1 || s.filter !== 'none' ||
          s.backdropFilter !== 'none' || s.mixBlendMode !== 'normal') return null;
      const c = color(s.backgroundColor);
      if (!c) return null;
      if (!opaque) layers.push(c);
      if (c[3] === 1) opaque = true;
    }
    if (!layers.length || layers.at(-1)[3] !== 1) return null;
    return layers.reverse().reduce((bg, fg) => over(fg, bg), [0,0,0,0]);
  };
  const name = el => el.getAttribute('aria-label') ||
    (el.getAttribute('aria-labelledby') || '').split(/\s+/)
      .map(id => document.getElementById(id)?.textContent || '').join(' ').trim() ||
    [...(el.labels || [])].map(x => x.textContent).join(' ').trim() || el.textContent.trim();
  const describe = el => {
    const visual = owner(el), style = getComputedStyle(visual), bounds = rect(visual);
    return {key:key(el), tag:el.tagName, role:el.getAttribute('role') ||
      (el.tagName === 'BUTTON' ? 'button' : el.type || el.localName),
      name:name(el), disabled:!!el.disabled || visual.hasAttribute('data-disabled') ||
        el.getAttribute('aria-disabled') === 'true', tabIndex:el.tabIndex, rect:bounds,
      hiddenFromAX:!!el.closest('[aria-hidden="true"]'),
      inViewport:bounds.left >= -1 && bounds.right <= innerWidth + 1 &&
        bounds.top >= -1 && bounds.bottom <= innerHeight + 1,
      outline:{width:parseFloat(style.outlineWidth), style:style.outlineStyle,
        color:style.outlineColor, offset:style.outlineOffset}, boxShadow:style.boxShadow,
      focusVisible:el.matches(':focus-visible') || visual.hasAttribute('data-focus-visible')};
  };
  const controls = [...app.querySelectorAll('button,input,select,textarea,a[href],[role="button"],[role="switch"]')]
    .filter(el => rendered(owner(el))).map(describe);
  const active = document.activeElement;
  let focus = null;
  if (document.hasFocus() && active && app.contains(active)) {
    focus = describe(active);
    const visual = owner(active), bg = background(visual.parentElement), fg = color(focus.outline.color);
    focus.outlineContrast = bg && fg ? ratio(over(fg,bg),bg) : null;
    const r = focus.rect;
    const x = Math.max(0,Math.min(innerWidth - 1,r.left + r.width / 2));
    const y = Math.max(0,Math.min(innerHeight - 1,r.top + r.height / 2));
    const hit = document.elementFromPoint(x,y);
    focus.hit = !!hit && (visual === hit || visual.contains(hit));
    focus.body = false;
  }
  const text = [], walker = document.createTreeWalker(app, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode, el = node.parentElement, value = node.textContent.trim();
    if (!value || !rendered(el)) continue;
    const style = getComputedStyle(el), bg = background(el), fg = color(style.color);
    const disabled = !!el.closest(':disabled,[aria-disabled="true"],[data-disabled]');
    const size = parseFloat(style.fontSize), weight = parseInt(style.fontWeight,10) || 400;
    const threshold = size >= 24 || (size >= 18.6667 && weight >= 700) ? 3 : 4.5;
    const unsupported = !bg || !fg || style.textShadow !== 'none' ||
      style.webkitTextFillColor !== style.color;
    const result = unsupported ? null : ratio(over(fg,bg),bg);
    const range = document.createRange(); range.selectNodeContents(node);
    const rects = [...range.getClientRects()].map(r =>
      ({left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height}));
    text.push({key:key(el), text:value, color:style.color, background:bg, fontSize:size,
      fontWeight:weight, threshold, ratio:result, rects,
      status:disabled ? 'EXEMPT_DISABLED' : result === null ? 'NOT_TESTED' :
        result + 1e-7 >= threshold ? 'PASS' : 'FAIL'});
  }
  const count=app.querySelector('.adblock-page-count')?.textContent.trim()||'';
  const view=app.querySelector('.adblock-control-row strong')?.textContent.trim()==='全局保护'
    ?'overview':count.includes('处手动屏蔽规则')?'手动屏蔽规则'
    :count.includes('个网站例外')?'已停用的网站'
    :app.querySelector('.adblock-card strong')?.textContent.trim()==='过滤范围'?'设置说明'
    :app.querySelector('.adblock-page-head strong')?.textContent.trim()||'unknown';
  return {mounted:true, url:location.href, timeOrigin:performance.timeOrigin,
    viewport:{width:innerWidth, height:innerHeight, dpr:devicePixelRatio,
      visualScale:visualViewport?.scale ?? null},
    theme:{light:matchMedia('(prefers-color-scheme:light)').matches,
      dark:matchMedia('(prefers-color-scheme:dark)').matches},
    tokens:Object.fromEntries(['--od-ink','--od-sub','--od-paper','--od-bg','--od-focus','--od-negative']
      .map(token => [token,getComputedStyle(document.documentElement).getPropertyValue(token).trim()])),
    runtime:{sdk:typeof globalThis.OpenDeskTool?.request === 'function',
      react:globalThis.OpenDeskPageReact?.version || null,sharedUI:!!globalThis.OpenDeskSidebarUI},
    view,
    statusText:app.querySelector('.adblock-state')?.textContent.trim() || '',
    overflow:{document:document.documentElement.scrollWidth > innerWidth + 1,
      app:app.scrollWidth > app.clientWidth + 1,
      scrollWidth:document.documentElement.scrollWidth, clientWidth:innerWidth},
    outside:controls.filter(x => x.rect.left < -1 || x.rect.right > innerWidth + 1),
    controls, focus, text};
}

export async function runAdblockLayoutNative(ctx) {
  const {client,hostSession,reactSession,evaluate,screenshot,until,report,nativeEnvironment} = ctx;
  if (!client?.send || !hostSession || !reactSession || !report ||
      [evaluate,screenshot,until,ctx.click,ctx.clickSandbox].some(fn => typeof fn !== 'function'))
    throw new TypeError('AdBlock layout requires the existing native runner sessions/helpers/report');
  if (nativeEnvironment && ['read','apply','restore'].some(name => typeof nativeEnvironment[name] !== 'function'))
    throw new TypeError('nativeEnvironment requires read(), apply({width,zoom}), restore(original)');
  const result = report.reactLayout = {
    schema:'opendesk.adblock.layout-native.v1', status:'NOT_TESTED',
    widthSemantics:'actual installed iframe CSS innerWidth at each real browser zoom',
    themeMethod:'CDP prefers-color-scheme on actual host and installed iframe',
    candidate:{candidate:report.candidate,root:report.root,packageSHA256:report.packageSHA256,
      artifactPackageHash:report.artifactPackageHash,sourceChain:report.sourceChain},
    matrix:ADBLOCK_LAYOUT_MATRIX.map(x => ({...x,status:'NOT_TESTED'})),
    sourceBinding:report.sourceChain?.buildId && /^[a-f0-9]{64}$/i.test(report.packageSHA256 || '') &&
      report.sourceChain.currentSourcePackageHash === report.sourceChain.rootOfficialPackageHash ? 'PASS' : 'NOT_TESTED',
    cases:[], screenshots:[], cleanup:[], limitations:[
      'Only installed React UI evidence; no six-dimension score, DNR, security, lifecycle or release PASS.',
      'AX names and bounded keyboard paths do not prove screen reader announcements or full WCAG conformance.',
      'Contrast uses actual computed sRGB text/background; complex paint or transparent canvas is NOT_TESTED.',
      'Disabled text is exempt; nontext boundaries, all UI states and screenshot visual review remain NOT_TESTED.',
      'Read-only navigation never activates filter switches, picker, rule restore or uninstall.',
      'Screenshots are the real host viewport, with iframe geometry; no mock/preview is accepted.',
    ],
  };
  const read = () => evaluate(client,reactSession,
    '(' + inspectUI.toString() + ')(' + contrastRatio.toString() + ')');
  const host = () => evaluate(client,hostSession,`(async()=>{
    const frame=document.querySelector('#sidebar-tool-frame iframe');
    const r=frame?.getBoundingClientRect();
    const contexts=await chrome.runtime.getContexts({contextTypes:['SIDE_PANEL'],documentUrls:[location.href]});
    const a=document.activeElement;
    return {url:location.href,timeOrigin:performance.timeOrigin,extensionId:chrome.runtime.id,
      contexts:contexts.map(x=>({documentId:x.documentId,documentUrl:x.documentUrl,contextType:x.contextType})),
      width:innerWidth,height:innerHeight,dpr:devicePixelRatio,visualScale:visualViewport?.scale,
      overflow:document.documentElement.scrollWidth>innerWidth+1,
      frame:frame?{src:frame.src,visible:!frame.closest('[hidden]')&&r.width>0&&r.height>0,
        rect:r.toJSON(),scaleX:r.width/frame.offsetWidth,scaleY:r.height/frame.offsetHeight,
        clientLeft:frame.clientLeft,clientTop:frame.clientTop}:null,
      active:{tag:a?.tagName,id:a?.id,inIframe:a===frame},
      title:document.querySelector('#sidebar-tool-title')?.textContent.trim()};})()`);
  const key = async (value, shift = false) => {
    const code = value === 'Tab' ? 9 : 13;
    for (const type of ['keyDown','keyUp'])
      await client.send('Input.dispatchKeyEvent',{type,key:value,code:value,
        windowsVirtualKeyCode:code,nativeVirtualKeyCode:code,modifiers:shift?8:0},hostSession);
  };
  let identity, original, initialEnvironment, environmentTouched = false, mediaTouched = false, serial = 0;
  const snap = async label => {
    const shot = await screenshot(client,hostSession,'adblock-layout-'+(++serial)+'-'+label);
    if (!shot?.file || !shot?.sha256) throw Error('screenshot helper did not return a file and SHA-256');
    result.screenshots.push(shot); return shot;
  };
  const verifyIdentity = async () => {
    const panel = await host(), ui = await read();
    if (!ui.mounted || !ui.runtime.sdk || !ui.runtime.react || !ui.runtime.sharedUI ||
        !panel.frame?.visible || panel.frame.src !== ui.url ||
        panel.contexts.length !== 1 || panel.contexts[0].documentUrl !== panel.url ||
        !panel.url.startsWith('chrome-extension://') ||
        !['广告拦截','手动屏蔽规则','已停用的网站','广告拦截设置'].includes(panel.title))
      throw issue('Not the visible installed AdBlock iframe in a self-reported SIDE_PANEL');
    const tree = await client.send('Page.getFrameTree',{},reactSession);
    const owner = await client.send('DOM.getFrameOwner',{frameId:tree.frameTree.frame.id},hostSession);
    const described = await client.send('DOM.describeNode',{backendNodeId:owner.backendNodeId},hostSession);
    const attrs = described.node.attributes || [];
    const src = attrs.indexOf('src') >= 0 ? attrs[attrs.indexOf('src')+1] : null;
    if (described.node.nodeName !== 'IFRAME' || src !== panel.frame.src)
      throw issue('React session cannot be bound to the installed host iframe owner');
    const now = {hostUrl:panel.url,hostTimeOrigin:panel.timeOrigin,
      documentId:panel.contexts[0].documentId,frameUrl:ui.url,frameTimeOrigin:ui.timeOrigin};
    if (identity && JSON.stringify(identity) !== JSON.stringify(now))
      throw Error('Installed host/iframe identity changed during layout input; stopped');
    identity ||= now;
    return {panel,ui};
  };
  const activeMatches = async (scope, selector) => evaluate(client,
    scope === 'host' ? hostSession : reactSession,
    '(()=>{const a=document.activeElement;return document.hasFocus()&&!!a&&a.matches('+JSON.stringify(selector)+')})()');
  const focusTarget = async (scope, selector, trace) => {
    for (let step=0;step<90;step++) {
      if (await activeMatches(scope,selector)) return;
      await key('Tab');
      trace.push({key:'Tab',scope,selector,step});
    }
    throw Object.assign(Error('Native Tab cannot reach '+scope+' '+selector),{code:'E_ADBLOCK_LAYOUT_UI_FAILURE'});
  };
  const keyboardNavigate = async (scope, selector, expected, trace) => {
    await focusTarget(scope,selector,trace);
    await key('Enter'); trace.push({key:'Enter',scope,selector});
    await until(async()=>((await read()).view === expected),'AdBlock keyboard view '+expected,5000);
  };
  const inspectFocus = async () => {
    const ui = await read(), outer = await host(), focus = ui.focus;
    if (!focus || !outer.active.inIframe) return null;
    const f = outer.frame, r = focus.rect;
    const left=f.rect.left+(f.clientLeft+r.left)*f.scaleX;
    const top=f.rect.top+(f.clientTop+r.top)*f.scaleY;
    const right=left+r.width*f.scaleX,bottom=top+r.height*f.scaleY;
    const fullyVisible = focus.inViewport && left >= -1 && right <= outer.width+1 &&
      top >= -1 && bottom <= outer.height+1;
    const outerHit=await evaluate(client,hostSession,
      'document.elementFromPoint('+((left+right)/2)+','+((top+bottom)/2)+')===document.querySelector("#sidebar-tool-frame iframe")');
    return {...focus,fullyVisible,hit:focus.hit&&outerHit,
      indicator:focus.focusVisible && focus.outline.width >= 1 && focus.outline.style !== 'none',
      // A box shadow alone needs screenshot review instead of an invented ratio.
      shadowOnly:focus.outline.width < 1 && focus.boxShadow !== 'none'};
  };
  const auditView = async (label, row) => {
    const {ui,panel} = await verifyIdentity();
    const view = {view:ui.view,metrics:ui,host:panel,checks:{},keyboard:{trace:[],focused:[]}};
    row.views.push(view);
    view.screenshot = await snap(label+'-view');
    view.checks.layout = ui.overflow.document || ui.overflow.app || panel.overflow || ui.outside.length ? 'FAIL' : 'PASS';
    const eligible = ui.text.filter(x => x.status !== 'EXEMPT_DISABLED');
    view.contrast = {samples:eligible.length,minimumRatio:eligible.filter(x=>x.ratio!==null)
      .reduce((min,x)=>Math.min(min,x.ratio),Infinity),
      failures:eligible.filter(x=>x.status==='FAIL'),unknown:eligible.filter(x=>x.status==='NOT_TESTED')};
    if (!Number.isFinite(view.contrast.minimumRatio)) view.contrast.minimumRatio = null;
    view.checks.textContrast = summarize(eligible.map(x=>x.status));
    try {
      const tree = await client.send('Accessibility.getFullAXTree',{},reactSession);
      view.ax = tree.nodes.filter(x=>!x.ignored && ['button','switch','checkbox','link'].includes(x.role?.value))
        .map(x=>({id:x.nodeId,backendNodeId:x.backendDOMNodeId,role:x.role.value,name:x.name?.value||'',properties:x.properties}));
      view.checks.accessibleNames = !view.ax.length ? 'NOT_TESTED' :
        view.ax.some(x=>!x.name.trim()) || ui.controls.some(x=>!x.name.trim()||x.hiddenFromAX) ? 'FAIL' : 'PASS';
    } catch (error) { view.axError=String(error.message||error); view.checks.accessibleNames='NOT_TESTED'; }
    const expected = ui.controls.filter(x=>!x.disabled);
    const wanted = new Set(expected.filter(x=>x.tabIndex>=0).map(x=>x.key)), seen = new Set();
    for (let step=0;step<90 && seen.size<wanted.size;step++) {
      await key('Tab');
      const focus = await inspectFocus();
      view.keyboard.trace.push({key:'Tab',focus});
      if (!focus || seen.has(focus.key) || !wanted.has(focus.key)) continue;
      seen.add(focus.key);
      const sample = {...focus,screenshot:await snap(label+'-focus-'+seen.size)};
      view.keyboard.focused.push(sample);
    }
    view.keyboard.unreachable = expected.filter(x=>!seen.has(x.key));
    view.checks.tabReachability = view.keyboard.unreachable.length ? 'FAIL' : expected.length ? 'PASS' : 'NOT_TESTED';
    const focuses = view.keyboard.focused;
    view.checks.visibleFocus = focuses.length ? summarize(focuses.map(x=>
      !x.fullyVisible || !x.hit ? 'FAIL' : x.indicator ?
        x.outlineContrast === null ? 'NOT_TESTED' : x.outlineContrast >= 3 ? 'PASS' : 'FAIL' :
        x.shadowOnly ? 'NOT_TESTED' : 'FAIL')) : 'NOT_TESTED';
    // Check real reverse order from a known React focus, including boundary exit.
    const last = focuses.at(-1);
    if (last) {
      await key('Tab',true);
      const reverse = await inspectFocus(), outer = await host();
      view.keyboard.reverse = {key:'Shift+Tab',before:last,after:reverse,hostActive:outer.active};
      view.checks.reverseTab = reverse ? reverse.key !== last.key && reverse.fullyVisible ? 'PASS' : 'FAIL' :
        !outer.active.inIframe && outer.active.tag !== 'BODY' ? 'PASS' : 'NOT_TESTED';
    } else view.checks.reverseTab='NOT_TESTED';
    view.status=summarize(Object.values(view.checks));
    return view;
  };
  const overview = async trace => {
    if ((await read()).view !== 'overview')
      await keyboardNavigate('host',backSelector,'overview',trace);
  };
  const capture = async row => {
    row.views=[];row.navigation=[];row.returns=[];
    result.cases.push(row);
    await overview(row.navigation);
    await until(async()=>!(await read()).statusText.includes('正在核对'),'AdBlock status loaded',8000);
    const name=row.label;
    await auditView(name+'-overview',row);
    const routes=[
      {scope:'react',selector:'.adblock-link',view:'已停用的网站',name:'exceptions'},
      {scope:'react',selector:'.adblock-manual-actions button:nth-child(2)',view:'手动屏蔽规则',name:'cosmetics'},
      {scope:'host',selector:settingsSelector,view:'设置说明',name:'settings'},
    ];
    for(const route of routes) {
      const disabled=await evaluate(client,route.scope==='host'?hostSession:reactSession,
        '(()=>{const n=document.querySelector('+JSON.stringify(route.selector)+');return !n||n.disabled})()');
      if(disabled){row.navigation.push({...route,status:'NOT_TESTED',reason:'Real navigation control is absent/disabled'});continue;}
      await keyboardNavigate(route.scope,route.selector,route.view,row.navigation);
      await auditView(name+'-'+route.name,row);
      await keyboardNavigate('host',backSelector,'overview',row.navigation);
      const restored=await activeMatches(route.scope,route.selector);
      row.returns.push({from:route.name,status:restored?'PASS':'FAIL',expected:route.selector,
        actual:(await read()).focus,hostActive:(await host()).active,
        screenshot:await snap(name+'-'+route.name+'-return')});
    }
    row.status=summarize([...row.views.map(x=>x.status),...row.returns.map(x=>x.status),
      ...(row.views.length===4?[]:['NOT_TESTED'])]);
  };
  try {
    const first = await verifyIdentity();
    initialEnvironment=first;
    result.identity={...identity,extensionId:first.panel.extensionId};
    await client.send('Page.bringToFront',{},hostSession);
    if (!nativeEnvironment) {
      result.limitations.push('Native width/zoom adapter absent: current installed viewport only; all 16 matrix cells NOT_TESTED.');
      await capture({label:'current-installed',requested:null,environment:first});
    } else {
      original=await nativeEnvironment.read();
      if (!Number.isFinite(original?.backingScaleFactor) || original.backingScaleFactor <= 0)
        throw issue('Native display backingScaleFactor is missing');
      for(const cell of result.matrix) {
        try {
          environmentTouched=true;
          cell.input=await nativeEnvironment.apply({width:cell.width,zoom:cell.zoom});
          if(cell.input?.widthMethod!=='native-splitter' || !cell.input.zoomMethod || !cell.input.evidence ||
              /emulat|device.?scale|page.?scale|css|mock|preview/i.test(cell.input.zoomMethod))
            throw issue('Missing genuine native splitter/browser zoom receipts');
          mediaTouched=true;
          for(const session of [hostSession,reactSession])
            await client.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:cell.theme}]},session);
          const measured=await until(async()=>{
            const sample=await verifyIdentity(), native=await nativeEnvironment.read();
            const factor=sample.ui.viewport.dpr/native.backingScaleFactor;
            return near(sample.ui.viewport.width,cell.width,1) && near(factor,cell.zoom,.025) &&
              near(sample.panel.dpr/native.backingScaleFactor,cell.zoom,.025) &&
              near(sample.ui.viewport.visualScale,1,.01) && near(sample.panel.visualScale,1,.01) &&
              sample.ui.theme[cell.theme] ? {...sample,native,actualZoom:factor} : null;
          },'Actual installed AdBlock width/theme/browser zoom',5000);
          cell.measured=measured;
          await capture({label:cell.width+'-'+cell.theme+'-'+cell.zoom,requested:{width:cell.width,theme:cell.theme,zoom:cell.zoom},environment:measured});
          cell.caseIndex=result.cases.length-1;cell.status=result.cases.at(-1).status;
        } catch(error) {
          cell.reason=String(error.message||error);cell.status='NOT_TESTED';
          cell.failureScreenshot=await snap('unverified-'+cell.width+'-'+cell.theme+'-'+cell.zoom).catch(()=>null);
          if(error.code!=='E_ADBLOCK_LAYOUT_UNREACHABLE') throw error;
        }
      }
    }
  } catch(error) {
    result.error={message:String(error.message||error),code:error.code||null};
    result.failureScreenshot=await snap('failure').catch(()=>null);
  } finally {
    // Navigation/media/geometry restoration cannot hide a failed evidence case.
    if(identity) {
      try {await overview([]);result.cleanup.push({operation:'return-overview',status:'PASS'});}
      catch(error){result.cleanup.push({operation:'return-overview',status:'FAIL',error:String(error.message||error)});}
    }
    if(mediaTouched) {
      for(const [scope,session] of [['host',hostSession],['react',reactSession]]) {
        try {await client.send('Emulation.setEmulatedMedia',ctx.restoreMedia?.[scope]||{features:[]},session);
          result.cleanup.push({operation:'restore-media-'+scope,status:'PASS'});}
        catch(error){result.cleanup.push({operation:'restore-media-'+scope,status:'FAIL',error:String(error.message||error)});}
      }
    }
    if(environmentTouched) {
      try {const receipt=await nativeEnvironment.restore(original);
        const after=await verifyIdentity(), native=await nativeEnvironment.read();
        const factor=after.ui.viewport.dpr/native.backingScaleFactor;
        const before=result.matrix.find(x=>x.measured)?.measured;
        // The adapter owns restoring original splitter/window state; preserve
        // its independent receipt rather than infer restoration from a width.
        result.cleanup.push({operation:'restore-native-environment',status:receipt?'PASS':'NOT_TESTED',receipt,
          original,after:{native,viewport:after.ui.viewport,actualZoom:factor},hadMeasuredCase:!!before});}
      catch(error){result.cleanup.push({operation:'restore-native-environment',status:'FAIL',error:String(error.message||error)});}
    }
    const statuses=[result.sourceBinding,...result.matrix.map(x=>x.status),...result.cases.flatMap(x=>
      [x.status,...(x.views||[]).flatMap(v=>Object.values(v.checks)),...(x.returns||[]).map(r=>r.status)]),
      ...result.cleanup.map(x=>x.status)];
    if(result.error) statuses.push(result.error.code==='E_ADBLOCK_LAYOUT_UI_FAILURE'?'FAIL':'NOT_TESTED');
    result.status=summarize(statuses);
    result.finishedAt=new Date().toISOString();
  }
  return result;
}
