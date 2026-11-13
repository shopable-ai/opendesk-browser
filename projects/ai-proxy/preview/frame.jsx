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
    const timer=setTimeout(()=>{pending.delete(id);reject(Error('预览会话未响应；未自动重试操作。'));},method==='apply'?120000:10000);
    pending.set(id,{resolve,reject,timer});send({type:'ai-proxy-preview-rpc',id,method,args});
  });
}
async function refresh(){
  if(!environment||environment.hasDrafts()||busy){refreshPending=true;return;}
  refreshPending=false;await environment.request({type:'GET_STATE'});
}
function boot({view,route,locale='zh-CN',currentSources=false}){
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
  root.render(<><AIProxySurface surface={management?'management':'side-panel'}/>{!currentSources&&<style>{managementCss+managementActionsCss}</style>}</>);
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
  // Read-only development evidence for the existing memory preview. Keep this
  // separate from production SDK, configuration values and business actions.
  if(message?.type==='ai-proxy-preview-inspect'&&typeof message.id==='string'){
    const selectors=['.options','.managementNav','.optionsContent','.optionsPageHead',
      '.optionsModeBar','.optionsModeGrid','.modeSelectionRow','.optionsProfileSelect','.modeActions','.runtimeDetails',
      '.listSection','.proxyRecord','.rulesDefault','.rulesList','.backupCard',
      '.sourcesManagementTabs','.subscriptionIndexHead','.generalInfoCard','.languageRecord',
      '.diagnosticFeature','.officialEmpty','.managementFeedback','.backupInputGroup','.generalGroupHeading'];
    const describe=element=>{
      const rect=element.getBoundingClientRect(),style=getComputedStyle(element);
      return {tag:element.tagName.toLowerCase(),class:element.className,
        rect:Object.fromEntries(['x','y','width','height'].map(key=>[key,Math.round(rect[key]*10)/10])),
        display:style.display,gap:style.gap,padding:style.padding,fontSize:style.fontSize,
        columns:style.gridTemplateColumns};
    };
    send({type:'ai-proxy-preview-inspection',id:message.id,route:environment.navigation.getRoute(),
      viewport:{width:innerWidth,height:innerHeight},
      overflow:document.documentElement.scrollWidth>innerWidth,
      headings:[...document.querySelectorAll('h1,h2,h3')].map(element=>({text:element.textContent,...describe(element)})),
      navigation:[...document.querySelectorAll('.managementNav button')].map(element=>({text:element.textContent,current:element.getAttribute('aria-current')})),
      structure:[...document.querySelectorAll('.optionsContent > *, .optionsContent > div > *')].map(element=>({tag:element.tagName.toLowerCase(),class:element.className})),
      notices:[...document.querySelectorAll('[role="alert"],[role="status"]')].filter(element=>element.getClientRects().length).map(element=>({role:element.getAttribute('role'),text:element.textContent})),
      regions:selectors.flatMap(selector=>[...document.querySelectorAll(selector)].map(element=>({selector,...describe(element)}))),
      controls:[...document.querySelectorAll('button,input,select,textarea')].map(element=>({
        tag:element.tagName.toLowerCase(),id:element.id,type:element.type,
        label:element.getAttribute('aria-label')||element.textContent?.trim().slice(0,100)||
          (element.id?document.querySelector('label[for="'+CSS.escape(element.id)+'"]')?.textContent:''),
        disabled:element.disabled,visible:element.getClientRects().length>0})),
      dialogs:[...document.querySelectorAll('dialog[open]')].map(element=>({label:element.getAttribute('aria-labelledby'),...describe(element)}))});
  }
  if(message?.type==='ai-proxy-preview-navigate')environment.navigation.navigate(message.route);
  if(message?.type==='ai-proxy-preview-refresh')void refresh();
});
const ready=setInterval(()=>send({type:'ai-proxy-preview-ready'}),200);
send({type:'ai-proxy-preview-ready'});
addEventListener('pagehide',()=>{clearInterval(ready);root?.unmount();environment?.dispose();},{once:true});
