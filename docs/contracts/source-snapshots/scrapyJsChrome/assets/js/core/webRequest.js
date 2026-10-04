// // 监听来自 background.js 的消息
// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//     if (message.action === "webRequestStarted") {
//         console.log("Web request started for URL:", message.details.url);
//         // 在这里可以做任何你想在请求开始时做的事情
//     }
    
//     if (message.action === "webRequestCompleted") {
//         console.log("Web request completed for URL:", message.details.url);
//         // 在这里可以做任何你想在请求完成时做的事情
//     }
// });
