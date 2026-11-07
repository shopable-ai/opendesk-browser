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
  const websiteButton=document.createElement('button');
  websiteButton.id='ai-vip-test-sites';websiteButton.type='button';
  websiteButton.className='od-button od-button--secondary';websiteButton.textContent='测试网站登录';
  const auth=document.createElement('div');
  auth.id='ai-vip-source-auth';auth.hidden=true;
  const label=document.createElement('label');
  label.textContent='受控测试来源凭据';
  const input=document.createElement('input');
  input.id='ai-vip-source-credential';input.type='password';input.autocomplete='off';input.className='od-field';
  label.append(input);
  const clear=document.createElement('button');
  clear.id='ai-vip-source-clear';clear.type='button';clear.textContent='清除测试凭据';clear.className='od-button';
  auth.append(label,clear);
  section.append(title,description,button,websiteButton,status,auth);
  root.append(section);
  return {section,button,websiteButton,status,dispose:()=>section.remove()};
}
