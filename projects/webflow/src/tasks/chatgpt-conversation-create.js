// OD-AI-WORKFLOW-BRIDGE: first vertical slice for ChatGPT B (draft only).
// Executed by the original reviewed Controller Task. There is no external
// chrome.* permission, run dispatcher, network bridge, or self-authorization.
async function main() {
  const fail=(code,message)=>{const error=new Error(message);error.code=code;throw error;};
  const cfg=params??{};
  const allowed=['prompt','send','model','effort','thinking'];
  if(!cfg||typeof cfg!=='object'||Object.keys(cfg).some(key=>!allowed.includes(key))||
    typeof cfg.prompt!=='string'||cfg.prompt.length<1||cfg.prompt.length>3000||
    !cfg.prompt.trim()||cfg.send!==false)
    fail('E_CHAT_CREATE_PARAMS','Draft preparation requires a prompt and send:false');
  // Exact model/effort/thinking selection must be proven on the real account
  // BEFORE editing. Unsupported, ambiguous, or unobserved options fail closed.
  if(Object.hasOwn(cfg,'model')||Object.hasOwn(cfg,'effort')||Object.hasOwn(cfg,'thinking'))
    fail('E_CHAT_SETTINGS_UNVERIFIED','Requested model/thinking settings have not been verified');
  const initial=new URL(await page.url());
  if(initial.origin!=='https://chatgpt.com'||initial.pathname!=='/'||
    initial.search||initial.hash||initial.username||initial.password)
    fail('E_CHAT_CREATE_TARGET','Expected a fresh official ChatGPT tab');
  const editor=page.locator('#prompt-textarea');
  if(await editor.count()!==1||!await editor.isVisible())
    fail('E_CHAT_CREATE_EDITOR','Official native composer not found exactly once');
  const attachment=page.locator('form [data-attachment-id],form [data-file-id],form [data-upload-id],form [data-testid*="attachment-preview"],form [data-testid*="file-preview"]');
  if(await attachment.count()!==0)
    fail('E_CHAT_CREATE_DRAFT','An attachment or pending upload is already present');
  const users=page.locator('[data-message-author-role="user"]');
  if(await users.count()!==0)
    fail('E_CHAT_CREATE_CONTEXT','The target is not an empty new conversation');
  const stop=page.locator('form [data-testid="stop-button"],form [data-testid="composer-stop-button"]');
  if(await stop.count())
    fail('E_CHAT_CREATE_BUSY','Another sender is already generating a response');
  const original=await editor.innerText();
  if(original!=='')
    fail('E_CHAT_CREATE_DRAFT','The native editor contains a user draft');
  // The original Controller journals this DOM operation; never issue a second
  // fill if the first call has an unknown outcome.
  await editor.fill(cfg.prompt,{timeout:12000});
  const observed=await editor.innerText();
  if(observed!==cfg.prompt)
    fail('E_CHAT_CREATE_READBACK','Native prompt readback differs; do not send');
  const after=new URL(await page.url());
  if(after.href!==initial.href||await users.count()!==0||await attachment.count()!==0)
    fail('E_CHAT_CREATE_CONTEXT','Page context changed while preparing the draft');
  // A blank unsent conversation has no guaranteed persistent /c/ identity.
  // The reviewed manifest retains the actual owned tab for manual inspection.
  return {kind:'chatgpt.conversation.create.result',version:1,
    status:'draft-prepared',send:false,messageConfirmed:false,
    conversationId:null,conversationUrl:null,sourceUrl:after.href,
    promptChars:cfg.prompt.length,readbackConfirmed:true,
    observedAt:new Date().toISOString()};
}
