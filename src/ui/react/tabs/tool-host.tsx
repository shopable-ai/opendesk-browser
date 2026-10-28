/** @jsx h */
import * as React from 'react';
import {createPortal} from 'react-dom';
import {TimeReviewSettings,StayFocusSettings,StayFocusQuickAdd,AiAccessSettings} from './trusted-settings.tsx';
import {UninstallDialog} from './tools.tsx';
import {TrustedConversationHeaderSlot} from '../components/conversation.tsx';
import {Button,IconButton} from '../components/ui/button.tsx';

const h=React.createElement.bind(React);
const ToolContext = React.createContext(null);

const MARKET_CAPABILITY_UI=Object.freeze({
  'storage.local':['本机应用数据','保存此应用的本地配置与资料','data'],
  'browser.storage':['浏览器存储','通过受控 SDK 使用浏览器存储','data'],
  'currentPage.read':['当前网页内容','在授权范围内读取当前页面','web'],
  'tasks.open':['打开任务','通过受控入口打开任务','tool'],
  'page.toc':['页面目录','读取文章结构并生成目录','web'],
  'page.clip':['网页摘录','提取并保存网页选定内容','web'],
  'page.capture':['网页内容捕获','在授权后捕获当前网页信息','web'],
  'user.export':['导出文件','将用户选择的数据导出到本机','data'],
  'knowledge.store':['知识资料','保存应用自己的知识内容','data'],
  'time.review':['时间分析','查看受控的网站时间记录','web'],
  'focus.control':['专注管理','通过可信运行时管理专注规则','tool'],
  'ai.access':['AI 服务','通过受控接口使用 AI 能力','tool'],
  'adblock.control':['内容屏蔽','管理由此应用控制的屏蔽规则','web'],
  'page.prompts':['网页提示词','在授权网页使用提示词快捷操作','web'],
  'browser.contextMenu':['网页右键菜单','在审阅的网站范围使用右键入口','web'],
  'browser.tabs':['浏览器标签页','查询或操作浏览器标签页','web'],
  'browser.sidePanel':['浏览器侧边栏','打开或控制受限侧边栏界面','tool'],
  'network':['网络请求','通过 SDK 发起受控网络请求','web'],
  'browser.network.observe':['网络活动观察','按授权规则观察网络活动','web'],
  'browser.events':['浏览器事件','订阅允许的浏览器事件','tool'],
  'browser.operations':['浏览器操作','执行受许可的浏览器操作','web'],
  'browser.screenshot':['网页截图','在授权后捕获网页画面','web'],
  'browser.bookmarks':['书签','读取或管理授权范围内的书签','data'],
  'browser.bookmarks.full':['完整书签','访问完整浏览器书签树','data'],
  'browser.scheduler':['定时任务','登记受控的定时处理','tool'],
  'browser.cookies.read':['Cookie 元信息','按实际权限读取 Cookie 信息','web'],
  'browser.cookies.values':['Cookie 内容','按实际权限读取 Cookie 值','web'],
  'browser.cookies.write':['修改 Cookie','按实际权限写入 Cookie','web'],
  'browser.cookies.observe':['Cookie 变化','监听已授权范围内的 Cookie 变化','web'],
  'browser.cookies.clear':['删除 Cookie','按实际权限清除 Cookie','web'],
  'browser.proxy.managed':['受管代理','管理受限的浏览器代理配置','web']
});
const MARKET_NO_SITE_CAPABILITIES=new Set([
  'storage.local','browser.storage','knowledge.store','user.export','browser.sidePanel'
]);
function marketOriginHost(origin){
  try {return new URL(origin).host;}catch{return '已配置发行渠道';}
}
function MarketGlyph({kind='app'}){
  const paths={
    app:<><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8.5 8.5h2v2h-2zM13.5 8.5h2v2h-2zM8.5 13.5h2v2h-2zM13.5 13.5h2v2h-2z"/></>,
    shield:<><path d="M12 2.6 20 6v5.4c0 5.2-3.7 8.7-8 10-4.3-1.3-8-4.8-8-10V6z"/><path d="m8.7 12.2 2.3 2.3 4.5-4.6"/></>,
    data:<><ellipse cx="12" cy="5.4" rx="7.9" ry="3.1"/><path d="M4.1 5.4v13c0 1.7 3.5 3.1 7.9 3.1s7.9-1.4 7.9-3.1v-13M4.1 11.9c0 1.7 3.5 3.1 7.9 3.1s7.9-1.4 7.9-3.1"/></>,
    web:<><circle cx="12" cy="12" r="9"/><path d="M3.2 12h17.6M12 3c3 2.5 4.6 5.5 4.6 9s-1.6 6.5-4.6 9c-3-2.5-4.6-5.5-4.6-9S9 5.5 12 3"/></>,
    tool:<><path d="M13.9 3.5a6.2 6.2 0 0 0-7.8 7.8L3 14.4l6.6 6.6 3.1-3.1a6.2 6.2 0 0 0 7.8-7.8l-4.4 4.4-6.6-6.6z"/></>,
    arrow:<><path d="M4.5 12h14m-6-6 6 6-6 6"/></>,
    check:<><circle cx="12" cy="12" r="9"/><path d="m7.5 12.3 3.2 3.2 5.8-6.3"/></>,
    info:<><circle cx="12" cy="12" r="9"/><path d="M12 10.6v5.7m0-9.4v.2"/></>
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]||paths.tool}</svg>;
}
function MarketCapabilityRow({code,isNew=false}){
  const [name,explanation,icon]=MARKET_CAPABILITY_UI[code]||[
    '其他受限能力','按浏览器运行时的实际能力与授权规则检查；完整标识见高级信息','tool'];
  return <div className={'od-market-capability-row'+(isNew?' is-new':'')} >
    <span className="od-market-capability-icon"><MarketGlyph kind={icon}/></span>
    <div className="od-market-capability-copy">
      <div className="od-market-capability-title">{name}{isNew&&<span className="od-market-added">新增</span>}</div>
      <p>{explanation}</p>
    </div>
  </div>;
}



