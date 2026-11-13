import * as React from 'react';
type ProxyIconName = 'profile' | 'rules' | 'direct' | 'system' | 'play' | 'pause' | 'settings' | 'plus' | 'link' | 'edit' | 'trash' | 'selected' | 'check' | 'circle' | 'close' | 'lock' | 'import' | 'refresh' | 'copy' | 'more' | 'open' | 'globe' | 'star' | 'back';
export function ProxyIcon({name}:{name:ProxyIconName}) {
  return <svg className="sideUiIcon" width="16" height="16" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    focusable="false" aria-hidden="true">
    {name==='star'&&<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>}
    {name==='back'&&<path d="m14 6-6 6 6 6M8 12h13"/>}
    {name==='open'&&<path d="M7 17 17 7M7 7h10v10"/>}
    {name==='profile'&&<><rect x="3" y="3" width="18" height="8" rx="2"/><rect x="3" y="13" width="18" height="8" rx="2"/><path d="M7 7h.01M7 17h.01"/></>}
    {name==='rules'&&<><path d="M6 4h7a4 4 0 0 1 0 8H9a4 4 0 0 0 0 8h9"/><circle cx="6" cy="4" r="2"/><circle cx="18" cy="20" r="2"/></>}
    {name==='direct'&&<><rect x="2" y="3" width="20" height="13" rx="2"/><path d="M8 21h8m-4-5v5"/></>}
    {name==='play'&&<path d="m8 5 11 7-11 7z"/>}
    {name==='pause'&&<><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></>}
    {(name==='settings'||name==='system')&&<><circle cx="12" cy="12" r="3"/><path d="m10 2 4 0 .6 2.3 2 1 2.3-.9 2 3.2-1.5 1.9v2.6l1.5 1.9-2 3.2-2.3-.9-2 1L14 21h-4l-.6-2.3-2-1-2.3.9-2-3.2L4.6 13.5v-3l-1.5-1.9 2-3.2 2.3.9 2-1z"/></>}
    {name==='plus'&&<path d="M12 5v14M5 12h14"/>}
    {name==='edit'&&<><path d="m16 3 5 5-12 12H4v-5zM14 5l5 5"/></>}
    {name==='trash'&&<><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></>}
    {name==='selected'&&<><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>}
    {name==='check'&&<path d="m4 12 5 5L20 6"/>}
    {name==='circle'&&<circle cx="12" cy="12" r="9"/>}
    {name==='globe'&&<><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></>}
    {name==='close'&&<path d="m6 6 12 12M6 18 18 6"/>}
    {name==='import'&&<><path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/></>}
    {name==='refresh'&&<><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/></>}
    {name==='copy'&&<><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></>}
    {name==='more'&&<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>}
    {name==='lock'&&<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>}
    {name==='link'&&<><path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7"/></>}
  </svg>;
}
