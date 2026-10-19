// React hook/handler fixture: exercises the current production application code.
// It is NOT a real browser/React Aria/native Chrome acceptance environment.
import {runInNewContext} from 'node:vm';
import {readFileSync} from 'node:fs';

export function mountStayFocusReact({url='https://m.youtube.com/',title='YouTube',
  sites=[],pageSequence=null}={}){
  const hooks=[],effects=[],writes=[],requests=[],listeners=new Map();
  let cursor=0,App=null,tree=null,pending=false,disposed=false,
    current={status:'available',url,title},pageCalls=0,renders=0;
  let status={enabled:true,authorized:true,day:'2026-10-20',sites:structuredClone(sites),
    catalog:[{host:'youtube.com',name:'YouTube',minutes:30,quick:true}],
    groups:{entertainment:30},whitelist:[],focusUntil:null,
    schedule:{enabled:false,days:[1,2,3,4,5],startMinute:540,endMinute:1020},
    dailyBudget:{minutes:30,budgetMs:1800000,usedMs:0,remainingMs:1800000},
    ruleReceipt:{verified:true},tabs:{failed:0}};
  const equal=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&
    a.length===b.length&&a.every((value,i)=>Object.is(value,b[i]));
  const render=()=>{if(disposed)return;if(++renders>100)throw Error('fixture render cycle');
    cursor=0;tree=App();for(const effect of effects.splice(0))effect();};
  const schedule=()=>{if(!pending&&!disposed){pending=true;queueMicrotask(()=>{pending=false;render();});}};
  const React={
    createElement:(type,props,...children)=>({type,props:{...props,children}}),
    createRoot:()=>({render(node){App=node.type;render();},
      unmount(){disposed=true;for(const slot of hooks)slot?.cleanup?.();}}),
    useState(initial){const i=cursor++;if(!hooks[i])hooks[i]={value:typeof initial==='function'?initial():initial};
      return [hooks[i].value,next=>{const before=hooks[i].value;
        const value=typeof next==='function'?next(before):next;
        if(!Object.is(value,before)){hooks[i].value=value;schedule();}}];},
    useRef(initial){const i=cursor++;if(!hooks[i])hooks[i]={value:{current:initial}};
      return hooks[i].value;},
    useCallback(callback,deps){const i=cursor++,old=hooks[i];
      if(old&&equal(old.deps,deps))return old.value;
      return (hooks[i]={value:callback,deps}).value;},
    useEffect(callback,deps){const i=cursor++,old=hooks[i];
      if(old&&equal(old.deps,deps))return;
      hooks[i]={deps,cleanup:old?.cleanup};
      effects.push(()=>{hooks[i].cleanup?.();hooks[i].cleanup=callback()||null;});}
  };
  const UI={Button:function Button(){},IconButton:function IconButton(){},
    Card:function Card(){},CardContent:function CardContent(){},Switch:function Switch(){}};
  const root={querySelector:s=>s==='#tool-app'?{}:null,
    addEventListener:(key,fn)=>listeners.set('root:'+key,fn),
    removeEventListener:(key,fn)=>{if(listeners.get('root:'+key)===fn)listeners.delete('root:'+key);}};
  const request=async(operation,payload={})=>{
    requests.push(operation);
    if(operation==='currentPage.info'){
      if(pageSequence&&pageCalls<pageSequence.length)current=pageSequence[pageCalls];
      pageCalls++;return current;
    }
    if(operation==='focus.status')return structuredClone(status);
    writes.push({operation,payload:structuredClone(payload)});
    switch(operation){
      case 'focus.site.put':{
        const index=status.sites.findIndex(s=>s.host===payload.site.host);
        if(index>=0)status.sites[index]={...status.sites[index],...payload.site};
        else status.sites.push({...payload.site});
        break;
      }
      case 'focus.site.remove':status.sites=status.sites.filter(s=>s.host!==payload.host);break;
      case 'focus.group.put':
        status.groups[payload.id]=payload.minutes;
        if(payload.id==='entertainment'){
          status.dailyBudget.minutes=payload.minutes;
          status.dailyBudget.budgetMs=payload.minutes*60000;
          status.dailyBudget.remainingMs=Math.max(0,status.dailyBudget.budgetMs-status.dailyBudget.usedMs);
        }
        break;
      case 'focus.group.remove':delete status.groups[payload.id];break;
      case 'focus.schedule.set':status.schedule=structuredClone(payload.schedule);break;
      case 'focus.whitelist.set':status.whitelist=[...payload.hosts];break;
      case 'focus.session.start':status.focusUntil=Date.now()+payload.minutes*60000;break;
      case 'focus.session.stop':status.focusUntil=null;break;
      default:throw Error('unexpected operation '+operation);
    }
    return structuredClone(status);
  };
  const globals={OpenDeskTool:{root,request},OpenDeskSidebarUI:UI,
    OpenDeskPageReact:React,addEventListener:(key,fn)=>listeners.set('global:'+key,fn),
    removeEventListener:(key,fn)=>{if(listeners.get('global:'+key)===fn)listeners.delete('global:'+key);},
    setInterval:()=>1,clearInterval(){}};
  const document={hidden:false,addEventListener:(key,fn)=>listeners.set('document:'+key,fn),
    removeEventListener:(key,fn)=>{if(listeners.get('document:'+key)===fn)listeners.delete('document:'+key);}};
  const source=readFileSync(new URL('../../examples/sidebar-tools/stay-focus/src/main.js',import.meta.url),'utf8');
  runInNewContext(source,{globalThis:globals,document,URL});
  const visit=(item,visitor)=>{
    if(Array.isArray(item)){item.forEach(n=>visit(n,visitor));return;}
    if(item===null||typeof item!=='object')return;
    visitor(item);visit(item.props?.children,visitor);
  };
  const text=item=>Array.isArray(item)?item.map(text).join(''):
    item===null||item===undefined?'':typeof item!=='object'?String(item):
      text(item.props?.children);
  const find=predicate=>{let match=null;visit(tree,node=>{if(!match&&predicate(node))match=node;});return match;};
  return {UI,find,text,writes,requests,
    button:label=>find(node=>node.type===UI.Button&&text(node).trim()===label),
    field:id=>find(node=>node.props?.id===id),
    flush:async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve));},
    pageChange:next=>{current=next;listeners.get('root:opendesk-page-changed')?.();},
    unmount:()=>listeners.get('global:pagehide')?.(),
    get listenerCount(){return listeners.size;},
    get disposed(){return disposed;},
    get state(){return structuredClone(status);}
  };
}
