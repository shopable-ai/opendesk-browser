import fs from 'node:fs/promises';
const out=new URL('../../docs/framework/workstreams/evidence/ui-r23-final-01a1299e/current-chrome/',import.meta.url);
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
const extension='/Users/shopme/Documents/workspace/opendesk-browser/.runtime/ui-r23-final-01a1299e/candidate-final/dist/production';
const loaded=await call('Extensions.loadUnpacked',{path:extension});const version=await call('Browser.getVersion');
identity={...loaded,extension,pid:launch.pid,profile:launch.profile,port,version,head:'c878687b5ec3f25c2c3476e8993e265e28513c1e',packageHash:'bf1aacb4847e7d37eeae07804ac088f67ddb048da32e34951b62306993c6a804'};
identity.extensionId=loaded.id;await save('chrome-identity',identity);
const t=await call('Target.createTarget',{url:'chrome://extensions/?id='+loaded.id});identity.extensionsPage=t.targetId;await save('chrome-identity',identity);console.log(identity);
 }else if(cmd==='diagnose'){
 const targets=(await call('Target.getTargets')).targetInfos;
 const sw=targets.find(t=>t.type==='service_worker'&&t.url==='chrome-extension://'+identity.extensionId+'/sw.js');
 const s=await attach(sw.targetId);
 const result=await read(s,'(async()=>{const tabs=(await chrome.tabs.query({})).filter(t=>t.url?.startsWith(chrome.runtime.getURL("ui/tool.html")));const frames=[];for(const t of tabs){try{frames.push({tabId:t.id,url:t.url,frame:await chrome.webNavigation.getFrame({tabId:t.id,frameId:0})});}catch(e){frames.push({tabId:t.id,error:String(e)})}}return {frames,contexts:await chrome.runtime.getContexts({})}})()');
 await save('independent-document-diagnostic',result);console.log(result);
 }else if(cmd==='matrix'){
 const targets=(await call('Target.getTargets')).targetInfos;
 const sw=targets.find(t=>t.type==='service_worker'&&t.url==='chrome-extension://'+identity.extensionId+'/sw.js'),sws=await attach(sw.targetId);
 const tabs=await read(sws,'chrome.tabs.query({})');const zoomTab=tabs.find(t=>t.url.endsWith('/native-agent/settings.html'));
 const contexts=await read(sws,'chrome.runtime.getContexts({})');
 const panelUrl=contexts.find(c=>c.contextType==='SIDE_PANEL')?.documentUrl;
 const pages=[{name:'sidepanel',target:targets.find(t=>t.url===panelUrl)},{name:'independent-tool',target:targets.find(t=>t.type==='page'&&t.url.includes('toolId=knowledge-inbox'))},{name:'settings',target:targets.find(t=>t.url.endsWith('/native-agent/settings.html'))},{name:'workspace',target:targets.find(t=>t.url.endsWith('/native-agent/workspace.html'))}];
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
}else if(cmd==='close'){await call('Browser.close');}else if(cmd==='targets'){console.log((await call('Target.getTargets')).targetInfos.map(({targetId,type,title,url})=>({targetId,type,title,url:url.slice(0,240)})));
}else{
const targets=(await call('Target.getTargets')).targetInfos;const requested=process.argv[3];const target=targets.find(t=>t.targetId===requested||t.url.includes(requested));if(!target)throw Error('target not found '+requested);const s=await attach(target.targetId);
if(cmd==='observe'){
 if(process.argv[5])await call('Emulation.setDeviceMetricsOverride',{width:Number(process.argv[5]),height:800,deviceScaleFactor:0,mobile:false},s);
 const state=await read(s,'(()=>({url:location.href,title:document.title,width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scrollWidth:document.documentElement.scrollWidth,body:document.body?.innerText,active:document.activeElement?.id,controls:[...document.querySelectorAll("button,input,textarea,summary,[role=tab]")].filter(n=>n.getClientRects().length).map(n=>({id:n.id,tag:n.tagName,text:n.textContent?.slice(0,120),value:n.value,disabled:n.disabled,tabindex:n.getAttribute("tabindex"),selected:n.getAttribute("aria-selected")}))}))()');
 const name=process.argv[4]||'observed';await save(name,state);const shot=await call('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false},s);await fs.writeFile(new URL(name+'.png',out),Buffer.from(shot.data,'base64'));console.log({...state,body:state.body?.slice(0,2000)});
}else if(cmd==='click'||cmd==='type'){
 const selector=process.argv[4];const rect=await read(s,`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled||!n.getClientRects().length)throw Error('not actionable');const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:r.width,height:r.height}})()`);
 for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,x:rect.x,y:rect.y,button:'left',clickCount:1},s);
 if(cmd==='type'){await call('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:4,commands:['selectAll']},s);await call('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:4},s);await call('Input.insertText',{text:process.argv[5]},s);}
 await sleep(150);console.log({kind:'native-Chrome-input',selector,rect,active:await read(s,'document.activeElement?.id')});
}else if(cmd==='key'){
 const key=process.argv[4],modifiers=Number(process.argv[5]||0);for(const type of ['keyDown','keyUp'])await call('Input.dispatchKeyEvent',{type,key,code:key==='Tab'?'Tab':key==='ArrowRight'?'ArrowRight':key,modifiers},s);await sleep(150);console.log(await read(s,'({active:document.activeElement?.id,selected:document.querySelector("[role=tab][aria-selected=true]")?.id})'));
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
}else if(cmd==='scroll'){
 const before=await read(s,'[...document.querySelectorAll("*")].filter(n=>n.scrollTop).map(n=>({id:n.id,top:n.scrollTop}))');await call('Input.dispatchMouseEvent',{type:'mouseWheel',x:100,y:250,deltaX:0,deltaY:500},s);await sleep(200);const after=await read(s,'[...document.querySelectorAll("*")].filter(n=>n.scrollTop).map(n=>({id:n.id,top:n.scrollTop}))');console.log({kind:'native-Chrome-wheel',before,after});
}else if(cmd==='close')await call('Browser.close');
}
}catch(error){console.error(error.stack);process.exitCode=1;}finally{ws.close();}
