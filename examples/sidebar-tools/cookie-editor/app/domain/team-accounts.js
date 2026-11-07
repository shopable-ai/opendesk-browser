// Product orchestration only. The injected account consumer is the original
// trusted Cookie Account service; this module never sees Cookie snapshots/keys.
const fail=code=>Object.assign(Error(code),{code});
const clone=value=>structuredClone(value);
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const same=(a,b)=>canonical(a)===canonical(b);
const assert=(ok,code)=>{if(!ok)throw fail(code);};
const uuid=()=>crypto.randomUUID();

export function createCookieTeamAccounts({wire,account,scope,journal,clock=Date.now}){
  let busy=false,review=null;
  const exclusive=async work=>{
    assert(!busy,'E_TEAM_BUSY');busy=true;
    try{return await work();}finally{busy=false;}
  };
  async function read(){
    const value=await journal.read()??{format:1,records:[]};
    assert(value.format===1&&Array.isArray(value.records)&&value.records.length<=32,'E_TEAM_JOURNAL');
    return clone(value);
  }
  async function save(state){
    try{await journal.write(clone(state));assert(same(await journal.read(),state),'E_TEAM_UNKNOWN');}
    catch{throw fail('E_TEAM_UNKNOWN');}
  }
  const viewRow=row=>({accountId:row.accountId,version:row.version,assignmentRevision:row.assignmentRevision,phase:row.phase,pending:Boolean(row.pending),
    operationId:row.pending?.operationId??row.operationId??null,
    alias:row.alias??null,pair:row.pair??null,receipt:row.receipt??null});
  async function listing(){
    const result=await wire('GET','/opendesk/v1/team-accounts');
    assert(Array.isArray(result.accounts)&&result.accounts.length<=64&&result.member,'E_TEAM_RESPONSE');
    const state=await read();
    const owned=state.records.filter(row=>same(row.member,result.member));
    return {...result,local:owned.map(viewRow),pending:owned.some(row=>Boolean(row.pending)),
      evidence:'TRUSTED_CONSUMER_REQUIRED'};
  }
  async function selected(accountId,{paired=false}={}){
    const list=await listing(),item=list.accounts.find(row=>row.accountId===accountId);
    assert(item&&item.state==='AVAILABLE','E_TEAM_UNAVAILABLE');
    assert(item.expiresAt>clock(),'E_TEAM_EXPIRED');
    const state=await read();
    assert(!state.records.some(row=>row.pending),'E_TEAM_UNKNOWN');
    const candidates=state.records.filter(row=>row.accountId===accountId&&row.version===item.version&&same(row.member,list.member));
    let row=candidates.findLast(row=>row.assignmentRevision===item.assignmentRevision);
    // Delivery adds the sender fingerprint to the paired assignment. Only an
    // unconsumed pair may follow that update, after claim checks its invitation.
    if(!row&&paired)row=candidates.findLast(row=>row.phase==='PAIRED');
    if(!row){
      assert(state.records.length<32,'E_TEAM_LIMIT');
      row={accountId,version:item.version,assignmentRevision:item.assignmentRevision,member:clone(list.member),phase:'AVAILABLE'};
      state.records.push(row);
    }
    return {item,member:list.member,state,row};
  }
  const bodyFor=({item,member},operationId)=>({operationId,accountVersion:item.version,
    assignmentRevision:item.assignmentRevision,authEpoch:member.authEpoch});
  async function remoteMutation(ctx,kind,extra={}){
    const operationId=uuid(),body={...bodyFor(ctx,operationId),...extra};
    ctx.row.pending={operationId,kind,body};await save(ctx.state);
    let result;
    try{result=await wire('POST','/opendesk/v1/team-accounts/'+ctx.item.accountId+'/'+kind,body);}
    catch(error){
      // Only a validated protocol denial proves a rejected intent. Generic
      // HTTP/network errors never provide this proof.
      if(error?.teamRejected===true){
        ctx.row.pending=null;await save(ctx.state);throw fail('E_TEAM_UNAVAILABLE');
      }
      // Even a lost HTTP error can follow a commit. Only original GET receipts
      // can resolve this durable fence; a new operation ID is never a retry.
      throw fail('E_TEAM_UNKNOWN');
    }
    const receipt=result?.result??result;
    assert(result?.operationId===operationId&&receipt?.operationId===operationId&&
      receipt.status===(kind==='claim'?'CLAIMED':'AUTHORIZED')&&receipt.accountVersion===ctx.item.version&&
      receipt.assignmentRevision===ctx.item.assignmentRevision&&same(receipt.member,ctx.member),'E_TEAM_UNKNOWN');
    if(kind==='claim')assert(typeof receipt.inviteUrl==='string'&&/^https:\/\/[^/]+\/i\/[A-Za-z0-9_-]{22,80}$/.test(receipt.inviteUrl),'E_TEAM_UNKNOWN');
    else assert(same(receipt.target,extra.target),'E_TEAM_UNKNOWN');
    ctx.row.operationId=operationId;ctx.row.pending=null;await save(ctx.state);
    return result;
  }
  async function claim(ctx){
    const result=await remoteMutation(ctx,'claim');
    const grant=result.result??result;
    assert(grant.accountVersion===ctx.item.version&&grant.assignmentRevision===ctx.item.assignmentRevision&&same(grant.member,ctx.member),'E_TEAM_RESPONSE');
    assert(typeof grant.inviteUrl==='string'&&grant.inviteUrl.startsWith('https://'),'E_TEAM_RESPONSE');
    if(ctx.row.invitationId&&ctx.row.invitationId!==new URL(grant.inviteUrl).pathname)
      throw fail('E_TEAM_ASSIGNMENT_CHANGED');
    // Only a non-secret invitation identifier is durable. The full invitation
    // stays in this call and is passed directly to the trusted share consumer.
    ctx.row.invitationId=new URL(grant.inviteUrl).pathname;
    await save(ctx.state);return grant;
  }
  async function trustedMutation(ctx,kind,work){
    ctx.row.pending={operationId:uuid(),kind};await save(ctx.state);
    let result;try{result=await work();}catch{throw fail('E_TEAM_UNKNOWN');}
    // Keep the fence until the caller durably saves the stage and receipt.
    return result;
  }
  const sameScope=async expected=>assert(same(await scope(),expected),'E_TEAM_TARGET_CHANGED');
  return {
    list:()=>exclusive(listing),
    pair:accountId=>exclusive(async()=>{
      review=null;const ctx=await selected(accountId),grant=await claim(ctx);
      const target=await scope();assert(target.origin===ctx.item.origin,'E_TEAM_TARGET_CHANGED');
      const result=await trustedMutation(ctx,'pair',()=>account('sharePair',{inviteUrl:grant.inviteUrl}));
      await sameScope(target);
      assert(result?.pair?.requestId&&result.pair.receiverFingerprint,'E_TEAM_RESPONSE');
      ctx.row.pair=result.pair;ctx.row.phase='PAIRED';ctx.row.pending=null;await save(ctx.state);return viewRow(ctx.row);
    }),
    receive:accountId=>exclusive(async()=>{
      review=null;const ctx=await selected(accountId,{paired:true}),grant=await claim(ctx);
      assert(ctx.row.phase==='PAIRED','E_TEAM_PAIR_REQUIRED');
      assert(/^[a-f0-9]{64}$/.test(grant.senderFingerprint??''),'E_TEAM_DELIVERY_REQUIRED');
      const target=await scope();assert(target.origin===ctx.item.origin,'E_TEAM_TARGET_CHANGED');
      const status=await account('status',{});
      const result=await trustedMutation(ctx,'receive',()=>account('shareClaim',{
        inviteUrl:grant.inviteUrl,senderFingerprint:grant.senderFingerprint,revision:status.revision}));
      await sameScope(target);
      assert(result?.sessionImported===true&&typeof result.alias==='string','E_TEAM_RESPONSE');
      ctx.row.alias=result.alias;ctx.row.assignmentRevision=ctx.item.assignmentRevision;ctx.row.phase='DOWNLOADED';ctx.row.pending=null;
      ctx.row.receipt={sessionImported:true,cookieWriteVerified:false,websiteLoginConfirmed:false};
      await save(ctx.state);return viewRow(ctx.row);
    }),
    review:accountId=>exclusive(async()=>{
      review=null;const ctx=await selected(accountId);
      assert(ctx.row.phase==='DOWNLOADED'||ctx.row.phase==='APPLIED','E_TEAM_DOWNLOAD_REQUIRED');
      const target=await scope();assert(target.origin===ctx.item.origin,'E_TEAM_TARGET_CHANGED');
      const status=await account('status',{}),local=status.accounts.find(row=>row.alias===ctx.row.alias&&row.origin===ctx.item.origin);
      assert(local&&local.cookieCount>0,'E_TEAM_LOCAL_ACCOUNT');
      review={accountId,version:ctx.item.version,assignmentRevision:ctx.item.assignmentRevision,
        member:ctx.member,target,alias:local.alias,accountVersion:local.version,revision:status.revision};
      return {accountId,version:ctx.item.version,origin:ctx.item.origin,displayName:ctx.item.displayName,
        localAlias:local.alias,scope:clone(target),websiteLoginConfirmed:false};
    }),
    use:accountId=>exclusive(async()=>{
      const approved=review;review=null;
      assert(approved?.accountId===accountId,'E_TEAM_REVIEW_REQUIRED');
      const ctx=await selected(accountId);
      assert(approved.version===ctx.item.version&&approved.assignmentRevision===ctx.item.assignmentRevision&&same(approved.member,ctx.member),'E_TEAM_ASSIGNMENT_CHANGED');
      await sameScope(approved.target);
      const status=await account('status',{}),local=status.accounts.find(row=>row.alias===approved.alias);
      assert(status.revision===approved.revision&&local?.version===approved.accountVersion,'E_TEAM_LOCAL_CHANGED');
      const authorized=await remoteMutation(ctx,'authorize-use',{target:approved.target});
      assert((authorized.result??authorized).status==='AUTHORIZED','E_TEAM_RESPONSE');
      await sameScope(approved.target);
      // Re-read the assignment after authorization. A server receipt alone is
      // never proof of local writes, and never refreshes a stale confirmation.
      const latest=await listing(),fresh=latest.accounts.find(row=>row.accountId===accountId);
      assert(fresh?.version===approved.version&&fresh.assignmentRevision===approved.assignmentRevision&&same(latest.member,approved.member),'E_TEAM_ASSIGNMENT_CHANGED');
      const receipt=await trustedMutation(ctx,'apply',()=>account('switch',{alias:approved.alias,revision:approved.revision}));
      await sameScope(approved.target);
      assert(receipt?.switched===true&&receipt?.verified===true&&receipt.loginVerified===false,'E_TEAM_UNKNOWN');
      ctx.row.phase='APPLIED';ctx.row.pending=null;ctx.row.receipt={switched:true,verified:true,verification:receipt.verification,
        changed:receipt.changed,snapshotState:receipt.snapshotState,websiteLoginConfirmed:false};
      await save(ctx.state);return viewRow(ctx.row);
    }),
    reconcile:operationId=>exclusive(async()=>{
      const state=await read(),row=state.records.find(row=>row.pending?.operationId===operationId);
      assert(row,'E_TEAM_OPERATION');
      if(!['claim','authorize-use'].includes(row.pending.kind))
        return {operationId,status:'UNKNOWN',message:'本地可信操作结果待核对；保留原记录，不重放或回滚。'};
      const result=await wire('GET','/opendesk/v1/team-operations/'+operationId);
      if(result?.status==='CONFIRMED'){
        row.operationId=operationId;row.pending=null;
        // Recovery never invokes a continuation or applies an old target.
        await save(state);
      }
      return {operationId,status:result?.status==='CONFIRMED'?'CONFIRMED':'UNKNOWN'};
    })
  };
}
