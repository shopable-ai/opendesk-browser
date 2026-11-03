import {createFileRequestContext,parseFileRequest,formatFileResult,REQUEST_PROTOCOL,WORKSPACE_ID} from './workspace-chat-request.js';
import {createEditContext,parseEditProposal,validateEditProposal,EDIT_PROTOCOL} from './workspace-ai-proposal.js';
import {readChatGPTEdit,fillChatGPTComposer,assertChatGPTTarget} from './workspace-chatgpt.js';
import {validateWorkspaceRead,sameWorkspaceAuthority,verifyWorkspaceWriteReceipt,verifyWorkspaceWriteReadBack} from './workspace-domain.js';
import {validateWorkspaceTreeListing} from './workspace-file-tree.js';
import {agentDigest} from './protocol.js';

export const CHATGPT_FILES_PROTOCOL='opendesk.chatgpt.files.v1';
export const CHATGPT_FILES_PAGE='native-agent/settings.html#chatgpt-files';
const LEDGER='opendesk.chatgpt.files.writes.v1';
const fail=(code,message,outcome='NOT_DISPATCHED')=>{throw {code,message,outcome};};
const hash=async content=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content))),b=>b.toString(16).padStart(2,'0')).join('');

// The page adapter owns no Native authority. Only this packaged, top-level
// extension document can select existing grants and confirm a concrete write.
export function createChatGPTFilesController({api,files,readAnswer=readChatGPTEdit,fillComposer=fillChatGPTComposer,clock=()=>Date.now()}={}){
  const sessions=new Map();let sequence=Promise.resolve(),disposed=false;
  function owner(sender){
    if(disposed||sender?.id!==api.runtime.id||sender.url!==api.runtime.getURL(CHATGPT_FILES_PAGE)||
      sender.frameId!==0||!sender.documentId||!Number.isSafeInteger(sender.tab?.id)||sender.tab.incognito||
      sender.documentLifecycle&&sender.documentLifecycle!=='active')fail('E_FILE_OWNER','只有可信文件审阅页可以操作');
    return sender.tab.id;
  }
  function claim({source,workspaceTab},sender){
    const id=owner(sender);
    if(id!==workspaceTab.id||workspaceTab.windowId!==source.windowId)fail('E_FILE_OWNER','审阅窗口不匹配');
    sessions.set(id,{source:Object.freeze({...source}),documentId:sender.documentId,createdAt:clock(),
      workspaces:[],connected:false,consumed:new Set(),promptPacket:null,resultPacket:null,proposal:null,observed:false,message:''});
  }
  async function sourceLive(s){
    if(disposed||![...sessions.values()].includes(s)||clock()-s.createdAt>30*60*1000)fail('E_FILE_EXPIRED','文件会话已过期，请从原对话重新打开');
    await assertChatGPTTarget(api,s.source);
    const tab=await api.tabs.get(s.source.tabId);
    if(tab.incognito||tab.pendingUrl||tab.url!==s.source.url||tab.windowId!==s.source.windowId)
      fail('E_FILE_SOURCE','原对话或窗口已改变');
  }
  const expected=a=>({sessionId:a.sessionId});
  const params=(a,path,extra={})=>({workspaceId:a.workspaceId,path,leaseEpoch:a.leaseEpoch,...extra});
  async function discover(s){
    await sourceLive(s);
    const state=await files.state();s.connected=!!state.connected;
    if(!state.connected){s.workspaces=[];return state;}
    if(state.devLeaseEpoch!==1)fail('E_NATIVE_UPDATE_REQUIRED','文件请求需要支持租约代次的 Native 服务');
    const data=await files.request('workspaces.list',{},expected(state));
    if(!Array.isArray(data?.workspaces)||data.workspaces.length>32)fail('E_FILES_PROTOCOL','目录列表无效');
    s.workspaces=data.workspaces.map(row=>{
      if(!WORKSPACE_ID.test(row?.workspaceId||'')||typeof row.name!=='string'||row.name.length>160||
        !['read-only','read-write'].includes(row.access)||row.sourceId!==undefined&&typeof row.sourceId!=='string'||
        row.leaseEpoch!==undefined&&row.leaseEpoch!==''&&!/^[A-Za-z0-9._:-]{16,100}$/.test(row.leaseEpoch))fail('E_FILES_PROTOCOL','目录身份无效');
      return {...row,sourceId:row.sourceId||'',leaseEpoch:row.leaseEpoch||'',sessionId:state.sessionId};
    });
    return state;
  }
  async function authority(s,a){
    await discover(s);
    const current=s.workspaces.find(row=>row.workspaceId===a.workspaceId);
    if(!sameWorkspaceAuthority(a,current))fail('E_FILES_SESSION','目录权限、租约或 Native 连接已改变');
  }
  async function disk(s,a,path){
    await authority(s,a);
    const data=validateWorkspaceRead(await files.request('files.read',params(a,path),expected(a)),a.workspaceId,path);
    if(await hash(data.content)!==data.sha256)fail('E_FILES_PROTOCOL','读取正文与 SHA 不一致');
    await authority(s,a);return data;
  }
  const snapshot=s=>({source:{url:s.source.url},workspaces:s.workspaces.map(({workspaceId,name,access})=>({workspaceId,name,access})),
    connected:s.connected,prompt:s.promptPacket?.text||'',request:s.request?.request||null,
    promptPacketId:s.promptPacket?.id,promptDelivery:s.promptPacket?.delivery,
    resultPacketId:s.resultPacket?.result.resultId,
    automation:{active:!!s.request&&!s.paused&&!s.proposal&&!s.unknown,phase:s.paused?'paused':s.proposal?'review':'watching'},
    proposal:s.proposal?{path:s.proposal.path,before:s.proposal.before,content:s.proposal.content,
      baseSha256:s.proposal.baseSha256,requestId:s.proposal.requestId,reviewId:s.proposal.reviewId}:null,
    resultText:s.resultPacket?.text||'',resultStatus:s.resultPacket?.result.status||'',
    delivery:s.resultPacket?.delivery||'ready',observed:s.observed,message:s.message});
  async function answer(s){
    await authority(s,s.authority);
    return readAnswer(api,s.source,s.request.request.requestId,{requireComplete:true,fileRequest:true,requireUserEcho:true,
      protocols:[REQUEST_PROTOCOL,EDIT_PROTOCOL],requestIds:[s.request.request.requestId,s.edit?.context.requestId].filter(Boolean)});
  }
  async function sameAnswer(s,candidate){
    const current=await answer(s);
    if(current.turnKey!==candidate.turnKey||current.answerKey!==candidate.answerKey||current.blocks[0]!==candidate.blocks[0])
      fail('E_CHAT_ANSWER','完整回答或轮次已改变，请重新审阅');
  }
  function packet(s,request,options,candidate){
    const value=formatFileResult(request,options);
    s.resultPacket={...value,turnKey:candidate.turnKey,delivery:'ready'};s.observed=false;return value;
  }
  const ledger=async()=>{const data=(await api.storage.local.get(LEDGER))[LEDGER];return data&&typeof data==='object'&&!Array.isArray(data)?data:{};};
  async function reserve(s,p){
    const rows=await ledger(),id=p.requestId;
    if(Object.hasOwn(rows,id))fail('E_FILE_REPLAY','这个稳定写入 ID 已处理；只能读回对账');
    if(Object.values(rows).some(row=>row.workspaceId===p.workspaceId&&row.path===p.path&&
      ['dispatching','unknown'].includes(row.state)))fail('E_FILE_UNKNOWN','此文件仍有未知写入，请先读回核对，不能换 ID 重放');
    if(Object.keys(rows).length>=128)fail('E_FILES_LIMIT','写入记录已达上限；未自动删除未知回执');
    const entry={requestId:id,workspaceId:p.workspaceId,path:p.path,sourceUrl:s.source.url,sourceId:s.authority.sourceId,
      digest:await agentDigest(p),targetSha256:await hash(p.content),state:'dispatching',createdAt:clock()};
    await api.storage.local.set({[LEDGER]:{...rows,[id]:entry}});return entry;
  }
  async function settle(id,state){const rows=await ledger();if(rows[id])await api.storage.local.set({[LEDGER]:{...rows,[id]:{...rows[id],state}}});}
  async function run(message,sender){
    const s=sessions.get(owner(sender));
    if(!s||s.documentId!==sender.documentId)fail('E_FILE_OWNER','没有当前文档的一次性对话绑定');
    const fields={state:[],prepare:['workspaceId','path','operation','task'],inspect:[],approve:['reviewId'],reconcile:[],fill:['packet','packetId'],observe:[],poll:[],pause:[]};
    if(!Object.hasOwn(fields,message.action)||Object.keys(message).some(key=>!['protocol','action',...fields[message.action]].includes(key)))
      fail('E_FILE_SCHEMA','不支持的文件操作或字段');
    await sourceLive(s);
    if(message.action==='state'){await discover(s);return snapshot(s);}
    if(message.action==='pause'){s.paused=true;s.message='自动处理已暂停；重新批准精确范围后才能继续。';return snapshot(s);}
    if(message.action==='prepare'){
      const request=createFileRequestContext({workspaceId:message.workspaceId,bindingId:crypto.randomUUID(),
        path:message.path,operation:message.operation,task:message.task||''});
      await discover(s);const a=s.workspaces.find(row=>row.workspaceId===message.workspaceId);
      if(!a)fail('E_FILES_ACCESS','请选择 Native 当前已授权的目录');
      if(s.unknown)fail('E_FILE_UNKNOWN','原写入结果未知，请先对账');
      const page=await readAnswer(api,s.source,'',{identityOnly:true});
      s.authority=Object.freeze({...a});s.request=request;s.edit=null;s.proposal=null;s.resultPacket=null;
      s.paused=false;s.pollKeys=new Set();s.baselineTurn=page.turnKey;
      // Reuse the established protocol, rules and reader.
      s.promptPacket={text:request.prompt,id:crypto.randomUUID(),turnKey:page.turnKey,delivery:'ready'};
      s.message='已选择精确目录和路径；尚未读取文件。请求只回当前对话。';return snapshot(s);
    }
    if(!s.request)fail('E_REQUEST_CONTEXT','请先选择目录并批准具体读取范围');
    if(s.paused&&['inspect','approve','fill'].includes(message.action))fail('E_FILE_PAUSED','处理已暂停，请重新批准当前范围');
    if(message.action==='poll'){
      if(s.paused||s.proposal||s.unknown)return snapshot(s);
      let key;
      const readWasConsumed=s.consumed.has(s.request.request.requestId);
      try{
        const p=s.resultPacket;
        if(p?.delivery==='ready')return await run({action:'fill',packet:'result',packetId:p.result.resultId},sender);
        if(p?.delivery==='unknown'){s.paused=true;return snapshot(s);}
        const page=await readAnswer(api,s.source,'',{identityOnly:true,fileRequest:true,resultId:p?.result.resultId});
        if(p&&page.resultObserved===true){
          s.observed=true;
          if(p.result.operation!=='read'){s.paused=true;s.message='原对话已收到本轮结果。';return snapshot(s);}
        }
        if(!page.answerComplete||!page.answerKey||page.turnKey===s.baselineTurn)return snapshot(s);
        // Never consume a reply to an unsent local result, or repeatedly act on
        // the same assistant revision. Changing revision does not bypass IDs.
        if(p&&!s.observed)return snapshot(s);
        key=JSON.stringify([s.request.request.requestId,page.turnKey,page.answerKey]);
        if(s.pollKeys.has(key))return snapshot(s);
        if(s.pollKeys.size>=128)fail('E_FILES_LIMIT','回答变化过多，请重新批准本次范围');
        s.pollKeys.add(key);
        await run({action:'inspect'},sender);
        const next=s.resultPacket;
        if(!s.proposal&&next?.delivery==='ready')await run({action:'fill',packet:'result',packetId:next.result.resultId},sender);
        return snapshot(s);
      }catch(error){
        // Completion markers may settle between the cheap probe and full read.
        if(['E_CHAT_STREAMING','E_CHAT_PENDING','E_CHAT_INCOMPLETE'].includes(error.code)){
          if(!readWasConsumed&&s.consumed.has(s.request.request.requestId)){
            s.paused=true;
            fail('E_FILE_READ_CHANGED','读取已处理，但回答随后变化；已暂停，未回填，也不会重新读取。请核对后重新批准新轮次。');
          }
          if(key)s.pollKeys.delete(key);return snapshot(s);
        }
        s.paused=true;throw error;
      }
    }
    if(message.action==='inspect'){
      if(s.proposal)fail('E_FILE_REVIEW','已有待确认提案，不能静默替换');
      const candidate=await answer(s);let protocol;
      try{protocol=JSON.parse(candidate.blocks[0]).protocol;}catch{fail('E_REQUEST_FORMAT','回答不是完整 JSON');}
      if(protocol===REQUEST_PROTOCOL){
        const request=parseFileRequest(candidate.blocks[0],s.request.request);
        if(request.operation!==s.request.request.operation||request.path!==s.request.request.path)fail('E_FILE_SCOPE','模型改变了批准的路径或操作');
        if(s.consumed.has(request.requestId))fail('E_FILE_REPLAY','本轮读取已处理，请使用已有结果');
        await sameAnswer(s,candidate);s.consumed.add(request.requestId);
        let data;
        if(request.operation==='read'){
          data=await disk(s,s.authority,request.path);
          const record={...data,baseContent:data.content};
          s.edit=createEditContext(record,{bindingId:request.bindingId,authority:s.authority,source:s.source});
        }else{
          data=await files.request('files.list',params(s.authority,request.path),expected(s.authority));
          validateWorkspaceTreeListing(data,request.workspaceId,request.path);await authority(s,s.authority);
        }
        await sameAnswer(s,candidate);
        const edit=s.edit?{protocol:EDIT_PROTOCOL,requestId:s.edit.context.requestId,bindingId:request.bindingId,
          workspaceId:request.workspaceId,path:request.path,baseSha256:data.sha256,content:data.content}:undefined;
        packet(s,request,{data,edit},candidate);s.message='Native 读取成功，结果尚未发送。';
      }else if(protocol===EDIT_PROTOCOL){
        if(!s.edit)fail('E_EDIT_CONTEXT','请先成功读取当前文件');
        const p=validateEditProposal(parseEditProposal(candidate.blocks[0]),s.edit.context,
          {...s.edit.context,sha256:s.edit.context.baseSha256,content:s.edit.context.baseContent,baseContent:s.edit.context.baseContent});
        if(s.consumed.has(p.requestId))fail('E_FILE_REPLAY','这份写入提案已处理');
        if(s.authority.access!=='read-write')fail('E_FILES_ACCESS','当前目录没有写入权限');
        s.proposal={...p,candidate,reviewId:crypto.randomUUID()};s.message='仅生成审阅提案，尚未写入。请核对原文、新文与 SHA。';
      }else fail('E_REQUEST_FORMAT','只接受固定文件请求或修改提案');
      return snapshot(s);
    }
    if(message.action==='approve'){
      const p=s.proposal;if(!p||s.consumed.has(p.requestId))fail('E_FILE_REPLAY','没有可确认的新提案');
      if(message.reviewId!==p.reviewId)fail('E_FILE_REVIEW','确认不属于当前显示的具体提案，请重新核对');
      if(s.authority.access!=='read-write')fail('E_FILES_ACCESS','目录没有写入权限');
      await sameAnswer(s,p.candidate);
      const before=await disk(s,s.authority,p.path);
      if(before.sha256!==p.baseSha256||before.content!==p.before)fail('E_FILES_CONFLICT','原文件已变化，未写入');
      await sameAnswer(s,p.candidate);
      const entry=await reserve(s,p);s.consumed.add(p.requestId);s.unknown={proposal:p,entry};
      const request={...p,operation:'write'};let receipt;
      try{
        await sameAnswer(s,p.candidate);
        receipt=await files.request('files.write',params(s.authority,p.path,{content:p.content,expectedSha256:p.baseSha256}),
          {...expected(s.authority),requestId:p.requestId});
        verifyWorkspaceWriteReceipt(receipt,{workspaceId:p.workspaceId,path:p.path,sha256:entry.targetSha256});
        const after=await disk(s,s.authority,p.path);
        if(!verifyWorkspaceWriteReadBack(after,{workspaceId:p.workspaceId,path:p.path,content:p.content,sha256:entry.targetSha256}))
          fail('E_FILE_READBACK','写入回执后读回不一致','OUTCOME_UNKNOWN');
        await settle(p.requestId,'confirmed');s.unknown=null;
        packet(s,request,{data:{...receipt,readBackVerified:true}},p.candidate);s.message='已取得真实写入回执并独立读回核对 SHA。';
      }catch(error){
        const unknown=receipt||error.outcome==='OUTCOME_UNKNOWN'||!error.outcome;
        await settle(p.requestId,unknown?'unknown':'failed');if(!unknown)s.unknown=null;
        packet(s,request,{error:{...error,outcome:unknown?'OUTCOME_UNKNOWN':error.outcome}},p.candidate);
        s.message=unknown?'写入结果未知；只允许读回对账，不会重试。':'写入未完成，原提案不会再次执行。';
      }
      s.proposal=null;return snapshot(s);
    }
    if(message.action==='reconcile'){
      const pending=s.unknown;
      const rows=await ledger();
      const entry=pending?.entry||Object.values(rows).find(row=>row.workspaceId===s.authority.workspaceId&&row.path===s.request.request.path&&
        row.sourceId===s.authority.sourceId&&row.sourceUrl===s.source.url&&['dispatching','unknown'].includes(row.state));
      if(!entry)fail('E_FILE_UNKNOWN','没有当前文件的未知写入');
      // Reconnect may legitimately rotate the Native session or lease. Acquire
      // current read authority for the SAME directory identity, never revive a
      // write proposal or dispatch the old mutation on that new authority.
      await discover(s);
      const current=s.workspaces.find(row=>row.workspaceId===entry.workspaceId&&row.sourceId===entry.sourceId);
      if(!current||entry.sourceUrl!==s.source.url)fail('E_FILES_ACCESS','原目录已撤权或身份已改变，不能对账');
      s.authority=Object.freeze({...current});s.edit=null;s.proposal=null;
      const read=await disk(s,s.authority,entry.path),matches=read.sha256===entry.targetSha256;
      // Readback proves current bytes, never attribution or an original ACK.
      const candidate=await readAnswer(api,s.source,'',{identityOnly:true});
      packet(s,{...s.request.request,requestId:entry.requestId,operation:'write',path:entry.path},
        {error:{code:'E_FILE_RECONCILED',message:matches?'当前内容已匹配目标 SHA；原回执仍未知':'当前内容不匹配，未重放写入',outcome:'OUTCOME_UNKNOWN'},
          data:undefined},candidate);
      s.resultPacket.text+='\n\n'+JSON.stringify({readBackVerified:matches,currentSha256:read.sha256,targetSha256:entry.targetSha256,writeReceiptObserved:false});
      if(matches){await settle(entry.requestId,'readback-matched');s.unknown=null;}
      s.message=matches?'读回匹配；仅证明当前文件内容，不冒称收到原写入回执。':'读回不匹配；原结果仍未知，禁止自动重放。';return snapshot(s);
    }
    if(message.action==='fill'){
      const p=message.packet==='prompt'?s.promptPacket:message.packet==='result'?s.resultPacket:null;
      if(!p)fail('E_FILE_SCHEMA','没有可回填内容');
      if(message.packetId!==(p.id||p.result.resultId))fail('E_FILE_PACKET','草稿标识已变化，未回填其他内容');
      if(p.delivery!=='ready')fail('E_FILE_REPLAY','已回填或结果未知，请检查原对话，禁止重复插入');
      await authority(s,s.authority);p.delivery='unknown';
      await fillComposer(api,s.source,p.text,{operationId:p.id||p.result.resultId,turnKey:p.turnKey});
      p.delivery='filled';s.message='已回填原对话草稿，请在 ChatGPT 点击发送。尚不能认定对话已收到。';return snapshot(s);
    }
    if(message.action==='observe'){
      if(!s.resultPacket)fail('E_REQUEST_CONTEXT','没有本轮结果');
      const page=await readAnswer(api,s.source,'',{identityOnly:true,resultId:s.resultPacket.result.resultId});
      s.observed=page.resultObserved===true;s.message=s.observed?'原对话用户消息已包含本轮结果 ID。':'原对话尚未观察到本轮结果，请检查草稿并发送。';return snapshot(s);
    }
  }
  return {claim,handle(message,sender){const next=sequence.then(()=>run(message,sender));sequence=next.catch(()=>{});return next;},
    drop(tabId){sessions.delete(tabId);for(const [id,s] of sessions)if(s.source.tabId===tabId)sessions.delete(id);},
    dispose(){disposed=true;sessions.clear();}};
}
