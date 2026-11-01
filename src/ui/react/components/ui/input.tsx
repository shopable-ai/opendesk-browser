import * as React from 'react';
import {Input as AriaInput,TextArea as AriaTextArea,composeRenderProps} from 'react-aria-components';

// shadcn/ui React Aria Input structure, with canonical CSS rather than a second
// Tailwind palette. Explicit labels/help/errors remain owned by the form.
export function Input({className='',...props}){
  return <AriaInput {...props} data-slot="input" className={composeRenderProps(className,value=>['od-field',value].filter(Boolean).join(' '))}/>;
}
export function Textarea({className='',...props}){
  return <AriaTextArea {...props} data-slot="textarea" className={composeRenderProps(className,value=>['od-field',value].filter(Boolean).join(' '))}/>;
}
