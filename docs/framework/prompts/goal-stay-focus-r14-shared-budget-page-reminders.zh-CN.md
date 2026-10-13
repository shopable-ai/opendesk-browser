# GOAL：OpenDesk Browser Stay Focus R1.4 — ZERO-CONFIG SHARED BUDGET & IN-PAGE COUNTDOWN

## 自动识别娱乐网站、默认每日共享 30 分钟、10/5/1 分钟网页提醒、真实 Chrome 产品闭环

日期：2026-10-13。默认中文。

目标仓库：https://github.com/shopable-ai/opendesk-browser

Mac 本地目录：`/Users/shopme/Documents/workspace/opendesk-browser`

唯一允许修改、提交、推送的分支：`main`。执行前获取最新 `main` HEAD，不锁定任何历史 SHA。并行修改按 `AGENTS.md` 的文件所有权和原子检查处理，不覆写其他 Agent。

执行模式：**IMPLEMENTATION FIRST / USER DEFAULTS FIRST / ONE TRUSTED AUTHORITY / NATIVE CHROME FIRST / MINIMAL REAL TEST / NO DUPLICATE RUNTIME / NO LEGACY TIMER REUSE**。

## 1. 最高优先级：默认就是 30 分钟的「娱乐总额度」

请直接修改已有 Stay Focus 的真实源码，不重新设计 Browser SDK、工具安装器或另一套 Worker。

**最终用户体验：** 用户从 Side Panel 安装 Stay Focus，第一次主动开启并批准必要 Chrome 原生权限。之后即使用户不填写任何规则，系统也已为经过本地高可信识别的常见娱乐网站提供**每日共享 30 分钟**预算。例如 YouTube 12 分钟 + Instagram 8 分钟 + TikTok 10 分钟 = 当日 30 分钟，全部适用站点触发 Chrome DNR 限制；第二天按本地日期自动恢复。关闭 Side Panel 或重启 Chrome 不丢失策略；停用或卸载立即解除本工具规则。用户可把共享额度改为 20 分钟或其他合理值。

**这是总额度，不是给 YouTube、Instagram、TikTok 分别 30 分钟。** 现有 `examples/sidebar-tools/stay-focus/src/main.js` 的快捷项仍用 `group:''`，独立于每站预算，必须纠正。优先复用 `src/stay-focus/model.js` 中既有 `groups`/`focusPool`/usage 账本和 `src/stay-focus/service.js`，使用唯一 `entertainment` 共享池，不创建平行计时表或第二套规则引擎。

处理旧安装记录和用户已明确设置过的单站规则：不得静默删除、重置当天已使用额度或自动覆盖自定义意图。根据实际现有数据决定最小清晰迁移/保留策略，增加少量必要回归，并在工作流说明。对未配置的新工具自动用默认总池。

## 2. 默认识别与免配置

先核查并复用上一轮已有的「本机网站推荐」和 `currentPage.info`，不要复制同一份域名表到 UI 与 Host 两套来源。

- **权威分类数据仅一份，可信 Host 控制默认纳入和排除范围。** 首版用固定离线目录及精确主机名/子域名匹配，例如 YouTube、TikTok、哔哩哔哩、Instagram、Reddit 等高可信娱乐类别；常见工作/学习站点默认不受限制。网站更名、恶意后缀、IDN 与父子域名严格匹配，不能 `includes`。
- 开启 Stay Focus 时，经一次真实用户意图和 Chrome 原生授权，建立已知娱乐网站的默认共享池；用户以后无需逐个「添加网站 / 确认 15 分钟」。此范围在首次开启时清楚可见，用户可一键排除某网站。安装本身不得无授权自动开启拦截。
- 对未知网站，网页标题、`meta` / Schema.org 等内容只能作为**低可信候选提示**；除非已有明确受控分类，不得仅凭标题/页面自报标签自动拦截。若这些元数据当前不可安全读取，不新增大规模网页扫描，首轮可以跳过。
- 不遍历浏览历史、不收集正文、Cookie 或完整 URL、不上传、不调用 AI 模型、不增加非必要权限。分类以后如需扩容，应有清晰的用户覆盖/排除策略，不能升级时静默扩大既有授权。
- 主界面仅保留「今日娱乐总额度 30 分钟」「今日已用」「剩余」「状态」「管理网站/修改额度」；手动网站、白名单、组、时段等归于高级设置。不要为了零配置造复杂配置向导或每站卡片表单。
- 没有独立单站记账证据时，不虚构「每个站点今天用了 X 分钟」。总额度 UI 必须读取单一共享池，不把每个网站的同一额度重复相加。

