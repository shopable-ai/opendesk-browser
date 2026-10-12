// Public website: discovery and two finite messages. No SDK, registry or grants.
const $=selector=>document.querySelector(selector);
const protocol='opendesk.market.intent.v1';
const connection=$('#connection-state'),connectButton=$('#connect-button');
const action=$('#open-review'),status=$('#handoff-state');
let channel,active=false,intentId,probeGeneration=0;
function problem(code,message){return Object.assign(new Error(message),{code});}
function send(message){
  return new Promise((resolve,reject)=>{
    if(!globalThis.chrome?.runtime?.sendMessage)return reject(problem('E_NO_RECEIVER','无法连接 OpenDesk。请检查扩展并查看安装帮助。'));
    const timer=setTimeout(()=>reject(problem('E_CONNECT_TIMEOUT','无法连接 OpenDesk：等待响应超时。请查看已有审阅页或重试连接。')),5000);
    try{chrome.runtime.sendMessage(channel.extensionId,message,response=>{
      clearTimeout(timer);
      if(chrome.runtime.lastError)return reject(problem('E_NO_RECEIVER','无法连接 OpenDesk。请核对扩展已启用，以及此网站的通道配置。'));
      if(response?.protocol!==protocol)return reject(problem('E_PROTOCOL','OpenDesk 安装协议不兼容，请更新扩展。'));
      if(!response.ok)return reject(problem(response.error?.code||'E_HANDOFF',String(response.error?.message||'无法完成交接。').slice(0,400)));
      if(message.action==='PROBE'?response.status!=='CONNECTED':response.status!=='REVIEW_OPENED'||response.intentId!==message.intentId)
        return reject(problem('E_RESPONSE','无法核对交接回执，请查看已有审阅页。'));
      resolve(response);
    });}catch{clearTimeout(timer);reject(problem('E_NO_RECEIVER','无法连接 OpenDesk，请重试或查看安装帮助。'));}
  });
}
async function configuration(){
  if(channel)return channel;
  let value;
  try{
    const response=await fetch('/channel.json',{cache:'no-store',credentials:'omit'});
    if(!response.ok)throw Error('Channel HTTP error');
    value=await response.json();
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Channel JSON error');
  }catch{throw problem('E_CHANNEL','暂时无法读取市场连接配置。请检查网络后重试，或使用扩展内市场。');}
  if(value.protocol!==protocol||value.schema!=='opendesk.market.channel.v1')throw problem('E_PROTOCOL','市场连接配置不兼容。');
  if(!value.enabled)throw problem('E_CHANNEL_DISABLED','此网站尚未启用安装交接，请使用扩展内市场。');
  if(value.origin!==location.origin)throw problem('E_ORIGIN','此页面地址与受信任市场来源不一致，请使用配置中的地址。');
  if(!/^[a-p]{32}$/.test(value.extensionId))throw problem('E_EXTENSION_ID','市场未配置有效的 OpenDesk 扩展 ID。');
  channel=value;return value;
}
function showError(error){
  if(status){status.textContent=error.message;status.dataset.state='error';}
  if($('#handoff-details')){$('#handoff-details').hidden=false;$('#handoff-code').textContent=error.code||'E_CONNECT';}
}
async function connect(){
  const generation=++probeGeneration;
  connectButton.disabled=true;connection.textContent='正在连接 OpenDesk…';
  try{await configuration();await send({protocol,action:'PROBE'});if(generation===probeGeneration)connection.textContent='已连接 OpenDesk · 安装在扩展内确认';}
  catch(error){if(generation===probeGeneration){connection.textContent=error.message.startsWith('无法连接 OpenDesk')?
    error.message:'无法连接 OpenDesk · '+error.message;}}
  finally{if(generation===probeGeneration)connectButton.disabled=false;}
}
connectButton?.addEventListener('click',connect);
action?.addEventListener('click',async()=>{
  if(active)return;active=true;action.disabled=true;status.textContent='正在打开扩展可信审阅页…';status.dataset.state='pending';
  try{
    await configuration();const subject=JSON.parse(action.dataset.subject);
    const key='opendesk.market.intent:'+JSON.stringify(subject);
    if(!intentId){
      try{const old=JSON.parse(sessionStorage.getItem(key));if(old&&old.expiresAt>Date.now()&&/^[a-f0-9-]{36}$/.test(old.id))intentId=old.id;}catch{/* Storage is optional. */}
      intentId||=crypto.randomUUID();
      try{sessionStorage.setItem(key,JSON.stringify({id:intentId,expiresAt:Date.now()+30*60*1000}));}catch{/* Keep same ID in memory for retries. */}
    }
    await send({protocol,action:'OPEN_INSTALL_REVIEW',intentId,subject});
    probeGeneration++;connectButton.disabled=false;
    connection.textContent='已连接 OpenDesk';status.textContent='已打开扩展审阅页。请在该页确认；交接完成不表示已安装。';status.dataset.state='success';
    action.textContent='返回扩展审阅页';if($('#handoff-details'))$('#handoff-details').hidden=true;
  }catch(error){showError(error);}
  finally{active=false;action.disabled=false;}
});
const search=$('#app-search'),cards=[...document.querySelectorAll('.app-card')];let selected='全部';
function filter(){
  const query=search.value.trim().toLocaleLowerCase('zh-CN');let count=0;
  for(const card of cards){card.hidden=!(selected==='全部'||card.dataset.category===selected)||!card.dataset.search.includes(query);if(!card.hidden)count++;}
  $('#search-results').textContent=count+' 个应用';$('#no-results').hidden=count!==0;
}
search?.addEventListener('input',filter);
for(const button of document.querySelectorAll('[data-filter]'))button.addEventListener('click',()=>{
  selected=button.dataset.filter;for(const peer of document.querySelectorAll('[data-filter]'))peer.setAttribute('aria-pressed',String(peer===button));filter();
});
void connect();
