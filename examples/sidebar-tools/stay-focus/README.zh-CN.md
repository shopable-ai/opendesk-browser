# Stay Focus · 独立保持专注工具

> 2026-10-13。工具 ID `stay-focus`。本项目是 OpenDesk 原有 Side Panel「工具」选项卡中的**可选独立工具**，不是另一款 Chrome 扩展，也不是 Time Review 子模块。

**源码身份（2026-10-14）：此目录是正式官方发行工具的 UI 源码，不是仅供演示的副本。** `official-tools/catalog.json` 精确登记本 project，统一 packer 将 `tool.config.json` 声明的 `src/index.html`、`src/style.css`、`src/main.js` 编入可安装 JSON；README 与后台代码不在工具包中。计时、限制、可信审批和生命周期适配的扩展预编译源码在 [`src/stay-focus`](../../../src/stay-focus/README.zh-CN.md)。详见 [本轮调用链与边界证据](../../../docs/framework/workstreams/stay-focus-boundary-r1-20261014.md)。

## 用户场景与安装

当前正式工具包为 **1.0.1**。用户只需安装包含预编译 Stay Focus 后台能力的 OpenDesk Browser 扩展，从「工具 → 发现」安装并打开，不需要 Node 或项目源码。缺少该可信运行能力的扩展会提示升级，不再假称可以使用。首次打开时原生授权区位于主要内容上方；工具内“前往设置停用限制”仅引导可信操作，不会直接请求沙箱停用。停用工具后重新启用，仍需通过可信控制区启动限制。


1. 构建或使用包含此发行条目的 OpenDesk Chrome 扩展。在 Side Panel →「工具」→「发现 / 官方工具」，选择 **Stay Focus · 保持专注**，审阅能力和安装来源，安装后点击「打开」。
2. 首屏的「快速开始」会在本机按当前网页**域名优先、标题辅助**推荐网站类型与每日额度；也可直接点击 YouTube / 哔哩哔哩 / TikTok / Instagram 的推荐按钮。已识别的娱乐网站默认共享每日 30 分钟额度，用户可以根据需要调整。只需要点一次推荐按钮并确认，手动域名、子域名、共享额度等设置默认折叠。
3. 点击外层工具详情「设置」→ **授权并开启网站限制**。浏览器必须明确同意 `idle` 与 `declarativeNetRequestWithHostAccess` 原生权限；之前安装的 Time Review 授权不能代替这里的申请。安装本身**不自动启动限制**。
4. 在真实浏览器的前台正常使用被限制的网站。只有聚焦 Chrome 的有效标签页且用户不是 idle/locked 时才按检查点结算，多个标签页同一刻只用一份额度。退出 Side Panel 不影响 SW + Alarm 的后台策略。
5. 当当天限额耗尽，Chrome 的 DNR 动态规则将符合精确域名的主框架导航重定向到扩展内部说明页。已经打开的相关标签页由可信 Host 尽力迁移到说明页；主页不读取或回显原 URL 查询参数。工作时段、专注模式高于额度规则。
6. 暂停某一网站在网站卡片中操作；全局停止、原生权限和清空请在工具外层可信「设置」中操作。停用或卸载会清理本工具占用的 DNR ID 与数据；卸载的工具 ID 是 `stay-focus`。

**隔离**：`Time Review` 与 `Stay Focus` 数据不同、协议不同、安装/启停/撤权不同。不存在前者的前提安装。默认无账号、无网络上传，不保存浏览器查询、正文或 Cookie。

**智能识别的边界（2026-10-13）**：首次打开时读取现有 `currentPage.info` 提供的当前标签页 URL 与标题，只提取域名供推荐，不保存路径、查询参数或页面正文；已知域名仅按完整域名/其子域名匹配，网页标题只作不确定的类别提示。内置 16 项本地域名类别（视频、社交、游戏、学习/工作），工作/学习站点默认不建议限制；不遍历浏览历史、不发网络请求、不调用 AI，也不读取页面 `meta`/Schema.org 内容（后者本版尚未接入）。**识别与推荐不会直接写入规则**：点击后仍走原有可信 Host 二次确认，启动拦截依旧需要用户主动授权 Chrome 原生权限。全部类别/额度都可以改动，不进行强制自动封锁。

## 实施文件

