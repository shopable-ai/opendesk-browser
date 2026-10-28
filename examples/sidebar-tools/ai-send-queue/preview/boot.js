// HTTP-only source-pinned preview. All website and Host effects here are simulated.
const $=id=>document.getElementById(id);
const base=new URL('.',import.meta.url);
const blobs=[];
async function checked(input){
  const response=await fetch(new URL(input.url,base),{cache:'no-store'});
  if(!response.ok)throw Error('缺少预览依赖：'+input.url);
  const bytes=await response.arrayBuffer();
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(bytes.byteLength!==input.bytes||hash!==input.sha256)throw Error('来源已漂移，请重新准备预览：'+input.url);
  return new TextDecoder().decode(bytes);
}
function moduleURL(source){const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));blobs.push(url);return url;}
const ICON={pause:'<path d="M8 5v14M16 5v14"/>',resume:'<path d="M8 5l11 7-11 7V5Z"/>',now:'<path d="M12 19V5m-6 6 6-6 6 6M4 20h16"/>',edit:'<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8.2 17.8l-4.2 1.2 1.2-4.2Z"/>',remove:'<path d="M18 6 6 18M6 6l12 12"/>'};
let model,frameRoot,size=34,stamp=0,artworkLoaded=false,artworkError=false;
function toast(text){$('toast').textContent=text;$('toast').hidden=false;const id=++stamp;setTimeout(()=>{if(stamp===id)$('toast').hidden=true;},2500);}
function select(id,value){for(const b of $(id).querySelectorAll('button')){b.classList.toggle('active',b.dataset.value===String(value));b.setAttribute('aria-pressed',String(b.dataset.value===String(value)));}}
function refreshSidebar(){frameRoot?.dispatchEvent(new Event('opendesk-page-changed'));}
function render(){
  if(!model)return;
  const state=model.engine.view(),items=state.items,rows=$('rows');
  rows.replaceChildren();$('queue').hidden=false;$('queue').classList.toggle('sq-empty',!items.length);
  if(!items.length){const cue=document.createElement('span');cue.className='sq-empty-mark';cue.textContent='···';rows.append(cue);}
  const shown=state.expanded?items:items.slice(0,3);
  shown.forEach((item,i)=>{
    const row=document.createElement('div');row.className='sq-row'+(item.state==='paused'?' sq-paused':'')+(item.state==='unknown'?' sq-unknown':'');row.dataset.id=item.id;row.tabIndex=0;row.setAttribute('role','listitem');row.title='Alt + 上下方向键调整顺序';
    const n=document.createElement('span');n.className='sq-index';n.textContent=i+1;
    const text=document.createElement('span');text.className='sq-text';text.textContent=item.text;text.title=item.text;
    const ops=document.createElement('div');ops.className='sq-ops';
    for(const [action,label] of [[item.state==='paused'?'resume':'pause',item.state==='paused'?'恢复此条':'暂停此条'],['now','模拟提前发送'],['edit','取回原生输入框编辑'],['remove','删除队列消息']]){
      const b=document.createElement('button');b.type='button';b.className='sq-action';b.dataset.action=action;b.dataset.id=item.id;b.title=label;b.setAttribute('aria-label',label);
      b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+ICON[action]+'</svg>';
      b.disabled=state.phase==='unknown'||!['queued','paused'].includes(item.state)||(action==='now'&&item.state==='paused');
      ops.append(b);
    }
    row.append(n,text,ops);row.addEventListener('keydown',e=>{if(e.altKey&&['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();model.command('move',item.id,i+(e.key==='ArrowUp'?-1:1));refreshSidebar();$('rows').querySelector('[data-id="'+item.id+'"]')?.focus();}});rows.append(row);
  });
  $('more').hidden=items.length<=3;$('more').setAttribute('aria-expanded',String(state.expanded));$('more').textContent=state.expanded?'收起队列':'展开其余 '+(items.length-3)+' 条';
  $('draft').value=model.getDraft();
  const busy=model.site.inspect().busy;
  $('status').textContent='模拟 · '+(state.phase==='unknown'?'发送结果未知 · 禁止自动重试':busy?'AI 正在回复':'AI 已空闲')+' · '+items.length+' 条待发送';
  $('native').setAttribute('aria-label',busy?'模拟官网停止回复':'模拟官网发送');
  $('native-icon').innerHTML=busy?'<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none"/>':'<path d="M12 19V5m-6 6 6-6 6 6"/>';
}
function theme(value){document.body.dataset.theme=value;select('themes',value);$('theme-out').textContent=value==='dark'?'深色':'浅色';const doc=$('sidebar-frame').contentDocument;doc.documentElement.dataset.theme=value;doc.documentElement.classList.toggle('dark',value==='dark');}
async function start(){
  if(!['http:','https:'].includes(location.protocol))throw Error('请通过本地 HTTP 打开；先运行 preview/prepare.mjs');
  const response=await fetch(new URL('.generated/source.json',base),{cache:'no-store'});
  if(!response.ok)throw Error('请先运行 node examples/sidebar-tools/ai-send-queue/preview/prepare.mjs');
  const manifest=await response.json();
  if(manifest.format!=='opendesk.send-queue.preview.v1'||manifest.simulation!==true)throw Error('预览来源记录无效');
  const input={};await Promise.all(Object.entries(manifest.inputs).map(async([key,value])=>{input[key]=await checked(value);}));
  const css=$('program-css').textContent;
  const art=JSON.parse($('crown-variants').textContent).a;
  if(css!=='\n'+input['assets/queue.css'].replace('url("crown-premium.webp")','url("data:image/webp;base64,'+art+'")'))throw Error('皇冠预览 CSS 漂移');
  const embedded=Uint8Array.from(atob(art),c=>c.charCodeAt(0));
  const imageHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',embedded))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(imageHash!==manifest.inputs['assets/crown-premium.webp'].sha256)throw Error('皇冠图片来源漂移');
  const contractURL=moduleURL(input['src/shared/queue-contract.js']);
  const {createQueueEngine}=await import(moduleURL(input['src/page/engine.js']));
  const {createSendQueueRemote}=await import(moduleURL(input['src/page/remote.js'].replace("'../shared/queue-contract.js'",JSON.stringify(contractURL))));
  const {createPreviewModel}=await import(moduleURL(input['preview/model.js']));
  const reset=()=>{model=createPreviewModel({createQueueEngine,createSendQueueRemote,changed:render});render();refreshSidebar();};
  reset();
  const frame=$('sidebar-frame'),doc=frame.contentDocument;
  doc.open();doc.write('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body style="margin:0;background:var(--od-paper)"><div id="tool-root">'+input['src/sidebar/root.html']+'</div></body></html>');doc.close();
  for(const key of ['runtime/ui/design-tokens.css','dist/tool.css']){const style=doc.createElement('style');style.textContent=input[key];doc.head.append(style);}
  frameRoot=doc.getElementById('tool-root');
  Object.defineProperty(frame.contentWindow,'OpenDeskTool',{value:Object.freeze({root:frameRoot,request:(...args)=>model.request(...args)}),writable:false});
  for(const key of ['runtime/libs/page-frameworks/react-19.2.0.js','runtime/sidebar-shared-ui.js','dist/tool.js']){const script=doc.createElement('script');script.textContent=input[key];doc.body.append(script);}
  if(frame.contentWindow.OpenDeskPageReact?.version!=='19.2.0'||!frame.contentWindow.OpenDeskSidebarUI)throw Error('正式共享 Runtime 未就绪');
  $('source-status').textContent='模拟 Host / 单一 Page owner · 正式 React 构建 '+manifest.buildId+' · 来源 SHA 已核对';
  $('blue').onclick=()=>{model.setDraft($('draft').value);if(!model.enqueue())toast('请输入有效草稿，队列最多 20 条 / 每条 8192 字符');refreshSidebar();};
  $('draft').oninput=()=>model.setDraft($('draft').value);
  $('rows').onclick=e=>{const b=e.target.closest('button[data-action]');if(!b)return;const result=model.command(b.dataset.action,b.dataset.id);if(result.effect!=='applied')toast('操作未生效：请检查草稿、回复状态或 unknown');refreshSidebar();};
  $('more').onclick=()=>model.engine.toggleExpanded();
  $('finish').onclick=()=>{model.finish();refreshSidebar();};
  $('unknown').onclick=()=>{if(!model.unknown())toast('当前没有可模拟 unknown 的待发送消息');refreshSidebar();};
  $('sample-add').onclick=()=>{model.sample();refreshSidebar();};
  $('reset').onclick=()=>{reset();theme('light');setWidth('400');setSize(34);toast('已重置模拟 owner 与空队列');};
  $('native').onclick=()=>{if(model.site.inspect().busy)model.stop();else toast('模拟原生发送：请使用皇冠入队演示');refreshSidebar();};
  const setWidth=value=>{$('unit').style.setProperty('--preview-width',value+'px');$('sidebar-width').style.width=value+'px';$('width-out').textContent=value+'px';select('widths',value);};
  const setSize=value=>{size=Number(value);$('unit').className='unit size-'+size;$('size-out').textContent=size+'px';select('sizes',value);};
  for(const [id,change] of [['widths',setWidth],['sizes',setSize],['themes',theme]])$(id).onclick=e=>{const b=e.target.closest('button[data-value]');if(b)change(b.dataset.value);};
  const image=new Image();image.onload=()=>artworkLoaded=true;image.onerror=()=>artworkError=true;image.src='data:image/webp;base64,'+art;
  theme('light');setWidth('400');setSize(34);
  window.__sendQueuePreview=()=>{const state=model.engine.view(),style=getComputedStyle($('blue'));return {items:state.items.map(item=>({...item,paused:item.state==='paused'})),phase:state.phase,busy:model.site.inspect().busy,instance:model.snapshot().instance,revision:model.snapshot().revision,size,theme:document.body.dataset.theme,artworkLoaded,artworkError,buildId:manifest.buildId,simulation:true,official:Object.fromEntries(['w','h','x','y','angle'].map(key=>[key,parseFloat(style.getPropertyValue('--sq-crown-'+key))]))};};
  // Only dispose this preview's own document/runtime.
  addEventListener('pagehide',()=>{frame.contentWindow.dispatchEvent(new Event('pagehide'));blobs.forEach(url=>URL.revokeObjectURL(url));},{once:true});
}
start().catch(error=>{$('source-status').textContent='预览未启动：'+error.message;$('status').textContent='SOURCE_PARITY_NOT_VERIFIED';console.error(error);});
