import {parseControllerClassicDependencies} from '../scripting/user-scripts/controller-classic.js';
import {createChromePermissionConsent} from '../platform/chrome/permission-gate.js';

// Controller Classic owns only read-only source permission observation. The
// original Chrome consent and the trusted Run gesture remain the authority.
export function createControllerClassicReadiness({api,getSource,isCurrent,onState=()=>{}}){
  let disposed=false,epoch=0,warm=null,warmError=null;
  const consent=createChromePermissionConsent({api,onChange:schedule});
  function cancel(){
    epoch++;warm=null;warmError=null;
  }
  function schedule(){
    cancel();
    if(disposed||!isCurrent())return;
    const source=getSource(),ticket=epoch;
    let origins;
    try{
      const refs=parseControllerClassicDependencies(source);
      if(!refs.length){onState();return;}
      origins=[...new Set(refs.map(row=>new URL(row.url).origin+'/*'))];
    }catch(cause){warmError={source,cause};onState();return;}
    consent.prepare({origins}).then(observed=>{
      if(disposed||ticket!==epoch||!isCurrent()||source!==getSource())return;
      if(observed)warm={source,origins};
      onState();
    }).catch(cause=>{
      if(disposed||ticket!==epoch||!isCurrent()||source!==getSource())return;
      warmError={source,cause};onState();
    });
    onState();
  }
  function readyForRun(){
    if(!isCurrent())return true;
    const source=getSource();
    try{if(!parseControllerClassicDependencies(source).length)return true;}
    catch{return true;} // A malformed source reports its error on Run.
    return warm?.source===source||warmError?.source===source;
  }
  function confirmRun(event,source){
    if(disposed||!isCurrent()||source!==getSource())
      return Promise.reject({code:'E_CONTROLLER_CLASSIC_STALE',message:'Classic 运行环境或源码已变化'});
    const refs=parseControllerClassicDependencies(source);
    if(!refs.length)return Promise.resolve(true);
    if(warmError?.source===source)return Promise.reject(warmError.cause);
    if(warm?.source!==source)return Promise.reject(Object.assign(
      new Error('正在只读检查 Classic 来源权限，请检查完成后再次点击 Run'),
      {code:'E_PERMISSION_PENDING'}));
    return consent.confirm(event,{origins:warm.origins});
  }
  return Object.freeze({schedule,cancel,readyForRun,confirmRun,
    dispose(){if(disposed)return;disposed=true;cancel();consent.dispose();}});
}
