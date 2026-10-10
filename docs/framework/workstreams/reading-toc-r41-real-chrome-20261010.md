# OpenDesk Browser R4.1：阅读目录安装闭环与真实 Chrome 证据

日期：2026-10-10（UTC+08）。
仓库：`shopable-ai/opendesk-browser`；仅集成到 `main`，没有为本轮创建分支/Worktree、强推或重置。
本文件是**有界实施/验收工作记录**，不是对真实 ChatGPT、知乎或用户 Mac 的验收声明。

## 一、源代码与安装产物

- 正式任务：`docs/framework/prompts/goal-reading-toc-r4-in-page-main.zh-CN.md`（内容为 R4.1）。
- R3 原型：`docs/framework/prototypes/reading-toc-r3/compact-toc.html`，仍作为紧凑视觉规范。
- 官方包源：`examples/sidebar-tools/reading-toc/tool.config.json` 与 `src/{index.html,style.css,main.js}`。
- 内置包：`src/sidebar-tools/reading-toc.opendesk-tool.json`。
- 本地可导入产物：`artifacts/sidebar-tools/reading-toc/1.0.0/reading-toc.opendesk-tool.json`（由打包器生成，非第二个 Chrome 扩展）。
- 受限能力合同：`src/ui/sidebar-tools/package.js`、`src/reading-toc/policy.js`。
- 可信 DOM 内容索引与页内卡片：`src/reading-toc/model.js`、`page.js`、`view.js`。
- 工具安装/网站授权/撤销：`src/ui/sidebar-tools.js`、`src/ui/tool-shell.css`。
- 真实 Chrome 回归入口：`tests/framework/reading-toc-native-r41.test.mjs`。
- CI：`.github/workflows/reading-toc-r41.yml`。

统一功能：本地文件导入和官方推荐都走同一 `opendesk.sidebar-tool.v1` 校验/安装存储；`page.toc` 是明确审核的窄能力，导入包只在独立 opaque sandbox 运行；可信 content script 读取 H1–H6、定位章节、维护网页目录。Site grants 按工具 + 精确 HTTP(S) Origin 保存，安装不默认授权任何网站。已允许站点可逐站撤销，停用/卸载时网页内卡片与监听清理，关闭 Side Panel 不停止已启用的网页目录。没有新增远程 JS、任意 DOM 能力、第二套工作流引擎或独立扩展。

## 二、实际成功证据

**最后一轮整合候选**：`d848faa41da2d506b3cb5e80b5e24070a1292b84`（`main`，此候选包含下述两类原生验收）。

- GitHub Actions：<https://github.com/shopable-ai/opendesk-browser/actions/runs/38065764202> —— **SUCCESS**。
- Run artifact：<https://github.com/shopable-ai/opendesk-browser/actions/runs/38065764202/artifacts/11675162743>。
- 正式生产构建：`npm run build` 成功；开发构建：`npm run build:dev` 成功；包校验：`npm run verify` 成功。
- 官方 JSON 工具包可以从同一配置重新构建：`npm run build:sidebar-tool -- examples/sidebar-tools/reading-toc` 成功。
- TOC 专项单元测试：10/10；Side Panel 工具回归：27/27。
- 全量 `npm test`：902 项，**895 通过 / 0 失败 / 7 skipped**。Skipped 不计为 PASS。
- 原生测试：`xvfb-run -a node --test tests/framework/reading-toc-native-r41.test.mjs` —— **1/1 PASS**。
- 实际环境：GitHub Ubuntu runner + Chrome for Testing **155.0.8059.39**，加载正式未打包安装目录 `dist/production`；此候选观测到的扩展 ID 是 `jhajepcnohiplmafaiokjlcagcfjgaap`（仅为该隔离 Profile 的身份，不能推断用户 Mac 扩展 ID）。
- 截图：CI artifact 中 `artifacts/reading-toc-r41/article-jump.png`、`chat-multi-h1.png`、`real-sidepanel-toc.png`；全部为受控测试网页/Chrome 文档，而非线上 ChatGPT/知乎的截图。

**真实 Chrome 端到端经过以下步骤**：

1. 固定 `sw.js` 的扩展身份，确认加载的是 OpenDesk 而非浏览器自带的其他组件扩展。
2. 官方推荐 TOC → 包预览/审核 → 明确安装 → 本地安装记录持久化。
3. 安装而未授予网站 Origin 时，网页不出现目录；授予后真实 content script 挂载卡片。
4. 普通文章内部多个 H1、同名/重复原始 ID 和章节标题定位；不将任意 `<header>` 下的正文 H2 当页面题名隐藏。
5. 刷新文章后 TOC 恢复；模拟 AI 会话包含第一条回答三个片段、多个 H1 与独立第二条回答。
6. 网站撤权后卡片消失、目录 API 返回拒绝；卸载后即使写回旧站点权限也不再授权。
7. 由**真实 CDP 鼠标输入（isTrusted）**在 Chrome 扩展页面打开原生 `SIDE_PANEL`，切换「工具」；通过 Chrome `DOM.setFileInputFiles` 选择仓库打包器生成的 JSON，审核并安装。
8. 点击 Side Panel 当前站点开关，真实 Chrome `confirm` 对话框接受授权；网页卡片恢复，opaque sandbox 内真实显示同一回答的多个 H1。
9. 通过站点管理面板撤销 Origin 后网页卡片清理；再次允许该站点，关闭**实际 SIDE_PANEL target**，目录仍保持运行。
10. 退出 Chrome 后才清理测试独立 Profile；不占用或删除用户已有 Chrome Profile。

