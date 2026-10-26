// Public website: discovery and two finite messages. No SDK, registry or grants.
const $=selector=>document.querySelector(selector);
const protocol='opendesk.market.intent.v1';
const connection=$('#connection-state'),connectButton=$('#connect-button');
const action=$('#open-review'),status=$('#handoff-state');
let channel,active=false,probeGeneration=0;
const intentIds=new Map();
function problem(code,message){return Object.assign(new Error(message),{code});}
function noReceiver(target){
  return Object.assign(problem('E_NO_RECEIVER',target?.mode==='development'?
    '无法连接 OpenDesk。当前窗口未连接本地市场指定的开发扩展；已安装其他测试副本也不能连接。请查看「安装帮助」核对窗口与扩展 ID。':
    '无法连接 OpenDesk。请在同一个 Chrome 个人资料中核对扩展已启用，并查看「安装帮助」。'),{extensionId:target?.extensionId});
}
function send(message,target=channel){
  return new Promise((resolve,reject)=>{
    if(!globalThis.chrome?.runtime?.sendMessage)return reject(noReceiver(target));
    const timer=setTimeout(()=>reject(problem('E_CONNECT_TIMEOUT','无法连接 OpenDesk：等待响应超时。请查看已有审阅页或重试连接。')),5000);
    try{chrome.runtime.sendMessage(target.extensionId,message,response=>{
      clearTimeout(timer);
      if(chrome.runtime.lastError)return reject(noReceiver(target));
      if(response?.protocol!==protocol)return reject(problem('E_PROTOCOL','OpenDesk 安装协议不兼容，请更新扩展。'));
      if(!response.ok)return reject(problem(response.error?.code||'E_HANDOFF',String(response.error?.message||'无法完成交接。').slice(0,400)));
      if(message.action==='PROBE'?response.status!=='CONNECTED':response.status!==(message.action==='GET_INSTALL_STATUS'?'INSTALL_STATUS':'REVIEW_OPENED')||response.intentId!==message.intentId)
        return reject(problem('E_RESPONSE','无法核对交接回执，请查看已有审阅页。'));
      resolve(response);
    });}catch{clearTimeout(timer);reject(noReceiver(target));}
  });
}
async function configuration(refresh=false){
  if(channel&&!refresh)return channel;
  channel=undefined;
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
function showError(error,target=status){
  if(target){target.hidden=false;target.textContent=error.message||'无法打开安装审阅。';target.dataset.state='error';}
  if($('#handoff-details')){
    $('#handoff-details').hidden=false;
    const extensionId=error.extensionId||channel?.extensionId;
    $('#handoff-code').textContent=(error.code||'E_CONNECT')+(extensionId?' · 市场目标扩展 ID：'+extensionId:'');
  }
}
async function connect(refresh=false){
  const generation=++probeGeneration;
  connectButton.disabled=true;connection.textContent='正在连接 OpenDesk…';
  try{
    const target=await configuration(refresh);await send({protocol,action:'PROBE'},target);
    if(generation===probeGeneration){connection.textContent='已连接 OpenDesk · 在安装小窗确认';connection.dataset.state='success';}
  }catch(error){if(generation===probeGeneration)showError(error,connection);}
  finally{if(generation===probeGeneration)connectButton.disabled=false;}
}
connectButton?.addEventListener('click',()=>connect(true));
// A market listing may contain multiple fixed releases. Each subject gets one
// retryable intent ID; reusing an ID for another card is forbidden by R5.
const reviewButtons=[...document.querySelectorAll('[data-open-review]')];
if(action&&!reviewButtons.includes(action))reviewButtons.push(action);
const pendingReviews=new Map();
async function checkInstallation(button,localStatus){
  const pending=pendingReviews.get(button);if(!pending)return;
  const result=await send({protocol,action:'GET_INSTALL_STATUS',intentId:pending.id,subject:pending.subject},pending.target);
  const labels={installed:'已核对本机安装，回到安装小窗选择「打开使用」。',review:'请在安装小窗核对并确认。',
    cancelled:'安装窗口已关闭，未提交安装。',failed:'安装失败，请在安装窗口查看原因。',unknown:'安装结果待核对，请在原安装窗口恢复核对；不会自动重装。'};
  if(!Object.hasOwn(labels,result.installation))throw problem('E_RESPONSE','无法核对安装状态。');
  if(localStatus){localStatus.textContent=labels[result.installation];localStatus.dataset.state=result.installation==='installed'?'success':'pending';}
  button.textContent=['cancelled','failed'].includes(result.installation)?'重新审阅安装':result.installation==='installed'?'已安装 · 查看确认窗口':'核对安装结果';
  if(['cancelled','failed'].includes(result.installation))pendingReviews.delete(button);
}
for(const button of reviewButtons)button.addEventListener('click',async()=>{
  if(active)return;
  active=true;button.disabled=true;
  const localStatus=button.closest?.('.app-card')?.querySelector?.('[data-handoff-state]')||status;
  if(localStatus){localStatus.hidden=false;localStatus.textContent='正在打开扩展可信审阅页…';localStatus.dataset.state='pending';}
  try{
    if(pendingReviews.get(button)?.expiresAt<=Date.now())pendingReviews.delete(button);
    if(pendingReviews.has(button)){await checkInstallation(button,localStatus);return;}
    const target=await configuration();
    const subject=JSON.parse(button.dataset.subject);
    const key='opendesk.market.intent:'+JSON.stringify(subject);
    const now=Date.now();
    let intent=intentIds.get(key);
    // R5 review intents expire after 30 minutes. The in-memory cache MUST
    // expire too, otherwise a long-lived homepage can never request review again.
    if(!intent||intent.expiresAt<=now){
      let saved;
      try{
        const old=JSON.parse(sessionStorage.getItem(key));
        if(old&&old.expiresAt>now&&Number.isSafeInteger(old.expiresAt)&&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(old.id))saved=old;
      }catch{/* Storage is optional. */}
      intent=saved||{id:crypto.randomUUID(),expiresAt:now+30*60*1000};
      intentIds.set(key,intent);
      if(!saved)try{sessionStorage.setItem(key,JSON.stringify(intent));}catch{/* Preserve memory until expiry. */}
    }
    await send({protocol,action:'OPEN_INSTALL_REVIEW',intentId:intent.id,subject},target);
    probeGeneration++;connectButton.disabled=false;
    connection.textContent='已连接 OpenDesk';
    if(subject.kind==='app')pendingReviews.set(button,{id:intent.id,expiresAt:intent.expiresAt,subject,target});
    if(localStatus){localStatus.textContent=subject.kind==='app'?'安装小窗已打开，请核对并确认；交接完成不表示已安装。':'已打开套装审阅页；交接完成不表示已安装。';localStatus.dataset.state='pending';}
    button.textContent=subject.kind==='app'?'核对安装结果':'返回套装审阅页';
    if($('#handoff-details'))$('#handoff-details').hidden=true;
  }catch(error){showError(error,localStatus);}
  finally{active=false;button.disabled=false;}
});
// Returning to the website only reads status, never replays an installation.
globalThis.addEventListener?.('focus',()=>{
  for(const button of pendingReviews.keys()){
    const localStatus=button.closest?.('.app-card')?.querySelector?.('[data-handoff-state]')||status;
    void checkInstallation(button,localStatus).catch(error=>showError(error,localStatus));
  }
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