## 3. P0：恢复「目标网页内」10/5/1 分钟提醒，但不恢复旧版定时器

核对 `examples/sidebar-tools/stay-focus/LEGACY-DISTILLATION.zh-CN.md` 及旧 `my-content-script.ts` 中历史体验，仅参考功能，不复制旧 `GrowlNotification`、`setTimeout` 决策和页面跳转代码。

通知路线优先级：

1. **目标网站内轻量提示（默认）**：在当前真正聚焦、有效计费的受管 HTTP(S) 页面，用第一方、扩展静态编译、`ISOLATED` content-script 显示小卡片；剩余额度跨过 **10 分钟、5 分钟、1 分钟**阈值时分别提示一次，1 分钟时可显示只用于展示的最后一分钟倒计时。提示可关闭，短时自动隐藏，不遮挡主要功能、不接管网站键盘，不要求打开 Side Panel。
2. **Chrome 原生通知（有条件兜底）**：网页无法显示提醒、但 Chrome 正在运行且确实有待通知的有效受管活动时，可复用现有 `notifications` 权限与可信代码发通知。默认不要同时在网页与系统通知重复轰炸；不能在未使用娱乐网站时干扰工作。检查现有 `src/platform/chrome/notifications.js`，避免伪造 SDK 授权或复制第二套通知授权服务。
3. **额度耗尽时，由唯一后台服务写 DNR 和处理现有 tab**。网页定时器绝不可以单独扣费、设置 DNR、改写本机 usage、强制跳转外站或替代可信限制。
4. Chrome 完全关闭时没有网页计费，也不需要发送提醒。关闭 Side Panel 但 Chrome/受管网页仍在时应照常有效。Chrome / Worker 重启后依据持久额度恢复，并避免重复或补发过期提醒；不能新增常驻 Mac 守护程序。

**框架复用要求：** 先检查 `src/agents/page-relay.js`、`src/entrypoints/page-relay.js`、现有 `ISOLATED` 内容脚本、`src/platform/chrome/notifications.js`。如原框架缺少可复用的网页通知呈现层，只补一套**极小、第一方可信的固定网页提示呈现器**，可供后续其他官方工具复用；它仅接收可信 Host 发来的有限结构化通知，不支持任意 HTML/脚本、网页伪造动作、远程 CSS、跨工具 API 提权，也不创建第二套 Host / SDK / Scheduler。

**提醒一致性：** 以可信后台已结算的 `budgetMs - usedMs` 阈值跨越为事实来源；每个本地日期、共享池、阈值和策略 Revision 记录去重。多标签、切页、Worker/Chrome 重启和短时间重复对账不可重复提醒；暂停/撤权/卸载时清掉本工具提示。检测到多个阈值一次性跨过时只显示当下最紧迫的一条，禁止堆叠。对于总额度不超过阈值（如 1 分钟真实验收），不得一开始弹出 10/5/1 分钟提醒。

页面级倒计时只是提示 UI，可以在前台依据最新可信快照做短时估算；计费仍使用已有聚焦窗口、唯一活动 Tab、非 idle/locked、≤45 秒检查点；没有原生证据不能承诺秒级精度。Chrome `alarms` 正常最短 30 秒且可能延迟，阈值提醒必须宽容调度延迟，而非依赖每秒 SW 定时器。