export function ToolHost({view,concealed=false,debugPreview=false,onStopDebug}) {
  const snapshot = React.useSyncExternalStore(view.subscribe, view.getSnapshot, view.getSnapshot);
  const previewStatus=snapshot.fields['sidebar-tool-readonly-banner'];
  const marketReview = snapshot.market?.review ?? null;
  const marketReviewRef = React.useRef(marketReview);
  marketReviewRef.current = marketReview;
  const importOpen = marketReview !== null || snapshot.fields['sidebar-tool-import']?.hidden === false;
  const dismissImport = () => {
    if (marketReviewRef.current) {
      if (!marketReviewRef.current.busy) view.marketInstallActions?.dismiss();
    } else view.dispatch('sidebar-tool-import-close', 'click');
  };
  const reviewing = snapshot.fields['sidebar-tool-preview']?.hidden === false;
  const topAction = snapshot.fields['sidebar-tool-primary-action']?.data?.action || '';
  const secondaryAction = snapshot.fields['sidebar-tool-secondary-action']?.data?.action || '';
  const managementActionsVisible=['sidebar-tool-settings-open','sidebar-tool-remove']
    .some(id=>snapshot.fields[id]?.hidden===false);
  const siteShortcutsVisible=['sidebar-tool-visibility','sidebar-tool-context-menu']
    .some(id=>snapshot.fields[id]?.hidden===false);
  // Tool enable/disable is only reachable from trusted Settings, not header actions.
  const cookieFirstUse=snapshot.fields['sidebar-tool-cookie-permissions']?.data?.mode==='first-use';
  const permissionVisible=snapshot.fields['sidebar-tool-bookmark-permissions']?.hidden===false||
    (snapshot.fields['sidebar-tool-cookie-permissions']?.hidden===false&&!cookieFirstUse);
  // These are the only editable inputs in this host. Business decisions remain
  // synchronous controller actions, with the original trusted browser event.
  const actions = React.useMemo(() => ({
    chooseFile(event) {
      view.patch('sidebar-tool-file', {value:event.currentTarget.value});
      view.dispatch('sidebar-tool-file', 'change', event.nativeEvent);
    },
    cancelFile(event) {view.dispatch('sidebar-tool-file', 'cancel', event);},
    language(event) {
      view.patch('sidebar-tool-toc-language-select', {value:event.currentTarget.value});
      view.dispatch('sidebar-tool-toc-language-select', 'change', event.nativeEvent);
    },
    revoke(key, id, event) {view.activateRow(key, id, event.nativeEvent);}
  }), [view]);
  const nodes = React.useRef({frameRoot:null,settingsControl:null});
  const refs = React.useRef(new Map());
  const runtimeRefs = React.useMemo(() => Object.fromEntries(Object.keys(nodes.current).map(key => [key, node => {nodes.current[key] = node;}])), []);
  React.useLayoutEffect(() => view.attachRuntime({...nodes.current}), [view]);
  React.useLayoutEffect(() => {
    for (const effect of view.takeEffects()) {
      let target=refs.current.get(effect.key),options=effect.options;
      if(effect.key==='sidebar-tool-import-trigger'&&effect.method==='focus'){
        const doc=nodes.current.frameRoot?.ownerDocument;
        if(Object.hasOwn(options??{},'extensionToolId')){
          if(snapshot.fields['sidebar-tool-display'].hidden===false)continue;
          const {extensionToolId,...focusOptions}=options;options=focusOptions;
          const controls=[...(doc?.querySelectorAll('#extension-center-list button[data-extension-key]')??[])]
            .filter(button=>button.dataset.extensionKey==='app:'+extensionToolId);
          target=controls.find(button=>button.dataset.extensionAction==='primary')||
            controls.find(button=>button.dataset.extensionAction==='more')||
            controls.find(button=>button.dataset.extensionAction==='main')||
            doc?.getElementById('extension-center-search');
        }
        target??=doc?.getElementById('sidebar-tool-import-trigger')??doc?.getElementById('extension-center-import');
      }
      target?.[effect.method]?.(options);
    }
  }, [view, snapshot.effectVersion]);
  // Keep the trusted installer single-owned; the drawer changes only its layout.
  React.useEffect(() => {
    if(!importOpen)return;
    const panel=refs.current.get('sidebar-tool-import');
    if(!panel)return;
    const doc=panel.ownerDocument,app=doc.getElementById('opendesk-react-app');
    const priorFocus=doc.activeElement,priorInert=app?.inert;
    const priorOverflow=doc.body.style.overflow;
    if(app)app.inert=true;
    doc.body.style.overflow='hidden';
    (marketReviewRef.current ? panel :
      panel.querySelector('#sidebar-tool-file') || panel).focus({preventScroll:true});
    const onKeyDown=event=>{
      if(event.key==='Escape'){
        event.preventDefault();event.stopPropagation();
        if(marketReviewRef.current){
          if(!marketReviewRef.current.busy)view.marketInstallActions?.dismiss();
        }else view.dispatch('sidebar-tool-import-close','click',event);return;
      }
      if(event.key!=='Tab')return;
      const focusable=[...panel.querySelectorAll(
        'button:not([disabled]),input:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')]
        .filter(node=>!node.closest('[hidden]')&&node.getClientRects().length);
      const first=focusable[0],last=focusable.at(-1);
      if(!first){event.preventDefault();panel.focus({preventScroll:true});return;}
      if(event.shiftKey&&(doc.activeElement===first||!panel.contains(doc.activeElement))){
        event.preventDefault();last.focus({preventScroll:true});
      }else if(!event.shiftKey&&(doc.activeElement===last||!panel.contains(doc.activeElement))){
        event.preventDefault();first.focus({preventScroll:true});
      }
    };
    doc.addEventListener('keydown',onKeyDown,true);
    return ()=>{
      doc.removeEventListener('keydown',onKeyDown,true);
      doc.body.style.overflow=priorOverflow;
      if(app)app.inert=priorInert;
      if(panel.contains(doc.activeElement)||doc.activeElement===doc.body){
        const detail=marketReview&&doc.getElementById('extension-center-detail')?.hidden===false?
          doc.getElementById('extension-center-back'):null;
        const target=detail||(
          priorFocus?.isConnected&&!priorFocus.closest?.('[hidden]')?priorFocus:
            doc.getElementById('extension-center-more')||doc.getElementById('extension-center-search'));
        target?.focus?.({preventScroll:true});
      }
    };
  },[importOpen,marketReview !== null,view]);
  const context = React.useMemo(() => ({view, snapshot, refs}), [view, snapshot]);
  return <ToolContext.Provider value={context}><div className="sidebar-tool-host od-stack"><ToolField as="section" id="sidebar-tool-action-review" className="sidebar-tool-action-review od-surface" role="group" aria-label="确认当前工具操作" hidden={true}>
<ToolField as="p" id="sidebar-tool-action-summary" role="status">

</ToolField>
<div className="sidebar-tool-action-buttons">
<ToolField as="button" type="button" id="sidebar-tool-action-continue" className="od-button">
{"继续"}
</ToolField>
<ToolField as="button" type="button" id="sidebar-tool-action-cancel" className="od-button od-button--secondary">
{"取消"}
</ToolField>

</div>

</ToolField>

<ImportSheet open={importOpen} blockFiles={marketReview !== null} busy={Boolean(marketReview?.busy)}
  onBackdrop={event=>marketReview ? dismissImport() : view.dispatch('sidebar-tool-import-close','click',event.nativeEvent)}
  onFileDrop={event=>{if(!marketReview)view.dispatch('sidebar-tool-file','drop',event.nativeEvent);}}>
{marketReview ? <section id="sidebar-tool-import" className="sidebar-tool-import od-surface od-market-install-sheet"
  ref={node=>{if(node)refs.current.set('sidebar-tool-import',node);else refs.current.delete('sidebar-tool-import');}}
  role="dialog" aria-modal="true" aria-labelledby="sidebar-tool-import-heading" tabIndex={-1}
  aria-busy={marketReview.busy} data-phase={marketReview.phase}>
  <div className="sidebar-tool-import-head od-toolbar">
    <strong id="sidebar-tool-import-heading">{marketReview.phase==='review'?
      (marketReview.details?.previousVersion?'审阅应用更新':'审阅应用安装'):
      marketReview.phase==='installed'?
        (marketReview.details?.previousVersion?'更新完成':'安装完成'):
      marketReview.phase==='cancelled'?'已取消安装':
      marketReview.phase==='unknown'?'尚未确认安装结果':
      marketReview.phase==='installing'?'正在安装…':'安装审阅'}</strong>
    <IconButton label={['installed','cancelled'].includes(marketReview.phase)?'关闭':'稍后继续'}
      className="sidebar-tool-icon-action od-market-close"
      disabled={marketReview.busy} onClick={dismissImport}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19"/></svg>
    </IconButton>
  </div>
  <div className="od-import-sheet-body od-market-review">
    {marketReview.details ? <>
      <div className="od-market-identity">
        <span className="od-market-app-icon"><MarketGlyph kind="app"/></span>
        <div className="od-market-identity-copy">
          <h2 className="od-market-app-name">{marketReview.title}</h2>
          <p className="od-market-publisher" title="已核对配置的发行渠道，不代表认证了开发者身份">
            发行渠道 · {marketOriginHost(marketReview.details.origin)}
          </p>
        </div>
      </div>
      <div className="od-market-version-line">
        <span className="od-market-version-label">{marketReview.details.previousVersion?'版本更新':'安装版本'}</span>
        <div className="od-market-version-numbers">
          {marketReview.details.previousVersion&&<>
            <span className="od-market-version-from">v{marketReview.details.previousVersion}</span>
            <span className="od-market-version-arrow"><MarketGlyph kind="arrow"/></span>
          </>}
          <strong>v{marketReview.details.version}</strong>
        </div>
      </div>
      {marketReview.phase==='review'&&<>
        {marketReview.details.description&&<p className="od-market-description">{marketReview.details.description}</p>}
        {marketReview.details.identicalInstalledPackage&&
          <p className="od-market-same-package"><MarketGlyph kind="check"/> 本机已有完全相同的版本与内容，确认后只核对原安装结果。</p>}
        <section className="od-market-section" aria-labelledby="od-market-permissions-title">
          <div className="od-market-section-head">
            <span className="od-market-section-icon"><MarketGlyph kind="shield"/></span>
            <h3 id="od-market-permissions-title">权限与访问</h3>
            <span className="od-market-section-aside">{(marketReview.details.capabilityCodes??[]).length} 项声明</span>
          </div>
          {(marketReview.details.capabilityCodes??[]).length?
            <div className="od-market-capability-list">
              {(marketReview.details.capabilityCodes??[]).slice(0,3).map(code=>
                <MarketCapabilityRow key={code} code={code}
                  isNew={(marketReview.details.addedCodes??[]).includes(code)&&Boolean(marketReview.details.previousVersion)}/>)}
              {(marketReview.details.capabilityCodes??[]).length>3&&
                <details className="od-market-more-capabilities">
                  <summary>查看其余 {(marketReview.details.capabilityCodes??[]).length-3} 项能力</summary>
                  <div className="od-market-capability-list">
                    {marketReview.details.capabilityCodes.slice(3).map(code=>
                      <MarketCapabilityRow key={code} code={code}
                        isNew={(marketReview.details.addedCodes??[]).includes(code)&&Boolean(marketReview.details.previousVersion)}/>)}
                  </div>
                </details>}
            </div>:<p className="od-market-empty-permissions">未声明额外浏览器能力</p>}
          <div className="od-market-site-scope">
            <span className="od-market-site-icon"><MarketGlyph kind="web"/></span>
            <div>
              <strong>{(marketReview.details.capabilityCodes??[]).every(code=>MARKET_NO_SITE_CAPABILITIES.has(code))?
                '无需网站访问':'网站访问按需授权'}</strong>
              <p>安装本身不授予网站访问；实际站点范围由权限系统管理。</p>
            </div>
          </div>
        </section>
        {marketReview.details.previousVersion&&<section className="od-market-section od-market-changes"
          aria-labelledby="od-market-changes-title">
          <div className="od-market-section-head">
            <span className="od-market-section-icon"><MarketGlyph kind="arrow"/></span>
            <h3 id="od-market-changes-title">本次变化</h3>
          </div>
          {(marketReview.details.addedCodes??[]).length===0&&(marketReview.details.removedCodes??[]).length===0?
            <div className="od-market-unchanged"><MarketGlyph kind="check"/> 权限声明没有变化</div>:
            <div className="od-market-change-details">
              {(marketReview.details.addedCodes??[]).length>0&&<p>
                <strong>新增能力</strong> · {marketReview.details.addedCodes.map(code=>
                  MARKET_CAPABILITY_UI[code]?.[0]||'其他受限能力').join('、')}
              </p>}
              {(marketReview.details.removedCodes??[]).length>0&&<p>
                <strong>移除能力</strong> · {marketReview.details.removedCodes.map(code=>
                  MARKET_CAPABILITY_UI[code]?.[0]||'其他受限能力').join('、')}
              </p>}
            </div>}
          <p className="od-market-secondary-note">仅比较已核验的能力声明；发行包未提供功能更新日志。</p>
        </section>}
        <section className="od-market-retention" aria-label="安装与数据影响">
          <span className="od-market-retention-icon"><MarketGlyph kind="check"/></span>
          <div>
            <strong>{marketReview.details.previousVersion?'保留现有数据':'安装不会自动执行应用代码'}</strong>
            <p>{marketReview.details.previousVersion?
              '正常更新不会主动清除应用数据；原有停用状态延续。':'安装完成后由你决定何时打开使用。'}
            </p>
            {marketReview.details.previousDisabled&&<p className="od-market-retained-disabled">当前应用已停用，更新后仍保持停用。</p>}
          </div>
        </section>
      </>}
    </> : marketReview.summary.map((line,index)=><p key={index} className="od-market-fallback-line">{line}</p>)}
    {marketReview.phase!=='review'&&<div className="od-market-feedback"
      role={marketReview.phase==='error'?'alert':'status'} aria-live="polite">
      <MarketGlyph kind={marketReview.phase==='installed'?'check':'info'}/>
      <p>{marketReview.message}</p>
    </div>}
    {marketReview.details&&<details className="sidebar-tool-technical-details od-market-advanced od-disclosure od-disclosure--flat">
      <summary>高级信息 <span>应用身份与发行校验</span></summary>
      <dl>
        <div><dt>应用 ID</dt><dd>{marketReview.details.id||'未提供'}</dd></div>
        <div><dt>完整来源</dt><dd>{marketReview.details.origin}</dd></div>
        <div><dt>SHA-256</dt><dd>{marketReview.details.sha256||'尚无校验摘要'}</dd></div>
        {Number.isSafeInteger(marketReview.details.packageBytes)&&
          <div><dt>发行包大小</dt><dd>{marketReview.details.packageBytes.toLocaleString('zh-CN')} 字节</dd></div>}
        <div><dt>原始能力标识</dt><dd>{(marketReview.details.capabilityCodes??[]).join(' · ')||'无'}</dd></div>
      </dl>
      <p>校验固定发行内容不等于发布者身份认证；具体网站授权由现有权限系统决定。</p>
    </details>}
    {!marketReview.details&&marketReview.technical.length>0&&
      <details className="sidebar-tool-technical-details od-market-advanced od-disclosure od-disclosure--flat">
        <summary>高级信息</summary>
        {marketReview.technical.map((line,index)=><p key={index}>{line}</p>)}
      </details>}
  </div>
  <div className="od-import-sheet-footer od-market-footer">
    {marketReview.phase==='review'&&
      <p className="od-market-footer-note">确认一次即可提交此固定版本；关闭可以稍后继续审阅。</p>}
    <div className="od-market-actions">{marketReview.actions.map((action,index)=>
      <Button key={action.id} variant={index===0?'primary':'secondary'}
        disabled={marketReview.busy} onClick={()=>{if(!marketReviewRef.current?.busy)view.marketInstallActions?.act(action.id);}}>
        {action.label}
      </Button>)}</div>
  </div>
</section> : <ToolField as="section" id="sidebar-tool-import" className="sidebar-tool-import od-surface"
  role="dialog" aria-modal={importOpen} aria-labelledby="sidebar-tool-import-heading" hidden={true} tabIndex={-1}>
<div className="sidebar-tool-import-head od-toolbar">
<strong id="sidebar-tool-import-heading">
{"导入扩展"}
</strong>
<ToolField as="button" type="button" id="sidebar-tool-import-close" className="sidebar-tool-icon-action od-icon-button" title="取消导入" aria-label="取消导入">
<svg viewBox="0 0 24 24" aria-hidden="true">
<path d="M5 5l14 14M19 5 5 19">

</path>

</svg>

</ToolField>

</div>
<div className="od-import-sheet-body">
<label htmlFor="sidebar-tool-file">
{reviewing ? "更换安装包" : "选择安装包"}
</label>
<ToolFileInput value={snapshot.fields['sidebar-tool-file'].value} disabled={snapshot.fields['sidebar-tool-file'].disabled}
  onChoose={actions.chooseFile} onCancel={actions.cancelFile}/>
<ToolField as="p" id="sidebar-tool-file-error" className="sidebar-tool-file-error" role="alert" hidden={true}/>
{!reviewing && <p className="sidebar-tool-import-hint">也可将 .opendesk-tool.json 或 .opendesk-page.json 拖入此窗口。</p>}
<ToolField as="div" id="sidebar-tool-preview" className="sidebar-tool-preview" hidden={true}>
<div className="sidebar-tool-preview-heading">
<ToolField as="strong" id="sidebar-tool-preview-title"/>
<ToolField as="span" id="sidebar-tool-preview-version"/>
</div>
<ToolField as="div" id="sidebar-tool-update" className="sidebar-tool-update" hidden={true}>
<ToolField as="p" id="sidebar-tool-update-versions"/>
<ToolField as="p" id="sidebar-tool-update-impact"/>
<ToolField as="p" id="sidebar-tool-update-warning" className="sidebar-tool-update-warning" hidden={true}/>
</ToolField>
<ToolField as="p" id="sidebar-tool-preview-description"/>
<ToolField as="details" id="sidebar-tool-permissions-details" className="sidebar-tool-permissions-details od-disclosure od-disclosure--flat">
<summary><ToolField as="span" id="sidebar-tool-permission-summary"/></summary>
<div className="sidebar-tool-permission-body">
<ToolField as="p" id="sidebar-tool-preview-capabilities"/>
<ToolField as="p" id="sidebar-tool-update-capabilities"/>
</div>
</ToolField>
<ToolField as="p" id="sidebar-tool-preview-source"/>
<ToolField as="details" id="sidebar-tool-technical-details" className="sidebar-tool-technical-details od-disclosure od-disclosure--flat">
<summary>技术详情 · 文件与校验信息</summary>
<ToolField as="p" id="sidebar-tool-preview-file" className="sidebar-tool-preview-file"/>
</ToolField>
</ToolField>
<ToolField as="p" id="page-install-import-status" role="status" aria-live="polite" hidden={true}>

</ToolField>
<ToolField as="details" id="page-install-import-receipt" className="od-disclosure" hidden={true}>
<summary>
{"安装回执"}
</summary>
<ToolField as="p" id="page-install-import-receipt-text">

</ToolField>

</ToolField>
</div>
<div className="od-import-sheet-footer" hidden={snapshot.fields['sidebar-tool-preview'].hidden}>
<ToolField as="button" type="button" id="sidebar-tool-install" className="od-button" disabled={true}>
{"确认安装"}
</ToolField>
</div>
</ToolField>}
</ImportSheet>

<aside className="sidebar-tool-development-panel od-stack" aria-label="OpenDesk 开发工具"
  hidden={concealed||previewStatus.hidden!==false}>
  <div className="od-toolbar" role="group" aria-label="应用调试控制">
    <details className="od-disclosure od-disclosure--flat sidebar-tool-development-info">
      <summary>OpenDesk 开发信息</summary>
      <ToolField as="p" id="sidebar-tool-readonly-banner" className="hint" role="note" hidden={true}/>
      <p className="hint">调试使用隔离测试数据，不会使用正式应用数据。</p>
    </details>
    {debugPreview&&<Button variant="secondary" onClick={onStopDebug}>停止调试</Button>}
  </div>
  {previewStatus.data?.state==='error'&&!previewStatus.hidden&&
    <p className="sidebar-tool-status" data-state="error" role="status">{previewStatus.textContent}</p>}
  <ToolField as="p" id="sidebar-tool-development-status" className="sidebar-tool-status" role="status" hidden={true}/>
</aside>

<ToolField as="section" id="sidebar-tool-display" forceHidden={concealed} className="sidebar-tool-display" aria-label="当前工具界面" hidden={true}>
<div className="sidebar-tool-view-head od-toolbar od-page-head">
<ToolField as="button" type="button" id="sidebar-tool-back" forceHidden={debugPreview} className="sidebar-tool-icon-action od-icon-button" title="返回工具列表" aria-label="返回自定义工具列表">
<svg viewBox="0 0 24 24" aria-hidden="true">
<path d="m14 5-7 7 7 7M7 12h14">

</path>

</svg>

</ToolField>
<ToolField as="strong" id="sidebar-tool-title" className="od-page-title"
  role="heading" aria-level={2}/>
<ToolField as="button" type="button" id="sidebar-tool-primary-action" className="sidebar-tool-icon-action od-icon-button" title="当前页面操作" aria-label="当前页面操作" hidden={true}>
<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
{topAction==='new' ? <path d="M12 5v14M5 12h14"/> :
 topAction==='edit' ? <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L9 17l-4 1 1-4z"/> :
 <path d="M4 3h14l3 3v15H3V3h1M7 3v6h10V3M7 21v-8h10v8"/>}
</svg>
</ToolField>
<ToolField as="button" type="button" id="sidebar-tool-secondary-action" className="sidebar-tool-icon-action od-icon-button" title="更多操作" aria-label="更多操作" aria-haspopup="true" aria-expanded="false" hidden={true}>
<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
{secondaryAction==='transfer'
  ? <><path d="M7 17V4m-4 4 4-4 4 4M17 7v13m-4-4 4 4 4-4"/></>
  : <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>}
</svg>
</ToolField>
<TrustedConversationHeaderSlot/>
<div className="sidebar-tool-header-actions" role="group" aria-label="工具管理"
  data-management-ui="direct-actions-v1" hidden={!managementActionsVisible}>
<ToolField as="button" type="button" id="sidebar-tool-settings-open" className="sidebar-tool-icon-action od-icon-button"
  title="工具设置" aria-label="工具设置" aria-controls="sidebar-tool-settings-view"
  aria-expanded="false" hidden={true} nodeRef={runtimeRefs.settingsControl}>
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M10 2h4l.5 2.5 2 1 2.4-1 2.3 3-1.7 2v3l1.7 2-2.3 3-2.4-1-2 1L14 21h-4l-.5-2.5-2-1-2.4 1-2.3-3 1.7-2v-3l-1.7-2 2.3-3 2.4 1 2-1Z"/>
  </svg>
</ToolField>
<ToolField as="button" type="button" id="sidebar-tool-remove" className="sidebar-tool-icon-action od-icon-button"
  title="卸载工具及本地数据" aria-label="卸载当前工具及本地数据" disabled={true}>
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7h16M10 4h4m-8 3 1 13h10l1-13M10 11v5m4-5v5"/>
  </svg>
</ToolField>
</div>

</div>
<section id="sidebar-tool-adblock-native" hidden={!snapshot.legacyAdblockVisible}>此版本 AdBlock 的旧控制界面已退役。请在扩展中心更新至正式 React 版本；你仍可停用或卸载，可信服务负责清理该工具自有规则。</section><StayFocusQuickAdd model={snapshot.trustedSettings.stayFocus} actions={view.trustedSettingsActions.stayFocus}/>{cookieFirstUse&&<CookieSettings onRevoke={actions.revoke}/>}<div id="sidebar-tool-frame" className="sidebar-tool-frame" ref={runtimeRefs.frameRoot}/><section id="sidebar-tool-ai-proxy-native" className="sidebar-tool-ai-proxy-native" aria-label="AI 智能访问可信设置" hidden={!snapshot.trustedSettings.aiAccess?.visible}><AiAccessSettings model={snapshot.trustedSettings.aiAccess} actions={view.trustedSettingsActions.aiAccess}/></section><ToolField as="button" type="button" id="sidebar-tool-launch" className="od-button" hidden={true}>
{"打开工具"}
</ToolField>
<ToolField as="section" id="sidebar-tool-retired-draft" className="sidebar-tool-settings-view od-surface" aria-label="停用前的草稿" hidden={true}>
<p>
{"工具已停止。以下表单草稿可选择并复制；关闭此窗口后副本会丢失。"}
</p>
<textarea id="sidebar-tool-retired-draft-text" aria-label="可复制的草稿副本" readOnly className="od-field"
  value={snapshot.fields['sidebar-tool-retired-draft-text'].value}/>
<ToolField as="button" type="button" id="sidebar-tool-retired-draft-dismiss" className="od-button">
{"清除草稿副本"}
</ToolField>

</ToolField>
<ToolField as="section" id="sidebar-tool-settings-view" className="sidebar-tool-settings-view od-surface" aria-label="工具设置" hidden={true}>
<section className="sidebar-tool-settings-product" aria-label="扩展设置">
<ToolField as="button" type="button" id="sidebar-tool-adblock-product-settings"
  className="od-button od-button--secondary" hidden={true}>{"广告拦截设置"}</ToolField>
<ToolField as="div" id="sidebar-tool-toc-language" className="sidebar-toc-settings-row" hidden={true}>
<label htmlFor="sidebar-tool-toc-language-select">
<ToolLabel name="languageLabel"/>
</label>
<select id="sidebar-tool-toc-language-select" className="od-field" aria-label={snapshot.labels.languageLabel}
  value={snapshot.fields['sidebar-tool-toc-language-select'].value} disabled={snapshot.fields['sidebar-tool-toc-language-select'].disabled}
  onChange={actions.language}>
<option value="follow">{snapshot.labels.followLanguage}</option>
{(snapshot.fields['sidebar-tool-toc-language-select'].rows?.length?
 snapshot.fields['sidebar-tool-toc-language-select'].rows:
 [{id:'zh-CN',label:'简体中文'},{id:'en',label:'English'}]).map(row=>
 <option key={row.id} value={row.id}>{row.label}</option>)}

</select>

</ToolField>
<ToolField as="button" type="button" id="sidebar-tool-language-manage" className="od-button od-button--secondary"
  title="切换语言 / Language" aria-label="语言 / Language" hidden={true}>语言</ToolField>
<ToolField as="div" id="sidebar-tool-prompt-web-row" className="sidebar-toc-settings-row sidebar-tool-prompt-native" hidden={true}>
<span className="sidebar-tool-prompt-native-info">
<strong>
{"网页快捷按钮"}
</strong>
</span>
<ToolField as="button" type="button" id="sidebar-tool-prompt-web-action" className="ps-host-switch" role="switch" aria-label="网页快捷按钮" aria-checked="true" disabled={true}>

</ToolField>

</ToolField>
<ToolField as="div" id="sidebar-tool-prompt-native-row" className="sidebar-toc-settings-row sidebar-tool-prompt-native" hidden={true}>
<span className="sidebar-tool-prompt-native-info">
<strong>
{"选中文字快速添加"}
</strong>
</span>
<ToolField as="button" id="sidebar-tool-prompt-native-action" type="button" aria-pressed="false" className="od-button od-button--secondary ps-host-switch">
{"启用右键"}
</ToolField>

</ToolField>
<ToolField as="div" id="sidebar-tool-generic-site-scope" className="sidebar-toc-settings-scope">
<div>
<ToolField as="span" className="sidebar-toc-settings-caption" id="sidebar-tool-settings-scope-label">
{"当前网站授权"}
</ToolField>
<ToolField as="strong" id="sidebar-tool-settings-target">
{"请选择适用网页"}
</ToolField>

</div>
<ToolField as="button" type="button" id="sidebar-tool-settings-scope" hidden={true} className="od-button od-button--secondary">
{"只设置本页"}
</ToolField>

</ToolField>
<ToolField as="div" id="sidebar-tool-generic-site-binary" className="sidebar-toc-settings-binary" role="group" aria-label="当前网站授权">
<ToolField as="button" type="button" id="sidebar-tool-settings-allow" aria-pressed="false" className="od-button od-button--secondary">
{"授权当前网站"}
</ToolField>
<ToolField as="button" type="button" id="sidebar-tool-settings-deny" aria-pressed="false" className="od-button od-button--danger">
{"撤销当前网站授权"}
</ToolField>

</ToolField>
<ToolField as="p" id="sidebar-tool-settings-hint" className="sidebar-toc-settings-hint" role="status">

</ToolField>
<div className="sidebar-tool-site-shortcuts" role="group" aria-label="网页增强操作" hidden={!siteShortcutsVisible}>
<ToolField as="button" type="button" id="sidebar-tool-visibility" className="sidebar-tool-icon-action od-icon-button"
  title="显示或隐藏此网站的悬浮目录" aria-label="显示或隐藏此网站的悬浮目录" aria-pressed="true" hidden={true}>
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
  <span><ToolLabel name="overlayName"/></span>
</ToolField>
<ToolField as="button" type="button" id="sidebar-tool-context-menu" className="sidebar-tool-icon-action od-icon-button"
  title="为当前网站启用右键菜单" aria-label="为当前网站启用右键菜单" aria-pressed="false" hidden={true}>
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M4 5h16M4 12h16M4 19h16M9 3v4M15 10v4M11 17v4"/>
  </svg>
  <span>网页右键菜单</span>
</ToolField>
</div>
<ToolField as="div" id="sidebar-tool-visibility-settings" hidden={true}>
<strong className="sidebar-toc-settings-title">
<ToolLabel name="overlayHeading"/>
</strong>
<div className="sidebar-toc-settings-row">
<span>
<ToolLabel name="websiteHeading"/>
</span>
<ToolField as="button" type="button" id="sidebar-tool-settings-site-visibility" className="sidebar-toc-visibility-toggle">
{"隐藏"}
</ToolField>

</div>
<div className="sidebar-toc-settings-row">
<span>
<ToolLabel name="pageHeading"/>
</span>
<ToolField as="button" type="button" id="sidebar-tool-settings-page-visibility" className="sidebar-toc-visibility-toggle">
{"隐藏"}
</ToolField>

</div>
<p className="sidebar-toc-settings-hint">
<ToolLabel name="overlayHint"/>
</p>

</ToolField>
<ToolField as="details" id="sidebar-tool-generic-site-advanced" className="sidebar-toc-advanced od-disclosure od-disclosure--flat" open={true}>
<summary>
<ToolLabel name="advancedHeading"/>
</summary>
<ToolField as="strong" className="sidebar-toc-settings-title" id="sidebar-tool-settings-sites-title">
{"已授权的网站"}
</ToolField>
<ToolGrantRows id="sidebar-tool-settings-sites" rows={snapshot.fields['sidebar-tool-settings-sites'].rows}
  emptyLabel={snapshot.fields['sidebar-tool-settings-sites'].emptyLabel} disabled={snapshot.fields['sidebar-tool-settings-sites'].disabled}
  className="sidebar-toc-settings-entries" onRevoke={actions.revoke}/>
<ToolField as="div" id="sidebar-tool-page-exceptions" hidden={true}>
<strong className="sidebar-toc-settings-title">
<ToolLabel name="exceptionsHeading"/>
</strong>
<ToolGrantRows id="sidebar-tool-settings-pages" rows={snapshot.fields['sidebar-tool-settings-pages'].rows}
  emptyLabel={snapshot.fields['sidebar-tool-settings-pages'].emptyLabel} disabled={snapshot.fields['sidebar-tool-settings-pages'].disabled}
  className="sidebar-toc-settings-entries" onRevoke={actions.revoke}/>

</ToolField>

</ToolField>
<TimeReviewSettings model={snapshot.trustedSettings.timeReview} actions={view.trustedSettingsActions.timeReview}/><StayFocusSettings model={snapshot.trustedSettings.stayFocus} actions={view.trustedSettingsActions.stayFocus}/>
</section>
<section className="sidebar-tool-settings-permissions" aria-label="权限管理" hidden={!permissionVisible}>
<BookmarkSettings/>
{!cookieFirstUse&&<CookieSettings onRevoke={actions.revoke}/>}
</section>
<section className="sidebar-tool-management" aria-label="应用管理">
<div className="sidebar-toc-settings-row">
<span className="sidebar-tool-prompt-enable-info">
<ToolField as="strong" id="sidebar-tool-prompt-enable-label">
<ToolLabel name="toggleHeading"/>
</ToolField>
<ToolField as="small" id="sidebar-tool-prompt-enable-description" hidden={true}>
{"停用后提示词仍保留"}
</ToolField>

</span>
<ToolField as="button" type="button" id="sidebar-tool-enable" className="od-tool-management-switch"
  role="switch" aria-label="启用工具" aria-checked="true"/>
<ToolField as="button" type="button" id="sidebar-tool-enable-retry"
  className="od-button od-button--secondary" hidden={true}>{"重新读取"}</ToolField>

</div>
<ToolField as="p" id="sidebar-tool-enable-hint" className="sidebar-toc-settings-hint" role="status">

</ToolField>
<ToolField as="button" type="button" id="sidebar-tool-open-tab" className="od-button od-button--secondary sidebar-tool-settings-open-tab" title="在新标签页打开" aria-label="在新标签页打开当前工具">
<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 5h6v6m0-6-9 9M19 13v6H5V5h6"/></svg>
<ToolLabel name="openTabLabel"/>
</ToolField>
</section>

</ToolField>

</ToolField>

<ToolField as="p" id="sidebar-tool-status" className="sidebar-tool-status" role="status" aria-live="polite" hidden={true}>

</ToolField>

<UninstallDialog open={snapshot.fields['sidebar-tool-inline-remove'].hidden===false}
  title={'卸载「'+(snapshot.fields['sidebar-tool-inline-remove']?.data?.title||
    snapshot.fields['sidebar-tool-title']?.textContent||'当前扩展')+'」？'}
  busy={snapshot.fields['sidebar-tool-inline-remove-confirm'].disabled}
  returnFocusSelector="#sidebar-tool-remove"
  onCancel={event=>view.dispatch('sidebar-tool-inline-remove-cancel','click',event)}>
<ToolField as="section" id="sidebar-tool-inline-remove" className="sidebar-tool-inline-remove od-surface" aria-label="卸载工具确认" hidden={true}>
<ToolField as="p" id="sidebar-tool-inline-remove-text">

</ToolField>
<div className="sidebar-tool-inline-remove-actions od-uninstall-dialog-actions">
<ToolField as="button" type="button" id="sidebar-tool-inline-remove-cancel" data-uninstall-cancel="true" className="od-button od-button--secondary">
{"取消"}
</ToolField>
<ToolField as="button" type="button" id="sidebar-tool-inline-remove-confirm" className="od-button od-uninstall-confirm">
{"确认卸载"}
</ToolField>

</div>

</ToolField>
</UninstallDialog>
</div></ToolContext.Provider>;
}

