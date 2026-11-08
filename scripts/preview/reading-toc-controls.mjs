// Reading TOC preview-specific controls are injected only after the existing
// source-derived Side Panel template is rendered. No independent shell/theme.
const h=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;');
const b64=value=>Buffer.from(value,'utf8').toString('base64');

export function addReadingTocControls(html,{sidePanelHtml,overlayHtml,scenario,surface}){
  if(!html.includes('</aside>')||!html.includes('</body></html>')||
    !html.includes('id="opendesk-preview-frame"'))throw Error('E_TOC_PREVIEW_SHELL_CHANGED');
  const select=(value,expected)=>value===expected?' selected':'';
  const controls=`
<style>
#od-toc-controls{display:flex;gap:8px;align-items:end;flex-wrap:wrap;max-width:880px}
#od-toc-controls label{display:grid;gap:3px;color:var(--od-sub);font-size:12px}
#od-toc-controls select{min-height:34px;padding:4px 8px;border:1px solid var(--od-line);border-radius:7px;background:var(--od-paper);color:var(--od-ink);font:inherit}
#od-toc-controls select:focus-visible{outline:2px solid var(--od-focus);outline-offset:2px}
#od-toc-feedback{width:100%;min-height:16px;font-size:12px;color:var(--od-sub)}
#od-toc-site-control[hidden]{display:none!important}
</style>
<div id="od-toc-controls" role="group" aria-label="阅读目录离线交互模拟">
<label>模拟界面位置<select id="od-toc-surface">
<option value="side-panel"${select(surface,'side-panel')}>Side Panel</option>
<option value="page-overlay"${select(surface,'page-overlay')}>网页悬浮目录</option>
</select></label>
<label>应用界面语言<select id="od-toc-language">
<option value="zh-CN" selected>简体中文</option><option value="en">English</option><option value="ja">日本語</option>
</select></label>
<label>模拟页面状态<select id="od-toc-scenario">
<option value="success"${select(scenario,'success')}>有章节</option>
<option value="chatgpt-multi"${select(scenario,'chatgpt-multi')}>ChatGPT 三次回答</option>
<option value="empty"${select(scenario,'empty')}>无章节</option>
<option value="loading"${select(scenario,'loading')}>正在读取</option>
<option value="error"${select(scenario,'error')}>读取错误</option>
<option value="permission-denied"${select(scenario,'permission-denied')}>未获授权</option>
</select></label>
<label id="od-toc-site-control">模拟网站<select id="od-toc-site">
<option value="a" selected>网站 A</option><option value="b">网站 B</option>
</select></label>
<span id="od-toc-feedback" role="status" aria-live="polite">网站 A/B 的收起状态分别记忆；均为离线模拟。</span>
</div>`;
  const hostScript=`
<script>
(()=>{
 'use strict';
 const iframe=document.getElementById('opendesk-preview-frame');
 const surface=document.getElementById('od-toc-surface');
 const language=document.getElementById('od-toc-language');
 const scenario=document.getElementById('od-toc-scenario');
 const site=document.getElementById('od-toc-site');
 const siteControl=document.getElementById('od-toc-site-control');
 const collapsedBySite=Object.create(null); // preview-only memory, not Chrome storage
 const output=document.getElementById('od-toc-feedback');
 const frames=Object.freeze({
  'side-panel':${JSON.stringify(b64(sidePanelHtml))},
  'page-overlay':${JSON.stringify(b64(overlayHtml))}
 });
 const decode=value=>new TextDecoder().decode(Uint8Array.from(atob(value),c=>c.charCodeAt(0)));
 const post=(kind,value)=>iframe.contentWindow?.postMessage({kind,...value},'*');
 function sync(){
  post('opendesk-toc-preview-locale',{locale:language.value});
  post('opendesk-toc-preview-scenario',{scenario:scenario.value});
  post('opendesk-toc-preview-site',{site:site.value,collapsed:collapsedBySite[site.value]===true});
 }
 function changeSurface(){
  siteControl.hidden=surface.value!=='page-overlay';
  const value=frames[surface.value];
  if(!value)return;
  const content=decode(value);
  if(iframe.srcdoc!==content)iframe.srcdoc=content;
  else sync();
  output.textContent='已显示'+(surface.value==='page-overlay'?'可信网页悬浮 view.js':'正式沙箱工具 UI')+'；章节内容与动作均为离线模拟。';
 }
 surface.addEventListener('change',changeSurface);
 language.addEventListener('change',()=>{sync();output.textContent='已更新模拟应用语言；不会刷新或翻译网页章节。';});
 scenario.addEventListener('change',()=>{sync();output.textContent='已切换模拟状态；未读取网页或调用 Chrome 接口。';});
 site.addEventListener('change',()=>{
  post('opendesk-toc-preview-site',{site:site.value,collapsed:collapsedBySite[site.value]===true});
  output.textContent='模拟网站 '+site.value.toUpperCase()+'：'+(collapsedBySite[site.value]===true?'恢复收起状态':'默认展开')+'，与其他网站独立。';
 });
 iframe.addEventListener('load',sync);
 document.getElementById('od-preview-reset').addEventListener('click',changeSurface);
 window.addEventListener('message',event=>{
  if(event.source!==iframe.contentWindow)return;
  if(event.data?.kind==='opendesk-toc-preview-collapse'&&
     (event.data.site==='a'||event.data.site==='b')&&typeof event.data.collapsed==='boolean'){
   collapsedBySite[event.data.site]=event.data.collapsed;
   output.textContent='模拟网站 '+event.data.site.toUpperCase()+' 已'+(event.data.collapsed?'收起':'展开')+'；仅本网站记忆。';
   return;
  }
  if(event.data?.kind==='opendesk-toc-preview-navigation'&&typeof event.data.label==='string')
   output.textContent='模拟章节定位：'+event.data.label.slice(0,150)+'（未操作实际网页）';
 });
 changeSurface();
})();
</script>`;
  return html.replace('</aside>',controls+'</aside>').replace('</body></html>',hostScript+'</body></html>');
}
