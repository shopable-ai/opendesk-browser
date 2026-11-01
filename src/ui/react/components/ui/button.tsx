import * as React from 'react';
import {Button as ReactAriaButton} from 'react-aria-components';

// Shared native baseline plus an explicit React Aria interaction opt-in.
// Visual scope is selected independently by the application root.
export function Button({children,className='',variant='secondary',base='native',size='default',disabled,...props}){
  const classes=['od-button',['primary','secondary','danger','quiet','outline','link'].includes(variant)?'od-button--'+variant:'',className]
    .filter(Boolean).join(' ');
  // Existing consumers keep native semantics. The official theme pilot opts in
  // to real React Aria press/focus behavior without changing other tools.
  if(base==='aria')return <ReactAriaButton type="button" {...props} isDisabled={disabled||props.isDisabled}
    data-size={size} data-slot="button" className={classes}>{children}</ReactAriaButton>;
  return <button type="button" disabled={disabled} {...props} data-size={size} className={classes}>{children}</button>;
}
export function IconButton({children,label,className='',...props}){
  if(!label)throw new Error('IconButton requires an accessible label');
  return <button type="button" {...props} title={props.title||label}
    aria-label={label} className={['od-icon-button',className].filter(Boolean).join(' ')}>
    {children}
  </button>;
}
