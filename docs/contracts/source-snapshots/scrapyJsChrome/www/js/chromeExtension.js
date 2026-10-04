// 如果 location.href 包含 'chrome-extension://'，则说明是在 chrome 插件中运行
const isRunningInExtension = location.protocol.indexOf('-extension:') !== -1 ;
if (isRunningInExtension ) {
   // 通过 chrome.runtime.sendMessage 发送消息
   let showSetBody = location.href.includes('popup');
   if(showSetBody)  document.body.style.setProperty('width', '732px'),document.body.style.setProperty('height', '418px');
}
