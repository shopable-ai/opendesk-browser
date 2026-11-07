import {defineUnlistedScript} from 'wxt/utils/define-unlisted-script';
import {initNativeAgentSettings} from '../native-agent/settings.js';
import {initChatGPTFilesUI} from '../../projects/webflow/trusted/chatgpt-files-ui.js';
import chatGPTFilesHTML from '../../projects/webflow/trusted/chatgpt-files.html?raw';
import {mountWorkspace} from '../ui/react/workspace/main.tsx';
import {initChatGPTImagesUI} from '../../projects/webflow/trusted/chatgpt-images-ui.js';
export default defineUnlistedScript(() => {
  if(location.hash==='#chatgpt-images')return initChatGPTImagesUI();
  if(location.hash==='#chatgpt-files'){
    // Fixed build-time template only. No page/model HTML enters this document.
    const template=new DOMParser().parseFromString(chatGPTFilesHTML,'text/html');
    document.title=template.title;
    document.body.replaceChildren(document.importNode(template.getElementById('chatgpt-files-root'),true));
    document.head.append(document.importNode(template.querySelector('style'),true));
    return initChatGPTFilesUI();
  }
  if(document.getElementById('workspace-root'))return mountWorkspace();
  return initNativeAgentSettings();
});
