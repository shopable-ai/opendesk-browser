import * as React from 'react';
import {Button,IconButton} from '../components/ui/button.tsx';
import {Input,Textarea} from '../components/ui/input.tsx';
import {Switch} from '../components/ui/switch.tsx';

function CompositionField({as:Field,value,onInput,onChange,onCompositionCommit,...props}){
  const input=React.useRef(null),composing=React.useRef(false);
  React.useLayoutEffect(()=>{
    const text=String(value??'');
    if(!composing.current&&input.current.value!==text)input.current.value=text;
  });
  const afterComposition=handler=>event=>{
    if(composing.current||event.nativeEvent.isComposing){event.stopPropagation();return;}
    handler?.(event);
  };
  // A controlled React input can restore its old value before the workbench
  // publishes the next snapshot, clearing Chromium's live composition range.
  return <Field {...props} ref={input} onInput={afterComposition(onInput)} onChange={afterComposition(onChange)}
    onCompositionStart={()=>{composing.current=true;}}
    onCompositionEnd={event=>{
      composing.current=false;
      if(event.currentTarget.value===String(value??''))return;
      onInput?.(event);onCompositionCommit(event);
    }}
    onBlur={()=>{composing.current=false;}}/>;
}

// A controlled React field. Callbacks are explicitly supplied by each page;
// there is no event registry or simulated DOM attached to the view model.
export function MyControl({view,as:Tag='div',id,children,onInput,onChange,onToggle,onCompositionCommit,controlBase='native',...props}){
  const field=view.field(id),isField=['input','textarea','select'].includes(Tag);
  const update=event=>{
    if(!isField)return;
    if(props.type==='checkbox'||props.type==='radio')field.checked=event.currentTarget.checked;
    else if(props.type==='file')field.files=event.currentTarget.files;
    else field.value=event.currentTarget.value;
    view.publish();
  };
  const dataset=Object.fromEntries(Object.entries(field.dataset).map(([key,value])=>[
    'data-'+key.replace(/[A-Z]/g,char=>'-'+char.toLowerCase()),value
  ]));
  const attributes={...props,...field.attributes,...dataset,id,
    hidden:Boolean(props.hidden||field.hidden),disabled:props.disabled||field.disabled||undefined,title:field.title??props.title,
    onInput:event=>{update(event);onInput?.(event);},
    onChange:event=>{update(event);onChange?.(event);}
  };
  if(Tag==='form'){
    const submit=props.onSubmit;
    attributes.onSubmit=event=>{event.preventDefault();submit?.(event);};
  }
  if(Tag==='details'){
    attributes.open=field.open;
    attributes.onToggle=event=>{field.open=event.currentTarget.open;view.publish();onToggle?.(event);};
  }
  if(isField&&props.type!=='file'){
    if(['checkbox','radio'].includes(props.type)){attributes.checked=Boolean(field.checked);attributes.value=field.value;}
    else attributes.value=field.value;
  }
  let content=field.text??children;
  if(Tag==='select'&&field.options)content=field.options.map((item,index)=>item.options
    ?<optgroup key={item.label+'-'+index} label={item.label}>{item.options.map(option=>
      <option key={option.value} value={option.value} disabled={option.disabled} title={option.title}>{option.label}</option>)}</optgroup>
    :<option key={item.value} value={item.value} disabled={item.disabled}>{item.label}</option>);
  if(Tag==='button'){
    const classes=(attributes.className||'').split(/\s+/);
    const icon=classes.includes('od-icon-button');
    attributes.className=classes.filter(name=>name!==(icon?'od-icon-button':'od-button')).join(' ');
    return icon
      ?<IconButton {...attributes} label={attributes['aria-label']||attributes.title}>{content}</IconButton>
      :<Button {...attributes} variant="plain">{content}</Button>;
  }
  if(controlBase==='switch'){
    const {checked,disabled,type,onInput:input,onChange:change,...switchProps}=attributes;
    return <Switch {...switchProps} isSelected={Boolean(field.checked)} isDisabled={Boolean(disabled)}
      onChange={selected=>{field.checked=selected;onChange?.();view.publish();}}/>;
  }
  if(onCompositionCommit&&(Tag==='input'||Tag==='textarea'))return <CompositionField
    {...attributes} as={controlBase==='aria'?(Tag==='input'?Input:Textarea):Tag} onCompositionCommit={onCompositionCommit}/>;
  if(controlBase==='aria'&&Tag==='input')return <Input {...attributes}/>;
  if(controlBase==='aria'&&Tag==='textarea')return <Textarea {...attributes}/>;
  return <Tag {...attributes}>{Tag==='input'||Tag==='textarea'?undefined:content}</Tag>;
}
