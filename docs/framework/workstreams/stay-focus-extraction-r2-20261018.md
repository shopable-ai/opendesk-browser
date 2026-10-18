# Stay Focus R2 · 独立应用业务源码提取（2026-10-18）

## 目标与真实边界

将原先位于 `src/stay-focus/` 的产品实现归属到唯一的安装式工具工程
`examples/sidebar-tools/stay-focus/`，避免把 Focus 规则、额度、会话和授权操作直接维护在浏览器通用框架中。**不改变**原有 MV3 权限模型，不创建新 SDK、分支、Runtime、安装器或第二套 Host。

- 沙箱发行物：`src/index.html`、`src/style.css`、`src/main.js`，经 `tool.config.json` 固定清单编入原格式 `.opendesk-tool.json`；`trusted/` 不进入动态包。
- 产品唯一可信源码：`trusted/policy.js`、`catalog.js`、`model.js`、`rule-host.js`、`rule-ownership.js`、`service.js`、`tool-host.js`、`lifecycle.js`、`host-controls.js`、`page-notice.js` 和静态限制页。
- 通用宿主只保留固定、可审计的构建入口和原有安装事务：`src/sw.js`、`src/entrypoints/{stay-focus-controls,page-relay,blocked}.js`、`src/ui/sidebar-tools{,.js}/`。现有 `src/stay-focus/*.js` 成为不含业务实现的兼容导出，防止旧消费者失效。
- Chrome 公共 URL 不变：`stay-focus/blocked-{quota,schedule,session,always}.html`。源资源改由应用的 `trusted/` 提供；Chrome DNR ID 730000–730199 不变，不影响 AdBlock 等其他规则。

## 固定可信来源审计

构建来源门禁 `scripts/bundle-provenance.mjs` 对应用 `trusted/*.js` 的 **11 个精确 Git blob SHA** 逐项审核，仅允许它们进入已有固定 SW、Side Panel、Page Relay 与 Blocked entry。非 Stay Focus 的其他 `examples/` 仍被拒绝；修改任一高权限业务源后必须人工审查并重新锁定 SHA，不允许以目录通配符放行。源码提取本身不改变动态包信任边界。

## 用户功能与安全验收

1. 官方目录仍可单独安装 / 打开 / 停用 / 卸载 Stay Focus，缺少 Worker 或服务版本不符须失败并提示升级；`1.0.1` UI 发行版本暂不变。
2. 当前网页识别、快速推荐、站点编辑、共享 30 分钟日额度、指定时段、专注会话、白名单和单站暂停沿用同一代码；无需重新授权或重置持久数据。
3. 未安装、未启用或未在可信 UI 经真实用户点击批准 `idle` 时，不得表示限制生效；`declarativeNetRequestWithHostAccess` 仍为原扩展 required 权限。
4. Worker 使用 Chrome idle / windows / tabs / alarms 和 DNR；后台结束、重启、撤权、停用、卸载后均按原生命周期清理且回读自有规则，不清空其它工具。
5. 不允许从用户导入的 JSON 动态执行 `trusted/`、请求本地任意 Chrome 权限或绕过原生确认。**源码独立、动态 UI 独立安装，不等于高权限后台已可无需重建宿主热升级**；后者需要另行设计通用安全 SDK 及权限审查，不能在本轮伪装完成。

## 变更与验证

更改由 main 上一个原子提交承载，原策略、宿主服务和原生 Chrome 回归仍是行为正确性的主证据。加入源码所有权测试 `tests/environment/stay-focus-extraction-r2.test.mjs`，并在现有 Stay Focus Actions 工作流中与真实业务回归一起执行。

```bash
node --test tests/environment/stay-focus-extraction-r2.test.mjs tests/environment/stay-focus-r1.test.mjs tests/environment/stay-focus-service-r1.test.mjs tests/environment/stay-focus-boundary-r1.test.mjs
npm run build:sidebar-tool -- examples/sidebar-tools/stay-focus
npm run check && npm run build && npm run build:dev && npm run verify
```

产物检查：独立 JSON 仍在 `artifacts/sidebar-tools/stay-focus/1.0.1/`；生产扩展的受信任代码与阻止页在对应 `dist/production/` 内。最终需在 Mac Chrome 真机以**同一提交 SHA**验证安装、禁用/恢复、1 分钟额度耗尽、刷新/跨日、页面拦截、卸载与其它工具隔离；无实际日志/截图的项目标记 `NOT_TESTED`。
