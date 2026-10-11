import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {SIDEBAR_TOOL_ENABLE_STORE,TOOL_REVOCATION_EPOCHS_STORE} from '../../src/ui/sidebar-tools/lifecycle.js';
import {sidebarToolStorageKey} from '../../src/ui/sidebar-tools/package.js';
import {READING_TOC_SITE_STORE,READING_TOC_VISIBILITY_STORE} from '../../src/reading-toc/policy.js';

// Extends the existing native Chrome driver. All product mutations use native input.
export async function runR261Acceptance(d){
  const {side,host,pageA,evidence,packages,extensionId,servers,phase,click,evaluate,until,
    activate,openTool,back,officialInstall,importPackage,nativeDialogClick,screenshot,
    readStore,installed,openTab,openPanel,assertNoFrames,sendBrowser}=d;
  const open=id=>'[data-sidebar-tool-id="'+id+'"][data-sidebar-tool-action="open"]';
  const frameCount=target=>evaluate(target,'document.querySelectorAll("#sidebar-tool-frame iframe").length');
  const settings=async target=>{
    if(await evaluate(target,'document.querySelector("#sidebar-tool-settings-view").hidden'))await click(target,'#sidebar-tool-settings-open');
  };
  await phase('r261-reset-preinstalled-tools-through-confirmed-ui');
  for(const tool of await installed()){
    await click(side,open(tool.id));
    await nativeDialogClick(side,'#sidebar-tool-remove',[{parts:['卸载','删除']}]);
    await until(async()=>!(await installed()).some(row=>row.id===tool.id),'preinstalled tool removed '+tool.id);
  }
  await phase('r261-local-import-once');
  const notes=packages.get('quick-notes');await importPackage(notes,'r261-reviewed-notes');
  await assertNoFrames();assert.equal((await installed()).filter(row=>row.id===notes.id).length,1);
  await importPackage(notes,'r261-identical-notes',[],{reviewOnly:true});
  assert.equal((await installed()).filter(row=>row.id===notes.id).length,1);
  await officialInstall('reading-toc');
  assert.deepEqual(await evaluate(side,'Array.from(document.querySelectorAll("#sidebar-tool-list .sidebar-tool-row"),row=>row.querySelectorAll("button").length)'),[1,1]);
  await screenshot(side,'r261-installed-list.png');

  await phase('r261-native-note-persistence');
  const frame=await openTool(notes.id),note='R26.1 保留数据 '+randomUUID();
  await click(frame,'#note-text');await frame.send('Input.insertText',{text:note});await click(frame,'#save-note');
  await until(async()=>JSON.stringify(await readStore(sidebarToolStorageKey(notes.id))).includes(note),'native saved note');
  await until(()=>evaluate(frame,'!document.querySelector("#save-note").disabled'),'note save completed');
  const noteData=await readStore(sidebarToolStorageKey(notes.id));await back();

  await phase('r261-detail-toolbar-and-site-authorization');
  await activate(pageA);
  await until(()=>evaluate(side,'document.querySelector("#script-current-page-url").textContent.includes('+JSON.stringify(servers[0].origin)+')'),'current website A');
  await openTool('reading-toc');
  assert.equal(await evaluate(side,'document.querySelector("#sidebar-tool-visibility").disabled'),true);
  assert.match(await evaluate(side,'document.querySelector("#sidebar-tool-visibility").title'),/授权/);
  await settings(side);
  await nativeDialogClick(side,'#sidebar-tool-settings-allow',[{parts:[servers[0].origin,'章节标题']}]);
  await until(async()=>(await readStore(READING_TOC_SITE_STORE))?.['reading-toc']?.includes(servers[0].origin),'site grant persisted');
  await until(()=>evaluate(pageA,'document.querySelectorAll("[data-opendesk-toc-root]").length===1'),'authorized webpage overlay');
  const grants=await readStore(READING_TOC_SITE_STORE);
  const expected=['sidebar-tool-back','sidebar-tool-open-tab','sidebar-tool-settings-open','sidebar-tool-visibility','sidebar-tool-remove'];
  assert.deepEqual(await evaluate(side,'Array.from(document.querySelectorAll(".sidebar-tool-view-head button"),b=>b.id)'),expected);
  assert(await evaluate(side,'Array.from(document.querySelectorAll(".sidebar-tool-view-head button"),b=>!!b.querySelector("svg")&&!!b.title&&!!b.getAttribute("aria-label")).every(Boolean)'));

  await phase('r261-site-page-appearance-intersection');
  await click(side,'#sidebar-tool-settings-site-visibility');
  await until(async()=>(await readStore(READING_TOC_VISIBILITY_STORE))?.['reading-toc']?.hiddenSites?.length===1,'site hidden');
  await click(side,'#sidebar-tool-settings-page-visibility');
  await until(async()=>(await readStore(READING_TOC_VISIBILITY_STORE))?.['reading-toc']?.hiddenPages?.length===1,'page hidden');
  await click(side,'#sidebar-tool-visibility');
  await until(async()=>!(await readStore(READING_TOC_VISIBILITY_STORE))?.['reading-toc'],'eye restores both rules');
  await until(()=>evaluate(pageA,'document.querySelectorAll("[data-opendesk-toc-root]").length===1'),'overlay visibly restored');
  assert.deepEqual(await readStore(READING_TOC_SITE_STORE),grants);

  await phase('r261-responsive-details-and-keyboard');evidence.r261Responsive=[];
  for(const width of [320,360,400,600]){
    await side.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
    await until(()=>evaluate(side,'innerWidth==='+width),'detail viewport '+width);
    const layout=await evaluate(side,'({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,buttons:Array.from(document.querySelectorAll(".sidebar-tool-view-head button"),b=>({id:b.id,x:b.getBoundingClientRect().x,right:b.getBoundingClientRect().right}))})');
    assert(layout.scrollWidth<=width);assert(layout.buttons.every(b=>b.x>=0&&b.right<=width));
    evidence.r261Responsive.push(layout);await screenshot(side,'r261-detail-'+width+'.png');
  }
  await side.send('Emulation.clearDeviceMetricsOverride');
  await click(side,'#sidebar-tool-back');
  for(let i=0;i<2;i++){
    await side.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8});
    await side.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers:8});
  }
  assert.equal(await evaluate(side,'document.activeElement.id'),'sidebar-tool-back');
  for(const id of expected.slice(1)){
    await side.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await side.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    const focus=await evaluate(side,'({id:document.activeElement.id,visible:document.activeElement.matches(":focus-visible")})');
    assert.equal(focus.id,id);assert.equal(focus.visible,true);
  }
  await screenshot(side,'r261-native-keyboard-focus.png');
  // A real extension tab permits Chrome's actual zoom API; CSS metrics are separate evidence.
  await click(side,'#sidebar-tool-open-tab');
  const tabInfo=await until(async()=>(await sendBrowser('Target.getTargets')).targetInfos.find(t=>t.type==='page'&&t.url.includes('toolId=reading-toc')),'new tool tab');
  const zoomTab=await evaluate(host,'chrome.tabs.query({}).then(rows=>rows.find(t=>t.url?.includes("toolId=reading-toc"))?.id)');
  await evaluate(host,'chrome.tabs.setZoom('+zoomTab+',2)');
  assert.equal(await evaluate(host,'chrome.tabs.getZoom('+zoomTab+')'),2);
  evidence.r261Zoom={factor:2,tabId:zoomTab,targetId:tabInfo.targetId,method:'Chrome tabs.setZoom/getZoom'};
  const {sessionId}=await sendBrowser('Target.attachToTarget',{targetId:tabInfo.targetId,flatten:true});
  const zoomTarget={type:'page',send:(method,params)=>sendBrowser(method,params,20000,sessionId)};
  await until(()=>evaluate(zoomTarget,'document.querySelector("#sidebar-tool-title")?.textContent.length>0'),'zoomed detail ready');
  assert(await evaluate(zoomTarget,'document.documentElement.scrollWidth<=innerWidth'));
  await screenshot(zoomTarget,'r261-detail-200-percent.png');
  await sendBrowser('Target.closeTarget',{targetId:tabInfo.targetId});

  await phase('r261-stop-resume-preserves-authority-and-no-auto-run');
  await settings(side);await click(side,'#sidebar-tool-enable');
  await until(async()=>(await readStore(SIDEBAR_TOOL_ENABLE_STORE))?.['reading-toc']===false,'tool stopped');
  await until(()=>frameCount(side).then(n=>n===0),'stopped sandbox removed');
  await until(()=>evaluate(pageA,'document.querySelectorAll("[data-opendesk-toc-root]").length===0'),'stopped content observer removed');
  assert.deepEqual(await readStore(READING_TOC_SITE_STORE),grants);
  const stopEpoch=(await readStore(TOOL_REVOCATION_EPOCHS_STORE))['reading-toc'];
  await click(side,'#sidebar-tool-enable');
  await until(async()=>(await readStore(SIDEBAR_TOOL_ENABLE_STORE))?.['reading-toc']===true,'tool resumed');
  assert.equal(await frameCount(side),0);assert.notEqual((await readStore(TOOL_REVOCATION_EPOCHS_STORE))['reading-toc'],stopEpoch);
  assert.deepEqual(await readStore(READING_TOC_SITE_STORE),grants);
  await screenshot(side,'r261-enabled-awaits-open.png');
  await click(side,'#sidebar-tool-launch');await until(()=>frameCount(side).then(n=>n===1),'explicit launch');await back();

  await phase('r261-two-real-side-panels-sync');
  const launcher=await openTab('chrome-extension://'+extensionId+'/ui/tool.html?hostInstanceId='+randomUUID(),true);
  const second=await openPanel(launcher);
  const draftFrame=await openTool(notes.id),draft='R26.1 未保存草稿 '+randomUUID();
  await click(draftFrame,'#note-text');await draftFrame.send('Input.insertText',{text:draft});
  await click(second,open(notes.id));await until(()=>frameCount(second).then(n=>n===1),'second notes frame');
  assert.equal(await evaluate(side,'document.querySelector("#sidebar-tool-visibility").hidden'),true);
  await settings(second);await click(second,'#sidebar-tool-enable');
  await until(async()=>(await readStore(SIDEBAR_TOOL_ENABLE_STORE))?.[notes.id]===false,'notes stopped');
  await until(async()=>await frameCount(side)===0&&await frameCount(second)===0,'both native panel frames revoked');
  assert(await evaluate(side,'document.querySelector("#sidebar-tool-page-exceptions").hidden'));
  assert.deepEqual(await readStore(sidebarToolStorageKey(notes.id)),noteData);
  assert(await evaluate(side,'document.querySelector("#sidebar-tool-retired-draft-text").value.includes('+JSON.stringify(draft)+')'));
  await click(side,'#sidebar-tool-enable');
  await until(async()=>(await readStore(SIDEBAR_TOOL_ENABLE_STORE))?.[notes.id]===true,'notes enabled');
  assert.equal(await frameCount(side),0);assert.equal(await frameCount(second),0);
  await screenshot(second,'r261-second-panel-management.png');
  await sendBrowser('Target.closeTarget',{targetId:second.targetId});await sendBrowser('Target.closeTarget',{targetId:launcher.targetId});

  await phase('r261-uninstall-confirmation-and-recovery-cleanup');
  await nativeDialogClick(side,'#sidebar-tool-remove',[{parts:['卸载','删除'],accept:false}]);
  assert((await installed()).some(t=>t.id===notes.id));assert.deepEqual(await readStore(sidebarToolStorageKey(notes.id)),noteData);
  await nativeDialogClick(side,'#sidebar-tool-remove',[{parts:['卸载','删除']}]);
  await until(async()=>!(await installed()).some(t=>t.id===notes.id),'notes removed');
  await until(async()=>(await readStore(sidebarToolStorageKey(notes.id)))===undefined,'confirmed data cleanup');
  assert.equal((await readStore(SIDEBAR_TOOL_ENABLE_STORE))?.[notes.id],undefined);
  await click(side,open('reading-toc'));
  await nativeDialogClick(side,'#sidebar-tool-remove',[{parts:['卸载','删除']}]);
  await until(async()=>(await installed()).length===0,'all test tools removed');await assertNoFrames();
  evidence.r261={result:'PASS',site:servers[0].origin+'/article',noteSavedVia:'native keyboard and save',
    listSingleEntry:true,toolbarOrder:expected,dualPanel:true,previewAndManifestEscalation:'component tests only',
    chatgptKnowledgeContent:'NOT_TESTED',inFlightNativeEffects:'NOT_TESTED',fullFrameworkF3:'NOT_TESTED',zipInstallation:'NOT_TESTED'};
}
