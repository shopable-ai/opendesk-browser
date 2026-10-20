import * as React from 'react';

// Shared, presentation-only primitives. Callers retain provider credentials,
// permission checks, task execution and the business result journal.
export function ConversationTranscript({rows=[],entryClassName='workflow-chat-entry'}){
 return rows.map(row=><div key={row.id} className={entryClassName}
   data-speaker={row.speaker==='你'?'user':'assistant'}>
   <strong>{row.speaker}</strong><p>{row.message}</p>
  </div>);
}
export function ConversationInput({id,value='',onChange,onKeyDown,placeholder='',rows=2,maxLength=4000,
 disabled=false,className='',inputRef,...props}){
 return <textarea id={id} ref={inputRef} rows={rows} maxLength={maxLength}
  className={className} placeholder={placeholder} value={value} disabled={disabled}
  onChange={onChange} onKeyDown={onKeyDown} {...props}/>;
}
