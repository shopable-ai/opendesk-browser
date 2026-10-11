// Native UI input, readonly DOM/IDB observation, owned CFT restart. No execution RPC or DB writes.
import {createInterface} from 'node:readline';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {launchChrome} from '../framework/k5-sdk-native-launcher.mjs';
import {connect,evaluate} from '../framework/sidebar-native-session.mjs';
import {packageFingerprint} from '../../scripts/verify-package.mjs';
const directory=resolve('docs/framework/workstreams/evidence/cloud-control-r1/native-'+Date.now());await mkdir(directory,{recursive:true});
const binary=resolve('tests/.cache/m5-browsers/155.0.8059.39/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const extension=resolve(process.argv[2]||'.runtime/cloud-control-r1/candidate/dist/production');
const browser=await launchChrome({root:process.cwd(),binary,extension,headed:true,directory,label:'cloud-r1',sameProfileRestart:true});
const network=[];
const onEvent=e=>{if(!e.method?.startsWith('Network.webSocket'))return;const p=e.params,entry={method:e.method,requestId:p.requestId};if(p.url)entry.url=p.url;if(p.response?.payloadData){try{const m=JSON.parse(p.response.payloadData);entry.frame={type:m.type,...(m.providerId?{providerId:m.providerId}:{})};}catch{entry.frame={type:'unparsed'};}}network.push(entry);};
let client=await connect(browser.endpoint,{onEvent}),seq=0;
const save=async(command,result)=>writeFile(resolve(directory,`${String(++seq).padStart(3,'0')}-${command}.json`),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
const targets=async()=>(await client.send('Target.getTargets')).targetInfos;
async function attach(target){const found=(await targets()).find(t=>t.targetId===target||(target==='sw'&&t.type==='service_worker'&&t.url.endsWith('/sw.js'))||(target==='tool'&&t.url.includes('/ui/tool.html')));if(!found)throw Error('Missing target '+target);return {...found,sessionId:(await client.send('Target.attachToTarget',{targetId:found.targetId,flatten:true})).sessionId};}
async function observe(target){const t=await attach(target);return {target:t,dom:await evaluate(client,`({url:location.href,title:document.title,viewport:{width:innerWidth,height:innerHeight},controls:[...document.querySelectorAll('[id],summary')].map(n=>({id:n.id,tag:n.tagName,text:n.textContent?.slice(0,4000),value:n.type==='password'?undefined:n.value,disabled:n.disabled,checked:n.checked,visible:!!n.getClientRects().length,rect:{x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y,w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height}}))})`,t.sessionId)};}
async function input(c){const t=await attach(c.target||'tool');await client.send('Target.activateTarget',{targetId:t.targetId});
  if(c.selector){const rect=await evaluate(client,`(()=>{const n=document.querySelector(${JSON.stringify(c.selector)});if(!n||n.disabled)throw Error('Unavailable input');const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height,height:innerHeight};})()`,t.sessionId);if(rect.w<=0||rect.h<=0||rect.y<0||rect.y>rect.height)throw Error('Input outside visible viewport; use native scroll');for(const type of ['mousePressed','mouseReleased'])await client.send('Input.dispatchMouseEvent',{type,x:rect.x,y:rect.y,button:'left',clickCount:1},t.sessionId);}
  if(c.text!==undefined){await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',modifiers:4,windowsVirtualKeyCode:65},t.sessionId);await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',modifiers:4,windowsVirtualKeyCode:65},t.sessionId);await client.send('Input.insertText',{text:c.text},t.sessionId);}
  if(c.key)for(const type of ['keyDown','keyUp'])await client.send('Input.dispatchKeyEvent',{type,key:c.key,code:c.key,modifiers:c.modifiers||0},t.sessionId);
  if(c.scroll)await client.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:900,y:650,deltaX:0,deltaY:c.scroll},t.sessionId);
  return {targetId:t.targetId,selector:c.selector,bytes:c.text===undefined?null:Buffer.byteLength(c.text)};
}
async function database(){const t=await attach('sw');return evaluate(client,`new Promise((ok,no)=>{const r=indexedDB.open('opendesk-browser');r.onupgradeneeded=()=>{r.transaction.abort();no(Error('Existing database required'))};r.onerror=()=>no(r.error);r.onsuccess=async()=>{const db=r.result,out={};try{for(const n of ['runs','results','frameworkKV','commandJournal','scriptHeads','scriptRevisions'])out[n]=await new Promise((yes,fail)=>{const tx=db.transaction(n,'readonly'),q=tx.objectStore(n).getAll();let data;q.onsuccess=()=>data=q.result;tx.oncomplete=()=>yes(data);tx.onabort=()=>fail(tx.error)});for(const row of out.frameworkKV)if(row?.credential)delete row.credential;ok(out)}catch(e){no(e)}finally{db.close()}}})`,t.sessionId);}
console.log(JSON.stringify({ready:true,endpoint:browser.endpoint,pid:browser.metadata.pid,profile:browser.metadata.profile,package:await packageFingerprint(extension),targets:await targets()}));
const reader=createInterface({input:process.stdin});
try{for await(const line of reader){try{const c=JSON.parse(line);let out;
 if(c.command==='targets')out=await targets();else if(c.command==='open')out=await client.send('Target.createTarget',{url:c.url});else if(c.command==='observe')out=await observe(c.target||'tool');else if(c.command==='input')out=await input(c);else if(c.command==='database')out=await database();else if(c.command==='network'){const t=await attach('sw');await client.send('Network.enable',{},t.sessionId);out={armed:true,targetId:t.targetId};}else if(c.command==='events')out=network;else if(c.command==='screenshot'){const t=await attach(c.target||'tool');const {data}=await client.send('Page.captureScreenshot',{},t.sessionId);const path=resolve(directory,'screen-'+randomUUID()+'.png');await writeFile(path,Buffer.from(data,'base64'));out={path};}else if(c.command==='restart'){client.close();const restarted=await browser.restart();client=await connect(restarted.endpoint,{onEvent});out={browser:restarted.metadata,targets:await targets()};}else if(c.command==='stop')break;else throw Error('Unknown observation command');await save(c.command,out);console.log(JSON.stringify({ok:true,command:c.command,result:out}));
 }catch(e){console.log(JSON.stringify({ok:false,error:e.message}));}}
}finally{client.close();await browser.copyLog();const cleanup=await browser.stop();await save('cleanup',cleanup);}
