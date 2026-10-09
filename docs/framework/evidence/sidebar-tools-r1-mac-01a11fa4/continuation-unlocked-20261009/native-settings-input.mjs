import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {connect,evaluate} from '/var/folders/b3/0l3tmv5j3hs83hp8l34z89p00000gp/T/opendesk-sidebar-final-b18-01a11fa4-w3j4_q8b/tests/framework/sidebar-native-session.mjs';
const directory=process.env.TOOL_EVIDENCE_DIR,session=JSON.parse(await readFile(path.join(directory,'session.json'),'utf8')),client=await connect(session.endpoint);
try {
 const target=(await client.send('Target.getTargets')).targetInfos.find(t=>t.url==='chrome://settings/appearance');assert(target);
 const id=(await client.send('Target.attachToTarget',{targetId:target.targetId,flatten:true})).sessionId;
 const before=await evaluate(client,`(()=>{const all=[];function walk(root){for(const n of root.querySelectorAll('*')){if(n.tagName==='SELECT'&&[...n.options].some(o=>o.textContent.trim()==='200%'))all.push(n);if(n.shadowRoot)walk(n.shadowRoot);}}walk(document);if(all.length!==1)throw Error('Unique native zoom select required');const n=all[0];globalThis.__nativeZoomSelect=n;globalThis.__nativeZoomEvents=[];n.addEventListener('change',e=>__nativeZoomEvents.push({isTrusted:e.isTrusted,value:n.value,text:n.selectedOptions[0].textContent.trim()}));n.scrollIntoView({block:'center'});const r=n.getBoundingClientRect();return {text:n.selectedOptions[0].textContent.trim(),x:r.x+r.width/2,y:r.y+r.height/2};})()`,id);assert.equal(before.text,'200%');
 await client.send('Input.dispatchMouseEvent',{type:'mousePressed',x:before.x,y:before.y,button:'left',clickCount:1},id);await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:before.x,y:before.y,button:'left',clickCount:1},id);
 for(let i=0;i<5;i++){await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowUp',code:'ArrowUp',windowsVirtualKeyCode:38,nativeVirtualKeyCode:126},id);await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowUp',code:'ArrowUp',windowsVirtualKeyCode:38,nativeVirtualKeyCode:126},id);}
 await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:36},id);await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:36},id);
 const after=await evaluate(client,`({text:__nativeZoomSelect.selectedOptions[0].textContent.trim(),events:__nativeZoomEvents})`,id);
 await writeFile(path.join(directory,'native-default-zoom-reset.json'),JSON.stringify({session,before,after,method:'Actual Chrome Input mouse and keyboard; DOM only locates/observes native setting, no setting API mutation or DOM value assignment.'},null,2)+'\n');assert.equal(after.text,'100%');assert(after.events.length&&after.events.every(e=>e.isTrusted));console.log(JSON.stringify(after));
}finally{client.close();}
