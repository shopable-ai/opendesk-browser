# OpenDesk Browser R15.4：独立 JS 库与双环境验收

日期：2026-10-10。仅 `main`，不创建分支/worktree，不改历史证据或其他进程。
状态：**产品最小闭环已实施，Node + 双构建/ZIP 校验通过；原生 Side Panel 长生命周期与加载性能仍有阻断，不得声称 95+ / 正式完成。**

[产品及开发者文档](../../architecture/browser-framework/independent-libraries-r154.zh-CN.md) ·
[历史 R15](r15-builtin-completion-20261010.md) ·
[测试证据复用指南](../testing-guide.md)。

## 已落实的代码与主干提交

- 首次独立资源迁移：`09ab2ecb894e79cf64aa445689af80f8c033aa23`。
- 收敛独立目录、Node/Chrome fixture、SW 体积与 CI：`c6c026e362c75efdf3a8af03781ab9c9c5380968`、`659d28114a594e687478fc21e988919e2e0bddfc`。
- 完整 `npm test`、新 Broker 路由等价性：`16ca089aa4e9c5fd60247acc503a854e1b54dbde`。
- Page 旧验证环境 ABI/catalog SHA 守卫；Controller run→Task 验证及安装版本守卫：`8ee87a79ea7899f5cd6d46937c8a8ff76b3aeb73`。
- 修正未验证 Task 的旧错误码合同并将 Side Panel HTML 纳入 R15 CI 触发范围：`01d3e380a42ba22f041c0ea25240a801ef432207`。
- 当前主干还包含其他任务的 TOC SVG、安全 HTML 验证与固定入口瘦身；不得将其他任务的改动归功于本轮。

权威 `src/libs/runtime-contract.js` 记录 ID/版本/ABI/世界/输出路径；
`src/libs/catalog.js` 在其基础上添加许可、来源、导出方法和原始文件 SHA，**不存第二份 ID/版本/世界表**。
`src/runtime/builtin-libraries/*` 只有向 `src/libs` 的旧 import 兼容转发。
新库文件只能显式登记、校验、构建；用户不需安装 npm 或管理依赖 UI。
手工文件 `src/libs/vendor/my-utils/1.0.0/index.js` 为 291 B，登记 SHA-256
`948e074af991e89df08091e28f8c7f42981dc213ae089da013772e755e54c461`，
由构建原样复制到 `libs/vendor/my-utils/1.0.0/index.js`，支持 `OpenDeskLibs.myUtils.upper('hello')`。
Lodash 和 Day.js 仍由根 npm 精确锁生成不同的固定 IIFE；jQuery 仍 Page 按需。
Controller 复用一个 opaque Worker，Page 复用 `chrome.userScripts.execute` 的一个 USER_SCRIPT source；
不存在新执行引擎、MAIN 库污染设计或放宽授权。

## 可采纳的同候选验收

