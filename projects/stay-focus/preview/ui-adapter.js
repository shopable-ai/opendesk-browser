/* PREVIEW ONLY: compact compatibility controls for offline source review.
 * The real extension uses src/entrypoints/sidebar-shared-ui.js and React Aria.
 * This file must never be listed in tool.config.json or treated as native PASS. */
(()=>{
  'use strict';
  const R=globalThis.OpenDeskPageReact;
  if(R?.version!=='19.2.0')throw Error('Preview requires pinned React 19.2.0');
  const h=R.createElement;
  const variant=value=>['primary','secondary','danger','quiet'].includes(value)?value:'secondary';
  function Button({children,className='',variant:style='secondary',...props}){
    return h('button',{type:'button',...props,
      className:['od-button','od-button--'+variant(style),className].filter(Boolean).join(' ')},children);
  }
  function IconButton({children,label,className='',...props}){
    if(!label)throw Error('IconButton accessible label required');
    return h('button',{type:'button',...props,title:props.title||label,'aria-label':label,
      className:['od-icon-button',className].filter(Boolean).join(' ')},children);
  }
  function Card({className='',...props}){
    return h('div',{...props,className:['od-shared-card',className].filter(Boolean).join(' ')});
  }
  function CardContent({className='',...props}){
    return h('div',{...props,className:['od-shared-card-content',className].filter(Boolean).join(' ')});
  }
  // Native React Aria is NOT available in a zero-install static HTML file.
  // This semantic switch is an explicitly marked PREVIEW adapter only.
  function Switch({isSelected,onChange,className='',...props}){
    return h('button',{type:'button',role:'switch','aria-checked':Boolean(isSelected),
      ...props,disabled:props.isDisabled, 'data-selected':isSelected?'true':undefined,
      className:['od-shared-switch',className].filter(Boolean).join(' '),
      onClick:()=>onChange?.(!isSelected)},
      h('span',{className:'od-shared-switch-thumb','aria-hidden':true}));
  }
  Object.defineProperty(globalThis,'OpenDeskSidebarUI',{
    value:Object.freeze({Button,IconButton,Card,CardContent,Switch}),configurable:false,
    writable:false
  });
})();