function ImportSheet({open,onBackdrop,onFileDrop,blockFiles=false,busy=false,children}) {
  const [fileOver,setFileOver]=React.useState(false),depth=React.useRef(0);
  React.useEffect(()=>{if(!open){depth.current=0;setFileOver(false);}},[open]);
  const hasFiles=event=>Array.from(event.dataTransfer?.types||[]).includes('Files');
  const overlay=<div className="od-import-overlay" hidden={!open}
    data-file-drag={fileOver?'true':undefined}
    onDragEnter={event=>{
      if(!hasFiles(event))return;
      event.preventDefault();if(blockFiles)return;depth.current++;setFileOver(true);
    }}
    onDragOver={event=>{
      if(!hasFiles(event))return;
      event.preventDefault();event.dataTransfer.dropEffect=blockFiles?'none':'copy';
    }}
    onDragLeave={event=>{
      if(!hasFiles(event))return;
      depth.current=Math.max(0,depth.current-1);
      if(!depth.current)setFileOver(false);
    }}
    onDrop={event=>{
      if(blockFiles){event.preventDefault();event.stopPropagation();depth.current=0;setFileOver(false);return;}
      if(!hasFiles(event))return;
      event.preventDefault();event.stopPropagation();
      depth.current=0;setFileOver(false);if(!blockFiles)onFileDrop?.(event);
    }}>
    <button type="button" className="od-import-backdrop" tabIndex={-1}
      aria-label="关闭导入扩展" disabled={busy} onClick={onBackdrop}/>
    {children}
  </div>;
  // SSR keeps the single expected host; Chrome portals it out of scroll clipping.
  return typeof document==='undefined' ? overlay : createPortal(overlay,document.body);
}

