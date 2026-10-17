import * as React from 'react';

// Adapted from shadcn/ui's React Aria Card registry (MIT).
// Shared UI v1 publishes only the Card/CardContent subset.
const classes=(...items)=>items.filter(Boolean).join(' ');
export function Card({className='',size='default',...props}){
  return <div data-slot="card" data-size={size} {...props}
    className={classes('od-shared-card',className)}/>;
}
export function CardContent({className='',...props}){
  return <div data-slot="card-content" {...props}
    className={classes('od-shared-card-content',className)}/>;
}
