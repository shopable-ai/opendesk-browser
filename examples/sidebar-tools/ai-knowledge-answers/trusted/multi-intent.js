// R3.2 business-only router. No DOM, Host, Provider, authorization or auto-send.
// Runs only on an already verified, bounded knowledge snapshot.
export const MAX_CUSTOMER_INTENTS=4;
export const MAX_AI_INTENTS=2;
export const GREETING_REPLY='您好，请问有什么可以帮您？';
const trim=s=>String(s).normalize('NFKC').trim();
const comparable=s=>trim(s).toLowerCase().replace(/[\s，,。？?!！；;]+/gu,'');
const askPrefix=/^(?:请问|想咨询一下|我想了解一下|麻烦问一下|请教一下)[，,：:\s]*/u;
const greeting=/^(?:(?:你|您)好(?:呀|啊)?|hi|hello)(?=$|[\s，,。！!？?；;])/iu;
const ambiguousRefund=/退款|退货/u;
const refundDuration=/多久|多长时间|几天|多少天|什么时候/u;
const refundQualifier=/申请|期限|签收|审核|处理|到账|退回|退款到|生效|完成/u;
const realtime=/((?:我的|我这|这笔|该笔).{0,6}(?:订单|物流|退款)|订单号|物流单号|快递到哪|查(?:一下|询).{0,8}(?:订单|快递|物流|退款)|(?:订单|物流|退款).{0,6}(?:状态|进度|现在|到哪)|帮我(?:取消|退款|修改|下单|申请|查询)|替我(?:退款|取消|修改)|给我(?:退款|取消)|改(?:一下)?(?:收货)?地址|现在(?:发|退)了没有)/u;
const budget=parts=>parts.length<=MAX_CUSTOMER_INTENTS&&parts.every(x=>x.length>0&&x.length<=180);
// The original BM25 scorer can match generic "什么时候" to support hours,
// even when the customer is asking about shipping. Require a topical match
// in the STANDARD question or an explicit alias before disclosing any AI
// candidate. This is a conservative candidate gate, not semantic proof.
function topicTerms(question){
  const topic=question.replace(/什么时候|多长时间|何时|多久|几天|多少天|多少|如何|怎么|什么|请问|需要|可以|是否|能否|能够|支持|有没有|能不能|吗|呢|呀|啊/gu,'');
  const terms=new Set();
  for(const match of topic.matchAll(/[\p{Script=Han}]{2,}/gu)){
    const word=match[0];
    for(let i=0;i<word.length-1;i++)terms.add(word.slice(i,i+2));
  }
  return [...terms];
}
function sourceCandidates(library,question,scope,found){
  if(found.status==='ANSWERED_FIXED'||found.status==='AMBIGUOUS')return found;
  const terms=topicTerms(question);if(!terms.length)return {...found,status:'NO_MATCH',sourceIds:[]};
  // The original Shared AI consumer independently calls model.lookup().
  // Candidate IDs here must be a SUBSET of that same lookup. Expanding to a
  // new ID would send a different reference set to the Provider and could
  // make a generated answer fail source validation after disclosure.
  const allowed=new Set(found.sourceIds);
  const scored=library.items.filter(x=>x.enabled&&x.scope===scope&&allowed.has(x.id)).map(x=>{
    const head=[x.question,...x.aliases].join(' ');
    const hits=terms.filter(t=>head.includes(t)).length;
    const timeQuestion=/何时|什么时候|多久|几天|多少天|几点|多长时间/u.test(question);
    const evidenceTime=/何时|什么时候|多久|几天|多少天|小时|工作日|天内|日内|时长|周期|时效/u.test(head+' '+x.answer);
    return {id:x.id,hits:timeQuestion&&!evidenceTime?0:hits,
      prior:found.sourceIds.indexOf(x.id)};
  }).filter(x=>x.hits>=Math.max(1,Math.ceil(terms.length*0.6))).sort((a,b)=>b.hits-a.hits||
    (a.prior<0?999:a.prior)-(b.prior<0?999:b.prior)||a.id.localeCompare(b.id)).slice(0,3);
  return {status:scored.length?'RETRIEVED_ONLY':'NO_MATCH',answer:'',
    sourceIds:scored.map(x=>x.id),needsHuman:true,candidates:[]};
}

