import * as React from 'react';

// UI-only primitives inherit the existing OpenDesk tokens and native semantics.
// React Aria / shadcn controls are a separate, still-unverified acceptance gate.
export function Button({children,className='',variant='secondary',...props}){
  const classes=['od-button',['primary','secondary','danger','quiet'].includes(variant)?'od-button--'+variant:'',className]
    .filter(Boolean).join(' ');
  return <button type="button" {...props} className={classes}>{children}</button>;
}
export function IconButton({children,label,className='',...props}){
  if(!label)throw new Error('IconButton requires an accessible label');
  return <button type="button" {...props} title={props.title||label}
    aria-label={label} className={['od-icon-button',className].filter(Boolean).join(' ')}>
    {children}
  </button>;
}
