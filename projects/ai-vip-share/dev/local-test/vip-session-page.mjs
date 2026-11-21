// Presentation only: callers must verify their own private session/authorization ledger.
// Never pass a request, credential, Cookie delivery or unmasked account into this module.
import {createHash} from 'node:crypto';

const style = `
:root{color-scheme:light;font-family:system-ui,sans-serif;color:#172033;background:#f5f7fa}
body{margin:0;padding:24px}main{max-width:680px;margin:24px auto;display:grid;gap:16px}
header,section,footer{background:white;border:1px solid #dce2eb;border-radius:12px;padding:24px}
h1{font-size:24px;margin:8px 0}h2{font-size:20px;margin:0 0 12px}p{line-height:1.6}
.label,footer{font-size:14px;color:#4b5568}.status{font-weight:600}.valid{border-color:#25835a}
dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:12px 24px;margin:0}
dt{color:#4b5568}dd{margin:0;overflow-wrap:anywhere}time{overflow-wrap:anywhere}
`;
export const VIP_PAGE_CSP = `default-src 'none'; style-src 'sha256-${createHash('sha256').update(style).digest('base64')}'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`;
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const labels = Object.freeze({
  missing: ['未登录', '本次请求缺少本站的会话 Cookie。请在 AI VIP Share 侧栏登录。'],
  invalid: ['Cookie 不完整或无效', '本站无法确认当前登录。请在 AI VIP Share 侧栏重新登录。'],
  expired: ['会话已到期', '请先在侧栏核对本站授权或账号分配。授权有效时可重新获取会话。'],
  revoked: ['授权已撤销或失效', '请先在侧栏核对本站授权或账号分配，恢复授权后再登录。']
});
function timestamp(value) {
  const iso = new Date(value).toISOString();
  const local = new Intl.DateTimeFormat('zh-CN', {timeZone: 'Asia/Shanghai',
    dateStyle: 'medium', timeStyle: 'medium', hour12: false}).format(value);
  return `<time datetime="${iso}">${escape(local)}（北京时间）</time>`;
}

export function sendVipSessionPage(res, {reason, serverNow, siteLabel, account = null}) {
  const valid = reason === 'valid' && account && account.expiresAt > serverNow;
  const state = valid ? 'valid' : Object.hasOwn(labels, reason) ? reason : 'expired';
  const [title, detail] = valid ? ['受控会话有效', '本站已通过服务端校验完整 Cookie 对、会话有效期和当前访问授权。'] : labels[state];
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} · 模拟 VIP 工作台</title><style>${style}</style></head>
<body><main><header><span class="label">本地模拟网站 · 非商业服务</span><h1>${escape(siteLabel)}</h1>
<p>验证 Cookie 交付是否真正作用于目标网站。这里的账号与 VIP 均为模拟数据。</p></header>
<section${valid ? ' class="valid"' : ''} aria-labelledby="session-title" data-session-state="${valid ? 'valid' : 'not-logged-in'}" data-session-reason="${state}">
<h2 id="session-title">${escape(title)}</h2><p>${escape(detail)}</p>
${valid ? `<dl><dt>脱敏账号</dt><dd data-identity="${escape(account.kind)}">${escape(account.displayNameMasked)}</dd>
${account.sharedAccountId ? `<dt>当前分配</dt><dd data-shared-account="${escape(account.sharedAccountId)}">${escape(account.label)}</dd>` : ''}
<dt>模拟 VIP</dt><dd class="status" data-vip-state="active">有效</dd><dt>模拟等级</dt><dd>${escape(account.level)}</dd>
<dt>生效时间</dt><dd>${timestamp(account.issuedAt)}</dd><dt>到期时间</dt><dd>${timestamp(account.expiresAt)}</dd></dl>` :
  '<p class="status" data-vip-state="inactive">模拟 VIP：未验证 / 不可用</p><p>未建立受控会话。在 OpenDesk「扩展 → AI VIP Share」核对授权。分配有效时，选择「登录并打开网站」，按侧栏提示确认 Cookie 操作。</p>'}
</section>
<footer><p>服务端核验时间：${timestamp(serverNow)}</p></footer></main></body></html>`;
  res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': VIP_PAGE_CSP});
  res.end(html);
}
