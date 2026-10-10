(function(){
'use strict';
const {root,request}=globalThis.OpenDeskTool;
const source=root.querySelector('#toc-source'),list=root.querySelector('#toc-list');
const empty=root.querySelector('#toc-empty'),error=root.querySelector('#toc-error');
const controls=[...root.querySelectorAll('button[data-toc-mode]')];
let mode='top',selected='',data={items:[],sources:[],activeId:''},lastKey='',reading=false,closed=false;
const showError=message=>{error.textContent=message||'';error.hidden=!message;};
function render(){
 const {items,sources,activeId}=data;
 if(!sources.some(item=>item.id===selected))selected=sources.find(item=>item.id===items.find(i=>i.id===activeId)?.sourceId)?.id||sources[0]?.id||'';
 source.hidden=sources.length<2;
 if(source.options.length!==sources.length||[...source.options].some((node,i)=>node.value!==sources[i].id)){
  source.replaceChildren();sources.forEach(item=>{const node=document.createElement('option');node.value=item.id;node.textContent=item.label;source.append(node);});
 }
 source.value=selected;const scoped=items.filter(item=>item.sourceId===selected);
 const current=scoped.find(item=>item.id===activeId)||scoped[0];
 const represented=mode==='top'?scoped.find(item=>item.id===current?.topId):current;
 const shown=mode==='full'?scoped:mode==='top'?scoped.filter(item=>item.depth===0):scoped.filter(item=>item.depth===0||item.topId===current?.topId);
 const key=mode+'|'+selected+'|'+shown.map(item=>item.id+':'+item.label+':'+item.depth).join('|');
 if(key!==lastKey){
  const fragment=document.createDocumentFragment();
  shown.forEach(item=>{
   const li=document.createElement('li');li.style.setProperty('--depth',String(Math.min(item.depth,3)));
   const button=document.createElement('button');button.className='toc-link'+(item.depth?' child':'');
   button.type='button';button.title=item.label;button.dataset.id=item.id;button.setAttribute('aria-label',item.label);
   const span=document.createElement('span');span.textContent=item.label;button.append(span);
   button.addEventListener('click',async()=>{
    showError('');
    try{const result=await request('toc.navigate',{id:item.id,sourceId:item.sourceId});
     if(!result?.ok)throw Error('章节已变化，请重新选择');
     data.activeId=item.id;render();
    }catch(e){showError(String(e.message||e));}
   });li.append(button);fragment.append(li);
  });list.replaceChildren(fragment);lastKey=key;
 }
 for(const button of list.querySelectorAll('button')){
  if(button.dataset.id===represented?.id)button.setAttribute('aria-current','location');
  else button.removeAttribute('aria-current');
 }
 for(const button of controls)button.setAttribute('aria-pressed',String(button.dataset.tocMode===mode));
 empty.hidden=shown.length!==0;
}
async function refresh(){
 if(closed||reading)return;reading=true;
 try{const snapshot=await request('toc.snapshot');
  if(closed)return;
  if(!snapshot||!Array.isArray(snapshot.items)||!Array.isArray(snapshot.sources))throw Error('目录数据无效');
  data=snapshot;showError('');render();
 }catch(e){if(!closed){data={items:[],sources:[],activeId:''};lastKey='';render();
  showError('此网站尚未授权或无法读取目录；可在工具列表启用此网站。');}}
 finally{reading=false;}
}
controls.forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.tocMode;render();}));
source.addEventListener('change',()=>{selected=source.value;render();});
window.addEventListener('focus',refresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
const timer=setInterval(refresh,4000);
window.addEventListener('pagehide',()=>{closed=true;clearInterval(timer);},{once:true});
void refresh();
})();
