// Reviewed, fixed-compiled ChatGPT 0.2.x Task result schema. No website
// execution, authority, message dispatch or workflow delivery belongs here.
const fail=(message)=>{throw Object.assign(new Error(message),{code:'E_CHAT_CREATE_RESULT'});};
const FIELDS_DRAFT=['kind','version','status','send','messageConfirmed',
  'conversationId','conversationUrl','sourceUrl','promptChars',
  'readbackConfirmed','observedAt'];
const FIELDS_REPLY=[...FIELDS_DRAFT,'userMessageRef','assistantMessageRef','replyText'];
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
const MESSAGE=/^[A-Za-z0-9:_-]{8,160}$/u;
const DATE=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u;
const utf8=value=>new TextEncoder().encode(value).byteLength;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  Object.getPrototypeOf(value)===Object.prototype;
function shape(value,fields){
  if(!plain(value)||Reflect.ownKeys(value).length!==fields.length||
    fields.some(name=>!Object.hasOwn(value,name)))fail('Unexpected Task result fields');
}
function observed(value){
  return typeof value==='string'&&DATE.test(value)&&
    Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
}

export function validateChatGPTCreateResult(value,args){
  if(!plain(args)||typeof args.prompt!=='string'||!args.prompt.trim()||
    args.prompt.length>3000||typeof args.send!=='boolean'||
    ['model','effort','thinking'].some(key=>Object.hasOwn(args,key)))
    fail('Unverified prompt or explicit model settings');
  if(!plain(value)||!['draft-prepared','reply-complete'].includes(value.status))
    fail('Unverified ChatGPT Task outcome');
  shape(value,value.status==='draft-prepared'?FIELDS_DRAFT:FIELDS_REPLY);
  if(value.kind!=='chatgpt.conversation.create.result'||value.version!==2||
    value.sourceUrl!=='https://chatgpt.com/'||
    value.promptChars!==args.prompt.length||value.readbackConfirmed!==true||
    value.send!==args.send||!observed(value.observedAt))
    fail('Task result does not match its approved input');
  if(!args.send){
    if(value.status!=='draft-prepared'||value.messageConfirmed!==false||
      value.conversationId!==null||value.conversationUrl!==null)
      fail('Unsent draft cannot claim a persistent conversation');
  }else{
    if(value.status!=='reply-complete'||value.messageConfirmed!==true||
      typeof value.conversationId!=='string'||!UUID.test(value.conversationId)||
      value.conversationUrl!=='https://chatgpt.com/c/'+value.conversationId||
      typeof value.userMessageRef!=='string'||!MESSAGE.test(value.userMessageRef)||
      typeof value.assistantMessageRef!=='string'||!MESSAGE.test(value.assistantMessageRef)||
      value.userMessageRef===value.assistantMessageRef||
      typeof value.replyText!=='string'||!value.replyText.trim()||
      utf8(value.replyText)>65536)
      fail('New conversation, messages or complete reply not confirmed');
  }
  return Object.freeze({...value});
}

