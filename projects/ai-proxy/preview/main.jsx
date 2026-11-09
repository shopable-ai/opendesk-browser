// Offline preview host. Two actual documents, bounded postMessage, memory only.
import {createPreviewBoundary} from './sdk-preview.js';
import {createPreviewProxyConsent} from './proxy-consent.js';
import {createPreviewReview} from './ProxyReview.jsx';
import {toManagedRoute} from '../src/domain/managed-config';
const reviewUI=createPreviewReview();
let proxyConsent;
function newBoundary(scenario){
  proxyConsent=createPreviewProxyConsent({requestReview:review=>reviewUI.request(review)});
  return createPreviewBoundary(scenario,{authorize:config=>proxyConsent.authorize(toManagedRoute(config))});
}
const byId=id=>document.getElementById(id);
const iframe=byId('opendesk-preview-frame');
const config=JSON.parse(byId('opendesk-preview-shell-data').textContent);
const frameHtml=new TextDecoder().decode(Uint8Array.from(atob(config.frameBase64),c=>c.charCodeAt(0)));
const params=new URLSearchParams(location.search);
const management=params.get('view')==='settings'||config.initialView==='settings';
if(params.get('compare')==='1')document.documentElement.dataset.aiProxyCompare='true';
const linked=management&&!!opener&&!!params.get('session');
const token=linked?params.get('session'):crypto.randomUUID();
const sections=['profiles','rules','subscriptions','backup','diagnostic','general','official'];
const validRoute=route=>typeof route==='string'&&route.length<129&&/^#\/(profiles|rules|subscriptions|backup|diagnostic|general|official)(\/[a-zA-Z0-9_-]+){0,2}$/.test(route);
let route=validRoute(location.hash)?location.hash:'#/'+(sections.includes(params.get('section'))?params.get('section'):'profiles');
let boundary=newBoundary(params.get('scenario')||config.scenario),dirty=false,busy=false,uninstalled=false,managementWindow=null;
let rpcSequence=0,revision,sessionInvalid=false;
const pending=new Map(),log=[];
const children=new Set();
const sendFrame=data=>iframe.contentWindow?.postMessage(data,'*');
const feedback=byId('od-preview-controls-feedback');
document.documentElement.dataset.aiProxySurface=management?'management':'side-panel';
document.title=management?'AI Proxy · PC 管理预览':'AI Proxy · 侧栏预览';
byId('preview-management-bar').hidden=!management;
byId('preview-sidebar-session').hidden=management;
if(management){
  byId('preview-return').textContent=linked?'返回侧栏':'打开侧栏预览';
  byId('preview-close').hidden=!linked;
}
if(linked)for(const id of ['od-preview-scenario','od-preview-restore'])byId(id).disabled=true;

