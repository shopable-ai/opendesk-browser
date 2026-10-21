import React from 'react';
import {createRoot} from 'react-dom/client';
import App,{bookmarkConversationSamples} from '../../../src/react/App.jsx';
import {TrustedConversationWorkspace} from '../../../../../../src/ui/react/components/conversation.tsx';
import '../../../../../../src/ui/react/components/conversation-dock.css';
import '../../../src/react/style.css';

// Non-release feasibility entry. Same App.jsx shared by preview/formal.
const host=globalThis.OpenDeskTool;
const container=host?.root?.querySelector?.('[data-bookmark-react-root]');
if(!container)throw Error('E_BOOKMARK_FORMAL_TOOL_ROOT_MISSING');
if(!globalThis.BookmarkR2Model||!globalThis.BookmarkR2Service||!globalThis.OpenDeskSDK?.browser)
 throw Error('E_BOOKMARK_FORMAL_SDK_MISSING');
const root=createRoot(container);
root.render(<TrustedConversationWorkspace controller={null}
 title="书签对话" samples={bookmarkConversationSamples}
 resultLabel="未接入可信对话 Provider（非正式入口）"
 renderBusiness={dock=><App dock={dock}/>}/>);
globalThis.addEventListener('pagehide',()=>root.unmount(),{once:true});
