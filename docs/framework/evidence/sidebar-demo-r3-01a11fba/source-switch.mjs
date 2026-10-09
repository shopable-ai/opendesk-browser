// Native OS mouse/keys select the visible Sidebar source dropdown.
// Read DOM geometry and source identities only; no value assignment.
import {readFile,writeFile} from 'node:fs/promises';import {promisify} from 'node:util';import {execFile} from 'node:child_process';
import {connect,evaluate} from '../../../../tests/framework/sidebar-native-session.mjs';
const [sessionPath,targetId,indexText,out]=process.argv.slice(2),s=JSON.parse(await readFile(sessionPath)),c=await connect(s.endpoint),run=promisify(execFile);
const binary='/private/tmp/opendesk-sidebar-r3-01a11fba/native-control',index=Number(indexText);
if(!Number.isInteger(index)||index<0||index>3)throw Error('Bounded source option required');
try{
 const {sessionId}=await c.send('Target.attachToTarget',{targetId,flatten:true});
 const root=await c.send('DOM.getDocument',{},sessionId),{nodeId}=await c.send('DOM.querySelector',{nodeId:root.root.nodeId,selector:'#program-source-files'},sessionId);
 await c.send('DOM.scrollIntoViewIfNeeded',{nodeId},sessionId);
 const box=await evaluate(c,`(() => {const e=document.querySelector('#program-source-files'),r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,width:innerWidth,height:innerHeight,options:[...e.options].map(o=>o.value)};})()`,sessionId);
 const ax=JSON.parse((await run(binary,[String(s.pid),'snapshot'])).stdout),window=ax.windows.find(w=>w.kCGWindowLayer===0),b=window.kCGWindowBounds;
 const x=b.X+b.Width-box.width+box.x,y=b.Y+b.Height-box.height+box.y;
 await run(binary,[String(s.pid),'point',String(x),String(y)]);
 await run(binary,[String(s.pid),'key','115']);
 for(let i=0;i<index;i++)await run(binary,[String(s.pid),'key','125']);
 await run(binary,[String(s.pid),'key','36']);
 const observed=await evaluate(c,`(() => ({selected:document.querySelector('#program-source-files').value,source:document.querySelector('#script-source').value,executionSource:document.querySelector('#program-generated-source').textContent,readonly:document.querySelector('#script-source').readOnly}))()`,sessionId);
 await writeFile(out,JSON.stringify({at:new Date().toISOString(),pid:s.pid,targetId,box,window,point:{x,y},method:'Native CGEvent mouse and keyboard after real UI geometry observation',observed},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({index,expected:box.options[index],selected:observed.selected}));
 if(observed.selected!==box.options[index])throw Error('Native selection differed from observed option');
}finally{c.close();}
