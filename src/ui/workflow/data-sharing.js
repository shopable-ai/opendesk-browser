// Scoped acknowledgement for user-selected AI models; never grants page access.
export const CONSENT_STORAGE_KEY='opendesk.workflow.model-consent.v1';
export const CONSENT_POLICY='2026-10-13.v1';
const MAX_AGE=180*24*60*60*1000;
export function modelDataScope({provider,endpoint='',model=''}) {
  if(provider==='local_codex')return JSON.stringify([CONSENT_POLICY,'local_codex']);
  if(provider!=='custom_https')return null;
  let url;try{url=new URL(endpoint);}catch{return null;}
  if(url.protocol!=='https:'||url.username||url.password||url.hash||!model.trim()||model.length>120)return null;
  return JSON.stringify([CONSENT_POLICY,'custom_https',url.origin+url.pathname,model.trim()]);
}
function current(rows,now) {
  if(!Array.isArray(rows))return [];
  return rows.filter(r=>r&&typeof r.scope==='string'&&r.scope.length<4096&&
    Number.isSafeInteger(r.at)&&r.at<=now+60000&&r.at>now-MAX_AGE).slice(-24);
}
export function createModelConsent({storage,clock=()=>Date.now()}={}) {
  let rows=[],mutation=0,write=Promise.resolve();
  function save(){
    const value=rows.map(r=>({...r}));
    write=write.catch(()=>{}).then(()=>storage?.set?.({[CONSENT_STORAGE_KEY]:value})).catch(()=>{});
  }
  return {
    async load(){const generation=mutation;
      try{const saved=(await storage?.get?.(CONSENT_STORAGE_KEY))?.[CONSENT_STORAGE_KEY];
        if(generation===mutation)rows=current(saved,clock());
      }catch{}},
    has(scope){return Boolean(scope&&current(rows,clock()).some(r=>r.scope===scope));},
    approve(scope){if(!scope)return false;mutation++;
      rows=[...current(rows,clock()).filter(r=>r.scope!==scope),{scope,at:clock()}].slice(-24);save();return true;},
    revoke(scope){if(!scope)return;mutation++;rows=current(rows,clock()).filter(r=>r.scope!==scope);save();}
  };
}
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
