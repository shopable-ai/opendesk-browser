import {readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {connect,evaluate} from '../../tests/framework/sidebar-native-session.mjs';
const run=promisify(execFile),dir='artifacts/bookmark-agent-r211-followup';
const launch=JSON.parse(await readFile(dir+'/launch.json','utf8'));
const endpoint=(await readFile(launch.log,'utf8')).match(/DevTools listening on (ws:\/\/\S+)/)[1];
const c=await connect(endpoint),targets=(await c.send('Target.getTargets')).targetInfos;
const panel=targets.find(t=>t.url.includes('/sidepanel.html?hostInstanceId='));
if(!panel)throw Error('Physical Side Panel missing');
const s=(await c.send('Target.attachToTarget',{targetId:panel.targetId,flatten:true})).sessionId;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const metrics=()=>evaluate(c,`(()=>{const box=q=>{const e=document.querySelector(q);if(!e)return null;const r=e.getBoundingClientRect(),v=getComputedStyle(e);return {...r.toJSON(),overflowY:v.overflowY,clientHeight:e.clientHeight,scrollHeight:e.scrollHeight,scrollTop:e.scrollTop}};return {at:Date.now(),url:location.href,width:innerWidth,height:innerHeight,outerWidth,devicePixelRatio,bodyWidth:document.documentElement.scrollWidth,dark:matchMedia('(prefers-color-scheme:dark)').matches,composer:box('.od-conversation-composer'),input:box('#od-conversation-input'),log:box('.od-conversation-log'),tree:box('.bm-tree-scroll'),draft:document.querySelector('#od-conversation-input')?.value,bodyOverflow:getComputedStyle(document.body).overflow,active:document.activeElement?.getAttribute('aria-label')||document.activeElement?.id}})()`,s);
const click=async selector=>{const p=await evaluate(c,`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`,s);for(const type of ['mousePressed','mouseReleased'])await c.send('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...p},s)};
const result={kind:'Actual headed installed production extension in Chrome SIDE_PANEL context; native OS divider drags; no device-metrics overrides',startedAt:new Date().toISOString(),launch:{pid:launch.pid,profile:launch.profile},target:panel,rows:[]};
try{
 result.contexts=await evaluate(c,'chrome.runtime.getContexts({contextTypes:["SIDE_PANEL"]})',s);
 if(!result.contexts.some(x=>x.documentUrl===panel.url))throw Error('Not an actual Chrome SIDE_PANEL context');
 await evaluate(c,`(()=>{globalThis.__physicalUxInputs=[];for(const type of ['keydown','input','click','touchstart'])document.addEventListener(type,e=>{if(e.target.closest('#opendesk-conversation-dock'))globalThis.__physicalUxInputs.push({at:Date.now(),type,trusted:e.isTrusted,key:e.key,id:e.target.id,aria:e.target.getAttribute('aria-label')})},true)})()`,s);
 await click('#od-conversation-input');await evaluate(c,'(()=>{const i=document.querySelector("#od-conversation-input");i.setSelectionRange(0,i.value.length)})()',s);await c.send('Input.insertText',{text:'物理侧栏宽度切换后保留此草稿'},s);
 for(const requestedWidth of [320,360,400,440,960]){
  const attempts=[];
  for(let n=0;n<4;n++){
   const before=await metrics();if(before.width===requestedWidth)break;
   const delta=before.width-requestedWidth;
   const action=await run(dir+'/drag-panel',[String(delta)]);
   await wait(180);
   const after=await metrics();attempts.push({before:before.width,delta,action:action.stdout.trim(),after:after.width});
   if(before.width===after.width)break;
  }
  for(const theme of ['light','dark']){
   await c.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme}]},s);await wait(90);
   const m=await metrics();const {input,composer}=m;
   const row={requestedWidth,theme,attempts,metrics:m,widthSatisfied:m.width===requestedWidth,layoutPass:m.bodyWidth<=m.width&&!!input&&input.width>100&&input.top>=0&&input.bottom<=m.height+1&&composer.bottom<=m.height+1,draftPreserved:m.draft==='物理侧栏宽度切换后保留此草稿'};
   result.rows.push(row);
   const shot=await c.send('Page.captureScreenshot',{format:'png'},s);await writeFile(`${dir}/physical-${requestedWidth}-${theme}.png`,Buffer.from(shot.data,'base64'));
  }
 }
 await click('#od-conversation-input');await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9},s);await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9},s);result.keyboardTab=await metrics();
 await c.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1},s);
 const p=await evaluate(c,'(()=>{const r=document.querySelector("#od-conversation-input").getBoundingClientRect();return{x:r.x+20,y:r.y+r.height/2}})()',s);
 await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]},s);await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]},s);await c.send('Emulation.setTouchEmulationEnabled',{enabled:false},s);
 result.final=await metrics();result.inputEvents=await evaluate(c,'globalThis.__physicalUxInputs',s);
 await writeFile(dir+'/t12-physical-side-panel-final.json',JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({contexts:result.contexts.map(x=>x.contextType),rows:result.rows.map(x=>({requested:x.requestedWidth,actual:x.metrics.width,theme:x.theme,layoutPass:x.layoutPass,draft:x.draftPreserved,widthSatisfied:x.widthSatisfied})),keyboardActive:result.keyboardTab.active,trustedTouch:result.inputEvents.some(x=>x.type==='touchstart'&&x.trusted)}));
}finally{c.close()}
