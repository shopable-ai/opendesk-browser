// Trusted extension UI coordinator for browser.sidePanel.openSelf.
// Open must happen synchronously in a genuine user click, never via tool RPC.
// A queued request does not grant permission: the Host must observe revocation.
const fail=(code,message=code)=>Object.assign(new Error(message),{code});
const UUID=/^[0-9a-f-]{36}$/i;
export function createSidePanelOpenCoordinator({api=globalThis.chrome,clock=Date,
 authorize,isCurrent,createRef=()=>crypto.randomUUID(),
 isTrustedClick=event=>event instanceof Event&&event.type==='click'&&event.isTrusted===true}={}){
 if(typeof authorize!=='function'||typeof isCurrent!=='function')
  throw fail('E_CONTEXT','Trusted UI authorization and synchronous identity fence required');
 const pending=new Map();
 async function prepare({toolId,hostInstanceId,windowId}={}){
  if(typeof toolId!=='string'||!/^[a-z][a-z0-9-]{1,39}$/.test(toolId)||
   typeof hostInstanceId!=='string'||!UUID.test(hostInstanceId)||
   !Number.isSafeInteger(windowId)||windowId<0)
   throw fail('E_SCHEMA','Verified tool and Side Panel host identity required');
  const context={toolId,hostInstanceId,windowId};
  if(await authorize({phase:'prepare',context})!==true)
   throw fail('E_TOOL_CHANGED','Tool is disabled or lacks approval');
  if(pending.size>=8)throw fail('E_LIMIT','Too many pending user gestures');
  const requestRef=createRef();
  if(typeof requestRef!=='string'||!UUID.test(requestRef)||pending.has(requestRef))
   throw fail('E_CONTEXT','Secure action reference missing');
  const expiresAt=clock.now()+15000;
  pending.set(requestRef,{context,expiresAt});
  return {requestRef,expiresAt,requiresVisibleUserClick:true};
 }
 function confirm(requestRef,event){
  // No await here before Chrome sidePanel.open. User activation is synchronous.
  if(!isTrustedClick(event))throw fail('E_USER_GESTURE_REQUIRED','A real OpenDesk button click is required');
  const row=pending.get(requestRef);
  pending.delete(requestRef); // one-shot even if Chrome refuses the operation
  if(!row||clock.now()>=row.expiresAt)throw fail('E_LAUNCH_EXPIRED','User gesture expired or already consumed');
  // Permission state is checked during prepare; synchronously fence the live tool
  // session here without consuming the native user activation in an async check.
  let current=false;
  try{current=isCurrent(row.context)===true}catch{}
  if(!current)throw fail('E_TOOL_CHANGED','Tool was switched, disabled or revoked before the click');
  if(typeof api?.sidePanel?.open!=='function')throw fail('E_CHROME_UNSUPPORTED');
  let result;
  try{result=api.sidePanel.open({windowId:row.context.windowId})}
  catch{throw fail('E_CHROME','Chrome refused to open own Side Panel')}
  return Promise.resolve(result).then(()=>({opened:true}),()=>{
   throw fail('E_CHROME','Chrome refused to open own Side Panel');
  });
 }
 const revokeTool=id=>{for(const [ref,row] of pending)if(row.context.toolId===id)pending.delete(ref)};
 return Object.freeze({prepare,confirm,revokeTool,dispose:()=>pending.clear()});
}
