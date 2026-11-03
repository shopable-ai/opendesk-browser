// Compatibility exports; business site adapter and retired page UI are Web Flow-owned.
// This first-party entry keeps callers stable without hosting a second implementation.
export {
  prepareChatGPTBridgeDraft,
  claimChatGPTBridgeComposer,
  isChatGPTBridgeContinuation,
  bridgePrompt,
  initChatGPTFixedBridgePage
} from '../../projects/webflow/trusted/chatgpt-bridge-page.js';
