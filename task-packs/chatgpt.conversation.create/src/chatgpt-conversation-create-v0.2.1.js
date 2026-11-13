// OD-AI-WORKFLOW-BRIDGE: reviewed ChatGPT conversation Task, version 0.2.1.
// The original Controller owns the fresh tab, permission check, effect journal,
// immutable script, and durable result. This script NEVER retries a click.
async function main() {
  const fail=(code,message)=>{const error=new Error(message);error.code=code;throw error;};
  const cfg=params??{};
  const allowed=['prompt','send','model','effort','thinking'];
  if(!cfg||typeof cfg!=='object'||Array.isArray(cfg)||
    Object.keys(cfg).some(key=>!allowed.includes(key))||
    typeof cfg.prompt!=='string'||cfg.prompt.length<1||cfg.prompt.length>3000||
    !cfg.prompt.trim()||typeof cfg.send!=='boolean')
    fail('E_CHAT_CREATE_PARAMS','A prompt and explicit boolean send decision are required');
  // Do not modify the user's current model/effort. Unsupported explicit
  // selections must never silently downgrade or send with another setting.
  if(['model','effort','thinking'].some(key=>Object.hasOwn(cfg,key)))
    fail('E_CHAT_SETTINGS_UNVERIFIED','The requested model or thinking settings cannot be verified');
  const original=new URL(await page.url());
  if(original.origin!=='https://chatgpt.com'||original.pathname!=='/'||
    original.search||original.hash||original.username||original.password)
    fail('E_CHAT_CREATE_TARGET','Only a fresh official ChatGPT root is allowed');
  const editor=page.locator('#prompt-textarea,form[data-chatgpt-composer] [data-composer-markdown][contenteditable="true"][role="textbox"]');
  // The current official empty ProseMirror composer exposes a single blank
  // paragraph as a newline. Preserve every non-empty draft exactly.
  const draftText=async()=>{const text=await editor.innerText();return text==='\n'?'':text;};
  if(await editor.count()!==1||!await editor.isVisible())
    fail('E_CHAT_CREATE_EDITOR','Cannot uniquely identify the native composer');
  const attachments=page.locator('form [data-attachment-id],form [data-file-id],form [data-upload-id],form [data-testid*="attachment-preview"],form [data-testid*="file-preview"]');
  const users=page.locator('[data-message-author-role="user"],[data-chatgpt-search-unit-key$=":user"]');
  const generating=page.locator('[data-testid="stop-button"],[data-testid="composer-stop-button"],[data-is-streaming="true"],.result-streaming');
  if(await attachments.count()!==0||await users.count()!==0||await generating.count()!==0||
    await draftText()!=='')
    fail('E_CHAT_CREATE_DRAFT','Existing draft, upload, turn, or generation must be preserved');
  await editor.fill(cfg.prompt,{timeout:12000});
  if(await draftText()!==cfg.prompt||await page.url()!==original.href||
    await attachments.count()!==0||await users.count()!==0)
    fail('E_CHAT_CREATE_READBACK','Native prompt readback or fresh-context verification failed');
  if(!cfg.send)return {kind:'chatgpt.conversation.create.result',version:2,
    status:'draft-prepared',send:false,messageConfirmed:false,conversationId:null,
    conversationUrl:null,sourceUrl:original.href,promptChars:cfg.prompt.length,
    readbackConfirmed:true,observedAt:new Date().toISOString()};

  // send:true is a separate reviewed manifest parameter, never inferred from
  // a draft, an old V1 grant, or an omitted field. The existing trusted Host
  // must authorize this exact task installation and single Run.
  const submit=page.locator('button[data-testid="send-button"],button#composer-submit-button,form[data-chatgpt-composer] button[type="submit"]');
  if(await submit.count()!==1||!await submit.isVisible()||!await submit.isEnabled()||
    await generating.count()!==0||await attachments.count()!==0||
    await draftText()!==cfg.prompt||await page.url()!==original.href)
    fail('E_CHAT_SEND_PREFLIGHT','Native submit control or context cannot be verified');
  // IMPORTANT: do not catch and retry. Controller journals the native effect;
  // a lost ACK or navigation must be reconciled against the ORIGINAL Run.
  await submit.click({timeout:12000});

  const messageSelector={user:[
    '[data-message-author-role="user"]',
    '[data-chatgpt-search-unit-key$=":user"]'],assistant:[
    '[data-message-author-role="assistant"]',
    '[data-content-search-unit-key$=":assistant"]']};
  async function unique(role){
    for(const selector of messageSelector[role]){
      const found=page.locator(selector),count=await found.count();
      if(count>1)fail('E_CHAT_MESSAGE_AMBIGUOUS','Multiple '+role+' messages were observed');
      if(count===1)return found;
    }
    return null;
  }
  async function refOf(row,role){
    const names=role==='user'?['data-message-id','data-chatgpt-search-message-ids','data-chatgpt-search-unit-key']:
      ['data-message-id','data-chatgpt-search-message-ids','data-content-search-unit-key'];
    for(const name of names){
      const value=await row.getAttribute(name);
      if(typeof value==='string'&&/^[A-Za-z0-9:_-]{8,160}$/.test(value))return value;
    }
    fail('E_CHAT_MESSAGE_ID','Stable native '+role+' message identity was not exposed');
  }
  async function responseText(){
    for(const css of [
      '[data-message-author-role="assistant"] [data-testid="message-content"]',
      '[data-content-search-unit-key$=":assistant"] [data-testid="message-content"]',
      '[data-message-author-role="assistant"] .markdown',
      '[data-content-search-unit-key$=":assistant"]']){
      const found=page.locator(css),count=await found.count();
      if(count>1)fail('E_CHAT_REPLY_AMBIGUOUS','Response content is not unique');
      if(count===1)return await found.innerText();
    }
    return '';
  }
  for(let attempt=0;attempt<75;attempt++){
    await page.waitForTimeout(900);
    const now=new URL(await page.url());
    if(now.origin!=='https://chatgpt.com')
      fail('E_CHAT_CREATE_TARGET','ChatGPT origin changed after submission');
    const found=/^\/c\/([a-f0-9-]{36})$/iu.exec(now.pathname);
    if(!found||now.search||now.hash)continue;
    const user=await unique('user');
    if(!user)continue;
    if(await user.innerText()!==cfg.prompt)
      fail('E_CHAT_MESSAGE_MISMATCH','Submitted user message differs from the approved prompt');
    const userMessageRef=await refOf(user,'user');
    const assistant=await unique('assistant');
    if(!assistant||await generating.count()!==0)continue;
    const reply=await responseText();
    if(typeof reply!=='string'||!reply.trim()||new TextEncoder().encode(reply).byteLength>65536)
      continue;
    // Completion action and a second stable observation are both required.
    const actions=page.locator('[data-testid="copy-turn-action-button"],[data-assistant-message-actions]');
    if(await actions.count()===0)continue;
    const assistantMessageRef=await refOf(assistant,'assistant');
    await page.waitForTimeout(1100);
    if(await page.url()!==now.href||await generating.count()!==0||
      await users.count()>2||await responseText()!==reply||
      await user.innerText()!==cfg.prompt||
      await refOf(assistant,'assistant')!==assistantMessageRef)
      continue;
    return {kind:'chatgpt.conversation.create.result',version:2,
      status:'reply-complete',send:true,messageConfirmed:true,
      conversationId:found[1],conversationUrl:now.href,
      userMessageRef,assistantMessageRef,replyText:reply,
      sourceUrl:original.href,promptChars:cfg.prompt.length,
      readbackConfirmed:true,observedAt:new Date().toISOString()};
  }
  // An incomplete or unverifiable response is not proof of failure to send.
  // Never create another chat or click Send again for this operation identity.
  fail('E_CHAT_REPLY_UNKNOWN','Send was attempted; inspect the original Run/tab for completion');
}
