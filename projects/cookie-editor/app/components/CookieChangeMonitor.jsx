import * as React from 'react';
import {createCookieObservation} from '../controller/cookie-observation.js';
import CookieMonitorPopover from './CookieMonitorPopover.jsx';

export default function CookieChangeMonitor({adapter,controller,available,canApply=()=>true,onObservedChange=()=>{}}){
  const [state,setState]=React.useState({phase:'idle',expiresAt:0,gap:false});
  const [clock,setClock]=React.useState(Date.now);
  const gate=React.useRef(false);
  gate.current={available,canApply,onObservedChange};
  const [observer]=React.useState(()=>createCookieObservation({adapter,controller,onChange:setState,
    onObservedChange:()=>gate.current.onObservedChange(),
    canRun:()=>gate.current.available&&gate.current.canApply()&&document.visibilityState!=='hidden'}));
  React.useEffect(()=>{
    if(!available)observer.stop();
  },[available,observer]);
  React.useEffect(()=>{
    const visibility=()=>{if(document.visibilityState==='hidden')observer.stop();};
    document.addEventListener('visibilitychange',visibility);
    return ()=>{
      document.removeEventListener('visibilitychange',visibility);
      observer.dispose();
    };
  },[observer]);
  React.useEffect(()=>{
    if(state.phase!=='running')return;
    setClock(Date.now());
    const timer=window.setInterval(()=>{setClock(Date.now());void observer.poll();},500);
    return ()=>window.clearInterval(timer);
  },[observer,state.phase]);
  const remaining=Math.min(30,Math.max(0,Math.ceil((state.expiresAt-clock)/1000)));
  return <CookieMonitorPopover phase={state.phase} remaining={remaining} gap={state.gap}
    supported={adapter.supportsObservation()} available={available}
    onStart={()=>void observer.start()} onStop={()=>observer.stop('ended')}/>;
}