1. [R15 qualification，01d3e380](https://github.com/shopable-ai/opendesk-browser/actions/runs/38059193866)：`npm ci`、`libs:check`、定向 **64/64**、`check`、生产/开发 WXT `build`、`verify`、`npm test` **789 total / 782 pass / 0 fail / 7 skip**、双模式 `pack` 全部通过。跳过项未提升为通过。
2. 同一 CI 的生产 `packageHash=75d7192ac21f222711d726976c6b80f2a1f2c5a7c4b05faeb9ee5f344eadcf56`，ZIP SHA-256 `3cc8d9be3c7d5140929a4ef313472e3c54f43209dcf77173843864f25d50faa4`，大小 387730 B；开发 `packageHash=e0b43d92262f2b107c4319addddb96b93b3fe06508199cbece122dffe71d30d0`，ZIP SHA-256 `c515ef12550cd0b68e9017828b08e43ba2e65cd8f1cdf2225213f982e933d386`，大小 1274230 B。必须重测之后的新源码才可沿用。
3. [固定入口预算，01d3e380](https://github.com/shopable-ai/opendesk-browser/actions/runs/38059193868)：SW `324348 / 327680 B`，余量 **3332 B (1.02%)**；独立 Lodash `12818 B`，Day.js `7532 B`；Controller Worker runtime `36780 B`，Page CORE `4827 B`；原样 jquery `87533 B`，my-utils `291 B`，bootstrap `876 B`。构建预算未提高，且 SW 余量仍属 architecture debt。
4. [Page + Controller 真实 CFT 155 源码绑定验证（历史 659d281）](https://github.com/shopable-ai/opendesk-browser/actions/runs/38055081599) 成功，涵盖 `OpenDeskLibs`、Lodash/Day.js/my-utils 在 Controller opaque Worker 和 Page USER_SCRIPT、原文档回执及网站 MAIN 隔离。**该回执绑定旧代码候选，不是 01d3e380 的正式生产包安装证明**。
5. [Page install + 20 documents + restart（01d3e380）](https://github.com/shopable-ai/opendesk-browser/actions/runs/38059193907) **FAIL**：Node 定向通过、开发包构建通过，但实际 macOS CFT 155 的 Side Panel 在首个“plain JS actual Page preview”阶段超时，记录为 0 documents。不能冒充原生 PASS。原始故障报告保存在该运行的 `install-once-r31-native-01d3e380.../acceptance.json` artifact。
6. ABI 负向 Node 回归：缺字段、旧 ABI、catalog SHA 漂移的 Page verification 拒绝安装并暂停旧授权；旧 Task run/verification 无法使任务安装、启用、复用老源代码。具体验证在 R15 / `task-package-flow.test.mjs` / `page-installed-programs.test.mjs`；不把组件用例当作跨版本用户数据真实 Chrome 迁移。

### 当前测量缺口

- 01d3e380 真正的生产 WXT unpacked 包 **两入口 + 停止/重复运行/刷新/浏览器重启/网站撤权** 完整原生验收尚不具备通过证据；历史 CFT 的源码绑定证据仅可作影响分析。
- 独立库首次/重复加载耗时、每次 Worker 创建及销毁的性能 baseline **NOT_MEASURED**；不得引用 WXT 构建耗时替代脚本运行耗时。
- 发布扩展 ZIP 的用户 Mac 侧边栏安装路径、extension ID、Profile、文档身份、效果回执、资源泄漏、正式 F3 仍 **NOT_TESTED**；不要复用其他任务的 Profile 或操纵旧回执。
- 320 KiB SW 硬限额虽通过，但当前余量 3332 B；后续相邻模块变化仍须严格复查。

## 证据约束下的保守评估

| 维度 | 当前阶段参考 | 满分 | 未扣除/扣分依据 |
| --- | ---: | ---: | --- |
| 手动添加 JS | 23 | 25 | 原样文件 + CLI hash/check/list 已实现；仍需同时登记运行时合同和作者元数据 |
| 双运行时与旧 API | 21 | 25 | CFT 双世界旧候选通过、Node 回归通过；当前 Side Panel 真机安装流程 FAIL |
| 安全隔离/版本/完整性 | 21 | 25 | 固定资源/哈希/ABI fail-closed 有代码和负向证据；存量原生升级未关闭 |
| 体积/性能/生命周期 | 11 | 15 | 实测大小低于阈值，但余量 1.02%，冷/热耗时与重复运行释放未测 |
| 目录/文档/自动化 | 9 | 10 | 清晰目录和完整测试入口；7 个 skipped 与终验待补 |
| **阶段性总计** | **85** | **100** | **非独立最终评分；95+ 目标尚未满足** |

不得因为源码提交或 CI 通过而把上面 FAIL、NOT_MEASURED、NOT_TESTED 改成通过。

## 下一轮最小验收顺序

1. 由 R3.1 / Sidebar 原生负责人检查同包 `page-preview-status` 超时的原始事件、错误和 target/document 身份；先排除 TOC 并行 UI 变更、Chrome 扩展路径漂移，保留失败原始证据。
2. 同一修复候选执行生产/开发 WXT、`npm test`、verify、精确 ZIP、现有 R16 Chrome 双世界、R3.1 Page install/restart/撤权与重复运行；只复测受影响场景，不重跑未变合同。
3. 在独占 Chrome profile/资源的真实用户 Mac 上实测首轮/重复载入耗时、Stop/导航后 Worker/Blob/世界和监听器基线；本机未连接时继续标记 NOT_TESTED。
4. 最终只在完整证据绑定同一候选、F3/ZIP 安装正式合格后，申请真正独立的 95+ 评分。
