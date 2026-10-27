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
      
      <Card id="ai-vip-member-card" className="ai-vip-membership" data-view="unconfigured" aria-labelledby="ai-vip-member-title">
        <CardContent className="ai-vip-card-inner">
          <div className="ai-vip-section-head">
            <h2 id="ai-vip-member-title">AI 会员</h2>
            <span id="ai-vip-member-state" className="ai-vip-pill" role="status" aria-live="polite">待核验</span>
          </div>
          <div className="ai-vip-account-row">
            <div className="ai-vip-account-copy">
              <strong id="ai-vip-account-name">暂无法查询账号与会员权益</strong>
              <span id="ai-vip-product-name" hidden></span>
            </div>
            <IconButton label="刷新会员信息" id="ai-vip-refresh" className="od-icon-button" type="button" title="刷新会员信息" aria-label="刷新会员信息" hidden disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.5-4.5L3 9"/><path d="M3 4v5h5"/><path d="M4 13a8 8 0 0 0 14.5 4.5L21 15"/><path d="M21 20v-5h-5"/></svg></IconButton>
          </div>
          <div id="ai-vip-member-facts" className="ai-vip-member-facts" hidden>
            <p id="ai-vip-metric-label" className="ai-vip-metric-caption">权益状态</p>
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
        <p id="ai-vip-redeem-intro" className="ai-vip-note" hidden>先核对权益，再确认兑换。</p>
        <form id="ai-vip-redeem-form" className="ai-vip-redeem-form" noValidate hidden>
          <label className="ai-vip-sr-only" htmlFor="ai-vip-redeem-code">激活码</label>
          <div className="ai-vip-redeem-inputs">
            <input id="ai-vip-redeem-code" className="od-field" type="password" data-sensitive
              maxLength="120" autoComplete="off" autoCapitalize="none" spellCheck="false"
              aria-describedby="ai-vip-redeem-status" placeholder="输入激活码" inputMode="text" disabled />
            <IconButton label="显示激活码" id="ai-vip-code-reveal" className="od-icon-button" type="button" title="显示或隐藏激活码" aria-label="显示激活码" aria-pressed="false" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></IconButton>
            <IconButton label="清空激活码" id="ai-vip-code-clear" className="od-icon-button" type="button" title="清空激活码" aria-label="清空激活码" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5 19 19M19 5 5 19"/></svg></IconButton>
          </div>
          <Button variant="primary" id="ai-vip-redeem" className="od-button ai-vip-primary" type="submit" disabled>预检激活</Button>
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

      <section id="ai-vip-cookie-section" className="ai-vip-review" aria-labelledby="ai-vip-cookie-title" hidden>
        <h2 id="ai-vip-cookie-title">网站会话</h2>
        <p id="ai-vip-cookie-status" role="status" aria-live="polite">尚未取得网站会话。</p>
        <p className="ai-vip-fine-print">应用会话可能替换本站的现有登录，完成后请在网站核验。</p>
        <ul id="ai-vip-cookie-results" className="ai-vip-list" aria-label="逐项写入结果"></ul>
        <Button id="ai-vip-cookie-install" className="od-button od-button--secondary" type="button" disabled>确认应用网站会话</Button>
        <Button id="ai-vip-cookie-open" className="od-button od-button--secondary" type="button" hidden>前往网站核验</Button>
        <Button id="ai-vip-shared-receive" className="od-button od-button--secondary ai-vip-session-retry" type="button" hidden disabled>重新获取网站会话</Button>
      </section>
    
      <section id="ai-vip-shop-section" className="ai-vip-shop" aria-label="更多商品" hidden>
        <Button id="ai-vip-shop-open" className="od-button od-button--secondary ai-vip-shop-link" type="button" disabled>查看更多商品 ↗</Button>
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
    
    </main>
  );
}
