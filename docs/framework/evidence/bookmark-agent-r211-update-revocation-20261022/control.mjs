import {readFile,writeFile} from 'node:fs/promises';
import {connect,evaluate} from '../../tests/framework/sidebar-native-session.mjs';
export const dir='artifacts/bookmark-agent-r211-update';
export const cfg=JSON.parse(await readFile(dir+'/runtime.json','utf8'));
export const launch=JSON.parse(await readFile(dir+'/launch.json','utf8'));
export async function client(){const log=await readFile(launch.log,'utf8');return connect(log.match(/DevTools listening on (ws:\/\/\S+)/)[1]);}
export {evaluate};
export async function attach(c,targetId){return (await c.send('Target.attachToTarget',{targetId,flatten:true})).sessionId;}
export async function click(c,s,selector){
 const point=await evaluate(c,`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n)throw Error('Missing actual control '+${JSON.stringify(selector)});n.scrollIntoView({block:'center'});const r=n.getBoundingClientRect();if(!r.width||!r.height||n.disabled)throw Error('Unavailable actual control');const x=r.x+r.width/2,y=r.y+r.height/2;if(!n.contains(document.elementFromPoint(x,y)))throw Error('Actual control is obscured '+${JSON.stringify(selector)});return{x,y}})()`,s);
 for(const type of ['mousePressed','mouseReleased'])await c.send('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...point},s);
}
export async function save(name,data){await writeFile(dir+'/'+name+'.json',JSON.stringify(data,null,2)+'\n');}
export async function clickText(c,s,text){const point=await evaluate(c,`(()=>{const n=[...document.querySelectorAll('button')].find(n=>n.textContent===${JSON.stringify(text)}&&n.getBoundingClientRect().width);if(!n)throw Error('Missing actual text control');n.scrollIntoView({block:'center'});const r=n.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(n.disabled||!n.contains(document.elementFromPoint(x,y)))throw Error('Unavailable actual text control');return{x,y}})()`,s);for(const type of ['mousePressed','mouseReleased'])await c.send('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...point},s);}
export async function snapshot(c,s){return evaluate(c,'({url:location.href,body:document.body.innerText,controls:[...document.querySelectorAll("button,input,select,summary")].map(n=>({id:n.id,tag:n.tagName,type:n.type,label:n.getAttribute("aria-label"),text:n.textContent,visible:!!n.getBoundingClientRect().width,disabled:n.disabled,options:n.options?[...n.options].map(o=>({value:o.value,text:o.textContent})):undefined}))})',s);}
