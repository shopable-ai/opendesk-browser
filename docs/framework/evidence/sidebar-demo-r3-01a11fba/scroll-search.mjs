// Native wheel only; DOM evaluation observes geometry and identity.
import {readFile,writeFile} from 'node:fs/promises';
import {connect,evaluate} from '../../../../tests/framework/sidebar-native-session.mjs';
const [sessionPath,targetId,out]=process.argv.slice(2),s=JSON.parse(await readFile(sessionPath)),c=await connect(s.endpoint);
try{
 const {sessionId}=await c.send('Target.attachToTarget',{targetId,flatten:true});
 await c.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:400,y:400,deltaX:0,deltaY:650},sessionId);
 await new Promise(r=>setTimeout(r,300));
 const observed=await evaluate(c,`(() => {let e=document.querySelector('#keyword'),r=e.getBoundingClientRect();return {url:location.href,visibility:document.visibilityState,viewport:{width:innerWidth,height:innerHeight},scroll:{x:scrollX,y:scrollY},value:e.value,rect:{x:r.x,y:r.y,width:r.width,height:r.height},hit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e,count:document.querySelector('#search-count').textContent};})()`,sessionId);
 await writeFile(out,JSON.stringify({at:new Date().toISOString(),targetId,method:'Native CDP Input mouseWheel',observed},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(observed));
}finally{c.close();}
