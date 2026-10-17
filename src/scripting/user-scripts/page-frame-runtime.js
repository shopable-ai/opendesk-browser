import {invariant,FoundationError} from '../../platform/protocol.js';
import {readPageFrameResources} from './page-frame-resources.js';

export const PAGE_FRAME_ACTION='page-frame';
const FORMAT='opendesk.page-frame.v1';
const MAX_DATA=32*1024;

// Runs in the original installed USER_SCRIPT world. No resource code is put
// in HTML, srcdoc, script tags, a website world, or a privileged extension page.
function installParentFrames(identity){
  const entries=new Map(), doc=document, win=window;
  const {resourceIds,...binding}=identity;
  const send=async payload=>{
    const response=await chrome.runtime.sendMessage({protocol:'opendesk.page-installed.boot.v1',
      action:'page-frame',...binding,...payload});
    if(!response?.ok)throw Object.assign(new Error(response?.error?.message||'Missing frame receipt'),
      {code:response?.error?.code||'E_EFFECT_UNKNOWN'});
    return response.data;
  };
  const check=(ok,code)=>{if(!ok)throw Object.assign(new Error(code),{code});};
  function inspect(requestId,challenge){
    const row=entries.get(requestId);
    check(row&&!row.closed&&row.frame.isConnected&&row.frame.contentWindow===row.proxy&&
      row.frame.getAttribute('sandbox')==='allow-scripts'&&row.frame.src===row.url,'E_FRAME_STALE');
    if(challenge!==undefined)row.challenge=challenge;
    return {url:row.url,portToken:row.portToken,confirmed:row.confirmed===true};
  }
  async function create(options,onDispose,container){
    check(options&&Object.keys(options).every(k=>['resourceId','data'].includes(k))&&
      resourceIds.includes(options.resourceId),'E_FRAME_RESOURCE');
    const data=JSON.stringify(options.data??null);
    check(data!==undefined&&new TextEncoder().encode(data).length<=32768,'E_FRAME_DATA');
    const requestId=crypto.randomUUID(),portToken=crypto.randomUUID();
    const frame=doc.createElement('iframe');frame.setAttribute('sandbox','allow-scripts');
    frame.setAttribute('referrerpolicy','no-referrer');frame.title=options.resourceId;
    // Chrome webNavigation does not expose blob documents. A browser-created,
    // script-free about:blank document has a native documentId and a unique
    // fragment; the fixed native handshake installs CSP before any resource.
    const url='about:blank#opendesk-'+requestId;
    const channel=new MessageChannel();
    const row={frame,url,portToken,closed:false,confirmed:false,challenge:null};
    entries.set(requestId,row);
    let retirement;
    const destroy=()=>{
      if(retirement)return retirement;
      row.closed=true;win.removeEventListener('message',handshake);
      channel.port1.close();channel.port2.close();frame.remove();
      retirement=send({operation:'retire',requestId}).finally(()=>entries.delete(requestId));
      return retirement;
    };
    const handshake=event=>{
      if(row.closed||event.source!==row.proxy||event.data?.format!=='opendesk.page-frame.handshake.v1'||
        !row.challenge||event.data.challenge!==row.challenge)return;
      row.confirmed=true;
      row.proxy.postMessage({format:'opendesk.page-frame.port.v1',token:portToken},'*',[channel.port2]);
      win.removeEventListener('message',handshake);
    };
    win.addEventListener('message',handshake);onDispose(destroy);
    try{
      const loaded=new Promise((resolve,reject)=>{
        frame.addEventListener('load',resolve,{once:true});
        frame.addEventListener('error',()=>reject(new Error('E_FRAME_LOAD')),{once:true});
      });
      frame.src=url;container.appendChild(frame);row.proxy=frame.contentWindow;
      let timer;
      try{await Promise.race([loaded,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('E_FRAME_LOAD_TIMEOUT')),8000);})]);}
      finally{clearTimeout(timer);}
      inspect(requestId);
      const receipt=await send({operation:'execute',requestId,resourceId:options.resourceId,url,portToken,data:JSON.parse(data)});
      check(!row.closed&&row.confirmed,'E_FRAME_STALE');
      return Object.freeze({frame,port:channel.port1,receipt,destroy});
    }catch(error){await destroy().catch(()=>{});throw error;}
  }
  return Object.freeze({inspect,create});
}

