// Future visible Runner foundation. NOT wired to a message route or dispatch.
// Single Browser-executor owner, stored in the EXISTING frameworkKV IDB store.
// A HostOwnerLease is not a Task grant, start permit, Run, Result or slot.
import {invariant} from '../platform/protocol.js';

export const CLOUD_HOST_OWNER_KEY='cloud:host-owner:v1';
export const CLOUD_HOST_OWNER_TTL_MS=30000;
const STORES=['frameworkKV','commandJournal'];
const kinds=new Set(['side-panel','visible-runner']);

const sameToken=(stored,token)=>Boolean(stored&&token&&
  stored.registrationId===token.registrationId&&
  stored.documentId===token.documentId&&stored.namespace===token.namespace&&
  stored.ownerKind===token.ownerKind&&stored.generation===token.generation&&
  stored.fencingEpoch===token.fencingEpoch);

const tokenOf=record=>Object.freeze({
  ownerKind:record.ownerKind,namespace:record.namespace,
  registrationId:record.registrationId,documentId:record.documentId,
  generation:record.generation,fencingEpoch:record.fencingEpoch
});

export function createCloudHostOwnerLease({storage,currentHost,assertOwner,
  clock={now:()=>Date.now()},ttlMs=CLOUD_HOST_OWNER_TTL_MS}={}){
  invariant(typeof storage?.transaction==='function'&&typeof currentHost==='function'&&
    typeof assertOwner==='function'&&Number.isSafeInteger(ttlMs)&&ttlMs>=1000&&ttlMs<=60000,
  'E_SCHEMA','Owner lease requires storage, trusted sender gates and bounded TTL');

  async function authorize({ownerKind,host,sender}){
    invariant(kinds.has(ownerKind)&&host&&
      typeof host.namespace==='string'&&host.namespace.startsWith('tool:')&&
      typeof host.registrationId==='string'&&host.registrationId.length>0&&
      typeof host.hostDocumentId==='string'&&host.hostDocumentId.length>0,
    'E_OWNER','Only an existing trusted Browser Host may own cloud dispatch');
    // The caller MUST validate a native, visible extension document for this
    // ownerKind (Side Panel today; visible Runner will require its own guard).
    await assertOwner(ownerKind,sender);
    invariant(sender?.documentId===host.hostDocumentId,
      'E_OWNER','Owner document is not the registered Host document');
  }
  function currentTime(){
    const value=clock.now();
    invariant(Number.isSafeInteger(value)&&value>=0,'E_SCHEMA','Invalid lease clock');
    return value;
  }
  const transact=(mode,fn)=>storage.transaction(STORES,mode,fn);
  async function claim({ownerKind,host,sender}){
    await authorize({ownerKind,host,sender});
    return transact('readwrite',async tx=>{
      await currentHost(tx,host,sender);
      const time=currentTime(),old=await tx.get('frameworkKV',CLOUD_HOST_OWNER_KEY);
      if(old?.leaseUntil>time){
        invariant(old.namespace===host.namespace&&old.registrationId===host.registrationId&&
          old.documentId===host.hostDocumentId&&old.ownerKind===ownerKind,
        'E_OWNER','Cloud dispatch already has a different visible Host');
        const next={...old,leaseUntil:time+ttlMs};
        await tx.put('frameworkKV',next,CLOUD_HOST_OWNER_KEY);
        return {token:tokenOf(next),leaseUntil:next.leaseUntil};
      }
      // Keep tombstones and monotonic fencing across old-owner departure.
      const generation=(old?.generation??0)+1;
      const fencingEpoch=(old?.fencingEpoch??0)+1;
      invariant(Number.isSafeInteger(generation)&&Number.isSafeInteger(fencingEpoch),
        'E_OWNER','Owner generation exhausted');
      const lease={tag:'cloud-host-owner-v1',ownerKind,namespace:host.namespace,
        registrationId:host.registrationId,documentId:host.hostDocumentId,
        generation,fencingEpoch,leaseUntil:time+ttlMs};
      await tx.put('frameworkKV',lease,CLOUD_HOST_OWNER_KEY);
      return {token:tokenOf(lease),leaseUntil:lease.leaseUntil};
    });
  }
  async function assertDispatch(tx,{ownerKind,host,sender,token}){
    await authorize({ownerKind,host,sender});
    await currentHost(tx,host,sender);
    const record=await tx.get('frameworkKV',CLOUD_HOST_OWNER_KEY);
    invariant(sameToken(record,token)&&record.leaseUntil>currentTime(),
      'E_OWNER','Stale, expired or transferred Cloud Host owner');
    return true;
  }
  async function renew({ownerKind,host,sender,token}){
    await authorize({ownerKind,host,sender});
    return transact('readwrite',async tx=>{
      await currentHost(tx,host,sender);
      const record=await tx.get('frameworkKV',CLOUD_HOST_OWNER_KEY),time=currentTime();
      invariant(sameToken(record,token)&&record.leaseUntil>time,
        'E_OWNER','An expired owner cannot silently renew its old generation');
      const next={...record,leaseUntil:time+ttlMs};
      await tx.put('frameworkKV',next,CLOUD_HOST_OWNER_KEY);
      return {token:tokenOf(next),leaseUntil:next.leaseUntil};
    });
  }
  async function release({ownerKind,host,sender,token}){
    await authorize({ownerKind,host,sender});
    return transact('readwrite',async tx=>{
      await currentHost(tx,host,sender);
      const record=await tx.get('frameworkKV',CLOUD_HOST_OWNER_KEY);
      invariant(sameToken(record,token),'E_OWNER','A stale owner cannot release a newer Host');
      const fencingEpoch=record.fencingEpoch+1;
      invariant(Number.isSafeInteger(fencingEpoch),'E_OWNER','Owner epoch exhausted');
      await tx.put('frameworkKV',{...record,fencingEpoch,leaseUntil:currentTime()},CLOUD_HOST_OWNER_KEY);
      return {released:true,fencingEpoch};
    });
  }
  return Object.freeze({claim,renew,release,assertDispatch});
}
