// Preview host only. Same business React and memory SDK in an allow-scripts
// iframe, with no same-origin, Chrome, network or native capabilities.
const iframe=document.getElementById('opendesk-preview-frame');
const scenario=document.getElementById('od-preview-scenario');
const config=JSON.parse(document.getElementById('opendesk-preview-shell-data').textContent);
const frameHtml=new TextDecoder().decode(Uint8Array.from(atob(config.frameBase64),c=>c.charCodeAt(0)));
const params=new URLSearchParams(location.search);
if(params.get('compare')==='1')document.documentElement.dataset.aiProxyCompare='true';
let locked=false,revision,uninstalled=false;
if([...scenario.options].some(option=>option.value===params.get('scenario')))scenario.value=params.get('scenario');
function stateChanged(state){
  locked=state.dirty===true||state.busy===true;
  for(const id of ['od-preview-scenario','od-preview-restore','od-preview-reset','sidebar-tool-back','sidebar-tool-remove'])document.getElementById(id).disabled=locked||id==='od-preview-scenario'&&uninstalled;
  for(const tab of document.querySelectorAll('.workbench-nav button'))tab.disabled=locked;
  if(parent!==self)parent.postMessage({type:'ai-proxy-preview-state',dirty:locked,busy:state.busy===true},location.origin);
}
addEventListener('message',event=>{
  if(event.source!==iframe.contentWindow||event.data?.type!=='ai-proxy-preview-state'||uninstalled)return;
  stateChanged(event.data);
});
function reset(){
  if(locked)return;
  uninstalled=false;stateChanged({});
  const initial={scenario:scenario.value,view:params.get('view')||'quick'};
  iframe.srcdoc=frameHtml.replace(/(<script type="application\/json" id="ai-proxy-preview-config">)[^<]*(<\/script>)/,
    (_,open,close)=>open+JSON.stringify(initial).replaceAll('<','\\u003c')+close);
}
document.getElementById('od-preview-app').addEventListener('opendesk-preview-reset',reset);
scenario.addEventListener('change',()=>{if(!uninstalled)reset();});
document.getElementById('od-preview-accept-uninstall').addEventListener('click',()=>{uninstalled=true;stateChanged({});});
// The shared shell loads the configured initial frame once. Replacing srcdoc
// while that first navigation is pending can leave its old document running.
stateChanged({});

// New sources wait for Save/Cancel; uninstall waits for an explicit Restore.
if(document.documentElement.dataset.previewWatch==='true')setInterval(async()=>{
  try{
    const next=await(await fetch('/__ai-proxy-preview-revision')).text();
    if(revision===undefined){revision=next;return;}
    if(next===revision||uninstalled)return;
    document.getElementById('od-preview-controls-feedback').textContent=locked
      ?'源码已更新；保存或取消当前草稿后安全刷新。':'源码已更新，正在载入同源界面。';
    if(!locked)location.reload();
  }catch{/* Keep the current UI while its local server is down. */}
},1500);

// The framework owns the only Back; business views use their own stable tabs.
const listBack=document.getElementById('sidebar-tool-back');
listBack.setAttribute('aria-label','返回扩展列表');
listBack.title='返回扩展列表';
const list=document.getElementById('od-preview-return');
list.querySelector('strong').textContent='扩展 · 模拟工具列表';
list.querySelector('p').textContent='已返回工具列表。重新打开 AI Proxy 可继续刚才的页面；此处仅模拟导航，不涉及真实安装。';
document.getElementById('od-preview-reopen').textContent='打开 AI Proxy';
