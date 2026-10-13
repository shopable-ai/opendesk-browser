// All untrusted listing strings enter the UI through textContent, never HTML.
export function renderInspector(ui,{read,inspect}){
  const doc=ui.content.ownerDocument;
  const node=(tag,cls,text)=>{
    const element=doc.createElement(tag);
    if(cls)element.className=cls;
    if(text!==undefined)element.textContent=text;
    return element;
  };
  const panel=node('section','od-card listing-inspector');
  panel.setAttribute('aria-label','Listing / SKU 只读检查');
  const heading=node('div','listing-head');
  heading.append(node('strong','listing-title','Listing · SKU 检查'));
  const close=node('button','od-button listing-close','关闭');
  close.type='button';close.setAttribute('aria-label','关闭 Listing 检查面板');
  heading.append(close);
  const scope=node('p','listing-scope','仅测试页 · 主动读取 · 不上传与不修改商品');
  const action=node('button','od-button od-button--primary listing-run','检查当前商品');
  action.type='button';
  const status=node('p','od-status listing-status','尚未读取商品数据。点击检查开始。');
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const results=node('ul','listing-issues');
  results.setAttribute('aria-label','检查结果');
  function check(){
    // A new user gesture creates a fresh DOM snapshot; failures discard stale reports.
    results.replaceChildren();
    try{
      const data=read();
      const report=inspect(data);
      status.dataset.state=report.errors?'error':'success';
      status.textContent=`已检查 ${report.variants} 个变体 · ${report.errors} 项错误 · ${report.warnings} 项提醒`;
      if(!report.issues.length){
        results.append(node('li','listing-ok','当前本地样例检查通过；不代表平台上架审核。'));
      }
      for(const issue of report.issues){
        const row=node('li','listing-issue');row.dataset.severity=issue.severity;
        row.append(node('strong','listing-issue-code',`${issue.severity==='error'?'错误':'提醒'} · ${issue.field}`),
          node('span','listing-issue-message',issue.message),node('small','listing-advice',issue.advice));
        results.append(row);
      }
    }catch(error){
      status.dataset.state='error';
      status.textContent=`检查失败 (${error?.code||'E_LISTING_UNKNOWN'})：${String(error?.message||error)}`;
    }
  }
  ui.on(action,'click',check);
  ui.on(close,'click',()=>ui.destroy());
  panel.append(heading,scope,action,status,results);
  ui.content.append(panel);
  return {check};
}