## 三、修复记录

- 修复虚假的扩展身份选择：必须选择实际 `sw.js` 的 Service Worker，不能从 Chrome 所有组件扩展中随便选择一个。
- 修复后台页面 `requestAnimationFrame` 被暂停时页内定位无限等待：后台导航返回明确拒绝，滚动帧必须在有界时间内结束，校正后还须测量目标确实进入可读区域。
- 在真实浏览器测试中激活文章标签页后再验证可见性，避免以背景文档的坐标冒充用户正在阅读的视图。
- 处理浏览器原生测试 Profile 退出/删除竞态（先等 Chrome 退出，再重试有限次删除）。
- 精确排除语义文章标题 H1，保留正文 section/header 内的真实 H2–H6。
- 新增已授权网站管理，允许在不打开此前网站的情况下查看与撤销它的 Origin；逐站撤销使用工具锁与 catalog 锁，保留其他网站/工具状态。

## 四、尚未完成的验收与严格边界

| 测试项 | 状态 | 理由 |
| --- | --- | --- |
| Ubuntu Chrome 155 正式包、工具双入口与核心生命周期 | NATIVE_PASS（上述候选限定场景） | 真实 Chrome、完整构建、CDP、原始 CI 日志 |
| 真实已登录 `chatgpt.com` 长对话及流式重新生成 | NOT TESTED | 测试页是模拟结构，不冒充真实 ChatGPT |
| 真实知乎问题、多回答、版本切换及懒加载 | NOT TESTED | 需要能访问的知乎真实会话 |
| 用户 Mac 本机 Chrome、已有 Profile / 安装的实际扩展 ID | NOT TESTED | CI 是隔离的 Ubuntu Chrome |
| 不同浏览器缩放、200% 无障碍、窄屏，真实 ChatGPT 输入框避让 | NOT TESTED（正式 TOC） | R3 原型测试不能提升为正式插件原生证据 |
| Chrome 网站权限在浏览器设置中撤销/重新授权 | NOT TESTED（真实权限 UX） | TOC 自身按 Origin 撤权已在 Chrome 通过 |
| 100+ 标题长会话 CPU/内存稳定性与实际全站兼容性 | NOT TESTED（性能量化） | 不因索引器设有限制就宣称已压测 |
| 未来在线工具市场、远程签名和自动更新 | NOT IMPLEMENTED | 属于 P1，不允许远端静默执行 JS |

上述未测项不可计为 PASS，也不能据此宣布已获得 95/100 独立专家评分。

## 五、复现与本地 Mac 验收

先安全确认 `git branch --show-current`、`git status --short`、`git log -1 --format='%H'`；只在 `main`，不覆盖其他 Agent 未提交文件。可安全快进时 `git fetch origin main && git merge --ff-only origin/main`。不要强推或 reset。

```sh
npm ci --ignore-scripts
npm run check
node --test tests/environment/reading-toc-r41.test.mjs tests/environment/reading-toc-lifecycle-r41.test.mjs tests/environment/sidebar-tools-host.test.mjs
npm test
npm run build
npm run build:dev
npm run verify
npm run build:sidebar-tool -- examples/sidebar-tools/reading-toc
```

手工在隔离的 Mac Chrome for Testing Profile 中明确加载 `dist/production`；在 `chrome://extensions` 核实安装目录、扩展 ID、版本、Chrome 网站权限，不能误用仍加载的开发包或历史副本。

在 Side Panel「工具」分别测试官方快捷安装和文件导入；核对 `page.toc`、当前网站授权前后数据是否变化、站点管理旧 Origin 撤销、工具打开与页内目录一致。再在普通文章、实际登录 ChatGPT、实际知乎按具体可访问条件验证多 H1、每回答边界、三片段、重复标题、跳转、滚动跟随、流式与 SPA；关闭 Side Panel、刷新/重启 Chrome、撤权/卸载后检查 DOM 和监听清理。真实线上页面无法进入则记录 NOT TESTED 并附屏幕截图，不得使用模拟页替代声明。

以上命令/证据须绑定实际 Git SHA；CI 通过不等于用户 Mac 真机发布验收或全产品最终 F3/ZIP 验收。
