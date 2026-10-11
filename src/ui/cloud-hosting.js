// Hosting shares the visible document's existing RunHost and Authority slot.
export function createCloudHosting({client,host,document:doc=globalThis.document}){
  const get=id=>doc.getElementById(id),cloud=client.cloud;let disposed=false,busy=false,starting=false,timer;
  const status=get('cloud-status');
  const fail=e=>{status.textContent=`${e.code||'E_CLOUD'}: ${e.message}`;};
  async function refresh(){
    const s=await cloud.cloudStatus({});if(disposed)return;
    status.textContent=JSON.stringify(s,null,2);
    get('cloud-pair').disabled=!!s.provider;get('cloud-approve').disabled=!s.provider||s.enabled;get('cloud-stop').disabled=!s.provider;get('cloud-unpair').disabled=!s.provider;
    if(!s.enabled||host.executionPending||starting||!s.online||!s.reconciled)return;
    const next=await cloud.cloudNext({});if(!next||disposed)return;
    starting=true;try{const request=await cloud.cloudResolve(next);await host.start(request);host.completion.catch(fail).finally(()=>{starting=false;});}catch(e){starting=false;throw e;}
  }
  async function action(fn){if(busy)return;busy=true;try{await fn();await refresh();}catch(e){fail(e);}finally{busy=false;}}
  const listeners=[];function click(id,fn){const handler=()=>void action(fn);get(id).addEventListener('click',handler);listeners.push([id,handler]);}
  click('cloud-pair',()=>cloud.cloudPair({url:get('cloud-url').value,providerId:get('cloud-provider-id').value.trim(),pairingCode:get('cloud-pairing-code').value.trim(),allowLoopback:get('cloud-loopback').checked}).then(()=>{get('cloud-pairing-code').value='';}));
  click('cloud-approve',async()=>{if(!get('cloud-consent').checked)throw Error('请先批准所选固定任务、网站范围和结果回传');const taskId=get('task-installed-list').value;if(!taskId)throw Error('请先安装并选择任务');return cloud.cloudApprove({tasks:[{taskId,resultAllowed:get('cloud-result-consent').checked}]});});
  click('cloud-stop',()=>cloud.cloudStop({}));click('cloud-unpair',()=>cloud.cloudUnpair({}));click('cloud-refresh',()=>refresh());
  async function poll(){if(disposed)return;try{if(!busy)await refresh();}catch(e){if(!disposed)fail(e);}finally{if(!disposed)timer=setTimeout(poll,2000);}}
  void poll();return {dispose(){disposed=true;clearTimeout(timer);for(const[id,fn]of listeners)get(id).removeEventListener('click',fn);}};
}
