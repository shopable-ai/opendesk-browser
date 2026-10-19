// Test driver for controller fields/actions, separate from DOM fixtures.
export function developerTestFields(view, legacyFind){
  return id=>{
    const field=view?.fields[id];
    if(!field)return legacyFind(id);
    if(!field.fire){
      Object.defineProperty(field,'dataset',{get:()=>field.data});
      field.fire=(_type,event={})=>view.actions[id]?.({target:field,currentTarget:field,...event});
    }
    return field;
  };
}
