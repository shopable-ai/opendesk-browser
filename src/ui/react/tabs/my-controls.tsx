import * as React from 'react';

// A controlled React field. Callbacks are explicitly supplied by each page;
// there is no event registry or simulated DOM attached to the view model.
export function MyControl({view,as:Tag='div',id,children,onInput,onChange,onToggle,...props}){
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
    hidden:Boolean(props.hidden||field.hidden),disabled:field.disabled||undefined,title:field.title??props.title,
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
  return <Tag {...attributes}>{Tag==='input'||Tag==='textarea'?undefined:content}</Tag>;
}
