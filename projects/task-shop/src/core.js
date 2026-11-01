// OD-TASK-SHOP: single-installation demo market. No remote authority, payment or runner.
(function(global){
  'use strict';
  const PIN=Object.freeze({taskId:'baidu.search.top3',version:'1.1.1',
    manifestHash:'adf0cc21e1aa498b169846256f92cf65da42f3c9d27011b29205e164f26bea4b',
    contentHash:'28d1d508a5fd8e04eb7dfbffb6ca36c6a545bb66feaa772b74a971a6e0bbb5e8'});
  const JOB=Object.freeze({
    marketJobId:'demo.public-product-search.001',revision:1,
    taskTypeId:'public-product-research.readonly.v1',title:'公开商品资料检索（测试任务）',
    description:'在百度检索公开的商品参数信息，整理最多三条自然搜索结果。只读演示，不访问账号或发送消息。',
    publisher:'Task Shop 本地测试发布者',origin:'https://www.baidu.com',
    args:Object.freeze({query:'自行车头盔 产品参数 说明书',limit:3}),
    requiredScriptPin:PIN,requiredOutput:'原持久 Controller 结果：success 且有 1–3 条检索结果',
    reward:Object.freeze({gross:20,fee:2,net:18,unit:'DEMO_POINTS'})
  });
  const KEY='taskshop.demo.v1',SCHEMA='taskshop.local-market.v1',LEASE_MS=15*60*1000;
  const pinFields=['taskId','version','manifestHash','contentHash'];
  const pinMatches=(a,b)=>pinFields.every(key=>a&&b&&a[key]===b[key]);
  const codeError=code=>Object.assign(new Error(code),{code});
  const ensure=(ok,code)=>{if(!ok)throw codeError(code);};
  const live=new Set(['LEASED','DISPATCH_PREPARED','RUNNING','STOP_REQUESTED','UNKNOWN']);
  const stages=new Set([...live,'REVIEW_PENDING','NEEDS_ATTENTION','CANCELLED','ACCEPTED','REJECTED','DEMO_SETTLED']);
  function validate(value){
    if(value===null||value===undefined)return null;
    ensure(value&&typeof value==='object'&&!Array.isArray(value)&&
      value.schema===SCHEMA&&value.marketJobId===JOB.marketJobId&&
      value.revision===JOB.revision&&Number.isFinite(value.publishedAt),'E_MARKET_STATE');
    const c=value.claim;
    ensure(c===null||(c&&typeof c==='object'&&stages.has(c.state)&&
      typeof c.claimId==='string'&&typeof c.leaseId==='string'&&
      typeof c.claimRequestKey==='string'&&Number.isFinite(c.expiresAt)),'E_MARKET_STATE');
    return value;
  }
  function sameOrigin(url){
    try{return new URL(url).origin===JOB.origin;}catch{return false;}
  }
  function projectSnapshot(snapshot){
    const s=snapshot&&typeof snapshot==='object'?snapshot:{},result=s.result;
    const runId=typeof s.runId==='string'&&s.runId.length<=120?s.runId:null;
    const resultId=typeof s.resultId==='string'&&s.resultId.length<=120?s.resultId:null;
    const persisted=Boolean(runId&&resultId&&result&&result.tag==='controller-result'&&
      result.runId===runId&&result.resultId===resultId&&result.state==='completed');
    const runtimeOk=Boolean(persisted&&result.outcome&&result.outcome.ok===true&&s.state==='completed');
    const retired=s.retirementState==='released',data=s.value;
    const count=runtimeOk&&data&&data.status==='success'&&Array.isArray(data.results)
      ?data.results.length:0;
    const businessMatch=Boolean(runtimeOk&&retired&&count>=1&&count<=JOB.args.limit&&
      data.results.every(item=>item&&typeof item.title==='string'&&item.title.trim()));
    return {runtimeState:typeof s.state==='string'?s.state.slice(0,30):'unknown',
      runId,resultId,persisted,runtimeOk,retired,businessMatch,
      outputCount:count>=1&&count<=3?count:0};
  }
  const withClaim=(state,claim,now)=>({...state,claim,updatedAt:now});
  function reduce(value,action){
    const state=validate(value),now=action&&action.now;
    ensure(Number.isSafeInteger(now)&&now>=0,'E_MARKET_TIME');
    if(action.type==='PUBLISH'){
      return state||{schema:SCHEMA,marketJobId:JOB.marketJobId,
        revision:JOB.revision,publishedAt:now,updatedAt:now,claim:null};
    }
    ensure(state,'E_NOT_PUBLISHED');
    const c=state.claim;
    if(action.type==='CLAIM'){
      ensure(typeof action.claimRequestKey==='string'&&action.claimRequestKey.length>=8&&
        typeof action.claimId==='string'&&typeof action.leaseId==='string','E_CLAIM_ID');
      if(c){
        if(c.claimRequestKey===action.claimRequestKey)return state;
        throw codeError('E_ALREADY_CLAIMED'); // expired does not mean safe to reassign
      }
      return withClaim(state,{claimId:action.claimId,claimRequestKey:action.claimRequestKey,
        leaseId:action.leaseId,state:'LEASED',claimedAt:now,expiresAt:now+LEASE_MS,
        clientRequestId:null,runId:null,resultId:null,receipt:null,review:null,
        settlement:null,preparedPin:null},now);
    }
    ensure(c,'E_NOT_CLAIMED');
    ensure(c.leaseId===action.leaseId,'E_LEASE_FENCE');
    if(action.type==='CANCEL'){
      ensure(c.state==='LEASED','E_CANCEL_TOO_LATE');
      return withClaim(state,{...c,state:'CANCELLED'},now);
    }
    if(action.type==='PREPARE'){
      ensure(c.state==='LEASED','E_DISPATCH_LOCKED');
      ensure(now<c.expiresAt,'E_LEASE_EXPIRED');
      ensure(pinMatches(PIN,action.installedPin),'E_REVISION');
      ensure(sameOrigin(action.currentUrl),'E_SITE_SCOPE');
      ensure(typeof action.clientRequestId==='string'&&
        /^taskshop:[A-Za-z0-9-]{12,72}$/.test(action.clientRequestId),'E_REQUEST_ID');
      return withClaim(state,{...c,state:'DISPATCH_PREPARED',
        preparedAt:now,clientRequestId:action.clientRequestId,
        preparedPin:{...PIN,installationId:action.installedPin.installationId??null,
          generation:action.installedPin.generation??null}},now);
    }
    if(action.type==='STOP_REQUEST'){
      ensure(live.has(c.state)&&c.state!=='LEASED','E_STOP_UNAVAILABLE');
      if(c.state==='STOP_REQUESTED')return state;
      return withClaim(state,{...c,state:'STOP_REQUESTED',stopRequestedAt:now},now);
    }
    if(action.type==='MARK_UNKNOWN'){
      ensure(live.has(c.state)&&c.state!=='LEASED','E_RECONCILE_ONLY');
      if(c.state==='UNKNOWN')return state;
      return withClaim(state,{...c,state:'UNKNOWN',unknownAt:now},now);
    }
    if(action.type==='OBSERVE'){
      ensure(live.has(c.state)&&c.state!=='LEASED','E_RECONCILE_ONLY');
      ensure(action.clientRequestId===c.clientRequestId,'E_REQUEST_CONFLICT');
      const receipt=projectSnapshot(action.snapshot);
      const complete=receipt.persisted&&receipt.runtimeOk&&receipt.retired;
      let nextState;
      if(complete&&receipt.businessMatch&&now<c.expiresAt)nextState='REVIEW_PENDING';
      else if(['failed','cancelled','canceled','stopped'].includes(receipt.runtimeState))
        nextState='NEEDS_ATTENTION';
      else if(receipt.runtimeState==='completed')nextState='NEEDS_ATTENTION';
      else if(receipt.runtimeState==='unknown')nextState='UNKNOWN';
      else if(now>=c.expiresAt)nextState='NEEDS_ATTENTION';
      else if(c.state==='STOP_REQUESTED')nextState='STOP_REQUESTED';
      else nextState='RUNNING';
      const next={...c,state:nextState,runId:receipt.runId||c.runId,
        resultId:receipt.resultId||c.resultId,receipt};
      if(JSON.stringify(next)===JSON.stringify(c))return state;
      return withClaim(state,next,now);
    }
    if(action.type==='ACCEPT'||action.type==='REJECT'){
      ensure(c.state==='REVIEW_PENDING','E_NOT_REVIEWABLE');
      ensure(now<c.expiresAt,'E_LEASE_EXPIRED');
      ensure(c.receipt?.persisted&&c.receipt?.runtimeOk&&c.receipt?.retired&&
        c.receipt?.businessMatch&&c.runId&&c.resultId,'E_EVIDENCE_INSUFFICIENT');
      return withClaim(state,{...c,state:action.type==='ACCEPT'?'ACCEPTED':'REJECTED',
        review:{acceptanceId:action.acceptanceId,decision:action.type==='ACCEPT'?'accepted':'rejected',
          kind:'LOCAL_DEMO_RULE_REVIEW',at:now}},now);
    }
    if(action.type==='DEMO_SETTLE'){
      ensure(c.state==='ACCEPTED'&&c.review?.decision==='accepted','E_NOT_ACCEPTED');
      return withClaim(state,{...c,state:'DEMO_SETTLED',
        settlement:{kind:'SIMULATED_ONLY',settlementId:action.settlementId,
          netPoints:JOB.reward.net,at:now}},now);
    }
    throw codeError('E_MARKET_ACTION');
  }
  global.OpenDeskTaskShopCore=Object.freeze({
    KEY,JOB,PIN,SCHEMA,LEASE_MS,pinMatches,sameOrigin,projectSnapshot,validate,reduce
  });
})(globalThis);
