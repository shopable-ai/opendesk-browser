// Test driver for controller fields/actions, separate from DOM fixtures.
export function developerTestFields(view){
  return id=>{
    const field=view.fields[id];
    if(!field)return undefined;
    if(!field.fire){
      Object.defineProperty(field,'dataset',{get:()=>field.data});
      field.fire=(_type,event={})=>view.actions[id]?.({isTrusted:true,target:field,currentTarget:field,...event});
    }
    return field;
  };
}
