import * as React from 'react';

// Trusted shell navigation only. Business admission, active runs, permissions,
// persistence and extension lifecycles remain in TaskWorkbench and their Hosts.
const TABS=Object.freeze([
  {key:'tasks',id:'tab-my-tasks',label:'我的'},
  {key:'tools',id:'tab-tools',label:'扩展'},
  {key:'workflow',id:'tab-workflow',label:'工作流'},
  {key:'develop',id:'tab-develop',label:'开发'},
  {key:'cloud',id:'tab-cloud',label:'云控'},
  {key:'debug',id:'tab-debug',label:'调试'}
]);

export function SidebarNavigation({activeTab='tasks',debugEnabled=false,onNavigate=()=>{}}){
  const available=TABS.filter(tab=>tab.key!=='debug'||debugEnabled);
  const navigate=key=>onNavigate(key)!==false;
  const onKeyDown=(event,index)=>{
    let next;
    if(event.key==='ArrowRight')next=(index+1)%available.length;
    else if(event.key==='ArrowLeft')next=(index+available.length-1)%available.length;
    else if(event.key==='Home')next=0;
    else if(event.key==='End')next=available.length-1;
    else return; // Native button Enter/Space activation remains intact.
    event.preventDefault();
    const destination=available[next];
    if(!navigate(destination.key))return; // Leave veto retains focus and tab.
    event.currentTarget.ownerDocument.getElementById(destination.id)
      ?.focus({preventScroll:true});
  };
  React.useLayoutEffect(()=>{
    const selected=TABS.find(tab=>tab.key===activeTab);
    if(!selected)return;
    const target=document.getElementById(selected.id);
    target?.scrollIntoView?.({block:'nearest',inline:'nearest'});
  },[activeTab]);
  return <>{TABS.map(tab=>{
    const index=available.findIndex(value=>value.key===tab.key);
    const isDebug=tab.key==='debug',selected=tab.key===activeTab;
    return <button key={tab.key} type="button" id={tab.id} role="tab"
      data-workbench-tab={tab.key} aria-selected={selected}
      aria-controls={'workbench-'+tab.key}
      hidden={isDebug&&!debugEnabled}
      tabIndex={selected?0:-1}
      onClick={event=>{
        // A rejected mouse activation has already moved native focus to this
        // button. Restore roving-tabindex focus to the still-selected tab.
        // Keyboard veto is handled separately without moving the focus.
        if(!navigate(tab.key)){
          const selectedTab=available.find(value=>value.key===activeTab);
          if(selectedTab&&selectedTab.id!==tab.id)
            event.currentTarget.ownerDocument.getElementById(selectedTab.id)
              ?.focus({preventScroll:true});
        }
      }}
      onKeyDown={event=>{if(index>=0)onKeyDown(event,index);}}>
      {tab.label}
    </button>;
  })}</>;
}
