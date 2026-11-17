import * as React from 'react';

const DevelopContext=React.createContext(null);
export const useDevelop=()=>React.useContext(DevelopContext);
export function DevelopProvider({model,view=model,actions=view.actions,children}){
  const snapshot=React.useSyncExternalStore(view.subscribe,view.getSnapshot,view.getSnapshot);
  const refs=React.useRef(new Map());
  React.useLayoutEffect(()=>{const node=refs.current.get(snapshot.focus?.key);node?.focus();node?.scrollIntoView?.({block:'nearest'});},[snapshot.focus]);
  const value=React.useMemo(()=>({model:view,snapshot,actions,refs}),[view,snapshot,actions]);
  return <DevelopContext.Provider value={value}>{children}</DevelopContext.Provider>;
}

// The page declares every control in JSX; each binding reads one declared
// snapshot field. Selects receive options arrays, never captured DOM children.
export function DevelopField({as:Tag='div',id,children,icon,...props}){
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
  if(Tag==='button'){attrs.type=props.type||'button';attrs.onClick=event=>{
    if(id==='script-run'||id==='script-save')model.navigate?.('editor');
    invoke(event);
  };}
  if(Tag==='details'){attrs.open=field.open;attrs.onToggle=event=>{if(event.currentTarget.open!==model.fields[id].open)model.patch(id,{open:event.currentTarget.open});};}
  if(id==='local-install-review')attrs.onKeyDown=event=>invoke(event);
  const content=field.textSet?field.textContent:children;
  return <Tag {...attrs}>{icon?<>{icon}<span>{content}</span></>:content}</Tag>;
}

// These are two native radios projecting the original single world field/action.
export function DevelopWorldChoices(){
  const {model,snapshot,actions,refs}=useDevelop();
  const id='script-javascript-world',field=snapshot.fields[id];
  return <fieldset id={id} className="developer-choices od-segmented" role="radiogroup"
    aria-label="JavaScript 运行位置" aria-describedby="developer-environment-hint"
    hidden={field.hidden} disabled={field.disabled}>
    {field.options.map(option=><label key={option.value} htmlFor={id+'-'+option.value}>
      <input id={id+'-'+option.value} ref={node=>{if(field.value===option.value){if(node)refs.current.set(id,node);else refs.current.delete(id);}}}
        type="radio" name={id} value={option.value} checked={field.value===option.value}
        disabled={field.disabled||option.disabled} onChange={event=>{
          if(!event.currentTarget.checked||field.disabled||field.value===option.value)return;
          model.patch(id,{value:option.value},{immediate:true});
          actions[id]?.(event.nativeEvent);
        }}/>
      <span>{option.label}</span>
    </label>)}
  </fieldset>;
}

export function DevelopIcon({name,className=''}){
  const paths={play:<path d="m8 5 11 7-11 7z"/>,stop:<rect x="6" y="6" width="12" height="12" rx="2"/>,
    copy:<><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>,
    refresh:<path d="M20 11a8 8 0 1 0-2.4 5.7M20 4v7h-7"/>,
    save:<path d="M5 4h12l3 3v13H4V4h1zm2 0v6h10V4m-11 16v-7h12v7"/>,
    globe:<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 4 6 4 9s-1 6-4 9m0-18c-3 3-4 6-4 9s1 6 4 9"/></>,
    code:<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>,
    clipboard:<><path d="M9 5H5v16h14V5h-4M8 10h8M8 14h8M8 18h5"/><rect x="9" y="3" width="6" height="4" rx="1"/></>,
    help:<><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4m.1 3h.01"/></>,
    chevron:<path d="m9 5 7 7-7 7"/>,dots:<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    settings:<><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1 2-2 2-2-.5-2 1-1 1.7H10l-1-1.7-2-1L5 19l-2-2 .5-2-1-2L1 12l1.5-1 1-2L3 7l2-2 2 .5 2-1L10 3h2.5l1 1.5 2 1 2-.5 2 2-.5 2 1 2 1.5 1-1.5 1z"/></>};
  return <svg className={['developer-icon',className].filter(Boolean).join(' ')} viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export function DevelopOptionsSummary({children,optional=false}){
  return <summary><DevelopIcon name="settings"/><span className="developer-option-title">{children}</span>
    {optional&&<span className="od-technical">可选</span>}<DevelopIcon name="chevron" className="od-disclosure-chevron"/></summary>;
}