| 层 | 入口 | 作用 |
|---|---|---|
| 安装包 | `tool.config.json`, `src/index.html`, `src/style.css`, `src/main.js` | 用户可见的工具沙箱 UI。所有策略变更通过可信 Side Panel 二次确认 |
| Side Panel | `src/ui/sidebar-tools.js`, `src/stay-focus/host-controls.js` | 原生权限申请、确认、工具身份和撤权 epoch |
| Worker | `src/stay-focus/service.js` | 活动观察、持久策略、Chrome alarms、真正的 DNR 写入与打开标签页处理 |
| 规则 | `src/stay-focus/model.js`, `src/stay-focus/policy.js`, `src/stay-focus/rule-host.js` | 安全域名、每日额度、优先级、DNR ID 730000–730199 |
| 限制页 | `src/stay-focus/blocked-*.html`, `blocked.js/css` | 固定的本扩展页，不向外部网站跳转 |
| 卸载 | `src/ui/sidebar-tools/installation.js` | 与原有工具安装事务复用，权限撤销与独立数据清理 |

## 时间语义和可测边界

- 计时是**离散检查点**而不是保证每秒精确。后台 Alarm 周期至少 30 秒，但 Chrome 可延迟调度。只有同一浏览器会话、当天、同一 UTC offset、合法前台观察且间隔 ≤45 秒的检查点才允许结算；长睡眠、SW 重新启动、时钟回拨和跨日窗口丢弃不确定时间。
- 额度触发可晚于真实使用约一个 Alarm 周期，加上 Chrome 排队延迟；**不能保证 0 秒误差**。策略写入与动态规则完成回读后才反馈成功。非前台、Chrome 非聚焦、idle/locked 不扣减。
- 日历日按用户机器当地日期计算；本地次日清零。回拨时钟会保护性停止加时，直到本机时钟追平高水位；这是防重复记录策略，不能解释成准确补时。跨夏令时状态不借由 24h 固定长度重置。
- 支持精确 hostname、子域名开关、排除域名、HTTP(S) 主框架导航，支持 localhost 开发服务。浏览器内部页、file:// 和无权来源不被本工具主动拦截。
- DNR 不能拦截已经返回并渲染的旧网页本身；Host 会在新限制触发时尝试将它导航至固定页。Chrome 内部页、特殊 Service Worker/cache/navigation 与 SPA 无网络行为存在原生局限；必须用真实浏览器验证后再写产品级 PASS。
- 用户可以关闭/卸载 OpenDesk 扩展，系统不会继续强制封锁；本工具不是不可绕过的企业级管控。

## 本地构建与定向验证

在仓库根目录运行：

```bash
node --test tests/environment/stay-focus-r1.test.mjs
npm run build:sidebar-tool -- examples/sidebar-tools/stay-focus
npm run check
npm run build
npm run build:dev
npm run verify
```

独立发行应出现在 `artifacts/sidebar-tools/stay-focus/1.0.1/stay-focus.opendesk-tool.json`；Chrome 扩展官方离线副本位于 `dist/production/official-tools/stay-focus/stay-focus.opendesk-tool.json`。

**原生验收不是单元测试**：在 Mac Chrome for Testing 里加载正式 `dist/production`，通过 Side Panel 的实际安装界面授权；用真实 HTTP(S) 服务和 `chrome.declarativeNetRequest.getDynamicRules()` 检查 730000–730199、真实导航至 `chrome-extension://…/stay-focus/blocked-quota.html`，再测试断开 SW、整个 Chrome 重启、撤权、停用、卸载后 `getDynamicRules` 返回空并可重新访问。完成时应保存浏览器/包 SHA、日志、截图和原始规则证据。

未绑定实际原生验收记录的功能一律标为 **NATIVE_NOT_TESTED**，不可用 mock 证明 Chrome 真拦截。

## P1/P2 继续改进

1. 提升 SPA、已打开网站在 DNR 同步失败时的可解释性，保留失败操作诊断和显式重试。
2. 把网站限制、分组与工作日的编辑改成更清晰的自适应移动密度布局，验证 320/360/400px、缩放和焦点行为。
3. 补齐真实 Chrome 的多窗口、系统休眠、跨日/DST、权限撤销、安装/升级/卸载回归，并将证据与最终提交 SHA 绑定。


## R1.1 原生每日额度测试说明（2026-10-13）

原有 `always` 导航测试不能代替每日限额。专项 Mac Chrome 测试现在增加真正的 **1 分钟前台活动**：通过原有 Side Panel UI 编辑网站并二次确认、读取实际 Chrome `idle`/前台标签和存储的使用时间、检查 DNR 额度规则，并验证已有页面与新 HTTP 导航被真实重定向。测试代码不修改 `usage`、不直接注入 DNR 规则。报告包含耗尽时间偏差和逐次采样。

测试增加不表示已经通过：当前提交必须等待同 SHA 的 GitHub Actions `source-and-build` 与 `native-mac-chrome` 完成，且权限弹窗若不能被真实批准，仍标为 `BLOCKED` 而不是成功。15 分钟 YouTube 正式场景和跨 Chrome 重启仍需分别记录真实候选证据。
