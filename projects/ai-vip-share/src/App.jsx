import * as React from 'react';
import {Button,IconButton,Card,CardContent} from '@opendesk/ui';
import toolConfig from '../tool.config.json';

// This is the installable app's only UI tree. The v1.4.2 compatibility
// controller mounts after React commits. Preview and developer controls
// are never children of the installable product UI.
export default function VipApp({createDevelopmentControls,serviceDefinition}={}){
  React.useLayoutEffect(()=>{
    const dispose=globalThis.__OpenDeskVipStart?.({createDevelopmentControls,serviceDefinition});
    return ()=>dispose?.();
  },[createDevelopmentControls,serviceDefinition]);
  return (
    <main className="ai-vip od-theme-shadcn" aria-label="AI VIP Share 服务连接、会员与网站使用">
      <Card id="ai-vip-connection" aria-labelledby="ai-vip-connection-title">
        <CardContent className="ai-vip-section-content">
          <div className="ai-vip-section-head"><h2 id="ai-vip-connection-title">连接服务</h2>
            <Button variant="quiet" id="ai-vip-connection-change" type="button" hidden>更换链接</Button>
          </div>
          <p id="ai-vip-connection-summary" className="ai-vip-note" hidden></p>
          <div id="ai-vip-connection-form" className="ai-vip-section-content">
            <label className="od-form-field" htmlFor="ai-vip-service-link">
              <span className="od-field-label">服务方提供的链接</span>
              <input id="ai-vip-service-link" className="od-field" type="url" maxLength="2048" data-sensitive
                autoComplete="off" spellCheck="false" placeholder="粘贴服务链接或专属激活链接" />
            </label>
            <Button variant="primary" size="lg" id="ai-vip-connect" type="button">连接并查看权益</Button>
          </div>
          <p id="ai-vip-connection-status" className="ai-vip-note" role="status" aria-live="polite">粘贴服务方提供的链接，连接后查看权益；激活前会先供你核对。</p>
        </CardContent>
      </Card>
      <Card id="ai-vip-member-card" className="ai-vip-membership" data-view="unconfigured" aria-labelledby="ai-vip-member-title">
        <CardContent className="ai-vip-card-inner">
          <div className="ai-vip-section-head">
            <h2 id="ai-vip-member-title">AI 会员</h2>
            <span id="ai-vip-member-state" className="ai-vip-pill" role="status" aria-live="polite">待核验</span>
          </div>
          <div className="ai-vip-account-row">
            <span className="ai-vip-avatar" aria-hidden="true">AI</span>
            <div className="ai-vip-account-copy">
              <strong id="ai-vip-account-name">正在核验会员信息</strong>
              <span id="ai-vip-product-name" hidden></span>
            </div>
            <IconButton label="刷新会员信息" id="ai-vip-refresh" className="od-icon-button--quiet ai-vip-refresh" type="button" title="刷新会员信息" aria-label="刷新会员信息" hidden disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.5-4.5L3 9"/><path d="M3 4v5h5"/><path d="M4 13a8 8 0 0 0 14.5 4.5L21 15"/><path d="M21 20v-5h-5"/></svg></IconButton>
          </div>
          <p id="ai-vip-member-empty" className="ai-vip-member-empty" hidden>
            <span id="ai-vip-member-empty-text"></span>{' '}
            <Button variant="link" size="lg" type="button" id="ai-vip-focus-redeem" hidden>前往兑换</Button>
          </p>
          <div id="ai-vip-member-facts" className="ai-vip-member-facts" hidden>
            <p id="ai-vip-metric-label" className="ai-vip-metric-caption">剩余会员时间</p>
          <div className="ai-vip-metric-line">
            <div className="ai-vip-metric" aria-label="经过服务端核验的权益">
              <strong id="ai-vip-remaining"></strong><span id="ai-vip-remaining-unit"></span>
            </div>
            <span id="ai-vip-expiry" className="ai-vip-expiry"></span>
          </div>
          <div id="ai-vip-meter" className="ai-vip-meter" role="progressbar" aria-label="已核验的剩余额度进度" aria-valuemin="0" aria-valuemax="100" hidden><span id="ai-vip-meter-bar"></span></div>
          </div>
          <p id="ai-vip-verified" className="ai-vip-meta" role="status" aria-live="polite" hidden></p>
          <p id="ai-vip-secondary-metrics" className="ai-vip-secondary-metrics" hidden></p>
        </CardContent>
        <details id="ai-vip-history-details" className="ai-vip-history od-disclosure od-disclosure--flat" hidden>
          <summary><strong>兑换记录</strong><span><span id="ai-vip-history-count"></span></span></summary>
          <ol id="ai-vip-history-list" className="ai-vip-list"></ol>
        </details>
      </Card>
    
      <Card id="ai-vip-usage-card" className="ai-vip-redeem" aria-labelledby="ai-vip-redeem-title">
        <CardContent className="ai-vip-section-content">
        <h2 id="ai-vip-redeem-title">使用服务</h2>
        <p id="ai-vip-usage-help" className="ai-vip-redeem-subtitle">已有权益可直接打开网站；需要开通或续期时再激活。</p>
        <p id="ai-vip-login-flow" className="ai-vip-note" role="status" aria-live="polite"></p>
        <p id="ai-vip-redeem-intro" className="ai-vip-note od-field-help" hidden>先核对权益，再确认兑换。</p>
        <div id="ai-vip-activation-hint" className="ai-vip-link-hint" hidden>
          <strong>已识别专属激活链接 · 待确认</strong><p id="ai-vip-activation-detail"></p>
        </div>
        <details id="ai-vip-redeem-details" className="od-disclosure od-disclosure--flat" open><summary>有激活码？开通或续期</summary>
        <form id="ai-vip-redeem-form" className="ai-vip-redeem-form" noValidate hidden>
          <label className="ai-vip-sr-only" htmlFor="ai-vip-redeem-code">激活码</label>
          <div className="ai-vip-redeem-inputs">
            <div className="ai-vip-code-field">
              <input id="ai-vip-redeem-code" className="od-field" type="text" data-sensitive
                maxLength="120" autoComplete="off" autoCapitalize="none" spellCheck="false"
                aria-describedby="ai-vip-redeem-status ai-vip-redeem-error" placeholder="输入兑换码或激活码" inputMode="text" disabled />
              <IconButton label="清空激活码" id="ai-vip-code-clear" className="od-icon-button--quiet ai-vip-code-clear" type="button" title="清空激活码" aria-label="清空激活码" disabled>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5 19 19M19 5 5 19"/></svg>
              </IconButton>
            </div>
            <Button size="lg" variant="primary" id="ai-vip-redeem" className="od-button ai-vip-primary" type="submit" disabled>查看激活内容</Button>
          </div>
        </form>
        </details>
        <div id="ai-vip-redeem-preview" className="ai-vip-review" hidden>
          <div className="ai-vip-benefits-head"><strong>核对激活内容</strong><span>尚未领取</span></div>
          <strong id="ai-vip-preview-title"></strong>
          <p id="ai-vip-preview-description"></p>
          <p id="ai-vip-preview-account"></p>
          <div className="ai-vip-review-actions">
            <Button size="lg" variant="primary" id="ai-vip-redeem-confirm" className="od-button ai-vip-primary" type="button" disabled>确认激活</Button>
            <Button size="lg" id="ai-vip-redeem-cancel" className="od-button od-button--secondary" type="button" hidden>取消</Button>
          </div>
        </div>
        <div id="ai-vip-recovery" className="ai-vip-review ai-vip-review--warning od-alert od-alert--warning" hidden>
          <strong>兑换回执尚未确认</strong>
          <p id="ai-vip-recovery-status" role="status" aria-live="polite"></p>
          <Button size="lg" id="ai-vip-recovery-check" className="od-button od-button--secondary" type="button" disabled>核对上次兑换</Button>
        </div>
        <p id="ai-vip-redeem-status" className="ai-vip-note od-field-help" role="status" aria-live="polite">会员服务接入后可使用激活码。</p>
        <p id="ai-vip-redeem-error" className="ai-vip-error od-alert od-alert--error" role="alert" hidden></p>
        <p id="ai-vip-redeem-fine" className="ai-vip-fine-print" hidden>确认兑换后才会领取权益。</p>
      <div id="ai-vip-sites-section" className="ai-vip-sites" hidden>
        <p id="ai-vip-site-source" className="ai-vip-note"></p>
        <p className="ai-vip-note">登录会替换该网站当前账号。浏览器将请求必要授权；已有网站登录可直接打开。</p>
        <div className="ai-vip-site-content">
          <div id="ai-vip-site-options" className="ai-vip-site-options" role="group" aria-label="选择网站"></div>
          <input id="ai-vip-site-select" type="hidden" defaultValue="" />
          <div className="ai-vip-site-summary">
            <div id="ai-vip-site-account-row" className="ai-vip-current-session" hidden>
              <span>服务端分配</span>
              <p id="ai-vip-site-account">尚未获取授权账号。</p>
            </div>
          </div>
          <p id="ai-vip-session-validity" className="ai-vip-note" hidden></p>
          <div className="ai-vip-site-actions">
            <Button size="lg" variant="primary" id="ai-vip-site-receive" className="od-button ai-vip-primary" type="button" disabled>登录并打开网站</Button>
            <Button size="lg" id="ai-vip-site-open" variant="quiet" type="button" disabled>直接打开网站 ↗</Button>
            <Button size="lg" id="ai-vip-site-cancel" className="od-button od-button--secondary" type="button" hidden>取消本次操作</Button>
          </div>
          <p id="ai-vip-site-status" className="ai-vip-site-status" role="status" aria-live="polite" hidden></p>
      <details id="ai-vip-cookie-section" className="ai-vip-review od-disclosure od-disclosure--flat" aria-label="网站使用进度" hidden><summary id="ai-vip-cookie-summary">查看上次网站操作</summary>
        <p id="ai-vip-cookie-status" role="status" aria-live="polite">尚未取得网站会话。</p>
        <p className="ai-vip-fine-print">完成后请在网站核对账号和套餐。网站实际显示为准。</p>
        <details id="ai-vip-cookie-result-details" className="od-disclosure od-disclosure--flat" hidden><summary>查看操作记录</summary><ul id="ai-vip-cookie-results" className="ai-vip-list" aria-label="逐项操作结果"></ul></details>
        <Button size="lg" variant="primary" id="ai-vip-cookie-install" className="od-button ai-vip-primary" type="button" disabled>设置并打开网站</Button>
        <Button size="lg" id="ai-vip-cookie-open" className="od-button od-button--secondary" type="button" hidden>前往网站核验</Button>
        <Button size="lg" id="ai-vip-shared-receive" className="od-button od-button--secondary ai-vip-session-retry" type="button" hidden disabled>重新获取网站会话</Button>
      </details>
        </div>
      </div>
        </CardContent>
      </Card>

      <section id="ai-vip-shop-section" className="ai-vip-shop" aria-label="更多商品">
        <Button size="lg" id="ai-vip-shop-open" className="od-button od-button--secondary ai-vip-shop-link" type="button">查看更多商品 ↗</Button>
        <p id="ai-vip-shop-status" className="ai-vip-fine-print" role="status" aria-live="polite" hidden></p>
      </section>
    
      <Card id="ai-vip-proxy-section" className="ai-vip-proxy" data-mode="passive" aria-labelledby="ai-vip-proxy-title">
        <CardContent className="ai-vip-section-content">
        <div className="ai-vip-section-head">
          <h2 id="ai-vip-proxy-title">可选网络加速</h2>
          <div className="ai-vip-proxy-head-actions">
            <span id="ai-vip-proxy-state" className="ai-vip-pill" role="status" aria-live="polite" hidden></span>
            <IconButton label="重新检测代理状态" id="ai-vip-proxy-refresh" className="od-icon-button--quiet ai-vip-proxy-refresh" type="button" title="重新检测代理状态" aria-label="重新检测代理状态">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.5-4.5L3 9"/><path d="M3 4v5h5"/><path d="M4 13a8 8 0 0 0 14.5 4.5L21 15"/><path d="M21 20v-5h-5"/></svg>
            </IconButton>
          </div>
        </div>
        <p id="ai-vip-proxy-detail" className="ai-vip-proxy-source" role="status" aria-live="polite">正在读取浏览器代理状态。</p>
        <Button size="lg" variant="primary" id="ai-vip-proxy-toggle" className="od-button ai-vip-primary ai-vip-proxy-toggle" type="button" hidden disabled>启用代理</Button>
        <div id="ai-vip-proxy-alert" className="ai-vip-proxy-alert od-alert od-alert--warning" hidden><p id="ai-vip-proxy-alert-text"></p></div>
        </CardContent>
      </Card>

    
      <Card id="ai-vip-desktop-promo" className="ai-vip-desktop-promo" aria-labelledby="ai-vip-desktop-title">
        <CardContent className="ai-vip-section-content">
        <div className="ai-vip-desktop-main">
          <span className="ai-vip-desktop-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>
            </svg>
          </span>
          <div className="ai-vip-desktop-copy">
            <p className="ai-vip-desktop-label"><strong>电脑端推荐</strong><span>推广</span></p>
            <h2 id="ai-vip-desktop-title">推荐 AI 代理电脑客户端</h2>
            <p>需要电脑端独立网络方案？可前往官网了解相关产品。</p>
          </div>
        </div>
        <Button size="lg" id="ai-vip-desktop-open" className="od-button od-button--secondary ai-vip-desktop-cta" type="button">了解桌面客户端 ↗</Button>
        <p id="ai-vip-desktop-status" className="ai-vip-fine-print" role="status" aria-live="polite" hidden></p>
        </CardContent>
      </Card>
      <details className="ai-vip-service od-disclosure od-disclosure--flat">
        <summary>适用网站与网络说明</summary>
        <div className="ai-vip-service-detail">
          <p>应用版本：{toolConfig.version}</p>
          <p>本工具仅管理自身的 Chrome 代理请求，不会关闭系统 VPN 或其他扩展。使用现有网络不代表网站连通性已验证。</p>
          <p>适用站点示例：ChatGPT · Claude · Gemini · Perplexity。实际网站及会员交付范围以正式服务为准；网络连通不代表第三方会员已开通。</p>
          <p>非匹配网站按直连规则处理；系统 VPN / TUN 仍可能影响实际路由。</p>
        </div>
      </details>
    </main>
  );
}