## 4. 已有架构与硬约束

保持：
- `examples/sidebar-tools/stay-focus/` 独立工具；
- `src/stay-focus/` 唯一可信额度/DNR/授权服务；
- `src/ui/sidebar-tools/` 现有安装、启停、撤权、卸载、可信操作；
- `src/sw.js` 现有 Worker；`730000–730199` Stay Focus DNR 专属规则；
- Time Review 与 Stay Focus 数据、授权、生命周期完全隔离；
- 任意增删站点、默认分类和额度变动在可信服务中核对，同一业务数据产生规则；网站内容不可直接调用特权 Chrome API。

**旧版兼容不是上线约束**，但真实用户的已存自定义配置和使用记录不可无告知破坏。不能放宽 CSP、宿主 Sender/安装身份/撤销 epoch、DNR 范围、SW 字节预算或安全验证，不能通过常驻 Worker 解决前台倒计时。

## 5. 直接测试，最小真实原生闭环

先读取 `AGENTS.md`、`docs/framework/testing-guide.md`、`docs/framework/workstreams/stay-focus-r1.md`、上述源码及 `tests/environment/stay-focus-*.test.mjs`、`tests/framework/stay-focus-r1-native.test.mjs`、`.github/workflows/stay-focus-r1.yml`，取得最新 `main` 与相关 Actions，复用有效证据。修改受影响源码后执行必要定向测试、独立工具包构建、`npm run check`、`npm run build`、`npm run build:dev`、`npm run verify`。真实 Chrome for Testing 只验证关键链：

- 首次安装/授权后，无需单站输入即可获得默认共享 30 分钟及正确网站范围；
- 模型组件证明跨 YouTube/TikTok 等受管站点的时间总和只扣一次，剩余池正确；工作网站、白名单、暂停站不计费；
- 有限受管网站 A 用时 + B 用时达到**同一个**短测试共享额度（可临时经真实可信 UI 将总额设为 1 分钟）；A、B 新导航及已有页面受 Chrome DNR 限制；
- 10/5/1 分钟跨阈值/仅一次/最紧迫提醒由组件级可控时间测试验证，网页提示至少取得一次真实页面注入与截图；不再实耗 30 分钟，不直接伪造 usage 或动态 DNR；
- 关闭 Side Panel、Worker/Chrome 重启、当地次日恢复、失焦/idle 不扣减、停用/卸载释放规则和提示，均利用现有同候选测试或受影响最小原生覆盖；
- 确保原有 `stay-focus-r1-native.test.mjs` 对折叠的手动设置仍可操作，必要时迁移成共享池测试，不删除已有真实性保护。

如果 Mac 环境不能直接访问，利用项目现有 Actions macOS Chrome 链路；排队视为 `QUEUED`，不冒充 `NATIVE_PASS`。保存工具包 SHA-256、SW SHA/字节数、原始截图及运行链接；无真实日志不自评 95 分。

## 6. 产品状态和最终交付

在已有 `docs/framework/workstreams/stay-focus-r1.md` 顶部记录新的**一屏**状态：默认共享额度、自动识别、10/5/1 网页提醒、真正 DNR、恢复与清理五项，每项区分 `SOURCE_DONE`、`COMPONENT_PASS`、`NATIVE_PASS`、`FAIL`、`NOT_TESTED` / `BLOCKED`。保留旧候选历史，不创建第二个产品总账。

安全提交及推送 `main`；最终回答先给：用户现在是否可用、默认是否真的是全站共享 30 分钟、网页 10/5/1 是否真实出现、变更文件、通过的 Chrome 情景、未完成问题、提交 SHA 和 CI 实际状态。**禁止继续只写方案、画多份原型、重复无关全量视觉测试或给没有证据的 95 分。**
