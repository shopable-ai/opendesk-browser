import * as React from 'react';
import {translateUiText} from '../../../i18n/strings.js';

// Trusted shell navigation only. Business admission, active runs, permissions,
// persistence and extension lifecycles remain in TaskWorkbench and their Hosts.
const TABS=Object.freeze([
  {key:'tasks',id:'tab-my-tasks',messageKey:'sidebar.tab.tasks'},
  {key:'tools',id:'tab-tools',messageKey:'sidebar.tab.tools'},
  {key:'workflow',id:'tab-workflow',messageKey:'sidebar.tab.workflow'},
  {key:'develop',id:'tab-develop',messageKey:'sidebar.tab.develop'},
  {key:'app-debug',id:'tab-app-debug',messageKey:'sidebar.tab.appDebug'},
  {key:'cloud',id:'tab-cloud',messageKey:'sidebar.tab.cloud'},
  {key:'debug',id:'tab-debug',messageKey:'sidebar.tab.debug'}
]);

// Pure keyboard route shared by the production React handler and Node semantic tests.
// Event dispatch and focus remain owned by React/Chrome, not a DOM test double.
export function sidebarKeyboardDestination(key,index,tabs){
  if(index<0||index>=tabs.length)return null;
  const next=key==='ArrowRight'?(index+1)%tabs.length
    :key==='ArrowLeft'?(index+tabs.length-1)%tabs.length
    :key==='Home'?0:key==='End'?tabs.length-1:-1;
  return next<0?null:tabs[next];
}

export function SidebarNavigation({activeTab='tasks',debugEnabled=false,appDebugEnabled=false,locale='zh-CN',onNavigate=()=>{}}){
  const available=TABS.filter(tab=>(tab.key!=='debug'||debugEnabled)&&
    (tab.key!=='app-debug'||appDebugEnabled));
  const navigate=key=>onNavigate(key)!==false;
  const onKeyDown=(event,index)=>{
    const destination=sidebarKeyboardDestination(event.key,index,available);
    if(!destination)return; // Native Enter/Space activation remains intact.
    event.preventDefault();
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
    const isHidden=tab.key==='debug'&&!debugEnabled||tab.key==='app-debug'&&!appDebugEnabled;
    const selected=tab.key===activeTab;
    return <button key={tab.key} type="button" id={tab.id} role="tab"
      data-workbench-tab={tab.key} aria-selected={selected}
      aria-controls={tab.key==='app-debug'?'workbench-tools':'workbench-'+tab.key}
      hidden={isHidden}
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
      {translateUiText(tab.messageKey,{},locale)}
    </button>;
  })}</>;
}
