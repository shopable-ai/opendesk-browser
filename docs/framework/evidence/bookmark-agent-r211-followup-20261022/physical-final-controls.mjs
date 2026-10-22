import {readFile,writeFile} from 'node:fs/promises';
import {connect,evaluate} from '../../tests/framework/sidebar-native-session.mjs';
const dir='artifacts/bookmark-agent-r211-followup',l=JSON.parse(await readFile(dir+'/launch.json','utf8'));
const c=await connect((await readFile(l.log,'utf8')).match(/DevTools listening on (ws:\/\/\S+)/)[1]);
const t=(await c.send('Target.getTargets')).targetInfos.find(x=>x.url.includes('/sidepanel.html?hostInstanceId='));
const s=(await c.send('Target.attachToTarget',{targetId:t.targetId,flatten:true})).sessionId;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const key=async(key,code,n,modifiers=0)=>{for(const type of ['keyDown','keyUp'])await c.send('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:n,modifiers},s);await wait(80)};
const click=async q=>{const p=await evaluate(c,`(()=>{const e=document.querySelector(${JSON.stringify(q)}),r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`,s);for(const type of ['mousePressed','mouseReleased'])await c.send('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...p},s)};
const snap=()=>evaluate(c,`(()=>{const b=q=>{const e=document.querySelector(q),r=e.getBoundingClientRect();return{...r.toJSON(),topScroll:e.scrollTop,clientHeight:e.clientHeight,scrollHeight:e.scrollHeight}};return{at:Date.now(),width:innerWidth,height:innerHeight,active:document.activeElement?.getAttribute('aria-label')||document.activeElement?.id,separator:document.querySelector('.od-conversation-separator').getAttribute('aria-valuenow'),input:b('#od-conversation-input'),log:b('.od-conversation-log'),tree:b('.bm-tree-scroll'),draft:document.querySelector('#od-conversation-input').value}})()`,s);
const d={kind:'Actual keyboard focus traversal and native scroll; no injected focus/scroll or transcript'};
try{
 await click('#od-conversation-input');await evaluate(c,'(()=>{const i=document.querySelector("#od-conversation-input");i.setSelectionRange(0,i.value.length)})()',s);await c.send('Input.insertText',{text:'键盘侧栏验收草稿'},s);
 d.tabTraversal=[];for(let n=0;n<6;n++){await key('Tab','Tab',9,8);const a=await snap();d.tabTraversal.push(a.active);if(a.active==='调整对话与原扩展的高度')break}d.separatorFocused=await snap();
 if(d.separatorFocused.active!=='调整对话与原扩展的高度')throw Error('Actual Shift+Tab did not reach separator');
 await key('Home','Home',36);d.min=await snap();await key('End','End',35);d.max=await snap();await key('ArrowDown','ArrowDown',40);d.down=await snap();
 await click('button[aria-label="收起对话"]');d.closed=await snap();await key(' ','Space',32);d.reopened=await snap();
 d.scrollBefore=await snap();
 const wheel=async(q,deltaY)=>{const a=await snap(),r=a[q];await c.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:r.x+r.width/2,y:r.y+r.height/2,deltaX:0,deltaY},s);await wait(250)};
 await wheel('log',d.scrollBefore.log.topScroll>0?-1000:1000);d.afterLog=await snap();
 await wheel('tree',d.afterLog.tree.topScroll>0?-700:700);d.afterTree=await snap();
 d.checks={keyboardResize:Number(d.min.separator)<Number(d.max.separator)&&Number(d.down.separator)===Number(d.max.separator)-16,closeFocus:d.closed.active==='AI 对话',spaceReopenDraft:d.reopened.draft==='键盘侧栏验收草稿',inputVisible:d.afterTree.input.bottom<=d.afterTree.height+1,logChanged:d.scrollBefore.log.topScroll!==d.afterLog.log.topScroll,treeUnaffectedByLog:d.scrollBefore.tree.topScroll===d.afterLog.tree.topScroll,treeChanged:d.afterLog.tree.topScroll!==d.afterTree.tree.topScroll,logUnaffectedByTree:d.afterLog.log.topScroll===d.afterTree.log.topScroll};
 d.ax=(await c.send('Accessibility.getFullAXTree',{},s)).nodes.filter(n=>['log','textbox','separator','status','alert','tree'].includes(n.role?.value)).map(n=>({role:n.role?.value,name:n.name?.value,properties:n.properties,value:n.value}));
 d.inputs=await evaluate(c,'globalThis.__physicalUxInputs',s);
 await writeFile(dir+'/t12-physical-final-controls.json',JSON.stringify(d,null,2)+'\n');
 console.log(JSON.stringify({checks:d.checks,focus:d.separatorFocused.active,heights:[d.min.separator,d.max.separator,d.down.separator]}));
}catch(error){d.error=String(error);await writeFile(dir+'/t12-controls-failed.json',JSON.stringify(d,null,2)+'\n');throw error}finally{c.close()}
