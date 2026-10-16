// AdBlock R2 · editable React 19 + HTM components. Plain classic JS: file://, no bundler.
// The bundled React + ReactDOM client is the repository's pinned Page runtime.
(() => {
  'use strict';
  const React = globalThis.OpenDeskPageReact;
  const htm = globalThis.OpenDeskPreviewHTM;
  if (!React || React.version !== '19.2.0' || typeof React.createRoot !== 'function' || typeof htm !== 'function') {
    throw new Error('AdBlock React Preview: offline React 19.2.0 / HTM assets missing');
  }
  const html = htm.bind(React.createElement);
  const STORAGE_KEY = 'opendesk.adblock.preview.r2';
  const LEGACY_KEY = 'opendesk.adblock.preview.r1';
  const DOMAINS = Object.freeze(['news.example.com', 'video.example.com', 'shop.example.com', 'chrome://settings']);
  const COUNTS = Object.freeze({'news.example.com': 18, 'video.example.com': 42, 'shop.example.com': 26});
  const PREVIEW_SCENARIOS = Object.freeze({
    loading: ['正在读取保护状态', '演示响应尚未返回，暂时不能修改开关。'],
    error: ['无法读取保护状态', '模拟后台连接失败。当前开关不能代表实时生效状态。'],
    'permission-denied': ['当前没有访问权限', '模拟授权不足。此预览不会请求真实浏览器权限。'],
    untrusted: ['不可信内容已安全显示', '<img src=x onerror=alert(1)> 只作为普通文本，不会执行。']
  });
  const defaultState = () => ({global: true, allowed: [], domain: DOMAINS[0], night: false});

  function normalizeState(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaultState();
    const unique = new Set(Array.isArray(raw.allowed) ? raw.allowed : []);
    return {
      global: raw.global !== false,
      allowed: DOMAINS.filter(domain => !domain.startsWith('chrome://') && unique.has(domain)),
      domain: DOMAINS.includes(raw.domain) ? raw.domain : DOMAINS[0],
      night: raw.night === true
    };
  }

  const MockAdBlockService = Object.freeze({
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
        return raw ? normalizeState(JSON.parse(raw)) : defaultState();
      } catch { return defaultState(); } // file:// storage may be unavailable
    },
    save(state) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state))); }
      catch { /* Keep an in-memory working preview when storage is blocked. */ }
    },
    site(state) {
      const supported = !state.domain.startsWith('chrome://');
      return {
        supported,
        active: supported && state.global && !state.allowed.includes(state.domain),
        count: COUNTS[state.domain] || 0
      };
    }
  });

  function Icon({kind}) {
    if (kind === 'shield') return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 2 8 3v6c0 5-3.4 8.6-8 11-4.6-2.4-8-6-8-11V5l8-3Z"/><path d="m8.7 12.1 2.2 2.2 4.6-4.9"/></svg>`;
    if (kind === 'settings') return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15.2a1.7 1.7 0 0 0 .3 1.9l-1.6 1.6a1.7 1.7 0 0 0-1.9-.3l-.8.4a1.7 1.7 0 0 0-1 1.5V21h-2.3v-.7a1.7 1.7 0 0 0-1-1.5l-.8-.4a1.7 1.7 0 0 0-1.9.3l-1.6-1.6a1.7 1.7 0 0 0 .3-1.9l-.4-.8a1.7 1.7 0 0 0-1.5-1H4v-2.3h.7a1.7 1.7 0 0 0 1.5-1l.4-.8a1.7 1.7 0 0 0-.3-1.9L7.9 5a1.7 1.7 0 0 0 1.9.3l.8-.4a1.7 1.7 0 0 0 1-1.5V3h2.3v.7a1.7 1.7 0 0 0 1 1.5l.8.4a1.7 1.7 0 0 0 1.9-.3l1.6 1.6a1.7 1.7 0 0 0-.3 1.9l.4.8a1.7 1.7 0 0 0 1.5 1h.7v2.3h-.7a1.7 1.7 0 0 0-1.5 1l-.4.8Z" transform="translate(-.3 -.3) scale(.98)"/></svg>`;
    if (kind === 'list') return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M8 9.5h8M8 14h5"/></svg>`;
    if (kind === 'next') return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>`;
    if (kind === 'back') return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>`;
    return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M6 13.5 10 17l8-9"/><circle cx="12" cy="12" r="10"/></svg>`;
  }

  function Toggle({id, label, checked, disabled, onToggle}) {
    return html`<button id=${id} className="toggle" type="button" role="switch"
      aria-label=${label} aria-checked=${String(checked)} disabled=${disabled || false}
      onClick=${onToggle}><span className="knob"></span></button>`;
  }

  function ToolHeader({onSettings, isSettings}) {
    return html`<header className="frame-top" aria-label="广告拦截工具标题栏">
      <div className="logo" aria-hidden="true"><${Icon} kind="shield"/></div>
      <div className="tooltitle"><h1>广告拦截</h1></div>
      <button className="iconbtn od-icon-button" type="button" id="open-settings" aria-pressed=${String(isSettings)}
        aria-label=${isSettings ? "关闭设置" : "打开设置"} title=${isSettings ? "返回概览" : "设置"} onClick=${onSettings}><${Icon} kind="settings"/></button>
    </header>`;
  }

  function GlobalProtection({enabled, onToggle, unavailable}) {
    return html`<section className="card od-surface global-card" aria-label="全局保护">
      <div className="card-row"><div><h2 className="text-main">全局保护</h2>
        <p className="text-sub">为所有支持的网站启用</p></div>
        <${Toggle} id="global-switch" label="全局广告拦截" checked=${enabled} disabled=${unavailable} onToggle=${onToggle}/>
      </div>
      <p id="global-status" className=${'status-line' + (unavailable ? ' unavailable' : enabled ? '' : ' off')}>
        <span className="status-dot" aria-hidden="true"></span>
        <span id="global-status-text">${unavailable ? '保护状态暂不可用' : enabled ? '全局保护已开启' : '全局保护已暂停'}</span>
      </p>
    </section>`;
  }

  function CurrentSite({state, site, onToggle, unavailable}) {
    const description = unavailable ? '演示状态尚未确认' : !site.supported ? '此页面无法使用' :
      !state.global ? '请先开启全局保护' : site.active ? '仅影响当前域名' : '当前网站在例外列表中';
    const help = unavailable ? '请先在右侧恢复模拟状态，再调整本站过滤。' : !site.supported ? 'Chrome 内部页面不允许扩展进行广告过滤。' :
      !state.global ? '开启全局保护后，可单独管理每个网站。' :
      site.active ? '网页显示异常时，关闭本网站拦截即可排除。' : '本站过滤已关闭，可随时重新开启。';
    return html`<section className="card od-surface site-card" aria-label="当前网站">
      <div className="eyebrow">当前网站</div>
      <div className="site-ident">
        <div className="site-avatar" id="site-avatar" aria-hidden="true">${site.supported ? state.domain[0].toUpperCase() : '—'}</div>
        <div><div className="site-host" id="site-host">${state.domain}</div>
          <div className="site-sub" id="site-meta">${site.supported ? '此网页支持过滤' : '浏览器受限页面'}</div></div>
      </div>
      <div className="card-row"><div><h2 className="text-main">在此网站拦截</h2>
        <p className="text-sub" id="site-description">${description}</p></div>
        <${Toggle} id="site-switch" label="当前网站广告拦截" checked=${site.active}
          disabled=${unavailable || !state.global || !site.supported} onToggle=${onToggle}/>
      </div>
      <div className="site-divider"></div>
      <div className="site-summary"><div>
        <span className="count" id="blocked-count">${!unavailable && site.active ? String(site.count) : '—'}</span>
        <span className="count-description" id="count-label">${unavailable ? '演示数据暂不可用' : site.active ? '本网站已拦截的请求' : '当前不进行过滤'}</span>
      </div><span className="sample">演示数据</span></div>
      <p className="help" id="site-help">${help}</p>
    </section>`;
  }

  function RulesSummary({enabled, unavailable}) {
    return html`<section className="card od-surface preset" aria-label="过滤规则">
      <div className="preset-top"><b>过滤规则</b><span>${unavailable ? "待确认" : enabled ? "默认推荐" : "已暂停"}</span></div>
      <p>${unavailable ? "暂时无法确认规则状态" : enabled ? "拦截常见广告及跟踪请求，无需手动配置" : "全局保护已暂停；原有推荐规则不会被删除"}</p>
    </section>`;
  }

  function Overview({state, site, scenario, onGlobal, onSite, onExceptions}) {
    return html`<section id="overview">
      <${GlobalProtection} enabled=${state.global} unavailable=${scenario !== "ready"} onToggle=${onGlobal}/>
      <${CurrentSite} state=${state} site=${site} unavailable=${scenario !== "ready"} onToggle=${onSite}/>
      <${RulesSummary} enabled=${state.global} unavailable=${scenario !== "ready"}/>
      <button className="linkrow" type="button" id="open-allowlist" onClick=${onExceptions}>
        <span className="left"><${Icon} kind="list"/><span>管理已停用的网站</span>
          <span id="allow-count" style=${{color:'var(--muted,#8392a8)',fontSize:11}}>${state.allowed.length}</span>
        </span><${Icon} kind="next"/>
      </button>
    </section>`;
  }

  function PageHeading({title, summary, onBack}) {
    return html`<div className="page-heading">
      <button className="iconbtn back" type="button" aria-label="返回概览" title="返回"
        onClick=${onBack}><${Icon} kind="back"/></button>
      <h2 tabIndex="-1">${title}</h2>${summary ? html`<small id="allow-summary">${summary}</small>` : null}
    </div>`;
  }

  function ExceptionsView({allowed, onBack, onRestore, unavailable}) {
    return html`<section id="allowlist">
      <${PageHeading} title="已停用的网站" summary=${allowed.length + ' 个网站'} onBack=${onBack}/>
      <p className="list-intro">这些网站将不使用广告过滤。你可以在这里恢复，也可以返回网站直接打开开关。</p>
      <div className="card od-surface list-card" id="allow-rows" aria-live="polite">
        ${allowed.length ? allowed.map(domain => html`<div className="allow-row" key=${domain}>
          <div><strong>${domain}</strong><p>已停用广告拦截</p></div>
          <button type="button" className="secondary od-button od-button--secondary" data-restore=${domain} disabled=${unavailable}
            aria-label=${'恢复 ' + domain + ' 的广告拦截'}
            onClick=${() => onRestore(domain)}>恢复拦截</button>
        </div>`) : html`<div className="empty-state">
          <${Icon} kind="empty"/><strong>暂无例外网站</strong>
          <p>所有支持的网站默认启用拦截</p>
        </div>`}
      </div>
    </section>`;
  }

  function SettingsView({onBack, onExceptions}) {
    return html`<section id="settings">
      <${PageHeading} title="设置" onBack=${onBack}/>
      <div className="card od-surface list-card">
        <div className="setting-row"><h3>默认过滤</h3>
          <p>安装后默认使用内置推荐规则，适用于大多数网站。</p>
          <span className="mini">推荐模式（V1 固定）</span>
        </div>
        <div className="setting-row"><h3>网站例外</h3>
          <p>关闭单个网站的拦截时，自动添加到例外列表。</p>
          <button className="secondary od-button od-button--secondary" type="button" id="settings-allowlist"
            onClick=${onExceptions}>查看例外列表</button>
        </div>
        <div className="setting-row"><h3>网页异常处理</h3>
          <p>遇到功能异常时，请优先临时关闭当前网站的拦截，再重新载入网页。</p>
        </div>
      </div>
      <p className="setting-muted" style=${{marginTop:14}}>高级过滤、手动元素屏蔽与订阅源管理留到后续版本。原型不会修改真实 Chrome 权限或网络规则。</p>
    </section>`;
  }

  function PreviewControls({state, scenario, onDomain, onScenario, onTheme, onReset}) {
    return html`<aside className="notes" aria-label="原型操作说明">
      <div className="demo-flag"><i aria-hidden="true"></i>可交互产品原型 · React R2</div>
      <div className="kicker">OPENDESK · EXTENSION DESIGN</div>
      <h2>广告拦截，<br/>保持简单。</h2>
      <p>一眼看清是否生效；一键对整个浏览器或当前网站启停。复杂过滤规则不占用日常界面。</p>
      <div className="controls"><h3>体验不同场景</h3>
        <label htmlFor="domain-select">模拟当前网页</label>
        <select id="domain-select" value=${state.domain}
          onChange=${e => onDomain(e.target.value)}>
          <option value="news.example.com">news.example.com · 新闻网站</option>
          <option value="video.example.com">video.example.com · 视频网站</option>
          <option value="shop.example.com">shop.example.com · 购物网站</option>
          <option value="chrome://settings">chrome://settings · 浏览器受限页面</option>
        </select>
        <label htmlFor="scenario-select" className="scenario-label">模拟后台响应</label>
        <select id="scenario-select" className="od-field" value=${scenario} onChange=${e => onScenario(e.target.value)}>
          <option value="ready">正常</option><option value="loading">读取中</option>
          <option value="error">读取失败</option><option value="permission-denied">权限不足</option>
          <option value="untrusted">不可信文本</option>
        </select>
        <div className="buttons">
          <button type="button" id="theme-button" onClick=${onTheme}>${state.night ? '切换浅色模式' : '切换深色模式'}</button>
          <button type="button" id="reset-button" onClick=${onReset}>重置原型</button>
        </div>
      </div>
      <div className="explain"><h3>本次设计覆盖</h3>
        <ul><li>全局启停：一键影响所有网站</li>
          <li>本站启停：关闭后加入例外列表</li>
          <li>例外管理：查看并恢复网站</li>
          <li>限制页面：提示不可用，不伪装成功</li>
          <li>推荐规则：默认开启，暂不堆高级配置</li>
        </ul>
      </div>
      <p className="fine-print"><a className="source-link" href="../adblock-r1-interactive-preview.html" target="_blank" rel="noopener noreferrer">查看正式源码同源预览 ↗</a></p>
      <p className="fine-print">数据和开关只保存在此页面的本地演示状态。正式版本必须通过已审计的后台、Chrome DNR 和权限确认完成规则写入回读，才能提示“已生效”。</p>
    </aside>`;
  }

  function PreviewNotice({scenario, onRetry}) {
    if (scenario === 'ready') return null;
    const entry = PREVIEW_SCENARIOS[scenario];
    if (!entry) return null;
    const isError = scenario !== 'loading';
    return html`<section id="scenario-notice" className=${'preview-notice' + (isError ? ' warning' : '')}
      role=${isError ? 'alert' : 'status'} aria-live=${isError ? 'assertive' : 'polite'}>
      <div className="notice-copy"><strong>${entry[0]}</strong><p>${entry[1]}</p></div>
      ${scenario === 'loading' ? null : html`<button type="button" id="scenario-retry"
        className="secondary od-button od-button--secondary" onClick=${onRetry}>重试</button>`}
    </section>`;
  }

  function AdBlockApp() {
    const [state, setState] = React.useState(MockAdBlockService.load);
    const [view, setView] = React.useState('overview');
    const [returnTo, setReturnTo] = React.useState('overview');
    const [scenario, setScenario] = React.useState('ready');
    const [message, setMessage] = React.useState('');
    const focusAfterView = React.useRef('');
    const focusAfterRestore = React.useRef(false);
    const site = MockAdBlockService.site(state);

    React.useEffect(() => { MockAdBlockService.save(state); }, [state]);
    React.useEffect(() => {
      const target = focusAfterView.current;
      if (!target) return;
      focusAfterView.current = "";
      if (target === "heading") document.querySelector("#" + view + " .page-heading h2")?.focus();
      else document.getElementById(target)?.focus();
    }, [view]);
    React.useEffect(() => {
      if (!focusAfterRestore.current) return;
      focusAfterRestore.current = false;
      (document.querySelector("#allow-rows [data-restore]") || document.querySelector("#allowlist .back"))?.focus();
    }, [state.allowed]);
    React.useEffect(() => {
      if (!message) return;
      const timer = setTimeout(() => setMessage(''), 2300);
      return () => clearTimeout(timer);
    }, [message]);

    function toggleGlobal() {
      if (scenario !== "ready") return;
      const next = !state.global;
      setState(previous => ({...previous, global:next}));
      setMessage(next ? '已在原型中开启全局保护' : '已在原型中暂停全局保护');
    }
    function toggleSite() {
      if (scenario !== "ready" || !state.global || !site.supported) return;
      const wasAllowed = state.allowed.includes(state.domain);
      setState(previous => ({
        ...previous,
        allowed: wasAllowed ? previous.allowed.filter(domain => domain !== previous.domain)
          : [...previous.allowed, previous.domain]
      }));
      setMessage(wasAllowed ? '已在原型中恢复本站拦截' : '已在原型中停用本站拦截');
    }
    function restore(domain) {
      if (scenario !== "ready") return;
      focusAfterRestore.current = true;
      setState(previous => ({...previous, allowed:previous.allowed.filter(x => x !== domain)}));
      setMessage('已在原型中恢复 ' + domain);
    }
    function openSettings() {
      focusAfterView.current = "heading";
      setView("settings");
    }
    function openAllowlist() {
      setReturnTo(view === "settings" ? "settings" : "overview");
      focusAfterView.current = "heading";
      setView("allowlist");
    }
    function goBack() {
      const target = view === "allowlist" ? returnTo : "overview";
      focusAfterView.current = view === "allowlist"
        ? (target === "settings" ? "settings-allowlist" : "open-allowlist") : "open-settings";
      setView(target);
    }
    function changeDomain(domain) {
      setState(previous => ({...previous, domain:DOMAINS.includes(domain) ? domain : DOMAINS[0]}));
      setView('overview');
    }
    function reset() {
      setScenario("ready");
      setState(defaultState());
      setView('overview');
      setMessage('已重置原型演示状态');
    }
    return html`<div className=${'stage' + (state.night ? ' night' : '')}>
      <div className="layout">
        <div className="frame" aria-label="AdBlock Side Panel 交互演示">
          <${ToolHeader} isSettings=${view === "settings"} onSettings=${() => view === "settings" ? goBack() : openSettings()}/>
          <main className="panel">
            <${PreviewNotice} scenario=${scenario} onRetry=${() => {setScenario("ready"); setMessage("模拟连接已恢复");}}/>
            ${view === 'overview' ? html`<${Overview} state=${state} site=${site} scenario=${scenario}
              onGlobal=${toggleGlobal} onSite=${toggleSite} onExceptions=${openAllowlist}/>` :
              view === 'allowlist' ? html`<${ExceptionsView} allowed=${state.allowed} unavailable=${scenario !== "ready"}
                onBack=${goBack} onRestore=${restore}/>` :
                html`<${SettingsView} onBack=${goBack} onExceptions=${openAllowlist}/>`}
            <p className="footline">交互原型 · 不执行真实广告过滤或读取网页</p>
          </main>
        </div>
        <${PreviewControls} state=${state} scenario=${scenario} onDomain=${changeDomain} onScenario=${setScenario}
          onTheme=${() => setState(previous => ({...previous, night:!previous.night}))}
          onReset=${reset}/>
      </div>
      <div className=${'toast' + (message ? ' visible' : '')} role="status"
        aria-live="polite" id="toast">${message}</div>
    </div>`;
  }

  React.createRoot(document.getElementById('root')).render(html`<${AdBlockApp}/>`);
})();
