import {createElement, useCallback, useEffect, useReducer, useState} from 'react';
import {counter} from './counter.js';
import {demoConfig} from './demo-config.js';

// Portable R24.3 component. OpenDesk owns the floating Shadow DOM host,
// root creation, runtime authorization and managed Stop/unmount.
const h=createElement;
function readPage(){
  return {
    title:(document.title?.trim()||'未命名网页').slice(0,180),
    host:globalThis.location?.host||'当前网页',
    path:(globalThis.location?.pathname||'/').slice(0,160)
  };
}
const styles={
  panel:{boxSizing:'border-box',display:'grid',gap:'10px',padding:'13px',
    width:'min(316px, calc(100vw - 24px))',maxHeight:'calc(100dvh - 32px)',
    overflowY:'auto',font:'13px/1.5 system-ui, sans-serif',color:'CanvasText',
    background:'Canvas',colorScheme:'light dark',border:'1px solid ButtonBorder',
    borderRadius:'13px',boxShadow:'0 12px 36px #0003'},
  heading:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'10px'},
  name:{fontWeight:750,fontSize:'13px'},
  pill:{fontSize:'11px',color:'GrayText',whiteSpace:'nowrap'},
  page:{display:'grid',gap:'3px',minWidth:0},
  title:{fontWeight:650,overflowWrap:'anywhere',maxHeight:'3em',overflow:'hidden'},
  url:{fontSize:'11px',color:'GrayText',overflowWrap:'anywhere',maxHeight:'3em',overflow:'hidden'},
  actions:{display:'flex',flexWrap:'wrap',gap:'7px'},
  button:{minHeight:'35px',padding:'7px 10px',cursor:'pointer',borderRadius:'8px',
    border:'1px solid ButtonBorder',color:'ButtonText',background:'ButtonFace',font:'inherit'},
  footer:{fontSize:'11px',color:'GrayText',margin:0}
};

export default function App(){
  const [count,dispatch]=useReducer(counter,0);
  const [page,setPage]=useState(readPage);
  const [collapsed,setCollapsed]=useState(false);
  const increment=useCallback(()=>dispatch('increment'),[]);
  const refresh=useCallback(()=>setPage(readPage()),[]);
  useEffect(()=>{
    // Navigation events are cheap; manual refresh covers pushState-only SPAs.
    const types=['popstate','hashchange','pageshow'];
    for(const type of types)globalThis.addEventListener(type,refresh);
    return ()=>{for(const type of types)globalThis.removeEventListener(type,refresh);};
  },[refresh]);

  return h('section',{
    'data-opendesk-example':'react-direct-portable',
    'aria-label':'OpenDesk React 页面悬浮演示',
    style:collapsed?{...styles.panel,width:'min(196px, calc(100vw - 24px))'}:styles.panel
  },
    h('div',{style:styles.heading},
      h('strong',{style:styles.name},demoConfig.title),
      h('span',{style:styles.pill},'已在当前网页运行')),
    !collapsed&&h('div',{style:styles.page},
      h('span',{style:styles.title,title:page.title},page.title),
      h('span',{style:styles.url},page.host+page.path)),
    !collapsed&&h('div',{style:styles.actions},
      // Preserve first-button counter behavior for the existing native test.
      h('button',{type:'button',style:styles.button,onClick:increment,
        'data-opendesk-action':'count'},'已点击 '+count+' 次'),
      h('button',{type:'button',style:styles.button,onClick:refresh,
        'data-opendesk-action':'refresh'},'刷新信息')),
    h('div',{style:styles.actions},
      h('button',{type:'button',style:styles.button,onClick:()=>setCollapsed(v=>!v),
        'aria-expanded':!collapsed,'data-opendesk-action':'collapse'},collapsed?'展开':'收起')),
    !collapsed&&h('p',{style:styles.footer},
      '只展示网页标题与路径，不读取表单、不修改网站数据。使用开发面板「停止」卸载。')
  );
}
