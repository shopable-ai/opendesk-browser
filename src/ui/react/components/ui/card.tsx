import * as React from 'react';

// Shared card semantics/styles live in the browser bundle, not the tool package.
export function Card({className='',...props}){
  return <div data-slot="card" {...props}
    className={['od-shared-card',className].filter(Boolean).join(' ')}/>;
}
export function CardContent({className='',...props}){
  return <div data-slot="card-content" {...props}
    className={['od-shared-card-content',className].filter(Boolean).join(' ')}/>;
}
