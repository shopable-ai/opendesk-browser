// Browser fixture only. Real vendor bytes must be supplied by the offline probe.
// No fetch/loader for vendor JS exists in the product or this fixture.
import {createAnswerRegistry} from '../../examples/programs/chatgpt-mindmap/src/answer-registry.js';
const css=await (await fetch('../../examples/programs/chatgpt-mindmap/assets/ui.css')).text();
let active=true;const cleanups=[];const calls={created:0,closed:0,controllers:[]};
if(window._SB_){
 const create=window._SB_.createWorkbookEditor;
 window._SB_.createWorkbookEditor=async(...args)=>{
  const c=await create(...args);calls.created++;calls.controllers.push(c);
  const delay=Number(new URLSearchParams(location.search).get('delay')||0);
  if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
  const close=c.close;let done=false;
  c.close=()=>{if(!done){done=true;calls.closed++;}return close();};
  return c;
 };
}
const owner={
 active:()=>active,
 on(target,type,cb,options){
  const wrapped=e=>Promise.resolve(cb(e)).catch(error=>{window.fixtureError=error.stack;});
  target.addEventListener(type,wrapped,options);
  const remove=()=>target.removeEventListener(type,wrapped,options);cleanups.push(remove);return remove;
 },
 observe(target,cb,options){const x=new MutationObserver(cb);x.observe(target,options);cleanups.push(()=>x.disconnect());return x;},
 setTimeout(cb,ms){const x=setTimeout(cb,ms);cleanups.push(()=>clearTimeout(x));return x;},
 setInterval(cb,ms){const x=setInterval(cb,ms);cleanups.push(()=>clearInterval(x));return x;}
};
const registry=createAnswerRegistry({document,window,owner,css});registry.start();
window.fixture={registry,calls};
const turn=number=>document.querySelector(`[data-testid="conversation-turn-${number}"]`);
document.getElementById('redraw').onclick=()=>{const bar=turn(2).querySelector('.actions');bar.replaceWith(bar.cloneNode(true));};
document.getElementById('update').onclick=()=>turn(2).querySelector('.markdown p').append(' 更新后的独立快照。');
document.getElementById('remove').onclick=()=>turn(6).remove();
document.getElementById('navigate').onclick=()=>history.pushState({},'', '/c/fixture-navigation');
document.getElementById('stop').onclick=async()=>{
 active=false;
 try{await registry.destroy();window.fixtureStopped=true;}
 catch(error){window.fixtureError=error.stack;}
 finally{for(const fn of cleanups.splice(0).reverse())fn();}
};
window.fixtureReady=true;
