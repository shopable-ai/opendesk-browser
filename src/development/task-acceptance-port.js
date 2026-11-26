import {resolveToolSender} from '../environment.js';
import {invariant,projectFoundationError} from '../platform/protocol.js';
import {SIDEPANEL_DOCUMENT_PATH,toolDocumentIdentity} from '../tool-document-url.js';
import {createTaskAcceptanceTarget} from './task-acceptance-target.js';
import {readTaskAcceptanceSource} from './task-acceptance-storage.js';
import {ACCEPTANCE_INSTALL,ACCEPTANCE_PROTOCOL,createTaskAcceptanceSession} from './task-acceptance-session.js';

export function attachTaskAcceptancePort({api,development,foundation}){
  let active=null;
  api.runtime.onConnect.addListener(port=>{
    if(port.name!==ACCEPTANCE_PROTOCOL)return;
    let closed=false,scope,identity,target,last=0,opening=false,dropped=0;
    const events=[];
    let transitions=Promise.resolve();
    const close=()=>{
      closed=true;scope?.close();scope=null;
      if(active===port)active=null;
    };
    port.onDisconnect.addListener(close);
    const send=reply=>{if(!closed)try{port.postMessage(reply);}catch{close();}};
    const audit=event=>{
      if(events.length>=1024){dropped++;return;}
      events.push({...event,sequence:events.length+1,at:Date.now()});
    };
    async function observe(){
      const original=port.sender;
      const route=toolDocumentIdentity(api.runtime.getURL(SIDEPANEL_DOCUMENT_PATH),original?.url);
      invariant(original?.id===api.runtime.id&&!original.tab&&route?.hostInstanceId&&!route.hasLocator&&
        (original.frameId===undefined||original.frameId===0)&&
        (!original.documentLifecycle||original.documentLifecycle==='active'),
        'E_OWNER','Only the original packaged native side panel can use offline acceptance');
      const sender=await resolveToolSender(api,original);
      const contexts=await api.runtime.getContexts({contextTypes:['SIDE_PANEL'],documentUrls:[sender.url]});
      invariant(contexts?.length===1,'E_OWNER','Offline side panel document is missing or ambiguous');
      const [row]=contexts;
      invariant(row.contextType==='SIDE_PANEL'&&row.documentUrl===sender.url&&row.documentId===sender.documentId&&
        !row.incognito&&row.frameId===0&&(!row.documentLifecycle||row.documentLifecycle==='active')&&
        typeof row.contextId==='string'&&row.contextId.length>0&&
        typeof row.documentId==='string'&&row.documentId.length>0&&
        Number.isSafeInteger(row.windowId)&&row.windowId>=-1,
        'E_OWNER','Offline native side panel identity differs');
      return {sender,contextId:row.contextId,nativeContextWindowId:row.windowId,hostInstanceId:route.hostInstanceId};
    }
    async function verifyWindow(current,proof){
      invariant(Number.isSafeInteger(proof?.windowId)&&proof.windowId>=0&&
        proof.contextId===current.contextId&&proof.documentId===current.sender.documentId&&
        (current.nativeContextWindowId===-1||current.nativeContextWindowId===proof.windowId),
        'E_OWNER','Offline trusted host window proof differs');
      const window=await api.windows.get(proof.windowId);
      invariant(window?.id===proof.windowId&&window.incognito===false,
        'E_OWNER','Offline native side panel window is unavailable or private');
      current.windowId=proof.windowId;
    }
    async function revalidate(current=undefined){
      current??=await observe();
      invariant(current.contextId===identity.contextId&&current.sender.documentId===identity.documentId&&
        current.hostInstanceId===identity.hostInstanceId&&current.nativeContextWindowId===identity.nativeContextWindowId&&
        development.appliedRevision===identity.revision&&!development.held,
        'E_REVISION','Offline session identity or revision changed');
      await verifyWindow(current,identity);
      invariant(!closed&&!development.held&&development.appliedRevision===identity.revision,
        'E_HOST_CLOSED','Offline side panel is no longer available');
    }
    async function handle({type,payload}={}){
      if(closed||development.held||development.appliedRevision?.length!==64){
        close();invariant(false,'E_DEV_RELOADING','Offline mode requires the applied development revision');
      }
      let current;
      try{
        current=await observe();
        invariant(!closed&&!development.held,'E_HOST_CLOSED','Offline side panel is no longer available');
      }catch(error){close();throw error;}
      if(type==='open'){
        invariant(!active&&!opening&&!scope,'E_OWNER','One offline side panel session at a time');
        if(payload?.hostInstanceId!==current.hostInstanceId||payload?.revision!==development.appliedRevision){
          close();invariant(false,'E_REVISION',
            'Read the applied development revision on the pinned side panel before opening offline mode');
        }
        const revision=development.appliedRevision;
        active=port;opening=true;
        try{
          const live=await foundation;
          const host=await live.authority.assertHost(current.sender,payload.registrationId);
          invariant(host.hostInstanceId===current.hostInstanceId,'E_OWNER','Original host registration differs');
          // Only the authenticated fixed host may supply a missing (-1) native
          // window. A nonnegative native context can never be overridden.
          await verifyWindow(current,payload.windowProof);
          const source=await readTaskAcceptanceSource(live.storage,host.namespace,ACCEPTANCE_INSTALL);
          const checkPermission=request=>{
            invariant(Array.isArray(request?.origins)&&request.origins.length===1&&
              request.origins[0]==='https://www.baidu.com/*'&&!request.permissions?.length,
              'E_PERMISSION','Only the installed test origin can be checked');
            return api.permissions.contains(request); // No request or grant API is passed through.
          };
          invariant(await checkPermission({origins:['https://www.baidu.com/*']}),'E_PERMISSION','Baidu site permission is missing');
          target=createTaskAcceptanceTarget({runtime:{id:api.runtime.id,getURL:api.runtime.getURL.bind(api.runtime)},
            checkPermission,windowId:current.windowId,onEvent:audit});
          scope=await createTaskAcceptanceSession({source,sender:current.sender,hostInstanceId:current.hostInstanceId,
            target,audit,emit:event=>send({event})});
          if(closed||development.held||revision!==development.appliedRevision){scope.close();scope=null;
            invariant(false,'E_REVISION','Development revision changed during offline setup');}
          identity={documentId:current.sender.documentId,contextId:current.contextId,
            hostInstanceId:current.hostInstanceId,windowId:current.windowId,
            nativeContextWindowId:current.nativeContextWindowId,
            windowSource:current.nativeContextWindowId===-1?'trusted-host-window':'native-context',revision,
            installation:ACCEPTANCE_INSTALL,session:scope.session};
          await revalidate();
          return {identity,page:target.snapshot,registration:scope.registration};
        }catch(error){close();throw error;}
        finally{opening=false;}
      }
      try{
        invariant(scope,'E_REVISION','Offline session is not open');
        await revalidate(current);
      }catch(error){close();throw error;}
      if(type==='inspect')return {identity,events,dropped,...await scope.inspect()};
      if(type==='permission')return target.api.permissions.contains(payload);
      if(type==='page')return target.snapshot;
      if(type==='select-query'){
        invariant(!(await scope.inspect()).activeRunId,'E_TASK_BUSY','Offline target has an active run');
        return target.selectQuery(payload?.query);
      }
      if(type==='ui-attempt'){
        invariant(typeof payload?.requestId==='string'&&/^[a-f0-9-]{36}$/.test(payload.requestId)&&
          ['submitted','rejected-before-dispatch'].includes(payload.phase),'E_SCHEMA','Invalid offline attempt observation');
        audit({type:'ui-attempt',requestId:payload.requestId,phase:payload.phase});
        return true;
      }
      if(type==='request')return scope.request(payload?.method,payload?.args);
      invariant(false,'E_CAPABILITY','Unknown offline acceptance protocol operation');
    }
    port.onMessage.addListener(message=>{
      const id=message?.id;
      if(!Number.isSafeInteger(id)||id!==last+1){close();port.disconnect();return;}
      last=id;
      const method=message?.type==='request'?message.payload?.method:null;
      const changesTarget=message?.type==='open'||message?.type==='select-query'||
        ['startControllerRun','installTask','verifyTaskCandidate','makeTaskAvailable'].includes(method);
      // Selection and admission share a fence. Settlement/stop must remain
      // available independently of this fence so an active worker can retire.
      const lifecycle=['stopControllerRun','finishControllerRun','retireControllerTarget','fenceControllerAdmission'].includes(method);
      const result=lifecycle?handle(message):transitions.then(()=>handle(message));
      if(changesTarget)transitions=result.catch(()=>{});
      void result.then(data=>send({id,ok:true,data}),error=>{
        if(closed){try{port.postMessage({id,ok:false,error:projectFoundationError(error)});port.disconnect();}catch{}return;}
        send({id,ok:false,error:projectFoundationError(error)});
      });
    });
  });
}
