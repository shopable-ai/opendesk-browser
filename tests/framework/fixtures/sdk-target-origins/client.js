// Consumer ONLY: this file does not install SDK globals, bypass the tool, or call
// internal authority APIs. Native fetch is only for same-origin fixture telemetry.
const base=location.pathname.replace(/\/$/,'');
const output=document.querySelector('#result'), observations=document.querySelector('#observations');
let fixture, busy=false;
const errorValue=error=>({code:error?.code,message:String(error?.message??error),fault:error?.fault});
async function counts(){
  const response=await fetch(`${base}/counts`,{credentials:'omit',cache:'no-store'});
  if(!response.ok)throw new Error(`Observation HTTP ${response.status}`);
  fixture=await response.json();observations.textContent=JSON.stringify(fixture,null,2);
  document.querySelector('#scope').textContent=JSON.stringify({A:fixture.origins.A,approveB:fixture.origins.B,doNotApproveC:fixture.origins.C,runId:fixture.runId},null,2);
  return fixture;
}
async function probe(role,path='/probe'){
  const sdk=globalThis.OpenDeskSDK;
  if(!sdk || typeof sdk.axiosx?.get!=='function')throw new Error('SDK 未安装：请从现有工具窗口批准精确文档与 B');
  // ready can be a cached Hello; it is NOT proof the current grant remains valid.
  // Each real invocation still passes through the production broker/authority.
  await sdk.ready();
  const caseId=`${role}-${crypto.randomUUID()}`;
  return {caseId,response:await sdk.axiosx.get(`${fixture.origins[role]}${base}${path}?case=${caseId}`,{responseType:'json',timeout:15000,withCredentials:false})};
}
async function run(operation){
  if(busy)return;busy=true;output.textContent='调用中（不自动重试）…';
  try{await counts();output.textContent=JSON.stringify(await operation(),null,2);}
  catch(error){output.textContent=JSON.stringify({error:errorValue(error),delivery:'rejected or unknown; verify service observations'},null,2);}
  finally{busy=false;try{await counts();}catch(error){observations.textContent=JSON.stringify(errorValue(error));}}
}
for(const button of document.querySelectorAll('[data-probe]'))button.addEventListener('click',()=>run(()=>probe(button.dataset.probe)));
document.querySelector('#parallel').addEventListener('click',()=>run(()=>Promise.allSettled([probe('B'),probe('B')])));
document.querySelector('#hold').addEventListener('click',()=>run(()=>probe('B','/hold')));
document.querySelector('#release').addEventListener('click',async()=>{
  try{const response=await fetch(`${base}/release`,{method:'POST',credentials:'omit'});if(!response.ok)throw new Error(`Release HTTP ${response.status}`);await counts();}
  catch(error){observations.textContent=JSON.stringify(errorValue(error));}
});
document.querySelector('#counts').addEventListener('click',()=>counts().catch(error=>{observations.textContent=JSON.stringify(errorValue(error));}));
counts().catch(error=>{observations.textContent=JSON.stringify(errorValue(error));});
