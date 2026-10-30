# Stay Focus · 独立保持专注工具

## 当前维护入口（2026-10-30 静态核对）

本项目唯一 owner 为 `projects/stay-focus/`，Catalog 也指向这里。当前 `tool.config.json` 为 **3.0.0**，files 选 `src/index.html`、`dist/tool.css`、`dist/tool.js`；配置与实际消费者优先于下方 R2/R5 的旧路径、旧版本和命令记录。本轮未验证构建、预览同步、安装或 Chrome，不能据此给当前正式包/运行结果记 PASS。

| 组成 | 当前职责与消费者 |
| --- | --- |
| `src/` | 工具沙箱 UI；Vite 从 `src/entry.js` 编译，配置另选 `src/index.html` |
| `trusted/` | 固定受审策略、计时、DNR、生命周期、限制页及可信 React 控件，由原 SW/entrypoints、资源构建和工作台固定导入；部分纯模型也被 UI 编译引用，目录名不决定权限 |
| `preview/` | 预览适配器、模拟宿主和历史 HTML；不执行真实 Chrome 权限/DNR，不维护第二份产品 |
| `dist/` | Vite 输出 `tool.js/css` 和来源绑定的 `build-ready.json`；是当前打包输入，不能因属生成物就删掉正在被使用的产物 |
| 配置、需求、构建/CI 与唯一正式包 | 保留原职责；不套最小 HTML 目录树压平，不复制 owner 或新建安装身份 |

维护命令从仓库根按本次变化选择，复用已有 watcher/依赖，执行前核对输出 writer：

```sh
# 仅在 UI/相关模型变化且需要产物时；这是 app.ci.json 指向的原编译/校验入口
node scripts/build-stay-focus-react.mjs
# 仅在相应业务行为变化时选择原测试文件，不按工具名运行整组
node --test tests/environment/stay-focus-r1.test.mjs
```

