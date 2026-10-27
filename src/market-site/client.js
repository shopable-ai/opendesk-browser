// Public website: discovery, external review requests and read-only status.
// Confirmation and installation belong to the trusted extension review.
const $=selector=>document.querySelector(selector);
const protocol='opendesk.market.intent.v1';
const connection=$('#connection-state'),connectButton=$('#connect-button');
const action=$('#open-review'),status=$('#handoff-state');
let channel,active=false,probeGeneration=0;
const automaticReads=[];
function allowAutomaticRead(){
  const now=Date.now();while(automaticReads.length&&automaticReads[0]<=now-60000)automaticReads.shift();
  if(automaticReads.length>=24)return false;
  automaticReads.push(now);return true;
}
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
      if(response.ok!==true)return reject(problem(response.error?.code||'E_HANDOFF',String(response.error?.message||'无法完成交接。').slice(0,400)));
      const expected={PROBE:'CONNECTED',OPEN_INSTALL_REVIEW:'REVIEW_OPENED',GET_INSTALL_STATUS:'INSTALL_STATUS',
        GET_APP_STATUS:'APP_STATUS',OPEN_INSTALLED_APP:'APP_OPENED'}[message.action];
      const panelRequired=message.action==='OPEN_INSTALL_REVIEW'&&message.subject.kind==='app'&&
        ['PANEL_REQUIRED','REVIEW_PENDING'].includes(response.status);
      const navigationResult=message.action==='OPEN_INSTALLED_APP'&&
        ['NAVIGATION_PENDING','PANEL_REQUIRED','NAVIGATION_BLOCKED','IDENTITY_CHANGED'].includes(response.status);
      if((response.status!==expected&&!panelRequired&&!navigationResult)||!expected||
        (message.action==='GET_INSTALL_STATUS'&&response.intentId!==message.intentId)||
        (message.action==='OPEN_INSTALL_REVIEW'&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(response.intentId)))
        return reject(problem('E_RESPONSE','无法核对交接回执，请查看已有审阅页。'));
      if(['GET_APP_STATUS','GET_INSTALL_STATUS'].includes(message.action)&&message.subject.kind==='app'&&
        (!['not-installed','installed','update-available','different-version'].includes(response.currentInstallation)||
         !(response.installedVersion===null||typeof response.installedVersion==='string'&&response.installedVersion.length>0)||
         !(response.enabled===null||typeof response.enabled==='boolean')))
        return reject(problem('E_RESPONSE','无法核对当前安装状态。'));
      if(message.action==='GET_INSTALL_STATUS'&&
        (!['review','installed','cancelled','failed','unknown','installing'].includes(response.installation)||
         !(response.progress===null||typeof response.progress==='string')||
         (message.subject.kind==='app'&&response.handoff!==undefined&&!['panel-required','panel-open'].includes(response.handoff))||
         (response.installation==='installed'&&message.subject.kind==='app'&&response.currentInstallation!=='installed')))
        return reject(problem('E_RESPONSE','无法核对本次安装结果。'));
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
    if(response.ok!==true)throw Error('Channel HTTP error');
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
    if(generation===probeGeneration){connection.textContent='已连接 OpenDesk';connection.dataset.state='success';await refreshStatuses();}
  }catch(error){if(generation===probeGeneration)showError(error,connection);}
  finally{if(generation===probeGeneration)connectButton.disabled=false;}
}
connectButton?.addEventListener('click',()=>connect(true));
// Each fixed subject owns a session intent. An uncertain attempt is queried,
// including after refresh; only an explicit return button reopens that intent.
const reviewButtons=[...document.querySelectorAll('[data-open-review]')];
if(action&&!reviewButtons.includes(action))reviewButtons.push(action);
const entries=reviewButtons.map(button=>{
  const container=button.closest?.('.app-card')||button.parentElement;
  const entry={button,subject:JSON.parse(button.dataset.subject),
    localStatus:container?.querySelector('[data-handoff-state]')||status,
    returnButton:container?.querySelector('[data-return-review]'),
    openButton:container?.querySelector('[data-open-installed]'),current:null,intent:null,
    appCheckedAt:null,intentCheckedAt:null,intentCheckedId:null};
  entry.key='opendesk.market.intent:'+JSON.stringify(entry.subject);
  try{
    const saved=JSON.parse(sessionStorage.getItem(entry.key));
    if(saved&&(saved.subject===undefined||JSON.stringify(saved.subject)===JSON.stringify(entry.subject))&&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved.id))entry.intent={id:saved.id,subject:entry.subject,installation:'unknown'};
  }catch{/* Storage is optional; a live page still retains its request. */}
  return entry;
});
function saveIntent(entry){
  try{if(entry.intent)sessionStorage.setItem(entry.key,JSON.stringify(entry.intent));else sessionStorage.removeItem(entry.key);}catch{}
}
function hasInstalled(entry){return entry.current?.currentInstallation==='installed';}
function unresolved(entry){return entry.intent&&!['installed','cancelled','failed'].includes(entry.intent.installation);}
function render(entry){
  const pending=unresolved(entry),installed=hasInstalled(entry);
  entry.button.textContent=pending?'核对安装结果':entry.current?.currentInstallation==='installed'?'打开使用':
    entry.current?.currentInstallation==='update-available'?'更新':'安装到OpenDesk';
  if(entry.returnButton)entry.returnButton.hidden=!pending;
  if(entry.openButton)entry.openButton.hidden=!installed||entry.button.textContent==='打开使用';
}
function feedback(entry,text,state='pending'){
  if(entry.localStatus){entry.localStatus.hidden=false;entry.localStatus.textContent=text;entry.localStatus.dataset.state=state;}
}
function appReviewFeedback(handoff){
  return handoff==='panel-required'?
    '安装审阅请求已保留，请点击 OpenDesk 工具栏继续安装，或在侧边栏处理当前审阅，在侧边栏安装面板 中核对并确认；打开面板不表示已批准或已安装。':
    handoff==='panel-opening'?'正在打开 OpenDesk 侧边栏安装面板，请在面板中核对并确认；打开面板不表示已批准，发起审阅不表示已安装。':
    (handoff==='panel-open'?'已打开 OpenDesk 侧边栏安装面板，请核对并确认；':'请在 OpenDesk 侧边栏安装面板 中核对并确认；')+'打开面板不表示已批准，发起审阅不表示已安装。';
}
function showCurrent(entry,result){
  entry.current=result;render(entry);
  if(!entry.intent){
    const labels={'not-installed':'此固定版本尚未安装。',installed:'已安装，可打开使用。',
      'update-available':'已有较旧版本；本页固定发行尚未安装，可以审阅更新。','different-version':'已安装不同版本；本页不能代替它打开另一个发行。'};
    feedback(entry,labels[result.currentInstallation]+(result.installedVersion?' 当前版本：'+result.installedVersion+'。':'')+
      (result.enabled===false?' 当前安装已停用。':''));
  }
}
async function checkInstallation(entry){
  if(!entry.intent)return;
  const id=entry.intent.id;
  let result;
  try{result=await send({protocol,action:'GET_INSTALL_STATUS',intentId:id,subject:entry.subject});}
  catch(error){
    if(error.code==='E_INTENT_EXPIRED'&&entry.intent?.id===id){
      entry.intent=null;saveIntent(entry);render(entry);
      error.message+=' 原请求结果未在此确认；再次点击安装才会发起新审阅。';
    }
    throw error;
  }
  if(entry.intent?.id!==id)return;
  if(entry.subject.kind==='app')showCurrent(entry,result);
  entry.intent.installation=result.installation;
  const labels={installed:'本次安装已成功，已核对本机安装记录。',review:entry.subject.kind==='app'?appReviewFeedback(result.handoff):'请在 OpenDesk 审阅页核对并确认。',
    cancelled:'本次安装已取消。再次点击安装将发起新审阅。',failed:'本次安装失败。可显式重新发起审阅。',
    unknown:'本次安装结果未知。请核对结果，或显式返回同一审阅；不会自动重装。',installing:'正在安装，请等待并核对结果。'};
  feedback(entry,labels[result.installation]+
    (entry.subject.kind==='app'&&result.installation==='unknown'&&result.handoff?' '+appReviewFeedback(result.handoff):'')+
    (entry.subject.kind==='collection'&&result.progress?' '+result.progress:'')+
    (result.handoffClosed?' 原交接已明确结束，原安装结果仍未知；再次点击才会发起新审阅。':'')+
    (result.currentInstallation&&result.currentInstallation!=='not-installed'?' 当前已有安装，可另行打开。':''),
    result.installation==='installed'?'success':result.installation==='failed'?'error':'pending');
  if(['cancelled','failed'].includes(result.installation)||result.handoffClosed===true)entry.intent=null;
  saveIntent(entry);render(entry);
}
async function refreshStatuses(){
  if(active)return;
  active=true;
  try{
    await configuration();
    for(const entry of entries){
      // A pending receipt already includes current installation status. Cache
      // background reads and bound their total so focus events leave capacity
      // for explicit install/open actions under the receiver's existing limit.
      const now=Date.now();
      if(entry.intent){
        if((entry.intentCheckedId!==entry.intent.id||entry.intentCheckedAt===null||now-entry.intentCheckedAt>=15000)&&allowAutomaticRead()){
          entry.intentCheckedId=entry.intent.id;entry.intentCheckedAt=now;entry.appCheckedAt=now;
          try{await checkInstallation(entry);}catch(error){showError(error,entry.localStatus);}
        }
      }else if(entry.subject.kind==='app'&&(entry.appCheckedAt===null||now-entry.appCheckedAt>=60000)&&allowAutomaticRead()){
        entry.appCheckedAt=now;
        try{showCurrent(entry,await send({protocol,action:'GET_APP_STATUS',subject:entry.subject}));}
        catch(error){showError(error,entry.localStatus);}
      }
    }
  }finally{active=false;}
}
async function perform(entry,operation){
  if(active)return;
  active=true;
  for(const control of [entry.button,entry.returnButton,entry.openButton])if(control)control.disabled=true;
  try{
    await configuration();
    if(operation==='open'||operation==='primary'&&!unresolved(entry)&&entry.current?.currentInstallation==='installed'){
      const opened=await send({protocol,action:'OPEN_INSTALLED_APP',subject:entry.subject});
      const label={APP_OPENED:'已在 OpenDesk 侧边栏打开此固定发行。',
        NAVIGATION_PENDING:'已向 Side Panel 提交打开请求；等待原窗口面板核对，尚未确认运行。',
        PANEL_REQUIRED:'打开请求已保留；请点击 Chrome 工具栏中的 OpenDesk 打开同一窗口侧边栏。',
        NAVIGATION_BLOCKED:'侧边栏未接受打开操作；请先保存草稿或关闭其他审阅，再主动重试。',
        IDENTITY_CHANGED:'版本、发行身份或本机安装状态已变化，应用没有启动。'};
      feedback(entry,(label[opened.status]||'打开结果未知，请核对 Side Panel。')+
        (opened.message?' '+opened.message:''),opened.status==='APP_OPENED'?'success':'pending');return;
    }
    if(operation==='primary'&&unresolved(entry)){await checkInstallation(entry);return;}
    if(!entry.intent||!unresolved(entry)){
      entry.intent={id:crypto.randomUUID(),subject:entry.subject,installation:'unknown'};
      saveIntent(entry);
    }
    // Persist before sending: timeout or navigation must never replay the action.
    render(entry);feedback(entry,'正在打开 OpenDesk 安装审阅…');
    const result=await send({protocol,action:'OPEN_INSTALL_REVIEW',intentId:entry.intent.id,subject:entry.subject});
    // The backend may recover a pre-existing unresolved operation for this subject.
    entry.intent.id=result.intentId;saveIntent(entry);
    probeGeneration++;connectButton.disabled=false;connection.textContent='已连接 OpenDesk';connection.dataset.state='success';
    feedback(entry,entry.subject.kind==='app'?appReviewFeedback(result.status==='REVIEW_OPENED'?'panel-open':
      result.status==='REVIEW_PENDING'?'panel-opening':'panel-required'):
      '已打开 OpenDesk 安装审阅，请核对并确认；发起审阅不表示已安装。');
    if($('#handoff-details'))$('#handoff-details').hidden=true;
  }catch(error){showError(error,entry.localStatus);}
  finally{
    active=false;render(entry);
    for(const control of [entry.button,entry.returnButton,entry.openButton])if(control)control.disabled=false;
  }
}
for(const entry of entries){
  render(entry);
  entry.button.addEventListener('click',()=>perform(entry,'primary'));
  entry.returnButton?.addEventListener('click',()=>perform(entry,'return'));
  entry.openButton?.addEventListener('click',()=>perform(entry,'open'));
}
// Returning to the website only reads status, never opens review or an app.
for(const event of ['focus','pageshow'])globalThis.addEventListener?.(event,()=>{
  void refreshStatuses().catch(error=>showError(error));
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
