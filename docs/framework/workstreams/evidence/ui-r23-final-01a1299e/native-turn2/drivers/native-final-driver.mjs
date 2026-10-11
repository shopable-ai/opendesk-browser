import fs from 'node:fs/promises';
const out=new URL('../../docs/framework/workstreams/evidence/ui-r23-final-01a1299e/native-turn2/native-final-chrome/',import.meta.url);
const launch=JSON.parse(await fs.readFile(new URL('chrome-launch.json',out),'utf8'));
const [port,endpoint]=(await fs.readFile(launch.profile+'/DevToolsActivePort','utf8')).trim().split('\n');
const ws=new WebSocket('ws://127.0.0.1:'+port+endpoint);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let n=0;const pending=new Map();
ws.onmessage=({data})=>{const m=JSON.parse(data),p=pending.get(m.id);if(p){pending.delete(m.id);clearTimeout(p.timer);m.error?p.j(Error(JSON.stringify(m.error))):p.r(m.result);}};
const call=(method,params={},sessionId)=>new Promise((r,j)=>{const id=++n;pending.set(id,{r,j,timer:setTimeout(()=>{pending.delete(id);j(Error('timeout '+method));},15000)});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
const save=(name,data)=>fs.writeFile(new URL(name+'.json',out),JSON.stringify(data,null,2)+'\n');
const attach=async targetId=>(await call('Target.attachToTarget',{targetId,flatten:true})).sessionId;
const read=async(s,expression)=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},s);if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const cmd=process.argv[2];await fs.appendFile(new URL('driver-commands.jsonl',out),JSON.stringify({time:new Date().toISOString(),argv:process.argv.slice(2),pid:launch.pid})+'\n');
try{
let identity;try{identity=JSON.parse(await fs.readFile(new URL('chrome-identity.json',out),'utf8'));}catch{}
if(cmd==='init'){
const extension='/Users/shopme/Documents/workspace/opendesk-browser/.runtime/ui-r23-final-01a1299e/candidate-native-final/dist/production';
const loaded=await call('Extensions.loadUnpacked',{path:extension});const version=await call('Browser.getVersion');
identity={...loaded,extension,pid:launch.pid,profile:launch.profile,port,version,head:'2c5a3cbc07d96756201cbc722abb6b21d96f8e8e',packageHash:'b54082dc6f8a7e44f641cddf06c4c476f66723fa87b1a39225b65faea8813970'};
identity.extensionId=loaded.id;await save('chrome-identity',identity);
const t=await call('Target.createTarget',{url:'chrome://extensions/?id='+loaded.id});identity.extensionsPage=t.targetId;await save('chrome-identity',identity);console.log(identity);
 }else if(cmd==='diagnose'){
 const targets=(await call('Target.getTargets')).targetInfos;
 const sw=targets.find(t=>t.type==='service_worker'&&t.url==='chrome-extension://'+identity.extensionId+'/sw.js');
 const s=await attach(sw.targetId);
 const result=await read(s,'(async()=>{const tabs=(await chrome.tabs.query({})).filter(t=>t.url?.startsWith(chrome.runtime.getURL("ui/tool.html")));const frames=[];for(const t of tabs){try{frames.push({tabId:t.id,url:t.url,frame:await chrome.webNavigation.getFrame({tabId:t.id,frameId:0})});}catch(e){frames.push({tabId:t.id,error:String(e)})}}return {frames,contexts:await chrome.runtime.getContexts({})}})()');
 await save('independent-document-diagnostic',result);console.log(result);
 }else if(cmd==='knowledge-state'){
 const targets=(await call('Target.getTargets')).targetInfos;
 const sw=targets.find(t=>t.type==='service_worker'&&t.url==='chrome-extension://'+identity.extensionId+'/sw.js'),sws=await attach(sw.targetId);
 const page=targets.find(t=>t.type==='page'&&t.url.includes('toolId=knowledge-inbox')),s=await attach(page.targetId);
 await call('Target.activateTarget',{targetId:page.targetId});const document=await call('DOM.getDocument',{},s),owner=await call('DOM.querySelector',{nodeId:document.root.nodeId,selector:'.sidebar-tool-iframe'},s),description=await call('DOM.describeNode',{nodeId:owner.nodeId},s),sandbox=targets.find(t=>t.type==='iframe'&&t.targetId===description.node.frameId);if(!sandbox)throw Error('Independent sandbox identity unavailable');const child=await attach(sandbox.targetId);await save('knowledge-frame-association',{page:page.targetId,url:page.url,iframeNode:description.node,sandbox:sandbox.targetId});
 const tabs=await read(sws,'chrome.tabs.query({})'),tab=tabs.find(t=>t.url===page.url),rows=[];
 for(const zoom of [1,2]){
   await read(sws,`chrome.tabs.setZoom(${tab.id},${zoom})`);
   for(const width of [320,360,400,480,600]){
     await call('Emulation.setDeviceMetricsOverride',{width:width*zoom,height:900,deviceScaleFactor:0,mobile:false},s);
     const rect=await read(child,'(()=>{const r=document.querySelector("#ki-refresh").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
     for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,...rect,button:'left',clickCount:1},child);
     await sleep(200);
     const state=await read(child,'({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,body:document.body.innerText})');
     const actualZoom=await read(sws,`chrome.tabs.getZoom(${tab.id})`),actualWidth=await read(s,'innerWidth');
     const pass=actualWidth===width&&actualZoom===zoom&&state.scrollWidth<=state.width+1&&state.body.includes('0 / 0 条')&&!state.body.includes('工具宿主文档已变化')&&!state.body.includes('正在读取');
     const row={width,zoom,actualWidth,actualZoom,pass,...state};rows.push(row);
     if(width===320||width===600){const label=`knowledge-state-${width}-${zoom*100}`,shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false},s);await fs.writeFile(new URL(label+'.png',out),Buffer.from(shot.data,'base64'));row.screenshot=label+'.png';}
     await save('knowledge-state-matrix',rows);
   }
 }
 await read(sws,`chrome.tabs.setZoom(${tab.id},1)`);await call('Emulation.clearDeviceMetricsOverride',{},s);
 console.log({cases:rows.length,pass:rows.filter(r=>r.pass).length,failed:rows.filter(r=>!r.pass)});
 }else if(cmd==='matrix'||cmd==='matrix-knowledge'||cmd==='matrix-native'){
 const targets=(await call('Target.getTargets')).targetInfos;
 const sw=targets.find(t=>t.type==='service_worker'&&t.url==='chrome-extension://'+identity.extensionId+'/sw.js'),sws=await attach(sw.targetId);
 const tabs=await read(sws,'chrome.tabs.query({})');const zoomTab=tabs.find(t=>t.url.endsWith('/native-agent/settings.html'));
 const contexts=await read(sws,'chrome.runtime.getContexts({})');
 const panelUrl=contexts.find(c=>c.contextType==='SIDE_PANEL')?.documentUrl;
 const pages=[{name:'sidepanel',target:targets.find(t=>t.url===panelUrl)},{name:'independent-tool',target:targets.find(t=>t.type==='page'&&t.url.includes('toolId=knowledge-inbox'))},{name:'settings',target:targets.find(t=>t.url.endsWith('/native-agent/settings.html'))},{name:'workspace',target:targets.find(t=>t.url.includes('/native-agent/workspace.html'))}];
 if(cmd==='matrix-native')pages.splice(0,pages.length,...pages.filter(p=>p.name==='settings'||p.name==='workspace'));
if(cmd==='matrix-knowledge')pages.splice(0,pages.length,...pages.filter(p=>p.name==='independent-tool'));
 if(pages.some(p=>!p.target))throw Error('Required real extension surface missing: '+pages.filter(p=>!p.target).map(p=>p.name));
 await save('runtime-contexts',await read(sws,'chrome.runtime.getContexts({})'));const rows=[];await save('matrix-status',{status:'IN_PROGRESS',widths:[320,360,400,480,600],zooms:[1,2],viewport:'real extension; CDP viewport size; Chrome tabs.setZoom origin scope'});
 for(const zoom of [1,2]){
  await read(sws,`chrome.tabs.setZoom(${zoomTab.id},${zoom})`);await sleep(100);
  const actualZoom=await read(sws,`chrome.tabs.getZoom(${zoomTab.id})`);
  for(const page of pages){const s=await attach(page.target.targetId);
   for(const width of [320,360,400,480,600]){
    await call('Emulation.setDeviceMetricsOverride',{width:width*zoom,height:800,deviceScaleFactor:0,mobile:false},s);
    const selectors=page.name==='sidepanel'?['#tab-my-tasks','#tab-discover','#tab-workflow','#tab-develop','#tab-tools']:[null];
    for(const selector of selectors){
     if(selector){const r=await read(s,`(()=>{const n=document.querySelector(${JSON.stringify(selector)}),r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,x:r.x,y:r.y,button:'left',clickCount:1},s);await sleep(75);}
     const observed=await read(s,`(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scrollWidth:document.documentElement.scrollWidth,selected:document.querySelector('[role=tab][aria-selected=true]')?.id,visiblePanels:[...document.querySelectorAll('[role=tabpanel]')].filter(n=>!n.hidden).map(n=>n.id),active:document.activeElement?.id,body:document.body.innerText,controls:[...document.querySelectorAll('button,input,textarea,summary')].filter(n=>n.getClientRects().length).map(n=>{const r=n.getBoundingClientRect();return {id:n.id,label:n.getAttribute('aria-label')||n.textContent?.trim().slice(0,100),disabled:n.disabled,x:r.x,y:r.y,width:r.width,height:r.height}})}))()`);
     const pass=observed.width===width&&observed.scrollWidth<=width+1&&actualZoom===zoom&&(!selector||observed.selected===selector.slice(1)&&observed.visiblePanels.length===1);
     const row={page:page.name,selector,width,zoom,actualZoom,viewportOverride:true,pass,...observed};rows.push(row);
     if(width===320||width===600){const label=`matrix-${page.name}-${selector?selector.slice(1):'default'}-${width}-${zoom*100}`;const shot=await call('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false},s);await fs.writeFile(new URL(label+'.png',out),Buffer.from(shot.data,'base64'));row.screenshot=label+'.png';}
    }
   }
   console.log(JSON.stringify({page:page.name,zoom,rows:rows.length,fail:rows.filter(x=>!x.pass).length}));await save('viewport-matrix',rows);
  }
 }
 await read(sws,`chrome.tabs.setZoom(${zoomTab.id},1)`);for(const page of pages){const s=await attach(page.target.targetId);await call('Emulation.clearDeviceMetricsOverride',{},s);}await save('matrix-status',{status:rows.every(x=>x.pass)?'PASS':'FAIL',cases:rows.length,failed:rows.filter(x=>!x.pass).map(({page,selector,width,zoom,scrollWidth})=>({page,selector,width,zoom,scrollWidth})),nativeWrite:'NOT_TESTED',input:'trusted Chrome Input domain; no DOM writes or synthetic events'});
 console.log(JSON.stringify({cases:rows.length,pass:rows.filter(x=>x.pass).length,fail:rows.filter(x=>!x.pass).length}));
}else if(cmd==='open'){
const url=process.argv[3].startsWith('http')||process.argv[3].startsWith('chrome:')?process.argv[3]:'chrome-extension://'+identity.extensionId+'/'+process.argv[3];
const t=await call('Target.createTarget',{url});await sleep(1000);console.log(t);
}else if(cmd==='sidepanel'){
const targets=(await call('Target.getTargets')).targetInfos;
let target=targets.find(t=>t.url==='http://127.0.0.1:43111/demo-form.html');if(!target)target={...(await call('Target.createTarget',{url:'http://127.0.0.1:43111/demo-form.html'})),url:'http://127.0.0.1:43111/demo-form.html'};
const tabs=(await call('Target.getTargets',{filter:[{type:'tab',exclude:false},{exclude:true}]})).targetInfos;const tab=tabs.find(t=>t.url===target.url);await call('Target.activateTarget',{targetId:tab.targetId});await call('Extensions.triggerAction',{id:identity.extensionId,targetId:tab.targetId});await sleep(1000);console.log((await call('Target.getTargets')).targetInfos.filter(t=>t.url.includes(identity.extensionId)));
}else if(cmd==='targets-json'){await save('final-targets',(await call('Target.getTargets')).targetInfos);console.log((await call('Target.getTargets')).targetInfos.filter(t=>t.url.includes('toolId=knowledge-inbox')).map(t=>({targetId:t.targetId,url:t.url})));}else if(cmd==='close'){await call('Browser.close');}else if(cmd==='targets'){console.log((await call('Target.getTargets')).targetInfos.map(({targetId,type,title,url})=>({targetId,type,title,url:url.slice(0,240)})));
}else{
const targets=(await call('Target.getTargets')).targetInfos;const requested=process.argv[3];const target=targets.find(t=>t.targetId===requested||t.url.includes(requested));if(!target)throw Error('target not found '+requested);const s=await attach(target.targetId);
if(cmd==='frame-tree'){const root=await call('DOM.getDocument',{},s),owner=await call('DOM.querySelector',{nodeId:root.root.nodeId,selector:'iframe'},s);console.log(await call('DOM.describeNode',{nodeId:owner.nodeId},s));await call('Page.enable',{},s);console.log(await read(s,'[...document.querySelectorAll("iframe")].map(n=>({src:n.src,id:n.id,hidden:n.hidden,display:getComputedStyle(n).display}))'));const tree=await call('Page.getFrameTree',{},s);await save('independent-frame-tree',tree);console.log(tree);console.log((await call('Target.getTargets')).targetInfos.filter(t=>t.type==='iframe').map(t=>({id:t.targetId,url:t.url})));
}else if(cmd==='native-state'){
 const state=await read(s,'(()=>({url:location.href,width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scrollWidth:document.documentElement.scrollWidth,connected:document.querySelector("#connection-badge")?.textContent,title:document.querySelector("#file-title")?.textContent,meta:document.querySelector("#file-meta")?.textContent,status:document.querySelector("#workspace-status")?.textContent,draft:document.querySelector("#draft-label")?.textContent,editor:document.querySelector("#file-editor")?.value,editorDisabled:document.querySelector("#file-editor")?.disabled,readOnly:document.querySelector("#file-editor")?.readOnly,saveDisabled:document.querySelector("#save-file")?.disabled,active:document.activeElement?.id,activeTag:document.activeElement?.tagName,hasFocus:document.hasFocus(),workspace:document.querySelector("#workspace-picker")?.value}))()');await save(process.argv[4]||'native-state',state);console.log({...state,editor:state.editor?.slice(0,100)});
}else if(cmd==='extension-controls'){
 console.log(await read(s,'(()=>{const d=document.querySelector("extensions-manager").shadowRoot.querySelector("extensions-detail-view").shadowRoot;return [...d.querySelectorAll("button,cr-icon-button,cr-button,cr-toggle")].map(n=>({id:n.id,label:n.getAttribute("aria-label"),title:n.getAttribute("title"),text:n.textContent,visible:!!n.getClientRects().length}))})()'));
}else if(cmd==='extension-disable'){
const r=await read(s,'(()=>{const d=document.querySelector("extensions-manager").shadowRoot.querySelector("extensions-detail-view").shadowRoot,n=d.querySelector("#enableToggle"),r=n.getBoundingClientRect();return {checked:n.checked,x:r.x+r.width/2,y:r.y+r.height/2}})()');if(r.checked)for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,x:r.x,y:r.y,button:'left',clickCount:1},s);console.log({oldExtensionDisabled:r.checked});
}else if(cmd==='extension-reload'){
 const r=await read(s,'(()=>{const d=document.querySelector("extensions-manager").shadowRoot.querySelector("extensions-detail-view").shadowRoot,n=d.querySelector("#dev-reload-button"),r=n.getBoundingClientRect();if(!n.getClientRects().length)throw Error("reload control hidden");return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
 for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,...r,button:'left',clickCount:1},s);await sleep(750);console.log({nativeReloadClicked:true});
}else if(cmd==='extensions-details'){
 const rect=await read(s,'(()=>{const n=document.querySelector("extensions-manager").shadowRoot.querySelector("extensions-toolbar").shadowRoot.querySelector("#devMode"),r=n.getBoundingClientRect();return {checked:n.checked,x:r.x+r.width/2,y:r.y+r.height/2}})()');
 if(!rect.checked){for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,x:rect.x,y:rect.y,button:'left',clickCount:1},s);await sleep(200);}
 const details=await read(s,'(()=>{const m=document.querySelector("extensions-manager").shadowRoot,d=m.querySelector("extensions-detail-view").shadowRoot;return {developerMode:m.querySelector("extensions-toolbar").shadowRoot.querySelector("#devMode").checked,text:d.textContent.replace(/\\s+/g," ").slice(-18000)}})()');await save('extensions-details',details);console.log(details);
}else if(cmd==='read-body'){
 const state=await read(s,'({url:location.href,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,body:document.body.innerText})');await save(process.argv[4]||'read-body',state);console.log(state);
}else if(cmd==='observe'){
 if(process.argv[5])await call('Emulation.setDeviceMetricsOverride',{width:Number(process.argv[5]),height:800,deviceScaleFactor:0,mobile:false},s);
 const state=await read(s,'(()=>({url:location.href,title:document.title,width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scrollWidth:document.documentElement.scrollWidth,body:document.body?.innerText,active:document.activeElement?.id,controls:[...document.querySelectorAll("button,input,textarea,summary,[role=tab]")].filter(n=>n.getClientRects().length).map(n=>({id:n.id,tag:n.tagName,text:n.textContent?.slice(0,120),value:n.value,disabled:n.disabled,tabindex:n.getAttribute("tabindex"),selected:n.getAttribute("aria-selected")}))}))()');
 const name=process.argv[4]||'observed';await save(name,state);const shot=await call('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false},s);await fs.writeFile(new URL(name+'.png',out),Buffer.from(shot.data,'base64'));console.log({...state,body:state.body?.slice(0,2000)});
}else if(cmd==='click'||cmd==='type'){
await call('Target.activateTarget',{targetId:target.targetId});
 const selector=process.argv[4];const rect=await read(s,`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled||!n.getClientRects().length)throw Error('not actionable');const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height}})()`);
 for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,x:rect.x,y:rect.y,button:'left',clickCount:1},s);
 if(cmd==='type'){await call('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:4,commands:['selectAll']},s);await call('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:4},s);await call('Input.insertText',{text:process.argv[5]},s);}
 await sleep(150);console.log({kind:'native-Chrome-input',selector,rect,active:await read(s,'document.activeElement?.id')});
}else if(cmd==='tab-to'){
await call('Target.activateTarget',{targetId:target.targetId});const wanted=process.argv[4],modifiers=Number(process.argv[5]||0),sequence=[];for(let i=0;i<50;i++){const active=await read(s,'document.activeElement?.id');sequence.push(active);if(active===wanted)break;for(const type of ['keyDown','keyUp'])await call('Input.dispatchKeyEvent',{type,key:'Tab',code:'Tab',windowsVirtualKeyCode:9,modifiers},s);}const actual=await read(s,'document.activeElement?.id');await save('keyboard-tab-to-'+wanted,{wanted,actual,modifiers,sequence});console.log({wanted,actual,sequence});if(actual!==wanted)throw Error('Keyboard target not reached');
}else if(cmd==='key'){
await call('Target.activateTarget',{targetId:target.targetId});
 const key=process.argv[4],modifiers=Number(process.argv[5]||0);for(const type of ['keyDown','keyUp'])await call('Input.dispatchKeyEvent',{type,key,code:key,windowsVirtualKeyCode:({Tab:9,Enter:13,ArrowRight:39,ArrowLeft:37,Home:36,End:35,Escape:27})[key]||0,modifiers,...(type==='keyDown'&&key==='Enter'?{text:'\r'}:{})},s);await sleep(150);console.log(await read(s,'({active:document.activeElement?.id,selected:document.querySelector("[role=tab][aria-selected=true]")?.id})'));
}else if(cmd==='viewport'){
 const width=Number(process.argv[4]);await call('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:0,mobile:false},s);console.log(await read(s,'({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})'));
}else if(cmd==='zoom'){
 const factor=Number(process.argv[4]);const sw=targets.find(t=>t.type==='service_worker'&&t.url==='chrome-extension://'+identity.extensionId+'/sw.js');const sws=await attach(sw.targetId);const tabs=await read(sws,'chrome.tabs.query({})');const tab=tabs.find(t=>t.url===target.url);if(!tab)throw Error('No real Chrome tab for zoom');await read(sws,`chrome.tabs.setZoom(${tab.id},${factor})`);console.log({factor,actual:await read(sws,`chrome.tabs.getZoom(${tab.id})`),metrics:await read(s,'({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})')});
}else if(cmd==='resize'){
 const b=await call('Browser.getWindowForTarget',{targetId:target.targetId});await call('Browser.setWindowBounds',{windowId:b.windowId,bounds:{width:Number(process.argv[4]),height:900,windowState:'normal'}});console.log(b);
}else if(cmd==='audit'){
 const tree=await call('Accessibility.getFullAXTree',{},s);await save(process.argv[4]||'accessibility-tree',tree);
 const controls=await read(s,'[...document.querySelectorAll("button,input,textarea,summary,select")].filter(n=>n.getClientRects().length).map(n=>{const r=n.getBoundingClientRect(),style=getComputedStyle(n);return {id:n.id,tag:n.tagName,label:n.getAttribute("aria-label")||n.getAttribute("title")||n.labels?.[0]?.textContent||n.textContent?.trim().slice(0,150),x:r.x,y:r.y,width:r.width,height:r.height,disabled:n.disabled,readonly:n.readOnly,outline:style.outline,border:style.borderColor,color:style.color,background:style.backgroundColor}})');await save((process.argv[4]||'accessibility-tree')+'-controls',controls);console.log({nodes:tree.nodes.length,controls:controls.length,unlabeled:controls.filter(n=>!n.label),tooSmall:controls.filter(n=>n.tag==='BUTTON'&&(n.width<24||n.height<24))});
}else if(cmd==='state'){
 console.log(await read(s,'(()=>({url:location.href,active:{tag:document.activeElement?.tagName,id:document.activeElement?.id,label:document.activeElement?.getAttribute("aria-label"),dataset:{...document.activeElement?.dataset}},selected:document.querySelector("[role=tab][aria-selected=true]")?.id,panels:[...document.querySelectorAll("[role=tabpanel]")].filter(n=>!n.hidden).map(n=>n.id),scroll:[...document.querySelectorAll("*")].filter(n=>n.scrollHeight>n.clientHeight+2&&/auto|scroll/.test(getComputedStyle(n).overflowY)).map(n=>({id:n.id,cls:n.className,top:n.scrollTop,max:n.scrollHeight-n.clientHeight})),inputs:[...document.querySelectorAll("textarea,input")].filter(n=>n.getClientRects().length).map(n=>({id:n.id,length:n.value?.length,disabled:n.disabled,readonly:n.readOnly})),width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth}))()'));
}else if(cmd==='scroll-editor'){
await call('Target.activateTarget',{targetId:target.targetId});const before=await read(s,'(()=>{const n=document.querySelector("#file-editor"),r=n.getBoundingClientRect();return {top:n.scrollTop,height:n.clientHeight,scrollHeight:n.scrollHeight,x:r.x+r.width/2,y:Math.min(innerHeight-40,r.y+r.height/2)}})()');await call('Input.dispatchMouseEvent',{type:'mouseWheel',x:before.x,y:before.y,deltaX:0,deltaY:500},s);await sleep(150);const after=await read(s,'document.querySelector("#file-editor").scrollTop');await save('native-long-editor-scroll',{kind:'native-Chrome-wheel',before,after,pass:after>before.top});console.log({before,after});
}else if(cmd==='scroll'){
 const before=await read(s,'[...document.querySelectorAll("*")].filter(n=>n.scrollTop).map(n=>({id:n.id,top:n.scrollTop}))');await call('Input.dispatchMouseEvent',{type:'mouseWheel',x:100,y:250,deltaX:0,deltaY:500},s);await sleep(200);const after=await read(s,'[...document.querySelectorAll("*")].filter(n=>n.scrollTop).map(n=>({id:n.id,top:n.scrollTop}))');console.log({kind:'native-Chrome-wheel',before,after});
}else if(cmd==='close')await call('Browser.close');
}
}catch(error){console.error(error.stack);process.exitCode=1;}finally{ws.close();}
