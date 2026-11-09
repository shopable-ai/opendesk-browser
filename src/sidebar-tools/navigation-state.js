// Display-only contract between the existing sandbox Bridge and trusted ToolHost.
// No SDK operation, origin grant, tool history, or arbitrary DOM action is carried here.
const PAGE=/^[a-z][a-z0-9-]{0,31}$/;
const ACTIONS=new Set(['new','edit','save']);
// A reviewed installed tool may place one display-only secondary trigger in the
// shared title bar. It never delegates business/permission operations to Host.
const SECONDARY_ACTIONS=new Set(['transfer','more']);
const CONTROL=/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;
const HEADER_ICONS=new Set(['new','edit','settings','diagnostics','subscriptions','library','list','refresh']);
function headerActions(value){
  if(!Array.isArray(value)||value.length>6)return null;
  const ids=new Set(),actions=[];
  for(const item of value){
    if(!item||typeof item!=='object'||Array.isArray(item)||
       Object.keys(item).some(key=>!['id','label','icon','priority','disabledReason'].includes(key))||
       typeof item.id!=='string'||!PAGE.test(item.id)||ids.has(item.id)||
       typeof item.label!=='string'||CONTROL.test(item.label))return null;
    const label=item.label.trim();
    if(!label||label.length>40)return null;
    const action={id:item.id,label};
    if(Object.hasOwn(item,'icon')){
      if(!HEADER_ICONS.has(item.icon))return null;
      action.icon=item.icon;
    }
    if(Object.hasOwn(item,'priority')){
      if(!Number.isInteger(item.priority)||item.priority < -10||item.priority > 10)return null;
      action.priority=item.priority;
    }
    if(Object.hasOwn(item,'disabledReason')){
      if(typeof item.disabledReason!=='string'||CONTROL.test(item.disabledReason))return null;
      const reason=item.disabledReason.trim();
      if(!reason||reason.length>80)return null;
      action.disabledReason=reason;
    }
    ids.add(item.id);actions.push(Object.freeze(action));
  }
  // Stable sort preserves declaration order for equal priorities.
  return Object.freeze(actions.sort((a,b)=>(b.priority??0)-(a.priority??0)));
}
export function normalizeToolNavigation(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const keys=Object.keys(value);
  if(keys.length<3||keys.length>8||
     keys.some(key=>!['page','title','canBack','primary','secondary','secondaryExpanded','headerActions','settingsPage'].includes(key)))return null;
  if(typeof value.page!=='string'||!PAGE.test(value.page)||
     typeof value.title!=='string'||typeof value.canBack!=='boolean')return null;
  const title=value.title.trim();
  if(!title||title.length>40||CONTROL.test(title))return null;
  const primary=value.primary??null;
  if(primary!==null&&!ACTIONS.has(primary))return null;
  const secondary=value.secondary??null;
  if(secondary!==null&&!SECONDARY_ACTIONS.has(secondary))return null;
  if(Object.hasOwn(value,'secondaryExpanded')&&
     (secondary===null||typeof value.secondaryExpanded!=='boolean'))return null;
  const state={page:value.page,title,canBack:value.canBack,primary};
  if(Object.hasOwn(value,'settingsPage')){
    if(typeof value.settingsPage!=='string'||!PAGE.test(value.settingsPage))return null;
    state.settingsPage=value.settingsPage;
  }
  if(secondary!==null){state.secondary=secondary;state.secondaryExpanded=value.secondaryExpanded===true;}
  if(Object.hasOwn(value,'headerActions')){
    const actions=headerActions(value.headerActions);
    // The old secondary More is owned by the application. Never replace it.
    if(!actions||(actions.length&&secondary==='more'))return null;
    state.headerActions=actions;
  }
  return Object.freeze(state);
}
