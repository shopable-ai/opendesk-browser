// Floating Shadow DOM UI: never depend on a site's title, heading or selectors.
export function render(ui,{label,step}) {
  const doc=ui.content.ownerDocument;
  const node=(tag,className,text)=>{
    const el=doc.createElement(tag);
    if(className)el.className=className;
    if(text!==undefined)el.textContent=text;
    return el;
  };
  const card=node('section','od-card local-page-ui');
  card.setAttribute('role','group');
  card.setAttribute('aria-label','OpenDesk 页面 UI 测试');
  const header=node('div','local-ui-header');
  const mark=node('img','local-ui-mark');
  mark.src=ui.getAsset('assets/mark.png');
  mark.alt='';mark.width=24;mark.height=24;
  const title=node('strong','local-ui-title','OpenDesk Page UI');
  const close=node('button','od-button local-ui-close','关闭');
  close.type='button';close.setAttribute('aria-label','关闭 OpenDesk 页面 UI');
  header.append(mark,title,close);

  const host=doc.defaultView?.location?.host||'当前网页';
  const site=node('p','local-ui-site','已挂载 · '+host);
  const controls=node('div','local-ui-controls');
  const action=node('button','od-button od-button--primary local-ui-action',label);
  action.type='button';action.dataset.action='count';
  const counter=node('div','local-ui-counter');
  const caption=node('span','local-ui-counter-label','计数');
  const output=node('output','local-ui-output','0');
  output.dataset.count='0';
  output.setAttribute('aria-label','当前计数');
  output.setAttribute('aria-live','polite');
  counter.append(caption,output);
  controls.append(action,counter);
  const hint=node('p','local-ui-hint','仅修改此面板的计数，不操作网站内容。');

  let count=0;
  ui.on(action,'click',()=>{
    count+=step;
    output.dataset.count=String(count);
    output.textContent=String(count);
  });
  ui.on(close,'click',()=>ui.destroy());
  card.append(header,site,controls,hint);
  ui.content.append(card);
}