function showState(){
  for(const id of ['od-preview-scenario','od-preview-restore','od-preview-reset','sidebar-tool-back','sidebar-tool-remove'])byId(id).disabled=dirty||busy||children.size>0||linked||sessionInvalid;
  for(const tab of document.querySelectorAll('.workbench-nav button'))tab.disabled=dirty||busy;
  for(const button of document.querySelectorAll('[data-preview-view]'))button.disabled=busy||uninstalled||sessionInvalid;
  byId('preview-return').disabled=busy||sessionInvalid;
  byId('preview-close').disabled=busy||sessionInvalid;
  byId('preview-draft-state').textContent=dirty?'有未保存更改':busy?'操作处理中':'配置只在本次预览内保存';
  byId('preview-operation-receipt').textContent=JSON.stringify({reviews:proxyConsent.reviewCount,apply:log.filter(m=>m==='apply').length,stop:log.filter(m=>m==='stop').length,save:log.filter(m=>m==='save').length});
}
function connectRpc(method,args){
  if(!linked)return invoke(method,args);
  if(!opener||opener.closed)return Promise.reject(Error('侧栏预览已关闭；不能恢复此内存会话。'));
  return new Promise((resolve,reject)=>{
    const id=++rpcSequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('预览会话未响应；未自动重试。'));},method==='apply'?120000:10000);
    pending.set(id,{resolve,reject,timer});opener.postMessage({type:'ai-proxy-preview-host-rpc',token,id,method,args},'*');
  });
}
async function invoke(method,args){
  if(!['load','save','status','apply','stop','read','write'].includes(method)||!Array.isArray(args))throw Error('Unsupported preview operation');
  const value=await (['read','write'].includes(method)?boundary[method](...args):boundary.service[method](...args));
  if(['apply','stop','save'].includes(method)){log.push(method);showState();}
  if(['apply','stop','save'].includes(method)){
    // Invalidation is advisory; drafts never get replaced by a refresh.
    sendFrame({type:'ai-proxy-preview-refresh'});
    for(const child of children)if(!child.closed)child.postMessage({type:'ai-proxy-preview-host-refresh',token},'*');
  }
  return value;
}
function openManagement(next){
  if(!validRoute(next))return;
  if(management){sendFrame({type:'ai-proxy-preview-navigate',route:next});return;}
  const url=new URL(location.href);url.search='';url.searchParams.set('view','settings');url.searchParams.set('session',token);url.hash=next;
  if(managementWindow&&!managementWindow.closed){
    managementWindow.postMessage({type:'ai-proxy-preview-host-navigate',token,route:next},'*');managementWindow.focus();
  }else{
    managementWindow=window.open(url.href,'ai-proxy-preview-'+token);
    if(managementWindow)children.add(managementWindow);
  }
  byId('preview-sidebar-session').textContent=managementWindow?'管理已在独立标签页打开，侧栏保持原状。':'浏览器阻止了打开管理页；请使用下方「PC 管理预览」入口重试。';
  showState();
}
function leave(){
  if(linked&&opener&&!opener.closed){opener.postMessage({type:'ai-proxy-preview-host-return',token},'*');opener.focus();window.close();}
  else{const url=new URL(location.href);url.search='';url.hash='';location.href=url.href;}
}
addEventListener('message',async event=>{
  const message=event.data;if(!message||typeof message.type!=='string')return;
  if(event.source===iframe.contentWindow){
    if(message.type==='ai-proxy-preview-ready')sendFrame({type:'ai-proxy-preview-init',view:management?'settings':(params.get('view')==='add'||config.initialView==='add'?'add':'quick'),route,currentSources:config.currentSources===true});
    if(message.type==='ai-proxy-preview-state'){dirty=message.dirty===true;busy=message.busy===true;showState();}
    if(message.type==='ai-proxy-preview-open')openManagement(message.route);
    if(message.type==='ai-proxy-preview-route'&&management&&validRoute(message.route)){route=message.route;history.replaceState(null,'',location.pathname+location.search+route);}
    if(message.type==='ai-proxy-preview-leave-approved')leave();
    if(message.type==='ai-proxy-preview-rpc'){
      try{sendFrame({type:'ai-proxy-preview-rpc-result',id:message.id,value:await connectRpc(message.method,message.args)});}
      catch(error){sendFrame({type:'ai-proxy-preview-rpc-result',id:message.id,error:{message:error.message,code:error.code}});}
    }
    return;
  }
  if(message.token!==token)return;
  if(linked&&event.source===opener){
    if(message.type==='ai-proxy-preview-host-result'){
      const item=pending.get(message.id);if(!item)return;clearTimeout(item.timer);pending.delete(message.id);
      if(message.error)item.reject(Object.assign(Error(message.error.message),{code:message.error.code}));else item.resolve(message.value);
    }
    if(message.type==='ai-proxy-preview-host-refresh')sendFrame({type:'ai-proxy-preview-refresh'});
    if(message.type==='ai-proxy-preview-host-navigate')sendFrame({type:'ai-proxy-preview-navigate',route:message.route});
  }
  if(children.has(event.source)){
    if(message.type==='ai-proxy-preview-host-rpc'){
      try{event.source.postMessage({type:'ai-proxy-preview-host-result',token,id:message.id,value:await invoke(message.method,message.args)},'*');}
      catch(error){event.source.postMessage({type:'ai-proxy-preview-host-result',token,id:message.id,error:{message:error.message,code:error.code}},'*');}
    }
    if(message.type==='ai-proxy-preview-host-return'){sendFrame({type:'ai-proxy-preview-refresh'});byId('preview-sidebar-session').textContent='已返回侧栏；选择、表单与滚动位置继续保留。';}
  }
});
for(const id of ['preview-return','preview-close'])byId(id).addEventListener('click',()=>sendFrame({type:'ai-proxy-preview-navigate',route:''}));
for(const button of document.querySelectorAll('[data-preview-view]'))button.addEventListener('click',()=>openManagement('#/profiles'));
const scenario=byId('od-preview-scenario');
if(params.has('scenario')&&[...scenario.options].some(o=>o.value===params.get('scenario')))scenario.value=params.get('scenario');
function reset(){
  if(dirty||busy||linked||children.size)return;
  reviewUI.cancel();boundary=newBoundary(scenario.value);log.length=0;uninstalled=false;iframe.srcdoc=frameHtml;showState();
}
byId('od-preview-app').addEventListener('opendesk-preview-reset',reset);
scenario.addEventListener('change',reset);
byId('od-preview-accept-uninstall').addEventListener('click',()=>{uninstalled=true;showState();});
addEventListener('beforeunload',event=>{if(dirty||busy||children.size>0){event.preventDefault();event.returnValue='';}});
setInterval(()=>{
  let changed=false;for(const child of children)if(child.closed){children.delete(child);changed=true;}
  if(changed)showState();
  if(linked&&(!opener||opener.closed)&&!sessionInvalid){sessionInvalid=true;feedback.textContent='侧栏预览已关闭。当前表单仍保留，但此内存会话无法继续保存；请重新打开预览。';showState();}
},1000);
if(document.documentElement.dataset.previewWatch==='true')setInterval(async()=>{
  try{
    const next=await(await fetch('/__ai-proxy-preview-revision')).text();
    if(revision===undefined){revision=next;return;}
    if(next===revision||uninstalled)return;
    feedback.textContent=dirty||busy||linked||children.size?'预览源码已更新；保留当前草稿和管理会话，结束后刷新。':'预览源码已更新，正在安全刷新。';
    if(!dirty&&!busy&&!linked&&!children.size)location.reload();
  }catch{/* Keep current session while its preview server is down. */}
},1500);
byId('sidebar-tool-back').setAttribute('aria-label','返回扩展列表');
byId('sidebar-tool-back').title='返回扩展列表';
showState();
addEventListener('pagehide',()=>reviewUI.dispose(),{once:true});
