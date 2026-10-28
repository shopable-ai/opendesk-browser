import '../../../../src/ui/design-tokens.css';
import '../../../../src/ui/design-system.css';
import '../../../../src/ui/react/components/ui/sidebar-shared.css';
import {installPreviewFixture} from './sdk-fixture.js';

// The laboratory stays outside #tool-app. Nothing here is packaged into the
// installable tool's Sandbox JS or UI tree.
const fixture=installPreviewFixture(document.getElementById('tool-root'));
const note=document.getElementById('preview-note');
const tell=message=>{note.textContent=message+'（只修改隔离演示，未操作 Chrome。）';};

const scene=document.getElementById('preview-scene');
const allowed=new Set([
  'first','empty','unconfigured','error','member','expired','link','permission',
  'proxy-on','conflict','stop-pending','session','redeem','quota','guest','offline'
]);
const requested=new URL(location.href).searchParams.get('scene');
scene.value=allowed.has(requested)?requested:'member';
scene.addEventListener('change',()=>{
  if(!allowed.has(scene.value))return;
  const url=new URL(location.href);
  if(scene.value==='member')url.searchParams.delete('scene');
  else url.searchParams.set('scene',scene.value);
  url.searchParams.set('width',width.value);
  if(theme.value!=='system')url.searchParams.set('theme',theme.value);
  location.assign(url.href); // A new isolated Fixture, never a real account transition.
});

const width=document.getElementById('preview-width');
width.addEventListener('change',()=>{
  if(!['320','360','390','400','440','520'].includes(width.value))return;
  document.documentElement.style.setProperty('--frame-width',width.value+'px');
});
const savedWidth=new URL(location.href).searchParams.get('width');
if(['320','360','390','400','440','520'].includes(savedWidth))width.value=savedWidth;
width.dispatchEvent(new Event('change'));

document.getElementById('preview-fill-code').addEventListener('click',()=>{
  const input=document.getElementById('ai-vip-redeem-code');
  if(!input||input.disabled){tell('请选择「待兑换」场景，再填入体验激活码');return;}
  input.value='DEMO-VIP-01';
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.focus({preventScroll:true});
  tell('体验激活码已填入；预检与最终确认仍需在正式产品界面主动点击');
});
document.getElementById('preview-member-failure').addEventListener('click',()=>{
  const button=document.getElementById('preview-member-failure');
  const failed=button.getAttribute('aria-pressed')!=='true';
  fixture.setMemberFailure(failed);
  button.setAttribute('aria-pressed',String(failed));
  button.textContent=failed?'恢复会员查询':'模拟会员查询中断';
  tell(failed?'会员连接已模拟中断；点会员卡的刷新检查历史资料保留但新操作锁定':
    '模拟会员服务已恢复；点会员卡刷新重新核验');
});
const theme=document.getElementById('preview-theme');
theme.addEventListener('change',()=>{
  if(theme.value==='system')delete document.documentElement.dataset.previewTheme;
  else document.documentElement.dataset.previewTheme=theme.value;
});
const savedTheme=new URL(location.href).searchParams.get('theme');
if(['light','dark'].includes(savedTheme)){
  theme.value=savedTheme;theme.dispatchEvent(new Event('change'));
}
document.getElementById('preview-cookie').addEventListener('change',event=>{
  fixture.cookieOutcome=event.target.value;
  tell('下一次 Cookie 逐项写入将返回「'+event.target.selectedOptions[0].text+'」');
});
const proxy=document.getElementById('preview-proxy');
const release=document.getElementById('preview-release-stop');
const releaseWrap=document.getElementById('preview-release-wrap');
proxy.addEventListener('change',()=>{
  fixture.setProxyScenario(proxy.value);
  releaseWrap.hidden=proxy.value!=='pending';
  tell('代理状态已改变；请在产品内点刷新，以当前可信 SDK 读取状态');
});
release.addEventListener('click',()=>{
  fixture.releaseStop();
  releaseWrap.hidden=true;
  proxy.value='disabled';
  tell('模拟 STOP 已返回停用回执');
});
await import('../src/main.jsx');