日常从[开发 → 本地项目 → 在侧栏调试](../../docs/api/sidebar-tool-development.zh-CN.md#直接调试与开发数据隔离2026-10-29)使用实际项目；Workspace 只读预览另走原合同。`preview/build.mjs` 仍有读取原 src 和旧仓库相对定位的逻辑，不能假设它已同步当前配置的 dist；本轮仅记录，未运行或修复预览生成器。后续确需此预览时先核对这两处来源/路径，不将旧 HTML 当当前包证据。

需要正式 UI 包时，按[打包 Skill](../../.agents/skills/opendesk-sidebar-tool-package/SKILL.md)传实际项目路径，完成候选→相关验证→同源晋升→check；`app:update` 当前固定 examples owner，不用于本项目。固定可信模块变化另由 Browser 维护者沿现有 `dist/development` watcher 和安全刷新合同处理，JSON 更新不替换后台；不默认执行 production/dev 双构建。目录条件、测试归属及生成物保留规则见[唯一目录合同](../../docs/architecture/extension-project-layout.zh-CN.md)。本项目无需为重复这些说明新建 AGENTS。

## 历史阶段记录

以下保留原阶段的路径、候选、版本、命令与验收缺口用于追溯；包括“用户场景”“实施文件”“本地构建”等段落，均不能覆盖上方当前维护入口，也不构成本轮全量构建/缩放宽度/原生验收要求。

> **R5.9（2026-10-20）· 一次授权，日常只管网站。** 第一次打开在可信 Side Panel 点击「开启 Stay Focus」，Chrome 只在缺少可选 `idle` 权限时询问。后台通过 `focus.status` 验证真实权限、安装摘要和 DNR 规则后才显示已开启；规则未验证不虚报保护成功。首次开启只初始化每日共享额度与工作时段，不自动添加推荐网站。打开 YouTube 等网页后，从可信 React「当前网页」点击一次「加入」，才生成该站点的管理设置。正常编辑、暂停、恢复不重复申请 Chrome 权限。
>
> **停止不等于撤销权限。** 「更多操作 → 停止限制」清理 Stay Focus 所属 DNR 规则并保留签名授权与用户数据；恢复时只要 Chrome 权限仍在，不会再弹原生权限框。真正 Chrome 权限失效、安装包升级导致授权身份变化，均须重新开启，但不重置已选网站、每日额度、暂停状态和使用记录。旧版已自动选中的存量网站继续保留，不做静默清理。主页面移除含义不清的「临时专注」，改为「更多设置 → 临时屏蔽网站（25 分钟）」，到期恢复原有规则，不重置每日额度。
>
> **验收边界：** `preview/index.html` 是同步生成的可点击源码预览，其中 Chrome 权限和 DNR 都是明确标注的模拟。预览交互通过不代表原生 Chrome、Side Panel 背景权限、DNR 导航或重启验收通过；必须以本版本绑定的 CI 和 Mac Chrome 实测报告为准。

> 2026-10-13。工具 ID `stay-focus`。本项目是 OpenDesk 原有 Side Panel「工具」选项卡中的**可选独立工具**，不是另一款 Chrome 扩展，也不是 Time Review 子模块。

**2026-10-22 · 可信界面归属收敛：** 原 `src/ui/react/tabs/trusted-settings.tsx` 内的当前网站加入/暂停、运行状态、启动/停止与清空确认界面，已归还本项目 [`trusted/react-controls.tsx`](trusted/react-controls.tsx)。通用工作台只保留固定组件导出，共享 focus/scroll effect 仍由工作台提供。组件仍经精确源码锁静态编译，不从安装 JSON 执行可信代码；修改这份可信界面需要更新 Browser。本次没有改变 `src/` 沙箱界面或正式工具包字节，也不代表共享组、白名单、提醒与会话已迁至普通动态后台应用。当前候选与原生证据见 [R1.4 运行记录](../../docs/framework/workstreams/dynamic-app-runtime-r14-local-20261022.md)。

**源码身份（2026-10-14）：此目录是正式官方发行工具的 UI 源码，不是仅供演示的副本。** `official-tools/catalog.json` 精确登记本 project，统一 packer 将 `tool.config.json` 声明的 `src/index.html`、`src/style.css`、`src/main.js` 编入可安装 JSON；README 与后台代码不在工具包中。计时、限制、可信审批和生命周期适配的唯一业务源码位于本应用的 [`trusted/`](trusted/)；旧 `src/stay-focus/*.js` 已删除，测试与生产入口直接引用本目录业务源码。详见 [R2 源码提取记录](../../docs/framework/workstreams/stay-focus-extraction-r2-20261018.md)。

**R4.1 有界规则包源码已接线（原生验收未完成）**：从 1.0.2 起，工具 JSON 包允许携带经校验的 `backgroundPolicy: {kind:'site-budget.v1',suggestions:[...]}`。可信后台从已安装包解析网站建议；用户在 UI 点击加入、经可信 Host 确认并重新启用后，才能通过既有 `focus.site.put` / DNR 规则实现新站点额度。同一 OpenDesk Browser 构建可以安装 1.0.1 与 1.0.2 两个版本的工具 JSON 完成对照。版本更换使旧 `authorizedHash` 失效，旧 DNR 先清理，不自动拦截新增网站；原网站额度与使用记录保留。该字段**不是可执行后台 JS**。目前仍有初始默认清单/额度、时段等旧固定模型；将所有业务策略变成应用包可独立升级属于后续 R4.2/R4.3，不可宣称 R4 整体完成。完整需求见 [Stay Focus R4](REQUIREMENTS.zh-CN.md)。

## R5.6 · React Shared UI 迁移状态（2026-10-20）

- **正式源码已改为 React**：`src/main.js` 当前使用固定 `OpenDeskPageReact` 的单 Root，复用 `OpenDeskSidebarUI` 公开的 Button/IconButton/Card/CardContent/Switch；`tool.config.json` 版本 1.0.6，显式 `uiRuntime: "opendesk.react-ui.v1"`。此阶段使用直接可打包的 Classic IIFE React 源码，而**非已经验证过的 Vite/JSX dist 输出**。不应伪称已完成 Vite 编译或已有 Build Ready 回执。
- **用户界面**：每日额度只保留输入与修改后的保存；当前网页点击加入前核对两次真实 URL，并只从可信目录归一化已知子域名；网站管理采用编辑和更多 IconButton，更多菜单提供暂停/恢复/移除；工作时段、白名单、共享组放入默认折叠的「更多设置」；后台仍为唯一计时与 DNR 真相来源。
- **安全边界（现行）**：安装批准的 `focus.control` 允许普通网站、额度与时段编辑直接提交，Host 仍逐次核对安装包摘要与 epoch，不重复弹确认。Chrome 原生权限、启动/停止和清空继续由可信 Side Panel 真实点击发起；沙箱不能伪造可信事件。保存配置不等于原生限制已经开启。
- **可交互离线预览**：`preview/index.html` 使用同源 `src/` HTML/CSS/JS 和仓库锁定的 React 19.2.0；`preview/ui-adapter.js` 是只在预览里使用的 Shared UI 兼容层（Switch 不是正式 React Aria）。预览支持业务请求 Mock，不能据此声称正式共享组件/Chrome/计时已经通过。重新生成/同源核对使用现有 `preview/build.mjs`；不添加第二个正式工具 Runtime。
- **证据**：模拟 React 组件操作可通过 `tests/helpers/stay-focus-react-fixture.mjs` 和 `stay-focus-r1.test.mjs` 测试，运行结果必须附原始输出。此 GitHub 环境未取得最新提交绑定的 Node CI、正式包晋升、Mac Chrome 安装和原生 DNR 实测记录，以上阶段均为 `NOT_TESTED`，不宣称 UX 95 分通过。

## R2 · 独立业务源码（2026-10-18）

- **单一业务源码**：本应用目录的 `src/` 负责独立发行的沙箱 UI，`trusted/` 负责只在可信构建期加载的计时、网站策略、DNR、授权、安装清理、提醒和限制页。原宿主 `src/stay-focus/*.js` 兼容转发层已删除，不再维护第二套业务代码。
- **运行时安全边界**：可安装 JSON **只包含** `tool.config.json` 声明的三个 UI 文件，不包含 `trusted/`。Chrome 原生 DNR、Alarms 与 idle 必须由预编译可信适配器执行，沙箱不能从 JSON 动态获得原生权限；旧版 OpenDesk Host 若无对应服务会明确返回 `RUNTIME_UNAVAILABLE`，不得声称通用 Host 已可热加载任意特权扩展。
- **身份与数据兼容**：工具 ID `stay-focus`、协议、Store、Alarm、DNR ID 段、已授权包摘要与卸载事务均不更换；原用户安装和日常额度无需迁移或重置。
- **唯一打包入口**：`npm run build:sidebar-tool -- examples/sidebar-tools/stay-focus`。更改 `trusted/` 时需要重新构建 OpenDesk Browser 的固定可信模块，不能只更新 UI JSON 即宣称后台功能已升级。
- **自动验证**：新增 `tests/environment/stay-focus-extraction-r2.test.mjs` 防止业务回流宿主，原策略/服务/授权/真实 Chrome 测试继续承担行为验证。参见 [R2 提取记录](../../docs/framework/workstreams/stay-focus-extraction-r2-20261018.md)。

## 用户场景与安装

当前工具源码配置版本为 **1.0.10**；正式安装包须经过候选构建、受影响测试和显式晋升才能算正式交付。此版修正无关工具安装/启停误停 Focus 的生命周期处理；后台修复需要包含本版 trusted service 的 Browser 构建，单独升级 JSON 不会替换后台。用户从「扩展 → 发现」安装并打开，不需要 Node 或项目源码。缺少该可信运行能力的扩展会提示升级，不再假称可以使用。首次打开时原生授权区位于主要内容上方；工具内“前往设置停用限制”仅引导可信操作，不会直接请求沙箱停用。停用工具后重新启用，仍需通过可信控制区启动限制。


1. 构建或使用包含此发行条目的 OpenDesk Chrome 扩展。在 Side Panel →「扩展」→「发现 / 官方工具」，选择 **Stay Focus · 保持专注**，审阅能力和安装来源，安装后点击「打开」。
2. React 首屏显示共享每日额度、当前网页和网站列表。切换到普通 HTTP(S) 网页后，在「当前网页」旁点击「加入」；仅使用 Host 返回的 URL 与可信目录识别域名，后台按原安装授权校验并保存，不重复弹确认。编辑及更多操作为 IconButton；工作时段、白名单和其他共享组默认收起。
3. 点击外层工具详情「设置」→ **授权并开启网站限制**。浏览器必须对可选 `idle` 权限作出明确授权；`declarativeNetRequestWithHostAccess` 是扩展 Manifest 的必需权限；之前安装的 Time Review 授权不能代替这里的申请。安装本身**不自动启动限制**。
4. 在真实浏览器的前台正常使用被限制的网站。只有聚焦 Chrome 的有效标签页且用户不是 idle/locked 时才按检查点结算，多个标签页同一刻只用一份额度。退出 Side Panel 不影响 SW + Alarm 的后台策略。
5. 当当天限额耗尽，Chrome 的 DNR 动态规则将符合精确域名的主框架导航重定向到扩展内部说明页。已经打开的相关标签页由可信 Host 尽力迁移到说明页；主页不读取或回显原 URL 查询参数。工作时段、专注模式高于额度规则。
6. 暂停某一网站在网站卡片中操作；全局停止、原生权限和清空请在工具外层可信「设置」中操作。停用或卸载会清理本工具占用的 DNR ID 与数据；卸载的工具 ID 是 `stay-focus`。

**隔离**：`Time Review` 与 `Stay Focus` 数据不同、协议不同、安装/启停/撤权不同。不存在前者的前提安装。默认无账号、无网络上传，不保存浏览器查询、正文或 Cookie。

**智能识别的边界（2026-10-13）**：首次打开时读取现有 `currentPage.info` 提供的当前标签页 URL 与标题，只提取域名供推荐，不保存路径、查询参数或页面正文；已知域名仅按完整域名/其子域名匹配，网页标题只作不确定的类别提示。内置 16 项本地域名类别（视频、社交、游戏、学习/工作），工作/学习站点默认不建议限制；不遍历浏览历史、不发网络请求、不调用 AI，也不读取页面 `meta`/Schema.org 内容（后者本版尚未接入）。**识别与推荐不会直接写入规则**：点击后仍走原有可信 Host 二次确认，启动拦截依旧需要用户主动授权 Chrome 原生权限。全部类别/额度都可以改动，不进行强制自动封锁。

## 实施文件

| 层 | 入口 | 作用 |
|---|---|---|
| 安装包 | `tool.config.json`, `src/index.html`, `src/style.css`, `src/main.js` | 用户可见的工具沙箱 UI。普通策略编辑走安装授权；原生启停/清空走可信点击 |
| Side Panel | `src/ui/sidebar-tools.js`, `examples/sidebar-tools/stay-focus/trusted/host-controls.js` | 原生权限申请、确认、工具身份和撤权 epoch |
| Worker | `examples/sidebar-tools/stay-focus/trusted/service.js` | 活动观察、持久策略、Chrome alarms、真正的 DNR 写入与打开标签页处理 |
| 规则 | `examples/sidebar-tools/stay-focus/trusted/model.js`, `examples/sidebar-tools/stay-focus/trusted/policy.js`, `examples/sidebar-tools/stay-focus/trusted/rule-host.js` | 安全域名、每日额度、优先级、DNR ID 730000–730199 |
| 限制页 | `examples/sidebar-tools/stay-focus/trusted/blocked-*.html`, `blocked.js/css` | 固定的本扩展页，不向外部网站跳转 |
| 卸载 | `src/ui/sidebar-tools/installation.js` | 与原有工具安装事务复用，权限撤销与独立数据清理 |

## 时间语义和可测边界

- 计时是**离散检查点**而不是保证每秒精确。后台 Alarm 周期至少 30 秒，但 Chrome 可延迟调度。只有同一浏览器会话、当天、同一 UTC offset、合法前台观察且间隔 ≤45 秒的检查点才允许结算；长睡眠、SW 重新启动、时钟回拨和跨日窗口丢弃不确定时间。
- 额度触发可晚于真实使用约一个 Alarm 周期，加上 Chrome 排队延迟；**不能保证 0 秒误差**。策略写入与动态规则完成回读后才反馈成功。非前台、Chrome 非聚焦、idle/locked 不扣减。
- 日历日按用户机器当地日期计算；本地次日清零。回拨时钟会保护性停止加时，直到本机时钟追平高水位；这是防重复记录策略，不能解释成准确补时。跨夏令时状态不借由 24h 固定长度重置。
- 支持精确 hostname、子域名开关、排除域名、HTTP(S) 主框架导航，支持 localhost 开发服务。浏览器内部页、file:// 和无权来源不被本工具主动拦截。
- DNR 不能拦截已经返回并渲染的旧网页本身；Host 会在新限制触发时尝试将它导航至固定页。Chrome 内部页、特殊 Service Worker/cache/navigation 与 SPA 无网络行为存在原生局限；必须用真实浏览器验证后再写产品级 PASS。
- 用户可以关闭/卸载 OpenDesk 扩展，系统不会继续强制封锁；本工具不是不可绕过的企业级管控。

## R5.1 · 真实源码交互预览（非原生 Chrome 验收）

- 预览入口：[`preview/index.html`](preview/index.html)。这是已提交的独立 HTML，包含当前 `src/index.html`、`src/style.css`、`src/main.js` 的原始字节和只在预览内使用的隔离 Host 适配器。
- 生成：`node examples/sidebar-tools/stay-focus/preview/build.mjs`。
- 同源检查：`node examples/sidebar-tools/stay-focus/preview/build.mjs --check`。若正式源码变化，必须重新生成预览并提交，不得长期维护第二套可安装 UI。
- 本地在 Mac 直接打开：`open examples/sidebar-tools/stay-focus/preview/index.html`。支持 320/360/400/440px、明暗外观、模拟授权和额度/网站/升级/撤权等操作。
- **预览适配器不进入可安装 JSON，也不执行真实 Chrome DNR/Alarm/idle。** 安装、跨重启计时、双 JSON 升级、权限撤销、跨应用隔离和卸载仍必须独立获取原生证据；不能把预览状态当作通过证明。

## 历史构建与定向验证记录

在仓库根目录运行：

```bash
node --test tests/environment/stay-focus-r1.test.mjs
npm run build:sidebar-tool -- examples/sidebar-tools/stay-focus
npm run check
npm run build
npm run build:dev
npm run verify
```

临时候选应以 `node scripts/build-sidebar-tool.mjs examples/sidebar-tools/stay-focus --out artifacts/sidebar-tools/stay-focus/candidate.opendesk-tool.json` 生成，通过定向测试后再执行 `--promote-from` 和 `--check-project` 显式晋升唯一正式包；Chrome 扩展官方离线副本位于 `dist/production/official-tools/stay-focus/stay-focus.opendesk-tool.json`。

**原生验收不是单元测试**：在 Mac Chrome for Testing 里加载正式 `dist/production`，通过 Side Panel 的实际安装界面授权；用真实 HTTP(S) 服务和 `chrome.declarativeNetRequest.getDynamicRules()` 检查 730000–730199、真实导航至 `chrome-extension://…/stay-focus/blocked-quota.html`，再测试断开 SW、整个 Chrome 重启、撤权、停用、卸载后 `getDynamicRules` 返回空并可重新访问。完成时应保存浏览器/包 SHA、日志、截图和原始规则证据。

未绑定实际原生验收记录的功能一律标为 **NATIVE_NOT_TESTED**，不可用 mock 证明 Chrome 真拦截。

## P1/P2 继续改进

1. 提升 SPA、已打开网站在 DNR 同步失败时的可解释性，保留失败操作诊断和显式重试。
2. 在真实 Chrome/React Aria 环境验证已完成的 IconButton、网站编辑、更多菜单、工作时段以及 320/360/400/440px、缩放与焦点恢复；依据实际问题修正。
3. 补齐真实 Chrome 的多窗口、系统休眠、跨日/DST、权限撤销、安装/升级/卸载回归，并将证据与最终提交 SHA 绑定。


## R1.1 原生每日额度测试说明（2026-10-13）

原有 `always` 导航测试不能代替每日限额。专项 Mac Chrome 测试现在增加真正的 **1 分钟前台活动**：通过原有 Side Panel UI 编辑网站并二次确认、读取实际 Chrome `idle`/前台标签和存储的使用时间、检查 DNR 额度规则，并验证已有页面与新 HTTP 导航被真实重定向。测试代码不修改 `usage`、不直接注入 DNR 规则。报告包含耗尽时间偏差和逐次采样。

测试增加不表示已经通过：当前提交必须等待同 SHA 的 GitHub Actions `source-and-build` 与 `native-mac-chrome` 完成，且权限弹窗若不能被真实批准，仍标为 `BLOCKED` 而不是成功。15 分钟 YouTube 正式场景和跨 Chrome 重启仍需分别记录真实候选证据。

## R4.3 规则来源改进（网页开发候选，仍需真实 Chrome 验收）

从 1.0.3 起，应用 JSON 内的 `site-budget.v2` 自己声明推荐网站、首次开启的站点集合、每日共享分钟数和默认工作时段；宿主包验证器严格限制网站范围、字段及总大小。只有**首次、没有任何持久配置**且在可信界面明确开启时，后台才复制这些模板到本工具自己的已保存状态。后续仅更新同 ID 工具 JSON，不会覆盖自定义额度、时段、暂停状态或自动加入新增网站；安装包摘要变化必须重新批准运行。旧 v1 / v1.0.2 包、既有本机配置仍使用原兼容计算与保存合同。网站编辑不再暗中恢复已暂停的网站，也不能把改域名误当成修改同一条规则。

本阶段尚未实现通用多应用 Browser SDK 受管后台 Runtime，也不支持任意应用业务 JavaScript 热替换：`APP_CODE_UPGRADE_UNSUPPORTED`。旧预编译 Chrome 观察、持久检查点、Alarm、DNR 与生命周期仍承担真实执行，不能把 `site-budget.v2` 宣传成新的通用 Host。真正原生行为、卸载和独立包升级需验证，不使用 Node 结果冒充。
