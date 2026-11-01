// OD-TASK-SHOP v0.1: real SDK-only adapter. No chat, Native bypass or timer-triggered start.
(function(global){
  'use strict';
  const tool=global.OpenDeskTool,M=global.OpenDeskTaskShopCore;
  const root=tool?.root?.querySelector('#taskshop-app');
  if(!root||!M||typeof tool.request!=='function'){
    if(root)root.textContent='Task Shop 所需的公开 SDK / 业务合同不可用。';
    return;
  }
  const fields=Object.fromEntries([...root.querySelectorAll('[data-field]')].map(el=>[el.dataset.field,el]));
  const actions=Object.fromEntries([...root.querySelectorAll('[data-action]')].map(el=>[el.dataset.action,el]));
  const request=tool.request.bind(tool),now=()=>Date.now();
  const uid=()=>global.crypto.randomUUID();
  const notify=(value)=>{fields.message.textContent=String(value||'');};
  const error=(e)=>{const c=String(e?.code||'E_OPERATION');fields.error.hidden=false;
    fields.error.textContent=c+'：'+String(e?.message||'请核对后重试').slice(0,160);};
  const clearError=()=>{fields.error.hidden=true;fields.error.textContent='';};
  const put=(name,value)=>{fields[name].textContent=String(value??'—');};
  let state=null,busy=false,alive=true,checking='核查中',site='核查中';
  let binding=null,sessionRequestId=null,pollTimer=null,pollAttempts=0;
  const stageLabels={LEASED:'已领取',DISPATCH_PREPARED:'待确认执行',RUNNING:'运行中',
    STOP_REQUESTED:'停止待确认',UNKNOWN:'结果未知',REVIEW_PENDING:'待业务验收',
    NEEDS_ATTENTION:'需要人工处理',CANCELLED:'已放弃',ACCEPTED:'验收通过（模拟）',
    REJECTED:'模拟验收未通过',DEMO_SETTLED:'已模拟结算'};
  const explain={LEASED:'租约已登记。请核验当前网页与固定脚本，准备原执行请求。',
    DISPATCH_PREPARED:'执行请求已先持久记录；仅在当前未关闭的准备会话可点击确认。重开后不能自动重启。',
    RUNNING:'已发起原 Controller 请求；正在读取原持久结果，不等于业务成功。',
    STOP_REQUESTED:'已请求停止；停止回执不保证网页副作用已撤销。',
    UNKNOWN:'可能已经执行。只能在原 iframe 内查询旧请求，绝不再次启动。',
    REVIEW_PENDING:'已读到匹配的 Run/Result 和模拟业务证据；仍需独立点击验收。',
    NEEDS_ATTENTION:'终态、结果或租约存在不确定性，不能自动重派或付款。',
    CANCELLED:'此单已放弃，测试编号不会自动重新领取。',
    ACCEPTED:'本机测试规则已单独验收；没有真实发布方签收。',
    REJECTED:'测试规则模拟拒绝；不存在真实资金结算。',
    DEMO_SETTLED:'仅登记虚拟积分，没有资金流转。'};
  function render(){
    const j=M.JOB,c=state?.claim;
    put('title',j.title);put('description',j.description);put('publisher',j.publisher);
    put('reward',j.reward.gross+' 虚拟积分');put('fee',j.reward.fee+' / '+j.reward.net+' 虚拟积分');
    put('origin',j.origin);put('query',j.args.query);put('criteria',j.requiredOutput);
    put('script',j.requiredScriptPin.taskId+' @ '+j.requiredScriptPin.version);
    put('state',!state?'未发布':!c?'可领取':stageLabels[c.state]||c.state);
    put('explanation',!state?'正在创建本机持久测试工单…':
      !c?'测试任务已在本机数据区发布。只能领取一次。':
      explain[c.state]+(c.expiresAt<=now()?' · 租约已超时，不得再执行或验收。':''));
    put('installed',checking);put('site',site);
    put('expires',c?new Date(c.expiresAt).toLocaleString('zh-CN'):'未领取');
    put('claimId',c?c.claimId+' / '+c.leaseId:'尚无');
    put('requestId',c?.clientRequestId||'尚无');
    put('runId',c?.runId||'尚未取得');
    put('resultId',c?.resultId||'尚未取得');
    put('receipt',c?.receipt?(c.receipt.persisted?'持久结果匹配':'持久结果未确认')+
      ' · outcome '+(c.receipt.runtimeOk?'正常':'未核验')+
      ' · '+c.receipt.outputCount+' 条':'未观察');
    put('review',c?.review?(c.review.decision==='accepted'?'测试规则通过':'测试规则拒绝')+
      ' / '+c.review.acceptanceId:'未验收');
    put('settlement',c?.settlement?'已模拟记账 '+c.settlement.netPoints+' 虚拟积分，无真实付款':'仅演示，无实际支付');
    const permitted=Boolean(c&&now()<c.expiresAt);
    const hasSession=Boolean(c?.clientRequestId&&sessionRequestId===c.clientRequestId);
    const show={claim:state&&!c,prepare:c?.state==='LEASED'&&permitted,
      execute:c?.state==='DISPATCH_PREPARED'&&permitted&&
        binding&&hasSession&&M.pinMatches(M.PIN,binding),
      read:hasSession&&['DISPATCH_PREPARED','RUNNING','STOP_REQUESTED','UNKNOWN'].includes(c?.state),
      stop:hasSession&&['DISPATCH_PREPARED','RUNNING','STOP_REQUESTED','UNKNOWN'].includes(c?.state),
      cancel:c?.state==='LEASED',accept:c?.state==='REVIEW_PENDING'&&permitted,
      reject:c?.state==='REVIEW_PENDING'&&permitted,settle:c?.state==='ACCEPTED',
      refresh:true};
    for(const [key,button] of Object.entries(actions)){
      button.hidden=!show[key];button.disabled=busy&&!['refresh'].includes(key);
      if(key==='refresh')button.disabled=busy;
    }
    if(c&&['DISPATCH_PREPARED','RUNNING','STOP_REQUESTED','UNKNOWN'].includes(c.state)&&!hasSession)
      notify('本次已脱离原执行 iframe；无法安全跨重开查询或重发。请在可信原执行记录中人工核对。');
  }
  async function load(){
    const r=await request('storage.get',{key:M.KEY,withEtag:true});
    state=M.validate(r?.value);render();return state;
  }
  // The original storage service verifies ifMatch under a per-tool Web Lock.
  async function transact(action){
    const r=await request('storage.get',{key:M.KEY,withEtag:true});
    const before=M.validate(r?.value);
    if(typeof r?.etag!=='string'||!/^[a-f0-9]{64}$/.test(r.etag))
      throw Object.assign(Error('缺少可靠的条件写入版本'),{code:'E_STORAGE_CONFLICT'});
    const next=M.reduce(before,{...action,now:now()});
    if(next===before){state=next;render();return next;}
    await request('storage.set',{key:M.KEY,value:next,ifMatch:r.etag});
    const check=await request('storage.get',{key:M.KEY});
    if(JSON.stringify(check?.value)!==JSON.stringify(next))
      throw Object.assign(Error('写入结果无法确认；请刷新并核对，不能盲目重试'),{code:'E_OUTCOME_UNKNOWN'});
    state=next;render();return next;
  }
  async function inspect(){
    try{
      const [installed,page]=await Promise.allSettled([
        request('tasks.read',{taskId:M.PIN.taskId}),
        request('currentPage.info',{})]);
      checking=installed.status==='fulfilled'&&M.pinMatches(M.PIN,installed.value?.task)
        ?'固定版本匹配':'未安装、停用或版本不匹配';
      site=page.status==='fulfilled'&&page.value?.status==='available'&&
        M.sameOrigin(page.value.url)?'目标站点匹配':'请打开 '+M.JOB.origin;
    }catch{checking='暂无法核验';site='暂无法核验';}
    render();
  }
  async function runUi(fn){
    if(busy)return;
    busy=true;clearError();render();
    try{await fn();await load();}
    catch(e){error(e);try{await load();}catch{notify('本地状态读取异常，请检查宿主存储。');}}
    finally{busy=false;render();}
  }
  async function publish(){
    try{await transact({type:'PUBLISH'});}
    catch(e){error(e);await load().catch(()=>{});}
  }
  async function claim(){
    await transact({type:'CLAIM',claimRequestKey:'claim-'+uid(),
      claimId:'claim-'+uid(),leaseId:'lease-'+uid()});
    notify('领取已写入本机持久记录；单节点、非远程市场租约。');
  }
  async function prepare(){
    const c=state?.claim;
    if(!c)return;
    const [pin,page]=await Promise.all([
      request('tasks.read',{taskId:M.PIN.taskId}),request('currentPage.info',{})]);
    const installed=pin?.task;
    if(!M.pinMatches(M.PIN,installed))
      throw Object.assign(Error('实际安装身份与审阅的固定 Task 不一致'),{code:'E_REVISION'});
    if(page?.status!=='available'||!M.sameOrigin(page.url))
      throw Object.assign(Error('必须先打开已审阅的百度目标网页'),{code:'E_SITE_SCOPE'});
    const id='taskshop:'+uid();
    await transact({type:'PREPARE',leaseId:c.leaseId,clientRequestId:id,
      installedPin:installed,currentUrl:page.url});
    // Never restore this in-memory authority across iframe reloads.
    binding=installed;sessionRequestId=id;pollAttempts=0;render();
    notify('准备记录已核实持久化。请确认后点击执行；原 Host 还会再次校验权限、站点与脚本身份。');
  }
  function execute(){
    const c=state?.claim;
    if(busy||!c||c.state!=='DISPATCH_PREPARED'||c.expiresAt<=now()||
       c.clientRequestId!==sessionRequestId||!M.pinMatches(M.PIN,binding))return;
    busy=true;clearError();render();
    notify('正在提交原 Controller 请求；提交失败或超时也不能再点击执行。');
    // Important: no await before tasks.start; Host requires genuine user activation.
    let promise;
    try{promise=request('tasks.start',{clientRequestId:c.clientRequestId,
      task:binding,params:{...M.JOB.args}});}
    catch(e){promise=Promise.reject(e);}
    Promise.resolve(promise).then(s=>{if(alive)return observe(s);})
      .catch(async e=>{
        if(!alive)return;
        error(e);
        try{await transact({type:'MARK_UNKNOWN',leaseId:c.leaseId});}
        catch(x){error(x);}
        notify('原提交结果未知：仅可使用同一请求查询，禁止重新发起。');
      }).finally(()=>{busy=false;if(alive)render();});
  }
  async function observe(snapshot){
    if(!alive)return;
    const c=state?.claim;
    if(!c||c.clientRequestId!==sessionRequestId)return;
    const next=await transact({type:'OBSERVE',leaseId:c.leaseId,
      clientRequestId:c.clientRequestId,snapshot});
    const stage=next.claim?.state;
    if(stage==='RUNNING'||stage==='STOP_REQUESTED'){
      if(pollAttempts++<36){
        clearTimeout(pollTimer);
        pollTimer=setTimeout(()=>{void readOriginal();},1500);
      }else notify('仍未获得可信终态；只能手动查询同一请求，不能重新启动。');
    }else if(stage==='REVIEW_PENDING')notify('原持久结果已核验，现可单独执行测试业务验收。');
    else if(stage==='UNKNOWN')notify('执行结果 UNKNOWN。不要重新领取或执行。');
  }
  async function readOriginal(){
    const c=state?.claim;
    if(!alive||!c?.clientRequestId||c.clientRequestId!==sessionRequestId)return;
    try{
      const snapshot=await request('tasks.read',{clientRequestId:c.clientRequestId});
      await observe(snapshot);
    }catch(e){error(e);try{await transact({type:'MARK_UNKNOWN',leaseId:c.leaseId});}catch(x){error(x);}}
  }
  async function stop(){
    const c=state?.claim;
    if(!c||c.clientRequestId!==sessionRequestId)return;
    clearTimeout(pollTimer);
    await transact({type:'STOP_REQUEST',leaseId:c.leaseId});
    try{
      await request('tasks.stop',{clientRequestId:c.clientRequestId});
      notify('停止请求已发出；请查询原持久结果，不把 Stop 回执当成副作用已回滚。');
    }catch(e){error(e);await transact({type:'MARK_UNKNOWN',leaseId:c.leaseId});}
  }
  const doReview=(decision)=>transact({type:decision,leaseId:state.claim.leaseId,
    acceptanceId:'review-'+uid()});
  const route={
    refresh:()=>runUi(async()=>{await load();await inspect();}),
    claim:()=>runUi(claim),prepare:()=>runUi(prepare),execute,
    read:()=>{void runUi(readOriginal);},stop:()=>runUi(stop),
    cancel:()=>runUi(()=>transact({type:'CANCEL',leaseId:state.claim.leaseId})),
    accept:()=>runUi(()=>doReview('ACCEPT')),reject:()=>runUi(()=>doReview('REJECT')),
    settle:()=>runUi(()=>transact({type:'DEMO_SETTLE',leaseId:state.claim.leaseId,
      settlementId:'demo-'+uid()}))
  };
  Object.entries(actions).forEach(([key,button])=>button.addEventListener('click',()=>route[key]()));
  void publish().then(()=>inspect());
  global.addEventListener('pagehide',()=>{alive=false;clearTimeout(pollTimer);},{once:true});
})(globalThis);
