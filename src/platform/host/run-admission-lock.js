// Shared by native Run admission and Offscreen idle-check-close. This lock
// coordinates the existing RunHost; it does not own Runs or their durable slot.
export const RUN_ADMISSION_LOCK='opendesk.run-admission.v1';

export async function withRunAdmissionLock(operation,{
  locks=globalThis.navigator?.locks,allowWithoutLocks=false
}={}){
  if(typeof locks?.request==='function')
    return locks.request(RUN_ADMISSION_LOCK,{mode:'exclusive'},operation);
  // Only explicit non-native test fixtures may bypass Web Locks.
  if(allowWithoutLocks)return operation();
  throw Object.assign(new Error('Web Locks are required for Run admission'),{code:'E_RUN_ADMISSION_LOCK'});
}
