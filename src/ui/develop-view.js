import {DEVELOPER_FIELDS} from './develop-fields.js';

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
    dependencies:{classic:null,network:null}},disposed=false,queued=false;
  function notify(){
    if(!queued){queued=true;queueMicrotask(()=>{queued=false;if(!disposed)for(const fn of subscribers)fn();});}
  }
  function patch(key,values){
    if(disposed)return;
    if(!fields[key])throw new Error('E_DEVELOPER_FIELD: '+key);
    if(Object.hasOwn(values,'textContent'))values={...values,textSet:true};
    Object.assign(fields[key],values);
    snapshot={...snapshot,fields:{...snapshot.fields,[key]:{...fields[key]}}};
    notify();
  }
  function patchDependencies(section,value){
    if(disposed)return;
    if(!Object.hasOwn(snapshot.dependencies,section))throw new Error('E_DEVELOPER_DEPENDENCIES: '+section);
    snapshot={...snapshot,dependencies:{...snapshot.dependencies,[section]:value}};notify();
  }
  return Object.freeze({fields,actions,patch,patchDependencies,
    getSnapshot:()=>snapshot,
    subscribe(fn){if(disposed)return ()=>{};subscribers.add(fn);return ()=>subscribers.delete(fn);},
    focus(key){snapshot={...snapshot,focus:{key,sequence:(snapshot.focus?.sequence||0)+1}};for(const fn of subscribers)fn();},
    resourceSnapshot:()=>({subscriptions:subscribers.size,actions:Object.keys(actions).length}),
    dispose(){disposed=true;subscribers.clear();for(const key of Object.keys(actions))delete actions[key];}
  });
}

export const createDeveloperModel=createDeveloperView;

// The optional legacy branch supports existing isolated controller consumers
// while their UI tests move to the same declared model. React never supplies a
// fake document or captures a DOM tree through these helpers.
export function patchDeveloperField(view,field,values){
  if(view)view.patch(field.key,values);
  else {const {data,...rest}=values;Object.assign(field,rest);if(data)Object.assign(field.dataset,data);}
}
export function developerOptions(view,field,rows){
  if(view)view.patch(field.key,{options:rows,value:rows.some(row=>row.value===field.value)?field.value:rows[0]?.value||''});
  else field.replaceChildren(...rows.map(({label,value})=>new Option(label,value)));
}
export function developerAction(view,field,event,action){
  if(view){view.actions[field.key]=action;return ()=>{if(view.actions[field.key]===action)delete view.actions[field.key];};}
  field.addEventListener(event,action);return ()=>field.removeEventListener(event,action);
}
export function appendDeveloperOptions(view,field,rows){
  if(view)view.patch(field.key,{options:[...field.options,...rows]});
  else field.append(...rows.map(({label,value})=>new Option(label,value)));
}
export function developerAttribute(view,field,name,value){
  if(view)view.patch(field.key,{[name==='aria-label'?'ariaLabel':name==='aria-live'?'ariaLive':name]:value??''});
  else if(value==null)field.removeAttribute(name);else field.setAttribute(name,value);
}
export function focusDeveloperField(view,field){if(view)view.focus(field.key);else field?.focus?.();}
