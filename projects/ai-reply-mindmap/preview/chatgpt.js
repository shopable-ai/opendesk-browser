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
// Lightweight local action icons. All XMind buttons still come exclusively
// from src/answer-registry.js; these icons only simulate native ChatGPT actions.
const SVG_NS='http://www.w3.org/2000/svg';
const shapes={
  copy:[['rect',{x:'8',y:'8',width:'12',height:'12',rx:'2'}],
    ['path',{d:'M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2'}]],
  like:[['path',{d:'M7 10v11H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3Zm0 0 4-8a3 3 0 0 1 2 3v4h6.2a2.5 2.5 0 0 1 2.4 3l-1.8 7a2.5 2.5 0 0 1-2.4 2H7'}]],
  dislike:[['path',{d:'M7 14V3H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3Zm0 0 4 8a3 3 0 0 0 2-3v-4h6.2a2.5 2.5 0 0 0 2.4-3l-1.8-7A2.5 2.5 0 0 0 17.4 3H7'}]]
};
function mockIcon(name){
  const svg=document.createElementNS(SVG_NS,'svg');
  svg.setAttribute('viewBox','0 0 24 24');
  svg.setAttribute('aria-hidden','true');
  for(const [tag,attributes] of shapes[name]){
    const node=document.createElementNS(SVG_NS,tag);
    for(const [key,value] of Object.entries(attributes))node.setAttribute(key,value);
    svg.append(node);
  }
  return svg;
}
for(const bar of document.querySelectorAll('.actions')){
  const slots=[
    ['[data-testid="copy-turn-action-button"]','copy'],
    ['button[aria-label="Good response"]','like'],
    ['button[aria-label="Bad response"]','dislike']
  ];
  for(const [selector,icon] of slots)bar.querySelector(selector)?.replaceChildren(mockIcon(icon));
}
document.getElementById('preview-conversation')?.addEventListener('click',async event=>{
  const button=event.target.closest('button');
  const bar=button?.closest('.actions');
  if(!bar)return;
  if(button.matches('[data-testid="copy-turn-action-button"]')){
    const answer=bar.closest('.assistant-turn')?.querySelector('.markdown');
    try{
      if(typeof navigator.clipboard?.writeText!=='function')throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(answer?.innerText||answer?.textContent||'');
      showFeedback('已复制当前 AI 回复的原文');
    }catch{showFeedback('浏览器未开放剪贴板；当前回复保持不变');}
    return;
  }
  if(button.matches('button[aria-pressed]')){
    const next=button.getAttribute('aria-pressed')!=='true';
    for(const peer of bar.querySelectorAll('button[aria-pressed]'))peer.setAttribute('aria-pressed','false');
    button.setAttribute('aria-pressed',String(next));
    showFeedback(next?'仅本地模拟评价，未发送任何数据':'已取消模拟评价');
  }
});
window.addEventListener('pagehide',()=>{
  if(feedbackTimeout!==null)clearTimeout(feedbackTimeout);
},{once:true});
