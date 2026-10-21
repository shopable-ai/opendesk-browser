// Display-only contract between the existing sandbox Bridge and trusted ToolHost.
// No SDK operation, origin grant, tool history, or arbitrary DOM action is carried here.
const PAGE=/^[a-z][a-z0-9-]{0,31}$/;
const ACTIONS=new Set(['new','edit','save']);
const CONTROL=/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;
export function normalizeToolNavigation(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const keys=Object.keys(value);
  if(keys.length<3||keys.length>4||
     keys.some(key=>!['page','title','canBack','primary'].includes(key)))return null;
  if(typeof value.page!=='string'||!PAGE.test(value.page)||
     typeof value.title!=='string'||typeof value.canBack!=='boolean')return null;
  const title=value.title.trim();
  if(!title||title.length>40||CONTROL.test(title))return null;
  const primary=value.primary??null;
  if(primary!==null&&!ACTIONS.has(primary))return null;
  return Object.freeze({page:value.page,title,canBack:value.canBack,primary});
}
