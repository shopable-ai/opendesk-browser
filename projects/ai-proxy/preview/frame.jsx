// Preview-only adapter. Production files stay untouched. The sidebar uses the
// frozen pre-redesign inputs declared in baseline/source.json at build time.
import * as React from 'react';
import {createRoot} from 'react-dom/client';
import AIProxySurface from '../trusted/Surface.jsx';
import {configureEnvironment} from '../src/environment';
import managementCss from './management.css?inline';
import managementActionsCss from './management-actions.css?inline';

let environment,root,busy=false,refreshPending=false,sequence=0;
const pending=new Map();
const send=message=>parent.postMessage(message,'*');
function rpc(method,args=[]){
  return new Promise((resolve,reject)=>{
    const id=++sequence;
    const timer=setTimeout(()=>{pending.delete(id);reject(Error('预览会话未响应；未自动重试操作。'));},10000);
    pending.set(id,{resolve,reject,timer});send({type:'ai-proxy-preview-rpc',id,method,args});
  });
}
async function refresh(){
  if(!environment||environment.hasDrafts()||busy){refreshPending=true;return;}
  refreshPending=false;await environment.request({type:'GET_STATE'});
}
function boot({view,route,locale='zh-CN'}){
  if(environment)return;
  clearInterval(ready);
  const boundary={service:{preview:true,...Object.fromEntries(['load','save','status','apply','stop'].map(method=>[method,(...args)=>rpc(method,args)]))},
    read:key=>rpc('read',[key]),write:(key,value)=>rpc('write',[key,value])};
  environment=configureEnvironment({locale,setState:state=>{
    busy=state.busy===true;
    send({type:'ai-proxy-preview-state',dirty:state.dirty===true,busy});
    if(refreshPending&&!busy&&!state.dirty)void refresh();
  }},null,{trusted:true,preview:boundary});
  const management=view==='settings';
  if(management)environment.navigation.navigate(route||'#/profiles',{force:true});
  else{
    // Opening a management document leaves QuickPanel mounted, including drafts,
    // focus and scroll. This adapter is intentionally not a real Host API.
    const open=next=>{send({type:'ai-proxy-preview-open',route:next});return true;};
    environment.navigate=open;environment.openSettings=()=>open('#/profiles');
  }
  environment.navigation.subscribe(next=>{
    send({type:'ai-proxy-preview-route',route:next});
    if(management&&next==='')send({type:'ai-proxy-preview-leave-approved'});
  });
  root=createRoot(document.getElementById('ai-proxy-app'));
  root.render(<><AIProxySurface surface={management?'management':'side-panel'}/><style>{managementCss+managementActionsCss}</style></>);
  if(view==='add'){
    const observer=new MutationObserver(()=>{const button=document.querySelector('.r86IconFirst');if(button){observer.disconnect();button.click();}});
    observer.observe(document.getElementById('ai-proxy-app'),{childList:true,subtree:true});
  }
  send({type:'ai-proxy-preview-route',route:environment.navigation.getRoute()});
}
addEventListener('message',event=>{
  if(event.source!==parent)return;
  const message=event.data;
  if(message?.type==='ai-proxy-preview-init')boot(message);
  if(message?.type==='ai-proxy-preview-rpc-result'){
    const item=pending.get(message.id);if(!item)return;
    clearTimeout(item.timer);pending.delete(message.id);
    if(message.error)item.reject(Object.assign(Error(message.error.message),{code:message.error.code}));else item.resolve(message.value);
  }
  if(!environment)return;
  if(message?.type==='ai-proxy-preview-navigate')environment.navigation.navigate(message.route);
  if(message?.type==='ai-proxy-preview-refresh')void refresh();
});
const ready=setInterval(()=>send({type:'ai-proxy-preview-ready'}),200);
send({type:'ai-proxy-preview-ready'});
addEventListener('pagehide',()=>{clearInterval(ready);root?.unmount();environment?.dispose();},{once:true});