function ToolLabel({name}) {return React.useContext(ToolContext).snapshot.labels[name];}

function CookieSettings({onRevoke}) {
  const {snapshot} = React.useContext(ToolContext);
  const {rows,emptyLabel,disabled} = snapshot.fields['sidebar-tool-cookie-other-sites'];
  const firstUse=snapshot.fields['sidebar-tool-cookie-permissions'].data?.mode==='first-use';
  const isCookieEditor=snapshot.fields['sidebar-tool-cookie-permissions'].data?.isCookieEditor===true;
  return <ToolField as="section" id="sidebar-tool-cookie-permissions"
    className="sidebar-tool-cookie-permissions od-surface" aria-label="Cookie 访问授权">
    <ToolField as="strong" id="sidebar-tool-cookie-heading"/>
    {!firstUse&&<ToolField as="p" id="sidebar-tool-cookie-target"/>}
    <ToolField as="p" id="sidebar-tool-cookie-help"/>
    <ToolField id="sidebar-tool-cookie-first-use"><ToolField as="button"
      id="sidebar-tool-cookie-site-toggle" className="od-button"/></ToolField>
    {!firstUse&&<>
      {!isCookieEditor&&<ToolField as="button" type="button" id="sidebar-tool-cookie-values-toggle"
        className="od-button od-button--secondary"/>}
      <ToolGrantRows id="sidebar-tool-cookie-other-sites" rows={rows} emptyLabel={emptyLabel}
        disabled={disabled} rowClassName="sidebar-toc-settings-row" onRevoke={onRevoke}/>
    </>}
  </ToolField>;
}
function BookmarkSettings() {
  // First full-bookmark consent exposes scope immediately; routine granted
  // management keeps the same detail available without occupying the page.
  const {snapshot}=React.useContext(ToolContext);
  const firstUse=snapshot.fields['sidebar-tool-bookmark-grant'].attributes?.['aria-pressed']!=='true';
  return <ToolField as="section" id="sidebar-tool-bookmark-permissions"
    className="sidebar-tool-bookmark-permissions od-surface" aria-label="书签访问">
    <div className="sidebar-tool-bookmark-intro">
      <div className="sidebar-tool-bookmark-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18l-6-4-6 4Z"/>
        </svg>
      </div>
      <div className="sidebar-tool-bookmark-copy">
        <ToolField as="strong" id="sidebar-tool-bookmark-heading"/>
        <ToolField as="p" id="sidebar-tool-bookmark-info"/>
      </div>
    </div>
    <ToolField as="button" type="button" id="sidebar-tool-bookmark-grant" className="od-button"/>
    <details className="od-disclosure od-disclosure--flat" open={firstUse}>
      <summary>查看权限范围</summary>
      <p>可读取、编辑、移动和删除 Chrome 全部书签，包括其他工具创建的内容。删除文件夹仍须单独确认。授权可随时撤销。</p>
    </details>
  </ToolField>;
}

