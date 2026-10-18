/* Compiled from src/App.jsx + src/main.jsx. React 19 and @opendesk/ui are host-owned externals. */
(function(React,UI){'use strict';
const {jsx:_jsx,jsxs:_jsxs,Fragment:_Fragment}=React;
const {Card,CardContent,Switch,Button}=UI;
const siteCopy = {
    navigating: '页面正在导航，加载完成后可管理本站。',
    incognito: '隐身页面不可管理网站例外。',
    unsupported: '仅支持普通 HTTP(S) 网站。',
    unavailable: '当前网站身份暂不可用，请切换标签页后重试。'
};
const errorText = error => String(error?.message || error || '操作失败').slice(0, 220);
const verified = value => value && value.rules?.verified === true && value.permissions?.dnr === true;
const valid = value => value && typeof value.enabled === 'boolean' &&
    Array.isArray(value.exceptions) && typeof value.permissions?.dnr === 'boolean' &&
    typeof value.rules?.verified === 'boolean';
function confirmed(result, checked, operation, payload) {
    if (!valid(result) || !valid(checked) || !verified(result) || !verified(checked) ||
        result.enabled !== checked.enabled ||
        JSON.stringify(result.exceptions) !== JSON.stringify(checked.exceptions))
        return false;
    if (operation === 'adblock.enable')
        return checked.enabled === true;
    if (operation === 'adblock.disable')
        return checked.enabled === false;
    if (operation === 'adblock.site.set')
        return checked.enabled === true &&
            checked.exceptions.includes(payload.host) === !payload.filtering;
    if (operation === 'adblock.site.restore')
        return !checked.exceptions.includes(payload.host);
    return false;
}
function Status({ state, loading }) {
    const known = verified(state) && state.toolEnabled !== false && !state.restartRequired;
    const active = Boolean(known && state.enabled);
    const label = loading ? '正在核对 Chrome…' : !state ? 'Chrome 状态未知' :
        state.toolEnabled === false ? '工具已停用' : state.restartRequired ? '需要重载扩展' :
            state.permissions?.dnr !== true ? '过滤权限不可用' : !verified(state) ? 'DNR 尚未确认' :
                active ? '保护已开启' : '保护已关闭';
    return _jsxs("span", { className: 'adblock-state ' + (active ? 'is-on' : known ? 'is-off' : 'is-unknown'), role: "status", children: [_jsx("span", { className: "adblock-dot", "aria-hidden": "true" }), label] });
}
function App() {
    const [state, setState] = React.useState(null);
    const [loading, setLoading] = React.useState(true);
    const [busy, setBusy] = React.useState(false);
    const [notice, setNotice] = React.useState('');
    const [problem, setProblem] = React.useState(false);
    const [view, setView] = React.useState('overview');
    const alive = React.useRef(true), reading = React.useRef(0), locked = React.useRef(false);
    const queued = React.useRef(false), current = React.useRef(null);
    const api = globalThis.OpenDeskTool;
    const refresh = React.useCallback(async (silent = false) => {
        if (locked.current) {
            queued.current = true;
            return;
        }
        const turn = ++reading.current;
        if (!silent)
            setLoading(true);
        try {
            if (typeof api?.request !== 'function')
                throw Error('AdBlock Host 未就绪');
            const next = await api.request('adblock.status', {});
            if (!valid(next))
                throw Error('Chrome DNR 状态数据不完整');
            if (!alive.current || turn !== reading.current || locked.current)
                return;
            current.current = next;
            setState(next);
            setProblem(false);
            setNotice('');
        }
        catch (error) {
            if (!alive.current || turn !== reading.current || locked.current)
                return;
            current.current = null;
            setState(null);
            setProblem(true);
            setNotice('无法核实 Chrome 状态：' + errorText(error));
        }
        finally {
            if (alive.current && turn === reading.current)
                setLoading(false);
        }
    }, [api]);
    const operate = React.useCallback(async (operation, payload = {}) => {
        if (locked.current || !current.current)
            return;
        locked.current = true;
        reading.current++;
        setBusy(true);
        setProblem(false);
        setNotice('请在可信宿主中确认此次操作…');
        try {
            const result = await api.request(operation, payload);
            const checked = await api.request('adblock.status', {});
            if (!confirmed(result, checked, operation, payload))
                throw Error('Chrome DNR 规则回读不一致');
            if (!alive.current)
                return;
            current.current = checked;
            setState(checked);
            setNotice(operation === 'adblock.site.set' || operation === 'adblock.site.restore'
                ? '设置已由 Chrome 确认；请刷新目标网页。'
                : checked.enabled ? 'Chrome 已确认开启过滤。' : 'Chrome 已确认关闭过滤。');
        }
        catch (error) {
            if (!alive.current)
                return;
            const cancelled = error?.code === 'E_CANCELLED' || /cancel|取消/i.test(errorText(error));
            if (cancelled)
                setNotice('已取消，未提交这次更改。');
            else {
                current.current = null;
                setState(null);
                setProblem(true);
                setNotice('结果未确认（' + String(error?.code || 'E_ADBLOCK') + '）：' + errorText(error) + '。请重新读取状态。');
            }
        }
        finally {
            locked.current = false;
            if (alive.current) {
                setBusy(false);
                setLoading(false);
                if (queued.current) {
                    queued.current = false;
                    void refresh(true);
                }
            }
        }
    }, [api, refresh]);
    React.useEffect(() => {
        alive.current = true;
        const onVisible = () => { if (!document.hidden)
            void refresh(true); };
        const onMessage = event => {
            if (event.source !== globalThis.parent)
                return;
            if (event.data?.kind === 'page-changed' && event.data?.protocol === 'opendesk.sidebar-tool.bridge.v1')
                void refresh(true);
            if (event.data?.protocol === 'opendesk.adblock.ui.v1' && event.data?.kind === 'settings')
                setView('settings');
        };
        document.addEventListener('visibilitychange', onVisible);
        globalThis.addEventListener('focus', onVisible);
        globalThis.addEventListener('message', onMessage);
        const interval = setInterval(() => { if (!document.hidden)
            void refresh(true); }, 12000);
        void refresh();
        return () => {
            alive.current = false;
            reading.current++;
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisible);
            globalThis.removeEventListener('focus', onVisible);
            globalThis.removeEventListener('message', onMessage);
        };
    }, [refresh]);
    const ready = Boolean(verified(state) && state.toolEnabled !== false && !state.restartRequired);
    const on = Boolean(ready && state.enabled);
    const host = state?.currentSite?.status === 'ready' ? state.currentHost : null;
    const exceptions = Array.isArray(state?.exceptions) ? state.exceptions : [];
    const siteOn = Boolean(on && host && !exceptions.includes(host));
    const switchLocked = loading || busy || !ready;
    const siteLocked = switchLocked || !on || !host;
    const canRestore = ready && !busy && !loading;
    const back = _jsx(Button, { variant: "secondary", className: "adblock-back", onClick: () => setView('overview'), "aria-label": "\u8FD4\u56DE\u5E7F\u544A\u62E6\u622A\u6982\u89C8", children: "\u2190 \u8FD4\u56DE" });
    return _jsxs("div", { className: "adblock-app", children: [view === 'overview' ? _jsxs(_Fragment, { children: [_jsx(Card, { children: _jsxs(CardContent, { className: "adblock-card", children: [_jsxs("div", { className: "adblock-control-row", children: [_jsxs("div", { className: "adblock-copy", children: [_jsx("strong", { children: "\u5168\u5C40\u4FDD\u62A4" }), _jsx(Status, { state: state, loading: loading })] }), _jsx(Switch, { isSelected: on, isDisabled: switchLocked, onChange: value => void operate(value ? 'adblock.enable' : 'adblock.disable'), "aria-label": "\u5168\u5C40\u5E7F\u544A\u62E6\u622A" })] }), state?.restartRequired ? _jsx("p", { className: "adblock-help", children: "\u8FC7\u6EE4\u5C1A\u672A\u5C31\u7EEA\u3002\u8BF7\u4FDD\u5B58\u5DE5\u4F5C\u5E76\u91CD\u65B0\u52A0\u8F7D OpenDesk Browser \u6269\u5C55\uFF0C\u7136\u540E\u624B\u52A8\u5F00\u542F\u3002" }) : null, state?.permissions?.dnr === false ? _jsx("p", { className: "adblock-help", children: "Chrome \u5FC5\u9009\u5E7F\u544A\u8FC7\u6EE4\u6743\u9650\u4E0D\u53EF\u7528\uFF0C\u65E0\u6CD5\u786E\u8BA4\u6E05\u7406\u5B8C\u6210\uFF1B\u8BF7\u68C0\u67E5\u6269\u5C55\u72B6\u6001\u540E\u91CD\u65B0\u8BFB\u53D6\u3002" }) : null] }) }), _jsx(Card, { children: _jsxs(CardContent, { className: "adblock-card", children: [_jsxs("div", { className: "adblock-control-row", children: [_jsxs("div", { className: "adblock-copy", children: [_jsx("strong", { children: "\u5F53\u524D\u7F51\u7AD9" }), _jsx("span", { className: "adblock-host", children: host || '当前网页不可管理' })] }), _jsx(Switch, { isSelected: siteOn, isDisabled: siteLocked, onChange: value => { if (host)
                                                void operate('adblock.site.set', { host, filtering: value }); }, "aria-label": "\u5F53\u524D\u7F51\u7AD9\u5E7F\u544A\u8FC7\u6EE4" })] }), _jsx("p", { className: "adblock-help", children: host ? (!on ? '开启全局保护后可管理本站。' :
                                        siteOn ? '正在过滤本站匹配的第三方广告请求。' : '本站已加入例外列表。') :
                                        siteCopy[state?.currentSite?.status] || '等待 Chrome 读取当前网站身份。' })] }) }), _jsx(Card, { children: _jsx(CardContent, { className: "adblock-card", children: _jsx("div", { className: "adblock-control-row", children: _jsxs("div", { className: "adblock-copy", children: [_jsx("strong", { children: "\u5185\u7F6E\u8FC7\u6EE4\u89C4\u5219" }), _jsxs("span", { className: "adblock-muted", children: [Number.isInteger(state?.domainCount) ? state.domainCount + ' 个离线域名' : '离线规则', " \u00B7 \u4E0D\u63D0\u4F9B\u672A\u7ECF\u6838\u5B9E\u7684\u62E6\u622A\u8BA1\u6570"] })] }) }) }) }), _jsxs(Button, { className: "adblock-link", variant: "secondary", onClick: () => setView('exceptions'), children: ["\u5DF2\u505C\u7528\u7684\u7F51\u7AD9 ", _jsx("span", { children: exceptions.length }), _jsx("span", { "aria-hidden": "true", children: "\u2192" })] })] }) : view === 'exceptions' ? _jsxs(_Fragment, { children: [_jsxs("div", { className: "adblock-page-head", children: [back, _jsx("strong", { children: "\u5DF2\u505C\u7528\u7684\u7F51\u7AD9" }), _jsx("span", { children: exceptions.length })] }), _jsx(Card, { children: _jsx(CardContent, { className: "adblock-exceptions", children: !state ? _jsx("p", { className: "adblock-help", children: "\u4F8B\u5916\u72B6\u6001\u672A\u786E\u8BA4\uFF0C\u6062\u590D\u64CD\u4F5C\u4E0D\u53EF\u7528\u3002" }) :
                                !exceptions.length ? _jsx("p", { className: "adblock-empty", children: "\u6682\u65E0\u7F51\u7AD9\u4F8B\u5916" }) :
                                    exceptions.map(host => _jsxs("div", { className: "adblock-exception", children: [_jsxs("div", { className: "adblock-copy", children: [_jsx("strong", { children: host }), _jsx("span", { className: "adblock-muted", children: "\u6B64\u7F51\u7AD9\u7684\u5E7F\u544A\u8FC7\u6EE4\u5DF2\u505C\u7528" })] }), _jsx(Button, { disabled: !canRestore, onClick: () => void operate('adblock.site.restore', { host }), "aria-label": '恢复 ' + host + ' 的广告过滤', children: "\u6062\u590D" })] }, host)) }) })] }) : _jsxs(_Fragment, { children: [_jsxs("div", { className: "adblock-page-head", children: [back, _jsx("strong", { children: "\u8BBE\u7F6E\u8BF4\u660E" })] }), _jsx(Card, { children: _jsxs(CardContent, { className: "adblock-card", children: [_jsx("strong", { children: "\u8FC7\u6EE4\u8303\u56F4" }), _jsx("p", { className: "adblock-help", children: "\u4F7F\u7528 OpenDesk Browser \u5185\u7F6E\u79BB\u7EBF DNR \u89C4\u5219\uFF0C\u4EC5\u5BF9\u7B26\u5408\u89C4\u5219\u7684\u7B2C\u4E09\u65B9\u8BF7\u6C42\u751F\u6548\u3002" }), _jsx("strong", { children: "\u7F51\u7AD9\u4F8B\u5916" }), _jsx("p", { className: "adblock-help", children: "\u5173\u95ED\u672C\u7AD9\u8FC7\u6EE4\u53EF\u52A0\u5165\u4F8B\u5916\uFF1B\u4F8B\u5916\u5217\u8868\u652F\u6301\u9010\u4E2A\u6062\u590D\u3002" }), _jsx("strong", { children: "\u7F51\u9875\u5F02\u5E38" }), _jsx("p", { className: "adblock-help", children: "\u66F4\u6539\u540E\u8BF7\u5237\u65B0\u7F51\u9875\uFF1B\u9047\u5230\u5F02\u5E38\u53EF\u6682\u65F6\u5173\u95ED\u5168\u5C40\u4FDD\u62A4\u3002" }), _jsx(Button, { variant: "secondary", onClick: () => setView('exceptions'), children: "\u7BA1\u7406\u7F51\u7AD9\u4F8B\u5916" })] }) })] }), _jsx("div", { className: "adblock-footer", children: _jsx(Button, { variant: "secondary", disabled: busy, onClick: () => void refresh(), "aria-label": "\u91CD\u65B0\u8BFB\u53D6 Chrome \u5E7F\u544A\u8FC7\u6EE4\u72B6\u6001", children: "\u21BB \u5237\u65B0\u72B6\u6001" }) }), notice ? _jsx("p", { className: "adblock-notice", "data-error": problem ? 'true' : 'false', role: problem ? 'alert' : 'status', children: notice }) : null] });
}
const target=globalThis.OpenDeskTool?.root?.querySelector('#tool-app');
if(!target)throw Error('E_ADBLOCK_REACT_ROOT');
const root=React.createRoot(target);
root.render(React.createElement(App));
let released=false;
globalThis.addEventListener('pagehide',()=>{if(!released){released=true;root.unmount();}},{once:true});
})(OpenDeskPageReact,OpenDeskSidebarUI);
