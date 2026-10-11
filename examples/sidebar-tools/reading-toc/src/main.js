(function(){
'use strict';
const {root,request}=globalThis.OpenDeskTool;
const source=root.querySelector('#toc-source'),list=root.querySelector('#toc-list');
const empty=root.querySelector('#toc-empty'),error=root.querySelector('#toc-error');
const more=root.querySelector('#toc-overview-more');
const controls=[...root.querySelectorAll('button[data-toc-mode]')];
let mode='top',selected='',sourceChoice='',data={items:[],sources:[],activeId:''},lastKey='',reading=false,closed=false;
const showError=message=>{error.textContent=message||'';error.hidden=!message;};
function render(){
 const {items,sources,activeId}=data;
 if(sourceChoice&&!sources.some(item=>item.id===sourceChoice))sourceChoice='';
 const activeSource=items.find(item=>item.id===activeId)?.sourceId;
 selected=sourceChoice||sources.find(item=>item.id===activeSource)?.id||sources[0]?.id||'';
 source.hidden=sources.length<2;
 const followed=sources.find(item=>item.id===selected)?.label||'当前内容';
 const options=[{id:'',label:'自动跟随 · '+followed},...sources];
 if(source.options.length!==options.length||[...source.options].some((node,i)=>
  node.value!==options[i].id||node.textContent!==options[i].label)){
  source.replaceChildren();options.forEach(item=>{const node=document.createElement('option');node.value=item.id;node.textContent=item.label;source.append(node);});
 }
 source.value=sourceChoice;const scoped=items.filter(item=>item.sourceId===selected);
 const current=scoped.find(item=>item.id===activeId)||scoped[0];
 const overview=data.overview?.[selected];
 const overviewIds=new Set(overview?.ids||scoped.filter(item=>item.depth===0).map(item=>item.id));
 const represented=mode==='top'
  ?scoped.find(item=>item.id===(overview?.representedId||current?.topId)):current;
 const shown=mode==='full'?scoped:mode==='top'
  ?scoped.filter(item=>overviewIds.has(item.id))
  :scoped.filter(item=>item.depth===0||item.topId===current?.topId);
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
 const remaining=mode==='top'?Math.max(0,overview?.hiddenCount||0):0;
 more.hidden=remaining===0;
 more.textContent='还有 '+remaining+' 个章节 · 查看完整目录';
 more.setAttribute('aria-label','尚有 '+remaining+' 个章节未显示，查看完整目录');
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
more.addEventListener('click',()=>{mode='full';render();});
source.addEventListener('change',()=>{sourceChoice=source.value;render();});
window.addEventListener('focus',refresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
const timer=setInterval(refresh,4000);
window.addEventListener('pagehide',()=>{closed=true;clearInterval(timer);},{once:true});
void refresh();
})();
