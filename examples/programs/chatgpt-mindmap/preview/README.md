# ChatGPT Mind Map — 本地真实 XMind HTML 预览

这是 **HTML 入口 + 原程序共享模块 + 固定本地 XMind 资源**，不是第二套绘图实现，也不是可直接分发的独立单文件 HTML。

浏览器打开 `preview/index.html` 之前，使用下列命令启动仅绑定 `127.0.0.1` 的开发验证服务（不依赖仓库内额外扩展、不下载 CDN）：

```bash
node examples/programs/chatgpt-mindmap/preview/serve.mjs \
  --assets /absolute/path/to/shopable-station/apps/web/public/lib/xmind
```

服务输出 `REAL_XMIND_LOCAL_PREVIEW http://127.0.0.1:<port>/index.html`，在浏览器中打开该地址。若本机有旧项目，直接指向旧项目的原始资源目录，**不用复制四份文件**。服务器启动前按 `tests/xmind-provenance.json` 逐个复核文件名、顺序、大小、SHA-256、Git blob；缺失或变更立即失败，绝不提供假 XMind 画布。

页面从 `src/answer-registry.js` 进入完整产品链（包括 `chatgpt-adapter.js`、`extract.js`、`view.js`、`xmind-adapter.js`、`xmind-convert.js`），ShadowRoot 样式也直接读取 `assets/ui.css`。换句话说，修改产品绘图或内容解析后，预览**自动使用同一份实现**，不需要人工复制 Demo JS。

## 实际操作与验收条件

1. 确认服务在启动前打印成功；打开页面只代表资源字节校验及脚本引入，并**不**代表画布已经实际渲染。
2. 分别点击 A、B、C 的「思维导图」，查看原 XMind Canvas 的主题内容；缩放/折叠 A，B 不应联动。
3. 点击「切换 320px 容器」，用真实浏览器缩放 200% 再验证工具栏、定位、裁切和键盘焦点。
4. 「重建 B 操作栏」不能产生重复按钮；「更新 B 回复正文」只应使 B 的导图过期，刷新后使用 B 的最新内容。
5. 选择「原文」、全屏/Escape、Stop，检查原 DOM 恢复和控制器关闭。Stop 后页面会显示新增全局 `style` 节点数：若残留，说明隔离未闭环，**不可记为清理 PASS**。
6. 报告预览源 SHA、固定资源 SHA、Chromium 版本、截图/视频、运行结果和错误；有失败就修产品 `src/` 而非在预览复制另一份适配逻辑。

## 事实与边界

- 本机开发者的固定资源是验证输入，不是已经获批准分发的产品资源；四个大文件 **未提交** 到当前仓库。
- 前置 `script-src 'self'` 不允许 CDN、远程 JS 或 `unsafe-eval`；`style-src 'unsafe-inline'` 仅出于隔离预览文档中的旧 SDK 内联样式需要，**不能迁移为 ChatGPT CSP 放宽**。
- 此处的独立本地 HTML 文档避免了向 ChatGPT 注入预览脚本，但 **不能**证明 SDK 在已安装 `USER_SCRIPT` 中的样式隔离、撤权/卸载或官方 ChatGPT 页面兼容。
- 原 XMind 绘图内部可以生成 SVG 图形；禁止的是用自研 SVG **替代** 原引擎，不应仅根据 DOM 出现 SVG 就误判仿造。
- 后续通用 HTML UI 预览复用仓库已有 `.agents/skills/opendesk-ui-preview/SKILL.md`；本预览只拥有 XMind 引擎固定资源的专项验证，不新增通用 Skill/权限/安装器。

**准入状态：独立真实引擎预览的源码入口已具备；未提供原始四份文件或未在浏览器运行时，`REAL_SDK_BROWSER` 必须为 `NOT_TESTED`；正式安装与已登录 ChatGPT 均为 `NOT_TESTED/BLOCKED`。**

## R2.2 可重复的真实浏览器 CI 入口

专项工作流：`.github/workflows/chatgpt-mindmap-preview.yml` 的 `real-local-xmind-html` job。实际 [Chrome/原始 SDK 通过记录](https://github.com/shopable-ai/opendesk-browser/actions/runs/38733159512)，绑定源码 `15ef1cb44ed43753aa627ebe04648d045aed0e25`。该 Job 不把四个原资源塞入当前 Program 或对外分发：仅在隔离 Runner 临时目录取得三份**仓库现存 legacy source snapshots** 和 npm 精确版本 `jszip@3.10.1` 的 `dist/jszip.min.js`，经过 `verifyFixedXmindAssets` 四文件大小、SHA-256、Git blob 验证之后才执行真实 Chromium。

对应验收驱动为 `tests/framework/chatgpt-mindmap-xmind-probe.mjs`，使用 `preview/serve.mjs` 打开本文件，实际验证 A/B/C、C 大型 97 主题、原生 SDK 缩放/折叠、320px 窄容器、操作栏重建、Stop 和显式全局样式残留诊断。预览操作区可点击「将 C 切换为大型导图」再打开 C；关闭 C 后可恢复默认内容。产品代码仍唯一来自 `src/`。

本轮成功 CI 报告 **4/4 原资源 HASH PASS、16/16 Node PASS、21/21 Chrome browser cases PASS**。截图（测试夹具而非 Mindbank 对照图）和结果为该 CI 的短期内部证据，不是可安装产品。确认运行成功要看 `result.json` 的 `status`、`largeTopicCount`、`previewNarrowWidth`、`preview.diagnostic` 和浏览器 screenshot；脚本加载 200/本地服务启动不算实际渲染通过。

**关键阻塞：** 测得 `preview.diagnostic.styleIsolation = BLOCKED_GLOBAL_STYLE_RESIDUE`，残留 `snowbrush_style`。现有 preview 是独立本地文档隔离，尚不能在真实 ChatGPT USER_SCRIPT 中保证无全局样式副作用；固定资源分发许可、正式本地运行时、安装自动启动和真实 ChatGPT 视觉均未批准/验证。没有证据的 200% Chrome 浏览器缩放、触控板和原 Mindbank 产品视觉对比仍为 NOT_TESTED。
