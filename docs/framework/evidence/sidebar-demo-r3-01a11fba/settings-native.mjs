// Chrome's visible extension-details UI, read shadow controls or native-click one.
import {readFile,writeFile} from 'node:fs/promises';
import {connect,evaluate} from '../../../../tests/framework/sidebar-native-session.mjs';
const [sessionPath,action,out]=process.argv.slice(2),s=JSON.parse(await readFile(sessionPath)),c=await connect(s.endpoint);
try{
 const targets=(await c.send('Target.getTargets')).targetInfos,t=targets.find(t=>t.url===`chrome://extensions/?id=${s.extensionId}`);
 if(!t)throw Error('Actual visible Chrome details target missing');
 const {sessionId}=await c.send('Target.attachToTarget',{targetId:t.targetId,flatten:true});
 const traverse=`function all(root){let list=[];for(const e of root.querySelectorAll('*')){list.push(e);if(e.shadowRoot)list.push(...all(e.shadowRoot));}return list;}`;
 if(action==='click'){
  const box=await evaluate(c,`(() => {${traverse} const list=all(document).filter(e=>e.id==='allow-user-scripts');if(list.length!==1)throw Error('Unique observed allowUserScripts switch missing');const host=list[0],e=host.shadowRoot.querySelector('cr-toggle'),r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,checked:e.checked};})()`,sessionId);
  if(box.checked)throw Error('Already allowed; avoid toggling');
  for(const type of ['mousePressed','mouseReleased'])await c.send('Input.dispatchMouseEvent',{type,x:box.x,y:box.y,button:'left',clickCount:1},sessionId);
 }
 const observed=await evaluate(c,`(() => {${traverse} return all(document).filter(e=>e.tagName==='CR-TOGGLE'||e.tagName==='EXTENSIONS-TOGGLE-ROW').map(e=>({tag:e.tagName,id:e.id,checked:e.checked,text:e.shadowRoot?.textContent||e.parentElement?.textContent,rect:{x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y}}));})()`,sessionId);
 await writeFile(out,JSON.stringify({at:new Date().toISOString(),target:t,action,method:'real visible Chrome UI, CDP Input only',observed},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(observed));
}finally{c.close();}
