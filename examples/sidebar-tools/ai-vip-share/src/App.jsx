import * as React from 'react';
import {Button,IconButton,Card,CardContent} from '@opendesk/ui';

// This is the installable app's only UI tree. The v1.4.2 compatibility
// controller mounts after React commits, retaining the original SDK,
// journal, idempotency and STOP semantics until they can be state-extracted.
export default function VipApp(){
  React.useLayoutEffect(()=>{
    const dispose=globalThis.__OpenDeskVipStart?.();
    return ()=>dispose?.();
  },[]);
  return (
    <main className="ai-vip" aria-label="AI VIP Share 会员与权益中心">
      
      <header className="ai-vip-brand">
        <div className="ai-vip-logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 2 8 4v5c0 5.1-3.1 8.4-8 11-4.9-2.6-8-5.9-8-11V6l8-4Z"/>
            <path d="m12 6.8 1.35 3.7 3.75.1-3 2.4 1.05 3.55L12 14.5 8.85 16.55 9.9 13l-3-2.4 3.75-.1Z"/>
          </svg>
        </div>
        <div className="ai-vip-brand-copy">
          <h1>AI VIP Share</h1>
          <p>会员权益 · 兑换激活 · AI 网站访问</p>
        </div>
      </header>
    
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
          <div id="ai-vip-benefits-section" className="ai-vip-benefits" hidden>
            <div className="ai-vip-benefits-head"><h3 id="ai-vip-benefits-title">我的权益</h3></div>
            <ul id="ai-vip-benefits" className="ai-vip-list" aria-labelledby="ai-vip-benefits-title"></ul>
          </div>
        </CardContent>
        <details id="ai-vip-history-details" className="ai-vip-history" hidden>
          <summary><strong>兑换记录</strong><span><span id="ai-vip-history-count"></span> <span aria-hidden="true">▾</span></span></summary>
          <ol id="ai-vip-history-list" className="ai-vip-list"></ol>
        </details>
      </Card>
    
      <section className="ai-vip-redeem" aria-labelledby="ai-vip-redeem-title">
        <h2 id="ai-vip-redeem-title">兑换激活</h2>
        <p id="ai-vip-redeem-intro" className="ai-vip-note" hidden>预检激活内容后，再确认领取。</p>
        <form id="ai-vip-redeem-form" className="ai-vip-redeem-form" noValidate hidden>
          <label className="ai-vip-sr-only" htmlFor="ai-vip-redeem-code">激活码</label>
          <div className="ai-vip-redeem-inputs">
            <input id="ai-vip-redeem-code" className="od-field" type="password" data-sensitive
              maxLength="120" autoComplete="off" autoCapitalize="none" spellCheck="false"
              aria-describedby="ai-vip-redeem-status" placeholder="输入激活码" disabled />
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
        <p id="ai-vip-redeem-fine" className="ai-vip-fine-print" hidden>兑换以服务端回执为准，不会自动启用代理。</p>
      </section>
    
      <section id="ai-vip-shared-section" className="ai-vip-review" aria-labelledby="ai-vip-shared-title" hidden>
        <h2 id="ai-vip-shared-title">公司共享账号</h2>
        <p className="ai-vip-note">服务器分配的目标账号</p>
        <p id="ai-vip-shared-account" aria-live="polite"></p>
        <p id="ai-vip-shared-status" role="status" aria-live="polite"></p>
        <Button id="ai-vip-shared-receive" className="od-button od-button--secondary" type="button" disabled>重新取得分配会话</Button>
        <p className="ai-vip-fine-print">公司成员可在各自浏览器使用授权账号。同一浏览器的同一 Cookie 存储会切换当前账号，不提供多账号并发隔离。</p>
      </section>
    
      <section id="ai-vip-cookie-section" className="ai-vip-review" aria-labelledby="ai-vip-cookie-title" hidden>
        <h2 id="ai-vip-cookie-title">网站会话交付</h2>
        <p id="ai-vip-cookie-status" role="status" aria-live="polite">尚未收到 Cookie 交付。</p>
        <p className="ai-vip-fine-print">写入可能替换该网站当前会话。Cookie 写入回执不代表登录或第三方会员成功；请在目标页面核对。停止代理不会删除 Cookie。</p>
        <ul id="ai-vip-cookie-results" className="ai-vip-list" aria-label="逐项写入回执"></ul>
        <Button id="ai-vip-cookie-install" className="od-button od-button--secondary" type="button" disabled>确认写入网站 Cookie</Button>
        <Button id="ai-vip-cookie-open" className="od-button od-button--secondary" type="button" hidden>打开目标网站核对账号</Button>
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
    
      <details className="ai-vip-service ai-vip-advanced">
        <summary>服务与开发信息 <span aria-hidden="true">▾</span></summary>
        <div className="ai-vip-advanced-content">
        <section className="ai-vip-review" aria-labelledby="ai-vip-features-title">
          <h2 id="ai-vip-features-title">功能与接入状态</h2>
          <p id="ai-vip-service-mode" className="ai-vip-note" role="status" aria-live="polite">正式服务未配置。安装工具后即可查看接入状态，无需另外激活工具。</p>
          <details className="ai-vip-service ai-vip-feature-details">
            <summary>查看 6 类功能与入口 <span aria-hidden="true">▾</span></summary>
            <dl className="ai-vip-feature-list">
              <dt>会员账号与权益 · 下方会员卡</dt><dd id="ai-vip-feature-member">正式账号服务未配置，暂不能登录、绑定或查询权益。</dd>
              <dt>激活码激活与记录 · 下方兑换激活</dt><dd id="ai-vip-feature-redeem">正式兑换服务未配置，输入框暂不显示。</dd>
              <dt>专属激活链接与安装续接</dt><dd>尚未实现。缺少短效凭据验证、安装后续接与回跳；安装 JSON 不会自动领取权益。</dd>
              <dt>网站 Cookie 交付 · 有效兑换回执后出现</dt><dd id="ai-vip-feature-cookie">生产目标未配置；收到有效交付后才可核对目标并确认写入。</dd>
              <dt>更多商品</dt><dd id="ai-vip-feature-shop">商城地址未配置，商品按钮暂不显示。</dd>
              <dt>代理启停 · 下方 AI 网站访问</dt><dd id="ai-vip-feature-proxy">生产代理未配置；代理连接与会员权益分别核验。</dd>
            </dl>
          </details>
          <p id="ai-vip-demo-availability" className="ai-vip-note">正在检测本地演示入口。</p>
          
        </section>
      
        <section id="ai-vip-local-development" className="ai-vip-review" aria-labelledby="ai-vip-local-title" hidden>
          <strong id="ai-vip-local-title">本地开发</strong>
          <p id="ai-vip-local-status" role="status" aria-live="polite">尚未连接本地开发服务。</p>
          <Button id="ai-vip-local-connect" className="od-button od-button--secondary" type="button" disabled>连接本地开发</Button>
          <p className="ai-vip-fine-print">演示步骤：先连接 → 输入测试码 DEMO-VIP-01 → 预检激活 → 核对账号并确认激活 → 查看权益与兑换记录。Cookie 写入和代理启用仍各自确认。演示数据不代表付费会员。</p>
        </section>
        </div>
      </details>

      <details className="ai-vip-service">
        <summary>使用说明 <span aria-hidden="true">▾</span></summary>
        <div className="ai-vip-service-content">
          <p>仅在通过可信 Browser SDK 与 Chrome 原生权限确认后管理本工具的代理，不修改其他工具或系统 VPN 配置。连接可用不代表第三方会员已开通。</p>
          <p>站点示例：ChatGPT · Claude · Gemini · Perplexity；最终适用范围以审核后的服务与商品说明为准。系统代理、VPN / TUN 与本工具状态分别核验。</p>
          <p id="ai-vip-link-status">生产激活链接尚未配置。本地开发连接后可手动输入激活码，或在此工具打开时访问约定激活网址自动请求分配；网站权限与 Cookie 批次仍需可信确认。</p>
        </div>
      </details>
    </main>
  );
}
