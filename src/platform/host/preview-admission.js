import {invariant,canonical} from '../protocol.js';
import {assertPageInstallAuthorization} from '../../scripting/user-scripts/page-install-authorization.js';

export const MAX_INSTALLED_PARENT_INVOCATIONS=2;
const GROUP='installed-documents-v1';
const entries=slot=>slot?.preview?.kind===GROUP?slot.preview.entries:undefined;
const uncertain=row=>row.unknown===true||row.children?.some(child=>child.unknown===true);
export function installedPageReservation(slot,nonce){
  return entries(slot)?.find(row=>row.nonce===nonce||row.children?.some(child=>child.nonce===nonce))??
    (slot?.preview?.nonce===nonce?slot.preview:undefined);
}
function assertGroup(slot,session){
  const rows=entries(slot);
  invariant(!slot?.currentRunId&&(!slot?.preview||Array.isArray(rows)&&rows.length>0&&
    rows.length<=MAX_INSTALLED_PARENT_INVOCATIONS&&rows.every(row=>
      row.browserSessionIncarnation===session&&Array.isArray(row.children)&&
      typeof row.namespace==='string'&&typeof row.nonce==='string'&&!uncertain(row))),
    'E_OWNER','共享执行入口被占用或存在未知效果');
  return rows||[];
}
export function assertInstalledPageAvailable(slot,{session,namespace,programId,tabId,documentId,exclusive=false}){
  const rows=assertGroup(slot,session);
  invariant(rows.length<MAX_INSTALLED_PARENT_INVOCATIONS&&(!exclusive||!rows.length)&&
    rows.every(row=>!row.exclusive&&!(row.namespace===namespace&&row.installedProgramId===programId&&row.tabId===tabId&&row.documentId===documentId)),
    'E_OWNER','此文档或独占执行仍占用共享入口');
}
export function assertInstalledPageDispatch(slot,{nonce,executionKey,session,namespace,tabId,documentId}){
  assertGroup(slot,session);
  const row=installedPageReservation(slot,nonce);
  invariant(row&&row.executionKey===executionKey&&row.browserSessionIncarnation===session&&
    (namespace===undefined||row.namespace===namespace)&&row.tabId===tabId&&row.documentId===documentId,
    'E_OWNER','最终派发前精确文档的执行准入已经改变');
}

