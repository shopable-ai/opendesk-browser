// Optional development chrome outside the installable React product tree.
// The business controller manages visibility and availability using the
// source-reviewed SDK development profile. This function grants no access.
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
  description.textContent='仅用于本地联调：验证模拟会员、兑换和测试网站登录，不代表正式付费会员或真实网站 VIP。';
  const prerequisites=document.createElement('p');
  prerequisites.className='od-note';
  prerequisites.textContent='前置：已审阅开发配置、原测试服务在运行，并使用获准的测试浏览器与会话。';
  const steps=document.createElement('ol');
  steps.className='od-note';
  for(const text of [
    '点击「连接本地开发」，再看会员卡是否核验成功；“已选择”只表示服务选择，不代表连接成功。',
    '点击「测试网站登录」展开网站，选择目标后准备登录；已有登录可直接打开网站。'
  ]){
    const step=document.createElement('li');
    step.textContent=text;steps.append(step);
  }
  const effects=document.createElement('p');
  effects.className='od-note';
  effects.textContent='连接和展开入口不兑换、不写 Cookie、不启用代理。预检不消费码，确认激活才兑换；已有有效权益不必重兑。登录需网站授权及每批 Cookie 确认，可能替换现有账号；代理另行审阅。取消后停止，结果未知先核对原操作。网站登录与 VIP 另行核验。';
  const button=document.createElement('button');
  button.id='ai-vip-local-connect';button.type='button';
  button.className='od-button';button.textContent='连接本地开发';button.disabled=true;
  const status=document.createElement('p');
  status.id='ai-vip-local-status';status.className='od-note';
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const websiteButton=document.createElement('button');
  websiteButton.id='ai-vip-test-sites';websiteButton.type='button';
  websiteButton.className='od-button od-button--secondary';websiteButton.textContent='测试网站登录';websiteButton.disabled=true;
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
  section.append(title,description,prerequisites,steps,effects,button,websiteButton,status,auth);
  root.append(section);
  return {section,button,websiteButton,status,dispose:()=>section.remove()};
}
