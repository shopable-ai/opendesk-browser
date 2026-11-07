// PREVIEW ONLY: synthetic site facts; the real Page engine/remote own all queue state.
export function createPreviewModel({createQueueEngine,createSendQueueRemote,changed=()=>{}}){
  let now=0,busy=true,draft='',users=[],assistants=[],history=[],complete=false,remote;
  const route='/c/preview-simulated-conversation';
  const site={normal:text=>text.trim(),inspect:()=>({ok:true,route,busy,idle:!busy,
    draft,rich:false,composing:false,answerComplete:complete,
    users:[...users],assistants:[...assistants],history:[...history],stopButton:busy}),
    prepare(text,before){draft=text;return {ok:true,token:{text,before}};},
    commit(token){users.push(token.text);history.push('user:'+token.text);draft='';busy=true;complete=false;
      return {ok:true,before:token.before};},
    confirm:(before,text,snap)=>snap.users.length===before.users.length+1&&snap.users.at(-1)===text,
    replyComplete:(before,user,snap)=>snap.users.at(-1)===user&&snap.assistants.length>before.assistants.length&&snap.answerComplete,
    stop(){busy=false;complete=true;assistants.push('模拟：回复已停止');history.push('assistant:stopped');return true;}
  };
  const engine=createQueueEngine({site,clock:()=>now,change(){remote?.changed();changed();}});
  const actions={edit(id){
    const item=engine.view().items.find(row=>row.id===id);
    if(draft.length||!item||!engine.reclaim(id))return false;
    draft=item.text;changed();return true;
  },sendNow(id){const result=engine.requestNow(id);if(result.ok)pump();return result.ok;}};
  const world={};
  remote=createSendQueueRemote({owner:{active:()=>true,onDispose(){}},site,engine,actions,
    world,randomId:()=> 'preview-'+crypto.randomUUID()});
  function pump(){for(let i=0;i<5;i++){now+=1200;engine.tick();}changed();}
  function command(operation,id,index){
    const snapshot=world.__opendeskAiSendQueueV1({operation:'snapshot'});
    return world.__opendeskAiSendQueueV1({operation,id,index,instance:snapshot.instance,revision:snapshot.revision});
  }
  function enqueue(text=draft){
    if(!engine.enqueue(text,route))return false;
    if(text===draft)draft='';changed();return true;
  }
  return Object.freeze({engine,site,command,pump,
    snapshot:()=>world.__opendeskAiSendQueueV1({operation:'snapshot'}),
    request:async(method,payload={})=>{
      if(method==='sendQueue.snapshot')return world.__opendeskAiSendQueueV1({operation:'snapshot'});
      if(method==='sendQueue.command')return world.__opendeskAiSendQueueV1({...payload,operation:payload.command});
      throw Error('PREVIEW_UNSUPPORTED_REQUEST');
    },enqueue,setDraft(text){draft=text;changed();},getDraft:()=>draft,
    finish(){busy=false;complete=true;assistants.push('模拟回复完成');history.push('assistant:complete');pump();},
    stop(){site.stop();changed();},
    unknown(){const item=engine.view().items.find(row=>row.state==='queued');
      if(!item||engine.view().inFlight)return false;
      return engine.uncertain(item.id,'模拟 unknown：未确认发送，禁止自动重试',site.inspect());},
    sample(){for(const text of ['模拟：检查双端队列同步','模拟：暂停并恢复这一条','模拟：编辑、排序与删除消息'])enqueue(text);}
  });
}
