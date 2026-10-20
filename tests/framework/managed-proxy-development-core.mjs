// Positive local development flow through the installed native Side Panel.
// No installation records, member entitlements or proxy settings are injected.
import assert from 'node:assert/strict';

export async function exerciseManagedProxyDevelopmentCore(h){
  const {client,panelSession,worker,evalAt,until,clickIn,clickSandbox,
    toolFrame,readNative,screenshot,step,receipt}=h;
  let frame=h.officialFrame;
  const read=expression=>evalAt(frame.session,expression,frame.contextId);
  const text=id=>read(`document.getElementById(${JSON.stringify(id)})?.textContent??null`);
  await evalAt(panelSession,`(()=>{globalThis.__managedDevBusinessRequests=[];
    window.addEventListener('message',event=>{const m=event.data;
      if(event.source===document.querySelector('#sidebar-tool-frame iframe')?.contentWindow&&
        m?.kind==='request'&&m.operation==='browser.network.request')
        globalThis.__managedDevBusinessRequests.push({requestId:m.requestId,instance:m.instance,
          operation:m.operation,url:m.payload?.url,method:m.payload?.method});});return true;})()`);
  await read(`(()=>{globalThis.__managedDevResponses=[];globalThis.__managedDevInput=[];
    for(const type of ['click','submit','keydown'])document.addEventListener(type,event=>{
      globalThis.__managedDevInput.push({type,isTrusted:event.isTrusted,target:event.target?.id});
    },true);window.addEventListener('message',event=>{
    if(event.source===parent&&event.data?.kind==='response')globalThis.__managedDevResponses.push(event.data);
  });return true;})()`);
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
  const local=await until(()=>read(`(()=>{const e=document.getElementById('ai-vip-local-connect');
    return e&&!e.hidden&&!e.disabled?e.textContent:null;})()`),'trusted development availability');
  step('DEV_LOCAL_OPT_IN_AVAILABLE',{status:'PASS',text:local});
  await click('ai-vip-local-connect');
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
    return {...request,ok:response?.ok,status:response?.result?.status,data:response?.result?.data};});
  step('DEV_MEMBER_REDEEMED',{status:'PASS',member,businessReceipts});
  await screenshot('dev-member-redeemed',panelSession);
  await settled(()=>read(`(()=>{const e=document.getElementById('ai-vip-proxy-toggle');return e&&!e.hidden&&!e.disabled&&e.dataset.action==='start';})()`),'eligible proxy enable control');
  await click('ai-vip-proxy-toggle');
  await settled(async()=>{const state=await readNative(worker);return state.journal&&state.settings?.value?.mode==='pac_script'?state:null;},'actual owned Chrome PAC enabled');
  const active=await readNative(worker);
  assert.equal(active.settings.levelOfControl,'controlled_by_this_extension');
  assert(active.settings.value.pacScript.data.includes('PROXY 127.0.0.1:7897'));
  assert(!active.settings.value.pacScript.data.includes('HTTPS 127.0.0.1'));
  step('DEV_PROXY_ENABLED',{status:'PASS',native:active});
  await screenshot('dev-proxy-enabled',panelSession);

  // Reopen while active: service state and the owned STOP affordance must survive.
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
  await screenshot('dev-proxy-stopped',panelSession);
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
  await screenshot('dev-reopened-stopped',panelSession);
  assert(networkVerified,'Network route/HTTP evidence incomplete; active STOP and reopened state were still verified');
}
