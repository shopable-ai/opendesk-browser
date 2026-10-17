import * as React from 'react';

// Controlled native switch with React Aria-compatible prop names.
// Unlike react-aria-components itself, this is not an upstream official control.
export function Switch({isSelected=false,onChange,isDisabled=false,className='',...props}){
  return <label className={['od-shared-switch',className].filter(Boolean).join(' ')}>
    <input {...props} type="checkbox" role="switch" checked={Boolean(isSelected)}
      disabled={Boolean(isDisabled)} onChange={event=>onChange?.(event.target.checked)}/>
    <span className="od-shared-switch-track" aria-hidden="true">
      <span className="od-shared-switch-thumb"/>
    </span>
  </label>;
}
