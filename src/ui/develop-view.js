import {DEVELOPER_FIELDS} from './develop-fields.js';
import {normalizeToolUiConfirmOptions,TOOL_UI_CONFIRM_TIMEOUT_MS} from '../sidebar-tools/ui-confirm.js';

// UI state only. There are no nodes, document facade, DOM queries or element
// events. The existing business controllers patch these explicit form fields;
// React renders them and calls the exported actions directly.
export function createDeveloperView(){
  const fields=Object.fromEntries(Object.entries(DEVELOPER_FIELDS).map(([key,initial])=>{
    const {dataset,options,...state}=initial;
    return [key,{key,value:'',textContent:'',hidden:false,disabled:false,checked:false,readOnly:false,
      open:false,textSet:Object.hasOwn(state,'textContent'),...state,data:{...dataset},options:(options||[]).map(([label,value])=>({label,value})),rows:[]}];
  }));
  const actions={},subscribers=new Set();
  let snapshot={fields:Object.fromEntries(Object.entries(fields).map(([key,state])=>[key,{...state}])),
    dependencies:{classic:null,network:null},section:'editor',confirmation:null,
    presentationActive:true,navigationGeneration:0,scriptPicker:{open:false,generation:0,pending:'',error:''}},disposed=false,queued=false;
  let pendingConfirmation=null,confirmationSequence=0;
  function settleConfirmation(identity,action,reason='user'){
    if(!pendingConfirmation||identity!==pendingConfirmation.identity)return;
    const pending=pendingConfirmation;pendingConfirmation=null;
    clearTimeout(pending.timer);
    snapshot={...snapshot,confirmation:null};
    pending.resolve({action:action==='confirm'?'confirm':'cancel',reason});
    if(!disposed)notify(true);
  }
  const cancelConfirmation=reason=>settleConfirmation(pendingConfirmation?.identity,'cancel',reason);
  function notify(immediate=false){
    // Controlled inputs must publish before React restores their value at the
    // end of the native input event. Result/status projections stay batched.
    if(immediate){for(const fn of subscribers)fn();return;}
    if(!queued){queued=true;queueMicrotask(()=>{queued=false;if(!disposed)for(const fn of subscribers)fn();});}
  }
  function patch(key,values,{immediate=false}={}){
    if(disposed)return;
    if(!fields[key])throw new Error('E_DEVELOPER_FIELD: '+key);
    if(Object.hasOwn(values,'textContent'))values={...values,textSet:true};
    // Keep one React snapshot for unchanged scalar controls during Run/Result.
    // Object payloads still publish because their contents may be mutated in place.
    if(Object.entries(values).every(([name,value])=>
      (value===null||typeof value!=='object'&&typeof value!=='function')&&
      Object.is(fields[key][name],value)&&Object.is(snapshot.fields[key][name],value)))return;
    Object.assign(fields[key],values);
    snapshot={...snapshot,fields:{...snapshot.fields,[key]:{...fields[key]}}};
    notify(immediate);
  }
  function patchDependencies(section,value){
    if(disposed)return;
    if(!Object.hasOwn(snapshot.dependencies,section))throw new Error('E_DEVELOPER_DEPENDENCIES: '+section);
    snapshot={...snapshot,dependencies:{...snapshot.dependencies,[section]:value}};notify();
  }
  function setScriptPickerOpen(open){
    if(disposed||snapshot.scriptPicker.open===open)return;
    snapshot={...snapshot,scriptPicker:{open,generation:snapshot.scriptPicker.generation+1,pending:'',error:''}};
    notify(true);
  }
  return Object.freeze({fields,actions,patch,patchDependencies,
    setScriptPickerOpen,
    patchScriptPicker(values){if(!disposed){snapshot={...snapshot,scriptPicker:{...snapshot.scriptPicker,...values}};notify();}},
    // Business owners retain target/revision checks; this is only a choice in
    // the existing trusted React tree, never execution or browser authority.
    requestConfirmation(options){
      if(disposed)return Promise.resolve({action:'cancel',reason:'disposed'});
      if(!snapshot.presentationActive)return Promise.resolve({action:'cancel',reason:'hidden'});
      if(pendingConfirmation)return Promise.reject(Object.assign(new Error('已有待处理确认'),{code:'E_UI_CONFIRM_BUSY'}));
      const checked=normalizeToolUiConfirmOptions(options);
      if(!checked)return Promise.reject(Object.assign(new Error('确认内容无效'),{code:'E_UI_CONFIRM_INPUT'}));
      const identity=++confirmationSequence;
      return new Promise(resolve=>{
        pendingConfirmation={identity,resolve,timer:setTimeout(()=>settleConfirmation(identity,'cancel','timeout'),TOOL_UI_CONFIRM_TIMEOUT_MS)};
        snapshot={...snapshot,confirmation:{...checked,identity}};notify(true);
      });
    },
    settleConfirmation,cancelConfirmation,
    setPresentationActive(active,reason='hidden'){
      if(disposed||snapshot.presentationActive===active)return;
      if(!active)setScriptPickerOpen(false);
      snapshot={...snapshot,presentationActive:active,navigationGeneration:snapshot.navigationGeneration+1};
      if(!active)cancelConfirmation(reason);
      notify(true);
    },
    // Local presentation only; changing a section never dispatches a controller action.
    navigate(section,{returnFocusId=''}={}){
      if(disposed||!['editor','save','library','history','install','diagnostics'].includes(section))return;
      setScriptPickerOpen(false);
      cancelConfirmation('navigation');
      if(section==='history')patch('script-history-panel',{open:true});
      snapshot={...snapshot,section,navigationGeneration:snapshot.navigationGeneration+1,
        returnFocusId:section==='editor'?returnFocusId||snapshot.returnFocusId:returnFocusId};
      notify(true);
    },
    getSnapshot:()=>snapshot,
    subscribe(fn){if(disposed)return ()=>{};subscribers.add(fn);return ()=>subscribers.delete(fn);},
    focus(key){
      if(disposed)return;
      if(!fields[key])throw new Error('E_DEVELOPER_FIELD: '+key);
      snapshot={...snapshot,focus:{key,sequence:(snapshot.focus?.sequence||0)+1}};
      for(const fn of subscribers)fn();
    },
    resourceSnapshot:()=>({subscriptions:subscribers.size,actions:Object.keys(actions).length}),
    dispose(){setScriptPickerOpen(false);disposed=true;cancelConfirmation('disposed');subscribers.clear();for(const key of Object.keys(actions))delete actions[key];}
  });
}

// Business controllers publish through the declared view. The real document
// belongs to RunHost and React, never to these field/action helpers.
export function patchDeveloperField(view,field,values){
  view.patch(field.key,values);
}
export function developerOptions(view,field,rows){
  view.patch(field.key,{options:rows,value:rows.some(row=>row.value===field.value)?field.value:rows[0]?.value||''});
}
export function developerAction(view,field,event,action){
  view.actions[field.key]=action;return ()=>{if(view.actions[field.key]===action)delete view.actions[field.key];};
}
export function appendDeveloperOptions(view,field,rows){
  view.patch(field.key,{options:[...field.options,...rows]});
}
export function developerAttribute(view,field,name,value){
  view.patch(field.key,{[name==='aria-label'?'ariaLabel':name==='aria-live'?'ariaLive':name]:value??''});
}
export function focusDeveloperField(view,field){view.focus(field.key);}
