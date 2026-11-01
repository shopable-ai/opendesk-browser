import * as React from 'react';
type ProxyIconName = 'profile' | 'rules' | 'direct' | 'system' | 'play' | 'pause' | 'settings' | 'plus' | 'link' | 'edit' | 'trash' | 'selected' | 'circle' | 'close' | 'lock' | 'import' | 'refresh' | 'copy' | 'more';
export function ProxyIcon({name}:{name:ProxyIconName}) {
  return <svg className="sideUiIcon" width="16" height="16" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    focusable="false" aria-hidden="true">
    {name==='profile'&&<><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/></>}
    {name==='rules'&&<><path d="M4 6h16M4 12h10M4 18h16"/><circle cx="18" cy="12" r="2"/></>}
    {name==='direct'&&<path d="M4 12h15m-5-5 5 5-5 5"/>}
    {name==='system'&&<><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8m-4-3v3"/></>}
    {name==='play'&&<path d="m8 5 11 7-11 7z"/>}
    {name==='pause'&&<><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></>}
    {name==='settings'&&<><path d="M9.8 3.2h4.4l.6 2.1 1.5.9 2.1-.6 2.2 3.8-1.5 1.5v2.2l1.5 1.5-2.2 3.8-2.1-.6-1.5.9-.6 2.1H9.8l-.6-2.1-1.5-.9-2.2-3.8 1.5-1.5v-2.2L3.4 9.4l2.2-3.8 2.1.6 1.5-.9z"/><circle cx="12" cy="12" r="3"/></>}
    {name==='plus'&&<path d="M12 5v14M5 12h14"/>}
    {name==='edit'&&<><path d="m16 3 5 5-12 12H4v-5zM14 5l5 5"/></>}
    {name==='trash'&&<><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></>}
    {name==='selected'&&<><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>}
    {name==='circle'&&<circle cx="12" cy="12" r="9"/>}
    {name==='close'&&<path d="m6 6 12 12M6 18 18 6"/>}
    {name==='import'&&<><path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/></>}
    {name==='refresh'&&<><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/></>}
    {name==='copy'&&<><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></>}
    {name==='more'&&<><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>}
    {name==='lock'&&<><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>}
    {name==='link'&&<><path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7"/></>}
  </svg>;
}
