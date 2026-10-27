import '../../../../src/ui/design-tokens.css';
import '../../../../src/ui/design-system.css';
import '../../../../src/ui/react/components/ui/sidebar-shared.css';
import {installPreviewFixture} from './sdk-fixture.js';

const fixture=installPreviewFixture(document.getElementById('tool-root'));
const width=document.getElementById('preview-width');
const note=document.getElementById('preview-note');
const tell=message=>{note.textContent=message+'（仅模拟；请使用产品内刷新查看状态。）';};
width.addEventListener('change',()=>{document.documentElement.style.setProperty('--frame-width',width.value+'px');});
width.dispatchEvent(new Event('change'));
document.getElementById('preview-member').addEventListener('click',()=>{
  fixture.activate();tell('已切为演示有效会员');
});
document.getElementById('preview-switch').addEventListener('click',()=>{
  tell('服务器演示分配已切换为 '+fixture.switchAccount());
});
document.getElementById('preview-cookie').addEventListener('change',e=>{
  fixture.cookieOutcome=e.target.value;tell('下次 Cookie 写入回执将为 '+e.target.selectedOptions[0].text);
});
const proxy=document.getElementById('preview-proxy'),release=document.getElementById('preview-release-stop');
proxy.addEventListener('change',()=>{
  fixture.setProxyScenario(proxy.value);
  release.hidden=proxy.value!=='pending';tell('代理模拟状态已调整');
});
release.addEventListener('click',()=>{
  fixture.releaseStop();release.hidden=true;proxy.value='disabled';tell('模拟 STOP 已返回可核验的停用回执');
});
await import('../src/main.jsx');
