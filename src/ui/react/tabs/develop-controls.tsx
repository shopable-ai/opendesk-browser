import * as React from 'react';

const DevelopContext=React.createContext(null);
export function DevelopProvider({model,view=model,actions=view.actions,children}){
  const snapshot=React.useSyncExternalStore(view.subscribe,view.getSnapshot,view.getSnapshot);
  const refs=React.useRef(new Map());
  React.useLayoutEffect(()=>{const node=refs.current.get(snapshot.focus?.key);node?.focus();node?.scrollIntoView?.({block:'nearest'});},[snapshot.focus]);
  const value=React.useMemo(()=>({model:view,snapshot,actions,refs}),[view,snapshot,actions]);
  return <DevelopContext.Provider value={value}>{children}</DevelopContext.Provider>;
}

// The page declares every control in JSX; each binding reads one declared
// snapshot field. Selects receive options arrays, never captured DOM children.
export function DevelopField({as:Tag='div',id,children,...props}){
  const {model,snapshot,actions,refs}=React.useContext(DevelopContext);
  const field=snapshot.fields[id];
  if(!field)throw new Error('E_DEVELOPER_FIELD: '+id);
  const ref=React.useCallback(node=>{if(node)refs.current.set(id,node);else refs.current.delete(id);},[refs,id]);
  const attrs={...props,id,ref,hidden:field.hidden,disabled:field.disabled,
    title:field.title??props.title,className:field.className??props.className};
  for(const [key,value] of Object.entries(field.data||{}))attrs['data-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())]=value;
  for(const key of ['ariaLabel','ariaLive'])if(field[key]!==undefined)attrs[key==='ariaLabel'?'aria-label':'aria-live']=field[key];
  const invoke=(event,values)=>{if(values)model.patch(id,values,{immediate:true});actions[id]?.(event.nativeEvent);};
  if(Tag==='input'||Tag==='textarea'){
    attrs.readOnly=field.readOnly;
    if(props.type==='radio'||props.type==='checkbox'){
      attrs.checked=field.checked;attrs.value=field.value;
      const change=event=>{if(event.currentTarget.checked===model.fields[id].checked)return;invoke(event,{checked:event.currentTarget.checked});};
      attrs.onChange=change;
    }else{
      attrs.value=field.value;attrs.onChange=()=>{};
      attrs.onInput=event=>invoke(event,{value:event.currentTarget.value});
    }
    return <Tag {...attrs}/>;
  }
  if(Tag==='select')return <select {...attrs} value={field.value}
    onChange={event=>invoke(event,{value:event.currentTarget.value})}>
    {field.options.map(row=><option key={row.value} value={row.value} disabled={row.disabled}>{row.label}</option>)}
  </select>;
  if(Tag==='fieldset'&&id==='sdk-capabilities')return <fieldset {...attrs}>
    {children}
    {field.rows.map(row=><label key={row.value}>
      <input type="checkbox" name="sdk-capability" value={row.value} checked={row.checked} disabled={row.disabled}
        onChange={event=>invoke(event,{rows:model.fields[id].rows.map(current=>current.value===row.value
          ? {...current,checked:!current.disabled&&event.currentTarget.checked} : current)})}/>
      {' '+row.label+' '}
    </label>)}
  </fieldset>;
  if(Tag==='button'){attrs.type=props.type||'button';attrs.onClick=event=>invoke(event);}
  if(Tag==='details'){attrs.open=field.open;attrs.onToggle=event=>{if(event.currentTarget.open!==model.fields[id].open)model.patch(id,{open:event.currentTarget.open});};}
  if(id==='local-install-review')attrs.onKeyDown=event=>invoke(event);
  return <Tag {...attrs}>{field.textSet?field.textContent:children}</Tag>;
}
