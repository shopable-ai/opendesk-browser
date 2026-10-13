// Minimize model planning input without changing locally executable workflow values.
// This module does not store grants or create a separate model-authorization layer.
export function workflowForModel(workflow){
  const data=structuredClone(workflow);
  for(const rule of Object.values(data.paramsSchema?.properties||{}))
    if(rule&&typeof rule==='object')delete rule.default;
  for(const step of data.steps||[]){
    if(step.op==='fill'&&Object.hasOwn(step,'text'))step.text='[原填写值未发送，请使用运行参数]';
    if(step.op==='navigate'&&typeof step.url==='string'){
      try{const url=new URL(step.url);step.url=url.origin+url.pathname;}catch{}
    }
  }
  return data;
}

const MASKED_FILL_TEXT='[原填写值未发送，请使用运行参数]';
const redactionError=()=>Object.assign(
  new Error('AI 提议包含无法对应原工作流的隐藏填写值，请检查步骤并重新生成'),
  {code:'E_AI_REDACTION'});

// Preserve unchanged local values without ever sending those values to the model.
// A forged/new step cannot use the placeholder to obtain an unrelated local value.
export function restoreModelRedactions(proposal,original){
  const next=structuredClone(proposal),priorById=new Map(
    (original.steps||[]).map(step=>[step.stepId,step]));
  const sharedById=new Map(workflowForModel(original).steps.map(step=>[step.stepId,step]));
  for(const step of next.steps||[]){
    const prior=priorById.get(step.stepId),sent=sharedById.get(step.stepId);
    if(step.op==='fill'&&step.text===MASKED_FILL_TEXT){
      if(!prior||prior.op!=='fill'||!Object.hasOwn(prior,'text')||!sent||
        step.locatorKind!==prior.locatorKind||step.selector!==prior.selector||
        (step.roleName||'')!==(prior.roleName||'')||Object.hasOwn(step,'param'))
        throw redactionError();
      step.text=prior.text;
    }
    if(step.op==='navigate'&&prior?.op==='navigate'&&sent?.op==='navigate'&&
      step.url===sent.url && sent.url!==prior.url)step.url=prior.url;
  }
  return next;
}
