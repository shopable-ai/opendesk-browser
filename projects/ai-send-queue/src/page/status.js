// Read-only companion health, without queue contents or a second sender.
export function registerPageStatus({bridge,owner,site,view,version}){
  if(typeof bridge?.onRequest!=='function')return;
  const stop=bridge.onRequest(({operation,payload}={})=>{
    if(operation!=='queue.status'||!payload||typeof payload!=='object'||
      Array.isArray(payload)||Object.keys(payload).length)
      throw new Error('Unsupported queue status request');
    if(!owner.active())return {status:'stopped',version};
    let snap,placed;
    try{snap=site.inspect();}
    catch{throw Object.assign(new Error('E_QUEUE_STATUS_INSPECT: 网页输入框状态检查失败'),{code:'E_QUEUE_STATUS_INSPECT'});}
    if(!snap.ok)return {status:'composer-unavailable',version,reason:snap.reason||'原生输入框尚未确认'};
    try{placed=view.isPlaced(snap);}
    catch{throw Object.assign(new Error('E_QUEUE_STATUS_LAYOUT: 网页队列界面状态检查失败'),{code:'E_QUEUE_STATUS_LAYOUT'});}
    if(!placed)return {status:'composer-unavailable',version,reason:'网页队列尚未安全显示，请等待输入框加载完成后检查'};
    return {status:snap.newConversation?'new-conversation':'ready',version};
  });
  owner.onDispose(()=>stop?.());
}
