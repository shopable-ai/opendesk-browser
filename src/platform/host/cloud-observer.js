// Observer-only extension page. This does not register, borrow or emulate a Host.
import {invariant} from '../protocol.js';

export async function requireCloudConsoleSender(api,sender){
  const expected=api.runtime.getURL('ui/cloud-control.html');
  invariant(sender?.id===api.runtime.id&&sender.url===expected&&
    sender.frameId===0&&Number.isSafeInteger(sender.tab?.id)&&sender.tab.id>=0&&
    !sender.tab.incognito&&sender.documentLifecycle!=='prerender'&&
    (sender.documentLifecycle===undefined||sender.documentLifecycle==='active')&&
    typeof sender.documentId==='string'&&sender.documentId.length>0,
  'E_OWNER','Cloud console requires an active packaged extension tab');
  // Chrome-verified document, not a caller-supplied path/Host identity.
  const contexts=await api.runtime.getContexts({
    contextTypes:['TAB'],documentUrls:[expected],documentIds:[sender.documentId]
  });
  invariant(Array.isArray(contexts)&&contexts.length===1&&
    contexts[0].contextType==='TAB'&&contexts[0].documentUrl===expected&&
    contexts[0].documentId===sender.documentId&&contexts[0].tabId===sender.tab.id&&
    contexts[0].frameId===0&&!contexts[0].incognito,
  'E_OWNER','Cloud console document identity could not be confirmed');
}