function ToolField({as:Tag='div', id, children, nodeRef, forceHidden=false, ...props}) {
  const {view, snapshot, refs} = React.useContext(ToolContext), state = snapshot.fields[id];
  if (!state) throw new Error('E_SIDEBAR_TOOL_FIELD: ' + id);
  const ref = React.useCallback(node => {if (node) refs.current.set(id, node); else refs.current.delete(id); nodeRef?.(node);}, [refs, id, nodeRef]);
  const attrs = {...props, id, ref, hidden: state.hidden||forceHidden, title: state.title ?? props.title,
    className: state.className ?? props.className, ...state.attributes};
  for (const [key, value] of Object.entries(state.data)) attrs['data-' + key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())] = value;
  if (Tag === 'button') {attrs.disabled = state.disabled; attrs.type = props.type || 'button'; attrs.onClick = event => view.dispatch(id, 'click', event.nativeEvent);}
  if (Tag === 'details') {attrs.open = state.open; attrs.onToggle = event => {if (event.currentTarget.open !== view.fields[id].open) view.patch(id, {open:event.currentTarget.open});};}
  const content=state.textSet ? state.textContent : children ?? state.textContent;
  return <Tag {...attrs}>{content}</Tag>;
}

function ToolGrantRows({id, rows, emptyLabel, disabled, onRevoke, className, rowClassName='sidebar-tool-site-entry'}) {
  return <div id={id} className={className}>
    {rows.length ? rows.map(row => <div key={row.id} className={rowClassName}>
      <span title={row.text}>{row.text}</span><button type="button" className="sidebar-tool-site-revoke" disabled={disabled || row.disabled}
        aria-label={row.ariaLabel || row.label + ' ' + row.text} onClick={event => onRevoke(id, row.id, event)}>{row.label}</button>
    </div>) : emptyLabel ? <p>{emptyLabel}</p> : null}
  </div>;
}

function ToolFileInput({value, disabled, onChoose, onCancel}) {
  const ref = React.useRef(null);
  // File selection cannot be controlled by React. Only clear it on controller
  // reset; cancelling a native picker is a separate, non-bubbling browser event.
  React.useLayoutEffect(() => {if (value === '') ref.current.value = '';}, [value]);
  React.useLayoutEffect(() => {
    const node = ref.current;
    node.addEventListener('cancel', onCancel); return () => node.removeEventListener('cancel', onCancel);
  }, [onCancel]);
  return <input ref={ref} id="sidebar-tool-file" type="file" accept=".json,application/json"
    aria-describedby="sidebar-tool-file-error" disabled={disabled} onChange={onChoose}/>;
}
