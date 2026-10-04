chrome.runtime.onInstalled.addListener(() => {});
const epoch = crypto.randomUUID();
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message.kind === 'f1-identity' && sender.id === chrome.runtime.id) reply({id: chrome.runtime.id, epoch});
});
