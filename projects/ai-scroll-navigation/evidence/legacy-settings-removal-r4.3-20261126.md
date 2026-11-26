# R4.3 · 旧网页设置增量验收（2026-11-26）

任务：OD-AI-SCROLL-LEGACY-SETTINGS-REMOVAL-R4.3。源码清理基线：`0b2ecc46916d2cec58c0307310e6e4124a3f3c2d`。本记录仅保留版本、包校验值、公开站点及观察结果。

## 根因和最小复现

仓库预装记录仍选中 `opendesk.ai-scroll-navigation` **0.4.10/r14**。其已编译代码确实给旧 UI 宿主写入 `data-opendesk-ai-scroll-navigation="settings"`；清理提交父版本的旧函数有对应写入。新工程入口和候选产物没有生产挂载逻辑。

在 Chrome for Testing **155.0.8059.39** 的独立 Profile，用日用开发宿主的只读拷贝启动 **GrayDove Developer 2.0.0**（独立扩展 ID `npcfhjfeogbkppgbeecdeghffgolkpdf`）。原生侧栏自动预装 r14，经该 Profile 的 Chrome 用户脚本开关后，安装已启用、授权 active、注册完成。真实 ChatGPT 首页出现 **1** 个旧设置元素。在原生侧栏的「扩展 → 导入」选择 r48，经原审阅界面确认相同程序、相同三站范围。安装状态恢复 active、registered，授权代数从 1 到 2，唯一启动脚本 ID 始终是 `opendesk-page-boot-b36e88057a38977e1196b0e7f0dc3e746cb595b370bebc0e`。稳定 ID 不变；实际版本和行为发生了变化。

| 同一隔离 Profile 的真实 ChatGPT 场景 | settings | 当时的证据 |
| --- | ---: | --- |
| r14 自动预装后的首页 | 1 | 复现默认预装缺陷 |
| 原侧栏升级 r48，未刷新旧文档 | 0 | 实际安装链已清除旧挂载 |
| 刷新后、新标签加载完成后 | 0 / 0 | 均有 1 个当前运行时 owner、0 个旧 owner |
| 点 Chrome 原生重新加载扩展，再开新标签 | 0 | 新文档有 1 个当前运行时 owner、0 个旧 owner |

隔离原生侧栏可打开「导航设置」、切换「滚动时固定回复导航（ChatGPT）」并得到「导航设置已保存并读回」回执。没有独立证据证明侧栏重开或扩展重载后该开关仍保持新值。隔离 ChatGPT 首页没有对话内容、挂载的 dock/reply 均为 0。此链并非日用 Profile 的升级，不证明用户初次看到旧元素时跑的也是 r14，也不批准切换预装版本。

## 当前浏览器实测

| 环境 | 实装与操作 | 观察 |
| --- | --- | --- |
| Ego Lite，本任务空间 | GrayDove Developer **2.0.0**，Page **1.0.24/r70**；安装 active、registered，代数 22。该程序的启动脚本 `opendesk-page-boot-8bc2d7637524cfe8a97ab4a79a339d97f8c3de8e5418adf2` 确实已注册，范围含三站、顶层、document_idle、USER_SCRIPT；扩展持有三站权限，未发现 jump-top 安装记录。 | ChatGPT 首页及刷新后 settings=0，未取得可操作的会话正文。Gemini、DeepSeek 首页 settings=0。打开真实 Gemini 历史对话（三轮问答），刷新前后均 settings=0、dock=0、reply=0、picker=0，且当前运行时 owner=0。Gemini 导航判 FAIL；注册存在不等于当页执行成功。通过开发宿主原入口打开侧栏后，核对到真实 SIDE_PANEL context；未在共享 Profile 改写配置。 |
| 日用 Google Chrome **158.0.8127.89**（先前的只读核对） | GrayDove Developer **2.0.0**，ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，加载路径 `dist/development`；未读回该 Profile 的 Page 修订。 | 一条真实 ChatGPT 历史对话 settings=0、dock=1、reply=1、picker=0，当前 owner=1、jump-top owner=0。未验证阅读位置变化，没有操作用户安装或重启浏览器。 |

## 构建与定向测试

- 正式 Program Builder 的项目校验、两次独立生产编译和 Page Installer 包校验均通过。两次 `program.js` 与候选 JSON 分别逐字节相同。独立候选 **1.0.24/r48** 的源码 SHA-256 为 `53a7e01c10fbde3d54955212889f595a90817e38084c20877a343d92f139c8b8`，安装包内校验值为 `95a95716bf2805182af52205947031c29fa1f8ed9b0955b928afe49ca41b6bb0`，JSON 文件 SHA-256 为 `d6d8929354e6f60ae39e866d8a5186795b7f813202fd940d6e33bc9c3fb7ddd0`。此记录不提升仓库包或发行、预装指针；r48 的本地验证与 r70 实装互不替代。
- 最近一次关键增量：**85 项通过，无失败或跳过**。覆盖旧界面禁止挂载、临时点选与取消/超时、配置读取、侧栏恢复及包审阅。修正三个测试文件过时的可访问名称、持久回执夹具和同义守卫断言，保留权限及生命周期行为断言。配置存储协议未修改，安装审阅时未增加网站范围、侧栏或 Native 权限。

| 验收项 | 状态 | 证据或缺口 |
| --- | --- | --- |
| 生产源码、同源候选、关键增量测试 | PASS | r48 无挂载逻辑；正式构建与校验；85 项增量通过 |
| 隔离历史安装升级、原文档清除、刷新、新标签和扩展重载 | PASS | r14 真实注入 1；同一安装升级后为 0 |
| 默认预装不产生旧设置 | FAIL | 当前批准的 r14 干净安装仍可复现 |
| 日用首次报告的准确归因及原 Profile 持久修复 | BLOCKED | 缺原标签历史安装回执和当前 Page revision；观测标签当前为 0 |
| 侧栏导航开关保存及即时读回 | PASS | 隔离原生侧栏的真实点击和读回回执 |
| 真站四向导航、单回复顶底、边界禁用 | FAIL / NOT_TESTED | Ego Gemini 有对话但无运行时；ChatGPT、DeepSeek 未完成实点 |
| ChatGPT 历史对话切换、新对话、SPA 及侧栏开合后持久性 | NOT_TESTED | 当前 Ego ChatGPT 未取得会话；未完成独立开合/配置持久性复测 |
| 真站自定义适配与点选取消、已有用户配置保留 | NOT_TESTED | 定向 Node 覆盖，未取得实际用户配置的升级前后对照 |
| 重复注入防护 | PASS / NOT_TESTED | 隔离单程序注册与单 owner 已验证；其他日用扩展/Profile 未完成排查 |
| 浏览器进程重启后的持久性 | NOT_TESTED | 保留用户浏览器及其他任务 |

三个独立 Codex 子代理分别复评六个视角（计入隔离原生升级证据，未将 Ego 后续 Gemini 失败当成通过）：架构 88、Chrome 扩展 85、前端生命周期 81、软件测试 92、数据安全 78、反方 74；算术平均 **83.00/100**。属于独立子代理审查，非真人专家认证。关键项未全部通过，R4.3 未完成验收，候选继续 `publication=blocked`。