export function splitCustomerIntents(message){
  if(typeof message!=='string'||!message.trim()||message.length>300)
    throw Object.assign(new Error('客户消息为空或超过 300 字'),{code:'E_KB_QUESTION'});
  let text=trim(message),hasGreeting=false;
  if(greeting.test(text)){
    hasGreeting=true;
    text=text.replace(greeting,'').replace(/^[\s，,。！!？?；;]+/u,'').trim();
  }
  // High-confidence question boundaries, not every comma or clause. A comma
  // only separates an explicit NEW request, never a condition ("如果退款，...").
  text=text.replace(/[，,]\s*(?:另外|还有|再问|顺便(?:想)?问(?:一下)?|同时(?:还想)?问)[：:\s]*/gu,'？');
  text=text.replace(/。\s*(?=(?:请问|何时|什么时候|是否|能否|可以|退款|发货|安装|怎么|如何))/gu,'？');
  const segments=text.split(/[？?；;\n]+/u).map(x=>x.replace(askPrefix,'').trim())
    .filter(Boolean);
  const seen=new Set(),parts=[];
  for(const value of segments){
    let clause=value.replace(/^[，,。！!\s]+|[，,。！!\s]+$/gu,'');
    clause=clause.replace(askPrefix,'').trim();
    if(!clause)continue;
    // A greeting inside an otherwise empty sentence is not a business intent.
    if(greeting.test(clause)&&clause.replace(greeting,'').replace(/[\s，,。！!？?]+/gu,'')===''){
      hasGreeting=true;continue;
    }
    const key=comparable(clause);if(seen.has(key))continue;
    seen.add(key);parts.push(clause);
  }
  return {hasGreeting,questions:parts,overLimit:!budget(parts)};
}
function reviewPart(question,status,reason){
  return {question,status,answer:'',sourceIds:[],candidateSourceIds:[],reason,
    needsHuman:true};
}
export function composeCustomerReply(parsed,parts){
  const answered=parts.filter(p=>['ANSWERED_FIXED','REVIEW_REQUIRED'].includes(p.status)&&p.answer);
  const verifiedIds=[...new Set(answered.flatMap(p=>p.sourceIds))];
  const unknownCount=parts.length-answered.length;
  const status=parsed.overLimit?'OVER_LIMIT':
    !parts.length?(parsed.hasGreeting?'GREETING_ONLY':'NO_MATCH'):
    parts.length===1&&(!parsed.hasGreeting||parts[0].status==='RETRIEVED_ONLY')
      ?parts[0].status:
    unknownCount?'PARTIAL_REVIEW_REQUIRED':
    parts.length===1?'COMPOSITE_REVIEW_REQUIRED':'MULTI_REVIEW_REQUIRED';
  let answer='';
  if(status==='GREETING_ONLY')answer=GREETING_REPLY;
  else if(!parsed.overLimit&&parts.length===1&&!parsed.hasGreeting)
    answer=answered.length?answered[0].answer:'';
  else if(answered.length){
    const lines=parts.map(p=>{
      if(['ANSWERED_FIXED','REVIEW_REQUIRED'].includes(p.status)&&p.answer)
        return '关于「'+p.question+'」：'+p.answer;
      if(p.status==='HUMAN_REQUIRED')
        return '关于「'+p.question+'」：涉及实时订单或业务操作，尚未核实，请由人工客服确认。';
      if(p.status==='CLARIFICATION_REQUIRED')
        return '关于「'+p.question+'」：请先明确是申请期限、审核时长还是实际到账时间。';
      return '关于「'+p.question+'」：目前没有经过核实的答复，建议由人工客服确认。';
    });
    answer=(parsed.hasGreeting?'您好，\n':'')+lines.join('\n');
  }
  // The existing local DOM adapter has a strict 3,000-character reply cap.
  // Never truncate policy wording or let the web click fail after approval.
  const tooLong=answer.length>2800;
  return {status:tooLong?'OVER_LIMIT':status,answer:tooLong?'':answer,
    sourceIds:parts.length===1&&parts[0].status==='RETRIEVED_ONLY'
      ?parts[0].candidateSourceIds.slice():verifiedIds,
    answeredCount:answered.length,reviewCount:unknownCount,
    needsHuman:status!=='ANSWERED_FIXED'||parsed.hasGreeting,
    hasGreeting:parsed.hasGreeting,parts:parts.map(p=>({...p,
      sourceIds:[...p.sourceIds],candidateSourceIds:[...p.candidateSourceIds]})),
    reason:tooLong?'REPLY_TOO_LONG':parsed.overLimit?'INTENT_LIMIT':null};
}
export function planCustomerMessage(model,lib,{question,scope=''}={}){
  if(typeof model?.library!=='function'||typeof model?.lookup!=='function')
    throw Object.assign(new Error('缺少真实知识模型'),{code:'E_KB_HOST'});
  const library=model.library(lib),parsed=splitCustomerIntents(question);
  if(typeof scope!=='string'||scope.length>60)
    throw Object.assign(new Error('适用条件无效'),{code:'E_KB_SCOPE'});
  if(parsed.overLimit)return composeCustomerReply(parsed,[]);
  const parts=parsed.questions.map(part=>{
    if(realtime.test(part))
      return reviewPart(part,'HUMAN_REQUIRED','BUSINESS_API_REQUIRED');
    if(ambiguousRefund.test(part)&&refundDuration.test(part)&&!refundQualifier.test(part))
      return reviewPart(part,'CLARIFICATION_REQUIRED','REFUND_TIME_AMBIGUOUS');
    // An unseparated sentence can contain multiple intents without a "?".
    // Refuse to turn such a sentence into one supposedly grounded RAG answer.
    const refundTopic=/(?:退款|退货)/u.test(part);
    const shippingTopic=/(?:发货|物流|快递)/u.test(part);
    const mixedRefundStages=refundTopic&&/(?:申请|期限)/u.test(part)&&/(?:审核|到账|退回)/u.test(part);
    if((refundTopic&&shippingTopic)||mixedRefundStages)
      return reviewPart(part,'CLARIFICATION_REQUIRED','INTENT_BOUNDARY_UNCERTAIN');
    const found=sourceCandidates(library,part,scope,model.lookup(library,{question:part,scope}));
    return {question:part,status:found.status,answer:found.answer||'',
      sourceIds:found.status==='ANSWERED_FIXED'?found.sourceIds.slice():[],
      candidateSourceIds:found.status==='RETRIEVED_ONLY'?found.sourceIds.slice():[],
      needsHuman:found.needsHuman,reason:null};
  });
  return composeCustomerReply(parsed,parts);
}