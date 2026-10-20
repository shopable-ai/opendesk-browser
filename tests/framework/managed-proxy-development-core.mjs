// Positive local development flow through the installed native Side Panel.
// No installation records, member entitlements or proxy settings are injected.
import assert from 'node:assert/strict';

// Self-contained so responses can be sanitized inside the sandbox before CDP
// reads them, and the native driver can also sanitize failure evidence.
export function sanitizeManagedProxyEvidence(value){
  function clean(item,cookie=false){
    if(Array.isArray(item))return item.map(row=>clean(row,cookie));
    if(!item||typeof item!=='object')return item;
    return Object.fromEntries(Object.entries(item)
      .filter(([key])=>!(cookie&&key==='value')&&!/^(cookie|set-cookie)$/i.test(key))
      .map(([key,child])=>[key,clean(child,cookie||key==='cookieDelivery'||key==='cookies')]));
  }
  return clean(value);
}

export async function exerciseManagedProxyDevelopmentCore(h){
  const {client,panelSession,worker,evalAt,until,clickIn,clickSandbox,
    toolFrame,readNative,screenshot,step,receipt}=h;
  let frame=h.officialFrame;
  const cookieFlow=process.env.OPENDESK_PROXY_DEV_COOKIE==='1';
  const cookieTarget='http://127.0.0.1:7898/session/';
  const sanitizeSource='('+sanitizeManagedProxyEvidence.toString()+')';
  const read=expression=>evalAt(frame.session,expression,frame.contextId);
  const text=id=>read(`document.getElementById(${JSON.stringify(id)})?.textContent??null`);
  await evalAt(panelSession,`(()=>{globalThis.__managedDevBusinessRequests=[];
    globalThis.__managedDevCookieRequests=[];
    window.addEventListener('message',event=>{const m=event.data;
      if(event.source!==document.querySelector('#sidebar-tool-frame iframe')?.contentWindow||m?.kind!=='request')return;
      if(m.operation==='browser.network.request')
        globalThis.__managedDevBusinessRequests.push({requestId:m.requestId,instance:m.instance,
          operation:m.operation,url:m.payload?.url,method:m.payload?.method});
      if(${cookieFlow}&&(m.operation==='browser.cookies.setMany'||m.operation?.startsWith('cookieEditor.')))
        globalThis.__managedDevCookieRequests.push({requestId:m.requestId,instance:m.instance,
          operation:m.operation,payload:${sanitizeSource}(m.payload)});
    });return true;})()`);
  async function observeFrame(){await read(`(()=>{globalThis.__managedDevResponses=[];globalThis.__managedDevInput=[];
    globalThis.__managedDevCookieDeliveries=[];
    for(const type of ['click','submit','keydown'])document.addEventListener(type,event=>{
      globalThis.__managedDevInput.push({type,isTrusted:event.isTrusted,target:event.target?.id});
    },true);window.addEventListener('message',event=>{
      const m=event.data;if(event.source!==parent||m?.kind!=='response')return;
      const data=m.result?.data,d=data?.cookieDelivery;
      if(${cookieFlow}&&d){
        const now=Date.now(),c=d.cookies?.[0];
        globalThis.__managedDevCookieDeliveries.push({requestId:m.requestId,instance:m.instance,
          valid:m.ok===true&&m.result.status>=200&&m.result.status<300&&data.status==='redeemed'&&
            d.schemaVersion===1&&typeof d.deliveryId==='string'&&d.deliveryId.length>0&&
            d.targetUrl===${JSON.stringify(cookieTarget)}&&Number.isFinite(d.expiresAt)&&d.expiresAt>now&&
            Array.isArray(d.cookies)&&d.cookies.length===1&&c?.name==='opendesk_fixture_session'&&
            typeof c.value==='string'&&/^[0-9a-f-]{36}$/.test(c.value)&&
            c.path==='/session/'&&c.httpOnly===true&&c.secure===false&&c.sameSite==='lax'&&
            Number.isFinite(c.expirationDate)&&c.expirationDate>now/1000,
          delivery:${sanitizeSource}(d)});
      }
      globalThis.__managedDevResponses.push(${sanitizeSource}(m));
    });return true;})()`);}
  async function approvePending(){
    const visible=await evalAt(panelSession,`(()=>{const e=document.querySelector('#sidebar-tool-action-continue');
      return !!e&&!e.disabled&&!e.closest('[hidden]')&&e.getBoundingClientRect().height>0;})()`);
    if(visible){
      step('DEV_TRUSTED_REVIEW',{summary:await evalAt(panelSession,
        'document.getElementById("sidebar-tool-action-summary")?.textContent')});
      await clickIn(panelSession,'#sidebar-tool-action-continue','native-side-panel');
    }
  }
  async function settled(check,label){
    return until(async()=>{await approvePending();return check();},label);
  }
  async function click(id){
    await read(`document.getElementById(${JSON.stringify(id)})?.scrollIntoView({block:'center'})`);
    await clickSandbox(frame,'#'+id,panelSession);
  }
  let cookiePage,cookiePageId;
  async function checkCookieSession(expected,name){
    await client.send('Target.activateTarget',{targetId:cookiePageId});
    const before=h.cookieFixtureRequests().length,eventStart=receipt.cookieTargetNetworkEvents?.length||0;
    const navigation=await client.send('Page.navigate',{url:cookieTarget},cookiePage);
    assert(!navigation.errorText,'Cookie target navigation failed; verify IPv6 --host-rules mapping');
    const document=await until(()=>evalAt(cookiePage,`(()=>{const text=document.body?.innerText?.trim();
      return location.href===${JSON.stringify(cookieTarget)}&&document.readyState==='complete'&&
        ['受控会话有效','未建立受控会话'].includes(text)?{url:location.href,text}:null;})()`),
      'actual Cookie target document; IPv6 host mapping must reach the owned fixture');
    const ownedRequests=h.cookieFixtureRequests().slice(before);
    assert(ownedRequests.some(row=>row.method==='GET'&&row.path==='/session/'),
      'Chrome host mapping did not reach the owned IPv6 fixture; IPv4 fixture must remain untouched');
    const response=await until(()=>receipt.cookieTargetNetworkEvents?.slice(eventStart).find(row=>
      row.sessionId===cookiePage&&row.method==='Network.responseReceived'&&row.params.type==='Document'&&
      row.params.response?.url===cookieTarget)?.params.response,'mapped Cookie target network response');
    assert(['::1','[::1]'].includes(response.remoteIPAddress),'Cookie target must use the owned IPv6 listener');
    assert.equal(response.remotePort,7898);
    assert.equal(response.status,200);
    assert.equal(document.text,expected,'Actual target page session state');
    const result={document,response,ownedRequests};
    step(name,{status:'PASS',...result});return result;
  }
  async function prepareCookiePermissions(){
    assert.equal(typeof h.cookieFixtureRequests,'function','Cookie flow requires its own IPv6 fixture');
    const target=await client.send('Target.createTarget',{url:'about:blank'});
    cookiePageId=target.targetId;
    cookiePage=(await client.send('Target.attachToTarget',{targetId:cookiePageId,flatten:true})).sessionId;
    for(const domain of ['Runtime','Page','Network'])await client.send(domain+'.enable',{},cookiePage);
    await client.send('Network.setCacheDisabled',{cacheDisabled:true},cookiePage);
    await checkCookieSession('未建立受控会话','DEV_COOKIE_TARGET_MAPPED');
    if(await evalAt(panelSession,"document.querySelector('#sidebar-tool-settings-view')?.hidden"))
      await clickIn(panelSession,'#sidebar-tool-settings-open','native-side-panel');
    await until(async()=>{
      const state=await evalAt(panelSession,`(async()=>{
      const section=document.querySelector('#sidebar-tool-cookie-permissions');
      const toggle=document.querySelector('#sidebar-tool-cookie-site-toggle');
      return {exists:!!section,hiddenBy:section?.closest('[hidden]')?.id??null,
        text:section?.innerText,disabled:toggle?.disabled,
        settingsHidden:document.querySelector('#sidebar-tool-settings-view')?.hidden,
        active:(await chrome.tabs.query({active:true,lastFocusedWindow:true})).map(t=>({id:t.id,windowId:t.windowId,url:t.url,status:t.status}))};})()`);
      receipt.cookieSettingsObservation=state;
      return state.exists&&!state.hiddenBy&&state.text?.includes('http://127.0.0.1:7898')&&!state.disabled;
    },'ordinary current-site Cookie settings');
    // This is the ordinary tool's current-site grant, never Cookie Editor's
    // official all-sites/import/write shortcuts or an injected permission.
    const enabled=()=>evalAt(panelSession,
      `document.querySelector('#sidebar-tool-cookie-site-toggle')?.dataset.enabled==='true'`);
    if(!await enabled())await clickIn(panelSession,'#sidebar-tool-cookie-site-toggle','native-side-panel');
    await until(enabled,'ordinary tool current-site write grant');
    const permission=await evalAt(panelSession,`(async()=>{
      const [cookies,site,stored]=await Promise.all([
        chrome.permissions.contains({permissions:['cookies']}),
        chrome.permissions.contains({origins:['http://127.0.0.1/*']}),
        chrome.storage.local.get(['opendesk.browser.context-menu-grants.v1',
          'opendesk.sidebar-tools.installed.v1','opendesk.sidebar-tools.revocation-epochs.v1'])]);
      const tool=stored['opendesk.sidebar-tools.installed.v1']?.find(row=>row.id==='ai-vip-share');
      return {cookies,site,tool:tool?{id:tool.id,version:tool.version,capabilities:tool.capabilities}:null,
        epoch:stored['opendesk.sidebar-tools.revocation-epochs.v1']?.['ai-vip-share']??null,
        grant:stored['opendesk.browser.context-menu-grants.v1']?.['ai-vip-share']??null,
        activeUrl:(await chrome.tabs.query({active:true,lastFocusedWindow:true}))[0]?.url};})()`);
    assert.equal(permission.cookies,true);assert.equal(permission.site,true);
    assert.equal(permission.activeUrl,cookieTarget);
    assert.equal(permission.tool?.version,receipt.formal.version);
    assert(permission.tool.capabilities.includes('browser.cookies.write'));
    assert.equal(permission.grant?.version,permission.tool.version);
    assert.equal(permission.grant.installEpoch,permission.epoch);
    assert.equal(permission.grant.cookieSites?.['http://127.0.0.1:7898']?.write,true);
    assert(!permission.grant.cookieAllSites,'Ordinary tool must not receive Cookie Editor all-site privilege');
    step('DEV_COOKIE_SITE_GRANTED',{status:'PASS',permission});
    await clickIn(panelSession,'#sidebar-tool-settings-open','native-side-panel');
    frame=await until(async()=>{try{return await toolFrame(panelSession,'#ai-vip-member-state');}catch{return null;}},
      'installed tool before ephemeral Cookie delivery');
    step('DEV_COOKIE_READY_BEFORE_REDEEM',{status:'PASS',frameId:frame.frameId});
  }
  if(cookieFlow&&process.env.OPENDESK_PROXY_DEV_INSPECT_COOKIE!=='1')await prepareCookiePermissions();
  await observeFrame();
  const local=await until(()=>read(`(()=>{const e=document.getElementById('ai-vip-local-connect');
    return e&&!e.hidden&&!e.disabled?e.textContent:null;})()`),'trusted development availability');
  step('DEV_LOCAL_OPT_IN_AVAILABLE',{status:'PASS',text:local});
  await click('ai-vip-local-connect');
  if(process.env.OPENDESK_PROXY_DEV_INSPECT_COOKIE==='1'){
    await settled(async()=>['尚未开通','权益有效'].includes(await text('ai-vip-member-state')),'inspect bound member service');
    step('DEV_COOKIE_BASELINE',{status:'PASS',member:await text('ai-vip-member-state'),
      cookieActionPresent:await read(`!!document.getElementById('ai-vip-cookie-install')`),
      observation:'Member service reachable; current installed tool has no Cookie installation action.'});
    console.log('DEV_COOKIE_BASELINE='+JSON.stringify(receipt.steps.at(-1)));
    return;
  }
  await settled(async()=>{const v=await text('ai-vip-member-state');return v==='尚未开通'?v:null;},'local member service bound account');
  await screenshot('dev-member-before-redemption',panelSession);
  await click('ai-vip-redeem-code');
  await client.send('Input.insertText',{text:'DEMO-VIP-01'},frame.via==='oopif-target'?frame.session:panelSession);
  await click('ai-vip-redeem');
  await settled(()=>read(`(()=>{const e=document.getElementById('ai-vip-redeem-confirm');
    return e&&!e.disabled&&!e.closest('[hidden]')?e.textContent:null;})()`),'server voucher preview and personal confirmation');
  await screenshot('dev-redeem-preview',panelSession);
  await click('ai-vip-redeem-confirm');
  await settled(async()=>{const v=await text('ai-vip-member-state');return v==='权益有效'?v:null;},'redeemed member entitlement from fixture');
  const member=await read(`(()=>{const ids=['ai-vip-member-state','ai-vip-account-name','ai-vip-product-name',
    'ai-vip-remaining','ai-vip-history-list','ai-vip-local-status'];
    return Object.fromEntries(ids.map(id=>[id,document.getElementById(id)?.textContent]));})()`);
  const requests=await evalAt(panelSession,'globalThis.__managedDevBusinessRequests');
  const responses=await read('globalThis.__managedDevResponses');
  const businessReceipts=requests.map(request=>{const response=responses.find(row=>
    row.requestId===request.requestId&&row.instance===request.instance);
    return sanitizeManagedProxyEvidence({...request,ok:response?.ok,status:response?.result?.status,data:response?.result?.data});});
  step('DEV_MEMBER_REDEEMED',{status:'PASS',member,businessReceipts});
  if(cookieFlow){
    const checks=await read('globalThis.__managedDevCookieDeliveries');
    const redeem=businessReceipts.find(row=>row.method==='POST'&&row.url===
      'http://127.0.0.1:7898/api/redeem'&&row.ok&&row.status===200&&row.data?.status==='redeemed');
    assert(redeem,'Successful redeem response must carry Cookie delivery');
    const delivery=checks.find(row=>row.requestId===redeem.requestId&&row.instance===redeem.instance);
    assert.equal(delivery?.valid,true,'Redeem must contain schema 1 delivery for one synthetic httpOnly session Cookie');
    assert.deepEqual(delivery.delivery,redeem.data.cookieDelivery);
    step('DEV_COOKIE_DELIVERY_VALIDATED',{status:'PASS',...delivery});
    await until(()=>read(`(()=>{const e=document.getElementById('ai-vip-cookie-install');
      return e&&!e.disabled&&!e.closest('[hidden]');})()`),'separate Cookie install click after redeem');
    assert.equal((await evalAt(panelSession,'globalThis.__managedDevCookieRequests')).length,0,
      'Redeem must not install Cookies automatically');
    // No settings navigation after redeem: delivery belongs to this live frame.
    await click('ai-vip-cookie-install');
    const summary=await until(()=>evalAt(panelSession,`(()=>{
      const button=document.querySelector('#sidebar-tool-action-continue');
      return button&&!button.disabled&&!button.closest('[hidden]')&&button.getBoundingClientRect().height>0?
        document.querySelector('#sidebar-tool-action-summary')?.textContent:null;})()`),'ordinary exact Cookie batch confirmation');
    assert(summary.includes('http://127.0.0.1:7898')&&summary.includes('批量写入 1 条 Cookie'),
      'Trusted Host review must confirm this exact site and batch size');
    const cookieRequests=await evalAt(panelSession,'globalThis.__managedDevCookieRequests');
    assert.equal(cookieRequests.length,1,'Exactly one ordinary Cookie batch; no Cookie Editor shortcut');
    const request=cookieRequests[0];
    assert.equal(request.operation,'browser.cookies.setMany');
    assert.equal(request.payload.url,cookieTarget);
    assert.deepEqual(request.payload.cookies,delivery.delivery.cookies);
    const inputs=await read('globalThis.__managedDevInput');
    assert.equal(inputs.filter(row=>row.type==='click'&&row.isTrusted&&row.target==='ai-vip-cookie-install').length,1);
    await clickIn(panelSession,'#sidebar-tool-action-continue','native-side-panel');
    step('DEV_COOKIE_TRUSTED_BATCH_APPROVED',{status:'PASS',summary,request,inputs});
    const response=await until(async()=>{
      const rows=await read('globalThis.__managedDevResponses');
      return rows.find(row=>row.requestId===request.requestId&&row.instance===request.instance);
    },'ordinary setMany saved and verified response');
    assert.equal(response.ok,true,'Ordinary setMany must succeed');
    const result=response.result;
    assert.equal(result.saved,1);assert.equal(result.verified,1);
    assert.equal(result.results?.length,1);
    for(const [index,row] of result.results.entries()){
      assert.equal(row.index,index);assert.equal(row.saved,true);assert.equal(row.verified,true);
    }
    const ui=await until(()=>read(`(()=>{
      const section=document.getElementById('ai-vip-cookie-section');
      const rows=[...document.querySelectorAll('#ai-vip-cookie-results > li')].map(e=>e.textContent);
      return section&&!section.closest('[hidden]')&&rows.length===1&&rows.every(row=>row.includes('已写入并核验'))?
        {status:document.getElementById('ai-vip-cookie-status')?.textContent,rows}:null;})()`),
      'each installed Cookie row saved and verified in UI');
    step('DEV_COOKIE_SAVED_VERIFIED',{status:'PASS',response,ui});
    await checkCookieSession('受控会话有效','DEV_COOKIE_SESSION_ESTABLISHED');
  }
  await screenshot('dev-member-redeemed',panelSession);
  await settled(()=>read(`(()=>{const e=document.getElementById('ai-vip-proxy-toggle');return e&&!e.hidden&&!e.disabled&&e.dataset.action==='start';})()`),'eligible proxy enable control');
  await click('ai-vip-proxy-toggle');
  await settled(async()=>{const state=await readNative(worker);return state.journal&&state.settings?.value?.mode==='pac_script'?state:null;},'actual owned Chrome PAC enabled');
  const active=await readNative(worker);
  assert.equal(active.settings.levelOfControl,'controlled_by_this_extension');
  assert(active.settings.value.pacScript.data.includes('PROXY 127.0.0.1:7897'));
  assert(!active.settings.value.pacScript.data.includes('HTTPS 127.0.0.1'));
  step('DEV_PROXY_ENABLED',{status:'PASS',native:active});
  if(cookieFlow)await checkCookieSession('受控会话有效','DEV_COOKIE_SESSION_PROXY_ENABLED');
  await screenshot('dev-proxy-enabled',panelSession);

  // Reopen while active: service state and the owned STOP affordance must survive.
  if(cookieFlow&&await evalAt(panelSession,"document.querySelector('#sidebar-tool-settings-view')?.hidden===false"))
    await clickIn(panelSession,'#sidebar-tool-back','native-side-panel');
  await clickIn(panelSession,'#sidebar-tool-back','native-side-panel');
  const selector='#extension-center-list button[data-extension-key="app:ai-vip-share"][data-extension-action="main"]';
  const listReady=()=>evalAt(panelSession,`(()=>{const e=document.querySelector(${JSON.stringify(selector)});
    return !!e&&!e.disabled&&!e.closest('[hidden]')&&e.getBoundingClientRect().height>0;})()`);
  await settled(listReady,'installed app return');
  await clickIn(panelSession,selector,'native-side-panel');
  frame=await until(async()=>{try{return await toolFrame(panelSession,'#ai-vip-member-state');}catch{return null;}},'reopened installed app');
  await settled(async()=>{const s=await text('ai-vip-member-state');return s==='权益有效'?s:null;},'member restored from service after reopening');
  await until(()=>read(`document.getElementById('ai-vip-proxy-toggle')?.dataset.action==='stop'`),'active owned STOP after reopen');
  step('DEV_REOPEN_ACTIVE',{status:'PASS',member:await text('ai-vip-member-state'),native:await readNative(worker)});
  if(cookieFlow)await checkCookieSession('受控会话有效','DEV_COOKIE_SESSION_REOPEN_ACTIVE');

  const results=[];
  for(const url of ['https://chatgpt.com/','https://api.openai.com/v1/models',
    'https://claude.ai/','https://api.anthropic.com/v1/messages',
    'https://gemini.google.com/','https://generativelanguage.googleapis.com/v1beta/models',
    'https://www.perplexity.ai/','https://api.perplexity.ai/chat/completions','https://example.com/']){
    const {targetId}=await client.send('Target.createTarget',{url:'about:blank'});
    const {sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
    try{
      await client.send('Runtime.enable',{},sessionId);
      await client.send('Network.enable',{},sessionId);
      const navigation=await client.send('Page.navigate',{url},sessionId);
      const event=await until(async()=>{
        const rows=(receipt.networkEvents||[]).filter(e=>e.sessionId===sessionId);
        return rows.find(e=>e.method==='Network.responseReceived'&&e.params.type==='Document')||
          rows.find(e=>e.method==='Network.loadingFailed'&&e.params.type==='Document');
      },'actual network response '+new URL(url).hostname).catch(error=>({error:String(error)}));
      const response=event?.params?.response;
      const document=await evalAt(sessionId,`({url:location.href,title:document.title,text:document.body?.innerText?.slice(0,300)})`).catch(error=>({error:String(error)}));
      const row={url,navigation,response:response?{url:response.url,status:response.status,
        remoteIPAddress:response.remoteIPAddress,remotePort:response.remotePort,protocol:response.protocol,
        securityState:response.securityState,fromDiskCache:response.fromDiskCache}:null,
        error:event.error||event.params?.errorText||null,document};
      results.push(row);
      console.log('DEV_NETWORK_RESULT='+JSON.stringify(row));
    }finally{await client.send('Target.closeTarget',{targetId});}
  }
  const openai=results.find(row=>row.url.includes('api.openai.com'));
  const routed=results.filter(row=>row.response?.remoteIPAddress==='127.0.0.1'&&row.response.remotePort===7897);
  const direct=results.find(row=>row.url==='https://example.com/');
  const networkVerified=Boolean(openai.response&&[200,401,403].includes(openai.response.status)&&
    routed.length>0&&direct.response&&direct.response.remoteIPAddress!=='127.0.0.1');
  step('DEV_NETWORK_RESPONSES',{status:networkVerified?'PASS':'FAIL',results,credentialedApiSuccess:false});

  await click('ai-vip-proxy-toggle');
  const released=await settled(async()=>{const state=await readNative(worker);
    return (!state.journal||state.journal.phase==='released')&&state.settings?.value?.mode!=='pac_script'&&
      state.settings?.levelOfControl!=='controlled_by_this_extension'?state:null;},'active proxy released by real STOP');
  await until(async()=>{const value=await text('ai-vip-proxy-state');return value==='已停止'?value:null;},'STOP acknowledgement in installed UI');
  step('DEV_ACTIVE_STOP',{status:'PASS',native:released});
  if(cookieFlow)await checkCookieSession('受控会话有效','DEV_COOKIE_SESSION_PROXY_STOPPED');
  await screenshot('dev-proxy-stopped',panelSession);
  if(cookieFlow&&await evalAt(panelSession,"document.querySelector('#sidebar-tool-settings-view')?.hidden===false"))
    await clickIn(panelSession,'#sidebar-tool-back','native-side-panel');
  await clickIn(panelSession,'#sidebar-tool-back','native-side-panel');
  await settled(listReady,'installed app return after stop');
  await clickIn(panelSession,selector,'native-side-panel');
  frame=await until(async()=>{try{return await toolFrame(panelSession,'#ai-vip-member-state');}catch{return null;}},'reopened stopped app');
  await settled(async()=>{const value=await text('ai-vip-member-state');return value==='权益有效'?value:null;},'member persists after stop');
  const final=await readNative(worker);
  if(final.journal){
    assert.equal(final.journal.phase,'released');
    assert.deepEqual(final.journal.owner,active.journal.owner);
  }
  assert.notEqual(final.settings.value.mode,'pac_script');
  assert.notEqual(final.settings.levelOfControl,'controlled_by_this_extension');
  await until(()=>read(`document.getElementById('ai-vip-proxy-toggle')?.dataset.action==='start'`),'no STOP owner after reopen');
  step('DEV_REOPEN_RELEASED',{status:'PASS',native:final,member:await text('ai-vip-member-state')});
  if(cookieFlow){
    await checkCookieSession('受控会话有效','DEV_COOKIE_SESSION_REOPEN_STOPPED');
    assert.equal((await evalAt(panelSession,'globalThis.__managedDevCookieRequests')).length,1,
      'Proxy toggles and tool reopen must not replay Cookie writes');
    await client.send('Target.closeTarget',{targetId:cookiePageId});
  }
  await screenshot('dev-reopened-stopped',panelSession);
  assert(networkVerified,'Network route/HTTP evidence incomplete; active STOP and reopened state were still verified');
}
