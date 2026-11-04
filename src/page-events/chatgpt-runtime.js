import {initChatGPTFixedBridgePage} from '../native-agent/chatgpt-fixed-bridge-page.js';
import {startSiteRuntime} from './content-runtime.js';

// This fixed, reviewed registration describes the existing bridge. A profile
// is routing data, not an installation, site permission, or Task grant.
const protocols=Object.freeze(['opendesk.task.request.v1','opendesk.task.intent.v1','webflow.task.intent.v1']);
const profiles=Object.freeze([Object.freeze({id:'chatgpt',version:'1.0.0',
  origin:'https://chatgpt.com',adapter:'chatgpt',adapterVersion:'1.0.0',protocols,enabled:true})]);
export function startChatGPTSiteRuntime({win=globalThis.window,init=initChatGPTFixedBridgePage}={}){
  return startSiteRuntime({win,profiles,protocolIds:protocols,
    adapters:{chatgpt:{version:'1.0.0',start:()=>init()}}});
}
