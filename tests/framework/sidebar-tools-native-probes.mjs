// Acceptance-only CDP driver. Inputs use Chrome Input; attacks run in actual sandboxes.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {SIDEBAR_TOOL_PROTOCOL} from '../../src/ui/sidebar-tools/package.js';
import {connect,evaluate} from './sidebar-native-session.mjs';

const directory=path.resolve(process.env.TOOL_EVIDENCE_DIR||'docs/framework/evidence/sidebar-tools-r1-mac-01a11fa4/native-final2');
const session=JSON.parse(await readFile(path.join(directory,'session.json'),'utf8'));
const client=await connect(session.endpoint), mode=process.argv[2];
async function inspect(expression,id){const r=await client.send('Runtime.evaluate',{expression,returnByValue:true,includeCommandLineAPI:true},id);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
const save=(name,value)=>writeFile(path.join(directory,name+'.json'),JSON.stringify({at:new Date().toISOString(),session,...value},null,2)+'\n');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function attach(part,type,selector){
  let targets=(await client.send('Target.getTargets')).targetInfos;
  if(type==='service_worker'&&!targets.some(t=>t.type===type&&t.url.includes(part))){
    const context=targets.find(t=>t.type==='page'&&t.url.includes('/ui/tool.html?hostInstanceId='));
    assert(context,'Real extension page required to start its own idle worker');
    const control=(await client.send('Target.attachToTarget',{targetId:context.targetId,flatten:true})).sessionId;
    await client.send('ServiceWorker.enable',{},control);
    await client.send('ServiceWorker.startWorker',{scopeURL:'chrome-extension://'+session.extensionId+'/'},control);
    for(let i=0;i<30;i++){targets=(await client.send('Target.getTargets')).targetInfos;if(targets.some(t=>t.type===type&&t.url.includes(part)))break;await pause(100);}
  }
  for(const target of targets.filter(t=>t.url.includes(part)&&(!type||t.type===type))){
    const id=(await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
    if(!selector||await evaluate(client,`Boolean(document.querySelector(${JSON.stringify(selector)})?.getClientRects().length)`,id))return {...target,id};
  }
  throw Error('Missing actual target '+part+' / '+selector);
}
async function click(id,selector){
  const before=await evaluate(client,`(()=>{globalThis.__acceptanceNativeClicks||=[];if(!globalThis.__acceptanceNativeArmed){globalThis.__acceptanceNativeArmed=true;document.addEventListener('click',e=>__acceptanceNativeClicks.push({id:e.target.id,text:e.target.textContent,isTrusted:e.isTrusted,selector:globalThis.__expectedSelector,matched:document.querySelector(globalThis.__expectedSelector)?.contains(e.target)}),true);}globalThis.__expectedSelector=${JSON.stringify(selector)};return __acceptanceNativeClicks.length;})()`,id);
  const rect=await evaluate(client,`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled||!n.getClientRects().length)throw Error('Unavailable control');n.scrollIntoView({block:'center'});const r=n.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(r.width<=0||r.height<=0||!n.contains(document.elementFromPoint(x,y)))throw Error('Control is hidden or obstructed');return {x,y};})()`,id);
  await client.send('Input.dispatchMouseEvent',{type:'mousePressed',...rect,button:'left',clickCount:1},id);
  await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',...rect,button:'left',clickCount:1},id);
  const events=await evaluate(client,`__acceptanceNativeClicks.slice(${before})`,id);
  assert.equal(events.length,1,'Exactly one click on the requested visible control');
  assert.equal(events[0].isTrusted,true);assert.equal(events[0].matched,true);
  return events;
}
try{
  const host=await attach('/ui/tool.html?hostInstanceId=',undefined,['input','click'].includes(mode)&&process.argv[3]==='host'?process.argv[4]:undefined);
  if(mode==='cycle'){
    const measurements=[];
    await client.send('HeapProfiler.collectGarbage',{},host.id);
    const baseline=await client.send('Memory.getDOMCounters',{},host.id);
    for(let round=0;round<=20;round++){
      if(round){await click(host.id,'#sidebar-tool-tabs button:first-child');await click(host.id,'#sidebar-tool-tabs button:nth-child(2)');}
      await pause(100);
      const state=await inspect(`({iframeCount:document.querySelectorAll('iframe').length,toolFrames:document.querySelectorAll('#sidebar-tool-frame iframe').length,messageListeners:getEventListeners(window).message.length})`,host.id);
      const memory=await client.send('Memory.getDOMCounters',{},host.id);
      const tool=await attach('/sidebar-tools/sandbox.html','iframe','#note-text');
      const note=await evaluate(client,"document.querySelector('#note-text').value",tool.id);
      assert.equal(note,'中文最终验收：关闭重开与浏览器重启后保留。');
      measurements.push({round,...state,...memory});
      assert.equal(state.toolFrames,1);assert.equal(state.messageListeners,measurements[0].messageListeners);
    }
    await click(host.id,'#sidebar-tool-tabs button:first-child');await pause(100);
    const closed=await inspect(`({toolFrames:document.querySelectorAll('#sidebar-tool-frame iframe').length,messageListeners:getEventListeners(window).message.length,inputs:__acceptanceNativeClicks})`,host.id);
    assert.equal(closed.toolFrames,0);assert.equal(closed.messageListeners,measurements[0].messageListeners);
    await client.send('HeapProfiler.collectGarbage',{},host.id);
    const afterGc=await client.send('Memory.getDOMCounters',{},host.id);
    assert(afterGc.nodes<=baseline.nodes+50);assert(afterGc.jsEventListeners<=baseline.jsEventListeners+5);
    await save('cycles-20',{status:'NATIVE_PASS',measurements,closed,baseline,afterGc,note:'Stable iframe/message-listener counts and bounded post-GC DOM counters; no claim of zero heap leakage.'});
    await click(host.id,'#sidebar-tool-tabs button:nth-child(2)');
  }else if(mode==='layout'){
    // Observe the genuine Side Panel; never substitute the catalog-only tab.
    const tool=await attach('/sidebar-tools/sandbox.html','iframe','#note-text');
    const read=id=>evaluate(client,`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,scale:visualViewport.scale,devicePixelRatio,buttons:[...document.querySelectorAll('button')].filter(n=>n.getClientRects().length).map(n=>({text:n.textContent,width:n.getBoundingClientRect().width,right:n.getBoundingClientRect().right,disabled:n.disabled})),bodyHeight:document.body.scrollHeight})`,id);
    const state={host:await read(host.id),tool:await read(tool.id)};
    if(process.argv[3])assert.equal(state.host.width,Number(process.argv[3]));
    assert(state.tool.scrollWidth<=state.tool.width);
    await save('layout-'+state.host.width,{status:'NATIVE_PASS',state,method:'Actual embedded Chrome Side Panel; measured CSS viewport.'});
    // Embedded iframe screenshot commands are unsupported by Chrome. The
    // genuine host screenshot includes its rendered sandbox.
    const shot=await client.send('Page.captureScreenshot',{format:'png'},host.id);
    await writeFile(path.join(directory,`width-${state.host.width}-panel.png`),Buffer.from(shot.data,'base64'));
  }else if(mode==='security'){
    const tool=await attach('/sidebar-tools/sandbox.html','iframe');
    await evaluate(client,`(()=>{globalThis.__messages=[];document.defaultView.addEventListener('message',e=>{if(e.data?.protocol===${JSON.stringify(SIDEBAR_TOOL_PROTOCOL)})__messages.push({origin:e.origin,data:e.data});});})()`,host.id);
    await click(tool.id,'#refresh-page');await pause(100);
    const envelope=(await evaluate(client,'__messages.find(e=>e.data.kind===\'request\')?.data',host.id));
    assert(envelope,'Observe actual bridge identity from trusted native refresh');
    const worker=await attach('/sw.js','service_worker');
    const storage=()=>evaluate(client,`chrome.storage.local.get(null)`,worker.id);
    const before=await storage();
    const cspProbe=await client.send('Runtime.evaluate',{awaitPromise:true,returnByValue:true,allowUnsafeEvalBlockedByCSP:false,expression:`(async()=>{const result={chrome:{runtime:typeof chrome?.runtime,tabs:typeof chrome?.tabs,storage:typeof chrome?.storage}};try{new Function('return 1')();result.dynamicEval='ALLOWED';}catch(e){result.dynamicEval=e.name;}for(const [name,operation,payload] of [['unknown','chrome.tabs.query',{}],['invalidKey','storage.set',{key:'../vue-acceptance',value:'intrusion'}]]){try{result[name]=await OpenDeskTool.request(operation,payload);}catch(e){result[name]={rejected:e.message};}}return result;})()`},tool.id);
    if(cspProbe.exceptionDetails)throw Error(JSON.stringify(cspProbe.exceptionDetails));
    const actual=cspProbe.result.value;
    assert.equal(actual.chrome.runtime,'undefined');assert.equal(actual.chrome.tabs,'undefined');assert.equal(actual.chrome.storage,'undefined');assert.equal(actual.dynamicEval,'EvalError');assert.match(actual.unknown.rejected,/没有被批准/);assert.match(actual.invalidKey.rejected,/存储字段名称无效/);
    for(const patch of [{instance:'wrong-instance'},{toolId:'vue-acceptance'}])await evaluate(client,`parent.postMessage(${JSON.stringify({...envelope,...patch,operation:'storage.set',payload:{key:'intrusion',value:'forged'}})},'*')`,tool.id);
    // An actual sibling sandbox produces origin null but a different WindowProxy.
    const oldTargets=new Set((await client.send('Target.getTargets')).targetInfos.map(t=>t.targetId));
    await evaluate(client,`(()=>{const n=document.createElement('iframe');n.id='acceptance-attacker';n.src=chrome.runtime.getURL('sidebar-tools/sandbox.html');document.body.append(n);})()`,host.id);
    await pause(200);
    const sibling=(await client.send('Target.getTargets')).targetInfos.find(t=>t.type==='iframe'&&t.url.includes('/sidebar-tools/sandbox.html')&&!oldTargets.has(t.targetId));
    assert(sibling,'Actual sibling sandbox target required');
    const sid=(await client.send('Target.attachToTarget',{targetId:sibling.targetId,flatten:true})).sessionId;
    await evaluate(client,`parent.postMessage(${JSON.stringify({...envelope,operation:'storage.set',payload:{key:'intrusion',value:'cross-frame'}})},'*')`,sid);
    await pause(200);const after=await storage();assert.deepEqual(after,before);
    await evaluate(client,`document.querySelector('#acceptance-attacker').remove()`,host.id);
    await click(host.id,'#sidebar-tool-tabs button:first-child');await click(host.id,'#sidebar-tool-tabs button:nth-child(2)');await pause(200);
    const fresh=await attach('/sidebar-tools/sandbox.html','iframe');
    await evaluate(client,`parent.postMessage(${JSON.stringify({...envelope,operation:'storage.set',payload:{key:'intrusion',value:'old-replay'}})},'*')`,fresh.id);
    await pause(200);assert.deepEqual(await storage(),before);
    await save('security',{status:'NATIVE_PASS',actual,forgeries:['wrong instance','wrong tool ID','actual sibling iframe / origin null','old instance replay from new iframe'],before,after,note:'Adversarial JavaScript executes in actual unprivileged sandbox; native acknowledgments never synthesized.'});
  }else if(mode==='navigation-security'){
    const requests=[],server=createServer((req,res)=>{requests.push(req.url);res.end('Acceptance-only navigation trap');});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try{
      const url='http://127.0.0.1:'+server.address().port+'/navigation-trap';
      const tool=await attach('/sidebar-tools/sandbox.html','iframe','#note-text');
      await evaluate(client,`(()=>{globalThis.__cspEvents=[];document.addEventListener('securitypolicyviolation',e=>__cspEvents.push({directive:e.effectiveDirective,blocked:e.blockedURI,disposition:e.disposition}));})()`,host.id);
      await evaluate(client,`location.href=${JSON.stringify(url)}`,tool.id);await pause(300);
      assert.deepEqual(requests,[],'Remote iframe navigation must be blocked before HTTP request');
      const violations=await evaluate(client,'__cspEvents',host.id);
      assert(violations.some(x=>x.directive==='frame-src'&&x.disposition==='enforce'));
      // A subsequent document load must destroy the old authorization instance.
      await evaluate(client,"location.href='about:blank'",tool.id).catch(()=>{});await pause(200);
      const state=await evaluate(client,"({count:document.querySelectorAll('#sidebar-tool-frame iframe').length,status:document.querySelector('#sidebar-tool-status').textContent})",host.id);
      assert.equal(state.count,0);assert.match(state.status,/导航/);
      await save(process.argv[3]||'navigation-security',{status:'NATIVE_PASS',url,requests,violations,state});
      await click(host.id,'#sidebar-tool-tabs button:nth-child(2)');
    }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  }else if(mode==='computation-csp'){
    const compute=await attach('/scripting/sandbox/sandbox.html','iframe');
    const result=await evaluate(client,`(async()=>{const violations=[];document.addEventListener('securitypolicyviolation',e=>violations.push({directive:e.effectiveDirective,disposition:e.disposition}),{once:false});const style=document.createElement('style');style.textContent='body{background:rgb(18,52,86)}';document.head.append(style);const img=document.createElement('img');img.src='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlD2NwAAAAASUVORK5CYII=';document.body.append(img);const url=URL.createObjectURL(new Blob(['globalThis.__uiBlobEscaped=true'],{type:'text/javascript'})),script=document.createElement('script');script.src=url;document.body.append(script);await new Promise(resolve=>setTimeout(resolve,150));const output={csp:document.querySelector('meta[http-equiv="Content-Security-Policy"]').content,violations,background:getComputedStyle(document.body).backgroundColor,imageWidth:img.naturalWidth,blobEscaped:globalThis.__uiBlobEscaped===true};style.remove();img.remove();script.remove();URL.revokeObjectURL(url);return output;})()`,compute.id);
    assert.equal(result.imageWidth,0);assert.equal(result.blobEscaped,false);assert.notEqual(result.background,'rgb(18, 52, 86)');
    for(const directive of ['style-src-elem','img-src','script-src-elem'])assert(result.violations.some(x=>x.directive===directive&&x.disposition==='enforce'));
    await save('computation-csp',{status:'NATIVE_PASS',result});
  }else if(mode==='windows-navigation-offline'){
    const tool=await attach('/sidebar-tools/sandbox.html','iframe','#note-text');
    const page=await attach('127.0.0.1:43111/demo-form.html','page');
    const info=()=>evaluate(client,"OpenDeskTool.request('currentPage.info',{})",tool.id);
    const before=await info();assert.equal(before.status,'available');
    const originalWindow=await client.send('Browser.getWindowForTarget',{targetId:page.targetId});
    const next=await client.send('Target.createTarget',{url:'http://127.0.0.1:43111/demo-form.html?second-window=1',newWindow:true});
    let windowState;
    try{
      await client.send('Target.activateTarget',{targetId:next.targetId});await pause(300);
      const secondWindow=await client.send('Browser.getWindowForTarget',{targetId:next.targetId});
      assert.notEqual(secondWindow.windowId,originalWindow.windowId);
      const after=await info();assert.deepEqual(after,before,'Old Side Panel remains bound to its own browser window');
      windowState={originalWindow,secondWindow,before,after};
    }finally{await client.send('Target.closeTarget',{targetId:next.targetId});await client.send('Target.activateTarget',{targetId:page.targetId});}
    await client.send('Page.enable',{},page.id);
    const newUrl='http://127.0.0.1:43111/demo-form.html?sidebar-navigation=1';
    await client.send('Page.navigate',{url:newUrl},page.id);
    let navigation;for(let i=0;i<30;i++){navigation=await info();if(navigation.url===newUrl)break;await pause(100);}
    assert.equal(navigation.url,newUrl);assert.equal(navigation.status,'available');
    const note=await evaluate(client,"document.querySelector('#note-text').value",tool.id);
    await client.send('Network.enable',{},page.id);
    await client.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0},page.id);
    let offline;
    try{
      await client.send('Page.reload',{},page.id);await pause(250);
      const realPage=await evaluate(client,'({url:location.href,title:document.title})',page.id);
      assert.equal(realPage.url,'chrome-error://chromewebdata/','Actual offline navigation must fail');
      // Read/save through the live tool and real native click while the
      // business page network is offline; never seed privileged storage.
      await click(tool.id,'#save-note');await pause(150);
      const data=await evaluate(client,"OpenDeskTool.request('storage.get',{key:'note'})",tool.id);
      assert.equal(data.value,note);
      offline={realPage,toolData:data,currentPage:await info(),input:await evaluate(client,'__acceptanceNativeClicks.at(-1)',tool.id)};
    }finally{
      await client.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1},page.id);
      await client.send('Page.navigate',{url:'http://127.0.0.1:43111/demo-form.html'},page.id);
    }
    await save('windows-navigation-offline',{status:'NATIVE_PASS',windowState,navigation,offline,scope:'Network disabled on the actual business tab; local installed assets/storage remain usable. No claim that all OS networking was disabled.'});
  }else if(mode==='isolation'){
    const tool=await attach('/sidebar-tools/sandbox.html','iframe','#note-text');
    const worker=await attach('/sw.js','service_worker');
    const storage=()=>evaluate(client,'chrome.storage.local.get(null)',worker.id);
    const before=await storage();
    const actual=await evaluate(client,"OpenDeskTool.request('storage.get',{key:'note',toolId:'other-notes',namespace:'opendesk.sidebar-tools.data.v1:other-notes'})",tool.id);
    assert.equal(actual.value,'中文最终验收：关闭重开与浏览器重启后保留。');
    assert.equal(before['opendesk.sidebar-tools.data.v1:other-notes'].note,'其他工具数据保持不变。');
    assert.deepEqual(await storage(),before);
    await save('namespace-isolation',{status:'NATIVE_PASS',actual,before});
  }else if(mode==='revocation'){
    const tool=await attach('/sidebar-tools/sandbox.html','iframe','#note-text');
    const actual=await evaluate(client,"(async()=>{const out={};for(const operation of ['currentPage.info','tasks.open']){try{out[operation]=await OpenDeskTool.request(operation,{taskId:'sample.sidebar-tool-r1-readonly'});}catch(e){out[operation]={rejected:e.message};}}out.storage=await OpenDeskTool.request('storage.get',{key:'note'});return out;})()",tool.id);
    for(const operation of ['currentPage.info','tasks.open'])assert.match(actual[operation].rejected,/没有被批准/);
    assert.equal(actual.storage.value,'中文最终验收：关闭重开与浏览器重启后保留。');
    await save('capability-revocation',{status:'NATIVE_PASS',actual});
  }else if(mode==='uninstalled'){
    const worker=await attach('/sw.js','service_worker');
    const storage=await evaluate(client,'chrome.storage.local.get(null)',worker.id);
    assert.equal(storage['opendesk.sidebar-tools.data.v1:quick-notes'],undefined);
    const ids=storage['opendesk.sidebar-tools.installed.v1'].map(t=>t.id);
    assert(!ids.includes('quick-notes'));for(const id of ['react-acceptance','vue-acceptance','other-notes'])assert(ids.includes(id));
    assert.equal(storage['opendesk.sidebar-tools.data.v1:other-notes'].note,'其他工具数据保持不变。');
    await save('uninstall-isolation',{status:'NATIVE_PASS',storage,ids});
  }else if(mode==='runs'){
    const worker=await attach('/sw.js','service_worker');
    const database=await evaluate(client,`new Promise((resolve,reject)=>{const q=indexedDB.open('opendesk-browser');q.onupgradeneeded=()=>{q.transaction.abort();reject(Error('Existing database required'));};q.onerror=()=>reject(q.error);q.onsuccess=async()=>{const db=q.result;try{const rows={};for(const name of ['runs','results','commandJournal','frameworkKV','scriptHeads','scriptRevisions']){if(!db.objectStoreNames.contains(name))continue;rows[name]=await new Promise((done,fail)=>{const tx=db.transaction(name,'readonly'),get=tx.objectStore(name).getAll();let value;get.onsuccess=()=>value=get.result;tx.oncomplete=()=>done(value);tx.onerror=()=>fail(tx.error);});}resolve(rows);}catch(e){reject(e);}finally{db.close();}};})`,worker.id);
    const ui=await evaluate(client,`Object.fromEntries(['script-id','script-revision','script-status','script-task-id','script-result','script-history','task-status','task-history'].map(id=>{const n=document.getElementById(id);return [id,{value:n?.value,text:n?.textContent}];}))`,host.id);
    await save(process.argv[3]||'runs',{database,ui});
  }else if(mode==='framework'){
    const tool=await attach('/sidebar-tools/sandbox.html','iframe');
    const name=process.argv[3];assert(['react','vue'].includes(name));
    const result=await evaluate(client,`(()=>{const n=document.querySelector('#${name}-count');return {text:n.textContent,button:{color:getComputedStyle(n).color,background:getComputedStyle(n).backgroundColor},padding:getComputedStyle(n.parentElement).padding,chromeRuntime:typeof chrome?.runtime};})()`,tool.id);
    assert.equal(result.text,'计数 1');assert.equal(result.chromeRuntime,'undefined');
    if(name==='react')assert.equal(result.button.background,'rgb(37, 99, 235)');
    await save(name+'-framework',{status:'NATIVE_PASS',result,officialSourceImport:'NOT_SUPPORTED'});
  }else if(mode==='input'){
    const target=process.argv[3]==='tool'?await attach('/sidebar-tools/sandbox.html','iframe'):host;
    const selector=process.argv[4],text=process.argv[5];
    await evaluate(client,`(()=>{globalThis.__acceptanceInputs=[];document.addEventListener('input',e=>__acceptanceInputs.push({id:e.target.id,isTrusted:e.isTrusted,value:e.target.value}),{capture:true});})()`,target.id);
    await click(target.id,selector);
    await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:4,commands:['selectAll']},target.id);
    await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:4},target.id);
    await client.send('Input.insertText',{text},target.id);
    assert.equal(await evaluate(client,`document.querySelector(${JSON.stringify(selector)}).value`,target.id),text);
    const events=await evaluate(client,'__acceptanceInputs',target.id);
    assert(events.length>0&&events.every(e=>e.isTrusted));assert.equal(events.at(-1).value,text);
    const receipt={status:'NATIVE_PASS',target:target.targetId,selector,textBytes:Buffer.byteLength(text),events};
    await save('input-'+Date.now(),receipt);await save('last-input',receipt);
  }else if(mode==='click'){
    const target=process.argv[3]==='tool'?await attach('/sidebar-tools/sandbox.html','iframe'):host;
    const events=await click(target.id,process.argv[4]);const receipt={status:'NATIVE_PASS',target:target.targetId,selector:process.argv[4],events};
    await save('click-'+Date.now(),receipt);await save('last-click',receipt);
  }else throw Error('Use cycle | layout | security | click host/tool SELECTOR');
  console.log(JSON.stringify({mode,status:mode==='runs'?'OBSERVED':'NATIVE_PASS'}));
}finally{client.close();}
