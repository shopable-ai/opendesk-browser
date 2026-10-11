# axiosx 开发草稿默认跨站请求（2026-10-11）

## 需求与实际产品范围

Sidebar → Dev 的手动运行 Controller 草稿默认允许 axiosx GET/POST/PUT/DELETE 请求任意有效 HTTP(S) 目标，不再展示或保存“axiosx 跨站请求 Origin（可选）”配置框、测试 Origin 按钮。manifest.json 原本已声明 `<all_urls>`，因此没有新增 Chrome API、安装权限、网络代理或第三套授权层。

这**不是网页 JavaScript 的 CORS 绕过**：请求由现有扩展后台 broker 的网络服务发起，使用 `credentials: 'omit'`、`redirect: 'manual'`，页面中的 OpenDeskSDK、Page USER_SCRIPT、普通导航与已安装 Task 不继承开发草稿的自动跨域能力。

## 授权与撤销边界

- 开发者必须在可信 Dev 页面主动点击「运行草稿」。已保存脚本直接从其他运行入口启动时继续使用原有精确网络范围；安装任务继续禁止未声明的服务。
- 仅对当前经认证的 Controller **draft** 与 `AXIOS_GET/POST/PUT/DELETE` 动态发现实际请求 URL 的 Origin。请求发起前检查 Chrome 已授予该 Origin 的站点权限；缺失时拒绝且绝不自动弹出权限申请。
- 首次使用的精确 Origin 写入同一个 run 的 `networkOrigins` 与 `nativeNetworkFences`，之后持续复用现有运行中授权校验、撤权事件、原生 fence、持久回复和结果投递检查；一个 run 最多累计 32 个额外 Origin，防止无限膨胀。
- 服务器认证、请求头、CORS、Cookie 等由各执行世界原有约束负责；后台不伪造 Origin、自动加 Cookie 或静默授予权限。用户如果在 Chrome 中收紧扩展站点访问，需自行恢复 Chrome 授权，本功能不会绕过它。
- 已有 `networkOrigins` 的 RunHost/Controller API 保留用于历史固定范围调用，不再作为 Dev 表单配置项。

## 受影响源码与验证

- `src/ui/tool.html`、`src/ui/script-editor.js`：删掉 Dev 额外 Origin 控件、持久草稿字段与逐域填写逻辑；Run 仍检查实际页面与 Cookie 权限。
- `src/platform/host/controller-methods.js`：仅 draft + axiosx 的网络目标通过现有 Chrome permission gate 和 durable Controller run scope 自动纳入授权；其他类别不变。
- `tests/environment/script-editor.test.mjs`：确认配置框不再存在、运行不触发新的浏览器授权申请。
- `tests/framework/k3-controller-authority.test.mjs`：覆盖自动首次绑定、后台 fetch、无凭据、持久只发送一次、Chrome 拒绝前无网络效果、撤权不再投递；原安装任务拒绝与显式固定 scope 测试继续保留。
- 人工在 Mac Chrome 中使用 `examples/tasks/http-worker-axiosx-draft.js`，默认目标 `https://httpbingo.org/get?source=opendesk`；不填写 Origin，只按现有 Dev Run 流程运行。真实 Chrome 网络和 CFT 证据尚需绑定候选 commit 才能宣称 PASS。

本记录只说明代码改动目标和验证入口。不能把 GitHub 静态更新或 Node 组件测试升级为 Mac Chrome Native/F3 最终验收。 