function childHandshake(token,challenge){
  const csp=document.createElement('meta');csp.httpEquiv='Content-Security-Policy';
  csp.content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; frame-src 'none'";
  document.head.appendChild(csp);
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{removeEventListener('message',attach);reject(Error('E_FRAME_PORT_TIMEOUT'));},5000);
    function attach(event){
      if(event.source!==parent||event.data?.format!=='opendesk.page-frame.port.v1'||
        event.data.token!==token||event.ports.length!==1)return;
      clearTimeout(timer);removeEventListener('message',attach);
      resolve(event.ports[0]);
    }
    addEventListener('message',attach);
    parent.postMessage({format:'opendesk.page-frame.handshake.v1',challenge},'*');
  });
}

export const pageFrameBootstrapSource=identity=>
  'const __opendeskPageFramesV1=('+installParentFrames.toString()+')('+JSON.stringify(identity)+');';

export function createPageFrameRuntime({api,worlds}){
  const edit=async(worldId,nonce,work,kind='installed')=>worlds.editRecords(rows=>{
    const row=rows.find(r=>r.worldId===worldId);
    invariant(row?.[kind]?.receiptNonce===nonce,'E_FRAME_IDENTITY','父执行身份已变化');
    row[kind].frames??=[];return work(row[kind].frames);
  });
  const exact=(results,target)=>{
    invariant(Array.isArray(results)&&results.length===1&&results[0]?.documentId===target.documentId&&
      results[0].frameId===target.frameId&&results[0].error===undefined,'E_EFFECT_UNKNOWN','缺少精确子文档回执');
    return results[0].result;
  };
  async function execute({message,sender,candidate,execution,preview},authorize,dispatch){
    const kind=preview?'previewFrames':'installed';
    const row=(await worlds.records()).find(r=>r.worldId===(preview?.worldId??execution.managedUI?.worldId));
    const binding=row?.[kind];
    invariant(binding&&binding.receiptNonce===message.receiptNonce&&
      (preview?binding.previewId===preview.previewId&&binding.sourceHash===preview.sourceHash:
        binding.executionKey===execution.executionKey)&&
      (message.operation==='retire'||['ready','evaluated'].includes(binding.state)),
      'E_FRAME_IDENTITY','原父执行世界不可用');
    const worldId=row.worldId,nonce=message.receiptNonce;
    const update=work=>edit(worldId,nonce,work,kind);
    if(message.operation==='retire'){
      const record=binding.frames?.find(r=>r.requestId===message.requestId);
      if(!record)return {format:FORMAT,state:'retired',notDispatched:true};
      if(record.state==='retired')return record.receipt;
      let child=record.documentId?await api.webNavigation.getFrame({documentId:record.documentId}):null;
      const until=Date.now()+1000;
      while(child!=null&&Date.now()<until){
        await new Promise(resolve=>setTimeout(resolve,25));
        child=await api.webNavigation.getFrame({documentId:record.documentId});
      }
      invariant(child==null,'E_EFFECT_UNKNOWN','子文档仍存在；不重放清理或资源');
      const receipt={format:FORMAT,state:'retired',requestId:record.requestId,documentId:record.documentId??null,contextGone:true};
      await update(rows=>{Object.assign(rows.find(r=>r.requestId===record.requestId),{state:'retired',receipt});});
      return receipt;
    }
    await authorize();
    invariant(message.operation==='execute'&&typeof message.resourceId==='string'&&typeof message.url==='string'&&
      message.url==='about:blank#opendesk-'+message.requestId&&typeof message.portToken==='string'&&
      message.portToken.length===36&&new TextEncoder().encode(JSON.stringify(message.data)).length<=MAX_DATA,
      'E_FRAME_REQUEST','非法子帧请求');
    const resources=await readPageFrameResources(candidate.sourceUtf8),resource=resources.find(r=>r.resourceId===message.resourceId);
    invariant(resource,'E_FRAME_RESOURCE','资源未绑定此固定版本');
    await update(rows=>{
      invariant(rows.filter(r=>r.state!=='retired').length<16&&rows.length<4096&&!rows.some(r=>r.requestId===message.requestId)&&
        rows.every(r=>['evaluated','retired'].includes(r.state)),
        'E_REQUEST_CONFLICT','子帧请求已使用、仍在执行或结果未确认；不重放');
      rows.push({requestId:message.requestId,resourceId:resource.resourceId,resourceSha256:resource.sha256,state:'prepared'});
    });
    const native=api.userScripts,parent={tabId:row.tabId,documentId:row.documentId,frameId:0};
    const parentProbe=async challenge=>exact(await native.execute({injectImmediately:true,target:{tabId:row.tabId,documentIds:[row.documentId]},
      world:'USER_SCRIPT',worldId,js:[{code:'__opendeskPageFramesV1.inspect('+JSON.stringify(message.requestId)+
        (challenge?','+JSON.stringify(challenge):'')+')'}]}),parent);
    let dispatched=false;
    try{
      const challenge=crypto.randomUUID(),proof=await parentProbe(challenge);
      invariant(proof?.url===message.url&&proof.portToken===message.portToken,'E_FRAME_IDENTITY','父文档没有捕获此子帧');
      const frames=await api.webNavigation.getAllFrames({tabId:row.tabId});
      const children=frames.filter(r=>r.url===message.url&&r.parentFrameId===0&&r.parentDocumentId===row.documentId&&
        r.frameId>0&&!r.errorOccurred&&r.documentLifecycle==='active');
      invariant(children.length===1,'E_FRAME_IDENTITY','缺少唯一真实父子文档');
      const child={...children[0],tabId:row.tabId};
      const childWorldId=await worlds.allocate(native,child);
      await update(rows=>Object.assign(rows.find(r=>r.requestId===message.requestId),
        {documentId:child.documentId,frameId:child.frameId,worldId:childWorldId}));
      const connected=exact(await native.execute({injectImmediately:true,target:{tabId:row.tabId,documentIds:[child.documentId]},
        world:'USER_SCRIPT',worldId:childWorldId,js:[{code:'const __opendeskFrameState={port:null};\n('+childHandshake.toString()+')('+JSON.stringify(message.portToken)+','+JSON.stringify(challenge)+').then(port=>{__opendeskFrameState.port=port;return true;})'}]}),child);
      invariant(connected===true&&(await parentProbe()).confirmed===true,'E_FRAME_IDENTITY','WindowProxy握手未确认');
      await authorize();
      const current=await api.webNavigation.getFrame({documentId:child.documentId});
      invariant(current?.url===message.url&&current.parentDocumentId===row.documentId&&current.parentFrameId===0&&
        current.documentLifecycle==='active','E_DOCUMENT_STALE','子文档在派发前已改变');
      await update(rows=>Object.assign(rows.find(r=>r.requestId===message.requestId),{state:'dispatched'}));
      const expected={format:FORMAT,requestId:message.requestId,resourceId:resource.resourceId,resourceSha256:resource.sha256};
      const code='const OpenDeskFrame=Object.freeze({port:__opendeskFrameState.port,data:'+JSON.stringify(message.data)+'});\n'+
        resource.code+'\n;('+JSON.stringify(expected)+')';
      invariant(typeof dispatch==='function','E_OWNER','缺少固定资源的最终派发授权');
      const pending=await dispatch(()=>{
        dispatched=true;
        return native.execute({injectImmediately:true,target:{tabId:row.tabId,documentIds:[child.documentId]},
          world:'USER_SCRIPT',worldId:childWorldId,js:[{code}]});
      });
      const receipt=exact(await pending.completion,child);
      invariant(JSON.stringify(receipt)===JSON.stringify(expected),'E_EFFECT_UNKNOWN','资源执行缺少完整回执');
      await authorize();await parentProbe();
      const result={...expected,state:'evaluated',parentDocumentId:row.documentId,documentId:child.documentId,
        ...(preview?{previewId:preview.previewId,sourceHash:preview.sourceHash,receiptNonce:nonce}:
          {programId:execution.programId,revision:execution.revision,sourceHash:execution.sourceHash,
          installationId:execution.installationId,grantGeneration:execution.grantGeneration,executionKey:execution.executionKey})};
      await update(rows=>Object.assign(rows.find(r=>r.requestId===message.requestId),{state:'evaluated',receipt:result}));
      return result;
    }catch(error){
      await update(rows=>Object.assign(rows.find(r=>r.requestId===message.requestId),
        {state:dispatched?'unknown':'failed',error:{code:error.code||'E_FRAME_EXECUTION',message:String(error.message||error).slice(0,512)}}));
      if(dispatched)throw new FoundationError('E_EFFECT_UNKNOWN','子帧执行结果未确认；不重放资源');
      throw error;
    }
  }
  return Object.freeze({execute});
}
