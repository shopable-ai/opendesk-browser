// Pure UI draft manipulation shared by Workflow and its source-bound preview.
/** A suggestion is draft text, not a Provider identity or an executable command.
 * Returns a new immutable value; never submits a turn or mutates RunHost. */
export function appendWorkflowSuggestionDraft(draft,suggestion,maxLength=4000){
 const original=String(draft??''),instruction=String(suggestion??'').trim();
 if(!instruction)return {value:original,kind:'empty'};
 const normalized=original.replace(/\r\n/g,'\n');
 let index=normalized.indexOf(instruction);
 while(index>=0){
  const before=index===0||normalized[index-1]==='\n';
  const after=index+instruction.length===normalized.length||
   normalized[index+instruction.length]==='\n';
  if(before&&after)return {value:original,kind:'duplicate'};
  index=normalized.indexOf(instruction,index+1);
 }
 const separator=!original.trim()?'':original.endsWith('\n')?'\n':'\n\n';
 const value=original+separator+instruction;
 return value.length>maxLength?{value:original,kind:'too_long'}:
  {value,kind:original.trim()?'appended':'filled'};
}

