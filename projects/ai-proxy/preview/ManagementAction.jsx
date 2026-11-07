// Preview-only presentation. The original handler and frozen sidebar stay intact.
import * as React from 'react';
import {useEffect,useRef,useState} from 'react';
import {Button} from '@opendesk/ui';
import {ProxyIcon} from '../src/ui/ProxyIcon';
import {useI18n} from '../src/i18n/LocaleProvider';

export function ManagementAction({id,icon,label,destination,onClick}){
  const {t}=useI18n();
  const anchor=useRef(null);
  const [hovered,setHovered]=useState(false),[focused,setFocused]=useState(false),[dismissed,setDismissed]=useState(false);
  const open=(hovered||focused)&&!dismissed;
  const description=t('usageOpenFor',{site:destination});
  useEffect(()=>{
    if(!open)return;
    const owner=anchor.current?.ownerDocument;
    const dismiss=event=>{
      if(event.key!=='Escape')return;
      event.preventDefault();event.stopPropagation();setDismissed(true);
    };
    owner?.addEventListener('keydown',dismiss,true);
    return ()=>owner?.removeEventListener('keydown',dismiss,true);
  },[open]);
  return <span ref={anchor} className="apManagementAction"
    onPointerEnter={()=>{setHovered(true);setDismissed(false);}}
    onPointerLeave={()=>setHovered(false)}>
    <Button id={id} className="r86Icon apManagementIcon" aria-label={label}
      aria-describedby={id+'-tooltip'} onClick={onClick}
      onFocus={()=>{setFocused(true);setDismissed(false);}} onBlur={()=>setFocused(false)}>
      <ProxyIcon name={icon}/><span className="apManagementLaunch" aria-hidden="true">↗</span>
    </Button>
    <span id={id+'-tooltip'} className="apManagementTooltip" role="tooltip" hidden={!open}>
      <strong>{label}</strong><span>{description}</span>
    </span>
  </span>;
}
