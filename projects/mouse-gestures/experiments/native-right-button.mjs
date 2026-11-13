// OFFLINE DESIGN EXPERIMENT ONLY. Not imported by the tool or Native Host.
// Inputs (including every binding) are fabricated fixtures, never grants.
// Outputs describe proposed effects; there is deliberately no input/post API.
import {createGestureTrack,updateGestureTrack,gestureOutcome,
  normalizeGestureMappings} from '../src/page/segments.js';

export const NATIVE_ADAPTER=Object.freeze({
  enabled:false,
  capture:'NOT_IMPLEMENTED',
  atomicDocumentDelivery:'NOT_IMPLEMENTED',
  menuVerification:'NOT_TESTED'
});

// A requirements vector, NOT a public SDK or a token the page can mint.
export const FIXTURE_IDENTITY_FIELDS=Object.freeze([
  'pid','processStart','nativeWindow','browserSession','nativeConnection',
  'chromeWindow','tab','document','url','origin','installation',
  'packageSha256','pageRevision','hitTestRevision'
]);
function bindingKey(binding){
  if(!binding||!FIXTURE_IDENTITY_FIELDS.every(field=>
    typeof binding[field]==='string'&&binding[field].length>0))return null;
  try{
    const url=new URL(binding.url);
    if(!['http:','https:'].includes(url.protocol)||url.origin!==binding.origin)return null;
  }catch{return null;}
  return JSON.stringify(FIXTURE_IDENTITY_FIELDS.map(field=>binding[field]));
}
const pointOK=e=>Number.isFinite(e.x)&&Number.isFinite(e.y);
const modified=e=>Boolean(e.ctrlKey||e.metaKey||e.altKey||e.shiftKey);
const released=e=>e.type==='rightUp'&&e.source==='physical'&&e.buttons===0;
const pass=(reason)=>({decision:'pass',reason});

export function createOfflineHoldModel({simulate=false,mappings={},maxHoldMs=10000}={}){
  if(!Number.isFinite(maxHoldMs)||maxHoldMs<=0)throw Error('E_MODEL_TIMEOUT');
  const map=normalizeGestureMappings(mappings);
  let state='idle',session=null,generation=0,lastTime=-Infinity,admissionClosed=false;
  // Once a right-down was withheld, cancellation must still drain its up.
  let draining=false;
  function cancel(reason,{streamLost=false}={}){
    generation++;
    if(state==='holding')draining=!streamLost;
    session=null;state=streamLost?'unknown':'canceled';
    return {decision:'cancel',reason,generation,draining};
  }
  function step(e){
    if(!simulate)return pass('simulation-disabled');
    if(state==='unknown')return pass('stream-unknown-recreate-model');
    // Retired replies cannot mutate a new gesture's clock or watchdog state.
    if(e.type==='authorization'&&(state!=='awaiting-authorization'||e.generation!==generation))
      return {decision:'ignore',reason:'stale-authorization'};
    if(['rightDown','rightDrag','rightUp','leftDown','middleDown','keyboardMenu','controlClick'].includes(e.type)&&
      e.source!=='physical')return pass('nonphysical-input');
    if(!Number.isFinite(e.at)||e.at<lastTime)return cancel('invalid-clock');
    lastTime=e.at;
    if(e.type==='tapLost')return cancel('tap-lost-no-replay',{streamLost:true});
    if(['off','revoked','disconnect'].includes(e.type))admissionClosed=true;
    if(['escape','blur','hidden','off','revoked','navigation','disconnect','timeout'].includes(e.type))
      return cancel(e.type);
    if(draining&&e.type==='rightUp'){
      if(released(e))draining=false;
      return {decision:'suppress',reason:'drain-original-up'};
    }
    if(draining&&e.type==='rightDrag')return {decision:'suppress',reason:'drain-original-drag'};
    if(e.type==='rightDown'){
      if(state==='holding'||draining){
        cancel('broken-button-sequence');
        return {decision:'suppress',reason:'broken-button-sequence'};
      }
      cancel('new-click');
      const key=bindingKey(e.binding);
      if(admissionClosed||e.source!=='physical'||e.buttons!==2||modified(e)||e.excluded||
        e.authorized!==true||!pointOK(e)||!key)return pass('ineligible');
      session={key,start:{x:e.x,y:e.y},startedAt:e.at,
        track:createGestureTrack(e.x,e.y)};
      state='holding';return {decision:'suppress',reason:'fixture-held',generation};
    }
    if(['leftDown','middleDown','keyboardMenu','controlClick'].includes(e.type)){
      cancel('other-input');return pass('ordinary-input');
    }
    if((state==='holding'||state==='awaiting-authorization')&&e.at-session.startedAt>=maxHoldMs){
      const canceled=cancel('watchdog');
      if(e.type==='rightUp'){if(released(e))draining=false;return {decision:'suppress',reason:'watchdog-up'};}
      if(e.type==='rightDrag')return {decision:'suppress',reason:'watchdog'};
      return canceled;
    }
    if(e.type==='observation'&&(state==='holding'||state==='awaiting-authorization')){
      if(e.authorized!==true||e.excluded||modified(e)||bindingKey(e.binding)!==session.key)
        return cancel('observation-invalidated');
      return {decision:'ignore',reason:'observation-unchanged'};
    }
    if(state==='awaiting-authorization'&&['rightDrag','rightUp'].includes(e.type))
      return cancel('broken-button-sequence');
    if(state==='holding'&&['rightDrag','rightUp'].includes(e.type)){
      if(e.source!=='physical'||e.authorized!==true||modified(e)||e.excluded||
        !pointOK(e)||bindingKey(e.binding)!==session.key||
        (e.type==='rightDrag'?e.buttons!==2:e.buttons!==0)){
        cancel('target-or-input-changed');
        if(released(e))draining=false;
        return {decision:'suppress',reason:'target-or-input-changed'};
      }
      updateGestureTrack(session.track,e.x,e.y);
      if(e.type==='rightDrag')return {decision:'suppress',reason:'fixture-tracking'};
      const result=gestureOutcome(session.track,map);
      // Only sub-intent jitter proposes a click. Invalid/short/unmapped drags
      // never accidentally become clicks or fall back to the first direction.
      const proposal=result.action?{kind:'gesture',action:result.action}:
        !session.track.intent?{kind:'original-click',...session.start}:null;
      if(!proposal){session=null;state='finished';return {decision:'suppress',reason:'no-action'};}
      session.proposal=proposal;state='awaiting-authorization';
      return {decision:'suppress',reason:'fresh-authorization-required',generation};
    }
    if(e.type==='authorization'){
      if(e.at-session.startedAt>=maxHoldMs||e.authorized!==true||e.excluded||modified(e)||
        bindingKey(e.binding)!==session.key)return cancel('authorization-invalid');
      const proposal=session.proposal;
      session=null;state='finished';
      return {decision:'proposal-only',proposal,generation,
        delivery:'NOT_IMPLEMENTED',menuVisible:'NOT_TESTED'};
    }
    return pass('unrelated');
  }
  return Object.freeze({step,inspect:()=>({state,generation,draining,admissionClosed})});
}
