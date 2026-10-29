// Optional development chrome outside the installable React product tree.
// The business controller calls this only after the public SDK returns the
// exact source-reviewed development profile. This function grants no access.
export function createDevelopmentConnection(root){
  const document=root.ownerDocument;
  const section=document.createElement('section');
  section.id='ai-vip-local-development';
  section.className='od-surface od-surface--padded';
  section.setAttribute('aria-label','本地测试服务');
  section.hidden=true;
  const title=document.createElement('strong');
  title.textContent='本地测试服务';
  const description=document.createElement('p');
  description.className='od-note';
  description.textContent='连接本机模拟服务器验证会员与兑换，不代表正式付费会员。';
  const button=document.createElement('button');
  button.id='ai-vip-local-connect';button.type='button';
  button.className='od-button';button.textContent='连接本地开发';button.disabled=true;
  const status=document.createElement('p');
  status.id='ai-vip-local-status';status.className='od-note';
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  section.append(title,description,button,status);
  root.append(section);
  return {section,button,status,dispose:()=>section.remove()};
}
