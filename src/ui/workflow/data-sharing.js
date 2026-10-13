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
