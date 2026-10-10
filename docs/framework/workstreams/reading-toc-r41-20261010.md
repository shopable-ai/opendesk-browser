# OpenDesk Browser R4.1 · 正式实现与验收交接

日期：2026-10-10。分支：main（没有另建分支 / Worktree）。状态：远端 GitHub 正式源码已提交，定向自动测试与生产/开发构建具备 CI 证据；**用户 Mac 上真实 Chrome 端到端验收仍为 NOT TESTED**，不可宣布 R4.1 全部完成或 ≥95 分。

## 原始目标与本轮已交付

- 正式任务书：docs/framework/prompts/goal-reading-toc-r4-in-page-main.zh-CN.md
- 结构与 R3 紧凑卡片：docs/product/reading-toc-structure-r3.zh-CN.md、docs/framework/prototypes/reading-toc-r3/compact-toc.html。
- v1 安装与管理：现有 src/ui/sidebar-tools.js、src/ui/sidebar-tools/package.js、src/ui/tool.html。新增官方阅读目录入口，本地导入和官方入口均调用 validateSidebarToolPackage、同一个能力审核、安装/升级、打开与卸载实现；初次安装不自动运行工具。
- 授权：新增受限 page.toc 能力，独立 storage.local 站点许可键 opendesk.sidebar-tools.toc-sites.v1。Tool list 的 ◎/◉ 单站点启停，授权前确认；撤权和卸载后网页控制器接到 storage.onChanged 释放观察器和卡片。对于一般工具，旧 v1 包格式不变。
- 隔离：不允许工具自行使用 arbitrary DOM、chrome.tabs 或在网页执行导入包 JavaScript。宿主通过已审查的 toc.snapshot / toc.navigate 调用当前文档，核对活动工具 iframe 会话、已安装包能力、站点、tabId/documentId/frameId 与 sender、URL/来源身份；网页实际索引/滚动由可信 isolated Content Script 完成。
- 索引：H1~H6、多个 H1、无 H1、同名/重复 DOM id、ChatGPT assistant 回答分组、知乎 AnswerItem 分组、多个内容片段同回答、动态 mutation、同源 SPA 路由变化、滚动跟踪、精确元素身份。
- 视觉：沿用 R3 紧凑 CONTENTS 卡片、三图标视图、来源选择、两行标题、省略长文，不增加搜索和底部翻页。网页卡片独立于工具 iframe，关闭侧栏后不依赖 Side Panel 进程。深色与窄屏样式已经编码；**真实效果未截图验收**。
- 包：examples/sidebar-tools/reading-toc/tool.config.json + src/* 可复现生成 artifacts/sidebar-tools/reading-toc/1.0.0/reading-toc.opendesk-tool.json，扩展内置资源为 src/sidebar-tools/reading-toc.opendesk-tool.json，构建产物在 dist/production/sidebar-tools/reading-toc.opendesk-tool.json。
- 未来市场：见 docs/product/sidebar-tool-market-compat-r41.zh-CN.md；统一 v1 包与宿主审核，Ed25519/SHA-256/来源验证与撤销接口属于 **P1 待实现**，不存在已上线市场。

## 可复现测试与证据等级

GitHub Actions R4.1 专属工作流：.github/workflows/reading-toc-r41.yml，地址：
https://github.com/shopable-ai/opendesk-browser/actions/workflows/reading-toc-r41.yml

- 已有明确 SUCCESS 候选：run 38058439346，commit b1828d60135b3a5c0ea8aab79de64b5b0c5f0b00。R4.1 定向 + 既有工具包 27/27，npm run check、npm run build、npm run build:dev、npm run verify 通过；全仓 npm test 782 项，775 pass / 0 fail / 7 skip。该证据绑定 **当时的源码候选**，不能无条件提升为后续 HEAD 的通过。
- 此后追加了可信网页控制器真实函数级生命周期测试、同源 SPA 修复以及网页窄屏样式。后续定向测试已在 GitHub CI 通过，但新的全仓测试会随其他并行 Agent 的项目改动发生失败（例如内置库 ABI 与 Task 包测试）。请以最新 CI 的 run ID/HEAD 为准，不覆盖、不重置其他会话。
- 最新包含信任 sender、生命周期与窄屏修改的候选：GitHub Actions run [38059157442](https://github.com/shopable-ai/opendesk-browser/actions/runs/38059157442)，commit dd35f40da4f829eb0c5154b07ac43e86b54a9496。TOC + 既有工具定向回归 30/30，check、production/development build、verify 均通过。全仓 789 项：780 pass / 2 fail / 7 skipped；两个失败均在 tests/environment/task-package-flow.test.mjs（内置库 ABI / Task 已验证包的版本一致性），非本轮 TOC 定向用例，仍属于必须由对应负责人处理的真实失败，不得将此候选标为全套 CI PASS。
- 证据等级：GitHub Actions 的 Node/包/构建属于 CI 证据，不是 Chrome Native 或真实 ChatGPT/知乎验收。静态 DOM 模型不能冒充线上站点。
- NOT TESTED：用户 Mac 的 Chrome 实际安装 ID/路径/profile、Side Panel 正式实例、浏览器真实点击和截图、站点授权 API 撤回、20 轮生命周期、真实 ChatGPT/知乎、最终 ≥95/100。

## 本地最小复现

在 Mac 上确实存在且拥有写入权限的仓库目录执行（不要盲目强制拉取）：

```bash
cd /Users/shopme/Documents/workspace/opendesk-browser
git branch --show-current
git status --short
git fetch origin main
git rev-parse HEAD
git rev-parse origin/main
# 先保护其他会话的未提交改动，工作区安全且仅快进时再执行：git pull --ff-only origin main
npm ci --ignore-scripts --no-audit --no-fund
node --test tests/environment/reading-toc-r41.test.mjs tests/environment/reading-toc-lifecycle-r41.test.mjs tests/environment/sidebar-tools.test.mjs tests/environment/sidebar-tools-host.test.mjs
npm run check
npm run build
npm run build:dev
npm run verify
npm run build:sidebar-tool -- examples/sidebar-tools/reading-toc
```

生产扩展：dist/production；导入包：artifacts/sidebar-tools/reading-toc/1.0.0/reading-toc.opendesk-tool.json。先卸载老包并确认实际 Chrome 扩展指向本次产物；不要使用自己日常 profile 或并行 Agent 占用的 Chrome 进程。

## 本地 Codex GOAL：Mac 真实 Chrome 安装—网页目录—撤权—恢复

你负责在 Mac 的现有 opendesk-browser 仓库 **main** 上只补测受影响的 R4.1 TOC 链路；发现正式代码问题才按最小差异修复、提交并复测。绝不创建分支/Worktree，不使用强制推送/重置，不覆盖并行 Agent 修改。首先完整读取本工作流、R4.1 正式任务书、R3 原型、AGENTS.md 和本轮安全、权限与现有 Chrome 测试规范，核对实际 HEAD、origin/main、工作区 status、占用中的 Codex/Chrome/端口/专用 profile，遵守已有 Chrome for Testing 与 chrome-testing-keychain 安全启动规则。

执行上述自动定向测试、npm run check、生产与开发构建/verify，分别保存 stdout/stderr、精确 commit、构建 artifact SHA-256 和 manifest/扩展 ID/路径。已有相同输入的成功证据经核对可以复用，失效或新输入必须最小重测。CI 失败要区分本轮 TOC 回归与其他并行 Agent 拥有的功能，不能掩盖失败或修复不相关领域。

使用隔离的正式 Chrome for Testing profile（优先已安装被项目认证的 CFT；不能动普通 Chrome），加载 **本轮生产包** dist/production。在真实 Side Panel 的「工具」标签中以可信输入完成：

1. 确认官方阅读目录入口存在，未安装时不执行；点击官方安装→能力审核→确认安装→已安装列表。再测试本地 .opendesk-tool.json 导入走相同预览和安装流程，不出现单独扩展安装。
2. 打开可访问的 HTTP(S) 本地 fixture 文章页面，未授权时网页没有 TOC，点击网站启用控件授权。验证站点切换时隔离：A 授权、B 未授权不可读。
3. 在 Side Panel 打开阅读目录工具，确认目录数据来自真实 Content Script，三模式无冗余空白和底部翻页，多个 H1/H2~H6 与重复标题、重复原始 DOM ID 的跳转目标准确，网页 DOM ID/history/hash 没被偷偷修改。
4. 点击 Side Panel 内某章节；在截图与 CDP 的真实 scrollTop/标题坐标中观察跳转成功与有效落点；手动滚动正文后检查高亮更新。内层滚动容器和固定顶栏各单测。
5. 在网页启用的目录卡片上点击并切换来源，确认与 Side Panel 同一章节身份/索引；**关闭真实 Side Panel**，网页目录仍存在且能用；刷新页面和同源 SPA 路由变更后恢复；不同源未经授权不可恢复。
6. Chrome 实测同一 ChatGPT 回答拆成多内容框、两个独立回答、多 H1、流式更新、重新生成、折叠、滚动中断；以及知乎回答与懒加载。站点不可安全访问则如实 NOT TESTED，绝不使用静态模拟替代。
7. 从工具列表撤销当前网站：观察网页 TOC 立即移除；重新启用；卸载阅读目录，确认页面不再读取、监听被清理，其他 Sidebar 工具及 Task 页面可正常打开；扩权更新和恶意包能力拒绝也要复测。
8. 复核 CSP、opaque sandbox、无任意 DOM 权限、伪造 host sender/token、跨站点/过期 documentId 重放、内容注入安全和高频内容 MutationObserver 限制；在原生 Chrome 录制操作/截图/console/network/扩展身份作为证据。

对上述每一步保留截图、日志、SHA、真实站点与失败细节，写入本工作流独立 evidence 目录；区分 PASS / FAIL / NOT TESTED / NEEDS_REVIEW。全闭环真实通过且安全/可用性没有 P0 问题，按事先确定的独立分项权重评分，争取 ≥95/100，否则不宣称验收完成。

## 自评状态

当前源码/工具包/CI 已交付，但未在用户 Mac 取得 Chrome Native 证据，**本轮不具备专家评分 ≥95/100 的证明**。正式验收状态：NEEDS_NATIVE_ACCEPTANCE。Chrome/ChatGPT/知乎明确 NOT TESTED。
