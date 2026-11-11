// Fixed-entry metadata shared with Content. No Task packages or execution code.
const entries=Object.freeze({
  'baidu.search.top3':'https://www.baidu.com/',
  'google.search.top3':'https://www.google.com/',
  'chatgpt.conversation.create':'https://chatgpt.com/'
});

export function webFlowV2ReviewedEntry(taskId){
  if(typeof taskId!=='string'||!Object.hasOwn(entries,taskId))
    throw Object.assign(new Error('该任务没有已审核的 V2 固定入口'),{code:'E_WEBFLOW_TARGET_UNBOUND'});
  return entries[taskId];
}

// Only reviewed defaults may be applied before single-candidate admission.
// Legacy 0.1/0.2 ChatGPT candidates preserve safe send:false default.
// New two-phase candidates can ONLY enter through PREPARE; SUBMIT is exclusively
// an independently approved trusted continuation, never a page-supplied V2.
// The installed manifest and exact release pin are checked separately.
export function webFlowV2ReviewedArgs(intent){
  const chatgpt=intent?.taskId==='chatgpt.conversation.create';
  const args=intent?.args;
  if(chatgpt&&args&&Object.hasOwn(args,'phase')){
    if(args.phase!=='prepare'||Object.hasOwn(args,'send'))
      throw Object.assign(new Error('两阶段 ChatGPT V2 只能请求 PREPARE；SUBMIT 必须从可信原 B 批准接续'),
        {code:'E_WEBFLOW_V2_SCHEMA'});
    return Object.freeze({...args});
  }
  const defaults=chatgpt?{send:false}:{};
  return Object.freeze({...defaults,...args});
}
