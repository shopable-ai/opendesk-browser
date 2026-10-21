import React from 'react';
import {createRoot} from 'react-dom/client';
import App from '../../../src/react/App.jsx';
import {TrustedConversationWorkspace,TrustedConversationHeaderSlot} from '../../../../../../src/ui/react/components/conversation.tsx';
import '../../../../../../src/ui/react/components/conversation-dock.css';
import '../../../src/react/style.css';

// Non-release Chromium fixture. The real ToolHost admits the trusted workspace;
// this test entry reuses its frame header slot, production App, Dock, and CSS.
const host=globalThis.OpenDeskTool;
const container=host?.root?.querySelector?.('[data-bookmark-react-root]');
if(!container)throw Error('E_BOOKMARK_FORMAL_TOOL_ROOT_MISSING');
if(!globalThis.BookmarkR2Model||!globalThis.BookmarkR2Service||!globalThis.OpenDeskSDK?.browser)
 throw Error('E_BOOKMARK_FORMAL_SDK_MISSING');
const root=createRoot(container);
function FormalTrustedHost(){
 const [headerTarget,setHeaderTarget]=React.useState(null);
 return <div className="od-preview-trusted-host" style={{height:'100%',minHeight:0,display:'flex',flexDirection:'column'}}>
  <header className="sidebar-tool-view-head od-toolbar od-page-head" aria-label="框架工具标题栏（非发布测试）">
   <strong className="od-page-title">书签管理</strong>
   <TrustedConversationHeaderSlot ref={setHeaderTarget}/>
   <button type="button" className="sidebar-tool-icon-action od-icon-button"
    aria-label="卸载当前工具（测试中不可用）" disabled title="正式测试中不可卸载">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 4h4m-8 3 1 13h10l1-13M10 11v5m4-5v5"/></svg>
   </button>
  </header>
  <div className="od-preview-trusted-frame" style={{flex:'1 1 auto',minHeight:0}}>
   <TrustedConversationWorkspace controller={null} headerTarget={headerTarget}
    title="AI 对话" renderBusiness={dock=><App dock={dock}/>}/>
  </div>
 </div>;
}
root.render(<FormalTrustedHost/>);
globalThis.addEventListener('pagehide',()=>root.unmount(),{once:true});
