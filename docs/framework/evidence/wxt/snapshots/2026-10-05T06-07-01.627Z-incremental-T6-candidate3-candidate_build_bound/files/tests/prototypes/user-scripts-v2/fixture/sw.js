// The extension service worker exists only to discover the unpacked fixture ID.
chrome.runtime.onInstalled.addListener(() => console.log('F1 userScripts fixture installed'));
