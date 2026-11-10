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
// An omitted send is always false; no omitted or malformed field can
// authorize a send. The installed manifest is checked separately by the Host.
export function webFlowV2ReviewedArgs(intent){
  const defaults=intent?.taskId==='chatgpt.conversation.create'?{send:false}:{};
  return Object.freeze({...defaults,...intent.args});
}
