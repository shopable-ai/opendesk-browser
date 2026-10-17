// Adapted from the official shadcn/ui React Aria Switch registry (MIT).
// Accessible input, keyboard/focus and state behavior come from real
// react-aria-components, never from a native checkbox imitation.
import {composeRenderProps,Switch as AriaSwitch} from 'react-aria-components';

export function Switch({className='',size='default',children,...props}){
  return <AriaSwitch data-slot="switch" data-size={size}
    className={['od-shared-switch',className].filter(Boolean).join(' ')}
    {...props}>
    {composeRenderProps(children,(content,{isSelected})=><>
      <span data-slot="switch-thumb" data-selected={isSelected||undefined}
        className="od-shared-switch-thumb" aria-hidden="true"/>
      {content}
    </>)}
  </AriaSwitch>;
}
