import * as React from 'react';
import CookieEditorApp from '../../../app/CookieEditorApp.jsx';
import {createMockSdk,demoSite,demoSites} from './mock-sdk.js';

// The shared product App owns compact editor copy, attribute/storage disclosures and the site header.
// Scene controls live outside that App. Only SDK responses are fictional.
export default function App(){
 const [scene,setScene]=React.useState('accountsDemo');
 const [width,setWidth]=React.useState(380);
 const [revision,setRevision]=React.useState(0);
 const [dark,setDark]=React.useState(false);
 const [failure,setFailure]=React.useState('');
 const [hostRoot,setHostRoot]=React.useState(null);
 const [site,setSite]=React.useState(demoSite);
 const [settingsOpen,setSettingsOpen]=React.useState(false);
 const [,bumpAccess]=React.useState(0);
 const mock=React.useMemo(()=>createMockSdk({scenario:scene,onFailureConsumed:()=>setFailure('')}),[scene,revision]);
 React.useLayoutEffect(()=>{
  if(globalThis.OpenDeskSDK)throw Error('E_PREVIEW_REAL_SDK_PRESENT');
  const sdk={browser:mock.browser};globalThis.OpenDeskSDK=sdk;
  return ()=>{if(globalThis.OpenDeskSDK===sdk)delete globalThis.OpenDeskSDK;mock.dispose();};
 },[mock]);
 React.useLayoutEffect(()=>{document.documentElement.dataset.previewTheme=dark?'dark':'light';},[dark]);
 const useScene=value=>{setScene(value);setRevision(x=>x+1);setFailure('');setSite(demoSite);setSettingsOpen(false);};
 const granted=mock.hasGlobalCookieGrant();
 const grant=()=>{mock.grantAllSites();bumpAccess(v=>v+1);setSettingsOpen(false);};
 const revoke=()=>{
  mock.revokeAllSites();
  hostRoot?.dispatchEvent(new Event('opendesk-cookie-grants-changed'));
  bumpAccess(v=>v+1);
 };
 const switchSite=hostname=>{
  mock.switchSite(hostname);setSite(hostname);
  hostRoot?.dispatchEvent(new Event('opendesk-page-changed'));
 };
 return <div className="r49-page" style={{'--preview-panel-width':width+'px'}}>
  <details className="demo-lab" aria-label="预览场景切换器">
   <summary className="lab-title"><span>Cookie Editor · React 同源预览</span><span>交互预览 · 虚构数据</span></summary>
   <div className="lab-controllers">
    <label>场景 <select data-testid="scenario" value={scene} onChange={e=>useScene(e.target.value)}>
     <option value="accountsDemo">3 个虚构账号（默认）</option>
     <option value="accountsLocked">仓库锁定 / 首次使用</option>
     <option value="accountSwitchFail">账号切换失败</option>
     <option value="accountSwitchUnknown">账号切换结果未知</option>
     <option value="accountLockUnknown">账号锁定回执未知</option>
     <option value="ready">Cookie 已授权</option><option value="first">首次全站授权</option>
     <option value="noPage">无活动网页</option><option value="restricted">受限网页</option>
     <option value="switching">正在切站</option><option value="chromeDenied">Chrome 权限缺失</option>
     <option value="hostClosed">宿主不可用</option><option value="readonly">写入被拒</option>
     <option value="empty">空列表</option><option value="loading">正在读取</option><option value="valuesDenied">值未授权</option><option value="saveError">保存失败</option><option value="copyError">复制失败</option><option value="downloadError">下载失败</option><option value="unknown">写入结果未知</option>
    </select></label>
    <label>宽度 <select data-testid="width" value={width}
      onChange={e=>setWidth(Number(e.target.value))}>
      {[320,360,380,400,440,520].map(value=><option key={value} value={value}>{value}px</option>)}
    </select></label>
    <label>模拟网站 <select data-testid="site" value={site} onChange={e=>switchSite(e.target.value)}>
     {demoSites.map(hostname=><option key={hostname} value={hostname}>{hostname}</option>)}
    </select></label>
    <label>下次操作 <select data-testid="failure" value={failure} onChange={e=>{setFailure(e.target.value);mock.setFailure(e.target.value);}}>
     <option value="">正常</option><option value="save">保存失败</option><option value="import">导入失败</option><option value="copy">复制失败</option><option value="download">下载失败</option><option value="unknown">结果未知</option>
    </select></label>
    <button className="lab-button" type="button" onClick={()=>setDark(x=>!x)}>{dark?'浅色':'深色'}</button>
    <button className="lab-button" type="button" onClick={()=>useScene('ready')}>重置</button>
   </div>
  </details>
  <div className="preview-host-controls">
   <span>模拟环境 · 不读取真实 Cookie</span>
   <button className="lab-button" type="button" aria-label="预览授权设置"
     aria-expanded={settingsOpen} onClick={()=>setSettingsOpen(value=>!value)}>
      {settingsOpen?'← 返回 Cookie Editor':'⚙ 设置'}</button>
  </div>
  {settingsOpen&&<section className="preview-settings-panel" aria-label="Cookie 全站授权设置">
   <strong>管理所有网站 Cookie</strong>
   <span role="status">{granted?'已授权 · HTTP/HTTPS 网站':'尚未授权'}</span>
   <button className="lab-button" type="button" onClick={granted?revoke:grant}>
    {granted?'撤销全站授权':'允许管理所有网站 Cookie'}
   </button>
  </section>}
  <section className="cookie-app" aria-label="Cookie Editor 虚构数据预览" hidden={settingsOpen} ref={setHostRoot}>
   {hostRoot&&(granted
    ?<CookieEditorApp key={scene+':'+revision} request={mock.request} hostRoot={hostRoot}
      previewMode initialSection={['accountsLocked','accountSwitchFail',
        'accountSwitchUnknown','accountLockUnknown'].includes(scene)?'accounts':'cookie'}/>
    :<section className="preview-global-grant" aria-labelledby="preview-grant-title">
      <h2 id="preview-grant-title">Cookie 访问授权</h2>
      <p>允许管理普通 HTTP/HTTPS 网站的 Cookie；敏感值单独授权。</p>
      <button type="button" className="od-button od-button--primary" onClick={grant}>允许管理所有网站 Cookie</button>
     </section>)}
  </section>
 </div>;
}
