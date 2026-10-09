// Trusted Chrome Input targets observed control; native OS keys drive its popup.
import {readFile,writeFile} from 'node:fs/promises';import {promisify} from 'node:util';import {execFile} from 'node:child_process';
import {connect,evaluate} from '../../../../tests/framework/sidebar-native-session.mjs';
const [sessionPath,targetId,indexText,out]=process.argv.slice(2),s=JSON.parse(await readFile(sessionPath)),c=await connect(s.endpoint),run=promisify(execFile),index=Number(indexText);
const bin='/private/tmp/opendesk-sidebar-r3-01a11fba/native-control',native=(...a)=>run(bin,[String(s.pid),...a]);
try{
 const {sessionId}=await c.send('Target.attachToTarget',{targetId,flatten:true});
 await native('activate');
 const d=await c.send('DOM.getDocument',{},sessionId),{nodeId}=await c.send('DOM.querySelector',{nodeId:d.root.nodeId,selector:'#program-source-files'},sessionId);
 await c.send('DOM.scrollIntoViewIfNeeded',{nodeId},sessionId);
 await new Promise(r=>setTimeout(r,400));
 const box=await evaluate(c,"(() => {const e=document.querySelector('#program-source-files'),r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return {x,y,hit:document.elementFromPoint(x,y)===e,hidden:e.hidden,options:[...e.options].map(o=>o.value)};})()",sessionId);
 if(!box.hit||box.hidden||!Number.isInteger(index)||index<0||index>=box.options.length)throw Error('Observed visible dropdown/options guard');
 for(const type of ['mousePressed','mouseReleased'])await c.send('Input.dispatchMouseEvent',{type,x:box.x,y:box.y,button:'left',clickCount:1},sessionId);
 const key=async(name,vk)=>{for(const type of ['rawKeyDown','keyUp'])await c.send('Input.dispatchKeyEvent',{type,key:name,code:name,windowsVirtualKeyCode:vk},sessionId);};
 for(let i=0;i<4;i++)await key('ArrowUp',38);
 for(let i=0;i<index;i++)await key('ArrowDown',40);
 await key('Enter',13);
 const observed=await evaluate(c,"(() => ({selected:document.querySelector('#program-source-files').value,source:document.querySelector('#script-source').value,executionSource:document.querySelector('#program-generated-source').textContent,readonly:document.querySelector('#script-source').readOnly,info:document.querySelector('#program-source-info').textContent}))()",sessionId);
 await writeFile(out,JSON.stringify({at:new Date().toISOString(),pid:s.pid,targetId,box,method:'Trusted Chrome Input mouse and keyboard',observed},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({expected:box.options[index],selected:observed.selected,readonly:observed.readonly}));
 if(observed.selected!==box.options[index]||!observed.readonly||!observed.executionSource)throw Error('Actual native selection/executable identity failed');
}finally{c.close();}
