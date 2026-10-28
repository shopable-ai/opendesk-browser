import * as React from 'react';
import {Button,IconButton,Card,CardContent} from '@opendesk/ui';

// This is the installable app's only UI tree. The v1.4.2 compatibility
// controller mounts after React commits. Preview and developer controls
// are never children of the installable product UI.
export default function VipApp(){
  React.useLayoutEffect(()=>{
    const dispose=globalThis.__OpenDeskVipStart?.();
    return ()=>dispose?.();
  },[]);
  return (
    <main className="ai-vip" aria-label="AI VIP Share 会员与权益中心">
      <header className="ai-vip-brand" aria-label="AI VIP Share">
        <span className="ai-vip-logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 2 8 4v5c0 5.1-3.1 8.4-8 11-4.9-2.6-8-5.9-8-11V6l8-4Z"/>
            <path d="m12 6.8 1.35 3.7 3.75.1-3 2.4 1.05 3.55L12 14.5 8.85 16.55 9.9 13l-3-2.4 3.75-.1Z"/>
          </svg>
        </span>
        <div className="ai-vip-brand-copy">
          <strong>AI VIP Share</strong>
          <span>会员权益 · 兑换激活 · AI 网站访问</span>
        </div>
      </header>
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
            <IconButton label="刷新会员信息" id="ai-vip-refresh" className="ai-vip-refresh" type="button" title="刷新会员信息" aria-label="刷新会员信息" hidden disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.5-4.5L3 9"/><path d="M3 4v5h5"/><path d="M4 13a8 8 0 0 0 14.5 4.5L21 15"/><path d="M21 20v-5h-5"/></svg></IconButton>
          </div>
          <p id="ai-vip-member-empty" className="ai-vip-member-empty" hidden>
            <span id="ai-vip-member-empty-text"></span>{' '}
            <button type="button" id="ai-vip-focus-redeem" className="ai-vip-inline-action" hidden>前往兑换</button>
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
        <details id="ai-vip-history-details" className="ai-vip-history" hidden>
          <summary><strong>兑换记录</strong><span><span id="ai-vip-history-count"></span> <span aria-hidden="true">▾</span></span></summary>
          <ol id="ai-vip-history-list" className="ai-vip-list"></ol>
        </details>
      </Card>
    
      <section className="ai-vip-redeem" aria-labelledby="ai-vip-redeem-title">
        <h2 id="ai-vip-redeem-title">兑换激活</h2>
        <p className="ai-vip-redeem-subtitle">输入兑换码或使用专属激活链接，领取对应权益。</p>
        <p id="ai-vip-redeem-intro" className="ai-vip-note" hidden>先核对权益，再确认兑换。</p>
        <div id="ai-vip-activation-hint" className="ai-vip-link-hint" hidden>
          <strong>已识别专属激活链接 · 待确认</strong><p id="ai-vip-activation-detail"></p>
        </div>
        <form id="ai-vip-redeem-form" className="ai-vip-redeem-form" noValidate hidden>
          <label className="ai-vip-sr-only" htmlFor="ai-vip-redeem-code">激活码</label>
          <div className="ai-vip-redeem-inputs">
            <div className="ai-vip-code-field">
              <input id="ai-vip-redeem-code" className="od-field" type="text" data-sensitive
                maxLength="120" autoComplete="off" autoCapitalize="none" spellCheck="false"
                aria-describedby="ai-vip-redeem-status" placeholder="输入兑换码或激活码" inputMode="text" disabled />
              <IconButton label="清空激活码" id="ai-vip-code-clear" className="od-icon-button ai-vip-code-clear" type="button" title="清空激活码" aria-label="清空激活码" disabled>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5 19 19M19 5 5 19"/></svg>
              </IconButton>
            </div>
            <Button variant="primary" id="ai-vip-redeem" className="od-button ai-vip-primary" type="submit" disabled>预检激活</Button>
          </div>
        </form>
        <div id="ai-vip-redeem-preview" className="ai-vip-review" hidden>
          <div className="ai-vip-benefits-head"><strong>兑换预检</strong><span>尚未领取</span></div>
          <strong id="ai-vip-preview-title"></strong>
          <p id="ai-vip-preview-description"></p>
          <p id="ai-vip-preview-account"></p>
          <div className="ai-vip-review-actions">
            <Button variant="primary" id="ai-vip-redeem-confirm" className="od-button ai-vip-primary" type="button" disabled>确认激活</Button>
            <Button id="ai-vip-redeem-cancel" className="od-button od-button--secondary" type="button" hidden>取消</Button>
          </div>
        </div>
        <div id="ai-vip-recovery" className="ai-vip-review ai-vip-review--warning" hidden>
          <strong>兑换回执尚未确认</strong>
          <p id="ai-vip-recovery-status" role="status" aria-live="polite"></p>
          <Button id="ai-vip-recovery-check" className="od-button od-button--secondary" type="button" disabled>核对上次兑换</Button>
        </div>
        <p id="ai-vip-redeem-status" className="ai-vip-note" role="status" aria-live="polite">会员服务接入后可使用激活码。</p>
        <p id="ai-vip-redeem-error" className="ai-vip-error" role="alert" hidden></p>
        <p id="ai-vip-redeem-fine" className="ai-vip-fine-print" hidden>确认兑换后才会领取权益。</p>
      </section>

      <section id="ai-vip-shop-section" className="ai-vip-shop" aria-label="更多商品">
        <Button id="ai-vip-shop-open" className="od-button od-button--secondary ai-vip-shop-link" type="button">查看更多商品 ↗</Button>
        <p id="ai-vip-shop-status" className="ai-vip-fine-print" role="status" aria-live="polite" hidden></p>
      </section>
    
      <section id="ai-vip-proxy-section" className="ai-vip-proxy" data-mode="passive" aria-labelledby="ai-vip-proxy-title">
        <div className="ai-vip-section-head">
          <h2 id="ai-vip-proxy-title">AI 网站访问</h2>
          <div className="ai-vip-proxy-head-actions">
            <span id="ai-vip-proxy-state" className="ai-vip-pill" role="status" aria-live="polite" hidden></span>
            <IconButton label="重新检测代理状态" id="ai-vip-proxy-refresh" className="od-icon-button ai-vip-proxy-refresh" type="button" title="重新检测代理状态" aria-label="重新检测代理状态">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.5-4.5L3 9"/><path d="M3 4v5h5"/><path d="M4 13a8 8 0 0 0 14.5 4.5L21 15"/><path d="M21 20v-5h-5"/></svg>
            </IconButton>
          </div>
        </div>
        <p id="ai-vip-proxy-detail" className="ai-vip-proxy-source" role="status" aria-live="polite">正在读取浏览器代理状态。</p>
        <Button variant="primary" id="ai-vip-proxy-toggle" className="od-button ai-vip-primary ai-vip-proxy-toggle" type="button" hidden disabled>启用代理</Button>
        <div id="ai-vip-proxy-alert" className="ai-vip-proxy-alert" hidden><p id="ai-vip-proxy-alert-text"></p></div>
      </section>
      <section id="ai-vip-cookie-section" className="ai-vip-review" aria-labelledby="ai-vip-cookie-title" hidden>
        <h2 id="ai-vip-cookie-title">网站会话</h2>
        <p id="ai-vip-cookie-status" role="status" aria-live="polite">尚未取得网站会话。</p>
        <p className="ai-vip-fine-print">应用会话可能替换本站的现有登录，完成后请在网站核验。</p>
        <ul id="ai-vip-cookie-results" className="ai-vip-list" aria-label="逐项写入结果"></ul>
        <Button id="ai-vip-cookie-install" className="od-button od-button--secondary" type="button" disabled>确认应用网站会话</Button>
        <Button id="ai-vip-cookie-open" className="od-button od-button--secondary" type="button" hidden>前往网站核验</Button>
        <Button id="ai-vip-shared-receive" className="od-button od-button--secondary ai-vip-session-retry" type="button" hidden disabled>重新获取网站会话</Button>
      </section>
    
      <section id="ai-vip-desktop-promo" className="ai-vip-desktop-promo" aria-labelledby="ai-vip-desktop-title">
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
        <Button id="ai-vip-desktop-open" className="od-button od-button--secondary ai-vip-desktop-cta" type="button">了解桌面客户端 ↗</Button>
        <p id="ai-vip-desktop-status" className="ai-vip-fine-print" role="status" aria-live="polite" hidden></p>
      </section>
      <details className="ai-vip-service">
        <summary><span className="ai-vip-service-dot" aria-hidden="true"></span>适用网站与网络说明 <span aria-hidden="true">▾</span></summary>
        <div className="ai-vip-service-detail">
          <p>本工具仅管理自身的 Chrome 代理请求，不会关闭系统 VPN 或其他扩展。使用现有网络不代表网站连通性已验证。</p>
          <p>适用站点示例：ChatGPT · Claude · Gemini · Perplexity。实际网站及会员交付范围以正式服务为准；网络连通不代表第三方会员已开通。</p>
          <p>非匹配网站按直连规则处理；系统 VPN / TUN 仍可能影响实际路由。</p>
        </div>
      </details>
    </main>
  );
}
