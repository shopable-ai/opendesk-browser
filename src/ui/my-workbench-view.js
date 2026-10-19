import {myWorkbenchDefaults} from './my-workbench-defaults.js';

// Plain presentation records + named UI actions. No DOM mirrors, observers,
// element shims, task identities, permission decisions or execution authority.
export function createMyWorkbenchView(_options={}){
  const fields=new Map(),subscribers=new Set(),actions={};
  const data={taskRows:{rows:[]},taskHistory:[],planRows:{plans:[]},managerRows:{rows:[]}};
  let version=0,queued=false;
  function publish(){
    version++;
    if(queued)return;queued=true;
    queueMicrotask(()=>{queued=false;for(const fn of [...subscribers])fn();});
  }
  function field(id){
    if(!fields.has(id))fields.set(id,{value:'',hidden:false,disabled:false,
      ...myWorkbenchDefaults[id],attributes:{},dataset:{}});
    return fields.get(id);
  }
  function action(callback){return (...args)=>{
    try{
      const result=callback(...args);publish();
      return result?.then?result.finally(publish):result;
    }catch(error){publish();throw error;}
  };}
  return {
    field,data,actions,publish,action,
    subscribe:fn=>{subscribers.add(fn);return ()=>subscribers.delete(fn);},
    getSnapshot:()=>version,
    project(key,value){data[key]=value;publish();},
    setText(id,text){field(id).text=String(text??'');publish();},
    setValue(id,value){field(id).value=value;publish();},
    options(id,values){field(id).options=values;publish();},
    resetScheduleForm(){for(const [id,initial]of Object.entries(myWorkbenchDefaults))
      if(id.startsWith('schedule-')&&(Object.hasOwn(initial,'value')||Object.hasOwn(initial,'checked'))){
        if(Object.hasOwn(initial,'value'))field(id).value=initial.value;
        if(Object.hasOwn(initial,'checked'))field(id).checked=initial.checked;
      }
      for(const day of [0,1,2,3,4,5,6])field('my-weekday-'+day).checked=day===1;
      publish();
    },
    get subscriberCount(){return subscribers.size;}
  };
}