// One shared Authority slot, no Page RunHost or invented Controller runId.
export function createPreviewAdmission({storage,assertHost,currentHost,session}) {
  const unknown=new Set(),waiters=new Set(),invocations=new Map();
  let recovering=false;
  const changed=()=>{for(const wake of waiters)wake();waiters.clear();};
  const assertDispatch=()=>invariant(!recovering&&!unknown.size,'E_OWNER','存在未知页面效果；不派发新源码');
  const blockInstalled=nonce=>{
    // A trusted retirement can commit while Native's old promise is pending.
    // Its late rejection must not invent an owner with no remaining slot.
    if(invocations.get(nonce)?.retired)return;
    unknown.add(nonce);changed();
  };
  async function updateSlot(work){
    const cleared=[];
    await storage.transaction(['runs'],'readwrite',async tx=>{
      const slot=await tx.get('runs','@slot');
      if(await work(slot,cleared))await tx.put('runs',slot,'@slot');
    });
    // A failed durable update must retain the synchronous unknown fence.
    for(const nonce of cleared){unknown.delete(nonce);
      const invocation=invocations.get(nonce);if(invocation)invocation.retired=true;}
    changed();
  }
  return {
    assertDispatch,blockInstalled,
    assertInstalledTarget(slot,binding){
      assertDispatch();
      if(binding.nonce)assertInstalledPageDispatch(slot,{...binding,session});
      else assertInstalledPageAvailable(slot,{...binding,session});
    },
    async reserve(preview,sender) {
      const host=await assertHost(sender);
      await storage.transaction(['runs','commandJournal'],'readwrite',async tx=>{
        await currentHost(tx,host,sender);
        const slot=await tx.get('runs','@slot');
        invariant(!slot?.currentRunId&&!slot?.preview,'E_OWNER','执行入口被占用；未知的页面执行须关闭原标签页后再继续');
        await tx.put('runs',{...(slot||{tag:'slot',currentRunId:null}),preview:{...preview,registrationId:host.registrationId}},'@slot');
      });
    },
    async reserveFrame(preview,parent,sender) {
      const host=await assertHost(sender);
      return storage.transaction(['runs','commandJournal'],'readwrite',async tx=>{
        await currentHost(tx,host,sender);
        invariant(host.registrationId===parent.registrationId,'E_OWNER','原预览工作台已经改变');
        const slot=await tx.get('runs','@slot'),prior=slot?.preview;
        invariant(!slot?.currentRunId&&(!prior||prior.nonce===parent.nonce&&
          prior.registrationId===parent.registrationId&&prior.tabId===parent.tabId&&
          prior.documentId===parent.documentId&&prior.sourceHash===parent.sourceHash),
          'E_OWNER','资源入口被其他执行占用；不自动重试');
        if(prior)return {shared:true};
        await tx.put('runs',{...(slot||{tag:'slot',currentRunId:null}),preview:{...preview,
          registrationId:host.registrationId,frameParentNonce:parent.nonce}},'@slot');
        return {shared:false};
      });
    },
    async assertFrame(preview,parent,sender,{shared}) {
      const host=await assertHost(sender);
      await storage.transaction(['runs','commandJournal'],'readonly',async tx=>{
        await currentHost(tx,host,sender);
        const slot=await tx.get('runs','@slot'),prior=slot?.preview;
        invariant(host.registrationId===parent.registrationId&&!slot?.currentRunId&&
          prior?.nonce===(shared?parent.nonce:preview.nonce)&&prior.registrationId===parent.registrationId&&
          prior.tabId===parent.tabId&&prior.documentId===parent.documentId&&prior.sourceHash===parent.sourceHash&&
          (shared||prior.frameParentNonce===parent.nonce),'E_OWNER','资源最终派发前原预览准入已经改变');
      });
    },
    async reserveInstalled(preview,installation,{resource=false,exclusive=false}={}) {
      // The same slot is used by Controller, developer previews and installed
      // Page scripts. This internal call cannot manufacture a Host identity.
      assertDispatch();
      invariant(!invocations.has(preview.nonce),'E_OWNER','本次执行 nonce 已使用');
      invocations.set(preview.nonce,{retired:false});
      let reservation;
      try{reservation=await storage.transaction(['runs','frameworkKV'],'readwrite',async tx=>{
        assertDispatch();
        const grant=await tx.get('frameworkKV','page-installed:'+canonical([installation.namespace,installation.programId]));
        invariant(grant?.tag==='page-installed-v1'&&grant.enabled===true&&
          grant.namespace===installation.namespace&&grant.programId===installation.programId&&
          grant.revision===installation.revision&&grant.sourceHash===installation.sourceHash&&
          grant.token===installation.token&&grant.manifestHash===installation.manifestHash&&
          grant.sourceHash===preview.sourceHash,'E_PERMISSION','页面脚本已停用或安装版本已经改变');
        const authorization=assertPageInstallAuthorization(grant),capturedAuthorization=assertPageInstallAuthorization(installation);
        invariant(authorization.status==='active'&&capturedAuthorization.status==='active'&&
          authorization.installationId===capturedAuthorization.installationId&&
          authorization.generation===capturedAuthorization.generation,
          'E_PERMISSION','页面脚本安装授权已经改变');
        const execution=await tx.get('frameworkKV',installation.executionKey);
        invariant(execution?.tag==='page-execution-v1'&&
          (resource?['dispatched','completed'].includes(execution.state)&&
            typeof installation.receiptNonce==='string'&&installation.receiptNonce.length>0&&
            execution.receiptNonce===installation.receiptNonce:execution.state==='prepared')&&
          execution.executionKey===installation.executionKey&&execution.namespace===grant.namespace&&
          execution.programId===grant.programId&&execution.revision===grant.revision&&
          execution.installationId===authorization.installationId&&execution.grantGeneration===authorization.generation&&
          execution.browserSessionIncarnation===session&&execution.installationToken===grant.token&&
          execution.manifestHash===grant.manifestHash&&execution.sourceHash===preview.sourceHash&&
          execution.documentId===preview.documentId&&execution.tabId===preview.tabId,
          'E_OWNER','页面执行准入身份已经改变');
        const slot=await tx.get('runs','@slot');
        const rows=assertGroup(slot,session),parent=resource&&rows.find(row=>
          row.executionKey===execution.executionKey&&row.nonce===execution.receiptNonce&&
          row.namespace===installation.namespace&&row.tabId===preview.tabId&&row.documentId===preview.documentId&&
          row.sourceHash===preview.sourceHash);
        if(parent){
          invariant(parent.children.length<16&&!parent.children.some(child=>child.nonce===preview.nonce),
            'E_OWNER','子帧请求已准入或预算已满');
          parent.children.push({nonce:preview.nonce,unknown:false});
          await tx.put('runs',slot,'@slot');return {shared:true};
        }
        assertInstalledPageAvailable(slot,{session,...preview,namespace:grant.namespace,programId:grant.programId,exclusive});
        rows.push({...preview,namespace:grant.namespace,exclusive,settled:false,unknown:false,children:[],
          ...(resource?{resource:true,parentNonce:execution.receiptNonce}:{}),
          installedProgramId:grant.programId,manifestHash:grant.manifestHash,
          executionKey:installation.executionKey,browserSessionIncarnation:session});
        await tx.put('runs',{...(slot||{tag:'slot',currentRunId:null}),preview:{kind:GROUP,entries:rows}},'@slot');
        if(resource)return {shared:false};
        await tx.put('frameworkKV',{...execution,receiptNonce:preview.nonce},installation.executionKey);
      });}catch(error){invocations.delete(preview.nonce);throw error;}
      if(resource)return reservation;
    },
    async settleInstalled({nonce,dispatched,confirmed}){
      if(dispatched&&!confirmed)blockInstalled(nonce);
      await updateSlot((slot,cleared)=>{
        const rows=entries(slot),row=installedPageReservation(slot,nonce);
        if(!rows||!row)return false;
        if(row.nonce===nonce){row.settled=confirmed||!dispatched;row.unknown||=dispatched&&!confirmed;}
        else{
          const child=row.children.find(child=>child.nonce===nonce);
          if(dispatched&&!confirmed)child.unknown=true;
          else if(!child.unknown){row.children=row.children.filter(child=>child.nonce!==nonce);cleared.push(nonce);}
        }
        if(row.settled&&!uncertain(row)&&!row.children.length){
          slot.preview.entries=rows.filter(entry=>entry!==row);cleared.push(row.nonce);
        }
        if(!slot.preview.entries.length)delete slot.preview;
        return true;
      });
      invocations.delete(nonce);
    },
    async waitInstalledReservation({executionKey,receiptNonce,tabId,documentId}){
      for(;;){
        let wake;
        const next=new Promise(resolve=>{wake=resolve;waiters.add(wake);});
        const slot=await storage.transaction(['runs'],'readonly',tx=>tx.get('runs','@slot'));
        const pending=entries(slot)?.some(row=>row.executionKey===executionKey&&row.nonce===receiptNonce&&
          row.tabId===tabId&&row.documentId===documentId&&!uncertain(row));
        if(!pending){waiters.delete(wake);return;}
        await next;
      }
    },
    async recoverInstalled(observeGone){
      recovering=true;
      let pending=[];
      await updateSlot(slot=>{
        const rows=entries(slot);if(!rows)return false;
        pending=structuredClone(rows);
        for(const row of rows){if(!row.settled||row.unknown){row.unknown=true;unknown.add(row.nonce);}
          for(const child of row.children){child.unknown=true;unknown.add(child.nonce);}}
        return true;
      });
      // No replay; cached, live and unobservable UUIDs retain their fence.
      for(const row of pending){
        for(const child of row.children){
          let gone=false;try{gone=await observeGone({...row,resourceNonce:child.nonce})===true;}catch{}
          if(gone)await this.release({nonce:child.nonce});
        }
        if(!row.settled||row.unknown){
          let gone=false;try{gone=await observeGone({...row,...(row.resource?{resourceNonce:row.nonce}:{})})===true;}catch{}
          if(gone)await this.release({nonce:row.nonce});
        }
      }
      recovering=false;
    },
    async release({nonce,removedTabId,legacyOnly=false,installedResource}) {
      await updateSlot((slot,cleared)=>{
        const rows=entries(slot);
        if(installedResource){
          // Less-trusted retirement controls can release only their exact
          // child/standalone resource, never a main or another execution.
          const binding=installedResource,row=rows?.find(row=>
            row.namespace===binding.namespace&&row.executionKey===binding.executionKey&&
            row.browserSessionIncarnation===session&&row.tabId===binding.tabId&&row.documentId===binding.documentId&&
            (row.resource===true&&row.nonce===nonce&&row.parentNonce===binding.receiptNonce||
              row.nonce===binding.receiptNonce&&row.children.some(child=>child.nonce===nonce)));
          if(!row)return false;
          cleared.push(nonce);
          if(row.resource===true&&row.nonce===nonce)slot.preview.entries=rows.filter(entry=>entry!==row);
          else{
            row.children=row.children.filter(child=>child.nonce!==nonce);
            if(row.settled&&!uncertain(row)&&!row.children.length){
              slot.preview.entries=rows.filter(entry=>entry!==row);cleared.push(row.nonce);
            }
          }
          if(!slot.preview.entries.length)delete slot.preview;
          return true;
        }
        if(rows){
          if(legacyOnly)return false;
          let modified=false;
          slot.preview.entries=rows.filter(row=>{
            if(row.nonce===nonce||removedTabId!==undefined&&row.tabId===removedTabId){
              modified=true;cleared.push(row.nonce,...row.children.map(child=>child.nonce));return false;
            }
            row.children=row.children.filter(child=>{if(child.nonce!==nonce)return true;modified=true;cleared.push(child.nonce);return false;});
            if(row.settled&&!uncertain(row)&&!row.children.length){modified=true;cleared.push(row.nonce);return false;}
            return true;
          });
          if(!slot.preview.entries.length)delete slot.preview;
          return modified;
        }
        if(slot?.preview&&(nonce&&slot.preview.nonce===nonce||removedTabId!==undefined&&slot.preview.tabId===removedTabId)){
          cleared.push(slot.preview.nonce);delete slot.preview;return true;
        }
        return false;
      });
    }
  };
}
