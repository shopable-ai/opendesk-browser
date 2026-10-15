// Mock ChatGPT shell controls only. No XMind implementation lives here.
// preview/app.js and the real product src/* own every Mind Map button and canvas.
const themeButton=document.getElementById('theme-switch');
const feedback=document.getElementById('mock-action-status');
let feedbackTimeout=null;
function showFeedback(message){
  if(!feedback)return;
  feedback.textContent=message;
  feedback.hidden=false;
  if(feedbackTimeout!==null)clearTimeout(feedbackTimeout);
  feedbackTimeout=setTimeout(()=>{feedback.hidden=true;feedbackTimeout=null;},2100);
}
themeButton?.addEventListener('click',()=>{
  const dark=document.documentElement.getAttribute('data-theme')!=='dark';
  document.documentElement.setAttribute('data-theme',dark?'dark':'light');
  themeButton.setAttribute('aria-pressed',String(dark));
  themeButton.textContent=dark?'浅色':'深色';
});
for(const bar of document.querySelectorAll('.actions')){
  const answer=bar.closest('.assistant-turn')?.querySelector('.markdown');
  const copy=bar.querySelector('button[data-testid="copy-turn-action-button"]');
  copy?.addEventListener('click',async()=>{
    try{
      if(typeof navigator.clipboard?.writeText!=='function')throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(answer?.innerText||answer?.textContent||'');
      showFeedback('已复制当前 AI 回复的原文');
    }catch{showFeedback('浏览器未开放剪贴板；当前回复保持不变');}
  });
  for(const button of bar.querySelectorAll('button[aria-pressed]')){
    button.addEventListener('click',()=>{
      const next=button.getAttribute('aria-pressed')!=='true';
      for(const peer of bar.querySelectorAll('button[aria-pressed]'))peer.setAttribute('aria-pressed','false');
      button.setAttribute('aria-pressed',String(next));
      showFeedback(next?'仅本地模拟评价，未发送任何数据':'已取消模拟评价');
    });
  }
}
window.addEventListener('pagehide',()=>{
  if(feedbackTimeout!==null)clearTimeout(feedbackTimeout);
},{once:true});
