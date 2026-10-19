import * as React from 'react';
import CookieEditorApp from '../../../app/CookieEditorApp.jsx';
import {createMockSdk} from './mock-sdk.js';

// The shared product App owns compact editor copy, attribute/storage disclosures and the site header.
// Scene controls live outside that App. Only SDK responses are fictional.
export default function App(){
 const [scene,setScene]=React.useState('ready');
 const [revision,setRevision]=React.useState(0);
 const [dark,setDark]=React.useState(false);
 const [failure,setFailure]=React.useState('');
 const [hostRoot,setHostRoot]=React.useState(null);
 const mock=React.useMemo(()=>createMockSdk({scenario:scene,onFailureConsumed:()=>setFailure('')}),[scene,revision]);
 React.useLayoutEffect(()=>{
  if(globalThis.OpenDeskSDK)throw Error('E_PREVIEW_REAL_SDK_PRESENT');
  const sdk={browser:mock.browser};globalThis.OpenDeskSDK=sdk;
  return ()=>{if(globalThis.OpenDeskSDK===sdk)delete globalThis.OpenDeskSDK;mock.dispose();};
 },[mock]);
 React.useLayoutEffect(()=>{document.documentElement.dataset.previewTheme=dark?'dark':'light';},[dark]);
 const useScene=value=>{setScene(value);setRevision(x=>x+1);setFailure('');};
 return <div className="r49-page">
  <details className="demo-lab" aria-label="预览场景切换器">
   <summary className="lab-title"><span>Cookie Editor R5.20</span><span>预览控制 · 虚构数据</span></summary>
   <div className="lab-controllers">
    <label>场景 <select data-testid="scenario" value={scene} onChange={e=>useScene(e.target.value)}>
     <option value="ready">已授权</option><option value="first">未授权</option><option value="readonly">仅查看</option><option value="empty">空列表</option><option value="loading">正在读取</option><option value="valuesDenied">值未授权</option><option value="saveError">保存失败</option><option value="copyError">复制失败</option><option value="downloadError">下载失败</option><option value="unknown">写入结果未知</option>
    </select></label>
    <label>下次操作 <select data-testid="failure" value={failure} onChange={e=>{setFailure(e.target.value);mock.setFailure(e.target.value);}}>
     <option value="">正常</option><option value="save">保存失败</option><option value="import">导入失败</option><option value="copy">复制失败</option><option value="download">下载失败</option><option value="unknown">结果未知</option>
    </select></label>
    <button className="lab-button" type="button" onClick={()=>setDark(x=>!x)}>{dark?'浅色':'深色'}</button>
    <button className="lab-button" type="button" onClick={()=>useScene('ready')}>重置</button>
    {scene==='first'&&<button className="lab-button" type="button" onClick={()=>useScene('ready')}>模拟允许访问</button>}
   </div>
  </details>
  <section className="cookie-app" aria-label="Cookie Editor 虚构数据预览" ref={setHostRoot}>
   {hostRoot&&<CookieEditorApp key={scene+':'+revision} request={mock.request} hostRoot={hostRoot}/>}
  </section>
 </div>;
}
