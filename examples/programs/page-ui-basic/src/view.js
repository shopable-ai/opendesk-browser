// Native DOM only: no Controller 'page', Chrome extension APIs or innerHTML.
export function renderPanel(ui,{config,pageTitle,onClose,onExit}) {
  const doc=ui.content.ownerDocument;
  function el(tag,className,text) {
    const node=doc.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined)node.textContent=text;
    return node;
  }
  const card=el('section','od-card page-ui-panel');
  const header=el('div','page-ui-header');
  const mark=el('div','page-ui-logo');
  const image=el('img','page-ui-image');
  image.alt='OpenDesk 示例本地图片';
  image.src=ui.getAsset('assets/mark.png');
  mark.append(image);
  const title=el('h2','page-ui-title',config.title);
  header.append(mark,title);
  const hint=el('p','page-ui-hint',config.hint);
  const field=el('div','od-field');
  const label=el('label','od-label','输入一段文字');
  const input=el('input','od-input');
  input.type='text';input.id='od-ui-basic-input';input.placeholder='例如：网页检查';
  input.autocomplete='off';
  label.htmlFor=input.id;field.append(label,input);
  const actions=el('div','page-ui-actions');
  const run=el('button','od-button od-button--primary','读取本页信息');
  run.type='button';
  const close=el('button','od-button','关闭');close.type='button';
  const exit=el('button','od-button','完全退出');exit.type='button';
  actions.append(run,close,exit);
  const status=el('p','od-status','可运行');
  status.dataset.state='idle';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const result=el('pre','od-result','尚未执行');
  card.append(header,hint,field,actions,status,result);
  ui.content.append(card);
  const popup=el('p','page-ui-overlay-tip','操作结果已在面板中更新。');
  popup.hidden=true;ui.overlay.append(popup);
  function setState(state,text){status.dataset.state=state;status.textContent=text;}
  ui.on(run,'click',()=>{
    const value=input.value.trim();
    if(!value){setState('error','请输入内容后重试');input.focus();return;}
    run.disabled=true;setState('busy','正在读取当前网页信息…');
    ui.setTimeout(()=>{
      result.textContent=JSON.stringify({pageTitle,input:value},null,2);
      popup.hidden=false;setState('success','读取成功（无网络请求）');run.disabled=false;
    },120);
  });
  ui.on(close,'click',onClose);
  ui.on(exit,'click',onExit);
  ui.on(input,'keydown',event=>{if(event.key==='Enter'&&!run.disabled)run.click();});
  return {input,run,status,result};
}
