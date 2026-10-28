// Fixed operations in the Page USER_SCRIPT world. No persistent storage or second sender.
export const SEND_QUEUE_REMOTE_GLOBAL='__opendeskAiSendQueueV1';
const PREVIEW_LIMIT=600;
export function createSendQueueRemote({owner,site,engine,actions,
  retireForLegacy=()=>false,randomId=()=>crypto.randomUUID(),world=globalThis}){
  const instance=randomId();
  if(typeof instance!=='string'||!instance||instance.length>128)throw Error('E_QUEUE_INSTANCE');
  let revision=0;
  const unavailable=reason=>({status:'unavailable',reason,instance,revision});
  function snapshot(){
    if(!owner.active()||retireForLegacy())return unavailable('网页队列已停止');
    const page=site.inspect(),state=engine.view();
    if(!page.ok)return unavailable('请打开可用的 ChatGPT 对话');
    if(state.route&&page.route!==state.route)
      return {status:'wrong-session',reason:'该队列属于另一个 ChatGPT 对话',
        instance,revision,route:page.route};
    return {status:'ready',instance,revision,route:page.route,
      phase:state.phase,reason:state.reason||'',answerGate:Boolean(state.answerGate),
      inFlight:state.inFlight?{id:state.inFlight.id,phase:state.inFlight.phase}:null,
      items:state.items.map(item=>({id:item.id,state:item.state,
        text:item.text.slice(0,PREVIEW_LIMIT),length:item.text.length})),
      memoryOnly:true};
  }
  function invoke(request){
    if(!request||typeof request!=='object'||Array.isArray(request)||
      typeof request.operation!=='string')return unavailable('无效的队列请求');
    if(request.operation==='snapshot')return snapshot();
    if(!['pause','resume','now','edit','remove','move'].includes(request.operation))
      return unavailable('不支持的队列操作');
    const before=snapshot();
    if(before.status!=='ready')return before;
    if(request.instance!==instance||request.revision!==revision)
      return {...before,status:'stale',reason:'网页队列在操作前已变化'};
    const id=request.id;
    if(typeof id!=='string'||!/^q[1-9]\d{0,8}$/.test(id))
      return {...before,effect:'rejected',reason:'消息标识无效'};
    const state=engine.view(),item=state.items.find(row=>row.id===id);
    if(!item||state.phase==='unknown'||state.inFlight?.phase==='unknown')
      return {...before,effect:'rejected',reason:'消息不存在或发送状态未知'};
    let applied=false;
    switch(request.operation){
      case 'pause':applied=engine.pause(id);break;
      case 'resume':applied=engine.resume(id);break;
      case 'move':
        applied=Number.isInteger(request.index)&&request.index>=0&&
          request.index<state.items.length&&engine.move(id,request.index);break;
      case 'remove':
        // Unknown or sending deletion is never performed by remote control.
        applied=['queued','paused'].includes(item.state)&&!state.inFlight&&engine.remove(id);
        break;
      case 'edit':
        applied=['queued','paused'].includes(item.state)&&actions.edit(id)===true;break;
      case 'now':
        applied=item.state==='queued'&&actions.sendNow(id)===true;break;
    }
    return {...snapshot(),effect:applied?'applied':'rejected'};
  }
  if(Object.getOwnPropertyDescriptor(world,SEND_QUEUE_REMOTE_GLOBAL))
    throw Error('E_QUEUE_REMOTE_COLLISION');
  const handler=Object.freeze(invoke);
  Object.defineProperty(world,SEND_QUEUE_REMOTE_GLOBAL,{value:handler,
    configurable:true,enumerable:false,writable:false});
  owner.onDispose(()=>{
    if(Object.getOwnPropertyDescriptor(world,SEND_QUEUE_REMOTE_GLOBAL)?.value===handler)
      delete world[SEND_QUEUE_REMOTE_GLOBAL];
  });
  return Object.freeze({changed(){revision++;},instance});
}
